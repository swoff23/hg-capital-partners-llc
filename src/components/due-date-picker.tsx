"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseDate } from "@internationalized/date";
import { CalendarArrowUp, CalendarDays, CalendarX2, ChevronDown, ChevronLeft, ChevronRight, Sun, Sunrise, type LucideIcon } from "lucide-react";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DialogTrigger,
  Heading,
} from "react-aria-components";
import { Popover } from "@/components/popover";
import { Sheet } from "@/components/sheet";
import { Kbd, pickerChip, pickerField, pickerFieldChevron } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { dueLabel, fmtDay, isPastDay, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { quickPickForKey, quickPicks, type QuickPickKey } from "@/lib/quick-dates";
import { cn } from "@/lib/utils";

const PICK_ICON: Record<QuickPickKey, LucideIcon> = {
  today: Sun,
  tomorrow: Sunrise,
  monday: CalendarDays,
  "next-week": CalendarArrowUp,
  none: CalendarX2,
};

/**
 * The due date chip (D7). Shows dueLabel(): "Today", "Tomorrow", "Friday",
 * "Mar 1"; red when the caller says it's overdue (overdue is the caller's
 * call: Waiting and Review tasks never are). Opens quick picks with the date
 * each one lands on, then a calendar: a Popover with a mouse, a Sheet on
 * touch. Keys 1 to 5 choose the quick picks. Values are "YYYY-MM-DD" or
 * null; no timezone ever touches them.
 *
 * Pass `today` from the server (todayYmdEastern()) so the label and the picks
 * agree with the server's idea of today; it defaults to the same thing.
 * `trigger="field"` is the field-height trigger (pickerField) for a form grid.
 */
export function DueDatePicker({
  value,
  onChange,
  overdue = false,
  today,
  label = "Due date",
  placeholder = "Due date",
  isDisabled,
  className,
  prefix,
  trigger = "chip",
}: {
  value: Ymd | null;
  onChange: (value: Ymd | null) => void;
  overdue?: boolean;
  today?: Ymd;
  /** The picker's accessible name and the sheet's title. */
  label?: string;
  /** The chip's text when there's no date. */
  placeholder?: string;
  /** Shown before the date inside the chip, e.g. "Visit" where no label sits beside it. */
  prefix?: ReactNode;
  /** "chip" in a row of chips; "field" at field height in a form. */
  trigger?: "chip" | "field";
  isDisabled?: boolean;
  className?: string;
}) {
  const touch = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const day = toYmd(today ?? todayYmdEastern())!;
  const current = toYmd(value);
  // A finished task (the chip is disabled) is never "5d late": a past date reads as the date.
  const text = current
    ? isDisabled && isPastDay(current, day)
      ? fmtDay(current, { year: "auto", now: day })
      : capitalize(dueLabel(current, day))
    : placeholder;

  function pick(next: Ymd | null) {
    setOpen(false);
    if (next !== current) onChange(next);
  }

  const panel = <DuePanel value={current} today={day} label={label} onPick={pick} />;

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <AriaButton
        isDisabled={isDisabled}
        aria-label={`${label}: ${current ? fmtDay(current) : "none"}`}
        className={cn(
          trigger === "field" ? pickerField : pickerChip,
          !current && "text-fg-3",
          current && overdue && "text-danger",
          className,
        )}
      >
        <CalendarDays aria-hidden="true" className={cn(trigger === "field" && "text-fg-3")} />
        {prefix}
        {trigger === "field" ? <span className="min-w-0 flex-1 truncate">{text}</span> : text}
        {trigger === "field" && <ChevronDown aria-hidden="true" className={pickerFieldChevron} />}
      </AriaButton>
      {touch ? (
        <Sheet title={label}>{panel}</Sheet>
      ) : (
        <Popover aria-label={label} placement="bottom start">
          {panel}
        </Popover>
      )}
    </DialogTrigger>
  );
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Quick picks over a month calendar. Shared by the popover and the sheet. */
function DuePanel({
  value,
  today,
  label,
  onPick,
}: {
  value: Ymd | null;
  today: Ymd;
  label: string;
  onPick: (value: Ymd | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const picks = quickPicks(today);

  // Keys 1 to 5 choose a quick pick. Listen on the whole dialog, in the
  // capture phase, because focus starts on the dialog itself and React Aria
  // keeps some key presses to its own controls.
  useEffect(() => {
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
  }, [picks, onPick]);

  return (
    <div ref={ref} className="pb-[env(safe-area-inset-bottom)] md:pb-0">
      <div className="p-1">
        {picks.map((p, i) => {
          const Icon = PICK_ICON[p.key];
          return (
            <AriaButton
              key={p.key}
              onPress={() => onPick(p.value)}
              aria-keyshortcuts={String(i + 1)}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-sm px-3 text-left text-sm outline-none transition-colors",
                "hover:bg-fill-2 data-focus-visible:bg-fill-2 data-pressed:bg-fill-2 pointer-coarse:h-11",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="flex-1">{p.label}</span>
              {p.hint && <span className="whitespace-nowrap pl-6 text-xs text-muted">{p.hint}</span>}
              {/* Its key, printed for a mouse; Kbd hides on touch. */}
              <Kbd aria-hidden="true">{i + 1}</Kbd>
            </AriaButton>
          );
        })}
      </div>
      <div className="border-t border-border px-3 pb-3 pt-2">
        <MonthCalendar value={value} today={today} label={label} onPick={onPick} />
      </div>
    </div>
  );
}

const navButton =
  "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-fill-2 hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11";

function MonthCalendar({
  value,
  today,
  label,
  onPick,
}: {
  value: Ymd | null;
  today: Ymd;
  label: string;
  onPick: (value: Ymd) => void;
}) {
  return (
    <Calendar
      aria-label={label}
      value={value ? parseDate(value) : null}
      defaultFocusedValue={parseDate(value ?? today)}
      onChange={(d) => onPick(d.toString())}
      className="w-full"
    >
      <header className="flex items-center justify-between pb-1">
        <Heading className="pl-1 text-sm font-semibold" />
        <div className="flex items-center">
          <AriaButton slot="previous" className={navButton}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </AriaButton>
          <AriaButton slot="next" className={navButton}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </AriaButton>
        </div>
      </header>
      <CalendarGrid weekdayStyle="narrow" className="w-full border-separate border-spacing-0">
        <CalendarGridHeader>
          {(d) => <CalendarHeaderCell className="pb-1 text-xs font-medium text-muted">{d}</CalendarHeaderCell>}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell
              date={date}
              className={({ isSelected, isOutsideMonth, isFocusVisible }) =>
                cn(
                  "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums outline-none transition-colors pointer-coarse:h-11 pointer-coarse:w-11",
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
  );
}
