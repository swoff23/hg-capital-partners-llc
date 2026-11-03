import { lazyModule } from "@/lib/lazy-module";
import type { Transfer } from "./transfer";

/**
 * The upload queue's `transfer`, with the Blob client fetched on first use
 * instead of with the page (components/upload-queue.tsx passes the dynamic
 * import). `get` starts the fetch and is what a page that takes files calls
 * when idle; `send` is the `transfer` the engine gets, and waits for it.
 *
 * A chunk that doesn't arrive (no signal, a deploy that moved it) is the
 * connection, not the file, so it fails the way a dropped request does: a
 * TypeError, which classifyFailure (outbox.ts) treats as the road. The file
 * waits and tries again, and the next try fetches the chunk again.
 */
export function lazyTransfer(load: () => Promise<Transfer>): { get: () => Promise<Transfer>; send: Transfer } {
  const client = lazyModule(load);
  const get = (): Promise<Transfer> =>
    client.load().catch(() => {
      throw new TypeError("Failed to fetch");
    });
  return { get, send: async (input) => (await get())(input) };
}
