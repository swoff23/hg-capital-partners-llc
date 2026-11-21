# Contractor invoices: the full plan (later)

**Superseded on Nov 20, 2026 by the MVP in [docs/contractor-invoices-plan.md](../../contractor-invoices-plan.md).** This is the Oct 23 plan with the Nov 20 re-review folded in (section 10), kept for the pieces the MVP leaves for later: AI reading, the No invoice list, bulk Mark paid, deposits, rehab links and the rest. Its Q1 and Q2 decisions carried into the MVP. Read the MVP first.

**Status:** spec, agreed in grilling on 2026-10-23, re-reviewed against main on 2026-11-20 (section 10). Planning only: the roadmap slots the build after Invite the contractors (Dec 16 onward), and it starts only after an explicit "build it". The open questions in section 10.2 come first, then the mockups get redrawn (none were saved on Oct 23, and the design system has changed since).

**Before building,** re-run the reuse check in section 7 against main and docs/components.md on the day work starts. The portal session gates (job links, setup), `src/lib/tasks/core.ts` and the design foundation landings all moved after this spec was written.

**Note (Nov 20, 2026).** Rehab costs, planned after the rehab draws MVP ([specs/rehab-draws.md](../rehab-draws.md), section 9), would tie invoices and materials receipts to a rehab and a budget line. That reopens I4 (no reconciling to properties) and I11 (contractor invoices only). Settle it when costs get their own planning pass.

---

## 1. Goal

Every contractor invoice lands in one place, tied to the jobs it covers, so Connor and Pieter can see what's owed, what's paid, and which finished jobs still have no invoice.

- **Four ways in:** a contractor replies to a done job's email with the invoice attached; a contractor sends one in the portal; an email reaches the invoice inbox (forwarded by staff, or sent straight from a contractor's own invoicing system); or staff enter one by hand, including "Use as invoice" on a file already on a job.
- **Money doesn't move in the app.** Connor or Pieter pays in Baselane (or by check) as today, then marks the invoice paid.
- **Optional for contractors.** Nobody has to change how they bill. Those with their own systems point them at the inbox, or keep emailing and Connor forwards.

---

## 2. What we found

**How contractors bill today:** texts and emails with an amount, or PDFs from their own systems. Payment details live in Baselane, which contractors reach through the onboarding link ([specs/contractor-onboarding.md](../contractor-onboarding.md), decision 1). The app's contacts keep a free-text `billingInfo` ("Check", "Zelle") and never hold account numbers.

**Receiving mail already works.** Since Nov 14, Resend receives mail for `mail.hgcapitalpartners.com` (MX `10 receive.forge.rmta.net`) and posts every `email.received` event to one webhook, `/api/email/inbound`, which checks the Svix signature with `RESEND_WEBHOOK_SECRET` and hands job replies to `src/lib/email/replies.ts` ([specs/contractor-job-emails.md](../contractor-job-emails.md), section 5). Anything that isn't a reply is answered 200 and dropped today. The root domain `hgcapitalpartners.com` still has no MX (`dig MX` on 2026-11-20). Remember the near-identical `hgcapitalpartnersllc.com` zone: the live one is on nameservers ns19/ns20.

**Received mail counts toward Resend's quota.** Resend's pricing FAQ says each received email counts toward the transactional quota. Free is 3,000 a month with 100 a day, shared with job emails and the 8 am emails (`DAILY_EMAIL_CAP` in `src/lib/notifications/content.ts`). The inbox needs Resend Pro ($20 a month, 50,000) before contractors' own systems point at it. The app's cap (I9) limits what gets read and what that costs, not Resend usage. [Receiving](https://resend.com/docs/dashboard/inbound/introduction), [email.received](https://resend.com/docs/webhooks/inboxes/email-received.md), [pricing](https://resend.com/pricing).

**Ramp and QuickBooks work the same way.** Ramp gives each business an AP address, reads every attachment, pre-fills a draft bill, and someone reviews it before approval and payment. [Ramp AP email forwarding](https://support.ramp.com/hc/en-us/articles/35659701397395-Bill-Pay-AP-Email-Forwarding). One difference for us: invoicing systems (QuickBooks, Square, Jobber) send from their own address, so the contractor has to be worked out from the invoice itself, not just the sender.

**Reading invoices.** Claude Opus 5.5 (`claude-opus-5-5`, $4 in / $20 out per million tokens) takes PDFs and photos directly and returns structured output against a schema. A one-to-two-page invoice with its email is roughly 5,000 tokens in; both passes (section 6.4) come to about **5 to 10 cents an invoice**, or $3 to $5 a month at 50 invoices. The daily cap (I9) and a page and byte budget per email (6.4) bound the worst case. Claude reads PDF, JPEG, PNG, GIF and WebP, images up to 10 MB; it doesn't read HEIC, and the server has no HEIC converter (`heic-to` runs in the browser only). Sonnet 5.5 or Haiku 5.5 may read invoices as well for less, so the build tests them (6.4 step 7). This is the one server-side AI key in the app: unattended mail can't go through a partner's own Claude connector the way Tasks from Claude does.

**Mobbin.** References for every screen are linked in section 5. Ramp, Bill.com and Housecall Pro aren't on Mobbin; Mercury, Shopify Bill Pay, Xero, QuickBooks, Airwallex, Remote, Jobber and Turo are.

---

## 3. Decisions (all settled 2026-10-23)

| # | Topic | Decision |
|---|---|---|
| I1 | Payments | Paid in Baselane (or by check), outside the app, by either partner. The app records the date, method, a note and who marked it |
| I2 | Contractor use | Optional. Every contractor with a portal login can send invoices; there's no per-contractor switch |
| I3 | Ways in | Replies to a done job's email (Q2), the portal, the invoice inbox, and staff entry by hand (with "Use as invoice" on any job file) |
| I4 | Shape | A total plus the jobs it covers. No per-job split; the app isn't for reconciling to properties |
| I5 | Stages | **To review**, then **To pay**, then **Paid**. Side exits: **Sent back** (portal invoices, with a note) and **Not an invoice** (junk). Either partner moves any invoice |
| I6 | Which jobs | Any job assigned to that contractor in any status except Canceled (In review included). A job can have several invoices (deposit, then final). That is what pass two suggests and what the portal can tick. Staff can link any non-canceled job, whoever it sits on (Q1) |
| I7 | Timing | After Invite the contractors (roadmap, Dec 16 onward). The Nov 1 Asana cutover is past and Asana is no longer used |
| I8 | Address | `invoices@hgcapitalpartners.com`. If the domain ever gets its own email (Google Workspace), that host forwards this address on |
| I9 | Who can send | Anyone. A daily cap of 50 emails; invoices the app can't match to a contractor are flagged "Who's this from?" |
| I10 | Review | A person always confirms an emailed invoice before To pay, however confident the match |
| I11 | Scope | Contractor invoices only. Other bills (utilities, insurance, taxes) get "Not a contractor invoice" and are set aside |
| I12 | Coverage | A **No invoice** list: done jobs with a contractor assignee and no invoice (Q1: jobs on Connor or Pieter are never chased). Each has **No invoice needed** with an optional reason (warranty, covered by another bill, paid on the spot) |
| I13 | Duplicates | Flag a **possible duplicate** beside the total when the contractor and invoice number match, or the contractor and total match within 30 days. Staff choose "Same invoice" (merged, its file kept on the original) or "Keep both". Never merged automatically |
| I14 | Mark paid | Tick several in To pay, any mix of contractors, and mark them paid in one step: one date (Today by default), one method, an optional note. The button shows the total ("Mark 3 paid · $2,450.00"); a toast offers Undo |
| I15 | Partial payments | Not tracked. An invoice is paid or not; a partial payment goes in the note. A deposit is its own invoice |
| I16 | Contractor view | The portal lists all of a contractor's invoices with their status, including emailed ones once staff confirm them. Emailed invoices still in To review stay hidden. Each job shows its invoices |
| I17 | Contractor emails | **Sent back** (with the note) and **Paid** (date, method, invoice number), to anyone with an email on file, login or not. Several of one contractor's invoices marked paid at once make one email. Nothing for To pay, and no receipt on arrival |
| I18 | Staff emails | A new invoice in To review emails both partners, bundled over 10 minutes, except ones a partner forwarded and job-email replies (their forward already told both partners). The Invoices menu item shows the To review count |
| I19 | Changes | Contractors edit or withdraw a portal invoice only while it's in To review. Staff edit anything until it's paid; "Undo paid" puts it back in To pay. Every change is recorded on the invoice's history |
| I20 | Work not listed | A contractor can pick "Work not listed" (a short description and the property). Emailed invoices with no job match are flagged "No job". On review, staff link a job or tap **Create job**, which makes a done job from the invoice (property, description as title, contractor as assignee) and links it |
| I21 | Menu | Invoices gets its own menu item between Tasks and Contractors, with the To review count |
| I22 | Invoices page | **Total cards that filter the list:** To review, To pay, Paid, No invoice, each with a count and amount. Four across on computer and tablet; two by two on a phone |
| I23 | Time period | A period menu on the page: This month, Last month, Last 90 days (default), This year, Last year, All time. Kept in the URL |
| I24 | Open items | To review, To pay and No invoice always show everything still open; the period changes Paid only. When open items predate the period, the card says so ("5 · $3,651, 1 from before Jul 25") |
| I25 | Review screen | Its own page per invoice (`/invoices/[id]`): the document on the left, the fields on the right, flags beside the field they concern, and **Confirm, next**. Tablet and phone put the document on top (a thumbnail on a phone) with a fixed Confirm bar. The same page serves every stage |
| I26 | Portal home | A bottom bar with **Jobs** and **Invoices** |
| I27 | Bottom bar scope | The bar shows on the two lists only. Job and invoice pages hide it and keep their Back link and their own action bar |
| I28 | Send invoice form | One screen: jobs (finished with no invoice first, then open, then "Work not listed"), total, their invoice number (optional), photo or PDF (optional), and **Send invoice · $850.00**. Opened from a job, that job is ticked |
| I29 | Task page | An **Invoice** row in the side rail (a chip on tablet and phone), when a contractor is assigned or any invoice is linked (Q1). Stage as plain text, never a badge. With none: "None yet" opens Link an invoice, Enter an invoice, No invoice needed |
| I30 | Contractor page | An **Invoices** card under Jobs: "$850 to pay · $9,240 paid in 2026" in the header, the latest invoices, and "See all on Invoices" (the Invoices page filtered to them) |

### Defaults I filled in (confirm or correct)

1. **Contractor wording.** The portal shows Received (To review), Approved (To pay), Paid with date and method, and Sent back. "To pay" reads oddly from the contractor's side.
2. **Payment methods:** Baselane transfer (the default), Check, Zelle, Venmo, Cash, Other. Card and one list shared with the contractor page's billing tags are open (10.2, Q15).
3. **The No invoice list starts** ~~at cutover: jobs finished on or after Nov 1, 2026~~ on the day Invoices goes live, kept as a setting. Nov 1 would list every job closed since then, already paid in Baselane (10.2, Q14).
4. **Over the daily cap,** extra emails wait and are read the next day. A line on the Invoices page says how many are waiting.
5. **Files the app reads:** PDF, JPG, PNG and WebP, images under about 7 MB, within the per-email page budget (6.4 step 3). HEIC, larger images, encrypted PDFs and anything else (Word, Excel) are kept but not read, and the invoice lands in To review flagged "Couldn't read". Portal uploads keep converting HEIC in the browser before upload. (Claude doesn't read HEIC and the server can't convert it.)
6. **Not an invoice and withdrawn items** are kept for 30 days, then deleted with their files.
7. **Due dates** come from the invoice file or from staff. The portal form doesn't ask for one.
8. **Gmail auto-forward.** Gmail's "confirm forwarding" email shows in To review as its own row with the link, so Connor can finish setting up an automatic forward for chosen senders.
9. **Deleting.** Staff can delete an invoice (soft delete, recorded in its history); contractors can only withdraw.
10. **Reassigning a job** keeps its invoice links. The earlier contractor still sees their invoice with the job's title, without a link to the job.
11. **Build order:** the staff side first, then the inbox, then the portal (section 8).

---

## 4. Out of scope (later, if wanted)

- Moving money, or reading payments back from Baselane.
- Writing bills to QuickBooks, or matching paid invoices to QuickBooks transactions. QuickBooks stays read-only.
- Partial payments (I15), per-job amounts (I4) and property cost rollups.
- 1099 reports. The roadmap's January 1099 list reads QuickBooks vendor lines (`QboVendor`, `LedgerLine`), not invoices. The contractor section's figure is "recorded in the app" and can differ (payments made on the spot never get an invoice). TINs and tax class stay out of the app (onboarding decision 8).
- Checking an invoice against a quoted price. Jobs have no price field today; the reviewer checks amounts by eye (Q22).
- Materials receipts and other non-contractor bills, which wait for the rehab costs pass (rehab-draws.md, section 9).
- Bills that aren't from contractors (I11).

---

## 5. Screens

Mockups were reviewed in chat on 2026-10-23. All sizes: laptop 1280x800, tablet 768x1024 (touch layout), phone 375x667, checked down to 320.

### 5.1 Invoices page (`/invoices`)

- **Header:** "Invoices", the period menu (I23), the inbox address with a copy button, and **New invoice**. On a phone the title row keeps the period and "+", and the address moves into a ⋯ menu ("Copy invoice email").
- **Four cards** (I22) act as the page's one switch: one picked at a time, marked by its fill alone, `aria-pressed`. The picked card is in the URL (`?view=review|pay|paid|missing`).
- **List:** a table on computer and tablet (contractor, jobs, date, due, total, flags); cards on a phone (contractor and total, then jobs, then dates and flags). Flags are amber badges beside the total: Possible duplicate, Who's this from?, Couldn't read. "No job" is gray.
- **To pay** adds checkboxes. Ticking raises a floating bar: "2 selected · Mark 2 paid · $2,450.00", which opens the Mark paid sheet (I14).
- **No invoice** lists jobs, using the task row: title, property, contractor, finished date. Row actions: Enter invoice (prefilled), No invoice needed (optional reason), each with Undo.
- **Filtered to a contractor** with `?contact=<id>` (from the contractor card), shown as a removable chip.

References: [Mercury Bill Pay](https://mobbin.com/screens/d989795f-1f53-4ea4-9f9e-bf05ab5fa6ca) (total cards, stage tabs, AP address chip), [Shopify Bill Pay](https://mobbin.com/screens/2b2c6bc8-1991-4cce-8a70-cc056d32facc) (selection bar, "Mark as paid"), [Deel](https://mobbin.com/screens/86a99ed6-787f-4a21-89e3-741c5162723d) (cards as filters), [HoneyBook](https://mobbin.com/screens/4a1b5a54-7cf4-4c16-88ae-ae508ade10c3) (total in the mark-paid button), [Jobber "Requires invoicing"](https://mobbin.com/screens/839dd83a-4d45-424f-8a1b-ec841114a7d6) (the No invoice idea).

### 5.2 Invoice page (`/invoices/[id]`, `/invoices/new`)

- **Computer:** the document on the left half (zoom, download; images through the existing `Lightbox`), fields on the right: contractor, invoice number, date, due, total, jobs (ticked suggestions, Add job, Create job), note. A quiet line names where it came from ("Read from the email Zack sent Oct 20").
- **Flags sit beside their field** (Mercury, Brex): Who's this from? on the contractor, Possible duplicate on the total (links to the match, with Same invoice and Keep both), No job on jobs.
- **Footer by stage:** To review: ⋯ (Not an invoice, Delete), Send back (portal invoices only), **Confirm, next**. To pay: ⋯, **Mark paid**. Paid: the date, method and note, with Undo paid in ⋯.
- **History** below the fields (`ActivityTimeline`): arrived, read, confirmed, edited, sent back, paid, undone.
- **Tablet:** the document as a tall preview on top, fields below. **Phone:** a thumbnail that opens the document full screen, fields, then a fixed bottom bar.
- **New invoice** is the same page, empty, with a drop zone for the file.

References: [Airwallex review bill](https://mobbin.com/screens/d6fa70dc-46b6-41e0-9771-d61e758980a3), [Remote](https://mobbin.com/screens/5a02d53a-4cc4-411a-ba45-3d0b7c1f0f54), [Mercury review flow](https://mobbin.com/flows/332881d8-7f08-46ec-bc6d-5a669ea56e0d) and [similar payment](https://mobbin.com/screens/1dcf0c8a-337d-4423-afe8-a734d8e5099f), [GoPay phone review](https://mobbin.com/screens/465e2773-660b-4a11-b7af-fb9747fef87e).

### 5.3 Task page and contractor page

- **Task page:** the Invoice row in the side rail (I29). Several invoices list one per line.
- **Contractor page:** the Invoices card (I30). Tablet and phone stack Contact, Portal access, Jobs, Invoices.

References: [Shopify vendor page](https://mobbin.com/screens/9f3014fa-f713-4fa5-b224-1568668c36e7), [HoneyBook "paid of"](https://mobbin.com/screens/cb2a2f0f-f8c9-49c5-82b8-e6fa97903d77).

### 5.4 Portal

- **Bottom bar** (I26, I27) on `/p` and `/p/invoices`: Jobs and Invoices with line icons. The portal is one centered column at every size, so the bar sits at the column's width on tablet and computer.
- **Invoices list** (`/p/invoices`): cards with invoice number and jobs, total, sent or paid date, and status; **Send invoice** at the top.
- **Send invoice** (`/p/invoices/new?job=<id>`): the one-screen form (I28). Uploads use `useMediaUploader` and `MediaUploadTray` with documents allowed, held by `LeaveGuard` while they go up.
- **Sent screen:** reuses the Send for review payoff (once called Mark done): "Thanks, Zack!", "Connor or Pieter will review it." then the email line from `payoffLine`'s `getsEmail` branch ("You'll get an email when it's paid." or "Check back here to see when it's paid."), names from the user table, and the invoice card with its first status. Art: the job's building photo for one job, else a `SpotArt` (`request-sent`, or a new `invoice-sent`).
- **Invoice detail** (`/p/invoices/[id]`): Received, Approved, Paid as steps, jobs, file, note, and any sent-back note. Edit and Withdraw while Received.
- **Shortcuts:** "Send an invoice" on the Send for review payoff and on each finished job's page, with that job ticked. From a one-job link session it goes through sign-in first (6.3).
- **The portal section needs redrawing** against today's portal: the jobs list runs full width to 1600, not one centered column, and the nav choice is open (10.2, Q7).

References: [Turo repair invoice](https://mobbin.com/screens/4c38490a-a4aa-446d-bb11-d55fd5c25bb5), [Jobber new expense](https://mobbin.com/screens/7f8a7d6c-bfcb-4347-abe3-b0a9b26603d1), [Mercury submitted](https://mobbin.com/screens/bba69488-ff37-4905-9c3d-161c1e489f39), [Remote invoice list](https://mobbin.com/screens/9d28f831-4dbd-438f-83c7-466dcad13a7f); bottom bar per Apple HIG tab bars and Material navigation bar (top-level destinations only).

---

## 6. Architecture

### 6.1 Data

New tables, with RLS like every new table (README, Rules of the road). Money as `Decimal(12, 2)` like the rest of the schema.

- **`Invoice`:** contact (null until matched), source (`PORTAL | EMAIL | STAFF`), stage (`REVIEW | TO_PAY | PAID | SENT_BACK | NOT_INVOICE | WITHDRAWN`), contractor's invoice number, invoice date, due date, total, note, description and property (for work not listed), duplicate-of, sent-back note, paid date, method (`BASELANE | CHECK | ZELLE | VENMO | CASH | OTHER`, final list per 10.2 Q15), paid note, paid by, confirmed at and by, creator (user or contact, one of them, CHECK), inbound email, `extraction` JSON (what the model read and which model), timestamps, `deletedAt`.
- **`InvoiceTask`:** invoice and task, unique together. Keeps the job title at link time for display after a reassignment.
- **`InvoiceFile`:** private Blob metadata, the same shape as `TaskAttachment`'s file fields, or an `attachmentId` pointing at an existing `TaskAttachment` (Use as invoice), so a job file's blob is never copied.
- **`InvoiceEvent`:** the history (kind, actor user or contact, actor label, data, time).
- **`InboundEmail`:** Resend's email id (unique, for idempotency), from, reply-to, subject, received time, text body, status (`QUEUED | READ | HELD_CAP | FAILED | GMAIL_CONFIRM`), error, invoice.
- **`Task`** gains `invoiceNotNeededAt`, `invoiceNotNeededReason`, `invoiceNotNeededByUserId`.

### 6.2 Services

All writes go through `src/lib/invoices/service.ts` (stage moves, links, Create job, mark paid and undo, duplicates, not-needed), each writing its `InvoiceEvent` in the same transaction. Create job calls a new `core.createFinishedJob` in `src/lib/tasks/core.ts` (never Prisma directly): status DONE, `completedAt` set to the invoice date, the completedBy fields, TaskAccess granted, CREATED and STATUS events, and no ASSIGNED email. Plain `createTask` sets no `completedAt` and emails the contractor a job that's already finished. Reads in `queries.ts` (staff) and `src/lib/portal/` (contractor). Nothing under `src/lib/invoices/` imports staff auth or QuickBooks, so the portal can use it (`src/lib/auth-guard.test.ts`).

### 6.3 Access

- **Staff:** `requireUser()` on every page, action and route.
- **Contractors:** `requirePortalPrincipal()`; only invoices with their contact id, never `NOT_INVOICE`, and emailed ones only once confirmed. Linking jobs in the portal is limited to jobs they have live `TaskAccess` to.
- **One-job link sessions** (`PortalSession.onlyTaskId`, from job emails and crew links) never see invoices: no Invoices list, no invoice rows or amounts on the job page, no invoice files. Job links get forwarded to crews. "Send an invoice" from such a session goes through `/login?next=/p/invoices/new?job=<id>`, which the existing redirect already does. The portal nav shows only for full sessions, and never on setup or first-password pages.
- **View-as** (docs/specs/view-as.md) refuses Send invoice, Edit, Withdraw and invoice uploads, with a test, in whichever of the two features lands second.
- **Files** through `/api/files/invoice/<id>` with the same checks, served by `fileResponseHeaders` unchanged (`src/lib/attachments/headers.ts`): nosniff, PDFs inline under `default-src 'none'`, SVG and unknown types download. A sandbox attribute would blank the browser's PDF viewer, which is why headers.ts leaves it off PDFs. The document pane reuses Lightbox's `DocumentStage`: an iframe on a mouse device, a file card that opens the file on touch. A real page preview on touch (pdf.js or a server render) would be a new dependency and needs Connor's OK.

### 6.4 The inbox

1. **Receive.** Extend the existing `/api/email/inbound` (signature already checked) to route by recipient before the reply path: `r+<token>@` and `jobs@` keep going to `replies.ts`, the invoice address stores an `InboundEmail` once per Resend id and answers 200 at once. Make the router generic, since `deals@` (roadmap) and `draws@` (rehab-draws.md) are planned on the same webhook: `InboundEmail` keeps the recipient's local part and a nullable link per consumer. Reuse `isAutoReply`, `fromAddress` and `singleAddress` from `inbound.ts`, and move `resendGet` and `sortFile` out of `replies.ts` into a shared module. Tests: an invoice email never reaches the reply path, and a reply never reaches the invoice path.
2. **Fetch and store.** Its own cron route (not inside the notifications drain, whose `maxDuration` is 60) claims queued rows with the outbox's conditional UPDATE and lease, so overlapping runs never read one email twice. It fetches the body and attachments from Resend's API and saves files to private Blob.
3. **Cap and budget.** Senders whose exact email is on file with DMARC passing are read first and outside the cap. Unknown senders share the 50-a-day cap (Eastern) with a smaller cap per sender address, so 50 junk emails can't push real invoices back a day; past it, rows wait as `HELD_CAP`. The backlog has a ceiling, past which rows go `FAILED` and show in the count. Before any model call: a page and byte budget per file and a limit on files per email. Track tokens per day as well as emails.
4. **Read, pass one.** One Claude call with the email text, the files, and the active contractor list (name, company, emails). Structured output: is it an invoice (a suggestion only, see 6.7); is it a credit; original sender (for forwards); contractor match; invoice number; dates; total; line descriptions; property guess; and one boolean, "asks to be paid a new way" (new bank, account, wire or payee), with no numbers stored. The system prompt treats everything in the email as data, never instructions. Files Claude can't read (HEIC, images over 10 MB, encrypted or over-budget PDFs) are kept and the invoice lands flagged "Couldn't read".
5. **Read, pass two.** With a contractor matched, a short call with that contractor's jobs (not canceled, last 120 days, plus open ones) returns suggested job ids. None found means "No job".
6. **Check.** Code (not the model) re-checks everything the model returned (6.7), matches the contractor by exact email only when DMARC passes, runs the duplicate test (I13), and lands the invoice in To review with its flags. A forward counts as a partner's (no staff email, I18) only when DMARC passes, the From line holds a single address, and it matches a partner's User email. Gmail and Outlook publish no enforcing DMARC, so before step 2 ships, send a test from the Gmail test contractor account and record what Resend's `authentication` says.
7. **Model call details.** One model constant, `claude-opus-5-5` by default. Before step 2 ships, run 20 to 30 real invoices through Haiku 5.5, Sonnet 5.5 and Opus 5.5 at low effort and use the cheapest that gets totals and contractors right. `output_config.format` for the schema. Server-side fallback for refusals is a beta: `client.beta.messages` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"` (Haiku 5.5 has none). Typed SDK errors. After a set number of failed tries, the email lands in To review flagged "Couldn't read" with its email and files, so a person types it in, and `src/lib/jobs-health.ts` gains an `invoice_read_failing` reason for a queued or failed row older than about 30 minutes.
8. **One email, several invoices.** `InboundEmail` to `Invoice` is one-to-many, unique on (inbound email, index of the invoice found), so a retry can't make a second row. One Invoice per invoice the model finds, the email's other files kept on the first; a statement is flagged, not split.
9. **Gmail forwarding confirm** (default 8) is recognized only when the sender is Google's forwarding address, DMARC passes, and every link's host is on a Google allowlist. The row shows the confirmation code, not a clickable link. Anything else that looks like one is an ordinary To review row.
10. **Job-email replies (Q2).** In `replies.ts`, a reply on a Done or Canceled job (rule 3: not an active status) is forwarded to both partners with its files, and nothing posts to the job. Keep the forward, now with a line "Added to Invoices to review", and when the reply carries a PDF or image also create a To review invoice (source `EMAIL`, origin reply) linked to that job, its files saved as `InvoiceFile`s in the invoice blob path. Its contractor is known from the reply token, so it skips "Who's this from?" and pass two. If AI reading is built, pass one fills the number, dates and total; if not, the fields are empty for staff to type. A reply on an active job (In review included) stays a comment, and staff use "Use as invoice" on its file. A work photo that lands this way is cleared with Not an invoice. Tests: a Done-job reply with a PDF makes one invoice and one forward; an active-job reply makes none; a retried webhook makes no second invoice.

### 6.5 Emails

- **Staff (I18):** `NotificationOutbox` gains an optional invoice and a bundle key per partner (`u:<id>:invoices`), so new invoices within 10 minutes become one email ("3 new invoices to review").
- **Contractors (I17):** Sent back and Paid rows keyed per contractor, so one Mark paid action makes one email per contractor. Sent through the existing Resend sender and templates in `src/lib/email/` and `src/lib/notifications/content.ts`. As built, the drain (`deliveryFor`) closes contractor rows for "no login" or "emails off", so I17's rule needs an exception there once Q12 settles it. The outbox change is its own branch that doesn't depend on a task.
- **Paid waits for Undo.** A Paid email waits at least the toast's Undo window and re-reads each invoice's stage when it sends, dropping any no longer Paid (bulk-edit.md sets the same pattern). An Undo paid after the email went sends nothing, and the history says the contractor was told.
- **Toasts say who heard.** "Marked 3 paid · Zack and Luis get an email", or "· Zack's emails are off", or "· Zack has no email", with Undo, in contractor-email-switch.md's wording. Mark paid never fails silently for a contractor with no email.

### 6.7 Hardening rules (Nov 20 review)

- **Model output is a suggestion.** Keep only job ids that were in the candidate set sent to pass two and contact ids that were in the list sent to pass one; drop anything else. Parse an extracted total with a strict parser (not `parseAmount`, which takes "k", "m" and a minus sign), accept it only if positive with at most two decimals, and flag one above a ceiling. "Not an invoice" from the model lands in To review with a "Not an invoice?" hint; only a person moves it to `NOT_INVOICE` (recorded in `InvoiceEvent`), which starts default 6's 30-day clock.
- **New payees.** An invoice is confirmed only to a contractor already in Contractors, picked with the existing picker, never created from the review page. Payees and bank details change only through Baselane. The "asks to be paid a new way" flag sits beside the contractor: "Bank details in invoices are never used. Payees change only in Baselane." (wording for Connor, Q18).
- **Duplicates (I13), tightened.** Store a SHA-256 on `InvoiceFile` and flag any match across every invoice, Paid and deleted included ("Already paid Nov 3"). Match invoice numbers after normalizing (case, spaces, hyphens, leading zeros; stored as `invoiceNumberNormalized`). Compare totals in cents, counting 30 days by invoice date, else arrival, and skip the total match when the two are linked to different jobs or their numbers differ. Re-run the test whenever the contractor, number or total changes. Confirm stays disabled until an open duplicate flag gets Same invoice or Keep both, so no flagged invoice reaches To pay. "Same invoice" shows both totals and dates and keeps the newer by default; the older file stays in History.
- **Credits.** Totals are always positive, in every source. A credit memo lands flagged "Credit, not a bill"; staff note it on the invoice it offsets (I15) or move it to Not an invoice.
- **Concurrency.** Mark paid updates only rows still in To pay, locked in id order, and reports the rest ("1 was already paid"). Undo paid reverts only rows still Paid with that action's paid date and paid by. The same holds for Confirm.
- **Money math.** Card, button and contractor totals come from SQL sums of the Decimal column, formatted once. Any sum in JS counts integer cents, as `src/lib/draws/figures.ts` does (export a shared helper on the second use); never add `Number(decimal)`.
- **Delete and retention.** Delete is offered only before Paid (Undo paid comes first), so paid totals can't silently drop. `InboundEmail` rows that never became a confirmed invoice (Not an invoice, failed, stale held) lose their body text and unread files after 30 days, like default 6. Body and files linked to a confirmed invoice stay.

### 6.6 Environment

Added to `src/lib/env.ts`: `ANTHROPIC_API_KEY`. `RESEND_WEBHOOK_SECRET` already exists and is set in production. The inbox address goes in `AppConfig` or a config module, not env, per the maybe-SaaS-later rule (per-business values stay out of env). A new dependency, `@anthropic-ai/sdk`.

---

## 7. Reuse check

Rewritten Nov 20 against docs/components.md. Built on whatever the design foundation (docs/specs/design-foundation.md, landings C to M) has landed by build day, so each piece is named by its job and its stock successor. Re-check on the day work starts.

**Reused as is**
- Mark paid and the No invoice needed reason in a `FormSheet` (becomes `FormDialog`/`ResponsiveDialog` in landing F). `Menu`. Toasts with Undo and a detail clause (`useToast`, sonner from landing D). `DatePicker` with `variant="field"` (paid date, pay-by date; `DueDatePicker` is its old name). `Table`, `PageHeader`, `EmptyState`, `BackLink`, `LeaveGuard`, `ActivityTimeline` with `collapseStretches` (history), `Lightbox` and its `DocumentStage` (the document pane).
- Flags as a lucide icon plus one word in `--warn`, the way Needs you draws system items, not the warn `Badge` tone that landing C retires (design-foundation 12.12). "No job" in `--muted-foreground`. Stages as plain words everywhere (I29).
- `FactStrip` for the page's figures (it replaced `Kpi`, which no longer exists), with the I24 note as each fact's `sub` ("1 older").
- `FilterBar` with a Contractor facet in place of a one-off `?contact` chip; the contractor page's link pre-sets it.
- `useMediaUploader` and `MediaUploadTray` (portal attach), `FilesList` (staff files). Two new private upload kinds in `src/lib/attachments/upload-kinds.ts`: `invoice-upload` (staff) and `portal-invoice-upload` (contractor), parent `invoiceId`.
- `AssigneePicker`'s Contractors list for the contractor field. `OptionList` with search and the finished-first sections for the job picker.
- Private Blob and `src/lib/attachments/` (content types, limits, `fileResponseHeaders`).
- `NotificationOutbox`, its claim-and-lease pattern, the Resend sender, `src/lib/email/render.ts`, `payoffLine`'s `getsEmail` branch.
- `/api/email/inbound`, `verifyWebhook`, `isAutoReply`, `fromAddress`, `singleAddress`, and the DMARC check in `replies.ts`.
- `requirePortalPrincipal()`, `linkSessionMayOpen`, `src/lib/task-scope.ts`, `src/lib/dates.ts` (Eastern days). Cents math as in `src/lib/draws/figures.ts`.
- `SpotArt` for the portal payoff.

**Extended**
- Every job file (staff `FilesList` and the task page's comment files) gets **Use as invoice** in its menu: it opens Enter invoice with that file and job filled in (Q2).
- Home's Needs you gains an `invoice` roll-up ("3 invoices to review · $2,450", plus "1 past due"), snooze-only per snooze-dismiss.md D3. A nav count would be new nav chrome (`nav.tsx` has no badge support) and is open (Q17).
- `/api/files/[kind]` and `/api/blob/[kind]` (an `invoice` kind that refuses one-job link sessions).
- `NotificationOutbox` (optional invoice, bundle keys, the money-email exception in `deliveryFor` once Q12 settles).
- `TaskFields` on the task page (Invoice row); the contractor page (an Invoices `Section` under Jobs, not a card: `Card` is for Home and Overview modules only).
- Row picking and the bulk bar from bulk edit (`usePicks`, `select-all.tsx`, `ActionBar placement="app"`) lift out of `src/app/(app)/tasks/` into `src/components/` with a components.md row, for To pay. Whether To pay picks like Tasks or with boxes is open (Q9). On a phone the bar reads "X 2" plus "Mark paid · $2,450.00", not the count twice.
- The page switch follows the Draws page (`FactStrip` above a `SegmentedControl` with counts, view in the URL), unless Connor picks clickable cards (Q8), which then need an edge as well as a fill.
- The portal: the Send for review payoff and finished job pages get "Send an invoice". The payoff moves to `components/` on this third use (components.md, Sent screen). Portal nav per Q7.
- `src/lib/tasks/core.ts` gains `createFinishedJob` (6.2).
- `src/lib/jobs-health.ts` (`invoice_read_failing`). `src/lib/env.ts` (`ANTHROPIC_API_KEY`). The static auth guard test covers the new routes.
- ⌘K search finds an invoice by contractor invoice number and exact total, stage as the row's meta; `RecentKind` gains `INVOICE`.

**New (no existing component does the job)**
- **Job multi-picker** with suggestions (review page and portal form), on `OptionList`. Jobber's select-jobs-to-invoice.
- **The invoice page layout:** Lightbox's document stage beside a form. Airwallex and Remote, linked in 5.2.
- **Portal nav,** only if Q7 picks a bottom bar (brand-guidelines.md says how one would look); TopTabs needs nothing new.
- The invoice consumer on the inbox router, the reading step, matching and duplicates.

New general-purpose components go in `src/components/` with a row in docs/components.md in the same commit.

**States to draw** (none were specified): an empty view for each of the four views ("Nothing to review. New invoices land here." with all-clear art for To review; one `EmptyState` line for the others); the last Confirm, next landing on that all-clear; a Couldn't read invoice (file card with Download, empty fields to type in); a contractor with no eligible jobs (the form opens on Work not listed); a long job list (search); a skeleton for each new route.

---

## 8. Build order

Each step is usable on its own.

The order below is the Oct 23 one. Q3 (10.2) proposes a smaller one: staff side plus "Use as invoice" on job files, then an invoice on the Send for review sheet, then the inbox only once a month of use shows invoices arriving outside jobs.

1. **Staff side:** schema and services, New invoice by hand, the Invoices page, the invoice page, Mark paid and Undo, No invoice and "No invoice needed", the task rail row, the contractor section. Staff emails move to step 2 unless Q5 says otherwise, since in step 1 the only invoices are ones a partner typed in.
2. **The inbox:** the invoice consumer on `/api/email/inbound`, its cron route, reading, matching, duplicates, the cap, Gmail confirm rows, staff emails.
3. **The portal:** portal nav, the Invoices list, Send invoice, the sent screen, detail with edit and withdraw, shortcuts, Sent back and Paid emails.

Each step ends with `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`, with new samples in `SAMPLE_PARAMS` for `/invoices/[id]` and `/p/invoices/[id]`. No local DB has invoices, so `tests/devices/setup.ts` seeds one staff-side invoice per stage the page renders (To review with flags, To pay, Paid) and one portal invoice for the fixture contractor, written by a system actor so no email is queued.

**Tests worth having:** stage moves and who may make them; the portal never showing emailed invoices in To review or another contractor's invoices; a link session seeing no invoice, amount or file; view-as refusing every invoice action; the duplicate rule (file hash, normalized numbers, deposit then final); the cap and the per-sender cap; idempotency (one email read twice makes one invoice); an invoice email never reaching the reply path and the reverse; a forged From with DMARC failing never auto-matching and never skipping the staff email; model output naming a job or contractor outside the candidate set being dropped; a negative or "1.2k" total refused; Mark paid racing Mark paid; Undo paid before and after the email went; Create job sending nothing and landing with a finished date; a read that keeps failing landing as Couldn't read; the "asks to be paid a new way" flag storing no digits. (The webhook signature is already covered by `inbound.test.ts`.)

---

## 9. Setup Connor does (before step 2)

- **Anthropic API key:** create one in the Claude Console and add `ANTHROPIC_API_KEY` in Vercel.
- **Resend Pro** ($20 a month) before contractors' own systems point at the inbox, since received mail counts toward the quota.
- **Address:** nothing to do for `invoices@mail.hgcapitalpartners.com`, which receives today. For the root `invoices@hgcapitalpartners.com`: re-run `dig MX` on the root first, then add receiving for the root in Resend and its MX in GoDaddy on the **ns19/ns20 zone** (not `...llc.com`) (10.2, Q4). The webhook and its secret already exist.
- **Optional:** in Gmail, a filter that auto-forwards chosen contractors' emails to the inbox (default 8 shows the confirm email).

---

## 10. Re-review (Nov 20, 2026)

Six independent reviews (code drift, other specs, accounts-payable cases, security and fraud, UI and copy rules, outside facts), each checked by a skeptic against the files, then a completeness pass. 84 findings, 83 held up. The factual ones are fixed in place above; what's left is below.

### 10.1 What changed in place

- **Baselane, not "Baseline",** everywhere, enum included (`BASELANE`).
- **Timing:** the Nov 1 Asana cutover is past; the roadmap slots this after Invite the contractors.
- **The inbox reuses what job emails built:** one webhook (`/api/email/inbound`) routes by recipient; no new webhook, secret or DNS for `mail.`; received mail counts toward Resend's quota, so Pro first.
- **Sender trust follows the job-reply rule:** a From line counts only when DMARC passes (6.4 step 6).
- **Hardening rules** for model output, new payees, duplicates, credits, concurrency, money math, delete and retention (6.7), and for reads that keep failing (6.4 step 7).
- **Files:** no sandboxed frame for PDFs (it blanks the viewer); touch shows a file card (6.3). Claude doesn't read HEIC (default 5).
- **Access:** one-job link sessions never see invoices; view-as refuses invoice actions (6.3).
- **Create job** uses a new `createFinishedJob`, so it sends no job email and gets a finished date (6.2).
- **Section 7** rewritten against components.md and the design foundation; the selection bar and figure strip already exist; the states to draw are listed.
- **Section 8** tests and device seeds; staff emails move to step 2.

### 10.2 Open questions for Connor

Each has a recommendation. Q7 to Q9 change layout, so each gets 2 or 3 drawn options before anything is picked.

| # | Question | Recommendation |
|---|---|---|
| Q1 | **Which jobs count as contractor jobs?** Prod on Nov 20: 11 of 40 jobs finished since June have a contractor assigned (27 sit on Connor or Pieter, 28 of the 40 came from Asana); 21 of 114 open jobs do; 6 of 20 jobs made in the app since Nov 14 do. Local copies show 0, which is what prompted the count | **Decided Nov 20 (B):** staff may link any non-canceled job to an invoice; the Invoice row shows on contractor jobs and on any job with an invoice linked; No invoice chases only jobs with a contractor assignee, so it starts small and grows as jobs get assigned to contractors in the app |
| Q2 | **Invoices sent as replies to job emails.** A PDF in a reply posts to the job as a comment today, and a reply on a closed job goes to both partners by email. Neither reaches Invoices | **Decided Nov 20 (B).** A reply on a Done job that carries a PDF or photo becomes a To review invoice, already linked to that job, its sender proven by the reply token. Open-job replies stay comments. Every job file gets "Use as invoice", which opens Enter invoice with the file and job filled in, pointing at the existing file rather than copying it |
| Q3 | **Build smaller?** Job emails already bring files in, and 50 invoices a month is a guess | Step 1: staff side plus "Use as invoice". Step 2: an optional "Add your invoice" (total plus a file) on the existing Send for review sheet, and a short invoice list on the portal job page. Step 3: the invoices@ inbox and AI reading, only once a month of use shows invoices arriving outside jobs |
| Q4 | **Inbox address** | `invoices@mail.hgcapitalpartners.com`, which works today with no DNS change. The root address needs a new MX on the ns19/ns20 zone |
| Q5 | **Staff-entered invoices** | Land straight in To pay (entering it is the review) and send no staff email |
| Q6 | **Send invoice from a job link** | Always needs a full sign-in (the existing redirect), because job links get forwarded to crews |
| Q7 | **Portal nav** (visual) | `TopTabs` (Jobs, Invoices) under the portal header: stock, works at any width. Alternative: the bottom bar per brand-guidelines.md |
| Q8 | **Invoices page switch** (visual) | The Draws layout: `FactStrip` totals above a `SegmentedControl` with counts. "Marked by its fill alone" breaks the one-switch rule. Alternative: clickable cards with an edge on the pick |
| Q9 | **Picking in To pay** (visual) | Pick like Tasks (Cmd and Shift click, long-press, Select all) with the bulk bar, for one model across the app. Alternative: visible checkboxes as a deliberate money-row exception |
| Q10 | **Rehab invoices** | An optional Rehab link on Invoice now, so December's invoices don't need re-tagging; budget lines wait for the costs pass. A rehab-tagged invoice isn't flagged No job. "Not a contractor invoice" gets its own set-aside that's never auto-deleted, so receipts survive until costs exist |
| Q11 | **Deposits** | A Deposit tick on Invoice. A done job whose only invoices are deposits stays on No invoice ("Deposit $500 paid"), and the final invoice's review shows the deposit beside the total |
| Q12 | **Contractor emails** vs the Job emails switch | Paid and Sent back are money emails: they go to the contact's email even with no login and ignore the Job emails switch. With no email, the toast says to text them |
| Q13 | **Send back for emailed invoices** | Allow it on any invoice matched to a contractor, never to an unmatched sender |
| Q14 | **No invoice list** | Starts on launch day (a setting). "No invoice needed" is stored through the Snooze and Dismiss store (check `invoice.none`), keeps the optional reason, shows in Settings › Hidden, and the rows also get Snooze ("he says it's coming Friday"). No new Task columns |
| Q15 | **Payment methods** | One list shared with the contractor page's planned billing tags: Baselane transfer, Check, Card, Zelle, Venmo, Cash, Other. Card is separate because card payments are reported on 1099-K. Mark paid defaults to the contractor's tag once tags exist |
| Q16 | **Mark paid extras** | A gray "No W-9" flag on To pay rows (no block). When the method is Check, offer to attach a recent check photo from the planned Check photos feature (one check can pay several invoices) |
| Q17 | **Where the To review count shows** | Home's Needs you roll-up only. Skip the nav count, which would be new nav chrome |
| Q18 | **New payees and bank-change requests** | Confirm only to existing contractors, plus the "asks to be paid a new way" flag. Does a contractor's first-ever invoice need the other partner's look? Recommend no |
| Q19 | **Today's "pay X invoice" tasks** (70 in the data) | Once Invoices ships, an open contractor "pay X" task gets "Enter invoice" (filled from the title and assignee), which closes the task. Non-contractor bills stay tasks. Tasks from Claude leaves money items as tasks for now |
| Q20 | **Two "Due" dates** | Call the invoice's date to pay by "Pay by", so "Due" keeps meaning the job's one date |
| Q21 | **Multi-property and other people's jobs** | Work not listed and Create job take several properties (one done job each, all linked). On the staff review page, Add job searches any non-canceled job with a quiet "Assigned to Pieter" note |
| Q22 | **Over-quote check** | Out of scope: jobs have no price field. Listed in section 4 |
| Q23 | **Revised invoices** | "Same invoice" keeps the newer total by default. A revision after Paid is Keep both, the new one set to the unpaid difference by hand, with "revises #1043" in its note |
| Q24 | **Setup costs** | Resend Pro ($20 a month) before step 2, plus the model test in 6.4 step 7 |

The 11 defaults in section 3 still need a yes; defaults 2, 3 and 5 were changed by this review.
