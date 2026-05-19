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
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

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
 * Encrypt a plaintext string using the Key Vault key.
 * Returns a base64-encoded string containing IV + ciphertext.
 * @param {string} plaintext
 * @returns {Promise<string>} base64-encoded encrypted value
 */
export async function encrypt(plaintext) {
  if (!plaintext) return null;

  // note: Using local AES encryption with Key Vault-managed key wrapping.
  // The data key is derived from the Key Vault key via Wrap/Unwrap operations
  // for performance — avoids round-tripping every ID number to Key Vault.
  const client = await getCryptoClient();

  // Generate a random data encryption key and IV for this value
  const dataKey = randomBytes(32); // 256-bit AES key
  const iv = randomBytes(16);

  const cipher = createCipheriv('aes-256-cbc', dataKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  // Wrap (encrypt) the data key using Key Vault
  const { result: wrappedKey } = await client.wrapKey('A256KW', dataKey);

  // Store IV + wrapped data key + ciphertext as a single base64 blob
  const payload = JSON.stringify({
    iv: iv.toString('base64'),
    wrappedKey: Buffer.from(wrappedKey).toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });

  return Buffer.from(payload).toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted value previously produced by encrypt().
 * @param {string} encryptedBase64
 * @returns {Promise<string>} plaintext
 */
export async function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null;

  const client = await getCryptoClient();

  const payload = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));
  const iv = Buffer.from(payload.iv, 'base64');
  const wrappedKey = Buffer.from(payload.wrappedKey, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  // Unwrap the data key using Key Vault
  const { result: dataKey } = await client.unwrapKey('A256KW', wrappedKey);

  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(dataKey), iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}
