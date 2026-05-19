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

  return (
    <div style={s.page}>
      <h1 style={{ margin: '0 0 18px', fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>App Administration</h1>

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
        {[['portfolios', 'Portfolios'], ['products', 'Products'], ['subscriptions', 'Medical Subscriptions']].map(([key, label]) => (
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
    </div>
  );
}
