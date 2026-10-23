import { PORTAL_SESSION_TTL_MS } from "./limits";

/**
 * The contractor session cookie, kept apart from the staff `hgos_session` so
 * getCurrentUser() never sees it (docs/asana-migration-plan.md §5.1). Pure;
 * see cookie.test.ts.
 *
 * On HTTPS the name carries the `__Host-` prefix, which browsers accept only
 * with Secure, Path=/ and no Domain, so a sibling subdomain can't plant one.
 * Local http (next dev, the device check) can't set a Secure cookie, so it
 * gets the plain name. Reading uses the same rule, so an http-style cookie is
 * never accepted on the HTTPS site.
 */
export const PORTAL_COOKIE_HTTPS = "__Host-hg_portal";
export const PORTAL_COOKIE_HTTP = "hg_portal";

export interface PortalCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export interface PortalCookie {
  name: string;
  options: PortalCookieOptions;
}

/** HTTPS when deployed on Vercel (any VERCEL_ENV) or when the proxy in front says so. */
export function isHttpsRequest(input: { vercelEnv?: string | null; forwardedProto?: string | null }): boolean {
  if (input.vercelEnv) return true;
  const first = input.forwardedProto?.split(",")[0]?.trim().toLowerCase();
  return first === "https";
}

export function portalCookie(https: boolean): PortalCookie {
  return {
    name: https ? PORTAL_COOKIE_HTTPS : PORTAL_COOKIE_HTTP,
    options: {
      httpOnly: true,
      secure: https,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(PORTAL_SESSION_TTL_MS / 1000),
    },
  };
}
