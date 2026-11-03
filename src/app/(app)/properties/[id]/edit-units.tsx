"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Code } from "@/components/code";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Meter } from "@/components/meter";
import { Money } from "@/components/money";
import { AddRow, Button, Section, Table, Td, Th, buttonClass } from "@/components/ui";
import { useLazyModule, warmOnIntent } from "@/components/use-lazy-module";
import { useRun } from "@/components/use-run";
import type { CapexRules, PropertyUnit, UnitUtilities } from "@/lib/property-types";
import {
  UTILITY_GROUPS,
  UTILITY_STATUS_FIELDS,
  equipmentAge,
  equipmentReplacementCost,
  equipmentStatus,
  isHouseMeterRow,
  parseInstallYear,
  projectedYear,
  utilityStatusTone,
} from "@/lib/property-types";
import { OPEN_FAILED_LINE, lazyModule, warmWhenIdle } from "@/lib/lazy-module";
import { removeUnitQuestion, unitRefKey, type UnitRefs } from "@/lib/properties/unit-refs";
import { sheetUnitAt } from "@/lib/properties/unit-sheet";
import { dueIn } from "@/lib/properties/capex";
import { shortAddress } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { deletePropertyUnit } from "../actions";
import { EquipmentStatusText, fmtAge, utilityToneClass } from "../capex-ui";

// The editor loads after the page has settled or at the first hover, focus or press, not with the page (lib/lazy-module.ts).
const unitSheet = lazyModule(() => import("./unit-sheet"));

/** The account-number fields, read as codes and masked to their last four. */
export const isAccountField = (k: keyof UnitUtilities) => k.endsWith("Acct");

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
  return dueIn(projectedYear({ kind: "equipment", type, installYear }, rules), THIS_YEAR);
}

/**
 * The sheet that is up: the unit it edits, by id and place (null for a new
 * one, unit-sheet.ts sheetUnitAt), and as it was at open; the version it
 * opened at; and a fresh `id` per open.
 */
type Sheet = { unitId: string | null; at: number | null; opened: PropertyUnit | null; version: string; id: number };
/** The unit a Delete confirm is about, by id and place as the sheet finds its unit, so a refresh can't move it onto another. */
type Removing = { unitId: string | null; at: number; label: string | null | undefined; name: string; title: string; body: string };

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
  // The code is usually here before the first tap; when it can't be fetched the sheet closes with a toast, and the next tap asks again.
  const editor = useLazyModule(unitSheet, sheet !== null, () => {
    setSheet(null);
    setIsOpen(false);
    run.toast({ message: OPEN_FAILED_LINE });
  });
  useEffect(() => warmWhenIdle(unitSheet), []);

  // The counted rows (the record's "3 units") and the house-meter rows, each with its place in the list.
  const indexed = initial.map((u, i) => ({ u, i }));
  const rentable = indexed.filter(({ u }) => !isHouseMeterRow(u));
  const meters = indexed.filter(({ u }) => isHouseMeterRow(u));

  function openUnit(index: number | null) {
    const opened = index == null ? null : (initial[index] ?? null);
    setSheet({ unitId: opened?.id ?? null, at: opened ? index : null, opened, version, id: (sheet?.id ?? 0) + 1 });
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
      unitId: unit.id ?? null,
      at: i,
      label: unit.label,
      name: unitName(unit, i),
      title: `Delete ${unitName(unit, i)} at ${shortAddress(address)}?`,
      body: question?.body ?? "Its lockbox code, utilities and equipment go with it.",
    });
  }

  function confirmDelete() {
    if (!removing) return;
    // A refused delete brings the page back on the latest; the unit is found again by id, never by its old place alone.
    const unit = initial[sheetUnitAt(initial, removing)];
    const id = unit?.id;
    // Gone already (deleted elsewhere): nothing left to delete, and the list behind shows it.
    if (!id) return setRemoving(null);
    run.run(() => deletePropertyUnit(propertyId, id, version), {
      failure: "inline",
      succeeded: () => setRemoving(null),
      done: `${removing.name} deleted`,
    });
  }

  // Found by id (unit-sheet.ts sheetUnitAt), so a unit added or deleted elsewhere never moves the sheet onto another one.
  const editingAt = sheet ? sheetUnitAt(initial, { unitId: sheet.unitId, at: sheet.at, label: sheet.opened?.label }) : -1;
  const editing = editingAt >= 0 ? initial[editingAt] : undefined;

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
      <AddRow onClick={() => openUnit(null)} onIntent={unitSheet.warm}>
        Add unit
      </AddRow>
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

      {sheet && editor && (
        <editor.UnitSheet
          key={sheet.id}
          propertyId={propertyId}
          version={sheet.version}
          latest={version}
          unit={editing ?? sheet.opened ?? blankUnit()}
          isNew={sheet.opened === null}
          gone={sheet.opened !== null && !editing}
          title={editing ? unitName(editing, editingAt) : sheet.opened?.label?.trim() || "New unit"}
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
      <AriaButton
        aria-label={`${name} actions`}
        onHoverStart={unitSheet.warm}
        onFocus={unitSheet.warm}
        onPressStart={unitSheet.warm}
        className={buttonClass({ variant: "ghost", size: "sm", icon: true })}
      >
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
          {...warmOnIntent(unitSheet)}
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


function blankUnit(): PropertyUnit {
  return { label: "", lockboxCode: "", utilities: {}, equipment: [] };
}
