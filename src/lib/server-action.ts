import "server-only";
import { unstable_rethrow } from "next/navigation";
import { type ActionResult, userMessage } from "./action-result";
import { logError } from "./log";

/**
 * Wrappers for the body of a server action. Both let Next's own control-flow
 * exceptions (redirect(), notFound()) through untouched, and log everything
 * else as one structured line with the action's name.
 *
 *   withResult — for actions whose caller renders the outcome inline: the
 *                failure becomes `{ ok: false, error }` instead of a crash.
 *   withLog    — for fire-and-forget mutations (inline patches, form posts):
 *                the error is logged, then rethrown to the route's error
 *                boundary, which offers "Try again".
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
    logError(`action:${name}`, err);
    return { ok: false, error: userMessage(err) };
  }
}

export async function withLog<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    logError(`action:${name}`, err);
    throw err;
  }
}
