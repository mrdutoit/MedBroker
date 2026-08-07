/**
 * services/emailService.js — NEW (§78). UPDATED §134 (6 Aug 2026) — SMTP
 * credentials now come from the DB-backed Integrations page
 * (IntegrationCredential, via integrationCredentialService.js) FIRST,
 * falling back to the original SMTP_* environment variables if nothing's
 * been saved there yet. This is a pure precedence change, not a breaking
 * one — a deployment that never touches the Integrations page keeps
 * working exactly as before, reading env vars, same as every day since
 * §78. The transporter cache below was dropped as part of this change —
 * see its own comment for why.
 *
 * Deliberately built on STANDARD SMTP (via nodemailer), not any
 * provider's proprietary REST API — Mark's own requirement: whatever
 * this is built on needs to be swappable later for a customer's own
 * mail server or Microsoft 365, without a rewrite. Every SMTP-capable
 * provider (Resend, a customer's own mail server, M365's SMTP AUTH
 * client submission on smtp.office365.com:587, Google Workspace, etc.)
 * speaks the identical protocol — swapping providers is purely a
 * settings change now (Integrations page, or still the env vars below as
 * a fallback), never a code change. This file has zero knowledge of
 * Resend, M365, or any other specific provider — it only knows "SMTP",
 * on purpose.
 *
 * Free tier being targeted right now: Resend, 3,000 emails/month, 100/
 * day, one verified domain — confirmed current as of 31 Jul 2026. Well
 * above this app's real notification volume to start. Get SMTP
 * credentials from Resend's dashboard (Settings -> SMTP) once a domain
 * is verified there, or from whichever provider is actually configured
 * — this file doesn't care which.
 *
 * FALLBACK ENVIRONMENT VARIABLES (only read if the Integrations page has
 * nothing saved for 'smtp' yet — set in Vercel's project settings, not
 * committed to the repo, same as every other secret in this project):
 *   SMTP_HOST      e.g. smtp.resend.com
 *   SMTP_PORT      587 (STARTTLS) is the safe default; 465 (implicit
 *                  TLS) also works if a provider requires it
 *   SMTP_USER      provider-specific — for Resend this is literally the
 *                  string "resend", not an email address
 *   SMTP_PASSWORD  the actual API key / SMTP password
 *   SMTP_FROM      the From address notifications should appear to
 *                  come from — must be on a domain verified with
 *                  whichever provider is configured, or sends will be
 *                  rejected/spam-filtered
 * If neither the DB config nor SMTP_HOST/SMTP_USER/SMTP_PASSWORD are
 * set, sendEmail() throws — callers (notificationService.js) catch this
 * and treat it as "email not configured yet", not a hard failure of
 * whatever triggered it.
 */

import nodemailer from 'nodemailer';
import { getRawConfig } from './integrationCredentialService.js';

// NOTE: the module-scope transporter cache §78 originally had here was
// dropped in this update. That cache was safe only because SMTP
// credentials were env vars — fixed for the lifetime of a warm function
// container. Now that they can change at any time via the Integrations
// page, a cached transporter would keep using a stale (possibly rotated
// or revoked) credential until the container happened to cold-start.
// nodemailer.createTransport() itself is cheap (no connection made until
// sendMail() actually runs), so rebuilding it per call costs nothing
// meaningful — Resend/M365/etc.'s own SMTP connection setup dominates
// either way.
async function getTransporterConfig() {
  const dbConfig = await getRawConfig('smtp');
  if (dbConfig?.host && dbConfig?.user && dbConfig?.password) {
    return {
      host: dbConfig.host,
      port: Number(dbConfig.port) || 587,
      user: dbConfig.user,
      password: dbConfig.password,
      from: dbConfig.from || dbConfig.user,
    };
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASSWORD) {
    return {
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      user: SMTP_USER,
      password: SMTP_PASSWORD,
      from: SMTP_FROM || SMTP_USER,
    };
  }

  throw new Error('SMTP is not configured — set it on the Integrations page (App Admin → Integrations), or SMTP_HOST/SMTP_USER/SMTP_PASSWORD in Vercel');
}

/**
 * @param {{to: string, subject: string, text: string, html?: string}} params
 */
export async function sendEmail({ to, subject, text, html }) {
  const { host, port, user, password, from } = await getTransporterConfig();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS (upgraded in-connection) on 587/others
    auth: { user, pass: password },
  });

  await transporter.sendMail({ from, to, subject, text, html: html ?? undefined });
}
