/**
 * services/emailService.js — NEW (§78).
 * Deliberately built on STANDARD SMTP (via nodemailer), not any
 * provider's proprietary REST API — Mark's own requirement: whatever
 * this is built on needs to be swappable later for a customer's own
 * mail server or Microsoft 365, without a rewrite. Every SMTP-capable
 * provider (Resend, a customer's own mail server, M365's SMTP AUTH
 * client submission on smtp.office365.com:587, Google Workspace, etc.)
 * speaks the identical protocol — swapping providers is purely an
 * environment-variable change (SMTP_HOST/PORT/USER/PASSWORD), never a
 * code change. This file has zero knowledge of Resend, M365, or any
 * other specific provider — it only knows "SMTP", on purpose.
 *
 * Free tier being targeted right now: Resend, 3,000 emails/month, 100/
 * day, one verified domain — confirmed current as of 31 Jul 2026. Well
 * above this app's real notification volume to start. Get SMTP
 * credentials from Resend's dashboard (Settings -> SMTP) once a domain
 * is verified there, or from whichever provider is actually configured
 * — this file doesn't care which.
 *
 * REQUIRED ENVIRONMENT VARIABLES (set in Vercel's project settings, not
 * committed to the repo — same as every other secret in this project):
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
 * If SMTP_HOST/SMTP_USER/SMTP_PASSWORD aren't set, sendEmail() throws —
 * callers (notificationService.js) catch this and treat it as "email
 * not configured yet", not a hard failure of whatever triggered it.
 */

import nodemailer from 'nodemailer';

// Cached at module scope, same pattern db.js already uses for its
// connection pool — avoids rebuilding the SMTP connection on every
// single call within the same warm Vercel function container.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('SMTP is not configured — set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in Vercel');
  }

  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS (upgraded in-connection) on 587/others
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return transporter;
}

/**
 * @param {{to: string, subject: string, text: string, html?: string}} params
 */
export async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, text, html: html ?? undefined });
}
