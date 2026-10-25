"use client";
import { useState, useTransition } from "react";
import { useInlineEditKeys } from "@/components/use-inline-edit-keys";
import { cn } from "@/lib/utils";
import { patchDeal } from "./actions";
import { inlineFieldClass, noSpinnerClass } from "./fields";
import { PriceInput } from "./price-input";
import { StageSelect } from "./stage-select";

/*
 * The deal fields edited in place, shared by the list's rows and the deal
 * page's details: each saves itself on change or blur (Enter saves, Esc puts
 * the stored value back) and only a real change is sent. `onSaved` runs once
 * the save lands, for the list's row flash.
 */

type Patch = Parameters<typeof patchDeal>[1];

function usePatch(id: string, onSaved?: () => void) {
  const [pending, start] = useTransition();
  const run = (patch: Patch) =>
    start(async () => {
      await patchDeal(id, patch);
      onSaved?.();
    });
  return { pending, run };
}

/**
 * The stage, as a StageSelect. It shows the pick at once and dims while the
 * save runs, but stays enabled: a focused control that turns disabled drops
 * focus to the page, which would lose a keyboard user's place in the list
 * after every pick. A second pick queues behind the first.
 */
export function DealStageField({
  id,
  status,
  fieldSize,
  className,
  onSaved,
}: {
  id: string;
  status: string;
  fieldSize?: "cell" | "sm" | "md";
  className?: string;
  onSaved?: () => void;
}) {
  const { pending, run } = usePatch(id, onSaved);
  const [shown, setShown] = useState(status);
  const [seen, setSeen] = useState(status);
  if (status !== seen) {
    setSeen(status);
    setShown(status);
  }

  return (
    <StageSelect
      aria-label="Status"
      value={shown}
      aria-busy={pending || undefined}
      fieldSize={fieldSize}
      className={cn(pending && "opacity-50", className)}
      onChange={(e) => {
        setShown(e.target.value);
        run({ status: e.target.value });
      }}
    />
  );
}

/** Their price or our price: typed text kept, the amount shown through Money. */
export function DealPriceField({
  id,
  which,
  raw,
  amount,
  align,
  emptyLabel,
  className,
  onSaved,
}: {
  id: string;
  which: "their" | "our";
  raw: string | null;
  amount: number | null;
  align?: "left" | "right";
  /** What it reads empty: the dash (a list cell), or a verb (the deal's rail). */
  emptyLabel?: string;
  className?: string;
  onSaved?: () => void;
}) {
  const { pending, run } = usePatch(id, onSaved);
  return (
    <PriceInput
      raw={raw}
      amount={amount}
      label={which === "their" ? "Their price" : "Our price"}
      align={align}
      disabled={pending}
      emptyLabel={emptyLabel}
      className={className}
      onCommit={(next) => run(which === "their" ? { theirPriceRaw: next || null } : { ourPriceRaw: next || null })}
    />
  );
}

/** Units: a whole number of one or more, or empty. Anything else puts the stored value back. */
export function DealUnitsField({
  id,
  value,
  align = "left",
  emptyLabel = "—",
  className,
  onSaved,
}: {
  id: string;
  value: number | null;
  align?: "left" | "right";
  /** What it reads empty: the dash (a list cell), or a verb (the deal's rail). */
  emptyLabel?: string;
  className?: string;
  onSaved?: () => void;
}) {
  const { pending, run } = usePatch(id, onSaved);
  const [v, setV] = useState(value?.toString() ?? "");
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setV(value?.toString() ?? "");
  }

  function commit() {
    const trimmed = v.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    // A deal has at least one unit (the New deal form asks for a positive number too).
    const next = parsed != null && (Number.isNaN(parsed) || parsed < 1) ? value : parsed;
    if (next !== value) run({ units: next });
    setV(next?.toString() ?? "");
  }
  const keys = useInlineEditKeys(() => setV(value?.toString() ?? ""), commit);

  return (
    <input
      aria-label="Units"
      type="number"
      inputMode="numeric"
      min={1}
      value={v}
      disabled={pending}
      placeholder={emptyLabel}
      onChange={(e) => setV(e.target.value)}
      onBlur={keys.onBlur}
      onKeyDown={keys.onKeyDown}
      className={cn(inlineFieldClass, noSpinnerClass, "tabular-nums", align === "right" && "text-right", className)}
    />
  );
}

/** A line of text: the next action, or the listing URL. Empty clears it. */
export function DealTextField({
  id,
  value,
  patchKey,
  label,
  placeholder,
  type = "text",
  className,
  onSaved,
}: {
  id: string;
  value: string | null;
  patchKey: "nextAction" | "sourceUrl";
  /** The field's accessible name. */
  label: string;
  placeholder?: string;
  type?: "text" | "url";
  className?: string;
  onSaved?: () => void;
}) {
  const { pending, run } = usePatch(id, onSaved);
  const stored = value ?? "";
  const [v, setV] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setV(stored);
  }

  function commit() {
    const next = v.trim() || null;
    if ((next ?? "") === stored.trim()) return;
    run(patchKey === "nextAction" ? { nextAction: next } : { sourceUrl: next });
  }
  const keys = useInlineEditKeys(() => setV(stored), commit);

  return (
    <input
      aria-label={label}
      type={type}
      value={v}
      disabled={pending}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={keys.onBlur}
      onKeyDown={keys.onKeyDown}
      className={cn(inlineFieldClass, "text-ellipsis", className)}
    />
  );
}
