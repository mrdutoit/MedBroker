/**
 * services/encryption.js — DEMO BACKEND
 * Ported from api/src/services/encryption.js, which wraps a per-value AES
 * data key using an Azure Key Vault key (envelope encryption via
 * CryptographyClient.wrapKey/unwrapKey). There is no Key Vault equivalent
 * on Vercel/Neon.
 *
 * DEMO DEVIATION (flagged, not silent): this version replaces the Key-Vault
 * wrap/unwrap step with a locally-held AES-256-GCM master key read from
 * DEMO_ENCRYPTION_KEY. The envelope shape (per-value data key, GCM auth tag)
 * is preserved, and the public API (encrypt/decrypt/blindIndex) is identical,
 * so leadService.js calls this exactly the same way regardless of which
 * version is wired in.
 *
 * The format marker is 'demo1', not the Azure file's v:1/v:2, specifically so
 * a demo-encrypted value can never be silently misread as a real Key-Vault-
 * wrapped one or vice versa.
 *
 * DO NOT use this file, or synthetic-data patterns modelled on it, for real
 * POPIA-classified data. Seed/demo data only.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';
import { config } from '../config.js';

function getMasterKey() {
  const keyB64 = config.demoEncryption.masterKeyBase64;
  if (!keyB64) {
    throw new Error(
      'DEMO_ENCRYPTION_KEY not set. Generate one with: ' +
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('DEMO_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

/**
 * Encrypt a plaintext string. Envelope: random per-value data key, wrapped
 * with the local master key (AES-256-GCM), both authenticated.
 * @param {string} plaintext
 * @returns {Promise<string|null>}
 */
export async function encrypt(plaintext) {
  if (!plaintext) return null;

  const masterKey = getMasterKey();
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const wrapIv = randomBytes(12);
  const wrapCipher = createCipheriv('aes-256-gcm', masterKey, wrapIv);
  const wrappedKey = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);
  const wrapAuthTag = wrapCipher.getAuthTag();

  const payload = JSON.stringify({
    v: 'demo1',
    iv: iv.toString('base64'),
    wrapIv: wrapIv.toString('base64'),
    wrappedKey: wrappedKey.toString('base64'),
    wrapAuthTag: wrapAuthTag.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });

  return Buffer.from(payload).toString('base64');
}

/**
 * Decrypt a value produced by encrypt(). Verifies both GCM auth tags.
 * @param {string} encryptedBase64
 * @returns {Promise<string|null>}
 */
export async function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null;

  const masterKey = getMasterKey();
  const payload = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));

  if (payload.v !== 'demo1') {
    throw new Error(`Unrecognised encryption format "${payload.v}" — this decrypt() only reads demo-format values`);
  }

  const wrapIv = Buffer.from(payload.wrapIv, 'base64');
  const wrapDecipher = createDecipheriv('aes-256-gcm', masterKey, wrapIv);
  wrapDecipher.setAuthTag(Buffer.from(payload.wrapAuthTag, 'base64'));
  const dataKey = Buffer.concat([
    wrapDecipher.update(Buffer.from(payload.wrappedKey, 'base64')),
    wrapDecipher.final(),
  ]);

  const iv = Buffer.from(payload.iv, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Deterministic keyed hash (HMAC-SHA256) — identical to the Azure version,
 * no cloud dependency here. Returns null if no index key is configured.
 * @param {string} value
 * @returns {string|null}
 */
export function blindIndex(value) {
  if (!value || !config.security.blindIndexKey) return null;
  return createHmac('sha256', config.security.blindIndexKey)
    .update(value.trim())
    .digest('hex');
}
