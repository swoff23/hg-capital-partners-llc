"use client";
import { useState, useTransition } from "react";
import { Button, PageHeader, Section } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useInlineEditKeys } from "@/components/use-inline-edit-keys";
import { callAction } from "@/lib/action-result";
import { cn, fmtMoney } from "@/lib/utils";
import { EQUIPMENT_TYPES } from "@/lib/config";
import { DEFAULT_CAPEX_RULES, type BuildingRule, type CapexRules } from "@/lib/property-types";
import { saveCapexRules } from "./actions";
import { AddButton, RevealRemoveButton, editorBleed, quietField, revealRow } from "./editor-controls";

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

/* The name, then three right-aligned figures (monitor and replace in years,
   cost in whole dollars), then the row's delete, 44px wide on touch. Below
   480px a row takes two lines, so the cost and the delete never sit off
   screen: the name and the delete, then the three figures in thirds under
   the header's Monitor, Replace and Cost. */
const rowGrid = cn(
  "grid grid-cols-[minmax(10rem,1fr)_4.5rem_4.5rem_6.5rem_1.5rem] items-center gap-1 pointer-coarse:grid-cols-[minmax(10rem,1fr)_4.5rem_4.5rem_6.5rem_2.75rem]",
  "max-[480px]:grid-cols-[repeat(3,minmax(0,1fr))_2.75rem] max-[480px]:pointer-coarse:grid-cols-[repeat(3,minmax(0,1fr))_2.75rem]",
);
/** The name on a phone: the first line, beside the delete. */
const phoneName = "max-[480px]:col-span-3";

/** The table's width from 480px; below that the two-line rows fit the screen. */
const tableMin = "min-[481px]:min-w-115 min-[481px]:pointer-coarse:min-w-120";

/** A group's label inside Building systems, on the field text's 7px inset. */
const subhead = "px-1.75 pb-1 pt-3 text-meta font-medium text-fg-2";

const fmtYrs = (n: number) => `${n} yr${n === 1 ? "" : "s"}`;
const parseNum = (s: string) => {
  const t = s.replace(/[$,\s]/g, "");
  return t === "" ? NaN : Number(t);
};

/**
 * One row of the rules table, on a --line divider. Its delete is
 * RevealRemoveButton: under the pointer with a mouse, and while focus is in
 * the row, so touch is tap to reveal, never a trash on every row.
 */
function RuleRow({
  label,
  onRemove,
  canRemove,
  children,
}: {
  /** What the row is, for the delete's label: "Remove Dishwasher". */
  label: string;
  onRemove: () => void;
  canRemove: boolean;
  children: React.ReactNode;
}) {
  const slot = "justify-self-end max-[480px]:col-start-4 max-[480px]:row-start-1";
  return (
    <div data-reveal-row className={cn(rowGrid, revealRow, "py-1.25 transition-colors hover:bg-fill-1 pointer-coarse:py-0.5")}>
      {children}
      {canRemove ? (
        <RevealRemoveButton onRemove={onRemove} aria-label={`Remove ${label || "this row"}`} className={slot} />
      ) : (
        <span className={slot} />
      )}
    </div>
  );
}

/**
 * Blends in as plain text; click/focus reveals the raw value; commits onBlur/Enter, reverts onEscape.
 * Only an edit in progress is local (`draft`). Otherwise the field shows `value`, so it follows
 * Reset to defaults and a failed save's revert instead of keeping the text it started with.
 */
function InlineNumber({
  value,
  kind,
  max,
  label,
  onCommit,
}: {
  value: number;
  kind: "yrs" | "money";
  max: number;
  /** Names the field for a screen reader: "Dishwasher replace years". */
  label: string;
  onCommit: (n: number) => boolean;
}) {
  const format = (n: number) => (kind === "money" ? fmtMoney(n) : fmtYrs(n));
  const [draft, setDraft] = useState<string | null>(null);
  const keys = useInlineEditKeys(
    () => setDraft(null),
    () => {
      if (draft === null) return;
      const n = Math.round(parseNum(draft));
      // A rejected value (replace under monitor) just shows `value` again.
      if (Number.isFinite(n) && n >= 0 && n <= max && n !== value) onCommit(n);
      setDraft(null);
    },
  );
  return (
    <input
      // Figures right-aligned and tabular; money in whole dollars (section 3).
      className={cn(quietField, "text-right tabular-nums")}
      inputMode="numeric"
      aria-label={label}
      value={draft ?? format(value)}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={keys.onBlur}
      onKeyDown={keys.onKeyDown}
    />
  );
}

/**
 * Name/type cell — a plain editable text field, no dropdown decoration.
 * `freeText` allows any typed value (building systems); otherwise a committed
 * value must be one of `options` (equipment types are a fixed vocabulary — a
 * made-up type would never match a unit's actual equipment) and an invalid
 * value just reverts. Use the Add buttons to discover other options.
 */
function ComboField({
  value,
  options,
  onCommit,
  freeText = false,
  placeholder,
  label,
  className,
}: {
  value: string;
  options: string[];
  onCommit: (v: string) => boolean;
  freeText?: boolean;
  placeholder?: string;
  /** Names the field for a screen reader: "Appliance", "System". */
  label: string;
  className?: string;
}) {
  // As in InlineNumber: local only while editing, so a revert or a reset shows through.
  const [draft, setDraft] = useState<string | null>(null);
  const keys = useInlineEditKeys(
    () => setDraft(null),
    () => {
      const v = (draft ?? value).trim();
      setDraft(null);
      // An empty, unchanged or (for a fixed vocabulary) unknown value just shows `value` again.
      if (!v || v === value || (!freeText && !options.includes(v))) return;
      onCommit(v);
    },
  );
  return (
    <input
      className={cn(quietField, className)}
      aria-label={label}
      placeholder={placeholder}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={keys.onBlur}
      onKeyDown={keys.onKeyDown}
    />
  );
}

/* A table header's look (Th): sentence case at text-meta 500 in --fg-3 over a
   --line-strong rule. Each label sits 7px in, on its field's text (the
   field's 6px padding and 1px edge). */
const headerRow = (first: string) => (
  <div className={cn(rowGrid, "border-b border-line-strong pb-2 text-meta font-medium text-fg-3")}>
    {/* On a phone the section's title names the first column; the labels head the figures' line. */}
    <span className="px-1.75 max-[480px]:hidden">{first}</span>
    <span className="px-1.75 text-right">Monitor</span>
    <span className="px-1.75 text-right">Replace</span>
    <span className="px-1.75 text-right">Cost</span>
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
      // A dropped connection comes back as a refusal, so the row reverts with the message instead of the page crashing.
      const r = await callAction(() => saveCapexRules(next, version));
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
    <div className="space-y-8 pointer-coarse:space-y-6">
      <PageHeader
        title="Settings"
        subtitle="CapEx planning rules"
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </Button>
        }
      />

      {error && <p className="text-meta text-danger">{error}</p>}

      <Section
        title="Appliances"
        actions={
          <AddButton onClick={addAppliance} disabled={availableApplianceTypes.length === 0}>
            Add appliance
          </AddButton>
        }
      >
        {/* From 480px, narrower than its columns (460px, 480 on touch), the table scrolls sideways in
            its own box, never the page; below that each row takes two lines and fits. */}
        <div className={cn("overflow-x-auto", editorBleed)}>
          <div className={tableMin}>
            {headerRow("Appliance")}
            <div className="divide-y divide-line">
              {appliances.map((r) => (
                <RuleRow key={r.type} label={r.type} onRemove={() => removeEq(r.type)} canRemove={rules.equipment.length > 1}>
                  <ComboField
                    className={phoneName}
                    value={r.type}
                    label="Appliance"
                    options={availableApplianceTypes}
                    onCommit={(t) => changeEqType(r.type, t)}
                  />
                  <InlineNumber
                    value={r.monitor}
                    kind="yrs"
                    max={200}
                    label={`${r.type} monitor years`}
                    onCommit={(n) => commitEqField(r.type, "monitor", n)}
                  />
                  <InlineNumber
                    value={r.replace}
                    kind="yrs"
                    max={200}
                    label={`${r.type} replace years`}
                    onCommit={(n) => commitEqField(r.type, "replace", n)}
                  />
                  <InlineNumber
                    value={r.cost}
                    kind="money"
                    max={10_000_000}
                    label={`${r.type} cost`}
                    onCommit={(n) => commitEqField(r.type, "cost", n)}
                  />
                </RuleRow>
              ))}
              {appliances.length === 0 && <p className="px-1.75 py-2.5 text-body text-fg-3">No appliance rules.</p>}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Building systems"
        actions={
          // Below sm a pair drops its Plus icons and sits 12px apart, so at 320 "Building
          // systems" keeps room for its longest word beside "Add Water Heater". Alone, Add
          // system keeps its Plus, which is what marks it as an action.
          <div className="flex items-center gap-3 sm:gap-4">
            <AddButton tight={missingCoreTypes.length > 0} onClick={addBuildingSystem}>
              Add system
            </AddButton>
            {missingCoreTypes.length > 0 && (
              <AddButton tight onClick={addCoreSystem}>
                Add {missingCoreTypes[0]}
              </AddButton>
            )}
          </div>
        }
      >
        <div className={cn("overflow-x-auto", editorBleed)}>
          <div className={tableMin}>
            {headerRow("System")}
            <div className="divide-y divide-line">
              {/* Roof, furnace and the rest are kept per unit, and a building can carry its own roof
                  too: the subheads say which a figure is, so two Roof rows never read as one rule. */}
              {coreSystems.length > 0 && <p className={subhead}>Per unit</p>}
              {coreSystems.map((r) => (
                <RuleRow key={r.type} label={r.type} onRemove={() => removeEq(r.type)} canRemove={rules.equipment.length > 1}>
                  <ComboField
                    className={phoneName}
                    value={r.type}
                    label="System"
                    options={missingCoreTypes}
                    onCommit={(t) => changeEqType(r.type, t)}
                  />
                  <InlineNumber
                    value={r.monitor}
                    kind="yrs"
                    max={200}
                    label={`${r.type} monitor years`}
                    onCommit={(n) => commitEqField(r.type, "monitor", n)}
                  />
                  <InlineNumber
                    value={r.replace}
                    kind="yrs"
                    max={200}
                    label={`${r.type} replace years`}
                    onCommit={(n) => commitEqField(r.type, "replace", n)}
                  />
                  <InlineNumber
                    value={r.cost}
                    kind="money"
                    max={10_000_000}
                    label={`${r.type} cost`}
                    onCommit={(n) => commitEqField(r.type, "cost", n)}
                  />
                </RuleRow>
              ))}
              {rules.building.length > 0 && <p className={subhead}>Per building</p>}
              {rules.building.map((r, i) => (
                <RuleRow key={r.key ?? `new-${i}`} label={r.label} onRemove={() => removeB(i)} canRemove={rules.building.length > 1}>
                  <ComboField
                    className={phoneName}
                    value={r.label}
                    label="System"
                    options={buildingSuggestions}
                    onCommit={(label) => renameB(i, label)}
                    freeText
                    placeholder="System name"
                  />
                  <InlineNumber
                    value={r.monitor}
                    kind="yrs"
                    max={200}
                    label={`${r.label} monitor years`}
                    onCommit={(n) => commitBField(i, "monitor", n)}
                  />
                  <InlineNumber
                    value={r.replace}
                    kind="yrs"
                    max={200}
                    label={`${r.label} replace years`}
                    onCommit={(n) => commitBField(i, "replace", n)}
                  />
                  <InlineNumber
                    value={r.defaultCost}
                    kind="money"
                    max={10_000_000}
                    label={`${r.label} cost`}
                    onCommit={(n) => commitBField(i, "cost", n)}
                  />
                </RuleRow>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {confirmReset && (
        <ConfirmDialog
          title="Reset all CapEx rules to defaults?"
          onClose={() => setConfirmReset(false)}
          body="This immediately replaces every rule below with the built-in defaults, discarding anything you've added or changed."
          actions={
            <Button size="sm" variant="destructive" onClick={resetToDefaults}>
              Reset rules
            </Button>
          }
        />
      )}
    </div>
  );
}
