"use client";
import { Plus } from "lucide-react";
import { LinkButton, textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { usePicks } from "./task-picks";

/**
 * The Tasks header's actions: New task, and bulk edit's Select all beside it
 * while anything is picked (docs/specs/bulk-edit.md D7), so the list never
 * moves when picking starts. Select all picks every row on screen, "Select
 * all 42" ("Select all" on a phone), and reads "Deselect all" once they all
 * are. Below 360px the two don't fit beside the title, so New task steps
 * aside while picking, as select modes do, and comes back when the picks
 * clear. Outside the Tasks list's picks (its loading screen) it's New task
 * alone.
 */
export function TasksHeaderActions() {
  const picks = usePicks();
  const on = picks?.on ?? false;
  const all = on && picks ? picks.stateOf(picks.all) === "all" : false;
  return (
    // One group, so the header's space-between puts the pair at its end together.
    <div className="flex items-center gap-3">
      {on && picks && (
        <button
          type="button"
          onClick={() => picks.setMany(picks.all, !all)}
          // New task's height, so the header keeps its height when New task steps aside below 360px.
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
      <LinkButton href="/tasks/new" variant="primary" className={cn(on && "max-[359px]:hidden")}>
        <Plus className="size-4 stroke-[1.5]" aria-hidden="true" />
        New task
      </LinkButton>
    </div>
  );
}
