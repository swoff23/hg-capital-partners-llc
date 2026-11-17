"use client";
import { CircleDashed } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EntityPicker, assigneeKeyOf, assigneeValueOfKey } from "@/components/entity-picker";
import { assigneeValueOf, isContractorJob, type ListTask } from "@/lib/tasks/list";
import { personName, shortName } from "@/lib/tasks/list-sort";
import { cn } from "@/lib/utils";
import { useTaskList } from "./task-list-context";

/**
 * For the element around the cell: how far out to pull it, so the avatar sits where the plain cell's did.
 * On the wrapper rather than the trigger, which keeps its full width to the edge it was pulled to before
 * its name truncates.
 */
export const assigneeCellPull = { column: "-ml-1.25", corner: "-mr-1" } as const;

/**
 * A task row's assignee, reassignable in place: the assignee picker
 * (selectors 3.3) behind a ghost trigger (`pickerGhost`), so the row reads
 * as it always did (a 24px avatar and the first name) until a mouse is on
 * the name. With a mouse it takes the chip look and a click opens the picker;
 * on touch a tap on the name opens it as a sheet, and a tap anywhere else on
 * the row still opens the task. A pick saves at once and toasts with Undo
 * (task-list-context.tsx `assign`).
 *
 * `column`: the Assignee column of a one-line row, the avatar first. An
 * unassigned row's cell shows a dashed "Assign" while a mouse is on the row
 * or a keyboard is on the cell, and stays empty on touch, where a tap there
 * opens the task. `corner`: the bottom right of a two-line row, the first
 * name before the avatar so the avatar holds the corner under the date; a
 * two-line row with nobody keeps its place line as it was. Must sit inside a
 * TaskListProvider given `people`.
 */
export function AssigneeCell({ task, layout }: { task: ListTask; layout: "column" | "corner" }) {
  const { peopleRows: rows, assign } = useTaskList();
  if (!rows) return null;
  const who = personName(task.assignee);
  const first = shortName(who);
  const avatar = who ? (
    <Avatar name={who} size={24} outline={isContractorJob(task)} />
  ) : (
    // In the avatars' 24px box, so "Assign" starts where the names do.
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center">
      {/* The picker's own empty mark, at its size: the trigger sizes its icons smaller. */}
      <CircleDashed className="size-5!" />
    </span>
  );
  // An imported name checks no row: it is nobody to the task service, so picking even the person the list
  // files it with saves them for real.
  const selectedKey = task.assignee?.kind === "name" ? null : assigneeKeyOf(assigneeValueOf(task.assignee));

  return (
    <EntityPicker
      label="Assignee"
      subject={task.title}
      trigger="ghost"
      display={{
        leading: layout === "column" ? avatar : undefined,
        trailing: layout === "corner" ? avatar : undefined,
        text: first ?? "Assign",
        empty: !who,
      }}
      pinned={rows.pinned}
      sections={rows.sections}
      selectedKey={selectedKey}
      onPick={(key) => assign(task, assigneeValueOfKey(key))}
      searchLabel="Search people"
      emptyText="No one matches."
      className={cn(
        "pointer-events-auto",
        // The row pulls each one out by its edge and padding (`assigneeCellPull`), so the avatar sits where the plain one did.
        layout === "column"
          ? // 28px, the date chip's height, with a 1px edge and 4px before the avatar. 44 on touch, as row chips are.
            "h-7 pr-2 pl-1 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2"
          : // 24px with no edge, overhanging the 20px place line by 2px each way as the avatar did, 4px after the
            // avatar. A mouse gets the --background fill alone: an edge would sit on the date chip's. On touch it
            // reaches down to the row's edge but never up: the date chip sits right on top of it, and a tap on the
            // date must open the date. Below the date in the DOM, its own 24px box wins where the date chip's reach
            // spills onto the place line.
            "-my-0.5 h-6 border-0 pr-1 pl-1.5 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-0 pointer-coarse:after:-bottom-2.5",
        !who &&
          // Unassigned: shown while a mouse is on the row, a keyboard is on it or its picker is open; never on touch.
          "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:hidden",
      )}
    />
  );
}
