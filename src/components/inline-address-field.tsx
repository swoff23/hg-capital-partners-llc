"use client";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { inlineEditCommit } from "@/lib/inline-edit";
import { cn } from "@/lib/utils";
import { useInlineEditKeys } from "./use-inline-edit-keys";

const supportsFieldSizing = () => typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");

// The page's h1 on the title token, editable or not. font-semibold repeats
// the token's weight so a caller's size override (the task title) keeps it.
const text = "rounded-md px-2 py-1 pr-6 text-title font-semibold text-fg-1";

/**
 * Page heading, editable in place: commits on blur / Enter, reverts on Escape,
 * re-syncs when the server value changes. Shared by the deal and property
 * detail pages (an address) and the task page (its title); `onCommit` is
 * whatever server action applies the change. A value shorter than
 * `minLength` reverts instead of saving. `multiline` lets a long heading wrap
 * (a textarea that grows with it); Enter still commits, so it stays one line
 * of text. `heading` shows the value as the page's h1, sized to its text and
 * wrapping, and swaps in the field on a click or tap (the property page).
 */
export function InlineAddressField({
  value,
  onCommit,
  label = "Address",
  minLength = 1,
  multiline = false,
  heading = false,
  className,
}: {
  value: string;
  onCommit: (value: string) => Promise<unknown> | void;
  /** The field's accessible name. */
  label?: string;
  minLength?: number;
  multiline?: boolean;
  /** Show the value as the page's h1 until it's clicked or tapped. */
  heading?: boolean;
  /** Extra classes for the field, e.g. a struck-through closed task. */
  className?: string;
}) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  const [editing, setEditing] = useState(!heading);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const line = useRef<HTMLInputElement>(null);
  if (value !== seen) {
    setSeen(value);
    setV(value);
  }

  // Grow the textarea to its text where field-sizing:content can't. Where it
  // can, no inline height is set: one would override it and go stale. The
  // fallback measures again whenever the width changes (a rotated phone, a
  // narrower window), or the extra lines would be cut off.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || supportsFieldSizing()) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      // Only a width change rewraps the text; the height this sets fires it too.
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [v, multiline, editing]);

  // Swapped in for the heading: focus it, caret after the text.
  useLayoutEffect(() => {
    if (!heading || !editing) return;
    const el = multiline ? area.current : line.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [heading, editing, multiline]);

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
  const keys = useInlineEditKeys(() => setV(value), commit);

  // A desktop hover cue only; touch has no hover, and a tap opens the field.
  const pencil = (
    <Pencil
      aria-hidden="true"
      strokeWidth={1.5}
      className={cn(
        "pointer-events-none absolute right-2 h-4 w-4 text-fg-3 opacity-0 transition-opacity group-hover/addr:opacity-100",
        multiline || heading ? "top-3" : "top-1/2 -translate-y-1/2",
      )}
    />
  );

  if (!editing) {
    return (
      <h1 className="group/addr relative -mx-2 min-w-0">
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(true)}
          className={cn(
            text,
            "text-balance text-left transition-colors [overflow-wrap:anywhere] hover:bg-fill-1 disabled:opacity-40",
            className,
          )}
        >
          {v}
        </button>
        {pencil}
      </h1>
    );
  }

  const props = {
    "aria-label": label,
    value: v,
    disabled: pending,
    // Enter commits and Esc reverts without saving (see useInlineEditKeys); a heading goes back to text either way.
    onBlur: () => {
      keys.onBlur();
      if (heading) setEditing(false);
    },
    onKeyDown: keys.onKeyDown,
    className: cn(
      text,
      // Editing reads as a field: --surface with the focus edge (an --act ring, 2px inside).
      "w-full bg-transparent outline-none transition-colors hover:bg-fill-1 focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-act disabled:opacity-40",
      // field-sizing gets the height right before hydration where it's supported; the effect covers the rest.
      multiline && "block resize-none overflow-hidden [field-sizing:content]",
      className,
    ),
  };

  return (
    <div className={cn("group/addr relative -mx-2", heading && "w-full")}>
      {multiline ? (
        <textarea ref={area} rows={1} onChange={(e) => setV(e.target.value)} {...props} />
      ) : (
        <input ref={line} onChange={(e) => setV(e.target.value)} {...props} />
      )}
      {pencil}
    </div>
  );
}
