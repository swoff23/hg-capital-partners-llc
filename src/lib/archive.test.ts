import test from "node:test";
import assert from "node:assert/strict";
import {
  ArchiveRefusedError,
  archiveLogText,
  archiveToast,
  archivedLine,
  contractorArchiveBlockers,
  contractorArchiveRefusal,
  contractorJobsWhere,
  contractorOpenJobs,
  readArchiveEvent,
  setContactArchived,
  setDealArchived,
  setPropertyArchived,
  type ArchiveTx,
} from "./archive";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";

const CONNOR = { name: "Connor Swofford", email: "connor@hg.example" };
const at = (iso: string) => new Date(iso);

test("the record's line names who archived it and when, by Buffalo's calendar", () => {
  // 10am Eastern on Oct 27.
  assert.equal(archivedLine(CONNOR, at("2026-10-27T14:00:00Z"), "2026-10-27"), "Connor archived this today.");
  assert.equal(archivedLine(CONNOR, at("2026-10-26T14:00:00Z"), "2026-10-27"), "Connor archived this yesterday.");
  assert.equal(archivedLine(CONNOR, at("2026-10-20T14:00:00Z"), "2026-10-27"), "Connor archived this on Oct 20.");
  assert.equal(archivedLine(CONNOR, at("2025-12-01T15:00:00Z"), "2026-10-27"), "Connor archived this on Dec 1, 2025.");
  // 11pm Eastern on Oct 26 is Oct 27 in UTC: Buffalo's day is the one it says.
  assert.equal(archivedLine(CONNOR, at("2026-10-27T03:00:00Z"), "2026-10-27"), "Connor archived this yesterday.");
});

test("the record's line: an email's name when there's no name, and nobody once the user is gone", () => {
  assert.equal(archivedLine({ name: null, email: "pieter@hg.example" }, at("2026-10-27T14:00:00Z"), "2026-10-27"), "pieter archived this today.");
  assert.equal(archivedLine(null, at("2026-10-20T14:00:00Z"), "2026-10-27"), "Archived on Oct 20.");
});

test("a contractor's refusal names the next step, in one line", () => {
  assert.equal(contractorArchiveRefusal({ openJobs: 0, hasLogin: false }), null);
  assert.equal(contractorArchiveRefusal({ openJobs: 3, hasLogin: false }), "Reassign their 3 jobs first.");
  assert.equal(contractorArchiveRefusal({ openJobs: 1, hasLogin: false }), "Reassign their open job first.");
  assert.equal(contractorArchiveRefusal({ openJobs: 0, hasLogin: true }), "Remove portal access first.");
  // Both: the step that comes first. The line under Archive changes to the other once it's done.
  assert.equal(contractorArchiveRefusal({ openJobs: 2, hasLogin: true }), "Reassign their 2 jobs first.");
  assert.equal(contractorArchiveRefusal({ openJobs: 1, hasLogin: true }), "Reassign their open job first.");
});

test("a contractor's refusal is also the toast, so every line shows whole on a phone", () => {
  // 'Reassign their open job and remove access first.' lost its ending at 375: 'Reassign their open job and remove…'.
  const lines = new Set<string>();
  for (const openJobs of [0, 1, 2, 9, 12, 99, 100]) {
    for (const hasLogin of [false, true]) {
      const line = contractorArchiveRefusal({ openJobs, hasLogin });
      if (line) lines.add(line);
    }
  }
  assert.ok(lines.size >= 6);
  for (const line of lines) {
    assert.ok(line.length <= TOAST_PHONE_CHARS && !line.includes("—") && /first\.$/.test(line), `"${line}" is one short line that ends on the step`);
  }
});

test("the toast and the deal log's words", () => {
  assert.equal(archiveToast("deal", true), "Deal archived");
  assert.equal(archiveToast("property", false), "Property restored");
  assert.equal(archiveToast("contractor", true), "Contractor archived");
  assert.equal(archiveLogText("Connor", "archived"), "Connor archived this deal");
  assert.equal(archiveLogText(null, "restored"), "Someone restored this deal");
  assert.equal(readArchiveEvent({ event: "archived" }), "archived");
  assert.equal(readArchiveEvent({ event: "restored" }), "restored");
  assert.equal(readArchiveEvent({ field: "status", from: "Pass", to: "1 - High" }), null);
  assert.equal(readArchiveEvent(null), null);
  assert.equal(readArchiveEvent([]), null);
});

/* ---------------- The writes, on a fake transaction ---------------- */

type Call = [model: string, op: string, args: unknown];
type Row = Record<string, unknown>;

/**
 * A transaction over a few rows per model that keeps every call. updateMany
 * reads the `archivedAt` state in its where (null, or { not: null }), as
 * Postgres would, so a repeat changes nothing.
 */
function fakeTx(rows: { deal?: Row[]; property?: Row[]; contact?: Row[]; user?: Row[]; openJobs?: number; named?: { assigneeName: string; count: number }[] }) {
  const calls: Call[] = [];
  const tables: Record<string, Row[]> = { deal: rows.deal ?? [], property: rows.property ?? [], contact: rows.contact ?? [], user: rows.user ?? [] };
  const inState = (row: Row, where: Row) => {
    if (row.id !== where.id) return false;
    if (!("archivedAt" in where)) return true;
    return where.archivedAt === null ? row.archivedAt == null : row.archivedAt != null;
  };
  const model = (name: string) => ({
    async updateMany(args: { where: Row; data: Row }) {
      calls.push([name, "updateMany", args]);
      const hit = tables[name].filter((r) => inState(r, args.where));
      for (const r of hit) Object.assign(r, args.data);
      return { count: hit.length };
    },
    async findUnique(args: { where: Row }) {
      calls.push([name, "findUnique", args]);
      return tables[name].find((r) => r.id === args.where.id) ?? null;
    },
    async create(args: unknown) {
      calls.push([name, "create", args]);
      return {};
    },
    async count(args: unknown) {
      calls.push([name, "count", args]);
      return rows.openJobs ?? 0;
    },
    // The people an imported name is matched against: every row of the table, as the where would list them.
    async findMany(args: unknown) {
      calls.push([name, "findMany", args]);
      return tables[name] ?? [];
    },
    // The open name-only tasks, one row per name.
    async groupBy(args: unknown) {
      calls.push([name, "groupBy", args]);
      return (rows.named ?? []).map((n) => ({ assigneeName: n.assigneeName, _count: { _all: n.count } }));
    },
  });
  const tx = {
    deal: model("deal"),
    dealNote: model("dealNote"),
    property: model("property"),
    contact: model("contact"),
    task: model("task"),
    user: model("user"),
    async $executeRaw(sql: TemplateStringsArray, ...values: unknown[]) {
      calls.push(["$executeRaw", sql.join("?"), values]);
      return 1;
    },
  };
  return { tx: tx as unknown as ArchiveTx, calls, tables };
}

const NOW = at("2026-10-27T14:00:00Z");
const BY = { id: "u-connor" };

test("archiving a deal stamps who and when, names the editor, and adds its log line", async () => {
  const { tx, calls, tables } = fakeTx({ deal: [{ id: "d1", archivedAt: null }] });
  assert.equal(await setDealArchived(tx, "d1", true, BY, NOW), true);
  assert.deepEqual(tables.deal[0], { id: "d1", archivedAt: NOW, archivedByUserId: "u-connor", updatedByUserId: "u-connor" });
  const note = calls.find(([m, op]) => m === "dealNote" && op === "create")?.[2] as { data: Row };
  assert.deepEqual(note.data, {
    dealId: "d1",
    body: "Deal archived",
    noteDate: NOW,
    source: "change",
    authorUserId: "u-connor",
    data: { event: "archived" },
  });
});

test("restoring a deal clears who and when, keeps the editor stamp, and logs it", async () => {
  const { tx, calls, tables } = fakeTx({ deal: [{ id: "d1", archivedAt: at("2026-10-20T14:00:00Z"), archivedByUserId: "u-pieter" }] });
  assert.equal(await setDealArchived(tx, "d1", false, BY, NOW), true);
  assert.equal(tables.deal[0].archivedAt, null);
  assert.equal(tables.deal[0].archivedByUserId, null);
  assert.equal(tables.deal[0].updatedByUserId, "u-connor");
  const note = calls.find(([m, op]) => m === "dealNote" && op === "create")?.[2] as { data: Row };
  assert.deepEqual(note.data.data, { event: "restored" });
  assert.equal(note.data.body, "Deal restored");
});

test("archiving what's already archived writes nothing, so two partners log it once", async () => {
  const { tx, calls } = fakeTx({ deal: [{ id: "d1", archivedAt: at("2026-10-27T13:00:00Z") }] });
  assert.equal(await setDealArchived(tx, "d1", true, BY, NOW), false);
  assert.ok(!calls.some(([m]) => m === "dealNote"), "no second log line");
  const restoreLive = fakeTx({ property: [{ id: "p1", archivedAt: null }] });
  assert.equal(await setPropertyArchived(restoreLive.tx, "p1", false, BY, NOW), false);
});

test("a record that's gone says so", async () => {
  const { tx } = fakeTx({});
  await assert.rejects(setDealArchived(tx, "nope", true, BY, NOW), /This deal is gone\./);
  await assert.rejects(setPropertyArchived(tx, "nope", true, BY, NOW), /This property is gone\./);
  await assert.rejects(setContactArchived(tx, "nope", true, BY, NOW), /This contractor is gone\./);
});

test("archiving a property stamps who and when and its last editor; its tasks aren't touched", async () => {
  const { tx, calls, tables } = fakeTx({ property: [{ id: "p1", archivedAt: null }] });
  assert.equal(await setPropertyArchived(tx, "p1", true, BY, NOW), true);
  assert.deepEqual(tables.property[0], { id: "p1", archivedAt: NOW, archivedByUserId: "u-connor", updatedByUserId: "u-connor" });
  assert.ok(!calls.some(([m]) => m === "task" || m === "dealNote"));
});

test("a contractor with open jobs or a login isn't archived, and the refusal is the toast's line", async () => {
  const busy = fakeTx({ contact: [{ id: "c1", archivedAt: null, portalAccount: null }], openJobs: 3 });
  await assert.rejects(setContactArchived(busy.tx, "c1", true, BY, NOW), (err: unknown) => {
    assert.ok(err instanceof ArchiveRefusedError);
    assert.equal((err as Error).message, "Reassign their 3 jobs first.");
    return true;
  });
  assert.equal(busy.tables.contact[0].archivedAt, null, "nothing written");
  assert.ok(!busy.calls.some(([, op]) => op === "updateMany"));

  const login = fakeTx({ contact: [{ id: "c1", archivedAt: null, portalAccount: { status: "ACTIVE" } }] });
  await assert.rejects(setContactArchived(login.tx, "c1", true, BY, NOW), /Remove portal access first\./);

  // The open jobs are counted on open work only, never a playbook's template rows, and never a draft Claude saved
  // (docs/specs/tasks-from-claude.md 6.2): a draft doesn't stop an archive, and Add refuses the archived contractor.
  const count = busy.calls.find(([m, op]) => m === "task" && op === "count")?.[2] as { where: Row };
  assert.equal(count.where.assigneeContactId, "c1");
  assert.deepEqual(count.where.status, { in: ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] });
  assert.deepEqual(count.where.bucket, { not: "Template" });
  assert.deepEqual(count.where.NOT, { status: "DRAFT" });
});

test("a contractor whose access was removed can be archived; the login itself is never written", async () => {
  const { tx, calls, tables } = fakeTx({ contact: [{ id: "c1", archivedAt: null, portalAccount: { status: "DISABLED" } }] });
  assert.equal(await setContactArchived(tx, "c1", true, BY, NOW), true);
  assert.equal(tables.contact[0].archivedAt, NOW);
  assert.equal(tables.contact[0].archivedByUserId, "u-connor");
  assert.ok(!calls.some(([m]) => m === "portalAccount"), "portal accounts are never touched");
  const update = calls.find(([m, op]) => m === "contact" && op === "updateMany")?.[2] as { data: Row };
  assert.deepEqual(Object.keys(update.data).sort(), ["archivedAt", "archivedByUserId"], "active and the login stay as they are");
});

test("archiving a contractor locks their row FOR UPDATE before it counts jobs or reads the login", async () => {
  // N3(c): without the lock the check and the write raced an assignment or a new login (their FK insert's KEY SHARE
  // never waits on the archive's NO KEY UPDATE), so an open job or an active login could land on an archived contractor.
  for (const archived of [true, false]) {
    const { tx, calls } = fakeTx({ contact: [{ id: "c1", archivedAt: archived ? null : NOW, portalAccount: null }] });
    await setContactArchived(tx, "c1", archived, BY, NOW);
    assert.deepEqual(calls[0], ["$executeRaw", 'SELECT 1 FROM "Contact" WHERE "id" = ? FOR UPDATE', ["c1"]], "the first statement");
    assert.equal(calls.filter(([m]) => m === "$executeRaw").length, 1, "the only lock it takes");
  }
});

test("restoring a contractor always goes through, open jobs or not", async () => {
  const { tx, tables } = fakeTx({ contact: [{ id: "c1", archivedAt: NOW, portalAccount: { status: "ACTIVE" } }], openJobs: 2 });
  assert.equal(await setContactArchived(tx, "c1", false, BY, NOW), true);
  assert.equal(tables.contact[0].archivedAt, null);
});

/* ---------------- Open jobs that carry only their imported name (Nov 3 low 6) ---------------- */

const ZACK = { id: "c1", fullName: "Zack Outlaw", email: "zack@outlaw.example", archivedAt: null, portalAccount: null };
const TEAM = [{ id: "u-connor", name: "Connor Swofford", email: "connor@hg.example" }];

test("an open job that carries only their imported name counts as theirs, the way the Tasks filter files it", async () => {
  // NOV3-TASKS-4: Asana's "Zack Outlaw" and his email are filed under Zack on Today and in the Tasks filter, and
  // Archive used to move them to Others without a word. Kenneth is nobody the list holds: not his.
  const named = [
    { assigneeName: "Zack Outlaw", count: 2 },
    { assigneeName: "zack@outlaw.example", count: 1 },
    { assigneeName: "Kenneth", count: 4 },
  ];
  const busy = fakeTx({ contact: [{ ...ZACK }], user: TEAM, named });
  await assert.rejects(setContactArchived(busy.tx, "c1", true, BY, NOW), (err: unknown) => {
    assert.ok(err instanceof ArchiveRefusedError);
    assert.equal((err as Error).message, "Reassign their 3 jobs first.");
    return true;
  });
  assert.equal(busy.tables.contact[0].archivedAt, null, "nothing written");
  // Counted with the linked ones: one by id and one by name is two.
  const both = fakeTx({ contact: [{ ...ZACK }], user: TEAM, openJobs: 1, named: [{ assigneeName: "Zack Outlaw ", count: 1 }] });
  await assert.rejects(setContactArchived(both.tx, "c1", true, BY, NOW), /Reassign their 2 jobs first\./);
  assert.deepEqual(await contractorArchiveBlockers(both.tx, "c1"), { openJobs: 2, hasLogin: false });

  // Open name-only work only, never a playbook's template rows, read with the lock already taken.
  const group = busy.calls.find(([m, op]) => m === "task" && op === "groupBy")?.[2] as { by: string[]; where: Row };
  assert.deepEqual(group.by, ["assigneeName"]);
  assert.deepEqual(group.where.status, { in: ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] });
  assert.deepEqual(group.where.bucket, { not: "Template" });
  assert.deepEqual(group.where.NOT, { status: "DRAFT" });
  assert.equal(group.where.assigneeUserId, null);
  assert.equal(group.where.assigneeContactId, null);
  assert.equal(busy.calls.filter(([m]) => m === "$executeRaw").length, 1, "still the only lock");
});

test("a name that is someone else's, or shared, doesn't stop the archive", async () => {
  // Another contractor named Zack makes "Zack" nobody's, as the Tasks filter reads it; a teammate's name is theirs.
  const roofer = { id: "c2", fullName: "Zack (Roofing)", email: "roof@example.com", archivedAt: null };
  const named = [
    { assigneeName: "Zack", count: 3 },
    { assigneeName: "Connor Swofford", count: 1 },
  ];
  const zackOutlaw = { ...ZACK, fullName: "Zack (Outlaw Carpentry)" };
  const { tx, tables } = fakeTx({ contact: [zackOutlaw, roofer], user: TEAM, named });
  assert.equal(await setContactArchived(tx, "c1", true, BY, NOW), true);
  assert.equal(tables.contact[0].archivedAt, NOW);
  // And with no name-only work at all, the people aren't read.
  const quiet = fakeTx({ contact: [{ ...ZACK }], user: TEAM });
  assert.deepEqual(await contractorArchiveBlockers(quiet.tx, "c1"), { openJobs: 0, hasLogin: false });
  assert.ok(!quiet.calls.some(([, op]) => op === "findMany"));
});

/* ---------------- The contractor page lists what Archive counts (Nov 3 low 6, follow-up) ---------------- */

test("contractorOpenJobs names the imported names it counts, and the page's list reads them", async () => {
  const named = [
    { assigneeName: "Zack Outlaw", count: 2 },
    { assigneeName: "zack@outlaw.example", count: 1 },
    { assigneeName: "Kenneth", count: 4 },
  ];
  const { tx } = fakeTx({ contact: [{ ...ZACK }], user: TEAM, openJobs: 1, named });
  const open = await contractorOpenJobs(tx, "c1");
  assert.deepEqual(open, { count: 4, names: ["Zack Outlaw", "zack@outlaw.example"] }, "one by id and three by name; Kenneth is nobody's");
  assert.deepEqual(await contractorArchiveBlockers(tx, "c1"), { openJobs: open.count, hasLogin: false }, "the toast's count is the list's");

  // The list: every job linked by id, and the open ones those names carry, unassigned otherwise; never a template row,
  // and never a draft, which is nobody's job until a partner adds it.
  assert.deepEqual(contractorJobsWhere("c1", open.names), {
    bucket: { not: "Template" },
    NOT: { status: "DRAFT" },
    OR: [
      { assigneeContactId: "c1" },
      {
        assigneeUserId: null,
        assigneeContactId: null,
        assigneeName: { in: ["Zack Outlaw", "zack@outlaw.example"] },
        status: { in: ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] },
      },
    ],
  });
  // With none, the list it always was.
  assert.deepEqual(contractorJobsWhere("c1", []), { assigneeContactId: "c1", bucket: { not: "Template" }, NOT: { status: "DRAFT" } });
  const quiet = fakeTx({ contact: [{ ...ZACK }], user: TEAM });
  assert.deepEqual(await contractorOpenJobs(quiet.tx, "c1"), { count: 0, names: [] });
});
