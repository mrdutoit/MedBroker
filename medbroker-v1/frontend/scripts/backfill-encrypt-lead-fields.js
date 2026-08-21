/**
 * scripts/backfill-encrypt-lead-fields.js — §12a/F1 (20 Aug 2026).
 *
 * One-time backfill for migration 036. Encrypts any existing plaintext
 * value in Lead.existingCover / currentInsurer / policies / medicalAid /
 * medicalAidProvider into the new *Encrypted columns, then nulls the
 * plaintext column — per row, in a single UPDATE, so a row is never left
 * with the new column populated and the old one still holding the real
 * value (or vice versa) if this script is interrupted partway through.
 *
 * Not run automatically by anything — migration 036 deliberately leaves
 * the plaintext columns in place rather than dropping them, and nothing
 * in the app requires this script to have run (createLead()/updateLead()
 * only ever write the new encrypted columns going forward; getLeadById()
 * and every other read path only ever reads them). This closes the gap
 * for whatever data already existed before this delivery — run it once,
 * after migration 036, before treating existing Leads' medical/insurance
 * data as actually encrypted at rest.
 *
 * Given this project's current stage (client parking the build until
 * Feb 2027, pre-launch — Project_Context_Vercel.md's own "go-live gate"
 * framing) there is unlikely to be real client PI in Neon yet, only
 * test/demo data. Run this regardless before go-live — don't assume
 * based on that alone.
 *
 * USAGE:
 *   cd frontend
 *   node --env-file=.env scripts/backfill-encrypt-lead-fields.js
 *   (or otherwise ensure DATABASE_URL and, if security.kmsEncryption.
 *   enabled is on, the KMS_* / AWS_* env vars are set in the shell
 *   before running — same requirements encrypt() always has.)
 *
 * Safe to run more than once — a row with NULL in every plaintext
 * column (already backfilled, or never had a value) is a no-op.
 */

import { executeQuery, sql } from '../api-lib/services/db.js';
import { encrypt, encryptBoolean } from '../api-lib/services/encryption.js';

async function main() {
  const rows = await executeQuery(
    `SELECT id, organisationId AS "organisationId",
            existingCover AS "existingCover", currentInsurer AS "currentInsurer",
            policies, medicalAid AS "medicalAid", medicalAidProvider AS "medicalAidProvider"
     FROM Lead
     WHERE existingCover IS NOT NULL OR currentInsurer IS NOT NULL OR policies IS NOT NULL
        OR medicalAid IS NOT NULL OR medicalAidProvider IS NOT NULL`,
    {}
  );

  console.log(`Found ${rows.length} Lead row(s) with plaintext medical/insurance data to backfill.`);

  let done = 0;
  for (const row of rows) {
    const existingCoverEncrypted = await encryptBoolean(row.existingCover);
    const currentInsurerEncrypted = row.currentInsurer ? await encrypt(row.currentInsurer) : null;
    const policiesEncrypted = row.policies ? await encrypt(row.policies) : null;
    const medicalAidEncrypted = await encryptBoolean(row.medicalAid);
    const medicalAidProviderEncrypted = row.medicalAidProvider ? await encrypt(row.medicalAidProvider) : null;

    await executeQuery(
      `UPDATE Lead SET
         existingCoverEncrypted = @existingCoverEncrypted,
         currentInsurerEncrypted = @currentInsurerEncrypted,
         policiesEncrypted = @policiesEncrypted,
         medicalAidEncrypted = @medicalAidEncrypted,
         medicalAidProviderEncrypted = @medicalAidProviderEncrypted,
         existingCover = NULL,
         currentInsurer = NULL,
         policies = NULL,
         medicalAid = NULL,
         medicalAidProvider = NULL
       WHERE id = @id AND organisationId = @organisationId`,
      {
        id:                          { type: sql.UniqueIdentifier, value: row.id },
        organisationId:              { type: sql.UniqueIdentifier, value: row.organisationId },
        existingCoverEncrypted:      { type: sql.NVarChar(sql.MAX), value: existingCoverEncrypted },
        currentInsurerEncrypted:     { type: sql.NVarChar(sql.MAX), value: currentInsurerEncrypted },
        policiesEncrypted:           { type: sql.NVarChar(sql.MAX), value: policiesEncrypted },
        medicalAidEncrypted:         { type: sql.NVarChar(sql.MAX), value: medicalAidEncrypted },
        medicalAidProviderEncrypted: { type: sql.NVarChar(sql.MAX), value: medicalAidProviderEncrypted },
      }
    );
    done += 1;
  }

  console.log(`Backfilled ${done} row(s). Plaintext columns are now NULL on every row this script touched.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
