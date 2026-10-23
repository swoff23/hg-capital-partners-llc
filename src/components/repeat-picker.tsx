"use client";
import { useState, type ReactNode } from "react";
import { Repeat } from "lucide-react";
import { Button as AriaButton, DialogTrigger } from "react-aria-components";
import { Popover } from "@/components/popover";
import { Sheet } from "@/components/sheet";
import { Button, Input, Select, pickerChip } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { describeRepeat, type RepeatRule } from "@/lib/tasks/repeat";
import { REPEAT_MODES, choiceFromRule, ruleFromChoice, switchMode, type RepeatChoice, type RepeatMode } from "@/lib/tasks/repeat-choice";
import { cn } from "@/lib/utils";

/**
 * The Repeats field (D27): a chip with the rule ("Every 2 weeks",
 * "Monthly on the 5th") that opens a small editor. Never, every N days,
 * every N weeks, monthly on a day, quarterly, yearly. A Popover with a
 * mouse, a Sheet on touch, like the other picker chips.
 */
export function RepeatPicker({
  value,
  onChange,
  defaultDay,
  placeholder = "Never",
  isDisabled,
  className,
}: {
  value: RepeatRule | null;
  onChange: (rule: RepeatRule | null) => void;
  /** Seeds "monthly on day D": the due date's day, or today's. */
  defaultDay: number;
  /** The chip's text when it doesn't repeat. */
  placeholder?: ReactNode;
  isDisabled?: boolean;
  className?: string;
}) {
  const touch = useCoarsePointer();
  const [open, setOpen] = useState(false);

  function save(rule: RepeatRule | null) {
    setOpen(false);
    if (JSON.stringify(rule) !== JSON.stringify(value)) onChange(rule);
  }

  const panel = <RepeatPanel initial={choiceFromRule(value, defaultDay)} defaultDay={defaultDay} onSave={save} onCancel={() => setOpen(false)} />;

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <AriaButton
        isDisabled={isDisabled}
        aria-label={`Repeats: ${value ? describeRepeat(value) : "never"}`}
        className={cn(pickerChip, !value && "text-muted", className)}
      >
        <Repeat aria-hidden="true" />
        {value ? describeRepeat(value) : placeholder}
      </AriaButton>
      {touch ? (
        <Sheet title="Repeats">{panel}</Sheet>
      ) : (
        <Popover aria-label="Repeats" placement="bottom start">
          {panel}
        </Popover>
      )}
    </DialogTrigger>
  );
}

function RepeatPanel({
  initial,
  defaultDay,
  onSave,
  onCancel,
}: {
  initial: RepeatChoice;
  /** The due date's day (or today's), for a mode that wasn't the stored one. */
  defaultDay: number;
  onSave: (rule: RepeatRule | null) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState(initial);
  const set = (patch: Partial<RepeatChoice>) => setChoice((c) => ({ ...c, ...patch }));
  const numberField = (key: "every" | "day", max: number, before: string, after: string) => (
    <label className="flex items-center gap-2 whitespace-nowrap text-sm">
      {before}
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={Number.isFinite(choice[key]) ? choice[key] : ""}
        onChange={(e) => set({ [key]: e.target.valueAsNumber })}
        className="w-16 text-center tabular-nums"
      />
      {after}
    </label>
  );

  return (
    <form
      className="w-full space-y-3 p-3 md:w-64"
      onSubmit={(e) => {
        // The picker may sit inside another form (New task); this one stays its own.
        e.preventDefault();
        e.stopPropagation();
        onSave(ruleFromChoice(choice));
      }}
    >
      <Select
        aria-label="How often"
        value={choice.mode}
        autoFocus
        onChange={(e) => setChoice(switchMode(initial, e.target.value as RepeatMode, defaultDay))}
      >
        {REPEAT_MODES.map((m) => (
          <option key={m.mode} value={m.mode}>
            {m.label}
          </option>
        ))}
      </Select>
      {choice.mode === "days" && numberField("every", 365, "Every", choice.every === 1 ? "day" : "days")}
      {choice.mode === "weeks" && numberField("every", 52, "Every", choice.every === 1 ? "week" : "weeks")}
      {choice.mode === "monthly" && numberField("day", 31, "On day", "of the month")}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}
