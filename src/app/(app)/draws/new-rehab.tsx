"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { FormSheet } from "@/components/form-sheet";
import { TagsField } from "@/components/tags-field";
import { useRun } from "@/components/use-run";
import { Button, FormField, Input } from "@/components/ui";
import { shortAddress } from "@/lib/normalize";
import { createRehabAction, saveRehabAction } from "./actions";

export type PropertyOption = { id: string; address: string };

/** Each property's label in the picker (the street alone, unless two share one) and the way back to its id. */
function propertyLabels(options: PropertyOption[]) {
  const streets = options.map((o) => shortAddress(o.address) || o.address);
  const labelOf = new Map(options.map((o, i) => [o.id, streets.filter((s) => s === streets[i]).length > 1 ? o.address : streets[i]]));
  const idOf = new Map([...labelOf].map(([id, label]) => [label, id]));
  return { labelOf, idOf };
}

/**
 * New rehab (docs/specs/rehab-draws.md, L4): the properties it covers and the lender. The rehab's page opens next,
 * with an empty Budget. `preselect` is the property it was opened from.
 */
export function NewRehabSheet({
  options,
  preselect,
  isOpen,
  onOpenChange,
}: {
  options: PropertyOption[];
  preselect?: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const run = useRun();
  const { labelOf, idOf } = propertyLabels(options);
  const [picked, setPicked] = useState<string[]>(() => (preselect ?? []).filter((id) => labelOf.has(id)).map((id) => labelOf.get(id)!));
  const [lender, setLender] = useState("");
  const values = { picked, lender };

  function submit() {
    run.run(
      () =>
        createRehabAction({
          propertyIds: picked.map((l) => idOf.get(l)).filter((v): v is string => !!v),
          lender: lender.trim() || null,
        }),
      {
        failure: "inline",
        succeeded: (data) => {
          onOpenChange(false);
          router.push(`/draws/${data.id}`);
        },
      },
    );
  }

  return (
    <FormSheet
      title="New rehab"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary="Add rehab"
      pending={run.pending}
      values={values}
      discardTitle="Discard the new rehab?"
      leaveTitle="Leave without adding this rehab?"
      error={run.fieldErrors?.propertyIds || run.fieldErrors?.lender ? undefined : run.error}
      fieldErrors={run.fieldErrors}
    >
      <TagsField
        label="Properties"
        options={[...labelOf.values()]}
        value={picked}
        onChange={(next) => {
          if (run.error) run.reset();
          setPicked(next);
        }}
        placeholder="Pick the properties"
        emptyText="No property matches."
        isInvalid={!!run.fieldErrors?.propertyIds}
        errorMessage={run.fieldErrors?.propertyIds}
      />
      <FormField label="Lender" optional error={run.fieldErrors?.lender}>
        {(p) => <Input {...p} name="lender" autoComplete="off" value={lender} onChange={(e) => setLender(e.target.value)} />}
      </FormField>
    </FormSheet>
  );
}

/** A button that opens New rehab. `children` is its label. */
export function NewRehabButton({
  options,
  preselect,
  variant = "primary",
  size,
  children = "New rehab",
  icon = true,
}: {
  options: PropertyOption[];
  preselect?: string[];
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  children?: ReactNode;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {icon && <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />}
        {children}
      </Button>
      {open && <NewRehabSheet options={options} preselect={preselect} isOpen={open} onOpenChange={setOpen} />}
    </>
  );
}

/**
 * Edit rehab: its name, properties and lender, from the ⋯ menu. The lender also edits in place on the rail; the
 * properties are links there, so this is where they change.
 */
export function EditRehabSheet({
  rehabId,
  initial,
  options,
  isOpen,
  onOpenChange,
}: {
  rehabId: string;
  initial: { name: string; lender: string; propertyIds: string[] };
  options: PropertyOption[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useRun();
  const { labelOf, idOf } = propertyLabels(options);
  const startPicked = initial.propertyIds.filter((id) => labelOf.has(id)).map((id) => labelOf.get(id)!);
  const [name, setName] = useState(initial.name);
  const [lender, setLender] = useState(initial.lender);
  const [picked, setPicked] = useState<string[]>(startPicked);
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) {
      setProblem("Give it a name.");
      return;
    }
    const ids = picked.map((l) => idOf.get(l)).filter((v): v is string => !!v);
    const sameProps = ids.length === initial.propertyIds.length && ids.every((id) => initial.propertyIds.includes(id));
    const patch = {
      ...(name.trim() !== initial.name ? { name: name.trim() } : {}),
      ...(lender.trim() !== initial.lender ? { lender: lender.trim() || null } : {}),
      ...(sameProps ? {} : { propertyIds: ids }),
    };
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    run.run(() => saveRehabAction(rehabId, patch), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: "Rehab saved",
      key: `rehab:${rehabId}:edit`,
    });
  }

  const errors: Record<string, string> = { ...run.fieldErrors, ...(problem ? { name: problem } : {}) };
  return (
    <FormSheet
      title="Edit rehab"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary="Save rehab"
      pending={run.pending}
      values={{ name, lender, picked }}
      discardTitle="Discard changes to this rehab?"
      leaveTitle="Leave without saving this rehab?"
      error={errors.name || errors.lender || errors.propertyIds ? undefined : run.error}
      fieldErrors={errors}
    >
      <FormField label="Name" error={errors.name}>
        {(p) => (
          <Input
            {...p}
            name="name"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setProblem(null);
              if (run.error) run.reset();
            }}
          />
        )}
      </FormField>
      <TagsField
        label="Properties"
        options={[...labelOf.values()]}
        value={picked}
        onChange={(next) => {
          if (run.error) run.reset();
          setPicked(next);
        }}
        placeholder="Pick the properties"
        emptyText="No property matches."
        isInvalid={!!errors.propertyIds}
        errorMessage={errors.propertyIds}
      />
      <FormField label="Lender" optional error={errors.lender}>
        {(p) => <Input {...p} name="lender" autoComplete="off" value={lender} onChange={(e) => setLender(e.target.value)} />}
      </FormField>
    </FormSheet>
  );
}
