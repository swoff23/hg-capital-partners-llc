import test from "node:test";
import assert from "node:assert/strict";
import type { Event } from "@sentry/browser";
import { DATA_COLLECTION, areaOfPath, areaOfRoute, kindOfArea, scrubBreadcrumb, scrubEvent, scrubExtra, scrubText } from "./error-report";

// One test per rule in docs/specs/error-alerts.md, Q4 and Q17.

test("a one-tap job link's token never leaves, wherever the address appears", () => {
  assert.equal(scrubText("/j/abcDEF123_-xyz"), "/j/[token]");
  assert.equal(scrubText("https://hgcapitalpartners.com/j/abcDEF123/calendar?x=1"), "https://hgcapitalpartners.com/j/[token]/calendar?x=1");
  assert.equal(scrubText("GET /j/[token]"), "GET /j/[token]", "an already scrubbed path stays as it is");
  assert.equal(scrubText("Failed for /j/tok123 and /j/tok456"), "Failed for /j/[token] and /j/[token]");
});

test("a token, an OAuth code or a secret in a query value is redacted; other values stay", () => {
  assert.equal(scrubText("/login/reset?token=s3cret&next=%2Ftasks"), "/login/reset?token=[redacted]&next=%2Ftasks");
  assert.equal(scrubText("/api/quickbooks/callback?code=AB12&state=xyz&realmId=9"), "/api/quickbooks/callback?code=[redacted]&state=[redacted]&realmId=9");
  assert.equal(scrubText("/api/health?TOKEN=abc"), "/api/health?TOKEN=[redacted]");
  assert.equal(scrubText("/tasks?status=open"), "/tasks?status=open");
});

test("extra fields pass only through the allowlist: IDs, counts and kinds", () => {
  assert.deepEqual(
    scrubExtra({
      taskId: "t1",
      attachmentId: "a1",
      count: 3,
      trigger: "CRON",
      sentToday: 100,
      subject: "Leak at 12 Main St for Dana",
      pathname: "tasks/t1/dana-lease.pdf",
      paths: ["a", "b"],
      notes: "lockbox 4321",
      email: "dana@example.com",
    }),
    { taskId: "t1", attachmentId: "a1", count: 3, trigger: "CRON", sentToday: 100 },
  );
  assert.equal(scrubExtra({ subject: "x" }), undefined, "nothing allowed leaves no extra at all");
  assert.deepEqual(scrubExtra({ runId: "see /j/tok" }), { runId: "see /j/[token]" }, "allowed strings are scrubbed too");
  assert.deepEqual(scrubExtra({ taskId: { nested: "object" } }), undefined, "only plain values");
});

test("a request keeps only its scrubbed address, method and user agent", () => {
  const event = scrubEvent({
    request: {
      url: "https://hgcapitalpartners.com/j/tok123?token=abc",
      method: "POST",
      data: { notes: "lockbox 4321" },
      cookies: { hgos_session: "signed" },
      query_string: "token=abc",
      headers: { "user-agent": "Safari", cookie: "hgos_session=signed", referer: "https://hgcapitalpartners.com/j/tok123", "x-forwarded-for": "1.2.3.4" },
      env: { REMOTE_ADDR: "1.2.3.4" },
    },
  } as Event);
  assert.deepEqual(event.request, { url: "https://hgcapitalpartners.com/j/[token]?token=[redacted]", method: "POST", headers: { "User-Agent": "Safari" } });
});

test("the user is reduced to an ID, and no IP address leaves", () => {
  assert.deepEqual(scrubEvent({ user: { id: "u1", email: "dana@example.com", username: "Dana", ip_address: "1.2.3.4" } } as Event).user, { id: "u1" });
  assert.equal(scrubEvent({ user: { email: "dana@example.com", ip_address: "{{auto}}" } } as Event).user, undefined);
});

test("messages, exception text, route names, tags and contexts are scrubbed; local variables are dropped", () => {
  const event = scrubEvent({
    message: "Failed /j/tok1",
    transaction: "GET /j/tok2",
    tags: { url: "/login/reset?token=abc", area: "portal" },
    contexts: { nextjs: { request_path: "/j/tok3?token=x", route_type: "route" } },
    exception: { values: [{ type: "Error", value: "fetch /j/tok4 failed", stacktrace: { frames: [{ filename: "a.js", vars: { code: "4321" } }] } }] },
  } as Event);
  assert.equal(event.message, "Failed /j/[token]");
  assert.equal(event.transaction, "GET /j/[token]");
  assert.deepEqual(event.tags, { url: "/login/reset?token=[redacted]", area: "portal" });
  assert.deepEqual(event.contexts, { nextjs: { request_path: "/j/[token]?token=[redacted]", route_type: "route" } });
  assert.equal(event.exception?.values?.[0].value, "fetch /j/[token] failed");
  assert.equal(event.exception?.values?.[0].stacktrace?.frames?.[0].vars, undefined);
});

test("console breadcrumbs are dropped: they carry our own log lines", () => {
  assert.equal(scrubBreadcrumb({ category: "console", message: '{"scope":"email:send","subject":"Dana"}' }), null);
});

test("a click keeps its tags and classes, not its labels; a request keeps only its address, method and status", () => {
  assert.deepEqual(scrubBreadcrumb({ category: "ui.click", message: 'button.btn[aria-label="Call Dana Smith"] > span' }), {
    category: "ui.click",
    message: "button.btn > span",
  });
  assert.deepEqual(
    scrubBreadcrumb({ category: "fetch", data: { url: "/j/tok1?token=abc", method: "GET", status_code: 500, request_body_size: 10, body: "x" } }),
    { category: "fetch", data: { url: "/j/[token]?token=[redacted]", method: "GET", status_code: 500 } },
  );
  assert.deepEqual(scrubBreadcrumb({ category: "navigation", data: { from: "/j/tok1", to: "/p/jobs/1" } }), {
    category: "navigation",
    data: { from: "/j/[token]", to: "/p/jobs/1" },
  });
});

test("breadcrumbs already on an event are scrubbed the same way", () => {
  const event = scrubEvent({ breadcrumbs: [{ category: "console", message: "x" }, { category: "navigation", data: { to: "/j/tok" } }] } as Event);
  assert.deepEqual(event.breadcrumbs, [{ category: "navigation", data: { to: "/j/[token]" } }]);
});

test("the SDK itself collects no cookies, bodies, query values, user info or local variables", () => {
  assert.equal(DATA_COLLECTION.userInfo, false);
  assert.equal(DATA_COLLECTION.cookies, false);
  assert.deepEqual(DATA_COLLECTION.httpBodies, []);
  assert.equal(DATA_COLLECTION.urlQueryParams, false);
  assert.equal(DATA_COLLECTION.databaseQueryData, false);
  assert.equal(DATA_COLLECTION.stackFrameVariables, false);
  assert.deepEqual(DATA_COLLECTION.httpHeaders, { request: { allow: ["user-agent"] }, response: false });
});

test("the area comes from the address, and `/` is left open", () => {
  assert.equal(areaOfPath("/p/jobs/abc"), "portal");
  assert.equal(areaOfPath("/p"), "portal");
  assert.equal(areaOfPath("/j/tok"), "portal");
  assert.equal(areaOfPath("/login/reset?token=x"), "sign-in");
  assert.equal(areaOfPath("/residents/moving-in"), "public");
  assert.equal(areaOfPath("/rentals"), "public");
  assert.equal(areaOfPath("/welcome"), "public");
  assert.equal(areaOfPath("/api/health"), "api");
  assert.equal(areaOfPath("/tasks/abc"), "staff");
  assert.equal(areaOfPath("/properties"), "staff");
  assert.equal(areaOfPath("/pipeline"), "staff", "a path that only starts with /p is still staff");
  assert.equal(areaOfPath("/"), null);
});

test("on the server the route names the area, as Next 16.3 gives it (no group) or with one", () => {
  assert.equal(areaOfRoute("/residents/moving-in"), "public");
  assert.equal(areaOfRoute("/tasks/[id]"), "staff");
  assert.equal(areaOfRoute("/"), null, "without a group, `/` stays untagged");
  assert.equal(areaOfRoute("/(marketing)/page"), "public");
  assert.equal(areaOfRoute("/(app)/page"), "staff");
  assert.equal(areaOfRoute("/app/(app)/tasks/[id]/page"), "staff");
  assert.equal(areaOfRoute("/(portal)/p/jobs/[id]/page"), "portal");
  assert.equal(areaOfRoute("/j/[token]/route"), "portal");
  assert.equal(areaOfRoute("/api/cron/notifications/route"), "api");
  assert.equal(areaOfRoute("/login/page"), "sign-in");
});

test("staff or contractor follows the area", () => {
  assert.equal(kindOfArea("staff"), "staff");
  assert.equal(kindOfArea("portal"), "contractor");
  assert.equal(kindOfArea("public"), null);
  assert.equal(kindOfArea(null), null);
});
