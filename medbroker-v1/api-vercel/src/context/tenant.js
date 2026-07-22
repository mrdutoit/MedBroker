/**
 * context/tenant.js
 * Ported unchanged from api/src/context/tenant.js — this file has no
 * cloud-specific code. Single source of truth for "which organisation is
 * this request for". See the Azure version's header comment for the
 * multi-tenant activation note; it applies identically here.
 */

import { config } from '../config.js';

/**
 * Resolve the organisation id for the current request.
 * @param {object} [claims] - validated auth claims (unused in single-tenant)
 * @param {object} [request] - HTTP request (unused in single-tenant)
 * @returns {string} organisation UUID
 */
export function resolveOrganisationId(/* claims, request */) {
  return config.organisationId;
}
