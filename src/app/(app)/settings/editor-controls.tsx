import type { ComponentProps } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TOUCH_HEIGHT } from "@/components/ui";
import { cn } from "@/lib/utils";

/*
 * The inline controls the CapEx rules and move-in form editors share, so the
 * two Settings tabs edit the same way (docs/brand-guidelines.md, section 9).
 */

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
