"use client";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, Card } from "@/components/ui";
import { groupContractors, groupMine } from "@/lib/tasks/list";
import { cn } from "@/lib/utils";
import { ReviewActions } from "./review-actions";
import { useTaskList } from "./task-list-context";
import { TaskRow } from "./task-row";
import { TaskSection } from "./task-section";

export type TodayColumn = "mine" | "contractors";

const COLUMNS = [
  { key: "mine", label: "Mine" },
  { key: "contractors", label: "Contractors" },
] as const;

/**
 * Today (docs/asana-migration-plan.md §6, D31). From 1024px: Mine on the
 * left, Contractors on the right. Below that, a Mine | Contractors switch
 * shows one column at a time. The pick is read from the URL
 * (?view=contractors), not kept in state: Back from a task restores the
 * page from the router's cache, and only the URL comes back with it.
 */
export function TodayView({ userId }: { userId: string }) {
  const { tasks, today, moveAllToToday } = useTaskList();
  const params = useSearchParams();
  const column: TodayColumn = params.get("view") === "contractors" ? "contractors" : "mine";
  const mine = groupMine(tasks, userId, today);
  const crew = groupContractors(tasks);

  // replaceState, so switching columns doesn't stack history; Next keeps useSearchParams in step.
  function pick(next: TodayColumn) {
    const qs = new URLSearchParams(params.toString());
    if (next === "mine") qs.delete("view");
    else qs.set("view", next);
    const search = qs.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }

  const mineEmpty = Object.values(mine).every((list) => list.length === 0);

  return (
    <>
      <SegmentedControl
        aria-label="Column"
        size="md"
        options={COLUMNS}
        value={column}
        onChange={pick}
        className="mb-4 lg:hidden"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <Column title="Mine" hidden={column !== "mine"}>
          {mineEmpty && <Empty>Nothing due today.</Empty>}
          {mine.unassigned.length > 0 && (
            <TaskSection title="Unassigned" count={mine.unassigned.length}>
              {mine.unassigned.map((t) => (
                <TaskRow key={t.id} task={t} avatar />
              ))}
            </TaskSection>
          )}
          {mine.overdue.length > 0 && (
            <TaskSection
              title="Overdue"
              count={mine.overdue.length}
              action={
                <Button variant="secondary" size="sm" onClick={() => moveAllToToday(mine.overdue)}>
                  Move all to today
                </Button>
              }
            >
              {mine.overdue.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </TaskSection>
          )}
          {mine.today.length > 0 && (
            <TaskSection title="Today" count={mine.today.length}>
              {mine.today.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </TaskSection>
          )}
          {mine.waiting.length > 0 && (
            <TaskSection title="Waiting" count={mine.waiting.length}>
              {mine.waiting.map((t) => (
                <TaskRow key={t.id} task={t} reason />
              ))}
            </TaskSection>
          )}
          {mine.noDate.length > 0 && (
            <TaskSection title="No date" count={mine.noDate.length} collapsible>
              {mine.noDate.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </TaskSection>
          )}
        </Column>

        <Column title="Contractors" hidden={column !== "contractors"}>
          {crew.review.length === 0 && crew.groups.length === 0 && <Empty>No open contractor jobs.</Empty>}
          {crew.review.length > 0 && (
            <TaskSection title="Needs review" count={crew.review.length}>
              {crew.review.map((t) => (
                <TaskRow key={t.id} task={t} checkbox={false} avatar name status={false} actions={<ReviewActions task={t} />} />
              ))}
            </TaskSection>
          )}
          {crew.groups.map((g) => (
            <TaskSection
              key={g.contactId}
              title={g.name}
              count={g.jobs.length}
              icon={<Avatar name={g.name} size={20} outline />}
            >
              {g.jobs.map((t) => (
                <TaskRow key={t.id} task={t} checkbox={false} />
              ))}
            </TaskSection>
          ))}
        </Column>
      </div>
    </>
  );
}

function Column({ title, hidden, children }: { title: string; hidden: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={cn("min-w-0", hidden && "max-lg:hidden")}>
      <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-muted lg:block">{title}</h2>
      <Card className="overflow-hidden">{children}</Card>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted">{children}</p>;
}
