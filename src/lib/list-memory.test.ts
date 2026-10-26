import test from "node:test";
import assert from "node:assert/strict";
import {
  LIST_COOKIES,
  LIST_KEYS,
  cleanQuery,
  encodeListCookie,
  joinFacet,
  listCookieString,
  listHref,
  parseFacet,
  plainListHrefs,
  readListHrefs,
} from "./list-memory";

/** A cookie jar the way Next hands one to the layout: values already decoded. */
function jar(values: Record<string, string>) {
  return { get: (name: string) => (name in values ? { value: values[name] } : undefined) };
}

test("defaults: no cookie leaves every list at its plain path", () => {
  assert.deepEqual(readListHrefs(jar({})), plainListHrefs());
  assert.deepEqual(plainListHrefs(), {
    tasks: "/tasks",
    deals: "/deals",
    properties: "/properties",
    contractors: "/contractors",
  });
});

test("defaults: an empty cookie is the default too, which is what Clear filters writes", () => {
  assert.deepEqual(readListHrefs(jar({ [LIST_COOKIES.tasks]: "" })), plainListHrefs());
  assert.equal(listHref("tasks", ""), "/tasks");
  assert.equal(listHref("tasks", "?"), "/tasks");
  assert.equal(listHref("tasks", null), "/tasks");
});

test("each list reads its own cookie", () => {
  const hrefs = readListHrefs(
    jar({ [LIST_COOKIES.tasks]: "status=done", [LIST_COOKIES.deals]: "status=all&q=prospect" }),
  );
  assert.equal(hrefs.tasks, "/tasks?status=done");
  assert.equal(hrefs.deals, "/deals?status=all&q=prospect");
  assert.equal(hrefs.properties, "/properties");
  assert.equal(hrefs.contractors, "/contractors");
});

test("cookie round trip: what the filter bar writes is what the layout reads", () => {
  const query = "owner=u%3Aabc%2Cc%3Adef&property=none&repeats=1";
  const cookie = listCookieString("tasks", query);
  const [pair] = cookie.split(";");
  const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
  assert.equal(name, LIST_COOKIES.tasks);
  // The browser stores it URL-encoded; Next decodes it once on the server.
  assert.equal(value, encodeListCookie(query));
  assert.ok(!/[,;\s]/.test(value), "a cookie value can't hold a comma, a semicolon or a space");
  const hrefs = readListHrefs(jar({ [name]: decodeURIComponent(value) }));
  assert.equal(hrefs.tasks, `/tasks?${query}`);
  assert.match(cookie, /; path=\/; max-age=31536000; samesite=lax$/);
});

test("cleanQuery keeps only a well-formed query and drops a leading question mark", () => {
  assert.equal(cleanQuery("?status=done"), "status=done");
  assert.equal(cleanQuery("status=done&q=a b"), "status=done&q=a+b");
  assert.equal(cleanQuery("   "), "");
  assert.equal(cleanQuery("x".repeat(2000)), "", "a query too long for a cookie is forgotten");
});

test("every list has a distinct cookie", () => {
  const names = LIST_KEYS.map((k) => LIST_COOKIES[k]);
  assert.equal(new Set(names).size, LIST_KEYS.length);
});

test("facets: several picks ride in one comma-joined param", () => {
  assert.equal(joinFacet(["u:abc", "c:def"]), "u:abc,c:def");
  assert.deepEqual(parseFacet("u:abc,c:def"), ["u:abc", "c:def"]);
  assert.deepEqual(parseFacet(""), []);
  assert.deepEqual(parseFacet(null), []);
  assert.deepEqual(parseFacet("a,,b,a"), ["a", "b"], "empty parts and repeats drop");
});

test("facets: a value with a comma or a percent sign survives the round trip", () => {
  const values = ["n:Smith, Bob", "n:100% Plumbing", "n:%2C already escaped", "none"];
  const joined = joinFacet(values);
  assert.equal(joined.split(",").length, values.length, "only the separators are commas");
  assert.deepEqual(parseFacet(joined), values);
});

test("facets: a joined param survives a trip through the URL", () => {
  const params = new URLSearchParams();
  params.set("owner", joinFacet(["n:Smith, Bob", "u:x"]));
  const back = new URLSearchParams(params.toString());
  assert.deepEqual(parseFacet(back.get("owner")), ["n:Smith, Bob", "u:x"]);
});
