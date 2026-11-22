import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import { personRefs } from "./assignee-people";
import {
  DRAFT_BATCH_KEY_MAX,
  DRAFT_KEY_START,
  MAX_WAITING_DRAFTS,
  draftAutoKey,
  draftBannerLine,
  draftBatchPrefix,
  draftContractor,
  draftEmailLine,
  draftIndexOf,
  draftName,
  draftsAddedNames,
  nameAmong,
  nameList,
  type DraftContractor,
} from "./drafts";

/**
 * Drafts from Claude (docs/specs/tasks-from-claude.md): the key that makes a
 * save safe to send twice, how many may wait, who hears when a draft is
 * added, how a line names them, and the words for it (section 10).
 */

// ---------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------

test("a draft's key is its partner, its save and its place in the save", () => {
  assert.equal(draftBatchPrefix("u-pieter", "b-1"), "claude:u-pieter:b-1:");
  assert.equal(draftAutoKey("u-pieter", "b-1", 0), "claude:u-pieter:b-1:0");
  assert.equal(draftAutoKey("u-pieter", "b-1", 24), "claude:u-pieter:b-1:24");
  assert.ok(draftAutoKey("u-pieter", "b-1", 0).startsWith(DRAFT_KEY_START));
  // Two partners' Claudes sending the same key never meet.
  assert.notEqual(draftAutoKey("u-pieter", "b-1", 0), draftAutoKey("u-connor", "b-1", 0));
  assert.ok(DRAFT_BATCH_KEY_MAX >= 36, "room for a UUID");
});

test("a key reads back to its place only under its own save's prefix", () => {
  const prefix = draftBatchPrefix("u-pieter", "b-1");
  assert.equal(draftIndexOf("claude:u-pieter:b-1:0", prefix), 0);
  assert.equal(draftIndexOf("claude:u-pieter:b-1:12", prefix), 12);
  // A save whose key only starts the same ("b-1:x") is another save: its keys aren't this one's.
  assert.equal(draftIndexOf(draftAutoKey("u-pieter", "b-1:x", 3), prefix), null);
  assert.equal(draftIndexOf("claude:u-connor:b-1:0", prefix), null);
  assert.equal(draftIndexOf("claude:u-pieter:b-1:", prefix), null);
  assert.equal(draftIndexOf("claude:u-pieter:b-1:1a", prefix), null);
  assert.equal(draftIndexOf(null, prefix), null);
  // A property reminder's key ("<propertyId>:<slug>", service.ts upsertAutoTask) is never a draft's.
  assert.equal(draftIndexOf("cmprop123:insurance-renewal", prefix), null);
  assert.equal("cmprop123:insurance-renewal".startsWith(DRAFT_KEY_START), false);
});

// ---------------------------------------------------------------------------
// How many may wait
// ---------------------------------------------------------------------------

test("the cap on waiting drafts leaves Add all and Discard all room: well under the 500 ids one call takes", () => {
  assert.equal(MAX_WAITING_DRAFTS, 200);
  // One Undo can put a discarded My drafts back beside a full new one, and both buttons must still take the lot.
  assert.ok(MAX_WAITING_DRAFTS * 2 <= 500);
  // And a save at the tool's own limit (25 drafts) fits many times over.
  assert.ok(MAX_WAITING_DRAFTS >= 25 * 4);
});

// ---------------------------------------------------------------------------
// Who hears (D13), by the rule every job email follows
// ---------------------------------------------------------------------------

const ON = { status: "ACTIVE", lastSignInAt: new Date("2026-11-01T12:00:00Z"), jobEmails: true };

const person = (contactId: string, fullName: string, getsEmail: boolean): DraftContractor => draftContractor({ id: contactId, fullName, portalAccount: getsEmail ? ON : null })!;
const ZACK = person("c-zack", "Zack Reading", true);
const ROB = person("c-rob", "Rob Mason", false);

test("which of the three lines a draft gets: emails them, doesn't, or nothing for a partner's own", () => {
  assert.deepEqual(draftContractor({ id: "c-zack", fullName: "Zack Reading", active: true, portalAccount: ON }), { contactId: "c-zack", firstName: "Zack", fullName: "Zack Reading", getsEmail: true });
  // No login, access removed, never signed in, or the switch off: the job is theirs, and no email goes.
  for (const portalAccount of [null, undefined, { ...ON, status: "DISABLED" }, { ...ON, lastSignInAt: null }, { ...ON, jobEmails: false }]) {
    assert.deepEqual(draftContractor({ id: "c-rob", fullName: "Rob Mason", active: true, portalAccount }), { contactId: "c-rob", firstName: "Rob", fullName: "Rob Mason", getsEmail: false });
  }
  // An inactive contact can't sign in, so the send run would close the email unsent (content.ts deliveryFor).
  assert.equal(draftContractor({ id: "c-rob", fullName: "Rob Mason", active: false, portalAccount: ON })?.getsEmail, false);
  // The task page's select carries `active`; a caller without it means an active contact.
  assert.deepEqual(draftContractor({ id: "c-z", fullName: "Zack (Outlaw Carpentry)", portalAccount: ON }), { contactId: "c-z", firstName: "Zack", fullName: "Zack (Outlaw Carpentry)", getsEmail: true });
  // A name with no first word to greet by is used whole.
  assert.equal(draftContractor({ id: "c-x", fullName: "(Outlaw Carpentry)" })?.firstName, "(Outlaw Carpentry)");
  // A partner's own draft, or nobody's.
  assert.equal(draftContractor(null), null);
  assert.equal(draftContractor(undefined), null);
});

test("the banner and the connector's line say it in the spec's words, and an Add's toast is handed each person once", () => {
  // Section 10, Draft banner.
  assert.equal(draftBannerLine(ZACK), "Adding it emails Zack.");
  assert.equal(draftBannerLine(ROB), "Rob doesn't get job emails.");
  assert.equal(draftBannerLine(null), null, "a partner's own task has no second line");
  // Section 5, what save_drafts tells Claude adding will do.
  assert.equal(draftEmailLine(ZACK), "Emails Zack");
  assert.equal(draftEmailLine(ROB), "Rob doesn't get job emails");
  assert.equal(draftEmailLine(null), null);
  // Who an Add's toast names (the words are the Tasks screens', draft-copy.ts): who gets the email and who doesn't.
  assert.deepEqual(draftsAddedNames([ZACK]), { emailed: ["Zack"], quiet: [] });
  assert.deepEqual(draftsAddedNames([ZACK, person("c-rob", "Rob Mason", true), null]), { emailed: ["Zack", "Rob"], quiet: [] });
  assert.deepEqual(draftsAddedNames([null]), { emailed: [], quiet: [] });
  assert.deepEqual(draftsAddedNames([ROB]), { emailed: [], quiet: ["Rob"] });
  assert.deepEqual(draftsAddedNames([ZACK, ROB, null]), { emailed: ["Zack"], quiet: ["Rob"] });
  // Each person once, however many of the jobs are theirs.
  assert.deepEqual(draftsAddedNames([ZACK, ZACK, ZACK]), { emailed: ["Zack"], quiet: [] });
  assert.deepEqual(draftsAddedNames([ZACK, person("c-jose", "Jose Ruiz", true), person("c-luis", "Luis Vega", true)]), { emailed: ["Zack", "Jose", "Luis"], quiet: [] });
  assert.deepEqual(draftsAddedNames([ROB, person("c-ana", "Ana Lima", false)]), { emailed: [], quiet: ["Rob", "Ana"] });
  assert.equal(nameList(["Zack"]), "Zack");
  assert.equal(nameList(["Zack", "Rob"]), "Zack and Rob");
  assert.equal(nameList(["Zack", "Rob", "Ana"]), "Zack, Rob and Ana");
});

// ---------------------------------------------------------------------------
// Names: people are told apart by id, and by their full name once a first name is shared
// ---------------------------------------------------------------------------

test("two contractors who share a first name are two people: each is named in full, and neither loses their line", () => {
  const stone = person("c-stone", "Mike Stone", true);
  const rivera = person("c-rivera", "Mike Rivera", false);
  // The emailed Mike never hides that the other Mike gets no email (D13: the line exists to prevent that mistake).
  assert.deepEqual(draftsAddedNames([stone, rivera, null]), { emailed: ["Mike Stone"], quiet: ["Mike Rivera"] });
  assert.deepEqual(draftsAddedNames([stone, person("c-reed", "Mike Reed", true)]), { emailed: ["Mike Stone", "Mike Reed"], quiet: [] });
  // Someone else in the same toast keeps their first name.
  assert.deepEqual(draftsAddedNames([stone, rivera, ROB]), { emailed: ["Mike Stone"], quiet: ["Mike Rivera", "Rob"] });
  // Case and accents don't make two names: "José" and "jose" are said the same.
  assert.deepEqual(draftsAddedNames([person("c-j1", "José Ruiz", true), person("c-j2", "jose Lima", true)]), { emailed: ["José Ruiz", "jose Lima"], quiet: [] });
  // One person with two jobs is still one person, by id, whatever their rows said.
  assert.deepEqual(draftsAddedNames([stone, { ...stone }]), { emailed: ["Mike"], quiet: [] });
  // The same contact read once as emailed and once not (their switch flipped mid-batch): they hear, so they aren't also named as not hearing.
  assert.deepEqual(draftsAddedNames([{ ...stone, getsEmail: false }, stone]), { emailed: ["Mike"], quiet: [] });
});

test("a first name is used only while nobody else the line could mean goes by it", () => {
  // The people the screens already hold: the partners and the listed contractors (assignee-people.ts personRefs).
  const people = personRefs(
    [{ id: "u-pieter", name: "Pieter Louw", email: "pieter@example.test" }, { id: "u-connor", name: null, email: "connor@example.test" }],
    [{ id: "c-zack", name: "Zack Reading" }, { id: "c-rob", name: "Rob Mason" }, { id: "c-mike", name: "Mike Rivera" }],
  );
  assert.equal(draftName(ZACK, people), "Zack", "his own row in the list is him, not a second Zack");
  assert.equal(draftBannerLine(ZACK, people), "Adding it emails Zack.");
  assert.equal(draftEmailLine(ROB, people), "Rob doesn't get job emails");
  // A second Mike who is in no toast still makes "Mike" two people.
  const stone = person("c-stone", "Mike Stone", true);
  assert.equal(draftBannerLine(stone, people), "Adding it emails Mike Stone.");
  assert.deepEqual(draftsAddedNames([stone], people), { emailed: ["Mike Stone"], quiet: [] });
  // A contractor can type their own name, parentheses included, and names.ts reads a one-word parenthetical as the
  // name to greet by. One that is another person's first name never reads as that person.
  const impostor = person("c-impostor", "Rob (Zack) Smith", true);
  assert.equal(impostor.firstName, "Zack");
  assert.equal(draftBannerLine(impostor, people), "Adding it emails Rob (Zack) Smith.");
  assert.equal(draftEmailLine(impostor, people), "Emails Rob (Zack) Smith");
  assert.deepEqual(draftsAddedNames([impostor], people), { emailed: ["Rob (Zack) Smith"], quiet: [] });
  // And the real Zack, in a toast beside them, is named in full too.
  assert.deepEqual(draftsAddedNames([impostor, ZACK], people), { emailed: ["Rob (Zack) Smith", "Zack Reading"], quiet: [] });
  // A nickname nobody else has is still how they're named.
  assert.equal(draftBannerLine(person("c-jake", "Jacob (Jake) Hoak", true), people), "Adding it emails Jake.");
  // A contractor who shares a partner's first name is told apart from the partner.
  assert.equal(draftBannerLine(person("c-p2", "Pieter Novak", false), people), "Pieter Novak doesn't get job emails.");
  // nameAmong is the rule itself, for the refusals core.ts words: by key, never by name.
  assert.equal(nameAmong({ key: "u:u-pieter", name: "Pieter Louw" }, people), "Pieter");
  assert.equal(nameAmong({ key: "u:u-pieter", name: "Pieter Louw" }, [...people, { key: "c:c-p2", name: "Pieter Novak" }]), "Pieter Louw");
  assert.equal(nameAmong({ key: "c:c-zack", name: "  Zack Reading " }, [{ key: "c:c-other", name: "ZACK Outlaw" }]), "Zack Reading");
});

test("each line follows the copy rules: no em dash, no exclamation, one line", () => {
  const lines = [draftBannerLine(ZACK)!, draftBannerLine(ROB)!, draftEmailLine(ZACK)!, draftEmailLine(ROB)!];
  for (const line of lines) assert.doesNotMatch(line, /[—!\n]/, line);
});

// A toast wraps rather than cut off (components/toast.tsx), but one line reads best: a refusal that carries its next
// step keeps to what a 320px phone shows on one line (lib/toast-line.ts), for a six-letter name, as the house's other refusals do.
test("every refusal core.ts words for a draft fits a phone's toast, with its next step", () => {
  const core = readFileSync(join(import.meta.dirname, "core.ts"), "utf8");
  const SIX = "Pieter";
  const lines: [inSource: string, shown: string][] = [
    // Add
    ['export const ARCHIVED_ASSIGNEE_LINE = "Archived. Pick someone else.";', "Archived. Pick someone else."],
    ["`${unitDisplay(label)} is gone. Pick the unit.`", "Unit 2 is gone. Pick the unit."],
    ['const DRAFT_GONE_LINE = "That draft no longer exists.";', "That draft no longer exists."],
    // Add's Undo
    ['"This task changed since."', "This task changed since."],
    ["`Only ${by} can undo this.`", `Only ${SIX} can undo this.`],
    ['"Not yours to undo."', "Not yours to undo."],
    ['"Too late to undo."', "Too late to undo."],
    ['`${name || "Someone"} already opened it.`', `${SIX} already opened it.`],
    ['"Email already sent."', "Email already sent."],
    ['"The email is on its way."', "The email is on its way."],
    // Delete
    ['export const DRAFT_DELETE_LINE = "This is a draft. Discard it.";', "This is a draft. Discard it."],
  ];
  for (const [inSource, shown] of lines) {
    assert.ok(core.includes(inSource), `core.ts no longer says: ${inSource}`);
    assert.ok(shown.length <= TOAST_PHONE_CHARS, `"${shown}" is ${shown.length} characters, more than ${TOAST_PHONE_CHARS}`);
    assert.doesNotMatch(shown, /[—!\n]|Something went wrong|An error occurred/, shown);
    assert.match(shown, /\.$/, shown);
  }
  // None of Add's Undo lines sends anyone to the status menu: no status makes a task a draft again. Approve's own
  // Undo keeps its lines, where the status menu is the way back to Review.
  const undoAdd = core.slice(core.indexOf("export async function undoAddDraft("), core.indexOf("export interface UndoneAdds"));
  assert.doesNotMatch(undoAdd, /Change the status/);
  assert.match(core, /return "Email already sent\. Change the status\.";/);
  assert.match(core, /return "The email is on its way\. Change the status\.";/);
  assert.match(core, /throw new TaskRuleError\("Too late to undo\. Change the status\."\);/);
  // The longer lines the first build wrote are gone.
  for (const gone of ["was archived. Pick someone else, then add it.", "so this draft can't come back", "This task changed after it was added.", "added this. Change the status."]) {
    assert.ok(!core.includes(gone), gone);
  }
});

test("the browser takes drafts.ts without zod or Prisma, and nothing of a draft travels through it for Undo", () => {
  const drafts = readFileSync(join(import.meta.dirname, "drafts.ts"), "utf8");
  assert.doesNotMatch(drafts, /from "zod"|server-only/);
  // Types only from the people module, which names Prisma for its own where clause.
  assert.doesNotMatch(drafts, /import \{[^}]*\} from "@prisma\/client"/);
  assert.match(drafts, /import type \{ PersonRef \} from "\.\/assignee-people";/);
  // Discard's Undo sends ids and nothing else: the snapshot, its schema and its restore are gone.
  assert.doesNotMatch(drafts, /DraftSnapshot/);
  // An Add's and a Discard's toast are worded where they are shown (app/(app)/tasks/draft-copy.ts): no second copy
  // of those words lives here, where a test would keep passing on a line no screen shows.
  assert.doesNotMatch(drafts, /export function draftsAddedLine|export function draftsDiscardedLine/);
  assert.throws(() => readFileSync(join(import.meta.dirname, "drafts-schema.ts"), "utf8"), /ENOENT/);
  const core = readFileSync(join(import.meta.dirname, "core.ts"), "utf8");
  assert.doesNotMatch(core, /snapshotOf|DraftSnapshot|RestoredDraft\b|createTaskRow/);
  assert.match(core, /export async function restoreDrafts\(tx: Tx, taskIds: readonly string\[\], p: Principal\): Promise<RestoredDrafts> \{/);
});

// drafts.pg.test.ts proves on Postgres that a draft is absent from each page's own task read, by running the named
// builder (list-query.ts). That only proves the page when the page runs the same builder, so these three call it,
// and none spells its filters in place where a change would pass the database test untouched. (The fourth read
// with a builder, the task page's linked titles, is held to it by task-scope.test.ts, in either spelling.)
test("the property page, the Properties list and Apply playbook read their tasks through the builders the database test runs", () => {
  const page = (file: string) => readFileSync(join(import.meta.dirname, "../../app/(app)", file), "utf8");
  const reads: [file: string, call: string][] = [
    ["properties/[id]/page.tsx", "where: propertyOpenTasksWhere(id),"],
    ["properties/(list)/page.tsx", "where: openByPropertyWhere,"],
    ["templates/[id]/apply/page.tsx", "where: playbookOpenTasksWhere(template.id),"],
  ];
  for (const [file, call] of reads) {
    const src = page(file);
    assert.ok(src.includes(call), `${file}: ${call}`);
    assert.match(src, /from "@\/lib\/tasks\/list-query";/, file);
    // No task filter of its own beside it.
    assert.doesNotMatch(src, /\.\.\.(activeTask|listedTask)\b/, file);
    assert.equal(src.match(/prisma\.task\.\w+\(/g)?.length, 1, `${file}: one task read, the one above`);
  }
});
