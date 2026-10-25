# Contractor invoices: plan

**Status:** spec, agreed in grilling on 2026-10-23. Planning only: the build starts after the Nov 1 Asana cutover, and only after an explicit "build it".

---

## 1. Goal

Every contractor invoice lands in one place, tied to the jobs it covers, so Connor and Pieter can see what's owed, what's paid, and which finished jobs still have no invoice.

- **Three ways in:** a contractor sends one in the portal; an email reaches `invoices@hgcapitalpartners.com` (forwarded by staff, or sent straight from a contractor's own invoicing system); or staff enter one by hand.
- **Money doesn't move in the app.** Connor pays in Baseline as today, then marks the invoice paid.
- **Optional for contractors.** Nobody has to change how they bill. Those with their own systems point them at the inbox, or keep emailing and Connor forwards.

---

## 2. What we found

**How contractors bill today:** texts and emails with an amount, or PDFs from their own systems. Payment details live in Baseline; the app's contacts only say "Check", "Zelle" or "Venmo" and never hold account numbers.

**The domain is free for an inbox.** `hgcapitalpartners.com` has no MX records (`dig MX` on 2026-10-23), so nobody receives mail there today and an inbox address breaks nothing. Remember the near-identical `hgcapitalpartnersllc.com` zone: the live one is on nameservers ns19/ns20.

**Resend can receive mail.** We already chose Resend for outgoing email. Its inbound feature takes mail for a domain and calls a webhook with an `email.received` event; the webhook carries attachment metadata only, and the app fetches the files through Resend's API. Inbound is included on every plan; whether received mail counts toward the free plan's 100 a day needs checking in the build (Pro is $20 a month if it does). [Receiving](https://resend.com/docs/dashboard/inbound/introduction), [email.received](https://resend.com/docs/webhooks/inboxes/email-received.md), [pricing](https://resend.com/pricing).

**Ramp and QuickBooks work the same way.** Ramp gives each business an AP address, reads every attachment, pre-fills a draft bill, and someone reviews it before approval and payment. [Ramp AP email forwarding](https://support.ramp.com/hc/en-us/articles/35659701397395-Bill-Pay-AP-Email-Forwarding). One difference for us: invoicing systems (QuickBooks, Square, Jobber) send from their own address, so the contractor has to be worked out from the invoice itself, not just the sender.

**Reading invoices.** Claude Opus 5.5 (`claude-opus-5-5`, $4 in / $20 out per million tokens) takes PDFs and photos directly and returns structured output against a schema. A one-to-two-page invoice with its email is roughly 5,000 tokens in; both passes (section 6.4) come to about **5 to 10 cents an invoice**, or $3 to $5 a month at 50 invoices. The daily cap (I9) bounds the worst case.

**Mobbin.** References for every screen are linked in section 5. Ramp, Bill.com and Housecall Pro aren't on Mobbin; Mercury, Shopify Bill Pay, Xero, QuickBooks, Airwallex, Remote, Jobber and Turo are.

---

## 3. Decisions (all settled 2026-10-23)

| # | Topic | Decision |
|---|---|---|
| I1 | Payments | Paid in Baseline, outside the app. The app records the date, method and a note |
| I2 | Contractor use | Optional. Every contractor with a portal login can send invoices; there's no per-contractor switch |
| I3 | Ways in | Portal, the invoice inbox, and staff entry by hand |
| I4 | Shape | A total plus the jobs it covers. No per-job split; the app isn't for reconciling to properties |
| I5 | Stages | **To review**, then **To pay**, then **Paid**. Side exits: **Sent back** (portal invoices, with a note) and **Not an invoice** (junk). Either partner moves any invoice |
| I6 | Which jobs | Any job assigned to that contractor that isn't canceled, open or done. A job can have several invoices (deposit, then final) |
| I7 | Timing | After the Nov 1 cutover |
| I8 | Address | `invoices@hgcapitalpartners.com`. If the domain ever gets its own email (Google Workspace), that host forwards this address on |
| I9 | Who can send | Anyone. A daily cap of 50 emails; invoices the app can't match to a contractor are flagged "Who's this from?" |
| I10 | Review | A person always confirms an emailed invoice before To pay, however confident the match |
| I11 | Scope | Contractor invoices only. Other bills (utilities, insurance, taxes) get "Not a contractor invoice" and are set aside |
| I12 | Coverage | A **No invoice** list: done contractor jobs with no invoice. Each has **No invoice needed** with an optional reason (warranty, covered by another bill, paid on the spot) |
| I13 | Duplicates | Flag a **possible duplicate** beside the total when the contractor and invoice number match, or the contractor and total match within 30 days. Staff choose "Same invoice" (merged, its file kept on the original) or "Keep both". Never merged automatically |
| I14 | Mark paid | Tick several in To pay, any mix of contractors, and mark them paid in one step: one date (Today by default), one method, an optional note. The button shows the total ("Mark 3 paid · $2,450.00"); a toast offers Undo |
| I15 | Partial payments | Not tracked. An invoice is paid or not; a partial payment goes in the note. A deposit is its own invoice |
| I16 | Contractor view | The portal lists all of a contractor's invoices with their status, including emailed ones once staff confirm them. Emailed invoices still in To review stay hidden. Each job shows its invoices |
| I17 | Contractor emails | **Sent back** (with the note) and **Paid** (date, method, invoice number), to anyone with an email on file, login or not. Several of one contractor's invoices marked paid at once make one email. Nothing for To pay, and no receipt on arrival |
| I18 | Staff emails | A new invoice in To review emails both partners, bundled over 10 minutes, except ones a partner forwarded. The Invoices menu item shows the To review count |
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
| I29 | Task page | An **Invoice** row in the side rail (a chip on tablet and phone), only when a contractor is assigned. Stage as plain text, never a badge. With none: "None yet" opens Link an invoice, Enter an invoice, No invoice needed |
| I30 | Contractor page | An **Invoices** card under Jobs: "$850 to pay · $9,240 paid in 2026" in the header, the latest invoices, and "See all on Invoices" (the Invoices page filtered to them) |

### Defaults I filled in (confirm or correct)

1. **Contractor wording.** The portal shows Received (To review), Approved (To pay), Paid with date and method, and Sent back. "To pay" reads oddly from the contractor's side.
2. **Payment methods:** Baseline transfer (the default), Check, Zelle, Venmo, Cash, Other.
3. **The No invoice list starts at cutover:** jobs finished on or after Nov 1, 2026.
4. **Over the daily cap,** extra emails wait and are read the next day. A line on the Invoices page says how many are waiting.
5. **Files the app reads:** PDF, JPG, PNG and HEIC, within the existing document size limits. Anything else (Word, Excel) is kept but not read, and the invoice lands in To review flagged "Couldn't read".
6. **Not an invoice and withdrawn items** are kept for 30 days, then deleted with their files.
7. **Due dates** come from the invoice file or from staff. The portal form doesn't ask for one.
8. **Gmail auto-forward.** Gmail's "confirm forwarding" email shows in To review as its own row with the link, so Connor can finish setting up an automatic forward for chosen senders.
9. **Deleting.** Staff can delete an invoice (soft delete, recorded in its history); contractors can only withdraw.
10. **Reassigning a job** keeps its invoice links. The earlier contractor still sees their invoice with the job's title, without a link to the job.
11. **Build order:** the staff side first, then the inbox, then the portal (section 8).

---

## 4. Out of scope (later, if wanted)

- Moving money, or reading payments back from Baseline.
- Writing bills to QuickBooks, or matching paid invoices to QuickBooks transactions. QuickBooks stays read-only.
- Partial payments (I15), per-job amounts (I4) and property cost rollups.
- 1099 reports. The contractor card's "paid in 2026" is the starting point.
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
- **Send invoice** (`/p/invoices/new?job=<id>`): the one-screen form (I28). Uploads use `MediaUploader` with documents allowed, held by `LeaveGuard` while they go up.
- **Sent screen:** reuses the Mark done payoff: "Thanks, Zack!", "Connor or Pieter will review it. You'll get an email when it's paid." (names from the user table), and the invoice card with its first status. Line spot art when that gap is filled (components.md, Known gaps).
- **Invoice detail** (`/p/invoices/[id]`): Received, Approved, Paid as steps, jobs, file, note, and any sent-back note. Edit and Withdraw while Received.
- **Shortcuts:** "Send an invoice" on the Mark done payoff and on each finished job's page, with that job ticked.

References: [Turo repair invoice](https://mobbin.com/screens/4c38490a-a4aa-446d-bb11-d55fd5c25bb5), [Jobber new expense](https://mobbin.com/screens/7f8a7d6c-bfcb-4347-abe3-b0a9b26603d1), [Mercury submitted](https://mobbin.com/screens/bba69488-ff37-4905-9c3d-161c1e489f39), [Remote invoice list](https://mobbin.com/screens/9d28f831-4dbd-438f-83c7-466dcad13a7f); bottom bar per Apple HIG tab bars and Material navigation bar (top-level destinations only).

---

## 6. Architecture

### 6.1 Data

New tables, with RLS like every new table (README, Rules of the road). Money as `Decimal(12, 2)` like the rest of the schema.

- **`Invoice`:** contact (null until matched), source (`PORTAL | EMAIL | STAFF`), stage (`REVIEW | TO_PAY | PAID | SENT_BACK | NOT_INVOICE | WITHDRAWN`), contractor's invoice number, invoice date, due date, total, note, description and property (for work not listed), duplicate-of, sent-back note, paid date, method (`BASELINE | CHECK | ZELLE | VENMO | CASH | OTHER`), paid note, paid by, confirmed at and by, creator (user or contact, one of them, CHECK), inbound email, `extraction` JSON (what the model read and which model), timestamps, `deletedAt`.
- **`InvoiceTask`:** invoice and task, unique together. Keeps the job title at link time for display after a reassignment.
- **`InvoiceFile`:** private Blob metadata, the same shape as `TaskAttachment`'s file fields.
- **`InvoiceEvent`:** the history (kind, actor user or contact, actor label, data, time).
- **`InboundEmail`:** Resend's email id (unique, for idempotency), from, reply-to, subject, received time, text body, status (`QUEUED | READ | HELD_CAP | FAILED | GMAIL_CONFIRM`), error, invoice.
- **`Task`** gains `invoiceNotNeededAt`, `invoiceNotNeededReason`, `invoiceNotNeededByUserId`.

### 6.2 Services

All writes go through `src/lib/invoices/service.ts` (stage moves, links, Create job, mark paid and undo, duplicates, not-needed), each writing its `InvoiceEvent` in the same transaction. Create job calls `src/lib/tasks/core.ts`, never Prisma directly. Reads in `queries.ts` (staff) and `src/lib/portal/` (contractor). Nothing under `src/lib/invoices/` imports staff auth or QuickBooks, so the portal can use it (`src/lib/auth-guard.test.ts`).

### 6.3 Access

- **Staff:** `requireUser()` on every page, action and route.
- **Contractors:** `requirePortalPrincipal()`; only invoices with their contact id, never `NOT_INVOICE`, and emailed ones only once confirmed. Linking jobs in the portal is limited to jobs they have live `TaskAccess` to.
- **Files** through `/api/files/invoice/<id>` with the same checks, served with the existing safe headers (`src/lib/attachments/headers.ts`). Emailed PDFs are untrusted: shown in a sandboxed frame, never as same-origin HTML.

### 6.4 The inbox

1. **Receive.** Resend posts `email.received` to `/api/inbound/resend`. The route verifies the signature (`RESEND_WEBHOOK_SECRET`), stores an `InboundEmail` once per Resend id, and answers 200 at once.
2. **Fetch and store.** The once-a-minute cron (the existing outbox pattern) picks up queued rows, fetches the body and attachments from Resend's API, and saves readable files to private Blob.
3. **Cap.** Past 50 a day (Eastern), rows wait as `HELD_CAP` for the next day.
4. **Read, pass one.** One Claude call with the email text, the files, and the active contractor list (name, company, emails). Structured output: is it an invoice; original sender (for forwards); contractor match; invoice number; dates; total; line descriptions; property guess. The schema has no bank or payment fields, and the system prompt treats everything in the email as data, never instructions. A forward from a partner's own address is marked as theirs (no staff email, I18).
5. **Read, pass two.** With a contractor matched, a short call with that contractor's jobs (not canceled, last 120 days, plus open ones) returns suggested job ids. None found means "No job".
6. **Check.** Code (not the model) re-checks the contractor by exact email first, runs the duplicate test (I13), and lands the invoice in To review with its flags.
7. **Model call details.** `claude-opus-5-5`, effort set explicitly (start at `low`; measure on real invoices), `output_config.format` for the schema, server-side `fallbacks: "default"` for refusals, typed SDK errors, retried by the cron on failure.

### 6.5 Emails

- **Staff (I18):** `NotificationOutbox` gains an optional invoice and a bundle key per partner (`u:<id>:invoices`), so new invoices within 10 minutes become one email ("3 new invoices to review").
- **Contractors (I17):** Sent back and Paid rows keyed per contractor, so one Mark paid action makes one email per contractor. Sent through the existing Resend sender and templates in `src/lib/email/` and `src/lib/notifications/content.ts`.

### 6.6 Environment

Added to `src/lib/env.ts`: `ANTHROPIC_API_KEY`, `RESEND_WEBHOOK_SECRET`, `INVOICE_INBOX_ADDRESS`. A new dependency, `@anthropic-ai/sdk`.

---

## 7. Reuse check

**Reused as is**
- `Sheet` (Mark paid, No invoice needed reason), `Menu`, `useToast` with Undo, `DueDatePicker` (paid date, due date), `Badge`, `Card`, `Table`, `PageHeader`, `EmptyState`, `BackLink`, `LeaveGuard`, `ActivityTimeline` (history), `Lightbox` (image invoices).
- `MediaUploader` with `"file"` (portal attach), `Attachments` (staff upload).
- `AssigneePicker`'s Contractors list for the contractor field.
- Private Blob and `src/lib/attachments/` (content types, limits, safe headers).
- `NotificationOutbox`, the cron drain, the Resend sender, `src/lib/email/render.ts`.
- `requirePortalPrincipal()`, `src/lib/task-scope.ts`, `src/lib/money.ts`, `src/lib/dates.ts` (Eastern days).
- `src/lib/tasks/core.ts` for Create job.

**Extended**
- `SideNav` links (Invoices with a count).
- `/api/files/[kind]` and `/api/blob/[kind]` (an `invoice` kind).
- `NotificationOutbox` (optional invoice, bundle keys).
- `TaskFields` on the task page (Invoice row); the contractor page (Invoices card).
- The portal: `/p` gets the bottom bar; the Mark done payoff and finished job pages get "Send an invoice". The payoff moves to `components/` on this third use (components.md, Sent screen).
- `Kpi` moves from Financials to `components/` for the card figures.
- `src/lib/env.ts`; the static auth guard test covers the new routes.

**New (no existing component does the job)**
- **Filter cards:** total cards that act as the page's switch. Mercury and Deel, linked in 5.1.
- **Selection bar:** row checkboxes and a floating action bar, the first in the app. Shopify Bill Pay.
- **Document pane:** a PDF beside a form. Airwallex and Remote, linked in 5.2.
- **Portal bottom bar.** Apple HIG tab bars and Material navigation bar.
- **Job multi-picker** with suggestions (review page and portal form). Jobber's select-jobs-to-invoice.
- The inbox webhook, the reading step, matching and duplicates.

New general-purpose components (filter cards, selection bar, document pane, bottom bar) go in `src/components/` with a row in docs/components.md in the same commit.

---

## 8. Build order

Each step is usable on its own.

1. **Staff side:** schema and services, New invoice by hand, the Invoices page, the invoice page, Mark paid and Undo, No invoice and "No invoice needed", the task rail row, the contractor card, staff emails.
2. **The inbox:** DNS and Resend receiving, the webhook, the cron step, reading, matching, duplicates, the cap, Gmail confirm rows.
3. **The portal:** the bottom bar, the Invoices list, Send invoice, the sent screen, detail with edit and withdraw, shortcuts, Sent back and Paid emails.

Each step ends with `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`, with new samples in `SAMPLE_PARAMS` for `/invoices/[id]` and `/p/invoices/[id]`.

**Tests worth having:** stage moves and who may make them; the portal never showing emailed invoices in To review or another contractor's invoices; the duplicate rule; the cap; webhook signature and idempotency; matching on exact email before the model's guess; Undo paid; Create job.

---

## 9. Setup Connor does (before step 2)

- **Anthropic API key:** create one in the Claude Console and add `ANTHROPIC_API_KEY` in Vercel.
- **Resend receiving:** add receiving for `hgcapitalpartners.com` in Resend, then its MX record in GoDaddy on the **ns19/ns20 zone** (not `...llc.com`). Add the `email.received` webhook to `https://www.hgcapitalpartners.com/api/inbound/resend`, and its secret as `RESEND_WEBHOOK_SECRET` in Vercel.
- **Optional:** in Gmail, a filter that auto-forwards chosen contractors' emails to the inbox (default 8 shows the confirm email).
