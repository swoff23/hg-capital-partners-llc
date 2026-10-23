import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";
import { clientIp } from "@/lib/rate-limit";
import { isHttpsRequest, portalCookie, type PortalCookie } from "./cookie";
import { keyedHash } from "./tokens";

/** Facts about the current request that sign-in and the audit log need. */

/** The portal cookie's name and options for this request's scheme. */
export async function portalCookieForRequest(): Promise<PortalCookie> {
  const h = await headers();
  return portalCookie(isHttpsRequest({ vercelEnv: getEnv().VERCEL_ENV, forwardedProto: h.get("x-forwarded-proto") }));
}

/** SecurityEvent.ipHash for this request. */
export async function requestIpHash(): Promise<string> {
  return keyedHash("ip", clientIp(await headers()), getEnv().sessionSecret);
}

export async function requestUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}

/** Audit-log key for an email someone typed, so unknown addresses aren't stored in the clear. */
export function emailHash(email: string): string {
  return keyedHash("email", email, getEnv().sessionSecret);
}
