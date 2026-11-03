import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nov 3 low 6 (NOV3-TASKS-4): Archive counts a contractor's open name-only jobs the way the Tasks filter files
 * them. The archive itself is tested on a fake (archive.test.ts); these check the two places that must read the
 * same rule: the contractor page's Archive line, and the people the assignee list matches names against.
 */

const src = join(__dirname, "..");
const read = (path: string) => readFileSync(join(src, path), "utf8");

test("the contractor page's Archive line counts open jobs as Archive does, so the menu and the toast agree", () => {
  const page = read("app/(app)/contractors/[id]/page.tsx");
  assert.match(page, /contractorArchiveBlockers\(prisma, id\)\.then\(\(b\) => b\?\.openJobs \?\? 0\)/);
  assert.match(page, /refusal=\{contractorArchiveRefusal\(\{ openJobs, hasLogin: c\.portalAccount\?\.status === "ACTIVE" \}\)\}/);
  // Its own count of linked jobs only is gone.
  assert.doesNotMatch(page, /prisma\.task\.count\(\{ where: \{ \.\.\.jobsWhere, \.\.\.activeTask \} \}\)/);
});

test("the assignee list and Archive's count draw on one set of contacts", () => {
  assert.match(read("lib/tasks/assignee-options.ts"), /OR: \[\s*\/\/[^\n]*\n\s*listedContactsWhere,/);
  assert.match(read("lib/archive.ts"), /tx\.contact\.findMany\(\{ where: listedContactsWhere, orderBy: \{ fullName: "asc" \}/);
  // The same order as the list: the team by name, the contacts by full name (the first email match wins).
  assert.match(read("lib/tasks/assignee-options.ts"), /prisma\.user\.findMany\(\{ orderBy: \{ name: "asc" \}/);
  assert.match(read("lib/tasks/assignee-options.ts"), /orderBy: \{ fullName: "asc" \}/);
  assert.match(read("lib/archive.ts"), /tx\.user\.findMany\(\{ orderBy: \{ name: "asc" \}/);
});
