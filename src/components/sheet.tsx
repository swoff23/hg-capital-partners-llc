"use client";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  OverlayTriggerStateContext,
  type DialogProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/components/use-keyboard-inset";
import {
  pushView,
  removeView,
  sheetEscape,
  updateView,
  type SheetViewEntry,
  type SheetViewEscape,
} from "@/components/sheet-views";

/**
 * A modal layer built on React Aria (D9): a bottom sheet on phones (below
 * md) and a centered dialog from md up. Esc closes this one layer, focus is
 * trapped inside and returns to the trigger, and the page behind doesn't
 * scroll. Tapping the dimmed backdrop closes it unless `isDismissable` is off.
 * The Overlay level (docs/brand-guidelines.md, section 5): --raised, the
 * overlay shadow over the scrim, rounded-xl (the top corners on a phone).
 *
 *   <SheetTrigger>
 *     <AriaButton>Due</AriaButton>
 *     <Sheet title="Due date">{({ close }) => …}</Sheet>
 *   </SheetTrigger>
 *
 * Or controlled, with no trigger: <Sheet isOpen={open} onOpenChange={setOpen} title="…">.
 * `footer` pins the primary (and its one-line reason) under the scrolling
 * content, over a --line rule and above the safe area, so a long sheet on a
 * short phone never hides its next step (docs/brand-guidelines.md, section 9).
 *
 * The on-screen keyboard (forms 2.9): while a sheet is open, useKeyboardInset
 * keeps `--kb-inset` current, and the phone sheet and the tablet dialog sit
 * above the keyboard with their height capped to the room left, so the
 * footer rides on it.
 *
 * Views (forms 2.9, selectors 3.5): a picker or a step opened inside a sheet
 * on touch renders as a `SheetView`, which takes the sheet's title, body and
 * footer and puts a back arrow beside the X, never a second sheet. The
 * sheet's own body stays mounted underneath and comes back at the same
 * scroll, with focus on whatever opened the view.
 */

/** Opens its Sheet from the first pressable child. Re-export of React Aria's DialogTrigger. */
export const SheetTrigger = DialogTrigger;

export type SheetProps = {
  /** The heading, and the dialog's accessible name. */
  title: string;
  /** Keep the title for screen readers only (the content has its own heading). */
  hideTitle?: boolean;
  children: DialogProps["children"];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isDismissable?: boolean;
  /** Pinned under the scrolling content: the sheet's primary action. */
  footer?: ReactNode;
  /** The centered dialog's width from md: `md` up to 512px (the default), `lg` up to 672px for the unit and listing sheets. */
  size?: "md" | "lg";
  /** On a phone, the sheet takes its full height even when its content is short: long forms and full-height pickers. */
  fullHeight?: boolean;
  /**
   * Something typed would be lost. A backdrop tap then does nothing, and X
   * and Esc call `onDirtyClose` instead of closing, so the owner can ask
   * first (FormSheet's discard question). Without `onDirtyClose` they close
   * at once: a one-field sheet discards its one value.
   */
  dirty?: boolean;
  onDirtyClose?: () => void;
  /** "public" puts the public site's dark tokens on the overlay (`data-surface="public"`), for sheets opened from a public page. */
  surface?: "app" | "public";
  /**
   * "palette" is the command palette's container (search 2.2). Interim: it
   * renders as a sheet until the search package builds it.
   */
  layout?: "sheet" | "palette";
  className?: string;
};

export function Sheet({
  title,
  hideTitle = false,
  children,
  isOpen,
  onOpenChange,
  isDismissable = true,
  footer,
  size = "md",
  fullHeight = false,
  dirty = false,
  onDirtyClose,
  surface = "app",
  layout = "sheet",
  className,
}: SheetProps) {
  // The palette layout falls back to the sheet until it's built.
  void layout;
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable && !dirty}
      data-surface={surface === "public" ? "public" : undefined}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-scrim md:items-center md:p-4",
        // Above the on-screen keyboard: the phone sheet's bottom edge, and the tablet dialog's room.
        "pb-[var(--kb-inset,0px)] md:pb-[calc(1rem_+_var(--kb-inset,0px))]",
        "data-entering:animate-fade-in data-exiting:animate-fade-out motion-reduce:animate-none",
      )}
    >
      <Modal
        className={cn(
          "flex max-h-[calc(90dvh_-_var(--kb-inset,0px))] w-full flex-col overflow-hidden bg-raised text-fg-1 shadow-overlay outline-none",
          // The safe area, until the keyboard covers it.
          "rounded-t-xl pb-[max(0px,calc(env(safe-area-inset-bottom)_-_var(--kb-inset,0px)))]",
          fullHeight && "max-md:h-[calc(90dvh_-_var(--kb-inset,0px))]",
          "md:max-h-[calc(85dvh_-_var(--kb-inset,0px))] md:w-auto md:min-w-80 md:rounded-xl md:border md:border-line-float md:pb-0",
          size === "lg" ? "md:max-w-2xl" : "md:max-w-lg",
          "data-entering:animate-sheet-in data-exiting:animate-sheet-out md:data-entering:animate-pop-in md:data-exiting:animate-pop-out motion-reduce:animate-none",
          className,
        )}
      >
        <SheetDialog title={title} hideTitle={hideTitle} footer={footer} dirty={dirty} onDirtyClose={onDirtyClose}>
          {children}
        </SheetDialog>
      </Modal>
    </ModalOverlay>
  );
}

/** A view in the stack, with what the sheet needs to show it. */
type ViewHandle = SheetViewEntry & {
  /** The SheetView's own setters: the sheet hands it the elements its body and footer portal into. */
  setBody: (el: HTMLElement | null) => void;
  setFooter: (el: HTMLElement | null) => void;
  back: () => void;
  /** Where focus goes back to when the view leaves. */
  returnFocus: Element | null;
};

type SheetActions = {
  register: (view: Omit<ViewHandle, "returnFocus">) => void;
  unregister: (id: string) => void;
  update: (id: string, patch: Partial<Pick<SheetViewEntry, "title" | "escape" | "hasFooter">>) => void;
  /** Closes the whole sheet. */
  close: () => void;
};

const SheetContext = createContext<SheetActions | null>(null);

/** The sheet this component renders inside, or null outside one. Pickers ask it whether to push a SheetView. */
export function useSheet(): Pick<SheetActions, "close"> | null {
  return useContext(SheetContext);
}

const footerClass = "shrink-0 border-t border-line p-4";
const scrollClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain";

function SheetDialog({
  title,
  hideTitle,
  footer,
  dirty,
  onDirtyClose,
  children,
}: Pick<SheetProps, "title" | "hideTitle" | "footer" | "dirty" | "onDirtyClose" | "children">) {
  useKeyboardInset();
  const state = useContext(OverlayTriggerStateContext);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const [stack, setStack] = useState<ViewHandle[]>([]);
  const top = stack.at(-1);
  const stackRef = useRef(stack);
  useLayoutEffect(() => {
    stackRef.current = stack;
  });
  const baseRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const viewEls = useRef(new Map<string, HTMLElement>());
  const onViewEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) viewEls.current.set(id, el);
    else viewEls.current.delete(id);
  }, []);

  const actions = useMemo<SheetActions>(
    () => ({
      register(view) {
        // Leaving the sheet's own body: remember where it was scrolled.
        if (baseRef.current && !baseRef.current.hidden) savedScroll.current = baseRef.current.scrollTop;
        setStack((s) => pushView(s, { ...view, returnFocus: document.activeElement }));
      },
      unregister(id) {
        // Back to whatever opened the view, once the view under it shows again.
        const el = stackRef.current.find((v) => v.id === id)?.returnFocus;
        if (el instanceof HTMLElement) requestAnimationFrame(() => el.isConnected && el.focus({ preventScroll: true }));
        setStack((s) => removeView(s, id));
      },
      update(id, patch) {
        setStack((s) => updateView(s, id, patch));
      },
      close() {
        stateRef.current?.close();
      },
    }),
    [],
  );

  // The sheet's own body comes back at the scroll it had.
  const showingBase = top === undefined;
  useLayoutEffect(() => {
    if (showingBase && baseRef.current) baseRef.current.scrollTop = savedScroll.current;
  }, [showingBase]);

  // A view that comes to the top takes focus, unless something in it already has it.
  const topId = top?.id;
  useLayoutEffect(() => {
    const el = topId ? viewEls.current.get(topId) : undefined;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [topId]);

  const asks = dirty === true && onDirtyClose !== undefined;
  const requestClose = () => (asks ? onDirtyClose() : actions.close());

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
    // One Esc, one layer: back one view, or close (asking first when dirty).
    e.preventDefault();
    e.stopPropagation();
    const action = sheetEscape(top, asks);
    if (action === "back") top?.back();
    else if (action === "ask") onDirtyClose?.();
    else actions.close();
  }

  return (
    // Esc is caught here, between the Modal and the Dialog: after anything
    // inside that handles its own Esc (a popover, a search field with text),
    // before React Aria's Modal would close the whole sheet.
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <Dialog className="flex min-h-0 flex-1 flex-col outline-none">
        {(renderProps) => (
          <SheetContext value={actions}>
            <SheetHeader
              title={top?.title ?? title}
              hidden={!top && hideTitle === true}
              onClose={requestClose}
              onBack={top?.back}
            />
            <div ref={baseRef} hidden={!showingBase} className={scrollClass}>
              {typeof children === "function" ? children(renderProps) : (children as ReactNode)}
            </div>
            {stack.map((v) => (
              <ViewBody key={v.id} view={v} isTop={v === top} onEl={onViewEl} />
            ))}
            {footer && (
              <div hidden={!showingBase} className={footerClass}>
                {footer}
              </div>
            )}
            {stack.map(
              (v) =>
                v.hasFooter && (
                  <div key={`${v.id}-footer`} ref={v.setFooter} hidden={v !== top} className={footerClass} />
                ),
            )}
          </SheetContext>
        )}
      </Dialog>
    </div>
  );
}

/** The element a view's body portals into. Its ref is stable, so the view's content mounts once. */
function ViewBody({
  view,
  isTop,
  onEl,
}: {
  view: ViewHandle;
  isTop: boolean;
  onEl: (id: string, el: HTMLElement | null) => void;
}) {
  const { id, setBody } = view;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      onEl(id, el);
      setBody(el);
    },
    [id, setBody, onEl],
  );
  return <div ref={ref} hidden={!isTop} tabIndex={-1} className={cn(scrollClass, "outline-none")} />;
}

function SheetHeader({
  title,
  hidden,
  onClose,
  onBack,
}: {
  title: string;
  hidden: boolean;
  onClose: () => void;
  onBack?: () => void;
}) {
  if (hidden) {
    return (
      <Heading slot="title" className="sr-only">
        {title}
      </Heading>
    );
  }
  const iconButton =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1 pointer-coarse:h-11 pointer-coarse:w-11";
  return (
    <div
      className={cn("flex shrink-0 items-center gap-1 border-b border-line py-1.5 pr-1.5", onBack ? "pl-1.5" : "pl-4")}
    >
      {onBack && (
        <AriaButton onPress={onBack} aria-label="Back" className={iconButton}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </AriaButton>
      )}
      <Heading slot="title" className="min-w-0 flex-1 truncate text-section">
        {title}
      </Heading>
      <AriaButton onPress={onClose} aria-label="Close" className={iconButton}>
        <X className="h-4 w-4" aria-hidden="true" />
      </AriaButton>
    </div>
  );
}

/**
 * A view pushed over the sheet it renders inside: while mounted it takes the
 * sheet's title, body and (with `footer`) footer, and the header shows a back
 * arrow beside the X. Unmount it to go back. Its children render where they
 * are in the tree (a portal), so they keep their state and props as usual.
 * Outside a Sheet it renders nothing: check `useSheet()` first.
 *
 *   {open && useSheet() && (
 *     <SheetView title="Assignee" onBack={() => setOpen(false)}>
 *       <OptionList … />
 *     </SheetView>
 *   )}
 */
export function SheetView({
  title,
  onBack,
  escape = "back",
  footer,
  children,
}: {
  /** Replaces the sheet's title while the view shows. */
  title: string;
  /** The back arrow, and Esc on a "back" view: unmount the view here. */
  onBack: () => void;
  /** What Esc does on this view: "back" (the default) or "close" the whole sheet. */
  escape?: SheetViewEscape;
  /** Pinned in place of the sheet's footer while the view shows: Custom repeat's Cancel and Save. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const sheet = useContext(SheetContext);
  const id = useId();
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [foot, setFoot] = useState<HTMLElement | null>(null);
  const hasFooter = footer !== undefined && footer !== null;

  const backRef = useRef(onBack);
  const latest = useRef({ title, escape, hasFooter });
  useLayoutEffect(() => {
    backRef.current = onBack;
    latest.current = { title, escape, hasFooter };
  });

  // Pushed once, on mount; taken out on unmount.
  useLayoutEffect(() => {
    if (!sheet) return;
    sheet.register({ id, ...latest.current, setBody, setFooter: setFoot, back: () => backRef.current() });
    return () => sheet.unregister(id);
  }, [sheet, id]);

  useLayoutEffect(() => {
    sheet?.update(id, { title, escape, hasFooter });
  }, [sheet, id, title, escape, hasFooter]);

  if (!sheet) return null;
  return (
    <>
      {body && createPortal(children, body)}
      {foot && hasFooter && createPortal(footer, foot)}
    </>
  );
}
