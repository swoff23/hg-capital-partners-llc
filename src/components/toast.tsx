"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { addToast, type QueuedToast } from "@/components/toast-queue";

/**
 * Short confirmations with an optional action, usually Undo:
 *
 *   const { toast } = useToast();
 *   toast({ message: "Moved to Friday", action: { label: "Undo", onAction: undo } });
 *
 * One region per surface: AppShell mounts a ToastProvider, and the portal
 * layout mounts its own. Bottom-left on a computer; full width on a phone,
 * lifted above a sticky bottom bar by useToastInset(). Each toast goes after
 * about 5 seconds, held while the pointer or focus is on it; Esc closes the
 * one that has focus. On a coarse pointer a toast with an action draws no ×
 * (it closes itself, and the message gets the room), but keeps the Dismiss
 * button for assistive tech. The region is a polite live region
 * (role="status"), so screen readers hear each message.
 *
 * `detail` is the ripple clause after " · " in --toast-fg-2 ("CapEx rules
 * saved · Forecasts updated"). `key` names what the toast is about: a toast
 * with the key of one still showing replaces it instead of stacking, so ten
 * quick edits on one record show one toast for the latest (forms 2.13).
 *
 * `sticky` is for a toast that waits for the person (the update notice,
 * components/update-notice.tsx): no timer, newer toasts never push it out,
 * and its × is drawn on touch too, since it never closes by itself. With an
 * action, the icon, message and action are one button, so a press anywhere
 * on the pill acts.
 */

export type ToastInput = {
  /** One line. */
  message: string;
  /**
   * The line under 375px, when `message` won't fit there. TOAST_PHONE_CHARS counts on no icon and no drawn ×;
   * a sticky toast with an icon has both, which leaves about 124px at 320 ("Update ready", not "A new version is
   * ready"). Shorten the words, not the font (docs/copy-rules.md).
   */
  phoneMessage?: string;
  /** The ripple clause, after " · " in --toast-fg-2: "Forecasts updated". */
  detail?: string;
  /** What it's about ("task:abc:due"): a new toast with a live toast's key replaces it. */
  key?: string;
  /**
   * The toast's one next step. A plain toast closes once it runs. A sticky one stays (the step may ask first, as
   * Reload does under unsaved work), and `onAction` returns true when the page is going away, which spins the icon.
   */
  action?: { label: string; onAction: () => boolean | void | Promise<void> };
  /** A lucide icon before the message, in --toast-fg-2: 16px at 1.5 with a mouse, 20px at 1.75 on touch. */
  icon?: LucideIcon;
  /** Waits for the person: no timer, never pushed out by newer toasts, × drawn on touch, the whole pill its action. */
  sticky?: boolean;
  /** Runs when the person closes it with × or Esc. Not when its action runs or its time runs out. */
  onDismiss?: () => void;
};

type ToastItem = QueuedToast<ToastInput>;

type ToastApi = {
  /** Shows a toast and returns its id. */
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<(ToastApi & { setInset: (px: number) => void }) | null>(null);

const DURATION_MS = 5000;
const MAX_SHOWN = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [inset, setInset] = useState(0);
  const lastId = useRef(0);

  // The list lives in a ref as well, so toast() knows at once which toast a
  // key replaced and hands back the id that's on screen.
  const listRef = useRef<ToastItem[]>([]);
  const commit = useCallback((next: ToastItem[]) => {
    listRef.current = next;
    setToasts(next);
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const res = addToast(listRef.current, t, ++lastId.current, MAX_SHOWN);
      commit(res.list);
      return res.id;
    },
    [commit],
  );
  const dismiss = useCallback((id: number) => commit(listRef.current.filter((t) => t.id !== id)), [commit]);

  return (
    <ToastContext value={{ toast, dismiss, setInset }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 z-[70] flex flex-col items-stretch gap-2 sm:right-auto sm:w-max sm:max-w-sm"
        style={{ bottom: `calc(1rem + env(safe-area-inset-bottom) + ${inset}px)` }}
      >
        {toasts.map((t) => (
          <Toast key={t.id} item={t} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

function Toast({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const [held, setHeld] = useState(false);
  // A sticky toast's action is leaving the page (a reload): the icon spins until it goes.
  const [leaving, setLeaving] = useState(false);
  const { id, version, sticky, action } = item;

  // A replacement (a new version under the same key) starts the 5 seconds over. A sticky toast has no timer.
  useEffect(() => {
    if (held || sticky) return;
    const timer = setTimeout(() => dismiss(id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [held, sticky, dismiss, id, version]);
  // The person closing it, with × or Esc.
  const onClose = () => {
    dismiss(id);
    item.onDismiss?.();
  };
  const act = () => {
    if (!action) return;
    const goingAway = action.onAction();
    if (sticky) setLeaving(goingAway === true);
    else dismiss(id);
  };

  const Icon = item.icon;
  const icon = Icon && (
    <Icon
      aria-hidden="true"
      strokeWidth={1.5}
      className={cn(
        "size-4 shrink-0 text-toast-fg-2 pointer-coarse:size-5 pointer-coarse:stroke-[1.75]",
        leaving && "animate-spin motion-reduce:animate-none",
      )}
    />
  );
  const message = (
    <span className="min-w-0 flex-1 truncate">
      {item.phoneMessage ? (
        <>
          <span className="max-[374px]:hidden">{item.message}</span>
          <span className="hidden max-[374px]:inline">{item.phoneMessage}</span>
        </>
      ) : (
        item.message
      )}
      {item.detail && <span className="text-toast-fg-2"> · {item.detail}</span>}
    </span>
  );
  const actionLabelClass = "shrink-0 font-medium text-toast-fg underline decoration-1 underline-offset-3";
  // The whole pill is the action: icon, message and label in one button, the × beside it.
  const wholePill = sticky && action;

  return (
    <div
      onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
      // Focus holds a toast open, so Esc closes it from any of its buttons, with or without a drawn ×.
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      className={cn(
        // The ink pill on the toast tokens, at the Float level. Its edge only shows in dark (--toast-edge).
        // relative: a hidden Dismiss is absolute and stays inside the pill.
        "pointer-events-auto relative flex min-h-10 items-center gap-2 rounded-lg border border-toast-edge bg-toast-bg py-1 pr-1 text-body text-toast-fg shadow-float",
        // A whole-pill button carries the left padding itself, so a press on the pill's edge still acts.
        wholePill ? "pl-1 gap-1" : "pl-3.5",
        "animate-toast-in motion-reduce:animate-none",
      )}
    >
      {wholePill ? (
        <button
          type="button"
          onClick={act}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-left transition-colors hover:bg-toast-hover focus-visible:outline-toast-fg pointer-coarse:min-h-11"
        >
          {icon}
          {message}
          <span className={actionLabelClass}>{action.label}</span>
        </button>
      ) : (
        <>
          {icon}
          {message}
          {action && (
            <button
              type="button"
              onClick={act}
              className={cn(
                actionLabelClass,
                "rounded-md px-2 py-1.5 transition-colors hover:bg-toast-hover focus-visible:outline-toast-fg pointer-coarse:min-h-11",
              )}
            >
              {action.label}
            </button>
          )}
        </>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-toast-fg-2 transition-colors hover:bg-toast-hover hover:text-toast-fg focus-visible:outline-toast-fg pointer-coarse:h-11 pointer-coarse:w-11",
          // On touch (tablets too) a toast with an action closes itself, so its × gives the message the room.
          // It stays a real button for VoiceOver and Switch Control, and is drawn again while it has keyboard focus.
          // A sticky toast never closes itself, so its × stays drawn.
          action && !sticky && "pointer-coarse:not-focus-visible:sr-only",
        )}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The toast() and dismiss() of the nearest ToastProvider. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast needs a ToastProvider above it (AppShell or the portal layout).");
  return { toast: ctx.toast, dismiss: ctx.dismiss };
}

/**
 * Lifts toasts above a sticky bottom bar while the calling component is
 * mounted. Pass the bar's height in pixels.
 */
export function useToastInset(px: number) {
  const setInset = useContext(ToastContext)?.setInset;
  useEffect(() => {
    if (!setInset) return;
    setInset(px);
    return () => setInset(0);
  }, [setInset, px]);
}
