/**
 * The trades move's dry run (docs/specs/contractor-trades.md 3.3): what the
 * migration 20261114180000_contractor_trades will do to a database's
 * contractors, before it ships. Reads only; it writes nothing, anywhere.
 *
 *   npx tsx --env-file=<file with DATABASE_URL> scripts/trades-dry-run.ts
 *   npm run trades:dry-run              # the local database in .env
 *
 * It prints every distinct spelling in Contact.trades with the trade it
 * becomes and how many contractors have it, the spellings the map
 * (src/lib/contractors/trade-map.ts) doesn't cover, which become trades of
 * their own, each contractor's trades before and after, and the list the
 * migration leaves. The output holds contractor names: keep any saved copy
 * inside the company.
 */
import { prisma } from "../src/lib/db";
import { TRADE_MAP, mappedTrade, oldTradeSpellings, tradeKey, tradeName, tradesFromText } from "../src/lib/contractors/trade-map";
import { describeTarget } from "./asana/_import-lib";

async function main() {
  const t = describeTarget();
  console.log(`database: ${t.host}/${t.database}${t.local ? " (local)" : ""}. Reading only.\n`);

  const contacts = await prisma.contact.findMany({
    select: { id: true, fullName: true, trades: true, archivedAt: true },
    orderBy: { fullName: "asc" },
  });

  // Each spelling, ignoring case and spacing: how it was written, its trade, and who has it.
  const spellings = new Map<string, { shown: string; trade: string; mapped: boolean; people: number }>();
  for (const c of contacts) {
    for (const s of oldTradeSpellings(c.trades)) {
      const k = tradeKey(s);
      const known = mappedTrade(s);
      const prev = spellings.get(k);
      spellings.set(k, { shown: prev?.shown ?? s, trade: known ?? tradeName(s)!, mapped: !!known, people: (prev?.people ?? 0) + 1 });
    }
  }
  const rows = [...spellings.values()].sort((a, b) => a.trade.localeCompare(b.trade) || a.shown.localeCompare(b.shown));

  console.log(`Spellings (${rows.length}), as spelling → trade (contractors):`);
  for (const r of rows) console.log(`  ${r.shown} → ${r.trade} (${r.people})${r.mapped ? "" : "   NOT IN THE MAP: becomes its own trade"}`);

  const unmapped = rows.filter((r) => !r.mapped);
  console.log(unmapped.length ? `\n${unmapped.length} spelling(s) the map doesn't cover: ${unmapped.map((r) => `"${r.shown}"`).join(", ")}` : "\nThe map covers every spelling.");

  console.log(`\nContractors with trades (${contacts.filter((c) => c.trades?.trim()).length} of ${contacts.length}):`);
  for (const c of contacts) {
    if (!c.trades?.trim()) continue;
    console.log(`  ${c.fullName}${c.archivedAt ? " (archived)" : ""}: "${c.trades}" → ${tradesFromText(c.trades).join(", ")}`);
  }

  // The list the migration leaves: the 17, plus any spelling it keeps as its own trade.
  const counts = new Map<string, number>(Object.keys(TRADE_MAP).map((n) => [n, 0]));
  for (const c of contacts) for (const n of tradesFromText(c.trades)) counts.set(n, (counts.get(n) ?? 0) + 1);
  console.log(`\nThe trades list after (${counts.size}), with contractors:`);
  for (const [n, k] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${n}: ${k}`);
}

main()
  .catch((err) => {
    console.error("[trades-dry-run] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
