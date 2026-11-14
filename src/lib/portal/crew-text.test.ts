import test from "node:test";
import assert from "node:assert/strict";
import { CREW_NOTES_MAX, crewText } from "./crew-text";

const base = {
  title: "Replace kitchen faucet",
  where: "118 Congress St, Buffalo, NY 14213 · Rear",
  due: "Fri, Nov 20",
  notes: "New faucet is in the garage.\nShut-off under the sink sticks.",
  todo: ["Swap faucet", "Check for leaks"],
  hasAccess: true,
  url: "https://hg.example.com/j/abc",
};

test("the crew text: the job, where and when, the notes, what's left to do, then the link", () => {
  assert.equal(
    crewText(base),
    [
      "Replace kitchen faucet\n118 Congress St, Buffalo, NY 14213 · Rear\nDue Fri, Nov 20",
      "New faucet is in the garage. Shut-off under the sink sticks.",
      "To do: Swap faucet, Check for leaks",
      "Lockbox, photos, updates:\nhttps://hg.example.com/j/abc",
    ].join("\n\n"),
  );
});

test("what isn't there is left out, and the link names the lockbox only when there is one", () => {
  const bare = crewText({ ...base, due: null, notes: null, todo: [], hasAccess: false });
  assert.equal(bare, "Replace kitchen faucet\n118 Congress St, Buffalo, NY 14213 · Rear\n\nPhotos and updates:\nhttps://hg.example.com/j/abc");
});

test("long notes are cut on a word at about 300 characters", () => {
  const text = crewText({ ...base, notes: "word ".repeat(200) });
  const notes = text.split("\n\n")[1];
  assert.ok(notes.length <= CREW_NOTES_MAX && notes.endsWith("…") && !notes.endsWith(" …"));
});
