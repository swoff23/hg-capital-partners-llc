"use client";
import type { ReactNode } from "react";
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
  className,
  children,
  ...props
}: Omit<AriaMenuItemProps, "className" | "children"> & {
  variant?: "default" | "destructive";
  /** A lucide icon element, sized by the item. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AriaMenuItem
      textValue={typeof children === "string" ? children : undefined}
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2 whitespace-nowrap rounded-md px-2 text-sm outline-none pointer-coarse:h-11",
        "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
        variant === "destructive"
          ? "text-red-600 data-focused:bg-red-500/10 dark:text-red-400 [&_svg]:text-current"
          : "text-foreground data-focused:bg-background [&_svg]:text-muted",
        "data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </AriaMenuItem>
  );
}

export function MenuSeparator() {
  return <Separator className="-mx-1 my-1 border-t border-border" />;
}
