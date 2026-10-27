/**
 * What the composer keeps in this browser for one reply box (docs/specs/
 * activity-comments.md 2.7): the words and who sees them, together, so a
 * half-written Internal note comes back Internal. One entry per surface,
 * record and person (personalDraftKey), as JSON:
 *
 *   { v: 2, text, visibility, pending? }
 *
 * `pending` is a message that has been sent and not yet confirmed. It moves
 * there from the field the moment Send is pressed and clears only on success,
 * so a reload (or a tab that closed) mid-send loses nothing and doubles
 * nothing: if the page's events already hold its `clientId` it did post, and
 * otherwise it comes back in the field. A box with no timeline to show the
 * message on (the portal's, the deal note box) keeps the words in the field
 * while it sends, so its `pending` is `held`: the same record, with the text
 * left where it is. Either way the `clientId` outlives a failure, so the next
 * Send of the same message is the same send and never posts twice. Pure; see
 * composer-draft.test.ts.
 */

export type DraftVisibility = "SHARED" | "INTERNAL";

/**
 * Where one person's draft for one reply box lives: the surface, the record
 * and the person (a contractor's contact id in the portal's job composer, a
 * partner's user id on the task page and in the deal note box), so a second
 * person who signs in on the same device never opens another's unsent words.
 * Drafts stored under the portal's earlier per-record keys
 * ("hgos-job-draft:<taskId>"), which never shipped, are not read. The task
 * page's did ship, and is read once (sharedDraftKey).
 */
export function personalDraftKey(surface: "task" | "job" | "deal-note", recordId: string, personId: string): string {
  return `hgos-${surface}-draft:${recordId}:${personId}`;
}

/**
 * The key the task page kept its draft under before drafts were per person
 * ("hgos-task-draft:<taskId>", one per task for everyone on the device), for
 * a task page key from personalDraftKey; null for any other key.
 */
export function sharedDraftKey(key: string): string | null {
  const m = /^(hgos-task-draft:[^:]+):[^:]+$/.exec(key);
  return m ? m[1] : null;
}

/** The part of localStorage a draft move touches, so a test can hand in a Map. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The first read of a personal key takes over what the shared key before it
 * held (sharedDraftKey), once: a draft there moves to this key when this key
 * holds nothing, and the old entry is removed either way, so it opens for one
 * person and no read after finds it. A draft already under this key is the
 * person's own and wins.
 */
export function adoptSharedDraft(storage: DraftStorage, key: string): void {
  const from = sharedDraftKey(key);
  if (!from) return;
  const old = storage.getItem(from);
  if (old === null) return;
  if (storage.getItem(key) === null) storage.setItem(key, old);
  storage.removeItem(from);
}

/** A message sent and not yet confirmed. */
export interface PendingDraft {
  /** Made in the browser for this send, stored on the event so a Retry never posts twice. */
  clientId: string;
  text: string;
  visibility: DraftVisibility;
  /** The ready files that went with it: they stay drafts on the server until a send lands them. */
  files: { id: string; filename: string }[];
  /** When Send was pressed (ISO). */
  at: string;
  /** The words were left in the field while it sent (no timeline to hold the message): a reload keeps them there and only remembers the id. */
  held?: true;
}

export interface Draft {
  text: string;
  visibility: DraftVisibility;
  pending: PendingDraft | null;
}

export const EMPTY_DRAFT: Draft = Object.freeze({ text: "", visibility: "SHARED", pending: null }) as Draft;

const isVisibility = (v: unknown): v is DraftVisibility => v === "SHARED" || v === "INTERNAL";

function parsePending(v: unknown): PendingDraft | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (typeof p.clientId !== "string" || !p.clientId || typeof p.text !== "string" || !isVisibility(p.visibility)) return null;
  const files = Array.isArray(p.files)
    ? p.files.flatMap((f) => {
        const o = f as Record<string, unknown> | null;
        return o && typeof o.id === "string" && typeof o.filename === "string" ? [{ id: o.id, filename: o.filename }] : [];
      })
    : [];
  return { clientId: p.clientId, text: p.text, visibility: p.visibility, files, at: typeof p.at === "string" ? p.at : "", ...(p.held === true ? { held: true as const } : {}) };
}

/**
 * A stored draft. Today's format is the text alone, which restores as
 * Internal: a reply that waits is cheaper than a note that leaks, and the
 * fill, the Lock line and the "Add note" label show the mode before anything
 * is sent. Anything that is not a version 2 entry is taken for text.
 */
export function parseDraft(raw: string | null | undefined): { draft: Draft; legacy: boolean } {
  if (!raw) return { draft: EMPTY_DRAFT, legacy: false };
  try {
    const j: unknown = JSON.parse(raw);
    if (j && typeof j === "object" && (j as { v?: unknown }).v === 2) {
      const o = j as Record<string, unknown>;
      return {
        draft: {
          text: typeof o.text === "string" ? o.text : "",
          visibility: isVisibility(o.visibility) ? o.visibility : "SHARED",
          pending: parsePending(o.pending),
        },
        legacy: false,
      };
    }
  } catch {
    // Plain text.
  }
  return { draft: { text: raw, visibility: "INTERNAL", pending: null }, legacy: true };
}

/** What to store, or null when there is nothing worth keeping (the key is then removed). */
export function serializeDraft(d: Draft): string | null {
  if (!d.text && !d.pending) return null;
  return JSON.stringify({ v: 2, text: d.text, visibility: d.visibility, ...(d.pending ? { pending: d.pending } : {}) });
}

/**
 * What a reload does with a pending message: nothing when there is none, drop
 * it when the page's events already hold its `clientId` (it posted), and
 * otherwise bring it back to the field. Brought back, it goes ahead of
 * whatever was typed since.
 */
export function resolvePending(
  draft: Draft,
  sentClientIds: readonly string[],
): { action: "none" } | { action: "drop" } | { action: "restore"; draft: Draft } {
  const p = draft.pending;
  if (!p) return { action: "none" };
  if (p.held) {
    // The words never left the field. If the page already holds the message, those words are it: clear them
    // (unless they were changed since); otherwise keep them and the id, so the next Send is the same send.
    if (!sentClientIds.includes(p.clientId)) return { action: "none" };
    return { action: "restore", draft: { ...draft, text: draft.text === p.text ? "" : draft.text, pending: null } };
  }
  if (sentClientIds.includes(p.clientId)) return { action: "drop" };
  const text = draft.text ? `${p.text}\n\n${draft.text}` : p.text;
  return { action: "restore", draft: { text, visibility: p.visibility, pending: null } };
}

/**
 * The `clientId` for a Send: the one a held message already has, when this is
 * the same message (same words, same visibility, same files), so a Send after
 * a failure that did post is recognised by the server and answers with what is
 * there. A message changed in any way is a new send.
 */
export function clientIdToReuse(
  draft: Draft,
  next: { body: string; visibility: DraftVisibility; attachmentIds: readonly string[] },
): string | null {
  const p = draft.pending;
  if (!p?.held) return null;
  if (p.text !== next.body || p.visibility !== next.visibility) return null;
  const had = p.files.map((f) => f.id);
  if (had.length !== next.attachmentIds.length || had.some((id, i) => id !== next.attachmentIds[i])) return null;
  return p.clientId;
}
