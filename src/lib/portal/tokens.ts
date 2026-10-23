import crypto from "node:crypto";

/**
 * Secrets for contractor sign-in. Pure (no `server-only`, no env reads) so
 * tests and tests/devices/setup.ts can use it; see tokens.test.ts.
 *
 * Session cookies and reset links carry 32 random bytes. The database keeps
 * only their SHA-256, so a leaked table can't be replayed as cookies or links.
 * IPs and typed-in emails in the audit log are keyed hashes: stable enough to
 * count requests by, not reversible by brute-forcing the IPv4 space.
 */

export const TOKEN_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes as unpadded base64url

export function newToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Shape check before any hashing or lookup. Rejects anything we didn't mint. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/** What PortalSession.tokenHash and PasswordResetToken.tokenHash store. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** HMAC of a value under a purpose label, so one secret yields unrelated hashes per use. */
export function keyedHash(purpose: "ip" | "email", value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`hg-portal:${purpose}:${value}`, "utf8").digest("hex");
}

// No 0/o, 1/l/i: a starting password is read off a text message and typed
// on a phone.
export const STARTING_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * A starting password like "k7mq-4vxp-2hzt": 12 random characters (about 59
 * bits) in three groups. Staff send it by text; the first sign-in replaces it.
 */
export function generateStartingPassword(randomInt: (max: number) => number = (max) => crypto.randomInt(max)): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) group += STARTING_PASSWORD_ALPHABET[randomInt(STARTING_PASSWORD_ALPHABET.length)];
    groups.push(group);
  }
  return groups.join("-");
}
