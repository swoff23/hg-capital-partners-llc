import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MOVE_IN_FORM_SCHEMA, type MoveInFormSchema } from "@/lib/move-in-form-types";
import {
  aboutProblems,
  blankAnswers,
  buildSteps,
  firstIncomplete,
  flaggedItems,
  formVersion,
  hasProgress,
  instanceName,
  itemKey,
  nextLabel,
  reconcile,
  roomProblems,
  stepLine,
  stepProblems,
  toSubmission,
  type Answers,
} from "./steps";

const schema = DEFAULT_MOVE_IN_FORM_SCHEMA;
const today = "2026-10-26";
const steps = buildSteps(schema);
const kitchen = schema.sections[0];
const twoUnits = { id: "p1", units: ["Unit 1", "Unit 2"] };
const oneUnit = { id: "p2", units: ["Unit 1"] };

const filled = (): Answers => {
  const a = blankAnswers(schema, today);
  a.name = "Dana Ruiz";
  a.email = "dana@example.com";
  a.propertyId = "p1";
  a.unitLabel = "Unit 2";
  return a;
};
/** Rates every item of a room Good. */
const rate = (a: Answers, key: string, rating: "Good" | "Fair" | "Poor" | "N/A" = "Good") => {
  for (const inst of a.rooms[key]) for (const k of Object.keys(inst.items)) inst.items[k].rating = rating;
};

test("the steps are About you, a room each in the editor's order, then Review", () => {
  assert.equal(steps.length, schema.sections.length + 2);
  assert.deepEqual(steps[0], { kind: "about" });
  assert.deepEqual(steps[1], { kind: "room", key: "kitchen", label: "Kitchen" });
  assert.deepEqual(steps.at(-1), { kind: "review" });
  assert.equal(stepLine(steps, 0), "About you · 1 of 7");
  assert.equal(stepLine(steps, 2), "Living Room · 3 of 7");
  assert.equal(stepLine(steps, 6), "Review · 7 of 7");
});

test("the primary names what's next: the first room, then Next, then Send", () => {
  assert.equal(nextLabel(steps, 0), "Start with the kitchen");
  assert.equal(nextLabel(steps, 1), "Next");
  assert.equal(nextLabel(steps, 5), "Next");
  assert.equal(nextLabel(steps, 6), "Send move-in report");
  // A form with no rooms goes straight from About you to Review.
  const none = buildSteps({ sections: [] });
  assert.equal(nextLabel(none, 0), "Next");
});

test("Next on About you asks for what's missing, each in words that say what to enter", () => {
  const p = aboutProblems({ ...blankAnswers(schema, today), date: "" }, undefined);
  assert.deepEqual(p, {
    name: "Enter your name.",
    email: "Enter your email.",
    propertyId: "Choose your property.",
    date: "Enter the date of the inspection.",
  });
  assert.equal(aboutProblems({ ...filled(), email: "dana@" }, twoUnits).email, "Enter an email, like name@example.com.");
  assert.deepEqual(aboutProblems(filled(), twoUnits), {});
});

test("a unit is asked only where there's a choice, and a one-unit building sends its own", () => {
  const noUnit = { ...filled(), unitLabel: "" };
  assert.equal(aboutProblems(noUnit, twoUnits).unitLabel, "Choose your unit.");
  assert.deepEqual(aboutProblems({ ...noUnit, propertyId: "p2" }, oneUnit), {});
  const sent = toSubmission({ ...noUnit, propertyId: "p2" }, schema, oneUnit, "");
  assert.equal(sent.unitLabel, "Unit 1");
});

test("Next checks only the step you're on: a blank kitchen doesn't stop About you", () => {
  const a = filled();
  assert.deepEqual(stepProblems(steps[0], a, schema, twoUnits), {});
  assert.equal(Object.keys(stepProblems(steps[1], a, schema, twoUnits)).length, kitchen.items.length);
  // Review has nothing to check of its own.
  assert.deepEqual(stepProblems(steps[6], a, schema, twoUnits), {});
});

test("the editor's Required is enforced: every item of a required room needs a rating, N/A included", () => {
  const a = filled();
  const p = roomProblems(kitchen, a.rooms.kitchen);
  assert.equal(p[itemKey("kitchen", 0, "cabinets")], "Choose a rating.");
  assert.equal(p[itemKey("kitchen", 0, "drawers")], "Choose a rating.");
  rate(a, "kitchen", "N/A");
  assert.deepEqual(roomProblems(kitchen, a.rooms.kitchen), {});
  // One item left unrated, and it is the one named.
  a.rooms.kitchen[0].items.sink.rating = "";
  assert.deepEqual(Object.keys(roomProblems(kitchen, a.rooms.kitchen)), [itemKey("kitchen", 0, "sink")]);
});

test("an optional room asks for nothing, and a second bathroom must be finished or removed", () => {
  const other = schema.sections[4];
  assert.equal(other.minCount, 0);
  assert.deepEqual(roomProblems(other, blankAnswers(schema, today).rooms["other-areas"]), {});

  const bath = schema.sections[2];
  const a = filled();
  rate(a, "bathroom");
  assert.deepEqual(roomProblems(bath, a.rooms.bathroom), {});
  a.rooms.bathroom.push(structuredClone(a.rooms.bathroom[0]));
  for (const k of Object.keys(a.rooms.bathroom[1].items)) a.rooms.bathroom[1].items[k].rating = "";
  assert.equal(roomProblems(bath, a.rooms.bathroom)[itemKey("bathroom", 1, "toilet")], "Choose a rating.");
});

test("the first step with something missing is where a draft picks up", () => {
  const a = filled();
  assert.equal(firstIncomplete(steps, a, schema, twoUnits), 1);
  rate(a, "kitchen");
  assert.equal(firstIncomplete(steps, a, schema, twoUnits), 2);
  for (const s of schema.sections) rate(a, s.key);
  assert.equal(firstIncomplete(steps, a, schema, twoUnits), -1);
  assert.equal(firstIncomplete(steps, { ...a, name: "" }, schema, twoUnits), 0);
});

test("a form with nothing entered has no progress to keep", () => {
  assert.equal(hasProgress(blankAnswers(schema, today), schema, today), false);
  assert.equal(hasProgress({ ...blankAnswers(schema, today), name: "Dana" }, schema, today), true);
  const a = blankAnswers(schema, today);
  a.rooms.kitchen[0].items.sink.rating = "Good";
  assert.equal(hasProgress(a, schema, today), true);
});

test("the review lists the Fair and Poor items with where they are and what was said", () => {
  const a = filled();
  rate(a, "kitchen");
  a.rooms.kitchen[0].items.faucet = { rating: "Fair", comment: " Drips when off " };
  a.rooms.kitchen[0].items.sink.rating = "Poor";
  a.rooms.bathroom[0].location = "Upstairs";
  a.rooms.bathroom[0].items.toilet = { rating: "Poor", comment: "" };
  const flagged = flaggedItems(schema, a);
  assert.deepEqual(
    flagged.map((f) => [f.place, f.item, f.rating, f.comment]),
    [
      ["Kitchen", "Sink", "Poor", ""],
      ["Bathroom 1 (Upstairs)", "Toilet", "Poor", ""],
    ],
  );
  // "Faucet" isn't an item in this form, so it never shows; the rooms and items are the editor's.
  assert.equal(flagged.some((f) => f.item === "Faucet"), false);
  assert.equal(instanceName(schema.sections[2], 1, ""), "Bathroom 2");
  assert.equal(instanceName(schema.sections[0], 0, "ignored"), "Kitchen");
});

test("a report is sent as it always was, with one name for the tenant and the sender", () => {
  const a = filled();
  rate(a, "kitchen");
  a.rooms.kitchen[0].items.sink = { rating: "Fair", comment: " leaks " };
  a.comments = "  Thanks ";
  const s = toSubmission(a, schema, twoUnits, "");
  assert.equal(s.tenantName, "Dana Ruiz");
  assert.equal(s.submitterName, "Dana Ruiz");
  assert.equal(s.submitterEmail, "dana@example.com");
  assert.equal(s.unitLabel, "Unit 2");
  assert.equal(s.additionalComments, "Thanks");
  const k = s.sections[0].instances[0];
  assert.equal(k.answers.length, kitchen.items.length);
  assert.deepEqual(k.answers.find((x) => x.itemKey === "sink"), { itemKey: "sink", rating: "Fair", comment: "leaks" });
  // Unrated items aren't sent: the bathroom wasn't touched.
  assert.deepEqual(s.sections[2].instances[0].answers, []);
});

test("a draft is brought in line with the form: new items blank, removed ones gone, a room never empty", () => {
  const a = filled();
  rate(a, "kitchen", "Good");
  const changed: MoveInFormSchema = structuredClone(schema);
  changed.sections[0].items = changed.sections[0].items.filter((i) => i.key !== "drawers");
  changed.sections[0].items.push({ key: "pantry", label: "Pantry" });
  changed.sections[2].maxCount = 1;
  a.rooms.bathroom.push(structuredClone(a.rooms.bathroom[0]));
  delete (a.rooms as Record<string, unknown>)["living-room"];
  const r = reconcile(a, changed);
  assert.equal("drawers" in r.rooms.kitchen[0].items, false);
  assert.deepEqual(r.rooms.kitchen[0].items.pantry, { rating: "", comment: "" });
  assert.equal(r.rooms.kitchen[0].items.sink.rating, "Good");
  assert.equal(r.rooms.bathroom.length, 1);
  assert.equal(r.rooms["living-room"].length, 1);
});

test("the form's version follows its rooms and items", () => {
  assert.equal(formVersion(schema), formVersion(structuredClone(schema)));
  const more = structuredClone(schema);
  more.sections[1].items.push({ key: "closet", label: "Closet" });
  assert.notEqual(formVersion(more), formVersion(schema));
  const fewer = { sections: schema.sections.slice(0, 3) };
  assert.notEqual(formVersion(fewer), formVersion(schema));
  assert.match(formVersion(schema), /^5-/);
});
