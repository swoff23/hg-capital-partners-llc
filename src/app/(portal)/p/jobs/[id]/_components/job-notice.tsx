import { CalendarClock, FileText } from "lucide-react";
import { ActivityTime } from "@/components/activity-time";
import { StatusMark } from "@/components/status-badge";
import { textLinkClass } from "@/components/ui";
import { hasNotice, type JobNotice as Notice } from "@/lib/portal/job-notice";

/**
 * What changed since the contractor last looked, under the job's title where
 * they start reading (docs/specs/activity-comments.md 3.4, question 2 A).
 * Updates sit at the end of a long scroll, and a date or the notes change
 * without a line there, so the three things worth knowing show here:
 *
 *   - sent back: "Connor sent this back · 2h", then the note in a card on a
 *     --line edge, three lines, and "See the update", which stays until they
 *     mark the job done again. Below 480px the " · 2h" drops before the
 *     sentence would wrap;
 *   - the date: "Due date moved to Fri, Oct 30 (was Thu, Oct 29) by Connor"
 *     (or "Visit"), "by Connor" dropping at 320;
 *   - the notes: "Notes updated by Connor".
 *
 * The last two clear once the job has been opened after the change; the
 * words are Due date and Visit, never target. Nothing renders when there is
 * nothing to say. A server component: the time is the one client piece.
 */
export function JobNotice({ notice, now }: { notice: Notice; now: string }) {
  if (!hasNotice(notice)) return null;
  const { sentBack, date, notes } = notice;
  return (
    <section aria-label="Changes since you last looked" className="space-y-3">
      {sentBack && (
        <div>
          <p className="flex min-w-0 items-center gap-2 text-body text-fg-1">
            <StatusMark status="IN_PROGRESS" />
            <span className="min-w-0 truncate">{sentBack.by ?? "HG"} sent this back</span>
            <span className="shrink-0 text-meta text-fg-3 max-[480px]:hidden">
              <span aria-hidden="true">{"· "}</span>
              <ActivityTime at={sentBack.at} now={now} />
            </span>
          </p>
          <div className="mt-2 rounded-md border border-line bg-surface px-3 py-2.5">
            {sentBack.note && <p className="line-clamp-3 whitespace-pre-wrap break-words text-body text-fg-1">{sentBack.note}</p>}
            <p className={sentBack.note ? "mt-1.5" : undefined}>
              <a href={`#update-${sentBack.noteEventId ?? sentBack.statusEventId}`} className={`${textLinkClass} relative text-label pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3`}>
                See the update
              </a>
            </p>
          </div>
        </div>
      )}
      {date && (
        <p className="flex items-start gap-2 text-body text-fg-1">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-3 pointer-coarse:mt-0 pointer-coarse:size-5" />
          <span className="min-w-0">
            {date.text}
            {date.by && <span className="max-[360px]:hidden">{` by ${date.by}`}</span>}
          </span>
        </p>
      )}
      {notes && (
        <p className="flex items-start gap-2 text-body text-fg-1">
          <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-3 pointer-coarse:mt-0 pointer-coarse:size-5" />
          <span className="min-w-0">
            Notes updated
            {notes.by && <span className="max-[360px]:hidden">{` by ${notes.by}`}</span>}
          </span>
        </p>
      )}
    </section>
  );
}
