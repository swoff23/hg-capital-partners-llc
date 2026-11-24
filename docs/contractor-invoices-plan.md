# Contractor invoices: MVP

**Status:** spec, agreed Nov 20, 2026; every screen and small call settled Nov 21 (section 6). Waits for an explicit "build it". It replaces the Oct 23 plan, which now lives at [specs/contractor-invoices/full-plan.md](specs/contractor-invoices/full-plan.md) with its Nov 20 re-review, for the pieces this MVP leaves for later (section 9).

**The idea in one line:** contractors upload, reply with or forward an invoice; Connor or Pieter loads it, tacks it onto jobs, approves it and marks it paid; the contractor sees where it stands.

Drawing: [specs/contractor-invoices/01-mvp-flow.svg](specs/contractor-invoices/01-mvp-flow.svg).

---

## 1. Goal

- **One place for every contractor invoice,** so nobody hunts through texts and email to see what's owed or paid.
- **Light for contractors.** Nobody changes how they bill. They can tap Send invoice on a job, reply to a job email with the bill attached, or forward it to the invoice address.
- **Money doesn't move in the app.** Connor or Pieter pays in Baselane (or by check) as today, marking the invoice paid in the app as they send the money (M8).
- **No AI and no new setup.** A person types the few fields. Reading invoices with Claude comes later if volume asks for it.

---

## 2. What we found (Nov 20)

- **Receiving mail already works.** Resend receives for `mail.hgcapitalpartners.com` (MX live since Nov 14) and posts every email to one webhook, `src/app/api/email/inbound/route.ts`, which checks the Svix signature with `RESEND_WEBHOOK_SECRET` and hands job replies to `src/lib/email/replies.ts`. Anything else is answered 200 and dropped today. So `invoices@mail.hgcapitalpartners.com` works with no DNS change.
- **A reply on a closed job** (Done or Canceled) is forwarded to both partners with its files and posts nothing (replies.ts, rule 3). A reply on an active job, In review included, posts as a comment.
- **A From line can be forged.** The reply path trusts a sender only when Resend reports `authentication.dmarc === "pass"` and the From holds a single address (`replies.ts`, `inbound.ts` `singleAddress`). Invoices follow the same rule.
- **Received mail counts toward Resend's quota** (3,000 a month and 100 a day on Free, shared with job emails). At MVP volume that's fine; go Pro ($20 a month) if the daily cap gets close.
- **Who jobs sit on (prod, Nov 20):** 11 of 40 jobs finished since June have a contractor assigned and 27 sit on Connor or Pieter (28 of the 40 came from Asana). 21 of 114 open jobs have a contractor. So an invoice must be linkable to any job, whoever it sits on.
- **Job links get forwarded to crews.** A job-email link opens a one-job session (`PortalSession.onlyTaskId`, `src/lib/portal/job-link-paths.ts`). Whoever holds it isn't necessarily the contractor.
- **PDFs can't go in a sandboxed frame:** a sandbox blanks the browser's PDF viewer, which is why `src/lib/attachments/headers.ts` leaves it off PDFs. Lightbox's `DocumentStage` already shows a PDF in a frame on a mouse device and as a file card on touch.

---

## 3. Decisions

| # | Topic | Decision |
|---|---|---|
| M1 | Scope | A lightweight MVP. Everything in section 9 waits until real use shows a need |
| M2 | Ways in | (a) **Send invoice** in a portal job's bottom bar once the job is In review or Done, signed in. (b) **Reply** to a Done job's email with the bill attached. (c) **Forward** to `invoices@mail.hgcapitalpartners.com`, by a contractor or a partner. (d) **Staff enter** one: New invoice, or **Use as invoice** on any job file |
| M3 | Fields | Contractor, invoice number (optional), invoice date (defaults to the day it arrived), total, jobs (zero or more), a note only staff see, and the files (zero or more: an emailed amount or a "View invoice" link with no PDF still lands, and New invoice saves with no file; picked Nov 21, [13-no-file.svg](specs/contractor-invoices/13-no-file.svg), A). The portal's Send invoice still needs one file |
| M4 | Stages | **To review**, then **To pay**, then **Paid**. **Not an invoice** clears junk, work photos and duplicates (soft delete, staff only). Contractors see **Received**, **Approved**, **Paid** |
| M5 | Approve | Needs a contractor and a total above zero. Jobs are optional. Either partner approves or pays any invoice |
| M6 | Staff entry | An invoice a partner enters, or makes with Use as invoice, is a To review invoice like any other: its fields save as you leave them, and the partner's own **Approve** moves it to To pay. One tap, no second partner, no staff email. A half-entered one waits in To review (picked Nov 21, [12-new-invoice.svg](specs/contractor-invoices/12-new-invoice.svg), A) |
| M7 | Which jobs | Staff can tack on any job that isn't Canceled, whoever it's assigned to. A contractor's Send invoice links the job they sent it from, and shows only on their jobs In review or Done (picked Nov 21). A job can have several invoices |
| M8 | Mark paid | **Mark it paid in the app as you send the money** (picked Nov 21, [14-pay-once.svg](specs/contractor-invoices/14-pay-once.svg), A): open the invoice, Mark paid, then send it in Baselane, so the other partner sees Paid before paying too. A working rule for Connor and Pieter, in the launch note, not UI copy. One invoice at a time: paid date (today by default), method, and an optional check number or note. A toast offers Undo; **Undo paid** in the ⋯ menu puts it back in To pay |
| M9 | Methods | Baselane transfer (default), Check, Zelle, Venmo, Cash, Card, Other. Card stays separate because card payments are reported on 1099-K, not 1099-NEC |
| M10 | Duplicates | "Possible duplicate" shows on the invoice when the same contractor and invoice number (compared ignoring case, spaces, hyphens and leading zeros) or the exact same file (SHA-256) already exists, linking the other one. It warns; it never merges or blocks |
| M11 | Sender | A forwarded or emailed invoice gets its contractor only when DMARC passes, the From is a single address, and it matches exactly one contractor's login email (`PortalAccount.email`) or contact email (`Contact.email`), compared case-insensitively with `escapeLike` as `replies.ts` does. Otherwise the contractor is blank with "Who's this from?", and staff pick one. The picker lists every unarchived contact, active contractors first, plus the invoice's current contact. Review never creates a contractor |
| M12 | Staff hear | One email to both partners, bundled over 10 minutes, for new invoices in To review. Skipped for a partner's own forward (DMARC-verified), for job replies (their forward already went) and for a partner's own entries (source `STAFF`). At send it drops any invoice no longer in To review. Home's Needs you shows one roll-up row, "2 invoices to review" |
| M13 | Task page | A job's invoices list on its task page, one line each: number, total, stage |
| M14 | Contractor view | Each invoice on its job page with Received, Approved or Paid. A **Your invoices** page (`/p/invoices`), opened from a new item in the account menu with My jobs as the way back, lists all of theirs, with or without a job (picked Nov 21). Since Nov 24 it's the Invoices tab in the portal's bar instead, beside Jobs, and the menu item is gone ([contractor-top-nav.md](specs/contractor-top-nav.md)). A portal invoice shows at once as Received, in every stage but Not an invoice; every other source (email, reply, staff entry) shows only while it's in To pay or Paid, so a misfiled or half-entered invoice never shows to the wrong contractor. The job page's Invoices section shows only when that job has an invoice of theirs, and never in a link session |
| M15 | Contractor email | A **Paid** email (subject "Paid: Invoice #1043, $850.00", or "Paid: Invoice, $850.00" with no number; the date and method in the body), under the job email rules they already have: only when `jobEmailState` is on (a login, signed in once, Job emails switch on). Its one button opens Your invoices (`/p/invoices`, through sign-in), never a job link, and it carries no reply token, so a "thanks" reply goes to the plain reply address. It waits out the Undo window and re-checks the stage before it sends. The portal shows Paid only after the same window. Nothing on arrival or approval |
| M16 | Link sessions | A one-job link session never sees invoice amounts, files or the Your invoices list. Send invoice from one asks them to sign in (the existing `/login?next=` redirect). Replying to the job email works for everyone |
| M17 | No edits by contractors | A contractor who sent the wrong file sends again; staff mark the old one Not an invoice |
| M18 | Nav | **Invoices** in the staff nav between Tasks and Contractors, with no count (Needs you carries it) |

---

## 4. How each way in works

### 4.1 Send invoice (portal)

In the job page's bottom bar, for a signed-in contractor, once the job is In review or Done (picked Nov 21, [09-send-invoice-bar.svg](specs/contractor-invoices/09-send-invoice-bar.svg), B1). In review, Send invoice takes the place of today's disabled "In review" button, beside Add photo/video while that still shows; on a Done job it gets the bar to itself (Done jobs have no bar today, so the bar is new there, and its sheet and uploader live outside `JobActions`, which Done jobs don't render). To do, Scheduled, Waiting and In progress jobs show no Send invoice; replying to the job email works at any status. A sheet: files (PDF or photo, at least one, through `useMediaUploader` and `MediaUploadTray`, held by `LeaveGuard` while they go up), invoice number (optional), total (optional), **Send invoice**. The sent state follows the Sent screen pattern (components.md): "Thanks, Zack!", "Sent to Connor and Pieter. You'll get an email when it's paid." (or "Check back here to see when it's paid." from `payoffLine`'s `getsEmail` branch), and the invoice as it now shows on the job, Received.

### 4.2 Reply to a done job's email

In `replies.ts`, a reply on a Done job that carries a PDF or image keeps today's forward to both partners, now with a line "Added to Invoices to review", and also creates a To review invoice linked to that job. Its contractor comes from the reply token (already proven), its files are saved as invoice files. Fields start empty except the contractor and job. Replies on active jobs stay comments; staff use Use as invoice on the file. A work photo that lands this way gets Not an invoice. Idempotent per Resend email id.

### 4.3 Forward to invoices@

`/api/email/inbound` routes by recipient before the reply path: `r+<token>@` and `jobs@` go to `replies.ts` as today; the invoice address goes to `src/lib/invoices/inbound.ts`. It fetches the email and its files from Resend inline (as replies.ts does), stores an `InboundEmail`, and creates one To review invoice with the body text and files, once per Resend id, with or without files (M3). The invoice keeps the whole text body, not `replyBody`'s cut at "Forwarded message", and keeps its links (`htmlToText` strips them today, so the HTML's `href`s are kept alongside), so a forward's invoice text and a Square or Jobber "View invoice" link survive. Auto-replies are ignored (`isAutoReply`). The contractor is set per M11. Past 50 invoice emails a day (Eastern), or 10 from one sender, the rest are dropped and counted, and the Invoices page says how many. A DMARC-verified forward from a partner's own address counts toward neither cap, so a launch-day backlog of forwards all lands. Make the router generic, since `deals@` (roadmap) and `draws@` (rehab-draws.md) are planned on the same webhook.

### 4.4 Staff entry

**New invoice** on the Invoices page opens the invoice page empty, with a drop zone for the file; the row is made in To review when the first file drops or the first field saves, so the upload has an invoice to belong to (`invoice-upload`'s parent). **Use as invoice** in a job file's menu (`FilesList`'s row menu and `MediaGrid`'s `menuItems`, so the task page's Photos and files and the Activity strips; images and documents, never videos or links) opens it with that file and job filled in. The file is copied server-side (one Blob copy) into the invoice's own private path, so removing the job's file or deleting the job never touches the invoice. Both are To review invoices until the partner taps Approve (M6).

---

## 5. Data and code

### 5.1 Tables

New tables, with RLS like every new table (README, Rules of the road). Money as `Decimal(12, 2)`.

- **`Invoice`:** contact (null until known), source (`PORTAL | REPLY | EMAIL | STAFF`), stage (`REVIEW | TO_PAY | PAID | NOT_INVOICE`), invoice number, `invoiceNumberNormalized`, invoice date, total, note, approved at and by, paid date, method (`BASELANE | CHECK | ZELLE | VENMO | CASH | CARD | OTHER`), paid note (check number), paid by, creator (at most one of user or contact, CHECK; neither for an emailed invoice or a system write, where `InboundEmail.from` or the event's actor label says who), inbound email, timestamps, `deletedAt`. The invoice number is saved without a leading "#"; `invoiceNumberNormalized` keeps letters and digits only, lowercased, leading zeros dropped.
- **`InvoiceTask`:** invoice and task, unique together; keeps the job title at link time. `taskId` is nullable with `onDelete: SetNull`, so a deleted job reads as its kept title with no link.
- **`InvoiceFile`:** private Blob metadata (the same shape as `TaskAttachment`'s file fields), always the invoice's own copy, plus `sha256`.
- **`InvoiceEvent`:** the history (kind, actor user or contact, both nullable, actor label always set, data, time): arrived, edited, file added, approved, reopened (Back to review), paid, undone, not an invoice, restored.
- **`InboundEmail`:** Resend email id (unique), recipient local part, from, subject, received time, text body, DMARC result, status, and a nullable invoice link. Generic so other inboxes can use it later.

### 5.2 Services and access

- **All writes** go through `src/lib/invoices/service.ts`, each writing its `InvoiceEvent` in the same transaction. Nothing under `src/lib/invoices/` imports staff auth, QuickBooks, `tasks/service` or `tasks/attachments`, so the portal can use it; `src/lib/auth-guard.test.ts` adds `src/lib/invoices` to `PORTAL_DIRS` to hold that.
- **Concurrency:** every stage move (Approve, Back to review, Mark paid, Undo paid, Not an invoice, Undo) updates only a row still in the stage it expects, and a field save only a row still in To review, so two partners acting at once can't double-pay, double-undo or reopen a paid invoice; the second gets "Pieter already marked this paid". Back to review clears approved at and by. This guards the app's record only: money moves in Baselane, so the rule for paying is in M8.
- **Money math:** list counts and totals come from SQL sums of the Decimal column; any sum in JS counts integer cents, as `src/lib/draws/figures.ts` does. Totals are always positive; parse typed totals strictly (not `parseAmount`, which takes "k" and a minus sign).
- **Staff:** `requireUser()` on every page, action and route.
- **Contractors:** `requirePortalPrincipal()`; only invoices with their contact id, never Not an invoice, non-portal ones only in To pay or Paid (M14), nothing at all in a link session (M16). Send invoice can link only a job they have live `TaskAccess` to; `portal-invoice-upload` takes that job's id as its parent, already access-checked, and the send records the files onto the new invoice.
- **View-as** (docs/specs/view-as.md) refuses Send invoice, with a test, in whichever feature lands second.
- **Files** through `/api/files/invoice/<id>` with the same checks and `fileResponseHeaders` unchanged; a new private upload kind pair (`invoice-upload` for staff, `portal-invoice-upload` for contractors) in `src/lib/attachments/upload-kinds.ts`. HEIC from the portal converts in the browser as today; an emailed HEIC is stored and downloads.

### 5.3 Emails

- **The drain needs an invoice branch.** As built, `drainDue` (`src/lib/notifications/outbox.ts`) closes any row with no task ("no task") and any contractor row without live `TaskAccess` to that task (`deliveryFor`, "no access"), and the rest of the drain reads the task. Invoice rows carry an `invoiceId` and no `taskId` and take their own short branch: no task read, no `TaskAccess` check.
- **Staff (M12):** one bundle row per partner (`u:<id>:invoices`), "3 new invoices to review", linking to `/invoices?view=review`; it needs only the recipient user.
- **Paid (M15):** one row per invoice for its contractor, sent when `jobEmailState` is on, after the Undo window, and only if the invoice is still Paid and still that contractor's. Its link is `/p/invoices`.
- **Toasts say who heard,** read from the same `jobEmailState` with the words `comment-card.tsx` already uses: "Marked paid · Zack gets an email", "· Zack hasn't signed in yet", "· Zack's emails are off", "· Zack has no login yet", with Undo.

---

## 6. Screens

All sizes: laptop 1280x800, tablet 768x1024 (touch layout), phone 375x667, checked down to 320. Drawn Nov 21 in [specs/contractor-invoices/](specs/contractor-invoices/) (02 to 11); where a screen had options, the pick is named below. The drawings are the reference for the build, except where 6.1 and drawing 11 changed them later: the ⋯ menu's place and Paid's bar in 03 and 04, Mark paid's title, its closing on a conflict and its focus in 04. 01 is the Nov 20 scope sketch, superseded by 02 to 11.

1. **Invoices page** (`/invoices`): header with **New invoice**; a `SegmentedControl` with counts, To review · To pay · Paid, the pick in the URL (`?view=`), as the Draws page does; one list (contractor, invoice number, jobs, date, total, flags) as a table on computer and tablet, rows on a phone. Paid lists newest first. Flags are an icon plus one word in `--warn` (Possible duplicate, Who's this from?), never a fill alone, and sit under the contractor's name in the first column; on a phone they lead the row's second line (picked Nov 21, [02-invoices-page.svg](specs/contractor-invoices/02-invoices-page.svg), option A). Empty states: "Nothing to review. New invoices land here." and one line for each other view. A line when invoice emails were dropped over the cap.
2. **Invoice page** (`/invoices/[id]`, `/invoices/new`): the file beside the fields on computer, the PDF in a frame on the left and the fields in a 420px column on the right, so the file stays in view while you type (picked Nov 21, [03-invoice-page.svg](specs/contractor-invoices/03-invoice-page.svg), option A; Lightbox's `DocumentStage`; images through `Lightbox`); a file card on top on tablet and phone, then the fields, then a fixed bottom bar. The bar holds only the next step: **Approve** in To review, **Mark paid** in To pay, and no bar once Paid (the paid line sits under the title). The ⋯ menu is on the title line (6.1, item 1). History below. A forwarded invoice shows "From the email Zack sent Nov 18" and its body text, three lines with Show more. With no file, the email card takes the file's place. While in To review, **Add the invoice file** sits under the file or the email card, so a PDF that turns up later can be dropped on (a "file added" history line); To pay and Paid are read-only, and Back to review reopens them. References: [Airwallex review bill](https://mobbin.com/screens/d6fa70dc-46b6-41e0-9771-d61e758980a3), [Remote](https://mobbin.com/screens/5a02d53a-4cc4-411a-ba45-3d0b7c1f0f54).
3. **Mark paid** in a `FormSheet`: date, method, check number or note, **Mark paid · $850.00**. Reference: [HoneyBook](https://mobbin.com/screens/4a1b5a54-7cf4-4c16-88ae-ae508ade10c3) (the total in the button).
4. **Task page:** the job's invoices (M13) in their own Invoices section in the main column, between Checklist and Photos and files, with rows like the files list (number, then total and stage in fixed columns). The same at every size, one line at 320 (picked Nov 21, [05-task-page.svg](specs/contractor-invoices/05-task-page.svg), option B).
5. **Portal job page:** Send invoice in the bottom bar (4.1), the sheet and its sent state, and the job's invoices listed in an Invoices section with no button of its own ([06-portal-job.svg](specs/contractor-invoices/06-portal-job.svg), option B, and 09-send-invoice-bar.svg, B1). References: [Turo repair invoice](https://mobbin.com/screens/4c38490a-a4aa-446d-bb11-d55fd5c25bb5), [Mercury submitted](https://mobbin.com/screens/bba69488-ff37-4905-9c3d-161c1e489f39).
6. **Your invoices** at `/p/invoices` (M14): its own list page from the account menu, newest first, each row the invoice number, the job or "No job", the total and the stage word with its date in one fixed spot; empty, "Invoices you send show up here." ([07-your-invoices.svg](specs/contractor-invoices/07-your-invoices.svg), option C). Under the title, one quiet line with the invoice address and **Copy** ("Or email them to invoices@mail.hgcapitalpartners.com" on laptop and tablet, the address alone on a phone); the empty state adds "You can also email them to" the address with **Copy address** (picked Nov 21, [15-invoice-address.svg](specs/contractor-invoices/15-invoice-address.svg), B). Reference: [Remote invoice list](https://mobbin.com/screens/9d28f831-4dbd-438f-83c7-466dcad13a7f).
7. **Home:** the Needs you roll-up row.


### 6.1 Small calls (all decided Nov 21)

Most are already drawn this way in the screens; 1 and 2 have their alternative in [10-small-visual-calls.svg](specs/contractor-invoices/10-small-visual-calls.svg).

1. **Decided Nov 21 (1A).** **The invoice page's ⋯ menu** sits on the title line, as on every other record page (`RecordMoreMenu`); the bottom bar holds only the next step. It holds, by stage ([11-more-menu.svg](specs/contractor-invoices/11-more-menu.svg)): To review: Copy link, then Not an invoice. To pay: Back to review, Copy link, then Not an invoice. Paid: Undo paid, Copy link (no bar, and no Not an invoice once it's paid). Not an invoice is red, after a line, and goes at once with a toast and Undo.
2. **Decided Nov 21 (2A).** **Stages read as one plain word** everywhere, the contractor's job page included: Received, Approved, Paid with its date.
3. **Decided Nov 21, as drawn.** **Invoices page:** Paid has no count in the switch (three counts overflow at 320). To review and To pay sort oldest first; Paid sorts newest first and its Date column is the paid date. A row with no contractor shows the sender's email in `--muted-foreground` where the name goes, or "No contractor" for a staff entry. Empty lines: "Nothing to pay. Approved invoices land here." and "No paid invoices yet." The cap line shows on the day it happened: "4 invoice emails over today's limit weren't saved." Nav icon: lucide `ReceiptText`.
4. **Decided Nov 21, as drawn.** **Invoice page:** the title is "Invoice #1043", or "Invoice from Zack", or "Invoice". To review fields save as you leave each one; after Approve they turn read-only and Back to review reopens them. Several files show as a file switch above the frame (file cards stacked on touch). Possible duplicate stays until the invoice is gone; no dismiss in the MVP. Not an invoice is a toast with Undo, no confirm. A disabled Approve says why under the buttons: "Add a contractor and a total to approve." A forwarded email's body shows three lines with Show more.
5. **Decided Nov 21, as drawn.** **Mark paid:** the sheet's title is "Invoice #1043 paid" (Draws' "Draw 3 funded" pattern) with the primary "Mark paid · $850.00". It doesn't put focus in the optional note, so a phone keyboard doesn't jump up. If the other partner already marked it paid, the sheet closes, the page shows Paid, and the toast says "Pieter already marked this paid."
6. **Decided Nov 21, as drawn.** **Task page:** a line shows the contractor's first name only when a job's invoices come from more than one contractor. An invoice with no number shows its invoice date. No flags here. **New invoice** sits first in the task's ⋯ menu, above Copy link and Delete task, and opens New invoice with this job ticked; the Invoices section itself shows only when the job has an invoice (picked Nov 21, [16-task-new-invoice.svg](specs/contractor-invoices/16-task-new-invoice.svg), A). A canceled job still lists its invoices. Paid keeps `--ok` next to the Done mark, since both mean finished. Invoice events don't post to the job's Activity in the MVP.
7. **Decided Nov 21, as drawn.** **Contractor job page:** the Invoices section sits after Checklist and before Photos and files. Tapping an invoice opens its file in the viewer (signed in only). The sheet keeps one way to add a file. The sent screen's button is "Back to my jobs", the art is the building photo or the job-done `SpotArt`, and `payoffLine` gains the invoice pair. After sign-in from a job link, `?do=invoice` reopens the sheet.
8. **Decided Nov 21, as drawn.** **Your invoices:** each row's date is the day it was sent. The page shows Paid only once the Undo window has passed, so a contractor never sees Paid flip back. A Received invoice sent with no number or total reads "Invoice" and a dash.
9. **Decided Nov 21, as drawn.** **Home:** the invoices row sits right after stuck draws, before sign-ups. Its detail line names the senders, oldest first, two names then "and N more"; no dollar figure, since emailed invoices have no total until someone types it. It ships without snooze (snooze and dismiss isn't built yet); once that lands, a new invoice in To review ends a snooze.

---

## 7. Reuse check

**Reused as is**
- `/api/email/inbound` and its signature check; `isAutoReply`, `fromAddress`, `singleAddress` (`src/lib/email/inbound.ts`); the DMARC rule in `replies.ts`.
- `SegmentedControl` (as on Draws), `Table`, `PageHeader`, `EmptyState`, `BackLink`, `Menu`, `DatePicker` with `variant="field"`, `useToast` with Undo and a detail clause, `ActivityTimeline` with `collapseStretches`, `Lightbox`, `FilesList`, `LeaveGuard`, `useMediaUploader` and `MediaUploadTray`, `AssigneePicker`'s Contractors list, `OptionList` with search for the job picker.
- Private Blob, `src/lib/attachments/` (content types, limits, `fileResponseHeaders`).
- The Resend sender, `src/lib/email/render.ts`, `jobEmailState`.
- `requireUser()`, `requirePortalPrincipal()`, `linkSessionMayOpen`, `src/lib/task-scope.ts`, `src/lib/dates.ts` (Eastern days), cents math as in `src/lib/draws/figures.ts`.

**Extended**
- `/api/email/inbound`: routes by recipient. `resendGet` and `sortFile` move out of `replies.ts` into a shared module.
- `replies.ts`: a Done-job reply with a file also makes an invoice (4.2).
- `/api/files/[kind]` and `/api/blob/[kind]`: an `invoice` kind. `upload-kinds.ts`: two invoice kinds.
- `NotificationOutbox` and `drainDue`: an optional invoice, bundle keys and the invoice branch (5.3).
- `FormSheet` (HG's own component, not a stock file): a prop to open with no field focused, for Mark paid.
- `DocumentStage`: exported from `lightbox.tsx` for the invoice page.
- `RecordMoreMenu`: a way to replace its Archive item, so the invoice's ⋯ reads as 6.1 item 1.
- `MediaGrid` `menuItems` and `FilesList`'s row menu: Use as invoice.
- `job-link-paths.ts`: an `invoice` step in `JOB_LINK_STEPS` (`?do=invoice` after sign-in). The portal account menu: Your invoices.
- `STAFF_SECTIONS` and the proxy matcher: `/invoices`. `auth-guard.test.ts`: `src/lib/invoices` in `PORTAL_DIRS`.
- `payoffLine`: the invoice pair of lines.
- Home's Needs you (`src/lib/home/needs-you.ts`): an `invoice` roll-up kind, snooze-only per snooze-dismiss.md D3.
- `nav.tsx`: the Invoices link.
- The task page (its Invoices section, and New invoice in `tasks/[id]/header.tsx`'s ⋯ menu); the portal job page; job file menus (Use as invoice).
- The invoice sent state reuses the Mark done payoff's pieces where they sit and gets named in components.md's Sent screen row; sharing that screen across features waits for its own change, since it would restyle shipped screens.

**New**
- The invoice page layout: a document beside a form (Airwallex, Remote above).
- `src/lib/invoices/` (service, queries, inbound).

Built on whatever the design foundation (docs/specs/design-foundation.md) has landed by build day: re-run this check against main and docs/components.md the day work starts.

---

## 8. Build order

1. **Staff side:** tables and service, New invoice and Use as invoice, the Invoices page, the invoice page, Approve, Mark paid and Undo, Not an invoice, duplicates, the task page list, Needs you.
2. **Ways in and the contractor side:** the forward inbox, the Done-job reply path, Send invoice in the portal, the job page and Your invoices, staff emails, the Paid email.

Each step ends with `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`, with `SAMPLE_PARAMS` for `/invoices/[id]`. No local DB has invoices, so `tests/devices/setup.ts` seeds one per stage and one portal invoice for the fixture contractor, written by a system actor so no email is queued.

**Tests worth having:** stage moves and who may make them; two partners marking one invoice paid at once; Undo paid before and after the Paid email; a forged From with DMARC failing never setting the contractor or skipping the staff email; an invoice email never reaching the reply path, and a reply never reaching the invoice path; one email delivered twice making one invoice; a Done-job reply with a PDF making one invoice and one forward, an active-job reply making none; the portal never showing another contractor's invoices, Not an invoice items, or emailed ones before approval; a link session seeing no invoice; the duplicate rule (normalized numbers, same file); the cap; a negative or "1.2k" total refused; a Paid email for a No job invoice and for one on a job that sits on Connor both send; a staff bundle with no task sends; a staff entry sends no staff email; deleting a job keeps its invoice and file; a DMARC-verified partner forward skips the cap; "#1043" and "1043" match as duplicates.

**Proof before step 2 ships:** once the address receives, send one forward from the Gmail test contractor account and one from a partner's address, read the stored `InboundEmail` DMARC result, and record it here. If Gmail doesn't report "pass", M11 already falls back to "Who's this from?", and M12's partner skip needs a second rule.

**Launch note (Connor and Pieter, the day it goes live):** text each contractor once (draft in 15-invoice-address.svg): "Hi Zack, you can now send HG Capital your invoices in the app. Tap Send invoice on a finished job, reply to the job email with the bill, or forward it to invoices@mail.hgcapitalpartners.com. When we pay it, you get an email. Connor". And between the two of you: mark an invoice paid in the app as you send the money (M8).

**Setup Connor does:** nothing before the build. Watch Resend's daily use after launch; go Pro if it nears 100 a day.

---

## 9. Later (not in the MVP)

Each has notes in [specs/contractor-invoices/full-plan.md](specs/contractor-invoices/full-plan.md), section 10.

- **Claude reading invoices** (fills number, dates and total): needs `ANTHROPIC_API_KEY`, checks on what the model returns, HEIC and size limits, a cheaper-model test, and a "asks to be paid a new way" flag.
- **The No invoice list** that chases finished contractor jobs with no invoice: start it on its launch day, store "No invoice needed" through the snooze and dismiss store.
- **Mark several paid at once,** picking rows the way Tasks does with the bulk bar.
- **Totals and filters:** figures above the list, a period menu, a contractor filter.
- **Pay-by dates** and overdue marks.
- **Contractor edit, withdraw and Send back.**
- **Deposits, credits, revised invoices.**
- **A rehab link** on invoices for rehab costs (rehab-draws.md, section 9).
- **Payment-method tags** shared with the contractor page, a "No W-9" flag, and a check photo attached to the invoice it paid (roadmap, Check photos).
- **Invoices on the contractor page,** and ⌘K search by invoice number.
- **A root-domain address** (`invoices@hgcapitalpartners.com`), which needs an MX on the ns19/ns20 zone.
- **1099s** come from QuickBooks (roadmap, 1099 list), not from invoices.
