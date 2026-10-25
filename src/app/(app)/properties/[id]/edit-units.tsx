"use client";
import { useState, useTransition, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ChevronRight, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Code } from "@/components/code";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Money } from "@/components/money";
import { Button, SectionCard, Table, Td, Th, buttonClass, fieldClass, selectTouchHeight } from "@/components/ui";
import type { CapexRules, PropertyUnit, UnitUtilities } from "@/lib/property-types";
import {
  UTILITY_GROUPS,
  UTILITY_STATUS_FIELDS,
  utilityStatusChoices,
  utilityStatusTone,
  equipmentAge,
  equipmentStatus,
  equipmentReplacementCost,
} from "@/lib/property-types";
import { removeUnitQuestion, unitRefKey, type UnitRefs } from "@/lib/properties/unit-refs";
import { shortAddress } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { EQUIPMENT_TYPES } from "@/lib/config";
import { callAction } from "@/lib/action-result";
import { updatePropertyUnits } from "../actions";
import { EquipmentStatusText, fmtAge, utilityToneClass } from "../capex-ui";
import { AddRow, SaveError } from "./record-ui";

/** A field in a dense editor row: 32px with a mouse, 44 on touch. */
const inp = cn(fieldClass, "h-8");

/** The account-number fields, read as codes and masked to their last four. */
const isAccountField = (k: keyof UnitUtilities) => k.endsWith("Acct");

/** What a unit goes by in a row or a dialog: its label, or its place in the list. */
const unitName = (u: PropertyUnit, i: number) => u.label?.trim() || `Unit ${i + 1}`;

type Removing = { index: number; title: string; body: string; saved: boolean };

/**
 * The property's units, one row each (docs/brand-guidelines.md, section 9
 * Counted lists): Add unit is the last row and Delete sits in each row's ⋯
 * menu, so the count shown on the record is always the rows here. Edit opens
 * every unit's access, utilities and equipment at once; adding a unit opens
 * the same editor with a blank one at the end. A Delete from the list saves
 * at once, after its confirm; one inside the editor waits for Save.
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
  /** Property.updatedAt the page rendered with; Edit pins it, and the save refuses a newer row. */
  version: string;
  initial: PropertyUnit[];
  rules: CapexRules;
  /** Open tasks and listings per saved unit label (unit-refs.ts countUnitRefs). */
  unitRefs: Record<string, UnitRefs>;
}) {
  const [editing, setEditing] = useState(false);
  const [units, setUnits] = useState<PropertyUnit[]>(structuredClone(initial));
  // The version Edit opened at. A save in another card refreshes the page with a
  // newer one, and sending that would let this draft overwrite a partner's change.
  const [editVersion, setEditVersion] = useState(version);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A unit Add unit opened and nobody typed into isn't a change, so Cancel doesn't ask about it.
  const dirty = JSON.stringify(units.filter((u) => !isUntouchedNew(u))) !== JSON.stringify(initial);

  function mutate(fn: (u: PropertyUnit[]) => void) {
    setUnits((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  /**
   * Start from what's saved now: after a save the page brings each new unit's
   * id, and a rename only reaches its tasks when the ids it sends are those.
   */
  function edit(withNew = false) {
    setError(null);
    setUnits(withNew ? [...structuredClone(initial), blankUnit()] : structuredClone(initial));
    setEditVersion(version);
    setEditing(true);
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await callAction(() => updatePropertyUnits(propertyId, units, editVersion));
      if (!r.ok) {
        setError(r.error);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      setEditing(false);
    });
  }

  function discard() {
    setError(null);
    setUnits(structuredClone(initial));
    setConfirmOpen(false);
    setEditing(false);
  }

  function cancel() {
    if (dirty) setConfirmOpen(true);
    else discard();
  }

  /**
   * The Delete confirm for unit `i` of `list`. Tasks and listings name a unit
   * by its saved label, so the body says what still names it (decision 19),
   * unless another unit in the list keeps that label.
   */
  function deleteQuestion(list: PropertyUnit[], i: number): { title: string; body: string | null } {
    const saved = initial.find((u) => u.id && u.id === list[i].id)?.label ?? "";
    const key = unitRefKey(saved);
    const kept = list.some((u, j) => j !== i && unitRefKey(u.label) === key);
    const question = key && !kept ? removeUnitQuestion(saved, unitRefs[key]) : null;
    return {
      title: `Delete ${unitName(list[i], i)} at ${shortAddress(address)}`,
      body: question?.body ?? null,
    };
  }

  // From the list: always confirm, since it saves at once.
  function askDeleteSaved(i: number) {
    setError(null);
    const q = deleteQuestion(initial, i);
    setRemoving({
      index: i,
      saved: true,
      title: q.title,
      body: q.body ?? "Its lockbox code, utilities and equipment go with it.",
    });
  }

  // In the editor: a unit something still names asks first; anything else goes from the draft.
  function removeFromDraft(i: number) {
    const q = deleteQuestion(units, i);
    if (q.body) setRemoving({ index: i, saved: false, title: q.title, body: q.body });
    else mutate((x) => x.splice(i, 1));
  }

  function confirmRemove() {
    if (!removing) return;
    const { index, saved } = removing;
    if (!saved) {
      mutate((x) => x.splice(index, 1));
      setRemoving(null);
      return;
    }
    const next = initial.filter((_, j) => j !== index);
    start(async () => {
      const r = await callAction(() => updatePropertyUnits(propertyId, next, version));
      if (!r.ok) setError(r.error);
      setRemoving(null);
    });
  }

  return (
    <SectionCard
      title="Units & access"
      onEdit={() => edit()}
      editing={editing}
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {!editing ? (
        <>
          {initial.length === 0 ? (
            <p className="pb-2 text-body text-fg-3">Add each unit to keep its lockbox code, utilities and equipment here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {initial.map((u, i) => (
                <ReadUnit
                  key={u.id ?? i}
                  unit={u}
                  name={unitName(u, i)}
                  rules={rules}
                  onDelete={() => askDeleteSaved(i)}
                />
              ))}
            </ul>
          )}
          <AddRow onClick={() => edit(true)}>Add unit</AddRow>
        </>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {units.map((u, i) => (
              <EditUnit
                key={u.id ?? `new-${i}`}
                unit={u}
                index={i}
                name={unitName(u, i)}
                mutate={mutate}
                rules={rules}
                onRemove={() => removeFromDraft(i)}
              />
            ))}
          </ul>
          <AddRow onClick={() => mutate((x) => x.push(blankUnit()))}>Add unit</AddRow>
        </>
      )}

      {error && <SaveError className="mt-2">{error}</SaveError>}

      {removing && (
        <ConfirmDialog
          title={removing.title}
          body={removing.body}
          onClose={() => setRemoving(null)}
          cancelLabel="Keep it"
          busy={removing.saved && pending}
          actions={
            <Button size="sm" variant="destructive" onClick={confirmRemove} disabled={removing.saved && pending}>
              {removing.saved && pending ? "Deleting…" : "Delete unit"}
            </Button>
          }
        />
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body={<>You have unsaved changes to units &amp; access. Save them, or discard and exit.</>}
          onClose={() => setConfirmOpen(false)}
          cancelLabel="Keep editing"
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={discard}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        />
      )}
    </SectionCard>
  );
}

/** A unit's ⋯ menu: Delete, the one thing a row does besides opening its details. */
function UnitMenu({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <MenuTrigger>
      <AriaButton aria-label={`${name} actions`} className={buttonClass({ variant: "ghost", size: "sm", icon: true })}>
        <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      </AriaButton>
      <Menu>
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
  onDelete,
}: {
  unit: PropertyUnit;
  name: string;
  rules: CapexRules;
  onDelete: () => void;
}) {
  const hasUtilities = UTILITY_GROUPS.some((g) => g.fields.some(([k]) => u.utilities?.[k]));
  const equipment = u.equipment ?? [];
  return (
    <li className="py-1.5">
      <div className="flex min-h-8 items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-body text-fg-1">{name}</p>
        {u.lockboxCode && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-meta text-fg-3 max-[480px]:hidden">Lockbox</span>
            <Code value={u.lockboxCode} label="Lockbox code" />
          </span>
        )}
        <UnitMenu name={name} onDelete={onDelete} />
      </div>
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
                    <Td numeric className="pr-0">
                      {status === "Replace" && cost != null ? <Money value={cost} /> : null}
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

const EQUIPMENT_COLS =
  "grid grid-cols-[140px_minmax(100px,1fr)_minmax(140px,1.3fr)_78px_52px_112px_72px_44px] items-center gap-2";

function EditUnit({
  unit: u,
  index: i,
  name,
  mutate,
  rules,
  onRemove,
}: {
  unit: PropertyUnit;
  index: number;
  name: string;
  mutate: (fn: (u: PropertyUnit[]) => void) => void;
  rules: CapexRules;
  onRemove: () => void;
}) {
  const equipment = u.equipment ?? [];
  return (
    <li className="space-y-4 py-4 first:pt-1">
      {/* One row at every width: the name takes what the lockbox and the menu leave. */}
      <div className="flex items-center gap-2">
        <input
          className={cn(inp, "min-w-0 flex-1 sm:max-w-56")}
          aria-label="Unit name"
          placeholder="Unit name"
          // A unit just added (no id yet) opens with the caret in its name.
          autoFocus={!u.id}
          value={u.label ?? ""}
          onChange={(e) => mutate((x) => (x[i].label = e.target.value))}
        />
        <label className="flex shrink-0 items-center gap-2">
          <span className="text-meta text-fg-3 max-[480px]:sr-only">Lockbox</span>
          <input
            className={cn(inp, "w-24 font-mono")}
            placeholder="Code"
            value={u.lockboxCode ?? ""}
            onChange={(e) => mutate((x) => (x[i].lockboxCode = e.target.value))}
          />
        </label>
        <span className="ml-auto shrink-0">
          <UnitMenu name={name} onDelete={onRemove} />
        </span>
      </div>

      <div className="@container">
        <div className="grid gap-x-6 gap-y-4 @min-[36rem]:grid-cols-3">
          {UTILITY_GROUPS.map((g) => (
            <div key={g.name} className="space-y-1.5">
              <p className="text-meta font-medium text-fg-1">{g.name}</p>
              {g.fields.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-meta text-fg-3">{label}</span>
                  {UTILITY_STATUS_FIELDS.has(k) ? (
                    <select
                      className={cn(inp, selectTouchHeight)}
                      value={u.utilities?.[k] ?? ""}
                      onChange={(e) => mutate((x) => (x[i].utilities = { ...x[i].utilities, [k]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {utilityStatusChoices(u.utilities?.[k]).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={cn(inp, isAccountField(k) && "font-mono")}
                      value={u.utilities?.[k] ?? ""}
                      onChange={(e) => mutate((x) => (x[i].utilities = { ...x[i].utilities, [k]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-meta font-medium text-fg-1">Equipment</p>
        {equipment.length > 0 && (
          <div className="overflow-x-auto">
            <div className="min-w-200 space-y-1">
              <div className={cn(EQUIPMENT_COLS, "text-meta font-medium text-fg-3")}>
                <span>Type</span>
                <span>Model #</span>
                <span>Comments</span>
                <span>Year</span>
                <span>Age</span>
                <span>Status</span>
                <span className="text-right">Cost</span>
                <span />
              </div>
              {equipment.map((e, j) => {
                const status = equipmentStatus(e.type, e.installYear, rules);
                const cost = equipmentReplacementCost(e.type, rules);
                return (
                  <div key={j} className={EQUIPMENT_COLS}>
                    <select
                      className={cn(inp, selectTouchHeight)}
                      aria-label="Type"
                      value={e.type}
                      onChange={(ev) => mutate((x) => (x[i].equipment![j].type = ev.target.value))}
                    >
                      {[...new Set([e.type, ...EQUIPMENT_TYPES])].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      className={inp}
                      aria-label="Model #"
                      placeholder="Model #"
                      value={e.model ?? ""}
                      onChange={(ev) => mutate((x) => (x[i].equipment![j].model = ev.target.value))}
                    />
                    <input
                      className={inp}
                      aria-label="Comments"
                      placeholder="Comments"
                      value={e.comment ?? ""}
                      onChange={(ev) => mutate((x) => (x[i].equipment![j].comment = ev.target.value))}
                    />
                    <input
                      className={inp}
                      aria-label="Year"
                      placeholder="Year"
                      value={e.installYear ?? ""}
                      onChange={(ev) => mutate((x) => (x[i].equipment![j].installYear = ev.target.value))}
                    />
                    <span className="num text-meta text-fg-2">{fmtAge(equipmentAge(e.installYear))}</span>
                    <span className="text-meta">
                      <EquipmentStatusText status={status} />
                    </span>
                    <span className="text-right text-meta text-fg-1">
                      {status === "Replace" && cost != null ? <Money value={cost} /> : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon
                      aria-label={`Remove ${e.type || "equipment"}`}
                      onClick={() => mutate((x) => x[i].equipment!.splice(j, 1))}
                    >
                      <X aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 mt-1"
          onClick={() =>
            mutate((x) => {
              x[i].equipment = [
                ...(x[i].equipment ?? []),
                { type: EQUIPMENT_TYPES[0], model: "", installYear: "", comment: "" },
              ];
            })
          }
        >
          <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
          Add equipment
        </Button>
      </div>
    </li>
  );
}

function blankUnit(): PropertyUnit {
  return { label: "", lockboxCode: "", utilities: {}, equipment: [] };
}

/** A unit added in this draft (no id yet) with nothing typed into it. */
function isUntouchedNew(u: PropertyUnit): boolean {
  return (
    !u.id &&
    !u.label?.trim() &&
    !u.lockboxCode?.trim() &&
    !Object.values(u.utilities ?? {}).some((v) => v?.trim()) &&
    (u.equipment?.length ?? 0) === 0
  );
}
