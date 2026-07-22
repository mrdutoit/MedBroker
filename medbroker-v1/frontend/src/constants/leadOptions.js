/**
 * constants/leadOptions.js — NEW.
 * Single source of truth for the Title and Job Title dropdown options used
 * on lead creation (LeadImport.jsx), the Leads filter (LeadList.jsx), and
 * display (LeadDetail.jsx) — added 22 July 2026 to match the fields on the
 * client's real Appointment Tracking intake sheet. JOB_TITLES matches
 * api-lib/models/lead.js's JobTitle enum exactly; keep both in sync if
 * this list ever changes.
 */

export const TITLES = ['Dr', 'Mr', 'Mrs', 'Ms'];

export const JOB_TITLES = [
  'Anaesthesiologist', 'Cardiologist', 'Dermatologist', 'General Practitioner',
  'Gynaecologist', 'Neurologist', 'Orthopaedic Surgeon', 'Paediatrician',
  'Psychiatrist', 'Radiologist',
];

// Added 22 July 2026 alongside the Appointments build — LeadDetail.jsx's
// Book Appointment modal needs a region to query broker matching against
// (brokers are matched to where the CLIENT is, not the agent's own
// region). Already existed as a local, unexported const in UserAdmin.jsx;
// moved here to avoid a second copy drifting out of sync, same reasoning
// as JOB_TITLES.
export const REGIONS = [
  'Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape',
  'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Free State',
];
