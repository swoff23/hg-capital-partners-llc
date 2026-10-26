import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GO_TO,
  commandsByWordStart,
  createCommands,
  hrefPath,
  leadingCommands,
  pageContext,
  type Command,
} from "./commands";

/** The URL patterns of the staff app: every page.tsx under src/app/(app), route groups left out, [id] kept. */
function appPages(): string[] {
  const root = path.join(process.cwd(), "src", "app", "(app)");
  const found: string[] = [];
  const walk = (dir: string, segments: string[]) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === "page.tsx")) found.push("/" + segments.join("/"));
    for (const e of entries) {
      // Private folders and parallel-route slots hold no page of their own.
      if (!e.isDirectory() || e.name.startsWith("_") || e.name.startsWith("@")) continue;
      const hidden = e.name.startsWith("(") && e.name.endsWith(")");
      walk(path.join(dir, e.name), hidden ? segments : [...segments, e.name]);
    }
  };
  walk(root, []);
  return found;
}

const pages = appPages();

/** Whether a concrete path is one of the pages: a dynamic segment matches any one segment. */
function isPage(p: string): boolean {
  const parts = p.split("/").filter(Boolean);
  return pages.some((pattern) => {
    const want = pattern.split("/").filter(Boolean);
    // "new" is the create form's own page, never a record's id.
    return want.length === parts.length && want.every((w, i) => (w.startsWith("[") ? parts[i] !== "new" : w === parts[i]));
  });
}

const everyCommand = (): Command[] => [
  ...GO_TO,
  ...createCommands(null),
  ...createCommands({ kind: "property", id: "p1" }, "767 Prospect Ave"),
  ...createCommands({ kind: "deal", id: "d1" }, "99 Prospect Ave"),
];

test("every Go to and Create href is a page under src/app/(app)", () => {
  assert.ok(pages.includes("/tasks/new") && pages.includes("/financials"), "the page scan found the app's pages");
  const missing = everyCommand()
    .map((c) => hrefPath(c.href))
    .filter((p) => !isPage(p));
  assert.deepEqual([...new Set(missing)], []);
});

test("a path that is no page doesn't pass the check above", () => {
  assert.equal(isPage("/not-a-page"), false);
  assert.equal(isPage("/financials/rent-roll"), true);
  assert.equal(isPage("/properties/abc123"), true);
});

test("ids are unique in each list, and a tab names its section", () => {
  for (const list of [GO_TO, createCommands(null), createCommands({ kind: "property", id: "p" }), createCommands({ kind: "deal", id: "d" })]) {
    assert.equal(new Set(list.map((c) => c.id)).size, list.length);
  }
  const rentRoll = GO_TO.find((c) => c.label === "Rent roll");
  assert.equal(rentRoll?.parent, "Financials");
  assert.deepEqual(
    GO_TO.map((c) => c.label),
    ["Home", "Deals", "Portfolio", "Financials", "Rent roll", "Settings", "Tasks", "Contractors", "Playbooks", "Settings", "Move-in form", "Storage"],
  );
});

test("pageContext reads the record page from the path, never the create forms", () => {
  assert.deepEqual(pageContext("/properties/abc"), { kind: "property", id: "abc" });
  assert.deepEqual(pageContext("/deals/xyz/"), { kind: "deal", id: "xyz" });
  assert.equal(pageContext("/properties/new"), null);
  assert.equal(pageContext("/deals/new"), null);
  assert.equal(pageContext("/tasks"), null);
  assert.equal(pageContext("/properties"), null);
  assert.equal(pageContext("/properties/abc/edit"), null);
});

test("createCommands: four everywhere, and the record's own lead on its page", () => {
  assert.deepEqual(
    createCommands(null).map((c) => c.label),
    ["New task", "New deal", "New property", "New contractor"],
  );

  const onProperty = createCommands({ kind: "property", id: "p 1" }, "767 Prospect Ave");
  assert.deepEqual(onProperty.map((c) => c.label), ["New task", "Apply playbook", "New deal", "New property", "New contractor"]);
  assert.equal(onProperty[0].href, "/tasks/new?propertyId=p%201");
  assert.equal(onProperty[1].href, "/templates?property=p%201");
  assert.equal(onProperty[0].place, "767 Prospect Ave");
  assert.equal(onProperty[1].place, "767 Prospect Ave");

  const onDeal = createCommands({ kind: "deal", id: "d1" }, "99 Prospect Ave");
  assert.deepEqual(onDeal.map((c) => c.label), ["New task", "New deal", "New property", "New contractor"]);
  assert.equal(onDeal[0].href, "/tasks/new?dealId=d1");
  assert.equal(onDeal[0].place, "99 Prospect Ave");
});

test("createCommands: without the address yet, the row says which record", () => {
  assert.equal(createCommands({ kind: "property", id: "p1" })[0].place, "This property");
  assert.equal(createCommands({ kind: "deal", id: "d1" })[0].place, "This deal");
});

test("one character keeps the commands with a word that starts with it", () => {
  const all = [...createCommands(null), ...GO_TO];
  const labels = (q: string) => commandsByWordStart(all, q).map((c) => c.label);
  assert.deepEqual(labels("p"), ["New property", "Portfolio", "Playbooks"]);
  assert.ok(labels("r").includes("Rent roll"));
  assert.ok(labels("f").includes("Financials"), "a tab is found by its section too");
  assert.equal(labels("").length, all.length);
  assert.deepEqual(labels("z"), []);
});

test("leadingCommands: those whose label starts with the typed words, Create first, three at most", () => {
  const all = [...GO_TO, ...createCommands(null)];
  assert.deepEqual(leadingCommands(all, "rent").map((c) => c.label), ["Rent roll"]);
  assert.deepEqual(leadingCommands(all, "new").map((c) => c.label), ["New task", "New deal", "New property"]);
  assert.deepEqual(leadingCommands(all, "task").map((c) => c.label), ["Tasks"]);
  assert.deepEqual(leadingCommands(all, "r"), [], "a short query leads nothing");
  assert.deepEqual(leadingCommands(all, "elmwood"), []);
  assert.ok(leadingCommands(all, "set").length <= 3);
  assert.deepEqual(leadingCommands(all, "SETT").map((c) => c.label), ["Settings", "Settings"]);
  // The section's own page before its tab of the same name.
  assert.deepEqual(
    leadingCommands(all, "settings").map((c) => c.href),
    ["/settings", "/financials/settings"],
  );
});
