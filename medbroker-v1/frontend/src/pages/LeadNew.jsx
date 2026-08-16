/**
 * pages/LeadNew.jsx
 * Manual single-lead entry — extracted from LeadImport.jsx's third tab
 * 16 Aug 2026, Mark's request: "extract Manual Entry out of the Lead
 * Import page and have it as a separate button on the Leads page next
 * to Import Leads." A single manual add was buried as tab 3 of 3 inside
 * a page framed around bulk import, sharing that page's title and back
 * link even though it has nothing to do with a CSV/Excel/JSON upload or
 * a Medical Subscription batch. Now its own route (/leads/new), its own
 * button on LeadList.jsx, matching how Import Leads already gets its
 * own button and its own page rather than living inside something else.
 *
 * Everything below is unchanged from the old manual tab — same fields,
 * same validation, same submit behaviour, same POST /api/leads call
 * (leadSource: 'ManualEntry'). This is a relocation, not a rewrite.
 * stripEmpty is intentionally duplicated from LeadImport.jsx rather than
 * pulled into a shared module — a 3-line pure helper, and LeadImport.jsx
 * still needs its own copy for the CSV/Subscription import path, which
 * this page has no reason to import from.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { leadsApi, ApiError } from '../services/api.js';
import { s } from '../styles/tokens.js';
import { TITLES, JOB_TITLES, REGIONS } from '../constants/leadOptions.js';
import { useRole } from '../context/RoleContext.jsx';

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

export default function LeadNew() {
  const navigate  = useNavigate();
  const { portfolios: allPortfolios, productsByPortfolio } = useRole();

  const [form,          setForm]          = useState(BLANK_FORM);
  const [formErrors,    setFormErrors]    = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess,   setFormSuccess]   = useState(false);

  async function handleSubmit(e) {
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

  return (
    <div style={{ ...s.page, maxWidth: '720px' }}>
      <button onClick={() => navigate('/leads')} style={s.backBtn}>← Back to Leads</button>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color:'var(--ink)', margin: '6px 0 18px' }}>Add Lead</h1>

      <form onSubmit={handleSubmit}>
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
    </div>
  );
}
