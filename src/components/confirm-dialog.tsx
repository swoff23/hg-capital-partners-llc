"use client";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/ui";

/**
 * A small modal confirmation (docs/brand-guidelines.md, section 9, Dialogs),
 * on the same React Aria pieces as sheet.tsx: it portals to <body>, Esc and a
 * click on the backdrop close it, focus stays inside while it's open and
 * goes back to what opened it after, and the page behind doesn't scroll.
 * Render it while it should show; `onClose` is every way out.
 *
 * The title names the object; `body` is one sentence of consequence. The
 * dialog draws the Cancel button itself (`cancelLabel`: "Keep it", "Keep
 * editing"). `actions` holds
 * the rest, the primary last: a destructive confirm is a `destructive`
 * Button that names what goes ("Delete task"). Below sm the actions stack
 * full width with the primary on top, however many there are, as Apple's
 * alerts do when labels don't fit side by side, so no label wraps at 320.
 * `busy` holds it open, Cancel disabled, while the action runs. With two
 * actions after Cancel (Keep data, Delete synced data) it's 448px wide, not
 * 384, so the three sit on one row from sm.
 */
export function ConfirmDialog({
  title,
  body,
  actions,
  onClose,
  cancelLabel = "Cancel",
  busy = false,
}: {
  title: string;
  /** Optional when the title already says it all. */
  body?: ReactNode;
  /** The buttons after Cancel, the primary last. */
  actions: ReactNode;
  onClose: () => void;
  cancelLabel?: string;
  busy?: boolean;
}) {
  const several =
    isValidElement<{ children?: ReactNode }>(actions) && actions.type === Fragment && Children.count(actions.props.children) > 1;
  return (
    <ModalOverlay
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 data-entering:animate-fade-in motion-reduce:animate-none"
    >
      <Modal className={`w-full ${several ? "max-w-md" : "max-w-sm"} rounded-xl border border-line-float bg-popover p-5 text-foreground shadow-overlay outline-none data-entering:animate-pop-in motion-reduce:animate-none`}>
        <Dialog role="alertdialog" className="outline-none">
          {/* A name with no spaces in it (a 100-character unit name) breaks inside the dialog instead of running past its edge. */}
          <Heading slot="title" className="text-balance text-section text-foreground [overflow-wrap:anywhere]">
            {title}
          </Heading>
          {body && <div className="mt-1 text-body text-fg-2 [overflow-wrap:anywhere]">{body}</div>}
          <div className="mt-4 flex items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
            <Button size="sm" variant="secondary" disabled={busy} onClick={onClose} aria-keyshortcuts="Escape">
              {cancelLabel}
            </Button>
            {actions}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
