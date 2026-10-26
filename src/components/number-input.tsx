"use client";
import type { FocusEvent } from "react";
import { Input, type InputProps } from "@/components/ui";
import { parseAmount } from "@/lib/money";

/** What a number field holds, which sets its keyboard, its slot and what it accepts (forms 2.3). */
export type NumberKind = "money" | "percent" | "integer" | "year" | "decimal";

export type NumberInputProps = Omit<
  InputProps,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "prefix" | "suffix"
> & {
  kind: NumberKind;
  /** The typed text, as the person typed it. Controlled with `onChange`, or `defaultValue` and `name` for a form. */
  value?: string;
  defaultValue?: string;
  onChange?: (text: string) => void;
  /** Deal prices: text that isn't one number ("low 400s") is kept as typed. */
  allowText?: boolean;
  /** A unit inside the right edge for `integer` and `decimal` ("sq ft", "yrs"); money and percent bring their own. */
  suffix?: string;
  /** "end" right-aligns with tabular figures, for table cells. */
  align?: "start" | "end";
};

const INPUT_MODE: Record<NumberKind, "decimal" | "numeric"> = {
  money: "decimal",
  percent: "decimal",
  decimal: "decimal",
  integer: "numeric",
  year: "numeric",
};

/** How a parsed amount reads once the field is left: "425,000", "6.875", "1,200", "2014". */
function tidy(kind: NumberKind, n: number): string {
  switch (kind) {
    case "money":
      return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    case "integer":
      return Math.round(n).toLocaleString("en-US");
    case "year":
      return String(Math.round(n));
    default:
      return String(n);
  }
}

/**
 * A number field: always `type="text"`, so no spinners and no browser
 * rounding, with the keyboard and the unit slot its `kind` calls for ("$"
 * for money, "%" for percent). Parsing is `parseAmount` from lib/money, so
 * the browser and the server read "425k" the same way.
 *
 * Interim body (the forms package finishes it, props unchanged): on blur a
 * clean number tidies to its grouped form ("425000" becomes "425,000") and
 * anything else stays as typed. The "Saves as" helper and the per-kind error
 * lines come with the full build.
 */
export function NumberInput({
  kind,
  value,
  defaultValue,
  onChange,
  allowText = false,
  suffix,
  align = "start",
  onBlur,
  className,
  ...props
}: NumberInputProps) {
  // Kept as typed until the forms package adds the "Kept as text" preview and the error lines.
  void allowText;

  function onLeave(e: FocusEvent<HTMLInputElement>) {
    onBlur?.(e);
    const n = parseAmount(e.currentTarget.value);
    if (n === null) return;
    const next = tidy(kind, n);
    if (next === e.currentTarget.value) return;
    if (value === undefined) e.currentTarget.value = next;
    onChange?.(next);
  }

  return (
    <Input
      autoComplete="off"
      {...props}
      type="text"
      inputMode={INPUT_MODE[kind]}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onLeave}
      prefix={kind === "money" ? "$" : undefined}
      suffix={kind === "percent" ? "%" : kind === "integer" || kind === "decimal" ? suffix : undefined}
      className={className}
      style={align === "end" ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : undefined}
    />
  );
}
