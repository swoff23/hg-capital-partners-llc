import "server-only";

/**
 * QuickBooks Online environment + endpoint config. Secrets are read from
 * process.env at call time (matching the rest of the app — no central secret
 * module). Only `oauth.ts` / `client.ts` import this.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} — QuickBooks integration is not configured`);
  return v;
}

export type QboEnvironment = "sandbox" | "production";

export const qbo = {
  clientId: () => required("QBO_CLIENT_ID"),
  clientSecret: () => required("QBO_CLIENT_SECRET"),
  redirectUri: () => required("QBO_REDIRECT_URI"),
  tokenSecret: () => required("QBO_TOKEN_SECRET"),

  environment(): QboEnvironment {
    return process.env.QBO_ENVIRONMENT === "production" ? "production" : "sandbox";
  },

  /** True once the minimum env is present — gates the "Connect" UI. */
  isConfigured(): boolean {
    return !!(
      process.env.QBO_CLIENT_ID &&
      process.env.QBO_CLIENT_SECRET &&
      process.env.QBO_REDIRECT_URI &&
      process.env.QBO_TOKEN_SECRET
    );
  },

  apiBase(): string {
    return this.environment() === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";
  },

  // OAuth endpoints — identical for sandbox and production; only the keys differ.
  authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
  tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revokeUrl: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",

  scope: "com.intuit.quickbooks.accounting",
  /** Pin explicitly; bump only after checking the changelog + re-capturing fixtures. */
  minorVersion: "75",

  /** Reconciliation tolerance — cents per cell. */
  reconcileToleranceCents: 1,
  /** Wall-clock budget for one sync run (Hobby function cap is 60s). */
  syncBudgetMs: 45_000,
} as const;
