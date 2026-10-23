import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { STAFF_PATH_HEADER, STAFF_SECTIONS } from "./lib/next-path";
import { PORTAL_PATH_HEADER } from "./lib/portal/next-path";
import { config, proxy } from "./proxy";

const ORIGIN = "https://hgcapitalpartners.com";

/** The request header the proxy hands the page (NextResponse.next's override encoding), or null. */
function passedOn(res: Response, name: string): string | null {
  const overridden = (res.headers.get("x-middleware-override-headers") ?? "").split(",");
  return overridden.includes(name) ? res.headers.get(`x-middleware-request-${name}`) : null;
}

test("a staff page gets its own path and query, whatever the client sent", () => {
  const res = proxy(new NextRequest(`${ORIGIN}/tasks/abc?x=1`, { headers: { [STAFF_PATH_HEADER]: "//evil.com" } }));
  assert.equal(passedOn(res, STAFF_PATH_HEADER), "/tasks/abc?x=1");
  assert.equal(passedOn(res, PORTAL_PATH_HEADER), null);
  assert.equal(res.headers.get("x-middleware-rewrite"), null);
});

test("a portal page still gets the portal header, and only that", () => {
  const res = proxy(new NextRequest(`${ORIGIN}/p/jobs/abc`, { headers: { [PORTAL_PATH_HEADER]: "/p/evil" } }));
  assert.equal(passedOn(res, PORTAL_PATH_HEADER), "/p/jobs/abc");
  assert.equal(passedOn(res, STAFF_PATH_HEADER), null);
});

test("/ is unchanged: the public page when signed out, the dashboard with a cookie", () => {
  const out = proxy(new NextRequest(`${ORIGIN}/`));
  assert.equal(out.headers.get("x-middleware-rewrite"), `${ORIGIN}/welcome`);
  // A forged path header with a cookie is overwritten too; "/" means no return page.
  const signedIn = proxy(new NextRequest(`${ORIGIN}/`, { headers: { cookie: "hgos_session=x", [STAFF_PATH_HEADER]: "/deals/spoof" } }));
  assert.equal(signedIn.headers.get("x-middleware-rewrite"), null);
  assert.equal(passedOn(signedIn, STAFF_PATH_HEADER), "/");
});

test("the matcher covers every staff section, and nothing else but / and the portal", () => {
  const sections = STAFF_SECTIONS.map((s) => `/${s}/:path*`);
  assert.deepEqual([...config.matcher].sort(), ["/", "/p", "/p/:path*", ...sections].sort());
});
