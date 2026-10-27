import { shortAddress } from "@/lib/normalize";

/**
 * The browser tab's title for a record page, so tabs and history entries can
 * be told apart ("118 Congress St. · HG", "Mud drywall · HG"); the root
 * layout's "%s · HG" template adds the mark. A building goes by its street
 * line, as its page heading does; a long task title is cut on a word, since
 * a tab shows only its start. Pure; see record-title.test.ts.
 */

export type RecordKind = "property" | "deal" | "task" | "contractor" | "template";

/** Longest title a tab is given: past this a tab shows nothing more. */
export const MAX_TAB_TITLE = 60;

function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_TAB_TITLE) return t;
  const cut = t.slice(0, MAX_TAB_TITLE - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_TAB_TITLE / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The title for one record, from the field its page leads with; null when it has none to give. */
export function recordTitle(kind: RecordKind, name: string | null | undefined): string | null {
  const raw = (name ?? "").trim();
  if (!raw) return null;
  const text = kind === "property" || kind === "deal" ? shortAddress(raw) || raw : raw;
  return clip(text);
}
