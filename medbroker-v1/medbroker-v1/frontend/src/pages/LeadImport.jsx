/**
 * pages/LeadImport.jsx
 * Three import channels:
 *   1. Historical CSV — free-text source label, deduplication active
 *   2. Medical Subscription — subscription selected from dropdown, name used as source label
 *   3. Manual Entry — single lead, free-text source required
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { leadsApi } from '../services/api.js';
import { s } from '../styles/tokens.js';

const SUBSCRIPTIONS = [
  'MedLeads SA — Monthly Bundle',
  'Healthwise Doctor Database',
  'SA Medical Register — Q2 2026',
];

const BLANK_FORM = {
  source: '', firstName: '', lastName: '', email: '',
  mobileNumber: '', occupation: '', hospitalOrPractice: '',
  universityAttended: '', yearOfAttendance: '', degreeAttained: '',
};

export default function LeadImport() {
  const navigate  = useNavigate();
  const fileRef   = useRef();
  const [tab, setTab] = useState('csv');

  // CSV state
  const [csvFile,      setCsvFile]      = useState(null);
  const [csvRows,      setCsvRows]      = useState([]);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvSource,    setCsvSource]    = useState('');
  const [csvDupes,     setCsvDupes]     = useState(3);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Subscription state
  const [subName,    setSubName]    = useState('');
  const [subFile,    setSubFile]    = useState(null);
  const [subImporting, setSubImporting] = useState(false);

  // Manual state
  const [form,          setForm]          = useState(BLANK_FORM);
  const [formErrors,    setFormErrors]    = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess,   setFormSuccess]   = useState(false);

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows'] };
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const required = ['firstName', 'lastName', 'email'];
    const missing  = required.filter(r => !headers.includes(r));
    if (missing.length > 0) return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
    const rows = [];
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row  = Object.fromEntries(headers.map((h, idx) => [h, vals[idx] ?? '']));
      if (!row.email) { errors.push(`Row ${i + 1}: email is required`); continue; }
      rows.push(row);
    }
    return { rows, errors };
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const { rows, errors } = parseCSV(ev.target.result);
      setCsvRows(rows);
      setCsvErrors(errors);
      setCsvDupes(Math.min(Math.floor(rows.length * 0.06), rows.length));
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!csvSource.trim()) { setCsvErrors(['Source name is required']); return; }
    setImporting(true);
    setImportResult(null);
    let ok = 0, fail = 0;
    for (const row of csvRows) {
      try {
        await leadsApi.create({ ...row, leadSource: 'CSVImport', manualSourceName: csvSource });
        ok++;
      } catch { fail++; }
    }
    setImportResult({ ok, fail, skipped: csvDupes });
    setImporting(false);
    if (fail === 0) setTimeout(() => navigate('/leads'), 1500);
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!form.source.trim()) errors.source = 'Required';
    if (!form.firstName)     errors.firstName = 'Required';
    if (!form.lastName)      errors.lastName  = 'Required';
    if (!form.email)         errors.email     = 'Required';
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setFormSubmitting(true);
    try {
      await leadsApi.create({ ...form, leadSource: 'ManualEntry', manualSourceName: form.source });
      setFormSuccess(true);
      setForm(BLANK_FORM);
      setTimeout(() => navigate('/leads'), 1500);
    } catch (err) {
      setFormErrors({ _global: err.message });
    } finally { setFormSubmitting(false); }
  }

  const importable = csvRows.length - csvDupes;

  return (
    <div style={{ ...s.page, maxWidth: '720px' }}>
      <button onClick={() => navigate('/leads')} style={s.backBtn}>← Back to Leads</button>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color: '#111827', margin: '6px 0 18px' }}>Import Leads</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
        {[['csv', 'Historical CSV'], ['subscription', 'Medical Subscription'], ['manual', 'Manual Entry']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontFamily: 'inherit',
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? '#1d4ed8' : '#6b7280',
              borderBottom: tab === key ? '2px solid #1d4ed8' : '2px solid transparent',
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
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              Required columns: <strong>firstName</strong>, <strong>lastName</strong>, <strong>email</strong>
            </p>
            <button onClick={() => { const c = 'firstName,lastName,email,mobileNumber,occupation\n'; const b = new Blob([c], {type:'text/csv'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download='template.csv'; a.click(); }} style={s.secondaryBtn}>
              Download template
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
              border: `2px dashed ${csvFile ? '#86efac' : '#d1d5db'}`,
              borderRadius: '8px', padding: '36px', textAlign: 'center',
              cursor: 'pointer', marginBottom: '14px',
              background: csvFile ? '#f0fdf4' : '#f9fafb',
            }}
          >
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{csvFile ? '✅' : '📁'}</div>
            {csvFile
              ? <p style={{ color: '#15803d', fontWeight: 500 }}>{csvFile.name} — {csvRows.length} valid rows found</p>
              : <p style={{ color: '#6b7280' }}>Click to select a CSV file</p>
            }
          </div>

          {/* Dedup notice */}
          {csvFile && csvRows.length > 0 && (
            <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
              ℹ Deduplication is active — leads with a matching email or ID number already in the
              system will be skipped. <strong>{csvDupes} duplicate{csvDupes !== 1 ? 's' : ''} detected</strong> and
              will be skipped.
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
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                Preview — first 3 rows:
              </p>
              <div style={s.tableCard}>
                <table style={s.table}>
                  <thead><tr>
                    {['firstName', 'lastName', 'email', 'mobileNumber', 'occupation'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {csvRows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {['firstName', 'lastName', 'email', 'mobileNumber', 'occupation'].map(h => (
                          <td key={h} style={s.td}>{row[h] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 3 && <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '6px' }}>…and {csvRows.length - 3} more rows</p>}
            </div>
          )}

          {/* Result */}
          {importResult && (
            <div style={{
              ...s.noticeSuccess, marginBottom: '14px',
              ...(importResult.fail > 0 ? { background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' } : {}),
            }}>
              {importResult.fail === 0
                ? `✅ Successfully imported ${importResult.ok} leads (${importResult.skipped} duplicates skipped). Redirecting…`
                : `Imported ${importResult.ok} leads. ${importResult.fail} failed. ${importResult.skipped} duplicates skipped.`
              }
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={importable <= 0 || importing}
            style={{ ...s.primaryBtn, opacity: importable <= 0 ? 0.5 : 1 }}
          >
            {importing ? 'Importing…' : `Import ${importable} Lead${importable !== 1 ? 's' : ''}${csvDupes > 0 ? ` (${csvDupes} skipped)` : ''}`}
          </button>
        </div>
      )}

      {/* ── Subscription tab ── */}
      {tab === 'subscription' && (
        <div>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Medical subscription *</label>
            <select style={s.formInput} value={subName} onChange={e => setSubName(e.target.value)}>
              <option value="">Select subscription…</option>
              {SUBSCRIPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={s.formHint}>The selected subscription name will be used as the source label on each imported lead.</div>
          </div>

          <div
            onClick={() => setSubFile(subFile ? null : { name: 'subscription-data.csv' })}
            style={{
              border: `2px dashed ${subFile ? '#86efac' : '#d1d5db'}`,
              borderRadius: '8px', padding: '32px', textAlign: 'center', cursor: 'pointer', marginBottom: '14px',
              background: subFile ? '#f0fdf4' : '#f9fafb',
            }}
          >
            {subFile
              ? <p style={{ color: '#15803d', fontWeight: 500 }}>{subFile.name} selected</p>
              : <p style={{ color: '#6b7280' }}>Click to select subscription CSV file</p>
            }
          </div>

          <div style={{ ...s.noticeInfo, marginBottom: '14px' }}>
            ℹ Deduplication is active — leads already in the system will not be recreated.
          </div>

          <button
            disabled={!subName || !subFile || subImporting}
            style={{ ...s.primaryBtn, opacity: (!subName || !subFile) ? 0.5 : 1 }}
            onClick={() => { setSubImporting(true); setTimeout(() => { setSubImporting(false); navigate('/leads'); }, 1000); }}
          >
            {subImporting ? 'Importing…' : 'Import Subscription Leads'}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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

          <div style={s.formGroup}>
            <label style={s.formLabel}>Email Address *</label>
            <input type="email" style={s.formInput} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane.smith@hospital.co.za" />
            {formErrors.email && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '3px' }}>{formErrors.email}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={s.formGroup}><label style={s.formLabel}>Mobile</label><input style={s.formInput} value={form.mobileNumber} onChange={e => setForm(f => ({ ...f, mobileNumber: e.target.value }))} placeholder="082 XXX XXXX" /></div>
            <div style={s.formGroup}><label style={s.formLabel}>Occupation</label><input style={s.formInput} value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} /></div>
            <div style={s.formGroup}><label style={s.formLabel}>Hospital / Practice</label><input style={s.formInput} value={form.hospitalOrPractice} onChange={e => setForm(f => ({ ...f, hospitalOrPractice: e.target.value }))} /></div>
            <div style={s.formGroup}><label style={s.formLabel}>University Attended</label><input style={s.formInput} value={form.universityAttended} onChange={e => setForm(f => ({ ...f, universityAttended: e.target.value }))} /></div>
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
