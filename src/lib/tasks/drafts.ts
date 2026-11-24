import { firstName } from "@/lib/names";
import { jobEmailState, type JobEmailFacts } from "@/lib/portal/job-emails";
import type { PersonRef } from "./assignee-people";

/**
 * Drafts from Claude (docs/specs/tasks-from-claude.md, section 6): what a
 * draft's key is, how many may wait, who hears when one is added, and the
 * words for that. Pure and safe in the browser; core.ts saves, adds, discards
 * and restores drafts and queries.ts lists them. See drafts.test.ts.
 */

// ---------------------------------------------------------------------------
// The key that makes a save safe to send twice
// ---------------------------------------------------------------------------

/** The most a batch key may hold, so the stored key stays short. */
export const DRAFT_BATCH_KEY_MAX = 100;

/** How every draft's key starts. No other kind of task's key does (a property reminder's is "<propertyId>:<slug>"). */
export const DRAFT_KEY_START = "claude:";

/**
 * What every draft of one save shares: `claude:<userId>:<batchKey>:`. The
 * partner's id is part of it, so two partners' Claudes can't collide and
 * neither can reach the other's batch.
 */
export function draftBatchPrefix(userId: string, batchKey: string): string {
  return `${DRAFT_KEY_START}${userId}:${batchKey}:`;
}

/**
 * A draft's `Task.autoKey` (unique): its save's prefix and its place in that
 * save. Sending the same save again finds these and adds nothing.
 */
export function draftAutoKey(userId: string, batchKey: string, index: number): string {
  return `${draftBatchPrefix(userId, batchKey)}${index}`;
}

/** A draft's place in its save, read back from its key; null for a key that isn't one of this save's. */
export function draftIndexOf(autoKey: string | null | undefined, prefix: string): number | null {
  if (!autoKey?.startsWith(prefix)) return null;
  const rest = autoKey.slice(prefix.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

// ---------------------------------------------------------------------------
// How many may wait
// ---------------------------------------------------------------------------

/**
 * The most drafts one partner can have waiting. A save that would pass it
 * writes nothing (core.ts saveDrafts counts them in the database, under a
 * lock, so it holds on every server instance). Well under the 500 ids Add all
 * and Discard all take in one call, so the two buttons always work on a full
 * My drafts.
 */
export const MAX_WAITING_DRAFTS = 200;

// ---------------------------------------------------------------------------
// Who hears when a draft is added (D13)
// ---------------------------------------------------------------------------

/**
 * The contractor a draft is for, and whether adding it emails them. Null for
 * a draft that is a partner's own or nobody's: nobody outside hears, so the
 * banner and the toast say nothing more. `contactId` tells two people apart,
 * never the name: `firstName` is how the app greets them (names.ts) and
 * `fullName` what a line falls back to when someone else goes by that first
 * name (draftName).
 */
export type DraftContractor = { contactId: string; firstName: string; fullName: string; getsEmail: boolean };

/** What the rule reads from a draft's assigned contractor (the task page already selects these). */
export interface DraftAssignee {
  id: string;
  fullName: string;
  /** The contact is active; absent reads as active. */
  active?: boolean;
  portalAccount?: JobEmailFacts | null;
}

/**
 * Which of the three lines a draft gets, before it's added and after: the
 * rule every job email follows (portal/job-emails.ts jobEmailState: an
 * active login, a first sign-in behind them, their Job emails switch on).
 * Add itself answers with the same thing (core.ts addDraft).
 */
export function draftContractor(assigneeContact: DraftAssignee | null | undefined): DraftContractor | null {
  if (!assigneeContact) return null;
  const { id, fullName } = assigneeContact;
  return {
    contactId: id,
    firstName: firstName(fullName) || fullName,
    fullName,
    getsEmail: jobEmailState(assigneeContact.portalAccount, assigneeContact.active !== false) === "on",
  };
}

// ---------------------------------------------------------------------------
// Names in the lines a partner reads
// ---------------------------------------------------------------------------

/**
 * Everyone a name in one of these lines could be read as: the partners and
 * the contractors the pickers list, each by their picker key ("u:<userId>",
 * "c:<contactId>") and full name. The screens already hold both lists
 * (assignee-people.ts personRefs builds this from them), so no line reads the
 * database to name someone.
 */
export type DraftPeople = readonly Pick<PersonRef, "key" | "name">[];

/** A first name as two people would share it: case and accents apart, "José" and "jose" are one name. */
const spoken = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/** The name the app greets someone by, or the whole name when it has no first word. */
const greeting = (name: string) => firstName(name) || name.trim();

/**
 * The name a line gives one person: their first name while nobody else the
 * line could mean goes by it, and their full name once someone does. People
 * are told apart by key, never by name, so two Mikes read "Mike Stone" and
 * "Mike Rivera", and a contractor who typed a nickname that is someone else's
 * first name ("Rob (Zack) Smith", names.ts firstName) is never read as them.
 */
export function nameAmong(person: Pick<PersonRef, "key" | "name">, people: DraftPeople): string {
  const first = greeting(person.name);
  const shared = people.some((other) => other.key !== person.key && spoken(greeting(other.name)) === spoken(first));
  return shared ? person.name.trim() : first;
}

const asPerson = (c: DraftContractor) => ({ key: `c:${c.contactId}`, name: c.fullName });

/** The name a draft's line gives its contractor (nameAmong), among `people` when the caller has them loaded. */
export function draftName(c: DraftContractor, people: DraftPeople = []): string {
  return nameAmong(asPerson(c), people);
}

/** What adding a draft will do, as the connector tells Claude: "Emails Zack", "Rob doesn't get job emails", or null. */
export function draftEmailLine(c: DraftContractor | null, people: DraftPeople = []): string | null {
  if (!c) return null;
  const name = draftName(c, people);
  return c.getsEmail ? `Emails ${name}` : `${name} doesn't get job emails`;
}

/** The draft banner's second line: "Adding it emails Zack.", "Rob doesn't get job emails.", or none for a partner's own. */
export function draftBannerLine(c: DraftContractor | null, people: DraftPeople = []): string | null {
  if (!c) return null;
  const name = draftName(c, people);
  return c.getsEmail ? `Adding it emails ${name}.` : `${name} doesn't get job emails.`;
}

/** "Zack", "Zack and Rob", "Zack, Rob and Ana". */
export const nameList = (names: readonly string[]): string =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * Who hears and who doesn't after an Add or Add all, each person once, by
 * contact id: `emailed` get the job's email, `quiet` don't. Someone with two
 * jobs here, one emailed, hears, so they aren't also named as not hearing; a
 * second person with their first name still is. Each is named apart from
 * everyone in `people` and from the others here (nameAmong). The toast's own
 * words are the Tasks screens' (app/(app)/tasks/draft-copy.ts addedLine).
 */
export function draftsAddedNames(added: readonly (DraftContractor | null)[], people: DraftPeople = []): { emailed: string[]; quiet: string[] } {
  const byId = new Map<string, DraftContractor>();
  for (const c of added) {
    if (!c) continue;
    const seen = byId.get(c.contactId);
    if (!seen || (c.getsEmail && !seen.getsEmail)) byId.set(c.contactId, c);
  }
  const here = [...byId.values()];
  const among = [...people, ...here.map(asPerson)];
  const names = (getsEmail: boolean) => here.filter((c) => c.getsEmail === getsEmail).map((c) => draftName(c, among));
  return { emailed: names(true), quiet: names(false) };
}
