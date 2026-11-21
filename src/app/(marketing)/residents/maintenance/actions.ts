"use server";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { clientIp, RateLimiter } from "@/lib/rate-limit";
import { emailLinkToAddress } from "@/lib/residents/service";
import { withResult } from "@/lib/server-action";

// Public, like the move-in form: no sign-in. It only ever emails a link to an
// address already on a current tenant's record, and says the same thing
// whether or not one matched, so it can't be used to learn who lives where.
// Abuse protection: a honeypot, 5 an hour per IP and 40 a day in all.
const perIp = new RateLimiter(5, 60 * 60_000);
const globalCap = new RateLimiter(40, 24 * 60 * 60_000);

const input = z.object({ email: z.string().trim().email().max(200), honeypot: z.string().max(200).optional() });

/** Email me my link (docs/specs/maintenance-requests.md, section 3.7). */
export async function emailMyLink(raw: unknown): Promise<ActionResult> {
  return withResult("emailMyLink", async () => {
    const parsed = input.safeParse(raw);
    if (!parsed.success) throw new Error("Enter the email we have on file.");
    if (parsed.data.honeypot) return;
    const ip = clientIp(await headers());
    if (!perIp.allow(ip).ok || !globalCap.allow("resident-link").ok) {
      throw new Error("Too many tries right now. Text us in our group chat instead.");
    }
    perIp.prune();
    // After the answer, so how long it takes never says whether the email is on file.
    const email = parsed.data.email;
    after(() => emailLinkToAddress(email));
  });
}
