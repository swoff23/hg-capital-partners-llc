import type { TaskStatus } from "@prisma/client";
import { firstName } from "@/lib/names";
import { isActiveStatus } from "@/lib/task-scope";
import { addressLine } from "./job-view";

/**
 * The crew's link when its job is gone (docs/specs/emails-redesign.md, Q7). Pure; see gone-job-text.test.ts.
 * Canceled, whatever canceled it (a partner, the resident, or a delete), says
 * "This job is canceled. No need to go."; a contractor taken off a job that goes on says
 * "Zack is no longer on this job. No need to go.". The title and street go under it. A deleted job reads as canceled,
 * from the note deleteTask keeps (gone-crew-jobs.ts).
 */

export const CANCELED_HEADING = "This job is canceled. No need to go.";

export type GoneJobFacts = {
  canceled: boolean;
  /** The contractor whose link it is still holds an unrevoked access row for the job. */
  contractorHasJob: boolean;
  contractorName: string | null;
  title: string;
  address: string | null;
  unitLabel: string | null;
};

export type GoneJob = { heading: string; title: string; street: string | null };

/** The words for a job out of reach, or null while it is still the contractor's (the link opens, or sign-in handles it). */
export function goneJobFor(f: GoneJobFacts): GoneJob | null {
  const street = goneJobStreet(f.address, f.unitLabel);
  if (f.canceled) return { heading: CANCELED_HEADING, title: f.title, street };
  if (f.contractorHasJob) return null;
  const first = f.contractorName ? firstName(f.contractorName) || f.contractorName : null;
  return { heading: `${first ?? "The contractor"} is no longer on this job. No need to go.`, title: f.title, street };
}

/** The short street under the title, "118 Congress St · Rear", or null for a job with no building. */
export function goneJobStreet(address: string | null, unitLabel: string | null): string | null {
  return addressLine(address, unitLabel, { short: true }) || null;
}

/**
 * Whether deleting a job in this status leaves its crew a note: an open job or a canceled one, whose crew may still be
 * on their way. A Done job's link already goes to sign in, and stays that way; a draft never had a crew.
 */
export function deleteLeavesCrewNote(status: TaskStatus): boolean {
  return isActiveStatus(status) || status === "CANCELED";
}

/** A deleted job's words, from its note: canceled, with the title and street it had. */
export function deletedJob(note: { title: string; street: string | null }): GoneJob {
  return { heading: CANCELED_HEADING, title: note.title, street: note.street };
}
