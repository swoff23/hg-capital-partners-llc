"use client";
import { useState, useTransition } from "react";
import { Button, PageHeader, SectionCard } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fmtMoney } from "@/lib/utils";
import { EQUIPMENT_TYPES } from "@/lib/config";
import { DEFAULT_CAPEX_RULES, type BuildingRule, type CapexRules } from "@/lib/property-types";
import { saveCapexRules } from "./actions";

/**
 * Local editor state widens BuildingRule.key to allow `null` — a system just
 * added client-side has no server-assigned slug yet. `CapexRules` (real keys)
 * is always assignable here; `saveCapexRules`'s return narrows it back.
 */
type EditableBuildingRule = Omit<BuildingRule, "key"> & { key: string | null };
type EditableCapexRules = Omit<CapexRules, "building"> & { building: EditableBuildingRule[] };

/**
 * Roof / Furnace / Boiler / HVAC / Water Heater are tracked per unit
 * (Property.units[].equipment[]) — so the underlying rule is still an
 * EquipmentRule, matched by type — but they read as building systems, not
 * small appliances, so they're grouped under "Building systems" here.
 */
const BUILDING_LIKE_EQUIPMENT = new Set(["Roof", "Furnace", "Boiler", "HVAC", "Water Heater"]);

const quiet =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none hover:border-border focus:border-primary focus:bg-surface";
const rowGrid = "grid grid-cols-[minmax(160px,1fr)_4.5rem_4.5rem_6.5rem_1.5rem] items-center gap-1";
const addLink =
  "text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline disabled:hover:no-underline";

const fmtYrs = (n: number) => `${n} yr${n === 1 ? "" : "s"}`;
const parseNum = (s: string) => {
  const t = s.replace(/[$,\s]/g, "");
  return t === "" ? NaN : Number(t);
};

function TrashIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path
        d="M2.5 4h9M5.5 4V2.8c0-.44.36-.8.8-.8h1.4c.44 0 .8.36.8.8V4M8.7 4v7.2c0 .44-.36.8-.8.8H6.1c-.44 0-.8-.36-.8-.8V4M3.8 4l.35 7.25c.03.53.46.95.99.95h3.72c.53 0 .96-.42.99-.95L10.2 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One row of the rules table. Hover state is tracked in React (not CSS
 * `group-hover`) so the delete icon reliably shows for only the row the
 * pointer is actually over.
 */
function RuleRow({
  onRemove,
  canRemove,
  children,
}: {
  onRemove: () => void;
  canRemove: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={rowGrid + " rounded px-1 py-0.5 " + (hovered ? "bg-background" : "")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          title="Remove"
          className="justify-self-end rounded p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          <TrashIcon />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Blends in as plain text; click/focus reveals the raw value; commits onBlur/Enter, reverts onEscape. */
function InlineNumber({
  value,
  kind,
  max,
  onCommit,
}: {
  value: number;
  kind: "yrs" | "money";
  max: number;
  onCommit: (n: number) => boolean;
}) {
  const format = (n: number) => (kind === "money" ? fmtMoney(n) : fmtYrs(n));
  const [text, setText] = useState(() => format(value));
  return (
    <input
      className={quiet}
      inputMode="numeric"
      value={text}
      onFocus={(e) => {
        setText(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Math.round(parseNum(text));
        if (Number.isFinite(n) && n >= 0 && n <= max) {
          const accepted = n === value || onCommit(n);
          setText(format(accepted ? n : value));
        } else {
          setText(format(value));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(format(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * Name/type cell — a plain editable text field, no dropdown decoration.
 * `freeText` allows any typed value (building systems); otherwise a committed
 * value must be one of `options` (equipment types are a fixed vocabulary — a
 * made-up type would never match a unit's actual equipment) and an invalid
 * value just reverts. Use the "+ Add …" buttons to discover other options.
 */
function ComboField({
  value,
  options,
  onCommit,
  freeText = false,
  placeholder,
}: {
  value: string;
  options: string[];
  onCommit: (v: string) => boolean;
  freeText?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  return (
    <input
      className={quiet}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = text.trim();
        if (!v || v === value) {
          setText(value);
          return;
        }
        if (!freeText && !options.includes(v)) {
          setText(value);
          return;
        }
        if (!onCommit(v)) setText(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}


const headerRow = (first: string) => (
  <div className={rowGrid + " px-1 text-[10px] font-medium uppercase tracking-wide text-muted"}>
    <span>{first}</span>
    <span>Monitor</span>
    <span>Replace</span>
    <span>Cost</span>
    <span />
  </div>
);

export function CapexRulesEditor({
  initial,
  initialVersion,
}: {
  initial: CapexRules;
  /** AppConfig.updatedAt the page rendered with; sent back so a stale tab cannot overwrite a newer save. */
  initialVersion: string | null;
}) {
  const [rules, setRules] = useState<EditableCapexRules>(initial);
  const [version, setVersion] = useState<string | null>(initialVersion);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  /** Optimistically apply `next` and persist it; on failure, revert and surface an error. */
  function persist(next: EditableCapexRules) {
    const prev = rules;
    setRules(next);
    setError(null);
    start(async () => {
      const r = await saveCapexRules(next, version);
      if (r.ok) {
        setRules(r.data.rules);
        setVersion(r.data.version);
      } else {
        setRules(prev);
        setError(r.error);
      }
    });
  }

  const appliances = rules.equipment.filter((r) => !BUILDING_LIKE_EQUIPMENT.has(r.type));
  const coreSystems = rules.equipment.filter((r) => BUILDING_LIKE_EQUIPMENT.has(r.type));
  const typesInUse = new Set(rules.equipment.map((r) => r.type));
  const availableApplianceTypes = EQUIPMENT_TYPES.filter(
    (t) => t !== "Other" && !BUILDING_LIKE_EQUIPMENT.has(t) && !typesInUse.has(t),
  );
  const missingCoreTypes = [...BUILDING_LIKE_EQUIPMENT].filter((t) => !typesInUse.has(t));
  const buildingLabelsLc = rules.building.map((r) => r.label.trim().toLowerCase());
  const buildingSuggestions = DEFAULT_CAPEX_RULES.building
    .map((b) => b.label)
    .filter((l) => !buildingLabelsLc.includes(l.toLowerCase()));

  function commitEqField(type: string, field: "monitor" | "replace" | "cost", n: number): boolean {
    const row = rules.equipment.find((r) => r.type === type);
    if (!row) return false;
    if (field === "replace" && n < row.monitor) return false;
    if (field === "monitor" && n > row.replace) return false;
    persist({ ...rules, equipment: rules.equipment.map((r) => (r.type === type ? { ...r, [field]: n } : r)) });
    return true;
  }
  function changeEqType(oldType: string, newType: string): boolean {
    if (newType !== oldType) {
      persist({ ...rules, equipment: rules.equipment.map((r) => (r.type === oldType ? { ...r, type: newType } : r)) });
    }
    return true;
  }
  function removeEq(type: string) {
    persist({ ...rules, equipment: rules.equipment.filter((r) => r.type !== type) });
  }
  function addAppliance() {
    if (availableApplianceTypes.length === 0) return;
    persist({
      ...rules,
      equipment: [{ type: availableApplianceTypes[0], monitor: 0, replace: 0, cost: 0 }, ...rules.equipment],
    });
  }
  function addCoreSystem() {
    if (missingCoreTypes.length === 0) return;
    persist({
      ...rules,
      equipment: [{ type: missingCoreTypes[0], monitor: 0, replace: 0, cost: 0 }, ...rules.equipment],
    });
  }

  function commitBField(idx: number, field: "monitor" | "replace" | "cost", n: number): boolean {
    const row = rules.building[idx];
    if (!row) return false;
    if (field === "replace" && n < row.monitor) return false;
    if (field === "monitor" && n > row.replace) return false;
    const key = field === "cost" ? "defaultCost" : field;
    persist({ ...rules, building: rules.building.map((r, i) => (i === idx ? { ...r, [key]: n } : r)) });
    return true;
  }
  function renameB(idx: number, label: string): boolean {
    const lc = label.toLowerCase();
    if (buildingLabelsLc.some((l, i) => l === lc && i !== idx)) return false;
    persist({ ...rules, building: rules.building.map((r, i) => (i === idx ? { ...r, label } : r)) });
    return true;
  }
  function removeB(idx: number) {
    persist({ ...rules, building: rules.building.filter((_, i) => i !== idx) });
  }
  function addBuildingSystem() {
    const base = "New system";
    let label = base;
    let n = 2;
    while (buildingLabelsLc.includes(label.toLowerCase())) label = `${base} ${n++}`;
    persist({ ...rules, building: [{ key: null, label, monitor: 0, replace: 0, defaultCost: 0 }, ...rules.building] });
  }
  function resetToDefaults() {
    setConfirmReset(false);
    persist(DEFAULT_CAPEX_RULES);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        subtitle="CapEx planning rules"
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </Button>
        }
      />

      {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

      <SectionCard
        title="Appliances"
        editing
        actions={
          <button type="button" onClick={addAppliance} disabled={availableApplianceTypes.length === 0} className={addLink}>
            + Add appliance
          </button>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            {headerRow("Appliance")}
            <div className="mt-1 space-y-0.5">
              {appliances.map((r) => (
                <RuleRow key={r.type} onRemove={() => removeEq(r.type)} canRemove={rules.equipment.length > 1}>
                  <ComboField
                    value={r.type}
                    options={availableApplianceTypes}
                    onCommit={(t) => changeEqType(r.type, t)}
                  />
                  <InlineNumber value={r.monitor} kind="yrs" max={200} onCommit={(n) => commitEqField(r.type, "monitor", n)} />
                  <InlineNumber value={r.replace} kind="yrs" max={200} onCommit={(n) => commitEqField(r.type, "replace", n)} />
                  <InlineNumber value={r.cost} kind="money" max={10_000_000} onCommit={(n) => commitEqField(r.type, "cost", n)} />
                </RuleRow>
              ))}
              {appliances.length === 0 && <p className="px-1 py-1 text-xs text-muted">No appliance rules.</p>}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Building systems"
        editing
        actions={
          <div className="flex items-center gap-3">
            <button type="button" onClick={addBuildingSystem} className={addLink}>
              + Add system
            </button>
            {missingCoreTypes.length > 0 && (
              <button type="button" onClick={addCoreSystem} className={addLink}>
                + Add {missingCoreTypes[0]}
              </button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            {headerRow("System")}
            <div className="mt-1 space-y-0.5">
              {coreSystems.map((r) => (
                <RuleRow key={r.type} onRemove={() => removeEq(r.type)} canRemove={rules.equipment.length > 1}>
                  <ComboField
                    value={r.type}
                    options={missingCoreTypes}
                    onCommit={(t) => changeEqType(r.type, t)}
                  />
                  <InlineNumber value={r.monitor} kind="yrs" max={200} onCommit={(n) => commitEqField(r.type, "monitor", n)} />
                  <InlineNumber value={r.replace} kind="yrs" max={200} onCommit={(n) => commitEqField(r.type, "replace", n)} />
                  <InlineNumber value={r.cost} kind="money" max={10_000_000} onCommit={(n) => commitEqField(r.type, "cost", n)} />
                </RuleRow>
              ))}
              {rules.building.map((r, i) => (
                <RuleRow key={r.key ?? `new-${i}`} onRemove={() => removeB(i)} canRemove={rules.building.length > 1}>
                  <ComboField
                    value={r.label}
                    options={buildingSuggestions}
                    onCommit={(label) => renameB(i, label)}
                    freeText
                    placeholder="System name"
                  />
                  <InlineNumber value={r.monitor} kind="yrs" max={200} onCommit={(n) => commitBField(i, "monitor", n)} />
                  <InlineNumber value={r.replace} kind="yrs" max={200} onCommit={(n) => commitBField(i, "replace", n)} />
                  <InlineNumber value={r.defaultCost} kind="money" max={10_000_000} onCommit={(n) => commitBField(i, "cost", n)} />
                </RuleRow>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {confirmReset && (
        <ConfirmDialog
          title="Reset all CapEx rules to defaults?"
          onClose={() => setConfirmReset(false)}
          body="This immediately replaces every rule below with the built-in defaults, discarding anything you've added or changed."
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={resetToDefaults}>
                Reset
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
