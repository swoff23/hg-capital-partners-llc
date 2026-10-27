import { TaskChangedError, type StatusResult } from "./core";

/**
 * What Approve answers: the Done line it wrote (the toast's Undo names it),
 * whether the contractor will hear, and the next repeat's due date, for a
 * tick's "Done. Next due Nov 5".
 */
export type ApprovedResult = { approvedEventId: string | null; emailsContractor: boolean; nextDue: StatusResult["nextDue"] };

/**
 * Runs Approve and shapes its answer. A job that is already Done (the other
 * partner approved it first) is a quiet success with nothing to undo
 * (`approvedEventId` null): what was asked is true. Anything else that went
 * wrong is passed on, including a job that moved to some other status.
 */
export async function approved(run: () => Promise<Pick<StatusResult, "statusEventId" | "emailsContractor" | "nextDue">>): Promise<ApprovedResult> {
  try {
    const { statusEventId, emailsContractor, nextDue } = await run();
    return { approvedEventId: statusEventId, emailsContractor, nextDue };
  } catch (err) {
    if (err instanceof TaskChangedError && err.current === "DONE") return { approvedEventId: null, emailsContractor: false, nextDue: null };
    throw err;
  }
}
