import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NEXT_LENGTH,
  PORTAL_HOME,
  WELCOME_PASSWORD_PATH,
  afterPortalSignIn,
  portalReturnPath,
  safePortalPath,
  withNext,
} from "./next-path";

const GOOD = [
  "/p",
  "/p/",
  "/p/jobs/abc",
  "/p/jobs/abc?x=1",
  "/p?view=done",
  "/p/jobs/cmh2x9k0a0001qz8f3v7w1y2z",
  "/p/welcome/password?next=%2Fp%2Fjobs%2Fabc",
  "/p/jobs/abc%20def",
  "/p/jobs/%E2%9C%93",
];

const BAD = [
  // Not printable ASCII as given: Node would refuse it in a Location header.
  "/p/jobs/\u2713",
  "/p/ ",
  "/p/jobs/\u00e9",
  "/p/jobs/a b",
  "/p/jobs/\u2028",
  "//evil.com",
  "/p//evil",
  "/p//evil.com/x",
  "/\\evil",
  "/p\\evil",
  "/p/\\evil",
  "%2F%2Fevil",
  "%2F%2Fevil.com",
  "/p/%2F%2Fevil.com",
  "/p/%5Cevil",
  "/p/%5C%5Cevil.com",
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "/p/jobs/x?u=javascript://evil",
  "https://evil.com/p/jobs/abc",
  "http:/p/jobs",
  "/tasks",
  "/tasks/abc",
  "/",
  "/login",
  "/pfoo",
  "/p.evil.com",
  "/P/jobs/abc",
  "p/jobs/abc",
  " /p/jobs/abc",
  "/p/../tasks",
  "/p/./jobs",
  "/p/jobs/..",
  "/p/%2e%2e/tasks",
  "/p/.%2E/tasks",
  "/p/%2E/jobs",
  "/p/jobs/a\nb",
  "/p/jobs/a\rb",
  "/p/\t/evil.com",
  "/p/jobs/a\u0000b",
  "/p/jobs/a\u0085b",
  "/p/%0d%0aSet-Cookie:%20x=1",
  "/p/%09/evil.com",
  "/p/%E0%A4%A",
  "/p/%",
  "",
];

test("portal paths pass, as given", () => {
  for (const path of GOOD) assert.equal(safePortalPath(path), path, path);
});

test("anything that isn't a plain portal path is refused", () => {
  for (const path of BAD) assert.equal(safePortalPath(path), null, JSON.stringify(path));
});

test("only strings, and no more than the length cap", () => {
  for (const value of [undefined, null, 42, ["/p/jobs/abc"], { toString: () => "/p" }, new String("/p")]) {
    assert.equal(safePortalPath(value), null, String(value));
  }
  const atCap = "/p/" + "a".repeat(MAX_NEXT_LENGTH - 3);
  assert.equal(atCap.length, MAX_NEXT_LENGTH);
  assert.equal(safePortalPath(atCap), atCap);
  assert.equal(safePortalPath(atCap + "a"), null);
});

test("whatever passes stays on this site, under /p, once a browser resolves it", () => {
  // Including a double-encoded "//" and "..": one decode leaves "%2F" and
  // "%2e", which a browser keeps as literal characters in the path.
  const tricky = ["/p/%252F%252Fevil.com", "/p/%252e%252e/tasks", "/p/jobs/%E2%80%A8x", ...GOOD];
  for (const path of tricky) {
    const safe = safePortalPath(path);
    assert.ok(safe, path);
    const url = new URL(safe, "https://hgcapitalpartners.com");
    assert.equal(url.origin, "https://hgcapitalpartners.com", path);
    assert.ok(url.pathname === PORTAL_HOME || url.pathname.startsWith(PORTAL_HOME + "/"), `${path} -> ${url.pathname}`);
  }
});

test("the return path: My jobs itself is the default, and refused paths fall back to it", () => {
  assert.equal(portalReturnPath("/p"), null);
  assert.equal(portalReturnPath("/p?view=done"), "/p?view=done");
  assert.equal(portalReturnPath("/p/jobs/abc"), "/p/jobs/abc");
  assert.equal(portalReturnPath("/p/jobs/abc?x=1"), "/p/jobs/abc?x=1");
  assert.equal(portalReturnPath("//evil.com"), null);
  assert.equal(portalReturnPath("/tasks"), null);
  assert.equal(portalReturnPath(null), null);
});

test("the return path for the first-password page is the page it carries", () => {
  assert.equal(portalReturnPath(WELCOME_PASSWORD_PATH), null);
  assert.equal(portalReturnPath(`${WELCOME_PASSWORD_PATH}?next=%2Fp%2Fjobs%2Fabc`), "/p/jobs/abc");
  assert.equal(portalReturnPath(`${WELCOME_PASSWORD_PATH}?error=mismatch&next=%2Fp%2Fjobs%2Fabc`), "/p/jobs/abc");
  assert.equal(portalReturnPath(`${WELCOME_PASSWORD_PATH}?next=%2Fp`), null);
  assert.equal(portalReturnPath(`${WELCOME_PASSWORD_PATH}?next=%2F%2Fevil.com`), null);
  assert.equal(portalReturnPath(`${WELCOME_PASSWORD_PATH}?next=%2Ftasks`), null);
  // Never back to itself, however deep.
  const nested = `${WELCOME_PASSWORD_PATH}?next=${encodeURIComponent(`${WELCOME_PASSWORD_PATH}?next=%2Fp%2Fjobs%2Fabc`)}`;
  assert.equal(portalReturnPath(nested), null);
});

test("withNext adds the parameter only when there's somewhere to go", () => {
  assert.equal(withNext("/login", null), "/login");
  assert.equal(withNext("/login", "/p/jobs/abc"), "/login?next=%2Fp%2Fjobs%2Fabc");
  assert.equal(withNext("/login?error=bad", "/p/jobs/abc?x=1"), "/login?error=bad&next=%2Fp%2Fjobs%2Fabc%3Fx%3D1");
  const url = new URL(withNext("/login?error=locked", "/p/jobs/abc?x=1&y=2"), "https://hgcapitalpartners.com");
  assert.equal(url.searchParams.get("error"), "locked");
  assert.equal(url.searchParams.get("next"), "/p/jobs/abc?x=1&y=2");
});

test("after sign-in: the first-password page while needed, then the page asked for", () => {
  assert.equal(afterPortalSignIn(false, null), "/p");
  assert.equal(afterPortalSignIn(false, "/p/jobs/abc"), "/p/jobs/abc");
  assert.equal(afterPortalSignIn(true, null), WELCOME_PASSWORD_PATH);
  assert.equal(afterPortalSignIn(true, "/p/jobs/abc"), `${WELCOME_PASSWORD_PATH}?next=%2Fp%2Fjobs%2Fabc`);
});

test("an email's job link survives sign-in and the first-password step", () => {
  // The hops a signed-out contractor takes, each reading ?next= the way the
  // page or action does (Next hands pages their query already decoded once).
  const nextOf = (href: string) => new URL(href, "https://hgcapitalpartners.com").searchParams.get("next");
  const job = "/p/jobs/cmh2x9k0a0001qz8f3v7w1y2z";

  const login = withNext("/login", portalReturnPath(job)); // requirePortalPrincipal, signed out
  assert.equal(login, "/login?next=%2Fp%2Fjobs%2Fcmh2x9k0a0001qz8f3v7w1y2z");
  const formNext = portalReturnPath(nextOf(login)); // the login page's hidden field
  const welcome = afterPortalSignIn(true, portalReturnPath(formNext)); // the login action
  const passwordFormNext = portalReturnPath(nextOf(welcome)); // the welcome page's hidden field
  assert.equal(portalReturnPath(passwordFormNext) ?? "/p?saved=1", job); // chooseOwnPassword

  // Signed in already, but still on the starting password: the job page
  // sends them to the welcome page, which carries the job on.
  assert.equal(nextOf(withNext(WELCOME_PASSWORD_PATH, portalReturnPath(job))), job);
  // A dead session on the welcome page itself: /login carries the job, not the welcome page.
  assert.equal(withNext("/login", portalReturnPath(withNext(WELCOME_PASSWORD_PATH, job))), login);
});
