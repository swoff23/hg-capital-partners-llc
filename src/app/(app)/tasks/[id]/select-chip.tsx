"use client";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { pickerChip } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * A picker chip (same look as the date and assignee chips) over a native
 * select, so phones get their own wheel or list and a mouse gets the
 * browser's menu. The select is transparent and covers the chip and its
 * touch hit area.
 */
export function SelectChip({
  label,
  icon,
  value,
  options,
  emptyOption,
  placeholder,
  onChange,
  disabled,
  className,
}: {
  /** The select's accessible name. */
  label: string;
  icon: ReactNode;
  value: string | null;
  options: readonly { value: string; label: string }[];
  /** The "none" choice at the top, e.g. "No property". Omit to require a pick. */
  emptyOption?: string;
  /** The chip's text when nothing is picked. */
  placeholder: ReactNode;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const text = current?.label ?? value;
  return (
    <span
      className={cn(
        pickerChip,
        "has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-primary/30",
        !text && "text-muted",
        disabled && "opacity-50",
        className,
      )}
    >
      {icon}
      <span className="truncate">{text || placeholder}</span>
      <ChevronDown className="text-muted" aria-hidden="true" />
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 pointer-coarse:-inset-y-2 pointer-coarse:h-auto"
      >
        {emptyOption !== undefined && <option value="">{emptyOption}</option>}
        {/* A stored value that isn't in the list (an imported unit) still shows. */}
        {value && !current && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
