import { stableJson } from "./drafts";

/**
 * The version of one Settings blob (forms 2.12, "Separate Settings
 * versions"): a short fingerprint of what's stored in that column, so an
 * editor saves against the blob it loaded and not against the shared row's
 * `updatedAt`. Saving the CapEx rules never conflicts the move-in form, and
 * the other way round. No migration: the editor sends back the version it
 * was rendered with, and the write compares it with the column as it is now.
 *
 * Object keys are sorted first (a jsonb column hands them back in its own
 * order), then FNV-1a 32-bit over the text, with the text's length so two
 * different blobs rarely share one. Null for a column nothing has been saved
 * into: missing, null or the column's `{}` default, so an editor rendered
 * before the row existed still saves cleanly after another tab created it.
 */
export function blobVersion(stored: unknown): string | null {
  if (stored === null || stored === undefined) return null;
  if (typeof stored === "object" && !Array.isArray(stored) && Object.keys(stored).length === 0) return null;
  const text = stableJson(stored);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}-${text.length.toString(36)}`;
}
