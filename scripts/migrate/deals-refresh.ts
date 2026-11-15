/**
 * Brings the deals up to date with a newer copy of the Master Database's
 * "Prospective Deals" sheet, without undoing anything changed in the app.
 *
 *   npx tsx --env-file=.env scripts/migrate/deals-refresh.ts <base.xlsx> <new.xlsx>           # dry run
 *   npx tsx --env-file=.env scripts/migrate/deals-refresh.ts <base.xlsx> <new.xlsx> --apply   # write
 *   ... --sheet-wins                                                                          # the sheet over the app
 *
 * `base` is the copy the deals were imported from (_private/HG Master
 * Database.xlsx), `new` the latest download. Re-running 03-deals.ts instead
 * would write every sheet value over the app's, so this merges three ways,
 * field by field:
 *
 *   - The sheet didn't change the field since base: nothing to do.
 *   - The app still holds the base value and has no change entry for the
 *     field: the sheet's new value goes in, with a change entry signed
 *     "Spreadsheet" so the deal's Activity says where it came from.
 *   - Both changed it: a conflict, listed and left as the app has it.
 *
 * With --sheet-wins (Connor, Nov 15 2026: "default to whatever this
 * spreadsheet has over what prod has"), any field where the sheet holds a
 * value and the app holds another takes the sheet's, whoever changed it;
 * so do the conflicts. A cell that was blank in both copies of the sheet
 * never clears a value typed in the app, addresses stay as the app has
 * them, and a deal that is Closed or became a property is listed, not moved.
 *
 * A row the app has no deal for is created, with its "Latest Updates" lines
 * as its imported notes, as 03-deals.ts does. A note line the deal doesn't
 * have yet is added as an imported note; nothing is deleted. A row is
 * matched to a deal by the app's own duplicate rule (sameStreetAddress), and
 * through a renamed deal's old address. Rows the script can't place (two
 * addresses in one cell, a sheet row twice) are listed, not written.
 *
 * The dry run writes nothing and prints the plan; a copy goes to
 * _private/deals-refresh-plan.json.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { changeData, changeText, parseLegacyChange, readChange, sameValue, type DealChange, type DealChangeField } from "../../src/lib/deals/log-core";
import { normalizeAddress, sameStreetAddress, streetKey } from "../../src/lib/normalize";
import { dealStageLabel } from "../../src/lib/config";
import { PRIVATE_DIR, cellText, parseIntOrNull, parseMoney } from "./_lib";
import { parseTimeline, toStatus } from "./03-deals";

type Row = Record<string, string | null>;

/** The fields the sheet owns, as the deal stores them. */
type SheetDeal = {
  address: string;
  status: string;
  priority: string | null;
  theirPriceRaw: string | null;
  ourPriceRaw: string | null;
  units: number | null;
  nextAction: string | null;
  latest: string | null;
};

const FIELDS = ["status", "theirPriceRaw", "ourPriceRaw", "units", "nextAction"] as const;
type Field = (typeof FIELDS)[number];

/** The change-entry field each one is logged under. */
const LOGGED: Record<Field, DealChangeField> = {
  status: "status",
  theirPriceRaw: "theirPrice",
  ourPriceRaw: "ourPrice",
  units: "units",
  nextAction: "nextAction",
};

async function readDeals(file: string): Promise<{ row: Row; deal: SheetDeal }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("Prospective Deals");
  if (!ws) throw new Error(`No "Prospective Deals" sheet in ${file}`);
  const out: { row: Row; deal: SheetDeal }[] = [];
  ws.eachRow({ includeEmpty: false }, (r, i) => {
    if (i === 1) return;
    const row: Row = {};
    r.eachCell({ includeEmpty: false }, (c) => (row[c.address.replace(/\d+/g, "")] = cellText(c.value)));
    if (!row.A?.trim()) return;
    const priorityRaw = row.H?.trim() ?? null;
    out.push({
      row,
      deal: {
        // As 03-deals.ts stored it: a line break in the cell ("15 Oxford Ave\nUNDER CONTRACT") is a space.
        address: row.A.replace(/\n/g, " ").trim(),
        status: toStatus(row.I ?? null, priorityRaw),
        priority: priorityRaw && /^\d\s*-/.test(priorityRaw) ? priorityRaw : null,
        theirPriceRaw: row.B?.trim() || null,
        ourPriceRaw: row.C?.trim() || null,
        units: parseIntOrNull(row.D),
        nextAction: row.F?.trim() || null,
        latest: row.E?.trim() || null,
      },
    });
  });
  return out;
}

const text = (v: unknown) => (v == null ? null : String(v));
const same = (f: Field, a: unknown, b: unknown) => sameValue(LOGGED[f], text(a), text(b));
const noteKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const money = (raw: string | null) => {
  const n = parseMoney(raw);
  return n == null ? null : new Prisma.Decimal(n.toFixed(2));
};

type AppDeal = {
  id: string;
  address: string;
  status: string;
  theirPriceRaw: string | null;
  ourPriceRaw: string | null;
  units: number | null;
  nextAction: string | null;
  archivedAt: Date | null;
  convertedPropertyId: string | null;
  notes: { source: string; body: string; data: Prisma.JsonValue }[];
};

type Note = { date: Date | null; body: string };
type Update = { dealId: string; address: string; set: Partial<SheetDeal>; changes: DealChange[]; notes: Note[]; raw: string | null };
type Conflict = { dealId: string; address: string; field: Field; base: unknown; app: unknown; sheet: unknown };

/** The sheet lines a deal doesn't hold yet, by their text. */
function newNotes(latest: string | null, have: Set<string>): Note[] {
  if (!latest) return [];
  return parseTimeline(latest)
    .notes.map((n) => ({ date: n.date, body: n.body.trim() }))
    .filter((n) => n.body && !have.has(noteKey(n.body)));
}

async function main() {
  const [baseFile, newFile, ...flags] = process.argv.slice(2);
  if (!baseFile || !newFile) throw new Error("Usage: deals-refresh.ts <base.xlsx> <new.xlsx> [--apply] [--sheet-wins]");
  const apply = flags.includes("--apply");
  const sheetWins = flags.includes("--sheet-wins");

  const [base, next, deals] = await Promise.all([
    readDeals(baseFile),
    readDeals(newFile),
    prisma.deal.findMany({
      select: {
        id: true,
        address: true,
        status: true,
        theirPriceRaw: true,
        ourPriceRaw: true,
        units: true,
        nextAction: true,
        archivedAt: true,
        convertedPropertyId: true,
        notes: { where: { deletedAt: null }, select: { source: true, body: true, data: true } },
      },
    }),
  ]);
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(`Database: ${host || "(none)"}; ${deals.length} deals. Base sheet ${base.length} rows, new sheet ${next.length} rows.`);

  // Each deal under its exact address (as 03-deals.ts keyed it) and its street key, and again under any
  // address it was renamed from in the app.
  const byExact = new Map<string, AppDeal[]>();
  const byStreet = new Map<string, { deal: AppDeal; address: string }[]>();
  const put = (address: string, deal: AppDeal) => {
    const exact = normalizeAddress(address);
    byExact.set(exact, [...(byExact.get(exact) ?? []), deal]);
    const k = streetKey(address);
    if (k) byStreet.set(k, [...(byStreet.get(k) ?? []), { deal, address }]);
  };
  for (const d of deals) {
    put(d.address, d);
    for (const n of d.notes) {
      const c = n.source === "change" ? (readChange(n.data) ?? parseLegacyChange(n.body)) : null;
      if (c?.field === "address" && c.from) put(c.from, d);
    }
  }
  const uniq = (ds: AppDeal[]) => [...new Map(ds.map((d) => [d.id, d])).values()];
  /** The deal a sheet row is: the one imported from that exact text first, else the one building the app's duplicate rule finds. */
  const findDeal = (address: string): AppDeal[] => {
    const exact = uniq(byExact.get(normalizeAddress(address)) ?? []);
    if (exact.length) return exact;
    return uniq((byStreet.get(streetKey(address)) ?? []).filter((h) => sameStreetAddress(h.address, address)).map((h) => h.deal));
  };
  /** The base rows for a sheet row: its own text first (the row whose fields were imported), then the same building. */
  const findBase = (address: string) => {
    const exact = base.filter((b) => normalizeAddress(b.deal.address) === normalizeAddress(address));
    return exact.length ? exact : base.filter((b) => sameStreetAddress(b.deal.address, address));
  };
  const linesOf = (latest: string | null) => new Set(newNotes(latest, new Set()).map((n) => noteKey(n.body)));

  const creates: { deal: SheetDeal; notes: Note[] }[] = [];
  const updates = new Map<string, Update>();
  const conflicts: Conflict[] = [];
  const flagged: string[] = [];
  const createdByKey = new Map<string, { deal: SheetDeal; notes: Note[] }>();
  const fieldsDone = new Set<string>();

  for (const { deal: s } of next) {
    if ((s.address.match(/\b\d{5}\b/g) ?? []).length > 1) {
      flagged.push(`Two addresses in one cell, not touched: ${s.address}`);
      continue;
    }
    const matches = findDeal(s.address);
    if (matches.length > 1) {
      flagged.push(`Matches ${matches.length} deals, not touched: ${s.address} (${matches.map((m) => m.address).join("; ")})`);
      continue;
    }
    const app = matches[0];
    const baseRows = findBase(s.address);
    const b = baseRows[0]?.deal ?? null;

    if (!app) {
      if (b) {
        flagged.push(`Imported in August but no deal has this address now, not re-created: ${s.address}`);
        continue;
      }
      // A row repeated in the sheet folds its lines into the deal its first row makes, as 03-deals.ts does.
      const key = normalizeAddress(s.address);
      const made = createdByKey.get(key);
      if (made) {
        const have = new Set(made.notes.map((n) => noteKey(n.body)));
        made.notes.push(...newNotes(s.latest, have));
        continue;
      }
      const c = { deal: s, notes: newNotes(s.latest, new Set()) };
      createdByKey.set(key, c);
      creates.push(c);
      continue;
    }

    const u: Update = updates.get(app.id) ?? { dealId: app.id, address: app.address, set: {}, changes: [], notes: [], raw: null };

    // Fields come from the deal's first row only; a repeated row adds its note lines.
    if (!fieldsDone.has(app.id)) {
      fieldsDone.add(app.id);
      // The fields the app has changed itself since the import.
      const touched = new Set<DealChangeField>();
      for (const n of app.notes) {
        if (n.source !== "change") continue;
        const c = readChange(n.data) ?? parseLegacyChange(n.body);
        if (c) touched.add(c.field);
      }
      for (const f of FIELDS) {
        const sheet = s[f];
        const mine = app[f];
        if (!sheetWins && b && same(f, sheet, b[f])) continue; // the sheet didn't change it
        if (same(f, mine, sheet)) continue; // already the same
        const untouched = !touched.has(LOGGED[f]);
        const appAsBase = b ? same(f, mine, b[f]) : mine == null;
        // A blank the sheet has always had says nothing about a value typed in the app.
        const sheetSaysSomething = sheet != null || (b != null && b[f] != null);
        if (sheetWins && f === "status" && (app.status === "CLOSED!" || app.convertedPropertyId)) {
          flagged.push(`Closed or a property already, stage left as is: ${app.address} (sheet: ${dealStageLabel(String(sheet))})`);
          continue;
        }
        if ((untouched && appAsBase) || (sheetWins && sheetSaysSomething)) {
          (u.set as Record<string, unknown>)[f] = sheet;
          if (f === "status") u.set.priority = s.priority;
          u.changes.push({ field: LOGGED[f], from: text(mine), to: text(sheet) });
        } else {
          conflicts.push({ dealId: app.id, address: app.address, field: f, base: b?.[f] ?? null, app: mine, sheet });
        }
      }
      if ((s.latest ?? "") !== (b?.latest ?? "")) u.raw = s.latest;
    }

    // Only lines new in the sheet: a base line the app no longer has was deleted there on purpose.
    const have = new Set([
      ...app.notes.filter((n) => n.source !== "change").map((n) => noteKey(n.body)),
      ...u.notes.map((n) => noteKey(n.body)),
    ]);
    const baseLines = new Set(baseRows.flatMap((r) => [...linesOf(r.deal.latest)]));
    u.notes.push(...newNotes(s.latest, have).filter((n) => !baseLines.has(noteKey(n.body))));

    if (u.changes.length || u.notes.length || u.raw !== null) updates.set(app.id, u);
  }

  // The plan, readable.
  const show = (f: Field, v: unknown) => (v == null || v === "" ? "—" : f === "status" ? dealStageLabel(String(v)) : String(v));
  console.log(`\nNew deals: ${creates.length}`);
  for (const c of creates) console.log(`  + ${c.deal.address} · ${dealStageLabel(c.deal.status)} · ${c.deal.theirPriceRaw ?? "—"} · ${c.notes.length} notes`);
  const changed = [...updates.values()].filter((u) => u.changes.length);
  console.log(`\nDeals with field changes: ${changed.length}`);
  for (const u of changed) console.log(`  ~ ${u.address}: ${u.changes.map((c) => changeText(c)).join("; ")}`);
  const noted = [...updates.values()].filter((u) => u.notes.length);
  console.log(`\nDeals with new note lines: ${noted.length}`);
  for (const u of noted) for (const n of u.notes) console.log(`  · ${u.address}: ${n.body.replace(/\n/g, " ").slice(0, 100)}`);
  console.log(`\nConflicts (left as the app has them): ${conflicts.length}`);
  for (const c of conflicts) console.log(`  ! ${c.address} · ${c.field}: was ${show(c.field, c.base)}, app ${show(c.field, c.app)}, sheet ${show(c.field, c.sheet)}`);
  console.log(`\nNot placed: ${flagged.length}`);
  for (const f of flagged) console.log(`  ? ${f}`);

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRIVATE_DIR, "deals-refresh-plan.json"), JSON.stringify({ creates, updates: [...updates.values()], conflicts, flagged }, null, 2));

  if (!apply) {
    console.log("\nDry run: nothing written. Add --apply to write it.");
    return;
  }

  // What the touched deals held before, so the run can be undone by hand.
  const before = await prisma.deal.findMany({ where: { id: { in: [...updates.keys()] } } });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(PRIVATE_DIR, `deals-refresh-before-${stamp}.json`), JSON.stringify(before, null, 2));

  const now = new Date();
  const sign = (c: DealChange) => ({
    // One word: the log calls a signer by the first word of the name ("Spreadsheet changed the stage to Pass").
    body: `${changeText(c)}  ·  Spreadsheet`,
    noteDate: now,
    source: "change",
    data: changeData(c) satisfies Prisma.InputJsonObject,
  });
  const imported = (dealId: string, notes: Note[]) =>
    notes.map((n) => ({ dealId, noteDate: n.date, body: n.body, source: "migration" }));

  await prisma.$transaction(
    async (tx) => {
      for (const c of creates) {
        const d = c.deal;
        const made = await tx.deal.create({
          data: {
            address: d.address,
            status: d.status,
            priority: d.priority,
            theirPriceRaw: d.theirPriceRaw,
            theirPrice: money(d.theirPriceRaw),
            ourPriceRaw: d.ourPriceRaw,
            ourPrice: money(d.ourPriceRaw),
            units: d.units,
            nextAction: d.nextAction,
            rawLatestUpdates: d.latest,
          },
        });
        if (c.notes.length) await tx.dealNote.createMany({ data: imported(made.id, c.notes) });
      }
      for (const u of updates.values()) {
        const data: Prisma.DealUpdateInput = { ...u.set };
        if ("theirPriceRaw" in u.set) data.theirPrice = money(u.set.theirPriceRaw ?? null);
        if ("ourPriceRaw" in u.set) data.ourPrice = money(u.set.ourPriceRaw ?? null);
        if (u.raw !== null) data.rawLatestUpdates = u.raw;
        if (Object.keys(data).length) await tx.deal.update({ where: { id: u.dealId }, data });
        if (u.changes.length) await tx.dealNote.createMany({ data: u.changes.map((c) => ({ dealId: u.dealId, ...sign(c) })) });
        if (u.notes.length) await tx.dealNote.createMany({ data: imported(u.dealId, u.notes) });
      }
    },
    { timeout: 120_000 },
  );
  console.log(`\nWritten: ${creates.length} new deals, ${changed.length} updated, ${noted.length} with new notes. Before: _private/deals-refresh-before-${stamp}.json`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
