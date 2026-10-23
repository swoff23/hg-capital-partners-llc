import type { AttachmentKind, TaskStatus, Visibility } from "@prisma/client";
import { isActiveStatus } from "@/lib/task-scope";

/**
 * The contractor side of task files, as pure rules. The database half (an
 * unrevoked TaskAccess row, a live portal login) is core.assertContractorAccess;
 * these decide the rest. See access.test.ts.
 */

/** A contractor sees a file only when it's Shared, not removed, and has bytes here (not a LINK). */
export function contractorMaySee(att: { kind: AttachmentKind; visibility: Visibility; deletedAt: Date | null }): boolean {
  return att.visibility === "SHARED" && att.deletedAt === null && att.kind !== "LINK";
}

/**
 * Uploads still finishing after a contractor taps Mark done are kept for this
 * long (docs/asana-migration-plan.md §5.3).
 */
export const LATE_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

export interface UploadWindowTask {
  status: TaskStatus;
  completedByContactId: string | null;
  completedAt: Date | null;
}

/** The newest STATUS event that moved the task to Review, if any. */
export interface LastReview {
  actorContactId: string | null;
  createdAt: Date;
}

/**
 * May this contractor's upload be recorded on the task now? On a Done or
 * Review job only when this contractor finished it (Mark done, or completed
 * it) within the last hour, so photos still uploading behind the button
 * aren't lost. Otherwise while the job is active; never once it's Canceled.
 */
export function acceptsContractorUpload(task: UploadWindowTask, lastReview: LastReview | null, contactId: string, now: Date): boolean {
  if (task.status !== "DONE" && task.status !== "REVIEW") return isActiveStatus(task.status);
  const recent = (at: Date | null) => !!at && now.getTime() - at.getTime() <= LATE_UPLOAD_WINDOW_MS;
  if (task.completedByContactId === contactId && recent(task.completedAt)) return true;
  return !!lastReview && lastReview.actorContactId === contactId && recent(lastReview.createdAt);
}
