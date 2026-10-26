"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { Check, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { InlineField } from "@/components/inline-field";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Meter } from "@/components/meter";
import { useToast } from "@/components/toast";
import { Section, buttonClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { addChecklistItem, setChecklistItem } from "./actions";
import { removeChecklistItem, renameChecklistItem, restoreChecklistItem } from "./checklist-actions";

export type ChecklistRow = { id: string; title: string; done: boolean };

/** An optimistic change to the rows: a tick, or an item taken off while its removal saves. */
type Change = { id: string; done: boolean } | { id: string; removed: true };

/**
 * "Checklist 2/5" over a hairline, a 4px meter of how many are ticked,
 * tick-off rows, and "Add item". The boxes are round, on a --line-control
 * edge; ticked, they fill with ink (--act), as every checked control does
 * (docs/brand-guidelines.md, section 9). At 5 of 5 the count becomes a check
 * and "All done". An item's words are its own InlineField: a click renames it
 * in place, Enter saves, Esc puts the old words back. Each item's ⋯ menu
 * holds Delete, which takes it off at once and toasts with Undo (BTASKS-024).
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
              <span className="ml-1 font-normal tabular-nums text-fg-3">
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
        key: `checklist:${r.id}`,
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
    <li className="group/item flex min-h-9 items-center gap-2.5 pointer-coarse:min-h-11">
      <button
        type="button"
        role="checkbox"
        aria-checked={r.done}
        aria-label={r.title}
        onClick={onTick}
        className={cn(
          "relative flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
          "after:absolute after:-inset-2.5 pointer-coarse:after:-inset-3.5",
          r.done ? "border-act bg-act text-on-act" : "border-line-control text-transparent hover:border-fg-1",
        )}
      >
        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 items-center">
        <InlineField
          kind="text"
          label="Checklist item"
          value={r.title}
          minLength={1}
          blank="Enter a name for the item."
          wrap
          inRail={false}
          message={() => "Item renamed"}
          className={cn(r.done && "text-fg-3 line-through")}
          onSave={(next) => renameChecklistItem(r.id, next)}
        />
      </div>
      <MenuTrigger>
        <AriaButton
          aria-label={`${r.title} actions`}
          className={cn(
            buttonClass({ variant: "ghost", size: "sm", icon: true }),
            "-mr-2 shrink-0 text-fg-3 data-pressed:bg-fill-1",
            // With a mouse the menu shows on the row; touch has no hover, so it stays.
            "pointer-fine:opacity-0 pointer-fine:focus-visible:opacity-100 pointer-fine:group-hover/item:opacity-100 pointer-fine:data-pressed:opacity-100",
          )}
        >
          <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </AriaButton>
        <Menu sheetTitle="Checklist item">
          <MenuItem variant="destructive" icon={<Trash2 />} onAction={remove}>
            Delete item
          </MenuItem>
        </Menu>
      </MenuTrigger>
    </li>
  );
}

function AddItem({ taskId }: { taskId: string }) {
  const { run } = useRun();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Esc closes the row, and a browser may fire blur as the input goes away,
  // with the typed text still in that render's handler. This keeps that blur from adding it.
  const cancelled = useRef(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-1 mt-0.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-label text-fg-2 transition-colors hover:text-fg-1 pointer-coarse:h-11"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add item
      </button>
    );
  }

  function add() {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    // Put the text back if it didn't save, unless something newer was typed since.
    run(() => addChecklistItem(taskId, t), { failed: () => setTitle((cur) => cur || t) });
    input.current?.focus();
  }

  return (
    <div className="mt-0.5 flex min-h-9 items-center gap-2.5 pointer-coarse:min-h-11">
      <span className="size-4.5 shrink-0 rounded-full border border-dashed border-line-control" aria-hidden="true" />
      <input
        ref={input}
        autoFocus
        aria-label="New checklist item"
        placeholder="Add item"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
          if (e.key === "Escape") {
            cancelled.current = true;
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!cancelled.current && title.trim()) add();
          cancelled.current = false;
          setOpen(false);
        }}
        className="min-w-0 flex-1 bg-transparent text-body text-fg-1 outline-none placeholder:text-fg-3"
      />
    </div>
  );
}
