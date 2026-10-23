import test from "node:test";
import assert from "node:assert/strict";
import { PORTAL_COOKIE_HTTP, PORTAL_COOKIE_HTTPS, isHttpsRequest, portalCookie } from "./cookie";

test("HTTPS gets the __Host- name with Secure", () => {
  assert.deepEqual(portalCookie(true), {
    name: "__Host-hg_portal",
    options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 },
  });
});

test("local http gets the plain name without Secure", () => {
  const c = portalCookie(false);
  assert.equal(c.name, PORTAL_COOKIE_HTTP);
  assert.equal(c.options.secure, false);
  assert.equal(c.options.httpOnly, true);
  assert.equal(c.options.path, "/");
  assert.equal(c.options.sameSite, "lax");
});

test("never the staff cookie's name", () => {
  for (const name of [PORTAL_COOKIE_HTTP, PORTAL_COOKIE_HTTPS]) assert.notEqual(name, "hgos_session");
});

test("HTTPS is detected from VERCEL_ENV or x-forwarded-proto", () => {
  assert.equal(isHttpsRequest({}), false);
  assert.equal(isHttpsRequest({ forwardedProto: "http" }), false);
  assert.equal(isHttpsRequest({ forwardedProto: "https" }), true);
  assert.equal(isHttpsRequest({ forwardedProto: "HTTPS, http" }), true, "first hop wins");
  assert.equal(isHttpsRequest({ forwardedProto: "http, https" }), false);
  assert.equal(isHttpsRequest({ vercelEnv: "preview", forwardedProto: null }), true);
  assert.equal(isHttpsRequest({ vercelEnv: "", forwardedProto: "http" }), false);
});
