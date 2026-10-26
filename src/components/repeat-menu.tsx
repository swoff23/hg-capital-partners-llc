"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { OptionList, type OptionItem } from "@/components/option-list";
import { SegmentedControl } from "@/components/segmented-control";
import { SheetView } from "@/components/sheet";
import { NumberInput } from "@/components/number-input";
import { Button, SaveError } from "@/components/ui";
import { parseAmount } from "@/lib/money";
import type { Ymd } from "@/lib/dates";
import { weekdayOf } from "@/lib/quick-dates";
import { fmtShortDay } from "@/lib/tasks/activity";
import { describeRepeat, matchPreset, nextRepeatDue, repeatPresets, type RepeatRule } from "@/lib/tasks/repeat";
import {
  CUSTOM_UNITS,
  customCountError,
  customFromRule,
  ruleFromChoice,
  switchCustomUnit,
  type CustomUnit,
  type RepeatChoice,
} from "@/lib/tasks/repeat-choice";

/**
 * What a task repeats on, set with one tap (docs/specs/selectors.md 3.9): a
 * list of presets read from the due date, each with the next date it lands on,
 * then Custom. Picking a preset commits; the caller closes the layer and
 * toasts with Undo ("Repeats every 2 weeks on Fri").
 *
 *   Doesn't repeat
 *   Every week on Fri            Next: Fri, Nov 6
 *   Every 2 weeks on Fri         Next: Fri, Nov 13
 *   Every month on the 30th      Next: Mon, Nov 30
 *   Every quarter on the 30th    Next: Sat, Jan 30
 *   Every year on Oct 30         Next: Sat, Oct 30
 *   Custom                       >
 *
 * A stored rule that matches no preset ("Every 3 days", "Every 2 months")
 * shows as its own row with the Check, above Custom, so opening the menu never
 * hides the current rule. Custom swaps a sentence into the same layer, "Every
 * [2] [Days | Weeks | Months]", with a "Next: Fri, Nov 13" line under it and
 * Cancel and Save pinned below. Back returns to the presets; Esc closes the
 * whole layer with nothing changed.
 *
 * It sits inside the due date's panel (Repeat lives inside Due, question 7)
 * and in the Repeat chip New task still uses. `layer` is where it opens: in a
 * phone's sheet the steps are views with the sheet's back arrow; in a popover
 * they swap in place under a back chevron (`onBack` goes to what's under the
 * menu, the due date's calendar).
 */

const STORED = "stored";
const CUSTOM = "custom";

export function RepeatMenu({
  value,
  from,
  today,
  onPick,
  layer,
  onBack,
}: {
  value: RepeatRule | null;
  /** The date the presets read their weekday and day from: the due date, or today with none. */
  from: Ymd;
  today: Ymd;
  /** A different repeat (null turns repeats off); picking the current one calls it too, so the layer closes. */
  onPick: (rule: RepeatRule | null) => void;
  layer: "popover" | "sheet";
  /** In a popover: the chevron at the head of the menu, back to whatever opened it. Without one the menu has no header. */
  onBack?: () => void;
}) {
  const [custom, setCustom] = useState(false);
  const presets = repeatPresets(from, today);
  const matched = matchPreset(value, presets);
  // The date the next copy will really get: never one that has already passed, however late the due date is.
  const next = (rule: RepeatRule) => `Next: ${fmtShortDay(nextRepeatDue(rule, from, today), today)}`;

  const rows: OptionItem[] = presets
    .filter((p) => p.rule)
    .map((p) => ({ id: p.key, label: p.label, description: next(p.rule!) }));
  // The stored rule, when it's none of the presets.
  if (value && !matched) {
    rows.push({ id: STORED, label: describeRepeat(value, { short: true, from }), description: next(value) });
  }
  rows.push({ id: CUSTOM, label: "Custom", trailing: <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-3" /> });

  const selected = !value ? "none" : (matched?.key ?? STORED);

  function choose(id: string) {
    if (id === CUSTOM) return setCustom(true);
    if (id === STORED) return onPick(value);
    onPick(presets.find((p) => p.key === id)?.rule ?? null);
  }

  const list = (
    <OptionList
      aria-label="Repeat"
      container={layer}
      pinned={[{ id: "none", label: "Doesn't repeat", muted: !!value }]}
      items={rows}
      selectedKey={selected}
      onPick={choose}
      autoFocus
    />
  );

  if (custom) {
    return (
      <RepeatCustom
        initial={customFromRule(value, Number(from.slice(8, 10)), weekdayOf(from))}
        from={from}
        today={today}
        defaultDay={Number(from.slice(8, 10))}
        defaultWeekday={weekdayOf(from)}
        layer={layer}
        onBack={() => setCustom(false)}
        onSave={onPick}
      />
    );
  }

  return layer === "popover" && onBack ? (
    <div className="w-80">
      <StepHeader title="Repeat" onBack={onBack} />
      {list}
    </div>
  ) : (
    list
  );
}

/** The header of a step inside a popover: a back chevron and the step's name. */
export function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-line py-1 pl-1 pr-3">
      <AriaButton
        onPress={onBack}
        aria-label="Back"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1 pointer-coarse:size-11"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
      </AriaButton>
      <span className="min-w-0 truncate text-label text-fg-1">{title}</span>
    </div>
  );
}

/** Custom: "Every [2] [Days | Weeks | Months]", its next date, Cancel and Save. */
function RepeatCustom({
  initial,
  from,
  today,
  defaultDay,
  defaultWeekday,
  layer,
  onBack,
  onSave,
}: {
  initial: RepeatChoice;
  from: Ymd;
  today: Ymd;
  defaultDay: number;
  defaultWeekday: number;
  layer: "popover" | "sheet";
  onBack: () => void;
  onSave: (rule: RepeatRule | null) => void;
}) {
  const [unit, setUnit] = useState<CustomUnit>(initial.mode as CustomUnit);
  const [count, setCount] = useState(String(initial.every));
  // An empty or unreadable count says so after Save is pressed, never before.
  const [asked, setAsked] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  // A mouse types the count at once. The row that was pressed has just left the page and React Aria's dialog
  // takes focus back a frame later, so `autoFocus` loses in Chromium; focus after that.
  useEffect(() => {
    if (layer !== "popover") return;
    const frame = requestAnimationFrame(() => form.current?.querySelector("input")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [layer]);

  const every = count.trim() === "" ? Number.NaN : (parseAmount(count) ?? Number.NaN);
  const error = customCountError(unit, every);
  // The unit the stored rule had keeps its own day or weekday; another takes the due date's.
  const rule = error ? null : ruleFromChoice(switchCustomUnit({ ...initial, every }, unit, defaultDay, defaultWeekday));
  const nextLine = rule ? `Next: ${fmtShortDay(nextRepeatDue(rule, from, today), today)}` : "";

  function save() {
    setAsked(true);
    if (!error && rule) onSave(rule);
  }

  const buttons = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={onBack}>
        Cancel
      </Button>
      <Button type="button" size="sm" onClick={save}>
        Save
      </Button>
    </div>
  );

  const body = (
    <form
      ref={form}
      className="space-y-3 p-3"
      onSubmit={(e) => {
        // The menu may sit inside another form (New task); this one stays its own.
        e.preventDefault();
        e.stopPropagation();
        save();
      }}
    >
      {/* One sentence with a mouse. On touch the 16px words are too wide for 320 beside the count, so the unit goes under it. */}
      <div className="flex items-center gap-2 text-body pointer-coarse:flex-col pointer-coarse:items-start">
        <div className="flex items-center gap-2">
          <span>Every</span>
          <NumberInput
            kind="integer"
            aria-label="How many"
            aria-invalid={asked && error ? true : undefined}
            value={count}
            onChange={setCount}
            size="sm"
            className="w-12 text-center tabular-nums"
          />
        </div>
        <SegmentedControl
          aria-label="Unit"
          // On --fill-2, since --fill-1 all but disappears on a raised layer in dark.
          className="bg-fill-2"
          options={CUSTOM_UNITS.map((u) => ({ key: u.mode, label: u.label }))}
          value={unit}
          onChange={setUnit}
        />
      </div>
      {asked && error ? <SaveError>{error}</SaveError> : <p className="min-h-5 text-meta text-fg-3">{nextLine}</p>}
    </form>
  );

  if (layer === "sheet") {
    return (
      <SheetView title="Custom repeat" onBack={onBack} escape="close" footer={buttons}>
        {body}
      </SheetView>
    );
  }
  return (
    <div className="w-80">
      <StepHeader title="Custom repeat" onBack={onBack} />
      {body}
      <div className="border-t border-line p-3">{buttons}</div>
    </div>
  );
}
