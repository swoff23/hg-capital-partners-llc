"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Short confirmations with an optional action, usually Undo:
 *
 *   const { toast } = useToast();
 *   toast({ message: "Moved to Friday", action: { label: "Undo", onAction: undo } });
 *
 * One region per surface: AppShell mounts a ToastProvider, and the portal
 * layout mounts its own. Bottom-left on a computer; full width on a phone,
 * lifted above a sticky bottom bar by useToastInset(). Each toast goes after
 * about 5 seconds, held while the pointer or focus is on it. The region is a
 * polite live region (role="status"), so screen readers hear each message.
 */

export type ToastInput = {
  /** One line. */
  message: string;
  action?: { label: string; onAction: () => void };
};

type ToastItem = ToastInput & { id: number };

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

  const toast = useCallback((t: ToastInput) => {
    const id = ++lastId.current;
    setToasts((ts) => [...ts.slice(-(MAX_SHOWN - 1)), { ...t, id }]);
    return id;
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

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
  const { id } = item;

  useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => dismiss(id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [held, dismiss, id]);
  const onDismiss = () => dismiss(id);

  return (
    <div
      onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
      className={cn(
        // The ink pill on the toast tokens, at the Float level. Its edge only shows in dark (--toast-edge).
        "pointer-events-auto flex min-h-10 items-center gap-2 rounded-lg border border-toast-edge bg-toast-bg py-1 pl-3.5 pr-1 text-body text-toast-fg shadow-float",
        "animate-toast-in motion-reduce:animate-none",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action!.onAction();
            onDismiss();
          }}
          className="shrink-0 rounded-md px-2 py-1.5 font-medium text-toast-fg underline decoration-1 underline-offset-3 transition-colors hover:bg-toast-hover focus-visible:outline-toast-fg pointer-coarse:min-h-11"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-toast-fg-2 transition-colors hover:bg-toast-hover hover:text-toast-fg focus-visible:outline-toast-fg pointer-coarse:h-11 pointer-coarse:w-11"
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
