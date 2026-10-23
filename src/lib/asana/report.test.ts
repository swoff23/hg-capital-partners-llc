import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, type DbContact, type DbTaskRow, type DbUser, type PlanDb, type PlanInput, type SyncedFields } from "./map";
import { formatReport } from "./report";
import { buildFixture, DEFAULT_WORLD, type FixtureSnapshot } from "./__fixtures__/snapshot";

/**
 * formatReport is what Connor reads before approving the load, the D25
 * delete and PORTAL_ENABLED. These run it on load and delta plans,
 * including the shapes that once crashed it or left things out.
 */

const USERS: DbUser[] = [{ id: "u-connor", email: "connoraswofford@gmail.com", name: "Connor Swofford", asanaGid: null }];
const CONTACTS: DbContact[] = [
  { id: "c-zed", fullName: "Zed Carpenter", email: "zed@carpentry.example", asanaGid: null, active: true },
  { id: "c-ivy", fullName: "Ivy Electric", email: "ivy@electric.example", asanaGid: null, active: true },
];
const db = (tasks: DbTaskRow[] = []): PlanDb => ({
  users: USERS,
  contacts: CONTACTS,
  properties: [{ id: "p-118", address: "118 Congress St" }],
  tasks,
  checklist: [],
  templates: [],
  storyGids: new Set(),
  attachmentGids: new Set(),
});
const input = (s: FixtureSnapshot, over: Partial<PlanInput> = {}): PlanInput => ({
  mode: "load",
  projectGid: DEFAULT_WORLD.projectGid,
  asOf: DEFAULT_WORLD.startedAt,
  tasks: s.tasks,
  stories: s.stories,
  attachments: s.attachments,
  users: s.users,
  files: new Map(s.files.map((f) => [f.attachmentGid, { path: `/snap/${f.name}`, bytes: 1000 }])),
  ...over,
});
let n = 0;
const opts = { newId: () => `new-${++n}` };
const names = new Map<string, string>([
  ["u-connor", "Connor Swofford"],
  ["c-zed", "Zed Carpenter"],
  ["c-ivy", "Ivy Electric"],
]);

function row(over: Partial<DbTaskRow> & { id: string }): DbTaskRow {
  return {
    asanaId: null,
    title: "Task",
    description: null,
    status: "OPEN",
    dueDate: null,
    startDate: null,
    propertyId: null,
    bucket: "Unfiled",
    sectionRaw: null,
    assigneeUserId: null,
    assigneeContactId: null,
    assigneeName: null,
    assigneeEmail: null,
    appEditedAt: null,
    asanaSyncedAt: null,
    asanaLastSynced: null,
    hasRepeat: false,
    attachmentCount: 0,
    appEventCount: 0,
    ...over,
  };
}

const snap = buildFixture();
const gidOf = (name: string) => snap.tasks.find((t) => t.name === name && !t.parent)!.gid;

test("load report: every section of the review is there, and lockbox digits never are", () => {
  const nobody = { gid: "1209000000000999", name: "Nobody Here", email: "nobody@example.com" };
  const plan = buildPlan(input(snap, { users: [...snap.users, nobody] }), db([row({ id: "r-old", asanaId: "4040", title: "Deleted in Asana", status: "DONE" })]), opts);
  const text = formatReport(plan, { title: "Asana load (dry run)", names, header: ["database: localhost/test"] });
  for (const heading of ["Sections", "Tasks", "Timeline events", "Checklist items", "Templates (D28)", "Files", "People", "Will see", "D25 delete list", "App-only tasks", "Links"]) {
    assert.ok(text.includes(`-- ${heading}`), heading);
  }
  // Every Asana user ID in the snapshot is listed, even one on no imported work (its match is saved too).
  assert.match(text, /not on imported work/);
  assert.ok(text.includes("Nobody Here") && text.includes(nobody.gid));
  assert.match(text, /Replace kitchen faucet/);
  assert.ok(!/4821|1357/.test(text), "codes are masked everywhere in the report");
});

test("load report: open titles that kept Asana's [brackets] are listed to rename, closed ones aren't", () => {
  const s = structuredClone(snap);
  const open = s.tasks.find((t) => t.gid === gidOf("Replace kitchen faucet"))!;
  open.name = "Store [Dana] insurance";
  const done = s.tasks.find((t) => t.gid === gidOf("Mini splits unit 5"))!;
  Object.assign(done, { name: "Give [Dana] keys", completed: true, completed_at: "2026-10-20T09:00:00.000Z", completed_by: done.assignee });
  const plan = buildPlan(input(s), db([row({ id: "r-done", asanaId: done.gid, title: "Give [Dana] keys" })]), opts);
  const text = formatReport(plan, { title: "Asana load (dry run)", names });
  assert.match(text, /-- Open tasks with \[brackets\] in the title, to rename \(1\)/);
  assert.match(text, /new\s+Store \[Dana\] insurance/);
  assert.ok(!/^\s+\S+\s+Give \[Dana\] keys/m.test(text.split("to rename")[1].split("\n-- ")[0]), "a closed task isn't listed");

  const clean = formatReport(buildPlan(input(snap), db(), opts), { title: "Asana load (dry run)", names });
  assert.ok(!clean.includes("to rename"), "no section when nothing needs a rename");
});

test("delta report: a skipped task, a conflict and a closed contractor job print without crashing", () => {
  const s = structuredClone(snap);
  const mini = s.tasks.find((t) => t.gid === gidOf("Mini splits unit 5"))!;
  Object.assign(mini, { completed: true, completed_at: "2026-10-25T09:00:00.000Z", completed_by: mini.assignee });
  const faucetGid = gidOf("Replace kitchen faucet");
  const base: SyncedFields = {
    v: 1,
    title: mini.name,
    description: null,
    dueDate: null,
    startDate: null,
    place: { propertyId: null, bucket: "Unfiled" },
    assignee: { contactId: "c-ivy" },
    completed: false,
    sectionGid: null,
    sectionName: null,
    asOf: DEFAULT_WORLD.startedAt,
  };
  const rows = [
    row({ id: "r-mini", asanaId: mini.gid, title: mini.name, assigneeContactId: "c-ivy", asanaSyncedAt: new Date("2026-10-24T14:00:00Z"), asanaLastSynced: base }),
    // Never synced and edited in the app: every difference is a conflict.
    row({ id: "r-faucet", asanaId: faucetGid, title: "Kitchen faucet (app)", appEditedAt: new Date("2026-10-24T20:00:00Z") }),
  ];
  // One brand-new task's full record failed to fetch: it's only in the light listing.
  const lost = s.tasks.find((t) => t.name === "Figure out the gas bill")!;
  const fresh = new Set(s.tasks.map((t) => t.gid).filter((g) => g !== lost.gid));
  const plan = buildPlan(input(s, { mode: "delta", asOf: "2026-10-25T13:00:00.000Z", fresh }), db(rows), opts);

  const text = formatReport(plan, { title: "Asana delta (dry run)", names });
  assert.match(text, /Skipped "Figure out the gas bill"/);
  assert.match(text, /Conflicts \(\d+\): the app's value was kept/);
  assert.match(text, /Kitchen faucet \(app\)/);
  assert.match(text, /completed in Asana, now Done \(1\): "Mini splits unit 5"/);
  assert.match(text, /Ivy Electric \(c-ivy\): \d+ open jobs?, 1 closed \(still visible, read-only\)/);
  assert.match(text, /- \[closed\] Mini splits unit 5/);
  assert.match(text, /no deletes in a delta/);
});
