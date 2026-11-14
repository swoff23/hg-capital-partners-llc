import type { Prisma, PrismaClient } from "@prisma/client";
import { ConflictError } from "@/lib/action-result";
import { joinTrades, tradeKey, tradeName } from "./trade-map";
import { TRADE_LINKS, tradeNames } from "./trades";

/**
 * Writing a contractor's trades (docs/specs/contractor-trades.md 4.2), on
 * whichever client the caller holds: service.ts passes the app's, and
 * trade-links.pg.test.ts a scratch database's. service.ts adds the page
 * refreshes.
 */

type Tx = Prisma.TransactionClient;

/**
 * The ids of the trades with these names, A to Z by name, adding any the list
 * doesn't have yet (named by `tradeName`: "roofing" is added as "Roofing").
 * A name matches a trade ignoring case and spacing, so "plumbing" is Plumbing.
 */
export async function ensureTrades(tx: Tx, names: readonly string[]): Promise<string[]> {
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = tradeName(raw);
    if (name && !wanted.has(tradeKey(name))) wanted.set(tradeKey(name), name);
  }
  if (wanted.size === 0) return [];
  const keys = [...wanted.keys()];
  // Two saves adding the same new trade at once: the second's insert skips, and both read the one row.
  await tx.trade.createMany({ data: [...wanted].map(([key, name]) => ({ key, name })), skipDuplicates: true });
  const rows = await tx.trade.findMany({ where: { key: { in: keys } }, select: { id: true }, orderBy: { name: "asc" } });
  return rows.map((r) => r.id);
}

/**
 * Replace a contractor's trades with `next` (names). `expected` is what the
 * page loaded; when someone changed them meanwhile the save is refused,
 * saying what they are now ("This changed to HVAC, Plumbing": a trades list
 * doesn't record who or when). A name the list doesn't have yet is added. A
 * trade this leaves with no contractor at all (archived ones count) comes off
 * the list, so a mistyped "Roofng" doesn't stay behind; adding it again, or
 * Undo, brings it back.
 */
export async function replaceContactTrades(db: PrismaClient, id: string, next: readonly string[], expected?: readonly string[]): Promise<void> {
  await db.$transaction(async (tx) => {
    const contact = await tx.contact.findUnique({ where: { id }, select: { tradeLinks: TRADE_LINKS } });
    if (!contact) throw new Error("This contractor is gone.");
    const current = tradeNames(contact.tradeLinks);
    if (expected && joinTrades(expected).toLowerCase() !== joinTrades(current).toLowerCase()) {
      throw new ConflictError({ fields: ["trades"], at: "", theirs: { trades: joinTrades(current) } });
    }
    const ids = await ensureTrades(tx, next);
    const dropped = contact.tradeLinks.map((l) => l.trade.id).filter((t) => !ids.includes(t));
    await tx.contactTrade.deleteMany({ where: { contactId: id, tradeId: { in: dropped } } });
    await tx.contactTrade.createMany({ data: ids.map((tradeId) => ({ contactId: id, tradeId })), skipDuplicates: true });
    if (dropped.length > 0) await tx.trade.deleteMany({ where: { id: { in: dropped }, contacts: { none: {} } } });
  });
}
