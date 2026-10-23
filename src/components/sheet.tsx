"use client";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  type DialogProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";

/**
 * A modal layer built on React Aria (D9): a bottom sheet on phones (below
 * md) and a centered dialog from md up. Esc closes this one layer, focus is
 * trapped inside and returns to the trigger, and the page behind doesn't
 * scroll. Tapping the dimmed backdrop closes it unless `isDismissable` is off.
 *
 *   <SheetTrigger>
 *     <AriaButton>Due</AriaButton>
 *     <Sheet title="Due date">{({ close }) => …}</Sheet>
 *   </SheetTrigger>
 *
 * Or controlled, with no trigger: <Sheet isOpen={open} onOpenChange={setOpen} title="…">.
 */

/** Opens its Sheet from the first pressable child. Re-export of React Aria's DialogTrigger. */
export const SheetTrigger = DialogTrigger;

export function Sheet({
  title,
  hideTitle = false,
  children,
  isOpen,
  onOpenChange,
  isDismissable = true,
  className,
}: {
  /** The heading, and the dialog's accessible name. */
  title: string;
  /** Keep the title for screen readers only (the content has its own heading). */
  hideTitle?: boolean;
  children: DialogProps["children"];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isDismissable?: boolean;
  className?: string;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-4",
        "data-entering:animate-fade-in data-exiting:animate-fade-out motion-reduce:animate-none",
      )}
    >
      <Modal
        className={cn(
          "flex max-h-[90dvh] w-full flex-col overflow-hidden bg-raised text-foreground shadow-xl outline-none",
          "rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
          "md:max-h-[85dvh] md:w-auto md:min-w-80 md:max-w-lg md:rounded-xl md:border md:border-border md:pb-0",
          "data-entering:animate-sheet-in data-exiting:animate-sheet-out md:data-entering:animate-pop-in md:data-exiting:animate-pop-out motion-reduce:animate-none",
          className,
        )}
      >
        <Dialog className="flex min-h-0 flex-1 flex-col outline-none">
          {(renderProps) => (
            <>
              <SheetHeader title={title} hidden={hideTitle} onClose={renderProps.close} />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {typeof children === "function" ? children(renderProps) : (children as ReactNode)}
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function SheetHeader({ title, hidden, onClose }: { title: string; hidden: boolean; onClose: () => void }) {
  if (hidden) {
    return (
      <Heading slot="title" className="sr-only">
        {title}
      </Heading>
    );
  }
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-1.5 pl-4 pr-1.5">
      <Heading slot="title" className="truncate text-sm font-semibold">
        {title}
      </Heading>
      <AriaButton
        onPress={onClose}
        aria-label="Close"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-fill-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </AriaButton>
    </div>
  );
}
