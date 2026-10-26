import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/* The facts rail of a record page (docs/brand-guidelines.md, sections 3, 5
   and 9): the property, the deal, the contractor and the task page's rows of
   a label and a value. It moved here from properties/[id]/record-ui.tsx when
   deals, tasks and contractors began using it too (forms 2.8). */

/** The facts rail: label and value rows on --line dividers. */
export function RailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("divide-y divide-line", className)}>{children}</dl>;
}

/**
 * The line under a rail row's value, which runs the whole row from the
 * label's edge so it never wraps (forms 2.0): a helper, an error, a conflict.
 * Put it inside the value cell of a `RailFact`; the negative margin and the
 * extra width reach back across the label column and the gap, both read from
 * the row's `--rail-label`.
 */
export const railLineClass = "-ml-[calc(var(--rail-label)+0.75rem)] w-[calc(100%+var(--rail-label)+0.75rem)] max-w-none";

/**
 * One rail row: a 112px label column (96 on phones) beside the value, 40px
 * tall with a mouse and 48 on touch. The child is usually an `InlineField`,
 * which edits the value in place; the row keeps its height when the field
 * opens, and grows only for one line under it. An empty fact with no field
 * is a verb that opens the section's editor ("Add lender"); a derived one
 * with nothing to add is the dash glyph in --fg-3.
 */
export function RailFact({
  label,
  children,
  empty,
  onAdd,
  tone,
  id,
  className,
}: {
  /** An anchor for the row, so a link elsewhere can point at it ("#value"). */
  id?: string;
  /** The row's name; a phone-short form can ride beside the long one ("Insurance" and, from sm, " (COI)"). */
  label: ReactNode;
  /** The value; null, undefined or "" reads as empty. */
  children?: ReactNode;
  /** The verb for an empty fact: "Add lender". */
  empty?: string;
  onAdd?: () => void;
  /** warn for a missing key fact (a loan maturity, an insurance renewal). */
  tone?: "warn";
  className?: string;
}) {
  const isEmpty = children == null || children === "";
  return (
    <div
      id={id}
      className={cn(
        "grid min-h-10 grid-cols-[var(--rail-label)_minmax(0,1fr)] items-start gap-x-3 py-1 [--rail-label:6rem] sm:[--rail-label:7rem] pointer-coarse:min-h-12 pointer-coarse:py-0.5",
        className,
      )}
    >
      <dt className="flex min-h-8 items-center text-meta text-fg-3 pointer-coarse:min-h-11">
        {/* One inline box, so a label with a part that drops on a phone ("Insurance (COI)") keeps its space. */}
        <span>{label}</span>
      </dt>
      <dd className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 text-body text-fg-1 pointer-coarse:min-h-11">
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

/** What a verb button looks like: --fg-2 with a plus, underlined on hover; --warn for a missing key fact. */
export const railVerbClass = (tone?: "warn") =>
  cn(
    "relative -my-1 inline-flex items-center gap-1 py-1 text-left font-medium underline-offset-3 transition-colors hover:underline",
    tone === "warn" ? "text-warn" : "text-fg-2 hover:text-fg-1",
    // A 44px hit area on touch without the row growing.
    "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2",
  );

/** A verb standing in for a missing value: --fg-2 with a plus, underlined on hover. */
export function RailVerb({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: "warn" }) {
  return (
    <button type="button" onClick={onClick} className={railVerbClass(tone)}>
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

/** The inline save error lives in components/ui.tsx; the record pages import it from here too. */
export { SaveError } from "@/components/ui";
