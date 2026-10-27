import test from "node:test";
import assert from "node:assert/strict";
import { toFailure, userMessage } from "@/lib/action-result";
import { NOTES_MAX, TOO_LONG, checklistItemText, commentText, newTaskNotesProblem, notesText, titleText } from "./limits";
import { newTaskSchema } from "./new-task";

const long = (n: number) => "x".repeat(n);

test("New task is held to the limits the task page saves within, so a task is never made with notes it can't save again", () => {
  assert.ok(newTaskSchema.safeParse({ title: "Fix the porch light", description: long(NOTES_MAX) }).success);
  const notes = newTaskSchema.safeParse({ title: "Fix the porch light", description: long(NOTES_MAX + 1) });
  assert.ok(!notes.success);
  assert.deepEqual(toFailure(notes.error).fieldErrors, { description: TOO_LONG.notes });
  const title = newTaskSchema.safeParse({ title: long(301) });
  assert.ok(!title.success);
  assert.deepEqual(toFailure(title.error).fieldErrors, { title: TOO_LONG.title });
  // The form checks the notes before it posts, with the same line.
  assert.equal(newTaskNotesProblem(long(NOTES_MAX + 1)), "Shorten the notes to 20,000 characters.");
  assert.equal(newTaskNotesProblem(long(NOTES_MAX)), null);
});

test("each limit says how to fix it in plain words, never zod's own", () => {
  const said = (schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, v: string) => userMessage(schema.safeParse(v).error);
  assert.equal(said(titleText, long(301)), "Shorten the title to 300 characters.");
  assert.equal(said(notesText, long(20_001)), "Shorten the notes to 20,000 characters.");
  assert.equal(said(commentText, long(20_001)), "Shorten it to 20,000 characters.");
  assert.equal(said(checklistItemText, long(301)), "Shorten the item to 300 characters.");
  // A checklist item is trimmed first, so spaces around 300 characters still fit.
  assert.ok(checklistItemText.safeParse(`  ${long(300)}  `).success);
  for (const line of Object.values(TOO_LONG)) assert.ok(!line.includes("—"), "no em dashes");
});
