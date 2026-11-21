# Shorter activity

Connor's ask, Nov 19, 2026. Answers settled in chat on Nov 20. Builds the week of Nov 23. Amends [activity-comments.md](activity-comments.md) sections 2.3 (rules 7 and 8), 2.4 and 2.9; everything else there stands.

## 1. Summary

A task's Activity is a wall of one-line changes. In Connor's example, a task's creation and 7 changes by two people over four days take 12 rows, because only one person's changes within 30 minutes fold today, and every day gets a heading.

- **Collapse like Linear.** Between two comments, older changes collapse into one line that says what's inside: "Show 4 updates: assignee, due date and Asana move". The newest 2 changes of each stretch stay in view.
- **Comments never collapse.** They already sit in time order between the changes on all three pages. Nothing about that changes.
- **No day headings.** Each line carries its own day in its time slot ("Mon", "Nov 10").
- **The top fold stays.** "Show 12 earlier updates" counts rows after collapsing, so it shows only on long histories.
- **All three timelines.** The staff task page, the contractor's job page and the deal log.

Connor's example, after:

```
Connor created this task · Nov 3
› Show 5 updates: assignee, due date and Asana move · Nov 3 to Sun
Connor moved the due date from Mon, Nov 16 to Thu, Nov 19 · Mon
Connor set the unit to Unit 2 · Mon
```

## 2. Decisions

| # | Question | Answer |
|---|---|---|
| 1 | What collapses | Any stretch of 4 or more changes between anchors, across people and days. The newest 2 stay in view; the older ones collapse into one line. |
| 2 | Day headings | Gone on all three pages. The day moves into each line's time slot. |
| 3 | Top fold | Stays, counted after collapsing. |
| 4 | Where | Task page, contractor job page and deal log. |

My calls, made while writing this. Each is easy to change:

- **Deal stage changes stay in view.** A stage change is a deal's Mark done, so it's an anchor (3.1).
- **Phones drop the kinds list.** At 375 the line reads "Show 4 updates", so it never wraps (3.4).
- **One toggle deep.** Inside an opened stretch, nothing opens further (3.3).

## 3. The rules

### 3.1 Anchors and stretches

An **anchor** never collapses and ends a stretch. Activity-comments 2.3 rule 4 already lists what never folds; that list is the anchor list.

| Page | Anchors |
|---|---|
| Task page, job page | Comments (files-only and imported ones too), decision pairs, Mark done, Approve, Send back, a contractor's Start, creation, the next repeat, access changes, sync conflicts |
| Deal log | Notes (typed here or from the sheet), Deal created, Convert to property, any change that includes the stage |

A **stretch** is the run of rows between two anchors, counted after bursts merge (2.3 rules 1 to 3). One person's 14 ticks are still one row.

- **4 or more rows:** the oldest ones (all but the newest 2) collapse into one line. The newest 2 show as they do today, a folded burst with its own chevron included.
- **3 or fewer:** they show as they are. Collapsing 3 rows into 1 plus 2 saves nothing.

The "Moved from Asana" divider counts as a row. Inside a collapsed stretch it's one of the kinds ("Asana move"). In view, it draws as it does today.

### 3.2 What stays in view

- **New.** A collapse never covers the first new entry or anything after it. If the New divider would land inside a stretch, the collapse ends just above it, and if that leaves fewer than 2 rows to collapse, nothing collapses.
- **Linked updates.** A `#update-<id>` link (job emails, Copy link) into a collapsed stretch opens that stretch and scrolls to the row. Same as the top fold today.
- **Your own send.** A comment you just posted is an anchor, so the changes before it close their stretch.

### 3.3 The collapsed line

It's the stock `ActivityRun` from `src/components/activity-timeline.tsx`: a chevron on the rail, the summary as its toggle, the time after it.

| | Laptop 1280, tablet 768 | Phone 375 and 320 |
|---|---|---|
| Closed | Show 4 updates: assignee, due date and Asana move | Show 4 updates |
| Four or more kinds | Show 6 updates: assignee, due date, unit and more | Show 6 updates |
| Open | Hide 4 updates | Hide 4 updates |
| Time | Nov 3 to Sun | Nov 3 to Sun |

- **The count** is the rows you'll see when it opens.
- **The kinds** are listed in the order they first happen, up to three, then "and more". The words: assignee, status, due date, visit, unit or property, title, notes, files, checklist, repeat, Asana move. Deals use the field's label in lowercase (asking price, stage) and "tasks" for a task-added line.
- **The time** is the span from the first row's day to the last's (3.5). One day shows that day alone. With a mouse, the tooltip gives both full stamps.
- **Opened**, its rows appear under it in timeline order. A burst inside shows as its sentences, one per line, with no second chevron: "Connor assigned Zack and made 3 more changes" opens to its sentences. A same-kind burst ("Zack checked 14 items") stays one sentence, and the checklist shows the ticks. A deal change's field rows (old value, arrow, new value) show right under its sentence.
- **It's a button** with `aria-expanded`. Focus stays on it when it toggles. On touch it's at least 44px tall (`pointer-coarse:min-h-11`, as the top fold does). No new motion.
- **In print**, the line prints without its chevron and the rows inside stay folded, as the top fold does.

### 3.4 Order on each page

- **Task page and job page** read oldest first, as today. The collapsed line sits above the stretch's newest 2.
- **The deal log** reads newest first, as today. A stretch's newest 2 sit at its top, under the newer note, and the collapsed line sits under them. Opened, its rows read newest first.
- **The top fold.** Task and job page: "Show N earlier updates" at the top. Deal log: "Show N older updates" at the foot. Both count rows after collapsing (a collapsed line is 1). The 15-row limit stays.

### 3.5 Time without headings

Day headings (`ActivityDay`) go from all three pages, and so do month headings (2.3 rule 8). Each line's time slot carries the day instead. It reuses `historyDay` for the day words.

| When | Time slot |
|---|---|
| Under a minute | now |
| Today, under an hour | 5m |
| Earlier today | 2h |
| Yesterday | Yesterday |
| 2 to 6 days back | Tue |
| Older, this year | Oct 20 |
| Another year | Oct 20, 2025 |
| A deal sheet line with no date | nothing |

- **The tooltip** with a mouse keeps the full stamp: "Thu, Oct 30 at 2:14 PM".
- **On touch**, older lines show only their day; the clock time is in a comment's menu header, as today (activity-comments 3.2).
- **The deal log's sheet rule** (where the sheet's lines end and the app's begin) stays.

## 4. Reuse check

**Reused as is**
- `ActivityRun`, `ActivityTimeline`, `ActivityDivider` and `ActivityTime` in `src/components/`.
- `CommentCard` and the pairing behind decision pairs.
- `foldStart`, `firstNewIndex` and `linkedUpdateId` in `src/lib/tasks/activity.ts`; `LOG_SHOWN` in `src/lib/deals/record-log.ts`.
- `historyDay` in `src/lib/dates.ts`.

**Extended**
- `src/lib/tasks/activity.ts` gets a pure `collapseStretches(rows, { isAnchor, kindOf, newestFirst, firstNew })` that runs after bursts merge. The task page, the job page and the deal log all call it. It's tested in `activity.test.ts`, starting with Connor's 7-change task.
- `activityTime` in `src/lib/dates.ts` gains the past-day labels in 3.5, where a clock time used to sit under a heading.
- `buildDealLog` in `src/lib/deals/record-log.ts` marks each entry's anchor and kind for the shared helper.
- `TaskActivity` (`src/app/(app)/tasks/[id]/activity.tsx`), `JobUpdates` (`src/app/(portal)/p/jobs/[id]/_components/job-updates.tsx`) and `DealLog` (`src/app/(app)/deals/[id]/deal-log.tsx`) render the collapsed lines and drop their day groups.

**Removed**
- `groupHeadings`, `groupByDay` and `MONTH_AFTER_DAYS` in the task lib, and `groupLog` with its own `MONTH_AFTER_DAYS` in the deal lib, if nothing else uses them.
- `ActivityDay` in `activity-timeline.tsx` once the three pages stop using it.

**New:** nothing. No new component, field or migration.

**References**
- Linear, from Connor's screenshots (Nov 19): "Show 5 events: changed project, status, labels, related issues, and cycles…" between comments.
- [Linear on Mobbin](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270): one timeline with a time on each line and no day headings.
- [Plane](https://mobbin.com/screens/5f2746a6-a66d-424e-a528-830963fd49b2): a work item's history as one flat list, each line with its own time.
- [ClickUp](https://mobbin.com/screens/4201d956-b01e-410e-89db-145cddfd3114): "Show more" above the latest activity, the same job as our top fold.

## 5. Done when

- Connor's task reads as the four rows in section 1.
- `activity.test.ts` and the record-log tests cover the cases in 3.1 to 3.4: a stretch of 3 left alone, comments splitting stretches, New inside a stretch, a linked update inside a collapse, and the deal log newest first.
- `npm run typecheck`, `npm run lint` and `npm test` pass.
- `npm run test:devices` and `npm run test:devices:dark` pass, and a collapsed line opened and closed at 375 and 320 on all three pages, with nothing clipped.
