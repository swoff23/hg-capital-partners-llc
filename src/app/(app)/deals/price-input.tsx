"use client";
import { useState } from "react";
import { Money } from "@/components/money";
import { useInlineEditKeys } from "@/components/use-inline-edit-keys";
import { cn } from "@/lib/utils";
import { inlineFieldClass } from "./fields";

/**
 * A deal price edited in place. The field holds the text as it was typed
 * ("425k", "low 400s"); at rest the parsed amount shows over it through Money
 * (whole dollars, tabular figures), and the typed text comes back while the
 * field has focus. Text that isn't one number shows as typed; no price is the
 * dash. Enter saves, Esc puts the stored text back, and only a real change
 * reaches `onCommit`.
 */
export function PriceInput({
  raw,
  amount,
  onCommit,
  label,
  align = "left",
  disabled = false,
  className,
}: {
  /** The stored text, or null. */
  raw: string | null;
  /** The stored text read as dollars, or null when it isn't one number. */
  amount: number | null;
  onCommit: (next: string) => void;
  /** The field's accessible name ("Their price"). */
  label: string;
  /** Right in a list column, so the figures line up; left in the details. */
  align?: "left" | "right";
  /** While a save is on its way. */
  disabled?: boolean;
  /** Height and any extras for the field. */
  className?: string;
}) {
  const stored = raw ?? "";
  const [v, setV] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setV(stored);
  }

  function commit() {
    const next = v.trim();
    if (next === stored.trim()) return;
    onCommit(next);
  }
  const keys = useInlineEditKeys(() => setV(stored), commit);

  return (
    <div className="relative min-w-0">
      <input
        aria-label={label}
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={keys.onBlur}
        onKeyDown={keys.onKeyDown}
        className={cn(
          inlineFieldClass,
          "peer tabular-nums text-transparent focus:text-fg-1",
          align === "right" && "text-right",
          className,
        )}
      />
      {/* Drawn on the field's own box (edge and padding), so the figure sits where the text will be. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center overflow-hidden border border-transparent px-2 text-body peer-focus:hidden",
          align === "right" && "justify-end",
          disabled && "opacity-50",
        )}
      >
        {/* Too long for the column, a figure shrinks and ends in an ellipsis; it never loses its leading digits. */}
        {v === stored && amount != null ? (
          <Money value={amount} className="min-w-0 truncate" />
        ) : v ? (
          <span className="min-w-0 truncate">{v}</span>
        ) : (
          <span className="text-fg-3">—</span>
        )}
      </span>
    </div>
  );
}
