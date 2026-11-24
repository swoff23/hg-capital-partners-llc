/**
 * "Share with crew" (docs/specs/contractor-job-emails.md, section 4; Connor,
 * Nov 22, B): what goes in the text a contractor sends their team from their
 * own phone. The job, where (the full address with the unit, so the phone
 * offers directions) and when (their day, else Due), then the link. Notes,
 * the checklist and the lockbox stay behind the link, where they stay
 * current; the code is never in a text, and each view through the link is
 * logged. Pure; see crew-text.test.ts.
 */

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export function crewText(input: {
  title: string;
  /** The full address with the unit, so the phone offers directions. */
  where: string;
  /** "Fri, Nov 20", or null with no date. */
  due: string | null;
  /** Their scheduled day, which leads instead of Due when there is one (docs/specs/contractor-scheduled-date.md). */
  scheduled?: string | null;
  url: string;
}): string {
  const head = [oneLine(input.title), input.where, input.scheduled ? `Scheduled ${input.scheduled}` : input.due ? `Due ${input.due}` : ""].filter(Boolean).join("\n");
  return [head, `Details, photos and updates:\n${input.url}`].filter(Boolean).join("\n\n");
}
