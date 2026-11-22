"use client";
import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { InlineField } from "@/components/inline-field";
import { Meter } from "@/components/meter";
import { useToast } from "@/components/toast";
import { Section } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { AddChecklistItem, ChecklistItemRow, checkBoxClass } from "../checklist-rows";
import { addChecklistItem, addChecklistItems, setChecklistItem } from "./actions";
import { removeChecklistItem, renameChecklistItem, restoreChecklistItem } from "./checklist-actions";

export type ChecklistRow = { id: string; title: string; done: boolean };

/** What an item's toasts are about: a rename's Undo and a removal's share it, so the newest replaces the other. */
const toastKeyFor = (itemId: string) => `checklist:${itemId}`;

/** An optimistic change to the rows: a tick, or an item taken off while its removal saves. */
type Change = { id: string; done: boolean } | { id: string; removed: true };

/**
 * "Checklist 2/5" over a hairline, a 4px meter of how many are ticked,
 * tick-off rows, and "Add item". The boxes are round, on an --input
 * edge; ticked, they fill with ink (--primary), as every checked control does
 * (docs/brand-guidelines.md, section 9). At 5 of 5 the count becomes a check
 * and "All done". An item's words are its own InlineField: a click renames it
 * in place, Enter saves, Esc puts the old words back. Each item's ⋯ menu
 * holds Delete, which takes it off at once and toasts with Undo (BTASKS-024).
 * The rows and Add item are New task's too (../checklist-rows.tsx); a pasted
 * list adds one item per line.
 */
export function Checklist({ taskId, items }: { taskId: string; items: ChecklistRow[] }) {
  const { run } = useRun();
  const [rows, change] = useOptimistic(items, (cur, c: Change) =>
    "removed" in c ? cur.filter((r) => r.id !== c.id) : cur.map((r) => (r.id === c.id ? { ...r, done: c.done } : r)),
  );
  const done = rows.filter((r) => r.done).length;
  const finished = rows.length > 0 && done === rows.length;

  return (
    <Section
      title={
        <>
          Checklist
          {/* The space keeps the heading's name "Checklist 2/5", not "Checklist2/5". */}
          {rows.length > 0 && " "}
          {rows.length > 0 &&
            (finished ? (
              <span className="ml-1 inline-flex items-center gap-1 align-baseline font-normal text-ok">
                <Check aria-hidden="true" className="size-4" />
                All done
              </span>
            ) : (
              <span className="ml-1 font-normal tabular-nums text-muted-foreground">
                {done}/{rows.length}
              </span>
            ))}
        </>
      }
    >
      {rows.length > 0 && (
        // It moves with the tick: the check's spring.
        <Meter
          value={done}
          max={rows.length}
          label="Checklist progress"
          valueText={`${done} of ${rows.length} done`}
          spring
          className="mb-1"
        />
      )}
      <ul>
        {rows.map((r) => (
          <ChecklistItem
            key={r.id}
            row={r}
            onTick={() => run(() => setChecklistItem(r.id, !r.done), { before: () => change({ id: r.id, done: !r.done }) })}
            onRemoved={(id) => change({ id, removed: true })}
          />
        ))}
      </ul>
      <AddItem taskId={taskId} />
    </Section>
  );
}

function ChecklistItem({ row: r, onTick, onRemoved }: { row: ChecklistRow; onTick: () => void; onRemoved: (id: string) => void }) {
  const { toast } = useToast();
  const [, start] = useTransition();

  /** Takes the item off now; the toast's Undo puts it back as it was, tick and place included. */
  function remove() {
    start(async () => {
      onRemoved(r.id);
      const res = await callAction(() => removeChecklistItem(r.id));
      if (!res.ok) {
        toast({ message: res.error });
        return;
      }
      const snapshot = res.data;
      toast({
        message: "Item removed",
        key: toastKeyFor(r.id),
        action: {
          label: "Undo",
          onAction: () =>
            start(async () => {
              const back = await callAction(() => restoreChecklistItem(snapshot));
              if (!back.ok) toast({ message: back.error });
            }),
        },
      });
    });
  }

  return (
    <ChecklistItemRow
      title={r.title}
      onDelete={remove}
      box={
        <button
          type="button"
          role="checkbox"
          aria-checked={r.done}
          aria-label={r.title}
          onClick={onTick}
          className={cn(checkBoxClass(r.done), "after:absolute after:-inset-2.5 pointer-coarse:after:-inset-3.5", !r.done && "hover:border-foreground")}
        >
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        </button>
      }
    >
      <InlineField
        kind="text"
        label="Checklist item"
        value={r.title}
        minLength={1}
        tooShort="Enter a name for the item."
        wrap
        inRail={false}
        message={() => "Item renamed"}
        // Removing the item replaces this toast, so an Undo for a row that is gone never shows.
        toastKey={toastKeyFor(r.id)}
        className={cn(r.done && "text-muted-foreground line-through")}
        onSave={(next) => renameChecklistItem(r.id, next)}
      />
    </ChecklistItemRow>
  );
}

function AddItem({ taskId }: { taskId: string }) {
  const { run } = useRun();
  return (
    <AddChecklistItem
      onAdd={(titles, putBack) =>
        titles.length === 1
          ? run(() => addChecklistItem(taskId, titles[0]), { failed: () => putBack(titles[0]) })
          : run(() => addChecklistItems(taskId, titles))
      }
    />
  );
}
