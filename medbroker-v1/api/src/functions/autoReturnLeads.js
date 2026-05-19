/**
 * api/src/functions/autoReturnLeads.js
 *
 * Timer-triggered Azure Function — runs daily at 07:00 SAST (05:00 UTC).
 * Finds all Appointments that:
 *   - Have no signed outcome (customerSigned IS NULL or customerSigned = false)
 *   - Were created more than SystemConfig.leadAutoUnassignMonths ago
 *   - Have not already been returned (Lead.pipelineStatus != 'Unassigned' already)
 *
 * For each matching Appointment:
 *   1. Sets Lead.pipelineStatus = 'Unassigned'
 *   2. Sets Lead.assignedAgentId = NULL
 *   3. Sets Lead.autoUnassignAfter = NULL (reset the timer)
 *   4. Archives the Appointment (soft-delete or status = 'AutoReturned')
 *   5. Creates a Notification for the supervisor (type = 'LeadAutoReturned')
 *   6. Writes an AuditLog entry (action = 'AppointmentAutoReturned')
 *
 * Idempotency: the query excludes leads already Unassigned, so re-running
 * after a partial failure will not double-process records.
 *
 * David review item: runs in a SQL transaction — either all updates for a
 * given lead succeed or none do. A failure on one lead does not abort the
 * rest of the batch.
 */

import { app } from '@azure/functions';

app.timer('autoReturnLeads', {
  // Cron: 0 0 5 * * * = 05:00 UTC daily = 07:00 SAST
  schedule: '0 0 5 * * *',
  runOnStartup: false, // set true in dev to test on Function App startup
  handler: async (myTimer, context) => {
    context.log('autoReturnLeads: starting');

    const db = await getDbClient(); // import your DB client here

    try {
      // Step 1 — read configuration
      const config = await db.query(
        'SELECT leadAutoUnassignMonths FROM SystemConfig WHERE id = 1'
      );
      const months = config.recordset[0]?.leadAutoUnassignMonths ?? 6;
      context.log(`autoReturnLeads: threshold = ${months} months`);

      // Step 2 — find eligible appointments
      const eligible = await db.query(`
        SELECT
          a.id                AS appointmentId,
          a.leadId,
          l.pipelineStatus,
          l.assignedAgentId,
          u.supervisorId
        FROM Appointment a
        JOIN Lead l ON l.id = a.leadId
        LEFT JOIN [User] u ON u.id = l.assignedAgentId
        WHERE
          a.customerSigned IS NULL
          AND l.pipelineStatus = 'AppointmentScheduled'
          AND a.createdAt < DATEADD(month, -${months}, GETUTCDATE())
          AND a.deletedAt IS NULL
          AND l.deletedAt IS NULL
      `);

      context.log(`autoReturnLeads: ${eligible.recordset.length} eligible appointments found`);

      let returned = 0;
      let errors   = 0;

      for (const row of eligible.recordset) {
        try {
          await db.transaction(async (tx) => {

            // 3a — return lead to Unassigned queue
            await tx.query(`
              UPDATE Lead SET
                pipelineStatus    = 'Unassigned',
                assignedAgentId   = NULL,
                autoUnassignAfter = NULL,
                updatedAt         = GETUTCDATE()
              WHERE id = '${row.leadId}'
            `);

            // 3b — archive the appointment
            await tx.query(`
              UPDATE Appointment SET
                deletedAt = GETUTCDATE()
              WHERE id = '${row.appointmentId}'
            `);

            // 3c — notify the supervisor (if one exists)
            if (row.supervisorId) {
              await tx.query(`
                INSERT INTO Notification (recipientId, type, title, body, entityType, entityId)
                VALUES (
                  '${row.supervisorId}',
                  'LeadAutoReturned',
                  'Lead auto-returned to queue',
                  'An appointment was not closed within ${months} months and has been returned to the Unassigned queue.',
                  'Lead',
                  '${row.leadId}'
                )
              `);
            }

            // 3d — audit log
            await tx.query(`
              INSERT INTO AuditLog (entityType, entityId, action, changeDetail)
              VALUES (
                'Appointment',
                '${row.appointmentId}',
                'AppointmentAutoReturned',
                '{"reason":"Exceeded ${months}-month closure threshold","triggeredBy":"autoReturnLeads"}'
              )
            `);
          });

          returned++;
        } catch (rowErr) {
          context.log(`autoReturnLeads: error on appointment ${row.appointmentId}:`, rowErr.message);
          errors++;
          // Continue processing remaining rows — do not abort the batch
        }
      }

      context.log(`autoReturnLeads: complete — ${returned} returned, ${errors} errors`);

    } catch (err) {
      context.log('autoReturnLeads: fatal error:', err.message);
      throw err; // rethrow so Azure marks the invocation as failed
    }
  }
});

/**
 * TODO: replace with your actual database client import.
 * Example for Azure SQL with mssql:
 *   import sql from 'mssql';
 *   const pool = await sql.connect(process.env.DATABASE_URL);
 *   return pool;
 */
async function getDbClient() {
  throw new Error('getDbClient() not implemented — connect your database client here.');
}
