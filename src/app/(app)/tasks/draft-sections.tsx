"use client";
import { Button } from "@/components/ui";
import type { ListTask } from "@/lib/tasks/list";
import { groupDrafts, type DraftGroup, type DraftTask } from "./draft-copy";
import { useTaskList } from "./task-list-context";
import { TaskRow } from "./task-row";
import { TaskSection } from "./task-section";

/** The other partner's drafts, under their first name from the record (queries.ts draftTasks). */
export type OtherDrafts = DraftGroup;

/**
 * The drafts Claude saved, above the Tasks list's groups (docs/specs/tasks-from-claude.md 6.3). My drafts is
 * the partner's own, newest first, with Discard all then Add all in its heading; each other partner's sit
 * under their name with no bulk buttons (D17). A draft row is a TaskRow with no checkbox and no status mark,
 * and its Discard then Add at its end: the pair, order and weight of Send back and Approve on a Needs review
 * row (review-actions.tsx). The row opens the draft's page. Filters and sorting never reach these rows: they
 * come from their own query, not the list's. Must sit inside a TaskListProvider given `drafts`.
 *
 * The rows drawn are the provider's drafts, which an Add or Discard takes rows out of at once and an Undo puts
 * back at once, before the page's refresh answers: each row carries the group it sits in (`DraftTask.group`), so
 * a group the refresh dropped (the other partner's only draft) is drawn again from the rows alone.
 */
export function DraftSections({ mine, others }: { mine: ListTask[]; others: OtherDrafts[] }) {
  const { drafts, addAllDrafts, discardAllDrafts } = useTaskList();
  const { mine: mineRows, others: groups } = groupDrafts(drafts, mine, others);
  if (mineRows.length === 0 && groups.length === 0) return null;

  return (
    <div data-draft-rows="" className="mb-8 space-y-8 pointer-coarse:mb-6 pointer-coarse:space-y-6">
      {mineRows.length > 0 && (
        <TaskSection
          as="h2"
          title="My drafts"
          count={mineRows.length}
          action={
            // One row down to 320: My drafts, its count, then the pair; Discard all's own padding is pulled in so the pair fits.
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => discardAllDrafts(mineRows)}>
                Discard all
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addAllDrafts(mineRows)}>
                Add all
              </Button>
            </div>
          }
        >
          {mineRows.map((t) => (
            <DraftRow key={t.id} task={t} />
          ))}
        </TaskSection>
      )}
      {groups.map((g) => (
        <TaskSection key={g.userId} as="h2" title={`${g.name}'s drafts`} count={g.tasks.length}>
          {g.tasks.map((t) => (
            <DraftRow key={t.id} task={t} />
          ))}
        </TaskSection>
      ))}
    </div>
  );
}

function DraftRow({ task }: { task: DraftTask }) {
  return <TaskRow task={task} checkbox={false} avatar status={false} statusColumn={false} actionsAtEnd actions={<DraftActions task={task} />} />;
}

/** Discard (ghost), then Add (secondary), named with the draft so a screen reader can tell the rows apart. */
function DraftActions({ task }: { task: DraftTask }) {
  const { addDraft, discardDraft } = useTaskList();
  return (
    <>
      <Button variant="ghost" size="sm" aria-label={`Discard ${task.title}`} onClick={() => discardDraft(task)}>
        Discard
      </Button>
      <Button variant="secondary" size="sm" aria-label={`Add ${task.title}`} onClick={() => addDraft(task)}>
        Add
      </Button>
    </>
  );
}
