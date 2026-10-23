"use client";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuTrigger as AriaMenuTrigger,
  Separator,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  type PopoverProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";
import { PopoverSurface } from "@/components/popover";

/**
 * Action menus on React Aria (D9): arrow keys, typeahead, Esc closes one
 * layer, focus returns to the trigger.
 *
 *   <MenuTrigger>
 *     <AriaButton aria-label="More">…</AriaButton>
 *     <Menu>
 *       <MenuItem onAction={edit}>Edit</MenuItem>
 *       <MenuSeparator />
 *       <MenuItem variant="destructive" onAction={remove}>Delete</MenuItem>
 *     </Menu>
 *   </MenuTrigger>
 */

/** Opens its Menu from the first pressable child. Re-export of React Aria's MenuTrigger. */
export const MenuTrigger = AriaMenuTrigger;

export function Menu<T extends object>({
  placement = "bottom end",
  className,
  ...props
}: Omit<AriaMenuProps<T>, "className"> & { placement?: PopoverProps["placement"]; className?: string }) {
  return (
    <PopoverSurface placement={placement} className="min-w-40">
      <AriaMenu className={cn("p-1 outline-none", className)} {...props} />
    </PopoverSurface>
  );
}

export function MenuItem({
  variant = "default",
  icon,
  checked,
  className,
  children,
  ...props
}: Omit<AriaMenuItemProps, "className" | "children"> & {
  variant?: "default" | "destructive";
  /** A lucide icon element, sized by the item. */
  icon?: ReactNode;
  /**
   * Set on every item of a pick-one menu: the chosen one carries a Check at
   * its trailing edge, so the pick never rests on the highlight fill.
   */
  checked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AriaMenuItem
      textValue={typeof children === "string" ? children : undefined}
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2 whitespace-nowrap rounded-sm px-2 text-body outline-none pointer-coarse:h-11",
        variant === "destructive" ? "text-danger data-focused:bg-danger-tint" : "text-fg-1 data-focused:bg-fill-2",
        "data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={cn("flex shrink-0 [&_svg]:h-4 [&_svg]:w-4", variant === "destructive" ? "text-current" : "text-fg-3")}
        >
          {icon}
        </span>
      )}
      {children}
      {checked !== undefined && (
        <Check aria-hidden="true" className={cn("ml-auto h-4 w-4 shrink-0 text-fg-1", !checked && "invisible")} />
      )}
    </AriaMenuItem>
  );
}

export function MenuSeparator() {
  return <Separator className="-mx-1 my-1 border-t border-line" />;
}
