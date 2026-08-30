"use client";
import { useState, useTransition } from "react";
import { Badge, Button, EmptyState } from "@/components/ui";
import type { PropertyUnit } from "@/lib/property-types";
import {
  UTILITY_GROUPS,
  UTILITY_STATUS_FIELDS,
  UTILITY_STATUS_OPTIONS,
  utilityStatusTone,
  equipmentAge,
  equipmentStatus,
  equipmentStatusTone,
  equipmentReplacementCost,
} from "@/lib/property-types";
import { fmtMoney } from "@/lib/utils";
import { EQUIPMENT_TYPES } from "@/lib/config";
import { updatePropertyUnits } from "../actions";

const inp =
  "w-full rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary";

const fmtAge = (n: number | null) => (n == null ? "—" : `${n} yr${n === 1 ? "" : "s"}`);

/** Text colour for a status tone — used instead of a pill to keep the tables quiet. */
const toneText: Record<string, string> = {
  green: "text-green-700 dark:text-green-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  gray: "",
};

export function UnitsSection({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: PropertyUnit[];
}) {
  const [editing, setEditing] = useState(false);
  const [units, setUnits] = useState<PropertyUnit[]>(structuredClone(initial));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(units) !== JSON.stringify(initial);

  function mutate(fn: (u: PropertyUnit[]) => void) {
    setUnits((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  function save() {
    start(async () => {
      await updatePropertyUnits(propertyId, units);
      setConfirmOpen(false);
      setEditing(false);
    });
  }

  function discard() {
    setUnits(structuredClone(initial));
    setConfirmOpen(false);
    setEditing(false);
  }

  function cancel() {
    if (dirty) setConfirmOpen(true);
    else discard();
  }

  return (
    <div className="group rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Units &amp; access</h3>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-primary opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => mutate((x) => x.push(blankUnit()))}>
              + Add unit
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4 p-4">
        {!editing ? (
          <ReadUnits units={initial} />
        ) : (
          units.map((u, i) => <EditUnitCard key={i} unit={u} index={i} mutate={mutate} />)
        )}
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold">Discard unsaved changes?</h4>
            <p className="mt-1 text-xs text-muted">
              You have unsaved changes to units &amp; access. Save them, or discard and exit.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(false)}>
                Keep editing
              </Button>
              <Button size="sm" variant="secondary" onClick={discard}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-semibold [&::-webkit-details-marker]:hidden">
        <svg
          className="h-3 w-3 shrink-0 text-muted transition-transform group-open:rotate-90"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path
            d="M4.5 3l3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {title}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

function ReadUnits({ units }: { units: PropertyUnit[] }) {
  if (units.length === 0) return <EmptyState>No unit-level records.</EmptyState>;
  return (
    <>
      {units.map((u, i) => {
        const hasUtilities = UTILITY_GROUPS.some((g) => g.fields.some(([k]) => u.utilities?.[k]));
        const equipment = u.equipment ?? [];
        return (
        <div key={i} className="rounded-lg border border-border">
          <div className="flex items-baseline gap-2 border-b border-border bg-background px-3 py-2">
            <span className="text-sm font-medium">{u.label || `Unit ${i + 1}`}</span>
            {u.lockboxCode && (
              <span className="text-xs text-muted">🔒 {u.lockboxCode}</span>
            )}
          </div>
          {hasUtilities && (
            <Accordion title="Utilities" defaultOpen>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                {UTILITY_GROUPS.map((g) => {
                  const rows = g.fields.filter(([k]) => u.utilities?.[k]);
                  if (rows.length === 0) return null;
                  return (
                    <div key={g.name}>
                      <div className="mb-1 text-xs font-semibold">{g.name}</div>
                      <div className="space-y-1">
                        {rows.map(([k, label]) => (
                          <div key={k} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-muted">{label}</span>
                            <span
                              className={
                                "font-medium " +
                                (UTILITY_STATUS_FIELDS.has(k)
                                  ? toneText[utilityStatusTone(u.utilities![k])]
                                  : "")
                              }
                            >
                              {u.utilities![k]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Accordion>
          )}
          {equipment.length > 0 && (
            <Accordion title="Equipment">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="text-left text-muted [&>th]:pb-1 [&>th]:pr-3 [&>th]:font-medium">
                      <th>Type</th>
                      <th>Model #</th>
                      <th>Comments</th>
                      <th>Year</th>
                      <th>Age</th>
                      <th>Status</th>
                      <th className="text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="align-top [&>tr>td]:py-0.5 [&>tr>td]:pr-3">
                    {equipment.map((e, j) => {
                      const status = equipmentStatus(e.type, e.installYear);
                      const cost = equipmentReplacementCost(e.type);
                      return (
                        <tr key={j}>
                          <td className="text-muted">{e.type}</td>
                          <td className="font-medium">{e.model || "—"}</td>
                          <td className="min-w-[160px] text-muted">{e.comment || "—"}</td>
                          <td className="font-medium">{e.installYear || "—"}</td>
                          <td className="font-medium">{fmtAge(equipmentAge(e.installYear))}</td>
                          <td>
                            {status === "Replace" ? (
                              <Badge tone="red">Replace</Badge>
                            ) : status ? (
                              <span className={"font-medium " + toneText[equipmentStatusTone(status)]}>
                                {status}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="!pr-0 text-right font-semibold tabular-nums text-red-600 dark:text-red-400">
                            {status === "Replace" && cost != null ? fmtMoney(cost) : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Accordion>
          )}
        </div>
        );
      })}
    </>
  );
}

function EditUnitCard({
  unit: u,
  index: i,
  mutate,
}: {
  unit: PropertyUnit;
  index: number;
  mutate: (fn: (u: PropertyUnit[]) => void) => void;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        <input
          className={inp + " max-w-[200px]"}
          placeholder="Unit name"
          value={u.label ?? ""}
          onChange={(e) => mutate((x) => (x[i].label = e.target.value))}
        />
        <span className="text-xs text-muted">Lockbox</span>
        <input
          className={inp + " max-w-[120px]"}
          value={u.lockboxCode ?? ""}
          onChange={(e) => mutate((x) => (x[i].lockboxCode = e.target.value))}
        />
        <button
          onClick={() => mutate((x) => x.splice(i, 1))}
          className="ml-auto text-xs text-red-500 hover:underline"
        >
          Remove unit
        </button>
      </div>

      <div className="grid gap-x-6 gap-y-4 px-3 py-3 sm:grid-cols-3">
        {UTILITY_GROUPS.map((g) => (
          <div key={g.name} className="space-y-1.5">
            <div className="text-xs font-semibold">{g.name}</div>
            {g.fields.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-muted">{label}</span>
                {UTILITY_STATUS_FIELDS.has(k) ? (
                  <select
                    className={inp}
                    value={u.utilities?.[k] ?? ""}
                    onChange={(e) =>
                      mutate((x) => (x[i].utilities = { ...x[i].utilities, [k]: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {UTILITY_STATUS_OPTIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inp}
                    value={u.utilities?.[k] ?? ""}
                    onChange={(e) =>
                      mutate((x) => (x[i].utilities = { ...x[i].utilities, [k]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-border px-3 py-2">
        <div className="mb-1 text-xs font-semibold">Equipment</div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px] space-y-1">
            {(u.equipment ?? []).length > 0 && (
              <div className="grid grid-cols-[140px_minmax(100px,1fr)_minmax(140px,1.3fr)_78px_52px_112px_68px_16px] items-center gap-2 text-xs font-medium text-muted">
                <span>Type</span>
                <span>Model #</span>
                <span>Comments</span>
                <span>Year</span>
                <span>Age</span>
                <span>Status</span>
                <span className="text-right">Cost</span>
                <span />
              </div>
            )}
            {(u.equipment ?? []).map((e, j) => {
              const status = equipmentStatus(e.type, e.installYear);
              const cost = equipmentReplacementCost(e.type);
              return (
                <div
                  key={j}
                  className="grid grid-cols-[140px_minmax(100px,1fr)_minmax(140px,1.3fr)_78px_52px_112px_68px_16px] items-center gap-2"
                >
                  <select
                    className={inp}
                    value={e.type}
                    onChange={(ev) => mutate((x) => (x[i].equipment![j].type = ev.target.value))}
                  >
                    {[...new Set([e.type, ...EQUIPMENT_TYPES])].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    className={inp}
                    placeholder="Model #"
                    value={e.model ?? ""}
                    onChange={(ev) => mutate((x) => (x[i].equipment![j].model = ev.target.value))}
                  />
                  <input
                    className={inp}
                    placeholder="Comments"
                    value={e.comment ?? ""}
                    onChange={(ev) => mutate((x) => (x[i].equipment![j].comment = ev.target.value))}
                  />
                  <input
                    className={inp}
                    placeholder="Year"
                    value={e.installYear ?? ""}
                    onChange={(ev) =>
                      mutate((x) => (x[i].equipment![j].installYear = ev.target.value))
                    }
                  />
                  <span className="text-xs tabular-nums text-muted">
                    {fmtAge(equipmentAge(e.installYear))}
                  </span>
                  <span className="text-xs">
                    {status === "Replace" ? (
                      <Badge tone="red">Replace</Badge>
                    ) : status ? (
                      <span className={"font-medium " + toneText[equipmentStatusTone(status)]}>
                        {status}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </span>
                  <span className="text-right text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {status === "Replace" && cost != null ? fmtMoney(cost) : ""}
                  </span>
                  <button
                    onClick={() => mutate((x) => x[i].equipment!.splice(j, 1))}
                    className="shrink-0 text-xs text-red-500 hover:underline"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <button
          onClick={() =>
            mutate((x) => {
              x[i].equipment = [
                ...(x[i].equipment ?? []),
                { type: EQUIPMENT_TYPES[0], model: "", installYear: "", comment: "" },
              ];
            })
          }
          className="mt-1.5 text-xs text-primary hover:underline"
        >
          + Add equipment
        </button>
      </div>
    </div>
  );
}

function blankUnit(): PropertyUnit {
  return { label: "", lockboxCode: "", utilities: {}, equipment: [] };
}
