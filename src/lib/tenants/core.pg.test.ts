import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { SUBSIDY_OVER_RENT } from "./fields";
import {
  ALREADY_ON_LEASE,
  LAST_TENANT,
  PICK_UNIT,
  TERMS_OVERLAP,
  addTenant,
  addTerm,
  createLease,
  deleteLease,
  deleteTerm,
  makePrimary,
  patchLease,
  patchTerm,
  removeTenant,
  restoreTerm,
  stayOverlapMessage,
  unitHasTenants,
} from "./core";

/**
 * The tenant and lease rules on a real Postgres (docs/specs/tenants.md
 * section 3), including the one-primary index the migration adds. Opt-in like
 * trade-links.pg.test.ts, by the same guard: `npm test` skips it unless
 * HG_SCRATCH_DATABASE_URL names a local scratch database (its name must contain
 * "scratch") with the migrations applied. It removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_tenants_scratch npx tsx --test src/lib/tenants/core.pg.test.ts
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

function isLocalScratch(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "postgresql:" &&
    url.username !== "" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.port === "" || url.port === "5432") &&
    /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}
const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";

let prisma: PrismaClient;
/** This file's turn on the scratch database, and what it makes there, deleted when it finishes (scratch-rows.ts). */
const made = scratchRows(() => prisma);
const run = randomUUID().slice(0, 8);
const propertyIds: string[] = [];
const tenantIds: string[] = [];

async function property(units: { id: string; label: string }[]): Promise<string> {
  const p = await prisma.property.create({ data: { address: `${run} ${propertyIds.length} Test St`, units } });
  propertyIds.push(p.id);
  return p.id;
}

async function refusal(p: Promise<unknown>): Promise<Record<string, string>> {
  try {
    await p;
  } catch (err) {
    if (err instanceof FieldError) return err.fieldErrors as Record<string, string>;
    throw err;
  }
  assert.fail("expected a refusal");
}

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
});

after(async () => {
  if (skip) return;
  await prisma.lease.deleteMany({ where: { propertyId: { in: propertyIds } } });
  const leftover = await prisma.tenant.findMany({ where: { fullName: { startsWith: run } }, select: { id: true } });
  await prisma.tenant.deleteMany({ where: { id: { in: [...tenantIds, ...leftover.map((t) => t.id)] } } });
  await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
  await made.remove();
  await prisma.$disconnect();
});

const name = (s: string) => `${run} ${s}`;

test("createLease: new tenants, the first primary, a term with its share", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }, { id: "hse", label: "HSE (house)" }]);
  const { id } = await createLease(
    prisma,
    {
      propertyId: pid,
      unitId: "front",
      tenants: [{ new: { fullName: name("Dana Lee"), phone: "716 555 1234" } }, { new: { fullName: name("Sam Lee") } }],
      movesIn: "2025-03-01",
      deposit: "1,900",
      term: { startsOn: "2026-03-01", endsOn: "2027-02-28", rent: "1900", subsidy: "1500", subsidyFrom: "BMHA" },
    },
    null,
  );
  const lease = await prisma.lease.findUniqueOrThrow({ where: { id }, include: { tenants: { include: { tenant: true }, orderBy: { position: "asc" } }, terms: true } });
  assert.equal(lease.unitLabel, "Front");
  assert.equal(lease.deposit?.toString(), "1900");
  assert.deepEqual(lease.tenants.map((t) => [t.tenant.fullName, t.primary, t.tenant.phoneE164]), [
    [name("Dana Lee"), true, "+17165551234"],
    [name("Sam Lee"), false, null],
  ]);
  assert.equal(lease.terms[0].subsidy?.toString(), "1500");
});

test("createLease: a unit is required where the property has units; none where it has only house meters", { skip }, async () => {
  const pid = await property([{ id: "front", label: "Front" }]);
  assert.deepEqual(await refusal(createLease(prisma, { propertyId: pid, unitId: null, tenants: [{ new: { fullName: name("A") } }] }, null)), { unitId: PICK_UNIT });
  const house = await property([{ id: "hse", label: "HSE (house)" }]);
  const { id } = await createLease(prisma, { propertyId: house, unitId: null, tenants: [{ new: { fullName: name("B") } }] }, null);
  assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id } })).unitId, null);
});

test("createLease: a unit with no id yet gets a lasting one, and the placeholder pick follows it", { skip }, async () => {
  const p = await prisma.property.create({ data: { address: `${run} old units St`, units: [{ label: "Lower" }, { label: "Upper", lockboxCode: "4521" }] } });
  propertyIds.push(p.id);
  const before = (await prisma.property.findUniqueOrThrow({ where: { id: p.id } })).updatedAt;
  const { id } = await createLease(prisma, { propertyId: p.id, unitId: "unit-at-1", tenants: [{ new: { fullName: name("Upstairs") } }] }, null);
  const after = await prisma.property.findUniqueOrThrow({ where: { id: p.id } });
  const units = after.units as { id?: string; label: string; lockboxCode?: string }[];
  assert.ok(units.every((u) => u.id && !u.id.startsWith("unit-at-")), "every unit has a lasting id");
  assert.equal(units[1].lockboxCode, "4521", "nothing else changes");
  assert.ok(after.updatedAt > before, "an editor holding placeholders is refused and reloads");
  const lease = await prisma.lease.findUniqueOrThrow({ where: { id } });
  assert.equal(lease.unitId, units[1].id);
  assert.equal(lease.unitLabel, "Upper");
});

test("createLease: refused when it overlaps; back to back is fine", { skip }, async () => {
  const pid = await property([{ id: "rear", label: "Rear" }]);
  await createLease(prisma, { propertyId: pid, unitId: "rear", tenants: [{ new: { fullName: name("Old") } }], movesIn: "2023-01-01", movesOut: "2025-02-01" }, null);
  await createLease(prisma, { propertyId: pid, unitId: "rear", tenants: [{ new: { fullName: name("New") } }], movesIn: "2025-02-01" }, null);
  assert.deepEqual(
    await refusal(createLease(prisma, { propertyId: pid, unitId: "rear", tenants: [{ new: { fullName: name("Squatter") } }], movesIn: "2026-01-01" }, null)),
    { movesIn: stayOverlapMessage("Rear") },
  );
  const tenantErrors = await refusal(createLease(prisma, { propertyId: pid, unitId: "rear", tenants: [{ new: { fullName: "" } }, { new: { fullName: name("Ok"), phone: "12" } }] }, null));
  assert.deepEqual(Object.keys(tenantErrors).sort(), ["tenants.0.fullName", "tenants.1.phone"]);
});

test("patchLease: a move-out date is checked against the next lease", { skip }, async () => {
  const pid = await property([{ id: "upper", label: "Upper" }]);
  const a = await createLease(prisma, { propertyId: pid, unitId: "upper", tenants: [{ new: { fullName: name("A") } }], movesIn: "2024-01-01", movesOut: "2026-01-01" }, null);
  await createLease(prisma, { propertyId: pid, unitId: "upper", tenants: [{ new: { fullName: name("B") } }], movesIn: "2026-01-01" }, null);
  assert.deepEqual(await refusal(patchLease(prisma, a.id, { movesOut: "2026-02-01" })), { movesOut: stayOverlapMessage("Upper") });
  await patchLease(prisma, a.id, { movesOut: "2025-12-15", deposit: "", notes: " One dog. " });
  const l = await prisma.lease.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(l.movesOut?.toISOString().slice(0, 10), "2025-12-15");
  assert.equal(l.notes, "One dog.");
});

test("addTenant, removeTenant, makePrimary: one primary always, the last can't go", { skip }, async () => {
  const pid = await property([{ id: "u1", label: "Unit 1" }]);
  const { id } = await createLease(prisma, { propertyId: pid, unitId: "u1", tenants: [{ new: { fullName: name("First") } }] }, null);
  const { tenantId: second } = await addTenant(prisma, id, { new: { fullName: name("Second") } });
  assert.deepEqual(await refusal(addTenant(prisma, id, { tenantId: second })), { tenants: ALREADY_ON_LEASE });
  await makePrimary(prisma, id, second);
  const primaries = await prisma.leaseTenant.findMany({ where: { leaseId: id, primary: true } });
  assert.deepEqual(primaries.map((p) => p.tenantId), [second]);
  await removeTenant(prisma, id, second);
  const left = await prisma.leaseTenant.findMany({ where: { leaseId: id } });
  assert.equal(left.length, 1);
  assert.equal(left[0].primary, true, "the next one becomes primary");
  assert.deepEqual(await refusal(removeTenant(prisma, id, left[0].tenantId)), { tenants: LAST_TENANT });
  // A second primary is stopped by the index too, not only the service.
  const third = await addTenant(prisma, id, { new: { fullName: name("Third") } });
  await assert.rejects(prisma.leaseTenant.update({ where: { leaseId_tenantId: { leaseId: id, tenantId: third.tenantId } }, data: { primary: true } }));
});

test("addTerm and patchTerm: no overlap, the share at most the rent", { skip }, async () => {
  const pid = await property([{ id: "u2", label: "Unit 2" }]);
  const { id } = await createLease(prisma, { propertyId: pid, unitId: "u2", tenants: [{ new: { fullName: name("T") } }], term: { startsOn: "2025-03-01", endsOn: "2026-02-28", rent: "1850" } }, null);
  const renewal = await addTerm(prisma, id, { startsOn: "2026-03-01", endsOn: "2027-02-28", rent: "1900" });
  assert.deepEqual(await refusal(addTerm(prisma, id, { startsOn: "2027-01-01", rent: "2000" })), { startsOn: TERMS_OVERLAP });
  assert.deepEqual(await refusal(patchTerm(prisma, renewal.id, { subsidy: "2500" })), { subsidy: SUBSIDY_OVER_RENT });
  await patchTerm(prisma, renewal.id, { subsidy: "1500", subsidyFrom: "BMHA" });
  // One fact at a time, as the rail saves: the contact keeps the share and who pays.
  await patchTerm(prisma, renewal.id, { subsidyContact: "Pat Case" });
  await patchTerm(prisma, renewal.id, { subsidyEmail: "Pat@BMHA.org" });
  const t = await prisma.leaseTerm.findUniqueOrThrow({ where: { id: renewal.id } });
  assert.deepEqual([t.subsidy?.toString(), t.subsidyFrom, t.subsidyContact, t.subsidyEmail], ["1500", "BMHA", "Pat Case", "pat@bmha.org"]);
  // Clearing the share clears who pays and the contact with it.
  await patchTerm(prisma, renewal.id, { subsidy: "" });
  const cleared = await prisma.leaseTerm.findUniqueOrThrow({ where: { id: renewal.id } });
  assert.deepEqual([cleared.subsidy, cleared.subsidyFrom, cleared.subsidyContact, cleared.subsidyEmail], [null, null, null, null]);
});

test("patchTerm moves an older term; deleteTerm keeps its file; restoreTerm brings both back", { skip }, async () => {
  const pid = await property([{ id: "u5", label: "Unit 5" }, { id: "u6", label: "Unit 6" }, { id: "u7", label: "Unit 7" }]);
  const { id } = await createLease(prisma, { propertyId: pid, unitId: "u5", tenants: [{ new: { fullName: name("Terms") } }], term: { startsOn: "2025-10-01", endsOn: "2025-12-10", rent: "1800" } }, null);
  const older = await prisma.leaseTerm.findFirstOrThrow({ where: { leaseId: id } });
  const current = await addTerm(prisma, id, { startsOn: "2025-12-11", endsOn: "2026-12-31", rent: "1530", subsidy: "1530", subsidyFrom: "RAC", subsidyContact: "Pat Case" });

  // An older term's start date moves; running into the next term is refused on the date.
  await patchTerm(prisma, older.id, { startsOn: "2025-09-15" });
  assert.equal((await prisma.leaseTerm.findUniqueOrThrow({ where: { id: older.id } })).startsOn.toISOString().slice(0, 10), "2025-09-15");
  assert.deepEqual(await refusal(patchTerm(prisma, older.id, { startsOn: "2025-09-15", endsOn: "2026-01-31" })), { startsOn: TERMS_OVERLAP });

  // A term with a signed lease: deleting it keeps the file on the lease, unlinked.
  const file = await prisma.leaseFile.create({ data: { leaseId: id, url: "https://example.test/l.pdf", pathname: `leases/${id}/l.pdf`, filename: "l.pdf", size: 1 } });
  await prisma.leaseTerm.update({ where: { id: current.id }, data: { fileId: file.id } });
  const snap = await deleteTerm(prisma, id, current.id);
  assert.equal(await prisma.leaseTerm.count({ where: { id: current.id } }), 0);
  assert.equal(await prisma.leaseFile.count({ where: { id: file.id } }), 1, "the file stays on the lease");
  assert.deepEqual(snap, {
    startsOn: "2025-12-11",
    endsOn: "2026-12-31",
    rent: "1530",
    subsidy: "1530",
    subsidyFrom: "RAC",
    subsidyContact: "Pat Case",
    subsidyEmail: "",
    fileId: file.id,
  });
  // Only from its own lease, and only once.
  const other = await createLease(prisma, { propertyId: pid, unitId: "u6", tenants: [{ new: { fullName: name("Other") } }], movesIn: "2030-01-01" }, null);
  await assert.rejects(deleteTerm(prisma, other.id, older.id), /already gone/);
  await assert.rejects(deleteTerm(prisma, id, current.id), /already gone/);

  // Undo: the same values and the file, linked again.
  const back = await restoreTerm(prisma, id, snap);
  const restored = await prisma.leaseTerm.findUniqueOrThrow({ where: { id: back.id } });
  assert.deepEqual(
    [restored.rent.toString(), restored.subsidy?.toString(), restored.subsidyFrom, restored.subsidyContact, restored.fileId],
    ["1530", "1530", "RAC", "Pat Case", file.id],
  );

  // A term added over the deleted one's dates refuses Undo.
  const again = await deleteTerm(prisma, id, back.id);
  const blocker = await addTerm(prisma, id, { startsOn: "2026-01-01", rent: "1600" });
  assert.deepEqual(await refusal(restoreTerm(prisma, id, again)), { startsOn: TERMS_OVERLAP });

  // A file another term now holds stays with that term; the restored one comes back without it.
  await prisma.leaseTerm.delete({ where: { id: blocker.id } });
  const holder = await addTerm(prisma, id, { startsOn: "2027-01-01", rent: "1700" });
  await prisma.leaseTerm.update({ where: { id: holder.id }, data: { fileId: file.id } });
  const without = await restoreTerm(prisma, id, again);
  assert.equal((await prisma.leaseTerm.findUniqueOrThrow({ where: { id: without.id } })).fileId, null);

  // A lease's only term can go.
  const solo = await createLease(prisma, { propertyId: pid, unitId: "u7", tenants: [{ new: { fullName: name("Solo") } }], movesIn: "2031-01-01", term: { startsOn: "2031-01-01", rent: "1000" } }, null);
  const only = await prisma.leaseTerm.findFirstOrThrow({ where: { leaseId: solo.id } });
  await deleteTerm(prisma, solo.id, only.id);
  assert.equal(await prisma.leaseTerm.count({ where: { leaseId: solo.id } }), 0);
});

test("deleteLease keeps its tenants; unitHasTenants sees current and upcoming, not past", { skip }, async () => {
  const pid = await property([{ id: "u3", label: "Unit 3" }]);
  const past = await createLease(prisma, { propertyId: pid, unitId: "u3", tenants: [{ new: { fullName: name("Gone") } }], movesIn: "2020-01-01", movesOut: "2021-01-01" }, null);
  assert.equal(await prisma.$transaction((tx) => unitHasTenants(tx, pid, "u3", "2026-11-14")), false);
  const next = await createLease(prisma, { propertyId: pid, unitId: "u3", tenants: [{ new: { fullName: name("Coming") } }], movesIn: "2027-01-01" }, null);
  assert.equal(await prisma.$transaction((tx) => unitHasTenants(tx, pid, "u3", "2026-11-14")), true);
  const kept = await prisma.leaseTenant.findFirstOrThrow({ where: { leaseId: next.id } });
  await deleteLease(prisma, next.id);
  assert.ok(await prisma.tenant.findUnique({ where: { id: kept.tenantId } }), "the tenant stays in the app");
  assert.equal(await prisma.lease.count({ where: { id: next.id } }), 0);
  assert.equal(await prisma.lease.count({ where: { id: past.id } }), 1);
});
