/**
 * api-lib/services/schemaConstraints.test.js
 * 30 Sep 2026 — checks db/schema.postgres.sql for the EventAttendee uniqueness
 * rule: no full UNIQUE (eventId, leadId) constraint, and a partial unique
 * index WHERE deletedAt IS NULL instead. Text-level check only; it does not
 * run SQL.
 * 1 Oct 2026 — migration 039 itself is run by hand on Neon and then removed
 * from the repo (the project's standing pattern for migrations), so this test
 * checks the schema of record only.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, '../../db/schema.postgres.sql'), 'utf8');

const PARTIAL_INDEX =
  /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+UQ_EventAttendee_active\s+ON\s+EventAttendee\s*\(\s*eventId\s*,\s*leadId\s*\)\s+WHERE\s+deletedAt\s+IS\s+NULL/i;

describe('EventAttendee uniqueness (schema of record)', () => {
  it('schema has no full UQ_EventAttendee UNIQUE constraint', () => {
    expect(schema).not.toMatch(/CONSTRAINT\s+UQ_EventAttendee\s+UNIQUE/i);
  });

  it('schema has the partial unique index WHERE deletedAt IS NULL', () => {
    expect(schema).toMatch(PARTIAL_INDEX);
  });
});
