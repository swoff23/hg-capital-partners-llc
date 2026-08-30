/**
 * Shared helpers for the one-time migration of the HG Master Database + Asana export.
 * Source files live in ../_private (gitignored). Nothing here is used by the app runtime.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../..");
export const PRIVATE_DIR = path.join(REPO_ROOT, "_private");
export const XLSX_PATH = path.join(PRIVATE_DIR, "HG Master Database.xlsx");
export const ASANA_CSV_PATH = path.join(PRIVATE_DIR, "HG_Capital.csv");

/** Load a worksheet as an array of row objects keyed by column letter (A, B, C, ...). */
export async function readSheet(
  sheetName: string,
): Promise<Array<Record<string, string | null>>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  const rows: Array<Record<string, string | null>> = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const obj: Record<string, string | null> = {};
    row.eachCell({ includeEmpty: false }, (cell) => {
      const col = cell.address.replace(/\d+/g, "");
      obj[col] = cellText(cell.value);
    });
    rows.push(obj);
  });
  return rows;
}

/** Coerce any ExcelJS cell value to a trimmed string (or null). Handles nested rich text. */
export function cellText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText))
      return (
        (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("").trim() || null
      );
    if ("text" in v) return cellText(v.text);
    if ("result" in v) return cellText(v.result);
    if ("hyperlink" in v) return cellText(v.hyperlink);
    if ("formula" in v || "sharedFormula" in v) return null;
    if ("error" in v) return null;
  }
  return null;
}

/** Parse "$150k", "127,000", "1.5M", "300s" → number | null. Keeps only clean numeric intent. */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.toString().trim().toLowerCase();
  s = s.replace(/[$,\s]/g, "").replace(/usd/g, "");
  const mult = /k$/.test(s) ? 1_000 : /m$/.test(s) ? 1_000_000 : 1;
  s = s.replace(/[km]$/, "");
  // "300s" style approximations, ranges, notes → not a clean number
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s) * mult;
  return Number.isFinite(n) ? n : null;
}

export function parseIntOrNull(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.toString().replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function parseFloatOrNull(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.toString().replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Excel serial date (days since 1899-12-30) → Date | null. Also passes through ISO strings. */
export function parseExcelDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.toString().trim();
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    const ms = Math.round((asNum - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Phone → digits only, handling scientific-notation cells like "7.166980552E9". */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.toString().trim();
  if (/e\+?\d+/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.round(n));
  }
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function formatPhone(digits: string | null): string | null {
  if (!digits) return null;
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toString().trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null;
}

/** Normalize a street address for dedupe/matching (lowercase, expand nothing, strip punctuation). */
export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .replace(/\n/g, " ")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\broad\b/g, "rd")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Leading street token for fuzzy property<->section matching, e.g. "58 mariner". */
export function addressKey(raw: string | null | undefined): string {
  const n = normalizeAddress(raw);
  const m = n.match(/^(\d+[a-z]?(?:\/\d+)?)\s+([a-z]+)/);
  return m ? `${m[1].split("/")[0]} ${m[2]}` : n.split(" ").slice(0, 2).join(" ");
}

export function isUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//i.test(s.toString().trim());
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}
