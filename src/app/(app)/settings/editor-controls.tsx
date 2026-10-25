"use client";
import { useRef, type ComponentProps } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TOUCH_HEIGHT } from "@/components/ui";
import { cn } from "@/lib/utils";

/*
 * The inline controls the CapEx rules and move-in form editors share, so the
 * two Settings tabs edit the same way (docs/brand-guidelines.md, section 9).
 * A row's first field sits on the page gutter: the list around the rows
 * takes `editorBleed`, so the fields' 7px inset (6px padding and a 1px edge)
 * and the hover fill reach into the gutter while the text lines up with the
 * h1, the section headings and the controls above.
 */

/** On the list around an editor's rows (and its header row): pulls them out by the field inset. */
export const editorBleed = "-mx-1.75";

/** On each row whose delete is RevealRemoveButton: the group it shows under. */
export const revealRow = "group/row";

/**
 * A field that reads as plain text in its row: hover shows its control edge
 * with a mouse, and focus is the field's --act edge and inset ring. 44px
 * tall on touch.
 */
export const quietField = cn(
  "w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-body text-fg-1 outline-none placeholder:text-fg-3",
  "hover:border-line-control focus:border-act focus:bg-surface focus:ring-1 focus:ring-inset focus:ring-act",
  TOUCH_HEIGHT,
);

/**
 * "Add item" in a section's heading: a standalone action known by its Plus,
 * in ink, underlined on hover. 44px tall on touch. `tight` drops the Plus
 * below sm, for two adds sharing a heading: at 320 the pair would otherwise
 * squeeze the title narrower than its longest word.
 */
export function AddButton({
  className,
  children,
  tight = false,
  ...props
}: ComponentProps<"button"> & { tight?: boolean }) {
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
      <Plus className={cn("h-4 w-4 shrink-0", tight && "max-sm:hidden")} aria-hidden="true" />
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
