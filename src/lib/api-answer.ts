/**
 * What the staff JSON routes (/api/search, /api/addresses) answer with: a
 * status and a body, so their tests run the answer without a server. Kept
 * apart from the queries, since a file the browser imports for its helpers
 * (address-suggestions.ts) reaches SIGNED_OUT and mustn't pull Prisma with it.
 */

export type Answer<T> = { status: 200; body: T } | { status: 400 | 401 | 500; body: { error: string } };

/** Who may ask: a signed-in staff user. A contractor's portal session is a different cookie and never reaches these routes. */
export type Viewer = { id: string } | null;

export const SIGNED_OUT = { status: 401, body: { error: "signed-out" } } as const satisfies Answer<never>;
