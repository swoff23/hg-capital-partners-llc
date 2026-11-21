/**
 * "Text to my crew" (docs/specs/contractor-job-emails.md, section 4, Connor's
 * full version): what goes in the text a contractor sends their team from
 * their own phone. Pure; see crew-text.test.ts. The lockbox code is never in
 * it: the link shows it, and each view is logged.
 */

/** The longest the notes run in a text before an ellipsis. */
export const CREW_NOTES_MAX = 300;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export function crewText(input: {
  title: string;
  /** The full address with the unit, so the phone offers directions. */
  where: string;
  /** "Fri, Nov 20", or null with no date. */
  due: string | null;
  /** Their scheduled day, which leads instead of Due when there is one (docs/specs/contractor-scheduled-date.md). */
  scheduled?: string | null;
  /** The notes, codes already masked. */
  notes: string | null;
  /** The checklist's items not done yet. */
  todo: readonly string[];
  /** The job has a lockbox code for the link to show. */
  hasAccess: boolean;
  url: string;
}): string {
  const notes = input.notes ? oneLine(input.notes) : "";
  const cut = notes.length > CREW_NOTES_MAX ? `${notes.slice(0, CREW_NOTES_MAX - 1).replace(/\s+\S*$/, "")}…` : notes;
  const head = [oneLine(input.title), input.where, input.scheduled ? `Scheduled ${input.scheduled}` : input.due ? `Due ${input.due}` : ""].filter(Boolean).join("\n");
  const todo = input.todo.map(oneLine).filter(Boolean);
  return [
    head,
    cut,
    todo.length ? `To do: ${todo.join(", ")}` : "",
    `${input.hasAccess ? "Lockbox, photos, updates:" : "Photos and updates:"}\n${input.url}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
