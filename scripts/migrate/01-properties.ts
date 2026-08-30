/**
 * "Property Information" (per-unit reference rows) + "SREO" (per-property acquisition data)
 *   → Property records with a `units` JSON array.
 *
 * Idempotent: upserts on normalized address.
 */
import { prisma } from "../../src/lib/db.ts";
import { report } from "./_report.ts";
import {
  readSheet,
  cellText,
  normalizeAddress,
  parseExcelDate,
  parseFloatOrNull,
  parseIntOrNull,
  parseMoney,
} from "./_lib.ts";

const EQUIP_COLS: Array<[type: string, modelCol: string, yearCol: string]> = [
  ["Roof", "T", "U"],
  ["Refrigerator", "V", "W"],
  ["Dishwasher", "X", "Y"],
  ["Oven", "Z", "AA"],
  ["Microwave", "AB", "AC"],
  ["Oven Fan", "AD", "AE"],
  ["Garbage Disposal", "AF", "AG"],
  ["Washing Machine", "AH", "AI"],
  ["Drying Machine", "AJ", "AK"],
  ["HVAC", "AL", "AM"],
  ["Water Heater", "AN", "AO"],
  ["Ceiling Fans", "AP", "AQ"],
  ["Garage Door Opener", "AR", "AS"],
];

type UnitRef = {
  label: string | null;
  lockboxCode: string | null;
  utilities: Record<string, string | null>;
  equipment: Array<{ type: string; model: string | null; installYear: string | null }>;
};

export async function migrateProperties() {
  report.section("Properties");

  // ---- SREO: acquisition / status data keyed by normalized address ----
  const sreo = await readSheet("SREO");
  const sreoByAddr = new Map<string, Record<string, string | null>>();
  for (const row of sreo) {
    const addr = row["B"]?.trim();
    // Real property rows start with a house number; skip bank-account rows ("HG ... LLC"), "Total", headers.
    if (!addr || !/^\d+[\d/]*\s+[A-Za-z]/.test(addr)) continue;
    if (/\b(llc|holding|property management|capital partners)\b/i.test(addr)) continue;
    sreoByAddr.set(normalizeAddress(addr), row);
  }
  report.line(`SREO: ${sreoByAddr.size} property rows parsed.`);

  // ---- Property Information: one row per unit; group by address ----
  const pi = await readSheet("Property Information");
  // rows 1-3 are notes / equipment labels / headers. Real rows start with a house number.
  const looksLikeAddress = (a: string | null) =>
    !!a && /^\d+[a-z]?(\/\d+)?\s+\S/i.test(a.trim()) && !/^\d+\s*(llc|holding)/i.test(a.trim());
  const dataRows = pi.slice(3).filter((r) => looksLikeAddress(r["A"]));
  const skippedRows = pi.slice(3).filter((r) => r["A"]?.trim() && !looksLikeAddress(r["A"]));
  for (const r of skippedRows) report.line(`Skipped non-address row: "${r["A"]}"`);

  const grouped = new Map<
    string,
    { displayAddress: string; rows: Record<string, string | null>[] }
  >();
  for (const row of dataRows) {
    const key = normalizeAddress(row["A"]);
    if (!grouped.has(key)) grouped.set(key, { displayAddress: row["A"]!.replace(/\n/g, " ").trim(), rows: [] });
    grouped.get(key)!.rows.push(row);
  }
  report.line(`Property Information: ${dataRows.length} unit rows → ${grouped.size} properties.`);

  let created = 0;
  let updated = 0;

  for (const [key, { displayAddress, rows }] of grouped) {
    const first = (col: string) => rows.map((r) => r[col]).find((v) => v && v.trim()) ?? null;

    // conflict check for property-level fields that should be constant across units
    for (const col of ["D", "E", "F", "G"] as const) {
      const vals = new Set(rows.map((r) => r[col]).filter((v) => v && v.trim()));
      if (vals.size > 1)
        report.warn(
          `${displayAddress}: column ${col} varies across units (${[...vals].join(" | ")}) — took first.`,
        );
    }

    const units: UnitRef[] = rows.map((r) => ({
      label: r["B"]?.replace(/\n/g, " / ").trim() ?? null,
      lockboxCode: r["C"] ?? null,
      utilities: {
        nationalGridAcct: r["H"] ?? null,
        nationalGridAutopay: r["I"] ?? null,
        nationalGridLofl: r["J"] ?? null,
        nationalFuelAcct: r["K"] ?? null,
        nationalFuelAutopay: r["L"] ?? null,
        nationalFuelLofl: r["M"] ?? null,
        waterAcct: r["N"] ?? null,
        waterAutopay: r["O"] ?? null,
      },
      equipment: EQUIP_COLS.map(([type, mc, yc]) => ({
        type,
        model: r[mc] ?? null,
        installYear: r[yc] ?? null,
      })).filter((e) => e.model || e.installYear),
    }));

    const s = sreoByAddr.get(key) ?? findSreoLoose(sreoByAddr, key);

    const data = {
      address: displayAddress,
      llcOwner: first("G") ?? s?.["C"] ?? null,
      attorney: first("D"),
      lender: first("E"),
      loanServicer: first("F"),
      refiTarget: s?.["F"] ?? null,
      status: s?.["G"] ?? null,
      strategy: s?.["H"] ?? null,
      purchaseDate: parseExcelDate(s?.["I"]),
      refinanceDate: parseExcelDate(s?.["J"]),
      purchasePrice: dec(parseMoney(s?.["M"]) ?? parseFloatOrNull(s?.["M"])),
      currentLoan: dec(parseFloatOrNull(s?.["N"])),
      value: dec(parseFloatOrNull(s?.["P"])),
      replacementCost: dec(parseFloatOrNull(s?.["Q"])),
      rehabAmount: dec(parseFloatOrNull(s?.["K"])),
      rehabMonths: dec(parseFloatOrNull(s?.["L"])),
      sqft: parseIntOrNull(s?.["E"]),
      unitCount: parseIntOrNull(s?.["D"]) ?? units.length,
      units: units as unknown as object,
    };

    const existing = await prisma.property.findFirst({
      where: { address: { equals: displayAddress, mode: "insensitive" } },
    });
    if (existing) {
      await prisma.property.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.property.create({ data });
      created++;
    }
  }

  // SREO-only properties (in SREO but no Property Information rows).
  let sreoOnly = 0;
  for (const [key, s] of sreoByAddr) {
    if (grouped.has(key) || findGroupedLoose(grouped, key) || matchesCombined(grouped, key)) continue;
    const address = s["B"]!.trim();
    const existing = await prisma.property.findFirst({
      where: { address: { equals: address, mode: "insensitive" } },
    });
    const data = {
      address,
      llcOwner: s["C"] ?? null,
      refiTarget: s["F"] ?? null,
      status: s["G"] ?? null,
      strategy: s["H"] ?? null,
      purchaseDate: parseExcelDate(s["I"]),
      refinanceDate: parseExcelDate(s["J"]),
      purchasePrice: dec(parseFloatOrNull(s["M"])),
      currentLoan: dec(parseFloatOrNull(s["N"])),
      value: dec(parseFloatOrNull(s["P"])),
      replacementCost: dec(parseFloatOrNull(s["Q"])),
      rehabAmount: dec(parseFloatOrNull(s["K"])),
      rehabMonths: dec(parseFloatOrNull(s["L"])),
      sqft: parseIntOrNull(s["E"]),
      unitCount: parseIntOrNull(s["D"]),
      units: [] as unknown as object,
    };
    if (existing) await prisma.property.update({ where: { id: existing.id }, data });
    else {
      await prisma.property.create({ data });
      sreoOnly++;
    }
  }

  report.line(`Created ${created}, updated ${updated}, +${sreoOnly} from SREO with no unit rows.`);
  report.line(
    "Excluded from SREO (deferred 'money' scope): monthly rent/mortgage/taxes/insurance, % equity, HG equity, ppsf.",
  );
}

function dec(n: number | null): string | null {
  return n == null ? null : n.toFixed(2);
}

// Match a property key like "765 prospect ..." against an SREO key that may combine
// addresses ("765/767 prospect ...").
function numMatches(sreoNum: string, num: string) {
  return sreoNum === num || sreoNum.split("/").includes(num);
}

function findSreoLoose(map: Map<string, Record<string, string | null>>, key: string) {
  const [num, street] = key.split(" ");
  for (const [k, v] of map) {
    const [kn, ks] = k.split(" ");
    if (numMatches(kn, num) && ks === street) return v;
  }
  return undefined;
}
function findGroupedLoose(map: Map<string, unknown>, key: string) {
  const [num, street] = key.split(" ");
  for (const k of map.keys()) {
    const [kn, ks] = k.split(" ");
    if (numMatches(kn, num) && ks === street) return true;
  }
  return false;
}
// An SREO combined key ("765/767 prospect") matches if any grouped property covers one of its numbers.
function matchesCombined(map: Map<string, unknown>, sreoKey: string) {
  const [num, street] = sreoKey.split(" ");
  if (!num.includes("/")) return false;
  const parts = num.split("/");
  for (const k of map.keys()) {
    const [kn, ks] = k.split(" ");
    if (ks === street && parts.includes(kn)) return true;
  }
  return false;
}
