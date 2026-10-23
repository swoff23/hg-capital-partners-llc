"use client";
import {
  Dialog,
  DialogTrigger,
  Popover as AriaPopover,
  type DialogProps,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";

/**
 * Floating panels built on React Aria (D9): positioning that flips at the
 * viewport edge, outside click and Esc close (one layer per Esc), focus moves
 * in and comes back to the trigger. Styled with our tokens; sized to content.
 *
 *   <PopoverTrigger>
 *     <AriaButton>Due</AriaButton>          // a react-aria-components Button
 *     <Popover aria-label="Due date">{({ close }) => …}</Popover>
 *   </PopoverTrigger>
 *
 * On touch screens, pickers open a Sheet (sheet.tsx) instead.
 */

/** Opens its Popover (or Sheet) from the first pressable child. Re-export of React Aria's DialogTrigger. */
export const PopoverTrigger = DialogTrigger;

/**
 * The floating surface, shared by Popover and Menu: the Float level
 * (docs/brand-guidelines.md, section 5). --raised on a --line edge with the
 * ink float shadow; in dark the edge is --line-strong (--line-float).
 */
export const popoverSurface = cn(
  "overflow-auto rounded-lg border border-line-float bg-raised text-fg-1 shadow-float outline-none",
  "data-[placement=bottom]:origin-top data-[placement=top]:origin-bottom",
  "data-entering:animate-pop-in data-exiting:animate-pop-out motion-reduce:animate-none",
);

type SurfaceProps = Omit<AriaPopoverProps, "className"> & { className?: string };

/** A styled React Aria Popover with nothing inside it. For menus and list boxes, which bring their own role. */
export function PopoverSurface({ className, placement = "bottom start", offset = 6, ...props }: SurfaceProps) {
  return <AriaPopover placement={placement} offset={offset} className={cn(popoverSurface, className)} {...props} />;
}

/** A popover holding a dialog: date picks, assignee search, anything that isn't a plain menu. */
export function Popover({
  children,
  className,
  "aria-label": ariaLabel,
  ...props
}: Omit<SurfaceProps, "children"> & { children: DialogProps["children"]; "aria-label": string }) {
  return (
    <PopoverSurface className={className} {...props}>
      <Dialog aria-label={ariaLabel} className="outline-none">
        {children}
      </Dialog>
    </PopoverSurface>
  );
}
