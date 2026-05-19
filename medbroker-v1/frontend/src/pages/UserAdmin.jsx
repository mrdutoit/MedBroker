/**
 * pages/UserAdmin.jsx
 * User management — create, edit, activate/deactivate.
 * New in this version:
 *   - Supervisor assignment for Agent and Broker roles
 *   - Portfolio selection via checkboxes (not dropdown)
 *   - Products shown per selected portfolio, drawn from PRODUCTS_BY_PORTFOLIO
 *   - SSO invitation notice — no password created
 */

import { useState } from 'react';
import { useRole, PORTFOLIOS, PRODUCTS_BY_PORTFOLIO } from '../context/RoleContext.jsx';
import { s } from '../styles/tokens.js';

const ROLES = ['Admin', 'Supervisor', 'Agent', 'Broker'];
const REGIONS = [
  'Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape',
  'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Free State',
];

const MOCK_USERS = [
  { id:'1',  displayName:'Thabo Molefe',        email:'thabo.molefe@medbroker.co.za',      role:'Agent',      region:'Gauteng',          supervisor:'Supervisor One', portfolios:['Discovery'],                   products:[],                            isActive:true },
  { id:'2',  displayName:'Naledi van Wyk',       email:'naledi.vanwyk@medbroker.co.za',     role:'Agent',      region:'Western Cape',      supervisor:'Supervisor One', portfolios:['Discovery'],                   products:[],                            isActive:true },
  { id:'3',  displayName:'Kabelo Petersen',      email:'kabelo.petersen@medbroker.co.za',   role:'Agent',      region:'Gauteng',          supervisor:'Supervisor One', portfolios:['Money and Medicine'],           products:[],                            isActive:true },
  { id:'4',  displayName:'Bongani Ntuli',        email:'bongani.ntuli@medbroker.co.za',     role:'Agent',      region:'KwaZulu-Natal',    supervisor:'Supervisor One', portfolios:['Discovery'],                   products:[],                            isActive:true },
  { id:'5',  displayName:'Siphiwe Mahlangu',     email:'siphiwe.mahlangu@medbroker.co.za',  role:'Agent',      region:'Gauteng',          supervisor:'Supervisor One', portfolios:['Discovery'],                   products:[],                            isActive:false },
  { id:'6',  displayName:'Sandra van der Berg',  email:'sandra@medbroker.co.za',            role:'Broker',     region:'Gauteng',          supervisor:'Supervisor One', portfolios:['Discovery','Money and Medicine'], products:['Life Insurance','Medical Aid'], isActive:true },
  { id:'7',  displayName:'Riaan Botha',          email:'riaan.botha@medbroker.co.za',       role:'Broker',     region:'Western Cape',      supervisor:'Supervisor One', portfolios:['Discovery'],                   products:['Income Protection','Disability Cover'], isActive:true },
  { id:'8',  displayName:'Pieter Joubert',       email:'pieter.joubert@medbroker.co.za',    role:'Broker',     region:'Gauteng',          supervisor:'Supervisor One', portfolios:['Discovery'],                   products:['Life Insurance','Gap Cover'],  isActive:true },
  { id:'9',  displayName:'Supervisor One',       email:'supervisor@medbroker.co.za',        role:'Supervisor', region:'All',              supervisor:'—',             portfolios:[],                              products:[],                            isActive:true },
  { id:'10', displayName:'Admin User',           email:'admin@medbroker.co.za',             role:'Admin',      region:'—',                supervisor:'—',             portfolios:[],                              products:[],                            isActive:true },
];

const SUPERVISORS = MOCK_USERS.filter(u => u.role === 'Supervisor').map(u => u.displayName);

const ROLE_STYLE = {
  GlobalAdmin: { bg: '#fdf2ff', colour: '#7e22ce' },
  Admin:      { bg: '#fef2f2', colour: '#dc2626' },
  Supervisor: { bg: '#fffbeb', colour: '#d97706' },
  Agent:      { bg: '#eff6ff', colour: '#1d4ed8' },
  Broker:     { bg: '#f0fdf4', colour: '#15803d' },
};

const BLANK_FORM = {
  displayName: '', email: '', role: 'Agent', region: '',
  supervisor: '', portfolios: [], products: [],
};

// ─── Portfolio + product selector (reused in both modals) ────────────────────
function PortfolioProductSelector({ portfolios, products, onPortfolioChange, onProductChange, role }) {
  const needsPortfolio = ['Agent', 'Supervisor', 'Broker'].includes(role);
  const needsProducts  = role === 'Broker';
  if (!needsPortfolio) return null;

  return (
    <div>
      <div style={s.formGroup}>
        <label style={s.formLabel}>Portfolio {role !== 'Supervisor' ? '*' : ''}</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          {PORTFOLIOS.map(p => {
            const checked = portfolios.includes(p.name);
            return (
              <label
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  cursor: 'pointer', padding: '6px 12px',
                  border: `1px solid ${checked ? '#bfdbfe' : '#d1d5db'}`,
                  borderRadius: '6px', fontSize: '0.875rem',
                  background: checked ? '#eff6ff' : 'white',
                  color: checked ? '#1d4ed8' : '#374151',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onPortfolioChange(p.name)}
                  style={{ accentColor: '#1d4ed8' }}
                />
                {p.name}
              </label>
            );
          })}
        </div>
      </div>

      {needsProducts && portfolios.map(portName => {
        const portId   = portName === 'Discovery' ? 'disc' : 'mm';
        const allProds = PRODUCTS_BY_PORTFOLIO[portId] || [];
        return (
          <div key={portName} style={{ ...s.formGroup }}>
            <label style={{ ...s.formLabel, color: '#1d4ed8' }}>{portName} products</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              {allProds.map(prod => {
                const checked = products.includes(prod);
                return (
                  <label
                    key={prod}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '0.75rem', cursor: 'pointer',
                      padding: '3px 8px', borderRadius: '20px',
                      background: checked ? '#f0fdf4' : '#f3f4f6',
                      color: checked ? '#15803d' : '#374151',
                      border: `1px solid ${checked ? '#bbf7d0' : '#e5e7eb'}`,
                      userSelect: 'none',
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => onProductChange(prod)} style={{ accentColor: '#15803d' }} />
                    {prod}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function UserModal({ mode, user, onClose }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(
    isEdit
      ? {
          ...user,
          // Guarantee these are always arrays regardless of what the mock data provides
          portfolios: Array.isArray(user.portfolios) ? user.portfolios : [],
          products:   Array.isArray(user.products)   ? user.products   : [],
        }
      : { ...BLANK_FORM }
  );

  function togglePortfolio(name) {
    setForm(f => {
      const next = f.portfolios.includes(name)
        ? f.portfolios.filter(p => p !== name)
        : [...f.portfolios, name];
      // Remove products that belong to deselected portfolio
      const validPortIds = next.map(p => p === 'Discovery' ? 'disc' : 'mm');
      const validProds   = validPortIds.flatMap(id => PRODUCTS_BY_PORTFOLIO[id] || []);
      return { ...f, portfolios: next, products: f.products.filter(pr => validProds.includes(pr)) };
    });
  }

  function toggleProduct(name) {
    setForm(f => ({
      ...f,
      products: f.products.includes(name) ? f.products.filter(p => p !== name) : [...f.products, name],
    }));
  }

  const needsSupervisor = ['Agent', 'Broker'].includes(form.role);

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.modal, width: '520px' }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{isEdit ? 'Edit User' : 'Add User'}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* SSO notice */}
        <div style={{ ...s.noticeInfo, marginBottom: '16px', fontSize: '0.8125rem' }}>
          {isEdit
            ? `This user signs in via SSO using their existing Microsoft 365 or Google account.`
            : `The user will be invited via SSO using their Microsoft 365 or Google Workspace account. No separate password is created.`
          }
        </div>

        {/* Identity card for edit */}
        {isEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: '#f9fafb', borderRadius: '6px', marginBottom: '14px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: ROLE_STYLE[form.role]?.bg ?? '#f3f4f6',
              color: ROLE_STYLE[form.role]?.colour ?? '#374151',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 600,
            }}>
              {form.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div style={{ fontWeight: 500 }}>{form.displayName}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{form.email} · SSO</div>
            </div>
          </div>
        )}

        {!isEdit && (
          <>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Display name *</label>
              <input style={s.formInput} value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Dr Jane Smith" />
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel}>Email address * <span style={{ fontSize: '0.688rem', color: '#9ca3af' }}>(Microsoft 365 or Google Workspace)</span></label>
              <input type="email" style={s.formInput} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane.smith@medbroker.co.za" />
            </div>
          </>
        )}

      {/* Role + Status row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={s.formGroup}>
            <label style={s.formLabel}>Role *</label>
            <select
              style={s.formInput}
              value={form.role}
              onChange={e => {
                const newRole = e.target.value;
                // Clear portfolios and products when switching away from roles that use them
                const keepPortfolios = ['Agent', 'Supervisor', 'Broker'].includes(newRole);
                setForm(f => ({
                  ...f,
                  role: newRole,
                  portfolios: keepPortfolios ? f.portfolios : [],
                  products:   newRole === 'Broker' ? f.products : [],
                }));
              }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {isEdit && (
            <div style={s.formGroup}>
              <label style={s.formLabel}>Status</label>
              <select style={s.formInput} value={form.isActive ? 'Active' : 'Inactive'} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'Active' }))}>
                <option>Active</option><option>Inactive</option>
              </select>
            </div>
          )}
          {!['Admin', 'Supervisor', 'GlobalAdmin'].includes(form.role) && (
            <div style={s.formGroup}>
              <label style={s.formLabel}>Region *</label>
              <select style={s.formInput} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
                <option value="">Select region…</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Supervisor assignment */}
        {needsSupervisor && (
          <div style={s.formGroup}>
            <label style={s.formLabel}>Supervisor *</label>
            <select style={s.formInput} value={form.supervisor} onChange={e => setForm(f => ({ ...f, supervisor: e.target.value }))}>
              <option value="">Select supervisor…</option>
              {SUPERVISORS.map(sv => <option key={sv} value={sv}>{sv}</option>)}
            </select>
            <div style={s.formHint}>The supervisor can view all leads and appointments assigned to this user.</div>
          </div>
        )}

        {/* Portfolio + products */}
        <PortfolioProductSelector
          portfolios={form.portfolios}
          products={form.products}
          onPortfolioChange={togglePortfolio}
          onProductChange={toggleProduct}
          role={form.role}
        />

        <div style={{ ...s.modalFooter, justifyContent: isEdit ? 'space-between' : 'flex-end' }}>
          {isEdit && (
            <button style={s.dangerBtn} onClick={onClose}>Deactivate</button>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
            <button style={s.primaryBtn} onClick={onClose}>
              {isEdit ? 'Save Changes' : 'Send Invitation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function UserAdmin() {
  const [roleFilter, setRoleFilter] = useState('All');
  const [modal,      setModal]      = useState(null);   // { mode: 'create'|'edit', user? }

  const filtered = MOCK_USERS.filter(u => roleFilter === 'All' || u.role === roleFilter);
  const counts   = ROLES.reduce((acc, r) => { acc[r] = MOCK_USERS.filter(u => u.role === r).length; return acc; }, {});

  return (
    <div style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, color: '#111827' }}>User Administration</h1>
        <button style={s.primaryBtn} onClick={() => setModal({ mode: 'create' })}>+ Add User</button>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {ROLES.map(r => {
          const rs = ROLE_STYLE[r];
          return (
            <div
              key={r}
              style={{ ...s.metricCard, cursor: 'pointer', border: roleFilter === r ? `1px solid ${rs.colour}` : '1px solid #e5e7eb' }}
              onClick={() => setRoleFilter(roleFilter === r ? 'All' : r)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: '#374151' }}>{r}s</span>
                <span style={{ ...s.badge, background: rs.bg, color: rs.colour, fontSize: '0.688rem' }}>{r}</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 600, color: '#111827', marginTop: '8px' }}>{counts[r] ?? 0}</div>
            </div>
          );
        })}
      </div>

      {/* Role chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {['All', ...ROLES].map(r => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            style={{ ...s.chip, ...(roleFilter === r ? s.chipActive : {}) }}
          >
            {r === 'All' ? 'All users' : r + 's'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Email</th>
              <th style={s.th}>Role</th>
              <th style={s.th}>Region</th>
              <th style={s.th}>Portfolio</th>
              <th style={s.th}>Supervisor</th>
              <th style={s.th}>Products</th>
              <th style={s.th}>Status</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => {
              const rs = ROLE_STYLE[user.role] ?? ROLE_STYLE.Agent;
              return (
                <tr
                  key={user.id}
                  style={s.tr}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                        background: rs.bg, color: rs.colour,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.625rem', fontWeight: 600,
                      }}>
                        {user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{user.displayName}</span>
                    </div>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>{user.email}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: rs.bg, color: rs.colour }}>{user.role}</span>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8125rem' }}>{user.region || '—'}</td>
                  <td style={s.td}>
                    {user.portfolios.length > 0
                      ? user.portfolios.map(p => (
                          <span key={p} style={{
                            ...s.badge, fontSize: '0.688rem', marginRight: '3px',
                            background: p === 'Discovery' ? '#eff6ff' : '#f5f3ff',
                            color:      p === 'Discovery' ? '#1d4ed8' : '#7c3aed',
                          }}>{p === 'Money and Medicine' ? 'M&M' : p}</span>
                        ))
                      : <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>—</span>
                    }
                  </td>
                  <td style={{ ...s.td, fontSize: '0.8125rem', color: '#6b7280' }}>{user.supervisor || '—'}</td>
                  <td style={s.td}>
                    {user.products.length > 0
                      ? user.products.slice(0, 2).map(p => (
                          <span key={p} style={{ ...s.badge, background: '#f0fdf4', color: '#15803d', fontSize: '0.625rem', marginRight: '2px' }}>{p}</span>
                        ))
                      : <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>—</span>
                    }
                    {user.products.length > 2 && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}> +{user.products.length - 2}</span>}
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: user.isActive ? '#f0fdf4' : '#f3f4f6', color: user.isActive ? '#15803d' : '#9ca3af' }}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={s.td}>
                    <button style={s.linkBtn} onClick={() => setModal({ mode: 'edit', user })}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
