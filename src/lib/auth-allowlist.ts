/**
 * Who can sign in. Each person has an email (their identity in the app) and a
 * password supplied via an environment variable in production.
 *
 * To add someone: add a row here + create the matching User (npm run migrate users).
 */
export const USERS = [
  { name: "Connor Swofford", email: "connoraswofford@gmail.com", passwordEnv: "CONNOR_PASSWORD" },
  { name: "Pieter Louw", email: "pieter@queencitycorp.com", passwordEnv: "PIETER_PASSWORD" },
] as const;

export const ALLOWED_EMAILS = USERS.map((u) => u.email.toLowerCase());

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}

/** In production every user needs a password env var set. If none are, we're in dev mode. */
export const AUTH_CONFIGURED = USERS.some((u) => !!process.env[u.passwordEnv]);
