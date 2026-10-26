"use client";
import { useRef, type ComponentProps } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TOUCH_HEIGHT } from "@/components/ui";
import { cn } from "@/lib/utils";

/*
 * The controls the CapEx rules and move-in form editors share, so the two
 * Settings tabs edit the same way (docs/brand-guidelines.md, section 9): a
 * row's fields are bordered `sm` fields (forms 4.1, the quiet-field recipes
 * are retired), and a row's delete stays out of sight until it's wanted.
 */

/** On each row whose delete is RevealRemoveButton: the group it shows under. */
export const revealRow = "group/row";

/**
 * "Add item" in a section's heading: a standalone action known by its Plus,
 * in ink, underlined on hover. 44px tall on touch. (The CapEx rules end
 * their lists on an AddRow instead.)
 */
export function AddButton({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-meta font-medium text-fg-1 underline-offset-3 not-disabled:hover:underline disabled:cursor-not-allowed disabled:opacity-50",
        TOUCH_HEIGHT,
        className,
      )}
      {...props}
    >
      <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * A row's delete that stays hidden until it's wanted: under the pointer with
 * a mouse (only this row's, through the row's `revealRow` group) and while
 * focus is anywhere in the row, so a keyboard tabbing through it or a tap
 * into one of its fields on touch shows it. Touch is tap to reveal, never a
 * trash on every row: the hidden button still takes taps (opacity keeps its
 * 44px slot), so a tap on it while nothing in the row has focus only reveals
 * it, and a stray tap at a row's end can't delete anything. A keyboard's
 * click always deletes, since it can only reach a shown button.
 */
export function RevealRemoveButton({
  onRemove,
  className,
  ...props
}: Omit<ComponentProps<"button">, "onClick" | "onPointerDown"> & { onRemove: () => void }) {
  // Read at pointerdown, before the press moves focus.
  const revealOnly = useRef(false);
  return (
    <RemoveButton
      onPointerDown={(e) => {
        const row = e.currentTarget.closest("[data-reveal-row]");
        revealOnly.current = e.pointerType !== "mouse" && !row?.matches(":focus-within");
      }}
      onClick={(e) => {
        const reveal = revealOnly.current && e.detail > 0;
        revealOnly.current = false;
        if (reveal) e.currentTarget.focus();
        else onRemove();
      }}
      className={cn(
        "opacity-0 transition-[opacity,color] group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

/** A row's delete: an idle --fg-3 trash that turns --danger under a mouse. 44px square on touch. Give it an aria-label. */
export function RemoveButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-3 transition-colors not-disabled:hover:text-danger disabled:opacity-50 pointer-coarse:size-11",
        className,
      )}
      {...props}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
