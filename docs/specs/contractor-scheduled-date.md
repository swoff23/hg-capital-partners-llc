# A contractor's scheduled day

Planned with Connor on Nov 21, 2026, one question at a time (Q1 to Q9 below, with his own asks between them). Mockups live in [contractor-scheduled-date/](contractor-scheduled-date/). He said "build it" the same day; section 8 lists where the build differs from this plan.

## 1. Summary

**Why.** A contractor needs to say when they plan to go, and HG Capital needs to see it. Today their only control, Change date, writes over HG Capital's due date ([contractor-job-emails.md](contractor-job-emails.md) section 7), so the date Connor set is lost and the job is judged late against the contractor's day.

**What changes.**

- Every contractor job has **two dates**. **Due** is HG Capital's: the contractor sees it and can never change it. **Scheduled** is the contractor's: the day they plan to go, which they set and move without approval (Q1).
- Picking a day turns the job **Scheduled**, the same status staff use today (Q2).
- Their job page shows **Scheduled** and **Due** as two labeled rows (Q3). Their My jobs list shows their day, or Due when they have none (Q8).
- The **Tasks page** gets its own **Scheduled** column; elsewhere the day rides with the status (Q4). Staff can change the day too.
- A scheduled day **after the due date** gets a warning icon after the date, everywhere it shows, with "After the due date, Fri, Nov 20" on hover or tap (Connor's ask, Q4 follow-up).
- New 8 am emails: **Scheduled today** on their day (Q5), and at a home that needs 24 hours' notice, a **heads-up the day before** (Q6).
- Late, the date chip in staff lists and the Due emails all follow **Due** only.

No migration: `Task.scheduledFor` and the `SCHEDULED` status already exist.

## 2. Decisions

| # | Decision | Drawing |
|---|---|---|
| Q1 | Two dates. Due is HG Capital's only; the contractor's Change date now writes the scheduled day, never Due. Late and the 8 am Due emails follow Due. Reverses the Nov 14 "one date, always Due" call ([contractor-job-emails.md](contractor-job-emails.md) section 7) | [01](contractor-scheduled-date/01-two-dates-or-one.svg) |
| Q2 | Picking a day turns a To do or Waiting job Scheduled; moving the day keeps it Scheduled; after Start (In progress) the Scheduled row goes away. Staff still schedule a job the way they do now | [02](contractor-scheduled-date/02-status.svg) |
| Q3 | Their job page: two labeled rows under the address, Scheduled (tap to set or move, "Set a day" when empty, chevron) then Due (plain). The status line keeps the badge only. Label column, then the day; on a laptop the rows stay with the text column | [03](contractor-scheduled-date/03-placement.svg) |
| Q4 | Staff lists: on the Tasks page's one-line layout, a **Scheduled** column between Assignee and Due, shown whenever a row in the list has a scheduled day (like Status). Click the day to change it. Elsewhere (narrower lists, Today, the contractor's page, the property's Tasks) the day rides with the status: "Scheduled Sat, Nov 21" in the status column from 480 up, leading the second line below 480. The date chip is always Due, so red always means late. Connor picked his own-column idea over the Status-column option, accepting narrower titles at 1280 with the sidebar open | [04](contractor-scheduled-date/04-staff-lists.svg), [05](contractor-scheduled-date/05-scheduled-column.svg) |
| Q4 warning | A scheduled day after the due date gets a warning icon (`TriangleAlert`, `--warn`) **after** the date, everywhere: the Tasks column, the status and second line, the staff task page's Scheduled row, the contractor's Scheduled row, My jobs. Hover shows "After the due date, Fri, Nov 20"; on touch a tap on the icon shows it. They can still pick a day after Due, since the tenant's day sometimes lands there | [05](contractor-scheduled-date/05-scheduled-column.svg), [06](contractor-scheduled-date/06-warning-side.svg) |
| Q5 | An 8 am "Scheduled today" email to the contractor on their day: address, access, Text to my crew, Start job | (answered in chat) |
| Q6 | At a home that needs notice (someone lives there and Permission to enter is off), the contractor gets a heads-up at 8 am **the day before their scheduled day**: "Scheduled tomorrow:" with "Tell the tenant today. They need 24 hours' notice, and you don't have permission to let yourself in." Buttons: Text the tenant, Change day. With no day picked yet, it goes the day before Due as "Due tomorrow:" with the same line. A vacant home, or one with permission on, gets no heads-up. The email goes to the contractor; the app doesn't email tenants | [07](contractor-scheduled-date/07-tenant-notice.svg) |
| Q7 | At a notice home they can pick today or tomorrow. The toast reminds them: "Scheduled for tomorrow. The tenant needs 24 hours' notice." or "Scheduled for today. Only go in if the tenant said yes." The heads-up email goes right away instead of at 8 am | [08](contractor-scheduled-date/08-short-notice.svg) |
| Q8 | My jobs rows show their day when they have one ("Scheduled · Mon, Nov 23 · 1412 Elm St", warning icon after a day past Due), else "Due Tue, Dec 1". By date sorts by the day shown. "Visit date" goes away | [09](contractor-scheduled-date/09-my-jobs.svg) |
| Q9 | Jobs a contractor already re-dated with the old Change date (Nov 14 to the build) are **left as they are**: their day stays in Due. No data fix runs | [10](contractor-scheduled-date/10-already-redated.svg), [11](contractor-scheduled-date/11-why-q9.svg) |
| Q10 | Your task page's Details always has a **Scheduled** row right below Due while the job is To do, Waiting or Scheduled ("Set a day" when empty). Picking a day turns the task Scheduled, as a contractor's pick does; Undo puts the status (and a Waiting reason) back. It goes once the job is In progress. Asked after the build (Nov 21) | [12](contractor-scheduled-date/12-details-row.svg) |

## 3. How it behaves

### 3.1 The rules (`lib/tasks`)

- **Due** (`dueDate`) changes only through staff: the task page, the list's date chip, bulk edit, New task. No contractor path writes it.
- **Scheduled** (`scheduledFor`) shows while the job is `SCHEDULED`, as now. A contractor sets it on a job that is To do, Scheduled or Waiting (`CONTRACTOR_DATE_STATUSES` drops In progress). From To do or Waiting the job turns Scheduled; a Waiting job's reason clears. Staff set it through the status menu, the task page's Scheduled row and the new Scheduled column.
- **Late** is past Due for every task, jobs included (`isTargetLate` gives way to `isOverdue`). A Scheduled job is no longer late by its scheduled day.
- **After due**: `scheduledFor > dueDate`, both set, job Scheduled. One pure helper decides it for every surface.
- `rules.ts` `targetDate` and `targetIsVisit`, and `list.ts` `targetOf` and `targetField`, split into the two dates. Each caller says which one it means.

### 3.2 The contractor's side (portal)

- **Job page** (Q3): `JobDate` becomes the two rows. The Scheduled row opens the same `DatePanel` in a `PickerLayer` (a sheet on a phone, a popover with a mouse), titled "Scheduled day", with no "No date". The Due row is plain text. While the job is In progress only the Due row shows. `?do=date` from an email opens the Scheduled sheet.
- **Toasts**: "Scheduled for Mon, Nov 23", or "Moved to Mon, Nov 23". At a notice home, today and tomorrow use Q7's two lines.
- **My jobs** (Q8): the row's line and By date order use their day, else Due.
- **Text to my crew** and **Add to calendar** use their day when there is one, else Due.

### 3.3 Connor and Pieter's side

- **Tasks page** (Q4): `TaskColumnHeads` gets a plain **Scheduled** heading between Assignee and Due, and each row a cell holding the day as a date chip (the `DueDatePicker` trigger, no "No date"), with the warning after it. The column and heading show only when a row in the list has a scheduled day. Not sortable for now.
- **The status, elsewhere**: a Scheduled job's status reads "Scheduled Sat, Nov 21" the way Waiting reads "Waiting on National Fuel", in the status column from 480 up and leading the second line below. On the Tasks page's one-line layout the column carries the day and the status reads "Scheduled".
- **Date chip**: always Due on every list (Tasks, Today, the contractor's page, the property's Tasks), and bulk edit's date change always edits Due. The Due sort and the property's Tasks order go by Due.
- **Task page**: the Due and Scheduled rows stay; the Scheduled row gets the warning. Copy drops "visit": "Scheduled for Sat, Nov 21" (was "Visit set to"), "Pick the scheduled day." (was "Pick the visit date.").

### 3.4 Emails

| When | To | Subject starts | Notes |
|---|---|---|---|
| Contractor sets their day | Connor and Pieter | Update | "Zack scheduled it for Tue, Nov 17" (Q1 drawing) |
| Contractor moves their day | Connor and Pieter | Update | "Zack moved the scheduled day to Mon, Nov 23 (was Tue, Nov 17)"; two moves in one email name the day you last saw |
| Staff move Due or the scheduled day | Contractor | Update | As every date move does today |
| 8 am on their day (Q5) | Contractor | Scheduled today | Only while the job is Scheduled |
| 8 am the day before their day, at a notice home (Q6) | Contractor | Scheduled tomorrow | With the notice line, Text the tenant and Change day |
| 8 am the day before Due, no day picked, at a notice home (Q6) | Contractor | Due tomorrow | Same line and buttons |
| A day picked for today or tomorrow at a notice home, or after 8 am the day before (Q7) | Contractor | Scheduled today or Scheduled tomorrow | Right away instead of at 8 am. Today's line: "Only go in if the tenant said yes." |
| 8 am on Due / the morning after | Contractor | Due today / Due yesterday | Unchanged, by Due only (Q1) |

- The job email's facts get a **Scheduled** row beside Due, with "(after the due date)" in words when it applies, since an email has no hover. Change date becomes **Change day** and opens the Scheduled sheet.
- 8 am emails still go only for open jobs, once per day each, kept by the outbox marker `queueDueReminder` already writes (`{ kind, due }` in `items`), so the new kinds need no table.

## 4. Defaults I picked (not drawn; say if any is wrong)

1. **They can move their day but not clear it**, as Change date works today. Staff clear it by changing the status.
2. **One 8 am email per job per morning.** When two land on the same morning, their day's email wins: Scheduled today, then Scheduled tomorrow, then Due today, then Due tomorrow, then Due yesterday. A skipped one doesn't come back later.
3. **Staff moving either date emails the contractor**, as date moves do today.
4. **Today's sections, the Due sort and the property's Tasks order go by Due.** The day shows on each row.
5. **The Scheduled column isn't sortable** yet.
6. **Text to my crew and Add to calendar** use their day, else Due.

## 5. Reuse check

**Reused as is:** `Task.scheduledFor` and the `SCHEDULED` status (no migration); `DatePanel`, `PickerLayer` and the `DueDatePicker` chip; `Tooltip` (hover with a mouse, tap on touch); `StatusBadge` and `StatusMark`; `useToast`; the outbox, bundling, the 8 am cron and its once-per-date marker; `accessState` (`lib/tasks/lockbox.ts`) to tell a notice home (occupied and not permitted); the email layout in `email/render.ts`; `smsHref` for Text the tenant.

**Extended:**

- `lib/tasks/core.ts`: `setDateByContractor` writes the scheduled day and the Scheduled status, never Due; the partner email lines; `queueDueReminder` takes the new kinds.
- `lib/tasks/rules.ts`, `lib/tasks/list.ts`: the one-date Target splits into Due and Scheduled; late by Due; the after-due helper.
- `lib/portal/job-link-paths.ts`: `CONTRACTOR_DATE_STATUSES` drops In progress.
- `lib/notifications/reminder-rules.ts`, `reminders.ts`: Scheduled today, the day-before heads-up at notice homes, one per morning.
- `lib/notifications/content.ts`: subjects, the Scheduled fact row, Change day, the notice line.
- `app/(app)/tasks/all-list.tsx` (`TaskColumnHeads`), `task-row.tsx`: the Scheduled column and the day with the status.
- `app/(app)/tasks/[id]/fields.tsx`, `status-control.tsx`, `new/new-task-fields.tsx`, `bulk-bar.tsx`, `lib/tasks/bulk*.ts`: copy, the warning, and bulk date edits always on Due.
- `app/(portal)/p/jobs/[id]/_components/job-date.tsx`, `p/_components/due-date.tsx`, `my-jobs.tsx`, `lib/portal/job-view.ts`, `jobs.ts` (crew text), `app/j/[token]/calendar/route.ts`.
- `app/(app)/properties/[id]/page.tsx`, `contractors/[id]/page.tsx`: order and dates by Due, the day with the status.

**New:** `components/after-due-mark.tsx`, the warning icon with its Tooltip, used by staff and portal pages alike, with a row in [docs/components.md](../components.md).

**References** (Mobbin): two date columns as in [Plane](https://mobbin.com/screens/786d8f61-65fd-4963-9124-4ed6edd1fac2) and [ClickUp](https://mobbin.com/screens/5e01c0c3-a98d-4e64-8d33-7751abf2955a); labeled date rows as in [Qatalog](https://mobbin.com/screens/ea750733-550c-4a35-860a-043820104ece) and [Twenty](https://mobbin.com/screens/04261015-6c95-4ebe-9a16-b75c4ba10da6); scheduling up front as in [Jobber](https://mobbin.com/screens/be53c898-e1ac-43fa-bcb5-2b257c70e901); an occasional icon after its text as in [Dialpad](https://mobbin.com/screens/846d5be9-9e61-4280-bd1b-96e709ddf8e7), [Deel](https://mobbin.com/screens/9c17783e-46c9-45d2-8bfd-0f3d1cff575b) and [Evernote](https://mobbin.com/screens/0cf81f55-0d68-445f-96f8-ae5905039491), against [Vanta](https://mobbin.com/screens/6e3596e8-0f6a-4a38-ad5b-bbc17fae0fe1), where every row has one.

## 6. Build order

1. **Rules**: split the dates, the contractor's day and status, late by Due, the after-due helper, with unit and Postgres tests.
2. **Contractor's side**: job page rows and sheet, toasts, My jobs, crew text, calendar.
3. **Staff side**: the warning mark, the Scheduled column, the day with the status, the task page, bulk edit and ordering.
4. **Emails**: partner lines, the job email's rows and Change day, Scheduled today, the heads-up (8 am and right away), one per morning.
5. **Checks**: `npm run check`, then `npm run test:devices` and `test:devices:dark`, opening the Scheduled sheet, the tooltip and the column at 320, 375, 768, 1280x800 and 1920.

## 7. Not in this

- No fix for jobs already re-dated (Q9).
- No emails to tenants.
- No sort on the Scheduled column.
- No time of day: a scheduled day is a date, like Due.

## 8. As built (Nov 21)

- **Scheduled column** is 128px, not 96: the widest weekday chip ("Wednesday") and the warning fit. The status column takes 208px wherever a row shows its day beside the status (the Tasks page, Today's contractor groups, the contractor's page), so the day isn't cut off.
- **My jobs** rows are links, so their warning is the icon with its words for screen readers and a mouse's title, not a button; a tap opens the job, whose Scheduled row has the full warning.
- **Text the tenant** in the heads-up email opens the job at its Tenants, where a phone's Text button is one tap away (an email can't carry an `sms:` link safely).
- **One 8 am email per job per morning** holds through the whole 8 o'clock hour: a job that changes after its first line (a Start, a moved day) gets no second. The right-away heads-up (Q7) isn't held back by it.
- **Copy**: the staff activity line reads "moved the scheduled day to Mon, Nov 23"; bulk edit's rare skip reads "needs a day" (the longer words broke the 90-character toast).
- **Tests**: `src/lib/tasks/scheduled-day.pg.test.ts` covers the contractor's pick and the 8 am rules against a database.
