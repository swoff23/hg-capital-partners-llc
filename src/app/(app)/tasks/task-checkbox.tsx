"use client";
import { useTransition } from "react";
import { toggleTask } from "./actions";

export function TaskCheckbox({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      aria-label={done ? "Mark open" : "Mark done"}
      disabled={pending}
      onClick={() => start(() => toggleTask(id))}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        done ? "border-green-600 bg-green-600 text-white" : "border-border bg-surface"
      } ${pending ? "opacity-50" : ""}`}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
        </svg>
      )}
    </button>
  );
}
