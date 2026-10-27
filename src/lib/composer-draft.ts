/**
 * What the composer keeps in this browser for one reply box (docs/specs/
 * activity-comments.md 2.7): the words and who sees them, together, so a
 * half-written Internal note comes back Internal. One entry per surface and
 * record (`hgos-task-draft:<taskId>`), as JSON:
 *
 *   { v: 2, text, visibility, pending? }
 *
 * `pending` is a message that has been sent and not yet confirmed. It moves
 * there from the field the moment Send is pressed and clears only on success,
 * so a reload (or a tab that closed) mid-send loses nothing and doubles
 * nothing: if the page's events already hold its `clientId` it did post, and
 * otherwise it comes back in the field. Pure; see composer-draft.test.ts.
 */

export type DraftVisibility = "SHARED" | "INTERNAL";

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
  return { clientId: p.clientId, text: p.text, visibility: p.visibility, files, at: typeof p.at === "string" ? p.at : "" };
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
  if (sentClientIds.includes(p.clientId)) return { action: "drop" };
  const text = draft.text ? `${p.text}\n\n${draft.text}` : p.text;
  return { action: "restore", draft: { text, visibility: p.visibility, pending: null } };
}
