import { cn } from "@/lib/utils";

export interface Step {
  label: string;
  day: string | null;
  reached: boolean;
  /** Closed's note, under it. */
  note?: string | null;
}

/**
 * Received, Scheduled, Done (docs/specs/maintenance-requests.md, section 3.4;
 * drawing 07 A), like an order tracker: a dot per step, filled once reached,
 * and the hairline down the marker column that the activity timeline draws,
 * solid between reached steps. The day sits at the right of its step.
 */
export function Steps({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("space-y-0", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const nextReached = !last && steps[i + 1].reached;
        return (
          <li key={s.label} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0">
            {!last && <span aria-hidden="true" className={cn("absolute top-4 bottom-0 left-2.5 w-px -translate-x-1/2", nextReached ? "bg-foreground" : "bg-border")} />}
            <span aria-hidden="true" className="flex h-6 items-center justify-center">
              <span className={cn("size-2.5 rounded-full", s.reached ? "bg-foreground" : "border border-muted-foreground")} />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn("text-body", s.reached ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                  <span className="sr-only">{s.reached ? "" : ", not yet"}</span>
                </span>
                {s.day && <span className="num shrink-0 text-meta text-muted-foreground">{s.day}</span>}
              </div>
              {s.note && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-meta text-foreground">{s.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
