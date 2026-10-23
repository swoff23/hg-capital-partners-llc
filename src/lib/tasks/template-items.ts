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

/** Fill [Token]s from `values` (keyed by token name, any spelling of it). Blank or unknown tokens stay as written. */
export function applyTokens(s: string, values: Readonly<Record<string, string>>): string {
  const byKey = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) if (v.trim() && !byKey.has(tokenKey(k))) byKey.set(tokenKey(k), v.trim());
  return s.replace(TOKEN_RE, (whole, name: string) => byKey.get(tokenKey(name)) ?? whole);
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

/** The anchor date moved by an item's offset, or null without both. */
export function dueFromOffset(anchor: Ymd | null | undefined, offset: number | null | undefined): Ymd | null {
  return anchor && typeof offset === "number" && Number.isFinite(offset) ? addDaysYmd(anchor, Math.trunc(offset)) : null;
}
