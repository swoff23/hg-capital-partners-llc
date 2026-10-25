"use client";
import { useState, useTransition } from "react";
import { Button, SectionCard, Table, Td, Th, fieldClass } from "@/components/ui";
import { Money } from "@/components/money";
import { callAction } from "@/lib/action-result";
import { cn, fmtMoney } from "@/lib/utils";
import {
  lifecycleStatus,
  parseCapexCost,
  parseInstallYear,
  type BuildingCapexData,
  type BuildingRule,
  type CapexRules,
} from "@/lib/property-types";
import { updateBuildingCapex } from "../actions";
import { EquipmentStatusText, fmtAge } from "../capex-ui";
import { SaveError } from "./record-ui";

/** A field inside a table row: 32px with a mouse, so the row keeps its height. */
const cellField = cn(fieldClass, "h-8");

const NOW = new Date().getFullYear();

type DraftEntry = { type: string; year: string; cost: string };
type Draft = Record<string, DraftEntry>;

function toDraft(data: BuildingCapexData, items: BuildingRule[]): Draft {
  const d: Draft = {};
  for (const item of items) {
    const e = data[item.key];
    d[item.key] = {
      type: e?.type ?? "",
      year: e?.year ?? "",
      cost: e?.costOverride != null ? String(e.costOverride) : "",
    };
  }
  return d;
}

export function BuildingCapexSection({
  propertyId,
  version,
  initial,
  rules,
}: {
  propertyId: string;
  /** Property.updatedAt the page rendered with; Edit pins it, and the save refuses a newer row. */
  version: string;
  initial: BuildingCapexData;
  rules: CapexRules;
}) {
  const items = rules.building;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, items));
  // The version Edit opened at. A save in another card refreshes the page with a
  // newer one, and sending that would let this draft overwrite a partner's change.
  const [editVersion, setEditVersion] = useState(version);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const phoneHidden = editing ? undefined : "max-[480px]:hidden";
  // Type also drops where the record's main column is narrowest (536px at 1024, beside the rail).
  const typeHidden = editing ? undefined : "max-[480px]:hidden lg:max-xl:hidden";
  const datedCount = items.filter((item) => parseInstallYear(initial[item.key]?.year) != null).length;

  const setCell = (key: string, field: keyof DraftEntry, value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));

  function save() {
    const payload: Record<string, { type: string | null; year: string | null; costOverride: number | null }> = {};
    for (const item of items) {
      const c = draft[item.key];
      payload[item.key] = {
        type: c.type.trim() || null,
        year: c.year.trim() || null,
        costOverride: parseCapexCost(c.cost),
      };
    }
    setError(null);
    start(async () => {
      const r = await callAction(() => updateBuildingCapex(propertyId, payload, editVersion));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
    });
  }

  /** Start from what's saved now, at the version it was saved at. */
  function edit() {
    setError(null);
    setDraft(toDraft(initial, items));
    setEditVersion(version);
    setEditing(true);
  }

  function cancel() {
    setError(null);
    setDraft(toDraft(initial, items));
    setEditing(false);
  }

  /** Row state from a source (draft in edit mode, stored data in read mode). */
  const rowFor = (item: BuildingRule, src: { type: string; year: string; costOverride: number | null }) => {
    const installY = parseInstallYear(src.year);
    const age = installY == null ? null : Math.max(0, NOW - installY);
    return {
      age,
      status: lifecycleStatus(age, item.monitor, item.replace),
      cost: src.costOverride ?? item.defaultCost,
      overridden: src.costOverride != null && src.costOverride !== item.defaultCost,
    };
  };

  return (
    <SectionCard
      title="Building CapEx"
      onEdit={edit}
      editing={editing}
      actions={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={cancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <p className="num text-meta text-fg-3">
        {datedCount} of {items.length} systems dated
      </p>
      {error && <SaveError className="mt-2">{error}</SaveError>}

      {/* Reading on a phone, the type and age drop so the cost stays on screen; editing keeps
          every field and scrolls sideways in the table's own box. */}
      <Table className={cn("mt-2", editing && "min-w-105")}>
        <thead>
          <tr>
            <Th className="pl-0">Component</Th>
            <Th className={typeHidden}>Type</Th>
            <Th>Year</Th>
            <Th className={phoneHidden}>Age</Th>
            <Th>Status</Th>
            <Th numeric className="pr-0">
              Cost
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => {
            const d = draft[item.key];
            const stored = initial[item.key];
            const src = editing
              ? { type: d.type, year: d.year, costOverride: parseCapexCost(d.cost) }
              : { type: stored?.type ?? "", year: stored?.year ?? "", costOverride: stored?.costOverride ?? null };
            const rs = rowFor(item, src);
            const showCost = rs.status === "Monitor" || rs.status === "Replace";
            // Inputs sit in the row: 4px above and below a 32px field keeps it at 40px.
            const cell = editing ? "py-1 pointer-coarse:py-1" : undefined;

            return (
              <tr key={item.key}>
                <Td className={cn("pl-0 text-fg-1 align-middle", editing ? "whitespace-nowrap" : "min-[480px]:whitespace-nowrap", cell)}>
                  {item.label}
                </Td>
                <Td className={cn("align-middle", typeHidden, cell)}>
                  {editing ? (
                    <input
                      className={cn(cellField, "w-32")}
                      aria-label={`${item.label} type`}
                      placeholder="e.g. Shingle"
                      value={d.type}
                      onChange={(e) => setCell(item.key, "type", e.target.value)}
                    />
                  ) : src.type ? (
                    <span className="text-fg-2">{src.type}</span>
                  ) : (
                    <span className="text-fg-3">—</span>
                  )}
                </Td>
                <Td className={cn("num align-middle", cell)}>
                  {editing ? (
                    <input
                      className={cn(cellField, "w-20")}
                      aria-label={`${item.label} year`}
                      placeholder="Year"
                      value={d.year}
                      onChange={(e) => setCell(item.key, "year", e.target.value)}
                    />
                  ) : (
                    src.year || <span className="text-fg-3">—</span>
                  )}
                </Td>
                <Td className={cn("num whitespace-nowrap align-middle text-fg-2", phoneHidden, cell)}>{fmtAge(rs.age)}</Td>
                <Td className={cn("whitespace-nowrap align-middle", cell)}>
                  <EquipmentStatusText status={rs.status} />
                </Td>
                <Td numeric className={cn("pr-0 align-middle", cell)}>
                  {editing ? (
                    <input
                      className={cn(cellField, "w-24 text-right")}
                      aria-label={`${item.label} cost`}
                      placeholder={fmtMoney(item.defaultCost)}
                      value={d.cost}
                      onChange={(e) => setCell(item.key, "cost", e.target.value)}
                      // Show what will be stored: "8k" becomes "$8,000"; anything that
                      // isn't one clean amount clears back to the default cost.
                      onBlur={(e) => {
                        const n = parseCapexCost(e.target.value);
                        setCell(item.key, "cost", n == null ? "" : fmtMoney(n));
                      }}
                    />
                  ) : showCost ? (
                    <>
                      <Money value={rs.cost} />
                      {rs.overridden && (
                        <span className="text-fg-3"> *</span>
                      )}
                    </>
                  ) : (
                    // Nothing to spend yet (Good or Unknown): the empty-cell dash, so the column never reads unfinished.
                    <span className="text-fg-3">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </SectionCard>
  );
}
