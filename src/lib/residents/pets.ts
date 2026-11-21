import "server-only";
import { prisma } from "@/lib/db";

/**
 * The job page's pets line beside Access (docs/specs/maintenance-requests.md,
 * section 4.6): "Pets inside: a cat. Keep doors shut." Only when the resident
 * said Yes to pets on the request this job came from. The caller has already
 * checked the contractor may open the job.
 */
export async function jobPetsLine(taskId: string): Promise<string | null> {
  const r = await prisma.residentRequest.findUnique({ where: { taskId }, select: { pets: true, petsNote: true } });
  if (!r?.pets) return null;
  const note = r.petsNote?.trim();
  return note ? `Pets inside: ${note}. Keep doors shut.` : "Pets inside. Keep doors shut.";
}
