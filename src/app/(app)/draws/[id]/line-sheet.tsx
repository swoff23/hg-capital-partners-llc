"use client";
import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { NumberInput, numberProblem } from "@/components/number-input";
import { Select } from "@/components/select";
import { useRun } from "@/components/use-run";
import { Button, FieldRow, FormField, Input } from "@/components/ui";
import type { LineFigures } from "@/lib/draws/figures";
import type { UnitOption } from "@/lib/draws/queries";
import { addLineAction, deleteLineAction, restoreLineAction, saveLineAction, setDraftAmountAction } from "../actions";
import { amountText, optionalAmountText } from "../format";

/** The current pick of a line that only has a worksheet's own words for its unit. */
const WORKSHEET = "__worksheet__";

type Form = { name: string; unit: string; original: string; changeOrder: string; draft: string };

function startingForm(line: LineFigures | null, units: UnitOption[], unit: string): Form {
  const picked = line ? units.find((u) => u.unitId === line.unitId)?.value : undefined;
  return {
    name: line?.name ?? "",
    unit: line ? (picked ?? (line.unitLabel ? WORKSHEET : "")) : unit,
    original: amountText(line?.original),
    changeOrder: optionalAmountText(line?.changeOrder),
    draft: optionalAmountText(line?.draft),
  };
}

/**
 * A budget line in a sheet (docs/specs/rehab-draws.md, L2): its name, unit, original budget, change order and the
 * draft's amount. Empty, it adds a line. On a phone this is where the draft is typed; a line on a draw already sent
 * keeps to its place, so Delete line comes back with the reason.
 */
export function LineSheet({
  rehabId,
  units,
  line,
  unit = "",
  isOpen,
  onOpenChange,
}: {
  rehabId: string;
  /** The rehab's units to pick from; empty hides the field. */
  units: UnitOption[];
  /** The line to edit, or null to add one. */
  line: LineFigures | null;
  /** The unit (a picker value) a new line starts in. */
  unit?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [initial] = useState<Form>(() => startingForm(line, units, unit));
  const [form, setForm] = useState<Form>(initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
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

  function submit() {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = "Name the line.";
    for (const k of ["original", "changeOrder", "draft"] as const) {
      const text = form[k];
      // A change order may be negative; the server reads it. Here only the plain money rules.
      const bad = k === "changeOrder" ? null : numberProblem("money", text, { required: k === "original" });
      if (bad) found[k] = bad;
    }
    if (Object.keys(found).length) {
      setProblems(found);
      return;
    }
    if (line) {
      const changed = (k: keyof Form) => form[k] !== initial[k];
      if ((Object.keys(form) as (keyof Form)[]).every((k) => !changed(k))) {
        onOpenChange(false);
        return;
      }
      run.run(
        async () => {
          const patch = {
            ...(changed("name") ? { name: form.name.trim() } : {}),
            ...(changed("unit") ? { unit: form.unit && form.unit !== WORKSHEET ? form.unit : null } : {}),
            ...(changed("original") ? { original: form.original } : {}),
            ...(changed("changeOrder") ? { changeOrder: form.changeOrder } : {}),
          };
          if (Object.keys(patch).length) {
            const saved = await saveLineAction(line.id, patch);
            if (!saved.ok) return saved;
          }
          return changed("draft") ? setDraftAmountAction(line.id, form.draft) : { ok: true as const, data: undefined };
        },
        { failure: "inline", succeeded: () => onOpenChange(false), done: "Line saved", key: `rehab:${rehabId}:line` },
      );
      return;
    }
    run.run(
      // One call: the line and its draft save together, so a refused draft leaves no line behind to duplicate.
      () =>
        addLineAction(rehabId, {
          name: form.name.trim(),
          unit: form.unit && form.unit !== WORKSHEET ? form.unit : null,
          original: form.original,
          changeOrder: form.changeOrder,
          draft: form.draft.trim() || null,
        }),
      { failure: "inline", succeeded: () => onOpenChange(false), done: "Line added", key: `rehab:${rehabId}:line` },
    );
  }

  function remove() {
    if (!line) return;
    let snapshot: Parameters<typeof restoreLineAction>[0] | null = null;
    run.run(() => deleteLineAction(line.id), {
      failure: "inline",
      succeeded: (data) => {
        snapshot = data;
        onOpenChange(false);
      },
      done: `${line.name} deleted`,
      key: `rehab:${rehabId}:line`,
      undo: () => restoreLineAction(snapshot!),
    });
  }

  const errors = { ...run.fieldErrors, ...problems };
  // A refusal shows on its field when it has one here, and above the buttons when it has none (the line is on a draw).
  const onField = Object.keys(errors).some((k) => ["name", "unit", "original", "changeOrder", "draft"].includes(k));

  return (
    <FormSheet
      title={line ? line.name : "Add a line"}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={line ? "Save line" : "Add line"}
      pending={run.pending}
      values={form}
      discardTitle={line ? "Discard changes to this line?" : "Discard the new line?"}
      leaveTitle="Leave without saving this line?"
      error={onField ? undefined : run.error}
      fieldErrors={errors}
    >
      <FormField label="Name" error={errors.name}>
        {(p) => <Input {...p} name="name" autoComplete="off" value={form.name} onChange={(e) => set({ name: e.target.value })} />}
      </FormField>
      {units.length > 0 && (
        <Select
          label="Unit"
          emptyLabel="No unit"
          items={[
            ...(initial.unit === WORKSHEET && line?.unitLabel ? [{ id: WORKSHEET, label: line.unitLabel }] : []),
            ...units.map((u) => ({ id: u.value, label: u.label })),
          ]}
          value={form.unit || null}
          onChange={(v) => set({ unit: v ?? "" })}
          isInvalid={!!errors.unit}
          errorMessage={errors.unit}
        />
      )}
      <FieldRow>
        <FormField label="Original" error={errors.original}>
          {(p) => <NumberInput kind="money" {...p} value={form.original} onChange={(original) => set({ original })} />}
        </FormField>
        <FormField label="Change order" optional error={errors.changeOrder}>
          {(p) => <NumberInput kind="money" {...p} value={form.changeOrder} onChange={(changeOrder) => set({ changeOrder })} />}
        </FormField>
      </FieldRow>
      <FormField label="Draft" optional error={errors.draft}>
        {(p) => <NumberInput kind="money" {...p} value={form.draft} onChange={(draft) => set({ draft })} />}
      </FormField>
      {line && (
        <div>
          <Button type="button" variant="danger" size="sm" disabled={run.pending} onClick={remove}>
            Delete line
          </Button>
        </div>
      )}
    </FormSheet>
  );
}
