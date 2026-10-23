"use client";
import { useState } from "react";
import { AssigneePicker, type AssigneeContractor, type AssigneeUser, type AssigneeValue } from "@/components/assignee-picker";
import { RepeatPicker } from "@/components/repeat-picker";
import { Input, Select } from "@/components/ui";
import type { RepeatRule } from "@/lib/tasks/repeat";
import { STATUS_LABEL } from "@/lib/task-scope";

const NEW_STATUSES = ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"] as const;
type NewStatus = (typeof NEW_STATUSES)[number];

const encode = (v: AssigneeValue) => (!v ? "" : "userId" in v ? `u:${v.userId}` : `c:${v.contactId}`);

/**
 * The new task form's assignee, status and Repeats: the same pickers as the
 * task page, posting through hidden fields. Waiting asks what it's waiting
 * on; Scheduled asks for the visit date.
 */
export function NewTaskFields({
  users,
  contractors,
  defaultAssignee,
  defaultDay,
}: {
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  defaultAssignee: AssigneeValue;
  defaultDay: number;
}) {
  const [assignee, setAssignee] = useState<AssigneeValue>(defaultAssignee);
  const [status, setStatus] = useState<NewStatus>("OPEN");
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs font-medium text-muted">Assignee</span>
          <div className="mt-1 flex h-9 items-center pointer-coarse:h-11">
            <AssigneePicker value={assignee} users={users} contractors={contractors} onChange={setAssignee} />
          </div>
          <input type="hidden" name="assignee" value={encode(assignee)} />
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted">Due date</span>
          <Input name="dueDate" type="date" className="mt-1" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted">Status</span>
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value as NewStatus)} className="mt-1">
            {NEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
        <div>
          <span className="text-xs font-medium text-muted">Repeats</span>
          <div className="mt-1 flex h-9 items-center pointer-coarse:h-11">
            <RepeatPicker value={repeat} onChange={setRepeat} defaultDay={defaultDay} />
          </div>
          <input type="hidden" name="repeatRule" value={repeat ? JSON.stringify(repeat) : ""} />
        </div>
      </div>
      {status === "WAITING" && (
        <label className="block">
          <span className="text-xs font-medium text-muted">What&apos;s it waiting on?</span>
          <Input name="waitingOn" required maxLength={300} placeholder="City inspection, parts, the tenant" className="mt-1" />
        </label>
      )}
      {status === "SCHEDULED" && (
        <label className="block">
          <span className="text-xs font-medium text-muted">Visit date</span>
          <Input name="scheduledFor" type="date" required className="mt-1" />
        </label>
      )}
    </>
  );
}
