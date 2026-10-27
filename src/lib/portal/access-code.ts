import type { PrismaClient } from "@prisma/client";

/**
 * The lockbox code a contractor sees on their job (docs/asana-migration-plan.md
 * D21). Codes live in Property.units, beside utility accounts and equipment,
 * so this is the one portal file that reads that column
 * (src/lib/auth-guard.test.ts), and it hands back one string, never the list.
 *
 * Which code:
 *  - the job names a unit: that unit's code, or none when the unit has none;
 *  - no unit: the property's code when it has exactly one distinct code
 *    across its units, otherwise none (staff are asked to pick a unit).
 *
 * Whether to show it at all (assigned contractor, active job) is the caller's
 * call. Pure apart from readLockboxCode and lockboxMasker; see
 * access-code.test.ts.
 *
 * The same property's codes can also turn up in the text of an imported
 * comment ("gate code 2925"). `lockboxMasker` hides them there, on the
 * server: the browser gets segments with the code already replaced, never the
 * code or the list of codes. (Code's own `mask` keeps the last four
 * characters and ships the whole value, which would show a four-digit code in
 * full.) The assigned contractor reads the real one in the job's Lockbox
 * section.
 */

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The code for this job from the property's units JSON, or null. */
export function pickLockboxCode(units: unknown, unitLabel: string | null | undefined): string | null {
  const list = Array.isArray(units) ? units.filter((u): u is Record<string, unknown> => !!u && typeof u === "object") : [];
  const wanted = clean(unitLabel).toLowerCase();
  if (wanted) {
    const unit = list.find((u) => clean(u.label).toLowerCase() === wanted);
    return clean(unit?.lockboxCode) || null;
  }
  const codes = new Set(list.map((u) => clean(u.lockboxCode)).filter(Boolean));
  return codes.size === 1 ? [...codes][0] : null;
}

type PropertyReader = Pick<PrismaClient, "property">;

/** Reads the property's units and returns the one code for this job, or null. */
export async function readLockboxCode(db: PropertyReader, propertyId: string | null, unitLabel: string | null): Promise<string | null> {
  if (!propertyId) return null;
  const row = await db.property.findUnique({ where: { id: propertyId }, select: { units: true } });
  return row ? pickLockboxCode(row.units, unitLabel) : null;
}

// ---------------------------------------------------------------------------
// Codes inside comment text
// ---------------------------------------------------------------------------

/** What a hidden code reads as. A fixed length, so it doesn't give the code's away. */
export const CODE_MASK = "••••";

/** A piece of a comment: its words, or a code that was hidden. */
export type BodyPart = { text: string } | { masked: string };

/** Shortest thing worth hiding: shorter would take "2 PM" and "a 3" with it. */
const MIN_CODE = 3;

/**
 * What to look for in a comment for each stored code: the value as saved, and
 * its first word when that holds a digit ("4857 (back door)" is typed as
 * "4857"). Longest first, so the whole value wins over its start.
 */
function searchTerms(units: unknown): string[] {
  const list = Array.isArray(units) ? units.filter((u): u is Record<string, unknown> => !!u && typeof u === "object") : [];
  const terms = new Set<string>();
  for (const u of list) {
    const value = clean(u.lockboxCode);
    if (!value) continue;
    if (value.length >= MIN_CODE) terms.add(value);
    const lead = value.split(/[\s(]/)[0];
    if (lead.length >= MIN_CODE && /\d/.test(lead)) terms.add(lead);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The comment cut into text and hidden codes: every place `terms` appear as
 * a whole word (not inside a longer run of letters or digits), in any case.
 * With nothing to hide it is the one text segment.
 */
export function maskCodes(body: string, terms: readonly string[]): BodyPart[] {
  if (!body) return [];
  if (terms.length === 0) return [{ text: body }];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const parts: BodyPart[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index > last) parts.push({ text: body.slice(last, m.index) });
    parts.push({ masked: CODE_MASK });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts.length > 0 ? parts : [{ text: body }];
}

/**
 * A function that hides this job's property's lockbox codes in a comment, for
 * a page that shows many. It reads the property once and keeps the codes
 * inside the closure; what it hands back is segments only. A job with no
 * property, or a property with no codes, gets one that returns the text as is.
 */
export async function lockboxMasker(db: PropertyReader, propertyId: string | null): Promise<(body: string) => BodyPart[]> {
  if (!propertyId) return (body) => maskCodes(body, []);
  const row = await db.property.findUnique({ where: { id: propertyId }, select: { units: true } });
  const terms = row ? searchTerms(row.units) : [];
  return (body) => maskCodes(body, terms);
}
