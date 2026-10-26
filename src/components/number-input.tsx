"use client";
import type { FocusEvent } from "react";
import { Input, type InputProps } from "@/components/ui";
import { NUMBER_MESSAGE, readNumber, savesAs, tidyAmount, type NumberKind } from "@/lib/money";

export type { NumberKind };

export type NumberInputProps = Omit<
  InputProps,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "prefix" | "suffix"
> & {
  kind: NumberKind;
  /** The typed text, as the person typed it. Controlled with `onChange`, or `defaultValue` and `name` for a form. */
  value?: string;
  defaultValue?: string;
  onChange?: (text: string) => void;
  /** Deal prices: text that isn't one number ("low 400s") is kept as typed. The caller's helper says so (`numberHelper`). */
  allowText?: boolean;
  /** A unit inside the right edge ("sq ft", "yrs", "/mo" after money's "$"); a percent brings its own "%", a year takes none. */
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

/**
 * A number field (forms 2.3): always `type="text"`, so no spinners and no
 * browser rounding, with the keyboard and the unit slot its `kind` calls for
 * ("$" for money, "%" for percent, "sq ft" or "yrs" for a count). Parsing is
 * `parseAmount` from lib/money, so the browser and the server read "425k" the
 * same way.
 *
 * It accepts 425000, 425,000, $425k and 1.2m for money; 6.875 and 6.875% for
 * a rate; 1,200 for a count; a year from 1900 to next year; 1.5 for baths. On
 * blur a clean number tidies to its grouped form ("425000" becomes "425,000")
 * and anything else stays as typed, a fraction in an `integer` field
 * included, so Save shows the form's own error line for it instead of blur
 * rounding it to something nobody typed.
 *
 * The two lines under the field are the form's: put them through `FormField`
 * with `numberHelper` while typing ("Saves as $425,000", or "Kept as text, no
 * amount" for a deal price) and `numberProblem` once the field was left or the
 * form sent ("Enter an amount, like 425,000."):
 *
 *   <FormField label="Asking price" optional helper={numberHelper("money", v, { allowText: true })} error={problem}>
 *     {(p) => <NumberInput kind="money" allowText value={v} onChange={setV} {...p} />}
 *   </FormField>
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
  enterKeyHint = "next",
  className,
  ...props
}: NumberInputProps) {
  void allowText;

  function onLeave(e: FocusEvent<HTMLInputElement>) {
    onBlur?.(e);
    const next = tidyAmount(kind, e.currentTarget.value);
    if (next === null || next === e.currentTarget.value) return;
    if (value === undefined) e.currentTarget.value = next;
    onChange?.(next);
  }

  return (
    <Input
      autoComplete="off"
      {...props}
      type="text"
      inputMode={INPUT_MODE[kind]}
      enterKeyHint={enterKeyHint}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onLeave}
      prefix={kind === "money" ? "$" : undefined}
      suffix={kind === "percent" ? "%" : kind === "year" ? undefined : suffix}
      className={className}
      style={align === "end" ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : undefined}
    />
  );
}

/**
 * The line under a number field while typing: how it will save when that
 * isn't what was typed ("Saves as $425,000"), "Kept as text, no amount" for a
 * deal price that isn't one number, else the field's own helper.
 */
export function numberHelper(kind: NumberKind, text: string, opts: { allowText?: boolean; fallback?: string } = {}): string | undefined {
  return savesAs(kind, text, { allowText: opts.allowText }) ?? opts.fallback;
}

/**
 * Why a number field's text won't save, or null: the kind's own line
 * ("Enter a rate, like 6.875."). A blank is fine unless the field is
 * `required` ("Enter an amount, like 425,000."). With `allowText`, text that
 * isn't a number is kept, not refused.
 */
export function numberProblem(kind: NumberKind, text: string, opts: { required?: boolean; allowText?: boolean } = {}): string | null {
  const read = readNumber(kind, text);
  if (read.ok) return opts.required && read.value === null ? NUMBER_MESSAGE[kind] : null;
  return opts.allowText ? null : read.message;
}
