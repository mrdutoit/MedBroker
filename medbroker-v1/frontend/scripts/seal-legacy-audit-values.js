/**
 * scripts/seal-legacy-audit-values.js — 30 Sep 2026 (code-review fix S-I6).
 *
 * One-time, run-by-hand script. AuditLog rows written before the sealChange()
 * fix store sensitive Lead/Appointment field changes (idNumber, existingCover,
 * currentInsurer, policies, medicalAid, medicalAidProvider) as plaintext
 * { from, to }. This replaces each with { changed: true, sealed: <encrypted> }
 * so the real before/after stays traceable but is no longer readable at rest.
 *
 * Not run automatically by anything. stripSealed() already hides legacy
 * values from the UI/API/CSV regardless; this closes the gap at rest.
 *
 * USAGE:
 *   cd frontend
 *   node --env-file=.env scripts/seal-legacy-audit-values.js
 *   (DATABASE_URL, and the KMS_* / AWS_* vars if security.kmsEncryption.
 *   enabled is on, must be set — same requirements encrypt() always has.)
 *
 * Safe to run more than once — already-sealed entries are skipped.
 */

import { sealChange, SENSITIVE_LEAD_FIELDS } from '../api-lib/services/sensitiveFields.js';

/** Pure per-row transform. Returns { detail, changed }. */
export async function sealLegacyDetail(detail) {
  if (!detail || typeof detail !== 'object') return { detail, changed: false };
  const out = { ...detail };
  let changed = false;
  for (const field of SENSITIVE_LEAD_FIELDS) {
    const c = detail[field];
    if (c && typeof c === 'object' && !c.sealed && ('from' in c || 'to' in c)) {
      out[field] = await sealChange(field, c);
      changed = true;
    }
  }
  return { detail: out, changed };
}

async function main() {
  const { executeQuery, sql } = await import('../api-lib/services/db.js');
  const rows = await executeQuery(
    `SELECT id, changeDetail AS "changeDetail" FROM AuditLog
     WHERE action IN ('LeadUpdated', 'AppointmentUpdated')`,
    {}
  );
  let done = 0;
  for (const row of rows) {
    if (!row.changeDetail) continue;
    const { detail, changed } = await sealLegacyDetail(JSON.parse(row.changeDetail));
    if (!changed) continue;
    await executeQuery(
      `UPDATE AuditLog SET changeDetail = @changeDetail WHERE id = @id`,
      {
        id:           { type: sql.UniqueIdentifier, value: row.id },
        changeDetail: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(detail) },
      }
    );
    done += 1;
  }
  console.log(`Sealed ${done} of ${rows.length} audit row(s).`);
}

// Only run when invoked directly, so tests can import sealLegacyDetail.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('Seal failed:', err); process.exit(1); });
}
