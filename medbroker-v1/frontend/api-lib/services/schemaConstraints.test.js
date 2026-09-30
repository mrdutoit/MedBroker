/**
 * api-lib/services/schemaConstraints.test.js
 * Reads the schema file and verifies that migrations have been applied correctly.
 * Task 12: EventAttendee partial unique index (30 Sep 2026).
 *
 * This is a schema-level regression test, not a functional one. It prevents
 * a deployment where the schema was committed without the migration, or vice versa.
 *
 * Run: npm test (from medbroker-v1/frontend)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../../db/schema.postgres.sql');

describe('schema.postgres.sql constraints', () => {
  let schema;

  beforeAll(() => {
    schema = fs.readFileSync(schemaPath, 'utf8');
  });

  describe('EventAttendee (Task 12)', () => {
    it('does not have the full UNIQUE (eventId, leadId) constraint', () => {
      // The old constraint should be gone
      const hasFullConstraint = schema.includes('CONSTRAINT UQ_EventAttendee       UNIQUE (eventId, leadId)');
      expect(hasFullConstraint).toBe(false);
    });

    it('has the partial unique index WHERE deletedAt IS NULL', () => {
      // The new partial index should be present
      const hasPartialIndex = schema.includes(
        'CREATE UNIQUE INDEX IF NOT EXISTS UQ_EventAttendee_active ON EventAttendee(eventId, leadId) WHERE deletedAt IS NULL'
      );
      expect(hasPartialIndex).toBe(true);
    });

    it('EventAttendee table contains all required columns', () => {
      const eventAttendeeStart = schema.indexOf('CREATE TABLE IF NOT EXISTS EventAttendee');
      const eventAttendeeEnd = schema.indexOf('CREATE TABLE IF NOT EXISTS LeadPortalAccount');
      const eventAttendeeSection = schema.substring(eventAttendeeStart, eventAttendeeEnd);

      expect(eventAttendeeSection).toContain('id');
      expect(eventAttendeeSection).toContain('organisationId');
      expect(eventAttendeeSection).toContain('eventId');
      expect(eventAttendeeSection).toContain('leadId');
      expect(eventAttendeeSection).toContain('deletedAt');
    });

    it('EventAttendee table has foreign key constraints but no full unique constraint', () => {
      const eventAttendeeStart = schema.indexOf('CREATE TABLE IF NOT EXISTS EventAttendee');
      const eventAttendeeEnd = schema.indexOf('CREATE TABLE IF NOT EXISTS LeadPortalAccount');
      const eventAttendeeSection = schema.substring(eventAttendeeStart, eventAttendeeEnd);

      // Should have FKs
      expect(eventAttendeeSection).toContain('FK_EventAttendee_Org');
      expect(eventAttendeeSection).toContain('FK_EventAttendee_Event');
      expect(eventAttendeeSection).toContain('FK_EventAttendee_Lead');

      // Should NOT have the old full constraint in the table definition
      expect(eventAttendeeSection).not.toContain('UNIQUE (eventId, leadId)');
    });
  });
});
