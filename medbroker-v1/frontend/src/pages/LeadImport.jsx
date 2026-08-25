/**
 * pages/LeadImport.jsx
 * Two bulk import channels:
 *   1. Historical CSV/Excel/JSON — free-text source label, REAL
 *      deduplication (§63 — see below)
 *   2. Medical Subscription — real (§80). Same underlying file-parse and
 *      duplicate-check machinery as channel 1, sharing the same state
 *      and handleFileChange — the only real difference is what each
 *      imported lead gets tagged with (linkedSubscriptionId, a real
 *      MedicalSubscription record, instead of a free-text source name).
 *
 * Manual Entry (single-lead, no file) MOVED OUT to its own page,
 * LeadNew.jsx, 16 Aug 2026 — Mark's request. It used to be tab 3 here;
 * see that file's own header for why. This file now only ever imports
 * from a file or a subscription batch — a single manual add has nothing
 * to do with either.
 *
 * BULK IMPORT REWORK (28 Jul 2026, §63): this channel used to be
 * CSV-only, via a hand-rolled `lines[i].split(',')` parser that couldn't
 * handle a quoted field containing a comma (which real Excel-exported
 * CSVs routinely have), and reported a completely fabricated duplicate
 * count — Math.floor(rows.length * 0.06), a made-up "6% of rows" formula,
 * not a real check. Worse: nothing on the actual create path
 * (POST /api/leads) ever called leadService.findDuplicate() at all —
 * Portal/Events both check it themselves before their own createLead()
 * calls, but this public endpoint, LeadImport.jsx's only route in,
 * didn't. A genuine duplicate CSV row really did create a true duplicate
 * Lead row; the UI just claimed otherwise.
 *
 * Now: SheetJS (the `xlsx` package) parses CSV, .xlsx, and .xls uniformly
 * (handles quoted/embedded commas correctly); JSON is parsed directly.
 * Real duplicate detection: POST /api/leads/check-duplicates batches a
 * findDuplicate() call per row for an accurate preview count before
 * anything is created, and POST /api/leads itself now also checks (409
 * if found) — that second check is what catches a duplicate BETWEEN two
 * rows in the same uploaded file, which the preview-time batch check
 * can't (it only knows about leads already in the database when it runs,
 * not rows earlier in this same batch that haven't been created yet).
 *
 * xlsx DEPENDENCY NOTE — FIXED 14 Aug 2026: SheetJS stopped publishing
 * past 0.18.5 to the npm registry (CVE-2023-30533 prototype pollution,
 * CVE-2024-22363 ReDoS, both unpatched at that version). package.json's
 * "xlsx" dependency is now aliased to npm:@e965/xlsx@^0.20.3 — an
 * automated mirror that republishes SheetJS's own upstream releases
 * under a different npm scope, patched, reachable via the ordinary npm
 * registry. The alias means every `import ... from 'xlsx'` in this file
 * needed no change — npm resolves the name "xlsx" in node_modules to
 * @e965/xlsx's code. See package.json and Status_Vercel.md for the full
 * fix record.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import * as XLSX from 'xlsx';
import { leadsApi, ApiError } from '../services/api.js';
import { s } from '../styles/tokens.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

const REQUIRED_COLUMNS = ['title', 'firstName', 'lastName', 'dateOfBirth', 'occupation', 'mobileNumber', 'email'];

// Strips empty-string fields before sending. Left-blank optional fields
// need to be OMITTED, not sent as '' — zod's .optional() only skips
// validation for a genuinely absent (undefined) key, not an empty string
// that then fails type/regex checks (yearOfAttendance is a number field;
// mobileNumber is regex-validated). Found by testing an actual submission
// with only the required fields filled in — the normal case — not by
// inspection; every optional field left blank was being rejected.
function stripEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ''));
}

export default function LeadImport() {
  const { isMobile } = useWindowSize();
  const navigate  = useNavigate();
  const fileRef   = useRef();
  const [tab, setTab] = useState('csv');

  // CSV/Excel/JSON state
  const [csvFile,      setCsvFile]      = useState(null);
  const [csvRows,      setCsvRows]      = useState([]);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvSource,    setCsvSource]    = useState('');
  // Real duplicate check state (§63) — replaces the old fake csvDupes
  // number. checkingDupes covers the network round trip; dupeIndices is a
  // Set of row indices (into csvRows) the backend confirmed already exist.
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [dupeIndices,   setDupeIndices]   = useState(new Set());
  const [dupeCheckError, setDupeCheckError] = useState('');
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Subscription state — subName only; the tab itself is a disabled
  // preview (§63), no file/import state to back since nothing here does
  // anything real yet.
  const [subId, setSubId] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);
  useEffect(() => {
    leadsApi.listSubscriptions()
      .then(r => setSubscriptions(r.subscriptions ?? []))
      .catch(() => setSubscriptions([])); // non-fatal — dropdown just shows empty if this fails
  }, []);

  /**
   * Unified parser for CSV, Excel (.xlsx/.xls), and JSON — replaces the
   * old CSV-only `lines[i].split(',')` approach, which broke on any
   * quoted field containing a comma (routine in a real Excel export).
   * SheetJS reads CSV/XLSX/XLS through the same API; JSON is parsed
   * directly. Same REQUIRED_COLUMNS / per-row email requirement as
   * before — only the parsing mechanism changed, not the expected shape
   * (headers must match the Lead field names directly: title, firstName,
   * lastName, etc. — there's no column-mapping UI here, matching the
   * original design's assumption, just extended to more file formats).
   *
   * REAL BUG FOUND AND FIXED, 25 Aug 2026, while building Mark a genuine
   * test file for this exact screen (Medical Subscription tab, "MedLeads
   * SA — Monthly Bundle") — not something he reported, something a real
   * test run would have hit immediately. Confirmed against the actual
   * `xlsx` package this file imports (the @e965/xlsx-aliased build, same
   * one Vite bundles for the browser — not a different environment's
   * behaviour), not assumed:
   *
   *   1. A CSV's dateOfBirth column, formatted exactly as this screen's
   *      own hint text asks ("YYYY-MM-DD") — SheetJS's default CSV
   *      parsing auto-detects a date-shaped string and silently converts
   *      it to an Excel serial number (e.g. "1978-03-14" -> 28563) before
   *      this function ever sees it. String(28563) is "28563", nothing
   *      like the original date, so dateOfBirth.date() validation on the
   *      backend rejects EVERY row with a dateOfBirth column — a 100%
   *      failure rate, silently, with no indication in the UI of why.
   *   2. A genuine .xlsx file with dateOfBirth as a real Excel date-typed
   *      cell (not text — extremely common in a real vendor export, and
   *      not something a CSV can even represent) hit the same failure a
   *      different way: SheetJS returns the bare serial number for a date
   *      cell unless told otherwise, same wrong "28563"-shaped result.
   *
   * Fix: `raw: true` at XLSX.read() time stops SheetJS auto-detecting a
   * date-shaped CSV/text string as a date at all — case 1, confirmed
   * fixed by testing this exact change against a real generated CSV
   * before writing it here. `cellDates: true` makes a GENUINE date cell
   * (case 2) come back as an actual JS Date object instead of an
   * ambiguous serial number — confirmed against a real generated .xlsx
   * workbook with a true date-typed cell, not a text one. A Date object
   * still isn't 'YYYY-MM-DD' through plain String() though (that gives a
   * verbose locale string, not ISO), so the row-normalisation loop below
   * formats a Date instance explicitly using its LOCAL date parts
   * (getFullYear/getMonth/getDate) — not toISOString(), which is UTC-based
   * and can shift the day depending on the browser's timezone, the exact
   * class of bug utils/dateFormat.js's own header comment documents at
   * length for read-only date DISPLAY; the same reasoning applies here on
   * the way in, not just on the way out.
   */
  function normaliseDateOfBirth(value) {
    if (value instanceof Date) {
      const pad2 = n => String(n).padStart(2, '0');
      return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }
    return value !== undefined ? String(value).trim() : '';
  }

  function parseRows(fileName, rawData) {
    const ext = fileName.toLowerCase().split('.').pop();
    let rawRows;

    try {
      if (ext === 'json') {
        const parsed = JSON.parse(rawData);
        if (!Array.isArray(parsed)) return { rows: [], errors: ['JSON file must contain an array of lead objects'] };
        rawRows = parsed;
      } else {
        // csv, xlsx, xls — SheetJS handles all three from the same array
        // buffer. raw:true + cellDates:true — see this function's own
        // header comment for exactly what each option fixes and why
        // both are needed together.
        const workbook = XLSX.read(rawData, { type: 'array', raw: true, cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      }
    } catch (err) {
      return { rows: [], errors: [`Could not read this file: ${err.message}`] };
    }

    if (rawRows.length === 0) return { rows: [], errors: ['File has no data rows'] };

    const headers = Object.keys(rawRows[0]);
    const missing = REQUIRED_COLUMNS.filter(r => !headers.includes(r));
    if (missing.length > 0) return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] };

    const rows = [];
    const errors = [];
    rawRows.forEach((row, i) => {
      // String(...) — SheetJS parses numeric-looking cells (a mobile
      // number, an ID number) as JS numbers, not strings; every field
      // downstream (regex validation, display) expects a string. This
      // round-trips losslessly for idNumber (13 digits, well under
      // Number.MAX_SAFE_INTEGER) — it was never actually broken, only
      // dateOfBirth was, which is why that one field alone gets its own
      // normaliseDateOfBirth() treatment instead of the same plain
      // String() every other column here uses.
      const normalised = Object.fromEntries(REQUIRED_COLUMNS.map(h => [h, row[h] !== undefined ? String(row[h]).trim() : '']));
      normalised.dateOfBirth = normaliseDateOfBirth(row.dateOfBirth);
      if (row.idNumber) normalised.idNumber = String(row.idNumber).trim();
      if (!normalised.email) { errors.push(`Row ${i + 2}: email is required`); return; }
      rows.push(normalised);
    });

    return { rows, errors };
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setImportResult(null);
    setDupeIndices(new Set());
    setDupeCheckError('');

    const ext = file.name.toLowerCase().split('.').pop();
    const reader = new FileReader();
    reader.onload = async ev => {
      const { rows, errors } = parseRows(file.name, ev.target.result);
      setCsvRows(rows);
      setCsvErrors(errors);
      if (rows.length === 0) return;

      // §63 — real duplicate check, replacing the old fake
      // Math.floor(rows.length * 0.06) placeholder. One batched call
      // rather than checking as each row is created, so the preview
      // below shows an accurate number before anything is committed.
      setCheckingDupes(true);
      try {
        const { results } = await leadsApi.checkDuplicates(
          rows.map(r => ({ email: r.email, idNumber: r.idNumber || undefined }))
        );
        setDupeIndices(new Set(results.filter(r => r.isDuplicate).map(r => r.index)));
      } catch (err) {
        setDupeCheckError('Could not check for duplicates — try again before importing.');
      } finally {
        setCheckingDupes(false);
      }
    };
    if (ext === 'json') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    const isSubscription = tab === 'subscription';
    if (isSubscription && !subId) { setCsvErrors(['Select a medical subscription']); return; }
    if (!isSubscription && !csvSource.trim()) { setCsvErrors(['Source name is required']); return; }
    setImporting(true);
    setImportResult(null);
    let ok = 0, fail = 0, skipped = dupeIndices.size;
    for (let i = 0; i < csvRows.length; i++) {
      if (dupeIndices.has(i)) continue; // already known — don't even attempt these
      try {
        // Found 13 Aug 2026 while scoping §142 item 2's revision — this
        // branch never set leadSource at all, so it silently defaulted
        // to 'ManualEntry' (CreateLeadSchema's own .default()). Harmless
        // before today; would have wrongly tripped the new
        // ManualEntry-only mandatory-portfolio rule otherwise, since
        // this is bulk-imported the same way the csv tab is, just tagged
        // to a subscription instead of a named source.
        const tag = isSubscription
          ? { leadSource: 'CSVImport', linkedSubscriptionId: subId }
          : { leadSource: 'CSVImport', manualSourceName: csvSource };
        await leadsApi.create(stripEmpty({ ...csvRows[i], ...tag }));
        ok++;
      } catch (err) {
        // A duplicate BETWEEN two rows in this same file (row 5 duplicates
        // row 2, say) — the preview-time batch check above only knows
        // about leads already in the database when it ran, not earlier
        // rows in this same batch that hadn't been created yet. POST
        // /api/leads's own findDuplicate() check (§63) catches it here,
        // by the time this row's turn comes up.
        if (err instanceof ApiError && err.status === 409) skipped++;
        else fail++;
      }
    }
    setImportResult({ ok, fail, skipped });
    setImporting(false);
    if (fail === 0) setTimeout(() => navigate('/leads'), 1500);
  }

  const importable = csvRows.length - dupeIndices.size;

  return (
    <div style={{ ...s.page, maxWidth: '720px', padding: isMobile ? '12px' : '24px' }}>
      <button onClick={() => navigate('/leads')} style={s.backBtn}>← Back to Leads</button>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)', margin: '6px 0 18px' }}>Import Leads</h1>

      {/* Tabs — same overflowX/flexShrink treatment as AppAdmin.jsx/
          FeatureFlags.jsx's own tab bars, applied here too for
          consistency — only two tabs, less likely to actually overflow,
          but "Medical Subscription" is still a long enough label that
          leaving this one file as the odd one out wasn't worth the
          inconsistency. */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '20px', overflowX: 'auto' }}>
        {[['csv', 'Historical Import'], ['subscription', 'Medical Subscription']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--accent)' : 'var(--mut)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CSV tab ── */}
      {tab === 'csv' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
              CSV, Excel (.xlsx), or JSON. Required columns: <strong>title</strong>, <strong>firstName</strong>, <strong>lastName</strong>, <strong>dateOfBirth</strong> (YYYY-MM-DD), <strong>occupation</strong>, <strong>mobileNumber</strong>, <strong>email</strong>. Optional: <strong>idNumber</strong> (13 digits).
            </p>
            {/* 25 Aug 2026 — idNumber added to the downloadable template,
                Mark's explicit request, following a test file that
                included it (a real, optional field parseRows() already
                reads via row.idNumber if present) while the in-app
                template itself only ever offered the 7 required columns.
                Same change duplicated below for the Subscription tab's
                identical button — this file already duplicates this
                hint/button pair between both tabs rather than sharing a
                component, so both copies needed the same edit. */}
            <button onClick={() => { const c = 'title,firstName,lastName,dateOfBirth,occupation,mobileNumber,email,idNumber\n'; const b = new Blob([c], {type:'text/csv'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download='template.csv'; a.click(); }} style={s.secondaryBtn}>
              Download CSV template
            </button>
          </div>

          <div style={{ ...s.formGroup }}>
            <label style={s.formLabel}>Source name (displayed on each imported lead) *</label>
            <input
              className="form-input"
              style={s.formInput}
              value={csvSource}
              onChange={e => setCsvSource(e.target.value)}
              placeholder="e.g. Momentum DB 2024 — Q1 Dump"
            />
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${csvFile ? '#4ade80' : 'var(--line)'}`,
              borderRadius: '8px', padding: '36px', textAlign: 'center',
              cursor: 'pointer', marginBottom: '14px',
              background:csvFile ? 'color-mix(in srgb, var(--live) 10%, var(--panel))' : 'var(--panel2)',
            }}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileChange} style={{ display: 'none' }} />
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{csvFile ? '✅' : '📁'}</div>
            {csvFile
              ? <p style={{ color: '#15803d', fontWeight: 500 }}>{csvFile.name} — {csvRows.length} valid rows found</p>
              : <p style={{ color:'var(--mut)' }}>Click to select a CSV, Excel, or JSON file</p>
            }
          </div>

          {/* Dedup notice — real (§63), replacing the old fake claim */}
          {csvFile && csvRows.length > 0 && (
            <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
              {checkingDupes ? (
                <>⏳ Checking for existing leads with a matching email or ID number…</>
              ) : dupeCheckError ? (
                <span style={{ color: '#dc2626' }}>⚠ {dupeCheckError}</span>
              ) : (
                <>
                  ℹ Checked against existing leads by email or ID number.{' '}
                  <strong>{dupeIndices.size} duplicate{dupeIndices.size !== 1 ? 's' : ''} found</strong>
                  {dupeIndices.size > 0 ? ' and will be skipped.' : '.'}
                </>
              )}
            </div>
          )}

          {/* CSV errors */}
          {csvErrors.length > 0 && (
            <div style={{ ...s.errorBox, marginBottom: '14px' }}>
              {csvErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {/* Preview */}
          {csvRows.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color:'var(--ink)', marginBottom: '8px' }}>
                Preview — first 3 rows:
              </p>
              <div style={s.tableCard}>
                <table style={s.table}>
                  <thead><tr>
                    {['title', 'firstName', 'lastName', 'dateOfBirth', 'occupation', 'mobileNumber', 'email'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {csvRows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {['title', 'firstName', 'lastName', 'dateOfBirth', 'occupation', 'mobileNumber', 'email'].map(h => (
                          <td key={h} style={s.td}>{row[h] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 3 && <p style={{ fontSize: '0.75rem', color:'var(--mut)', marginTop: '6px' }}>…and {csvRows.length - 3} more rows</p>}
            </div>
          )}

          {/* Result */}
          {importResult && (
            <div style={{
              ...s.noticeSuccess, marginBottom: '14px',
              ...(importResult.fail > 0 ? { background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', borderColor: 'color-mix(in srgb, #dc2626 30%, var(--panel))', color: '#dc2626' } : {}),
            }}>
              {importResult.fail === 0
                ? `✅ Successfully imported ${importResult.ok} leads (${importResult.skipped} duplicates skipped). Redirecting…`
                : `Imported ${importResult.ok} leads. ${importResult.fail} failed. ${importResult.skipped} duplicates skipped.`
              }
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={importable <= 0 || importing || checkingDupes || !!dupeCheckError}
            style={{ ...s.primaryBtn, opacity: (importable <= 0 || checkingDupes || dupeCheckError) ? 0.5 : 1 }}
          >
            {importing ? 'Importing…' : checkingDupes ? 'Checking…' : `Import ${importable} Lead${importable !== 1 ? 's' : ''}${dupeIndices.size > 0 ? ` (${dupeIndices.size} skipped)` : ''}`}
          </button>
        </div>
      )}

      {/* ── Subscription tab (§80) ── */}
      {tab === 'subscription' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <p style={{ color:'var(--mut)', fontSize: '0.875rem', margin: 0 }}>
              CSV, Excel (.xlsx), or JSON. Required columns: <strong>title</strong>, <strong>firstName</strong>, <strong>lastName</strong>, <strong>dateOfBirth</strong> (YYYY-MM-DD), <strong>occupation</strong>, <strong>mobileNumber</strong>, <strong>email</strong>. Optional: <strong>idNumber</strong> (13 digits).
            </p>
            {/* 25 Aug 2026 — idNumber added here too, kept in sync with
                the CSV tab's identical button above (this file's own
                header comment has the full reasoning). */}
            <button onClick={() => { const c = 'title,firstName,lastName,dateOfBirth,occupation,mobileNumber,email,idNumber\n'; const b = new Blob([c], {type:'text/csv'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download='template.csv'; a.click(); }} style={s.secondaryBtn}>
              Download CSV template
            </button>
          </div>

          <div style={s.formGroup}>
            <label style={s.formLabel}>Medical subscription *</label>
            <select style={s.formInput} value={subId} onChange={e => setSubId(e.target.value)}>
              <option value="">Select subscription…</option>
              {subscriptions.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
            </select>
            <div style={s.formHint}>
              {subscriptions.length === 0
                ? 'No active subscriptions configured — add one under App Admin \u2192 Medical Subscriptions first.'
                : 'Every lead imported below will be tagged with this subscription as its source.'}
            </div>
          </div>

          {/* Drop zone — identical to the CSV tab's, same handleFileChange, same csvFile/csvRows state */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${csvFile ? '#4ade80' : 'var(--line)'}`,
              borderRadius: '8px', padding: '36px', textAlign: 'center',
              cursor: 'pointer', marginBottom: '14px',
              background:csvFile ? 'color-mix(in srgb, var(--live) 10%, var(--panel))' : 'var(--panel2)',
            }}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileChange} style={{ display: 'none' }} />
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{csvFile ? '✅' : '📁'}</div>
            {csvFile
              ? <p style={{ color: '#15803d', fontWeight: 500 }}>{csvFile.name} — {csvRows.length} valid rows found</p>
              : <p style={{ color:'var(--mut)' }}>Click to select a CSV, Excel, or JSON file</p>
            }
          </div>

          {csvFile && csvRows.length > 0 && (
            <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
              {checkingDupes ? (
                <>⏳ Checking for existing leads with a matching email or ID number…</>
              ) : dupeCheckError ? (
                <span style={{ color: '#dc2626' }}>⚠ {dupeCheckError}</span>
              ) : (
                <>
                  ℹ Checked against existing leads by email or ID number.{' '}
                  <strong>{dupeIndices.size} duplicate{dupeIndices.size !== 1 ? 's' : ''} found</strong>
                  {dupeIndices.size > 0 ? ' and will be skipped.' : '.'}
                </>
              )}
            </div>
          )}

          {csvErrors.length > 0 && (
            <div style={{ ...s.errorBox, marginBottom: '14px' }}>
              {csvErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {csvRows.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color:'var(--ink)', marginBottom: '8px' }}>
                Preview — first 3 rows:
              </p>
              <div style={s.tableCard}>
                <table style={s.table}>
                  <thead><tr>
                    {['title', 'firstName', 'lastName', 'dateOfBirth', 'occupation', 'mobileNumber', 'email'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {csvRows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {['title', 'firstName', 'lastName', 'dateOfBirth', 'occupation', 'mobileNumber', 'email'].map(h => (
                          <td key={h} style={s.td}>{row[h] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 3 && <p style={{ fontSize: '0.75rem', color:'var(--mut)', marginTop: '6px' }}>…and {csvRows.length - 3} more rows</p>}
            </div>
          )}

          {importResult && (
            <div style={{
              ...s.noticeSuccess, marginBottom: '14px',
              ...(importResult.fail > 0 ? { background: 'color-mix(in srgb, #dc2626 14%, var(--panel))', borderColor: 'color-mix(in srgb, #dc2626 30%, var(--panel))', color: '#dc2626' } : {}),
            }}>
              {importResult.fail === 0
                ? `✅ Successfully imported ${importResult.ok} leads (${importResult.skipped} duplicates skipped). Redirecting…`
                : `Imported ${importResult.ok} leads. ${importResult.fail} failed. ${importResult.skipped} duplicates skipped.`
              }
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!subId || importable <= 0 || importing || checkingDupes || !!dupeCheckError}
            style={{ ...s.primaryBtn, opacity: (!subId || importable <= 0 || checkingDupes || dupeCheckError) ? 0.5 : 1 }}
          >
            {importing ? 'Importing…' : checkingDupes ? 'Checking…' : `Import ${importable} Lead${importable !== 1 ? 's' : ''}${dupeIndices.size > 0 ? ` (${dupeIndices.size} skipped)` : ''}`}
          </button>
        </div>
      )}

    </div>
  );
}
