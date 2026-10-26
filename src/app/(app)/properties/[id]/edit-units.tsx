"use client";
import { useState, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ChevronRight, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Code } from "@/components/code";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormSheet } from "@/components/form-sheet";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Meter } from "@/components/meter";
import { Money } from "@/components/money";
import { NumberInput, numberProblem } from "@/components/number-input";
import { Select } from "@/components/select";
import { AddRow, Button, FormField, Input, Section, Table, Td, Th, buttonClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import type { CapexRules, PropertyUnit, UnitEquipment, UnitUtilities } from "@/lib/property-types";
import {
  UTILITY_GROUPS,
  UTILITY_STATUS_FIELDS,
  equipmentAge,
  equipmentReplacementCost,
  equipmentStatus,
  isHouseMeterRow,
  parseInstallYear,
  projectedYear,
  utilityStatusChoices,
  utilityStatusTone,
} from "@/lib/property-types";
import { removeUnitQuestion, unitRefKey, type UnitRefs } from "@/lib/properties/unit-refs";
import { shortAddress } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { deletePropertyUnit, savePropertyUnit } from "../actions";
import { EquipmentStatusText, fmtAge, utilityToneClass } from "../capex-ui";

/** The account-number fields, read as codes and masked to their last four. */
const isAccountField = (k: keyof UnitUtilities) => k.endsWith("Acct");

/** What a unit goes by in a row or a dialog: its label, or its place in the list. */
const unitName = (u: PropertyUnit, i: number) => u.label?.trim() || `Unit ${i + 1}`;

/**
 * A stored lockbox value split into the code and its note: "4857 (back left
 * corner of the house)" is the code 4857 and where the box is. The code is
 * read and copied character by character, so the note never shares its token.
 */
function splitLockbox(value: string): { code: string; note: string | null } {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(value.trim());
  if (!m || !m[1]) return { code: value.trim(), note: null };
  return { code: m[1], note: m[2].trim() || null };
}

const THIS_YEAR = new Date().getFullYear();

/** The year a Monitor or Replace cost falls due, when that's still ahead: "in 2032". */
function dueNote(type: string, installYear: string | null | undefined, rules: CapexRules): string | null {
  const due = projectedYear({ kind: "equipment", type, installYear }, rules);
  return due != null && due >= THIS_YEAR ? `in ${due}` : null;
}

type Sheet = { index: number | null; version: string; id: number };
type Removing = { index: number; title: string; body: string };

/**
 * The property's units, one row each (docs/brand-guidelines.md, section 9
 * Counted lists): Add unit is the last row and Delete sits in each row's ⋯
 * menu, so the count shown on the record is always the rows here. A unit's
 * name, or "Edit unit" in its menu, opens it in a sheet (forms 4.2): its name
 * and lockbox, its utilities and its equipment, saved as that one unit at the
 * version the sheet opened at. Adding a unit opens an empty one.
 */
export function UnitsSection({
  propertyId,
  address,
  version,
  initial,
  rules,
  unitRefs,
}: {
  propertyId: string;
  /** The property's address, to name a unit in the Delete confirm. */
  address: string;
  /** Property.updatedAt the page rendered with; a sheet pins it when it opens, and the save refuses a newer row. */
  version: string;
  initial: PropertyUnit[];
  rules: CapexRules;
  /** Open tasks and listings per saved unit label (unit-refs.ts countUnitRefs). */
  unitRefs: Record<string, UnitRefs>;
}) {
  // The sheet that's up (or just closed, mounted while it slides out), with a fresh `id` per open.
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const run = useRun();

  // The counted rows (the record's "3 units") and the house-meter rows, each with its place in the list.
  const indexed = initial.map((u, i) => ({ u, i }));
  const rentable = indexed.filter(({ u }) => !isHouseMeterRow(u));
  const meters = indexed.filter(({ u }) => isHouseMeterRow(u));

  function openUnit(index: number | null) {
    setSheet({ index, version, id: (sheet?.id ?? 0) + 1 });
    setIsOpen(true);
  }

  /**
   * The Delete confirm for unit `i`. Tasks and listings name a unit by its
   * saved label, so the body says what still names it (decision 19).
   */
  function askDelete(i: number) {
    run.reset();
    const unit = initial[i];
    const key = unitRefKey(unit.label);
    const kept = initial.some((u, j) => j !== i && unitRefKey(u.label) === key);
    const question = key && !kept ? removeUnitQuestion(unit.label ?? "", unitRefs[key]) : null;
    setRemoving({
      index: i,
      title: `Delete ${unitName(unit, i)} at ${shortAddress(address)}?`,
      body: question?.body ?? "Its lockbox code, utilities and equipment go with it.",
    });
  }

  function confirmDelete() {
    if (!removing) return;
    const unit = initial[removing.index];
    const name = unitName(unit, removing.index);
    if (!unit.id) return;
    const id = unit.id;
    run.run(() => deletePropertyUnit(propertyId, id, version), {
      failure: "inline",
      succeeded: () => setRemoving(null),
      done: `${name} deleted`,
    });
  }

  const editing = sheet?.index != null ? initial[sheet.index] : undefined;

  return (
    <Section title="Units & access">
      {rentable.length === 0 ? (
        <p className="pb-2 text-body text-fg-3">Add each unit to keep its lockbox code, utilities and equipment here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rentable.map(({ u, i }) => (
            <ReadUnit
              key={u.id ?? i}
              unit={u}
              name={unitName(u, i)}
              rules={rules}
              onEdit={() => openUnit(i)}
              onDelete={() => askDelete(i)}
            />
          ))}
        </ul>
      )}
      <AddRow onClick={() => openUnit(null)}>Add unit</AddRow>
      {/* The building's own meters aren't units, so they sit under the counted list, apart from it. */}
      {meters.length > 0 && (
        <div className="pt-4">
          <p className="text-meta font-medium text-fg-2">House meters</p>
          <ul className="divide-y divide-line">
            {meters.map(({ u, i }) => (
              <ReadUnit
                key={u.id ?? i}
                unit={u}
                name={unitName(u, i)}
                rules={rules}
                onEdit={() => openUnit(i)}
                onDelete={() => askDelete(i)}
              />
            ))}
          </ul>
        </div>
      )}

      {sheet && (
        <UnitSheet
          key={sheet.id}
          propertyId={propertyId}
          version={sheet.version}
          unit={editing ?? blankUnit()}
          isNew={editing === undefined}
          title={editing ? unitName(editing, sheet.index!) : "New unit"}
          rules={rules}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={removing.title}
          body={removing.body}
          onClose={() => setRemoving(null)}
          cancelLabel="Keep it"
          busy={run.pending}
          actions={
            <Button size="sm" variant="destructive" onClick={confirmDelete} pending={run.pending}>
              Delete unit
            </Button>
          }
        />
      )}
      {removing && run.error && <p className="mt-2 text-meta text-danger">{run.error}</p>}
    </Section>
  );
}

/** A unit's ⋯ menu: Edit and Delete, the two things a row does besides opening its details. */
function UnitMenu({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <MenuTrigger>
      <AriaButton aria-label={`${name} actions`} className={buttonClass({ variant: "ghost", size: "sm", icon: true })}>
        <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      </AriaButton>
      <Menu sheetTitle={name}>
        <MenuItem icon={<Pencil />} onAction={onEdit}>
          Edit unit
        </MenuItem>
        <MenuItem variant="destructive" icon={<Trash2 />} onAction={onDelete}>
          Delete unit
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}

/** A unit's utilities or equipment, folded under its row. */
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group/d">
      <summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-1.5 text-meta font-medium text-fg-2 transition-colors hover:text-fg-1 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          strokeWidth={1.5}
          className="h-3.5 w-3.5 shrink-0 text-fg-3 transition-transform duration-fast group-open/d:rotate-90 motion-reduce:transition-none"
        />
        {title}
      </summary>
      <div className="pb-3 pl-5">{children}</div>
    </details>
  );
}

function ReadUnit({
  unit: u,
  name,
  rules,
  onEdit,
  onDelete,
}: {
  unit: PropertyUnit;
  name: string;
  rules: CapexRules;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasUtilities = UTILITY_GROUPS.some((g) => g.fields.some(([k]) => u.utilities?.[k]));
  const equipment = u.equipment ?? [];
  const lockbox = u.lockboxCode?.trim() ? splitLockbox(u.lockboxCode) : null;
  const datedCount = equipment.filter((e) => parseInstallYear(e.installYear) != null).length;
  return (
    <li className="py-1.5">
      <div className="flex min-h-8 items-center gap-3">
        {/* The name opens the unit; the lockbox code beside it still copies on a tap. */}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${name}`}
          className="min-w-0 flex-1 truncate rounded-md text-left text-body text-fg-1 pointer-coarse:min-h-11 pointer-fine:hover:underline pointer-fine:underline-offset-3"
        >
          {name}
        </button>
        {lockbox && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-meta text-fg-3 max-[480px]:hidden">Lockbox</span>
            <Code value={lockbox.code} label="Lockbox code" />
          </span>
        )}
        <UnitMenu name={name} onEdit={onEdit} onDelete={onDelete} />
      </div>
      {/* Where the box is: its own line, so a long note never pushes the code or the menu off screen. */}
      {lockbox?.note && (
        <p title={lockbox.note} className="-mt-1 truncate pb-1 text-meta text-fg-3">
          Lockbox at {lockbox.note}
        </p>
      )}
      {hasUtilities && (
        <Disclosure title="Utilities">
          <div className="@container">
            <div className="grid gap-x-6 gap-y-3 @min-[36rem]:grid-cols-3">
              {UTILITY_GROUPS.map((g) => {
                const rows = g.fields.filter(([k]) => u.utilities?.[k]);
                if (rows.length === 0) return null;
                return (
                  <div key={g.name}>
                    <p className="mb-1 text-meta font-medium text-fg-1">{g.name}</p>
                    <dl className="space-y-1">
                      {rows.map(([k, label]) => {
                        const v = u.utilities![k]!;
                        return (
                          <div key={k} className="flex min-h-6 items-center justify-between gap-2 text-meta">
                            <dt className="text-fg-3">{label}</dt>
                            <dd className={cn("min-w-0", UTILITY_STATUS_FIELDS.has(k) ? utilityToneClass(utilityStatusTone(v)) : "text-fg-1")}>
                              {isAccountField(k) ? <Code value={v} label={`${g.name} account number`} mask /> : v}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>
        </Disclosure>
      )}
      {equipment.length > 0 && (
        <Disclosure title="Equipment">
          <p className="num mb-1 flex items-center gap-2 text-meta text-fg-3">
            <span>
              {datedCount} of {equipment.length} dated
            </span>
            <Meter value={datedCount} max={equipment.length} label={`${name} equipment with an install year`} valueText={`${datedCount} of ${equipment.length} dated`} className="w-16" />
          </p>
          <Table className="min-w-160">
            <thead>
              <tr>
                <Th className="pl-0">Type</Th>
                <Th>Model #</Th>
                <Th>Comments</Th>
                <Th>Year</Th>
                <Th>Age</Th>
                <Th>Status</Th>
                <Th numeric className="pr-0">
                  Cost
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {equipment.map((e, j) => {
                const status = equipmentStatus(e.type, e.installYear, rules);
                const cost = equipmentReplacementCost(e.type, rules);
                const due = status === "Monitor" || status === "Replace" ? dueNote(e.type, e.installYear, rules) : null;
                return (
                  <tr key={j}>
                    <Td className="pl-0 text-fg-2">{e.type}</Td>
                    <Td className="text-fg-1">{e.model || <span className="text-fg-3">—</span>}</Td>
                    <Td className="min-w-40 text-fg-2">{e.comment || <span className="text-fg-3">—</span>}</Td>
                    <Td className="num">{e.installYear || <span className="text-fg-3">—</span>}</Td>
                    <Td className="num whitespace-nowrap">{fmtAge(equipmentAge(e.installYear))}</Td>
                    <Td className="whitespace-nowrap">
                      <EquipmentStatusText status={status} />
                    </Td>
                    <Td numeric className="whitespace-nowrap pr-0">
                      {(status === "Replace" || status === "Monitor") && cost != null ? (
                        <>
                          <Money value={cost} />
                          {due && <span className="text-meta text-fg-3"> {due}</span>}
                        </>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Disclosure>
      )}
    </li>
  );
}

/* ---------------- The unit's sheet ---------------- */

function blankUnit(): PropertyUnit {
  return { label: "", lockboxCode: "", utilities: {}, equipment: [] };
}

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
function UnitSheet({
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

