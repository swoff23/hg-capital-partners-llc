import crypto from "node:crypto";

/**
 * AES-256-GCM for the QuickBooks tokens at rest. Key = 32 bytes, base64 in
 * `QBO_TOKEN_SECRET` (generate: `openssl rand -base64 32`). Rotating the secret
 * invalidates every stored token -> a one-time Reconnect (documented, acceptable
 * for a single connection).
 *
 * Wire format (base64): iv(12) || authTag(16) || ciphertext
 * Values are never logged and never cross the server boundary.
 */

export class QboCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QboCryptoError";
  }
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.QBO_TOKEN_SECRET;
  if (!raw) throw new QboCryptoError("QBO_TOKEN_SECRET is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new QboCryptoError(
      `QBO_TOKEN_SECRET must decode to 32 bytes (got ${key.length}) — use \`openssl rand -base64 32\``,
    );
  }
  cachedKey = key;
  return key;
}

/** For tests: clear the module key cache after changing the env var. */
export function _resetKeyCache(): void {
  cachedKey = null;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  let buf: Buffer;
  try {
    buf = Buffer.from(ciphertext, "base64");
  } catch {
    throw new QboCryptoError("token ciphertext is not valid base64");
  }
  if (buf.length < 12 + 16 + 1) throw new QboCryptoError("token ciphertext is too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new QboCryptoError("token decryption failed — wrong key or tampered ciphertext");
  }
}
