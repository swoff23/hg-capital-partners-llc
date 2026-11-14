import "server-only";
import { unstable_rethrow } from "next/navigation";
import { type ActionResult, GENERIC_ERROR, toFailure } from "./action-result";
import { logError } from "./log";

/**
 * Wrappers for the body of a server action. Both let Next's own control-flow
 * exceptions (redirect(), notFound()) through untouched, and log everything
 * else as one structured line with the action's name.
 *
 *   withResult — for actions whose caller renders the outcome inline: the
 *                failure becomes `{ ok: false, error }` instead of a crash.
 *                Only a failure that shows GENERIC_ERROR is reported as an
 *                error (docs/specs/error-alerts.md, Q7): a conflict, a field
 *                message or a plain refusal is the app working.
 *   withLog    — for fire-and-forget mutations (inline patches, form posts):
 *                the error is logged, then rethrown to the route's error
 *                boundary, which offers "Try again". It isn't reported here:
 *                Next's onRequestError (src/instrumentation.ts) reports it once.
 *
 * "use server" files must export async functions, so these are called inside
 * the action rather than used to define it:
 *
 *   export async function saveX(input: unknown): Promise<ActionResult<X>> {
 *     return withResult("saveX", async () => { ... });
 *   }
 */
export async function withResult<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    const failure = toFailure(err);
    logError(`action:${name}`, err, {}, { report: failure.error === GENERIC_ERROR });
    return failure;
  }
}

export async function withLog<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    logError(`action:${name}`, err, {}, { report: false });
    throw err;
  }
}
