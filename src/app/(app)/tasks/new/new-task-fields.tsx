"use client";
import { useState } from "react";
import { AssigneePicker, type AssigneeContractor, type AssigneeUser, type AssigneeValue } from "@/components/assignee-picker";
import { RepeatPicker } from "@/components/repeat-picker";
import { Input, Select } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { weekdayOf } from "@/lib/quick-dates";
import { firstOccurrence, type RepeatRule } from "@/lib/tasks/repeat";
import { followDueDay } from "@/lib/tasks/repeat-choice";
import { STATUS_LABEL } from "@/lib/task-scope";

const NEW_STATUSES = ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"] as const;
type NewStatus = (typeof NEW_STATUSES)[number];

const encode = (v: AssigneeValue) => (!v ? "" : "userId" in v ? `u:${v.userId}` : `c:${v.contactId}`);

/**
 * The new task form's assignee, due date, status and Repeats: the same
 * pickers as the task page, posting through hidden fields. Waiting asks what
 * it's waiting on; Scheduled asks for the visit date. Repeats reads its day
 * and weekday from the due date, and a repeat picked with no due date fills in the first
 * one, so a repeating task never starts undated.
 */
export function NewTaskFields({
  users,
  contractors,
  defaultAssignee,
  today,
}: {
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  defaultAssignee: AssigneeValue;
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
        <div>
          <span className="text-meta font-medium text-fg-2">Assignee</span>
          <div className="mt-1.5 flex h-9 items-center pointer-coarse:h-11">
            <AssigneePicker value={assignee} users={users} contractors={contractors} onChange={setAssignee} />
          </div>
          <input type="hidden" name="assignee" value={encode(assignee)} />
        </div>
        <label className="block">
          <span className="text-meta font-medium text-fg-2">Due date</span>
          <Input name="dueDate" type="date" value={due} onChange={(e) => changeDue(e.target.value)} className="mt-1.5" />
        </label>
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
        <div>
          <span className="text-meta font-medium text-fg-2">Repeats</span>
          <div className="mt-1.5 flex h-9 items-center pointer-coarse:h-11">
            <RepeatPicker
              value={repeat}
              onChange={changeRepeat}
              defaultDay={Number((due || today).slice(8, 10))}
              defaultWeekday={weekdayOf(due || today)}
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
