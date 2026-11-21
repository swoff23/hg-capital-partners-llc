import test from "node:test";
import assert from "node:assert/strict";
import { inScope, noPicks, pickState, prunePicks, setPicks, togglePick } from "./picks";

const order = ["a", "b", "c", "d", "e"];
const ids = (p: { ids: ReadonlySet<string> }) => [...p.ids].sort();

test("Cmd-click picks a row, and again unpicks it", () => {
  const one = togglePick(noPicks("s"), order, "b");
  assert.deepEqual(ids(one), ["b"]);
  assert.deepEqual(ids(togglePick(one, order, "b")), []);
});

test("Shift-click picks every row from the anchor, in list order, either direction", () => {
  const start = togglePick(noPicks("s"), order, "b");
  assert.deepEqual(ids(togglePick(start, order, "d", true)), ["b", "c", "d"]);
  const fromEnd = togglePick(noPicks("s"), order, "e");
  assert.deepEqual(ids(togglePick(fromEnd, order, "c", true)), ["c", "d", "e"]);
});

test("Shift-click on a picked row unpicks the range, as Finder does", () => {
  let p = togglePick(noPicks("s"), order, "a");
  p = togglePick(p, order, "e", true);
  assert.deepEqual(ids(p), ["a", "b", "c", "d", "e"]);
  p = togglePick(p, order, "c");
  p = togglePick(p, order, "c");
  p = togglePick(p, order, "e", true);
  assert.deepEqual(ids(p), ["a", "b"], "c is picked again by the second click, so c to e follow e, which was picked: they all go");
});

test("Shift-click with no anchor on the list picks just that row", () => {
  assert.deepEqual(ids(togglePick(noPicks("s"), order, "c", true)), ["c"]);
  // The anchor left the list (its task was finished in Open): the same.
  const p = { ...noPicks("s"), anchor: "gone" };
  assert.deepEqual(ids(togglePick(p, order, "c", true)), ["c"]);
});

test("a heading's Select and Deselect pick and unpick its rows, leaving the rest", () => {
  let p = togglePick(noPicks("s"), order, "a");
  p = setPicks(p, ["c", "d"], true);
  assert.deepEqual(ids(p), ["a", "c", "d"]);
  assert.equal(pickState(p.ids, ["c", "d"]), "all");
  assert.equal(pickState(p.ids, ["d", "e"]), "some");
  assert.equal(pickState(p.ids, ["e"]), "none");
  assert.equal(pickState(p.ids, []), "none");
  assert.deepEqual(ids(setPicks(p, ["c", "d"], false)), ["a"]);
});

test("a new view, filter or search starts with none, and going back doesn't bring old picks back", () => {
  const picked = togglePick(noPicks("open"), order, "a");
  const done = inScope(picked, "done");
  assert.deepEqual([done.scope, ids(done), done.anchor], ["done", [], null]);
  // The provider stores what inScope returns, so returning to "open" finds none.
  assert.deepEqual(ids(inScope(done, "open")), []);
  assert.equal(inScope(picked, "open"), picked, "the same scope keeps its picks");
});

test("a picked row that leaves the list is dropped, so it comes back unpicked", () => {
  const p = setPicks(noPicks("s"), ["a", "b", "c"], true);
  const pruned = prunePicks(p, new Set(["a", "c", "d"]));
  assert.deepEqual(ids(pruned), ["a", "c"]);
  assert.equal(prunePicks(pruned, new Set(["a", "c", "d"])), pruned, "nothing left: the same picks");
});
