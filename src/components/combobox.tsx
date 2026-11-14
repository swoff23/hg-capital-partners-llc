"use client";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button as AriaButton, ComboBox, Input as AriaInput, ListBox, ListBoxItem, useFilter, type Key } from "react-aria-components";
import { addRowLabel, matchesAllWords, OptionRow, type OptionItem } from "@/components/option-list";
import { PopoverSurface } from "@/components/popover";
import { SaveError, fieldClass, fieldSizeClass, type FieldSize } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Type a value that may not be in the list (docs/specs/selectors.md 3.4).
 * A fixed list is a `Select`; this is for find-or-add (a building system's
 * name, an entity). Several picks at once are a `TagsField` (tags-field.tsx).
 *
 *   <Combobox aria-label="System name" items={["Boiler", "Furnace"]} value={name} onChange={setName} allowCustom />
 *
 * A field with a chevron that opens the full list and a clear X once there's
 * text. Typing opens and filters (every word must match, in any order);
 * arrows move while the caret stays put, and Enter picks. With `allowCustom` the
 * last row reads 'Add "Boiler"'. Esc closes the list; a second Esc in the
 * closed field puts back the last saved value. `onChange` is the commit: a
 * pick, Enter, or leaving the field, never each keystroke; without
 * `allowCustom` leaving the field puts the saved value back. The list opens
 * under the field, also inside a sheet's scrolling body.
 */

type Common = {
  label?: string;
  "aria-label"?: string;
  description?: ReactNode;
  /** The suggestions: strings, or rows with a subline. */
  items: readonly (string | OptionItem)[];
  /** The typed text may be a value that isn't in the list: an 'Add "…"' row, and typed text kept on leaving. */
  allowCustom?: boolean;
  placeholder?: string;
  size?: FieldSize;
  isInvalid?: boolean;
  errorMessage?: string;
  isDisabled?: boolean;
  /** Posts the value under this name. */
  name?: string;
  /** "public" puts the dark public tokens on the list. */
  surface?: "app" | "public";
  className?: string;
};

export type ComboboxProps = Common & { value: string; onChange: (value: string) => void };

/**
 * The 'Add "…"' row's key carries what it adds, so choosing it for new text is a new
 * selection to React Aria (the same key twice is no change, and nothing would commit).
 */
const ADD = "__add__:";
const isAdd = (key: Key) => String(key).startsWith(ADD);

const toItem = (i: string | OptionItem): OptionItem => (typeof i === "string" ? { id: i, label: i } : i);

export function Combobox(props: ComboboxProps) {
  return <SingleCombobox {...props} />;
}

/* ---------------- Shared field ---------------- */

const fieldFrame = (size: FieldSize, extra?: string) =>
  cn(
    fieldClass,
    fieldSizeClass[size],
    // Room for the clear X and the chevron.
    "pr-14 pointer-coarse:pr-[5.5rem]",
    extra,
  );

const iconButton =
  "flex size-7 items-center justify-center rounded-sm text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1 pointer-coarse:size-11";

function Shell({
  label,
  labelId,
  inputId,
  description,
  helpId,
  invalid,
  errorMessage,
  errorId,
  className,
  children,
}: {
  label?: string;
  labelId: string;
  inputId: string;
  description?: ReactNode;
  helpId: string;
  invalid?: boolean;
  errorMessage?: string;
  errorId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <label id={labelId} htmlFor={inputId} className="text-meta font-medium text-fg-2">
          {label}
        </label>
      )}
      {children}
      {description && !invalid && (
        <span id={helpId} className="truncate text-meta text-fg-3">
          {description}
        </span>
      )}
      {invalid && errorMessage && <SaveError id={errorId}>{errorMessage}</SaveError>}
    </div>
  );
}

/* ---------------- One value ---------------- */

function SingleCombobox({
  label,
  "aria-label": ariaLabel,
  description,
  items,
  allowCustom = false,
  placeholder,
  size = "md",
  isInvalid,
  errorMessage,
  isDisabled,
  name,
  surface = "app",
  className,
  value,
  onChange,
}: Common & { value: string; onChange: (value: string) => void }) {
  const { contains } = useFilter({ sensitivity: "base" });
  const rows = items.map(toItem);
  const ids = useId();
  const inputId = `${ids}-input`;

  // The typed text is a draft; `value` is what was saved.
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  const typed = draft.trim();
  const exact = rows.some((r) => r.label.toLowerCase() === typed.toLowerCase());

  function commit(next: string) {
    const text = next.trim();
    // Without free text, leaving the field with something that isn't a row puts the saved value back.
    const kept = allowCustom ? text : (rows.find((r) => r.label.toLowerCase() === text.toLowerCase())?.label ?? value);
    setDraft(kept);
    if (kept !== value) onChange(kept);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.currentTarget.getAttribute("aria-activedescendant")) {
      // No row highlighted: Enter keeps what was typed.
      if (allowCustom) commit(draft);
    }
    if (e.key === "Escape" && e.currentTarget.getAttribute("aria-expanded") !== "true") {
      // The list is already closed: this Esc puts the saved value back. Last, after React Aria's own.
      const saved = value;
      setTimeout(() => setDraft(saved), 0);
    }
  }

  return (
    <Shell
      label={label}
      labelId={`${ids}-label`}
      inputId={inputId}
      description={description}
      helpId={`${ids}-help`}
      invalid={isInvalid}
      errorMessage={errorMessage}
      errorId={`${ids}-error`}
      className={className}
    >
      <ComboBox
        allowsCustomValue={allowCustom}
        allowsEmptyCollection
        inputValue={draft}
        onInputChange={setDraft}
        onSelectionChange={(key) => {
          if (key === null) return;
          commit(isAdd(key) ? draft : (rows.find((r) => r.id === key)?.label ?? draft));
        }}
        defaultFilter={(text, input) => matchesAllWords(text, input, contains)}
        isDisabled={isDisabled}
        isInvalid={isInvalid}
        name={name}
        formValue="text"
        aria-label={label ? undefined : ariaLabel}
        className="group relative"
      >
        <AriaInput
          id={inputId}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          className={fieldFrame(size)}
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          {draft && !isDisabled && (
            <AriaButton
              // Ours alone: the ComboBox's own button is the chevron.
              slot={null}
              aria-label="Clear"
              excludeFromTabOrder
              preventFocusOnPress
              onPress={() => {
                setDraft("");
                if (allowCustom) commit("");
              }}
              className={iconButton}
            >
              <X aria-hidden="true" className="size-3.5" />
            </AriaButton>
          )}
          <AriaButton aria-label="Show all" className={iconButton}>
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </AriaButton>
        </div>
        <PopoverSurface
          surface={surface}
          motion="none"
          className="min-w-(--trigger-width) max-w-80"
        >
          <ListBox
            aria-label={label ?? ariaLabel ?? "Suggestions"}
            shouldFocusOnHover
            renderEmptyState={() => <p className="px-2 py-3 text-body text-fg-3">No match.</p>}
            className="max-h-80 overflow-y-auto p-1 outline-none pointer-coarse:max-h-[60dvh]"
          >
            {rows.map((o) => (
              <OptionRow key={o.id} option={o} />
            ))}
            {allowCustom && typed && !exact && (
              <ListBoxItem
                // A new key per text: React Aria won't let a mounted item's id change.
                key={ADD + typed}
                id={ADD + typed}
                textValue={draft}
                className="flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 py-1 text-body outline-none data-focused:bg-fill-2 pointer-coarse:min-h-11"
              >
                <span className="truncate">{addRowLabel(typed)}</span>
              </ListBoxItem>
            )}
          </ListBox>
        </PopoverSurface>
      </ComboBox>
    </Shell>
  );
}
