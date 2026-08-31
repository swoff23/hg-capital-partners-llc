"use client";
import { useTransition } from "react";
import { toggleTask } from "./actions";

export function TaskCheckbox({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={done ? "Mark open" : "Mark done"}
      aria-pressed={done}
      disabled={pending}
      onClick={() => start(() => toggleTask(id))}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
        done
          ? "border-green-600 bg-green-600 text-white"
          : "border-muted/50 text-muted/40 hover:border-green-600 hover:text-green-600"
      } ${pending ? "opacity-50" : ""}`}
    >
      {/* Always rendered: solid white when done, a faint hint otherwise so it's
          clear a click will check it. */}
      <svg
        viewBox="0 0 12 12"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
      </svg>
    </button>
  );
}
