"use client";
import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/**
 * A code read character by character: a lockbox, unit, SBL, loan, policy or
 * account number (docs/brand-guidelines.md, section 3). Geist Mono in --fg-2,
 * never colored, never wrapped mid-token. One tap copies it, and a toast
 * names what was copied ("Lockbox code copied"). `mask` shows only the last
 * four ("•• 2502") with a button to reveal the rest; a copy is always the
 * whole code. `size="lg"` is the lockbox code on the job page and in Access.
 * `copyIcon={false}` drops the hover copy icon where a Copy button sits
 * beside the code, so the two don't double up (the job page's lockbox).
 *
 * Needs a ToastProvider above it (AppShell and the portal layout mount one).
 */
export function Code({
  value,
  label,
  mask = false,
  size = "md",
  copyIcon = true,
  className,
}: {
  value: string;
  /** What the code is, for the copy button and the toast: "Lockbox code". */
  label: string;
  mask?: boolean;
  size?: "md" | "lg";
  /** The copy icon that shows on hover; off where a Copy button is beside the code. */
  copyIcon?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const [shown, setShown] = useState(!mask);
  const text = shown ? value : `•• ${value.slice(-4)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast({ message: `${label} copied` });
    } catch {
      toast({ message: `Couldn't copy the ${label.toLowerCase()}` });
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
      <button
        type="button"
        onClick={copy}
        // Names the code itself, not only the action: "Lockbox code 4521, copy".
        aria-label={`${label} ${shown ? value : `ending ${value.slice(-4)}`}, copy`}
        className={cn(
          "group relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm font-mono text-fg-2 transition-colors hover:text-fg-1",
          size === "lg" ? "text-code-l" : "text-code",
          // A 44px hit area on touch without the code growing.
          "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3",
        )}
      >
        {/* Never truncated: a code is read character by character, so the cell gives it room. */}
        <span>{text}</span>
        {copyIcon && (
          <Copy
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:hidden"
          />
        )}
      </button>
      {mask && (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-3 transition-colors hover:bg-fill-1 hover:text-fg-1 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
        >
          {shown ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      )}
    </span>
  );
}
