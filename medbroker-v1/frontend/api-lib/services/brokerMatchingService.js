/**
 * services/brokerMatchingService.js
 * Ported from api/src/services/brokerMatchingService.js (Azure SQL / mssql)
 * to Postgres/Neon. Implements the same three-step algorithm, unchanged:
 *   Step 1 — Filter by client region and product specialisation
 *   Step 2 — Check Calendly availability (with circuit breaker for degraded mode)
 *   Step 3 — Rank: brokers with confirmed Calendly slots first, then by
 *            fewest upcoming appointments (most available broker first)
 *
 * UPDATED 24 Jul 2026 (Mark's request): date/time are now REQUIRED
 * parameters, not optional — a broker "availability" search without
 * knowing when doesn't mean anything. Step 1's filter also now excludes
 * any broker who already has an Appointment at that exact date+time —
 * showing an already-double-booked broker as a "match" would be actively
 * wrong, not just an unhelpful ranking. createAppointment()/
 * reassignAppointment() (appointmentService.js) enforce the same
 * conflict rule server-side at the actual booking step too, so this
 * can't be bypassed by calling the API directly instead of going through
 * this search first.
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
export async function findMatchingBrokers({ region, products, date, time }) {
  if (!region) throw { status: 400, message: 'region is required for broker matching' };
  if (!products || products.length === 0) throw { status: 400, message: 'at least one product is required for broker matching' };
  // Mark's request, 24 Jul 2026 — a broker "availability" search is
  // meaningless without knowing WHEN. Required now, not optional, so the
  // frontend's disabled-until-set button is backed by a real server-side
  // rule rather than only a client-side convenience.
  if (!date) throw { status: 400, message: 'date is required for broker matching' };
  if (!time) throw { status: 400, message: 'time is required for broker matching' };

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
       -- Excludes a broker already double-booked at this exact
       -- date+time — presenting them as a "match" here would be wrong,
       -- not just unhelpful; createAppointment()/reassignAppointment()
       -- also enforce this server-side at booking time regardless.
       AND NOT EXISTS (
         SELECT 1 FROM Appointment ap2
          WHERE ap2.brokerId = b.id
            AND ap2.firstAppointmentDate = @date
            AND ap2.firstAppointmentTime = @time
            AND ap2.organisationId = @organisationId
       )
     ORDER BY "upcomingAppointments" ASC`,
    {
      region:         { type: sql.NVarChar(100), value: region },
      date:           { type: sql.Date, value: date },
      time:           { type: sql.NVarChar(8), value: time },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      ...productParams,
    }
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
