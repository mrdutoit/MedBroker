/**
 * components/PortalCard.jsx — NEW, 24 Jul 2026.
 * Shared centred-card shell for the four /portal/* pages — same visual
 * language as Login.jsx (staff), reused here since ThemeProvider wraps
 * both branches of App.jsx, so the CSS-variable theme applies equally.
 */
import { Logo } from './Logo.jsx';
import { colors, radius } from '../styles/tokens.js';

export function PortalCard({ title, subtitle, children, width = '400px' }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{
        width, maxWidth: '100%',
        background: colors.surface, border: `1px solid ${colors.line}`,
        borderRadius: radius.lg, padding: '32px', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <Logo size={36} withWordmark />
        </div>
        {title && (
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'center', margin: '0 0 4px' }}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center', margin: '0 0 22px' }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
