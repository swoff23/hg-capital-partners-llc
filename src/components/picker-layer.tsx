"use client";
import { cloneElement, isValidElement, useMemo, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { DialogTrigger } from "react-aria-components";
import { Popover, type PopoverMotion } from "@/components/popover";
import { Sheet, SheetView, useSheet } from "@/components/sheet";
import { pickContainer, type PickContainer } from "@/components/use-coarse-pointer";
import type { PopoverProps } from "react-aria-components";

/**
 * A closed trigger opens on Down or Up, as well as Enter and Space (selectors 2,
 * Keyboard). Spread it on a button that opens a layer without a `trigger`
 * (a field's calendar button); `PickerLayer` adds it to its own trigger.
 */
export function openOnArrow(open: () => void) {
  return (e: KeyboardEvent) => {
    if (e.isDefaultPrevented() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    open();
  };
}

/**
 * The layer every picker opens (selectors 2 and 4.2 A): an anchored popover
 * with a mouse and on a touch tablet, a titled bottom sheet on a touch phone,
 * and, when the picker already sits inside a sheet, a view in that sheet with
 * a back arrow instead of a second sheet (forms 2.9). The trigger and the
 * layer share one DialogTrigger, so the popover anchors to the trigger and
 * Esc, outside taps and focus return behave as for every other layer.
 *
 *   <PickerLayer isOpen={open} onOpenChange={setOpen} title="Assignee" trigger={<AriaButton>…</AriaButton>}>
 *     {({ container, close }) => <OptionList container={container} … />}
 *   </PickerLayer>
 *
 * The container is chosen when the layer opens (`pickContainer()`), never at
 * render, so a tap before hydration can't open the desktop popover on a phone.
 */
export function PickerLayer({
  isOpen,
  onOpenChange,
  trigger,
  title,
  anchorRef,
  surface = "app",
  placement = "bottom start",
  motion = "none",
  popoverClassName,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * A react-aria-components `Button` (or other pressable): what opens the layer.
   * Leave it out when something else opens it (a field with two ways in) and
   * give `anchorRef` the element the popover points at.
   */
  trigger?: ReactNode;
  /** With no `trigger`: the element an anchored popover sits under. */
  anchorRef?: RefObject<Element | null>;
  /** The sheet's title on a phone and the popover's accessible name: the field's name. */
  title: string;
  /** "public" puts the dark public tokens on the layer (the public move-in form). */
  surface?: "app" | "public";
  placement?: PopoverProps["placement"];
  /** Lists appear at once ("none", the default); a panel holding more than a list pops in ("pop"). */
  motion?: PopoverMotion;
  popoverClassName?: string;
  children: (layer: { container: PickContainer; close: () => void }) => ReactNode;
}) {
  const sheet = useSheet();
  const container = useMemo<PickContainer>(() => (isOpen ? pickContainer() : "popover"), [isOpen]);
  const close = () => onOpenChange(false);

  let layer: ReactNode;
  if (container === "sheet") {
    layer = sheet ? (
      isOpen ? (
        <SheetView title={title} onBack={close}>
          {children({ container, close })}
        </SheetView>
      ) : null
    ) : (
      <Sheet title={title} surface={surface} isOpen={trigger ? undefined : isOpen} onOpenChange={trigger ? undefined : onOpenChange}>
        {children({ container, close })}
      </Sheet>
    );
  } else {
    layer = (
      <Popover
        aria-label={title}
        placement={placement}
        motion={motion}
        surface={surface}
        className={popoverClassName}
        {...(trigger ? {} : { triggerRef: anchorRef, isOpen, onOpenChange })}
      >
        {children({ container, close })}
      </Popover>
    );
  }

  // With no trigger of its own the layer is controlled: nothing presses it open but the caller.
  if (!trigger) return layer;
  // Down and Up open it from the closed trigger. A handler the trigger already has runs first and may keep the key.
  const arrow = openOnArrow(() => onOpenChange(true));
  const armed = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<{ onKeyDown?: (e: KeyboardEvent) => void }>, {
        onKeyDown: (e: KeyboardEvent) => {
          (trigger.props as { onKeyDown?: (e: KeyboardEvent) => void }).onKeyDown?.(e);
          if (!isOpen) arrow(e);
        },
      })
    : trigger;
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {armed}
      {layer}
    </DialogTrigger>
  );
}
