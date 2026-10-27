import { prisma } from "@/lib/db";
import { ActivityItem, ActivityTimeline, type ActivityMarker } from "@/components/activity-timeline";
import { Button, Section, Textarea } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { parseNoteAuthor } from "@/lib/deals/note-author";
import { cn, fmtDateTime } from "@/lib/utils";
import { noteDay } from "../format";
import { addDealNote } from "./note-actions";

/**
 * A deal's Activity: its notes and recorded changes, newest first, with the
 * note box on top (docs/specs/activity-comments.md 2.9, choice 3.3 A). A
 * server component that loads its own notes, so the deal page only mounts
 * it. A note shows its author's avatar on the rail (choice 3.1 B), read from
 * the initials or name pasted into its text until notes carry an author; a
 * recorded change, or an imported note with no author, shows a dot.
 */
export async function DealActivity({ dealId }: { dealId: string }) {
  const notes = await prisma.dealNote.findMany({
    where: { dealId, deletedAt: null },
    // Undated imported lines go last, as on the list; Postgres would put them first.
    orderBy: [{ noteDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  const addNote = addDealNote.bind(null, dealId);
  const today = todayYmdEastern();

  return (
    <Section
      title={
        <>
          Activity
          <span className="num ml-1.5 text-meta text-fg-3">{notes.length}</span>
        </>
      }
    >
      <form action={addNote} className="flex items-end gap-2">
        <Textarea name="body" rows={2} placeholder="Add a note…" aria-label="Add a note" className="flex-1" />
        <Button type="submit">Add</Button>
      </form>
      <ActivityTimeline className="mt-4">
        {notes.map((n) => {
          const isChange = n.source === "change";
          return (
            <ActivityItem key={n.id} id={`update-${n.id}`} marker={isChange ? "dot" : noteMarker(n.body)}>
              <div className="num text-meta text-fg-3">
                {n.noteDate ? noteDay({ noteDate: n.noteDate, source: n.source }, today) : fmtDateTime(n.createdAt)}
                {n.source === "manual" && " · note"}
                {n.source === "migration" && " · imported"}
              </div>
              <p
                className={cn(
                  "whitespace-pre-wrap text-pretty [overflow-wrap:anywhere]",
                  isChange ? "text-meta text-fg-2" : "text-body text-fg-1",
                )}
              >
                {n.body}
              </p>
            </ActivityItem>
          );
        })}
        {notes.length === 0 && <li className="text-body text-fg-3">No activity yet.</li>}
      </ActivityTimeline>
    </Section>
  );
}

/** A note's author on the rail when its text names one ("(CS)", "  ·  Connor Swofford"); a dot otherwise. */
function noteMarker(body: string): ActivityMarker {
  const { initials, name } = parseNoteAuthor(body);
  const who = name ?? initials;
  return who ? { avatar: who } : "dot";
}
