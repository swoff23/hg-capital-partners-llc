import test from "node:test";
import assert from "node:assert/strict";
import {
  KEEP_TYPING,
  LOAD_FAILED,
  RECENT_HINT,
  SIGNED_OUT_LINE,
  addDealHref,
  addDealLabel,
  bandLabel,
  composePanel,
  openInEntry,
  rowsByWordStart,
  seeAllLabel,
  seeElsewhereLabel,
  type PanelInput,
  type PanelView,
} from "./search-panel";
import type { SearchGroup, SearchResponse, SearchRow } from "./search-results";

const property = (id: string, title: string): SearchRow => ({
  type: "property",
  id,
  href: `/properties/${id}`,
  title,
  units: 4,
  owner: "HG Buffalo Holding 1 LLC",
  photoUrl: null,
});
const task = (id: string, title: string, place: string | null = "767 Prospect Ave"): SearchRow => ({
  type: "task",
  id,
  href: `/tasks/${id}`,
  title,
  status: "OPEN",
  due: null,
  overdue: false,
  place,
  assignee: null,
});
const deal = (id: string, title: string): SearchRow => ({ type: "deal", id, href: `/deals/${id}`, title, stage: "2 - Medium", asking: null });

const group = (type: SearchGroup["type"], rows: SearchRow[], total = rows.length): SearchGroup => ({ type, total, rows });
const ready = (...groups: SearchGroup[]): PanelInput["live"] => ({ status: "ready", response: { groups } as SearchResponse });

function compose(over: Partial<PanelInput> = {}): PanelView {
  return composePanel({
    q: "",
    scope: null,
    recent: { rows: [], loaded: true },
    live: { status: "idle", response: null },
    context: null,
    ...over,
  });
}

const titles = (v: PanelView) => v.groups.map((g) => g.title ?? g.id);
const labels = (v: PanelView) =>
  v.groups.flatMap((g) =>
    g.entries.map((e) =>
      e.kind === "row" ? e.row.title : e.kind === "command" ? e.command.label : e.kind === "all" || e.kind === "elsewhere" ? e.key : e.kind,
    ),
  );

test("empty: Recent, then Create, then Go to", () => {
  const view = compose({ recent: { rows: [task("t1", "Fix porch light"), property("p1", "767 Prospect Ave")], loaded: true } });
  assert.deepEqual(titles(view), ["Recent", "Create", "Go to"]);
  assert.deepEqual(labels(view).slice(0, 3), ["Fix porch light", "767 Prospect Ave", "New task"]);
  assert.equal(view.notice, null);
  assert.equal(view.skeleton, null);
});

test("empty with no recents says what is searchable, and Create and Go to stay", () => {
  const view = compose();
  assert.deepEqual(titles(view), ["Create", "Go to"]);
  assert.deepEqual(view.notice, { kind: "hint", text: RECENT_HINT });
});

test("empty on the first open: five skeleton rows hold Recent's place, Create and Go to are there at once", () => {
  const view = compose({ recent: { rows: [], loaded: false } });
  assert.deepEqual(view.skeleton, { rows: 5, title: "Recent" });
  assert.deepEqual(titles(view), ["Create", "Go to"]);
  assert.equal(view.notice, null);
});

test("on a property page Create leads with the property's rows, with its address from Recent", () => {
  const view = compose({
    context: { kind: "property", id: "p1" },
    recent: { rows: [property("p1", "767 Prospect Ave")], loaded: true },
  });
  const create = view.groups.find((g) => g.id === "create")!;
  const first = create.entries.map((e) => (e.kind === "command" ? [e.command.label, e.command.place, e.command.href] : null));
  assert.deepEqual(first.slice(0, 2), [
    ["New task", "767 Prospect Ave", "/tasks/new?propertyId=p1"],
    ["Apply playbook", "767 Prospect Ave", "/templates?property=p1"],
  ]);
});

test("one character: Recent and the commands whose words start with it", () => {
  const view = compose({ q: "p", recent: { rows: [property("p1", "767 Prospect Ave"), task("t1", "Fix porch light")], loaded: true } });
  assert.deepEqual(titles(view), ["Recent", "Create", "Go to"]);
  assert.deepEqual(labels(view), ["767 Prospect Ave", "Fix porch light", "New property", "Portfolio", "Playbooks"]);
  assert.equal(view.notice, null);
});

test("one character with nothing local to show asks for more", () => {
  const view = compose({ q: "z" });
  assert.deepEqual(view.groups, []);
  assert.deepEqual(view.notice, { kind: "empty", text: KEEP_TYPING });
});

test("rowsByWordStart: a word of the title or the words beside it", () => {
  const rows = [property("p1", "767 Prospect Ave"), task("t1", "Fix porch light", "99 Maple St")];
  assert.deepEqual(rowsByWordStart(rows, "m").map((r) => r.id), ["t1"]);
  assert.deepEqual(rowsByWordStart(rows, "hg").map((r) => r.id), ["p1"]);
  assert.deepEqual(rowsByWordStart(rows, "").length, 2);
});

test("results come in the fixed order, a group's See all only when there is more", () => {
  const view = compose({
    q: "prospect",
    live: ready(
      group("contractor", [{ type: "contractor", id: "c1", href: "/contractors/c1", title: "Ana Prospect", trade: null, company: null, active: true }]),
      group("task", [task("t1", "One"), task("t2", "Two"), task("t3", "Three"), task("t4", "Four")], 40),
      group("property", [property("p1", "767 Prospect Ave")]),
    ),
  });
  assert.deepEqual(titles(view), ["Properties", "Tasks", "Contractors"]);
  const tasks = view.groups.find((g) => g.id === "task")!;
  assert.deepEqual(tasks.entries.at(-1), { kind: "all", key: "all:task", type: "task", total: 40 });
  assert.equal(view.groups.find((g) => g.id === "property")!.entries.some((e) => e.kind === "all"), false);
  assert.equal(seeAllLabel("task", 40), "See all 40 tasks");
  assert.equal(view.announce, "6 results");
  assert.ok(view.groups.flatMap((g) => g.entries).every((e) => e.kind !== "row" || e.marked), "typed words are marked in results");
});

test("the scope band counts in the singular for one", () => {
  assert.equal(bandLabel("contractor", 1), "1 contractor");
  assert.equal(bandLabel("deal", 1), "1 deal");
  assert.equal(bandLabel("property", 1), "1 property");
  assert.equal(bandLabel("task", 34), "34 tasks");
  assert.equal(bandLabel("property", 2), "2 properties");
});

test("a command that starts with the query leads the list", () => {
  const view = compose({ q: "rent", live: ready(group("task", [task("t1", "Rent increase letters")])) });
  assert.deepEqual(titles(view), ["Go to", "Tasks"]);
  assert.deepEqual(labels(view).slice(0, 2), ["Rent roll", "Rent increase letters"]);
});

test("no match says so, naming what was typed", () => {
  const view = compose({ q: "elmwood", live: ready() });
  assert.deepEqual(view.groups, []);
  assert.deepEqual(view.notice, { kind: "empty", text: 'No matches for "elmwood".' });
  assert.equal(view.announce, 'No matches for "elmwood".');
});

test("an address that is no property or deal offers to become a deal", () => {
  const view = compose({ q: "12 Elmwood Ter", live: ready() });
  assert.deepEqual(view.notice, { kind: "empty", text: 'No matches for "12 Elmwood Ter".' });
  assert.deepEqual(view.groups.at(-1)?.entries, [
    { kind: "add", key: "add-deal", address: "12 Elmwood Ter", href: "/deals/new?address=12+Elmwood+Ter" },
  ]);
  assert.equal(addDealLabel("12 Elmwood Ter"), 'Add "12 Elmwood Ter" as a deal');
  assert.equal(addDealHref("5 O'Brien & Co St"), "/deals/new?address=5+O%27Brien+%26+Co+St");

  // Tasks matching doesn't make it a known address; a property or a deal does.
  assert.ok(compose({ q: "12 Elmwood", live: ready(group("task", [task("t", "Elmwood")])) }).groups.some((g) => g.id === "add"));
  assert.ok(!compose({ q: "12 Elmwood", live: ready(group("deal", [deal("d", "12 Elmwood Ter")])) }).groups.some((g) => g.id === "add"));
  assert.ok(!compose({ q: "elmwood", live: ready() }).groups.some((g) => g.id === "add"), "not shaped like an address");
});

test("narrowed to one type: its rows, the total in the band, and the list page under the same words", () => {
  const rows = Array.from({ length: 20 }, (_, i) => task(`t${i}`, `Task ${i}`));
  const view = compose({ q: "prospect", scope: "task", live: ready(group("task", rows, 40)) });
  assert.deepEqual(view.band, { total: 40 });
  assert.equal(view.groups.length, 1);
  const entries = view.groups[0].entries;
  assert.equal(entries.length, 21);
  assert.deepEqual(entries.at(-1), { kind: "open", key: "open:task", type: "task", href: "/tasks?q=prospect&status=all", label: "Open in Tasks" });
  assert.ok(entries.every((e) => e.kind !== "all"));
  assert.equal(view.announce, "40 results");
});

test("openInEntry: the lists that take the words, and Portfolio has none", () => {
  assert.deepEqual(openInEntry("deal", "prospect avenue"), { href: "/deals?q=prospect+avenue&status=all", label: "Open in Deals" });
  assert.deepEqual(openInEntry("contractor", "luis"), { href: "/contractors?q=luis", label: "Open in Contractors" });
  assert.equal(openInEntry("property", "prospect"), null);
});

test("a type with no match points to the ones that have some", () => {
  const view = compose({ q: "elmwood", scope: "task", live: ready(group("deal", [], 3), group("property", [], 1)) });
  assert.deepEqual(view.notice, { kind: "empty", text: 'No tasks match "elmwood".' });
  assert.deepEqual(
    view.groups[0].entries.map((e) => (e.kind === "elsewhere" ? seeElsewhereLabel(e.type, e.total) : e.kind)),
    ["See 1 property", "See 3 deals"],
  );
  assert.deepEqual(view.band, { total: 0 });
});

test("narrowed to a type with the text cleared: the way back stays, and the panel says to keep typing", () => {
  for (const q of ["", "p"]) {
    const view = compose({ q, scope: "deal" });
    assert.deepEqual(view.groups, []);
    assert.deepEqual(view.band, { total: null });
    assert.deepEqual(view.notice, { kind: "empty", text: "Keep typing to search deals." });
  }
});

test("the first request, with nothing on screen yet: three skeleton rows", () => {
  const view = compose({ q: "pro", live: { status: "idle", response: null } });
  assert.deepEqual(view.skeleton, { rows: 3 });
  assert.equal(view.notice, null);
});

test("a failed request clears the rows and keeps what needs no server", () => {
  const view = compose({
    q: "pro",
    recent: { rows: [property("p1", "767 Prospect Ave")], loaded: true },
    live: { status: "error", response: null },
  });
  assert.deepEqual(view.notice, { kind: "error", text: LOAD_FAILED });
  assert.deepEqual(titles(view), ["Recent", "Create"]);
  assert.deepEqual(labels(view), ["767 Prospect Ave", "New property"]);
  assert.equal(view.announce, LOAD_FAILED);
});

test("signed out clears the rows and offers Sign in", () => {
  const view = compose({ q: "pro", live: { status: "signed-out", response: null } });
  assert.deepEqual(view.notice, { kind: "signed-out", text: SIGNED_OUT_LINE });
  assert.equal(view.groups.some((g) => g.entries.some((e) => e.kind === "row")), false);
});

test("a failure while narrowed leaves the band and no rows", () => {
  const view = compose({ q: "pro", scope: "deal", live: { status: "error", response: null } });
  assert.deepEqual(view.groups, []);
  assert.deepEqual(view.band, { total: null });
});
