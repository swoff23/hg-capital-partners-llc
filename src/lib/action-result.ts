/**
 * Return shape for server actions whose caller shows the outcome inline
 * (editors that save a whole JSON blob, the public move-in form). Expected
 * failures are values, not exceptions — see Next's error-handling guide.
 *
 * `userMessage` turns whatever was thrown into one line safe to show: zod's
 * first issue, our own `throw new Error("Keep at least one …")`, or a generic
 * line for anything that smells like infrastructure (Prisma, network). The
 * full error is always logged server-side by src/lib/server-action.ts.
 * `toFailure` is the whole failed result `withResult` returns: that line,
 * plus each field's own line from a zod failure and a `ConflictError`'s who,
 * what and when (forms 2.12).
 *
 * `callAction` is the client side of the same idea: wrap every awaited
 * server action call in it, so a call that throws in the browser (no signal,
 * a dropped connection, a deploy that retired the action) comes back as a
 * failed result instead of throwing out of the transition, which would swap
 * the page for the error screen and lose what was typed.
 *
 * Messages written for people end with a period: "Enter the address." A zod
 * schema carries them (`z.string().min(4, "Enter the full street address,
 * like 123 Main St.")`), and they reach the screen as written. zod's own
 * defaults never end with one ("Too small: expected string to have >=4
 * characters"), so they're developer text: the form-level line keeps today's
 * "Invalid address: …" for them and a field's line says "Check this value."
 */
import { unstable_rethrow } from "next/navigation";
import { HG_TIME_ZONE, fmtDay, todayYmdEastern } from "./dates";
import { firstName } from "./names";

/** One plain message per field name, for the field's own error line (forms 2.12). */
export type FieldErrors = Record<string, string>;

/**
 * A save refused because the record changed since the editor loaded it: the
 * stale fields, who saved them when the row records it (a name; absent when
 * it doesn't), when (an ISO instant), and their values as text (forms 2.12).
 * The line on the one open field reads from it ("Pieter set this to $410,000
 * at 2:14 PM", with "Keep Pieter's" and "Save mine").
 */
export type ActionConflict = { fields: string[]; by?: string; at: string; theirs?: Record<string, string> };

/**
 * A failure carries one line in `error`, which every caller can show as it
 * is (a toast, the line above a primary). A form that shows failures in
 * place also reads `fieldErrors` (a zod failure's per-field lines) and
 * `conflict` (a `ConflictError`).
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors; conflict?: ActionConflict };

/** The failed half of ActionResult. */
export type ActionFailure = Extract<ActionResult<unknown>, { ok: false }>;

/**
 * Optimistic-concurrency failure: the row changed since the editor loaded it.
 * Retiring: services move to `ConflictError`, which names who and when, as
 * their editors learn to show it (forms 2.12).
 */
export const CONFLICT_MESSAGE =
  "Someone else saved changes to this since you opened it. Reload the page to see the latest, then reapply your edit.";

/** When a conflicting save happened, in Buffalo time: "at 2:14 PM" today, "on Oct 24" before. */
export function conflictWhen(at: string | Date, now: Date = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  if (todayYmdEastern(d) === todayYmdEastern(now)) {
    return `at ${d.toLocaleTimeString("en-US", { timeZone: HG_TIME_ZONE, hour: "numeric", minute: "2-digit" })}`;
  }
  return `on ${fmtDay(todayYmdEastern(d), { year: "auto", now })}`;
}

/** Who saved, as a sentence names them: "Pieter" from "Pieter Smith", "zack" from "zack@x.com". */
export function conflictBy(by: string | null | undefined): string | undefined {
  const s = (by ?? "").trim();
  if (!s) return undefined;
  if (s.includes("@")) return s.split("@")[0] || undefined;
  return firstName(s) || undefined;
}

/**
 * The one-line form of a conflict, for a toast or the line above a primary:
 * "Pieter changed this at 2:14 PM." or, when the row doesn't say who,
 * "This changed at 2:14 PM." The field-level line with the value and the
 * Keep and Save mine buttons is the editor's (forms 2.8).
 */
export function conflictMessage(conflict: Pick<ActionConflict, "by" | "at">, now: Date = new Date()): string {
  const who = conflictBy(conflict.by);
  const when = conflictWhen(conflict.at, now);
  const tail = when ? ` ${when}` : " since you opened it";
  return who ? `${who} changed this${tail}.` : `This changed${tail}.`;
}

/**
 * The line on the one open field when its save lost to a newer one (forms
 * 2.8, 2.12): "Pieter set this to $410,000 at 2:14 PM", or, when the row
 * doesn't record who, "This changed to $410,000 at 2:14 PM". `theirs` is what
 * the field holds now, as the field shows it ("" when they cleared it).
 */
export function conflictValueLine(conflict: Pick<ActionConflict, "by" | "at">, theirs: string, now: Date = new Date()): string {
  const who = conflictBy(conflict.by);
  const when = conflictWhen(conflict.at, now);
  const tail = when ? ` ${when}` : "";
  if (theirs === "") return who ? `${who} cleared this${tail}` : `This was cleared${tail}`;
  return who ? `${who} set this to ${theirs}${tail}` : `This changed to ${theirs}${tail}`;
}

/** The button that takes the other person's value: "Keep Pieter's", or "Keep current" when the row doesn't say who. */
export function conflictKeepLabel(conflict: Pick<ActionConflict, "by">): string {
  const who = conflictBy(conflict.by);
  return who ? `Keep ${who}'s` : "Keep current";
}

/**
 * What a service throws when a save would overwrite a newer change (forms
 * 2.12), in place of `CONFLICT_MESSAGE`: the fields that moved
 * (`staleFields` knows them), who saved them when the row records it
 * (`updatedByUser` on Property and Deal, `AppConfig.updatedBy`), when, and
 * their stored values as text. `withResult` turns it into a failed result
 * with `conflict` set and `error` the one-line `conflictMessage`.
 *
 *   throw new ConflictError({ fields: ["loanRate"], by: row.updatedByUser?.name, at: row.updatedAt, theirs: { loanRate: "7.25" } });
 */
export class ConflictError extends Error {
  readonly fields: string[];
  readonly by?: string;
  readonly at: string;
  readonly theirs?: Record<string, string>;

  constructor(
    c: { fields: string[]; by?: string | null; at: Date | string; theirs?: Record<string, string> },
    message?: string,
  ) {
    const at = typeof c.at === "string" ? c.at : c.at.toISOString();
    const by = c.by?.trim() || undefined;
    super(message ?? conflictMessage({ by, at }));
    this.name = "ConflictError";
    this.fields = [...c.fields];
    this.by = by;
    this.at = at;
    if (c.theirs) this.theirs = { ...c.theirs };
  }

  /** The plain object a failed result carries; it crosses the server action boundary as JSON. */
  get conflict(): ActionConflict {
    return {
      fields: this.fields,
      at: this.at,
      ...(this.by ? { by: this.by } : {}),
      ...(this.theirs ? { theirs: this.theirs } : {}),
    };
  }
}

/**
 * A refusal a service raises for particular fields, in plain words: what a
 * zod schema would say, for a rule a schema can't hold (a phone that can't be
 * dialed, a name already taken). `withResult` returns it as `error` (the
 * first line) and `fieldErrors`, so a sheet marks the field and focuses it.
 *
 *   throw new FieldError({ email: "Enter a full email, like name@example.com." });
 */
export class FieldError extends Error {
  readonly fieldErrors: FieldErrors;

  constructor(fieldErrors: FieldErrors) {
    super(Object.values(fieldErrors)[0] ?? FIELD_FALLBACK);
    this.name = "FieldError";
    this.fieldErrors = { ...fieldErrors };
  }
}

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
  path?: PropertyKey[];
  message?: string;
}

function isZodLike(err: unknown): err is { issues: ZodLikeIssue[] } {
  return !!err && typeof err === "object" && Array.isArray((err as { issues?: unknown }).issues);
}

/** Whether a message was written for people: it ends like a sentence ("Enter the address."). zod's defaults don't. */
export function isPlainMessage(message: string | undefined): message is string {
  return !!message && /[.!?]$/.test(message.trim());
}

/** A field's line when its schema didn't say what to enter. */
export const FIELD_FALLBACK = "Check this value.";

const issuePath = (issue: ZodLikeIssue) => (issue.path ?? []).map(String).join(".");

/**
 * Each field's own line from a zod failure, keyed by the issue's path
 * ("address", "units.0.label"): the first issue for a field wins, and an
 * issue with no path belongs to the whole form, so it isn't here.
 */
export function zodFieldErrors(err: { issues: ZodLikeIssue[] }): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issuePath(issue);
    if (!key || key in out) continue;
    out[key] = isPlainMessage(issue.message) ? issue.message.trim() : FIELD_FALLBACK;
  }
  return out;
}

export function userMessage(err: unknown): string {
  if (err instanceof ConflictError || err instanceof FieldError) return err.message;
  if (isZodLike(err)) {
    const first = err.issues[0];
    if (isPlainMessage(first?.message)) return first.message.trim();
    const where = first?.path?.length ? issuePath(first) : "input";
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

/**
 * The failed result for whatever a server action threw (`withResult` returns
 * it): the one line from `userMessage`, a zod failure's `fieldErrors`, and a
 * `ConflictError`'s `conflict`.
 */
export function toFailure(err: unknown): ActionFailure {
  if (err instanceof ConflictError) return { ok: false, error: err.message, conflict: err.conflict };
  if (err instanceof FieldError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  if (isZodLike(err)) {
    const fieldErrors = zodFieldErrors(err);
    return Object.keys(fieldErrors).length > 0
      ? { ok: false, error: userMessage(err), fieldErrors }
      : { ok: false, error: userMessage(err) };
  }
  return { ok: false, error: userMessage(err) };
}
