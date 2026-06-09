/**
 * services/encryption.js
 * Field-level encryption for POPIA-classified special personal information.
 * Used exclusively for Lead.id_number (South African ID numbers are biometric data
 * under POPIA and require additional protection beyond standard PII).
 *
 * Encryption key is stored in Azure Key Vault — never in code or config files.
 * Uses AES-256-CBC via Key Vault cryptographic operations.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { KeyClient, CryptographyClient } from '@azure/keyvault-keys';
import { config } from '../config.js';
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';

let cryptoClient = null;

async function getCryptoClient() {
  if (cryptoClient) return cryptoClient;
  const credential = new DefaultAzureCredential();
  const keyClient = new KeyClient(config.keyVault.url, credential);
  const key = await keyClient.getKey(config.keyVault.encKeyName);
  cryptoClient = new CryptographyClient(key, credential);
  return cryptoClient;
}

/**
 * Encrypt a plaintext string using AES-256-GCM with a per-value data key that
 * is wrapped by the Key Vault key (envelope encryption). GCM is authenticated:
 * the auth tag is stored and verified on decryption, so tampering is detected.
 * Returns a base64-encoded blob containing iv + wrappedKey + authTag + ciphertext.
 * @param {string} plaintext
 * @returns {Promise<string|null>}
 */
export async function encrypt(plaintext) {
  if (!plaintext) return null;

  const client = await getCryptoClient();

  // Per-value data key and 96-bit IV (recommended size for GCM)
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Wrap (encrypt) the data key with the Key Vault key
  const { result: wrappedKey } = await client.wrapKey('A256KW', dataKey);

  const payload = JSON.stringify({
    v:          2, // format version — 2 = GCM
    iv:         iv.toString('base64'),
    wrappedKey: Buffer.from(wrappedKey).toString('base64'),
    authTag:    authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });

  return Buffer.from(payload).toString('base64');
}

/**
 * Decrypt a value produced by encrypt(). Verifies the GCM auth tag.
 * Still reads legacy v1 (AES-256-CBC) blobs so existing data keeps working.
 * @param {string} encryptedBase64
 * @returns {Promise<string|null>}
 */
export async function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null;

  const client = await getCryptoClient();
  const payload = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));

  const iv = Buffer.from(payload.iv, 'base64');
  const wrappedKey = Buffer.from(payload.wrappedKey, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const { result: dataKey } = await client.unwrapKey('A256KW', wrappedKey);

  if (payload.v === 2) {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(dataKey), iv);
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  // Legacy v1 (AES-256-CBC, no auth tag)
  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(dataKey), iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Deterministic keyed hash (HMAC-SHA256) of a value, used as a "blind index"
 * so we can find duplicate leads by ID number without storing it in plaintext.
 * Same input + same key → same hash, which is what lets us match; the key must
 * be kept secret. Returns null if no index key is configured (dedup then falls
 * back to email only) or the input is empty.
 * @param {string} value
 * @returns {string|null} 64-char hex digest
 */
export function blindIndex(value) {
  if (!value || !config.security.blindIndexKey) return null;
  return createHmac('sha256', config.security.blindIndexKey)
    .update(value.trim())
    .digest('hex');
}
