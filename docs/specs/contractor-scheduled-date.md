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

## 9. Job page layout A (Nov 21, Connor)

Connor wants contractors to set a day as the job's first step (get the job, set a day, start, finish, then invoice and get paid once invoices ship), and found the Scheduled row easy to miss. He picked layout A from three drawn options.

- **Steps** (`_components/job-steps.tsx`, rule `lib/portal/job-view.ts` `jobSteps`): Schedule, Start, Send for review, Approved, as dots joined by a line above the title, in place of the status badge. A day counts once it's set; Waiting and Canceled keep the status badge. Ink only, no gold and no status tone. On a phone only the current step is named. References: Airtasker's task steps and Amazon's order steps on Mobbin.
- **Pick your day** (`JobDates`, editable): a card with "Pick your day" over "Due Tue, Nov 17" and a Schedule button; once set, "Scheduled" over the day (with the after-due mark) and Change. Same `DatePanel` in a `PickerLayer`, same toasts, same `?do=date`. On a phone the button is full width under the words. While the job is In progress it's the one Due row, as before. References: Lugg's and Angi's booked day on Mobbin.
- **Layout**: the task page's grid (head, rail, main; a 320px sticky rail from lg). The rail holds Directions, Copy address, Share with crew, Tenants and Lockbox; the main column holds notes, checklist, photos and Updates. Below lg it's one column in that order. The rail has no Address heading, since the address sits under the title.
- **Reuse**: `Card`, `buttonClass`, `PickerLayer`, `DatePanel`, `AfterDueMark`, `Section`, the task page's grid template. New: the steps list, composed from a plain `<ol>` since no stock stepper exists.
- **Schedule stays secondary**: the bar's Start job is the page's one primary. Making Schedule the primary until a day is set is a follow-up for Connor to decide.

- **Copy** (Connor, Nov 21): the first step and its button read "Schedule", not "Set a day"; the job email's button too.

## 10. The job page on a phone (Nov 22, Connor)

Worked phone first, replacing parts of section 9.

- **Steps:** under the title, every step named under its dot and in the past tense once done (`job-view.ts` `jobSteps`): Schedule / Scheduled; Start, In progress while working, Completed once sent for review; Approval, Awaiting approval, Approved. A job started without a day passes Schedule by (no check). Names wrap to two lines rather than cut off. Send invoice / Invoice sent and Paid join once invoices ship.
- **The job card** (card A): rows over hairlines in one card under the title. The short address on one line (it wraps on a narrow phone rather than cut off), with Directions and Copy address as square icon buttons; Due; Scheduled ("Not set" with a Schedule button, or the day, tap to change); Share with crew as a row (moved to the header, section 12). Gone: the "Pick your day" card and the full-width buttons.
- **The bar:** on a phone the photo button is a 48px camera square. While no day is set, the bar is the camera, a light Start job and a dark Schedule, which opens the card's picker (one shared open state, `schedule-open.tsx`); once a day lands, the camera and a dark Start job.
- **No orange or red for "not scheduled":** orange is In review's status mark on this page and red is the overdue date's (brand, one job per color), so the push is the dark button and the bar.
- **Also:** no checklist progress bar; no "get an email" line under updates; toasts wrap instead of cut off (all toasts, `components/toast.tsx`).
- **Open:** six drawn ideas for making Schedule louder still (day chips, a step box on top, date tiles, a to-do list) wait on Connor.

## 11. Card B, Reschedule and Remove day (Nov 22, Connor)

- **Card B:** the address (label over value, Directions and Copy as icon buttons), then one row split in two: Scheduled on the left, Due on the right, each a small label over the value, so the full day fits at 320. Under their day, a Schedule or Reschedule link (44px tall on touch). Share with crew moved to the header (section 12).
- **Remove day:** the Reschedule picker's last pick, once there's a day (`DatePanel` `noneLabel`). It reverses decision 1 in section 4 ("they can move their day but not clear it"): a Scheduled job goes back to To do with no day (`core.ts` `unscheduleByContractor`, `rules.ts` `CONTRACTOR_CAN_UNSCHEDULE`), partners get "unscheduled "Fix the sink"", the toast reads "Scheduled day removed" and the line "You removed the scheduled day". Never once started. Test: `scheduled-day.pg.test.ts`.
- **Kept after Start:** their day stays in the card while In progress or In review, without the link.
- **Line wording:** "You scheduled the job for Fri, Nov 27" (the status event's `scheduledFor`).
- **Updates fold** by the task page's rule (decisions, the contractor's Start and the job being added stay in view; their scheduling and status shuffles fold).
- **My jobs:** no photo tile; a To do row with no day says "Not scheduled".
- **Composer:** on a touch phone the field is 44px with its line centered, level with Send.
- **Bar words** (Nov 22): "Start job" and "Schedule".

## 12. Header, Getting in and the crew text (Nov 22, Connor)

- **Header** (`job-header.tsx`, after Vrbo's and Angi's booking headers): the back arrow alone (`BackLink` `iconOnly`, "My jobs" as its label for screen readers), "Project details" over the short address in the middle, centered on the page, and on the right the share button, then Call HG Capital. The address stays in the card too.
- **Share with crew** is the header's share icon (`crew-text.tsx`), opening the same sheet. Its text is option B: the title, the address, their day (else Due), then "Details, photos and updates:" and the link (`lib/portal/crew-text.ts`). No notes, checklist or code, so it never goes stale; the link shows the rest. This changes Q5 in docs/specs/contractor-job-emails.md.
- **Getting in** (`GettingInSection`, option B, no icons): first in the rail, then Tenants. One entry line over a note: "Let yourself in" / "The tenant said it's OK" (permission and a code); "The tenant must be home" (or "A tenant must be home") / "Call/text them 24 hours in advance" (occupied, no permission); "Let yourself in" / "No one lives here" (vacant with a code). Then the code, the lockbox's place and its photo. Permission with no code shows nothing, since there's no way in to name. Shown while the job is active; a closed job shows neither section.
- **Remove day** sits in the Reschedule picker as its last pick (section 11).

### Decided before landing (Nov 22, Connor took every recommendation)

1. **Toasts wrap app-wide**, staff pages included.
2. **The composer's 44px touch field** stays on every composer (task page and deal log too), so they match.
3. **A building-wide job behind a shared code** shows the code with no line about who lives there. "No one lives here" needs the job's own unit known and empty (`access-code.ts` `JobAccess.vacant`).
4. **"A resident canceled this request"** on a request its resident canceled; "Connor canceled this job" otherwise.
5. **Getting in stays while In review**, so a job sent back can be reached.
6. **A job started with no day** leaves Schedule unchecked for good, as it was skipped.
7. **A job handed away and back** shows the contractor both of their stretches and nothing between, with no "took you off" line.

### Shared links and the device check (Nov 22, Connor)

- **Someone the job was shared with** (a Share with crew link, `JobLink` kind CREW) sees that one job and no way to My jobs: no back arrow (its slot stays empty so the middle stays centered), no "Back to my jobs" on the not-available screen, and after Send for review "Back to the job", which closes the sheet. They may not be the contractor, so that sheet reads "Thanks!" and says the contractor gets the email. The flag is `PortalPrincipal.shared` (`lib/portal/session.ts`), handed to the page by `SharedLinkProvider` in the portal layout (`p/_components/shared-link.tsx`), so the loading and error screens know it too. A UI hint only: the session's `onlyTaskId` is what keeps them on the job.
- **The contractor's own email link: Welcome back** (Connor picked option A of three drawn, Nov 22; the others were a password only, or the email link opening every job, which a forwarded email would hand to anyone). The back arrow, the not-available screen's "Back to my jobs" and the payoff's go to My jobs, which sends a one-job session to sign in, where `/login` shows "Welcome back, Zack" / "Sign in to see all your jobs.", their email beside their mark (not typed), Password, Sign in, Forgot password?, a divider and "Email me a sign-in link", with "Back to the job" above. References: Etsy's, Viator's, GetYourGuide's and Eventbrite's Welcome back on Mobbin (mobbin.com/screens/97215608-47d8-4103-8a92-c70894e4f4a9, 0f0d46dd-7a84-48ea-82aa-846fcefc9411, 578bae87-3a15-416e-902e-fa8b89ee410c, 49cb4721-c99d-4f17-aa73-251794e040ec).
- **The sign-in link** goes only to the login's own email, never one typed in, so a forwarded job email can't reach the rest of their jobs. It works once, for 15 minutes, 3 an hour per login (`lib/portal/sign-in-link-core.ts`, `PortalSignInLink`, a `SIGN_IN_LINK_REQUESTED` audit row that counts against the daily email cap once sent). The email reads "Hi Zack, here's your link to sign in to HG Capital jobs." with a Sign in button. Its page, `/login/link`, asks for one tap on Sign in before it spends the link, since work email scanners open every link (as a reset link does), then opens a full session; a starting password is still changed first. A used or late link says "This link has expired" with Back to sign in. After the request: "Check your email" / "The link works once, for 15 minutes." / "Sent to zack@…". Not offered to a crew link, or on plain sign in.
- **After review (Nov 22):** Welcome back has "Use a different email" under the address (Etsy's and Viator's wording), which ends the email link's session on that browser so a crew lead on a forwarded email, or a partner, can sign in as themselves; and a staff page that sent you to sign in always gets the plain form. Unused sign-in links die wherever reset links do (an email change, a password change or reset, Remove access) and on Sign out everywhere. A login still on its starting password goes from the link to Choose a new password, which asks for no old one, rather than to the first-password page, which does. The Sign in post is refused from another site (login CSRF, `Sec-Fetch-Site`). "Password changed" shows on Welcome back after a reset; mid-setup it has no Back to the job, since the job won't open until setup is done. A contractor's own email link replaces a crew link's session on the same job.
- **Payoff line** (Connor, Nov 22: "should just be simple"): "Sent to Connor and Pieter for review." (HG Capital with three or more), with no email promise.
- **The device check** sweeps a second job for its contractor, kept at To do with no day (`tests/devices/setup.ts` `seedPortalTodoJob`, page `/p/jobs/[id]#todo`), so the Schedule step, "Not set" and the three-control bar are in the report; the same job through a crew link (`/p/jobs/[id]#crew`); and Welcome back through an email link (`/login#welcome-back`, `seedLinkSessions`).

