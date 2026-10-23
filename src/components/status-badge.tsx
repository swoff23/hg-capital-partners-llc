import type { TaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/task-scope";
import { cn } from "@/lib/utils";

/**
 * One fixed tone per task status (docs/asana-migration-plan.md §7). No other
 * mark in a task view reuses these: avatars stay neutral, and the overdue
 * date is the only other red. Canceled shares To do's gray, struck through
 * and dimmed so the two never read alike.
 */
export const STATUS_TONE: Record<TaskStatus, "gray" | "blue" | "purple" | "amber" | "red" | "green"> = {
  OPEN: "gray",
  SCHEDULED: "blue",
  IN_PROGRESS: "purple",
  WAITING: "amber",
  REVIEW: "red",
  DONE: "green",
  CANCELED: "gray",
};

/** The status chip for a task: "To do", "Scheduled", … with its fixed tone. */
export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge
      tone={STATUS_TONE[status]}
      className={cn("whitespace-nowrap", status === "CANCELED" && "line-through opacity-70", className)}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}
