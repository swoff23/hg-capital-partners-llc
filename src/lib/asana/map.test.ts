import test from "node:test";
import assert from "node:assert/strict";
import {
  appFields,
  asanaYmd,
  attachmentKind,
  blobSafeName,
  buildPlan,
  classifySection,
  contentTypeFor,
  deltaScope,
  findLockboxMentions,
  maskLockbox,
  matchAttachmentStories,
  matchPeople,
  mapStory,
  mergeFields,
  parseSynced,
  placeFor,
  rewriteAsanaTaskLinks,
  type AsanaStory,
  type AsanaTask,
  type DbContact,
  type DbTaskRow,
  type DbUser,
  type ImportPlan,
  type PlanDb,
  type PlanInput,
  type StoryContext,
  type SyncedFields,
} from "./map";
import { buildDeltaFixture, buildFixture, DEFAULT_WORLD, type FixtureSnapshot } from "./__fixtures__/snapshot";

// ---------------------------------------------------------------------------
// Fixtures shared by the plan tests
// ---------------------------------------------------------------------------

const USERS: DbUser[] = [
  { id: "u-connor", email: "ConnorASwofford@gmail.com", name: "Connor Swofford", asanaGid: null },
  { id: "u-pieter", email: "pieter@queencitycorp.com", name: "Pieter Louw", asanaGid: null },
];
const CONTACTS: DbContact[] = [
  { id: "c-zed", fullName: "Zed Carpenter", email: "ZED@carpentry.example", asanaGid: null, active: true },
  { id: "c-ivy", fullName: "Ivy Electric", email: "office@electric.example; ivy@electric.example", asanaGid: null, active: true },
  { id: "c-pat", fullName: "Pat  Plumber", email: null, asanaGid: null, active: true },
];
const PROPERTIES = [
  { id: "p-118", address: "118 Congress St. Buffalo, NY 14213" },
  { id: "p-767", address: "767 Prospect Avenue, Buffalo, NY 14213" },
  { id: "p-415", address: "415 Crescent Ave., Buffalo, NY 14214" },
  { id: "p-23", address: "23 Sherwood St, Buffalo, NY 14213" },
  { id: "p-58", address: "58 Mariner Street, Buffalo, NY 14201" },
];

function row(over: Partial<DbTaskRow> & { id: string }): DbTaskRow {
  return {
    asanaId: null,
    title: "Task",
    description: null,
    status: "OPEN",
    dueDate: null,
    startDate: null,
    propertyId: null,
    bucket: "General",
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

const DELTA_AT = "2026-10-25T13:00:00.000Z";

function inputOf(snap: Pick<FixtureSnapshot, "tasks" | "stories" | "attachments" | "users" | "files">, mode: "load" | "delta" = "load", fresh?: Set<string>, asOf?: string): PlanInput {
  return {
    mode,
    projectGid: DEFAULT_WORLD.projectGid,
    asOf: asOf ?? (mode === "load" ? DEFAULT_WORLD.startedAt : DELTA_AT),
    tasks: snap.tasks,
    stories: snap.stories,
    attachments: snap.attachments,
    users: snap.users,
    fresh,
    files: new Map(snap.files.map((f) => [f.attachmentGid, { path: `/snap/files/${f.attachmentGid}/${f.name}`, bytes: 1000 }])),
  };
}

function dbOf(over: Partial<PlanDb> = {}): PlanDb {
  return { users: USERS, contacts: CONTACTS, properties: PROPERTIES, tasks: [], checklist: [], templates: [], storyGids: new Set(), attachmentGids: new Set(), ...over };
}

let ids = 0;
const opts = { newId: () => `new-${++ids}` };

const taskNamed = (plan: ImportPlan, title: string) => {
  const t = plan.tasks.find((x) => x.title === title);
  assert.ok(t, `no planned task "${title}"`);
  return t;
};

/** What the database holds after a plan is written: for testing the next run against it. */
function rowsAfter(plan: ImportPlan, before: DbTaskRow[] = [], syncedAt = new Date("2026-10-24T14:00:00Z")): DbTaskRow[] {
  const byId = new Map(before.map((r) => [r.id, r]));
  for (const tp of plan.tasks) {
    const prev = byId.get(tp.taskId) ?? row({ id: tp.taskId, asanaId: tp.asanaGid });
    const w = tp.write;
    const day = (v: string | null | undefined, cur: Date | null) => (v === undefined ? cur : v ? new Date(`${v}T00:00:00Z`) : null);
    byId.set(tp.taskId, {
      ...prev,
      title: w.title ?? prev.title,
      description: w.description !== undefined ? w.description : prev.description,
      status: w.status ?? prev.status,
      dueDate: day(w.dueDate, prev.dueDate),
      startDate: day(w.startDate, prev.startDate),
      propertyId: w.propertyId !== undefined ? w.propertyId : prev.propertyId,
      bucket: w.bucket ?? prev.bucket,
      sectionRaw: w.sectionRaw !== undefined ? w.sectionRaw : prev.sectionRaw,
      assigneeUserId: w.assigneeUserId !== undefined ? w.assigneeUserId : prev.assigneeUserId,
      assigneeContactId: w.assigneeContactId !== undefined ? w.assigneeContactId : prev.assigneeContactId,
      assigneeName: w.assigneeName !== undefined ? w.assigneeName : prev.assigneeName,
      assigneeEmail: w.assigneeEmail !== undefined ? w.assigneeEmail : prev.assigneeEmail,
      asanaSyncedAt: syncedAt,
      asanaLastSynced: JSON.parse(JSON.stringify(tp.baseline)),
    });
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Sections and people
// ---------------------------------------------------------------------------

test("classifySection: properties, General, playbooks, archived ventures", () => {
  assert.deepEqual(classifySection("118 Congress (HG)"), { kind: "property", key: "118 congress" });
  assert.deepEqual(classifySection("765/767 Prospect (Vontive) (HG)"), { kind: "property", key: "765 prospect" });
  assert.deepEqual(classifySection("General"), { kind: "general" });
  assert.deepEqual(classifySection("Untitled section"), { kind: "unfiled" });
  assert.deepEqual(classifySection(""), { kind: "unfiled" });
  assert.deepEqual(classifySection("NEW MOVE OUT [Address]"), { kind: "playbook", name: "NEW MOVE OUT" });
  assert.deepEqual(classifySection("Pieter properties"), { kind: "archive" });
  assert.deepEqual(classifySection("JMPL Properties"), { kind: "archive" });
});

test("placeFor: a property section with no Property is Unfiled, and says so", () => {
  const keys = new Map([["118 congress", "p-118"]]);
  assert.deepEqual(placeFor(classifySection("118 Congress (HG)"), keys), { propertyId: "p-118", bucket: "Property", unmatchedProperty: false });
  assert.deepEqual(placeFor(classifySection("50 Example (HG3)"), keys), { propertyId: null, bucket: "Unfiled", unmatchedProperty: true });
  assert.equal(placeFor(classifySection("General"), keys).bucket, "General");
});

test("matchPeople: users by email, contacts by email then exact name", () => {
  const people = matchPeople(
    [
      { gid: "1", name: "Connor S", email: "connoraswofford@GMAIL.com" },
      { gid: "2", name: "Zed C", email: "zed@carpentry.example" },
      { gid: "3", name: "Ivy", email: "ivy@electric.example" },
      { gid: "4", name: "Pat Plumber", email: null },
      { gid: "5", name: "Rae Realtor", email: "rae@realty.example" },
      { gid: "6", name: "(former user)" },
    ],
    USERS,
    CONTACTS,
  );
  assert.deepEqual(people.get("1")!.match, { kind: "user", userId: "u-connor", via: "email" });
  assert.deepEqual(people.get("2")!.match, { kind: "contact", contactId: "c-zed", via: "email", confirmed: true });
  assert.deepEqual(people.get("3")!.match, { kind: "contact", contactId: "c-ivy", via: "email", confirmed: true });
  // A name-only match waits for Connor.
  assert.deepEqual(people.get("4")!.match, { kind: "contact", contactId: "c-pat", via: "name", confirmed: false });
  assert.equal(people.get("5")!.match.kind, "none");
  const former = people.get("6")!.match;
  assert.equal(former.kind === "none" && former.reason, "former");
});

test("matchPeople: overrides and saved gids win; a row linked to someone else is never reused", () => {
  const contacts: DbContact[] = [...CONTACTS, { id: "c-zed2", fullName: "Zed Carpenter Jr", email: "zed@carpentry.example", asanaGid: "999", active: true }];
  const people = matchPeople(
    [
      { gid: "2", name: "Zed C", email: "zed@carpentry.example" },
      { gid: "4", name: "Pat Plumber" },
      { gid: "7", name: "Someone" },
      { gid: "999", name: "Zed Jr" },
    ],
    USERS,
    contacts,
    { overrides: { "4": { none: true }, "7": { contactId: "c-ivy" } } },
  );
  assert.deepEqual(people.get("2")!.match, { kind: "contact", contactId: "c-zed", via: "email", confirmed: true });
  assert.equal(people.get("4")!.match.kind, "none");
  assert.deepEqual(people.get("7")!.match, { kind: "contact", contactId: "c-ivy", via: "override", confirmed: true });
  assert.deepEqual(people.get("999")!.match, { kind: "contact", contactId: "c-zed2", via: "asanaGid", confirmed: true });
  const accepted = matchPeople([{ gid: "4", name: "Pat Plumber" }], USERS, CONTACTS, { acceptNameMatches: true });
  const pat = accepted.get("4")!.match;
  assert.equal(pat.kind === "contact" && pat.confirmed, true);
});

test("matchPeople: a second Asana account with the same email still matches, run after run", () => {
  const linked: DbContact[] = CONTACTS.map((c) => (c.id === "c-zed" ? { ...c, asanaGid: "2" } : c));
  const people = matchPeople(
    [
      { gid: "2", name: "Zed C", email: "zed@carpentry.example" },
      { gid: "22", name: "Zed (guest)", email: "zed@carpentry.example" },
    ],
    USERS,
    linked,
  );
  assert.deepEqual(people.get("2")!.match, { kind: "contact", contactId: "c-zed", via: "asanaGid", confirmed: true });
  assert.deepEqual(people.get("22")!.match, { kind: "contact", contactId: "c-zed", via: "email", confirmed: true });
  // By name, a contact linked to someone else is off limits.
  const pat: DbContact[] = CONTACTS.map((c) => (c.id === "c-pat" ? { ...c, asanaGid: "4" } : c));
  assert.equal(matchPeople([{ gid: "44", name: "Pat Plumber" }], USERS, pat).get("44")!.match.kind, "none");
});

test("matchPeople: two contacts with the same email or name match nobody", () => {
  const dupes: DbContact[] = [...CONTACTS, { id: "c-pat2", fullName: "Pat Plumber", email: null, asanaGid: null, active: true }];
  const people = matchPeople([{ gid: "4", name: "Pat Plumber" }], USERS, dupes);
  const m = people.get("4")!.match;
  assert.equal(m.kind === "none" && m.reason, "ambiguous");
});

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

test("asanaYmd: due_on as is; due_at is read in Buffalo time", () => {
  assert.equal(asanaYmd({ due_on: "2026-10-30" }), "2026-10-30");
  assert.equal(asanaYmd({ due_at: "2026-10-26T02:30:00.000Z" }), "2026-10-25");
  assert.equal(asanaYmd({ due_on: null, due_at: null }), null);
  assert.equal(asanaYmd(null), null);
});

test("rewriteAsanaTaskLinks: every Asana link format, unknown tasks left alone", () => {
  const map = new Map([["1209900000000123", "tsk1"]]);
  const r = rewriteAsanaTaskLinks(
    "see https://app.asana.com/0/1208826670424350/1209900000000123/f and https://app.asana.com/1/1208399116236020/project/1208826670424350/task/1209900000000123?focus=true and https://app.asana.com/0/0/1209900000000999",
    (g) => map.get(g) ?? null,
  );
  assert.equal(r.text, "see /tasks/tsk1 and /tasks/tsk1 and https://app.asana.com/0/0/1209900000000999");
  assert.equal(r.rewritten, 2);
  assert.equal(r.unresolved, 1);
});

test("maskLockbox: masks only the code, keeps the sentence", () => {
  assert.equal(maskLockbox("Lock box code is 4821 if the tenant isn't home. Unit 2 rent is 1200."), "Lock box code is #### if the tenant isn't home. Unit 2 rent is 1200.");
  assert.equal(maskLockbox("lockbox 1111, gate code 2222"), "lockbox ####, gate code ####");
});

test("findLockboxMentions: flags codes and masks the digits", () => {
  assert.deepEqual(findLockboxMentions("Lockbox 4821 on the side door"), ["Lockbox ####"]);
  assert.deepEqual(findLockboxMentions("lock box code is 12345"), ["lock box code is #####"]);
  assert.deepEqual(findLockboxMentions("Gate code 1357."), ["Gate code ####"]);
  assert.deepEqual(findLockboxMentions("Unit 2 rent is 1200"), []);
  assert.deepEqual(findLockboxMentions(null), []);
});

test("blobSafeName: only the characters the upload route allows, extension kept", () => {
  const ok = /^[A-Za-z0-9._-]{1,100}$/;
  for (const n of ["Invoice #1182.pdf", "front steps.png", "IMG_0412.HEIC", "../../etc/passwd", "Café menu (final).JPG", "....", "x".repeat(300) + ".mov"]) {
    const s = blobSafeName(n);
    assert.match(s, ok, n);
    assert.ok(s.length <= 80, n);
  }
  assert.equal(blobSafeName("Invoice #1182.pdf"), "Invoice-1182.pdf");
  assert.equal(blobSafeName("IMG_0412.HEIC"), "IMG_0412.heic");
  assert.equal(blobSafeName("Café menu (final).JPG"), "Cafe-menu-final.jpg");
  assert.equal(blobSafeName("...."), "file");
});

test("attachmentKind: from the extension; non-Asana hosts are links", () => {
  assert.equal(attachmentKind("IMG_0412.HEIC", true), "IMAGE");
  assert.equal(attachmentKind("walkthrough.MOV", true), "VIDEO");
  assert.equal(attachmentKind("Invoice.pdf", true), "FILE");
  assert.equal(attachmentKind("Plans.pdf", false), "LINK");
});

// ---------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------

const F = (over: Partial<SyncedFields> = {}) => ({
  title: "Fix steps",
  description: null,
  dueDate: "2026-10-30",
  startDate: null,
  place: { propertyId: "p-118", bucket: "Property" },
  assignee: { contactId: "c-zed" },
  completed: false,
  ...over,
});

test("mergeFields: never-synced row the app hasn't touched: Asana wins every difference", () => {
  const m = mergeFields(F({ assignee: { name: "Zed Carpenter", email: "zed@carpentry.example" }, completed: true }), null, F(), false);
  assert.deepEqual(m.apply, { assignee: { contactId: "c-zed" } });
  assert.equal(m.status, "reopen");
  assert.deepEqual(m.conflicts, []);
});

test("mergeFields: never-synced row the app edited: differences are conflicts, the app keeps its value", () => {
  const m = mergeFields(F({ title: "Fix steps (app)" }), null, F({ title: "Fix front steps" }), true);
  assert.deepEqual(m.apply, {});
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].field, "title");
});

test("mergeFields: Asana unchanged since the last sync: whatever the app did stands", () => {
  const base = F();
  const m = mergeFields(F({ dueDate: "2026-11-02", title: "Renamed in app" }), base, F(), true);
  assert.deepEqual(m.apply, {});
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.status, null);
});

test("mergeFields: Asana changed a field the app didn't: applied, even when the app edited other fields", () => {
  const base = F();
  const m = mergeFields(F({ title: "Renamed in app" }), base, F({ dueDate: "2026-11-05" }), true);
  assert.deepEqual(m.apply, { dueDate: "2026-11-05" });
  assert.deepEqual(m.conflicts, []);
});

test("mergeFields: both changed the same field: conflict, app kept", () => {
  const base = F();
  const m = mergeFields(F({ dueDate: "2026-11-01" }), base, F({ dueDate: "2026-11-05" }), true);
  assert.deepEqual(m.apply, {});
  assert.deepEqual(m.conflicts, [{ field: "dueDate", app: "2026-11-01", asana: "2026-11-05", base: "2026-10-30" }]);
});

test("mergeFields: with a baseline, the value itself decides, not appEditedAt", () => {
  // The app's value moved off the baseline without an appEditedAt stamp (a system write, a clock skew): still kept.
  const m = mergeFields(F({ title: "Changed elsewhere" }), F(), F({ title: "Asana rename" }), false);
  assert.deepEqual(m.apply, {});
  assert.equal(m.conflicts[0].field, "title");
});

test("mergeFields: completed in Asana always applies; reopening follows the normal rule", () => {
  assert.equal(mergeFields(F({ title: "app" }), F(), F({ completed: true }), true).status, "close");
  assert.equal(mergeFields(F({ completed: true }), F({ completed: true }), F({ completed: false }), false).status, "reopen");
  // The app closed it and Asana never changed: stays closed.
  assert.equal(mergeFields(F({ completed: true }), F(), F(), true).status, null);
  // Completed in Asana before the last sync, reopened in the app since: the app's reopen stands.
  assert.equal(mergeFields(F(), F({ completed: true }), F({ completed: true }), true).status, null);
});

test("mergeFields: the same values compare equal however they're spelled", () => {
  const m = mergeFields(F({ assignee: { name: "Rae  Realtor", email: "RAE@realty.example" } }), null, F({ assignee: { name: "rae realtor", email: "rae@realty.example" } }), false);
  assert.deepEqual(m.apply, {});
});

test("parseSynced: only the current shape", () => {
  assert.equal(parseSynced(null), null);
  assert.equal(parseSynced({ title: "x" }), null);
  assert.ok(parseSynced({ v: 1, title: "x", place: { propertyId: null, bucket: "General" }, completed: false }));
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

const people = matchPeople(
  [
    { gid: "z", name: "Zed Carpenter", email: "zed@carpentry.example" },
    { gid: "c", name: "Connor Swofford", email: "connoraswofford@gmail.com" },
  ],
  USERS,
  CONTACTS,
);
const ctx = (over: Partial<StoryContext> = {}): StoryContext => ({
  people,
  hasContractor: true,
  placeOfSection: (n) => placeFor(classifySection(n), new Map([["118 congress", "p-118"]])),
  rewrite: (t) => t,
  ...over,
});
const story = (s: Partial<AsanaStory>): AsanaStory => ({ gid: "s1", created_at: "2026-10-20T12:00:00Z", created_by: { gid: "z", name: "Zed Carpenter" }, ...s });

test("mapStory: comments are Shared with their HTML kept; the actor is the matched contact", () => {
  const e = mapStory(story({ resource_subtype: "comment_added", text: " Parts on order ", html_text: "<body>Parts on order</body>" }), ctx())!;
  assert.equal(e.kind, "COMMENT");
  assert.equal(e.visibility, "SHARED");
  assert.equal(e.body, "Parts on order");
  assert.equal(e.actorContactId, "c-zed");
  assert.equal(e.actorUserId, null);
  assert.equal(e.data.html, "<body>Parts on order</body>");
  assert.equal(e.createdAt, "2026-10-20T12:00:00Z");
});

test("mapStory: system stories are Internal with their before and after", () => {
  const due = mapStory(story({ resource_subtype: "due_date_changed", old_dates: { due_on: "2026-10-20" }, new_dates: { due_on: "2026-10-22" } }), ctx())!;
  assert.deepEqual([due.kind, due.visibility, due.data.from, due.data.to], ["DUE", "INTERNAL", "2026-10-20", "2026-10-22"]);
  const moved = mapStory(story({ resource_subtype: "section_changed", old_section: { gid: "a", name: "General" }, new_section: { gid: "b", name: "118 Congress (HG)" } }), ctx())!;
  assert.deepEqual([moved.kind, moved.data.from, moved.data.to, moved.data.toSection], ["PROPERTY", null, "p-118", "118 Congress (HG)"]);
  const assigned = mapStory(story({ resource_subtype: "assigned", assignee: { gid: "c", name: "Connor Swofford" } }), ctx())!;
  assert.deepEqual([assigned.kind, assigned.visibility, (assigned.data.to as { userId: string }).userId], ["ASSIGNED", "INTERNAL", "u-connor"]);
  assert.equal(mapStory(story({ resource_subtype: "name_changed", old_name: "a", new_name: "b" }), ctx())!.kind, "TITLE");
  assert.equal(mapStory(story({ resource_subtype: "notes_changed" }), ctx())!.kind, "NOTES");
});

test("mapStory: completion is a STATUS event the contractor sees on their own job", () => {
  const done = mapStory(story({ resource_subtype: "marked_complete" }), ctx())!;
  assert.deepEqual([done.kind, done.visibility, done.data.to], ["STATUS", "SHARED", "DONE"]);
  const noContractor = mapStory(story({ resource_subtype: "marked_complete" }), ctx({ hasContractor: false }))!;
  assert.equal(noContractor.visibility, "INTERNAL");
  assert.equal(mapStory(story({ resource_subtype: "marked_incomplete" }), ctx())!.data.to, "OPEN");
});

test("mapStory: noise is dropped", () => {
  for (const subtype of ["due_today", "task_assigned_reminder", "marked_today", "liked", "comment_liked", "follower_added", "added_to_project", "collaborator_added"]) {
    assert.equal(mapStory(story({ resource_subtype: subtype }), ctx()), null, subtype);
  }
});

test("mapStory: a subtask's stories move to the parent, labeled with the item", () => {
  const item = { asanaGid: "sub1", title: "Order grout" };
  const c = mapStory(story({ resource_subtype: "comment_added", text: "Grout is here" }), ctx({ fromChecklistItem: item }))!;
  assert.deepEqual([c.kind, c.visibility], ["COMMENT", "SHARED"]);
  assert.deepEqual(c.data.fromChecklistItem, item);
  const d = mapStory(story({ resource_subtype: "marked_complete" }), ctx({ fromChecklistItem: item }))!;
  assert.deepEqual([d.kind, d.visibility, d.data.done], ["CHECKLIST", "INTERNAL", true]);
  const due = mapStory(story({ resource_subtype: "due_date_changed", new_dates: { due_on: "2026-10-30" } }), ctx({ fromChecklistItem: item }))!;
  assert.deepEqual([due.kind, due.data.change, due.data.to], ["CHECKLIST", "due", "2026-10-30"]);
});

test("matchAttachmentStories: pasted images by gid, then the nearest story naming the file", () => {
  const atts = [
    { gid: "a1", name: "IMG_1.JPG", created_at: "2026-10-20T12:00:00Z" },
    { gid: "a2", name: "IMG_2.JPG", created_at: "2026-10-20T12:00:30Z" },
    { gid: "a3", name: "pasted.png", created_at: "2026-10-20T13:00:00Z" },
    { gid: "a4", name: "orphan.pdf", created_at: "2026-10-21T13:00:00Z" },
  ];
  const stories: AsanaStory[] = [
    story({ gid: "s2", resource_subtype: "attachment_added", text: "attached IMG_2.JPG", created_at: "2026-10-20T12:00:31Z" }),
    story({ gid: "s1", resource_subtype: "attachment_added", text: "attached IMG_1.JPG", created_at: "2026-10-20T12:00:32Z" }),
    story({ gid: "s3", resource_subtype: "comment_added", html_text: '<body>look <img data-asana-gid="a3"></body>', created_at: "2026-10-20T13:00:01Z" }),
    story({ gid: "s4", resource_subtype: "attachment_added", text: "attached something", created_at: "2026-10-20T18:00:00Z" }),
  ];
  const m = matchAttachmentStories(atts, stories);
  assert.equal(m.get("a1"), "s1");
  assert.equal(m.get("a2"), "s2");
  assert.equal(m.get("a3"), "s3");
  assert.equal(m.has("a4"), false); // nothing close enough: gets its own event
});

// ---------------------------------------------------------------------------
// The load plan, on the synthetic snapshot
// ---------------------------------------------------------------------------

const snap = buildFixture();
const plan = buildPlan(inputOf(snap), dbOf(), opts);

test("load: open HG tasks only; archived, playbook and completed tasks stay in the archive", () => {
  const titles = plan.tasks.map((t) => t.title);
  assert.ok(titles.includes("Replace kitchen faucet"));
  assert.ok(titles.includes("Figure out the gas bill"));
  assert.ok(!titles.includes("Roof estimate"));
  assert.ok(!titles.includes("Closing docs"));
  assert.ok(!titles.includes("Fix front steps")); // completed
  assert.ok(!titles.some((t) => /\[Tenant\]|\[Address\]/.test(t)));
  assert.ok(!titles.includes("Pick tile color")); // a subtask
  assert.equal(plan.report.skipped.archive, 2);
  assert.ok(plan.tasks.every((t) => t.op === "create" && t.write.status === "OPEN"));
});

test("load: sections map to properties, General and Unfiled", () => {
  assert.deepEqual(taskNamed(plan, "Replace kitchen faucet").place, { propertyId: "p-118", bucket: "Property" });
  assert.deepEqual(taskNamed(plan, "Renew umbrella policy").place, { propertyId: null, bucket: "General" });
  assert.deepEqual(taskNamed(plan, "Figure out the gas bill").place, { propertyId: null, bucket: "Unfiled" });
  assert.deepEqual(taskNamed(plan, "Walk the new place").place, { propertyId: null, bucket: "Unfiled" });
  assert.deepEqual(plan.report.unmatchedPropertySections, ["50 Example (HG3)"]);
});

test("load: assignees are users, confirmed contacts, or the name as text", () => {
  const faucet = taskNamed(plan, "Replace kitchen faucet");
  assert.equal(faucet.write.assigneeContactId, "c-zed");
  assert.equal(faucet.contactId, "c-zed");
  assert.equal(taskNamed(plan, "Renew umbrella policy").write.assigneeUserId, "u-connor");
  const gutter = taskNamed(plan, "Gutter cleaning");
  assert.deepEqual([gutter.write.assigneeName, gutter.write.assigneeEmail, gutter.contactId], ["Rae Realtor", "rae@realty.example", null]);
  // Pat matched by name only: text until Connor confirms.
  const pat = plan.tasks.find((t) => t.write.assigneeName === "Pat Plumber");
  assert.ok(pat && pat.contactId === null);
  assert.deepEqual(plan.report.pendingNameMatches.map((p) => p.contactId), ["c-pat"]);
  const unmatched = plan.people.filter((p) => p.match.kind === "none" && p.refs > 0).map((p) => p.name);
  assert.ok(unmatched.includes("Rae Realtor"));
});

test("load: dates go through dates.ts, created times come from Asana", () => {
  const painted = taskNamed(plan, "Paint the hallway");
  assert.equal(painted.write.dueDate, "2026-10-25"); // due_at at 10:30pm Eastern
  const faucet = taskNamed(plan, "Replace kitchen faucet");
  assert.equal(faucet.write.createdAt, snap.tasks.find((t) => t.name === "Replace kitchen faucet")!.created_at);
  assert.equal(faucet.write.description, "Lockbox 4821 on the side door. Water shutoff is in the basement.");
  assert.equal(taskNamed(plan, "Call plumber about the water line").write.description, "Tenant in unit 1 works nights, call before 2pm.\n\nGate code 1357.");
});

test("load: stories become events; comments Shared, history Internal, noise dropped", () => {
  const faucet = taskNamed(plan, "Replace kitchen faucet");
  const kinds = new Set(faucet.events.map((e) => e.kind));
  for (const k of ["COMMENT", "DUE", "ASSIGNED", "ATTACHMENT"]) assert.ok(kinds.has(k as never), k);
  assert.ok(faucet.events.filter((e) => e.kind === "COMMENT").every((e) => e.visibility === "SHARED"));
  assert.ok(faucet.events.filter((e) => e.kind === "DUE" || e.kind === "ASSIGNED").every((e) => e.visibility === "INTERNAL"));
  const tub = taskNamed(plan, "Order laundry tub");
  assert.deepEqual(
    tub.events.map((e) => e.kind).filter((k) => k !== "DUE" && k !== "ASSIGNED"),
    ["PROPERTY", "TITLE", "NOTES", "STATUS", "STATUS"],
  );
  for (const noise of ["liked", "due_today", "follower_added", "added_to_project", "task_assigned_reminder", "marked_today"]) {
    assert.ok(plan.report.droppedStories[noise] > 0, noise);
  }
  assert.ok(plan.tasks.every((t) => t.events.every((e) => e.kind !== "CREATED")));
});

test("load: subtasks become the checklist, depth first; their stories and files move up", () => {
  const tile = taskNamed(plan, "Bathroom tile, unit 2");
  assert.deepEqual(
    tile.checklist.map((c) => [c.title, c.write.done, c.write.position]),
    [
      ["Pick tile color", true, 0],
      ["Order grout", false, 1],
      ["Confirm the delivery window", false, 2],
      ["Demo old tile", false, 3],
    ],
  );
  const grout = tile.checklist[1];
  assert.equal(grout.write.assigneeLabel, "Ivy Electric");
  assert.ok(grout.write.dueDate);
  const moved = tile.events.filter((e) => e.data.fromChecklistItem);
  assert.ok(moved.some((e) => e.kind === "COMMENT" && e.body === "Done with demo, see photo"));
  assert.ok(moved.some((e) => e.kind === "COMMENT" && e.data.subtaskNotes && e.body === "Bag the debris; the dumpster is gone."));
  assert.ok(moved.some((e) => e.kind === "CHECKLIST" && e.data.done === true));
  const photo = tile.attachments.find((a) => a.filename === "IMG_0520.JPG")!;
  assert.deepEqual(photo.fromChecklistItem, { asanaGid: tile.checklist[3].asanaGid, title: "Demo old tile" });
  assert.equal(photo.taskId, tile.taskId);
  assert.equal(photo.uploadedByContactId, "c-ivy");
});

test("load: files: uploads, links, missing ones, and the story each hangs on", () => {
  const faucet = taskNamed(plan, "Replace kitchen faucet");
  const by = (n: string) => faucet.attachments.find((a) => a.filename === n)!;
  assert.deepEqual([by("IMG_0412.HEIC").kind, by("IMG_0412.HEIC").source.type, by("IMG_0412.HEIC").uploadedByContactId], ["IMAGE", "file", "c-zed"]);
  assert.equal(by("walkthrough.MOV").kind, "VIDEO");
  assert.equal(by("Invoice #1182.pdf").uploadedByUserId, "u-connor");
  assert.deepEqual([by("Plans.pdf").kind, by("Plans.pdf").source.type], ["LINK", "link"]);
  assert.equal(by("Walkthrough video message").kind, "LINK");
  assert.equal(by("IMG_0499.JPG").source.type, "missing");
  const pasted = by("image.png");
  const comment = faucet.events.find((e) => e.asanaStoryGid === pasted.eventStoryGid)!;
  assert.equal(comment.kind, "COMMENT");
  const heicEvent = faucet.events.find((e) => e.asanaStoryGid === by("IMG_0412.HEIC").eventStoryGid)!;
  assert.deepEqual([heicEvent.kind, heicEvent.data.filename], ["ATTACHMENT", "IMG_0412.HEIC"]);
  // Every file has an event; unmatched ones get their own.
  assert.ok(faucet.attachments.every((a) => faucet.events.some((e) => e.asanaStoryGid === a.eventStoryGid)));
  assert.equal(plan.report.files.missing.length, 1);
  assert.ok(plan.report.files.upload >= 7);
  assert.equal(plan.report.files.uploadBytes, plan.report.files.upload * 1000);
});

test("load: links between imported tasks are rewritten; links to closed ones aren't", () => {
  const mini = taskNamed(plan, "Mini splits unit 5");
  const tile = taskNamed(plan, "Bathroom tile, unit 2");
  assert.match(mini.write.description!, new RegExp(`/tasks/${tile.taskId}`));
  assert.match(mini.write.description!, /app\.asana\.com/);
  assert.ok(plan.report.links.rewritten >= 1 && plan.report.links.unresolved >= 1);
});

test("load: lockbox codes in notes and comments are flagged, masked", () => {
  const flagged = plan.report.lockbox.filter((l) => l.title === "Replace kitchen faucet");
  assert.ok(flagged.some((l) => l.where === "notes" && l.snippet === "Lockbox ####"));
  assert.ok(flagged.some((l) => l.where.startsWith("comment")));
  assert.ok(plan.report.lockbox.some((l) => l.snippet === "Gate code ####"));
  assert.ok(plan.report.lockbox.every((l) => !/\d/.test(l.snippet)));
});

test("load: playbooks become four templates, items in section order", () => {
  assert.equal(plan.templates.length, 4);
  const tenant = plan.templates.find((t) => t.name === "NEW TENANT")!;
  assert.equal(tenant.anchorLabel, "Move-in date");
  assert.deepEqual(tenant.items.map((i) => i.title), ["Collect deposit from [Tenant]", "Lease signed by [Tenant]", "Utilities into [Tenant]'s name", "Move-in walkthrough photos", "Give keys and lockbox code"]);
  assert.equal(tenant.items[0].assigneeUserId, "u-connor");
  assert.equal(tenant.items[0].notes, "Template step: fill in [Tenant] and [Address].");
  assert.equal(tenant.items[1].assigneeContactId, "c-zed");
  assert.deepEqual(tenant.items[4].checklist, ["Photo of the lockbox"]);
  const refi = plan.templates.find((t) => t.name === "NEW REFI")!;
  assert.deepEqual(refi.skippedCompleted, ["Insurance binder to lender"]);
  assert.equal(refi.anchorLabel, "Closing date");
});

test("load: the will-see report lists each contractor's open jobs with shared comments and files", () => {
  const zed = plan.report.willSee.find((w) => w.contactId === "c-zed")!;
  const faucet = zed.jobs.find((j) => j.title === "Replace kitchen faucet")!;
  assert.equal(faucet.where, "118 Congress St. Buffalo, NY 14213");
  assert.ok(faucet.comments >= 2 && faucet.files >= 7 && faucet.lockbox >= 2 && faucet.hasNotes);
  assert.equal(faucet.commentLines.length, faucet.comments);
  assert.ok(faucet.commentLines.some((l) => l.includes("Lock box code is ####")), "codes are masked in the report");
  assert.ok(faucet.commentLines.every((l) => !l.includes("4821")));
  assert.ok(faucet.fileNames.includes("IMG_0412.HEIC"));
  assert.ok(!plan.report.willSee.some((w) => w.contactId === "c-pat")); // unconfirmed
});

test("load: the plan is idempotent once written: every story and file is already there", () => {
  const all = plan.tasks.flatMap((t) => t.events.map((e) => e.asanaStoryGid));
  const files = plan.tasks.flatMap((t) => t.attachments.map((a) => a.asanaGid));
  const again = buildPlan(
    inputOf(snap),
    dbOf({
      tasks: rowsAfter(plan),
      storyGids: new Set(all),
      attachmentGids: new Set(files),
      checklist: plan.tasks.flatMap((t) => t.checklist.map((c) => ({ id: `cl-${c.asanaGid}`, taskId: t.taskId, asanaGid: c.asanaGid, title: c.title, done: !!c.write.done }))),
    }),
    opts,
  );
  assert.ok(again.tasks.every((t) => t.op === "update"));
  assert.ok(again.tasks.every((t) => Object.keys(t.write).every((k) => ["sectionRaw", "tags"].includes(k))), "no field changes");
  assert.ok(again.tasks.every((t) => t.conflicts.length === 0 && t.status === null));
  assert.ok(again.tasks.every((t) => t.events.every((e) => e.existing)));
  assert.ok(again.tasks.every((t) => t.attachments.every((a) => a.existing)));
  assert.equal(again.report.checklist.create, 0);
  assert.equal(again.report.files.upload, 0);
  assert.equal(again.deletes.length, 0);
});

// ---------------------------------------------------------------------------
// Reconciliation with the August CSV rows
// ---------------------------------------------------------------------------

test("load: CSV rows are updated, deleted (D25) or held back; app-only rows kept", () => {
  const s = buildFixture({
    ...DEFAULT_WORLD,
    existing: [
      { gid: "5001", name: "Water heater", section: "118 Congress (HG)", completed: false },
      { gid: "5002", name: "Old job", section: "118 Congress (HG)", completed: true },
      { gid: "5003", name: "Reopened job", section: "General", completed: false },
    ],
  });
  const grout = s.tasks.find((t) => t.name === "Order grout")!;
  const tub = s.tasks.find((t) => t.name === "Give keys and lockbox code")!;
  const rows = [
    row({ id: "r1", asanaId: "5001", title: "Water heater", bucket: "Property", propertyId: "p-118", assigneeName: "Zed Carpenter", assigneeEmail: "zed@carpentry.example" }),
    row({ id: "r2", asanaId: "5002", title: "Old job", status: "DONE" }),
    row({ id: "r3", asanaId: "5003", title: "Reopened job", status: "DONE" }),
    row({ id: "r4", asanaId: grout.gid, title: "Order grout", bucket: "Unfiled" }),
    row({ id: "r5", asanaId: tub.gid, title: "Give keys and lockbox code", bucket: "Template" }),
    row({ id: "r6", asanaId: "4040", title: "Deleted in Asana", status: "DONE", attachmentCount: 2 }),
    row({ id: "r7", asanaId: "4041", title: "Gone but edited", appEditedAt: new Date("2026-10-25T00:00:00Z") }),
    row({ id: "r8", asanaId: null, title: "Move-in form: unit 2" }),
  ];
  const p = buildPlan(inputOf(s), dbOf({ tasks: rows }), opts);
  const heater = p.tasks.find((t) => t.taskId === "r1")!;
  assert.equal(heater.op, "update");
  assert.equal(heater.write.assigneeContactId, "c-zed");
  assert.equal(heater.write.assigneeName, null);
  const reopened = p.tasks.find((t) => t.taskId === "r3")!;
  assert.equal(reopened.status, "reopen");
  assert.equal(reopened.write.status, "OPEN");
  const reasons = Object.fromEntries(p.deletes.map((d) => [d.taskId, [d.reason, d.heldBack]]));
  assert.deepEqual(reasons, {
    r2: ["completed in Asana", null],
    r4: ["subtask, now a checklist item", null],
    r5: ["playbook placeholder", null],
    r6: ["not in the Asana snapshot", null],
    r7: ["not in the Asana snapshot", "edited in the app"],
  });
  assert.equal(p.deletes.find((d) => d.taskId === "r6")!.attachmentCount, 2);
  assert.deepEqual(p.appOnly.map((a) => a.taskId), ["r8"]);
});

// ---------------------------------------------------------------------------
// The delta
// ---------------------------------------------------------------------------

test("deltaScope: open HG tasks and synced rows; full fetch only where the listing can't be merged", () => {
  const rows = rowsAfter(plan);
  const d = buildDeltaFixture(snap, "2026-10-25T13:00:00.000Z");
  const { scope, full } = deltaScope(d.tasks, rows, DEFAULT_WORLD.projectGid);
  const g = (name: string) => d.tasks.find((t) => t.name === name)!.gid;
  assert.ok(scope.has(g("Replace kitchen faucet")));
  assert.ok(!full.has(g("Replace kitchen faucet"))); // only stories changed
  assert.ok(full.has(g("Gutter cleaning"))); // moved sections
  assert.ok(full.has(g("Mini splits unit 5"))); // completed
  assert.ok(full.has(g("Replace porch light"))); // new
  assert.ok(!scope.has(g("Roof estimate")));
  assert.ok(!scope.has(g("Fix front steps"))); // completed before the load, never imported
});

test("delta: completion applies, Asana edits apply, both-sides edits conflict, new work comes in", () => {
  const rows = rowsAfter(plan);
  const d = buildDeltaFixture(snap, "2026-10-25T13:00:00.000Z");
  // The app renamed the task Asana renamed: a conflict. And edited a different field of another.
  const renamed = rows.find((r) => r.asanaId === d.appEdit!.gid)!;
  renamed.title = d.appEdit!.title;
  renamed.appEditedAt = new Date("2026-10-25T10:00:00Z");
  const furnace = rows.find((r) => r.title === "Furnace service")!;
  furnace.description = "Filter size 16x25";
  furnace.appEditedAt = new Date("2026-10-25T10:00:00Z");

  const { scope, full } = deltaScope(d.tasks, rows, DEFAULT_WORLD.projectGid);
  const fresh = new Set([...d.meta.modified, ...full]);
  const listed = d.tasks.filter((t) => scope.has(t.gid) || (t.parent && scope.has(topOf(t, d.tasks))));
  const all = plan.tasks.flatMap((t) => t.events.map((e) => e.asanaStoryGid));
  const p = buildPlan(
    { ...inputOf({ ...d, users: snap.users, files: d.files }, "delta", fresh), tasks: listed },
    dbOf({ tasks: rows, storyGids: new Set(all), attachmentGids: new Set(plan.tasks.flatMap((t) => t.attachments.map((a) => a.asanaGid))) }),
    opts,
  );
  const byTitle = (title: string) => p.tasks.find((t) => t.title === title || t.write.title === title)!;

  const mini = p.tasks.find((t) => t.asanaGid === d.tasks.find((x) => x.name === "Mini splits unit 5")!.gid)!;
  assert.equal(mini.status, "close");
  assert.equal(mini.write.status, "DONE");
  assert.equal(mini.write.completedByContactId, "c-ivy");
  assert.ok(mini.closed);
  assert.ok(mini.events.some((e) => e.kind === "STATUS" && !e.existing && e.data.to === "DONE"));

  const conflict = p.tasks.find((t) => t.taskId === renamed.id)!;
  assert.equal(conflict.write.title, undefined);
  assert.equal(conflict.conflicts[0].field, "title");
  assert.ok(p.report.conflicts.some((c) => /title/.test(c.text)));

  const f = p.tasks.find((t) => t.taskId === furnace.id)!;
  assert.ok(f.write.dueDate, "Asana's reschedule applies though the app edited the notes");
  assert.equal(f.write.description, undefined);
  assert.equal(f.conflicts.length, 0);

  const gutter = p.tasks.find((t) => t.asanaGid === d.tasks.find((x) => x.name === "Gutter cleaning")!.gid)!;
  assert.deepEqual([gutter.write.propertyId, gutter.write.bucket], ["p-23", "Property"]);

  const away = p.tasks.find((t) => t.asanaGid === d.tasks.find((x) => x.name === "Order laundry tub")!.gid)!;
  assert.equal(away.write.propertyId, undefined);
  assert.equal(away.conflicts[0].field, "section");

  const porch = byTitle("Replace porch light");
  assert.equal(porch.op, "create");
  assert.equal(porch.contactId, "c-ivy");
  assert.deepEqual(porch.checklist.map((c) => c.title), ["Buy bulbs"]);

  const faucet = p.tasks.find((t) => t.taskId === rows.find((r) => r.title === "Replace kitchen faucet")!.id)!;
  assert.equal(faucet.fresh, false);
  assert.deepEqual(faucet.write, {});
  assert.deepEqual(faucet.events.filter((e) => !e.existing).map((e) => e.kind).sort(), ["ATTACHMENT", "COMMENT"]);
  assert.deepEqual(faucet.attachments.filter((a) => !a.existing).map((a) => a.filename), ["IMG_0601.JPG"]);

  const tile = p.tasks.find((t) => t.taskId === rows.find((r) => r.title === "Bathroom tile, unit 2")!.id)!;
  assert.ok(tile.events.some((e) => !e.existing && e.body === "Grout is here." && e.data.fromChecklistItem));
  assert.equal(p.deletes.length, 0);
});

test("an older snapshot re-run after a delta never rolls back what the delta synced", () => {
  const loaded = rowsAfter(plan);
  const d = buildDeltaFixture(snap, DELTA_AT);
  const { full } = deltaScope(d.tasks, loaded, DEFAULT_WORLD.projectGid);
  const deltaPlan = buildPlan(inputOf({ ...d, users: snap.users }, "delta", new Set([...d.meta.modified, ...full])), dbOf({ tasks: loaded }), opts);
  const synced = rowsAfter(deltaPlan, loaded);
  const miniGid = d.tasks.find((t) => t.name === "Mini splits unit 5")!.gid;
  assert.equal(synced.find((r) => r.asanaId === miniGid)!.status, "DONE");

  const again = buildPlan(inputOf(snap), dbOf({ tasks: synced }), opts);
  for (const name of ["Furnace service", "Gutter cleaning"]) {
    const tp = again.tasks.find((t) => t.asanaGid === d.tasks.find((x) => x.name === name)!.gid)!;
    assert.deepEqual(tp.write, {}, name);
    assert.equal(tp.baseline.asOf, DELTA_AT, name);
    assert.ok(tp.notes.some((n) => /newer Asana data/.test(n)), name);
  }
  const mini = again.tasks.find((t) => t.asanaGid === miniGid)!;
  assert.equal(mini.status, null); // not reopened from the stale snapshot
  assert.ok(mini.closed);
});

test("delta: app-closed tasks stay closed while Asana leaves them alone", () => {
  const rows = rowsAfter(plan);
  const job = rows.find((r) => r.title === "Replace kitchen faucet")!;
  job.status = "DONE";
  job.appEditedAt = new Date("2026-10-25T10:00:00Z");
  const p = buildPlan(inputOf(snap, "delta"), dbOf({ tasks: rows }), opts);
  const tp = p.tasks.find((t) => t.taskId === job.id)!;
  assert.equal(tp.status, null);
  assert.equal(tp.write.status, undefined);
  assert.ok(tp.closed);
  assert.deepEqual(appFields(job).completed, true);
});

// ---------------------------------------------------------------------------
// Review fixes: checklist merge, partial fetches, repeats, files, lockbox, will-see
// ---------------------------------------------------------------------------

/** The checklist rows a load plan writes, as the next run reads them back. */
function checklistRows(p: ImportPlan) {
  return p.tasks.flatMap((t) => t.checklist.map((c) => ({ id: `cl-${c.asanaGid}`, taskId: t.taskId, asanaGid: c.asanaGid, title: c.title, done: !!c.write.done })));
}

test("delta checklist: an app untick stays; a new Asana tick applies; a rename on both sides conflicts", () => {
  const rows = rowsAfter(plan);
  const items = checklistRows(plan);
  const tile = taskNamed(plan, "Bathroom tile, unit 2");
  const item = (title: string) => items.find((i) => i.taskId === tile.taskId && i.title === title)!;
  item("Pick tile color").done = false; // unticked in the app; still ticked in Asana since the load
  item("Demo old tile").title = "Demo tile (app)";
  const s = structuredClone(snap);
  const sub = (name: string) => s.tasks.find((t) => t.parent && t.name === name)!;
  Object.assign(sub("Order grout"), { completed: true, completed_at: "2026-10-25T09:00:00.000Z" }); // newly ticked in Asana
  sub("Demo old tile").name = "Demo old tile and haul";

  const p = buildPlan(inputOf(s, "delta"), dbOf({ tasks: rows, checklist: items }), opts);
  const t = p.tasks.find((x) => x.taskId === tile.taskId)!;
  const planned = (title: string) => t.checklist.find((c) => c.title === title)!;
  assert.equal(planned("Pick tile color").write.done, undefined, "the app's untick stands");
  assert.equal(planned("Order grout").write.done, true);
  assert.equal(planned("Order grout").write.doneAt, "2026-10-25T09:00:00.000Z");
  assert.equal(planned("Demo old tile and haul").write.title, undefined);
  assert.deepEqual(t.conflicts.map((c) => [c.field, c.app, c.asana]), [["checklist", "Demo tile (app)", "Demo old tile and haul"]]);

  // Run again on the same Asana data: the untick still stands, every day.
  const again = buildPlan(inputOf(s, "delta", undefined, "2026-10-26T13:00:00.000Z"), dbOf({ tasks: rowsAfter(p, rows), checklist: items }), opts);
  assert.equal(again.tasks.find((x) => x.taskId === tile.taskId)!.checklist.find((c) => c.title === "Pick tile color")!.write.done, undefined);
});

test("delta: a task whose subtasks failed to fetch keeps its checklist and checklist baseline", () => {
  const rows = rowsAfter(plan);
  const items = checklistRows(plan);
  const tile = taskNamed(plan, "Bathroom tile, unit 2");
  const loaded = parseSynced(rows.find((r) => r.id === tile.taskId)!.asanaLastSynced)!;
  assert.equal(Object.keys(loaded.checklist ?? {}).length, 4);
  const s = { ...snap, tasks: snap.tasks.filter((t) => !(t.parent && topOf(t, snap.tasks) === tile.asanaGid)) };

  const p = buildPlan({ ...inputOf(s, "delta"), subtasksIncomplete: new Set([tile.asanaGid]) }, dbOf({ tasks: rows, checklist: items }), opts);
  const t = p.tasks.find((x) => x.taskId === tile.taskId)!;
  assert.deepEqual(t.checklist, []);
  assert.deepEqual(t.baseline.checklist, loaded.checklist);
  assert.ok(t.notes.some((n) => /subtasks couldn't be fetched/.test(n)));

  // Even unflagged, a subtask missing from the input keeps its baseline entry...
  const unflagged = buildPlan(inputOf(s, "delta"), dbOf({ tasks: rows, checklist: items }), opts);
  assert.deepEqual(unflagged.tasks.find((x) => x.taskId === tile.taskId)!.baseline.checklist, loaded.checklist);
  // ...so on the next full run an app rename is still the app's, not overwritten by Asana.
  const renamed = items.map((i) => (i.taskId === tile.taskId && i.title === "Order grout" ? { ...i, title: "Order grout (app)" } : i));
  const next = buildPlan(inputOf(snap, "delta", undefined, "2026-10-26T13:00:00.000Z"), dbOf({ tasks: rowsAfter(p, rows), checklist: renamed }), opts);
  const grout = next.tasks.find((x) => x.taskId === tile.taskId)!.checklist.find((c) => c.title === "Order grout")!;
  assert.equal(grout.write.title, undefined);
});

test("delta: a new task whose full record failed to fetch is skipped and noted, not half-created", () => {
  const rows = rowsAfter(plan);
  const d = buildDeltaFixture(snap, DELTA_AT);
  const porch = d.tasks.find((t) => t.name === "Replace porch light")!;
  const { full } = deltaScope(d.tasks, rows, DEFAULT_WORLD.projectGid);
  const fresh = new Set([...d.meta.modified, ...full].filter((g) => g !== porch.gid));
  const p = buildPlan(inputOf({ ...d, users: snap.users }, "delta", fresh), dbOf({ tasks: rows }), opts);
  assert.ok(!p.tasks.some((t) => t.asanaGid === porch.gid));
  assert.ok(p.report.notes.some((n) => n.includes("Replace porch light") && n.includes(porch.gid)));
  assert.ok(p.tasks.every((t) => typeof t.title === "string" && t.title.length > 0));
  // The rest of the run still applies.
  assert.ok(p.tasks.some((t) => t.status === "close"));
});

test("delta: a repeating task completed in Asana gets one next copy, Asana's when the run has it", () => {
  const rows = rowsAfter(plan);
  const d = buildDeltaFixture(snap, DELTA_AT);
  const mini = d.tasks.find((t) => t.name === "Mini splits unit 5")!;
  rows.find((r) => r.asanaId === mini.gid)!.hasRepeat = true;
  const run = (tasks: AsanaTask[]) => {
    const { full } = deltaScope(tasks, rows, DEFAULT_WORLD.projectGid);
    return buildPlan(inputOf({ ...d, tasks, users: snap.users }, "delta", new Set([...d.meta.modified, ...full])), dbOf({ tasks: rows }), opts);
  };

  // No copy in the run: the app makes the next one.
  const plain = run(d.tasks);
  assert.equal(plain.tasks.find((t) => t.asanaGid === mini.gid)!.repeatOnClose, true);
  assert.ok(plain.tasks.every((t) => t.seriesFrom === null));

  // Asana made its copy on completion: that copy joins the series and the app makes none.
  const copy: AsanaTask = { ...structuredClone(mini), gid: "1209950000009999", completed: false, completed_at: null, completed_by: null, created_at: mini.completed_at, modified_at: mini.completed_at, due_on: "2026-11-24" };
  const adopted = run([...d.tasks, copy]);
  const done = adopted.tasks.find((t) => t.asanaGid === mini.gid)!;
  const next = adopted.tasks.find((t) => t.asanaGid === copy.gid)!;
  assert.equal(done.status, "close");
  assert.equal(done.repeatOnClose, false);
  assert.equal(next.op, "create");
  assert.equal(next.seriesFrom, done.taskId);
  assert.equal(next.write.dueDate, "2026-11-24");
  assert.equal(adopted.tasks.filter((t) => t.seriesFrom || t.repeatOnClose).length, 1, "exactly one next copy");

  // A task with the same name made before the completion isn't the copy.
  const older: AsanaTask = { ...copy, gid: "1209950000009998", created_at: "2026-10-01T00:00:00.000Z" };
  const notACopy = run([...d.tasks, older]);
  assert.equal(notACopy.tasks.find((t) => t.asanaGid === mini.gid)!.repeatOnClose, true);
  assert.equal(notACopy.tasks.find((t) => t.asanaGid === older.gid)!.seriesFrom, null);
});

test("files: types outside the allowlist are opaque bytes; active extensions never reach a Blob path", () => {
  assert.equal(contentTypeFor("IMG_0412.HEIC"), "image/heic");
  assert.equal(contentTypeFor("Invoice.pdf"), "application/pdf");
  for (const name of ["page.html", "logo.svg", "old.htm", "feed.xml", "noextension", "x.constructor"]) {
    assert.equal(contentTypeFor(name), "application/octet-stream", name);
  }
  assert.equal(attachmentKind("logo.svg", true), "FILE");
  assert.equal(blobSafeName("Invoice.HTML"), "Invoice.bin");
  assert.equal(blobSafeName("logo.svg"), "logo.bin");
  assert.equal(blobSafeName("app.js"), "app.bin");
  assert.equal(blobSafeName("IMG_0412.HEIC"), "IMG_0412.heic");

  const s = structuredClone(snap);
  const job = s.tasks.find((t) => t.name === "Replace kitchen faucet")!;
  s.attachments[job.gid].push({ gid: "1209900000777776", name: "quote.html", resource_subtype: "asana", host: "asana", size: 10, created_at: job.created_at, view_url: null, permanent_url: null, parent: { gid: job.gid } });
  const p = buildPlan({ ...inputOf(s), files: new Map([["1209900000777776", { path: "/snap/quote.html", bytes: 10 }]]) }, dbOf(), opts);
  const html = p.tasks.flatMap((t) => t.attachments).find((a) => a.asanaGid === "1209900000777776")!;
  assert.deepEqual([html.kind, html.contentType], ["FILE", "application/octet-stream"]);
});

test("lockbox scan covers task titles and file names, which contractors see too", () => {
  const s = structuredClone(snap);
  const job = s.tasks.find((t) => t.name === "Replace kitchen faucet")!;
  job.name = "Lockbox code 4821 for unit 2";
  s.attachments[job.gid].push({ gid: "1209900000777777", name: "door code 2468.jpg", resource_subtype: "asana", host: "asana", size: null, created_at: job.created_at, view_url: null, permanent_url: null, parent: { gid: job.gid } });
  const p = buildPlan(inputOf(s), dbOf(), opts);
  const taskId = p.tasks.find((t) => t.asanaGid === job.gid)!.taskId;
  const flagged = p.report.lockbox.filter((l) => l.taskId === taskId);
  assert.ok(flagged.some((l) => l.where === "title" && l.snippet === "Lockbox code ####"));
  assert.ok(flagged.some((l) => l.where === "file name" && l.snippet === "door code ####"));
  assert.ok(flagged.every((l) => !/\d/.test(l.snippet)));
});

test("will see: a closed job the contractor keeps access to is listed, marked closed", () => {
  const rows = rowsAfter(plan);
  const d = buildDeltaFixture(snap, DELTA_AT);
  const { full } = deltaScope(d.tasks, rows, DEFAULT_WORLD.projectGid);
  const p = buildPlan(inputOf({ ...d, users: snap.users }, "delta", new Set([...d.meta.modified, ...full])), dbOf({ tasks: rows }), opts);
  const mini = p.tasks.find((t) => t.asanaGid === d.tasks.find((x) => x.name === "Mini splits unit 5")!.gid)!;
  assert.ok(mini.closed);
  assert.equal(mini.contactId, "c-ivy");
  const job = p.report.willSee.find((w) => w.contactId === "c-ivy")!.jobs.find((j) => j.taskId === mini.taskId)!;
  assert.equal(job.closed, true);
  assert.ok(p.report.willSee.flatMap((w) => w.jobs).filter((j) => j.taskId !== mini.taskId).every((j) => !j.closed));
});

function topOf(t: { parent?: { gid: string } | null; gid: string }, all: Array<{ gid: string; parent?: { gid: string } | null }>): string {
  let cur = t;
  while (cur.parent?.gid) cur = all.find((x) => x.gid === cur.parent!.gid) ?? { gid: cur.parent.gid };
  return cur.gid;
}
