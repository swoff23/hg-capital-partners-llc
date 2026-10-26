"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, Repeat } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { PickerLayer } from "@/components/picker-layer";
import { RepeatMenu } from "@/components/repeat-menu";
import { pickerChipClass, pickerField, pickerFieldChevron, type PickerChipSize } from "@/components/ui";
import { toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { describeRepeat, ruleKey, type RepeatRule } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";

/**
 * The Repeat chip on its own: the rule ("Every 2 weeks on Mon"; "Repeat" when
 * it doesn't) opening the repeat menu, presets read from `from`, each with
 * its next date, then Custom (docs/specs/selectors.md 3.9). A Popover with a
 * mouse, a Sheet on touch phones. `trigger="field"` is the field-height
 * trigger for a form grid.
 *
 * On a task's own page Repeat lives inside the due date (`DatePicker`
 * `withRepeat`), and this chip goes; it stays where a form has no due date
 * picker beside it.
 */
export function RepeatPicker({
  value,
  onChange,
  from,
  today,
  placeholder = "Repeat",
  trigger = "chip",
  size = "sm",
  isDisabled,
  className,
}: {
  value: RepeatRule | null;
  onChange: (rule: RepeatRule | null) => void;
  /** The date the presets read their weekday and day from: the due date, or today with none. */
  from?: Ymd;
  today?: Ymd;
  /** The chip's text when it doesn't repeat. */
  placeholder?: ReactNode;
  /** "chip" in a row of chips; "field" at field height in a form. */
  trigger?: "chip" | "field";
  size?: PickerChipSize;
  isDisabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const day = toYmd(today ?? todayYmdEastern())!;
  const anchor = toYmd(from) ?? day;

  return (
    <PickerLayer
      isOpen={open}
      onOpenChange={setOpen}
      title="Repeat"
      motion="pop"
      trigger={
        <AriaButton
          isDisabled={isDisabled}
          data-placeholder={value ? undefined : true}
          aria-label={`Repeat: ${value ? describeRepeat(value, { from: anchor }) : "doesn't repeat"}`}
          className={cn(trigger === "field" ? pickerField : pickerChipClass({ size }), !value && "text-fg-3", className)}
        >
          <Repeat aria-hidden="true" className={cn(trigger === "field" && "text-fg-3")} />
          <span className={cn("min-w-0 truncate", trigger === "field" && "flex-1")}>
            {value ? describeRepeat(value, { short: true, from: anchor }) : placeholder}
          </span>
          {trigger === "field" && <ChevronDown aria-hidden="true" className={pickerFieldChevron} />}
        </AriaButton>
      }
    >
      {({ container, close }) => (
        <div className="md:w-80">
          <RepeatMenu
            value={value}
            from={anchor}
            today={day}
            layer={container === "sheet" ? "sheet" : "popover"}
            onPick={(rule) => {
              close();
              if (ruleKey(rule) !== ruleKey(value)) onChange(rule);
            }}
          />
        </div>
      )}
    </PickerLayer>
  );
}
