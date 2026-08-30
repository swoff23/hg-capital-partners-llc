"use client";
import { useState, useTransition } from "react";
import { Badge, Button, EmptyState } from "@/components/ui";
import type { PropertyUnit } from "@/lib/property-types";
import {
  UTILITY_LABELS,
  UTILITY_STATUS_FIELDS,
  UTILITY_STATUS_OPTIONS,
  utilityStatusTone,
} from "@/lib/property-types";
import { EQUIPMENT_TYPES } from "@/lib/config";
import { updatePropertyUnits } from "../actions";

const inp =
  "w-full rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary";

export function UnitsSection({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: PropertyUnit[];
}) {
  const [editing, setEditing] = useState(false);
  const [units, setUnits] = useState<PropertyUnit[]>(structuredClone(initial));
  const [pending, start] = useTransition();

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
      setEditing(false);
    });
  }

  function cancel() {
    setUnits(structuredClone(initial));
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Units &amp; access</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted">{units.length} units</span>
          {!editing && (
            <button onClick={() => setEditing(true)} className="font-medium text-primary hover:underline">
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {!editing ? (
          <ReadUnits units={initial} />
        ) : (
          <>
            {units.map((u, i) => (
              <EditUnitCard key={i} unit={u} index={i} mutate={mutate} />
            ))}
            <div className="flex items-center gap-3">
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
          </>
        )}
      </div>
    </div>
  );
}

function ReadUnits({ units }: { units: PropertyUnit[] }) {
  if (units.length === 0) return <EmptyState>No unit-level records.</EmptyState>;
  return (
    <>
      {units.map((u, i) => (
        <div key={i} className="rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border bg-background px-3 py-2">
            <span className="text-sm font-medium">{u.label || `Unit ${i + 1}`}</span>
            {u.lockboxCode && <span className="font-mono text-xs">🔒 {u.lockboxCode}</span>}
          </div>
          <div className="grid gap-x-6 gap-y-1 px-3 py-2 sm:grid-cols-2">
            {UTILITY_LABELS.map(([k, label]) =>
              u.utilities?.[k] ? (
                <div key={k} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">{label}</span>
                  {UTILITY_STATUS_FIELDS.has(k) ? (
                    <Badge tone={utilityStatusTone(u.utilities[k])}>{u.utilities[k]}</Badge>
                  ) : (
                    <span className="font-medium">{u.utilities[k]}</span>
                  )}
                </div>
              ) : null,
            )}
          </div>
          {u.equipment && u.equipment.length > 0 && (
            <div className="border-t border-border px-3 py-2">
              <div className="mb-1 text-xs font-medium text-muted">Equipment</div>
              <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {u.equipment.map((e, j) => (
                  <div key={j} className="flex justify-between text-xs">
                    <span className="text-muted">{e.type}</span>
                    <span className="font-mono">
                      {[e.model, e.installYear].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
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
          className={inp + " max-w-[120px] font-mono"}
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

      <div className="grid gap-x-4 gap-y-1.5 px-3 py-2 sm:grid-cols-2">
        {UTILITY_LABELS.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-xs">
            <span className="w-36 shrink-0 text-muted">{label}</span>
            {UTILITY_STATUS_FIELDS.has(k) ? (
              <select
                className={inp}
                value={u.utilities?.[k] ?? ""}
                onChange={(e) => mutate((x) => (x[i].utilities = { ...x[i].utilities, [k]: e.target.value }))}
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
                onChange={(e) => mutate((x) => (x[i].utilities = { ...x[i].utilities, [k]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>

      <div className="border-t border-border px-3 py-2">
        <div className="mb-1 text-xs font-medium text-muted">Equipment</div>
        <div className="space-y-1">
          {(u.equipment ?? []).map((e, j) => (
            <div key={j} className="flex items-center gap-2">
              <select
                className={inp + " max-w-[150px]"}
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
                className={inp + " max-w-[110px]"}
                placeholder="Year"
                value={e.installYear ?? ""}
                onChange={(ev) => mutate((x) => (x[i].equipment![j].installYear = ev.target.value))}
              />
              <button
                onClick={() => mutate((x) => x[i].equipment!.splice(j, 1))}
                className="shrink-0 text-xs text-red-500 hover:underline"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            mutate((x) => {
              x[i].equipment = [
                ...(x[i].equipment ?? []),
                { type: EQUIPMENT_TYPES[0], model: "", installYear: "" },
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
