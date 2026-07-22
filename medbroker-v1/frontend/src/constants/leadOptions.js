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
