import crypto from "node:crypto";

/**
 * Password hashing. scrypt via node:crypto — no dependency, matches the
 * hand-rolled crypto already in session.ts ("No DB, no third-party auth").
 * Stored format: "<saltHex>.<hashHex>".
 *
 * No "server-only" guard, unlike session.ts — this module is also imported
 * directly by scripts/backfill-password-hashes.ts outside of Next's runtime,
 * where that package doesn't resolve. Same tradeoff src/lib/db.ts already
 * makes for the same reason.
 */
const KEY_LEN = 64;

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return scrypt(password, salt).then((hash) => `${salt}.${hash}`);
}

/**
 * Verifies against a stored hash from hashPassword(). Always runs the scrypt
 * computation, even when `stored` is missing or malformed — a fixed-shape
 * dummy salt keeps an "unknown email" response taking the same time as a
 * "known email, wrong password" one, so a timing difference can't reveal
 * which emails exist.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [salt, hashHex] = stored?.includes(".") ? stored.split(".") : [DUMMY_SALT, DUMMY_HASH_HEX];
  const expected = Buffer.from(hashHex, "hex");
  const actual = Buffer.from(await scrypt(password, salt), "hex");
  if (!stored) return false;
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const DUMMY_SALT = "0".repeat(32);
const DUMMY_HASH_HEX = "0".repeat(KEY_LEN * 2);

function scrypt(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}
