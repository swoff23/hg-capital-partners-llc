"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ComboBox, Input as AriaInput, ListBox, ListBoxItem, type Key } from "react-aria-components";
import { OptionRow } from "@/components/option-list";
import { PopoverSurface } from "@/components/popover";
import { FormField, TextLink, fieldClass, fieldSizeClass, type FieldSize } from "@/components/ui";
import { SUGGEST_FROM, type AddressAnswer, type AddressKind, type AddressMatch } from "@/lib/address-suggestions";
import { cn } from "@/lib/utils";

/** Wait this long after the last keystroke before asking (forms 2.6). */
const DEBOUNCE_MS = 200;

/** The last row's key carries the text it keeps, so React Aria sees a new row for new text. */
const AS_TYPED = "__as-typed__:";

const KIND_WORD: Record<AddressKind, string> = { property: "Property", deal: "Deal" };

export type AddressComboboxProps = {
  /** What the address belongs to: which records count as "already" one (a property, or a deal and then a property). */
  kind: AddressKind;
  /** The typed text. */
  value: string;
  /** Every keystroke, and a picked suggestion's full address. */
  onChange: (value: string) => void;
  /** The visible label, "Address". Without it, give `aria-label`. */
  label?: string;
  "aria-label"?: string;
  /** Posts the text in a form under this name. The field itself has no name, so Chrome doesn't offer a personal address. */
  name?: string;
  /** One helper line under the field when nothing else needs it. */
  helper?: ReactNode;
  /** The record being renamed, so it isn't its own duplicate. */
  excludeId?: string;
  /**
   * The save was refused (forms 2.6): the field turns invalid, and the
   * duplicate line, when there is one, turns `--danger`. `errorMessage`
   * replaces the line with another reason.
   */
  isInvalid?: boolean;
  errorMessage?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  autoFocus?: boolean;
  size?: FieldSize;
  /** "public" puts the dark public tokens on the list. */
  surface?: "app" | "public";
  className?: string;
};

/**
 * An address field that suggests HG's own properties and deals as you type
 * (forms 2.6, phase 1). From 3 characters, 200ms after the last keystroke, it
 * asks /api/addresses: up to six two-line rows, the street over "Buffalo, NY
 * 14209 · Property", then always 'Use "12 Elm St" as typed', so an address no
 * list knows still works. Typing is never blocked: the text is the value.
 *
 * When the text is already a record (`sameStreetAddress`), the helper line
 * says so: "767 Prospect Ave is already a property. Open it", neutral while
 * typing, `--danger` once a save was refused (`isInvalid`). For a deal, an
 * existing deal is checked first, then a property HG owns.
 *
 *   <AddressCombobox kind="deal" label="Address" name="address" value={address} onChange={setAddress} />
 *
 * `autoComplete="off"` and no field name, so Chrome stops offering a
 * personal address. Still to come with the forms build, props unchanged:
 * the pasted-link line ("That's a link. Paste it in Listing link."), the
 * "Saves as 767 Prospect Ave, Buffalo, NY 14209" preview on leaving the
 * field, and the touch one-field sheet for a heading. Phase 2 (an address
 * provider) waits for Connor's pick and key.
 */
export function AddressCombobox({
  kind,
  value,
  onChange,
  label,
  "aria-label": ariaLabel,
  name,
  helper,
  excludeId,
  isInvalid = false,
  errorMessage,
  isRequired = false,
  isDisabled = false,
  autoFocus,
  size = "md",
  surface = "app",
  className,
}: AddressComboboxProps) {
  const typed = value.trim();
  const active = typed.length >= SUGGEST_FROM;

  // The last answer and the text it was for. Its rows stay up while the next one loads.
  const [answer, setAnswer] = useState<{ q: string; data: AddressAnswer } | null>(null);
  const [picked, setPicked] = useState<Key | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: typed, kind });
      if (excludeId) params.set("exclude", excludeId);
      fetch(`/api/addresses?${params}`, { signal: controller.signal, headers: { accept: "application/json" } })
        .then((res) => (res.ok ? (res.json() as Promise<AddressAnswer>) : null))
        .then((data) => {
          if (data) setAnswer({ q: typed, data });
        })
        // No signal or a refusal: no suggestions, and the typing carries on.
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, typed, kind, excludeId]);

  const suggestions = active ? (answer?.data.suggestions ?? []) : [];
  const match: AddressMatch | null = active && answer?.q === typed ? answer.data.match : null;

  const matchLine = match && (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className="truncate">
        {match.street} is already a {match.kind}.
      </span>
      <TextLink href={match.href} className="shrink-0">
        Open it
      </TextLink>
    </span>
  );
  const error = errorMessage ? errorMessage : isInvalid ? matchLine : null;

  function pick(key: Key | null) {
    setPicked(key);
    if (key === null) return;
    const id = String(key);
    if (id.startsWith(AS_TYPED)) return;
    const row = suggestions.find((s) => `${s.kind}:${s.id}` === id);
    if (row && row.address !== value) onChange(row.address);
  }

  return (
    <FormField
      label={label ?? ariaLabel ?? "Address"}
      hideLabel={!label}
      required={isRequired}
      helper={matchLine || helper}
      error={error}
      className={className}
    >
      {(control) => (
        <>
          <ComboBox
            inputValue={value}
            onInputChange={(text) => {
              setPicked(null);
              onChange(text);
            }}
            selectedKey={picked}
            onSelectionChange={pick}
            allowsCustomValue
            menuTrigger="input"
            // The server already matched every word; nothing more to filter here.
            defaultFilter={() => true}
            isDisabled={isDisabled}
            isInvalid={isInvalid || !!errorMessage}
            aria-label={label ?? ariaLabel ?? "Address"}
            className="relative"
          >
            <AriaInput
              id={control.id}
              aria-describedby={control["aria-describedby"]}
              aria-required={control["aria-required"]}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={autoFocus}
              className={cn(fieldClass, fieldSizeClass[size])}
            />
            <PopoverSurface surface={surface} motion="none" className="w-(--trigger-width)">
              <ListBox
                aria-label={`${label ?? ariaLabel ?? "Address"} suggestions`}
                shouldFocusOnHover
                className="max-h-80 overflow-y-auto p-1 outline-none pointer-coarse:max-h-[60dvh]"
              >
                {active && [
                  ...suggestions.map((s) => (
                    <OptionRow
                      key={`${s.kind}:${s.id}`}
                      option={{
                        id: `${s.kind}:${s.id}`,
                        label: s.street,
                        description: s.place ? `${s.place} · ${KIND_WORD[s.kind]}` : KIND_WORD[s.kind],
                      }}
                    />
                  )),
                  <ListBoxItem
                    // A new key per text: React Aria won't let a mounted item's id change.
                    key={AS_TYPED + typed}
                    id={AS_TYPED + typed}
                    textValue={value}
                    className={cn(
                      "flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 py-1 text-body outline-none pointer-coarse:min-h-11",
                      "data-focused:bg-fill-2 pointer-coarse:data-focused:bg-transparent pointer-coarse:data-focus-visible:bg-fill-2 pointer-coarse:data-pressed:bg-fill-2",
                    )}
                  >
                    <span className="truncate">Use &ldquo;{typed}&rdquo; as typed</span>
                  </ListBoxItem>,
                ]}
              </ListBox>
            </PopoverSurface>
          </ComboBox>
          {name && <input type="hidden" name={name} value={value} />}
        </>
      )}
    </FormField>
  );
}
