import test from "node:test";
import assert from "node:assert/strict";
import { asanaPeopleOf, asanaPersonFor, planLegacyLinks, type LegacyRow } from "./legacy";
import type { AsanaRef, DbContact, DbUser } from "./map";

const USERS: DbUser[] = [{ id: "u-connor", email: "connor@example.com", name: "Connor Swofford", asanaGid: "g-connor" }];
const CONTACTS: DbContact[] = [
  // Linked to Asana by a load: matched by id, though his CSV email differs.
  { id: "c-jose", fullName: "Jose Alvarez", email: "jose@office.example", asanaGid: "g-jose", active: true },
  { id: "c-zack", fullName: "Zack Reading", email: "zack@carpentry.example", asanaGid: null, active: true },
  { id: "c-ken", fullName: "Kenneth Gonzalez", email: null, asanaGid: null, active: true },
  { id: "c-bz", fullName: "Brandon Zarbo", email: "brandon@jack.example", asanaGid: "g-bz", active: true },
  { id: "c-s1", fullName: "Steve Anderson", email: null, asanaGid: null, active: true },
  { id: "c-s2", fullName: "Steve  Anderson", email: null, asanaGid: null, active: true },
];
const ASANA: AsanaRef[] = [
  { gid: "g-jose", name: "José Alvarez", email: "finaltouch@example.com" },
  { gid: "g-zack", name: "zack@carpentry.example", email: "zack@carpentry.example" },
  { gid: "g-bk", name: "Brandon Kmiotek", email: "bk@realty.example" },
  { gid: "g-ken", name: "Kenneth Gonzalez", email: "mrg@example.com" },
  { gid: "g-connor", name: "Connor Swofford", email: null },
];

let n = 0;
function row(over: Partial<LegacyRow> & { assigneeName: string }): LegacyRow {
  return { id: `t${++n}`, title: "Job", status: "OPEN", assigneeEmail: null, asanaId: null, asanaSyncedAt: null, ...over };
}
const SYNCED = { asanaId: "a1", asanaSyncedAt: new Date("2026-10-24T14:00:00Z") };
const decisionOf = (rows: LegacyRow[], opts: Parameters<typeof planLegacyLinks>[3] = {}, asana: AsanaRef[] = ASANA) =>
  planLegacyLinks(rows, { users: USERS, contacts: CONTACTS }, asana, opts).rows.map((r) => r.decision);

test("asanaPersonFor: by email first, then the exact name; never a guess between two", () => {
  const people = asanaPeopleOf([...ASANA, null, { gid: "g-jose", name: null, email: null }]);
  assert.equal(people.length, 5, "one entry per Asana person");
  assert.equal(asanaPersonFor("José Alvarez", "finaltouch@example.com", people)?.gid, "g-jose");
  assert.equal(asanaPersonFor("zack@carpentry.example", null, people)?.gid, "g-zack", "the CSV put his address in the name");
  assert.equal(asanaPersonFor("Jose  Alvarez", null, people)?.gid, "g-jose", "accents and spacing aside, the same name");
  assert.equal(asanaPersonFor("Jose", null, people), null);
  const twins = asanaPeopleOf([...ASANA, { gid: "g-bk2", name: "Brandon Kmiotek", email: null }]);
  assert.equal(asanaPersonFor("Brandon Kmiotek", null, twins), null);
});

test("links by the Asana id saved on the contact, though the CSV email differs from the contact's", () => {
  const [d] = decisionOf([row({ assigneeName: "José Alvarez", assigneeEmail: "finaltouch@example.com", ...SYNCED })]);
  assert.deepEqual(d, { kind: "link", assignee: { contactId: "c-jose" }, to: "Jose Alvarez", via: "asanaGid" });
});

test("links by email, including an address standing in for the name; and staff by their user", () => {
  const [zack, connor] = decisionOf([row({ assigneeName: "zack@carpentry.example" }), row({ assigneeName: "Connor Swofford" })]);
  assert.deepEqual(zack, { kind: "link", assignee: { contactId: "c-zack" }, to: "Zack Reading", via: "email" });
  assert.deepEqual(connor, { kind: "link", assignee: { userId: "u-connor" }, to: "Connor Swofford", via: "asanaGid" });
});

test("without a snapshot it still links by email, but a contact linked to Asana isn't matched by name alone", () => {
  const [zack, jose] = decisionOf([row({ assigneeName: "zack@carpentry.example" }), row({ assigneeName: "José Alvarez", assigneeEmail: "finaltouch@example.com" })], {}, []);
  assert.equal(zack.kind, "link");
  assert.equal(jose.kind, "leave");
});

test("a name-only match waits for Connor: people.json or --accept-name-matches", () => {
  const rows = [row({ assigneeName: "Kenneth Gonzalez", assigneeEmail: "mrg@example.com" })];
  const [waiting] = decisionOf(rows);
  assert.equal(waiting.kind, "leave");
  assert.match(waiting.kind === "leave" ? waiting.reason : "", /by name only/);
  assert.deepEqual(decisionOf(rows, { acceptNameMatches: true })[0], { kind: "link", assignee: { contactId: "c-ken" }, to: "Kenneth Gonzalez", via: "name" });
  assert.deepEqual(decisionOf(rows, { overrides: { "g-ken": { contactId: "c-ken" } } })[0], {
    kind: "link",
    assignee: { contactId: "c-ken" },
    to: "Kenneth Gonzalez",
    via: "override",
  });
});

test("no contact for the person: left with the reason, never guessed onto someone with the same first name", () => {
  const [d] = decisionOf([row({ assigneeName: "Brandon Kmiotek", assigneeEmail: "bk@realty.example", ...SYNCED })]);
  assert.equal(d.kind, "leave");
  assert.match(d.kind === "leave" ? d.reason : "", /^no match/);
  // Connor can still point him at a contact, or at no one.
  assert.deepEqual(decisionOf([row({ assigneeName: "Brandon Kmiotek", assigneeEmail: "bk@realty.example" })], { overrides: { "g-bk": { none: true } } })[0], {
    kind: "leave",
    reason: "people.json says no one",
  });
});

test("two contacts with the same name: nobody", () => {
  const [d] = decisionOf([row({ assigneeName: "Steve Anderson" })], { acceptNameMatches: true }, []);
  assert.equal(d.kind, "leave");
  assert.match(d.kind === "leave" ? d.reason : "", /^ambiguous/);
});

test("closed tasks and CSV rows the load hasn't reconciled are left alone, whoever they name", () => {
  const [closed, csv] = decisionOf([
    row({ assigneeName: "zack@carpentry.example", status: "DONE" }),
    row({ assigneeName: "zack@carpentry.example", asanaId: "a2", asanaSyncedAt: null }),
  ]);
  assert.equal(closed.kind, "leave");
  assert.match(closed.kind === "leave" ? closed.reason : "", /D25/);
  assert.equal(csv.kind, "leave");
  assert.match(csv.kind === "leave" ? csv.reason : "", /Asana load/);
});

test("the report counts open and closed tasks per name, open first", () => {
  const plan = planLegacyLinks(
    [
      row({ assigneeName: "Brandon Kmiotek", status: "DONE" }),
      row({ assigneeName: "zack@carpentry.example" }),
      row({ assigneeName: "zack@carpentry.example", status: "DONE" }),
      row({ assigneeName: "Brandon Kmiotek", status: "CANCELED" }),
    ],
    { users: USERS, contacts: CONTACTS },
    ASANA,
  );
  assert.deepEqual(
    plan.people.map((p) => [p.name, p.open, p.closed]),
    [
      ["zack@carpentry.example", 1, 1],
      ["Brandon Kmiotek", 0, 2],
    ],
  );
});
