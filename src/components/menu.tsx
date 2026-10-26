"use client";
import type { ComponentProps, ReactNode } from "react";
import { Check } from "lucide-react";
import {
  Header,
  Keyboard,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger as AriaMenuTrigger,
  Separator,
  Text,
  type Key,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  type MenuSectionProps as AriaMenuSectionProps,
  type PopoverProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";
import { PopoverSurface } from "@/components/popover";
import { CheckboxMark, kbdClass } from "@/components/ui";

/**
 * Action menus and value menus on React Aria (D9): arrow keys, typeahead,
 * Esc closes one layer, focus returns to the trigger (selectors 3.5).
 *
 *   <MenuTrigger>
 *     <AriaButton aria-label="More">…</AriaButton>
 *     <Menu>
 *       <MenuItem onAction={edit} shortcut="E">Edit</MenuItem>
 *       <MenuSeparator />
 *       <MenuItem variant="destructive" onAction={remove}>Delete task</MenuItem>
 *     </Menu>
 *   </MenuTrigger>
 *
 * A value menu sets one value from a short fixed list: give the Menu
 * `selectionMode="single"` and `selectedKeys`, and the picked item carries a
 * Check at its trailing edge and is a `menuitemradio` with `aria-checked`,
 * so screen readers hear the current value. `selectionMode="multiple"` puts a
 * checkbox at each item's leading edge instead. A navigation menu marks its
 * page with `current` on the item, never with selection.
 */

/** Opens its Menu from the first pressable child. Re-export of React Aria's MenuTrigger. */
export const MenuTrigger = AriaMenuTrigger;

/** A value menu's follow-up question, asked in the same layer before the pick commits (selectors 3.5, item 6). */
export type MenuFollowUp = {
  /** The step's title: the sheet's title on a phone, the panel's heading with a mouse. */
  title: string;
  /**
   * The question. `back` returns to the list with nothing changed; the caller
   * commits the pick and its answer together, then calls `close`.
   */
  content: (step: { back: () => void; close: () => void }) => ReactNode;
};

export type MenuProps<T extends object> = Omit<AriaMenuProps<T>, "className"> & {
  placement?: PopoverProps["placement"];
  className?: string;
  /**
   * Value menus: the fixed order behind the number keys. The item whose id is
   * `numberKeys[i]` answers to key i + 1 and prints it as a Kbd with a mouse.
   * An item that's hidden keeps its number, so the next one never takes it
   * (4 is always Next week). Interim: accepted, not wired yet.
   */
  numberKeys?: readonly Key[];
  /**
   * Value menus: on a phone the menu opens in a Sheet with this title and 44px
   * rows instead of anchoring. ⋯ action menus never take it and stay anchored
   * on every device. Interim: the menu stays anchored.
   */
  sheetTitle?: string;
  /**
   * A pick that needs one more answer (Waiting needs a reason, Scheduled a
   * visit date) swaps the panel to that question in the same layer, never a
   * second sheet; return null for picks that commit at once. Interim:
   * ignored, so every pick commits at once as it did.
   */
  followUp?: (key: Key) => MenuFollowUp | null;
};

export function Menu<T extends object>({
  placement = "bottom end",
  className,
  numberKeys,
  sheetTitle,
  followUp,
  ...props
}: MenuProps<T>) {
  // Typed now so callers can pass them; the selectors package wires them up.
  void numberKeys;
  void sheetTitle;
  void followUp;
  return (
    <PopoverSurface placement={placement} className="min-w-40">
      <AriaMenu className={cn("p-1 outline-none", className)} {...props} />
    </PopoverSurface>
  );
}

const trailingCheck = "h-4 w-4 shrink-0 text-fg-1";

export function MenuItem({
  variant = "default",
  icon,
  checked,
  current,
  shortcut,
  description,
  className,
  children,
  ...props
}: Omit<AriaMenuItemProps, "className" | "children"> & {
  variant?: "default" | "destructive";
  /** A lucide icon element or a StatusMark, sized by the item. */
  icon?: ReactNode;
  /**
   * Draws a trailing Check without exposing a state. Kept for the menus
   * that still use it; a value menu sets `selectionMode` and `selectedKeys`
   * on the Menu instead, and a navigation menu uses `current`.
   */
  checked?: boolean;
  /**
   * A navigation menu's item for the page you're on: it stays a link, with
   * `aria-current="page"`, and draws the same trailing Check. Give every item
   * of such a menu `current`, true on one.
   */
  current?: boolean;
  /** A printed shortcut ("⌘C"), React Aria's Keyboard slot drawn as a Kbd. Hidden on touch. */
  shortcut?: string;
  /** One line of text-meta --fg-3 under the label; the row grows to 44 (56 on touch). */
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AriaMenuItem
      textValue={typeof children === "string" ? children : undefined}
      render={
        current === undefined
          ? undefined
          : (domProps) =>
              "href" in domProps ? (
                <a {...domProps} aria-current={current ? "page" : undefined} />
              ) : (
                <div {...(domProps as ComponentProps<"div">)} aria-current={current ? "page" : undefined} />
              )
      }
      className={cn(
        "flex cursor-default select-none items-center gap-2 whitespace-nowrap rounded-sm px-2 text-body outline-none",
        description ? "min-h-11 py-1.5 pointer-coarse:min-h-14" : "h-8 pointer-coarse:h-11",
        variant === "destructive" ? "text-danger data-focused:bg-danger-tint" : "text-fg-1 data-focused:bg-fill-2",
        "data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {({ isSelected, selectionMode }) => (
        <>
          {selectionMode === "multiple" && <CheckboxMark checked={isSelected} />}
          {icon && (
            <span
              aria-hidden="true"
              className={cn(
                "flex shrink-0 [&_svg]:h-4 [&_svg]:w-4",
                variant === "destructive" ? "text-current" : "text-fg-3",
              )}
            >
              {icon}
            </span>
          )}
          {description ? (
            <span className="flex min-w-0 flex-1 flex-col">
              <Text slot="label" className="truncate">
                {children}
              </Text>
              <Text slot="description" className="truncate text-meta text-fg-3">
                {description}
              </Text>
            </span>
          ) : (
            children
          )}
          {shortcut && <Keyboard className={cn(kbdClass, "ml-auto")}>{shortcut}</Keyboard>}
          {/* One trailing Check: from the selection, the current page, or the legacy flag. */}
          {(selectionMode === "single" || current !== undefined || checked !== undefined) && (
            <Check
              aria-hidden="true"
              className={cn(
                trailingCheck,
                !shortcut && "ml-auto",
                !(selectionMode === "single" ? isSelected : (current ?? checked)) && "invisible",
              )}
            />
          )}
        </>
      )}
    </AriaMenuItem>
  );
}

/** A group of items under a header in text-meta 500 --fg-3 ("Theme"). The header names the group for screen readers. */
export function MenuSection<T extends object>({
  title,
  children,
  className,
  ...props
}: Omit<AriaMenuSectionProps<T>, "className" | "children"> & {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AriaMenuSection className={className} {...props}>
      {title && <Header className="px-2 pb-1 pt-1.5 text-meta font-medium text-fg-3">{title}</Header>}
      {children}
    </AriaMenuSection>
  );
}

/**
 * The menu's non-interactive header: who or what it's about, in two
 * text-meta lines, the label in --fg-1 over a detail in --fg-3 ("Pieter",
 * then the email; a comment's author, then its stamp). Each line truncates,
 * so the menu never grows past the screen. First in a Menu, or first in a
 * MenuSection, whose group it then names.
 */
export function MenuHeader({ title, detail }: { title: ReactNode; detail?: ReactNode }) {
  return (
    <Header role="presentation" className="flex max-w-[calc(100vw_-_2rem)] flex-col px-2 pb-1.5 pt-1 text-meta">
      <span className="truncate text-fg-1">{title}</span>
      {detail && <span className="truncate text-fg-3">{detail}</span>}
    </Header>
  );
}

export function MenuSeparator() {
  return <Separator className="-mx-1 my-1 border-t border-line" />;
}
