import "server-only";
import crypto from "node:crypto";

/**
 * Tiny signed-cookie session. Value is `email.hmac`. No DB, no third-party auth.
 * Secret comes from SESSION_SECRET in production; a dev fallback keeps localhost working.
 */
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-in-prod";

export const SESSION_COOKIE = "hgos_session";

export function signSession(email: string): string {
  const mac = crypto.createHmac("sha256", SECRET).update(email).digest("base64url");
  return `${Buffer.from(email).toString("base64url")}.${mac}`;
}

export function readSession(value: string | undefined): string | null {
  if (!value || !value.includes(".")) return null;
  const [encEmail, mac] = value.split(".");
  let email: string;
  try {
    email = Buffer.from(encEmail, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", SECRET).update(email).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return email.toLowerCase();
}

/** Constant-time password check. */
export function passwordMatches(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
