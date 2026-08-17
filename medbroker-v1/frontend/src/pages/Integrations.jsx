/**
 * pages/Integrations.jsx — NEW, §134 (6 Aug 2026). EXTENDED §135
 * (7 Aug 2026) with a Paystack card. REWORKED §136 (7 Aug 2026) —
 * cards are now shown ONLY for whichever integration is actually
 * active per Feature Flags, not all three unconditionally.
 * App Admin → Integrations. Stripe, Paystack (both — token purchase
 * checkout/webhook) and SMTP (notification email) credentials,
 * GlobalAdmin only both directions — route-gated in App.jsx the same way
 * FeatureFlags.jsx is, not just an internal check on this page.
 *
 * CONDITIONAL VISIBILITY — §136. Originally all three cards always
 * rendered, each with its own "is this actually active?" status banner.
 * Mark's own testing feedback: turning on only Paystack still showed
 * Stripe's (and SMTP's) full credential forms too, which reads as a
 * confusing free-for-all rather than "here's what's actually live."
 * Now: the payment-provider section shows EXACTLY ONE of the Stripe
 * card, the Paystack card, or a neutral "nothing selected yet" notice
 * — whichever matches appointments.tokens.paymentProvider's live value
 * — and the SMTP card only appears when notifications.email.enabled is
 * on (otherwise a neutral notice, same pattern). This is a display
 * decision only, not a data one: hiding a card never clears or touches
 * its stored credentials (IntegrationCredential rows are independent of
 * FeatureFlag rows) — flipping the flag back later brings the same
 * card straight back with whatever was saved still in place, which the
 * neutral notices below say explicitly so switching providers doesn't
 * read as "did I just lose my Paystack setup?"
 *
 * TRADE-OFF WORTH KNOWING — deliberately not raised as a blocking
 * question, since it's cheap to revisit either way: this makes it
 * impossible to PRE-STAGE a provider's credentials before switching the
 * flag over to it — the card simply isn't there to fill in until the
 * flag already points at it. In practice this is low-risk (nothing
 * public depends on a provider until its flag is live, and the
 * checkout endpoint's own "not configured yet" error is clean, not a
 * crash, for whatever brief window exists between flipping the flag and
 * finishing the form), but it's a real ordering constraint this design
 * accepts in exchange for the page always matching what's actually live.
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
import { Link } from 'react-router';
import { useFlags } from '../context/FlagContext.jsx';
import { integrationsApi, ApiError } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
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

// §136 — shown in place of a payment provider's card when neither Stripe
// nor Paystack is the live selection, so the page never reads as a dead
// end. Names whether a provider already has saved credentials (from the
// GET status, not guessed) precisely to answer "will I lose my setup if
// I switch back later?" before anyone has to wonder.
function NoPaymentProviderNotice({ stripeConfigured, paystackConfigured }) {
  return (
    <div style={{ ...s.card, marginBottom: '18px' }}>
      <div style={s.cardTitle}>Token purchase checkout</div>
      <StatusRow ok={false}>
        <code>appointments.tokens.paymentProvider</code> is currently <strong>"none"</strong> — Buy Tokens
        is disabled for Brokers, and neither provider's settings are shown here until one is selected.
      </StatusRow>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 6px' }}>
        Set it to <strong>"stripe"</strong> or <strong>"paystack"</strong> in{' '}
        <Link to="/admin/flags" style={{ color: 'var(--accent)' }}>Feature Flags</Link> to configure that
        provider's credentials here. Stripe: <strong>{stripeConfigured ? 'credentials already saved' : 'not configured'}</strong>.
        Paystack: <strong>{paystackConfigured ? 'credentials already saved' : 'not configured'}</strong>. Switching the flag
        never clears a saved credential — whichever provider you pick reappears with what was last saved.
      </p>
    </div>
  );
}

// §136 — same pattern as NoPaymentProviderNotice, for SMTP.
function EmailDisabledNotice({ smtpConfigured }) {
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>SMTP — notification email</div>
      <StatusRow ok={false}>
        <code>notifications.email.enabled</code> is currently <strong>OFF</strong> — no notification emails
        send, and SMTP settings aren't shown here until this is turned on.
      </StatusRow>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 6px' }}>
        Turn it on in <Link to="/admin/flags" style={{ color: 'var(--accent)' }}>Feature Flags</Link> to configure SMTP
        here. Current state: <strong>{smtpConfigured ? 'credentials already saved' : 'not configured'}</strong> — turning
        the flag on never clears a saved credential.
      </p>
    </div>
  );
}

// ─── Stripe card ────────────────────────────────────────────────────────────────
// §136 — only ever rendered when appointments.tokens.paymentProvider is
// actually 'stripe' (see the Page component below), so the "is this
// active?" question this card's own StatusRow used to have to answer
// both ways no longer applies — it's always active whenever this is on
// screen at all. The banner stays, simplified to just confirm that.
function StripeCard({ status, onSaved }) {
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

      <StatusRow ok={true}>
        <code>appointments.tokens.paymentProvider</code> is currently <strong>"stripe"</strong> — Brokers see a
        real Buy Tokens checkout on the Appointments page.
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
// paystackService.js's own header). §136 — only ever rendered when the
// flag is actually 'paystack' — see StripeCard's own comment above for
// why the StatusRow no longer needs to handle the "not active" case.
function PaystackCard({ status, onSaved }) {
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

      <StatusRow ok={true}>
        <code>appointments.tokens.paymentProvider</code> is currently <strong>"paystack"</strong> — Brokers see a
        real Buy Tokens checkout on the Appointments page.
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
// §136 — only ever rendered when notifications.email.enabled is on — see
// StripeCard's own comment above for why the StatusRow no longer needs
// to handle the "not active" case.
function SmtpCard({ status, onSaved }) {
  const { isMobile } = useWindowSize();
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

      <StatusRow ok={true}>
        <code>notifications.email.enabled</code> is currently <strong>ON</strong> — notification emails send using
        whichever SMTP configuration is active (this page, or the environment variables as a fallback).
      </StatusRow>

      {error && <div style={{ ...s.errorBox, marginBottom: '12px' }}>{error}</div>}
      {saved && <div style={{ ...s.noticeSuccess, marginBottom: '12px' }}>✓ SMTP settings saved.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '12px' }}>
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
  const { isMobile } = useWindowSize();
  const { data, loading, error, refetch } = useFetch(() => integrationsApi.get(), []);
  const { flag } = useFlags();
  const paymentProvider = flag('appointments.tokens.paymentProvider') || 'none';
  const emailEnabled    = flag('notifications.email.enabled');

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
    <div style={{ ...s.page, maxWidth: '700px', padding: isMobile ? '12px' : '24px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.375rem', fontWeight: 600, color: 'var(--ink)' }}>Integrations</h1>
      <p style={{ color: 'var(--mut)', fontSize: '0.875rem', margin: '0 0 18px' }}>
        Credentials for this deployment's active integrations only — GlobalAdmin only. Stored encrypted,
        never shown again in the clear once saved. What shows here follows{' '}
        <Link to="/admin/flags" style={{ color: 'var(--accent)' }}>Feature Flags</Link>, not the other way
        around — switch a flag there to bring up (or hide) the matching card.
      </p>

      {loading && <div style={{ ...s.noticeInfo, marginBottom: '18px' }}>Loading…</div>}
      {error && <div style={{ ...s.errorBox, marginBottom: '18px' }}>Could not load integration settings.</div>}

      {!loading && !error && (
        <>
          {paymentProvider === 'stripe' && (
            <StripeCard status={stripeStatus} onSaved={async (updated) => { setStripeStatus(updated); await refetch(); }} />
          )}
          {paymentProvider === 'paystack' && (
            <PaystackCard status={paystackStatus} onSaved={async (updated) => { setPaystackStatus(updated); await refetch(); }} />
          )}
          {paymentProvider === 'none' && (
            <NoPaymentProviderNotice stripeConfigured={stripeStatus?.configured} paystackConfigured={paystackStatus?.configured} />
          )}

          {emailEnabled
            ? <SmtpCard status={smtpStatus} onSaved={async (updated) => { setSmtpStatus(updated); await refetch(); }} />
            : <EmailDisabledNotice smtpConfigured={smtpStatus?.configured} />}
        </>
      )}
    </div>
  );
}
