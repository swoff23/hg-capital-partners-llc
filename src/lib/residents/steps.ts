import type { TaskStatus } from "@prisma/client";
import { BRAND } from "@/lib/brand";
import { daysUntil, toYmd, type Ymd } from "@/lib/dates";
import { GROUP_CHAT_LINE, type ResidentStep } from "./emails";

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

/** Done or canceled: closed to the resident, so nothing more posts on it (section 3.5), by the form or by email. */
export function requestClosed(status: TaskStatus): boolean {
  return status === "DONE" || status === "CANCELED";
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

/**
 * A new tenant's form email says "Welcome" (docs/specs/tenant-welcome-email.md, Q3): move-in in the last 30 days or
 * still ahead. No move-in date means they live there now, so not new.
 */
export function newTenant(movesIn: Date | string | null, today: Ymd): boolean {
  const days = daysUntil(movesIn, today);
  return days !== null && days >= -30;
}

/**
 * Why a link stopped working, for the page it opens and the line an action is refused with
 * (docs/specs/tenant-welcome-email.md, Q1): `replaced` when a newer link for the same person and lease was emailed and
 * still works, so the newest email has it; `gone` otherwise (turned off, moved out, or no longer on the lease).
 */
export type LinkEnded = "replaced" | "gone";

export function endedWords(why: LinkEnded): { heading: string; lines: string[] } {
  return why === "replaced"
    ? { heading: "This link was replaced.", lines: [`Use the newest email from ${BRAND.app}.`, GROUP_CHAT_LINE] }
    : { heading: "This link no longer works.", lines: [GROUP_CHAT_LINE] };
}

/**
 * The heading and the page's first line as one line, for an action or an upload the link can't make any more. Cancel
 * shows it as a toast, so it stays under about 90 characters (61 replaced, 64 gone); the page itself keeps every line.
 */
export function endedMessage(why: LinkEnded): string {
  const w = endedWords(why);
  return [w.heading, w.lines[0]].join(" ");
}
