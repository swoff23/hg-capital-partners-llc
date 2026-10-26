"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { ActionBar, SubmitKeycap, actionBarButton } from "@/components/action-bar";
import { Combobox } from "@/components/combobox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useHoldLeave } from "@/components/leave-guard";
import { NumberInput } from "@/components/number-input";
import type { OptionItem } from "@/components/option-list";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { Tooltip } from "@/components/tooltip";
import { useDraft, useRestoredDraft } from "@/components/use-draft";
import { useRun } from "@/components/use-run";
import { AddRow, Button, SaveError, Section, textLinkClass } from "@/components/ui";
import {
  BUILDING_LIKE_EQUIPMENT,
  capexChangeCount,
  capexProblems,
  changesLine,
  changesShort,
  leftProblems,
  toDraft,
  toPayload,
  type BuildingDraft,
  type CapexDraft,
  type EquipmentDraft,
} from "@/lib/capex-draft";
import { EQUIPMENT_TYPES } from "@/lib/config";
import { DEFAULT_CAPEX_RULES, type CapexRules } from "@/lib/property-types";
import { cn } from "@/lib/utils";
import { saveCapexRules } from "./actions";
import { RevealRemoveButton, revealRow } from "./editor-controls";

/*
 * Rule rows. From sm one line: the name, three right-aligned figures (monitor
 * and replace in years, cost in whole dollars), then the row's delete, 44px
 * wide on touch. Below sm a row takes two lines, so every figure shows with no
 * sideways scroll at 375 or 320: the name and the delete, then the three
 * figures in thirds under the header's Monitor at, Replace at and Cost.
 */
const rowGrid = cn(
  "grid items-center gap-x-2 gap-y-1.5 max-sm:grid-cols-[minmax(0,1fr)_2.75rem]",
  "sm:grid-cols-[minmax(10rem,1fr)_6.5rem_6.5rem_7.5rem_1.5rem] sm:pointer-coarse:grid-cols-[minmax(10rem,1fr)_6.5rem_6.5rem_7.5rem_2.75rem]",
);
/** The figures: in thirds on their own line below sm, three grid cells of the row from sm. */
const figuresCell = "max-sm:col-span-full max-sm:grid max-sm:grid-cols-3 max-sm:gap-2 sm:contents";
/** The row's one error line, under all of it. */
const rowLine = "col-span-full truncate text-meta text-danger";

/** A group's label inside Building systems. */
const subhead = "pb-1 pt-3 text-meta font-medium text-fg-2";

/** What each age column means, said by hover or focus with a mouse and by tap on touch (ADMIN-045). */
const MONITOR_TIP = "Age it starts showing as Monitor";
const REPLACE_TIP = "Age it shows as Replace";

const asOptions = (types: readonly string[]): OptionItem[] => types.map((t) => ({ id: t, label: t }));

/** A ⓘ beside a column header, 16px with a 44px touch area, opening a Tooltip. */
function InfoTip({ label, name, className }: { label: string; name: string; className?: string }) {
  return (
    <Tooltip label={label} className={className}>
      <button
        type="button"
        aria-label={`What ${name} means`}
        className="relative inline-flex size-4 items-center justify-center rounded-sm text-fg-3 transition-colors hover:text-fg-1 pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5"
      >
        <Info aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}

/** The table's header: the first column's name and the three figures (with their ⓘ), from sm; the three figures alone, once, on a phone. */
function RuleHeader({ first }: { first: string }) {
  const th = "whitespace-nowrap px-2.5 text-right text-meta font-medium text-fg-3";
  return (
    <>
      <div className={cn(rowGrid, "mb-1 hidden border-b border-line-strong pb-2 sm:grid")}>
        <span className="text-meta font-medium text-fg-3">{first}</span>
        <span className={cn(th, "flex items-center justify-end gap-1")}>
          Monitor at <InfoTip label={MONITOR_TIP} name="Monitor at" />
        </span>
        <span className={cn(th, "flex items-center justify-end gap-1")}>
          Replace at <InfoTip label={REPLACE_TIP} name="Replace at" />
        </span>
        <span className={th}>Cost</span>
        <span />
      </div>
      <div className="mb-1 grid grid-cols-3 gap-2 border-b border-line-strong pb-2 sm:hidden">
        <span className={th}>Monitor at</span>
        <span className={th}>Replace at</span>
        <span className={th}>Cost</span>
      </div>
    </>
  );
}

type Cells = { monitor: string; replace: string; cost: string };

/** The three figures of a row: years, years, whole dollars, right-aligned on tabular figures. */
function Figures({
  name,
  row,
  costKey,
  problems,
  onChange,
  onLeave,
}: {
  /** Names the cells for a screen reader: "Dishwasher". */
  name: string;
  row: Cells;
  costKey: "cost" | "defaultCost";
  problems: Record<string, string | undefined>;
  onChange: (patch: Partial<Cells>) => void;
  /** A figure was left: a format error shows from then on (forms 2.0). */
  onLeave: (cell: keyof Cells) => void;
}) {
  return (
    <div className={figuresCell}>
      <NumberInput
        kind="integer"
        suffix="yrs"
        size="sm"
        align="end"
        aria-label={`${name} monitor years`}
        aria-invalid={problems.monitor ? true : undefined}
        value={row.monitor}
        onChange={(monitor) => onChange({ monitor })}
        onBlur={() => onLeave("monitor")}
        className="min-w-0"
      />
      <NumberInput
        kind="integer"
        suffix="yrs"
        size="sm"
        align="end"
        aria-label={`${name} replace years`}
        aria-invalid={problems.replace ? true : undefined}
        value={row.replace}
        onChange={(replace) => onChange({ replace })}
        onBlur={() => onLeave("replace")}
        className="min-w-0"
      />
      <NumberInput
        kind="money"
        size="sm"
        align="end"
        aria-label={`${name} cost`}
        aria-invalid={problems[costKey] ? true : undefined}
        value={row.cost}
        onChange={(cost) => onChange({ cost })}
        onBlur={() => onLeave("cost")}
        className="min-w-0"
      />
    </div>
  );
}

/** One row on a --line divider: its name, its figures, its delete (tap to reveal on touch, as the move-in form's items do) and its one error line. */
function RuleRow({
  uid,
  label,
  onRemove,
  canRemove,
  line,
  children,
}: {
  uid: string;
  /** What the row is, for the delete's label: "Remove Dishwasher". */
  label: string;
  onRemove: () => void;
  canRemove: boolean;
  /** The first thing wrong with it, once Save was pressed. */
  line?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-reveal-row data-row={uid} data-invalid={line ? "true" : undefined} className={cn(rowGrid, revealRow, "py-1.5 pointer-coarse:py-1")}>
      {children}
      {canRemove ? (
        <span className="flex justify-self-end max-sm:col-start-2 max-sm:row-start-1">
          <RevealRemoveButton onRemove={onRemove} aria-label={`Remove ${label || "this row"}`} />
        </span>
      ) : (
        <span className="max-sm:col-start-2 max-sm:row-start-1" />
      )}
      {line && <p className={rowLine}>{line}</p>}
    </div>
  );
}

/** The first line of a row's problems, in the order of its cells. */
function firstLine(shown: Record<string, string>, prefix: string, cells: readonly string[]): string | undefined {
  for (const c of cells) if (shown[`${prefix}.${c}`]) return shown[`${prefix}.${c}`];
  return undefined;
}

export function CapexRulesEditor({
  initial,
  initialVersion,
}: {
  initial: CapexRules;
  /** The version of the CapEx rules the page rendered with; sent back so a stale tab can't overwrite a newer save. */
  initialVersion: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, pending, error, fieldErrors, conflict, reset: forgetRefusal } = useRun();

  const [saved, setSaved] = useState<CapexDraft>(() => toDraft(initial));
  const [draft, setDraft] = useState<CapexDraft>(saved);
  const [version, setVersion] = useState<string | null>(initialVersion);
  const [tried, setTried] = useState(false);
  // The figures left so far ("<row uid>:<cell>"), whose format errors show before Save is pressed.
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<"reset" | "discard" | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const serial = useRef(0);
  // The row Add just made, which takes focus in its name once it has rendered.
  const added = useRef<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  const changes = capexChangeCount(saved, draft);
  const dirty = changes > 0;
  useHoldLeave(dirty ? { title: `Leave with ${changesShort(changes)}?`, stay: "Keep editing" } : null);

  // The draft is kept in this browser against the version it opened with, and comes back after a reload.
  const { restored, clear: clearDraft } = useDraft(`capex-rules:${initialVersion ?? "new"}`, draft);
  useRestoredDraft(restored, {
    accept: (d) => Array.isArray(d.equipment) && Array.isArray(d.building),
    apply: (d) => {
      // Rows added before the reload keep their uids; new ones start after them.
      const used = [...d.equipment, ...d.building].map((r) => Number(/^n(\d+)$/.exec(r.uid)?.[1] ?? 0));
      serial.current = Math.max(serial.current, ...used);
      setDraft(d);
    },
    discard: () => {
      clearDraft();
      setDraft(saved);
    },
  });

  /** Any edit lets go of a refusal: it was about what was there before. */
  function edit(next: CapexDraft) {
    forgetRefusal();
    setDraft(next);
  }
  const newUid = () => `n${++serial.current}`;
  const leave = (uid: string, cell: string) => setLeft((prev) => (prev.has(`${uid}:${cell}`) ? prev : new Set(prev).add(`${uid}:${cell}`)));

  const clientProblems = tried ? capexProblems(draft) : leftProblems(draft, left);
  const shown: Record<string, string> = { ...clientProblems, ...(fieldErrors ?? {}) };
  // A failure that isn't on a cell goes above the buttons.
  const cellKey = /^(equipment|building)\.\d+\./;
  const loose = Object.entries(shown).filter(([k]) => !cellKey.test(k));
  const barError: string | undefined = loose.length > 0 ? loose.map(([, line]) => line).join(" ") : fieldErrors === undefined ? error : undefined;

  // Focus goes to the first row that needs something, scrolled to the middle; a row added by Add takes focus in its name.
  useEffect(() => {
    if (focusTick === 0) return;
    // The cell the line is about, else the row's first field.
    const first =
      body.current?.querySelector<HTMLElement>('[data-invalid="true"] [aria-invalid="true"]') ??
      body.current?.querySelector<HTMLElement>('[data-invalid="true"] input, [data-invalid="true"] button:not([aria-label^="Remove"])');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "center" });
  }, [focusTick]);
  useEffect(() => {
    const uid = added.current;
    if (!uid) return;
    added.current = null;
    const first = body.current?.querySelector<HTMLElement>(`[data-row="${uid}"] input, [data-row="${uid}"] button:not([aria-label^="Remove"])`);
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "center" });
  }, [draft]);

  function save() {
    if (pending || !dirty) return;
    setTried(true);
    if (Object.keys(capexProblems(draft)).length > 0) {
      setFocusTick((n) => n + 1);
      return;
    }
    run(() => saveCapexRules(toPayload(draft), version), {
      failure: "inline",
      succeeded: (done) => {
        clearDraft();
        const next = toDraft(done.rules);
        serial.current = 0;
        setSaved(next);
        setDraft(next);
        setVersion(done.version);
        setTried(false);
        setLeft(new Set());
        toast({ message: "CapEx rules saved", detail: "Forecasts updated" });
      },
    });
  }

  // From here the editor reads the rules as drawn from the draft.
  const appliances = draft.equipment.filter((r) => !BUILDING_LIKE_EQUIPMENT.has(r.type));
  const coreSystems = draft.equipment.filter((r) => BUILDING_LIKE_EQUIPMENT.has(r.type));
  const usedTypes = new Set(draft.equipment.map((r) => r.type));
  const freeAppliances = EQUIPMENT_TYPES.filter((t) => t !== "Other" && !BUILDING_LIKE_EQUIPMENT.has(t) && !usedTypes.has(t));
  const missingCore = [...BUILDING_LIKE_EQUIPMENT].filter((t) => !usedTypes.has(t));
  const labels = draft.building.map((r) => r.label.trim().toLowerCase());
  const suggestions = DEFAULT_CAPEX_RULES.building.map((b) => b.label).filter((l) => !labels.includes(l.toLowerCase()));

  const patchEq = (uid: string, p: Partial<EquipmentDraft>) =>
    edit({ ...draft, equipment: draft.equipment.map((r) => (r.uid === uid ? { ...r, ...p } : r)) });
  const patchB = (uid: string, p: Partial<BuildingDraft>) =>
    edit({ ...draft, building: draft.building.map((r) => (r.uid === uid ? { ...r, ...p } : r)) });
  const removeEq = (uid: string) => edit({ ...draft, equipment: draft.equipment.filter((r) => r.uid !== uid) });
  const removeB = (uid: string) => edit({ ...draft, building: draft.building.filter((r) => r.uid !== uid) });
  function addEquipment(type: string) {
    const uid = newUid();
    edit({ ...draft, equipment: [...draft.equipment, { uid, type, monitor: "0", replace: "0", cost: "0" }] });
    added.current = uid;
  }
  function addSystem() {
    const uid = newUid();
    // A new row stays here until Save, so a blank system never reaches every property (ADMIN-002).
    edit({ ...draft, building: [...draft.building, { uid, key: null, label: "", monitor: "0", replace: "0", cost: "0" }] });
    added.current = uid;
  }

  const eqIndex = (uid: string) => draft.equipment.findIndex((r) => r.uid === uid);
  const bIndex = (uid: string) => draft.building.findIndex((r) => r.uid === uid);

  function equipmentRow(r: EquipmentDraft, group: "appliance" | "system") {
    const i = eqIndex(r.uid);
    const prefix = `equipment.${i}`;
    const mine = (cells: readonly string[]) => Object.fromEntries(cells.map((c) => [c, shown[`${prefix}.${c}`]]));
    const choices = group === "appliance" ? freeAppliances : missingCore;
    return (
      <RuleRow
        key={r.uid}
        uid={r.uid}
        label={r.type}
        onRemove={() => removeEq(r.uid)}
        canRemove={draft.equipment.length > 1}
        line={firstLine(shown, prefix, ["type", "monitor", "replace", "cost"])}
      >
        <Select
          size="sm"
          aria-label={group === "appliance" ? "Appliance" : "System"}
          placeholder="Choose a type"
          items={asOptions([...new Set([...(r.type ? [r.type] : []), ...choices])])}
          value={r.type || null}
          onChange={(type) => type && patchEq(r.uid, { type })}
          isInvalid={!!shown[`${prefix}.type`]}
          searchLabel="Search types"
          className="min-w-0"
        />
        <Figures
          name={r.type || "New rule"}
          row={r}
          costKey="cost"
          problems={mine(["monitor", "replace", "cost"])}
          onChange={(p) => patchEq(r.uid, p)}
          onLeave={(cell) => leave(r.uid, cell)}
        />
      </RuleRow>
    );
  }

  function buildingRow(r: BuildingDraft) {
    const i = bIndex(r.uid);
    const prefix = `building.${i}`;
    const mine = (cells: readonly string[]) => Object.fromEntries(cells.map((c) => [c, shown[`${prefix}.${c}`]]));
    return (
      <RuleRow
        key={r.uid}
        uid={r.uid}
        label={r.label}
        onRemove={() => removeB(r.uid)}
        canRemove={draft.building.length > 1}
        line={firstLine(shown, prefix, ["label", "monitor", "replace", "defaultCost"])}
      >
        <Combobox
          size="sm"
          aria-label="System"
          placeholder="System name"
          items={suggestions}
          allowCustom
          value={r.label}
          onChange={(label) => patchB(r.uid, { label })}
          isInvalid={!!shown[`${prefix}.label`]}
          className="min-w-0"
        />
        <Figures
          name={r.label || "New system"}
          row={r}
          costKey="defaultCost"
          problems={mine(["monitor", "replace", "defaultCost"])}
          onChange={(p) => patchB(r.uid, p)}
          onLeave={(cell) => leave(r.uid, cell)}
        />
      </RuleRow>
    );
  }

  return (
    <div ref={body} className="space-y-8 pointer-coarse:space-y-6">
      {/* The tab's one extra action, at the top right of its content: it fills the draft, and Save keeps it. */}
      <div className="flex items-center justify-end">
        <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => setConfirm("reset")} disabled={pending}>
          Reset to defaults
        </Button>
      </div>

      <Section
        title="Appliances"
        actions={
          <InfoTip
            label={`Monitor at: ${MONITOR_TIP.toLowerCase()}.\nReplace at: ${REPLACE_TIP.toLowerCase()}.`}
            name="Monitor at and Replace at"
            className="sm:hidden"
          />
        }
      >
        <RuleHeader first="Appliance" />
        <div className="divide-y divide-line">
          {appliances.map((r) => equipmentRow(r, "appliance"))}
          {appliances.length === 0 && <p className="py-2.5 text-body text-fg-3">No appliance rules.</p>}
        </div>
        {/* The list's last row adds one more, as Add unit ends the Units list; it's off once every type has a rule. */}
        <AddRow onClick={() => addEquipment(freeAppliances[0])} disabled={freeAppliances.length === 0}>
          Add appliance
        </AddRow>
      </Section>

      <Section title="Building systems">
        <RuleHeader first="System" />
        <div className="divide-y divide-line">
          {/* Roof, furnace and the rest are kept per unit, and a building can carry its own roof
              too: the subheads say which a figure is, so two Roof rows never read as one rule. */}
          {coreSystems.length > 0 && <p className={subhead}>Per unit</p>}
          {coreSystems.map((r) => equipmentRow(r, "system"))}
          {draft.building.length > 0 && <p className={subhead}>Per building</p>}
          {draft.building.map((r) => buildingRow(r))}
        </div>
        {/* Each group's add at the list's foot: a deleted per-unit system comes back by name, and Add
            system starts a per-building one. */}
        {missingCore.length > 0 && (
          <AddRow onClick={() => addEquipment(missingCore[0])}>
            Add {missingCore[0]}
          </AddRow>
        )}
        <AddRow onClick={addSystem}>
          Add system
        </AddRow>
      </Section>

      {confirm === "reset" && (
        <ConfirmDialog
          title="Reset all CapEx rules to defaults?"
          onClose={() => setConfirm(null)}
          body="This replaces every rule below with the built-in defaults. Nothing changes until you save, and Discard undoes it."
          cancelLabel="Keep editing"
          actions={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirm(null);
                serial.current = 0;
                edit(toDraft(DEFAULT_CAPEX_RULES));
              }}
            >
              Reset rules
            </Button>
          }
        />
      )}
      {confirm === "discard" && (
        <ConfirmDialog
          title={`Discard ${changes} ${changes === 1 ? "change" : "changes"} to CapEx rules?`}
          onClose={() => setConfirm(null)}
          cancelLabel="Keep editing"
          actions={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirm(null);
                clearDraft();
                serial.current = 0;
                setTried(false);
                setLeft(new Set());
                edit(saved);
              }}
            >
              Discard changes
            </Button>
          }
        />
      )}

      {/* Only while there's something to save: the draft's one decision, docked at the bottom at every width. */}
      {dirty && (
        <ActionBar
          placement="app"
          contentClassName="box-content max-w-300"
          status={
            <>
              <span className="max-sm:hidden">{changesLine(changes)}</span>
              <span className="sm:hidden">{changesShort(changes)}</span>
            </>
          }
          error={
            barError && (
              <SaveError
                className={conflict ? undefined : "truncate"}
                action={
                  conflict && (
                    <button
                      type="button"
                      className={cn(textLinkClass, "relative rounded-sm pointer-coarse:after:absolute pointer-coarse:after:-inset-3")}
                      // The page re-renders on the latest and starts this editor over on it.
                      onClick={() => router.refresh()}
                    >
                      Load the latest
                    </button>
                  )
                }
              >
                {barError}
              </SaveError>
            )
          }
          onPrimary={save}
          secondary={
            <Button type="button" variant="secondary" className={actionBarButton} onClick={() => setConfirm("discard")} disabled={pending}>
              Discard
            </Button>
          }
          primary={
            <Button type="button" className={actionBarButton} pending={pending} onClick={save} aria-keyshortcuts="Meta+Enter Control+Enter">
              Save
              <SubmitKeycap />
            </Button>
          }
        />
      )}
    </div>
  );
}
