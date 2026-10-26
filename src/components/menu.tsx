"use client";
import { createContext, useContext, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Check, ChevronLeft } from "lucide-react";
import {
  Button as AriaButton,
  Dialog,
  Header,
  Keyboard,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger as AriaMenuTrigger,
  RootMenuTriggerStateContext,
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
import { Sheet, SheetView, useSheet } from "@/components/sheet";
import { CheckboxMark, kbdClass } from "@/components/ui";
import { pickContainer } from "@/components/use-coarse-pointer";

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
  content: (step: { back: () => void; close: () => void; container: "popover" | "sheet" }) => ReactNode;
};

export type MenuProps<T extends object> = Omit<AriaMenuProps<T>, "className"> & {
  placement?: PopoverProps["placement"];
  className?: string;
  /**
   * Value menus: the fixed order behind the number keys. The item whose id is
   * `numberKeys[i]` answers to key i + 1 and prints it as a Kbd with a mouse.
   * An item that's hidden (not rendered) keeps its number, so the next one
   * never takes it: 4 is always Next week, and Done stays 6 when Review hides.
   */
  numberKeys?: readonly Key[];
  /**
   * Value menus: on a touch phone the menu opens in a titled Sheet with 44px
   * rows instead of anchoring (React Aria's MenuTrigger only takes a Popover,
   * so the Menu renders itself into our Sheet). ⋯ action menus never take it
   * and stay anchored on every device.
   */
  sheetTitle?: string;
  /**
   * A pick that needs one more answer (Waiting needs a reason, Scheduled a
   * visit date) swaps the layer to that question and commits only when it's
   * answered; return null for picks that commit at once. `onAction` is called
   * for the picks that commit at once. A phone's sheet pushes the question as a
   * view with a back arrow; a mouse's popover swaps its panel and shows a
   * back chevron. Back returns to the list with nothing changed, and Esc
   * closes the whole layer with nothing changed.
   */
  followUp?: (key: Key) => MenuFollowUp | null;
};

/** The ids of the menu's number keys, as strings, for the items to read their own number from. */
const NumberKeysContext = createContext<readonly string[]>([]);

export function Menu<T extends object>({
  placement = "bottom end",
  className,
  numberKeys,
  sheetTitle,
  followUp,
  onAction,
  shouldCloseOnSelect,
  ...props
}: MenuProps<T>) {
  const root = useContext(RootMenuTriggerStateContext);
  const hostSheet = useSheet();
  const open = root?.isOpen ?? false;
  // Where it opens is read when it opens, not at render, so a tap before the
  // page hydrated can't open the desktop popover on a phone (selectors 2).
  const container = useMemo(() => (open ? pickContainer() : "popover"), [open]);
  const asSheet = sheetTitle !== undefined && container === "sheet";

  // The follow-up question on screen, until it's answered or the menu closes.
  const [step, setStep] = useState<{ title: string; content: MenuFollowUp["content"] } | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setStep(null);
  }

  const keys = useMemo(() => (numberKeys ?? []).map(String), [numberKeys]);
  const wrapRef = useRef<HTMLDivElement>(null);

  /** A pick: asks its follow-up in this layer, or commits and closes. */
  function pick(key: Key) {
    const follow = followUp?.(key) ?? null;
    if (follow) {
      setStep({ title: follow.title, content: follow.content });
      return;
    }
    (onAction as ((key: Key) => void) | undefined)?.(key);
    root?.close();
  }

  // A number key picks the item that owns it, if that item is on show and enabled.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!keys.length || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !/^[1-9]$/.test(e.key)) return;
    const id = keys[Number(e.key) - 1];
    if (id === undefined) return;
    const item = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>("[data-key]") ?? []).find((el) => el.dataset.key === id);
    if (!item || item.getAttribute("aria-disabled") === "true") return;
    e.preventDefault();
    e.stopPropagation();
    pick(id);
  }

  const list = (
    <NumberKeysContext value={keys}>
      <div ref={wrapRef} onKeyDown={onKeyDown}>
        <AriaMenu
          className={cn("p-1 outline-none", className)}
          // With a follow-up the menu closes itself only for picks that commit.
          shouldCloseOnSelect={followUp ? false : shouldCloseOnSelect}
          onAction={followUp ? pick : onAction}
          {...props}
        />
      </div>
    </NumberKeysContext>
  );
  const back = () => setStep(null);
  const close = () => root?.close();

  if (asSheet) {
    // The follow-up question is a view with the sheet's back arrow; Esc closes the whole layer.
    const question = step && (
      <SheetView title={step.title} onBack={back} escape="close">
        {step.content({ back, close, container })}
      </SheetView>
    );
    // Inside a sheet already (a status chip in a create sheet), the list is a view in it, never a second sheet.
    if (hostSheet) {
      return open ? (
        <SheetView title={sheetTitle} onBack={close}>
          {list}
          {question}
        </SheetView>
      ) : null;
    }
    return (
      <Sheet title={sheetTitle}>
        {list}
        {question}
      </Sheet>
    );
  }

  return (
    <PopoverSurface placement={placement} motion="none" className="min-w-40">
      {step ? (
        <Dialog aria-label={step.title} className="min-w-64 max-w-80 outline-none">
          <div className="flex items-center gap-1 border-b border-line py-1 pl-1 pr-3">
            <AriaButton
              onPress={back}
              aria-label="Back"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1 pointer-coarse:size-11"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </AriaButton>
            <span className="min-w-0 truncate text-label text-fg-1">{step.title}</span>
          </div>
          {step.content({ back, close, container })}
        </Dialog>
      ) : (
        list
      )}
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
  id,
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
  // The value menu's number key for this item (the Menu's `numberKeys`), printed with a mouse.
  const number = useContext(NumberKeysContext).indexOf(String(id)) + 1;
  const printed = shortcut ?? (number > 0 ? String(number) : undefined);
  return (
    <AriaMenuItem
      id={id}
      aria-keyshortcuts={number > 0 ? String(number) : undefined}
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
        variant === "destructive"
          ? "text-danger data-focused:bg-danger-tint"
          // Focus draws the highlight with a mouse and a keyboard; on touch only a visible (keyboard) focus does, so opening a list doesn't paint its first row.
          : "text-fg-1 data-focused:bg-fill-2 pointer-coarse:data-focused:bg-transparent pointer-coarse:data-focus-visible:bg-fill-2",
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
          {/* A number key is printed for a mouse and kept out of the item's name ("To do", not "To do 1"), as the date picks do. */}
          {printed && (
            <Keyboard aria-hidden={shortcut === undefined ? true : undefined} className={cn(kbdClass, "ml-auto")}>
              {printed}
            </Keyboard>
          )}
          {/* One trailing Check: from the selection, the current page, or the legacy flag. */}
          {(selectionMode === "single" || current !== undefined || checked !== undefined) && (
            <Check
              aria-hidden="true"
              className={cn(
                trailingCheck,
                // A keycap pushes the Check right with a mouse; on touch it's hidden, so the Check goes itself.
                printed ? "pointer-coarse:ml-auto" : "ml-auto",
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
