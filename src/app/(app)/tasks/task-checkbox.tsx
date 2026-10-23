"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The round Done checkbox on task rows. An 18px circle inside a 44px hit
 * area (negative margins keep the row compact). The caller owns the state,
 * so a tap shows at once while the save runs.
 */
export function TaskCheckbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The task's title: screen readers hear "Call plumber, checkbox". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group/check -m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors",
          "group-focus-visible/check:ring-2 group-focus-visible/check:ring-primary/30",
          checked
            ? "border-green-600 bg-green-600 text-white"
            : "border-muted/60 text-transparent group-hover/check:border-green-600 group-hover/check:text-green-600",
        )}
      >
        <Check className="h-3 w-3" />
      </span>
    </button>
  );
}
