import "server-only";
import type { QuickbooksConnection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { qbo } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";
import { QboOAuthError, refreshTokens } from "./oauth";

/**
 * Authenticated QuickBooks REST client.
 *
 * `withFreshToken` is only ever called from inside `runQuickbooksSync`, which
 * holds the `QboSyncRun` row lock — so no two refreshes race, and the rotated
 * refresh token is always persisted (in its own UPDATE) before it is used.
 */

export class QboReconnectRequired extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "QboReconnectRequired";
  }
}
export class QboApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`QuickBooks API ${status}: ${body.slice(0, 300)}`);
    this.name = "QboApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The single connection row, or null. */
export function getConnection(): Promise<QuickbooksConnection | null> {
  return prisma.quickbooksConnection.findFirst({ orderBy: { createdAt: "desc" } });
}

export async function requireActiveConnection(): Promise<QuickbooksConnection> {
  const conn = await getConnection();
  if (!conn) throw new QboReconnectRequired("QuickBooks is not connected");
  if (conn.status !== "ACTIVE") {
    throw new QboReconnectRequired(`QuickBooks connection is ${conn.status.toLowerCase()}`);
  }
  return conn;
}

const ACCESS_SKEW_MS = 5 * 60_000;

export async function withFreshToken(
  conn: QuickbooksConnection,
): Promise<{ accessToken: string; conn: QuickbooksConnection }> {
  if (conn.accessTokenExpiresAt.getTime() > Date.now() + ACCESS_SKEW_MS) {
    return { accessToken: decryptSecret(conn.accessTokenEnc), conn };
  }

  let tokens;
  try {
    tokens = await refreshTokens(decryptSecret(conn.refreshTokenEnc));
  } catch (err) {
    if (err instanceof QboOAuthError && err.isInvalidGrant && conn.prevRefreshTokenEnc) {
      try {
        tokens = await refreshTokens(decryptSecret(conn.prevRefreshTokenEnc));
      } catch {
        /* fall through to EXPIRED */
      }
    }
    if (!tokens) {
      await prisma.quickbooksConnection.update({
        where: { id: conn.id },
        data: { status: "EXPIRED" },
      });
      throw new QboReconnectRequired("QuickBooks token refresh failed — reconnect required", {
        cause: err,
      });
    }
  }

  // Persist the (possibly rotated) refresh token BEFORE any API call uses it.
  const updated = await prisma.quickbooksConnection.update({
    where: { id: conn.id },
    data: {
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      prevRefreshTokenEnc: conn.refreshTokenEnc,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      tokenRefreshedAt: new Date(),
      status: "ACTIVE",
    },
  });
  return { accessToken: tokens.accessToken, conn: updated };
}

async function qboFetch(pathAndQuery: string, accessToken: string, attempt = 0): Promise<unknown> {
  const res = await fetch(`${qbo.apiBase()}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 3) throw new QboApiError(res.status, await res.text());
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000;
    await sleep(Math.min(waitMs, 30_000));
    return qboFetch(pathAndQuery, accessToken, attempt + 1);
  }
  if (!res.ok) throw new QboApiError(res.status, await res.text());
  return res.json();
}

export async function query<T = Record<string, unknown>>(
  realmId: string,
  entity: string,
  accessToken: string,
): Promise<T[]> {
  const out: T[] = [];
  let start = 1;
  const PAGE = 1000;
  for (;;) {
    // Always `SELECT *`: QBO's query language rejects an explicit column list
    // that names a reference-type field (e.g. `ParentRef`) with a generic
    // "QueryProcessingError" — confirmed live against the sandbox. `SELECT *`
    // returns the full object regardless, so there's no payload cost to it.
    const q = `SELECT * FROM ${entity} WHERE Active IN (true, false) STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
    const json = (await qboFetch(
      `/v3/company/${realmId}/query?query=${encodeURIComponent(q)}&minorversion=${qbo.minorVersion}`,
      accessToken,
    )) as { QueryResponse?: Record<string, T[]> };
    const rows = json.QueryResponse?.[entity] ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    start += PAGE;
  }
}

export function report(
  realmId: string,
  name: "ProfitAndLoss" | "ProfitAndLossDetail",
  params: Record<string, string>,
  accessToken: string,
): Promise<unknown> {
  const p = new URLSearchParams({ ...params, minorversion: qbo.minorVersion });
  return qboFetch(`/v3/company/${realmId}/reports/${name}?${p.toString()}`, accessToken);
}
