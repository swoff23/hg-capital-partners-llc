"use client";
import { useRef, useState } from "react";
import { CalendarDate, parseDate } from "@internationalized/date";
import { CalendarDays } from "lucide-react";
import { Button as AriaButton, DateField as AriaDateField, DateInput, DateSegment, I18nProvider } from "react-aria-components";
import { DatePanel, warmDatePanel, type DatePickerProps } from "@/components/due-date-picker";
import { PickerLayer, openOnArrow } from "@/components/picker-layer";
import { fieldClass, fieldSizeClass, pickerField, type FieldSize } from "@/components/ui";
import { isCoarseNow } from "@/components/use-coarse-pointer";
import { fmtDay, toYmd, todayYmdEastern } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * A record's date as a field (docs/specs/selectors.md 3.9): typed segments with
 * a mouse, a formatted date and a sheet on touch. Its own file, apart from the
 * chip in due-date-picker.tsx, because the segments are React Aria's date
 * field, which a page of chips doesn't need. Forms import it from here;
 * `<DatePicker variant="field">` loads it on demand.
 */

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
          onHoverStart={warmDatePanel}
          onFocus={warmDatePanel}
          onPressStart={warmDatePanel}
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
        onHoverStart={warmDatePanel}
        onFocus={warmDatePanel}
        onPressStart={warmDatePanel}
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

