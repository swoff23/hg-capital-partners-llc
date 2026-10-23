"use client";
import { useOptimistic, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { addChecklistItem, setChecklistItem } from "./actions";
import { useRun } from "./use-run";

export type ChecklistRow = { id: string; title: string; done: boolean };

/** "Checklist 2/5" with a thin progress bar, tick-off rows, and "Add item". */
export function Checklist({ taskId, items }: { taskId: string; items: ChecklistRow[] }) {
  const { run } = useRun();
  const [rows, setRow] = useOptimistic(items, (cur, p: { id: string; done: boolean }) =>
    cur.map((r) => (r.id === p.id ? { ...r, done: p.done } : r)),
  );
  const done = rows.filter((r) => r.done).length;

  return (
    <section aria-labelledby="checklist-heading">
      <div className="flex items-baseline gap-1.5">
        <h2 id="checklist-heading" className="text-sm font-semibold">
          Checklist
        </h2>
        {rows.length > 0 && (
          <span className="text-xs tabular-nums text-muted">
            {done}/{rows.length}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <div
          className="mt-2 h-0.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Checklist progress"
          aria-valuemin={0}
          aria-valuemax={rows.length}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full bg-green-600 transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(done / rows.length) * 100}%` }}
          />
        </div>
      )}
      <ul className="mt-1">
        {rows.map((r) => (
          <li key={r.id} className="flex min-h-9 items-center gap-2.5 pointer-coarse:min-h-11">
            <button
              type="button"
              role="checkbox"
              aria-checked={r.done}
              aria-label={r.title}
              onClick={() => run(() => setChecklistItem(r.id, !r.done), { before: () => setRow({ id: r.id, done: !r.done }) })}
              className={cn(
                "relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
                "after:absolute after:-inset-2.5 pointer-coarse:after:-inset-3.5",
                r.done ? "border-green-600 bg-green-600 text-white" : "border-muted/50 text-transparent hover:border-green-600 hover:text-green-600",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            </button>
            <span className={cn("min-w-0 flex-1 break-words text-sm", r.done && "text-muted line-through")}>{r.title}</span>
          </li>
        ))}
      </ul>
      <AddItem taskId={taskId} />
    </section>
  );
}

function AddItem({ taskId }: { taskId: string }) {
  const { run } = useRun();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-1 mt-0.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-sm text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 pointer-coarse:h-11"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
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
      <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-muted/50" aria-hidden="true" />
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
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (title.trim()) add();
          setOpen(false);
        }}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
      />
    </div>
  );
}
