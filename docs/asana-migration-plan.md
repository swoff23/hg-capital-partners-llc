# Moving HG off Asana: tasks, contractors, cutover

**Status:** spec, agreed in grilling on 2026-10-22. Waiting for an explicit "build it" before any code. One narrow exception was approved in the grilling (Q27): the read-only Asana backup script and a trial run this weekend.

**Deadline:** full export and migration by **Sunday 2026-11-01**, when Asana access ends. One extra month of Asana Starter is bought as insurance. **Nothing gets cut to make the date:** if we fall behind, cutover moves and the extra month covers it.

---

## 1. Goal

**On Nov 1:**
- every open HG task is in the app, with its full Asana history (comments, photos, videos, subtasks);
- a full backup of all of Asana sits in a private archive;
- Connor and Pieter work only in the app;
- **every contractor** is signed in to the portal (all invited Thu Oct 29).

**After cutover:** the app-wide redesign follows the agreed layout direction (D10), then the remaining screen-by-screen redesign (Deals, Portfolio, Financials, public site).

---

## 2. Research summary

Sources: the Asana CSV export, the live Asana API (read-only), a code audit, about 120 Mobbin screens and flows, the Next 16 docs, and a four-lens review of the draft plan. Raw reports live in the session scratchpad.

**How HG uses Asana**
- One project with 2,208 tasks, about 135 of them real open work (22 overdue, 60 undated).
- Rescheduling is most of the activity: 419 of 762 recent events.
- Contractors close about 40% of their own tasks, and upload iPhone photos and 30 to 70 MB videos.
- Comments are rare: about 100 to 150 in total, half from contractors.
- 68 subtasks, mostly admin checklists.
- 4 playbooks, applied by duplicating tasks.
- Recurring work is copied by hand, and its repeat rules can't be exported.
- Priority, tags, dependencies and rules were never used.

**App gaps**
- Contractors can't be let in safely: one gate admits any user to everything.
- Uploads would allow stored XSS, and their records trust the browser.
- No comments, history, statuses, notifications, subtasks, templates or repeats.
- Contractors are free-text names, and the pickers drop them.
- The task list is unusable at 375px.
- Overdue shows as "yesterday", and "today" is computed in UTC.
- Video doesn't play on iPhone.
- The CSV importer would delete data if re-run.
- Key-date reminder bugs.

**Infrastructure**
- Supabase was on the free plan with no backups.
- Vercel was on Hobby (1 GB Blob, no commercial use).
- Asana's free plan has no guests, and the API is 10x slower without paid.
- Asana file links can expire within 2 minutes.
- There is no staging site.

---

## 3. Decisions (all settled 2026-10-22)

| # | Topic | Decision |
|---|---|---|
| D0 | Nov 1 goal | All open work in the app with history; full backup archived; staff only in the app; every contractor on the portal |
| D1 | Asana | Access ends about Nov 1. Buy one month of Starter as insurance |
| D2 | Vercel | Upgrade to Pro before any invite |
| D3 | Backups | Supabase Pro (daily backups). Manual `pg_dump` before every risky step |
| D4 | Contractor identity | A separate portal account on the existing Contact. Never a User row |
| D5 | Pieter properties and JMPL | Archive only. Not imported; the backup keeps them |
| D6 | Statuses | Seven: To do, Scheduled, In progress, Waiting (with a reason), Review, Done, Canceled |
| D6b | Contractor Mark done | Goes to Review. Both partners get an email. Approve makes it Done; Send back (with a note) returns it to In progress. Staff completing their own tasks go straight to Done |
| D6c | State flow | Scheduled carries its own visit date. Contractors can tap Start job (In progress) and Mark done (Review). Staff can set any state. Only staff can cancel |
| D7 | Dates | One Due date. Today shows Overdue with "Move all to today", and every date chip has quick picks. Contractors see a neutral "Target": the visit date if Scheduled, otherwise Due |
| D8 | Follow-up | No owner field. Contractor jobs sit on one shared list; every contractor update emails both partners |
| D9 | Pop-up parts | React Aria Components for behavior, styled with our tokens |
| D10 | Future layout | Sidebar lists properties; property page becomes the hub with tabs; labeled phone bottom bar. Built after cutover |
| D11 | Names | "Contractors" (nav and directory), "Assignee", "Property". The portal says "Jobs" |
| D12 | Contractor visibility | Only jobs assigned to them. Reassigning removes access |
| D13 | Brandon and the realtor | Same job-only access as trades |
| D14 | Contractor sign-in | **Email and password**, on phone or computer. Connor sets a starting password; the first sign-in forces them to choose their own; "Forgot password" sends an email link. **Same `/login` page as staff**; contractors land on My jobs. Signed in for 30 days, like staff, revocable per device |
| D15 | Comment default | **Shared by default.** Staff switch to Internal for private notes |
| D16 | Task notes | Always visible to the assigned contractor, including imported and move-in tasks |
| D17 | Imported history | All imported comments and photos on a contractor's open jobs are visible to them; they could already see them in Asana |
| D18 | Contractor history | They see all their past jobs, read-only, starting from cutover |
| D19 | Contractor emails | **Only when you or Pieter update their job:** assigned, comment, status change (scheduled, sent back, approved), target date change, notes change. Everything you two do to one job within 10 minutes goes out as **one** email |
| D20 | Staff emails | **Only when a contractor updates their job** (comment, photo or video, Start, Mark done): one email to both of you. Activity within 10 minutes on one job is bundled. **No emails between you and Pieter**, for anything. The 7am summary comes after cutover |
| D21 | Lockbox codes | Shown automatically on open jobs to the assigned contractor. If the job has a unit, that unit's code shows. With no unit, the code shows only if the property has exactly one; otherwise none, and the staff task page says to pick a unit. Codes hide once the job is done. Every view is logged |
| D22 | Rollout | Invite every contractor Thu Oct 29 |
| D23 | Trial backup | Write the backup script after the grilling and run a trial this weekend. Monday Oct 26's run is the official backup |
| D24 | Import depth | **Open tasks only** are imported (with full history). The **backup archive is full**: every task, comment and file, including completed tasks, JMPL and Pieter |
| D25 | Old completed tasks | The ~1,900 completed tasks already in the app from the August CSV are **deleted for good**, with any files attached to them, after a database backup. Connor confirms once more right before it runs |
| D26 | Not on Nov 1 for contractors | Creating tasks (week after), push notifications, following other jobs. Accepted |
| D27 | Repeats | **Auto-repeat ships before cutover.** When a task is done, the next copy appears with the same property, assignee, notes and checklist. Every N days or weeks, monthly on a day, quarterly, or yearly. On Monday Connor lists the recurring tasks and their cadence |
| D28 | Playbooks | A move-in, refi, move-out or closing is coming Nov 1 to 15, so a bare "Apply playbook" ships before cutover. The template editor comes the week after |
| D29 | Spanish | English only for now |
| D30 | Email service | Resend free plan (100 a day). With emails only across the staff/contractor line and bundling, a busy day should be well under 30 |
| D31 | Designs | Today: **Mine / Contractors** two columns. Task page: **page with side rail**. My jobs: **By date / By property switch, By date first**. Job page: **one scroll with a bottom bar**. The 8 smaller screens were approved as described (section 6) |

### Defaults I filled in (confirm or correct)

1. **Unassigned tasks** (e.g. move-in form submissions) show in an "Unassigned" section at the top of both partners' Mine column.
2. **Forgot password** applies to contractor accounts only. Staff logins stay managed by hand, as today.
3. Either partner can Approve or Send back any contractor job.
4. Contractors see Shared files, and new contractor uploads are Shared. Staff uploads follow the comment default (Shared on a contractor's job).
5. If the free email cap is hit, the app logs it and shows staff a banner on that day's Today.
6. A contractor's access to a finished job stays after it's done (D18) and ends only if the job is reassigned or their login is removed.

---

## 4. Scope before cutover

1. **Backup and import:**
   - full Asana snapshot (backup archive);
   - open-task importer with history;
   - CSV-row reconciliation and the D25 deletion;
   - playbooks loaded as template data;
   - daily delta sync until cutover.
2. **Schema** (5.2), tested on a copy of production first.
3. **Security:**
   - contractor accounts with passwords;
   - one login routing by account type;
   - first-login password change and email reset;
   - hardened file and upload routes;
   - a `PORTAL_ENABLED` flag;
   - an auth test suite in CI;
   - page-level gates on Financials;
   - a static guard test.
4. **Staff tasks:**
   - Today (Mine / Contractors), with the Overdue "Move all to today" button;
   - quick-pick reschedule with an Undo toast;
   - phone-usable rows on Today and All;
   - task page with side rail, timeline, composer (photo and video), Shared/Internal toggle and checklist;
   - seven statuses with Waiting reason, Scheduled date and the Review banner;
   - assignee picker that includes contractors;
   - unit field;
   - Repeats field;
   - "Apply playbook";
   - Portal access card on contractor pages.
5. **Portal:**
   - My jobs (Open/Done, By date/By property);
   - job page (address, lockbox, notes, checklist, photos, updates, bottom bar);
   - Start job, Mark done sheet with payoff;
   - first-login password screen;
   - forgot password.
6. **Email:** only across the staff/contractor line (D19/D20), bundled per job over 10 minutes, through a small outbox drained by a once-a-minute cron (Pro).
7. **Device check** covers the portal (5.6).
8. **Cutover runbook** (section 8).

**After cutover (week 2):**
- 7am summary email;
- in-app "new from contractors" list and unread badges (the table ships now);
- desktop side-panel task view;
- Upcoming / By property / Waiting tabs;
- bulk action bar;
- ⌘K and shortcuts;
- template editor;
- contractor "found another issue";
- browser-side thumbnails for new uploads;
- the rest of the key-date reminder fix;
- ConfirmDialog rebuild;
- Deadline field;
- web push for partners.

**With Step 11, not this work:** `dueDate` to `@db.Date`.

---

## 5. Architecture

### 5.1 Identity, sign-in and access

**Staff** are unchanged: `User` rows, password, `hgos_session` cookie. `getCurrentUser()` reads only that cookie, so a contractor session can never satisfy any existing staff action, page, search or QuickBooks route. The review verified this.

**Contractor accounts.** A `PortalAccount` row per `Contact`:
- email (unique, and checked against `User` emails so an address can't be both);
- password hash (scrypt via `src/lib/password.ts`);
- `mustChangePassword`;
- status;
- last sign-in time.

**One login page.** The `/login` action:
1. checks `User` first, then `PortalAccount`;
2. on success, sets the matching cookie;
3. sends staff to `/` and contractors to `/p`, or to the page they asked for (below).

The existing per-email throttle applies to both account types. A wrong password comes back to the form with the email still filled in; it never goes in the URL.

**Back to the page asked for.** A signed-out contractor who opens a `/p` link (an email's "Open job") goes to `/login?next=<that page>`, and after sign-in, and the first-password step if it's due, lands on it. `src/proxy.ts` hands each `/p` request's path to `requirePortalPrincipal()`; `src/lib/portal/next-path.ts` only lets a `/p` path through (no `//`, backslash, control character or dot segment, checked again after one decode, 512 characters at most) and anything else falls back to `/p`. Staff get the same for their pages (an email's task link): the proxy hands each staff section's path to `requireUser()`, and `src/lib/next-path.ts` only lets Home or a path under one of the `src/app/(app)` sections through, with the same checks. The two never overlap, so a contractor never follows a staff `next` and staff never follow a `/p` one.

**Contractor sessions.** A `PortalSession` row holds a random token (stored hashed), an expiry 30 days after sign-in, the user agent and a revoked-at time. The cookie helper uses `__Host-hg_portal` (Secure) on HTTPS and `hg_portal` on local http, so dev and the device check work. Always HttpOnly, `Path=/`, `SameSite=Lax`. Every request checks the row, so "Sign out everywhere" takes effect immediately.

**First sign-in.** When `mustChangePassword` is set, every portal page redirects to "Choose your own password" until it's done.

**Forgot password.** A `PasswordResetToken` (hashed, 30 minutes, single use, consumed atomically on POST), emailed by Resend. The request returns the same response whether or not the email exists, and is rate-limited in the database (3 per email per hour, 10 per IP per hour).

**Portal access card on the contractor page:**
- create a login with a generated starting password, shown once;
- "Text login details" (an `sms:` link on Connor's phone, prefilled with link, email and password);
- Copy;
- Reset password;
- Sign out everywhere;
- Remove access.

**Access rules:**
- `TaskAccess(taskId, contactId, source ASSIGNEE|MANUAL, revokedAt)`. Assigning creates the row; reassigning or unassigning revokes it in the same transaction.
- `canAccessTask()` also requires an active account, an active Contact and a live session.
- Enforced in portal services and in both file routes, never only in pages.

**Portal code boundaries.** Portal code lives in `src/app/(portal)/p/...` and `src/lib/portal/`:
- Queries use explicit field selects. The portal never imports staff auth, the staff task read helpers, or the properties, deals or QuickBooks modules.
- `Property.units` is read only in `src/lib/portal/access-code.ts` (D21), which returns one code string.
- The portal timeline query allowlists event kinds in SQL: Shared comments and attachments, plus status events that matter to the contractor (scheduled, started, sent back, approved, done). Date changes appear only as the current Target, never as history. Reassignments and other contractors are never shown.
- The DTO is `{kind, actorLabel, body, createdAt, attachments}` and never includes raw `data`.

**`PORTAL_ENABLED` flag.** Off by default; contractor sign-in, portal pages and portal uploads return 404 while it's off. It turns on only after:
1. the production load and the per-contractor "will see" report are reviewed;
2. the pure-function auth suite passes in CI;
3. a manual production check with a test contractor confirms they can't open another task's file, call a staff action or see Internal rows.

**Hardening:**
- page-level staff checks on the three Financials pages;
- separate signing keys per purpose (staff session, OAuth state), with `tests/devices/setup.ts` updated in the same commit;
- a static guard test with an explicit allowlist (login, password reset, move-in form, health, crons) that fails if any action or route skips its principal check, or if portal code imports staff modules.

**Logging.** `SecurityEvent` records sign-in OK and failed, password changed or reset, sessions revoked, and lockbox viewed.

### 5.2 Data model

All changes are additive. The new status values go in **their own migration file**, because Postgres can't use a new enum value in the same transaction. Every new table enables RLS. Each migration is applied to a restored production copy before pushing. **Roll forward only** after the status migration lands: an instant rollback would crash on the new values.

| Change | Fields |
|---|---|
| `TaskStatus` | Keep `OPEN` (shown as "To do"), add `SCHEDULED`, `IN_PROGRESS`, `WAITING`, `REVIEW`, `CANCELED` |
| `Task` | `assigneeContactId` (FK; CHECK it's never set together with `assigneeUserId`), `scheduledFor`, `waitingOn`, `unitLabel`, `repeatRule` (JSON: frequency, interval, day of month, weekday for weekly), `repeatSeriesId`, `createdByUserId`, `completedByUserId` / `completedByContactId`, `taskTemplateId`, `appEditedAt`, `asanaLastSynced` (JSON), `asanaSyncedAt` |
| `TaskEvent` (new) | `taskId`, `kind` (COMMENT, CREATED, ASSIGNED, STATUS, DUE, SCHEDULED, PROPERTY, TITLE, NOTES, ATTACHMENT, CHECKLIST, ACCESS, REPEAT_CREATED, CONFLICT), `visibility` (SHARED / INTERNAL; system kinds INTERNAL), `actorUserId?`, `actorContactId?`, `actorLabel`, `body`, `data` JSON, `source` (app, portal, system, asana), `asanaStoryGid @unique`, `createdAt` |
| `TaskAttachment` | `eventId?`, `uploadedByUserId?` / `uploadedByContactId?`, `visibility`, `kind` (IMAGE, VIDEO, FILE, LINK), `pathname @unique` (nullable for LINK), nullable `size`, `linkUrl`, `thumbPathname`, `posterPathname`, `width`, `height`, `durationSec`, `asanaGid @unique`, `deletedAt` |
| `TaskChecklistItem` (new) | `taskId`, `title`, `done`, `doneAt`, `doneByUserId?` / `doneByContactId?`, `assigneeUserId?` / `assigneeContactId?`, `dueDate`, `position`, `asanaGid @unique` |
| `TaskReadState` (new) | `taskId`, `userId?` / `contactId?`, `lastSeenAt`. Powers "2 new" on My jobs now and staff badges in week 2 |
| `TaskTemplate` (new) | Per `docs/task-templates-plan.md`, amended: items reference a user or contact; `sourceAsanaSectionGid` |
| `Contact` | `phoneE164`, `asanaGid @unique` |
| `User` | `asanaGid @unique` ("sign out everywhere" for staff moves to week 2) |
| `PortalAccount`, `PortalSession`, `PasswordResetToken`, `TaskAccess`, `SecurityEvent`, `NotificationOutbox` (new) | Per 5.1 and 5.4 |

**Helpers in `src/lib/task-scope.ts`:**
- `activeTask`: every status except DONE and CANCELED. It replaces every literal `status: "OPEN"`, and a test greps for that literal.
- `taskScope`: excludes Template rows. Used by every list, count and search, including `/api/search`, with a test that every task query uses it.
- `assigneeLabel(task)`.

**Overdue** means active, due before today, and not Waiting or Review. `todayYmdEastern()` in `src/lib/dates.ts` (tested) backs every server-side Today and Overdue comparison. Sorting by status uses an explicit order.

**Services:**
- Pure write logic lives in `src/lib/tasks/core.ts`. It takes a transaction and a `Principal` (staff, contractor, system, `system:asana`) and builds events, access rows, outbox rows and the next repeat copy.
- `src/lib/tasks/service.ts` wraps it, then revalidates.
- `system:asana` never writes outbox rows, and a test enforces that.
- `logDealTaskEvent` takes the transaction.
- `deleteOpenAutoTask` sets Canceled instead of deleting.

**Repeats.** When a task with `repeatRule` reaches Done (Approve, for contractor jobs), core creates the next copy:
- same title, notes, property, unit, assignee, repeat rule and series;
- checklist reset;
- the next due date is the rule's first date on or after today in Buffalo time, stepping from the previous due date (or from the completion date if there wasn't one) and keeping the pinned day, so a late finish never makes a copy that's already overdue: a monthly task due Jul 5 finished Oct 23 makes Nov 5, not Aug 5 (`nextRepeatDue` in `repeat.ts`);
- weekly rules pin the weekday the due date had when the rule was saved ("Every week on Monday"), as monthly and quarterly rules pin the day of the month, so moving one copy, earlier or later, doesn't move the series: the next copy steps from the date the series gave this copy (kept as `due` on the copy's CREATED line, or on the REPEAT_CREATED line for older copies), not its moved date. A Monday copy moved to the Saturday before still makes the next Monday a week on, every 2 weeks keeps Nov 2 then Nov 16, and a monthly Oct 30 copy moved to Nov 2 still makes Nov 30. A copy given a date off the pinned day (the rule was re-pinned since), the series' first task, yearly rules and rules saved before the pin step from the copy's own due date (`repeatFrom` in `repeat.ts`);
- one copy per finish: finishing a reopened task again reuses the copy that's still there, with no second "assigned you" email;
- reopening a Done task takes its copy back while nobody has touched it (still To do, no edits, comments, files, checked items, portal views or sent email; `isUntouchedCopy` in `repeat.ts`), so a tick by mistake leaves only the two status lines. Done to Canceled keeps the copy.

### 5.3 Files and media

**Upload kinds.** Staff `task-upload` and `portal-task-upload`.
- The server validates every requested path against `^tasks/<taskId>/(orig|thumb|poster)/[A-Za-z0-9._-]{1,100}$`, with random suffix on and overwrite off.
- Tokens are per type: images get an image allowlist and 25 MB; videos get MOV/MP4 and 500 MB. No SVG or HTML. Multipart above 8 MB, so a dropped part resends 8 MB, not the whole video.
- The portal kind checks access, and that the job is active, when the token is minted.

**Recording.** `recordAttachment(taskId, pathname)` ignores what the browser claims. It calls `head(pathname)` and requires:
- our private store's host;
- the task's path prefix;
- an allowed type;
- a size under the cap;
- no existing row with that path.

It stores head()'s values. Uploads still finishing after a contractor taps Mark done are accepted for 60 minutes; the button waits ("Finishing 1 upload…") until the queue drains.

**Uploader.** Built from `components/attachments.tsx` (private access), with the listings worker's 3-at-a-time loop switched to private. Progress, retry, a size check before upload, and the comment text sends first.

**`/api/files`:**
- **Who can fetch what.** Each kind lists the principals allowed to use it. Contractors get only `task` files that are Shared, not deleted, on a job they can access. Contractors never hit the old public-blob fallback.
- **Headers.** Always `nosniff`. `CSP: sandbox; default-src 'none'` on everything except PDFs, which get nosniff plus `default-src 'none'` (check Chrome, Safari and iOS inline PDFs on day 3). Anything that isn't an image, video or PDF downloads as an attachment.
- **Caching.** `private, max-age=31536000, immutable`, never public, so the CDN never answers without running the check.
- **Videos.** A 302 to a signed URL for that exact path, valid 10 minutes, so iPhone gets Range requests.

**Thumbnails for imported media.** The importer on Connor's Mac uses `sips` for 1024px JPEGs, including a JPEG copy of each HEIC, and `ffmpeg` for video posters if it's installed; otherwise a video tile. New uploads lazy-load originals until week 2.

**Real-iPhone test on day 4, through an HTTPS tunnel, before the composer is built.** It covers:
- HEIC with the chosen `accept` list;
- MOV playback through the signed redirect;
- upload with the screen locked;
- Android playback of HEVC (fallback: poster plus download).

### 5.4 Notifications

**Delivery.**
- Resend from a verified subdomain on the zone that actually serves hgcapitalpartners.com (check `dig +short NS`).
- Writes enqueue rows in `NotificationOutbox` inside the same transaction. `after()` sends immediately. A once-a-minute cron (Pro, guarded by `CRON_SECRET`) sends retries and bundled date changes.
- The importer never enqueues.

**The rule: email only crosses the staff/contractor line.**
- When **you or Pieter** change a contractor's job (assign, comment, status, Target date, notes), the contractor gets one email per job per 10-minute window: "Connor updated 'Cabinet install': moved to Fri; 'Doors arrive Thu'", with one "Open job" button.
- When a **contractor** changes their job (comment, photo or video, Start, Mark done), both of you get one email per job per 10-minute window.
- Nothing you or Pieter do to tasks without a contractor sends email, and you two never email each other.
- Internal notes never email the contractor.

**Volume.** Bundling plus the rule above keeps this to a handful a day. The free tier caps at 100 a day (D30). Sends are counted per day; if the cap is ever hit, the app logs it and shows staff a banner.

### 5.5 Asana backup and import

**The first build commit deletes the CSV importer:** `scripts/migrate/04-tasks.ts`, the tasks step in `run.ts`, and the "safe anytime" lines in `README.md` and `DEPLOY.md`.

**`scripts/asana/10-snapshot.ts`: the full backup (read-only)**
- Records `snapshotStartedAt` before the first call.
- Pulls every task in the project, including JMPL, Pieter and the playbook sections.
- Pulls each staff user's workspace tasks that aren't in the project, for review.
- Pulls every story (paginated), and every subtask recursively with its stories and files.
- Pulls the project brief and status updates, plus the files on the project's Key resources and inline in the brief.
- Saves the structured before/after values on system stories (dates, sections, assignees, names), not just Asana's sentence.
- **The one manual save on Oct 26 is Asana video messages:** the API can't reach them, so save each one by hand from the link the manifest lists. The project's Messages tab is also out of the API's reach, but it's acknowledged without saving, because Connor confirmed it has nothing worth keeping. Then finish with `--resume <dir> --ack-manual`; until then the snapshot reports `needs-manual-steps`.
- For each file: fetches a fresh download link right before downloading, retries on 403, and checks bytes on disk against the size. Dropbox, Drive, Box and external files are recorded as links.
- Output goes to `_private/asana-snapshot/<timestamp>/` with a manifest. A run that misses any file fails loudly with a list.
- The zip goes to a private Blob as the permanent archive.

**`scripts/asana/20-load.ts`: the open-task import**

*Targets*
- First runs against a `pg_dump` copy of production in its own local database (`hg_asana_dryrun`).
- Production writes use an owner URL from a gitignored `.env.prod-write`. The script prints the project ref and Task count, and requires `--confirm-prod ywdjaygwkqyrmbdnvaai`. A backup is taken right before.

*Scope*
- Imports only open tasks in HG sections, with all their stories, files and subtasks.
- JMPL, Pieter and completed tasks stay in the archive.

*Mechanics*
- Idempotent upserts by Asana ID. Files already uploaded are skipped. Notes and comments are stored as plain text, with the HTML kept in `data`. Asana task links are rewritten to `/tasks/<id>` after the load.

*People and visibility*
- **Identity:** a review list of every user ID found anywhere in the snapshot. Connor confirms the 11 contractor matches Monday.
- **people.json lives with the snapshot:** copy it from the trial snapshot into Monday's official one (or pass `--people <file>`), and replace any `contactId` in it with the id the production dry run prints.
- **Visibility (D16, D17):** imported comments and files are Shared. Open tasks assigned to a confirmed contractor get `TaskAccess`.

*Structure*
- **Subtasks** become checklist items. Their comments and files move to the parent, labeled "on checklist item: …". Project tasks that have a parent are skipped.
- **Playbooks** become `TaskTemplate` rows, keyed by section.
- **Playbook runs already under way** get `taskTemplateId`, so applying the playbook to that building again says what's still open (BPLAY-V01). A task on a building whose title is one of a playbook's items is linked to it, with fill-ins like "[Tenant]" matching what was typed. Items completed in the playbook since still count, since older runs have them open. A title two playbooks share ("Update SREO" is in NEW REFI and NEW PROPERTY) goes to the one with more of its items on that building, and a tie links nothing. A link is written once and never replaced. The Oct 26 snapshot links 42: the NEW REFI runs on 118 Congress (10), 765 Prospect (9) and 767 Prospect (10), NEW PROPERTY leftovers on five buildings (12) and one NEW TENANT task on 725 Linwood. Every dry run, load or delta, lists the new links by playbook and section.

*Reconciling with the CSV rows already in production*

The dry-run prints these lists for Connor to approve:
1. Open in Asana and already in the app: updated from Asana. App edits since August to property, status and notes are kept unless Asana changed the same field.
2. App-only tasks: kept.
3. **To delete (D25):** CSV rows completed in Asana or in the app, rows deleted in Asana, Template-bucket placeholders once templates exist, and CSV subtask rows whose parent isn't open. Each line shows its files.

The delete runs after a `pg_dump`, and only after Connor confirms again at that moment.

*Report*
- Counts per section, events by type, files and bytes.
- A per-contractor "will see" list.
- Imported text that looks like a lockbox code.

**`scripts/asana/30-delta.ts`: daily from Oct 26 to cutover**
- Starts from `snapshotStartedAt` minus one hour.
- Re-lists sections (section moves don't change Asana's `modified_at`) and re-fetches subtasks.
- Stories and files are append-only and always imported. New open tasks are added.
- Task fields use a three-way merge against `asanaLastSynced`. "Completed in Asana" always applies, and the task stays as history.
- `appEditedAt` is set only by app writes, never by `@updatedAt`.
- Conflicts become Internal CONFLICT events, which Connor reviews daily.

### 5.6 Device check and local setup

- This worktree gets its own database (`hg_capital_asana`) and `.env`. Never `migrate dev` against the shared `hg_capital_dev`.
- `tests/devices` gains a portal route class. A local-only seed creates a contractor account, session and access for one fixture contact; it refuses non-localhost, like `db:dev-passwords`.
- `SAMPLE_PARAMS` gets every new dynamic route. A redirect to sign-in from a portal page counts as an error.
- Email templates get a manual check in iOS Mail and Gmail.

---

## 6. Screens (picked in the grilling)

### Today (staff)

**Mine / Contractors columns.**

On desktop:
- **Mine (left):** Unassigned, Overdue ("Move all to today"), Today, Waiting, then No date (collapsed).
- **Contractors (right):** Needs review (Approve / Send back) on top, then each contractor's active jobs with status and target date.

Tablet and phone: a Mine | Contractors switch at the top, with two-line rows; the whole row opens the task. "All" is a second tab with the same rows, plus filters and Done.

```
DESKTOP 1280
MINE                               | CONTRACTORS
Overdue (2)    [Move all to today] | Needs review (1)
 ( ) Call plumber, 767   Mon red   |  Fix front steps  Zack [Approve]
 ( ) Order laundry tub   Fri red   | Zack (3)
Today (2)                          |  Cabinet install u2  In prog  Thu
 ( ) Appraisal follow-up Today     |  Bathroom tile       Sched    Fri
No date (14) >                     | Jacob (2)
                                   |  Mini splits u5      Sched    Fri
PHONE 375 / TABLET 768
[ Mine | Contractors ]
 ( ) Call plumber, 767 water line
     767 Prospect . Mon (red)
```

### Task page (staff)

**Page with side rail.**
- **Main column:** status, title, notes, checklist, photos and videos, activity (repeat reschedules collapsed into "Due moved 3×"), and a composer with camera, files and a Shared/Internal switch (Shared by default).
- **Rail:** Assignee, Status (with Waiting reason and Scheduled date), Due, Property, Unit, Repeats, Lockbox (when a contractor will see it), Created by.
- **Review banner:** "Zack marked this done · 4 photos [Approve] [Send back]".
- **Tablet:** the rail becomes a chip row.
- **Phone:** one column, chips scroll sideways, and the composer sticks to the bottom.

### My jobs (contractor)

Open | Done, plus **By date | By property** (By date first; the choice is remembered). Cards show title, address and unit, status, Target date, and a "2 new" badge. The computer view is the same, centered.

### Job page (contractor)

**One scroll with a bottom bar:**
- status and title;
- address with Directions and Copy;
- lockbox (D21);
- notes;
- checklist (tickable);
- photos and videos;
- updates and a composer.

The sticky bar holds "Add photo/video" and the next step (Start job, then Mark done). Mark done asks "Add photos of the finished work?", then confirms: "Sent to Connor and Pieter. You'll get an email if anything else is needed."

### The 8 smaller screens (approved as a batch)

1. Shared sign-in with first-password and forgot-password pages.
2. Portal access card.
3. Reschedule popover or sheet with the Undo toast.
4. Review banner and Send back note.
5. Apply playbook flow.
6. Repeats field.
7. Plain emails with one button.
8. Label and status-chip updates to existing pages: Contractors in the nav, Home's card linking to Today, property task list chips, and contractor job list by real assignment.

---

## 7. Reuse check

From `docs/components.md`:

| Job | Status | Use |
|---|---|---|
| Card, Button, Badge, fields, PageHeader, EmptyState | **Reused** | `components/ui.tsx` |
| Touch sizes | **Extended** | Button, Input and Select go to 44px on touch, in the primitives (Known gaps) |
| Status chip | **Reused** | `Badge` with one tone per status. To do and Scheduled gray and blue, In progress purple, Waiting amber, Review red, Done green, Canceled gray. Avatars use neutral colors so they don't collide |
| Done checkbox | **Extended** | `tasks/task-checkbox.tsx`, 44px hit area |
| Mine/Contractors, Open/Done, By date/By property, Shared/Internal | **Extended** | Extract `SegmentedControl` from `deals/filters.tsx` into `components/` (Duplicates) |
| Today / All | **Reused** | `TopTabs` (separate routes) |
| Inline title edit | **Extended** | `InlineAddressField` generalized |
| Back link | **Reused** | `BackLink` |
| Timeline | **Extended** | The deal timeline moves to `components/activity-timeline.tsx` |
| Uploads | **Extended** | `components/attachments.tsx` plus the listings concurrency loop |
| Popover, sheet, menu, date picker | **New** (Known gaps) | React Aria Components (D9), each built inside its first screen |
| Toast | **New** (Known gap) | One region in the shell, with Undo |
| Avatar, media grid, lightbox | **New** | Refs: Asana lightbox, Meetup, eBay video badge |
| Payoff state | **New** (Known gap) | Contractor Mark done, login created |
| Portal shell | **New** | Minimal layout, app tokens |
| Icons | **Reused** | `lucide-react` |

New components get a `docs/components.md` row in the same commit, with Mobbin refs in the commit message.

---

## 8. Schedule and cutover runbook

One build session owns the schema and lands in order. Every push deploys to production. **Nothing is cut:** if a day slips, the days after it shift, and cutover moves with them (the extra Asana month covers it).

| Day | Date | Build | Needs you |
|---|---|---|---|
| 1 | Fri Oct 23 | Worktree DB and baseline device check. `10-snapshot.ts` (Q27 approval) and the trial run | `ASANA_TOKEN` in `.env`. Buy the Asana month. Upgrade Vercel and Supabase to Pro. Create a Resend account and add its DNS records. Set `RESEND_API_KEY` and `CRON_SECRET` in Vercel. `.env.prod-write`. **"Build it"** |
| 2 | Sat Oct 24 | Production copy. Schema batch tested on it. `core.ts`, services, scope helpers, Eastern "today", overdue labels. Delete the CSV importer. Land | Approve the migration |
| 3 | Sun Oct 25 | `20-load.ts` with reconciliation, visibility and reports, against the trial snapshot and the production copy. File and upload hardening | |
| 4 | Mon Oct 26 | **Official full backup.** `30-delta.ts`. Real-iPhone media test. Contractor accounts, one login, first-password and reset, flag off. Device-check portal fixture | Review the dry-run lists, contractor matches and "will see" report. Write the recurring-tasks list |
| 5 | Tue Oct 27 | Backup, then **production load** and delta. Today (Mine / Contractors), reschedule, toast, phone rows. You and Pieter start in the app | Approve the load. Confirm the D25 delete |
| 6 | Wed Oct 28 | Task page with rail, timeline, composer, media, statuses and Review, checklist, assignee picker, unit, Repeats, Apply playbook, Portal access card | Design check |
| 7 | Thu Oct 29 | Portal: My jobs, job page, lockbox, uploads, Start and Mark done. Outbox and emails. Auth suite in CI. Production isolation check. **Flag on. Invite every contractor** | Create logins and send the texts |
| 8 | Fri Oct 30 | Fix what contractors hit. Delta. Full device check | Review conflicts |
| 9 | Sat Oct 31 | Buffer. Pointer comment on open contractor tasks in Asana (posted by you) | Post the pointer text |
| 10 | Sun Nov 1 | **Cutover:** last delta, archive zip to private storage, Asana project archived. You two are done with Asana; the insurance month runs out on its own | |

---

## 9. After cutover

- **Week 2:** the list in section 4.
- **Weeks 3 to 5** (structure, per D10):
  - sidebar with properties;
  - property hub with tabs;
  - Home as "what needs me";
  - phone bottom bar;
  - Settings merged (QuickBooks moves in);
  - Contractors directory with portal status;
  - W-9 and COI tracking through the portal;
  - tenant maintenance requests;
  - Brandon's property-wide access if wanted.
- **Then:** screen-by-screen redesign of Deals, Portfolio, Financials and the public site, plus automated SMS.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Asana ends before the import | Trial backup this weekend, official Monday; insurance month |
| Contractors see something private | Fail-closed accounts; SQL allowlist on the portal timeline; flag off until the "will see" report and isolation checks pass. You chose Shared defaults and visible notes, so internal notes need the Internal switch |
| Lost or stale data in the overlap | Append-only stories and files; three-way field merge; daily conflict review; CSV reconciliation lists approved before load |
| Irreversible delete (D25) | Runs only after a `pg_dump`, from an approved list, with a second confirmation |
| A failed migration blocks deploys | Enum change in its own migration; tested on a production copy first |
| Contractor passwords | A starting password sent by text must be changed at first sign-in. Sign out everywhere, Remove access, and a log of sign-ins |
| Free email cap | Daily count and a staff banner; upgrade when hit |
| Big videos over bad signal | Size check, multipart, retry, text sends first, Done waits for uploads |
| Non-Apple phones | Poster plus download fallback |
| Scope versus 10 days | Nothing cut by choice; cutover moves if needed, covered by the insurance month |

---

## 11. Cost

| Item | Monthly | Notes |
|---|---|---|
| Vercel Pro | $20 | D2 |
| Supabase Pro | about $25 | D3 |
| Vercel Blob | about $1 | Open-task files plus new uploads; the archive zip is a few GB |
| Resend | $0 | Free plan for now (D30) |
| Asana Starter | one month, one time | D1 |
| Asana subscription | saved | |

---

## Appendix: key references

**Task views:**
- Todoist Today and Reschedule (mobbin.com/screens/858c686b, 7ff218cf)
- Date quick picks (6c83da1c, 7adaedae)
- Attio tasks (16b2e7b2)

**Task page:**
- Asana pane (95628ff8)
- Linear stream (2e6c00de)
- Plain internal note (4d106469)
- Basecamp visibility (d3099d1c)
- Todoist composer media (887a0cd7)
- Lightbox (7b251dec)

**Approval:**
- Asana approval (e94342b0)
- Aboard (002ebeab)
- Toggl send back (1daab8f4)

**Contractor:**
- Jobber job (96d24bf8, 536351e7)
- Angi projects (4ea190d7)
- Aboard guest invite (3f15fd99)
- Grab Driver bottom bar (b215c37b)

**Structure:**
- Attio sidebar (d76ba56f)
- Zillow Rentals property tabs (cc09445f)

**Code:**
- `src/lib/auth.ts:8-23`
- `src/app/api/files/[kind]/[id]/route.ts:41-47`
- `src/app/api/blob/[kind]/route.ts:30-34`
- `src/lib/dates.ts:124`
- `src/lib/tasks/service.ts:115-119,138-144,164-176`
- `scripts/migrate/04-tasks.ts:116-128`
- `node_modules/@vercel/blob/dist/client.d.ts:346`
