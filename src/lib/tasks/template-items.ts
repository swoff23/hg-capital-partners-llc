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

const tokenKey = (name: string) => name.trim().toLowerCase();

/** The [Token] names in these strings, first-seen spelling, each once (case-insensitive). */
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

/** Fill [Token]s from `values` (keyed by token name, any case). Blank or unknown tokens stay as written. */
export function applyTokens(s: string, values: Readonly<Record<string, string>>): string {
  const byKey = new Map(Object.entries(values).map(([k, v]) => [tokenKey(k), v.trim()]));
  return s.replace(TOKEN_RE, (whole, name: string) => byKey.get(tokenKey(name)) || whole);
}

/** Still has a [Token] in it. */
export function hasOpenTokens(s: string): boolean {
  return new RegExp(TOKEN_RE.source).test(s);
}

/** Tokens the property's short address fills: [Address], [Property], [Property address]. */
export function isAddressToken(name: string): boolean {
  return /^(address|property|property address)$/i.test(name.trim());
}

/** The anchor date moved by an item's offset, or null without both. */
export function dueFromOffset(anchor: Ymd | null | undefined, offset: number | null | undefined): Ymd | null {
  return anchor && typeof offset === "number" && Number.isFinite(offset) ? addDaysYmd(anchor, Math.trunc(offset)) : null;
}
