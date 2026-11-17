import { CalendarClock, CircleAlert } from "lucide-react";
import { Notice } from "@/components/source-line";
import type { Gap } from "@/lib/missing/checks";

/**
 * A record's required blanks in one line (docs/specs/missing-info.md, D2), for
 * a page whose sections sit right under it (a lease, a contractor): "2 missing:
 * Signed lease PDF, Primary tenant's phone". Nothing when nothing is missing.
 */
export function MissingSummary({ gaps, className }: { gaps: readonly Gap[]; className?: string }) {
  if (gaps.length === 0) return null;
  const names = gaps.map((g, i) => (i === 0 ? g.label : g.label.charAt(0).toLowerCase() + g.label.slice(1)));
  return (
    <Notice className={className} icon={<CircleAlert aria-hidden="true" strokeWidth={2} className="mt-px size-3.5 shrink-0 text-warn pointer-coarse:size-4" />}>
      {gaps.length} missing: {names.join(", ")}
    </Notice>
  );
}

/** A lease end in its notice window (D5): "Lease ends Mar 31 · Notice by Jan 30", Late in --destructive once the deadline has passed. */
export function LeaseEndNotice({ ends, notice, late, className }: { ends: string; notice: string; late: boolean; className?: string }) {
  return (
    <Notice
      className={className}
      icon={<CalendarClock aria-hidden="true" strokeWidth={2} className={late ? "mt-px size-3.5 shrink-0 text-destructive" : "mt-px size-3.5 shrink-0 text-warn"} />}
    >
      {ends} · <span className={late ? "text-destructive" : undefined}>{notice}</span>
    </Notice>
  );
}
