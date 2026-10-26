import test from "node:test";
import assert from "node:assert/strict";
import { countQuery } from "./list-count";
import { MAX_QUERY } from "./list-memory";

test("countQuery: a query a list would remember passes through unchanged", () => {
  assert.equal(countQuery.parse(""), "");
  assert.equal(countQuery.parse("status=done&owner=u%3Aabc"), "status=done&owner=u%3Aabc");
  assert.equal(countQuery.parse("q=".padEnd(MAX_QUERY, "a")).length, MAX_QUERY);
});

test("countQuery: a query past the limit, or not text, throws before anything is parsed", () => {
  assert.equal(MAX_QUERY, 1500);
  assert.throws(() => countQuery.parse("q=".padEnd(MAX_QUERY + 1, "a")));
  assert.throws(() => countQuery.parse(undefined));
  assert.throws(() => countQuery.parse(["status=done"]));
  assert.throws(() => countQuery.parse({ status: "done" }));
});
