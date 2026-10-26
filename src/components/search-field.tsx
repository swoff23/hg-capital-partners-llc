"use client";
import { useState, type Ref } from "react";
import { Search, X } from "lucide-react";
import {
  Button as AriaButton,
  Input as AriaInput,
  SearchField,
  TextField,
  type PressEvent,
  type TextFieldProps,
} from "react-aria-components";
import { Spinner } from "@/components/spinner";
import { chromeIconClass, fieldClass, fieldSizeClass, type FieldSize } from "@/components/ui";
import { cn } from "@/lib/utils";

export type SearchInputProps = {
  /** "field": the field look, for a filter bar on a page. "bare": borderless, for the search row inside a popover or sheet. */
  variant?: "field" | "bare";
  /** The field variant's height with a mouse: `md` 36, `sm` 32. Both are at least 44 on touch. */
  size?: FieldSize;
  /**
   * What Esc does. "clear" (a field on a page, which isn't a layer) empties it;
   * "layer" lets the layer it sits in close in one press, the text going with
   * it. Defaults to "clear" for `field` and "layer" for `bare`.
   */
  escape?: "clear" | "layer";
  /** "Search" plus the one thing it searches: "Search tasks". Also the accessible name unless `aria-label` says otherwise. */
  placeholder?: string;
  "aria-label"?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Enter, or the phone keyboard's Search key. */
  onSubmit?: (value: string) => void;
  /** After the clear button (or Esc in a "clear" field) empties it. */
  onClear?: () => void;
  /** React Aria's key handler: a key stops here unless it calls `e.continuePropagation()`. In a layer, keys go on by default. */
  onKeyDown?: TextFieldProps["onKeyDown"];
  /** Results are loading: after 200ms the magnifier becomes a Spinner, for at least 400ms, so nothing moves. */
  pending?: boolean;
  autoFocus?: boolean;
  isDisabled?: boolean;
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** On the wrapper: widths and margins. */
  className?: string;
};

/**
 * The search field for filter bars and the search row inside pickers
 * (search 2.9): a leading magnifier in --fg-3, the words, and a clear button
 * once there's text. `type="search"` with the Search key on a phone keyboard;
 * the browser's own cancel button is hidden. Built on React Aria, so inside an
 * `Autocomplete` it drives the list under it (arrows move, Enter picks).
 *
 *   <SearchInput placeholder="Search deals" value={q} onChange={setQ} />
 *   <SearchInput variant="bare" placeholder="Search people" />   // inside a picker
 */
export function SearchInput({
  variant = "field",
  size = "md",
  escape = variant === "bare" ? "layer" : "clear",
  placeholder = "Search",
  "aria-label": ariaLabel,
  value,
  defaultValue,
  onChange,
  onSubmit,
  onClear,
  onKeyDown,
  pending = false,
  autoFocus,
  isDisabled,
  name,
  inputRef,
  className,
}: SearchInputProps) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const text = value ?? own;
  const bare = variant === "bare";

  function set(next: string) {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  }
  function clear(e: PressEvent) {
    set("");
    onClear?.();
    // Back to the field, so the keyboard stays up and typing goes on.
    e.target.parentElement?.querySelector("input")?.focus();
  }

  const fieldProps = {
    "aria-label": ariaLabel ?? placeholder,
    value: text,
    onChange: set,
    autoFocus,
    isDisabled,
    name,
    className: cn("relative w-full min-w-0", className),
  };

  const body = (
    <>
      <Spinner
        active={pending}
        className={cn(
          chromeIconClass,
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-3",
          bare ? "left-3" : "left-2.5",
        )}
      >
        <Search
          aria-hidden="true"
          className={cn(
            chromeIconClass,
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-3",
            bare ? "left-3" : "left-2.5",
          )}
        />
      </Spinner>
      <AriaInput
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        className={cn(
          // The browser's own clear button goes; ours sits in the same place on every engine.
          "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
          bare
            ? "h-9 w-full rounded-md bg-transparent pl-9 text-body text-fg-1 outline-none placeholder:text-fg-3 pointer-coarse:h-11 pointer-coarse:pl-10"
            : cn(fieldClass, fieldSizeClass[size], "pl-8 pointer-coarse:pl-9"),
          text ? "pr-8 pointer-coarse:pr-11" : bare ? "pr-3" : undefined,
        )}
      />
      {text && !isDisabled && (
        <AriaButton
          // Ours alone: React Aria's SearchField would otherwise merge its own clear in too.
          slot={null}
          aria-label="Clear search"
          excludeFromTabOrder
          preventFocusOnPress
          onPress={clear}
          className={cn(
            "absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1",
            "pointer-coarse:right-0 pointer-coarse:size-11",
          )}
        >
          <X aria-hidden="true" className="size-3.5" />
        </AriaButton>
      )}
    </>
  );

  // A layer's search never clears on Esc: a plain text field lets the key
  // through, so the popover or sheet closes in one press (selectors 2).
  return escape === "layer" ? (
    <TextField
      {...fieldProps}
      onKeyDown={(e) => {
        // React Aria stops a key once a field handles it; let every key on to
        // the layer (Esc closes it) unless the caller's handler kept it.
        e.continuePropagation();
        onKeyDown?.(e);
        if (e.key === "Enter" && onSubmit) onSubmit(text);
      }}
    >
      {body}
    </TextField>
  ) : (
    <SearchField {...fieldProps} onKeyDown={onKeyDown} onSubmit={onSubmit} onClear={onClear}>
      {body}
    </SearchField>
  );
}
