import { cn } from "@/lib/utils";

/**
 * A deal field edited in place, in a list cell or the deal page's details:
 * it reads as its value at rest, shows the --line-control edge on hover (a
 * mouse only; touch has no hover, so a tap opens it), and takes the field's
 * focus look while editing: --surface, an --act edge and a 1px inset --act
 * ring, as Input does (docs/brand-guidelines.md, section 9). 44px on touch.
 * The caller adds the height: h-7 in a 40px list row, h-8 in a details row.
 */
export const inlineFieldClass = cn(
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-body text-fg-1 outline-none transition-colors",
  "placeholder:text-fg-3 hover:border-line-control",
  "focus:border-act focus:bg-surface focus:ring-1 focus:ring-inset focus:ring-act",
  "disabled:opacity-50 pointer-coarse:min-h-11",
);

/** A number field without the browser's spinner, which would cover a right-aligned figure. */
export const noSpinnerClass =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
