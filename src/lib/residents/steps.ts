import type { TaskStatus } from "@prisma/client";
import { toYmd, type Ymd } from "@/lib/dates";
import type { ResidentStep } from "./emails";

/**
 * The step a task's status shows the resident (docs/specs/maintenance-requests.md,
 * section 3.4). A job with a day stays Scheduled while the contractor works it
 * (In progress) and while it waits on review, until a partner marks it Done; a
 * job never given a day reads Received until then.
 */
export function stepOf(status: TaskStatus, scheduledFor: Date | null): ResidentStep {
  if (status === "DONE") return "done";
  if (status === "CANCELED") return "closed";
  if (status === "SCHEDULED") return "scheduled";
  if ((status === "IN_PROGRESS" || status === "REVIEW") && scheduledFor) return "scheduled";
  return "received";
}

/**
 * A resident may cancel their own request only before anyone has started on it: Open or Waiting (section 3.6). A
 * job a contractor has started or finished is staff's to close.
 */
export function residentMayCancel(status: TaskStatus): boolean {
  return status === "OPEN" || status === "WAITING";
}

/**
 * The link lasts through the move-out day and ends the day after (section 2, defaults). leaseStatus counts the
 * move-out day itself as past, which is right for "who lives here" but a day early for the link.
 */
export function linkLeaseEnded(lease: { movesOut: Date | string | null }, today: Ymd): boolean {
  const out = toYmd(lease.movesOut);
  return !!out && out < today;
}
