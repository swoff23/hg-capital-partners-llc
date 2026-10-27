/**
 * How the token route (src/app/api/blob/[kind]/route.ts) answers a request it
 * could not turn into a token. The browser's queue reads the status:
 *
 *   400  the server said no. The file is refused (the job closed, a type or
 *        size that isn't allowed, a session that ended): trying again
 *        unchanged would only be told no again, so the tile turns red.
 *   503  the road, not the file. A database blip, Blob being slow, a bad
 *        deploy: the file waits and tries again (outbox.ts ServerBusyError).
 *
 * Only an error the route threw on purpose, as an UploadRefusal, is a 400.
 * Anything else it didn't expect (a Prisma error among them) is a 503, so a
 * hiccup never reads as "the upload was refused". Pure; see token-failure.test.ts.
 */

/** A request the token route turns down on purpose: its message is shown to the person. */
export class UploadRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefusal";
  }
}

/** The line a 503 carries. The queue shows its own words; this is for logs and a person reading the response. */
export const TOKEN_BUSY_MESSAGE = "The upload service is busy. It will try again.";

/**
 * The status and message for an error the route caught. `requestType` is the
 * body's event type: Blob's upload-completed callback touches no database, so
 * whatever it throws (a missing or wrong signature) is a bad request.
 */
export function tokenFailure(err: unknown, requestType?: unknown): { status: 400 | 503; message: string } {
  if (err instanceof UploadRefusal) return { status: 400, message: err.message };
  if (requestType === "blob.upload-completed") return { status: 400, message: "That callback isn't valid." };
  return { status: 503, message: TOKEN_BUSY_MESSAGE };
}
