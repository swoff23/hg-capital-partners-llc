# A contractor's Updates show the job's story

Planned with Connor on Nov 21, 2026 (option A of three drawn) and built the same day, with every call as recommended.

## 1. Summary

A contractor's Updates timeline already uses the staff task page's timeline (`components/activity-timeline.tsx`), so it looks the same. What differs is what gets in: today a contractor sees comments to them, photos, and four status moves (Scheduled, In progress, Review, Done). Connor wants it to read like his page, with updates and changes interleaved.

Option A adds the job's own story: when it was added and given to them, due date and scheduled day set or moved, Waiting and back to To do, notes edited, and checklist edits. It leaves out what they can't act on and anything about other people.

## 2. What a contractor sees

| Event | Line on the contractor's page | Rule |
|---|---|---|
| CREATED | "Connor added this job" | Always. A resident's request reads "A resident sent this request" (call 1) |
| ASSIGNED | "Connor gave you this job" | Only an event whose `to` is this contractor. Never one naming anyone else |
| DUE | "Connor moved the due date to Tue, Nov 17" | Staff's and the system's while the job was theirs |
| SCHEDULED | "You moved the scheduled day to Mon, Nov 23", "You removed the scheduled day" | Theirs, and staff's while the job was theirs; never another contractor's |
| STATUS | Today's four, plus Waiting, To do and Canceled | "Connor set status to Waiting", without the "on …" reason (call 2) |
| NOTES | "Connor edited the notes" | While the job was theirs; never the text before or after |
| CHECKLIST | "You checked “Uppers”", "Connor renamed “Uppers” to “Upper cabinets”" | Theirs, and staff's while the job was theirs |
| COMMENT, ATTACHMENT | As today | Unchanged |

**Never, in any form:** Internal comments and files, another contractor's actions or name (before or beside them), TITLE, PROPERTY, ACCESS (lockbox and tenant view logs, permission to enter), REPEAT, REPEAT_CREATED, CONFLICT, drafts.

On a reassigned job the new contractor sees the job being added and being given to them, then only what happened since it became theirs: the rest starts at their access row, the baseline the "2 new" counts use (date, notes and checklist lines carry no audience, so the time is what tells). Runs of small changes fold into one line, as on the staff page (`collapseStretches`, `stretchSummary`).

## 3. Calls, with my recommendation

1. **A resident's request.** Its CREATED actor is the resident. Recommend "A resident sent this request", since the Tenants section has its own rules for when names show.
2. **Waiting's reason.** "Waiting on …" is written for HG and can name a person, a quote or money. Recommend leaving it out: "Connor set status to Waiting".
3. **The "2 new" counts** (My jobs, the job email) share the page's filter. Recommend the new lines don't count: only comments, photos and status moves do, as today. Otherwise "Connor edited the notes" reads as a message. The page's notice already lists date, status and notes changes.
4. **Canceled.** Recommend showing "Connor canceled this job" on the read-only page, as the last line.

## 4. How

- **Filter.** `src/lib/portal/queries.ts` `portalEvents`: keep today's clause for the "new" counts (call 3). Add a timeline-only clause for the kinds above. System events are saved INTERNAL, so that clause doesn't test `visibility`. It does test actor (staff, system, Asana, or this contractor) and, for ASSIGNED, `data.to.contactId` equal to the viewer. `queries.test.ts` pins both clauses.
- **Lines.** A portal wrapper over `lib/tasks/activity.ts` `eventLine` that passes the viewer as "you" in `ActivityNames`, swaps the CREATED and ASSIGNED wording for the contractor's ("added this job", "gave you this job"), drops the Waiting reason and refuses any kind outside the list. `JobUpdate` gains `kind: "event"` with `body` as the line.
- **Page.** `job-updates.tsx` draws an event as the staff page's plain line (the dot, the line, the time). Folds follow the task page (`collapseStretches` with its `stays` flag): comments, removed comments and notes stay in view, as do the job being added and a decision (sent for review, approved or sent back, their own Start); other lines and file posts fold.

## 5. Reuse check

- **Reused:** `ActivityTimeline`, `ActivityFold`, `collapseStretches`, `stretchSummary`, `eventLine` and its wording, `portalEvents` (unchanged, still the counts' clause), `JobUpdates`.
- **Extended:** `JobUpdate` (one kind), `eventLine` (wrapped, not changed).
- **New:** `lib/portal/story-events.ts` `storyEvents`, the timeline-only clause beside `portalEvents`, and `job-view.ts` `storyLine`, the wrapper and its allowlist. Nothing visual.

## 6. Tests

- `queries.test.ts`: the two clauses, and that the counts' clause is today's.
- A `.pg.test.ts` against the local database: a job reassigned from contractor A to B shows B no line naming A; an internal comment and an ACCESS event never reach B; a Waiting reason never reaches B; B's own checklist tick reads "You checked …".
- Unit tests for the wrapper's wording and allowlist.

## 7. As built (Nov 21)

- **Where:** the filter is `src/lib/portal/story-events.ts` `storyEvents` (its own module so the database test runs the same SQL); `queries.ts` `jobUpdates` reads it beside `portalEvents`; the words are `job-view.ts` `storyLine` over `activity.ts` `eventLine`; `job-updates.tsx` draws `kind: "event"`.
- **Era:** date, notes and checklist lines carry no audience (`core.ts` `addEvent`), so they count from the later of the viewer's access row and the last assignment to them, so a job handed away and back shows only its latest stretch. The job being added and the assignment to them come from before it.
- **Not new:** a story line never adds the New divider and never counts in "2 new".
- **Tests:** `job-view.test.ts` (wording, allowlist), `queries.test.ts` (the filter's rules, one caller, no Waiting reason, no assignment's people), `story-events.pg.test.ts` (a job reassigned from Zack to Bea).
- **Handed away and back, or an assignment undone** (Nov 22): every stretch that was theirs shows, none that wasn't; each line is judged by the latest assignment at or before it, floored at their access row (`story-events.pg.test.ts`). Connor kept it with no "took you off" line.
- **A resident's own cancel** reads "A resident canceled this request" (Connor, Nov 22).

