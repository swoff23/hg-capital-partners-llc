"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import type { PropertyUnit } from "@/lib/property-types";
import { UTILITY_LABELS } from "@/lib/property-types";
import { EQUIPMENT_TYPES } from "@/lib/config";
import { updatePropertyUnits } from "../actions";

const inp =
  "w-full rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary";

export function EditUnits({ propertyId, initial }: { propertyId: string; initial: PropertyUnit[] }) {
  const [units, setUnits] = useState<PropertyUnit[]>(
    initial.length ? structuredClone(initial) : [blankUnit()],
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

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
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="space-y-4">
      {units.map((u, i) => (
        <div key={i} className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
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
                <span className="w-32 shrink-0 text-muted">{label}</span>
                <input
                  className={inp}
                  value={u.utilities?.[k] ?? ""}
                  onChange={(e) =>
                    mutate((x) => {
                      x[i].utilities = { ...x[i].utilities, [k]: e.target.value };
                    })
                  }
                />
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
                  x[i].equipment = [...(x[i].equipment ?? []), { type: EQUIPMENT_TYPES[0], model: "", installYear: "" }];
                })
              }
              className="mt-1.5 text-xs text-primary hover:underline"
            >
              + Add equipment
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => mutate((x) => x.push(blankUnit()))}>
          + Add unit
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save units"}
        </Button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </div>
  );
}

function blankUnit(): PropertyUnit {
  return { label: "", lockboxCode: "", utilities: {}, equipment: [] };
}
