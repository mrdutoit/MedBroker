/**
 * services/zohoService.js
 * Zoho CRM integration — service layer abstraction.
 * Pushes Closed Won leads to Zoho as Contacts + Deals.
 *
 * This service is intentionally isolated behind an interface so the CRM
 * provider can be swapped (Salesforce, HubSpot, etc.) without changing
 * any calling code. All callers use pushClosedWonDeal() only.
 */

import { config } from '../config.js';

let accessToken = null;
let accessTokenExpiry = 0;

/**
 * Get a valid Zoho access token, refreshing if expired.
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiry) return accessToken;

  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     config.zoho.clientId,
      client_secret: config.zoho.clientSecret,
      refresh_token: config.zoho.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Zoho token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 60s buffer

  return accessToken;
}

async function zohoPost(endpoint, body) {
  const token = await getAccessToken();
  const response = await fetch(`${config.zoho.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zoho API error ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Push a closed-won deal to Zoho CRM.
 * Creates or updates a Contact record, then creates a Deal record.
 *
 * @param {Object} options
 * @param {Object} options.lead      - The lead record
 * @param {Object} options.deal      - The deal record (includes policyValue)
 * @param {Object} options.broker    - The broker who closed the deal
 */
export async function pushClosedWonDeal({ lead, deal, broker }) {
  if (!config.zoho.clientId || !config.zoho.refreshToken) {
    // CRM not configured — log and skip (non-fatal)
    console.warn('Zoho CRM not configured. Skipping CRM push for deal:', deal.id);
    return { skipped: true };
  }

  // Create/update Contact in Zoho
  const contactResult = await zohoPost('/Contacts/upsert', {
    data: [{
      First_Name:    lead.firstName,
      Last_Name:     lead.lastName,
      Email:         lead.email,
      Mobile:        lead.mobileNumber,
      Title:         lead.occupation,
      Department:    lead.hospitalOrPractice,
      Lead_Source:   'MedBroker',
      // Custom fields — must be configured in your Zoho CRM layout
      University_Attended: lead.universityAttended,
      Year_of_Graduation:  lead.yearOfAttendance,
    }],
    duplicate_check_fields: ['Email'],
  });

  const zohoContactId = contactResult?.data?.[0]?.details?.id;

  // Create Deal in Zoho
  await zohoPost('/Deals', {
    data: [{
      Deal_Name:      `${lead.firstName} ${lead.lastName} — MedBroker`,
      Amount:         deal.policyValue,
      Stage:          'Closed Won',
      Contact_Name:   { id: zohoContactId },
      Owner:          { email: broker.email },
      Lead_Source:    'MedBroker',
      Description:    `Policy value: R${deal.policyValue}. Closed by ${broker.displayName}.`,
    }],
  });

  return { success: true, zohoContactId };
}
