/**
 * services/userService.js — NEW, does not exist in the Azure repo.
 *
 * Status.md (18 June session) documents Supervisor team-scoping and isActive
 * enforcement as already fixed on the Leads domain (A1/A3 in the security
 * review). Reading the hydrated GitHub source for this port, neither fix is
 * actually present in functions/leads.js, services/leadService.js, or
 * middleware/auth.js — no isDirectReport()/getActiveUserById() helper exists
 * anywhere in the repo. Flagging this discrepancy rather than silently
 * reproducing the (missing) fix — see DEMO_NOTES.md.
 *
 * This file implements the pattern exactly as Status.md specifies it, since
 * the spec itself is clear and already reviewed; only the code was missing.
 * When lift-and-shift happens, port this file to Azure alongside leadService.js.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';

/**
 * Fetch a user by id, but only if active and not soft-deleted, and scoped to
 * the current organisation. Used to validate an assignment target (A2) and,
 * by the demo auth shim, to reject deactivated users at the auth layer (A3).
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getActiveUserById(id) {
  return executeQueryOne(
    `SELECT id, displayName AS "displayName", email, role,
            supervisorId AS "supervisorId", isActive AS "isActive"
     FROM "User"
     WHERE id = @id AND isActive = TRUE AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * All active, non-deleted direct-report user ids for a supervisor.
 * Used to scope Supervisor (without Admin) to their team plus unassigned
 * records — the A1 finding: "Supervisor must never get unrestricted
 * org-wide access."
 * @param {string} supervisorId
 * @returns {Promise<string[]>}
 */
export async function getDirectReportIds(supervisorId) {
  const rows = await executeQuery(
    `SELECT id FROM "User"
     WHERE supervisorId = @supervisorId AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      supervisorId:   { type: sql.UniqueIdentifier, value: supervisorId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return rows.map((r) => r.id);
}

/**
 * True if role list represents a Supervisor without also holding Admin.
 * Admin already has org-wide access; Supervisor-only is the scoped role.
 * @param {string[]} roles
 */
export function isSupervisorOnly(roles) {
  return (roles ?? []).includes('Supervisor') && !roles.includes('Admin') && !roles.includes('GlobalAdmin');
}

/**
 * True if role list represents an Agent without Supervisor/Admin.
 * @param {string[]} roles
 */
export function isAgentOnly(roles) {
  return (roles ?? []).includes('Agent') && !roles.includes('Supervisor') && !roles.includes('Admin');
}

// ── Local auth support — NEW, added alongside services/authService.js ──────

/**
 * Fetch a user by email for login purposes — includes passwordHash and the
 * lockout/rotation fields the login route needs to evaluate. Not used by
 * anything else; getActiveUserById() above stays the general-purpose lookup
 * and deliberately never returns passwordHash.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function getUserByEmailForLogin(email) {
  return executeQueryOne(
    `SELECT id, displayName AS "displayName", email, role,
            passwordHash AS "passwordHash", passwordSetAt AS "passwordSetAt",
            passwordMustChange AS "passwordMustChange",
            failedLoginAttempts AS "failedLoginAttempts", isLocked AS "isLocked",
            isActive AS "isActive"
     FROM "User"
     WHERE email = @email AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      email:          { type: sql.NVarChar(255), value: email },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Reset the failed-login counter after a successful login.
 * @param {string} userId
 */
export async function recordLoginSuccess(userId) {
  await executeQuery(
    `UPDATE "User" SET failedLoginAttempts = 0, updatedAt = NOW() WHERE id = @id`,
    { id: { type: sql.UniqueIdentifier, value: userId } }
  );
}

/**
 * Increment the failed-login counter and lock the account if it reaches the
 * configured threshold. threshold = 0 means lockout is disabled.
 * @param {string} userId
 * @param {number} threshold
 * @returns {Promise<{ failedLoginAttempts: number, isLocked: boolean }>}
 */
export async function recordLoginFailure(userId, threshold) {
  const row = await executeQueryOne(
    `UPDATE "User"
     SET failedLoginAttempts = failedLoginAttempts + 1, updatedAt = NOW()
     WHERE id = @id
     RETURNING failedLoginAttempts AS "failedLoginAttempts"`,
    { id: { type: sql.UniqueIdentifier, value: userId } }
  );

  const failedLoginAttempts = row?.failedLoginAttempts ?? 0;
  const shouldLock = threshold > 0 && failedLoginAttempts >= threshold;

  if (shouldLock) {
    await executeQuery(
      `UPDATE "User" SET isLocked = TRUE, updatedAt = NOW() WHERE id = @id`,
      { id: { type: sql.UniqueIdentifier, value: userId } }
    );
  }

  return { failedLoginAttempts, isLocked: shouldLock };
}

/**
 * Admin action — clear a lockout without touching the password.
 * @param {string} userId
 */
export async function unlockUser(userId) {
  await executeQuery(
    `UPDATE "User" SET isLocked = FALSE, failedLoginAttempts = 0, updatedAt = NOW() WHERE id = @id`,
    { id: { type: sql.UniqueIdentifier, value: userId } }
  );
}

/**
 * How many active GlobalAdmin users exist — used to gate the one-time
 * bootstrap endpoint (only usable when this is zero).
 * @returns {Promise<number>}
 */
export async function countActiveGlobalAdmins() {
  const rows = await executeQuery(
    `SELECT COUNT(*) AS "count" FROM "User"
     WHERE role = 'GlobalAdmin' AND isActive = TRUE AND deletedAt IS NULL AND organisationId = @organisationId`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Create a local-auth (standalone email/password) user. Used by the
 * bootstrap-admin route now; the general "create user under User Management"
 * flow (Users API) will call this too once built — not yet built, see
 * DEMO_NOTES.md.
 * @param {Object} data
 * @param {string} data.displayName
 * @param {string} data.email
 * @param {string} data.role
 * @param {string} data.passwordHash - already hashed, this function never hashes
 * @param {boolean} [data.passwordMustChange]
 * @returns {Promise<string>} new user id
 */
export async function createLocalUser({ displayName, email, role, passwordHash, passwordMustChange = false }) {
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO "User" (id, organisationId, displayName, email, role, passwordHash, passwordSetAt, passwordMustChange, isActive)
     VALUES (@id, @organisationId, @displayName, @email, @role, @passwordHash, NOW(), @passwordMustChange, TRUE)`,
    {
      id:                 { type: sql.UniqueIdentifier, value: newId },
      organisationId:     { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      displayName:        { type: sql.NVarChar(200),    value: displayName },
      email:              { type: sql.NVarChar(255),    value: email },
      role:               { type: sql.NVarChar(50),     value: role },
      passwordHash:       { type: sql.NVarChar(sql.MAX), value: passwordHash },
      passwordMustChange: { type: sql.Bit,              value: passwordMustChange },
    }
  );
  return newId;
}
