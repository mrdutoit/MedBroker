/**
 * api/src/services/leadService.tenant.integration.test.js
 *
 * Organisation-isolation guardrail for the multi-tenant-ready data layer.
 * Proves that a query scoped to one organisation cannot see another
 * organisation's rows — the regression test that would catch a missing
 * `WHERE organisationId = @organisationId` before it became a cross-tenant
 * data leak.
 *
 * THIS IS AN INTEGRATION TEST — it needs a real (test) database and therefore
 * does NOT run in the unit suite or the sandbox. It self-skips unless enabled,
 * so it never breaks `npm test`. It runs in CI / at deployment.
 *
 * To run:
 *   1. Deploy schema.sql (v2.4+) to a throwaway test database.
 *   2. Provide DB connection env (e.g. DB_SERVER, DB_NAME, and for local SQL
 *      DB_USE_PASSWORD=true + DB_USER + DB_PASSWORD; plus KEY_VAULT_URL,
 *      ENTRA_* as config.js requires).
 *   3. Set RUN_DB_TESTS=true and run `vitest run`.
 *
 * Deferred (see Status.md): listLeads / getLeadById / createLead isolation
 * checks are scaffolded as `todo` below because those code paths reference the
 * leadSource / assignedBrokerId columns that do not exist in schema v2.4
 * (pre-existing app-vs-schema drift). Enable them once that drift is resolved.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB-gated: only runs when a test database is explicitly wired up.
const RUN = process.env.RUN_DB_TESTS === 'true' && !!process.env.DB_SERVER;

// org A = this instance's default organisation (matches schema DF_*_Org + config default)
const DEFAULT_ORG = 'D0000000-0000-0000-0000-000000000001';
// org B = a foreign tenant seeded only for this test
const OTHER_ORG = 'D0000000-0000-0000-0000-0000000000B2';

describe.skipIf(!RUN)('lead data layer — organisation isolation (integration)', () => {
  let db;
  let sql;
  let leadService;
  const foreignEmail = `iso-foreign-${Date.now()}@example.test`;

  beforeAll(async () => {
    // Dynamic import so config.js (which requires DB env) only loads when RUN.
    db = await import('./db.js');
    sql = db.sql;
    leadService = await import('./leadService.js');

    // Seed a foreign organisation and one lead that belongs to it.
    await db.executeQuery(
      `IF NOT EXISTS (SELECT 1 FROM Organisation WHERE id = @id)
         INSERT INTO Organisation (id, name, code) VALUES (@id, 'Isolation Test Org B', 'iso-test-b')`,
      { id: { type: sql.UniqueIdentifier, value: OTHER_ORG } }
    );
    await db.executeQuery(
      `INSERT INTO Lead (id, organisationId, firstName, lastName, email)
       VALUES (NEWID(), @org, 'Foreign', 'Tenant', @email)`,
      {
        org:   { type: sql.UniqueIdentifier, value: OTHER_ORG },
        email: { type: sql.NVarChar(255),     value: foreignEmail },
      }
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.executeQuery(
      `DELETE FROM Lead WHERE email = @email OR organisationId = @org`,
      {
        email: { type: sql.NVarChar(255),   value: foreignEmail },
        org:   { type: sql.UniqueIdentifier, value: OTHER_ORG },
      }
    );
    await db.executeQuery(
      `DELETE FROM Organisation WHERE id = @org`,
      { org: { type: sql.UniqueIdentifier, value: OTHER_ORG } }
    );
  });

  it('findDuplicate cannot see a foreign organisation\'s lead (cross-org dedup blocked)', async () => {
    // The service is configured for org A; the only lead with this email is org B's.
    const hit = await leadService.findDuplicate(foreignEmail, null);
    expect(hit).toBeNull();
  });

  it('findDuplicate matches within the current organisation only', async () => {
    // Seed a lead with the SAME email under org A (raw insert avoids the
    // createLead drift). findDuplicate must now return THIS lead, not org B's.
    const localId = (await db.executeQueryOne(
      `INSERT INTO Lead (id, organisationId, firstName, lastName, email)
       OUTPUT INSERTED.id AS id
       VALUES (NEWID(), @org, 'Local', 'Tenant', @email)`,
      {
        org:   { type: sql.UniqueIdentifier, value: DEFAULT_ORG },
        email: { type: sql.NVarChar(255),     value: foreignEmail },
      }
    )).id;

    const hit = await leadService.findDuplicate(foreignEmail, null);
    expect(String(hit).toLowerCase()).toBe(String(localId).toLowerCase());

    await db.executeQuery(`DELETE FROM Lead WHERE id = @id`,
      { id: { type: sql.UniqueIdentifier, value: localId } });
  });

  it('the foreign organisation\'s lead is left untouched', async () => {
    const row = await db.executeQueryOne(
      `SELECT organisationId FROM Lead WHERE email = @email AND organisationId = @org`,
      {
        email: { type: sql.NVarChar(255),     value: foreignEmail },
        org:   { type: sql.UniqueIdentifier, value: OTHER_ORG },
      }
    );
    expect(row).not.toBeNull();
  });

  // Enable once the leadSource / assignedBrokerId schema drift is resolved:
  it.todo('listLeads excludes foreign-organisation rows');
  it.todo('getLeadById returns null for a foreign-organisation lead id');
  it.todo('createLead writes the current organisationId and dedups within-org');
});
