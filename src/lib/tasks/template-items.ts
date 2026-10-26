import type { Ymd } from "@/lib/dates";
import { addDaysYmd } from "@/lib/quick-dates";

/**
 * Playbook templates (D28): the items JSON on TaskTemplate, and the token
 * fill used when a playbook is applied to a property. Items come from the
 * Asana import (src/lib/asana/map.ts TemplateItem) and, later, the template
 * editor. Titles and notes carry tokens like [Tenant] and [Address]. Pure;
 * see template-items.test.ts.
 */

export interface TemplateItem {
  title: string;
  notes?: string;
  assigneeUserId?: string;
  assigneeContactId?: string;
  /** An Asana assignee the import couldn't match to a person. Display only. */
  assigneeName?: string;
  /** Checklist item titles. */
  checklist?: string[];
  /** Days from the anchor date; negative is before it. */
  dueOffsetDays?: number;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** A stored items column, read defensively: bad rows and blank titles are dropped. */
export function parseTemplateItems(json: unknown): TemplateItem[] {
  if (!Array.isArray(json)) return [];
  const out: TemplateItem[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title = str(r.title);
    if (!title) continue;
    const checklist = Array.isArray(r.checklist) ? r.checklist.map(str).filter((s): s is string => !!s) : [];
    const offset = typeof r.dueOffsetDays === "number" && Number.isInteger(r.dueOffsetDays) ? r.dueOffsetDays : undefined;
    out.push({
      title,
      ...(str(r.notes) ? { notes: str(r.notes) } : {}),
      ...(str(r.assigneeUserId) ? { assigneeUserId: str(r.assigneeUserId) } : {}),
      ...(str(r.assigneeContactId) ? { assigneeContactId: str(r.assigneeContactId) } : {}),
      ...(str(r.assigneeName) ? { assigneeName: str(r.assigneeName) } : {}),
      ...(checklist.length ? { checklist } : {}),
      ...(offset !== undefined ? { dueOffsetDays: offset } : {}),
    });
  }
  return out;
}

const TOKEN_RE = /\[([^\][]+)\]/g;

const ADDRESS_KEY = /^(address|property|property address)$/;

/**
 * One key per value someone types, so each gets one field: case and spacing
 * don't count, "[tenant name]" is the same person as "[Tenant]", and every
 * spelling of the address is the property's address.
 */
function tokenKey(name: string): string {
  const k = name.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(.+) name$/, "$1");
  return ADDRESS_KEY.test(k) ? "address" : k;
}

/** The [Token] names in these strings, first-seen spelling, each once (one per key, see tokenKey). */
export function extractTokens(strings: readonly (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const s of strings) {
    for (const m of (s ?? "").matchAll(TOKEN_RE)) {
      const name = m[1].trim();
      if (name && !seen.has(tokenKey(name))) seen.set(tokenKey(name), name);
    }
  }
  return [...seen.values()];
}

/**
 * A row's title in the apply step: the hand-edited title if there is one,
 * otherwise the playbook's, with tokens filled either way, so typing the
 * tenant after editing a title still clears its [Tenant].
 */
export function rowTitle(edited: string | undefined, itemTitle: string, values: Readonly<Record<string, string>>): string {
  return applyTokens(edited ?? itemTitle, values);
}

/** Typed values by token key, blank ones left out. */
function valuesByKey(values: Readonly<Record<string, string>>): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) if (v.trim() && !byKey.has(tokenKey(k))) byKey.set(tokenKey(k), v.trim());
  return byKey;
}

/**
 * Fill [Token]s from `values` (keyed by token name, any spelling of it). Blank or unknown tokens stay as written.
 * A value ending in a period ("118 Congress St.") right before the text's own period gives one period, not "St..".
 */
export function applyTokens(s: string, values: Readonly<Record<string, string>>): string {
  const byKey = valuesByKey(values);
  return s.replace(TOKEN_RE, (whole: string, name: string, at: number) => {
    const v = byKey.get(tokenKey(name));
    if (v === undefined) return whole;
    return v.endsWith(".") && s[at + whole.length] === "." ? v.slice(0, -1) : v;
  });
}

/**
 * Tokens only notes use (D28, BPLAY-010), first-seen spelling: optional
 * when applying, because a blank one drops its line (fillNotes). A token in
 * any title or checklist item stays required, and so does the address,
 * which fills from the property.
 */
export function notesOnlyTokens(items: readonly Pick<TemplateItem, "title" | "notes" | "checklist">[]): string[] {
  const required = new Set(extractTokens(items.flatMap((i) => [i.title, ...(i.checklist ?? [])])).map(tokenKey));
  return extractTokens(items.map((i) => i.notes)).filter((t) => !required.has(tokenKey(t)) && !isAddressToken(t));
}

/**
 * An item's notes for the task it creates: tokens filled, and every line
 * holding an `optional` token left blank dropped whole, so no [brackets]
 * reach the task. Null when nothing is left.
 */
export function fillNotes(notes: string | null | undefined, values: Readonly<Record<string, string>>, optional: readonly string[]): string | null {
  if (!notes) return null;
  const byKey = valuesByKey(values);
  const skip = new Set(optional.map(tokenKey).filter((k) => !byKey.has(k)));
  const lines = notes.split("\n");
  const kept = lines.filter((line) => ![...line.matchAll(TOKEN_RE)].some((m) => skip.has(tokenKey(m[1]))));
  const filled = applyTokens(kept.join("\n"), values);
  // Nothing dropped: exactly as before. Otherwise no blank runs left where lines were.
  const out = kept.length === lines.length ? filled : filled.replace(/\n[ \t]*(\n[ \t]*)+\n/g, "\n\n").trim();
  return out.trim() ? out : null;
}

/** Two spellings of one token: they share a field and a value. */
export function sameToken(a: string, b: string): boolean {
  return tokenKey(a) === tokenKey(b);
}

/** Still has a [Token] in it. */
export function hasOpenTokens(s: string): boolean {
  return new RegExp(TOKEN_RE.source).test(s);
}

/** Tokens the property's short address fills: [Address], [Property], [Property address]. */
export function isAddressToken(name: string): boolean {
  return tokenKey(name) === "address";
}

/** A token's field label, in sentence case: "[tenant email]" reads "Tenant email". */
export function tokenLabel(name: string): string {
  const s = name.trim().replace(/\s+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The input type that brings up the right keyboard for a token's value. */
export function tokenInputType(name: string): "email" | "tel" | "text" {
  const k = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (/\be-?mail\b/.test(k)) return "email";
  if (/\b(phone|cell|mobile)\b/.test(k) || /^(tenant|owner|landlord|contact) number$/.test(k)) return "tel";
  return "text";
}

/**
 * The bar's status line for applying a playbook (BPLAY-012): "39 tasks to
 * create", "1 task to create", and "No tasks to create" at zero.
 */
export function tasksToCreate(count: number): string {
  if (count <= 0) return "No tasks to create";
  return `${count} ${count === 1 ? "task" : "tasks"} to create`;
}

/** The primary beside it: "Create 39 tasks", "Create 1 task", and plain "Create tasks" at zero. */
export function createTasksLabel(count: number): string {
  if (count <= 0) return "Create tasks";
  return `Create ${count} ${count === 1 ? "task" : "tasks"}`;
}

/** What stops Create, shown only after it was pressed (BPLAY-011): a line per field, and one for the list. */
export type ApplyProblems = {
  /** The property field's line. */
  property?: string;
  /** A fill-in's line, keyed by the token as the playbook spells it. */
  tokens: Record<string, string>;
  /** The list's line, above the primary: nothing is ticked. */
  tasks?: string;
};

/**
 * The problems with applying a playbook as it stands. `open` are the [Token]s
 * still blank in a task that will be created, each as the playbook's first
 * spelling of it. Errors name what to enter ("Enter the tenant."); a field is
 * only named once, however many tasks use it. Pure; no problems is an empty
 * result, and Create goes ahead.
 */
export function applyProblems({
  propertyId,
  count,
  open,
}: {
  propertyId: string | null | undefined;
  /** Tasks ticked, with a title that will save. */
  count: number;
  open: readonly string[];
}): ApplyProblems {
  const problems: ApplyProblems = { tokens: {} };
  if (!propertyId) problems.property = "Choose a property.";
  if (count === 0) problems.tasks = "Include a task first.";
  for (const token of open) {
    if (!(token in problems.tokens)) problems.tokens[token] = `Enter the ${tokenLabel(token).toLowerCase()}.`;
  }
  return problems;
}

/** Whether there is anything to stop Create for. */
export function hasApplyProblems(p: ApplyProblems): boolean {
  return !!p.property || !!p.tasks || Object.keys(p.tokens).length > 0;
}

/**
 * Names the version of a playbook's items, so a draft of an application
 * never lands on a playbook whose tasks changed since: the count and a
 * short hash of the titles in order.
 */
export function itemsVersion(items: readonly Pick<TemplateItem, "title">[]): string {
  let h = 0;
  for (const ch of items.map((i) => i.title).join("\n")) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return `${items.length}-${(h >>> 0).toString(36)}`;
}

/** The anchor date moved by an item's offset, or null without both. */
export function dueFromOffset(anchor: Ymd | null | undefined, offset: number | null | undefined): Ymd | null {
  return anchor && typeof offset === "number" && Number.isFinite(offset) ? addDaysYmd(anchor, Math.trunc(offset)) : null;
}
