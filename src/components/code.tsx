"use client";
import { Copy } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/**
 * A code read character by character: a lockbox, unit, SBL, loan, policy or
 * account number (docs/brand-guidelines.md, section 3). Geist Mono in --fg-2,
 * never colored, never wrapped mid-token. One tap copies it, and a toast
 * names what was copied ("Lockbox code copied"). Always shown in full: a
 * utility account number once hid behind a reveal button, and Connor wants
 * them in sight (Nov 14). `size="lg"` is the lockbox code on the job page and in Access.
 * `copyIcon={false}` drops the hover copy icon where copying isn't the job
 * (the job page's lockbox, typed into the box by hand).
 * `wrap` lets a long code break onto more lines inside its column instead
 * of running past it: imported lockbox codes are free text ("4857 (back
 * door)"), and a large one is about 13 characters wide at 375.
 *
 * Needs a ToastProvider above it (AppShell and the portal layout mount one).
 */
export function Code({
  value,
  label,
  size = "md",
  copyIcon = true,
  wrap = false,
  className,
}: {
  value: string;
  /** What the code is, for the copy button and the toast: "Lockbox code". */
  label: string;
  size?: "md" | "lg";
  /** The copy icon that shows on hover; off where copying isn't the job (the job page's lockbox). */
  copyIcon?: boolean;
  /** Wrap a long code inside its column (the job page's lockbox) rather than keep it on one line. */
  wrap?: boolean;
  className?: string;
}) {
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast({ message: `${label} copied` });
    } catch {
      toast({ message: `Couldn't copy the ${label.toLowerCase()}` });
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1 align-middle", wrap && "max-w-full", className)}>
      <button
        type="button"
        onClick={copy}
        // Names the code itself, not only the action: "Lockbox code 4521, copy".
        aria-label={`${label} ${value}, copy`}
        className={cn(
          "group relative inline-flex items-center gap-1.5 rounded-sm font-mono text-fg-2 transition-colors hover:text-foreground",
          wrap ? "min-w-0 whitespace-normal text-left" : "shrink-0 whitespace-nowrap",
          size === "lg" ? "text-code-l" : "text-code",
          // A 44px hit area on touch without the code growing.
          "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3",
        )}
      >
        {/* Never truncated: a code is read character by character, so the cell gives it room. A wrapping
            code breaks at its spaces, and inside a token only when that token alone is wider than the column. */}
        <span className={cn(wrap && "min-w-0 [overflow-wrap:anywhere]")}>{value}</span>
        {copyIcon && (
          <Copy
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:hidden"
          />
        )}
      </button>
    </span>
  );
}
