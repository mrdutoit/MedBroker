/**
 * pages/LeadImport.jsx
 * Three import channels:
 *   1. Historical CSV/Excel/JSON — free-text source label, REAL
 *      deduplication (§63 — see below)
 *   2. Medical Subscription — real (§80). Same underlying file-parse and
 *      duplicate-check machinery as channel 1, sharing the same state
 *      and handleFileChange — the only real difference is what each
 *      imported lead gets tagged with (linkedSubscriptionId, a real
 *      MedicalSubscription record, instead of a free-text source name).
 *   3. Manual Entry — single lead, free-text source required, now also
 *      real-dedup-checked before submit (§63)
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
import { TITLES, JOB_TITLES, REGIONS } from '../constants/leadOptions.js';
import { useRole } from '../context/RoleContext.jsx';

const REQUIRED_COLUMNS = ['title', 'firstName', 'lastName', 'dateOfBirth', 'occupation', 'mobileNumber', 'email'];

// title, firstName, lastName, dateOfBirth, occupation (Job Title),
// mobileNumber, and email are the client's real required intake fields —
// added 22 July 2026 to match their Appointment Tracking sheet.
const BLANK_FORM = {
  title: '', source: '', firstName: '', lastName: '', dateOfBirth: '', email: '',
  mobileNumber: '', occupation: '', hospitalOrPractice: '',
  universityAttended: '', yearOfAttendance: '', degreeAttained: '', portfolios: [],
  // 14 Aug 2026 (§157/§158, Mark's decision: "Mandatory, manual form
  // only") — mirrors portfolios immediately above.
  products: [],
  // 14 Aug 2026 (§166) — same mandatory-on-manual-entry rule, single
  // value not an array.
  region: '',
};

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
  const navigate  = useNavigate();
  const { portfolios: allPortfolios, productsByPortfolio } = useRole();
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

  // Manual state
  const [form,          setForm]          = useState(BLANK_FORM);
  const [formErrors,    setFormErrors]    = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess,   setFormSuccess]   = useState(false);

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
   */
  function parseRows(fileName, rawData) {
    const ext = fileName.toLowerCase().split('.').pop();
    let rawRows;

    try {
      if (ext === 'json') {
        const parsed = JSON.parse(rawData);
        if (!Array.isArray(parsed)) return { rows: [], errors: ['JSON file must contain an array of lead objects'] };
        rawRows = parsed;
      } else {
        // csv, xlsx, xls — SheetJS handles all three from the same array buffer
        const workbook = XLSX.read(rawData, { type: 'array' });
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
      // downstream (regex validation, display) expects a string.
      const normalised = Object.fromEntries(REQUIRED_COLUMNS.map(h => [h, row[h] !== undefined ? String(row[h]).trim() : '']));
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

  async function handleManualSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!form.title)          errors.title       = 'Required';
    if (!form.source.trim())  errors.source      = 'Required';
    if (!form.firstName)      errors.firstName   = 'Required';
    if (!form.lastName)       errors.lastName    = 'Required';
    if (!form.dateOfBirth)    errors.dateOfBirth = 'Required';
    if (!form.occupation)     errors.occupation  = 'Required';
    if (!form.mobileNumber)   errors.mobileNumber = 'Required';
    if (!form.email)          errors.email       = 'Required';
    // §142, item 2 (13 Aug 2026, Mark's request) — was fully optional
    // both sides; backend CreateLeadSchema.portfolios now enforces the
    // same rule (z.array().min(1)), this is the matching client-side
    // gate, not a UI-only check.
    if (form.portfolios.length === 0) errors.portfolios = 'Select at least one portfolio';
    // 14 Aug 2026 (§157/§158, Mark's decision: "Mandatory, manual form
    // only") — mirrors the portfolios check immediately above, exactly.
    if (form.products.length === 0) errors.products = 'Select at least one product';
    // 14 Aug 2026 (§166) — mirrors the products check immediately above.
    if (!form.region) errors.region = 'Select a region';
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setFormSubmitting(true);
    try {
      await leadsApi.create(stripEmpty({ ...form, leadSource: 'ManualEntry', manualSourceName: form.source }));
      setFormSuccess(true);
      setForm(BLANK_FORM);
      setTimeout(() => navigate('/leads'), 1500);
    } catch (err) {
      const message = err instanceof ApiError && err.status === 409
        ? 'A lead with this email or ID number already exists — check the Leads list before creating a new one.'
        : err.message;
      setFormErrors({ _global: message });
    } finally { setFormSubmitting(false); }
  }

  const importable = csvRows.length - dupeIndices.size;

  return (
    <div style={{ ...s.page, maxWidth: '720px' }}>
      <button onClick={() => navigate('/leads')} style={s.backBtn}>← Back to Leads</button>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)', margin: '6px 0 18px' }}>Import Leads</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '20px' }}>
        {[['csv', 'Historical Import'], ['subscription', 'Medical Subscription'], ['manual', 'Manual Entry']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontFamily: 'inherit',
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
              CSV, Excel (.xlsx), or JSON. Required columns: <strong>title</strong>, <strong>firstName</strong>, <strong>lastName</strong>, <strong>dateOfBirth</strong> (YYYY-MM-DD), <strong>occupation</strong>, <strong>mobileNumber</strong>, <strong>email</strong>
            </p>
            <button onClick={() => { const c = 'title,firstName,lastName,dateOfBirth,occupation,mobileNumber,email\n'; const b = new Blob([c], {type:'text/csv'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download='template.csv'; a.click(); }} style={s.secondaryBtn}>
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
              CSV, Excel (.xlsx), or JSON. Required columns: <strong>title</strong>, <strong>firstName</strong>, <strong>lastName</strong>, <strong>dateOfBirth</strong> (YYYY-MM-DD), <strong>occupation</strong>, <strong>mobileNumber</strong>, <strong>email</strong>
            </p>
            <button onClick={() => { const c = 'title,firstName,lastName,dateOfBirth,occupation,mobileNumber,email\n'; const b = new Blob([c], {type:'text/csv'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download='template.csv'; a.click(); }} style={s.secondaryBtn}>
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

      {/* ── Manual entry tab ── */}
      {tab === 'manual' && (
        <form onSubmit={handleManualSubmit}>
          {formSuccess && <div style={{ ...s.noticeSuccess, marginBottom: '14px' }}>Lead created. Redirecting…</div>}
          {formErrors._global && <div style={{ ...s.errorBox, marginBottom: '14px' }}>{formErrors._global}</div>}

          <div style={s.formGroup}>
            <label style={s.formLabel}>Source *</label>
            <input style={s.formInput} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. Referral from Dr J. Smith, Cold call" />
            {formErrors.source && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.source}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 1fr 1fr', gap: '12px' }}>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Title *</label>
              <select style={s.formInput} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}>
                <option value="">Select…</option>
                {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {formErrors.title && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.title}</div>}
            </div>
            {[
              ['firstName', 'First Name *', formErrors.firstName],
              ['lastName',  'Last Name *',  formErrors.lastName],
            ].map(([key, label, err]) => (
              <div key={key} style={s.formGroup}>
                <label style={s.formLabel}>{label}</label>
                <input style={s.formInput} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                {err && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{err}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Date of Birth *</label>
              <input type="date" style={s.formInput} value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
              {formErrors.dateOfBirth && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.dateOfBirth}</div>}
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Job Title *</label>
              <select style={s.formInput} value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))}>
                <option value="">Select…</option>
                {JOB_TITLES.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
              {formErrors.occupation && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.occupation}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Contact Number *</label>
              <input style={s.formInput} value={form.mobileNumber} onChange={e => setForm(f => ({ ...f, mobileNumber: e.target.value }))} placeholder="082 XXX XXXX" />
              {formErrors.mobileNumber && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.mobileNumber}</div>}
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Email Address *</label>
              <input type="email" style={s.formInput} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane.smith@hospital.co.za" />
              {formErrors.email && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.email}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={s.formGroup}><label style={s.formLabel}>Hospital / Practice</label><input style={s.formInput} value={form.hospitalOrPractice} onChange={e => setForm(f => ({ ...f, hospitalOrPractice: e.target.value }))} /></div>
            <div style={s.formGroup}><label style={s.formLabel}>University Attended</label><input style={s.formInput} value={form.universityAttended} onChange={e => setForm(f => ({ ...f, universityAttended: e.target.value }))} /></div>
          </div>

          <div style={s.formGroup}>
            <label style={s.formLabel}>Portfolio *</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              {allPortfolios.map(p => {
                const checked = form.portfolios.includes(p.name);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      cursor: 'pointer', padding: '6px 12px',
                      border: `1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: '6px', fontSize: '0.875rem',
                      background: checked ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)',
                      color: checked ? 'var(--accent)' : 'var(--ink)',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setForm(f => {
                        const next = checked ? f.portfolios.filter(x => x !== p.name) : [...f.portfolios, p.name];
                        // 14 Aug 2026 (§157/§158) — drop any selected
                        // product no longer offered once its portfolio
                        // is deselected, same reasoning as the Book
                        // Appointment modal's togglePortfolio()
                        // (LeadDetail.jsx).
                        const stillAvailable = next.flatMap(n => productsByPortfolio[n] ?? []);
                        return { ...f, portfolios: next, products: f.products.filter(x => stillAvailable.includes(x)) };
                      })}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    {p.name}
                  </label>
                );
              })}
            </div>
            <p style={s.formHint}>Select at least one — not limited to one, a lead can be interested in more than one portfolio, same as a broker isn't limited to selling from just one. Carries through to Book Appointment later.</p>
            {formErrors.portfolios && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.portfolios}</div>}
          </div>

          {/* 14 Aug 2026 (§157/§158, Mark's decision: "Mandatory, manual
              form only") — Products on Lead. Scoped to the selected
              portfolio(s)' own product lists, same dependent-selection
              pattern as the Book Appointment modal's availableProducts
              (LeadDetail.jsx) — only rendered once at least one
              portfolio is picked, since there's nothing to offer before
              that. Carries through to Book Appointment's own pre-fill,
              same as portfolios already does. */}
          {form.portfolios.length > 0 && (
          <div style={s.formGroup}>
            <label style={s.formLabel}>Products the client is interested in *</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              {form.portfolios.flatMap(name => productsByPortfolio[name] ?? []).map(prod => {
                const checked = form.products.includes(prod);
                return (
                  <label
                    key={prod}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      cursor: 'pointer', padding: '6px 12px',
                      border: `1px solid ${checked ? 'color-mix(in srgb, #15803d 30%, var(--panel))' : 'var(--line)'}`,
                      borderRadius: '6px', fontSize: '0.875rem',
                      background: checked ? 'color-mix(in srgb, #15803d 14%, var(--panel))' : 'var(--panel)',
                      color: checked ? '#15803d' : 'var(--ink)',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setForm(f => ({
                        ...f,
                        products: checked ? f.products.filter(x => x !== prod) : [...f.products, prod],
                      }))}
                      style={{ accentColor: '#15803d' }}
                    />
                    {prod}
                  </label>
                );
              })}
            </div>
            <p style={s.formHint}>Select at least one. Carries through to Book Appointment later, same as Portfolio.</p>
            {formErrors.products && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.products}</div>}
          </div>
          )}

          {/* 14 Aug 2026 (§166, Mark's explicit request) — "a Lead and an
              Appointment both need to relate to a region, and a Lead
              should not be assignable to someone that is out of that
              region." This is where that region actually gets captured —
              carries through to the Appointment at booking time, and is
              what assignLead() (leadService.js) now checks the target
              Agent's own region against. */}
          <div style={s.formGroup}>
            <label style={s.formLabel}>Region *</label>
            <select
              style={s.formInput} value={form.region}
              onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
            >
              <option value="">Please select</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <p style={s.formHint}>Where the client is — determines which agents/brokers this lead can be assigned to.</p>
            {formErrors.region && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.region}</div>}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button type="submit" disabled={formSubmitting} style={s.primaryBtn}>
              {formSubmitting ? 'Creating…' : 'Create Lead'}
            </button>
            <button type="button" onClick={() => navigate('/leads')} style={s.secondaryBtn}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
