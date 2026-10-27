import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStartingPasswordTry } from "@/lib/portal/credentials";

// The portal's first-password action talks to the session and the database, so this reads its source.
const action = readFileSync(join(__dirname, "actions.ts"), "utf8");
const form = readFileSync(join(__dirname, "welcome", "password", "welcome-form.tsx"), "utf8");

/** The body of chooseOwnPassword. */
const body = action.slice(action.indexOf("export async function chooseOwnPassword"));

test("an empty starting password is not a try", () => {
  assert.equal(isStartingPasswordTry(""), false);
  assert.equal(isStartingPasswordTry(" "), true, "spaces are a guess, and are counted");
});

test("an empty starting password gets its own answer before the password is changed, so no strike is counted", () => {
  const check = body.indexOf("isStartingPasswordTry(current)");
  const change = body.indexOf("changeOwnPassword(");
  assert.ok(check > 0 && change > check, "the check runs before changeOwnPassword, which is where the throttle counts");
  const line = body.slice(check, body.indexOf("\n", check));
  assert.match(line, /return \{ error: "wrong-current", missing: true \}/);
});

test("the state says the starting password was missing, and the form words it", () => {
  assert.match(action, /missing\?: boolean/);
  assert.match(form, /state\.missing \? "Enter your starting password\."/);
});

test("a wrong starting password keeps its own words", () => {
  assert.match(form, /"wrong-current": "That starting password is wrong\."/);
});
