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
  // The count Archive's toast reads (contractorArchiveBlockers is contractorOpenJobs plus the login), with the
  // login from the contact the page already loaded, so the contact isn't read twice.
  assert.match(page, /const \[me, c, open\] = await Promise\.all\(\[[\s\S]*?contractorOpenJobs\(prisma, id\),\s*\]\);/);
  assert.match(page, /refusal=\{contractorArchiveRefusal\(\{ openJobs: open\.count, hasLogin: c\.portalAccount\?\.status === "ACTIVE" \}\)\}/);
  assert.doesNotMatch(page, /contractorArchiveBlockers/);
  assert.match(read("lib/archive.ts"), /const \[contact, open\] = await Promise\.all\(\[[\s\S]*?contractorOpenJobs\(tx, id\),\s*\]\);/);
});

test("the contractor page lists the jobs Archive counts: the name-only open ones too, so 'No jobs assigned yet.' is true", () => {
  // Nov 3 low 6 follow-up: the menu said "Reassign their 4 jobs first." beside "No jobs assigned yet.", since the
  // list read only the jobs linked by id. The list, its count and the empty line now read one filter.
  const page = read("app/(app)/contractors/[id]/page.tsx");
  assert.match(page, /const jobsWhere = contractorJobsWhere\(id, open\.names\);/);
  assert.match(page, /prisma\.task\.findMany\(\{\s*where: jobsWhere,/);
  assert.match(page, /prisma\.task\.count\(\{ where: jobsWhere \}\)/);
  assert.doesNotMatch(page, /assigneeContactId: id/, "no list of its own that reads only the linked jobs");
});

test("the assignee list and Archive's count draw on one set of contacts", () => {
  assert.match(read("lib/tasks/assignee-options.ts"), /OR: \[\s*\/\/[^\n]*\n\s*listedContactsWhere,/);
  assert.match(read("lib/archive.ts"), /tx\.contact\.findMany\(\{ where: listedContactsWhere, orderBy: \{ fullName: "asc" \}/);
  // The same order as the list: the team by name, the contacts by full name (the first email match wins).
  assert.match(read("lib/tasks/assignee-options.ts"), /prisma\.user\.findMany\(\{ orderBy: \{ name: "asc" \}/);
  assert.match(read("lib/tasks/assignee-options.ts"), /orderBy: \{ fullName: "asc" \}/);
  assert.match(read("lib/archive.ts"), /tx\.user\.findMany\(\{ orderBy: \{ name: "asc" \}/);
});
