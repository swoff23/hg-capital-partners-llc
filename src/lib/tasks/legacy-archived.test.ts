import test from "node:test";
import assert from "node:assert/strict";
import { mergeLegacyNames } from "./assignee-people";
import { personRefs } from "./list-query";

/**
 * assignee-options.ts:39 (Nov 3 low): Archive took a contractor off the list
 * the imported free-text names are matched against. A name that an archived
 * and a live contractor share used to match neither (two people); with the
 * archived one gone it matched the live one, so the archived Zack's imported
 * jobs were filed under the live Zack on Today and in the Tasks filter. The
 * archived ones now still count when telling people apart (`hidden`), and a
 * name that is theirs goes to Others.
 */

const users = [{ id: "u-connor", name: "Connor Swofford", email: "connor@example.com" }];
const live = [{ id: "c-zack2", name: "Zack (Roofing)", email: "zack.roof@example.com" }];
const archived = [{ id: "c-zack", name: "Zack (Outlaw Carpentry)", email: "zack@outlaw.example" }];

test("a name an archived and a live contractor share is filed under neither", () => {
  const before = mergeLegacyNames(["Zack"], personRefs(users, live));
  assert.equal(before.merged.get("Zack"), "c:c-zack2", "what happened once the archived Zack left the list");
  const now = mergeLegacyNames(["Zack"], personRefs(users, live, archived));
  assert.equal(now.merged.get("Zack"), undefined);
  assert.deepEqual(now.others, ["Zack"]);
});

test("a name or email that is only an archived contractor's goes to Others, never to them", () => {
  const { merged, others } = mergeLegacyNames(["zack@outlaw.example", "Zack", "Connor Swofford"], personRefs(users, [], archived));
  assert.deepEqual([...merged], [["Connor Swofford", "u:u-connor"]]);
  assert.deepEqual(others, ["zack@outlaw.example", "Zack"]);
});

test("personRefs marks only the archived ones hidden", () => {
  const refs = personRefs(users, live, archived);
  assert.deepEqual(
    refs.map((r) => [r.key, r.hidden === true]),
    [
      ["u:u-connor", false],
      ["c:c-zack2", false],
      ["c:c-zack", true],
    ],
  );
});
