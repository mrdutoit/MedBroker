/**
 * pages/Integrations.jsx — NEW, §134 (6 Aug 2026). EXTENDED §135
 * (7 Aug 2026) with a Paystack card.
 * App Admin → Integrations. Stripe, Paystack (both — token purchase
 * checkout/webhook) and SMTP (notification email) credentials,
 * GlobalAdmin only both directions — route-gated in App.jsx the same way
 * FeatureFlags.jsx is, not just an internal check on this page.
 *
 * MASKING — GET /api/system-config/integrations never returns a secret
 * value in the clear once it's been saved (integrationCredentialService.js's
 * own masking contract). Each secret field here shows a "•••• last 4
 * characters" placeholder when set, and the actual input starts empty —
 * typing a new value replaces the stored one on save; leaving it blank
 * leaves the stored value untouched (a genuinely blank submit is a no-op
 * for that field, not a clear — see integrationCredentialService.setConfig()).
 *
 * THREE INDEPENDENT SAVE ACTIONS — Stripe, Paystack, and SMTP are
 * separate PUT endpoints (integrationsApi.updateStripe/updatePaystack/
 * updateSmtp) and separate cards here, matching the backend's
 * per-provider row design. Saving one never touches the others.
 */

import { useState, useEffect } from 'react';
import { useFlags } from '../context/FlagContext.jsx';
import { integrationsApi, ApiError } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { s } from '../styles/tokens.js';

function StatusRow({ ok, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
      borderRadius: '6px', background: 'var(--panel2)', fontSize: '0.8125rem', marginBottom: '10px',
    }}>
      <span>{ok ? '✅' : '➖'}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Stripe card ────────────────────────────────────────────────────────────────
function StripeCard({ status, onSaved }) {
  const { flag } = useFlags();
  const providerIsStripe = flag('appointments.tokens.paymentProvider') === 'stripe';

  const [secretKey, setSecretKey]     = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const fields = {};
      if (secretKey.trim())     fields.secretKey = secretKey.trim();
      if (webhookSecret.trim()) fields.webhookSigningSecret = webhookSecret.trim();
      const updated = await integrationsApi.updateStripe(fields);
      onSaved(updated);
      setSecretKey('');
      setWebhookSecret('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save Stripe settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...s.card, marginBottom: '18px' }}>
      <div style={s.cardTitle}>Stripe — token purchase checkout</div>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 12px' }}>
        Lets Brokers buy additional appointment-claim tokens via a Stripe-hosted Checkout page.
        Only the secret key and webhook signing secret are needed here — Checkout is redirect-based,
        so this app never handles card details or a publishable key directly.
      </p>

      <StatusRow ok={providerIsStripe}>
        <code>appointments.tokens.paymentProvider</code> is currently <strong>{providerIsStripe ? '"stripe"' : `"${flag('appointments.tokens.paymentProvider') || 'none'}"`}</strong>
        {providerIsStripe
          ? ' — Brokers see a real Buy Tokens checkout on the Appointments page.'
          : ' — Buy Tokens is disabled for Brokers until this is set to "stripe" in Feature Flags, even if the credentials below are filled in.'}
      </StatusRow>

      {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}
      {saved && <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>✓ Stripe settings saved.</div>}

      <div style={s.formGroup}>
        <label style={s.formLabel}>Secret key</label>
        <input
          type="password"
          style={s.formInput}
          value={secretKey}
          onChange={e => setSecretKey(e.target.value)}
          placeholder={status?.secretKeySet ? `Set — ends ${status.secretKeyPreview}` : 'sk_test_… or sk_live_…'}
          autoComplete="off"
        />
        <div style={s.formHint}>From the Stripe Dashboard → Developers → API keys. Leave blank to keep the current key.</div>
      </div>

      <div style={s.formGroup}>
        <label style={s.formLabel}>Webhook signing secret</label>
        <input
          type="password"
          style={s.formInput}
          value={webhookSecret}
          onChange={e => setWebhookSecret(e.target.value)}
          placeholder={status?.webhookSigningSecretSet ? `Set — ends ${status.webhookSigningSecretPreview}` : 'whsec_…'}
          autoComplete="off"
        />
        <div style={s.formHint}>
          From the Stripe Dashboard → Developers → Webhooks, for an endpoint pointed at{' '}
          <code style={{ fontSize: '0.75rem' }}>{typeof window !== 'undefined' ? window.location.origin : ''}/api/appointments/tokens/webhook</code>,
          listening for <code style={{ fontSize: '0.75rem' }}>checkout.session.completed</code>. Leave blank to keep the current secret.
        </div>
      </div>

      <button style={s.primaryBtn} onClick={handleSave} disabled={saving || (!secretKey.trim() && !webhookSecret.trim())}>
        {saving ? 'Saving…' : 'Save Stripe settings'}
      </button>
    </div>
  );
}

// ─── Paystack card ──────────────────────────────────────────────────────────────
// §135 (7 Aug 2026) — added alongside Stripe because Stripe does not
// support South Africa as a merchant country; Paystack (Stripe-owned)
// does, natively in ZAR. Deliberately ONE field, not two like Stripe's
// card above — Paystack has no separate webhook signing secret, the same
// secret key both calls their API and signs the webhook (see
// paystackService.js's own header).
function PaystackCard({ status, onSaved }) {
  const { flag } = useFlags();
  const providerIsPaystack = flag('appointments.tokens.paymentProvider') === 'paystack';

  const [secretKey, setSecretKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await integrationsApi.updatePaystack({ secretKey: secretKey.trim() });
      onSaved(updated);
      setSecretKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save Paystack settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...s.card, marginBottom: '18px' }}>
      <div style={s.cardTitle}>Paystack — token purchase checkout</div>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 12px' }}>
        Stripe-owned, ZAR-native, and supported for South African merchants (unlike Stripe itself).
        Same redirect-hosted checkout page as the Stripe option above — this app never handles card
        details directly. Only one secret key is needed: Paystack uses it both to start a transaction
        and to sign its webhook, so there's no separate webhook secret to configure.
      </p>

      <StatusRow ok={providerIsPaystack}>
        <code>appointments.tokens.paymentProvider</code> is currently <strong>{providerIsPaystack ? '"paystack"' : `"${flag('appointments.tokens.paymentProvider') || 'none'}"`}</strong>
        {providerIsPaystack
          ? ' — Brokers see a real Buy Tokens checkout on the Appointments page.'
          : ' — Buy Tokens is disabled for Brokers until this is set to "paystack" in Feature Flags, even if the credential below is filled in.'}
      </StatusRow>

      {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}
      {saved && <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>✓ Paystack settings saved.</div>}

      <div style={s.formGroup}>
        <label style={s.formLabel}>Secret key</label>
        <input
          type="password"
          style={s.formInput}
          value={secretKey}
          onChange={e => setSecretKey(e.target.value)}
          placeholder={status?.secretKeySet ? `Set — ends ${status.secretKeyPreview}` : 'sk_test_… or sk_live_…'}
          autoComplete="off"
        />
        <div style={s.formHint}>
          From the Paystack Dashboard → Settings → API Keys &amp; Webhooks. Also set the webhook URL there to{' '}
          <code style={{ fontSize: '0.75rem' }}>{typeof window !== 'undefined' ? window.location.origin : ''}/api/appointments/tokens/webhook/paystack</code>.
          Leave the field above blank to keep the current key.
        </div>
      </div>

      <button style={s.primaryBtn} onClick={handleSave} disabled={saving || !secretKey.trim()}>
        {saving ? 'Saving…' : 'Save Paystack settings'}
      </button>
    </div>
  );
}

// ─── SMTP card ──────────────────────────────────────────────────────────────────
function SmtpCard({ status, onSaved }) {
  const { flag } = useFlags();
  const emailEnabled = flag('notifications.email.enabled');

  const [host, setHost]         = useState('');
  const [port, setPort]         = useState('');
  const [user, setUser]         = useState('');
  const [password, setPassword] = useState('');
  const [from, setFrom]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  // Non-secret fields (host/port/user/from) are returned in the clear by
  // GET — pre-fill them once the real status loads so a GlobalAdmin
  // editing, say, just the port doesn't have to retype the host too.
  useEffect(() => {
    if (!status) return;
    setHost(status.host ?? '');
    setPort(status.port ? String(status.port) : '');
    setUser(status.user ?? '');
    setFrom(status.from ?? '');
  }, [status]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const fields = { host: host.trim(), user: user.trim(), from: from.trim() };
      if (port.trim()) fields.port = Number(port);
      if (password.trim()) fields.password = password.trim();
      const updated = await integrationsApi.updateSmtp(fields);
      onSaved(updated);
      setPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save SMTP settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={s.cardTitle}>SMTP — notification email</div>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 12px' }}>
        Standard SMTP (via nodemailer) — works with Resend, a customer's own mail server, Microsoft 365's
        SMTP AUTH client submission, Google Workspace, or any other SMTP-capable provider. Falls back to the
        <code style={{ fontSize: '0.75rem' }}> SMTP_HOST</code>/<code style={{ fontSize: '0.75rem' }}>SMTP_USER</code>/
        <code style={{ fontSize: '0.75rem' }}> SMTP_PASSWORD</code> Vercel environment variables if nothing is saved here.
      </p>

      <StatusRow ok={emailEnabled}>
        <code>notifications.email.enabled</code> is currently <strong>{emailEnabled ? 'ON' : 'OFF'}</strong>
        {emailEnabled
          ? ' — notification emails send using whichever SMTP configuration is active (this page, or the environment variables as a fallback).'
          : ' — no notification emails send regardless of what\u2019s configured below. Turn this on in Feature Flags to activate email.'}
      </StatusRow>

      {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}
      {saved && <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>✓ SMTP settings saved.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Host</label>
          <input type="text" style={s.formInput} value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.resend.com" />
        </div>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Port</label>
          <input type="number" style={s.formInput} value={port} onChange={e => setPort(e.target.value)} placeholder="587" />
        </div>
      </div>

      <div style={s.formGroup}>
        <label style={s.formLabel}>Username</label>
        <input type="text" style={s.formInput} value={user} onChange={e => setUser(e.target.value)} placeholder="resend" autoComplete="off" />
        <div style={s.formHint}>Provider-specific — for Resend this is literally the string "resend", not an email address.</div>
      </div>

      <div style={s.formGroup}>
        <label style={s.formLabel}>Password / API key</label>
        <input
          type="password"
          style={s.formInput}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={status?.passwordSet ? `Set — ends ${status.passwordPreview}` : ''}
          autoComplete="off"
        />
        <div style={s.formHint}>Leave blank to keep the current password.</div>
      </div>

      <div style={s.formGroup}>
        <label style={s.formLabel}>From address</label>
        <input type="email" style={s.formInput} value={from} onChange={e => setFrom(e.target.value)} placeholder="notifications@yourdomain.com" />
        <div style={s.formHint}>Must be on a domain verified with whichever provider is configured, or sends will be rejected/spam-filtered.</div>
      </div>

      <button style={s.primaryBtn} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save SMTP settings'}
      </button>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function Integrations() {
  const { data, loading, error, refetch } = useFetch(() => integrationsApi.get(), []);

  const [stripeStatus, setStripeStatus]     = useState(null);
  const [paystackStatus, setPaystackStatus] = useState(null);
  const [smtpStatus, setSmtpStatus]         = useState(null);
  useEffect(() => {
    if (!data) return;
    setStripeStatus(data.stripe);
    setPaystackStatus(data.paystack);
    setSmtpStatus(data.smtp);
  }, [data]);

  return (
    <div style={{ ...s.page, maxWidth: '700px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.375rem', fontWeight: 600, color: 'var(--ink)' }}>Integrations</h1>
      <p style={{ color: 'var(--mut)', fontSize: '0.875rem', margin: '0 0 18px' }}>
        Stripe, Paystack, and SMTP credentials for this deployment — GlobalAdmin only. Stored encrypted,
        never shown again in the clear once saved.
      </p>

      {loading && <div style={{ ...s.noticeInfo, marginBottom: '18px' }}>Loading…</div>}
      {error && <div style={{ ...s.errorBox, marginBottom: '18px' }}>Could not load integration settings.</div>}

      {!loading && !error && (
        <>
          <StripeCard status={stripeStatus} onSaved={async (updated) => { setStripeStatus(updated); await refetch(); }} />
          <PaystackCard status={paystackStatus} onSaved={async (updated) => { setPaystackStatus(updated); await refetch(); }} />
          <SmtpCard status={smtpStatus} onSaved={async (updated) => { setSmtpStatus(updated); await refetch(); }} />
        </>
      )}
    </div>
  );
}
