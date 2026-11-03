"use client";
import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { FormSheet } from "@/components/form-sheet";
import { NumberInput, numberProblem } from "@/components/number-input";
import { Select } from "@/components/select";
import { Button, FormField, Input, Section } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { UTILITY_GROUPS, UTILITY_STATUS_FIELDS, utilityStatusChoices, type CapexRules, type PropertyUnit, type UnitEquipment } from "@/lib/property-types";
import { cn } from "@/lib/utils";
import { savePropertyUnit } from "../actions";
import { isAccountField } from "./edit-units";

/**
 * The unit editor's sheet: name and lockbox, utilities and the equipment
 * table. It opens on a tap, so the Units section loads it with the first open
 * instead of with the page (edit-units.tsx).
 */

/** One equipment row's problems, keyed by field, found when Save is pressed. */
type EquipmentProblems = Record<number, { type?: string; year?: string }>;

/**
 * One unit in a sheet (forms 4.2, 2.9): its name and lockbox, its utilities
 * in three groups and its equipment, a table from md and a card per item
 * below it. Type is a pick from the CapEx rule types, so every appliance has
 * a rule and none drops out of the forecast; Year must be a year, where
 * "Old" used to save and then vanish from the forecast (PROPERTY-022). It
 * saves the one unit, pinned to the version it opened at, and a conflict shows
 * above Save.
 */
export function UnitSheet({
  propertyId,
  version,
  unit,
  isNew,
  title,
  rules,
  isOpen,
  onOpenChange,
}: {
  propertyId: string;
  version: string;
  unit: PropertyUnit;
  isNew: boolean;
  title: string;
  rules: CapexRules;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<PropertyUnit>(() => structuredClone(unit));
  const [problems, setProblems] = useState<EquipmentProblems | null>(null);
  const run = useRun();
  const types = rules.equipment.map((r) => ({ id: r.type, label: r.type }));
  const equipment = draft.equipment ?? [];
  // A year already stored is left as it is ("~2004"), so only one that was typed over has to read.
  const stored = new Map((unit.equipment ?? []).map((e, j) => [j, e.installYear ?? ""]));

  function mutate(fn: (u: PropertyUnit) => void) {
    run.reset();
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  function check(): EquipmentProblems {
    const found: EquipmentProblems = {};
    equipment.forEach((e, j) => {
      const used = !!(e.model?.trim() || e.installYear?.trim() || e.comment?.trim());
      const row: { type?: string; year?: string } = {};
      if (used && !e.type.trim()) row.type = "Choose a type.";
      const year = e.installYear?.trim() ?? "";
      if (year && year !== stored.get(j) && numberProblem("year", year)) row.year = numberProblem("year", year) ?? undefined;
      if (row.type || row.year) found[j] = row;
    });
    return found;
  }

  function submit() {
    const found = check();
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    run.run(() => savePropertyUnit(propertyId, draft, version), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: isNew ? `${draft.label?.trim() || "Unit"} added` : `${title} saved`,
      key: `unit:${propertyId}:${draft.id ?? "new"}`,
    });
  }

  const label = draft.label?.trim() || title;
  const firstProblem = problems ? Object.values(problems).flatMap((p) => [p.type, p.year]).find(Boolean) : undefined;

  return (
    <FormSheet
      title={title}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={isNew ? "Add unit" : "Save unit"}
      pending={run.pending}
      values={draft}
      size="lg"
      fullHeight
      discardTitle={isNew ? "Discard the new unit?" : `Discard changes to ${label}?`}
      leaveTitle={`Leave ${label}?`}
      error={run.error ?? (firstProblem ? "Check the equipment below." : undefined)}
      fieldErrors={run.fieldErrors}
    >
      <FieldGrid>
        <FormField label="Name">
          {(p) => <Input {...p} value={draft.label ?? ""} autoComplete="off" onChange={(e) => mutate((u) => (u.label = e.target.value))} />}
        </FormField>
        <FormField label="Lockbox" optional>
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              autoComplete="off"
              value={draft.lockboxCode ?? ""}
              onChange={(e) => mutate((u) => (u.lockboxCode = e.target.value))}
            />
          )}
        </FormField>
      </FieldGrid>

      <Section as="h3" title="Utilities (optional)">
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-3">
          {UTILITY_GROUPS.map((g) => (
            <div key={g.name} className="space-y-4">
              <p className="text-meta font-medium text-fg-1">{g.name}</p>
              {g.fields.map(([k, fieldLabel]) =>
                UTILITY_STATUS_FIELDS.has(k) ? (
                  <Select
                    key={k}
                    label={fieldLabel}
                    size="md"
                    emptyLabel="Not set"
                    items={utilityStatusChoices(draft.utilities?.[k]).map((o) => ({ id: o, label: o }))}
                    value={draft.utilities?.[k]?.trim() || null}
                    onChange={(v) => mutate((u) => (u.utilities = { ...u.utilities, [k]: v ?? "" }))}
                  />
                ) : (
                  <FormField key={k} label={fieldLabel}>
                    {(p) => (
                      <Input
                        {...p}
                        className={cn(isAccountField(k) && "font-mono")}
                        autoComplete="off"
                        value={draft.utilities?.[k] ?? ""}
                        onChange={(e) => mutate((u) => (u.utilities = { ...u.utilities, [k]: e.target.value }))}
                      />
                    )}
                  </FormField>
                ),
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section as="h3" title="Equipment (optional)">
        {equipment.length > 0 && (
          <div className="space-y-3 md:space-y-2">
            {/* The table's header, from md; below it each item is its own card with labels. */}
            <div className={cn(EQUIPMENT_COLS, "max-md:hidden text-meta font-medium text-fg-3")}>
              <span>Type</span>
              <span>Model #</span>
              <span>Comments</span>
              <span>Year</span>
              <span />
            </div>
            {equipment.map((e, j) => (
              <EquipmentRow
                key={j}
                item={e}
                index={j}
                types={types}
                problems={problems?.[j]}
                onChange={(patch) => mutate((u) => Object.assign(u.equipment![j], patch))}
                onRemove={() => mutate((u) => void u.equipment!.splice(j, 1))}
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 mt-1"
          onClick={() => mutate((u) => void (u.equipment = [...(u.equipment ?? []), { type: "", model: "", installYear: "", comment: "" }]))}
        >
          <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
          Add equipment
        </Button>
      </Section>
    </FormSheet>
  );
}

/** Two fields side by side from sm, one column below it. */
function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

// The type is a pick, so it gets room for "Garbage Disposal"; the rest share what's left.
const EQUIPMENT_COLS = "md:grid md:grid-cols-[minmax(9rem,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_5.5rem_2rem] md:items-start md:gap-2";

/**
 * One equipment item. From md it is a row of a table (the header above names
 * the columns and the labels go to screen readers); below it, a card with its
 * labels and the remove X at its corner, so nothing scrolls sideways at 375
 * or 320. One set of fields serves both, so a refusal's focus always lands on
 * one you can see.
 */
function EquipmentRow({
  item: e,
  index: j,
  types,
  problems,
  onChange,
  onRemove,
}: {
  item: UnitEquipment;
  index: number;
  types: { id: string; label: string }[];
  problems?: { type?: string; year?: string };
  onChange: (patch: Partial<UnitEquipment>) => void;
  onRemove: () => void;
}) {
  const label = "md:[&>label]:sr-only";
  return (
    <div
      className={cn(
        "relative space-y-3 rounded-lg border border-line p-3 md:space-y-0 md:rounded-none md:border-0 md:p-0",
        EQUIPMENT_COLS,
      )}
    >
      {/* Below md the card names itself, with the X beside it; from md the table's header does. */}
      <p className="min-h-6 pr-9 text-meta font-medium text-fg-1 md:hidden">{e.type || `Equipment ${j + 1}`}</p>
      <Select
        label="Type"
        size="md"
        className={label}
        items={types}
        value={e.type.trim() || null}
        placeholder="Choose a type"
        onChange={(v) => onChange({ type: v ?? "" })}
        isInvalid={!!problems?.type}
        errorMessage={problems?.type}
        searchLabel="Search types"
      />
      <FormField label="Model #" className={label}>
        {(p) => <Input {...p} autoComplete="off" value={e.model ?? ""} onChange={(ev) => onChange({ model: ev.target.value })} />}
      </FormField>
      <FormField label="Comments" className={label}>
        {(p) => <Input {...p} autoComplete="off" value={e.comment ?? ""} onChange={(ev) => onChange({ comment: ev.target.value })} />}
      </FormField>
      <FormField label="Year" error={problems?.year} className={label}>
        {(p) => <NumberInput kind="year" {...p} value={e.installYear ?? ""} onChange={(next) => onChange({ installYear: next })} />}
      </FormField>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon
        aria-label={`Remove ${e.type || `equipment ${j + 1}`}`}
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 md:static md:mt-0.5"
      >
        <X aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      </Button>
    </div>
  );
}

