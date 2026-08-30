"use client";
import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import {
  BUILDING_CAPEX_ITEMS,
  equipmentStatusTone,
  lifecycleStatus,
  parseInstallYear,
  type BuildingCapexData,
  type EquipmentStatus,
} from "@/lib/property-types";
import { updateBuildingCapex } from "../actions";

const inp =
  "w-full rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary";
const cols =
  "grid grid-cols-[minmax(104px,1.25fr)_minmax(78px,1fr)_52px_44px_72px_66px] items-center gap-2";

const toneText: Record<string, string> = {
  green: "text-green-700 dark:text-green-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  gray: "text-muted",
};

const NOW = new Date().getFullYear();
const fmtAge = (n: number | null) => (n == null ? "—" : `${n} yr${n === 1 ? "" : "s"}`);

type DraftEntry = { type: string; year: string; cost: string };
type Draft = Record<string, DraftEntry>;

function toDraft(data: BuildingCapexData): Draft {
  const d: Draft = {};
  for (const item of BUILDING_CAPEX_ITEMS) {
    const e = data[item.key];
    d[item.key] = {
      type: e?.type ?? "",
      year: e?.year ?? "",
      cost: e?.costOverride != null ? String(e.costOverride) : "",
    };
  }
  return d;
}

function StatusCell({ status }: { status: EquipmentStatus }) {
  if (status === "Replace") return <Badge tone="red">Replace</Badge>;
  return (
    <span className={"font-medium " + toneText[equipmentStatusTone(status)]}>{status}</span>
  );
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

  const setCell = (key: string, field: keyof DraftEntry, value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));

  function save() {
    const payload: Record<
      string,
      { type: string | null; year: string | null; costOverride: number | null }
    > = {};
    for (const item of BUILDING_CAPEX_ITEMS) {
      const c = draft[item.key];
      const costNum = parseFloat(c.cost.replace(/[$,\s]/g, ""));
      payload[item.key] = {
        type: c.type.trim() || null,
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

  /** Row state from a source (draft in edit mode, stored data in read mode). */
  const rowFor = (item: (typeof BUILDING_CAPEX_ITEMS)[number], src: { type: string; year: string; costOverride: number | null }) => {
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
        <div className="overflow-x-auto">
          <div className="min-w-[420px] space-y-1.5">
            <div className={cols + " text-[11px] font-medium text-muted"}>
              <span>Component</span>
              <span>Type</span>
              <span>Year</span>
              <span>Age</span>
              <span>Status</span>
              <span>Cost</span>
            </div>

            {BUILDING_CAPEX_ITEMS.map((item) => {
              const d = draft[item.key];
              const stored = initial[item.key];
              const src = editing
                ? {
                    type: d.type,
                    year: d.year,
                    costOverride: (() => {
                      const n = parseFloat(d.cost.replace(/[$,\s]/g, ""));
                      return Number.isFinite(n) && n > 0 ? n : null;
                    })(),
                  }
                : {
                    type: stored?.type ?? "",
                    year: stored?.year ?? "",
                    costOverride: stored?.costOverride ?? null,
                  };
              const rs = rowFor(item, src);
              const showCost = rs.status === "Monitor" || rs.status === "Replace";
              const costClass =
                "tabular-nums " +
                (rs.status === "Replace"
                  ? "font-semibold text-red-600 dark:text-red-400"
                  : rs.status === "Monitor"
                    ? "font-semibold text-amber-700 dark:text-amber-400"
                    : "text-muted");

              return (
                <div key={item.key} className={cols}>
                  <span className="text-xs">{item.label}</span>

                  {editing ? (
                    <input
                      className={inp}
                      placeholder="e.g. Shingle"
                      value={d.type}
                      onChange={(e) => setCell(item.key, "type", e.target.value)}
                    />
                  ) : (
                    <span className="truncate text-xs text-muted">{src.type || "—"}</span>
                  )}

                  {editing ? (
                    <input
                      className={inp}
                      placeholder="Year"
                      value={d.year}
                      onChange={(e) => setCell(item.key, "year", e.target.value)}
                    />
                  ) : (
                    <span className="text-xs">{src.year || "—"}</span>
                  )}

                  <span className="text-xs tabular-nums text-muted">{fmtAge(rs.age)}</span>
                  <span className="text-[11px]">
                    <StatusCell status={rs.status} />
                  </span>

                  {editing ? (
                    <input
                      className={inp}
                      placeholder={fmtMoney(item.defaultCost)}
                      value={d.cost}
                      onChange={(e) => setCell(item.key, "cost", e.target.value)}
                    />
                  ) : (
                    <span className={"text-xs " + costClass}>
                      {showCost ? fmtMoney(rs.cost) : ""}
                      {showCost && rs.overridden && (
                        <span className="font-normal text-muted"> *</span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
}
