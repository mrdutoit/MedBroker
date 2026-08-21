/**
 * services/encryption.js — DEMO BACKEND, KMS-HARDENED, FLAG-GATED (§111,
 * §112 — 4 Aug 2026)
 * Ported from api/src/services/encryption.js, which wraps a per-value AES
 * data key using an Azure Key Vault key (envelope encryption via
 * CryptographyClient.wrapKey/unwrapKey). There is no Key Vault equivalent
 * on Vercel/Neon — AWS KMS is the direct analog used instead, below.
 *
 * WHY AWS KMS, NOT A VERCEL-NATIVE OPTION: Vercel has no KMS-equivalent
 * product of its own for application use — confirmed by checking, not
 * assuming (Vercel Workflow has built-in encryption, but scoped to its
 * own event log, not a general API). Vercel's own platform actually runs
 * on AWS KMS internally per their DPA, and AWS is itself a Vercel
 * Marketplace-listed integration category (same path Neon is reached
 * through) — so this isn't reaching outside the Vercel ecosystem, it's
 * one of the sanctioned paths within it.
 *
 * §112 — FLAG-GATED, NOT MANDATORY: §111 shipped this as a hard
 * requirement (encrypt() threw if KMS wasn't configured), which would
 * have broken Lead creation the moment it deployed, before Mark had
 * actually set up AWS. Mark asked for the wiring to exist without
 * forcing that sequencing — security.kmsEncryption.enabled (Core tier,
 * off by default, same safe-by-default convention as every other flag in
 * this table) now controls which path encrypt() takes for NEW values:
 *   - Flag off (the default, and the state on every fresh deploy until
 *     Mark deliberately turns it on): encrypt() uses the original
 *     DEMO_ENCRYPTION_KEY-wrapped 'demo1' scheme — the exact same path
 *     that existed before §111, so the app keeps working with zero AWS
 *     setup required.
 *   - Flag on: encrypt() uses KMS ('kms1'). If AWS isn't actually
 *     configured at this point, it throws a clear, actionable error —
 *     deliberately NOT a silent fallback to demo1. Mark turning this
 *     flag on is a deliberate statement of intent ("KMS is ready"); a
 *     silent downgrade at that point would look like hardening is active
 *     when it isn't, which is worse than a loud failure.
 * decrypt() is unaffected by the flag either way — it always reads
 * whichever format a given value actually was encrypted with ('kms1' or
 * 'demo1'), branching on the marker already embedded in the payload, so
 * flipping the flag on or off never breaks reading anything already
 * encrypted under the other scheme.
 *
 * TWO FORMATS COEXIST, DELIBERATELY — not a stopgap. Any Lead.idNumber
 * encrypted under 'demo1' (whether from before §111 entirely, or written
 * while the flag was off) stays permanently decryptable, since
 * DEMO_ENCRYPTION_KEY and its decrypt path are kept, not removed, for
 * exactly this reason. The format marker existed in the original file
 * specifically to make a transition like this possible without a
 * disruptive one-time re-encryption migration.
 *
 * WHAT ACTUALLY CHANGES WHEN THE FLAG IS ON: the per-value data key is
 * still generated locally and still does the real AES-256-GCM encrypt/
 * decrypt of the plaintext — that part was never the weak link. What
 * changes is how that one small data key gets wrapped: previously (and
 * still, when the flag is off), a second local AES-256-GCM operation
 * using DEMO_ENCRYPTION_KEY (a master key sitting directly in a Vercel
 * environment variable, readable by anyone with project access, with no
 * rotation, no access log, no revocation). With the flag on, AWS KMS's
 * own Encrypt/Decrypt API does the wrapping instead — the master key
 * material never leaves KMS, ever; Vercel only ever holds a narrowly-
 * scoped IAM credential that can invoke kms:Encrypt/kms:Decrypt against
 * this one key and nothing else. Every wrap/unwrap is logged in AWS
 * CloudTrail, tied to that credential.
 *
 * REQUIRED BEFORE TURNING THE FLAG ON — set these first, not after:
 *   KMS_MASTER_KEY_ID  — the KMS key's ARN or key ID
 *   AWS_REGION         — the region that key lives in
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — an IAM credential scoped
 *     to ONLY kms:Encrypt, kms:Decrypt, kms:GenerateDataKey on that one
 *     key. Picked up automatically by the AWS SDK's default credential
 *     chain — never read directly in this file.
 * Roughly $1/month flat for the Customer Managed Key itself, regardless
 * of usage — the actual Encrypt/Decrypt/GenerateDataKey API calls are
 * free up to 20,000/month, which this app's real volume won't approach.
 * AWS managed keys (genuinely free) aren't an option here — those only
 * exist for specific AWS services' own built-in encryption, not for a
 * custom application calling the KMS API directly.
 *
 * DO NOT use the demo1 (DEMO_ENCRYPTION_KEY) path, or synthetic-data
 * patterns modelled on it, for real POPIA-classified data once the KMS
 * flag is genuinely on and verified working. It exists to keep the app
 * functional before that point and to keep already-encrypted values
 * readable after.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { config } from '../config.js';
import { getFlagMeta } from './flagService.js';

let _kmsClient = null;
function getKmsClient() {
  if (_kmsClient) return _kmsClient;
  if (!config.kms.masterKeyId || !config.kms.region) {
    throw new Error(
      'security.kmsEncryption.enabled is on, but KMS_MASTER_KEY_ID and/or AWS_REGION ' +
      'are not set — see this file\u2019s header comment for the full setup (an AWS KMS key ' +
      'plus a narrowly-scoped IAM credential). AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are ' +
      'read automatically by the AWS SDK; this app never handles them directly. Turn the ' +
      'flag back off in Feature Flags if AWS isn\u2019t ready yet — encrypt() will not silently ' +
      'fall back to the weaker scheme once this flag says KMS should be in use.'
    );
  }
  _kmsClient = new KMSClient({ region: config.kms.region });
  return _kmsClient;
}

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
 * Encrypt a plaintext string. Envelope: random per-value AES-256-GCM data
 * key. The data key is wrapped by AWS KMS if security.kmsEncryption.enabled
 * is on (§112), or by the local DEMO_ENCRYPTION_KEY master key if it's
 * off — off is the default and safe-to-deploy-with-no-AWS-setup state.
 * @param {string} plaintext
 * @returns {Promise<string|null>}
 */
export async function encrypt(plaintext) {
  if (!plaintext) return null;

  const dataKey = randomBytes(32);
  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const kmsFlag = await getFlagMeta('security.kmsEncryption.enabled');
  const useKms = kmsFlag?.value === '1';

  if (useKms) {
    const kms = getKmsClient();
    const { CiphertextBlob } = await kms.send(new EncryptCommand({
      KeyId: config.kms.masterKeyId,
      Plaintext: dataKey,
    }));

    const payload = JSON.stringify({
      v: 'kms1',
      iv: iv.toString('base64'),
      wrappedKey: Buffer.from(CiphertextBlob).toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    });
    return Buffer.from(payload).toString('base64');
  }

  const masterKey = getMasterKey();
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
 * Decrypt a value produced by encrypt(). Verifies the GCM auth tag.
 * Reads BOTH 'kms1' and 'demo1' formats, branching on the embedded
 * version marker — completely independent of the current flag value, so
 * flipping security.kmsEncryption.enabled on or off never breaks reading
 * anything already encrypted under the other scheme. Do not remove the
 * demo1 branch or DEMO_ENCRYPTION_KEY without first confirming no
 * Lead.idNumber still uses that format.
 * @param {string} encryptedBase64
 * @returns {Promise<string|null>}
 */
export async function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null;

  const payload = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));

  if (payload.v === 'kms1') {
    const kms = getKmsClient();
    const { Plaintext: dataKey } = await kms.send(new DecryptCommand({
      KeyId: config.kms.masterKeyId,
      CiphertextBlob: Buffer.from(payload.wrappedKey, 'base64'),
    }));

    const iv = Buffer.from(payload.iv, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(dataKey), iv);
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  if (payload.v === 'demo1') {
    const masterKey = getMasterKey();

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

  throw new Error(`Unrecognised encryption format "${payload.v}" — decrypt() only reads 'kms1' or 'demo1'`);
}

/**
 * Deterministic keyed hash (HMAC-SHA256) — unaffected by §111/§112. This
 * never touched the master key or KMS to begin with (it's a separate
 * index key, ID_NUMBER_INDEX_KEY), so there's nothing here to flag-gate.
 * Returns null if no index key is configured.
 * @param {string} value
 * @returns {string|null}
 */
export function blindIndex(value) {
  if (!value || !config.security.blindIndexKey) return null;
  return createHmac('sha256', config.security.blindIndexKey)
    .update(value.trim())
    .digest('hex');
}

/**
 * §12a/F1 (20 Aug 2026) — thin boolean wrappers around encrypt()/
 * decrypt() above, for medicalAid/existingCover (leadService.js and
 * every other file that reads them). There is no encrypted-boolean
 * column type; a boolean is encrypted as the string 'true'/'false' and
 * parsed back on the way out. Deliberately NOT `Boolean(str)` on decrypt
 * — that coerces any non-empty string (including the literal text
 * 'false') to true, which would silently invert every stored false.
 * @param {boolean|null|undefined} value
 * @returns {Promise<string|null>}
 */
export async function encryptBoolean(value) {
  if (value === null || value === undefined) return null;
  return encrypt(String(value));
}

/**
 * @param {string|null} encryptedBase64
 * @returns {Promise<boolean|null>}
 */
export async function decryptBoolean(encryptedBase64) {
  if (!encryptedBase64) return null;
  const decrypted = await decrypt(encryptedBase64);
  return decrypted === 'true';
}
