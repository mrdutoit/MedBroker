/**
 * pages/LeadList.jsx
 * Lead list view — the primary workspace for agents and supervisors.
 * Shows paginated, filterable leads with status badges and quick actions.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { leadsApi } from '../services/api.js';
import { formatDistanceToNow } from 'date-fns';

const STATUS_COLOURS = {
  Unassigned:        '#6b7280',
  Assigned:          '#3b82f6',
  InProgress:        '#f59e0b',
  AppointmentBooked: '#8b5cf6',
  Progressed:        '#06b6d4',
  ClosedWon:         '#10b981',
  ClosedLost:        '#ef4444',
  Uncontactable:     '#9ca3af',
};

export default function LeadList() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    status:   '',
    search:   '',
    page:     1,
    pageSize: 25,
  });

  const { data, loading, error, refetch } = useFetch(
    () => leadsApi.list(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
    ),
    [filters]
  );

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  }

  function handlePageChange(newPage) {
    setFilters(prev => ({ ...prev, page: newPage }));
  }

  const totalPages = data ? Math.ceil(data.total / filters.pageSize) : 0;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Leads</h1>
        <button
          onClick={() => navigate('/leads/import')}
          style={styles.primaryButton}
        >
          Import Leads
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search name or email..."
          value={filters.search}
          onChange={e => handleFilterChange('search', e.target.value)}
          style={styles.input}
        />
        <select
          value={filters.status}
          onChange={e => handleFilterChange('status', e.target.value)}
          style={styles.select}
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLOURS).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={refetch} style={styles.secondaryButton}>Refresh</button>
      </div>

      {/* Table */}
      {loading && <p style={{ color: '#6b7280' }}>Loading leads...</p>}

      {error && (
        <div style={styles.errorBox}>
          Failed to load leads: {error.message}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div style={{ marginBottom: '8px', color: '#6b7280', fontSize: '0.875rem' }}>
            {data.total} lead{data.total !== 1 ? 's' : ''} found
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Name', 'Email', 'Mobile', 'Occupation', 'Status', 'Agent', 'Added', ''].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.leads.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
                      No leads match your filters.
                    </td>
                  </tr>
                )}
                {data.leads.map(lead => (
                  <tr
                    key={lead.id}
                    style={styles.tr}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    <td style={styles.td}>
                      <strong>{lead.firstName} {lead.lastName}</strong>
                    </td>
                    <td style={styles.td}>{lead.email}</td>
                    <td style={styles.td}>{lead.mobileNumber ?? '—'}</td>
                    <td style={styles.td}>{lead.occupation ?? '—'}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: `${STATUS_COLOURS[lead.pipelineStatus]}20`,
                        color: STATUS_COLOURS[lead.pipelineStatus],
                        border: `1px solid ${STATUS_COLOURS[lead.pipelineStatus]}40`,
                      }}>
                        {lead.pipelineStatus}
                      </span>
                    </td>
                    <td style={styles.td}>{lead.agentName ?? '—'}</td>
                    <td style={styles.td}>
                      {lead.createdAt
                        ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })
                        : '—'}
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        style={styles.linkButton}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
              <button
                onClick={() => handlePageChange(filters.page - 1)}
                disabled={filters.page <= 1}
                style={styles.secondaryButton}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Page {filters.page} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(filters.page + 1)}
                disabled={filters.page >= totalPages}
                style={styles.secondaryButton}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  primaryButton: {
    background: '#1d4ed8',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  secondaryButton: {
    background: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#1d4ed8',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: '4px 8px',
  },
  input: {
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.875rem',
    minWidth: '240px',
  },
  select: {
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.875rem',
    background: 'white',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontWeight: 600,
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #f3f4f6',
    color: '#374151',
  },
  tr: {
    background: 'white',
    transition: 'background 0.1s',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '12px 16px',
    color: '#dc2626',
    fontSize: '0.875rem',
  },
};
