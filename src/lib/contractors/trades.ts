import type { Prisma } from "@prisma/client";
import { joinTrades, sortTrades } from "./trade-map";

/**
 * Reading a contractor's trades (docs/specs/contractor-trades.md): the select
 * that brings a Contact's trade names along, and their names A to Z. Writes
 * are `setContactTrades` in service.ts.
 *
 *   prisma.contact.findMany({ select: { fullName: true, tradeLinks: TRADE_LINKS } })
 */
export const TRADE_LINKS = { select: { trade: { select: { id: true, name: true } } } } satisfies Prisma.Contact$tradeLinksArgs;

type Links = readonly { trade: { name: string } }[] | null | undefined;

/** A contractor's trade names, A to Z. */
export function tradeNames(links: Links): string[] {
  return sortTrades((links ?? []).map((l) => l.trade.name));
}

/** A contractor's trades on one line ("HVAC, Plumbing"), or null with none: a phone row, search, the assignee picker. */
export function tradeLine(links: Links): string | null {
  return links?.length ? joinTrades(tradeNames(links)) : null;
}

/** A contact who does a trade whose name matches: search's word match, `{ contains, mode }`. */
export function hasTradeNamed(match: Prisma.StringFilter): Prisma.ContactWhereInput {
  return { tradeLinks: { some: { trade: { name: match } } } };
}
