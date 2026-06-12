/**
 * services/brokerMatchingService.js
 * Implements the three-step broker matching algorithm:
 *   Step 1 — Filter by client region and product specialisation
 *   Step 2 — Check Calendly availability (with circuit breaker for degraded mode)
 *   Step 3 — Rank by fewest upcoming appointments (most available broker first)
 *
 * Degraded mode: if Calendly is unreachable, returns brokers in ranked order
 * without availability confirmation, and sets degradedMode: true in the response.
 * The agent must then select a broker manually and confirm the appointment.
 */

import { executeQuery, sql } from './db.js';
import { config } from '../config.js';
import { resolveOrganisationId } from '../context/tenant.js';

// Simple circuit breaker state for Calendly
const calendlyCircuit = {
  failureCount: 0,
  openUntil: 0,
  threshold: 3,        // open after 3 consecutive failures
  cooldownMs: 120_000, // 2 minutes before retrying
};

function isCalendlyCircuitOpen() {
  if (calendlyCircuit.failureCount >= calendlyCircuit.threshold) {
    if (Date.now() < calendlyCircuit.openUntil) return true;
    // Cooldown expired — reset and allow a retry
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

/**
 * Fetch available time slots from Calendly for a broker's event type.
 * Returns an array of available slot start times, or null on failure.
 * @param {string} calendlyEventTypeUri
 * @returns {Promise<string[]|null>}
 */
async function getCalendlyAvailability(calendlyEventTypeUri) {
  if (isCalendlyCircuitOpen() || !config.calendly.apiToken) return null;

  try {
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // next 7 days

    const url = new URL(`${config.calendly.baseUrl}/event_type_available_times`);
    url.searchParams.set('event_type', calendlyEventTypeUri);
    url.searchParams.set('start_time', startTime);
    url.searchParams.set('end_time', endTime);

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${config.calendly.apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Calendly API error: ${response.status}`);

    const data = await response.json();
    recordCalendlySuccess();
    return (data.collection ?? []).map(slot => slot.start_time);

  } catch {
    recordCalendlyFailure();
    return null;
  }
}

/**
 * Find matching brokers for a lead based on region, product specialisation,
 * and Calendly availability.
 *
 * @param {Object} options
 * @param {string} options.region       - Client's region (used to filter brokers)
 * @param {string[]} options.products   - Product types the client needs
 * @param {string} options.leadId       - Used to count upcoming appointments per broker
 * @returns {Promise<{
 *   brokers: Array,
 *   degradedMode: boolean
 * }>}
 */
export async function findMatchingBrokers({ region, products, leadId }) {
  if (!region) throw new Error('region is required for broker matching');

  // Step 1 — Filter by region and product specialisation.
  // Region and product membership are tested with EXISTS (not JOINs) so a broker
  // matching several products/regions is not duplicated, and the appointment
  // count is a scalar subquery so it cannot be inflated by join fan-out.
  const productPlaceholders = products.map((_, i) => `@prod${i}`).join(',');
  const productParams = Object.fromEntries(
    products.map((p, i) => [`prod${i}`, { type: sql.NVarChar(200), value: p }])
  );

  const eligibleBrokers = await executeQuery(
    `SELECT
       b.id, b.displayName, b.email, b.mobileNumber, b.calendlyEventTypeUri,
       (SELECT COUNT(*)
          FROM Appointment ap
         WHERE ap.brokerId = b.id
           AND ap.organisationId = @organisationId
           AND ap.status NOT IN ('ClosedWon', 'ClosedLost')) AS upcomingAppointments
     FROM [User] b
     WHERE b.role = 'Broker'
       AND b.isActive = 1
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
     ORDER BY upcomingAppointments ASC`,
    {
      region: { type: sql.NVarChar(100), value: region },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      ...productParams,
    }
  );

  if (eligibleBrokers.length === 0) {
    return { brokers: [], degradedMode: false };
  }

  // Step 2 — Check Calendly availability
  const calendlyDegraded = isCalendlyCircuitOpen() || !config.calendly.apiToken;
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

  // Step 3 — Sort: brokers with confirmed Calendly slots first, then by fewest appointments
  const sorted = brokersWithAvailability.sort((a, b) => {
    if (a.hasCalendlyAvailability !== b.hasCalendlyAvailability) {
      return a.hasCalendlyAvailability ? -1 : 1;
    }
    return a.upcomingAppointments - b.upcomingAppointments;
  });

  return { brokers: sorted, degradedMode };
}
