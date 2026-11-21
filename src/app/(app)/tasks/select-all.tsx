"use client";
import { Plus } from "lucide-react";
import { LinkButton, textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { usePicks } from "./task-picks";

/**
 * The Tasks title's action: bulk edit's Select all while anything is picked
 * (docs/specs/bulk-edit.md D7). It picks every row on screen, "Select all 42"
 * ("Select all" on a phone), and reads "Deselect all" once they all are. The
 * slot keeps New task's old height, so the title row never moves when picking
 * starts. New task lives in the filter bar (NewTaskButton). Outside the Tasks
 * list's picks (its loading screen) the slot is empty.
 */
export function TasksHeaderActions() {
  const picks = usePicks();
  const on = picks?.on ?? false;
  const all = on && picks ? picks.stateOf(picks.all) === "all" : false;
  return (
    <div className="flex min-h-9 items-center pointer-coarse:min-h-11">
      {on && picks && (
        <button
          type="button"
          onClick={() => picks.setMany(picks.all, !all)}
          className={cn(textLinkClass, "min-h-9 whitespace-nowrap text-label pointer-coarse:min-h-11")}
        >
          {all ? (
            "Deselect all"
          ) : (
            <>
              Select all<span className="max-sm:hidden"> {picks.all.length}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * New task, at the end of the Tasks list's sticky filter bar
 * (docs/specs/sticky-task-header.md D2, D3): the words from sm up, a plus
 * alone on a phone, where the bar is search, Filters and this.
 */
export function NewTaskButton() {
  return (
    <>
      <LinkButton href="/tasks/new" variant="primary" size="sm" className="max-sm:hidden">
        <Plus className="size-4 stroke-[1.5]" aria-hidden="true" />
        New task
      </LinkButton>
      <LinkButton href="/tasks/new" variant="primary" size="sm" icon aria-label="New task" className="sm:hidden">
        <Plus className="size-4 stroke-[1.5]" aria-hidden="true" />
      </LinkButton>
    </>
  );
}
