"use client";
import { Eye } from "lucide-react";
import { InlineField } from "@/components/inline-field";
import { updateTask } from "./actions";

/**
 * The task's notes (forms 4.4): Save or ⌘↵, never on blur, so a stray tap
 * can't rewrite a tenant's report text (G1B-002); Esc puts the old words back.
 * Notes are always visible to the assigned contractor (D16), so the line above
 * says who'll see them, and that it waits for their login when they don't have
 * one yet (G2B-I03). When a change reaches them, the toast says so
 * (BTASKS-021). A save carries the notes the page loaded, so one from a
 * stale page is refused as a conflict instead of writing over newer notes.
 */
export function NotesField({
  taskId,
  value,
  visibleTo,
  hasLogin,
}: {
  taskId: string;
  value: string | null;
  visibleTo: string | null;
  hasLogin: boolean;
}) {
  return (
    <div>
      {visibleTo && (
        <p className="mb-1 flex items-center gap-1.5 text-meta text-fg-3">
          <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          {hasLogin ? `Visible to ${visibleTo}` : `${visibleTo} sees notes after signing in`}
        </p>
      )}
      <InlineField
        kind="multiline"
        label="Notes"
        field="description"
        context="Task notes"
        value={value ?? ""}
        empty="Add notes"
        inRail={false}
        ripple={visibleTo && hasLogin ? `${visibleTo} sees this` : undefined}
        // Sent with the notes this page loaded, so a save from a stale page never writes over newer notes: the
        // field says who saved what, with Keep and Save mine (core.ts NotesChangedError).
        onSave={(next, expected) => updateTask(taskId, { description: next === "" ? null : next, expectedDescription: expected === "" ? null : expected })}
      />
    </div>
  );
}
