"use client";
import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { NumberInput, numberProblem } from "@/components/number-input";
import { useRun } from "@/components/use-run";
import { Button, FormField } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { NEXT_STAGE, NEXT_STEP_LABEL, STAGE_LABEL, type DrawStage } from "@/lib/draws/figures";
import { advanceDrawAction, restoreDrawStageAction } from "./actions";
import { amountText, fmtCents } from "./format";

/** What the button needs of a draw. */
export type NextStepDraw = {
  id: string;
  number: number;
  stage: DrawStage;
  sentAmount: number | null;
  approvedAmount: number | null;
};

/**
 * The next-step button (docs/specs/rehab-draws.md): one stage on from where a draw is. Sent goes to Inspection in
 * one tap; Inspection asks the approved amount and Approved what landed, each in a small sheet. Every move toasts
 * what happened with Undo, which puts the draw back as it was. Renders nothing for a draw with no next stage.
 */
export function NextStep({
  draw,
  short = false,
  className,
}: {
  draw: NextStepDraw;
  /**
   * Inside an `@container` under 20rem (a 320 phone's Draws row), the button reads only the stage it moves to
   * ("Approved"), so the draw's amount beside it is never cut off. Its accessible name keeps the full label.
   */
  short?: boolean;
  className?: string;
}) {
  const label = NEXT_STEP_LABEL[draw.stage];
  const next = NEXT_STAGE[draw.stage];
  const run = useRun();
  const [asking, setAsking] = useState(false);
  if (!label || !next) return null;

  /** Toasts the move with Undo. `words` is what happened ("moved to Inspection"). */
  function moved(words: (amount: number | null) => string, data: { amount: number | null; before: Parameters<typeof restoreDrawStageAction>[1] }) {
    run.toast({
      message: words(data.amount),
      key: `draw:${draw.id}:step`,
      action: {
        label: "Undo",
        onAction: async () => {
          const r = await callAction(() => restoreDrawStageAction(draw.id, data.before));
          if (!r.ok) run.toast({ message: r.error });
        },
      },
    });
  }

  function tap() {
    if (draw.stage !== "SENT") {
      setAsking(true);
      return;
    }
    run.run(() => advanceDrawAction(draw.id, null), {
      succeeded: (data) => moved(() => `Draw ${draw.number} moved to ${STAGE_LABEL[next!]}`, data),
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" pending={run.pending} onClick={tap} className={className} aria-label={short ? label : undefined}>
        {short ? (
          <>
            <span className="@max-[20rem]:hidden">{label}</span>
            <span className="@min-[20rem]:hidden">{STAGE_LABEL[next]}</span>
          </>
        ) : (
          label
        )}
      </Button>
      {asking && <AmountSheet draw={draw} onOpenChange={setAsking} onMoved={moved} />}
    </>
  );
}

function AmountSheet({
  draw,
  onOpenChange,
  onMoved,
}: {
  draw: NextStepDraw;
  onOpenChange: (open: boolean) => void;
  onMoved: (words: (amount: number | null) => string, data: { amount: number | null; before: Parameters<typeof restoreDrawStageAction>[1] }) => void;
}) {
  const approving = draw.stage === "INSPECTION";
  const [text, setText] = useState(amountText(approving ? draw.sentAmount : draw.approvedAmount));
  const [problem, setProblem] = useState<string | null>(null);
  const run = useRun();

  function submit() {
    const bad = numberProblem("money", text, { required: true });
    if (bad) {
      setProblem(bad);
      return;
    }
    run.run(() => advanceDrawAction(draw.id, text), {
      failure: "inline",
      succeeded: (data) => {
        onOpenChange(false);
        onMoved((amount) => `Draw ${draw.number} ${approving ? "approved" : "funded"} · ${fmtCents(amount ?? 0)}`, data);
      },
    });
  }

  const error = problem ?? run.fieldErrors?.amount;
  return (
    <FormSheet
      title={approving ? `Approve draw ${draw.number}` : `Draw ${draw.number} funded`}
      isOpen
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={approving ? "Approve" : "Mark funded"}
      pending={run.pending}
      values={text}
      discardTitle="Discard this?"
      leaveTitle={`Leave Draw ${draw.number}?`}
      error={run.fieldErrors?.amount ? undefined : run.error}
      fieldErrors={run.fieldErrors}
    >
      <FormField label={approving ? "Approved amount" : "What landed"} error={error}>
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
    </FormSheet>
  );
}
