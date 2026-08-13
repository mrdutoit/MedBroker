/**
 * services/systemConfigService.js — NEW.
 * Read/update the SystemConfig singleton row (id=1). Used by AppAdmin →
 * System Settings on the frontend (existing fields) and now also by the
 * login flow, which reads passwordRotationDays/passwordLockoutAttempts at
 * call time rather than hardcoding them — Mark wants both admin-configurable
 * (preset dropdown + custom), not fixed constants.
 */

import { executeQuery, executeQueryOne, sql } from './db.js';

const SELECT_COLUMNS = `
  maxCallAttempts AS "maxCallAttempts",
  leadAutoUnassignMonths AS "leadAutoUnassignMonths",
  qrTokenExpiryHours AS "qrTokenExpiryHours",
  brokerFreeAppointmentsPerMonth AS "brokerFreeAppointmentsPerMonth",
  defaultClaimTokenCost AS "defaultClaimTokenCost",
  passwordRotationDays AS "passwordRotationDays",
  passwordLockoutAttempts AS "passwordLockoutAttempts",
  passwordPreventReuse AS "passwordPreventReuse",
  updatedAt AS "updatedAt"`;

/**
 * @returns {Promise<Object>} the singleton SystemConfig row
 */
export async function getSystemConfig() {
  return executeQueryOne(`SELECT ${SELECT_COLUMNS} FROM SystemConfig WHERE id = 1`, {});
}

/**
 * Partial update — only the provided fields are changed.
 * @param {Object} fields - any subset of the SystemConfig columns above
 */
export async function updateSystemConfig(fields) {
  const allowed = [
    'maxCallAttempts', 'leadAutoUnassignMonths', 'qrTokenExpiryHours',
    'brokerFreeAppointmentsPerMonth', 'defaultClaimTokenCost', 'passwordRotationDays', 'passwordLockoutAttempts',
    'passwordPreventReuse',
  ];
  const setClauses = [];
  const params = {};

  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    setClauses.push(`${key} = @${key}`);
    params[key] = { type: key === 'passwordPreventReuse' ? sql.Bit : sql.Int, value: fields[key] };
  }
  if (setClauses.length === 0) return getSystemConfig();

  await executeQuery(
    `UPDATE SystemConfig SET ${setClauses.join(', ')}, updatedAt = NOW() WHERE id = 1`,
    params
  );
  return getSystemConfig();
}
