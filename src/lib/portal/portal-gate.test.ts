import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nov 3 low: /p answered 200 with My jobs' loading skeleton while the portal
 * was off or the contractor was signed out, because the only check ran in
 * the page, inside its loading.tsx boundary, after the response had started.
 * The layout now answers first (session.ts requirePortalSession). Read from
 * the source, as the other layout checks are (upload-guards.test.ts).
 */
const SRC = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

test("the portal layout answers off and signed out before anything streams", () => {
  const layout = read("app", "(portal)", "p", "layout.tsx");
  const body = layout.slice(layout.indexOf("export default async function PortalLayout"));
  assert.match(body, /^export default async function PortalLayout\([^)]*\) \{\n\s*const principal = await requirePortalSession\(\);/, "its first statement");

  const session = read("lib", "portal", "session.ts");
  const start = session.indexOf("export async function requirePortalSession");
  const gate = session.slice(start, session.indexOf("\n}\n", start));
  assert.match(gate, /if \(!\(await portalOnForRequest\(\)\)\) notFound\(\);/, "a real 404 while PORTAL_ENABLED is off");
  assert.match(gate, /if \(!state\) return signedOut\(\);/, "a real redirect when signed out");
  // Signed out goes to sign in, keeping the page asked for; only a crew session whose job is gone goes to /j/gone.
  const out = session.slice(session.indexOf("async function signedOut"), session.indexOf("\n}\n", session.indexOf("async function signedOut")));
  assert.match(out, /^async function signedOut\(\): Promise<never> \{\n\s*if \(await goneJobForCrewSession\(\)\) redirect\(GONE_SESSION_PATH\);\n\s*redirect\(withNext\("\/login", await requestedPortalPath\(\)\)\);$/);
});

test("every portal page still checks the session itself; the layout isn't the security boundary", () => {
  for (const page of [
    ["app", "(portal)", "p", "(jobs)", "page.tsx"],
    ["app", "(portal)", "p", "jobs", "[id]", "page.tsx"],
    ["app", "(portal)", "p", "welcome", "password", "page.tsx"],
  ]) {
    assert.match(read(...page), /requirePortalPrincipal\(/, page.join("/"));
  }
});

test("a crew session ends once its contractor is off the job; the contractor's own email-link session doesn't", () => {
  // docs/specs/emails-redesign.md, Q7: so the crew's reload, tap or /p goes to /j/gone (signedOut), not to a refusal toast.
  const session = read("lib", "portal", "session.ts");
  const start = session.indexOf("function linkSessionStillOpens");
  const fn = session.slice(start, session.indexOf("\n}\n", start));
  assert.match(fn, /\n\s*if \(linkKind === "CREW" && !contractorOnJob\) return false;\n/, "only a CREW session needs the contractor still on the job");
  assert.match(session, /const contractorOnJob = !!row\.onlyTask\?\.access\.some\(\(a\) => a\.contactId === row\.account\.contact\.id\);/, "on the job: an unrevoked access row of the session's own contact");
  assert.match(session, /access: \{ where: \{ revokedAt: null \}, select: \{ contactId: true \} \}/, "revoked rows don't count");
});
