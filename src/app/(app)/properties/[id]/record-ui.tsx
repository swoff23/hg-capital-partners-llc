import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/* Pieces of the property record's sections (docs/brand-guidelines.md,
   sections 3, 5 and 9). Feature-only; the facts rail's row could become a
   Field variant in components/ui.tsx. */

/** The facts rail: label and value rows on --line dividers. */
export function RailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("divide-y divide-line", className)}>{children}</dl>;
}

/**
 * One rail row: a 112px label column (96 on phones) beside the value, 40px
 * tall with a mouse and 48 on touch. An empty fact is a verb that opens the
 * section's editor ("Add lender"); a derived one with nothing to add is the
 * dash glyph in --fg-3.
 */
export function RailFact({
  label,
  children,
  empty,
  onAdd,
  tone,
}: {
  label: string;
  /** The value; null, undefined or "" reads as empty. */
  children?: ReactNode;
  /** The verb for an empty fact: "Add lender". */
  empty?: string;
  onAdd?: () => void;
  /** warn for a missing key fact (a loan maturity, an insurance renewal). */
  tone?: "warn";
}) {
  const isEmpty = children == null || children === "";
  return (
    <div className="grid min-h-10 grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 py-1.5 sm:grid-cols-[7rem_minmax(0,1fr)] pointer-coarse:min-h-12">
      <dt className="text-meta text-fg-3">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-body text-fg-1">
        {!isEmpty ? (
          children
        ) : empty && onAdd ? (
          <RailVerb onClick={onAdd} tone={tone}>
            {empty}
          </RailVerb>
        ) : (
          <span className="text-fg-3">—</span>
        )}
      </dd>
    </div>
  );
}

/** A verb standing in for a missing value: --fg-2 with a plus, underlined on hover. */
export function RailVerb({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: "warn" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -my-1 inline-flex items-center gap-1 py-1 text-left font-medium underline-offset-3 transition-colors hover:underline",
        tone === "warn" ? "text-warn" : "text-fg-2 hover:text-fg-1",
        // A 44px hit area on touch without the row growing.
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2",
      )}
    >
      <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" />
      {children}
    </button>
  );
}

/**
 * A section heading's count, in --fg-3 at the body weight. The space before
 * it keeps the heading's name "Tasks 29", not "Tasks29" (as in the task
 * page's Checklist heading).
 */
export function Count({ n, className }: { n: number; className?: string }) {
  return (
    <>
      {" "}
      <span className={cn("num ml-1 font-normal text-fg-3", className)}>{n}</span>
    </>
  );
}

/** The inline save error lives in components/ui.tsx now; the property editors import it from here. */
export { SaveError } from "@/components/ui";
