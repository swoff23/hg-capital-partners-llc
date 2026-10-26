"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { updateTask } from "./actions";
import { useRun } from "@/components/use-run";

/**
 * The task's notes: a textarea that grows with its text and saves when it
 * loses focus. Notes are always visible to the assigned contractor (D16), so
 * the line above says who'll see them, and that it waits for their login
 * when they don't have one yet (G2B-I03).
 */
export function NotesField({
  taskId,
  value,
  visibleTo,
  hasLogin,
}: {
  taskId: string;
  value: string | null;
  visibleTo: string | null;
  hasLogin: boolean;
}) {
  const { run, pending } = useRun();
  const [text, setText] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  if (value !== seen) {
    setSeen(value);
    setText(value ?? "");
  }

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  function commit() {
    if (text.trim() === (value ?? "").trim()) return;
    run(() => updateTask(taskId, { description: text.trim() ? text : null }));
  }

  return (
    <div>
      {visibleTo && (
        <p className="mb-1 flex items-center gap-1.5 text-meta text-fg-3">
          <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          {hasLogin ? `Visible to ${visibleTo}` : `${visibleTo} sees notes after signing in`}
        </p>
      )}
      <textarea
        ref={ref}
        aria-label="Notes"
        value={text}
        rows={2}
        placeholder="Add notes"
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        // Reads as text until it's touched, then as a field, like the title: --fill-1 on hover, --surface with the 2px --act edge inside on focus.
        className="-mx-2 block w-[calc(100%+1rem)] resize-none overflow-hidden rounded-md bg-transparent px-2 py-1.5 text-body text-fg-1 outline-none transition-colors placeholder:text-fg-3 hover:bg-fill-1 focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-act"
      />
    </div>
  );
}
