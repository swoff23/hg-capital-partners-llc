import { getEnv } from "@/lib/env";
import { requestIpHash } from "@/lib/portal/request";
import { startPortalSession } from "@/lib/portal/session";
import { finishSignInLink } from "@/lib/portal/sign-in-link";

export const dynamic = "force-dynamic";

/**
 * The Sign in button on a sign-in link's page posts here
 * (docs/specs/contractor-scheduled-date.md section 12).
 *
 * A route handler rather than a server action for the reset link's reason
 * (login/reset/submit/route.ts): the page sends `Referrer-Policy:
 * no-referrer`, so the form's POST carries `Origin: null`, which Next's
 * server action check turns away. Nothing here needs that check: the request
 * does nothing without a live, single-use token, and anyone holding one could
 * use it directly. It replaces whatever session the browser had (an email's
 * job link, or another login) with a full one for the link's login, which
 * then goes through the usual rules (setup first, for someone mid-setup). A
 * login still on its starting password goes to Choose a new password instead,
 * with no session yet (sign-in-link.ts finishSignInLink).
 *
 * A post from another site is turned away: it could otherwise sign a visitor's
 * browser in as the link's login (login CSRF). Sec-Fetch-Site says where the
 * form was, even under the page's no-referrer, which blanks Origin; a browser
 * too old to send it is let through, as the token is still the check.
 */
export async function POST(request: Request): Promise<Response> {
  if (!getEnv().portalEnabled) return new Response("Not found", { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Not a form post (wrong content type or a broken body): nothing to do.
    return seeOther("/login");
  }
  const raw = form.get("token");
  const token = typeof raw === "string" ? raw : "";
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return seeOther(`/login/link?token=${encodeURIComponent(token)}`);

  const result = await finishSignInLink(token, await requestIpHash());
  // Used, expired or turned off since the page loaded: its page says so.
  if (!result) return seeOther(`/login/link?token=${encodeURIComponent(token)}`);
  if (result.kind === "choose-password") return seeOther(`/login/reset?token=${encodeURIComponent(result.resetToken)}`);

  await startPortalSession(result.link.accountId);
  return seeOther("/p");
}

/** 303 so the browser follows with a GET. */
function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
