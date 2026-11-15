import type { Prisma } from "@prisma/client";
import type { DealStatus } from "@/lib/config";
import { sameStreetAddress, shortAddress, streetKey } from "@/lib/normalize";
import { liveRecord } from "@/lib/record-scope";
import { containsText } from "@/lib/search";

/**
 * The link from a Closed deal to the property it became
 * (`Deal.convertedPropertyId`), made by the app on its own. The deal page
 * reads it as "Converted to 118 Congress St.", the property page as "From
 * deal 58 Mariner Street", and search folds the deal into its property.
 *
 * The rule: a Closed deal and a property link only when each is the other's
 * one match by `sameStreetAddress`, the test the duplicate check uses, and
 * neither is linked yet. Archived deals and properties are skipped: they
 * never link and never count as a match. Anything less sure (no match, two
 * deals or two properties on the building, a link already there) writes
 * nothing, and things stay as they were.
 *
 * It runs in the two places a match can first exist: a deal moves to Closed
 * (deals/service.ts) and a property is added (properties/service.ts). Each
 * link writes one line in the deal's history, "Linked to 118 Congress St.",
 * by whoever triggered it. The link stays when the deal later leaves Closed.
 *
 * The writes take the transaction as an argument and hold no
 * `revalidatePath`, like lib/archive.ts, so property-link.test.ts runs the
 * rule with no database and property-link.pg.test.ts runs the writes on a
 * scratch one.
 */

/** The stage a deal links from, as stored. */
export const CLOSED_STAGE: DealStatus = "CLOSED!";

/** The history line's `data.event`, beside `propertyId`. */
export const LINKED_EVENT = "linked";

/** A property as the rule reads it. */
export interface LinkProperty {
  id: string;
  address: string;
}

/** A Closed deal as the rule reads it. */
export interface LinkDeal extends LinkProperty {
  convertedPropertyId: string | null;
}

/** Why nothing links: no property (or deal) at the address, more than one on either side, or a link already there. */
export type NoLink = "none" | "several" | "linked";

export type LinkVerdict = { deal: LinkDeal; property: LinkProperty } | NoLink;

/**
 * The property a Closed deal links to, or why it links to none. `closedDeals`
 * and `properties` are the live ones (never archived) that could be at the
 * address; `linkedPropertyIds` are the properties some deal already points
 * at. The deal must be the property's only Closed deal as well as the
 * property the deal's only one: the test isn't transitive ("12 Main" is both
 * "12 Main St" and "12 Main Ave"), so one side alone can't say.
 */
export function closedDealLink(
  deal: LinkDeal,
  closedDeals: readonly LinkDeal[],
  properties: readonly LinkProperty[],
  linkedPropertyIds: ReadonlySet<string>,
): LinkVerdict {
  if (deal.convertedPropertyId) return "linked";
  const at = properties.filter((p) => sameStreetAddress(p.address, deal.address));
  if (at.length === 0) return "none";
  if (at.length > 1) return "several";
  const [property] = at;
  const deals = closedDeals.filter((d) => sameStreetAddress(d.address, property.address));
  if (deals.length !== 1 || deals[0].id !== deal.id) return "several";
  if (linkedPropertyIds.has(property.id)) return "linked";
  return { deal, property };
}

/** The Closed deal a property links to, or why it links to none: the same rule, read from the property's side. */
export function propertyLink(
  property: LinkProperty,
  closedDeals: readonly LinkDeal[],
  properties: readonly LinkProperty[],
  linkedPropertyIds: ReadonlySet<string>,
): LinkVerdict {
  const at = closedDeals.filter((d) => sameStreetAddress(d.address, property.address));
  if (at.length === 0) return "none";
  if (at.length > 1) return "several";
  const verdict = closedDealLink(at[0], closedDeals, properties, linkedPropertyIds);
  // The deal's one property has to be this one.
  return typeof verdict === "object" && verdict.property.id !== property.id ? "several" : verdict;
}

/** The deal's history line for a link the app made: "Linked to 118 Congress St.", with the short address. */
export function linkedLine(propertyAddress: string): string {
  return `Linked to ${shortAddress(propertyAddress) || propertyAddress}`;
}

/* ---------------- The writes ---------------- */

/** The part of a transaction the link reads and writes. */
export type LinkTx = Pick<Prisma.TransactionClient, "deal" | "dealNote" | "property">;

/** Who triggered it: the signed-in user, the history line's author. Null writes the line with no name. */
export type Linker = { id: string } | null;

/** A link that was written. */
export interface Linked {
  dealId: string;
  propertyId: string;
  /** The line added to the deal's history. */
  line: string;
}

/**
 * Every live Closed deal and live property that could be at this address,
 * and which of those properties a deal already points at. The house number
 * narrows the rows, as in the duplicate check; the rule does the matching.
 */
async function candidatesAt(tx: LinkTx, address: string) {
  const lead = streetKey(address).split(" ")[0];
  if (!lead) return null;
  const closedDeals = await tx.deal.findMany({
    where: { status: CLOSED_STAGE, ...liveRecord, address: containsText(lead) },
    select: { id: true, address: true, convertedPropertyId: true },
  });
  const properties = await tx.property.findMany({
    where: { ...liveRecord, address: containsText(lead) },
    select: { id: true, address: true },
  });
  // Any deal counts here, whatever its stage and archived or not: the column is unique.
  const taken = properties.length
    ? await tx.deal.findMany({ where: { convertedPropertyId: { in: properties.map((p) => p.id) } }, select: { convertedPropertyId: true } })
    : [];
  const linkedPropertyIds = new Set(taken.flatMap((d) => (d.convertedPropertyId ? [d.convertedPropertyId] : [])));
  return { closedDeals, properties, linkedPropertyIds };
}

/** Writes the link and its history line. Only a deal still Closed, live and unlinked is changed, so a repeat writes nothing. */
async function writeLink(tx: LinkTx, verdict: LinkVerdict, by: Linker, now: Date): Promise<Linked | null> {
  if (typeof verdict !== "object") return null;
  const { deal, property } = verdict;
  const r = await tx.deal.updateMany({
    where: { id: deal.id, status: CLOSED_STAGE, ...liveRecord, convertedPropertyId: null },
    data: { convertedPropertyId: property.id, ...(by ? { updatedByUserId: by.id } : {}) },
  });
  if (r.count === 0) return null;
  const line = linkedLine(property.address);
  await tx.dealNote.create({
    data: {
      dealId: deal.id,
      body: line,
      noteDate: now,
      source: "change",
      authorUserId: by?.id ?? null,
      data: { event: LINKED_EVENT, propertyId: property.id },
    },
  });
  return { dealId: deal.id, propertyId: property.id, line };
}

/**
 * Links a deal that is Closed to its property, when the rule finds exactly
 * one. Called when a deal moves to Closed. Returns the link written, or null
 * when nothing was (not Closed, archived, linked already, no match, several).
 */
export async function linkClosedDeal(tx: LinkTx, dealId: string, by: Linker, now: Date = new Date()): Promise<Linked | null> {
  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    select: { id: true, address: true, status: true, archivedAt: true, convertedPropertyId: true },
  });
  if (!deal || deal.status !== CLOSED_STAGE || deal.archivedAt) return null;
  const found = await candidatesAt(tx, deal.address);
  if (!found) return null;
  return writeLink(tx, closedDealLink(deal, found.closedDeals, found.properties, found.linkedPropertyIds), by, now);
}

/**
 * Links a property to its Closed deal, when the rule finds exactly one.
 * Called when a property is added. Returns the link written, or null.
 */
export async function linkProperty(tx: LinkTx, propertyId: string, by: Linker, now: Date = new Date()): Promise<Linked | null> {
  const property = await tx.property.findUnique({ where: { id: propertyId }, select: { id: true, address: true, archivedAt: true } });
  if (!property || property.archivedAt) return null;
  const found = await candidatesAt(tx, property.address);
  if (!found) return null;
  return writeLink(tx, propertyLink(property, found.closedDeals, found.properties, found.linkedPropertyIds), by, now);
}
