"use client";
import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import {
  BUILDING_CAPEX_ITEMS,
  buildingCapexRows,
  equipmentStatusTone,
  type BuildingCapexData,
} from "@/lib/property-types";
import { updateBuildingCapex } from "../actions";

const inp =
  "w-full rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary";

const toneText: Record<string, string> = {
  green: "text-green-700 dark:text-green-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  gray: "text-muted",
};

type Draft = Record<string, { year: string; cost: string }>;

function toDraft(data: BuildingCapexData): Draft {
  const d: Draft = {};
  for (const item of BUILDING_CAPEX_ITEMS) {
    const e = data[item.key];
    d[item.key] = {
      year: e?.year ?? "",
      cost: e?.costOverride != null ? String(e.costOverride) : "",
    };
  }
  return d;
}

export function BuildingCapexSection({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: BuildingCapexData;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [pending, start] = useTransition();

  const rows = buildingCapexRows(initial);
  const setCell = (key: string, field: "year" | "cost", value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));

  function save() {
    const payload: Record<string, { year: string | null; costOverride: number | null }> = {};
    for (const item of BUILDING_CAPEX_ITEMS) {
      const c = draft[item.key];
      const costNum = parseFloat(c.cost.replace(/[$,\s]/g, ""));
      payload[item.key] = {
        year: c.year.trim() || null,
        costOverride: Number.isFinite(costNum) && costNum > 0 ? costNum : null,
      };
    }
    start(async () => {
      await updateBuildingCapex(propertyId, payload);
      setEditing(false);
    });
  }

  function cancel() {
    setDraft(toDraft(initial));
    setEditing(false);
  }

  return (
    <div className="group rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex min-h-[3.25rem] items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h3 className="shrink-0 text-sm font-semibold">Building CapEx</h3>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-primary opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
          >
            Edit
          </button>
        )}
      </div>

      <div className="p-4">
        {editing ? (
          <div className="space-y-2">
            {BUILDING_CAPEX_ITEMS.map((item) => (
              <div key={item.key} className="grid grid-cols-[1fr_70px_84px] items-center gap-2">
                <span className="text-xs">{item.label}</span>
                <input
                  className={inp}
                  placeholder="Year"
                  value={draft[item.key].year}
                  onChange={(e) => setCell(item.key, "year", e.target.value)}
                />
                <input
                  className={inp + " text-right"}
                  placeholder={fmtMoney(item.defaultCost)}
                  value={draft[item.key].cost}
                  onChange={(e) => setCell(item.key, "cost", e.target.value)}
                />
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted">
              Year installed / replaced / last renovated. Cost is optional — leave blank to use the
              default shown.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <div key={r.key} className="flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-[11px] text-muted">
                    {r.year ?? "no date"}
                    {r.age != null && ` · ${r.age} yr${r.age === 1 ? "" : "s"}`}
                    {r.replacementYear != null && ` · replace ~${r.replacementYear}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular-nums">
                    {fmtMoney(r.cost)}
                    {r.costOverridden && <span className="text-muted"> *</span>}
                  </div>
                  <div className="text-[11px]">
                    {r.status === "Replace" ? (
                      <Badge tone="red">Replace</Badge>
                    ) : (
                      <span className={"font-medium " + toneText[equipmentStatusTone(r.status)]}>
                        {r.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
