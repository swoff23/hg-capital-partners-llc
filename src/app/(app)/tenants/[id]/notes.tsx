"use client";
import { InlineField } from "@/components/inline-field";
import { saveLease } from "./actions";

/**
 * The lease's notes, as the task's: Save or ⌘↵, never on blur, so a stray tap
 * can't rewrite what staff wrote down about a household. Esc puts the old
 * words back.
 */
export function LeaseNotes({ leaseId, value, home }: { leaseId: string; value: string | null; home: string }) {
  return (
    <InlineField
      kind="multiline"
      label="Notes"
      field="notes"
      context={`Lease · ${home}`}
      value={value ?? ""}
      empty="Add notes"
      inRail={false}
      message={() => "Notes saved"}
      onSave={(next) => saveLease(leaseId, { notes: next === "" ? null : next })}
    />
  );
}
