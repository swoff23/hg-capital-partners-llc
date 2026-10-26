"use client";
import { useState } from "react";
import { AssigneePicker, type AssigneeContractor, type AssigneeUser, type AssigneeValue } from "@/components/assignee-picker";
import { DueDatePicker } from "@/components/due-date-picker";
import { RepeatPicker } from "@/components/repeat-picker";
import { Input, Select } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { firstOccurrence, type RepeatRule } from "@/lib/tasks/repeat";
import { followDueDay } from "@/lib/tasks/repeat-choice";
import { STATUS_LABEL } from "@/lib/task-scope";

const NEW_STATUSES = ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"] as const;
type NewStatus = (typeof NEW_STATUSES)[number];

const encode = (v: AssigneeValue) => (!v ? "" : "userId" in v ? `u:${v.userId}` : `c:${v.contactId}`);

/**
 * The new task form's assignee, due date, status and Repeats: the same
 * pickers as the task page, at field height (their `trigger="field"`), so
 * the grid is one control height beside Status, posting through hidden
 * fields. Waiting asks what it's waiting on; Scheduled asks for the visit
 * date. Repeats reads its day and weekday from the due date, and a repeat
 * picked with no due date fills in the first one, so a repeating task never
 * starts undated.
 */
export function NewTaskFields({
  users,
  contractors,
  defaultAssignee,
  meId,
  today,
}: {
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  defaultAssignee: AssigneeValue;
  /** The signed-in user, so a phone's assignee reads "Connor (me)". */
  meId: string;
  today: Ymd;
}) {
  const [assignee, setAssignee] = useState<AssigneeValue>(defaultAssignee);
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<NewStatus>("OPEN");
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  // The last date the field held, so a pin follows Due even when the field
  // passes through empty on the way (a clear button, or Backspace on a segment).
  const [lastDue, setLastDue] = useState("");

  function changeDue(next: string) {
    if (next) {
      setRepeat((r) => followDueDay(r, lastDue, next));
      setLastDue(next);
    }
    setDue(next);
  }

  function changeRepeat(rule: RepeatRule | null) {
    setRepeat(rule);
    if (rule && !due) {
      const first = firstOccurrence(rule, today);
      setDue(first);
      setLastDue(first);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <span className="text-meta font-medium text-fg-2">Assignee</span>
          <div className="mt-1.5">
            <AssigneePicker
              value={assignee}
              users={users}
              contractors={contractors}
              onChange={setAssignee}
              meId={meId}
              trigger="field"
            />
          </div>
          <input type="hidden" name="assignee" value={encode(assignee)} />
        </div>
        <div className="min-w-0">
          <span className="text-meta font-medium text-fg-2">Due date</span>
          <div className="mt-1.5">
            <DueDatePicker
              value={due || null}
              today={today}
              placeholder="No date"
              onChange={(next) => changeDue(next ?? "")}
              trigger="field"
            />
          </div>
          <input type="hidden" name="dueDate" value={due} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-meta font-medium text-fg-2">Status</span>
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value as NewStatus)} className="mt-1.5">
            {NEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
        <div className="min-w-0">
          <span className="text-meta font-medium text-fg-2">Repeats</span>
          <div className="mt-1.5">
            <RepeatPicker
              value={repeat}
              onChange={changeRepeat}
              from={due || today}
              today={today}
              trigger="field"
            />
          </div>
          <input type="hidden" name="repeatRule" value={repeat ? JSON.stringify(repeat) : ""} />
        </div>
      </div>
      {status === "WAITING" && (
        <label className="block">
          <span className="text-meta font-medium text-fg-2">What&apos;s it waiting on?</span>
          <Input name="waitingOn" required maxLength={300} placeholder="City inspection, parts, the tenant" className="mt-1.5" />
        </label>
      )}
      {status === "SCHEDULED" && (
        <label className="block">
          <span className="text-meta font-medium text-fg-2">Visit date</span>
          <Input name="scheduledFor" type="date" required className="mt-1.5" />
        </label>
      )}
    </>
  );
}
