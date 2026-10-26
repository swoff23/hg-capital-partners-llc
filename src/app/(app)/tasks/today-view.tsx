"use client";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import { SpotArt } from "@/components/spot-art";
import { StatusMark } from "@/components/status-badge";
import { Button, EmptyState } from "@/components/ui";
import { groupContractors, groupMine } from "@/lib/tasks/list";
import { cn } from "@/lib/utils";
import { ReviewActions } from "./review-actions";
import { useTaskList } from "./task-list-context";
import { TaskRow, hasStatusColumn } from "./task-row";
import { TaskSection } from "./task-section";

export type TodayColumn = "mine" | "contractors";

/**
 * Today (docs/asana-migration-plan.md §6, D31). From 1024px: Mine on the
 * left, Contractors on the right, each under its label. Below that, a Mine |
 * Contractors switch shows one column at a time. The pick is read from the
 * URL (?view=contractors), not kept in state: Back from a task restores the
 * page from the router's cache, and only the URL comes back with it. Each
 * group is a flat Section over a hairline (docs/brand-guidelines.md,
 * section 9); an empty Mine is the all-clear moment, so it gets the art.
 * Contractors carries the Review mark and how many jobs wait on a partner, so
 * "Needs review" shows on a phone and a tablet without opening the column.
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

  const review = crew.review.length;
  const columns: SegmentOption<TodayColumn>[] = [
    { key: "mine", label: "Mine" },
    {
      key: "contractors",
      label: "Contractors",
      ...(review > 0
        ? { count: review, mark: <StatusMark status="REVIEW" />, ariaLabel: `Contractors, ${review} to review` }
        : {}),
    },
  ];

  const mineEmpty = Object.values(mine).every((list) => list.length === 0);
  // A section keeps the status column only when one of its rows fills it; a section of
  // staff To dos drops it, so the titles run to the date.
  const hasColumn = (list: typeof tasks, opts?: { reason?: boolean }) => list.some((t) => hasStatusColumn(t, opts));

  return (
    <>
      <SegmentedControl
        aria-label="Column"
        size="md"
        options={columns}
        value={column}
        onChange={pick}
        className="mb-4 lg:hidden"
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
        <Column title="Mine" hidden={column !== "mine"}>
          {mineEmpty && (
            <div className="flex flex-col items-center pt-8">
              <SpotArt name="all-clear" />
              <EmptyState className="pt-3">Nothing due today.</EmptyState>
            </div>
          )}
          {mine.unassigned.length > 0 && (
            <TaskSection title="Unassigned" count={mine.unassigned.length}>
              {mine.unassigned.map((t) => (
                <TaskRow key={t.id} task={t} avatar statusColumn={hasColumn(mine.unassigned)} />
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
                <TaskRow key={t.id} task={t} statusColumn={hasColumn(mine.overdue)} />
              ))}
            </TaskSection>
          )}
          {mine.today.length > 0 && (
            <TaskSection title="Today" count={mine.today.length}>
              {mine.today.map((t) => (
                <TaskRow key={t.id} task={t} statusColumn={hasColumn(mine.today)} />
              ))}
            </TaskSection>
          )}
          {mine.waiting.length > 0 && (
            <TaskSection title="Waiting" count={mine.waiting.length}>
              {mine.waiting.map((t) => (
                <TaskRow key={t.id} task={t} reason statusColumn={hasColumn(mine.waiting, { reason: true })} />
              ))}
            </TaskSection>
          )}
          {mine.noDate.length > 0 && (
            <TaskSection title="No date" count={mine.noDate.length} collapsible>
              {mine.noDate.map((t) => (
                <TaskRow key={t.id} task={t} statusColumn={hasColumn(mine.noDate)} />
              ))}
            </TaskSection>
          )}
        </Column>

        <Column title="Contractors" hidden={column !== "contractors"}>
          {crew.review.length === 0 && crew.groups.length === 0 && <EmptyState>No open contractor jobs.</EmptyState>}
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

/** One column's groups, 32px apart (24 on touch). Its label shows from lg, where the switch is gone. */
function Column({ title, hidden, children }: { title: string; hidden: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={cn("min-w-0", hidden && "max-lg:hidden")}>
      <h2 className="mb-2 hidden text-meta font-medium text-fg-2 lg:block">{title}</h2>
      <div className="space-y-8 pointer-coarse:space-y-6">{children}</div>
    </section>
  );
}
