import { randomUUID } from "node:crypto";
import type { LeaseSource, Prisma, PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { toYmd, ymdToDate, type Ymd } from "@/lib/dates";
import { isHouseMeterRow, isPlaceholderUnitId, parseUnits, type PropertyUnit } from "@/lib/property-types";
import { MAX_TENANTS, readDeposit, readStay, readTenant, readTerm, type TenantData } from "./fields";
import { leaseStatus, overlappingTerms, staysOverlap } from "./status";

/**
 * The rules every tenant and lease write keeps (docs/specs/tenants.md section
 * 3), on whatever client the caller hands in: the app's (through service.ts),
 * the import's, or a test's. Each write is one transaction, and a refusal is a
 * FieldError keyed by the form field it's about, so a sheet marks that field.
 */

type Tx = Prisma.TransactionClient;
type Db = PrismaClient;
export type By = { id: string } | null;

export const PICK_UNIT = "Pick a unit.";
export const UNIT_GONE = "That unit isn't on this property anymore. Pick another.";
export const LAST_TENANT = "A lease needs at least one tenant. Delete the lease instead.";
export const TOO_MANY = `A lease holds up to ${MAX_TENANTS} tenants.`;
export const ALREADY_ON_LEASE = "They're already on this lease.";
export const TERMS_OVERLAP = "This term overlaps another one. Check its dates.";

/** "Another lease at Front overlaps these dates." The unit's label, or the property for a whole house. */
export function stayOverlapMessage(unitLabel: string | null): string {
  return `Another lease at ${unitLabel?.trim() || "this property"} overlaps these dates.`;
}

/** The units a lease can be in: the property's units less its house-meter rows. */
export function rentableUnits(units: readonly PropertyUnit[]): PropertyUnit[] {
  return units.filter((u) => !isHouseMeterRow(u));
}

/**
 * Gives every unit on a property a lasting id, for a lease to point at. Units
 * saved before ids existed have none until their property's next units save
 * (property-types.ts), and the pickers name them by a placeholder,
 * "unit-at-<index>". This is that save's id step alone: nothing else in the
 * list changes. It bumps the property's updatedAt on purpose, so an editor
 * still holding placeholders is refused and reloads rather than giving the
 * units new ids under a lease. Returns the units, and the picked id with a
 * placeholder turned into the unit's new id.
 */
export async function ensureUnitIds(tx: Tx, propertyId: string, picked: string | null = null): Promise<{ units: PropertyUnit[]; picked: string | null } | null> {
  const property = await tx.property.findUnique({ where: { id: propertyId }, select: { units: true } });
  if (!property) return null;
  const raw = Array.isArray(property.units) ? (property.units as PropertyUnit[]) : [];
  if (raw.every((u) => u.id)) return { units: parseUnits(raw), picked };
  const fixed = raw.map((u) => (u.id ? u : { ...u, id: randomUUID() }));
  await tx.property.update({ where: { id: propertyId }, data: { units: fixed as Prisma.InputJsonValue } });
  const at = picked && isPlaceholderUnitId(picked) ? Number(picked.slice("unit-at-".length)) : NaN;
  return { units: parseUnits(fixed), picked: Number.isInteger(at) ? (fixed[at]?.id ?? null) : picked };
}

/**
 * Which unit a lease is in, checked against the property's units today. A
 * property with rentable units needs one picked, by its stable id; a
 * property with none takes the lease as a whole house (null).
 */
async function resolveUnit(tx: Tx, propertyId: string, pickedId: string | null): Promise<{ unitId: string | null; unitLabel: string | null }> {
  const ensured = await ensureUnitIds(tx, propertyId, pickedId);
  if (!ensured) throw new FieldError({ propertyId: "That property is gone. Pick another." });
  const unitId = ensured.picked;
  const units = rentableUnits(ensured.units);
  if (units.length === 0) return { unitId: null, unitLabel: null };
  if (!unitId) throw new FieldError({ unitId: PICK_UNIT });
  const unit = units.find((u) => u.id === unitId);
  if (!unit) throw new FieldError({ unitId: UNIT_GONE });
  return { unitId, unitLabel: unit.label?.trim() || null };
}

/** Refuses a stay that shares a night with another lease in the same unit. */
async function assertNoOverlap(
  tx: Tx,
  where: { propertyId: string; unitId: string | null; excludeId?: string },
  stay: { movesIn: Ymd | null; movesOut: Ymd | null },
  unitLabel: string | null,
  field: "movesIn" | "movesOut",
): Promise<void> {
  const others = await tx.lease.findMany({
    where: { propertyId: where.propertyId, unitId: where.unitId, ...(where.excludeId ? { id: { not: where.excludeId } } : {}) },
    select: { movesIn: true, movesOut: true },
  });
  if (others.some((o) => staysOverlap(o, stay))) throw new FieldError({ [field]: stayOverlapMessage(unitLabel) });
}

function fail(problems: Record<string, string>): never {
  throw new FieldError(problems);
}

/** A person on a new lease: someone already in the app, or a new tenant from the form. */
export type TenantPick = { tenantId: string } | { new: Partial<Record<string, string | null>> };

export type NewLease = {
  propertyId: string;
  unitId: string | null;
  /** In the order they're entered; the first is primary unless `primary` says otherwise. */
  tenants: TenantPick[];
  primary?: number;
  movesIn?: string | null;
  movesOut?: string | null;
  deposit?: string | null;
  notes?: string | null;
  /** The first signed term, when known; a playbook's upcoming lease has none yet. */
  term?: Partial<Record<string, string | null>> | null;
  source?: LeaseSource;
};

/** Reads every new tenant first, so the form gets all its problems at once, keyed `tenants.0.fullName`. */
function readNewTenants(picks: readonly TenantPick[]): (TenantData | string)[] {
  const problems: Record<string, string> = {};
  const out = picks.map((p, i) => {
    if ("tenantId" in p) return p.tenantId;
    const r = readTenant(p.new, "new");
    if (!r.ok) for (const [k, v] of Object.entries(r.problems)) problems[`tenants.${i}.${k}`] = v;
    return r.ok ? r.data : ({} as TenantData);
  });
  if (Object.keys(problems).length) fail(problems);
  return out;
}

export async function createLease(db: Db, input: NewLease, by: By): Promise<{ id: string }> {
  if (input.tenants.length === 0) fail({ tenants: "Add at least one tenant." });
  if (input.tenants.length > MAX_TENANTS) fail({ tenants: TOO_MANY });
  const ids = input.tenants.flatMap((t) => ("tenantId" in t ? [t.tenantId] : []));
  if (new Set(ids).size !== ids.length) fail({ tenants: "Each person goes on the lease once." });
  const people = readNewTenants(input.tenants);
  const stay = readStay({ movesIn: input.movesIn ?? "", movesOut: input.movesOut ?? "" });
  if (!stay.ok) fail(stay.problems);
  const deposit = readDeposit(input.deposit);
  if (!deposit.ok) fail(deposit.problems);
  const term = input.term ? readTerm(input.term) : null;
  if (term && !term.ok) fail(term.problems);
  const primary = Math.min(Math.max(input.primary ?? 0, 0), people.length - 1);

  return db.$transaction(async (tx) => {
    const unit = await resolveUnit(tx, input.propertyId, input.unitId);
    const dates = { movesIn: stay.data.movesIn ?? null, movesOut: stay.data.movesOut ?? null };
    await assertNoOverlap(tx, { propertyId: input.propertyId, unitId: unit.unitId }, dates, unit.unitLabel, "movesIn");
    if (ids.length) {
      const found = await tx.tenant.count({ where: { id: { in: ids } } });
      if (found !== ids.length) fail({ tenants: "Someone on this lease is no longer in the app. Add them again." });
    }
    const lease = await tx.lease.create({
      data: {
        propertyId: input.propertyId,
        ...unit,
        movesIn: ymdToDate(dates.movesIn),
        movesOut: ymdToDate(dates.movesOut),
        deposit: deposit.data.deposit,
        notes: input.notes?.trim() || null,
        source: input.source ?? "APP",
        createdByUserId: by?.id ?? null,
      },
      select: { id: true },
    });
    for (const [i, p] of people.entries()) {
      const tenantId = typeof p === "string" ? p : (await tx.tenant.create({ data: { ...p, fullName: p.fullName! }, select: { id: true } })).id;
      await tx.leaseTenant.create({ data: { leaseId: lease.id, tenantId, position: i, primary: i === primary } });
    }
    if (term?.ok) {
      await tx.leaseTerm.create({ data: { leaseId: lease.id, ...termColumns(term.data) } });
    }
    return lease;
  });
}

function termColumns(t: { startsOn: Ymd; endsOn: Ymd | null; rent: string; subsidy: string | null; subsidyFrom: string | null }) {
  return { startsOn: ymdToDate(t.startsOn)!, endsOn: ymdToDate(t.endsOn), rent: t.rent, subsidy: t.subsidy, subsidyFrom: t.subsidyFrom };
}

export type LeasePatch = Partial<Record<"movesIn" | "movesOut" | "deposit" | "notes", string | null>>;

/** One or more of the lease's own facts. A date change is checked against the other leases in the unit. */
export async function patchLease(db: Db, id: string, patch: LeasePatch): Promise<void> {
  await db.$transaction(async (tx) => {
    const lease = await tx.lease.findUnique({ where: { id }, select: { propertyId: true, unitId: true, unitLabel: true, movesIn: true, movesOut: true } });
    if (!lease) throw new Error("This lease is gone.");
    const data: Prisma.LeaseUpdateInput = {};
    if ("movesIn" in patch || "movesOut" in patch) {
      const current = { movesIn: toYmd(lease.movesIn), movesOut: toYmd(lease.movesOut) };
      const dates: Record<string, string | null | undefined> = {};
      if ("movesIn" in patch) dates.movesIn = patch.movesIn ?? "";
      if ("movesOut" in patch) dates.movesOut = patch.movesOut ?? "";
      const stay = readStay(dates, current);
      if (!stay.ok) fail(stay.problems);
      const next = { movesIn: "movesIn" in stay.data ? stay.data.movesIn! : current.movesIn, movesOut: "movesOut" in stay.data ? stay.data.movesOut! : current.movesOut };
      await assertNoOverlap(tx, { propertyId: lease.propertyId, unitId: lease.unitId, excludeId: id }, next, lease.unitLabel, "movesIn" in patch ? "movesIn" : "movesOut");
      data.movesIn = ymdToDate(next.movesIn);
      data.movesOut = ymdToDate(next.movesOut);
    }
    if ("deposit" in patch) {
      const d = readDeposit(patch.deposit);
      if (!d.ok) fail(d.problems);
      data.deposit = d.data.deposit;
    }
    if ("notes" in patch) data.notes = patch.notes?.replace(/\r\n?/g, "\n").trim() || null;
    await tx.lease.update({ where: { id }, data });
  });
}

/** A person's own details, the same on every lease they're on. */
export async function patchTenant(db: Db, tenantId: string, patch: Partial<Record<string, string | null>>): Promise<void> {
  const r = readTenant(patch, "patch");
  if (!r.ok) fail(r.problems);
  if (Object.keys(r.data).length === 0) return;
  await db.tenant.update({ where: { id: tenantId }, data: r.data });
}

/** Adds a person to a lease, last in the order: someone already in the app, or a new tenant. */
export async function addTenant(db: Db, leaseId: string, pick: TenantPick): Promise<{ tenantId: string }> {
  const [person] = readNewTenants([pick]);
  return db.$transaction(async (tx) => {
    const on = await tx.leaseTenant.findMany({ where: { leaseId }, select: { tenantId: true, position: true } });
    if (on.length >= MAX_TENANTS) fail({ tenants: TOO_MANY });
    if (typeof person === "string" && on.some((t) => t.tenantId === person)) fail({ tenants: ALREADY_ON_LEASE });
    const tenantId = typeof person === "string" ? person : (await tx.tenant.create({ data: { ...person, fullName: person.fullName! }, select: { id: true } })).id;
    const position = on.reduce((m, t) => Math.max(m, t.position), -1) + 1;
    await tx.leaseTenant.create({ data: { leaseId, tenantId, position, primary: on.length === 0 } });
    return { tenantId };
  });
}

/** Takes a person off a lease. The last one can't go; when the primary goes, the next in order becomes primary. */
export async function removeTenant(db: Db, leaseId: string, tenantId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const on = await tx.leaseTenant.findMany({ where: { leaseId }, orderBy: { position: "asc" } });
    const row = on.find((t) => t.tenantId === tenantId);
    if (!row) return;
    if (on.length === 1) fail({ tenants: LAST_TENANT });
    await tx.leaseTenant.delete({ where: { leaseId_tenantId: { leaseId, tenantId } } });
    if (row.primary) {
      const next = on.find((t) => t.tenantId !== tenantId)!;
      await tx.leaseTenant.update({ where: { leaseId_tenantId: { leaseId, tenantId: next.tenantId } }, data: { primary: true } });
    }
  });
}

/** Makes one person the primary: the old one is cleared first, so the one-primary index never sees two. */
export async function makePrimary(db: Db, leaseId: string, tenantId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await tx.leaseTenant.findUnique({ where: { leaseId_tenantId: { leaseId, tenantId } } });
    if (!row) fail({ tenants: "They aren't on this lease anymore." });
    if (row.primary) return;
    await tx.leaseTenant.updateMany({ where: { leaseId, primary: true }, data: { primary: false } });
    await tx.leaseTenant.update({ where: { leaseId_tenantId: { leaseId, tenantId } }, data: { primary: true } });
  });
}

/** A new signed term (a renewal), refused when it overlaps another. */
export async function addTerm(db: Db, leaseId: string, input: Partial<Record<string, string | null>>): Promise<{ id: string }> {
  const r = readTerm(input);
  if (!r.ok) fail(r.problems);
  return db.$transaction(async (tx) => {
    const terms = await tx.leaseTerm.findMany({ where: { leaseId }, select: { startsOn: true, endsOn: true } });
    if (overlappingTerms([...terms, { startsOn: r.data.startsOn, endsOn: r.data.endsOn }])) fail({ startsOn: TERMS_OVERLAP });
    return tx.leaseTerm.create({ data: { leaseId, ...termColumns(r.data) }, select: { id: true } });
  });
}

/** One term's dates or money. The whole term is re-read, so a rent change is checked against its share. */
export async function patchTerm(db: Db, termId: string, patch: Partial<Record<string, string | null>>): Promise<void> {
  await db.$transaction(async (tx) => {
    const term = await tx.leaseTerm.findUnique({ where: { id: termId } });
    if (!term) throw new Error("This term is gone.");
    const merged = {
      startsOn: toYmd(term.startsOn),
      endsOn: toYmd(term.endsOn) ?? "",
      rent: term.rent.toString(),
      subsidy: term.subsidy?.toString() ?? "",
      subsidyFrom: term.subsidyFrom ?? "",
      ...patch,
    };
    const r = readTerm(merged);
    if (!r.ok) fail(r.problems);
    const others = await tx.leaseTerm.findMany({ where: { leaseId: term.leaseId, id: { not: termId } }, select: { startsOn: true, endsOn: true } });
    if (overlappingTerms([...others, { startsOn: r.data.startsOn, endsOn: r.data.endsOn }])) fail({ [("startsOn" in patch ? "startsOn" : "endsOn")]: TERMS_OVERLAP });
    await tx.leaseTerm.update({ where: { id: termId }, data: termColumns(r.data) });
  });
}

/** Deletes the stay, its terms and its files. Its tenants stay in the app. Returns the Blob paths to remove. */
export async function deleteLease(db: Db, id: string): Promise<{ propertyId: string; pathnames: string[] } | null> {
  return db.$transaction(async (tx) => {
    const lease = await tx.lease.findUnique({ where: { id }, select: { propertyId: true, files: { select: { pathname: true } } } });
    if (!lease) return null;
    await tx.lease.delete({ where: { id } });
    return { propertyId: lease.propertyId, pathnames: lease.files.map((f) => f.pathname) };
  });
}

/**
 * Whether a unit can be deleted from its property: not while it has current
 * or upcoming tenants (call 6). writeUnits asks before it removes a unit.
 */
export async function unitHasTenants(tx: Tx, propertyId: string, unitId: string, today: Ymd): Promise<boolean> {
  const leases = await tx.lease.findMany({ where: { propertyId, unitId }, select: { movesIn: true, movesOut: true } });
  return leases.some((l) => leaseStatus(l, today) !== "past");
}
