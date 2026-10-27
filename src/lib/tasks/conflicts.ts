import { ConflictError } from "@/lib/action-result";
import { NotesChangedError } from "./core";

/**
 * A core refusal as the field editor's conflict (forms 2.8, 2.12). A stale
 * notes save (core.ts NotesChangedError) becomes a ConflictError on
 * `description`, so the notes field says who saved what and when, with
 * "Keep Pieter's" and "Save mine", the way a property's notes do. When the
 * newer notes came from the caller's own other tab it names nobody ("This
 * changed at 2:14 PM", "Keep current"): their first name would read as
 * someone else. Anything else comes back as it was. Pure; see conflicts.test.ts.
 */
export function asEditorConflict(err: unknown): unknown {
  if (!(err instanceof NotesChangedError)) return err;
  return new ConflictError({ fields: ["description"], by: err.mine ? null : err.by, at: err.at, theirs: { description: err.current } });
}
