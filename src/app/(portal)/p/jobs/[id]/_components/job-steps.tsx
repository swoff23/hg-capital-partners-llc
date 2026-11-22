import { Check } from "lucide-react";
import type { JobStepView } from "@/lib/portal/job-view";
import { cn } from "@/lib/utils";

/**
 * Where the job is (Connor, Nov 22): Schedule, Start and Approval, from
 * job-view.ts jobSteps, each named for what's next and in the past tense once
 * done (Scheduled, Completed, Approved). Dots joined by a line, the pattern
 * UNIQLO's and Amazon's order steps use (mobbin.com/screens/b9d82708-122d-4794-8ff8-007ef08f9970,
 * mobbin.com/screens/6080910d-e873-41da-89f7-10502a194ab0). No stock stepper
 * exists, so it's a plain list: a done step is a filled `--primary` (ink) dot
 * with a check, the current one an ink ring, one still to come or passed by
 * an empty `--border` ring. Ink only, never gold (brand section 4) and never
 * a status tone, since the status marks keep theirs. Edge to edge (Connor,
 * Nov 22): the first dot and name on the title's left edge, the last on the
 * card's right edge, the ones between centered, the line running dot to dot,
 * so the steps line up with the title and the card. A name wraps to a second
 * line rather than cut off ("Awaiting approval" at 320). The current name is
 * --foreground, the rest muted.
 */
export function JobSteps({ steps }: { steps: JobStepView[] }) {
  const last = steps.length - 1;
  return (
    <ol
      aria-label="Job steps"
      className="grid"
      // The ends take one share and the middles two, so each middle column is centered on its dot and the column
      // edges fall halfway between dots, where the line's two halves meet.
      style={{ gridTemplateColumns: `1fr repeat(${Math.max(0, steps.length - 2)}, 2fr) 1fr` }}
    >
      {steps.map((step, i) => {
        const filled = step.state === "done";
        const inDone = i > 0 && steps[i - 1].state === "done";
        const end = i === 0 ? "start" : i === last ? "end" : "middle";
        return (
          <li
            key={i}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "relative flex min-w-0 flex-col",
              end === "start" && "items-start text-left",
              end === "middle" && "items-center text-center",
              end === "end" && "items-end text-right",
            )}
          >
            {/* The line into this dot, and out of it, each stopping 4px short of the dot. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn("absolute top-2 left-0 h-px", end === "end" ? "right-5" : "right-1/2 mr-3", inDone ? "bg-fg-2" : "bg-border")}
              />
            )}
            {i < last && (
              <span
                aria-hidden="true"
                className={cn("absolute top-2 right-0 h-px", end === "start" ? "left-5" : "left-1/2 ml-3", filled ? "bg-fg-2" : "bg-border")}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative flex size-4 shrink-0 items-center justify-center rounded-full",
                filled && "bg-primary text-primary-foreground",
                step.state === "current" && "border-2 border-foreground",
                (step.state === "next" || step.state === "skipped") && "border-2 border-border",
              )}
            >
              {filled && <Check className="size-3" strokeWidth={3} />}
              {step.state === "current" && <span className="size-1.5 rounded-full bg-foreground" />}
            </span>
            <span className={cn("mt-1.5 block text-meta text-balance", step.state === "current" ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
              {step.state === "done" && <span className="sr-only">, done</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
