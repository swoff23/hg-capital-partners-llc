import { getEnv } from "@/lib/env";
import { finishPasswordReset } from "@/lib/portal/reset";
import { getPortalPrincipal } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

/**
 * The form on a password reset link posts here.
 *
 * A route handler rather than a server action because the reset page sends
 * `Referrer-Policy: no-referrer` (its URL carries the token), and under that
 * policy browsers send `Origin: null` on the form's POST, which Next's server
 * action origin check rejects. Nothing here needs that check: the request
 * does nothing without a live, single-use token, and anyone holding one
 * could use it directly. The signed-in contractor, if any, is read only to
 * keep their current session when the link is for their own account.
 */
export async function POST(request: Request): Promise<Response> {
  if (!getEnv().portalEnabled) return new Response("Not found", { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Not a form post (wrong content type or a broken body): nothing to do.
    return seeOther("/login/forgot");
  }
  const token = String(form.get("token") ?? "");
  const result = await finishPasswordReset(
    token,
    String(form.get("password") ?? ""),
    String(form.get("confirm") ?? ""),
    // A reset clears mustChangePassword, so a session still on its starting
    // password is kept like any other.
    await getPortalPrincipal({ allowStartingPassword: true }),
  );

  let location = "/login?notice=reset";
  if (!result.ok) {
    location = `/login/reset?token=${encodeURIComponent(token)}`;
    if (result.error !== "expired") location += `&error=${result.error}`;
  }
  return seeOther(location);
}

/** 303 so the browser follows with a GET. */
function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
