import { lazyModule } from "@/lib/lazy-module";
import { UploadCodeMissingError } from "./outbox";
import type { Transfer } from "./transfer";

/** Whether the device says it is online; true where there is no navigator (the server, a test). */
const deviceOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/**
 * The upload queue's `transfer`, with the Blob client fetched on first use
 * instead of with the page (components/upload-queue.tsx passes the dynamic
 * import). `get` starts the fetch and is what the queue calls when idle
 * (preloadTransfer, when the queue mounts and on a page that takes files);
 * `send` is the `transfer` the engine gets, and waits for it.
 *
 * A chunk that doesn't arrive is forgotten by the browser's runtime, so the
 * next `get` fetches it again and a file that tries again can get it (a
 * dropped signal heals this way). Offline, the failure is the connection's: a
 * TypeError, which classifyFailure (outbox.ts) reads as "offline", and the
 * file waits. Online it is UploadCodeMissingError: the file waits too, without
 * counting a try, since the page's code is what is missing and not the file
 * or the road, and the engine says so (engine.ts: one notice, and the file's
 * tile and the bar read "paused"). That is also the answer when a deploy
 * removed the chunk, which no retry fixes: the notice and the bar offer
 * Reload then. Whatever the transfer itself throws (a refusal, a busy server)
 * passes through as it is.
 */
export function lazyTransfer(load: () => Promise<Transfer>, online: () => boolean = deviceOnline): { get: () => Promise<Transfer>; send: Transfer } {
  const client = lazyModule(load);
  const get = (): Promise<Transfer> =>
    client.load().catch(() => {
      throw online() ? new UploadCodeMissingError() : new TypeError("Failed to fetch");
    });
  return { get, send: async (input) => (await get())(input) };
}
