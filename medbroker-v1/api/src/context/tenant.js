/**
 * context/tenant.js
 *
 * Single source of truth for "which organisation is this request for".
 *
 * The whole point of this chokepoint is that tenancy resolution lives in ONE
 * place. Today the system is single-tenant: every instance serves exactly one
 * organisation, so this returns the configured constant (which equals the
 * seeded default organisation and the DF_*_Org column defaults in the schema).
 *
 * MULTI-TENANT LATER: change ONLY this function to resolve the organisation
 * from the validated token (or host/subdomain), e.g.
 *     return claims?.organisationId ?? mapHostToOrg(request);
 * Nothing else in the data layer needs to change its shape — callers already
 * pass the result into every tenant-scoped query and insert.
 */

import { config } from '../config.js';

/**
 * Resolve the organisation id for the current request.
 * @param {object} [claims] - validated JWT claims (unused in single-tenant)
 * @param {object} [request] - HTTP request (unused in single-tenant)
 * @returns {string} organisation UUID
 */
export function resolveOrganisationId(/* claims, request */) {
  // SINGLE-TENANT (now): the instance belongs to exactly one organisation.
  return config.organisationId;
}
