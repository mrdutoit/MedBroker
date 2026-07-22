/**
 * services/brokerMatchingService.js
 * Ported from api/src/services/brokerMatchingService.js (Azure SQL / mssql)
 * to Postgres/Neon. Implements the same three-step algorithm, unchanged:
 *   Step 1 — Filter by client region and product specialisation
 *   Step 2 — Check Calendly availability (with circuit breaker for degraded mode)
 *   Step 3 — Rank: brokers with confirmed Calendly slots first, then by
 *            fewest upcoming appointments (most available broker first)
 *
 * Degraded mode: if Calendly is unreachable OR unconfigured, returns
 * brokers in ranked order without availability confirmation, and sets
 * degradedMode: true — the agent then picks manually. This demo has no
 * real Calendly account connected, so it runs in degraded mode by default,
 * which the original design already treats as a first-class, correct
 * outcome, not an error state — nothing here is a stub standing in for
 * something broken.
 *
 * Dialect changes only, same as leadService.js's port:
 *   [User] -> "User", @param placeholders unchanged (db.js's compatibility
 *   shim), EXISTS-based region/product filtering kept as-is (already
 *   dialect-neutral SQL).
 */

import { executeQuery, sql } from './db.js';
import { config } from '../config.js';
import { resolveOrganisationId } from '../context/tenant.js';

const calendlyCircuit = {
  failureCount: 0,
  openUntil: 0,
  threshold: 3,
  cooldownMs: 120_000,
};

function isCalendlyCircuitOpen() {
  if (calendlyCircuit.failureCount >= calendlyCircuit.threshold) {
    if (Date.now() < calendlyCircuit.openUntil) return true;
    calendlyCircuit.failureCount = 0;
  }
  return false;
}

function recordCalendlySuccess() {
  calendlyCircuit.failureCount = 0;
}

function recordCalendlyFailure() {
  calendlyCircuit.failureCount++;
  calendlyCircuit.openUntil = Date.now() + calendlyCircuit.cooldownMs;
}

async function getCalendlyAvailability(calendlyEventTypeUri) {
  if (isCalendlyCircuitOpen() || !config.calendly?.apiToken) return null;

  try {
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const url = new URL(`${config.calendly.baseUrl}/event_type_available_times`);
    url.searchParams.set('event_type', calendlyEventTypeUri);
    url.searchParams.set('start_time', startTime);
    url.searchParams.set('end_time', endTime);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${config.calendly.apiToken}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`Calendly API error: ${response.status}`);

    const data = await response.json();
    recordCalendlySuccess();
    return (data.collection ?? []).map((slot) => slot.start_time);
  } catch {
    recordCalendlyFailure();
    return null;
  }
}

/**
 * Find matching brokers for a lead based on region, product specialisation,
 * and (if configured) Calendly availability.
 * @param {Object} options
 * @param {string} options.region
 * @param {string[]} options.products
 * @returns {Promise<{ brokers: Array, degradedMode: boolean }>}
 */
export async function findMatchingBrokers({ region, products }) {
  if (!region) throw { status: 400, message: 'region is required for broker matching' };
  if (!products || products.length === 0) throw { status: 400, message: 'at least one product is required for broker matching' };

  const productPlaceholders = products.map((_, i) => `@prod${i}`).join(',');
  const productParams = Object.fromEntries(
    products.map((p, i) => [`prod${i}`, { type: sql.NVarChar(200), value: p }])
  );

  const eligibleBrokers = await executeQuery(
    `SELECT
       b.id, b.displayName AS "displayName", b.email, b.mobileNumber AS "mobileNumber",
       b.calendlyEventTypeUri AS "calendlyEventTypeUri",
       (SELECT COUNT(*)
          FROM Appointment ap
         WHERE ap.brokerId = b.id
           AND ap.organisationId = @organisationId
           AND ap.status NOT IN ('ClosedWon', 'ClosedLost')) AS "upcomingAppointments"
     FROM "User" b
     WHERE b.role = 'Broker'
       AND b.isActive = TRUE
       AND b.organisationId = @organisationId
       AND EXISTS (
         SELECT 1 FROM BrokerRegion br
          WHERE br.brokerId = b.id AND br.region = @region
       )
       AND EXISTS (
         SELECT 1 FROM BrokerProduct bp
           JOIN Product p ON p.id = bp.productId
          WHERE bp.brokerId = b.id
            AND p.name IN (${productPlaceholders || "''"})
       )
     ORDER BY "upcomingAppointments" ASC`,
    { region: { type: sql.NVarChar(100), value: region }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() }, ...productParams }
  );

  if (eligibleBrokers.length === 0) return { brokers: [], degradedMode: false };

  const calendlyDegraded = isCalendlyCircuitOpen() || !config.calendly?.apiToken;
  let degradedMode = calendlyDegraded;

  const brokersWithAvailability = await Promise.all(
    eligibleBrokers.map(async (broker) => {
      let availableSlots = null;
      if (!calendlyDegraded && broker.calendlyEventTypeUri) {
        availableSlots = await getCalendlyAvailability(broker.calendlyEventTypeUri);
        if (availableSlots === null) degradedMode = true;
      }
      return {
        ...broker,
        availableSlots: availableSlots ?? [],
        hasCalendlyAvailability: availableSlots !== null && availableSlots.length > 0,
      };
    })
  );

  const sorted = brokersWithAvailability.sort((a, b) => {
    if (a.hasCalendlyAvailability !== b.hasCalendlyAvailability) return a.hasCalendlyAvailability ? -1 : 1;
    return a.upcomingAppointments - b.upcomingAppointments;
  });

  return { brokers: sorted, degradedMode };
}
