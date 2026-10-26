"use client";
import { useOptimistic, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Section } from "@/components/ui";
import { cn } from "@/lib/utils";
import { addChecklistItem, setChecklistItem } from "./actions";
import { useRun } from "@/components/use-run";

export type ChecklistRow = { id: string; title: string; done: boolean };

/**
 * "Checklist 2/5" over a hairline, a thin progress bar, tick-off rows, and
 * "Add item". The boxes are round, on a --line-control edge; ticked, they
 * fill with ink (--act), as every checked control does
 * (docs/brand-guidelines.md, section 9).
 */
export function Checklist({ taskId, items }: { taskId: string; items: ChecklistRow[] }) {
  const { run } = useRun();
  const [rows, setRow] = useOptimistic(items, (cur, p: { id: string; done: boolean }) =>
    cur.map((r) => (r.id === p.id ? { ...r, done: p.done } : r)),
  );
  const done = rows.filter((r) => r.done).length;

  return (
    <Section
      title={
        <>
          Checklist
          {/* The space keeps the heading's name "Checklist 2/5", not "Checklist2/5". */}
          {rows.length > 0 && " "}
          {rows.length > 0 && (
            <span className="ml-1 font-normal tabular-nums text-fg-3">
              {done}/{rows.length}
            </span>
          )}
        </>
      }
    >
      {rows.length > 0 && (
        <div
          className="mb-1 h-0.5 overflow-hidden rounded-full bg-fill-1"
          role="progressbar"
          aria-label="Checklist progress"
          aria-valuemin={0}
          aria-valuemax={rows.length}
          aria-valuenow={done}
        >
          <div
            // It moves with the tick: the check's spring.
            className="h-full rounded-full bg-act transition-[width] duration-check ease-spring motion-reduce:transition-none"
            style={{ width: `${(done / rows.length) * 100}%` }}
          />
        </div>
      )}
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="flex min-h-9 items-center gap-2.5 pointer-coarse:min-h-11">
            <button
              type="button"
              role="checkbox"
              aria-checked={r.done}
              aria-label={r.title}
              onClick={() => run(() => setChecklistItem(r.id, !r.done), { before: () => setRow({ id: r.id, done: !r.done }) })}
              className={cn(
                "relative flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                "after:absolute after:-inset-2.5 pointer-coarse:after:-inset-3.5",
                r.done ? "border-act bg-act text-on-act" : "border-line-control text-transparent hover:border-fg-1",
              )}
            >
              <Check className="size-3" strokeWidth={3} aria-hidden="true" />
            </button>
            <span className={cn("min-w-0 flex-1 break-words text-body", r.done ? "text-fg-3 line-through" : "text-fg-1")}>
              {r.title}
            </span>
          </li>
        ))}
      </ul>
      <AddItem taskId={taskId} />
    </Section>
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
