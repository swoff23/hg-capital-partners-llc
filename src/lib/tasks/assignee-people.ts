/**
 * Who shows where in the assignee list, kept pure so it's tested without a
 * database (assignee-options.test.ts; the queries are assignee-options.ts).
 * A person's key is the picker's own: "u:<userId>" for the team, "c:<contactId>"
 * for a contractor.
 */

/** The picker's key for a stored assignee: `{ userId }` is "u:…", `{ contactId }` is "c:…". */
export function assigneeKey(to: { userId?: string | null; contactId?: string | null } | null | undefined): string | null {
  if (to?.userId) return `u:${to.userId}`;
  if (to?.contactId) return `c:${to.contactId}`;
  return null;
}

/** The list in its order with `meId`'s row first ("you first", selectors 3.3). Everyone else keeps their order. */
export function youFirst<T extends { id: string }>(users: readonly T[], meId: string | undefined | null): T[] {
  if (!meId) return [...users];
  const me = users.filter((u) => u.id === meId);
  return [...me, ...users.filter((u) => u.id !== meId)];
}

/**
 * The people the viewer assigned most recently, newest first, at most `max`:
 * the "Recent" rows that show while the picker's search is empty. Read from
 * the viewer's own ASSIGNED events (`events` newest first, each with the
 * event's `data`: `{ from, to: { userId, contactId } }`), so it follows them
 * across devices. Unassigning is no one, a legacy name isn't a person, and
 * someone who isn't on offer any more (`offered` keys) is skipped, so a row
 * never points at a person the list can't pick.
 */
export function recentAssigneeKeys(events: readonly { data: unknown }[], offered: ReadonlySet<string>, max = 3): string[] {
  const seen: string[] = [];
  for (const e of events) {
    const data = e.data && typeof e.data === "object" ? (e.data as { to?: { userId?: string | null; contactId?: string | null } }) : null;
    const key = assigneeKey(data?.to);
    if (!key || !offered.has(key) || seen.includes(key)) continue;
    seen.push(key);
    if (seen.length === max) break;
  }
  return seen;
}

export interface PersonRef {
  /** The picker's key, "u:…" or "c:…". */
  key: string;
  name: string;
  email?: string | null;
}

/**
 * A name for comparing two spellings of one person: letters only and
 * lowercase, accents folded ("José" is "Jose"), apostrophes dropped
 * ("O'Connell" is "oconnell"), a nickname or company in parentheses dropped
 * ("Jacob (Jake) hoak" is "jacob hoak").
 */
export function personKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    // O'Connell and OConnell are one name; any other punctuation is a gap.
    .replace(/['\u2019]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Folds the free-text assignee names the Asana import left behind into the
 * person each one is, so filtering by Zack also finds his imported rows and
 * nobody is listed twice (selectors 3.3, TASKS-013). A name matches by email
 * when it is one, otherwise by its `personKey`; a name two people share
 * matches neither. `merged` maps each matched name to a person's key and
 * `others` is what's left, once each, in order, for an "Others" group.
 */
export function mergeLegacyNames(
  names: readonly string[],
  people: readonly PersonRef[],
): { merged: Map<string, string>; others: string[] } {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string | null>();
  for (const p of people) {
    const email = p.email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, p.key);
    const k = personKey(p.name);
    if (!k) continue;
    // A second person with the same name makes the name ambiguous.
    byName.set(k, byName.has(k) && byName.get(k) !== p.key ? null : p.key);
  }

  const merged = new Map<string, string>();
  const others: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.includes("@") ? byEmail.get(name.toLowerCase()) : (byName.get(personKey(name)) ?? undefined);
    if (key) {
      merged.set(raw, key);
      continue;
    }
    const again = personKey(name) || name.toLowerCase();
    if (seen.has(again)) continue;
    seen.add(again);
    others.push(name);
  }
  return { merged, others };
}
