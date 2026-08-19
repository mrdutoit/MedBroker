/**
 * api-lib/services/dataExportService.js
 * Full data export — 18 Aug 2026, Mark's explicit request. Four entities:
 * Leads, Appointments, MeetingAttempts, CallAttempts. Org-scoped via
 * resolveOrganisationId(), same chokepoint every other service in this
 * app uses — no export ever crosses an organisation boundary.
 *
 * ID NUMBER — DELIBERATELY MASKED, NOT PLAINTEXT, UNLIKE LeadDetail.jsx/
 * AppointmentDetail.jsx (18 Aug 2026, same session). Mark's instruction
 * was to make idNumber visible in the app UI — an access-controlled
 * screen, one record at a time, viewed by a logged-in staff member. An
 * export is a different risk profile entirely: a downloadable file that
 * can be emailed, copied, or land in a Downloads folder indefinitely,
 * containing every Lead's ID number in one place. Masked here to only
 * the last 4 digits (maskIdNumber() below) as a deliberate, narrower
 * default than the in-app views — sarService.getSarExportData() remains
 * the one place a genuinely unmasked ID number is ever exported, because
 * that export exists specifically to hand one data subject their own
 * information back to them, not to bulk-export everyone's.
 *
 * VERCEL DEPLOYMENT NOTE: routed through the existing flags-router.js
 * (see that file's own routing comment) rather than a new top-level
 * function — the current live deployment is still on the Hobby plan's
 * 12/12 function ceiling. This is a routing/packaging decision only;
 * nothing in the query or file-generation logic below is scaled down
 * for Hobby. Once Pro is active this can be split into its own
 * dedicated function with a one-line change to vercel.json and moving
 * the two handler imports below — no query or business logic changes
 * needed.
 */

import { executeQuery, sql } from './db.js';
import { decrypt } from './encryption.js';
import { resolveOrganisationId } from '../context/tenant.js';

// Same "show enough to confirm identity, not enough to be useful to a
// thief" masking convention used nowhere else in this app yet — everywhere
// else either shows the full plaintext (LeadDetail/AppointmentDetail, per
// Mark's explicit instruction) or never touches it at all. First
// precedent for a masked, in-between treatment.
function maskIdNumber(idNumber) {
  if (!idNumber) return null;
  return `*********${idNumber.slice(-4)}`;
}

const LEAD_EXPORT_SELECT = `
  SELECT
    l.id, l.title, l.firstName AS "firstName", l.lastName AS "lastName",
    l.dateOfBirth AS "dateOfBirth", l.idNumberEncrypted AS "idNumberEncrypted",
    l.email, l.mobileNumber AS "mobileNumber", l.whatsappNumber AS "whatsappNumber",
    l.occupation, l.hospitalOrPractice AS "hospitalOrPractice",
    l.universityAttended AS "universityAttended", l.yearOfAttendance AS "yearOfAttendance",
    l.degreeAttained AS "degreeAttained",
    l.existingCover AS "existingCover", l.policies, l.medicalAid AS "medicalAid",
    l.medicalAidProvider AS "medicalAidProvider",
    l.pipelineStatus AS "pipelineStatus", l.region,
    COALESCE(ev.name, ms.name, l.manualSourceName) AS "source",
    l.createdAt AS "createdAt",
    (SELECT COALESCE(array_agg(p2.name ORDER BY p2.name), ARRAY[]::text[])
     FROM LeadPortfolio lp2 JOIN Portfolio p2 ON p2.id = lp2.portfolioId
     WHERE lp2.leadId = l.id) AS "portfolios",
    (SELECT COALESCE(array_agg(pr2.name ORDER BY pr2.name), ARRAY[]::text[])
     FROM LeadProduct lpr2 JOIN Product pr2 ON pr2.id = lpr2.productId
     WHERE lpr2.leadId = l.id) AS "products"
  FROM Lead l
  LEFT JOIN Event ev               ON l.linkedEventId = ev.id
  LEFT JOIN MedicalSubscription ms ON l.linkedSubscriptionId = ms.id
  WHERE l.organisationId = @organisationId AND l.deletedAt IS NULL
  ORDER BY l.createdAt DESC`;

export async function getLeadsForExport() {
  const rows = await executeQuery(LEAD_EXPORT_SELECT, {
    organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
  });
  return Promise.all(rows.map(async row => {
    const idNumber = row.idNumberEncrypted ? await decrypt(row.idNumberEncrypted) : null;
    delete row.idNumberEncrypted;
    return { ...row, idNumber: maskIdNumber(idNumber) };
  }));
}

const APPOINTMENT_EXPORT_SELECT = `
  SELECT
    a.id, l.title, l.firstName AS "firstName", l.lastName AS "lastName",
    l.email AS "leadEmail", l.mobileNumber AS "leadMobile", l.occupation,
    a.region, a.currentInsurer AS "currentInsurer", a.status,
    a.firstAppointmentDate AS "firstAppointmentDate", a.firstAppointmentTime AS "firstAppointmentTime",
    a.meetingType AS "meetingType", ag.displayName AS "agentName", br.displayName AS "brokerName",
    COALESCE(ev.name, ms.name, l.manualSourceName) AS "source",
    a.createdAt AS "createdAt",
    (SELECT COALESCE(array_agg(p2.name ORDER BY p2.name), ARRAY[]::text[])
     FROM AppointmentPortfolio ap2 JOIN Portfolio p2 ON p2.id = ap2.portfolioId
     WHERE ap2.appointmentId = a.id) AS "portfolios",
    (SELECT COALESCE(array_agg(pr2.name ORDER BY pr2.name), ARRAY[]::text[])
     FROM AppointmentProduct apr2 JOIN Product pr2 ON pr2.id = apr2.productId
     WHERE apr2.appointmentId = a.id) AS "productsSold"
  FROM Appointment a
  JOIN Lead l ON a.leadId = l.id
  LEFT JOIN "User" ag              ON a.agentId = ag.id
  LEFT JOIN "User" br              ON a.brokerId = br.id
  LEFT JOIN Event ev               ON l.linkedEventId = ev.id
  LEFT JOIN MedicalSubscription ms ON l.linkedSubscriptionId = ms.id
  WHERE a.organisationId = @organisationId
  ORDER BY a.createdAt DESC`;

export async function getAppointmentsForExport() {
  return executeQuery(APPOINTMENT_EXPORT_SELECT, {
    organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
  });
}

export async function getMeetingAttemptsForExport() {
  return executeQuery(
    `SELECT ma.id, ma.appointmentId AS "appointmentId", ma.meetingNumber AS "meetingNumber",
            ma.date, ma.status, ma.cancelReason AS "cancelReason", ma.notes,
            u.displayName AS "recordedBy", ma.createdAt AS "createdAt"
     FROM MeetingAttempt ma
     JOIN Appointment a ON ma.appointmentId = a.id
     LEFT JOIN "User" u ON ma.recordedById = u.id
     WHERE ma.organisationId = @organisationId
     ORDER BY ma.createdAt DESC`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

export async function getCallAttemptsForExport() {
  return executeQuery(
    `SELECT ca.id, ca.leadId AS "leadId", l.firstName AS "leadFirstName", l.lastName AS "leadLastName",
            u.displayName AS "agentName", ca.outcome, ca.callTime AS "callTime",
            ca.notes, ca.followUpDateTime AS "followUpDateTime"
     FROM CallAttempt ca
     JOIN Lead l ON ca.leadId = l.id
     LEFT JOIN "User" u ON ca.agentId = u.id
     WHERE ca.organisationId = @organisationId
     ORDER BY ca.callTime DESC`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/**
 * Assembles all four entities. Run in parallel — each is already
 * org-scoped and independent, no reason to serialise them.
 */
export async function buildExportPayload() {
  const [leads, appointments, meetingAttempts, callAttempts] = await Promise.all([
    getLeadsForExport(),
    getAppointmentsForExport(),
    getMeetingAttemptsForExport(),
    getCallAttemptsForExport(),
  ]);
  return { leads, appointments, meetingAttempts, callAttempts };
}

// Column order per sheet — object key order from the SELECT above isn't
// guaranteed to survive JSON round-tripping identically across every
// Postgres driver version, and array-typed columns (portfolios, products,
// productsSold) need flattening to a sheet-friendly string regardless.
function toSheetRows(rows) {
  return rows.map(row => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = Array.isArray(value) ? value.join(', ')
        : value instanceof Date ? value.toISOString()
        : value;
    }
    return out;
  });
}

/**
 * Builds the XLSX workbook — one sheet per entity. Returns a Buffer,
 * ready to write straight to the HTTP response.
 */
export async function buildExportWorkbook(payload) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheets = [
    ['Leads', payload.leads],
    ['Appointments', payload.appointments],
    ['Meeting Attempts', payload.meetingAttempts],
    ['Call Attempts', payload.callAttempts],
  ];
  for (const [name, rows] of sheets) {
    const ws = XLSX.utils.json_to_sheet(toSheetRows(rows));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
