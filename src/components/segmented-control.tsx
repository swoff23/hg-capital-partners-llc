"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<K extends string> {
  key: K;
  label: ReactNode;
  /** Shown dimmed after the label. */
  count?: number;
  /**
   * A mark before the count, for a count that means something other than a
   * total: the Review ring in --warn before Contractors' "2", so the number
   * reads as "to review". The mark brings its own tone.
   */
  mark?: ReactNode;
  /** The segment's name when its label and count don't say it alone ("Contractors, 2 to review"). */
  ariaLabel?: string;
}

const SIZES = {
  // Filter bars (deals) and toolbars: compact, a 32px control beside h-8
  // fields with a mouse, 44px on touch. Segments are text-label at every
  // size (docs/brand-guidelines.md, section 3).
  sm: "h-7 px-2.5 text-label pointer-coarse:h-10",
  // A page's main switch (Mine | Contractors): a 36px control with a mouse, a
  // 44px target on touch. Its segments are 40px there like `sm`'s, inside the
  // 2px track, so it stands level with the 44px fields beside it.
  md: "h-8 px-3 text-label pointer-coarse:h-10",
};

/**
 * Pick one view or filter inside a page (CLAUDE.md, One switch per job).
 * A --fill-1 track with 2px around and between the segments; the selected
 * segment is --surface with a --line-control edge, so the pick never rests
 * on a pale fill alone (docs/brand-guidelines.md, section 9). Both states
 * keep one weight. Each segment is a pill toggle with `aria-pressed`, styled
 * from that attribute. Separate routes use `TopTabs` instead. `value` may be
 * null when nothing here is the current pick (another control is filtering).
 *
 * One tab stop: the picked segment (the first when none is). Left and Right,
 * Home and End move focus along the group; Enter or Space picks. Segments are
 * 4px shorter than the control, so on touch each carries a 2px strip above
 * and below and its target reaches 44px. `fullWidth` shares the width between
 * the segments: the phone's second row.
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  size = "sm",
  fullWidth = false,
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly SegmentOption<K>[];
  value: K | null;
  onChange: (key: K) => void;
  size?: keyof typeof SIZES;
  /**
   * Segments share the width instead of fitting their words. "below-sm" does
   * it on a phone only, where a list's views take a row of their own.
   */
  fullWidth?: boolean | "below-sm";
  className?: string;
  "aria-label": string;
}) {
  const group = useRef<HTMLDivElement>(null);
  // The tab stop sits on the pick, or on the first segment while nothing is picked.
  const stop = options.some((o) => o.key === value) ? value : options[0]?.key;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const buttons = Array.from(group.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || buttons.length === 0) return;
    const last = buttons.length - 1;
    const next =
      e.key === "ArrowRight" ? (at === last ? 0 : at + 1)
      : e.key === "ArrowLeft" ? (at === 0 ? last : at - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    buttons[next].focus();
  }

  return (
    <div
      ref={group}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "items-center gap-0.5 rounded-md bg-fill-1 p-0.5",
        fullWidth === "below-sm" ? "flex w-full sm:inline-flex sm:w-auto sm:shrink-0" : fullWidth ? "flex w-full" : "inline-flex shrink-0",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          aria-label={o.ariaLabel}
          tabIndex={o.key === stop ? 0 : -1}
          onClick={() => onChange(o.key)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-fg-2 transition-colors hover:text-fg-1",
            "aria-pressed:bg-surface aria-pressed:text-fg-1 aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-line-control",
            // 2px above and below, so a 40px segment is a 44px target on touch.
            "pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-0.5",
            fullWidth === "below-sm" ? "min-w-0 flex-1 sm:flex-none" : fullWidth && "min-w-0 flex-1",
            SIZES[size],
          )}
        >
          {o.label}
          {(o.count !== undefined || o.mark) && (
            <span className="ml-1 inline-flex items-center gap-1 tabular-nums text-fg-3">
              {o.mark}
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
