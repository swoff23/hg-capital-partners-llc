import { ENTITY_NAMES, QBO_ENTITY_SEED } from "@/lib/quickbooks/entities";

/**
 * The QuickBooks companies the Entity picker offers: the ones that hold
 * properties. The management company and the BMK joint venture stay in
 * QuickBooks (QBO_ENTITY_SEED, so Financials still resolves them) but aren't
 * offered (Connor, Nov 14); a property already under one keeps it as its own
 * row.
 */
const NOT_OFFERED = new Set(["HG Buffalo Property Management LLC", "BMK Property Group LLC"]);
export const OFFERED_ENTITIES: readonly string[] = ENTITY_NAMES.filter((n) => !NOT_OFFERED.has(n));

/** A name compared as people mean it: spacing collapsed, case ignored. */
const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Every name QuickBooks knows a company by, the 58 Mariner text's parts included. */
const QUICKBOOKS_NAMES = new Set(QBO_ENTITY_SEED.flatMap((e) => [e.name, ...e.llcOwnerNames]).map(key));

/**
 * The name to store for a property's entity: spacing collapsed, and a
 * QuickBooks company in its own spelling ("hg capital partners llc" saves as
 * the company, so Financials finds it). Anything else typed is a new entity,
 * kept as written. Null when blank, which clears it.
 */
export function entityName(text: string | null | undefined): string | null {
  const name = text?.trim().replace(/\s+/g, " ");
  if (!name) return null;
  return ENTITY_NAMES.find((n) => key(n) === key(name)) ?? name;
}

/**
 * The Entity picker's rows: the offered companies in QuickBooks order, then
 * the entities people added on any property, A to Z. A stored name QuickBooks
 * knows isn't an added one (the two companies not offered stay out), and
 * neither is text over several lines (a pasted note, not a name).
 */
export function entityChoices(inUse: readonly (string | null)[]): string[] {
  const added = new Map<string, string>();
  for (const raw of inUse) {
    const name = raw?.trim();
    if (!name || name.includes("\n") || QUICKBOOKS_NAMES.has(key(name)) || added.has(key(name))) continue;
    added.set(key(name), name);
  }
  return [...OFFERED_ENTITIES, ...[...added.values()].sort((a, b) => a.localeCompare(b))];
}
