# Roadmap: the next six months

Nov 16, 2026 to May 15, 2027. Written on Nov 14, 2026 against main at `200093a`. The interactive version, with the timeline, is the [HG Capital OS Roadmap](https://claude.ai/artifact/3HEJnqhyeToYKoKkfj4ypD) artifact (private to Connor until shared).

The order: trust the app first, then switch on the money, then give every unit a real tenancy, then use it all to grow.

31 items: 19 already planned (a spec, plan or review in this repo proposed them) and 12 new ideas. New ideas are recommendations only. Each one still gets a planning pass, a spec and Connor's "build it" before any code.

**Statuses:** In progress, Spec ready, Needs a spec, Waiting on Connor, Decision.
**Sizes** are rough build sizes with review and the device check: S about a day, M a few days, L a week or more.

## Start here

Three things only Connor can do. Each one unblocks a build.

1. **Send one test email.** Create the test contractor's login, then try Forgot password and a comment on a "Test:" job. It proves the send, the reply and the 8 am run.
2. **Say "build it" for error alerts.** The spec is done. Alerts go on before Zack and the other contractors start signing in.
3. **Connect QuickBooks.** Add the production keys in Vercel, then Connect on Financials, Settings. Five items below wait on it.

## Why this order

1. **Trust it first.** Asana is on its way out and contractors are about to sign in. Before that, the app has to say when it breaks and prove its emails arrive.
2. **Switch on what's already built.** The QuickBooks sync was finished in September and has never been connected in production: Vercel production has no `QBO_*` variables (checked Nov 14). About an hour of Connor's time fills Financials, rent and every property's P&L.
3. **Meet the tax calendar.** 1099-NEC forms are due Feb 1, 2027 (Jan 31 is a Sunday) and business returns Mar 15, so the money side has to be live in January.
4. **Fill the biggest hole: the tenancy.** No unit holds a tenant or a lease today, so the app can't answer keep, refi or sell. Leases feed the rent roll, the property hub and the refi packet.
5. **Grow last.** Underwriting and refi tools pay off once the numbers under them are real. By May there's six months of real use to decide on offering the app to other businesses.

## Now: Nov 16 to Dec 15. Trust it, then switch it on

| Item | Status | Size | When | After | Source |
|---|---|---|---|---|---|
| Prove email end to end | Waiting on Connor | S | Nov 16 to Nov 30 | | docs/todo-for-connor.md |
| Error alerts | Spec ready | S | Nov 16 to Nov 30 | | docs/specs/error-alerts.md |
| Finish leaving Asana | In progress | S | Nov 16 to Dec 15 | | docs/asana-migration-plan.md |
| Connect QuickBooks in production | Waiting on Connor | S | Dec 1 to Dec 15 | | src/lib/quickbooks/, README Runbook |
| Land the design calls | In progress | M | Nov 16 to Nov 30 | | branch `design-calls-nov14` |
| Invite the contractors | Waiting on Connor | S | Nov 16 to Jan 15 | Error alerts, Prove email | docs/todo-for-connor.md |
| Tidy the secrets (new) | Waiting on Connor | S | Nov 16 to Nov 30 | | README Runbook |
| Contractor page: W-9s, Billing, job history | Spec ready | S | Dec 1 to Dec 15 | Design calls | contractor page spec, Nov 14 |
| Tenant contact on jobs | Spec ready | M | Dec 1 to Dec 31 | Design calls | docs/specs/tenant-contact.md |
| Check photos on file (new) | Needs a spec | S | Nov 23 to Dec 15 | | Connor, Nov 19 |
| Tasks from Claude (new) | Waiting on Connor | L | Nov 23 to Dec 15 | | docs/todo-for-connor.md, docs/specs/tasks-from-claude.md |

- **Prove email end to end.** Job emails, reply by email and the 8 am Due today run are live, but no real one has gone out yet. One test with the test contractor's login proves all three.
- **Error alerts.** Nothing tells anyone when the app breaks. Sentry catches server and browser errors, and Better Stack watches the site, the email job and the QuickBooks sync. The spec puts it in before contractors are invited.
- **Finish leaving Asana.** The import ran on Nov 14 and a 7:05 am sync copies Asana's changes each morning, but Asana still gets edits every day. Cutover means both partners work only in the app, then the sync stops, Asana is canceled and `.env.prod-write` is deleted.
- **Connect QuickBooks in production.** The sync was built and checked against Intuit's sandbox in September, but Financials, rent and each property's P&L sit empty in production. The most value per hour on this list.
- **Land the design calls.** The 30 calls Connor answered on Nov 14 are being built on their own branch. Four of seven stages are committed (shared pieces, uploads and the portal, the address field, the property page). Lists, deal links and docs are left.
- **Invite the contractors.** Zack goes first. The rest follow once alerts are on and email is proven, the 14 contractors with no email have one, and the office phone is in for the portal's Call button.
- **Tidy the secrets.** `CONNOR_PASSWORD` and `PIETER_PASSWORD` are still in Vercel, though the Runbook says they can go once a build has saved them. Skew Protection is still off. Two settings changes and no build.
- **Contractor page.** Upload and view the actual W-9, Billing as Check, ACH or Credit Card tags, an insurance switch, and an Open | Done switch that reaches each contractor's whole history, Asana jobs included. The W-9 files feed January's 1099 list.
- **Tenant contact on jobs.** Each unit holds its tenant's name and phone, and each job shares the tenant, the lockbox code or both. It's the first step toward real tenancies. Three of its calls were reopened on Nov 14 and need Connor's answer.
- **Check photos on file.** Pieter snaps each check he writes from his phone, adds who it's to, the amount, the date and the property, and it files itself. Connor's high priority (Nov 19). Connor can find any check later by payee, property, amount or check number, and each one opens the photo. When contractor invoices land, a check photo attaches to the invoice it paid. Reuses: the private blob store and the attachment upload, file route and safe headers behind task and property files.
- **Tasks from Claude.** Pieter says tasks out loud to Claude on his phone, at a job site or after a drive. Claude asks what's missing (which unit, who, by when, whether the contractor can go in without the tenant there) and saves each one as a draft. Drafts wait in a Drafts group on the Tasks list until he taps Add, so nothing reaches a contractor unread. Each partner connects his own Claude from Settings, and it adds no running cost. Connor's high priority (Nov 19); planned Nov 20 in place of the in-app "Task recorder", which would have needed a transcription service. Built Nov 20 and 21 and on the live site switched off. Next are the steps in docs/todo-for-connor.md: a 10-minute check on Pieter's phone, one Vercel setting, and each partner connecting his own Claude. Reuses: New task and the Task model, the Tasks list's sections and row actions, the Review card, and the login.

## Next: Dec 16 to Jan 31. Money and the tax calendar

| Item | Status | Size | When | After | Source |
|---|---|---|---|---|---|
| Contractor invoices | Building (MVP, Nov 21) | M | Dec 16 to Feb 14 | Invite the contractors | docs/contractor-invoices-plan.md |
| 1099 list for January (new) | Needs a spec | S | Jan 1 to Jan 31 | QuickBooks, Contractor page | |
| Financials you can trust | Needs a spec | M | Dec 16 to Jan 15 | QuickBooks | docs/uiux-review/financials.md |
| Contractor onboarding in the portal | Spec ready | M | Dec 16 to Jan 15 | Contractor page | docs/specs/contractor-onboarding.md (branch `claude/contractor-form-integration-55b2b4`) |
| Year-end pack for the CPA (new) | Needs a spec | M | Jan 16 to Feb 28 | QuickBooks | |
| Leases on every unit | Needs a spec | L | Jan 16 to Feb 28 | Tenant contact | docs/property-page-plan.md section 2 |

- **Contractor invoices.** A lightweight MVP (Nov 20): contractors send an invoice from a job, reply to a job email with it, or forward it to `invoices@mail.`; a partner loads it, tacks it onto jobs, approves it and marks it paid; the contractor sees Received, Approved or Paid. No AI reading yet. Money still moves in Baselane. The fuller plan waits in docs/specs/contractor-invoices/full-plan.md.
- **1099 list for January.** One page lists each contractor's 2026 payments beside their W-9 and address, so whoever files has every number in one place. Reuses: QuickBooks vendor lines (`QboVendor`, `LedgerLine`) and the contractor page's W-9 files.
- **Financials you can trust.** The UI review found 104 issues there, 20 of them high: no stated period, a basis toggle that changes nothing, $0 where nothing is booked, and no way to open the lines behind a figure. Fix them once real data flows.
- **Contractor onboarding.** New contractors set themselves up from an invite or one sign-up link: details, trades, W-9 and insurance. It retires the Google Form, whose sheet holds every contractor's bank numbers in plain text.
- **Year-end pack for the CPA.** For each property and LLC: the 2026 P&L from QuickBooks, the CapEx finished this year and the loan facts, in one export. Ready by mid-February, ahead of the Mar 15 return deadline. Reuses: the QuickBooks queries behind Financials and the property CapEx model.
- **Leases on every unit.** Rent, lease end and deposit live in task text today. A lease per unit (tenant, dates, rent, deposit) puts renewals in Needs you 90 days out and marks each unit occupied, turning over or vacant.

## Then: Feb 1 to Mar 31. Tenancies and residents

| Item | Status | Size | When | After | Source |
|---|---|---|---|---|---|
| The property hub | Needs a spec | L | Feb 1 to Mar 31 | | docs/uiux-review/README.md (move 2), docs/property-page-plan.md section 1 |
| Resident maintenance requests | In progress | M | Feb 1 to Mar 15 | | docs/specs/maintenance-requests.md |
| Rent records in the app (new) | Needs a spec | M | Feb 1 to Feb 28 | Leases | Connor, Nov 20; scripts/migrate/run.ts |
| Rent roll from leases | Needs a spec | M | Feb 15 to Mar 15 | Leases, QuickBooks | docs/property-page-plan.md section 2 |
| Monday note for the partners (new) | Needs a spec | S | Feb 1 to Feb 14 | QuickBooks | |
| Move-in report by personal link | Needs a spec | S | Mar 1 to Mar 31 | Leases | docs/uiux-review/journeys.md |

- **The property hub.** One record layout, built first on the property page: a summary strip with value, equity, LTV, cash flow and the next key date, tabs with counts and one timeline. It starts with two or three layouts for Connor to pick. Deals, tasks and contractors reuse it later.
- **Resident maintenance requests.** Each current tenant gets their own link to report a repair with photos or video and permission to enter. It lands in Needs you as a task, both partners get an email, and the resident follows three steps (Received, Scheduled, Done) by email. Emergencies stay in the group chat. Planned with Connor on Nov 21 (docs/specs/maintenance-requests.md) and built the same day; waits for his commit. On launch day he presses Email request links on the Tenants list.
- **Rent records in the app.** The Rent Record Keeping sheet, the history of who paid what and when, moves into the app. The first import left it behind on purpose until the money side was live. Each payment sits on its lease, so a unit shows its full rent history and the sheet can retire. It also becomes the check against QuickBooks that Financials Settings points to today. Connor's ask (Nov 20). Reuses: the lease records and `scripts/migrate/04-tenants.ts`'s dry-run-then-write import, and `LedgerLine` for the QuickBooks side.
- **Rent roll from leases.** Expected rent per unit from its lease, next to what QuickBooks shows came in, month by month, with late or short months flagged. It extends the Rent roll page that already reads QuickBooks.
- **Monday note for the partners.** One email each Monday for Connor and Pieter: what's late, what's due this week, jobs waiting for review, key dates coming up, and last week's money in and out. Reuses: the notifications cron and outbox behind the 8 am emails, and Home's Needs you queries.
- **Move-in report by personal link.** Today it's one long public form that lands as a text dump inside a task. Sent from the NEW TENANT playbook, it saves as the resident goes and files itself to the unit as a dated record.

## Later: Apr 1 to May 15. Grow the portfolio

| Item | Status | Size | When | After | Source |
|---|---|---|---|---|---|
| Refi packet (new) | Needs a spec | M | Apr 1 to Apr 30 | Rent roll, Leases | |
| Loan history | Needs a spec | S | Apr 1 to Apr 15 | | docs/property-page-plan.md section 3 |
| Deal underwriting (new) | Needs a spec | M | Apr 16 to May 15 | | |
| Deals pipeline view | Needs a spec | M | Apr 16 to May 15 | | docs/uiux-review/deals.md |
| Forward a listing, get a deal (new) | Needs a spec | S | May 1 to May 15 | Contractor invoices | |
| Decide on other businesses | Decision | | May 1 to May 15 | | docs/other-businesses-later.md |

- **Refi packet.** The refi is where a BRRRR pays off, and every lender asks for the same packet: rent roll, leases, a trailing 12-month P&L, CapEx done, insurance and photos. One button on the property builds it as a PDF or a private link. Reuses: the rent roll, leases, QuickBooks P&L, property documents and photos.
- **Loan history.** Each property holds one flat loan, so a refi writes over the old one. A list of loans per property keeps the history and gives each loan its own maturity reminder.
- **Deal underwriting.** Deals hold the asking price and target offer but no math. Purchase, rehab, after-repair value, rent and refi terms give cash left in, monthly cash flow and DSCR, and Convert to property carries them over. Reuses: the Deal record and its convert-to-property path.
- **Deals pipeline view.** The deals list is a sheet of live inputs that scrolls sideways at 1280 and stops at 300 rows. Read-only rows that open the deal, a stage board and saved views, as the UI review proposed.
- **Forward a listing, get a deal.** Forward a listing email to a `deals@` address and it becomes a draft deal with the address, price and link filled in. Reuses: the inbound mail webhook (`/api/email/inbound`) from reply by email and the invoices inbox.
- **Decide on other businesses.** By May, HG Capital will have run on the app for six months, the point other-businesses-later.md set for deciding whether to offer it to other operators. A decision and, if yes, a spec. No build.

## Waiting on Connor

| What | Unblocks |
|---|---|
| Create the test contractor's login and send one test | Prove email, Invite the contractors |
| Say "build it" for error alerts | Error alerts |
| Add the QuickBooks production keys, then Connect | QuickBooks, Financials fixes, 1099 list, CPA pack, Rent roll |
| Stop using Asana, and check when its billing ends | Finish leaving Asana |
| Answer the three reopened tenant contact calls | Tenant contact |
| Emails for 14 contractors, and the office phone | Invite the contractors |
| Commit maintenance requests, then Email request links on launch day | Maintenance requests |
| Remove the two password variables, turn on Skew Protection | Tidy the secrets |
| An address provider key, the Zillow link, playbook timing | The public site and playbooks |

## Not in these six months

- **View as a contractor.** Specced on Nov 14 (docs/specs/view-as.md), then paused by Connor. It needs a recheck against one-tap job links before any build.
- **A texting service for job alerts.** Crews live on SMS, but on Nov 14 Connor chose no texting service. Worth asking again only if contractors miss job emails after the rollout.
- **Payments in the app.** Rent and bills stay in Baselane and QuickBooks. The invoices plan keeps money out of the app and records what was paid.
- **Accounts for other businesses.** Nothing gets built toward it in this window. The May decision says whether to start.
- **A phone app.** The app and the portal already work in a phone's browser. Revisit once there's real contractor usage to learn from.
- **Insurance expiry tracking.** Connor dropped COI expiry dates on Nov 14. The contractor page gets a Yes or No insurance switch instead.

## Keeping this current

Update a row's status when it changes, and move finished items to a short "Done" list at the bottom. When an item gets a spec, link it in the Source column. When the order changes, republish the artifact by its URL so the link stays the same.

## Done

- **Coming soon rentals and a sign-up list** (Nov 21, `dfb4223`). A listing can be Coming soon: Rentals shows it with a "Coming soon" or "Coming in January" pill and Notify me (first name, email, optional phone). The listing sheet lists who signed up, with Copy emails for a Gmail blast and Download (.csv); the row shows "3 waiting". The app sends no email. Spec: docs/specs/coming-soon.md.
- **Rehab draw tracker** (Nov 20, `8b29fea`). A Draws page shows available, submitted and funded across every open rehab, with each one's current draw and its requested amount. Each rehab follows its loan and keeps the lender's budget line by line, from Vontive's uploaded worksheet or typed lines; New draw builds a request line by line, capped at what each line has available, and each draw moves through Sent, Inspection, Approved and Funded with a next-step button. Needs you flags a draw stuck 10 days. Spec: docs/specs/rehab-draws.md.
- **Shorter activity** (Nov 20, `bc996d0`). Older changes between comments collapse Linear style ("Show 5 updates: assignee, due date and Asana move"), the newest 2 stay in view, and day headings are gone, on the task page, the contractor's job page and the deal log. Spec: docs/specs/activity-collapse.md.
