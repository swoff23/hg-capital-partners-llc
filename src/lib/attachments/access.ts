import type { AttachmentKind, TaskStatus, Visibility } from "@prisma/client";
import { isActiveStatus } from "@/lib/task-scope";
import { contractorSeesRow } from "@/lib/tasks/rules";

/**
 * The contractor side of task files, as pure rules. The database half (an
 * unrevoked TaskAccess row, a live portal login) is core.assertContractorAccess;
 * these decide the rest. See access.test.ts.
 */

export interface SeeableFile {
  kind: AttachmentKind;
  visibility: Visibility;
  deletedAt: Date | null;
  uploadedByContactId: string | null;
  asanaGid: string | null;
  audienceContactId: string | null;
}

/**
 * A contractor sees a file only when it's Shared, not removed, has bytes here
 * (not a LINK), and is theirs, imported from Asana, or a staff upload
 * addressed to them or to nobody in particular (tasks/rules.ts
 * contractorSeesRow). The same rule as visibleFile in src/lib/portal/queries.ts.
 */
export function contractorMaySee(att: SeeableFile, contactId: string): boolean {
  if (att.visibility !== "SHARED" || att.deletedAt !== null || att.kind === "LINK") return false;
  return contractorSeesRow(
    { imported: att.asanaGid !== null, actorContactId: att.uploadedByContactId, audienceContactId: att.audienceContactId },
    contactId,
  );
}

/**
 * Uploads still finishing after a contractor taps Mark done are kept for this
 * long (docs/asana-migration-plan.md §5.3), and the job page keeps "Add
 * photo/video" on in Review for the same hour, then hides it (uploads
 * question 4).
 */
export const LATE_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

/**
 * A file queued before Mark done still records with it, even from a phone that
 * only found a signal later (uploads question 4, the on-device outbox). The
 * outbox is a safety net for hours, not an archive, so the grace ends a day
 * after Mark done. It is for a job still in Review, not one HG has since
 * approved, and only for a file queued during this visit: after the last time
 * the job went to In progress. `queuedAt` comes from the phone, so it is not
 * trusted to stretch the hour any further than that.
 */
export const QUEUED_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

/** How far ahead of the server's clock a phone's queuedAt may be before it's ignored (clock skew). */
const QUEUED_AT_SKEW_MS = 5 * 60 * 1000;

/** A queuedAt from the browser as an instant, or null when it isn't a date or is in the future. */
export function parseQueuedAt(queuedAt: Date | string | null | undefined, now: Date): Date | null {
  if (!queuedAt) return null;
  const at = queuedAt instanceof Date ? queuedAt : new Date(queuedAt);
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + QUEUED_AT_SKEW_MS) return null;
  return at;
}

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
 * it): within the last hour, so photos still uploading behind the button
 * aren't lost and "Add photo/video" works while HG reviews. While the job is
 * still in Review, a file that was queued before Mark done (`queuedAt`, from
 * the phone's outbox) and after the job last went to In progress (`startedAt`;
 * with none known there is no lower bound, as the Review card's visit has it)
 * gets a day from Mark done (the late-upload rule). A Done job takes only the
 * hour. Otherwise while the job is active; never once it's Canceled.
 */
export function acceptsContractorUpload(
  task: UploadWindowTask,
  lastReview: LastReview | null,
  contactId: string,
  now: Date,
  queuedAt?: Date | string | null,
  startedAt: Date | null = null,
): boolean {
  if (task.status !== "DONE" && task.status !== "REVIEW") return isActiveStatus(task.status);
  const marked = [
    task.completedByContactId === contactId ? task.completedAt : null,
    lastReview && lastReview.actorContactId === contactId ? lastReview.createdAt : null,
  ].filter((at): at is Date => at !== null);
  if (marked.some((at) => now.getTime() - at.getTime() <= LATE_UPLOAD_WINDOW_MS)) return true;
  // The grace is for Review only: once HG has approved the job, a backdated queuedAt buys nothing past the hour.
  if (task.status !== "REVIEW") return false;
  const queued = parseQueuedAt(queuedAt, now);
  if (!queued) return false;
  // A file queued before this visit started belongs to an earlier one.
  if (startedAt && queued.getTime() < startedAt.getTime()) return false;
  return marked.some((at) => queued.getTime() <= at.getTime() && now.getTime() - at.getTime() <= QUEUED_UPLOAD_GRACE_MS);
}

/**
 * Who may ask for a ZIP of a record's files, by what the files belong to
 * (Download all, uploads 2.5 and 2.6): staff, and only for a task. A
 * contractor never gets one, whatever the job; an unknown kind gets nobody.
 * The route reads this before it looks anything up.
 */
export const ZIP_VIEWERS: Record<string, readonly ("staff" | "contractor")[]> = {
  task: ["staff"],
};

export function mayDownloadZip(kind: string, viewer: "staff" | "contractor"): boolean {
  return Object.hasOwn(ZIP_VIEWERS, kind) && ZIP_VIEWERS[kind].includes(viewer);
}
