"use client";
import { useState, type ComponentProps, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Repeat2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { DatePanel as DatePanelCode, RepeatBinding } from "@/components/date-panel";
import { PickerLayer } from "@/components/picker-layer";
import { pickerChipClass, pickerField, pickerFieldChevron } from "@/components/ui";
import { useLazyModule } from "@/components/use-lazy-module";
import { dueLabel, fmtDay, isPastDay, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { lazyModule } from "@/lib/lazy-module";
import { describeRepeat, ruleKey } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";

/**
 * Dates, in one family (docs/specs/selectors.md 3.9, forms-editing 2.4):
 *
 *   `DatePicker`  a chip (`variant="chip"` in the rail and forms, `"row"` in a
 *                 list row) or a field (`"field"`, for a record's dates: typed
 *                 with a mouse, a formatted date and a sheet on touch).
 *   `DatePanel`   what opens: quick picks, a month calendar, Repeat, Clear.
 *   `DateField`   the field variant on its own (components/date-field.tsx).
 *   `DueDatePicker` the old name, a `row` chip; every caller that predates the
 *                 family keeps working.
 *
 * Values are "YYYY-MM-DD" or null; no timezone ever touches them. Pass `today`
 * from the server (todayYmdEastern()) so the label and the picks agree with
 * the server's idea of today; it defaults to the same thing.
 *
 * The page only carries the chip. The panel (the calendar) and the typed field
 * are most of the family's weight and show on a tap or in a form, so each
 * loads on its own: the panel with the first open, which a chip starts on
 * hover, focus or press (`warmDatePanel`), the field when a form draws it.
 */

export type { RepeatBinding } from "@/components/date-panel";

const panelCode = lazyModule(() => import("@/components/date-panel"));
const fieldCode = lazyModule(() => import("@/components/date-field"));

/**
 * What a chip opens: date-panel.tsx's `DatePanel`, fetched on first use. A
 * spacer holds the layer open to about its size until it arrives, which a
 * chip's hover, focus or press (`warmDatePanel`) has usually done already.
 */
export function DatePanel(props: ComponentProps<typeof DatePanelCode>) {
  const code = useLazyModule(panelCode);
  return code ? <code.DatePanel {...props} /> : <div aria-hidden="true" className="h-72 w-80 max-w-full" />;
}

/** Starts fetching the panel, so the open that follows finds it ready. Safe to call often. */
export function warmDatePanel(): void {
  panelCode.warm();
}

function LazyDateField(props: DatePickerProps) {
  const code = useLazyModule(fieldCode);
  return code ? <code.DateField {...props} /> : null;
}

export type DatePickerProps = {
  value: Ymd | null;
  onChange: (value: Ymd | null) => void;
  /** `chip` (32px, 44 on touch) in the rail and forms; `row` (28px) in a list row; `field` for a record's date. */
  variant?: "chip" | "row" | "field";
  /** The legacy form-grid trigger: `field` is the field-height trigger with the quick picks (New task). */
  trigger?: "chip" | "field";
  /** Offer "No date" and Clear. On by default; a visit date turns it off, so a date is never offered away and then refused. */
  allowNone?: boolean;
  /** The picker's accessible name and the sheet's title. */
  label?: string;
  /** What it's about, to name the chip in a list: "Fix the sink" reads "Due date for Fix the sink: Apr 19". */
  subject?: string;
  /** The chip's text when there's no date. */
  placeholder?: string;
  /** Red when the caller says it's overdue (Waiting and Review tasks never are). */
  overdue?: boolean;
  today?: Ymd;
  /** Shown before the date inside the chip, e.g. "Visit" where no label sits beside it. */
  prefix?: ReactNode;
  /** Repeat lives inside Due: a Repeat row at the foot of the panel, opening the repeat menu in the same layer. */
  withRepeat?: RepeatBinding;
  /** "public" puts the dark public tokens on the layer (the public move-in form). */
  surface?: "app" | "public";
  isDisabled?: boolean;
  className?: string;
};

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function DatePicker(props: DatePickerProps) {
  return props.variant === "field" ? <LazyDateField {...props} /> : <DateChip {...props} />;
}

/** The old name for the due date chip: a `row` chip unless told otherwise. */
export function DueDatePicker(props: DatePickerProps) {
  return <DatePicker variant="row" {...props} />;
}

/* ---------------- The chip ---------------- */

function DateChip({
  value,
  onChange,
  variant = "chip",
  trigger = "chip",
  allowNone = true,
  overdue = false,
  today,
  label = "Due date",
  subject,
  placeholder = "Due date",
  isDisabled,
  className,
  prefix,
  withRepeat,
  surface,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const day = toYmd(today ?? todayYmdEastern())!;
  const current = toYmd(value);
  // A finished task (the chip is disabled) is never "5d late": a past date reads as the date.
  const text = current
    ? isDisabled && isPastDay(current, day)
      ? fmtDay(current, { year: "auto", now: day })
      : capitalize(dueLabel(current, day))
    : placeholder;
  const field = trigger === "field";
  // A repeating task says so on its chip, since below lg the rail's read-only Repeats line sits last in a
  // scrolling row, off screen at 375 and 320. The rule rides in the chip's name; from lg the line is in the rail.
  const repeats = current && withRepeat?.value ? withRepeat.value : null;
  const repeatWords = repeats ? describeRepeat(repeats, { short: true, from: current }) : null;

  function pick(next: Ymd | null) {
    if (next !== current) onChange(next);
  }

  return (
    <PickerLayer
      isOpen={open}
      onOpenChange={setOpen}
      title={label}
      surface={surface}
      motion="pop"
      trigger={
        <AriaButton
          isDisabled={isDisabled}
          onHoverStart={warmDatePanel}
          onFocus={warmDatePanel}
          onPressStart={warmDatePanel}
          data-placeholder={current ? undefined : true}
          aria-label={`${label}${subject ? ` for ${subject}` : ""}: ${current ? fmtDay(current) : "none"}${repeatWords ? `, repeats ${repeatWords.charAt(0).toLowerCase()}${repeatWords.slice(1)}` : ""}`}
          className={cn(
            field ? pickerField : pickerChipClass({ size: variant === "row" ? "row" : "sm" }),
            !current && "text-fg-3",
            current && overdue && "text-danger",
            className,
          )}
        >
          <CalendarDays aria-hidden="true" className={cn(field && "text-fg-3")} />
          {prefix}
          {field ? <span className="min-w-0 flex-1 truncate">{text}</span> : text}
          {repeats && <Repeat2 aria-hidden="true" className="text-fg-3 lg:hidden" />}
          {field && <ChevronDown aria-hidden="true" className={pickerFieldChevron} />}
        </AriaButton>
      }
    >
      {({ container, close }) => (
        <DatePanel
          value={current}
          today={day}
          label={label}
          layout={container === "sheet" ? "steps" : "together"}
          allowNone={allowNone}
          overdue={overdue}
          repeat={withRepeat}
          onPick={(next) => {
            close();
            pick(next);
          }}
          onRepeat={(rule) => {
            close();
            // The rule it already has closes without a write, like picking the current date.
            if (withRepeat && ruleKey(rule) !== ruleKey(withRepeat.value)) withRepeat.onChange(rule);
          }}
        />
      )}
    </PickerLayer>
  );
}

