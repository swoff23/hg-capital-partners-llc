"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDate, parseDate } from "@internationalized/date";
import {
  CalendarArrowUp,
  CalendarDays,
  CalendarX2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Sun,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateField as AriaDateField,
  DateInput,
  DateSegment,
  I18nProvider,
} from "react-aria-components";
import { PickerLayer, openOnArrow } from "@/components/picker-layer";
import { RepeatMenu } from "@/components/repeat-menu";
import { SheetView } from "@/components/sheet";
import { Button, Kbd, fieldClass, fieldSizeClass, pickerChipClass, pickerField, pickerFieldChevron, type FieldSize } from "@/components/ui";
import { isCoarseNow } from "@/components/use-coarse-pointer";
import { dueLabel, fmtDay, isPastDay, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { quickPickForKey, quickPicks, type QuickPick, type QuickPickKey } from "@/lib/quick-dates";
import { describeRepeat, ruleKey, type RepeatRule } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";

/**
 * Dates, in one family (docs/specs/selectors.md 3.9, forms-editing 2.4):
 *
 *   `DatePicker`  a chip (`variant="chip"` in the rail and forms, `"row"` in a
 *                 list row) or a field (`"field"`, for a record's dates: typed
 *                 with a mouse, a formatted date and a sheet on touch).
 *   `DatePanel`   what opens: quick picks, a month calendar, Repeat, Clear.
 *   `DateField`   the field variant on its own.
 *   `DueDatePicker` the old name, a `row` chip; every caller that predates the
 *                 family keeps working.
 *
 * Values are "YYYY-MM-DD" or null; no timezone ever touches them. Pass `today`
 * from the server (todayYmdEastern()) so the label and the picks agree with
 * the server's idea of today; it defaults to the same thing.
 */

const PICK_ICON: Record<QuickPickKey, LucideIcon> = {
  today: Sun,
  tomorrow: Sunrise,
  monday: CalendarDays,
  "next-week": CalendarArrowUp,
  none: CalendarX2,
};

export type RepeatBinding = {
  value: RepeatRule | null;
  onChange: (rule: RepeatRule | null) => void;
};

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
  return props.variant === "field" ? <DateField {...props} /> : <DateChip {...props} />;
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
          data-placeholder={current ? undefined : true}
          aria-label={`${label}${subject ? ` for ${subject}` : ""}: ${current ? fmtDay(current) : "none"}`}
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

/* ---------------- The field ---------------- */

/**
 * A record's date (a purchase, a maturity, a renewal, an inspection) as a
 * field. With a mouse it takes typing, month / day / year segments in our
 * field look in every browser, and a calendar button inside the right edge;
 * on touch it shows the formatted date ("Jun 1, 2031", or "Pick a date") and a
 * tap opens the calendar in a sheet, where segments are too small to hit. The
 * calendar's heading steps to months, then years, for dates years back. Typing
 * commits on Enter or on leaving the field; a pick commits at once. No quick
 * picks. With `allowNone` the calendar offers Clear and emptying the segments
 * saves no date.
 */
export function DateField({
  value,
  onChange,
  allowNone = true,
  label = "Date",
  subject,
  placeholder = "Pick a date",
  today,
  isDisabled,
  surface,
  className,
  size = "md",
  isInvalid,
}: Pick<DatePickerProps, "value" | "onChange" | "allowNone" | "label" | "subject" | "placeholder" | "today" | "isDisabled" | "surface" | "className"> & {
  size?: FieldSize;
  isInvalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const day = toYmd(today ?? todayYmdEastern())!;
  const current = toYmd(value);
  const mouseRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<HTMLButtonElement>(null);
  const name = `${label}${subject ? ` for ${subject}` : ""}`;

  // What's typed is a draft until Enter or leaving the field, so a year typed one digit at a time never saves "0002".
  const [draft, setDraft] = useState<CalendarDate | null>(current ? parseDate(current) : null);
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    setDraft(current ? parseDate(current) : null);
  }

  function commit(next: CalendarDate | null) {
    const ymd = next ? next.toString() : null;
    if (ymd === null && !allowNone) {
      // Emptied a date that can't be empty: put it back.
      setDraft(current ? parseDate(current) : null);
      return;
    }
    if (ymd !== current) onChange(ymd);
  }

  return (
    <div className={cn("min-w-0", className)}>
      {/* A mouse types. */}
      <div
        ref={mouseRef}
        className={cn(
          fieldClass,
          fieldSizeClass[size],
          "relative flex items-center pr-9 pointer-coarse:hidden",
          "focus-within:border-act focus-within:ring-1 focus-within:ring-inset focus-within:ring-act",
          isDisabled && "opacity-50",
        )}
        aria-invalid={isInvalid || undefined}
        // Capture: a segment handles Enter itself and keeps it from bubbling.
        onKeyDownCapture={(e) => {
          if (e.key === "Enter") commit(draft);
        }}
      >
        <I18nProvider locale="en-US">
          <AriaDateField
            aria-label={name}
            value={draft}
            onChange={setDraft}
            onFocusChange={(focused) => {
              if (!focused) commit(draft);
            }}
            granularity="day"
            isDisabled={isDisabled}
            isInvalid={isInvalid}
            className="min-w-0 flex-1"
          >
            <DateInput className="flex items-center whitespace-nowrap">
              {(segment) => (
                <DateSegment
                  segment={segment}
                  className="rounded-sm px-0.5 tabular-nums caret-transparent outline-none data-focused:bg-fill-2 data-placeholder:text-fg-3 data-[type=literal]:px-0 data-[type=literal]:text-fg-3"
                />
              )}
            </DateInput>
          </AriaDateField>
        </I18nProvider>
        <AriaButton
          isDisabled={isDisabled}
          aria-label={`Open calendar: ${name}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onPress={() => setOpen(true)}
          onKeyDown={openOnArrow(() => setOpen(true))}
          className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1"
        >
          <CalendarDays aria-hidden="true" className="size-4" />
        </AriaButton>
      </div>
      {/* Touch shows the date and opens the calendar. */}
      <AriaButton
        ref={touchRef}
        isDisabled={isDisabled}
        aria-label={`${name}: ${current ? fmtDay(current) : "none"}`}
        aria-haspopup="dialog"
        aria-invalid={isInvalid || undefined}
        onPress={() => setOpen(true)}
        onKeyDown={openOnArrow(() => setOpen(true))}
        className={cn(pickerField, "hidden pointer-coarse:flex", !current && "text-fg-3")}
      >
        <CalendarDays aria-hidden="true" className="text-fg-3" />
        <span className="min-w-0 flex-1 truncate">{current ? fmtDay(current) : placeholder}</span>
      </AriaButton>
      <PickerLayer
        isOpen={open}
        onOpenChange={setOpen}
        title={label}
        surface={surface}
        motion="pop"
        // The popover points at whichever of the two the person is using.
        anchorRef={open && isCoarseNow() ? touchRef : mouseRef}
      >
        {({ container, close }) => (
          <DatePanel
            value={current}
            today={day}
            label={label}
            layout={container === "sheet" ? "steps" : "together"}
            picks={false}
            allowNone={allowNone}
            onPick={(next) => {
              close();
              commit(next ? parseDate(next) : null);
            }}
          />
        )}
      </PickerLayer>
    </div>
  );
}

/* ---------------- The panel ---------------- */

/**
 * What a date picker opens. With a mouse, and on a touch tablet, the quick
 * picks (task dates only) sit over the month calendar in one panel. On a touch
 * phone the sheet is two steps in one layer: the picks, then "Pick a date"
 * swaps in the calendar under a back arrow (a Sheet on an iPhone SE shows
 * about 495px, which the picks and the calendar together overflow). A date
 * without quick picks goes straight to the calendar.
 *
 * The panel's first line names a past value ("Due Sep 12", in --danger when
 * overdue), since the calendar opens on today's month. The picks show a Check
 * on the current value. With `repeat`, a Repeat row ends the panel and opens
 * the repeat menu in the same layer.
 */
export function DatePanel({
  value,
  today,
  label,
  onPick,
  picks: withPicks = true,
  allowNone = true,
  overdue = false,
  repeat,
  onRepeat,
  layout = "together",
}: {
  value: Ymd | null;
  today: Ymd;
  label: string;
  onPick: (value: Ymd | null) => void;
  /** Quick picks (task dates). A record date has none. */
  picks?: boolean;
  allowNone?: boolean;
  overdue?: boolean;
  repeat?: RepeatBinding;
  /** Commits a repeat rule and closes the layer. */
  onRepeat?: (rule: RepeatRule | null) => void;
  /** "steps" is the phone sheet's two steps; "together" puts the picks over the calendar. */
  layout?: "together" | "steps";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const picks = useMemo(
    () => (withPicks ? quickPicks(today).filter((p) => allowNone || p.key !== "none") : []),
    [withPicks, today, allowNone],
  );
  const steps = layout === "steps";
  const [view, setView] = useState<"date" | "calendar" | "repeat">("date");
  const past = value !== null && isPastDay(value, today);

  // A number chooses its quick pick: Today 1 through No date 5, whichever picks show.
  // Listen on the whole dialog, in the capture phase, because focus starts on the dialog
  // itself and React Aria keeps some key presses to its own controls. Only while the picks
  // are on screen: in the Repeat list or the calendar step a digit is not a date.
  useEffect(() => {
    if (!picks.length || view !== "date") return;
    const dialog = ref.current?.closest('[role="dialog"]');
    if (!dialog) return;
    const onKey = (e: Event) => {
      const k = e as KeyboardEvent;
      if (k.metaKey || k.ctrlKey || k.altKey) return;
      if ((k.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
      const p = quickPickForKey(picks, k.key);
      if (!p) return;
      k.preventDefault();
      k.stopPropagation();
      onPick(p.value);
    };
    dialog.addEventListener("keydown", onKey, true);
    return () => dialog.removeEventListener("keydown", onKey, true);
  }, [picks, onPick, view]);

  // It opens on the picked date's month, or on today's for a late one (BTASKS-012). A record date
  // (no quick picks) opens on its own month however far back, for a purchase years ago.
  const start = value && (!past || !withPicks) ? value : today;
  const calendar = <MonthCalendar value={value} start={start} today={today} label={label} onPick={onPick} />;
  const currentLine = past && value && (
    <p className={cn("px-3 pb-0 pt-2 text-meta", overdue ? "text-danger" : "text-fg-3")}>
      {label.replace(/ date$/i, "")} {fmtDay(value, { year: "auto", now: today })}
    </p>
  );
  const clear = allowNone && !withPicks && value && (
    <div className="flex justify-end border-t border-line px-3 py-2">
      <Button type="button" variant="ghost" size="sm" onClick={() => onPick(null)}>
        Clear
      </Button>
    </div>
  );
  const repeatRow = repeat && (
    <button
      type="button"
      onClick={() => setView("repeat")}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-body outline-none transition-colors",
        "hover:bg-fill-2 focus-visible:bg-fill-2 pointer-coarse:h-11",
      )}
    >
      <Repeat aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
      <span className="flex-1">Repeat</span>
      <span className="min-w-0 truncate pl-4 text-meta text-fg-3">
        {repeat.value ? describeRepeat(repeat.value, { short: true, from: value ?? today }) : "Doesn't repeat"}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
    </button>
  );
  const repeatMenu = repeat && (
    <RepeatMenu
      value={repeat.value}
      from={value ?? today}
      today={today}
      layer={steps ? "sheet" : "popover"}
      onPick={(rule) => onRepeat?.(rule)}
      onBack={() => setView("date")}
    />
  );

  // A phone's picks, then "Pick a date" and Repeat as steps.
  if (steps) {
    return (
      <div ref={ref} className="pb-[env(safe-area-inset-bottom)]">
        {withPicks ? (
          <>
            {currentLine}
            <div className="p-1">
              <QuickPickRows picks={picks} value={value} onPick={onPick} />
              <button
                type="button"
                onClick={() => setView("calendar")}
                className="flex h-11 w-full items-center gap-2.5 rounded-sm px-2 text-left text-body outline-none transition-colors hover:bg-fill-2 focus-visible:bg-fill-2"
              >
                <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
                <span className="flex-1">Pick a date</span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
              </button>
              {repeatRow}
            </div>
            {view === "calendar" && (
              <SheetView title={label} onBack={() => setView("date")} escape="close">
                <div className="px-3 pb-3 pt-2">{calendar}</div>
              </SheetView>
            )}
          </>
        ) : (
          <>
            {currentLine}
            <div className="px-3 pb-3 pt-2">{calendar}</div>
            {clear}
            {repeatRow && <div className="border-t border-line p-1">{repeatRow}</div>}
          </>
        )}
        {view === "repeat" && (
          <SheetView title="Repeat" onBack={() => setView("date")} escape="close">
            {repeatMenu}
          </SheetView>
        )}
      </div>
    );
  }

  if (view === "repeat") return <div ref={ref}>{repeatMenu}</div>;

  return (
    <div ref={ref} className="w-80">
      {currentLine}
      {withPicks && (
        <div className="p-1">
          <QuickPickRows picks={picks} value={value} onPick={onPick} />
        </div>
      )}
      <div className={cn("px-3 pb-3 pt-2", withPicks && "border-t border-line")}>{calendar}</div>
      {clear}
      {repeatRow && <div className="border-t border-line p-1">{repeatRow}</div>}
    </div>
  );
}

/** The quick picks as rows: icon, name, the day it lands on, its number key (a mouse), and a Check on the current value. */
function QuickPickRows({ picks, value, onPick }: { picks: QuickPick[]; value: Ymd | null; onPick: (value: Ymd | null) => void }) {
  return (
    <>
      {picks.map((p) => {
        const Icon = PICK_ICON[p.key];
        const isCurrent = p.value === value;
        return (
          <AriaButton
            key={p.key}
            onPress={() => onPick(p.value)}
            aria-keyshortcuts={String(p.number)}
            aria-current={isCurrent || undefined}
            className={cn(
              "flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-body outline-none transition-colors",
              "hover:bg-fill-2 data-focus-visible:bg-fill-2 data-pressed:bg-fill-2 pointer-coarse:h-11",
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
            <span className="flex-1">{p.label}</span>
            {p.hint && <span className="whitespace-nowrap pl-4 text-meta text-fg-3">{p.hint}</span>}
            {/* Its key, printed for a mouse; Kbd hides on touch. */}
            <Kbd aria-hidden="true">{p.number}</Kbd>
            <Check aria-hidden="true" className={cn("size-4 shrink-0 text-fg-1", !isCurrent && "invisible")} />
          </AriaButton>
        );
      })}
    </>
  );
}

/* ---------------- The calendar ---------------- */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const navButton =
  "flex size-7 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1 disabled:opacity-50 pointer-coarse:size-11";
const gridButton = cn(
  "flex h-8 items-center justify-center rounded-md text-body tabular-nums outline-none transition-colors pointer-coarse:h-11",
  "hover:bg-fill-2 data-pressed:bg-fill-2 data-focus-visible:outline-solid data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-act",
);

/**
 * A month of days, with a heading that steps to a month grid and then a
 * 12-year grid in the same layer, for dates years back. Today is a 1px inset
 * `--line-control` ring at the same weight as other days; the picked day is the
 * `--act` fill. Cells are 32px squares with a mouse; on touch each takes 1/7 of
 * the grid's width at 44px tall.
 */
function MonthCalendar({
  value,
  start,
  today,
  label,
  onPick,
}: {
  value: Ymd | null;
  /** The month it opens on. */
  start: Ymd;
  today: Ymd;
  label: string;
  onPick: (value: Ymd) => void;
}) {
  const [focus, setFocus] = useState<CalendarDate>(() => parseDate(start));
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const todayDate = parseDate(today);
  const selected = value ? parseDate(value) : null;
  const firstYear = focus.year - (focus.year % 12);

  const heading =
    view === "days" ? `${FULL_MONTHS[focus.month - 1]} ${focus.year}` : view === "months" ? String(focus.year) : `${firstYear} to ${firstYear + 11}`;
  const step = (dir: 1 | -1) =>
    setFocus((f) => (view === "days" ? f.add({ months: dir }) : view === "months" ? f.add({ years: dir }) : f.add({ years: 12 * dir })));

  return (
    <div>
      <header className="flex items-center justify-between pb-1">
        <AriaButton
          onPress={() => setView(view === "days" ? "months" : "years")}
          isDisabled={view === "years"}
          aria-label={view === "days" ? `${heading}. Choose a month` : view === "months" ? `${heading}. Choose a year` : heading}
          className="flex h-7 items-center gap-1 rounded-md pl-1 pr-1.5 text-body font-semibold outline-none transition-colors hover:bg-fill-2 disabled:hover:bg-transparent data-focus-visible:outline-solid data-focus-visible:outline-2 data-focus-visible:outline-act pointer-coarse:h-11"
        >
          {heading}
          {view !== "years" && <ChevronDown aria-hidden="true" className="size-3.5 text-fg-3" />}
        </AriaButton>
        <div className="flex items-center">
          <AriaButton aria-label={view === "days" ? "Previous month" : view === "months" ? "Previous year" : "Previous years"} onPress={() => step(-1)} className={navButton}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </AriaButton>
          <AriaButton aria-label={view === "days" ? "Next month" : view === "months" ? "Next year" : "Next years"} onPress={() => step(1)} className={navButton}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </AriaButton>
        </div>
      </header>
      {/* The same height in every view, so the panel doesn't jump while stepping. */}
      <div className="min-h-54 pointer-coarse:min-h-72">
        {view === "days" && (
          <Calendar
            aria-label={label}
            value={selected}
            focusedValue={focus}
            onFocusChange={setFocus}
            onChange={(d) => onPick(d.toString())}
            className="w-full"
          >
            <CalendarGrid weekdayStyle="narrow" className="w-full border-separate border-spacing-0">
              <CalendarGridHeader>
                {(d) => <CalendarHeaderCell className="pb-1 text-meta font-medium text-fg-3">{d}</CalendarHeaderCell>}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => (
                  <CalendarCell
                    date={date}
                    className={({ isSelected, isOutsideMonth, isFocusVisible }) =>
                      cn(
                        "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-body tabular-nums outline-none transition-colors",
                        "pointer-coarse:h-11 pointer-coarse:w-full pointer-coarse:rounded-md",
                        isOutsideMonth && "invisible",
                        // One weight for every day: today is its ring, the pick is the --act fill.
                        isSelected
                          ? "bg-act text-on-act"
                          : cn("hover:bg-fill-2 data-pressed:bg-fill-2", date.toString() === today && "ring-1 ring-inset ring-line-control"),
                        isFocusVisible && "outline-solid outline-2 outline-offset-2 outline-act",
                      )
                    }
                  />
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </Calendar>
        )}
        {view === "months" && (
          <div className="grid grid-cols-3 gap-x-1 gap-y-2 pt-1" role="group" aria-label={`Months of ${focus.year}`}>
            {MONTH_NAMES.map((name, i) => {
              const isPick = selected?.year === focus.year && selected.month === i + 1;
              const isNow = todayDate.year === focus.year && todayDate.month === i + 1;
              return (
                <AriaButton
                  key={name}
                  aria-label={`${FULL_MONTHS[i]} ${focus.year}`}
                  aria-pressed={isPick}
                  onPress={() => {
                    setFocus((f) => f.set({ month: i + 1 }));
                    setView("days");
                  }}
                  className={cn(gridButton, isPick ? "bg-act text-on-act hover:bg-act-hover" : isNow && "ring-1 ring-inset ring-line-control")}
                >
                  {name}
                </AriaButton>
              );
            })}
          </div>
        )}
        {view === "years" && (
          <div className="grid grid-cols-3 gap-x-1 gap-y-2 pt-1" role="group" aria-label="Years">
            {Array.from({ length: 12 }, (_, i) => firstYear + i).map((year) => {
              const isPick = selected?.year === year;
              const isNow = todayDate.year === year;
              return (
                <AriaButton
                  key={year}
                  aria-pressed={isPick}
                  onPress={() => {
                    setFocus((f) => f.set({ year }));
                    setView("months");
                  }}
                  className={cn(gridButton, isPick ? "bg-act text-on-act hover:bg-act-hover" : isNow && "ring-1 ring-inset ring-line-control")}
                >
                  {year}
                </AriaButton>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
