"use client";
import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { NumberInput, numberProblem } from "@/components/number-input";
import { useRun } from "@/components/use-run";
import { FormField, textLinkClass } from "@/components/ui";
import type { LineFigures } from "@/lib/draws/figures";
import { setDraftAmountAction } from "../actions";
import { optionalAmountText } from "../format";

/**
 * A phone's tap on a budget line: a small sheet with only the draft amount, which is what's typed there. "Edit line"
 * goes on to the full Line sheet (name, unit, budget, delete).
 */
export function DraftSheet({
  line,
  isOpen,
  onOpenChange,
  onEditLine,
}: {
  line: LineFigures;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEditLine: () => void;
}) {
  const start = optionalAmountText(line.draft);
  const [text, setText] = useState(start);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useRun();

  function submit() {
    const bad = numberProblem("money", text);
    if (bad) {
      setProblem(bad);
      return;
    }
    if (text === start) {
      onOpenChange(false);
      return;
    }
    run.run(() => setDraftAmountAction(line.id, text), { failure: "inline", succeeded: () => onOpenChange(false) });
  }

  const error = problem ?? run.fieldErrors?.draft;
  return (
    <FormSheet
      title={line.unitLabel ? `${line.unitLabel} · ${line.name}` : line.name}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary="Save draft"
      pending={run.pending}
      values={text}
      discardTitle="Discard this draft amount?"
      leaveTitle="Leave without saving the draft?"
      error={run.fieldErrors?.draft ? undefined : run.error}
      fieldErrors={run.fieldErrors}
    >
      <FormField label="Draft" error={error}>
        {(p) => (
          <NumberInput
            kind="money"
            {...p}
            value={text}
            onChange={(next) => {
              setText(next);
              setProblem(null);
              if (run.error) run.reset();
            }}
          />
        )}
      </FormField>
      <div>
        <button type="button" className={textLinkClass} onClick={onEditLine}>
          Edit line
        </button>
      </div>
    </FormSheet>
  );
}
