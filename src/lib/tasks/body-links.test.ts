import test from "node:test";
import assert from "node:assert/strict";
import { asanaTaskGids, bodySegments, taskIdsIn } from "./body-links";

const plain = (text: string) => ({ type: "text" as const, text });

test("a body with no links is one piece of text, with its line breaks", () => {
  assert.deepEqual(bodySegments("Doors are in.\nTrim next."), [plain("Doors are in.\nTrim next.")]);
  assert.deepEqual(bodySegments(""), []);
});

test("https addresses link out, without the punctuation that ends the sentence", () => {
  assert.deepEqual(bodySegments("See https://example.com/doors, then call."), [
    plain("See "),
    { type: "link", href: "https://example.com/doors", text: "https://example.com/doors" },
    plain(", then call."),
  ]);
  assert.deepEqual(bodySegments("(https://example.com/a)."), [plain("("), { type: "link", href: "https://example.com/a", text: "https://example.com/a" }, plain(").")]);
  // A bracket the address opened stays with it.
  assert.deepEqual(bodySegments("https://en.wikipedia.org/wiki/Door_(furniture)!"), [
    { type: "link", href: "https://en.wikipedia.org/wiki/Door_(furniture)", text: "https://en.wikipedia.org/wiki/Door_(furniture)" },
    plain("!"),
  ]);
  // Only https: anything else stays text.
  assert.deepEqual(bodySegments("http://example.com and javascript:alert(1)"), [plain("http://example.com and javascript:alert(1)")]);
  assert.deepEqual(bodySegments("https://"), [plain("https://")]);
});

test("a /tasks/<id> path links to the task, by title when the page knows it", () => {
  assert.deepEqual(bodySegments("Same as /tasks/cmabcdefgh12345.", { taskTitles: { cmabcdefgh12345: "Fix front steps" } }), [
    plain("Same as "),
    { type: "task", href: "/tasks/cmabcdefgh12345", text: "Fix front steps" },
    plain("."),
  ]);
  assert.deepEqual(bodySegments("See /tasks/cmabcdefgh12345"), [plain("See "), { type: "task", href: "/tasks/cmabcdefgh12345", text: "a task" }]);
  // Not glued to other text or a longer path.
  assert.deepEqual(bodySegments("a/tasks/cmabcdefgh12345 and /tasks/short"), [plain("a/tasks/cmabcdefgh12345 and /tasks/short")]);
  assert.deepEqual(taskIdsIn("one /tasks/cmabcdefgh12345 two /tasks/cmzzzzzzzz9999 /tasks/cmabcdefgh12345"), ["cmabcdefgh12345", "cmzzzzzzzz9999"]);
});

test("an Asana task link goes to the imported task, or reads as not imported", () => {
  const url = "https://app.asana.com/0/1200000000000001/1200000000000042";
  const ctx = { asanaTasks: { "1200000000000042": "cmabcdefgh12345" }, taskTitles: { cmabcdefgh12345: "Fix steps" } };
  assert.deepEqual(bodySegments(`Related: ${url}`, ctx), [plain("Related: "), { type: "task", href: "/tasks/cmabcdefgh12345", text: "Fix steps" }]);
  assert.deepEqual(bodySegments(`Related: ${url}`, { asanaTasks: { "1200000000000042": "cmabcdefgh12345" } }), [plain("Related: "), { type: "task", href: "/tasks/cmabcdefgh12345", text: "a task" }]);
  assert.deepEqual(bodySegments(`Related: ${url}.`), [plain("Related: Asana task (not imported).")]);
  // The newer address shape, with a query.
  const newer = "https://app.asana.com/1/10/project/11/task/1200000000000099?focus=true";
  assert.deepEqual(bodySegments(`${newer} done`), [plain("Asana task (not imported) done")]);
  assert.deepEqual(asanaTaskGids(`${url} and ${newer} and https://example.com/0/1/2`), ["1200000000000042", "1200000000000099"]);
});

test("an Asana profile link is the person's name when the import matched them, and gone when it didn't", () => {
  const url = "https://app.asana.com/0/profile/1200000000000777";
  assert.deepEqual(bodySegments(`Thanks ${url}!`, { asanaPeople: { "1200000000000777": "Rae Realtor" } }), [plain("Thanks Rae Realtor!")]);
  assert.deepEqual(bodySegments(`Thanks ${url}!`), [plain("Thanks !")]);
  assert.deepEqual(bodySegments("https://app.asana.com/1/10/profile/1200000000000777"), []);
});

test("in the portal only https addresses link: no tasks, no titles, no Asana names", () => {
  const ctx = {
    mode: "portal" as const,
    taskTitles: { cmabcdefgh12345: "Another contractor's job" },
    asanaTasks: { "1200000000000042": "cmabcdefgh12345" },
    asanaPeople: { "1200000000000777": "Rae Realtor" },
  };
  assert.deepEqual(bodySegments("See /tasks/cmabcdefgh12345 or https://example.com/a", ctx), [
    plain("See /tasks/cmabcdefgh12345 or "),
    { type: "link", href: "https://example.com/a", text: "https://example.com/a" },
  ]);
  assert.deepEqual(bodySegments("https://app.asana.com/0/1/1200000000000042", ctx), [plain("an Asana task")]);
  assert.deepEqual(bodySegments("with https://app.asana.com/0/profile/1200000000000777", ctx), [plain("with ")]);
  assert.ok(!JSON.stringify(bodySegments("/tasks/cmabcdefgh12345", ctx)).includes("Another contractor"));
});
