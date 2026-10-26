"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ComboBox, Input as AriaInput, ListBox, ListBoxItem, type Key } from "react-aria-components";
import { OptionRow } from "@/components/option-list";
import { PopoverSurface } from "@/components/popover";
import { FormField, TextLink, fieldClass, fieldSizeClass, type FieldSize } from "@/components/ui";
import {
  SUGGEST_FROM,
  looksLikeLink,
  savesAs,
  type AddressAnswer,
  type AddressKind,
  type AddressMatch,
} from "@/lib/address-suggestions";
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
  /**
   * False keeps the list under the field however little room there is, so
   * it never jumps above to cover the sheet's title: a heading's one-field
   * sheet, which is made tall enough to hold the field and its list.
   */
  flip?: boolean;
  /**
   * Where a pasted link belongs ("Listing link"). Without `onLink` the line
   * says to paste it there; with it, that the link moved there.
   */
  linkTarget?: string;
  /**
   * A pasted link (DEALS-039, DEALS-040; a link typed a letter at a time isn't
   * one) is handed here instead of becoming the address, and the form moves
   * it to its own field. Set the address in the same call if the link says
   * what it is (`addressFromListingLink`); otherwise the field keeps its text.
   */
  onLink?: (link: string) => void;
  /**
   * On leaving the field, a line says what the address will save as ("Saves
   * as 767 Prospect Ave, Buffalo, NY 14209") when that differs from the
   * typing. Only for a form whose save really stores `tidyAddress`, so the
   * line never promises more than the save does.
   */
  showSavesAs?: boolean;
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
 * personal address. A pasted link says so ("That's a link. Paste it in
 * Listing link.") or, with `onLink`, moves to the form's link field. With
 * `showSavesAs`, leaving the field shows "Saves as 767 Prospect Ave, Buffalo,
 * NY 14209" when the save would tidy the typing (`tidyAddress`). A heading's
 * one-field sheet on touch is the heading field's (it holds this combobox,
 * and the list opens under it like any popover in a sheet). Phase 2 (an
 * address provider) waits for Connor's pick and key.
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
  flip = true,
  linkTarget,
  onLink,
  showSavesAs = false,
  className,
}: AddressComboboxProps) {
  const typed = value.trim();
  const isLink = looksLikeLink(typed);
  // A link is no address: nothing to suggest for it.
  const active = typed.length >= SUGGEST_FROM && !isLink;

  // The last answer and the text it was for. Its rows stay up while the next one loads.
  const [answer, setAnswer] = useState<{ q: string; data: AddressAnswer } | null>(null);
  const [picked, setPicked] = useState<Key | null>(null);
  // The field was left with this text in it, so "Saves as" may say what the save will tidy it to.
  const [left, setLeft] = useState(false);
  // A pasted link was handed to `onLink`, so the line says where it went.
  const [moved, setMoved] = useState(false);

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
  const where = linkTarget ?? "Listing link";
  const linkLine = moved
    ? `That's a link. Moved to ${where}.`
    : isLink
      ? linkTarget
        ? `That's a link. Paste it in ${linkTarget}.`
        : "That's a link. Enter the street address."
      : null;
  const tidy = showSavesAs && left && !isLink ? savesAs(value) : null;
  // A refused duplicate says which record, with its link; any other refusal says its own reason.
  const error = isInvalid && matchLine ? matchLine : errorMessage ? errorMessage : null;

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
      helper={matchLine || linkLine || (tidy ? `Saves as ${tidy}` : null) || helper}
      error={error}
      className={className}
    >
      {(control) => (
        <>
          <ComboBox
            inputValue={value}
            onInputChange={(text) => {
              setPicked(null);
              setLeft(false);
              setMoved(false);
              onChange(text);
            }}
            selectedKey={picked}
            onSelectionChange={pick}
            allowsCustomValue
            // The list starts empty (nothing under 3 characters), so React Aria reads "no rows" on the keystroke
            // that would open it and never does; open on the keystroke, and keep the panel out of sight until it has rows.
            allowsEmptyCollection
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
              onBlur={() => setLeft(true)}
              onPaste={(e) => {
                // A pasted link (not one typed a letter at a time) goes to the form's own link field.
                const pasted = e.clipboardData.getData("text");
                if (!onLink || !looksLikeLink(pasted)) return;
                e.preventDefault();
                setMoved(true);
                onLink(pasted.trim());
              }}
              className={cn(fieldClass, fieldSizeClass[size])}
            />
            <PopoverSurface surface={surface} motion="none" shouldFlip={flip} className={cn("w-(--trigger-width)", !active && "hidden")}>
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
