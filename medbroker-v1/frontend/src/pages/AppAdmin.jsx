/**
 * pages/AppAdmin.jsx
 * Application administration — Portfolios, Products, Medical Subscriptions.
 * These are the configurable reference data entities used throughout the app.
 */

import { useState } from 'react';
import { s } from '../styles/tokens.js';
import { PORTFOLIOS, PRODUCTS_BY_PORTFOLIO } from '../context/RoleContext.jsx';

const MOCK_SUBSCRIPTIONS = [
  { name: 'MedLeads SA — Monthly Bundle',   provider: 'MedLeads SA (Pty) Ltd',  imported: 342, lastImport: '1 May 2026',  status: 'Active' },
  { name: 'Healthwise Doctor Database',     provider: 'Healthwise Data',         imported: 187, lastImport: '15 Apr 2026', status: 'Active' },
  { name: 'SA Medical Register — Q2 2026', provider: 'HPCSA Data Services',      imported: 0,   lastImport: 'Never',       status: 'Pending' },
];

const ALL_PRODUCTS = [
  ...PRODUCTS_BY_PORTFOLIO.disc.map((name, i) => ({ name, portfolio: 'Discovery',          sold: [23,18,14,9,6,11,16,8,12,5][i] ?? 0, status: 'Active' })),
  ...PRODUCTS_BY_PORTFOLIO.mm.map((name, i)   => ({ name, portfolio: 'Money and Medicine', sold: [4,3,2][i] ?? 0,                      status: 'Active' })),
];

export default function AppAdmin() {
  const [tab, setTab] = useState('portfolios');

  // System Settings state — in production, fetched from GET /api/config
  // and saved via PUT /api/config (Admin/GlobalAdmin only)
  const [monthlyTokens,     setMonthlyTokens]     = useState(10);
  const [autoReturnMonths,  setAutoReturnMonths]   = useState(6);
  const [maxCallAttempts,   setMaxCallAttempts]    = useState(3);
  const [settingsSaved,     setSettingsSaved]      = useState(false);

  function saveSettings() {
    // In production: PUT /api/config { brokerFreeAppointmentsPerMonth, leadAutoUnassignMonths, maxCallAttempts }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  }

  return (
    <div style={s.page}>
      <h1 style={{ margin: '0 0 18px', fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>App Administration</h1>

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
        {[['portfolios', 'Portfolios'], ['products', 'Products'], ['subscriptions', 'Medical Subscriptions'], ['settings', 'System Settings']].map(([key, label]) => (
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

      {/* Portfolios */}
      {tab === 'portfolios' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              Portfolios define the business unit a broker or agent operates under.
            </p>
            <button style={s.primaryBtn}>+ Add Portfolio</button>
          </div>
          <div style={s.tableCard}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Portfolio name</th>
                <th style={s.th}>Brokers assigned</th>
                <th style={s.th}>Agents assigned</th>
                <th style={s.th}>Active leads</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                <tr style={s.tr} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background=''}>
                  <td style={{ ...s.td, fontWeight: 500 }}>Discovery</td>
                  <td style={s.td}>3</td><td style={s.td}>3</td>
                  <td style={{ ...s.td, color: '#1d4ed8', fontWeight: 600 }}>487</td>
                  <td style={s.td}><span style={{ ...s.badge, background: '#f0fdf4', color: '#15803d' }}>Active</span></td>
                  <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                </tr>
                <tr style={s.tr} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background=''}>
                  <td style={{ ...s.td, fontWeight: 500 }}>Money and Medicine</td>
                  <td style={s.td}>2</td><td style={s.td}>2</td>
                  <td style={{ ...s.td, color: '#1d4ed8', fontWeight: 600 }}>214</td>
                  <td style={s.td}><span style={{ ...s.badge, background: '#f0fdf4', color: '#15803d' }}>Active</span></td>
                  <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Products */}
      {tab === 'products' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              Products belong to a portfolio and are selectable as products sold on an appointment.
            </p>
            <button style={s.primaryBtn}>+ Add Product</button>
          </div>
          <div style={s.tableCard}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Product name</th>
                <th style={s.th}>Portfolio</th>
                <th style={s.th}>Sold this month</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                {ALL_PRODUCTS.map(p => (
                  <tr key={p.name} style={s.tr} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{p.name}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, fontSize: '0.688rem',
                        background: p.portfolio === 'Discovery' ? '#eff6ff' : '#f5f3ff',
                        color:      p.portfolio === 'Discovery' ? '#1d4ed8' : '#7c3aed',
                      }}>
                        {p.portfolio === 'Money and Medicine' ? 'M&M' : p.portfolio}
                      </span>
                    </td>
                    <td style={s.td}>{p.sold}</td>
                    <td style={s.td}><span style={{ ...s.badge, background: '#f0fdf4', color: '#15803d' }}>Active</span></td>
                    <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Subscriptions */}
      {tab === 'subscriptions' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              Medical lead subscriptions. When importing, select a subscription and the name is used as the lead source.
            </p>
            <button style={s.primaryBtn}>+ Add Subscription</button>
          </div>
          <div style={s.tableCard}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Subscription name</th>
                <th style={s.th}>Provider</th>
                <th style={s.th}>Leads imported</th>
                <th style={s.th}>Last import</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr></thead>
              <tbody>
                {MOCK_SUBSCRIPTIONS.map(sub => (
                  <tr key={sub.name} style={s.tr} onMouseEnter={e => e.currentTarget.style.background='#f9fafb'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{sub.name}</td>
                    <td style={{ ...s.td, color: '#6b7280', fontSize: '0.8125rem' }}>{sub.provider}</td>
                    <td style={s.td}>{sub.imported}</td>
                    <td style={{ ...s.td, color: '#6b7280', fontSize: '0.8125rem' }}>{sub.lastImport}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge,
                        background: sub.status === 'Active' ? '#f0fdf4' : '#fffbeb',
                        color:      sub.status === 'Active' ? '#15803d' : '#d97706',
                      }}>
                        {sub.status}
                      </span>
                    </td>
                    <td style={s.td}><button style={s.linkBtn}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* System Settings */}
      {tab === 'settings' && (
        <div style={{ maxWidth: '600px' }}>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '20px' }}>
            System-wide configuration values. Changes take effect immediately without a deployment.
          </p>

          {settingsSaved && (
            <div style={{ ...s.noticeSuccess, marginBottom: '16px' }}>
              ✓ Settings saved successfully.
            </div>
          )}

          <div style={s.card}>
            <div style={s.cardTitle}>Broker Token Allocation</div>
            <div style={{ ...s.noticeInfo, marginBottom: '14px', fontSize: '0.8125rem' }}>
              Controls how many free appointment claims each broker receives per calendar month.
              Once exhausted, additional claims require tokens. Tokens can be purchased by
              the broker or topped up manually by an administrator.
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Free appointments per broker per month *
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>
                  (stored in SystemConfig.brokerFreeAppointmentsPerMonth)
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number" min={1} max={100}
                  value={monthlyTokens}
                  onChange={e => setMonthlyTokens(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  style={{ ...s.formInput, width: '100px' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>per month</span>
              </div>
              <div style={s.formHint}>
                Recommended: 10. Applies to all brokers. Individual overrides are not currently supported.
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Lead Auto-Return</div>
            <div style={{ ...s.noticeInfo, marginBottom: '14px', fontSize: '0.8125rem' }}>
              Appointments that have not been closed (no signed outcome) after this period
              are automatically returned to the Unassigned leads queue by a scheduled daily job.
              The lead can then be worked by an agent and a new appointment booked with the prospect.
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Return to queue after *
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>
                  (stored in SystemConfig.leadAutoUnassignMonths)
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number" min={1} max={24}
                  value={autoReturnMonths}
                  onChange={e => setAutoReturnMonths(Math.max(1, Math.min(24, parseInt(e.target.value) || 6)))}
                  style={{ ...s.formInput, width: '100px' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>months without closure</span>
              </div>
              <div style={s.formHint}>
                Default: 6 months. The auto-return job runs daily at 07:00.
                Manually returning an appointment to the queue is also available from the Appointment Detail page.
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Agent Call Settings</div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>
                Maximum call attempts before lead is marked Uncontactable *
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>
                  (stored in SystemConfig.maxCallAttempts)
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number" min={1} max={20}
                  value={maxCallAttempts}
                  onChange={e => setMaxCallAttempts(Math.max(1, Math.min(20, parseInt(e.target.value) || 3)))}
                  style={{ ...s.formInput, width: '100px' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>attempts</span>
              </div>
              <div style={s.formHint}>Default: 3 attempts.</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button style={s.primaryBtn} onClick={saveSettings}>Save Settings</button>
          </div>
        </div>
      )}
    </div>
  );
}
