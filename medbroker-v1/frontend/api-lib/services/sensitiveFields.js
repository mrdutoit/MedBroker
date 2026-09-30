/**
 * 30 Sep 2026 — sensitive lead fields are audited ENCRYPTED, never in plaintext
 * (owner ruling): the real before/after stays traceable in `sealed`, but no
 * UI, audit API or CSV export ever sees it. POPIA erasure removes it.
 */
import { encrypt } from './encryption.js';

export const SENSITIVE_LEAD_FIELDS = ['idNumber', 'existingCover', 'currentInsurer', 'policies', 'medicalAid', 'medicalAidProvider'];

/** Sensitive field -> { changed: true, sealed }; any other field -> change unchanged. */
export async function sealChange(field, change) {
  if (!SENSITIVE_LEAD_FIELDS.includes(field)) return change;
  return { changed: true, sealed: await encrypt(JSON.stringify({ from: change.from, to: change.to })) };
}

/** Copy of a changeDetail with every field entry's `sealed` key removed. */
export function stripSealed(changeDetail) {
  if (!changeDetail || typeof changeDetail !== 'object') return changeDetail;
  const out = {};
  for (const [k, v] of Object.entries(changeDetail)) {
    if (k === 'sealed') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const { sealed, ...rest } = v;
      out[k] = rest;
    } else out[k] = v;
  }
  return out;
}
