"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { type ActionFailure, type ActionResult, GENERIC_ERROR, toFailure } from "@/lib/action-result";
import { clientIp, RateLimiter } from "@/lib/rate-limit";
import { withResult } from "@/lib/server-action";
import { JOIN_FAILED, TOO_MANY_FROM_YOU, WAITLIST_FIELDS, honeypotFilled, readSignUp } from "@/lib/waitlist/fields";
import * as waitlist from "@/lib/waitlist/service";

// Public on purpose, like the move-in form: no requireUser() below. Anyone on
// Rentals can sign up for a coming-soon home (docs/specs/coming-soon.md 3.4).
// Abuse protection: zod bounds, a honeypot, a per-IP limit (5 an hour, in
// memory, per instance) and a daily cap of 200 new rows across every listing,
// counted in the database (lib/waitlist/core.ts), so it holds across
// instances. Nothing is emailed, so the list is the only thing a script could
// fill.
const perIp = new RateLimiter(5, 60 * 60_000);

// Loose bounds on what's posted, so a script can't send megabytes, then the
// form's own rules from fields.ts, the same ones the browser ran, so the two
// can't disagree. A field that doesn't read is an issue under its name.
const joinSchema = z
  .object({
    listingId: z.string().min(1).max(40),
    firstName: z.string().max(500),
    email: z.string().max(500),
    phone: z.string().max(500).default(""),
    honeypot: z.string().max(200).optional(),
  })
  .transform((v, ctx) => {
    const read = readSignUp(v);
    if (read.ok) return { listingId: v.listingId, honeypot: v.honeypot, signUp: read.data };
    for (const [field, message] of Object.entries(read.problems)) ctx.addIssue({ code: "custom", path: [field], message });
    return z.NEVER;
  });

/**
 * Notify me: puts the visitor on a coming-soon listing's list, or updates
 * their name and phone when that email is on it already. The answer is an
 * ActionResult: a field that doesn't read comes back in `fieldErrors` under
 * its name, and a refusal (the visitor's limit, the daily cap, a listing
 * that isn't taking sign-ups) as its own line. Only the generic line is
 * swapped, for one that doesn't send them to reload a page they've typed
 * into. `firstName` is the name as stored, for the thank-you.
 */
export async function joinWaitlist(input: unknown): Promise<ActionResult<{ firstName: string }>> {
  const r = await withResult("joinWaitlist", () => joinWaitlistBody(input));
  const result = r.ok ? r.data : r;
  return !result.ok && result.error === GENERIC_ERROR ? { ...result, error: JOIN_FAILED } : result;
}

async function joinWaitlistBody(input: unknown): Promise<ActionResult<{ firstName: string }>> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return formFailure(parsed.error);
  const { listingId, honeypot, signUp } = parsed.data;

  // Honeypot: the same thank-you, nothing saved, nothing to tip off a bot.
  if (honeypotFilled(honeypot)) return { ok: true, data: { firstName: signUp.firstName } };

  if (!perIp.allow(clientIp(await headers())).ok) return { ok: false, error: TOO_MANY_FROM_YOU };
  perIp.prune();

  await waitlist.join(listingId, signUp);
  return { ok: true, data: { firstName: signUp.firstName } };
}

/**
 * A post that doesn't read: the form's fields keep their own lines, and the
 * first is the form's line too. Anything else (no listing id, not an object)
 * is a page out of date or a script, which gets the generic line.
 */
function formFailure(err: z.ZodError): ActionFailure {
  const { fieldErrors = {} } = toFailure(err);
  const lines = Object.fromEntries(WAITLIST_FIELDS.filter((f) => fieldErrors[f]).map((f) => [f, fieldErrors[f]]));
  const first = Object.values(lines)[0];
  return first ? { ok: false, error: first, fieldErrors: lines } : { ok: false, error: JOIN_FAILED };
}
