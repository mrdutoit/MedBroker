/**
 * pages/Reports.jsx
 * Reporting dashboard — pipeline funnel, broker performance, agent activity.
 * View buttons navigate to /reports/broker/:id and /reports/agent/:id.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { s } from '../styles/tokens.js';

const PIPELINE_DATA = [
  { status: 'Unassigned',         count: 284, colour: '#6b7280' },
  { status: 'Assigned',           count: 196, colour: '#3b82f6' },
  { status: 'In Progress',        count: 151, colour: '#f59e0b' },
  { status: 'Appointment Booked', count: 87,  colour: '#8b5cf6' },
  { status: 'Progressed',         count: 63,  colour: '#06b6d4' },
  { status: 'Closed Won',         count: 89,  colour: '#10b981' },
  { status: 'Closed Lost',        count: 171, colour: '#ef4444' },
  { status: 'Uncontactable',      count: 243, colour: '#9ca3af' },
];

const BROKER_DATA = [
  { id: 'broker-1', name: 'Sandra van der Berg', appointments: 18, closedWon: 9,  policyValue: 1_420_000, convRate: 50 },
  { id: 'broker-2', name: 'Pieter Joubert',      appointments: 12, closedWon: 7,  policyValue: 1_150_000, convRate: 58 },
  { id: 'broker-3', name: 'Riaan Botha',         appointments: 14, closedWon: 6,  policyValue: 980_000,   convRate: 43 },
  { id: 'broker-4', name: 'Marelize Swart',      appointments: 8,  closedWon: 5,  policyValue: 790_000,   convRate: 63 },
  { id: 'broker-5', name: 'Anele Khumalo',       appointments: 10, closedWon: 4,  policyValue: 650_000,   convRate: 40 },
];

const AGENT_DATA = [
  { id: 'agent-1', name: 'Thabo Molefe',    leadsAssigned: 68, callsMade: 142, appointmentsBooked: 24 },
  { id: 'agent-2', name: 'Naledi van Wyk',  leadsAssigned: 54, callsMade: 98,  appointmentsBooked: 18 },
  { id: 'agent-3', name: 'Kabelo Petersen', leadsAssigned: 61, callsMade: 119, appointmentsBooked: 21 },
  { id: 'agent-4', name: 'Bongani Ntuli',   leadsAssigned: 49, callsMade: 87,  appointmentsBooked: 15 },
  { id: 'agent-5', name: 'Siphiwe Mahlangu',leadsAssigned: 43, callsMade: 76,  appointmentsBooked: 9  },
];

const MONTHLY_DATA = [
  { month: 'Jan', leads: 84,  won: 6  },
  { month: 'Feb', leads: 96,  won: 8  },
  { month: 'Mar', leads: 112, won: 11 },
  { month: 'Apr', leads: 128, won: 14 },
  { month: 'May', leads: 143, won: 17 },
  { month: 'Jun', leads: 0,   won: 0  },
];

const total           = PIPELINE_DATA.reduce((a, b) => a + b.count, 0);
const totalPolicyValue = BROKER_DATA.reduce((a, b) => a + b.policyValue, 0);

function fmt(n) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

export default function Reports() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('mtd');

  const maxLeads = Math.max(...MONTHLY_DATA.map(m => m.leads));
  const maxWon   = Math.max(...MONTHLY_DATA.map(m => m.won));

  return (
    <div style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 600, color: '#111827', margin: 0 }}>Reports</h1>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[['mtd','Month to date'], ['qtd','Quarter'], ['ytd','Year to date']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              style={{
                ...s.chip,
                ...(period === key ? s.chipActive : {}),
                padding: '5px 12px',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Total leads',   value: total.toLocaleString(),                       sub: 'All time' },
          { label: 'Appointments',  value: '347',                                         sub: 'Booked total' },
          { label: 'Closed won',    value: '89',                                          sub: '6.9% conversion' },
          { label: 'Total policy value', value: fmt(totalPolicyValue),                   sub: 'All brokers' },
        ].map(c => (
          <div key={c.label} style={s.metricCard}>
            <div style={{ fontSize: '0.688rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Pipeline funnel */}
        <div style={s.card}>
          <div style={s.cardTitle}>Pipeline Status Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {PIPELINE_DATA.map(row => (
              <div key={row.status}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.8125rem', color: '#374151' }}>{row.status}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
                    {row.count} <span style={{ fontWeight: 400, color: '#9ca3af' }}>({Math.round(row.count / total * 100)}%)</span>
                  </span>
                </div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, background: row.colour, width: `${Math.round(row.count / total * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly trend */}
        <div style={s.card}>
          <div style={s.cardTitle}>Monthly Volume</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '170px', paddingTop: '12px' }}>
            {MONTHLY_DATA.map(m => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '4px' }}>
                <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '130px' }}>
                  <div style={{ flex: 1, background: '#bfdbfe', borderRadius: '3px 3px 0 0', height: maxLeads > 0 ? `${(m.leads / maxLeads) * 100}%` : '2px' }} />
                  <div style={{ flex: 1, background: '#10b981', borderRadius: '3px 3px 0 0', height: maxWon > 0 ? `${(m.won / maxWon) * 100}%` : '2px' }} />
                </div>
                <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{m.month}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}><span style={{ color: '#3b82f6' }}>■</span> Leads</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}><span style={{ color: '#10b981' }}>■</span> Closed Won</span>
          </div>
        </div>
      </div>

      {/* Broker performance */}
      <div style={{ ...s.card, marginBottom: '14px', overflowX: 'auto', overflowX: 'auto' }}>
        <div style={s.cardTitle}>Broker Performance</div>
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              {['Broker', 'Appointments', 'Closed Won', 'Policy Value', 'Conversion', ''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...BROKER_DATA].sort((a, b) => b.policyValue - a.policyValue).map((broker, i) => (
              <tr
                key={broker.id}
                style={s.tr}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <td style={s.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {i === 0 && <span>🏆</span>}
                    <span style={{ fontWeight: 500 }}>{broker.name}</span>
                  </div>
                </td>
                <td style={s.td}>{broker.appointments}</td>
                <td style={s.td}>{broker.closedWon}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{fmt(broker.policyValue)}</td>
                <td style={s.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ ...s.barTrack, width: '70px' }}>
                      <div style={{ ...s.barFill, background: broker.convRate >= 50 ? '#10b981' : '#f59e0b', width: `${broker.convRate}%` }} />
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{broker.convRate}%</span>
                  </div>
                </td>
                <td style={s.td}>
                  <button style={s.linkBtn} onClick={() => navigate(`/reports/broker/${broker.id}`)}>View →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Agent activity */}
      <div style={s.card}>
        <div style={s.cardTitle}>Agent Activity</div>
        <table style={{ ...s.table, minWidth: '600px' }}>
          <thead>
            <tr>
              {['Agent', 'Leads Assigned', 'Calls Made', 'Appts Booked', 'Booking Rate', ''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AGENT_DATA.map(agent => {
              const rate = Math.round((agent.appointmentsBooked / agent.callsMade) * 100);
              return (
                <tr
                  key={agent.id}
                  style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ ...s.td, fontWeight: 500 }}>{agent.name}</td>
                  <td style={s.td}>{agent.leadsAssigned}</td>
                  <td style={s.td}>{agent.callsMade}</td>
                  <td style={s.td}>{agent.appointmentsBooked}</td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ ...s.barTrack, width: '60px' }}>
                        <div style={{ ...s.barFill, background: '#3b82f6', width: `${rate}%` }} />
                      </div>
                      <span style={{ fontSize: '0.8125rem' }}>{rate}%</span>
                    </div>
                  </td>
                  <td style={s.td}>
                    <button style={s.linkBtn} onClick={() => navigate(`/reports/agent/${agent.id}`)}>View →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
