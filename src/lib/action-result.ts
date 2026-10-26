/**
 * Return shape for server actions whose caller shows the outcome inline
 * (editors that save a whole JSON blob, the public move-in form). Expected
 * failures are values, not exceptions — see Next's error-handling guide.
 *
 * `userMessage` turns whatever was thrown into one line safe to show: zod's
 * first issue, our own `throw new Error("Keep at least one …")`, or a generic
 * line for anything that smells like infrastructure (Prisma, network). The
 * full error is always logged server-side by src/lib/server-action.ts.
 *
 * `callAction` is the client side of the same idea: wrap every awaited
 * server action call in it, so a call that throws in the browser (no signal,
 * a dropped connection, a deploy that retired the action) comes back as a
 * failed result instead of throwing out of the transition, which would swap
 * the page for the error screen and lose what was typed.
 */
import { unstable_rethrow } from "next/navigation";

/** One plain message per field name, for the field's own error line (forms 2.12). */
export type FieldErrors = Record<string, string>;

/**
 * A save refused because the record changed since the editor loaded it: the
 * stale fields, who saved them when the row records it, when, and their
 * values (forms 2.12). The line on the one open field reads from it.
 */
export type ActionConflict = { fields: string[]; by?: string; at: string; theirs?: Record<string, string> };

/**
 * A failure carries one line in `error`. `fieldErrors` and `conflict` are the
 * save pipeline's richer answers; until it lands (forms 2.12) no action sets
 * them, and every caller still reads `error`.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors; conflict?: ActionConflict };

/** Optimistic-concurrency failure: the row changed since the editor loaded it. */
export const CONFLICT_MESSAGE =
  "Someone else saved changes to this since you opened it. Reload the page to see the latest, then reapply your edit.";

export const GENERIC_ERROR = "Something went wrong saving that. Try again; if it keeps happening, reload the page.";

/** A server action call that never reached the server, or whose answer never came back. One line at 320. */
export const OFFLINE_ERROR = "No connection. Try again.";

// What fetch rejects with when the network is down or drops mid-request:
// Chrome, Firefox, Safari (old and new), and Node's undici.
const NETWORK_FAILURE =
  /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|The Internet connection appears to be offline\.?|The network connection was lost\.?|The request timed out\.?|Network request failed|network error|fetch failed)$/i;

/** Whether a thrown call failed for want of a connection, as opposed to a bug or a refusal. */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError && NETWORK_FAILURE.test(err.message);
}

/**
 * Calls a server action from the browser and always settles to a result.
 * A dropped connection becomes OFFLINE_ERROR; anything else thrown becomes
 * GENERIC_ERROR. Next's own control flow is let through: an action that
 * calls redirect() or notFound() rejects with Next's error on the client,
 * and the router needs it to keep going.
 *
 *   const res = await callAction(() => postJobUpdateAction(taskId, input));
 *   if (!res.ok) toast({ message: res.error });
 */
export async function callAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, error: isOfflineError(err) ? OFFLINE_ERROR : GENERIC_ERROR };
  }
}

interface ZodLikeIssue {
  path?: (string | number)[];
  message?: string;
}

function isZodLike(err: unknown): err is { issues: ZodLikeIssue[] } {
  return !!err && typeof err === "object" && Array.isArray((err as { issues?: unknown }).issues);
}

export function userMessage(err: unknown): string {
  if (isZodLike(err)) {
    const first = err.issues[0];
    const where = first?.path?.length ? first.path.join(".") : "input";
    return `Invalid ${where}: ${first?.message ?? "check the value"}`;
  }
  if (err instanceof Error) {
    if (err.name.startsWith("PrismaClient")) return GENERIC_ERROR;
    if (!err.message || err.message.length > 200) return GENERIC_ERROR;
    if (/ECONN|ETIMEDOUT|fetch failed|Invocation|Server Components render/i.test(err.message)) return GENERIC_ERROR;
    return err.message;
  }
  return GENERIC_ERROR;
}
