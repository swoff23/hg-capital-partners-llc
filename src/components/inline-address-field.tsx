"use client";
import { useState, useTransition } from "react";

/**
 * Page heading, editable in place: commits on blur / Enter, reverts on Escape,
 * re-syncs when the server value changes. Shared by the deal and property
 * detail pages; `onCommit` is whatever server action applies the change.
 */
export function InlineAddressField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (address: string) => Promise<unknown> | void;
}) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  const [pending, start] = useTransition();
  if (value !== seen) {
    setSeen(value);
    setV(value);
  }

  function commit() {
    const trimmed = v.trim();
    if (!trimmed || trimmed === value) {
      setV(value);
      return;
    }
    start(async () => {
      await onCommit(trimmed);
    });
  }

  return (
    <div className="group/addr relative -mx-2">
      <input
        aria-label="Address"
        value={v}
        disabled={pending}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setV(value);
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-md bg-transparent px-2 py-1 pr-6 text-xl font-semibold tracking-tight text-foreground outline-none transition-colors hover:bg-background focus:bg-background focus:ring-2 focus:ring-primary/20 disabled:opacity-40"
      />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted opacity-0 transition-opacity group-hover/addr:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      >
        <path d="M11.3 2.3a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-7.2 7.2-3 .8.8-3 7.2-7.2Z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
