"use client";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { inlineEditCommit } from "@/lib/inline-edit";
import { cn } from "@/lib/utils";

/**
 * Page heading, editable in place: commits on blur / Enter, reverts on Escape,
 * re-syncs when the server value changes. Shared by the deal and property
 * detail pages (an address) and the task page (its title); `onCommit` is
 * whatever server action applies the change. A value shorter than
 * `minLength` reverts instead of saving. `multiline` lets a long heading wrap
 * (a textarea that grows with it); Enter still commits, so it stays one line
 * of text.
 */
export function InlineAddressField({
  value,
  onCommit,
  label = "Address",
  minLength = 1,
  multiline = false,
  className,
}: {
  value: string;
  onCommit: (value: string) => Promise<unknown> | void;
  /** The field's accessible name. */
  label?: string;
  minLength?: number;
  multiline?: boolean;
  /** Extra classes for the field, e.g. a struck-through closed task. */
  className?: string;
}) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  if (value !== seen) {
    setSeen(value);
    setV(value);
  }

  // Grow the textarea to its text.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [v, multiline]);

  function commit() {
    // Only a real edit saves: focus and blur alone never rewrite the stored value.
    const trimmed = inlineEditCommit(v, value, minLength);
    if (trimmed === null) {
      setV(value);
      return;
    }
    start(async () => {
      await onCommit(trimmed);
    });
  }

  const props = {
    "aria-label": label,
    value: v,
    disabled: pending,
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      }
      if (e.key === "Escape") {
        setV(value);
        e.currentTarget.blur();
      }
    },
    className: cn(
      "w-full rounded-md bg-transparent px-2 py-1 pr-6 text-xl font-semibold tracking-tight text-foreground outline-none transition-colors hover:bg-background focus:bg-background focus:ring-2 focus:ring-primary/20 disabled:opacity-40",
      // field-sizing gets the height right before hydration where it's supported; the effect covers the rest.
      multiline && "block resize-none overflow-hidden [field-sizing:content]",
      className,
    ),
  };

  return (
    <div className="group/addr relative -mx-2">
      {multiline ? (
        <textarea ref={area} rows={1} onChange={(e) => setV(e.target.value)} {...props} />
      ) : (
        <input onChange={(e) => setV(e.target.value)} {...props} />
      )}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={cn(
          "pointer-events-none absolute right-2 h-4 w-4 text-muted opacity-0 transition-opacity group-hover/addr:opacity-100",
          multiline ? "top-2.5" : "top-1/2 -translate-y-1/2",
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      >
        <path d="M11.3 2.3a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-7.2 7.2-3 .8.8-3 7.2-7.2Z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
