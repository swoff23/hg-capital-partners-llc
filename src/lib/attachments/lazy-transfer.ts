import { lazyModule } from "@/lib/lazy-module";
import { NoConnectionError, UploadCodeMissingError } from "./outbox";
import type { Transfer } from "./transfer";

/** Whether the device says it is online; true where there is no navigator (the server, a test). */
const deviceOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/**
 * Where the probe asks whether the app's server answers: the app icon (app/icon.svg), a file served as it was built,
 * with no session and no database. So a slow or busy database never reads as no signal, and a probe costs no query.
 * Any answer counts, so the file needn't stay there for the probe to work.
 */
export const PROBE_PATH = "/icon.svg";

/**
 * How long the probe waits for an answer before it counts the road as down. A slow signal then reads as no signal and
 * the file waits for it, which costs nothing: the next try asks again, and Reload comes once the server answers. While
 * a probe waits, the file's tile shows it uploading (engine.ts run), as a token request that hangs does.
 */
export const PROBE_TIMEOUT_MS = 5_000;

/** What the probe needs of the browser, so a test can stand in for it. */
export type ProbeEnv = {
  fetch: (url: string, init: RequestInit) => Promise<unknown>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

/**
 * Asks whether the app's server answers right now: a HEAD of PROBE_PATH that isn't read from a cache. Any answer
 * counts, a 503 or a 404 too, since only a working connection brings one back; no answer within `timeoutMs`, or a
 * request that fails, is the road being down. Files that fail together share one request. With no browser to ask
 * from (the server, a test), the answer is yes, as deviceOnline's is.
 */
export function originProbe(env: ProbeEnv | null, timeoutMs = PROBE_TIMEOUT_MS): () => Promise<boolean> {
  let out: Promise<boolean> | null = null;
  const ask = async (on: ProbeEnv): Promise<boolean> => {
    const controller = new AbortController();
    const timer = on.setTimer(() => controller.abort(), timeoutMs);
    try {
      await on.fetch(PROBE_PATH, { method: "HEAD", cache: "no-store", signal: controller.signal });
      return true;
    } catch {
      return false;
    } finally {
      on.clearTimer(timer);
    }
  };
  return () => {
    if (!env) return Promise.resolve(true);
    if (!out) {
      const asking = ask(env);
      out = asking;
      void asking.finally(() => {
        if (out === asking) out = null;
      });
    }
    return out;
  };
}

const browserProbe = originProbe(
  typeof window === "undefined" || typeof fetch !== "function"
    ? null
    : {
        fetch: (url, init) => fetch(url, init),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout> | undefined),
      },
);

/**
 * The upload queue's `transfer`, with the Blob client fetched on first use
 * instead of with the page (components/upload-queue.tsx passes the dynamic
 * import). `get` starts the fetch and is what the queue calls when idle
 * (preloadTransfer, when the queue mounts and on a page that takes files);
 * `send` is the `transfer` the engine gets, and waits for it.
 *
 * A chunk that doesn't arrive is forgotten by the browser's runtime
 * (lib/lazy-module.ts), so the next `get` fetches it again and a file that
 * tries again can get it (a dropped signal heals this way). What the failure
 * means depends on the road. With the device offline it is the connection's:
 * a TypeError, which classifyFailure (outbox.ts) reads as "offline", and the
 * file waits. With the device online and the app's server not answering
 * either (`reachable`: a phone with no data still reads online) it is the
 * connection's too: NoConnectionError, and the file waits for the signal
 * without counting a try, its tile and the bar saying no signal. A Reload
 * then would land on the browser's offline page. With the server answering it
 * is UploadCodeMissingError: the file waits without counting a try, since the
 * page's code is what is missing and not the file or the road, and the engine
 * says so (engine.ts: one notice with Reload, and the file's tile and the bar
 * read "paused"). That is also the answer when a deploy removed the chunk (a
 * 404), which no retry fixes: the notice and the bar offer Reload then.
 * Whatever the transfer itself throws (a refusal, a busy server) passes
 * through as it is.
 */
export function lazyTransfer(
  load: () => Promise<Transfer>,
  online: () => boolean = deviceOnline,
  reachable: () => Promise<boolean> = browserProbe,
): { get: () => Promise<Transfer>; send: Transfer } {
  const client = lazyModule(load);
  const get = (): Promise<Transfer> =>
    client.load().catch(async () => {
      if (!online()) throw new TypeError("Failed to fetch");
      throw (await reachable()) ? new UploadCodeMissingError() : new NoConnectionError();
    });
  return { get, send: async (input) => (await get())(input) };
}
