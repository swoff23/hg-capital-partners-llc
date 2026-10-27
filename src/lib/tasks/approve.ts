import { TaskChangedError, type StatusResult } from "./core";

/** What Approve answers: the Done line it wrote (the toast's Undo names it), and whether the contractor will hear. */
export type ApprovedResult = { approvedEventId: string | null; emailsContractor: boolean };

/**
 * Runs Approve and shapes its answer. A job that is already Done (the other
 * partner approved it first) is a quiet success with nothing to undo
 * (`approvedEventId` null): what was asked is true. Anything else that went
 * wrong is passed on, including a job that moved to some other status.
 */
export async function approved(run: () => Promise<Pick<StatusResult, "statusEventId" | "emailsContractor">>): Promise<ApprovedResult> {
  try {
    const { statusEventId, emailsContractor } = await run();
    return { approvedEventId: statusEventId, emailsContractor };
  } catch (err) {
    if (err instanceof TaskChangedError && err.current === "DONE") return { approvedEventId: null, emailsContractor: false };
    throw err;
  }
}
