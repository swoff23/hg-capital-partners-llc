/**
 * One-off: seed Property.buildingCapex from the component-age spreadsheet.
 *
 * Source columns:
 *   L ROOF     -> buildingCapex.roof        (age + material, e.g. "4/20 years, Shingle")
 *   N PLUMB    -> buildingCapex.plumbing    ("2 Years, Copper/PEX")
 *   O ELECTRIC -> buildingCapex.electrical  ("5 Years, Circuit")
 *   M HVAC is unit-level (multiple systems / property) — not imported here.
 *
 * Age notation: first number = current age in years; "X/YY" is "X years old on a
 * YY-year system", so we take X. Age -> year = 2026 - round(age).
 * Type = free text after the first comma.
 *
 * Run:  npx tsx scripts/import-building-capex.ts          (dry run)
 *       npx tsx scripts/import-building-capex.ts --apply
 */
import { prisma } from "../src/lib/db";

const NOW_YEAR = 2026;
const APPLY = process.argv.includes("--apply");

// address (as in the sheet) -> raw cell text for each column
const SHEET: Record<string, { roof?: string; plumbing?: string; electrical?: string }> = {
  "118 Congress St Buffalo NY 14213": { roof: "4/20 years, Shingle", plumbing: "2 Years, Copper/PEX", electrical: "5 Years, Circuit" },
  "647 Prospect Ave Buffalo NY 14213": { roof: "2.5 Years, Shingle", plumbing: "1.5 Years, Copper/PEX", electrical: "5 Years, Circuit" },
  "15 Oxford Ave Buffalo NY 14209": { roof: "10/20 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "1 Year, Circuit" },
  "933 Lafayette Ave Buffalo NY 14209": { roof: "5 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "1 Year, Circuit" },
  "767 Prospect Ave Buffalo NY 14213": { roof: "4 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "1 Year, Circuit" },
  "765 Prospect Ave Buffalo NY 14213": { roof: "4 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "1 Year, Circuit" },
  "58 Mariner St Buffalo NY 14201": { roof: "15 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "1/15 Years, Circuit" },
  "428 Normal Ave Buffalo NY 14213": { roof: "9 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "10 Years, Circuit" },
  "725 Linwood Ave Buffalo NY 14209": { roof: "9 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "5 Years, Circuit" },
  "23 Sherwood Dr Buffalo NY 14213": { roof: "10/20 Years, Shingle", plumbing: "1 Year, Copper/PEX", electrical: "10 Years, Circuit" },
};

/** Normalise an address to "<housenumber>|<streetword>|<zip>" for fuzzy matching. */
function key(addr: string): string {
  const zip = addr.match(/\b(\d{5})\b/)?.[1] ?? "";
  const num = addr.match(/^\s*(\d+)/)?.[1] ?? "";
  const street =
    addr
      .toLowerCase()
      .replace(/[.,]/g, " ")
      .replace(/\b(avenue|ave)\b/g, "ave")
      .replace(/\b(street|st)\b/g, "st")
      .replace(/\b(drive|dr)\b/g, "dr")
      .replace(/\s+/g, " ")
      .match(/^\s*\d+\s+([a-z]+)/)?.[1] ?? "";
  return `${num}|${street}|${zip}`;
}

function parseCell(raw?: string): { year: string; type: string | null } | null {
  if (!raw) return null;
  const first = parseFloat(raw.split(/[/,]/)[0].trim());
  if (!Number.isFinite(first)) return null;
  const comma = raw.indexOf(",");
  const type = comma >= 0 ? raw.slice(comma + 1).trim() || null : null;
  return { year: String(NOW_YEAR - Math.round(first)), type };
}

async function main() {
  const props = await prisma.property.findMany({ select: { id: true, address: true, buildingCapex: true } });
  const byKey = new Map(props.map((p) => [key(p.address), p]));

  for (const [sheetAddr, cells] of Object.entries(SHEET)) {
    const match = byKey.get(key(sheetAddr));
    if (!match) {
      console.log(`  ⚠ NO MATCH for "${sheetAddr}" (key ${key(sheetAddr)})`);
      continue;
    }
    const existing = (match.buildingCapex ?? {}) as Record<string, Record<string, unknown>>;
    const next = { ...existing };
    const apply = (k: string, raw?: string) => {
      const p = parseCell(raw);
      if (!p) return "-";
      next[k] = { ...(next[k] ?? {}), year: p.year, type: p.type };
      return `${p.year}${p.type ? ` (${p.type})` : ""}`;
    };

    const r = apply("roof", cells.roof);
    const n = apply("plumbing", cells.plumbing);
    const e = apply("electrical", cells.electrical);
    console.log(`  ${match.address}\n    roof → ${r}   plumbing → ${n}   electrical → ${e}`);

    if (APPLY) {
      await prisma.property.update({
        where: { id: match.id },
        data: { buildingCapex: next as unknown as object },
      });
    }
  }
  console.log(APPLY ? "\n✓ applied" : "\n(dry run — pass --apply to write)");
}

main().finally(() => prisma.$disconnect());
