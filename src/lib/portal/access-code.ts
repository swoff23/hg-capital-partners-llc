import type { PrismaClient } from "@prisma/client";
import { todayYmdEastern } from "@/lib/dates";
import { accessState, tenantUnit } from "@/lib/tasks/lockbox";
import { livingLease } from "@/lib/tenants/status";

/**
 * The lockbox code a contractor sees on their job (docs/asana-migration-plan.md
 * D21). Codes live in Property.units, beside utility accounts and equipment,
 * so this is the one portal file that reads that column
 * (src/lib/auth-guard.test.ts), and it hands back one unit's lockbox (its
 * code, location and photo, docs/specs/lockbox-location.md), never the list.
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
 * code or the list of codes. (A browser-side mask that keeps the last four
 * characters would ship the whole value and show a four-digit code in full.)
 * The assigned contractor reads the real one in the job's Lockbox
 * section.
 */

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A lockbox photo's two files, as the files route serves them; never handed to the browser. */
export type LockboxPhotoFiles = { pathname: string; thumbPathname: string | null };

/**
 * Everything the job's Lockbox section shows (docs/specs/lockbox-location.md):
 * the code, where the box is, and its photo. The location and photo ride with
 * the code: with no code there is nothing, whatever else is on file.
 */
export type LockboxAccess = { code: string; location: string | null; photo: LockboxPhotoFiles | null };

const unitList = (units: unknown) =>
  Array.isArray(units) ? units.filter((u): u is Record<string, unknown> => !!u && typeof u === "object") : [];

function photoOf(u: Record<string, unknown> | undefined): LockboxPhotoFiles | null {
  const p = u?.lockboxPhoto;
  if (!p || typeof p !== "object") return null;
  const { pathname, thumbPathname } = p as Record<string, unknown>;
  return typeof pathname === "string" && pathname ? { pathname, thumbPathname: typeof thumbPathname === "string" && thumbPathname ? thumbPathname : null } : null;
}

/**
 * The lockbox for this job from the property's units JSON, or null. One
 * unit's, never the list. With no unit and one code across the property, the
 * location and photo come from the units carrying it ("Same lockbox for all
 * units" keeps them in agreement); otherwise the first unit, in list order,
 * that has one.
 */
export function pickLockboxAccess(units: unknown, unitLabel: string | null | undefined): LockboxAccess | null {
  const list = unitList(units);
  const wanted = clean(unitLabel).toLowerCase();
  if (wanted) {
    const unit = list.find((u) => clean(u.label).toLowerCase() === wanted);
    const code = clean(unit?.lockboxCode);
    return code ? { code, location: clean(unit?.lockboxLocation) || null, photo: photoOf(unit) } : null;
  }
  const codes = new Set(list.map((u) => clean(u.lockboxCode)).filter(Boolean));
  if (codes.size !== 1) return null;
  const [code] = [...codes];
  const carrying = list.filter((u) => clean(u.lockboxCode) === code);
  const location = carrying.map((u) => clean(u.lockboxLocation)).find(Boolean) || null;
  const photo = carrying.map(photoOf).find((p) => p !== null) ?? null;
  return { code, location, photo };
}

/** The code for this job from the property's units JSON, or null. */
export function pickLockboxCode(units: unknown, unitLabel: string | null | undefined): string | null {
  return pickLockboxAccess(units, unitLabel)?.code ?? null;
}

type PropertyReader = Pick<PrismaClient, "property">;

/** Reads the property's units and returns this job's lockbox, or null. */
export async function readLockboxAccess(db: PropertyReader, propertyId: string | null, unitLabel: string | null): Promise<LockboxAccess | null> {
  if (!propertyId) return null;
  const row = await db.property.findUnique({ where: { id: propertyId }, select: { units: true } });
  return row ? pickLockboxAccess(row.units, unitLabel) : null;
}

/** Reads the property's units and returns the one code for this job, or null. */
export async function readLockboxCode(db: PropertyReader, propertyId: string | null, unitLabel: string | null): Promise<string | null> {
  return (await readLockboxAccess(db, propertyId, unitLabel))?.code ?? null;
}

// ---------------------------------------------------------------------------
// Who lives there, and whether the lockbox shows
// ---------------------------------------------------------------------------

/** One tenant as a contractor sees them: the name, the number as typed, and the clean one Call and Text dial. */
export type JobTenant = { name: string; phone: string | null; dial: string | null };

/**
 * A job's Tenants and Lockbox sections (docs/specs/tenant-contact.md sections
 * 3 and 7, tenants.md section 8): the household living in its unit today,
 * whether they gave Permission to enter, and the lockbox when it shows (a
 * vacant home, or permission). Names and numbers only: never rent, emails,
 * notes, another household or the units list.
 */
/**
 * `needsNotice`: someone lives there and Permission to enter is off, so the contractor gives the tenant 24 hours'
 * notice before going (docs/specs/contractor-scheduled-date.md, Q6 and Q7).
 */
export type JobAccess = { tenants: JobTenant[]; permitted: boolean; needsNotice: boolean; lockbox: LockboxAccess | null };

export const NO_ACCESS: JobAccess = { tenants: [], permitted: false, needsNotice: false, lockbox: null };

type JobAccessReader = Pick<PrismaClient, "property" | "lease">;

/** The job's access as lockbox.ts accessState decides it. Whether to show any of it (assigned contractor, open job) is the caller's call. */
export async function readJobAccess(
  db: JobAccessReader,
  job: { propertyId: string | null; unitLabel: string | null; entryPermittedAt: Date | null },
  now: Date = new Date(),
): Promise<JobAccess> {
  if (!job.propertyId) return NO_ACCESS;
  const row = await db.property.findUnique({ where: { id: job.propertyId }, select: { units: true } });
  if (!row) return NO_ACCESS;
  const list = unitList(row.units).map((u) => ({ id: str(u.id), label: str(u.label), lockboxCode: str(u.lockboxCode) }));
  const home = tenantUnit(list, job.unitLabel);
  const leases = home
    ? await db.lease.findMany({
        where: { propertyId: job.propertyId, unitId: home.unitId },
        select: {
          unitId: true,
          movesIn: true,
          movesOut: true,
          tenants: { select: { tenant: { select: { fullName: true, phone: true, phoneE164: true } } }, orderBy: [{ primary: "desc" }, { position: "asc" }] },
        },
      })
    : [];
  const living = home ? livingLease(leases, home.unitId, todayYmdEastern(now)) : null;
  const state = accessState(list, job.unitLabel, living, job.entryPermittedAt);
  return {
    tenants: (living?.tenants ?? []).map(({ tenant: t }) => ({ name: t.fullName, phone: t.phone, dial: t.phoneE164 ?? t.phone })),
    permitted: state.permitted,
    needsNotice: state.occupied && !state.permitted,
    lockbox: state.showsLockbox ? pickLockboxAccess(row.units, job.unitLabel) : null,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

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
