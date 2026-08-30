/**
 * "Prospective Deals" (~748 rows) → Deal records.
 *   - Raw "Latest Updates" cell preserved verbatim on the Deal.
 *   - Dated lines parsed into a DealNote timeline (year inferred; newest-first assumed).
 *   - "Next Steps" → nextAction. Priority / VIP / Status → structured fields.
 *
 * Idempotent: upserts on normalized address; DealNotes for a deal are replaced on re-run.
 */
import { prisma } from "../../src/lib/db";
import { report } from "./_report";
import { readSheet, normalizeAddress, parseMoney, parseIntOrNull, isUrl } from "./_lib";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const DATE_LINE = /^\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\s*[-–—:]+\s*(.*)$/;

function monthIdx(token: string): number | null {
  const k = token.slice(0, 3).toLowerCase();
  return k in MONTHS ? MONTHS[k] : null;
}

/** Parse a "Latest Updates" blob (assumed newest-first) into dated notes. */
function parseTimeline(blob: string): { notes: { date: Date | null; body: string }[]; dated: number } {
  const rawLines = blob.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const notes: { date: Date | null; body: string }[] = [];
  let year = new Date().getFullYear();
  let prevMonth: number | null = null;
  let dated = 0;
  const now = new Date();

  for (const line of rawLines) {
    const m = line.match(DATE_LINE);
    if (!m) {
      if (notes.length) notes[notes.length - 1].body += `\n${line}`;
      else notes.push({ date: null, body: line });
      continue;
    }
    const [, monTok, dayStr, yearStr, body] = m;
    const mon = monthIdx(monTok);
    if (mon == null) {
      if (notes.length) notes[notes.length - 1].body += `\n${line}`;
      else notes.push({ date: null, body: line });
      continue;
    }
    if (yearStr) {
      year = parseInt(yearStr, 10);
    } else if (prevMonth != null && mon > prevMonth) {
      year -= 1; // walked past a year boundary going back in time
    }
    let date: Date | null = new Date(Date.UTC(year, mon, parseInt(dayStr, 10)));
    // first (newest) note can't be in the future
    if (prevMonth == null && date > now) {
      year -= 1;
      date = new Date(Date.UTC(year, mon, parseInt(dayStr, 10)));
    }
    if (Number.isNaN(date.getTime())) date = null;
    prevMonth = mon;
    dated++;
    notes.push({ date, body: body || "(no text)" });
  }
  return { notes, dated };
}

function toStatus(statusCol: string | null, priorityCol: string | null): string {
  const s = (statusCol ?? "").trim().toLowerCase();
  if (s === "pass") return "Pass";
  if (s === "active") return "Active";
  const p = (priorityCol ?? "").trim().toLowerCase();
  if (p === "closed!" || p === "closing") return "Under Contract";
  if (p === "pass") return "Pass";
  return statusCol?.trim() || "Active";
}

export async function migrateDeals() {
  report.section("Deals");
  const rows = (await readSheet("Prospective Deals")).slice(1).filter((r) => r["A"]?.trim());
  report.line(`Prospective Deals: ${rows.length} rows with an address.`);

  const seen = new Map<string, string>(); // normalizedAddress -> displayAddress
  let created = 0;
  let updated = 0;
  let dupes = 0;
  let totalNotes = 0;
  let totalDated = 0;
  const statusCounts: Record<string, number> = {};

  for (const r of rows) {
    const address = r["A"]!.replace(/\n/g, " ").trim();
    const key = normalizeAddress(address);
    if (seen.has(key)) {
      // Same property listed again — fold this row's notes into the first deal rather than drop it.
      dupes++;
      const primary = await prisma.deal.findFirst({
        where: { address: { equals: seen.get(key)!, mode: "insensitive" } },
      });
      const extraBlob = r["E"]?.trim();
      if (primary && extraBlob && !(primary.rawLatestUpdates ?? "").includes(extraBlob)) {
        const { notes } = parseTimeline(extraBlob);
        await prisma.dealNote.createMany({
          data: notes.map((n) => ({
            dealId: primary.id,
            noteDate: n.date,
            body: n.body.trim(),
            source: "migration",
          })),
        });
        await prisma.deal.update({
          where: { id: primary.id },
          data: { rawLatestUpdates: `${primary.rawLatestUpdates ?? ""}\n\n--- (duplicate row) ---\n${extraBlob}` },
        });
      }
      continue;
    }
    seen.set(key, address);

    const priorityRaw = r["H"]?.trim() ?? null;
    const status = toStatus(r["I"] ?? null, priorityRaw);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    const priority = priorityRaw && /^\d\s*-/.test(priorityRaw) ? priorityRaw : null;

    const blob = r["E"] ?? "";
    const { notes, dated } = parseTimeline(blob);
    totalNotes += notes.length;
    totalDated += dated;

    const nextAction = r["F"]?.trim() || null;
    const links = nextAction && isUrl(nextAction) ? [{ label: "Next step link", url: nextAction }] : [];

    const data = {
      address,
      theirPrice: money(parseMoney(r["B"])),
      theirPriceRaw: r["B"]?.trim() || null,
      ourPrice: money(parseMoney(r["C"])),
      ourPriceRaw: r["C"]?.trim() || null,
      units: parseIntOrNull(r["D"]),
      status,
      priority,
      vip: /^yes$/i.test(r["G"] ?? ""),
      nextAction,
      rawLatestUpdates: blob || null,
      links: links as unknown as object,
    };

    const existing = await prisma.deal.findFirst({
      where: { address: { equals: address, mode: "insensitive" } },
    });
    let dealId: string;
    if (existing) {
      await prisma.deal.update({ where: { id: existing.id }, data });
      await prisma.dealNote.deleteMany({ where: { dealId: existing.id, source: "migration" } });
      dealId = existing.id;
      updated++;
    } else {
      const d = await prisma.deal.create({ data });
      dealId = d.id;
      created++;
    }

    if (notes.length) {
      await prisma.dealNote.createMany({
        data: notes.map((n) => ({
          dealId,
          noteDate: n.date,
          body: n.body.trim(),
          source: "migration",
        })),
      });
    }
  }

  report.line(`Created ${created}, updated ${updated}, ${dupes} duplicate addresses skipped.`);
  report.line(
    `Timeline: ${totalNotes} notes across all deals, ${totalDated} with a parsed date (${Math.round(
      (totalDated / Math.max(totalNotes, 1)) * 100,
    )}%). Raw cell text kept on every deal.`,
  );
  report.line(`Status distribution: ${JSON.stringify(statusCounts)}`);
}

function money(n: number | null): string | null {
  return n == null ? null : n.toFixed(2);
}
