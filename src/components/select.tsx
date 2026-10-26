"use client";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { OptionList, type OptionItem, type OptionSection } from "@/components/option-list";
import { PickerLayer } from "@/components/picker-layer";
import { SaveError, fieldClass, fieldSizeClass, type FieldSize } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Pick one value in a form, from 2 to 45 options (docs/specs/selectors.md
 * 3.2). The field look with a chevron, and the list in an anchored popover
 * with a mouse or a titled sheet on a phone; search turns on by itself at 10
 * options. It replaces the native select, so every pick looks the same in
 * every browser, with a Check on the current one and a named empty value.
 *
 *   <Select label="Strategy" items={STRATEGIES} value={v} onChange={setV} emptyLabel="Not set" />
 *   <Select aria-label="Pass reason" size="sm" name="passReason" defaultValue="" … />   // posts with a form
 *
 * `value` is an option's `id`, or null for the empty choice. With `name` the
 * pick rides in a hidden field, so a server action reads it from FormData. A
 * value the list doesn't offer (a stored name) shows as its own row in --fg-3,
 * so opening never changes it silently. Closed, typing a letter jumps to the
 * option that starts with it, as a native select does.
 */

/** The row the empty choice is. */
const EMPTY_ID = "__empty__";

export type SelectProps = {
  /** Above the field in text-meta 500 --fg-2. Without one, give an `aria-label`. */
  label?: string;
  "aria-label"?: string;
  /** One line of text-meta --fg-3 under the field (who sees it, what happens). */
  description?: ReactNode;
  items?: OptionItem[];
  sections?: OptionSection[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** Posts the pick in a hidden field under this name. */
  name?: string;
  /** The field's words while nothing is picked and there's no `emptyLabel`. */
  placeholder?: string;
  /** The empty choice, a named value listed first: "Not set", "No reason", "No unit". Never "None". */
  emptyLabel?: string;
  /** `md` 36px (the default), `sm` 32px for table rows and rails; both 44 on touch. */
  size?: FieldSize;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** The line under an invalid field, in --danger. */
  errorMessage?: string;
  isDisabled?: boolean;
  /** "public" puts the dark public tokens on the list (the public move-in form). */
  surface?: "app" | "public";
  /** The phone sheet's title; the label by default. */
  title?: string;
  /** "Search reasons": the search field's name when the list is long. */
  searchLabel?: string;
  emptyText?: string;
  id?: string;
  /** On the wrapper: widths and margins. */
  className?: string;
};

function flatten(items?: OptionItem[], sections?: OptionSection[]): OptionItem[] {
  return [...(items ?? []), ...(sections ?? []).flatMap((s) => s.items)];
}

export function Select({
  label,
  "aria-label": ariaLabel,
  description,
  items,
  sections,
  value,
  defaultValue = null,
  onChange,
  name,
  placeholder = "Choose",
  emptyLabel,
  size = "md",
  isRequired,
  isInvalid,
  errorMessage,
  isDisabled,
  surface = "app",
  title,
  searchLabel,
  emptyText,
  id,
  className,
}: SelectProps) {
  const [own, setOwn] = useState<string | null>(defaultValue);
  const current = value !== undefined ? value : own;
  const [open, setOpen] = useState(false);
  const ids = useId();
  const buttonId = id ?? `${ids}-button`;
  const labelId = `${ids}-label`;
  const valueId = `${ids}-value`;
  const helpId = `${ids}-help`;
  const errorId = `${ids}-error`;

  const all = flatten(items, sections);
  const found = current !== null ? all.find((o) => o.id === current) : undefined;
  // A stored value the list doesn't offer stays visible, in --fg-3, so nothing changes silently.
  const strays: OptionItem[] = current !== null && !found ? [{ id: current, label: current, muted: true }] : [];
  const pinned: OptionItem[] = [
    ...(emptyLabel ? [{ id: EMPTY_ID, label: emptyLabel, muted: true }] : []),
    ...strays,
  ];

  function pick(next: string | null) {
    if (next !== current) {
      if (value === undefined) setOwn(next);
      onChange?.(next);
    }
  }

  // Typing a letter while the field is closed jumps to the option that starts with it, as a native select does.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: "", at: 0 });
  function onKeyDown(e: KeyboardEvent) {
    if (open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key.length !== 1 || (e.key === " " && typed.current.text === "")) return;
    const now = e.timeStamp;
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
    const match = [...(emptyLabel ? [{ id: EMPTY_ID, label: emptyLabel, isDisabled: false }] : []), ...all].find(
      (o) => !o.isDisabled && o.label.toLowerCase().startsWith(typed.current.text),
    );
    if (match) {
      e.preventDefault();
      pick(match.id === EMPTY_ID ? null : match.id);
    }
  }

  const display = found ?? strays[0] ?? null;
  const text = display?.label ?? (emptyLabel && current === null ? emptyLabel : placeholder);
  const muted = !display || display.muted === true;

  const describedBy = [description && !isInvalid ? helpId : null, isInvalid && errorMessage ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <label id={labelId} htmlFor={buttonId} className="text-meta font-medium text-fg-2">
          {label}
        </label>
      )}
      <div className="relative">
        <PickerLayer
          isOpen={open}
          onOpenChange={setOpen}
          title={title ?? label ?? ariaLabel ?? "Choose"}
          surface={surface}
          popoverClassName="min-w-[min(var(--trigger-width),20rem)] max-w-80"
          trigger={
            <AriaButton
              id={buttonId}
              ref={buttonRef}
              isDisabled={isDisabled}
              aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
              aria-label={label ? undefined : ariaLabel}
              aria-haspopup="listbox"
              aria-invalid={isInvalid || undefined}
              aria-required={isRequired || undefined}
              aria-describedby={describedBy || undefined}
              onKeyDown={onKeyDown}
              className={cn(
                fieldClass,
                fieldSizeClass[size],
                "flex items-center gap-2 text-left disabled:opacity-50 data-disabled:opacity-50",
                // Open reads like focus: the --act edge and the inset ring.
                "data-pressed:border-act data-pressed:ring-1 data-pressed:ring-inset data-pressed:ring-act",
                display?.leading && "pl-2",
              )}
            >
              {display?.leading && <span className="flex shrink-0 items-center">{display.leading}</span>}
              <span id={valueId} className={cn("min-w-0 flex-1 truncate", muted && "text-fg-3")}>
                {text}
              </span>
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-3" />
            </AriaButton>
          }
        >
          {({ container, close }) => (
            <OptionList
              aria-label={label ?? ariaLabel ?? "Options"}
              container={container}
              pinned={pinned}
              items={items}
              sections={sections}
              selectedKey={current === null ? (emptyLabel ? EMPTY_ID : null) : current}
              onPick={(next) => {
                close();
                pick(next === EMPTY_ID ? null : next);
              }}
              onTab={close}
              searchLabel={searchLabel ?? (label ? `Search ${label.toLowerCase()}` : "Search")}
              emptyText={emptyText}
            />
          )}
        </PickerLayer>
        {/* The pick rides in this field. Required, it is a real (visually hidden) field, so a form refuses an empty pick
            like any native control does and the message points at the button, which takes focus. Not readOnly: that
            would exempt it from validation. */}
        {isRequired ? (
          <input
            name={name}
            value={current ?? ""}
            onChange={() => {}}
            required
            tabIndex={-1}
            aria-hidden="true"
            onFocus={() => buttonRef.current?.focus()}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
          />
        ) : (
          name && <input type="hidden" name={name} value={current ?? ""} />
        )}
      </div>
      {description && !isInvalid && (
        <span id={helpId} className="truncate text-meta text-fg-3">
          {description}
        </span>
      )}
      {isInvalid && errorMessage && <SaveError id={errorId}>{errorMessage}</SaveError>}
    </div>
  );
}
