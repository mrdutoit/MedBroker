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
import { hashPassword, verifyPassword } from './authService.js';

const USER_LIST_SELECT = `
  u.id, u.displayName AS "displayName", u.email, u.role, u.region,
  u.isActive AS "isActive", u.isLocked AS "isLocked",
  u.failedLoginAttempts AS "failedLoginAttempts",
  u.supervisorId AS "supervisorId",
  -- §114 — GlobalAdmin's link-identity UI needs to know whether a row is
  -- already linked (and to what) to decide auto-link vs mismatch vs
  -- unlinked; harmless extra column for every other consumer of this
  -- shared SELECT, which already ignores fields it doesn't render.
  u.entraObjectId AS "entraObjectId",
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
 * Own-profile shape for Settings.jsx — GET/PUT /api/users/me. Deliberately
 * lighter than getUserForAdmin(): no supervisor/portfolio/product joins,
 * since Settings only ever shows/edits displayName, avatarColour,
 * themePreference, and timezone (plus the read-only email/role already
 * carried by the auth session). Not reused for admin's UserAdmin.jsx views.
 * @param {string} id
 */
export async function getOwnProfile(id) {
  return executeQueryOne(
    `SELECT id, displayName AS "displayName", email, role,
            avatarColour AS "avatarColour", themePreference AS "themePreference",
            timezone
     FROM "User"
     WHERE id = @id AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Self-service profile update — PUT /api/users/me. Mirrors updateUserFull()'s
 * dynamic-SET-clause pattern, but only ever the four fields
 * UpdateOwnProfileSchema allows and only ever against `id`, which the
 * handler derives from claims.oid, never from the request — a user cannot
 * update anyone else's row through this function no matter what id is
 * passed in, because the caller (handleUserMe) never passes anything but
 * their own.
 * @param {string} id
 * @param {Object} data - validated UpdateOwnProfileSchema data
 */
export async function updateOwnProfile(id, data) {
  const organisationId = resolveOrganisationId();
  const setClauses = [];
  const params = { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  // §151 follow-up (13 Aug 2026) — displayName removed. Matches
  // UpdateOwnProfileSchema in models/user.js, which no longer accepts
  // it at all; removed here too so this function can't apply it even
  // if ever called directly with a raw object that bypassed the schema.
  const fieldTypes = {
    avatarColour:    sql.NVarChar(20),
    themePreference: sql.NVarChar(20),
    timezone:        sql.NVarChar(50),
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
 * §138, 12 Aug 2026 — routing for the "couldn't find an available broker"
 * flow. Deliberately NOT the agent's own line-management supervisor
 * (lead.agentSupervisorId, used elsewhere in this app) — an agent's
 * manager has nothing to do with broker capacity. This is a different
 * axis entirely: which Supervisor covers BROKERS for a given region.
 * Since no broker was ever matched in this flow, there's no specific
 * broker to trace a supervisor from — matches on the Supervisor's own
 * region column directly (region is a plain column on every User row,
 * not agent- or broker-specific).
 *
 * Of any Supervisor matching that region, picks whichever currently has
 * the fewest open (incomplete) Tasks assigned to them — Mark's choice,
 * load-spreading over simple first-match. Ties broken by displayName
 * for a deterministic result, not insertion order.
 *
 * Returns null if no active Supervisor has that region set at all — the
 * caller (appointmentService.createAppointment) falls back to the
 * agent themselves in that case, same "never orphan a task" pattern
 * used elsewhere, since CreateUserSchema making region required for
 * Supervisor going forward doesn't retroactively fix existing rows.
 * @param {string} region
 * @returns {Promise<string|null>} the chosen Supervisor's id, or null
 */
export async function findLeastLoadedSupervisorForRegion(region) {
  if (!region) return null;
  const row = await executeQueryOne(
    `SELECT u.id
     FROM "User" u
     LEFT JOIN Task t ON t.assignedToId = u.id AND t.isComplete = FALSE AND t.organisationId = u.organisationId
     WHERE u.role = 'Supervisor' AND u.isActive = TRUE AND u.deletedAt IS NULL
       AND u.region = @region AND u.organisationId = @organisationId
     GROUP BY u.id, u.displayName
     ORDER BY COUNT(t.id) ASC, u.displayName ASC
     LIMIT 1`,
    {
      region:         { type: sql.NVarChar(50),     value: region },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return row?.id ?? null;
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
       passwordHash, passwordSetAt, passwordMustChange, isActive
     ) VALUES (
       @id, @organisationId, @displayName, @email, @role, @region, @supervisorId,
       @passwordHash, @passwordSetAt, @passwordMustChange, TRUE
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
      // §72 — whoever sets this initial password (whether the Admin
      // typed it themselves or it's a generated temp password), the new
      // user is always forced to set their own on first login. This is
      // the whole point of a manually created account never having a
      // password only the Admin knows persist unchanged.
      passwordMustChange: { type: sql.Bit, value: !!passwordHash },
    }
  );

  // Seed password history so a future reuse check has a baseline to
  // compare against, not just changes made after this point.
  if (passwordHash) await addPasswordHistory(newId, passwordHash);

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
            supervisorId AS "supervisorId", isActive AS "isActive",
            sessionsRevokedAt AS "sessionsRevokedAt"
     FROM "User"
     WHERE id = @id AND isActive = TRUE AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * §97 — invalidates every currently-issued token for this user; their
 * very next request with an old token gets rejected by validateToken()'s
 * iat comparison, same per-request lookup as the isActive/isLocked
 * check, no separate query. Two callers: authHandlers.js's own change-
 * password flow (a stolen old token shouldn't outlive a password
 * change by up to 8 hours) and userHandlers.js's Admin-only "Force
 * logout" action.
 * @param {string} userId
 */
export async function revokeUserSessions(userId) {
  await executeQuery(
    `UPDATE "User" SET sessionsRevokedAt = NOW() WHERE id = @id`,
    { id: { type: sql.UniqueIdentifier, value: userId } }
  );
}

/**
 * Resolve a user's display name for writing into an AuditLog changeDetail
 * blob — Mark's request, 24 Jul 2026: "Lead assigned to an agent" entries
 * should say who, not just store the raw agentId. Deliberately NOT
 * filtered by isActive (unlike getActiveUserById above) — an audit entry
 * is a historical record, and a user who's since been deactivated should
 * still show their real name rather than silently going blank.
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function getUserDisplayNameById(id) {
  const row = await executeQueryOne(
    `SELECT displayName AS "displayName" FROM "User"
     WHERE id = @id AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return row?.displayName ?? null;
}

/**
 * §78 — email notifications need the recipient's actual address, not
 * just their display name. Same pattern as getUserDisplayNameById above.
 * @param {string} id
 */
export async function getUserEmailById(id) {
  const row = await executeQueryOne(
    `SELECT email FROM "User"
     WHERE id = @id AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  return row?.email ?? null;
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
            isActive AS "isActive",
            -- §121 (SSO stage 3) — needed for the password-fallback
            -- enforcement check in handleLogin (authHandlers.js): whether
            -- THIS user has a linked Entra identity determines whether
            -- auth.sso.disableLocalFallback applies to them at all.
            entraObjectId AS "entraObjectId",
            avatarColour AS "avatarColour", themePreference AS "themePreference",
            timezone
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

// ── Password policy (§72) ───────────────────────────────────────────────────

/**
 * Every password hash a user's account has ever held, one row per set —
 * the record a reuse check compares a proposed new password against.
 * @param {string} userId
 * @param {string} passwordHash
 */
export async function addPasswordHistory(userId, passwordHash) {
  await executeQuery(
    `INSERT INTO PasswordHistory (id, organisationId, userId, passwordHash, createdAt)
     VALUES (@id, @organisationId, @userId, @passwordHash, NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: crypto.randomUUID() },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      userId:         { type: sql.UniqueIdentifier, value: userId },
      passwordHash:   { type: sql.NVarChar(sql.MAX), value: passwordHash },
    }
  );
}

/**
 * "Unique passwords in a calendar year" (Mark's own phrasing) — checks a
 * PROPOSED plaintext password against every hash this user has held
 * since 1 January of the current year. Hashes are one-way, so this loops
 * verifyPassword() against each historical entry rather than comparing
 * hash strings directly — fine at this scale (a handful of password
 * changes per user per year, not hundreds).
 * @param {string} userId
 * @param {string} plaintext - the NEW password being proposed
 * @returns {Promise<boolean>} true if this password was already used this year
 */
export async function wasPasswordUsedThisYear(userId, plaintext) {
  const yearStart = new Date(new Date().getUTCFullYear(), 0, 1);
  const rows = await executeQuery(
    `SELECT passwordHash AS "passwordHash" FROM PasswordHistory
     WHERE userId = @userId AND createdAt >= @yearStart`,
    {
      userId:    { type: sql.UniqueIdentifier, value: userId },
      yearStart: { type: sql.DateTimeOffset,   value: yearStart },
    }
  );
  for (const row of rows) {
    if (await verifyPassword(plaintext, row.passwordHash)) return true;
  }
  return false;
}

/**
 * The one place passwordHash is fetched by user id rather than email —
 * getActiveUserById() deliberately excludes it (never needed for
 * anything but authenticating), but changing your own password needs to
 * verify the CURRENT one first.
 * @param {string} userId
 */
export async function getUserPasswordHash(userId) {
  return executeQueryOne(
    `SELECT passwordHash AS "passwordHash", email, displayName AS "displayName", role
     FROM "User" WHERE id = @userId AND organisationId = @organisationId`,
    { userId: { type: sql.UniqueIdentifier, value: userId }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * Sets a user's password — via a self-service change or a forced
 * first-login change, both go through this same function. Always clears
 * passwordMustChange (whatever set it — a forced change or a rotation
 * deadline — is now satisfied) and always records the new hash into
 * PasswordHistory in the SAME call, so no caller can update one without
 * the other.
 * @param {string} userId
 * @param {string} newPlaintext
 */
export async function setUserPassword(userId, newPlaintext) {
  const newHash = await hashPassword(newPlaintext);
  await executeQuery(
    `UPDATE "User" SET passwordHash = @passwordHash, passwordSetAt = NOW(), passwordMustChange = FALSE
     WHERE id = @userId AND organisationId = @organisationId`,
    {
      passwordHash:   { type: sql.NVarChar(sql.MAX), value: newHash },
      userId:         { type: sql.UniqueIdentifier, value: userId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  await addPasswordHistory(userId, newHash);
}

/**
 * GlobalAdmin-forced password reset — §118 (4 Aug 2026). "Genuinely
 * forgotten their password" recovery, Mark's own framing: unlike
 * setUserPassword() above (a user's own voluntary change, which clears
 * passwordMustChange since they just proved they know the new value),
 * this sets passwordMustChange = TRUE — the admin-typed value is a
 * temporary credential the real owner is forced to replace at next login,
 * never a password the admin gets to leave in place on someone else's
 * behalf. Also clears isLocked/failedLoginAttempts in the same UPDATE —
 * folded in deliberately: the scenario this exists for ("forgotten their
 * password") very plausibly already ALSO involves a lockout from the
 * failed attempts that led to calling this in the first place, and there
 * is no good reason to make an Admin perform Unlock as a separate,
 * easy-to-forget second step right after this one.
 * @param {string} userId
 * @param {string} newPlaintext
 */
export async function forcePasswordReset(userId, newPlaintext) {
  const newHash = await hashPassword(newPlaintext);
  await executeQuery(
    `UPDATE "User"
     SET passwordHash = @passwordHash, passwordSetAt = NOW(), passwordMustChange = TRUE,
         isLocked = FALSE, failedLoginAttempts = 0, updatedAt = NOW()
     WHERE id = @userId AND organisationId = @organisationId`,
    {
      passwordHash:   { type: sql.NVarChar(sql.MAX), value: newHash },
      userId:         { type: sql.UniqueIdentifier, value: userId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
  await addPasswordHistory(userId, newHash);
}

// ── Entra ID SSO support — NEW, §114 (4 Aug 2026, stages 1+2) ──────────────

/**
 * Look up a user by their Entra Object ID — the primary match on every SSO
 * login after the first (getUserForSsoMatch below handles the first-ever
 * login, which matches by email instead and backfills this column).
 * @param {string} entraObjectId
 * @returns {Promise<Object|null>}
 */
export async function getUserByEntraObjectId(entraObjectId) {
  return executeQueryOne(
    `SELECT id, displayName AS "displayName", email, role,
            isActive AS "isActive", entraObjectId AS "entraObjectId",
            avatarColour AS "avatarColour", themePreference AS "themePreference", timezone
     FROM "User"
     WHERE entraObjectId = @entraObjectId AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      entraObjectId:  { type: sql.NVarChar(100),    value: entraObjectId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Look up a user by email for SSO first-login matching (case-insensitive,
 * matches the UQ_User_Email constraint's own case sensitivity — Postgres
 * treats email as case-sensitive on the unique index, so this deliberately
 * ILIKEs to find a match a case-differing SSO claim would otherwise miss).
 * Also returns entraObjectId so the caller can tell a genuinely-unlinked
 * row (auto-link safe) apart from one already linked to a DIFFERENT
 * identity (a real mismatch — reject, don't silently relink).
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function getUserForSsoMatch(email) {
  return executeQueryOne(
    `SELECT id, displayName AS "displayName", email, role,
            isActive AS "isActive", entraObjectId AS "entraObjectId",
            avatarColour AS "avatarColour", themePreference AS "themePreference", timezone
     FROM "User"
     WHERE email ILIKE @email AND deletedAt IS NULL AND organisationId = @organisationId`,
    {
      email:          { type: sql.NVarChar(255),    value: email },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Backfill entraObjectId onto an EXISTING User row at first successful SSO
 * login where the email matched but no identity was linked yet — the
 * "match by email, backfill entraObjectId onto the existing row rather
 * than creating a new one" design from §109, so every foreign key already
 * pointing at this user's id (Lead.assignedAgentId, Appointment.brokerId,
 * AuditLog.performedById, etc.) keeps working with zero separate merge step.
 * @param {string} userId
 * @param {string} entraObjectId
 */
export async function backfillEntraObjectId(userId, entraObjectId) {
  await executeQuery(
    `UPDATE "User" SET entraObjectId = @entraObjectId, updatedAt = NOW()
     WHERE id = @userId AND organisationId = @organisationId`,
    {
      entraObjectId:  { type: sql.NVarChar(100),    value: entraObjectId },
      userId:         { type: sql.UniqueIdentifier, value: userId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * Just-in-time provisioning for a genuinely new SSO identity — no local
 * row matched by entraObjectId or email. Created INACTIVE deliberately
 * (design decision (b), §109/§110): "safe default role, Admin fills in the
 * rest since SSO claims won't carry portfolio/region/supervisor." isActive
 * = FALSE is what makes this the review gate — the new row is real and
 * visible in User Admin immediately (same list, same isActive column
 * everything else already renders), but middleware/auth.js's isActive
 * re-check blocks any actual access until a GlobalAdmin/Admin reviews it,
 * sets a real role/portfolio/supervisor, and activates — same surface as
 * the link-identity review flow, not a separate one.
 * @param {{ entraObjectId: string, email: string, displayName: string }} identity
 * @returns {Promise<string>} new user id
 */
export async function jitProvisionSsoUser({ entraObjectId, email, displayName }) {
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO "User" (id, organisationId, entraObjectId, displayName, email, role, isActive)
     VALUES (@id, @organisationId, @entraObjectId, @displayName, @email, 'Agent', FALSE)`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      entraObjectId:  { type: sql.NVarChar(100),    value: entraObjectId },
      displayName:    { type: sql.NVarChar(200),    value: displayName },
      email:          { type: sql.NVarChar(255),    value: email },
    }
  );
  return newId;
}

/**
 * GlobalAdmin-only email correction and/or manual identity link/unlink —
 * PUT /api/users/:id/link-identity (userHandlers.js). Same dynamic-SET-
 * clause pattern as updateOwnProfile/updateUserFull; entraObjectId can be
 * explicitly set to null to unlink (undefined leaves it untouched — the
 * caller only ever passes validated LinkIdentitySchema data, which
 * preserves that distinction).
 * @param {string} id
 * @param {{ email?: string, entraObjectId?: string|null }} data
 */
export async function linkUserIdentity(id, data) {
  const organisationId = resolveOrganisationId();
  const setClauses = [];
  const params = { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: organisationId } };

  if (data.email !== undefined) {
    setClauses.push('email = @email');
    params.email = { type: sql.NVarChar(255), value: data.email };
  }
  if (data.entraObjectId !== undefined) {
    setClauses.push('entraObjectId = @entraObjectId');
    params.entraObjectId = { type: sql.NVarChar(100), value: data.entraObjectId };
  }
  if (setClauses.length === 0) return;

  await executeQuery(
    `UPDATE "User" SET ${setClauses.join(', ')}, updatedAt = NOW()
     WHERE id = @id AND organisationId = @organisationId`,
    params
  );
}

// ── Offboarding sync support — NEW, §121 (4 Aug 2026, SSO stage 3b) ────────

/**
 * Every currently-active, Entra-linked user — the candidate set an
 * offboarding sync checks. Users without entraObjectId (local-only
 * accounts) are never touched by this sync at all; there's nothing in
 * Entra to check them against.
 * @returns {Promise<Array<{id: string, displayName: string, entraObjectId: string}>>}
 */
export async function listSsoLinkedActiveUsers() {
  return executeQuery(
    `SELECT id, displayName AS "displayName", entraObjectId AS "entraObjectId"
     FROM "User"
     WHERE entraObjectId IS NOT NULL AND isActive = TRUE AND deletedAt IS NULL AND organisationId = @organisationId`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * Deactivates a user — the offboarding sync's own action when Graph
 * reports someone's Entra account is gone or disabled. A small, dedicated
 * function rather than routing through updateUserFull()/handleUserById's
 * general PUT: this call site has exactly one field to set and no
 * request body to validate against a schema, and doesn't want any of
 * updateUserFull's other field-handling (portfolios, products,
 * supervisor sync) running for what is purely a status flip.
 * @param {string} userId
 */
export async function deactivateUser(userId) {
  await executeQuery(
    `UPDATE "User" SET isActive = FALSE, updatedAt = NOW()
     WHERE id = @userId AND organisationId = @organisationId`,
    {
      userId:         { type: sql.UniqueIdentifier, value: userId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
    }
  );
}

/**
 * §128 (5 Aug 2026) — every Admin AND GlobalAdmin user, for the SAR
 * assignee picker. Deliberately NOT listUsers({ role: 'GlobalAdmin' }) —
 * that function hardcodes `u.role != 'GlobalAdmin'` in its own base
 * WHERE clause (a deliberate exclusion for its actual purpose, the
 * general User Admin list — GlobalAdmin is bootstrap-only, never meant
 * to show up in that general listing) and CreatableRole (models/user.js)
 * doesn't even accept 'GlobalAdmin' as a valid filter value in the
 * first place, so requesting it that way returns a 400, not an empty
 * list. Confirmed this precisely by reading both, not assumed — this is
 * exactly why the SAR assignee dropdown was showing nothing at all
 * (Mark's report): the failed GlobalAdmin call rejected the whole
 * Promise.all it was part of, discarding the Admin results too. This
 * function is a genuinely separate query for a genuinely separate need,
 * not a parameter tweak to the existing one.
 * @returns {Promise<Array<{id: string, displayName: string, role: string}>>}
 */
export async function listSarAssignableUsers() {
  return executeQuery(
    `SELECT id, displayName AS "displayName", role FROM "User"
     WHERE role IN ('Admin', 'GlobalAdmin') AND isActive = TRUE AND deletedAt IS NULL AND organisationId = @organisationId
     ORDER BY displayName`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}
