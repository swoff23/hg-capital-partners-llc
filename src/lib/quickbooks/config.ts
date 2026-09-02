import "server-only";
import { getEnv } from "@/lib/env";

/**
 * QuickBooks Online environment + endpoint config. Secrets come from the
 * validated env (src/lib/env.ts). `getEnv().qbo` is all-or-nothing: null
 * unless every required key is set, which is what gates the "Connect" UI.
 */

export type QboEnvironment = "sandbox" | "production";

function required() {
  const q = getEnv().qbo;
  if (!q) throw new Error("QuickBooks integration is not configured — set QBO_CLIENT_ID / SECRET / REDIRECT_URI / TOKEN_SECRET");
  return q;
}

export const qbo = {
  clientId: () => required().clientId,
  clientSecret: () => required().clientSecret,
  redirectUri: () => required().redirectUri,
  tokenSecret: () => required().tokenSecret,

  environment(): QboEnvironment {
    return getEnv().qbo?.environment ?? getEnv().QBO_ENVIRONMENT;
  },

  /** First month of history to pull, "YYYY-MM". */
  historyStart(): string {
    return getEnv().qbo?.historyStart ?? getEnv().QBO_HISTORY_START ?? "2026-01";
  },

  /** True once the minimum env is present — gates the "Connect" UI. */
  isConfigured(): boolean {
    return getEnv().qbo !== null;
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
