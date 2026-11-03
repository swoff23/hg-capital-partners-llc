"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { FormSheet } from "@/components/form-sheet";
import { LoadLatest } from "@/components/load-latest";
import { NumberInput } from "@/components/number-input";
import { Select } from "@/components/select";
import { Button, FormField, Input, Section } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { UTILITY_GROUPS, UTILITY_STATUS_FIELDS, utilityStatusChoices, type CapexRules, type PropertyUnit, type UnitEquipment } from "@/lib/property-types";
import {
  EQUIPMENT_FOOTER,
  equipmentProblems,
  firstEquipmentProblem,
  stillFailing,
  unitSheetWords,
  type EquipmentProblems,
} from "@/lib/properties/unit-sheet";
import { stableJson } from "@/lib/drafts";
import { cn } from "@/lib/utils";
import { savePropertyUnit } from "../actions";
import { isAccountField } from "./edit-units";

/**
 * The unit editor's sheet: name and lockbox, utilities and the equipment
 * table. It opens on a tap, so the Units section loads it with the first open
 * instead of with the page (edit-units.tsx).
 */

/**
 * One unit in a sheet (forms 4.2, 2.9): its name and lockbox, its utilities
 * in three groups and its equipment, a table from md and a card per item
 * below it. Type is a pick from the CapEx rule types, so every appliance has
 * a rule and none drops out of the forecast; Year must be a year, where
 * "Old" used to save and then vanish from the forecast (PROPERTY-022). It
 * saves the one unit, pinned to the version it opened at. A conflict shows
 * above Save with "Load the latest": the page behind already shows what was
 * saved meanwhile (the service revalidates on a refusal), and the link
 * starts the sheet over on it, at the new version.
 */
export function UnitSheet({
  propertyId,
  version,
  latest,
  unit,
  isNew,
  gone,
  title,
  rules,
  isOpen,
  onOpenChange,
}: {
  propertyId: string;
  /** The version the sheet opened at; the save is refused once the property has moved on. */
  version: string;
  /** The page's version now: after a refusal the page re-renders on the latest, and "Load the latest" pins this. */
  latest: string;
  unit: PropertyUnit;
  isNew: boolean;
  /** The unit was deleted elsewhere: the latest has nothing to load. */
  gone: boolean;
  title: string;
  rules: CapexRules;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The unit as the sheet last loaded it, and the version its save is checked against: both move on with "Load the latest".
  const [base, setBase] = useState<PropertyUnit>(unit);
  const [pinned, setPinned] = useState(version);
  const [draft, setDraft] = useState<PropertyUnit>(() => structuredClone(unit));
  // What Save found. Once shown, a line clears as its row is fixed.
  const [problems, setProblems] = useState<EquipmentProblems | null>(null);
  // The unit's name as the sheet opened, for the leave question (unit-sheet.ts unitSheetWords).
  const [openedTitle] = useState(title);
  const run = useRun();
  const router = useRouter();
  const types = rules.equipment.map((r) => ({ id: r.type, label: r.type }));
  const equipment = draft.equipment ?? [];
  // A year already stored is left as it is ("~2004"), so only one that was typed over has to read.
  const stored = new Map((base.equipment ?? []).map((e, j) => [j, e.installYear ?? ""]));
  const shown = problems ? stillFailing(problems, equipmentProblems(equipment, stored)) : null;

  function mutate(fn: (u: PropertyUnit) => void) {
    // Only a line on screen needs clearing.
    if (run.error) run.reset();
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  function submit() {
    const found = equipmentProblems(equipment, stored);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    run.run(() => savePropertyUnit(propertyId, draft, pinned), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: isNew ? `${draft.label?.trim() || "Unit"} added` : `${title} saved`,
      key: `unit:${propertyId}:${draft.id ?? "new"}`,
    });
  }

  /**
   * After a refusal the page behind is already on the latest, so the sheet
   * starts over on it. A new unit keeps what was typed (nothing of theirs is
   * in it) and only moves to the new version. A unit deleted meanwhile has
   * no latest: the sheet closes on the list that no longer has it, where a
   * save would have added it back.
   */
  function loadLatest() {
    if (gone) {
      run.reset();
      onOpenChange(false);
      return;
    }
    run.reset();
    setProblems(null);
    setBase(unit);
    setPinned(latest);
    if (!isNew) setDraft(structuredClone(unit));
    // In case the refusal's page didn't arrive with it; when it did, this is the same latest.
    router.refresh();
  }

  const label = draft.label?.trim() || title;
  const words = unitSheetWords(isNew, openedTitle, label);
  const firstProblem = firstEquipmentProblem(shown);

  return (
    <FormSheet
      title={title}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={isNew ? "Add unit" : "Save unit"}
      pending={run.pending}
      values={draft}
      // Against what the sheet last loaded, so loading the latest doesn't read as a change of yours.
      dirty={stableJson(draft) !== stableJson(base)}
      size="lg"
      fullHeight
      discardTitle={words.discardTitle}
      leaveTitle={words.leaveTitle}
      error={run.error ?? (firstProblem ? EQUIPMENT_FOOTER : undefined)}
      errorAction={run.conflict && <LoadLatest onClick={loadLatest} />}
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
                problems={shown?.[j]}
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

