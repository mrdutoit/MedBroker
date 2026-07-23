/**
 * services/userService.js — NEW, does not exist in the Azure repo.
 *
 * Status.md (18 June session) documents Supervisor team-scoping and isActive
 * enforcement as already fixed on the Leads domain (A1/A3 in the security
 * review). Reading the hydrated GitHub source for this port, neither fix is
 * actually present in functions/leads.js, services/leadService.js, or
 * middleware/auth.js — no isDirectReport()/getActiveUserById() helper exists
 * anywhere in the repo. Flagging this discrepancy rather than silently
 * reproducing the (missing) fix — see VERCEL_NOTES.md.
 *
 * This file implements the pattern exactly as Status.md specifies it, since
 * the spec itself is clear and already reviewed; only the code was missing.
 * When lift-and-shift happens, port this file to Azure alongside leadService.js.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';
import { hashPassword } from './authService.js';

const USER_LIST_SELECT = `
  u.id, u.displayName AS "displayName", u.email, u.role, u.region,
  u.isActive AS "isActive", u.supervisorId AS "supervisorId",
  sup.displayName AS "supervisorName",
  COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS "portfolios",
  COALESCE(array_agg(DISTINCT prod.name) FILTER (WHERE prod.name IS NOT NULL), ARRAY[]::text[]) AS "products"`;

const USER_LIST_JOINS = `
  FROM "User" u
  LEFT JOIN "User" sup       ON u.supervisorId = sup.id
  LEFT JOIN UserPortfolio up ON up.userId = u.id
  LEFT JOIN Portfolio p      ON up.portfolioId = p.id
  LEFT JOIN BrokerProduct bp ON bp.brokerId = u.id
  LEFT JOIN Product prod     ON bp.productId = prod.id`;

/**
 * List users for User Admin. Never includes GlobalAdmin (bootstrap-only,
 * matches UserAdmin.jsx's own ROLES constant which excludes it).
 * @param {{role?: string, search?: string}} filters
 */
export async function listUsers({ role, search } = {}) {
  let where = `u.deletedAt IS NULL AND u.organisationId = @organisationId AND u.role != 'GlobalAdmin'`;
  const params = { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } };

  if (role) {
    where += ' AND u.role = @role';
    params.role = { type: sql.NVarChar(50), value: role };
  }
  if (search) {
    where += ' AND (u.displayName ILIKE @search OR u.email ILIKE @search)';
    params.search = { type: sql.NVarChar(100), value: `%${search}%` };
  }

  return executeQuery(
    `SELECT ${USER_LIST_SELECT} ${USER_LIST_JOINS}
     WHERE ${where}
     GROUP BY u.id, sup.displayName
     ORDER BY u.displayName`,
    params
  );
}

/**
 * Single user, same shape as listUsers() — used to pre-fill the edit modal.
 * @param {string} id
 */
export async function getUserForAdmin(id) {
  return executeQueryOne(
    `SELECT ${USER_LIST_SELECT} ${USER_LIST_JOINS}
     WHERE u.id = @id AND u.deletedAt IS NULL AND u.organisationId = @organisationId
     GROUP BY u.id, sup.displayName`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Active supervisors for the "Supervisor" dropdown in the create/edit modal.
 */
export async function listSupervisors() {
  return executeQuery(
    `SELECT id, displayName AS "displayName" FROM "User"
     WHERE role = 'Supervisor' AND isActive = TRUE AND deletedAt IS NULL AND organisationId = @organisationId
     ORDER BY displayName`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * Resolve portfolio/product NAMES (what the frontend's checkboxes send) to
 * ids. Returns [] for an empty/missing input rather than querying with an
 * empty ANY() array, which is valid SQL but a wasted round trip.
 */
export async function resolvePortfolioIds(names) {
  if (!names || names.length === 0) return [];
  const rows = await executeQuery(
    `SELECT id FROM Portfolio WHERE name = ANY(@names)`,
    { names: { type: sql.NVarChar(sql.MAX), value: names } }
  );
  return rows.map((r) => r.id);
}

async function resolveProductIds(names) {
  if (!names || names.length === 0) return [];
  const rows = await executeQuery(
    `SELECT id FROM Product WHERE name = ANY(@names)`,
    { names: { type: sql.NVarChar(sql.MAX), value: names } }
  );
  return rows.map((r) => r.id);
}

// Replace-all pattern — simplest correct match for a checkbox UI where the
// full desired set is sent on every save, not an incremental diff.
async function syncUserPortfolios(userId, portfolioIds) {
  await executeQuery(`DELETE FROM UserPortfolio WHERE userId = @userId`, {
    userId: { type: sql.UniqueIdentifier, value: userId },
  });
  for (const portfolioId of portfolioIds) {
    await executeQuery(
      `INSERT INTO UserPortfolio (id, userId, portfolioId) VALUES (@id, @userId, @portfolioId)`,
      {
        id:          { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        userId:      { type: sql.UniqueIdentifier, value: userId },
        portfolioId: { type: sql.UniqueIdentifier, value: portfolioId },
      }
    );
  }
}

async function syncUserProducts(userId, productIds) {
  await executeQuery(`DELETE FROM BrokerProduct WHERE brokerId = @userId`, {
    userId: { type: sql.UniqueIdentifier, value: userId },
  });
  for (const productId of productIds) {
    await executeQuery(
      `INSERT INTO BrokerProduct (id, brokerId, productId) VALUES (@id, @userId, @productId)`,
      {
        id:        { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        userId:    { type: sql.UniqueIdentifier, value: userId },
        productId: { type: sql.UniqueIdentifier, value: productId },
      }
    );
  }
}

/**
 * Keeps BrokerRegion (a multi-region-capable junction table) in sync with
 * User.region (today's single-region UI field) for Broker-role users only.
 * Added alongside the Appointments build — brokerMatchingService.js's
 * region filter reads BrokerRegion, which nothing previously populated, so
 * no broker created via User Admin could ever actually match a lead. The
 * junction table itself is left multi-region-capable in the schema in case
 * a future UI wants to assign a broker to more than one region; this just
 * keeps it correctly mirroring the one region the current UI collects.
 * A no-op for any role other than Broker, or when region isn't set.
 */
async function syncBrokerRegion(userId, role, region) {
  if (role !== 'Broker') return;
  await executeQuery(`DELETE FROM BrokerRegion WHERE brokerId = @userId`, {
    userId: { type: sql.UniqueIdentifier, value: userId },
  });
  if (region) {
    await executeQuery(
      `INSERT INTO BrokerRegion (id, brokerId, region) VALUES (@id, @userId, @region)`,
      {
        id:     { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
        userId: { type: sql.UniqueIdentifier, value: userId },
        region: { type: sql.NVarChar(50),     value: region },
      }
    );
  }
}

/**
 * Create a user via User Admin — the full flow (region, supervisor,
 * portfolios, products, optional password), as opposed to createLocalUser()
 * above which is the minimal bootstrap-admin path.
 * @param {Object} data - validated CreateUserSchema data
 * @returns {Promise<string>} new user id
 */
export async function createUserFull(data) {
  const newId = crypto.randomUUID();
  const passwordHash = data.password ? await hashPassword(data.password) : null;

  await executeQuery(
    `INSERT INTO "User" (
       id, organisationId, displayName, email, role, region, supervisorId,
       passwordHash, passwordSetAt, isActive
     ) VALUES (
       @id, @organisationId, @displayName, @email, @role, @region, @supervisorId,
       @passwordHash, @passwordSetAt, TRUE
     )`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      displayName:    { type: sql.NVarChar(200),    value: data.displayName },
      email:          { type: sql.NVarChar(255),    value: data.email },
      role:           { type: sql.NVarChar(50),     value: data.role },
      region:         { type: sql.NVarChar(50),     value: data.region ?? null },
      supervisorId:   { type: sql.UniqueIdentifier, value: data.supervisorId ?? null },
      passwordHash:   { type: sql.NVarChar(sql.MAX), value: passwordHash },
      passwordSetAt:  { type: sql.DateTimeOffset,   value: passwordHash ? new Date() : null },
    }
  );

  const [portfolioIds, productIds] = await Promise.all([
    resolvePortfolioIds(data.portfolios),
    resolveProductIds(data.products),
  ]);
  await syncUserPortfolios(newId, portfolioIds);
  await syncUserProducts(newId, productIds);
  await syncBrokerRegion(newId, data.role, data.region);

  return newId;
}

/**
 * Update a user via User Admin. Only the fields present in `data` are
 * changed; portfolios/products are fully re-synced if provided at all
 * (matches the edit modal always sending its full current checkbox state).
 * @param {string} id
 * @param {Object} data - validated UpdateUserSchema data
 */
export async function updateUserFull(id, data) {
  const organisationId = resolveOrganisationId();
  const setClauses = [];
  const params = { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  const fieldTypes = {
    displayName:  sql.NVarChar(200),
    role:         sql.NVarChar(50),
    region:       sql.NVarChar(50),
    supervisorId: sql.UniqueIdentifier,
    isActive:     sql.Bit,
  };
  for (const [key, type] of Object.entries(fieldTypes)) {
    if (data[key] !== undefined) {
      setClauses.push(`${key} = @${key}`);
      params[key] = { type, value: data[key] };
    }
  }

  if (setClauses.length > 0) {
    await executeQuery(
      `UPDATE "User" SET ${setClauses.join(', ')}, updatedAt = NOW()
       WHERE id = @id AND organisationId = @organisationId`,
      params
    );
  }

  if (data.portfolios !== undefined) {
    const portfolioIds = await resolvePortfolioIds(data.portfolios);
    await syncUserPortfolios(id, portfolioIds);
  }
  if (data.products !== undefined) {
    const productIds = await resolveProductIds(data.products);
    await syncUserProducts(id, productIds);
  }
  // Only re-check BrokerRegion if this update actually touched role or
  // region — fetch the definitive post-update values rather than assuming,
  // since a partial update (e.g. region only) needs the CURRENT role to
  // decide whether syncing applies at all.
  if (data.region !== undefined || data.role !== undefined) {
    const current = await executeQueryOne(
      `SELECT role, region FROM "User" WHERE id = @id AND organisationId = @organisationId`,
      { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } }
    );
    if (current) await syncBrokerRegion(id, current.role, current.region);
  }
}

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
 * VERCEL_NOTES.md.
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
