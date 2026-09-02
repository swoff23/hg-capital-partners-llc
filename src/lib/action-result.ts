/**
 * Return shape for server actions whose caller shows the outcome inline
 * (editors that save a whole JSON blob, the public move-in form). Expected
 * failures are values, not exceptions — see Next's error-handling guide.
 *
 * `userMessage` turns whatever was thrown into one line safe to show: zod's
 * first issue, our own `throw new Error("Keep at least one …")`, or a generic
 * line for anything that smells like infrastructure (Prisma, network). The
 * full error is always logged server-side by src/lib/server-action.ts.
 */

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Optimistic-concurrency failure: the row changed since the editor loaded it. */
export const CONFLICT_MESSAGE =
  "Someone else saved changes to this since you opened it. Reload the page to see the latest, then reapply your edit.";

export const GENERIC_ERROR = "Something went wrong saving that. Try again; if it keeps happening, reload the page.";

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
