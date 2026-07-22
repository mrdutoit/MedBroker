/**
 * services/flagService.js — NEW.
 * Read/update FeatureFlag rows. Backs GET/PATCH /api/flags, which
 * FeatureFlags.jsx (frontend) and FlagContext.jsx already expected to exist
 * — flagsApi.list()/update() were already defined in services/api.js, and
 * FeatureFlags.jsx's save button already had the UI for this, it just
 * simulated the API call with a setTimeout rather than actually calling one.
 * This file and its two routes complete that, not invent new scope.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';

/**
 * @returns {Promise<Object>} { [flagKey]: value } — coerces boolean-as-string
 *   ('0'/'1') to actual booleans, matching what FlagContext.jsx's flag()
 *   helper already expects to coerce on the frontend (belt and braces —
 *   coercing server-side too means any other future consumer of this
 *   endpoint gets correctly-typed values without re-deriving that logic).
 */
export async function listFlags() {
  const rows = await executeQuery(
    `SELECT flagKey AS "flagKey", value, valueType AS "valueType" FROM FeatureFlag ORDER BY flagKey`,
    {}
  );
  const flags = {};
  for (const row of rows) {
    if (row.valueType === 'boolean') {
      flags[row.flagKey] = row.value === '1' || row.value === 'true';
    } else if (row.valueType === 'integer') {
      flags[row.flagKey] = Number(row.value);
    } else {
      flags[row.flagKey] = row.value;
    }
  }
  return flags;
}

/**
 * @param {string} flagKey
 * @returns {Promise<Object|null>} the raw FeatureFlag row, or null if unknown
 */
export async function getFlagMeta(flagKey) {
  return executeQueryOne(
    `SELECT flagKey AS "flagKey", value, valueType AS "valueType",
            allowedValues AS "allowedValues", isPhase2 AS "isPhase2"
     FROM FeatureFlag WHERE flagKey = @flagKey`,
    { flagKey: { type: sql.NVarChar(100), value: flagKey } }
  );
}

/**
 * Update a single flag's value. Value is stored as text regardless of
 * valueType (matches the column type) — the caller (route layer) is
 * responsible for validating the incoming value against valueType/
 * allowedValues before calling this.
 * @param {string} flagKey
 * @param {string} value
 * @param {string} updatedById
 */
export async function updateFlag(flagKey, value, updatedById) {
  await executeQuery(
    `UPDATE FeatureFlag
     SET value = @value, updatedById = @updatedById, updatedAt = NOW()
     WHERE flagKey = @flagKey`,
    {
      flagKey:     { type: sql.NVarChar(100), value: flagKey },
      value:       { type: sql.NVarChar(500), value: String(value) },
      updatedById: { type: sql.UniqueIdentifier, value: updatedById },
    }
  );
}
