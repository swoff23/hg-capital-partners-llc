"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePicker } from "@/components/due-date-picker";
import { FormSheet } from "@/components/form-sheet";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Money } from "@/components/money";
import { NumberInput, numberProblem } from "@/components/number-input";
import { useRun } from "@/components/use-run";
import { Button, FieldRow, FormField, buttonClass } from "@/components/ui";
import { dayOf, drawFee, linesTotal, STAGE_LABEL, type DrawIn, type DrawStage, type LineIn } from "@/lib/draws/figures";
import { parseAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Ymd } from "@/lib/dates";
import { deleteDrawAction, saveDrawAction, setDrawLineAmountAction } from "../actions";
import { amountText, fmtCents, optionalAmountText } from "../format";

type Stage = Exclude<DrawStage, "DRAFT">;
const STAGES: Stage[] = ["SENT", "INSPECTION", "APPROVED", "FUNDED"];

type Form = {
  stage: Stage;
  sentOn: string;
  sentAmount: string;
  approvedOn: string;
  approvedAmount: string;
  fundedOn: string;
  fundedAmount: string;
  lines: Record<string, string>;
};

function startingForm(d: DrawIn): Form {
  return {
    stage: d.stage === "DRAFT" ? "SENT" : d.stage,
    sentOn: dayOf(d.sentOn) ?? "",
    sentAmount: amountText(d.sentAmount),
    approvedOn: dayOf(d.approvedOn) ?? "",
    approvedAmount: amountText(d.approvedAmount),
    fundedOn: dayOf(d.fundedOn) ?? "",
    fundedAmount: amountText(d.fundedAmount),
    lines: Object.fromEntries(d.lines.map((l) => [l.lineId, optionalAmountText(l.amount)])),
  };
}

/** The money in a field as dollars, or null when it's blank or isn't a number. */
const dollars = (text: string): number | null => (text.trim() ? parseAmount(text) : null);

/**
 * A draw in a sheet (docs/specs/rehab-draws.md, L2): its stage, the days and amounts that stage asks for, and the
 * line amounts. Approved asks for the approved amount and Funded for what landed,
 * with the lender's fee between them. Pieter moves the stage by hand (R5).
 */
export function DrawSheet({
  draw,
  lines,
  today,
  isOpen,
  onOpenChange,
}: {
  draw: DrawIn;
  lines: LineIn[];
  today: Ymd;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [initial] = useState<Form>(() => startingForm(draw));
  const [form, setForm] = useState<Form>(initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const run = useRun();
  const set = (patch: Partial<Form>) => {
    if (run.error) run.reset();
    setForm((f) => ({ ...f, ...patch }));
    setProblems((p) => {
      const next = { ...p };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  const rank = STAGES.indexOf(form.stage);
  const approvedShown = rank >= 2 || form.approvedAmount !== "";
  const fundedShown = rank >= 3;
  const lineRows = lines.filter((l) => l.id in form.lines);
  const lineSum = linesTotal(lineRows.map((l) => ({ amount: dollars(form.lines[l.id]) ?? 0 })));
  const approved = dollars(form.approvedAmount);
  const fee = drawFee({ approvedAmount: approved, fundedAmount: dollars(form.fundedAmount) });

  function pickStage(next: Stage) {
    const patch: Partial<Form> = { stage: next };
    // Days the stage asks for start as today, so what's shown is what saves.
    if (STAGES.indexOf(next) >= 2 && !form.approvedOn) patch.approvedOn = today;
    if (next === "FUNDED" && !form.fundedOn) patch.fundedOn = today;
    set(patch);
  }

  function submit() {
    const found: Record<string, string> = {};
    for (const k of ["sentAmount", "approvedAmount", "fundedAmount"] as const) {
      const bad = numberProblem("money", form[k]);
      if (bad) found[k] = bad;
    }
    // Only moving into a stage asks for its amount: a draw that came in funded keeps saving without them.
    const moving = form.stage !== initial.stage;
    if (moving && rank >= 2 && approved == null && !found.approvedAmount) found.approvedAmount = "Enter the approved amount.";
    if (moving && form.stage === "FUNDED" && dollars(form.fundedAmount) == null && !found.fundedAmount) found.fundedAmount = "Enter what landed.";
    for (const l of lineRows) {
      const bad = numberProblem("money", form.lines[l.id]);
      if (bad) found[`line:${l.id}`] = bad;
    }
    if (Object.keys(found).length) {
      setProblems(found);
      return;
    }
    const changed = <K extends keyof Form>(k: K) => form[k] !== initial[k];
    const patch = {
      ...(changed("stage") ? { stage: form.stage } : {}),
      ...(changed("sentOn") ? { sentOn: form.sentOn || null } : {}),
      ...(changed("sentAmount") ? { sentAmount: form.sentAmount || null } : {}),
      ...(changed("approvedOn") ? { approvedOn: form.approvedOn || null } : {}),
      ...(changed("approvedAmount") ? { approvedAmount: form.approvedAmount || null } : {}),
      ...(changed("fundedOn") ? { fundedOn: form.fundedOn || null } : {}),
      ...(changed("fundedAmount") ? { fundedAmount: form.fundedAmount || null } : {}),
    };
    const edited = lineRows.filter((l) => form.lines[l.id] !== initial.lines[l.id]);
    if (Object.keys(patch).length === 0 && edited.length === 0) {
      onOpenChange(false);
      return;
    }
    run.run(
      async () => {
        if (Object.keys(patch).length) {
          const saved = await saveDrawAction(draw.id, patch);
          if (!saved.ok) return saved;
        }
        for (const l of edited) {
          const r = await setDrawLineAmountAction(draw.id, l.id, form.lines[l.id]);
          if (!r.ok) return r;
        }
        return { ok: true as const, data: undefined };
      },
      {
        failure: "inline",
        succeeded: () => onOpenChange(false),
        done: changed("stage") ? `Draw ${draw.number} moved to ${STAGE_LABEL[form.stage]}` : `Draw ${draw.number} saved`,
        key: `draw:${draw.id}`,
      },
    );
  }

  function remove() {
    run.run(() => deleteDrawAction(draw.id), {
      failure: "inline",
      succeeded: () => {
        setConfirming(false);
        onOpenChange(false);
      },
      failed: () => setConfirming(false),
      done: `Draw ${draw.number} deleted`,
      key: `draw:${draw.id}`,
    });
  }

  const errors = { ...run.fieldErrors, ...problems };
  // A refusal shows on its field when it has one in this sheet, and above the buttons when it has none.
  const onField = Object.keys(errors).some((k) =>
    ["stage", "sentOn", "sentAmount", "approvedOn", "approvedAmount", "fundedOn", "fundedAmount"].includes(k) || k.startsWith("line:"),
  );

  return (
    <>
      <FormSheet
        title={`Draw ${draw.number}`}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onSubmit={submit}
        primary="Save draw"
        pending={run.pending}
        values={form}
        discardTitle={`Discard changes to Draw ${draw.number}?`}
        leaveTitle={`Leave Draw ${draw.number}?`}
        error={onField ? undefined : run.error}
        fieldErrors={errors}
        fullHeight
        footerStart={
          <Button type="button" variant="danger" disabled={run.pending} onClick={() => setConfirming(true)}>
            Delete draw
          </Button>
        }
      >
        <FormField label="Stage" error={errors.stage}>
          {(p) => (
            <MenuTrigger>
              <AriaButton
                {...p}
                className={cn(buttonClass({ variant: "secondary" }), "w-full justify-between data-pressed:bg-muted")}
              >
                {STAGE_LABEL[form.stage]}
                <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              </AriaButton>
              <Menu
                placement="bottom start"
                selectionMode="single"
                selectedKeys={[form.stage]}
                sheetTitle="Stage"
                aria-label="Set stage"
                onAction={(key) => pickStage(String(key) as Stage)}
              >
                {STAGES.map((s) => (
                  <MenuItem key={s} id={s} textValue={STAGE_LABEL[s]}>
                    {STAGE_LABEL[s]}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
          )}
        </FormField>

        <FieldRow>
          <FormField label="Sent on" error={errors.sentOn}>
            {() => <DatePicker variant="field" label="Sent on" today={today} allowNone={false} value={form.sentOn || null} onChange={(v) => set({ sentOn: v ?? "" })} />}
          </FormField>
          <FormField label="Amount sent" error={errors.sentAmount}>
            {(p) => <NumberInput kind="money" {...p} value={form.sentAmount} onChange={(sentAmount) => set({ sentAmount })} />}
          </FormField>
        </FieldRow>
        {approvedShown && (
          <FieldRow>
            <FormField label="Approved on" error={errors.approvedOn}>
              {() => (
                <DatePicker variant="field" label="Approved on" today={today} allowNone={false} value={form.approvedOn || null} onChange={(v) => set({ approvedOn: v ?? "" })} />
              )}
            </FormField>
            <FormField label="Approved amount" error={errors.approvedAmount}>
              {(p) => <NumberInput kind="money" {...p} value={form.approvedAmount} onChange={(approvedAmount) => set({ approvedAmount })} />}
            </FormField>
          </FieldRow>
        )}
        {fundedShown && (
          <>
            <FieldRow>
              <FormField label="Funded on" error={errors.fundedOn}>
                {() => (
                  <DatePicker variant="field" label="Funded on" today={today} allowNone={false} value={form.fundedOn || null} onChange={(v) => set({ fundedOn: v ?? "" })} />
                )}
              </FormField>
              <FormField label="Amount funded" error={errors.fundedAmount}>
                {(p) => <NumberInput kind="money" {...p} value={form.fundedAmount} onChange={(fundedAmount) => set({ fundedAmount })} />}
              </FormField>
            </FieldRow>
            {fee != null && (
              <p className="text-body text-fg-2">
                Fee <Money value={fee} />
              </p>
            )}
          </>
        )}

        {lineRows.length > 0 && (
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-meta font-medium text-fg-2">Lines</legend>
            {lineRows.map((l) => (
              <FormField key={l.id} label={l.unitLabel ? `${l.unitLabel} · ${l.name}` : l.name} error={errors[`line:${l.id}`]}>
                {(p) => (
                  <NumberInput
                    kind="money"
                    {...p}
                    value={form.lines[l.id]}
                    onChange={(text) => {
                      if (run.error) run.reset();
                      setForm((f) => ({ ...f, lines: { ...f.lines, [l.id]: text } }));
                      setProblems((pr) => {
                        const next = { ...pr };
                        delete next[`line:${l.id}`];
                        return next;
                      });
                    }}
                  />
                )}
              </FormField>
            ))}
            {approved != null && Math.round(lineSum) !== Math.round(approved) && (
              <p className="text-meta text-muted-foreground">
                Lines total {fmtCents(lineSum)}, not {fmtCents(approved)}.
              </p>
            )}
          </fieldset>
        )}
      </FormSheet>
      {confirming && (
        <ConfirmDialog
          title={`Delete Draw ${draw.number}?`}
          body="Its line amounts go with it, and it can't be undone."
          onClose={() => !run.pending && setConfirming(false)}
          cancelLabel="Keep it"
          busy={run.pending}
          actions={
            <Button variant="destructive" size="sm" disabled={run.pending} onClick={remove}>
              Delete draw
            </Button>
          }
        />
      )}
    </>
  );
}
