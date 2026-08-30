/**
 * One-off: seed Property.buildingCapex from the component-age spreadsheet.
 *
 * Source columns:
 *   L ROOF     -> buildingCapex.roof
 *   N PLUMB    -> buildingCapex.plumbing
 *   O ELECTRIC -> buildingCapex.electrical
 *   M HVAC is unit-level (multiple systems / property) — not imported here.
 *
 * Age notation: first number = current age in years; a "X/YY" pair is
 * "X years old on a YY-year system", so we take X. Age -> year = 2026 - round(age).
 *
 * Run:  npx tsx scripts/import-building-capex.ts          (dry run, prints the plan)
 *       npx tsx scripts/import-building-capex.ts --apply   (writes)
 */
import { prisma } from "../src/lib/db";

const NOW_YEAR = 2026;
const APPLY = process.argv.includes("--apply");

// address (as in the sheet) -> { roof, plumbing, electrical } raw age strings
const SHEET: Record<string, { roof?: string; plumbing?: string; electrical?: string }> = {
  "118 Congress St Buffalo NY 14213": { roof: "4/20", plumbing: "2", electrical: "5" },
  "647 Prospect Ave Buffalo NY 14213": { roof: "2.5", plumbing: "1.5", electrical: "5" },
  "15 Oxford Ave Buffalo NY 14209": { roof: "10/20", plumbing: "1", electrical: "1" },
  "933 Lafayette Ave Buffalo NY 14209": { roof: "5", plumbing: "1", electrical: "1" },
  "767 Prospect Ave Buffalo NY 14213": { roof: "4", plumbing: "1", electrical: "1" },
  "765 Prospect Ave Buffalo NY 14213": { roof: "4", plumbing: "1", electrical: "1" },
  "58 Mariner St Buffalo NY 14201": { roof: "15", plumbing: "1", electrical: "1/15" },
  "428 Normal Ave Buffalo NY 14213": { roof: "9", plumbing: "1", electrical: "10" },
  "725 Linwood Ave Buffalo NY 14209": { roof: "9", plumbing: "1", electrical: "5" },
  "23 Sherwood Dr Buffalo NY 14213": { roof: "10/20", plumbing: "1", electrical: "10" },
};

/** Normalise an address to "<housenumber> <streetword> <zip>" for fuzzy matching. */
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

function ageToYear(raw?: string): string | null {
  if (!raw) return null;
  const first = parseFloat(raw.split("/")[0].trim());
  if (!Number.isFinite(first)) return null;
  return String(NOW_YEAR - Math.round(first));
}

async function main() {
  const props = await prisma.property.findMany({ select: { id: true, address: true, buildingCapex: true } });
  const byKey = new Map(props.map((p) => [key(p.address), p]));

  for (const [sheetAddr, ages] of Object.entries(SHEET)) {
    const match = byKey.get(key(sheetAddr));
    if (!match) {
      console.log(`  ⚠ NO MATCH for "${sheetAddr}" (key ${key(sheetAddr)})`);
      continue;
    }
    const existing = (match.buildingCapex ?? {}) as Record<string, { year?: string | null }>;
    const next = { ...existing };
    const roofY = ageToYear(ages.roof);
    const plumbY = ageToYear(ages.plumbing);
    const elecY = ageToYear(ages.electrical);
    if (roofY) next.roof = { ...(next.roof ?? {}), year: roofY };
    if (plumbY) next.plumbing = { ...(next.plumbing ?? {}), year: plumbY };
    if (elecY) next.electrical = { ...(next.electrical ?? {}), year: elecY };

    console.log(
      `  ${match.address}\n    roof ${ages.roof ?? "-"} → ${roofY ?? "-"}   plumbing ${ages.plumbing ?? "-"} → ${plumbY ?? "-"}   electrical ${ages.electrical ?? "-"} → ${elecY ?? "-"}`,
    );

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
