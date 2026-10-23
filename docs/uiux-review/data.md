# Lens: tables, numbers, money, charts and status

Part of the [UI/UX review](README.md). 22 findings: 0 critical, 7 high, 9 medium, 6 low.

## How it should work

Every figure in HG gets typeset, traceable and complete. Four primitives in src/components/ui.tsx (DataTable, Stat, StatusDot, DateCell) and one Money formatter carry the rules.

Tables read like Stripe's Transactions (https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258). Headers are sentence case and rows hold one line. Money is right-aligned in tabular figures, an empty cell shows a lone dash, and status is a dot plus one word in a fixed column, as in Vercel's deployments (https://mobbin.com/screens/ac75e179-8e00-463a-9cba-b20d424db41c). Footers count and sum what is on screen, as Attio's do (https://mobbin.com/screens/a44be622-b84a-4805-ad7a-6f600ece6356). Grouped lists carry a subtotal for each group, as in Copilot's accounts (https://mobbin.com/screens/fcb4126b-4d10-4708-98ae-ddbf5ed80ba4). That makes the Portfolio the lender SREO: grouped by LLC, with the loan balance it already stores and LTV and equity beside value. Below 640px every table becomes two-line rows, as Stripe Dashboard and Mercury do on phones.

Money follows Mercury (https://mobbin.com/screens/f77b24a7-e68e-4fc1-b5ac-91856a92f12b). Money in is green with no sign and money out takes a true minus. Totals are whole dollars and transaction lines show cents. Red appears only for a loss.

Every number opens the rows behind it. A Financials figure links to its QuickBooks lines, filtered by removable chips, under a Money in, Money out and Net strip that follows the filter (https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05). Data gaps become one sentence with a link, the way Mercury Insights writes them (https://mobbin.com/screens/c6574c88-b41c-417d-acf3-3bd0fc60c6b1). The period is stated and can be switched, as on Stripe's overview (https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b). The month chart puts income above zero and expenses below, with a net line (https://mobbin.com/screens/c89c2bed-2255-4da1-92d0-96d0d26825f4). Income, Opex, NOI and cash flow read as one equation, like Jobber's profitability strip (https://mobbin.com/screens/50f5f03d-9bbb-4e5b-aae8-7051e509dbd6). Any table exports what it shows, as Shopify's does (https://mobbin.com/screens/c036a306-c929-43c2-b978-637fc002ce33).

Time is measured against plan, the way Flighty measures flights (https://mobbin.com/screens/d2a15492-9519-4965-826f-649edbfc3521). A rehab reads "Rehabbing · 15 mo" next to the time past refinances took. A finished job says how long after its due date it closed. When an asking price is cut, the old price appears struck through, as in Zillow's price history (https://mobbin.com/screens/c105ccb0-8726-49c8-851c-6bce01e8b6f4). Dates read like Things 3 (https://mobbin.com/screens/97952802-d1f3-4324-8a5b-fab1bc02c29e): "4d left" or "today", then a real date once overdue, in red only when late.

Empty and partial states say so in one sentence over ghost rows, as Mercury does (https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930), and never print $0. Ramp has no screens on Mobbin. Its problems-first rule shows up here as the data-gap line and the overdue group.

<details><summary>What the reviewer covered</summary>

Server on :3200 was up; every shot is Chromium (no WebKit run). Routes exercised: / (Home KPIs, 5-year CapEx card, My open tasks), /deals (Active and ?status=all, scrolled), /deals/cmtg25yd8002cjphs49ovlvob, /deals/cmtg25ydh002zjphsuyjd90go, /deals/cmtg25yfu00fqjphspp5qizdo, /tasks, /tasks/cmtg25z7s048mjphsikewzpy1, /properties, /properties/cmtg25y4p0006jphsv3frndk6 (767 Prospect: CapEx forecast, Building CapEx view and edit mode, Units with Equipment expanded, Loan, Insurance, Tasks, Rentals), /properties/cmtg25y4k0002jphsxww4tv6k (118 Congress: mapped QuickBooks card), /financials, /financials/rent-roll, /financials/settings, /contractors, /contractors/cmtg25y9x000djphsbqty81fr, /settings (CapEx rules). Viewports: desktop 1280 on every route; laptop 1440 and wide 1920 measured on /deals; tablet 768 on Home, Deals, Tasks, Properties and Financials; mobile 375 on Home, Deals, Tasks, Properties, Financials, Rent roll, Contractors, a deal and a task, and on 118 Congress (CapEx, Building CapEx, Loan); narrow 320 on Home and Financials. Dark mode: Home, Deals, Portfolio, Financials, Rent roll, plus 767 Prospect with Equipment open. States opened: CapEx year selection, CapEx hover tooltips (cell and total) and a tablet tap, deal latest-note tooltip, unit Equipment disclosure, Building CapEx edit mode. I also scripted checks across all 11 properties (list vs detail unit counts, loan fields) and all 193 open tasks (overdue count, due labels). Not reached: the deal status multiselect popover; loan and insurance edit forms (all 11 loans have no maturity, rate or payment, so maturity labels were checked in code only); recent transaction rows on a property card (no mapped property has synced lines, so cents rounding is code-verified); public pages and the contractor portal (out of scope or not built). On Mobbin, Ramp, Brex, Stessa, Baselane, AppFolio and Buildium returned no screens. Their queries came back with Midday, Expensify, QuickBooks, Origin, Monarch, Zillow Rentals, Jobber and others, and those are cited as returned.

</details>

## Findings

### DATA-007

**Sandbox QuickBooks data is shown as real P&L with no label**

High · Fix · effort S · `/financials, /financials/rent-roll, property Financials card` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, financials): Overview, Rent roll and the property card show one gray line, 'Sandbox test data, not the real books.', while conn.environment is sandbox (new SandboxNotice in financials/_components/ui.tsx, plus a sandbox flag on the three query results). Left: DATA-007: the recommended copy ('Connect the production QuickBooks company to see real figures') is shortened to 'Sandbox test data, not the real books.' so it fits one line at 375.
- **Today:** Settings lists "Environment sandbox", but the Overview, Rent roll and property Financials cards show a "QuickBooks" badge and real-looking figures ($5,080 income, NOI -$1,904) with nothing saying it is test data.
- **Why:** Partners could quote or act on sample-company numbers. Stripe marks every test-data view in plain words.
- **Change:** When conn.environment is sandbox, put one line above the figures on every Financials surface: "Sandbox data. Connect the production QuickBooks company to see real figures." Use the gray neutral tone, not amber, since it is a mode rather than a warning.
- **Desktop, tablet, phone:** One line at desktop and tablet; on phone it wraps to two lines above the first Stat.
- **Reuse:** SourceBadge in financials/_components/ui.tsx (add an environment prop)
- **References:** 
  - [Stripe](https://mobbin.com/screens/d7461782-27a7-41e9-aa99-ac528bcd4fca): Test-mode bar: "You're using test data. No real transactions will be processed."
- **Code:** `src/app/(app)/financials/settings/page.tsx:84`
- **Verification:** confirmed. Settings reads "Environment sandbox" while Overview, Rent roll and the property card show unlabeled figures. Mobbin d7461782 checked: it is Stripe's test-mode bar with that exact copy. Stripe uses a strong orange bar, while the finding proposes gray; either works as long as it's always present. Risk depends on production still being sandbox-connected; project notes say production connect is next.

### DATA-012

**A mapped property with no synced lines shows Income $0, Opex $0, NOI $0**

High · Fix · effort S · `/properties/[id] Financials card` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, property-money): A mapped property with no synced QuickBooks lines now shows "No QuickBooks activity for this property yet." instead of Income $0, Opex $0 and NOI $0. This uses a new hasLines field on PropertyFinancials in src/lib/quickbooks/queries.ts. Left: DATA-012: saying which period the Financials figures cover is DATA-020, not done here. I changed the suggested copy 'since it was mapped' to 'yet', because the sync re-applies the class mapping to every synced month, so 'since it was mapped' would be wrong.
- **Today:** On 118 Congress (Refinanced, 3 units), the Financials card shows three $0 figures, with no period, as if the property earned nothing.
- **Why:** $0 is a claim about money. With no lines the honest state is "no QuickBooks activity yet", not zero income.
- **Change:** When the property has no lines, replace the three figures with one line: "No QuickBooks activity for this property since it was mapped." Show the figures only once at least one line exists, with the period stated (DATA-020).
- **Desktop, tablet, phone:** Same one line at every size.
- **Reuse:** PropertyFinancialsCard in src/app/(app)/properties/[id]/financials.tsx
- **References:** 
  - [Mercury](https://mobbin.com/screens/165fa92f-e286-4c9c-8215-94d43b883300): Money in $0.00 is paired with 'No incoming transfers' and the next step, so a zero reads as no activity yet rather than a result.
  - [Square](https://mobbin.com/screens/250d922f-0b7d-4f45-af91-c0e7336874c2): An empty state instead of zero-value widgets
  - [Mercury](https://mobbin.com/screens/33aa85ec-2765-421d-b954-5ef74b748e81): When a month has no activity, the list area says 'No money in' in one line instead of listing zero rows.
  - [Airbnb](https://mobbin.com/screens/02184364-327d-4c8b-b5c8-7424686b207a): Each empty section states it plainly in one line ('No upcoming reservations at the moment.') instead of showing zeros
  - [Mercury](https://mobbin.com/screens/d0553915-6c36-4702-a8ef-907d38c5099e): A connected but empty view says "No transactions yet" instead of showing zero totals.
  - [Copilot](https://mobbin.com/screens/e4104151-c47b-47fb-9971-327ce2ad89c4): The figure and its period are one phrase ('$3,362 spent in Jun').
  - [HoneyBook](https://mobbin.com/screens/f32e5716-bf30-4944-8210-5b01ad695bc1): 'Jan 1–Dec 31, 2026' printed under the Cashflow title, with a period picker
  - [Origin](https://mobbin.com/screens/0ab66387-cf7d-4042-9249-519ac8ff5215): Custom range 'Oct 1, 2025 – Mar 2, 2026' above income, expense and net figures
  - [Stripe](https://mobbin.com/screens/f8db8469-2830-4c6b-98ca-53bf4c1e3caf): 'No metadata' and 'No active entitlements' instead of zero values
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:48-64`, `src/app/(app)/properties/[id]/financials.tsx:35-64`, `src/app/(app)/properties/[id]/financials.tsx:95-101`, `src/app/(app)/properties/[id]/financials.tsx:18-64`, `Local QboClass: HGC:HGC 118 Congress PROPERTY autoMatched; LedgerLine: 0 rows with a propertyId`, `src/app/(app)/properties/[id]/financials.tsx:46-64`, `src/lib/quickbooks/queries.ts:217-223`
- **Also found as:** FINANCIALS-V01 (Financials, rent roll and financial settings), G2A-V04 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), PROPERTY-026 (Property detail page (future property hub)), COPY-027 (Lens: words on every screen)
- **Verification:** confirmed. Confirmed at desktop and 375 (verify-DATA/p118--desktop-light.png, p118--capex--mobile-light.png): Income $0, Opex $0, NOI $0, no period, plus the caveat line. Pairs with DATA-011; use one rule for no-activity states on both surfaces.

### DATA-020

**The P&L never says which months it covers**

High · Design change · effort M · `/financials Overview` · The QuickBooks mirror is honest about what it covers

- **Today:** The Overview shows totals with "(5 mo)" after each figure and offers a "Show accrual basis" link, but no date range or period control. The monthly chart labels its months 2026-05 to 2026-08.
- **Why:** A P&L figure without its period can't be compared or quoted. Stripe opens with "key metrics over the last 12 months" and a period picker.
- **Change:** Add one header row: a segmented control ("Year to date | Last 12 months | Last month") plus a muted range line, "May 1 to Aug 31, 2026 · Cash". Drop the repeated "(N mo)" chips. The basis switch joins the same row (DATA-062).
- **Desktop, tablet, phone:** Desktop and tablet put the period control and range on one row. On phone the control goes full width above the Stats and the range line sits under it.
- **Reuse:** SegmentedControl from deals/filters.tsx (to be extracted per docs/components.md)
- **References:** 
  - [Stripe](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b): One control row: 'Last 7 days' compared to 'Previous period', interval 'Daily'; every card below follows it.
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): P&L header with 'Monthly' and '2026' pickers plus month chips; the current month labeled 'Sep MTD'.
  - [Stripe Dashboard](https://mobbin.com/screens/015d8f95-d080-4e50-ac46-6f37301c0ccb): On phone the period becomes a row of pills (1W, 4W, 1Y, MTD, QTD, YTD, ALL).
  - [HoneyBook](https://mobbin.com/screens/f32e5716-bf30-4944-8210-5b01ad695bc1): "Jan 1 to Dec 31, 2026" under the card title with a "This year" picker
  - [Mercury](https://mobbin.com/screens/868560a8-9acb-41d7-9708-82730b1257ad): 'Net change this month' with Money in and Money out: the period is named once in the strip label, and the figures inherit it.
  - [Mercury](https://mobbin.com/screens/18f7213d-0beb-4436-ad3d-0891b5bd5efe): One period selector ('Last month') governs every figure; month labels are words
- **Code:** `src/app/(app)/financials/page.tsx:52-89`, `src/lib/quickbooks/compute.ts:83-95`, `src/app/(app)/financials/_components/ui.tsx:10-13`, `src/app/(app)/financials/page.tsx:141`, `src/app/(app)/financials/_components/ui.tsx:9-13`
- **Also found as:** DATA-V06 (Lens: tables, numbers, money, charts and status), COPY-023 (Lens: words on every screen)
- **Verification:** confirmed. Confirmed: no date range anywhere; "(5 mo)" chips and ISO month labels only. Simplicity check: with only 4 to 5 months synced, YTD and Last 12 months would show the same numbers. Ship the range line ("May 1 to Aug 31, 2026 · Cash") first and add the period control once a year of history exists.

### DATA-I04

**No Financials figure opens the QuickBooks lines behind it**

High · New capability · effort L · `/financials Overview (KPIs, category bars, month rows)` · The QuickBooks mirror is honest about what it covers · big bet

- **Today:** Every figure on /financials is a dead end: the six KPI tiles, the category bars ('Other operating $4,897'), the four month rows and the '87 lines' tile are plain text. The app has no list of ledger lines anywhere. The only lines in the app are the property card's 8 'Recent transactions', and no property shows any today.
- **Why:** A read-only mirror earns trust when a partner can check a number in one click. Mercury opens any figure as the transactions behind a filter chip, with a Net change, Money in and Money out strip that follows the filter. Stripe ends every overview card with View more into the filtered list. Here, checking a surprising $4,897 means opening QuickBooks.
- **Change:** Add a read-only Lines view under Financials: Date, Payee, Account, Property, Amount, newest first, with the DataTable footer count and pager. Every figure links into it pre-filtered by removable chips ('Category is Other operating', 'Month is Aug', 'Property is 767 Prospect'). Esc clears them. One line above the rows gives Money in, Money out and Net for the current filter.
- **Desktop, tablet, phone:** Desktop: full table, with the strip on one line. Tablet: Account moves into the Payee cell as a muted second line. Phone: two-line rows (payee left, amount right, date and account muted beneath). The strip becomes three short figures, and the chips scroll in one row.
- **Reuse:** Table/DataTable with DATA-013 numerics and DATA-041 pager; TopTabs for the new Financials sub-route; a FilterChip built from Badge. LedgerLine already holds every field.
- **References:** 
  - [Mercury](https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05): A filter becomes a '≥ $1,000' chip with Reset, and the Net change / Money in / Money out strip recomputes for it.
  - [Mercury](https://mobbin.com/screens/f77b24a7-e68e-4fc1-b5ac-91856a92f12b): Summary strip with last-month comparison sits directly above the rows it summarizes.
  - [Stripe](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b): Every overview card ends with View more into the filtered list.
  - [Mercury](https://mobbin.com/screens/00c8f4dd-af66-45f9-9748-10bc2ad290fc): Report drilldown: a figure opens a panel with title, date range and total, Line entries and Transactions tabs with counts, removable filter chips, export and download, and up and down arrows to step between figures.
  - [Copilot](https://mobbin.com/screens/e4104151-c47b-47fb-9971-327ce2ad89c4): Selecting a category opens a side panel with the period figure, a 12-month bar history, 'Spent per year' and 'Avg monthly', then that month's transactions grouped by day.
  - [Rocket Money](https://mobbin.com/screens/90eca6fd-2b6e-409c-ba78-52b93097ed7e): Category page with monthly bars above its transaction list
  - [Copilot](https://mobbin.com/screens/0da9dec5-1e60-4ae4-bb22-2b00ea9618b6): Phone: a Rent category with 12 month bars, year total and average, and transactions
  - [Midday](https://mobbin.com/screens/85a64f64-2ec8-4543-9f05-ed5b97f64d24): Right-hand sheet over the list for detail
  - [Mercury](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa): Money out by Recipient, Category or GL Code, with % of total, a slim bar and a 'Remaining' row.
  - [Mercury](https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): Expenses card lists 'By ledger account' with amount and share.
- **Code:** `src/app/(app)/financials/page.tsx:77-88`, `src/app/(app)/financials/page.tsx:120`, `src/app/(app)/financials/page.tsx:134`, `src/app/(app)/properties/[id]/financials.tsx:78-90`, `src/app/(app)/financials/page.tsx:114-127`, `src/lib/quickbooks/queries.ts:202-214`
- **Also found as:** FINANCIALS-014 (Financials, rent roll and financial settings), DATA-I10 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. No figure opens lines, and no ledger-line list exists. Two small corrections: the Unattributed row has a 'Review' link (financials/page.tsx:204) and the sync banner links to Settings, but both go to aggregate tables, not lines. All 87 cash lines are unclassed sandbox lines, so no property card shows Recent transactions (DB check). I couldn't find Mercury a8225239 in a spot search, but Mercury carries this exact pattern on screens that did come back: 4b9388c2 (Amount popover with Direction, At least, No more than), 868560a8 (a Net change, Money in, Money out strip over the rows) and a930c1be ('Export filtered' and Create view on active filter chips). Cite those if a8225239 doesn't resolve. DATA-I10 overlaps this finding.

### DATA-IV01

**Legacy Asana assignee names leave contractor job history empty**

High · Fix · effort M · `/contractors/[id] Jobs card` · Fix wrong numbers and records first · quick win

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly fixed in 9f74ea1: scripts/asana/40-link-legacy.ts can link open name-only tasks by Asana id, people.json or email, and by exact name only once confirmed. It is a dry run by default and has not been run, so no jobs have been linked yet. Still open: closed history is skipped on purpose, so done jobs don't come back (Connor's call on D25/D18); Brandon Kmiotek and John OConnell have no Contact to link to; and the code fix for take: 60 with a header count equal to the rows shown is still needed.
- **Today:** The Jobs card now queries assigneeContactId (contractors/[id]/page.tsx:41-49), so jobs no longer land on the wrong person. Brandon Zarbo no longer shows Brandon Kmiotek's jobs, and John detzler no longer shows John OConnell's. History is missing instead. On :3300, Zack Reading shows 8 open jobs while 66 tasks sit under the legacy name '[email]'. Brandon Zarbo reads 'No jobs assigned yet.' with 5 tasks under the exact name 'Brandon Zarbo'. Brandon Kmiotek (28 tasks) has no contact record. These legacy names show under 'External' in All's assignee filter. The silent take: 60 cap and a header count equal to the rows shown remain (:47, :126).
- **Why:** This is wrong data on the record the partners use to judge and pay a crew. The contractor portal is about to show contractors their own jobs, and any reuse of this matcher (DATA-I07, DATA-I08) would spread the error or leak other people's work.
- **Change:** Backfill assigneeContactId on legacy tasks from exact full-name or email matches plus a reviewed alias list ([email], John OConnell, Brandon Kmiotek after a contact exists). Done history then comes back to each contractor. Replace take: 60 with a true count in the header and a 'Show all N' row.
- **Desktop, tablet, phone:** No layout change. Same card at 1280, 768 and 375.
- **Reuse:** Task.assigneeContactId and TaskAccess from the approved asana-migration-plan schema; the existing Jobs card.
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:17-28`, `src/app/(app)/contractors/[id]/page.tsx:85`, `DB: assigneeName 'Brandon Kmiotek' 27 tasks, 'John OConnell' 10 tasks, both matched onto other contacts`, `branch-src/src/app/(app)/contractors/[id]/page.tsx:41-49,126`, `probe /tasks/all?status=all: owner n:zack@outlawcarpentry.com 66 rows, n:Brandon Kmiotek 28, n:Brandon Zarbo 5; /contractors/Zack shows 8`, `src/app/(app)/contractors/[id]/page.tsx:17-21`, `branch: docs/asana-migration-plan.md:434`, `branch:src/app/(app)/contractors/[id]/page.tsx:41-48`, `src/app/(app)/contractors/[id]/page.tsx:19`, `branch: src/app/(app)/contractors/[id]/page.tsx:41-49,123-127`
- **Also found as:** ADMIN-017 (Contractors directory, contractor detail and Settings), IA-043 (Lens: information architecture and global SaaS patterns)
- **Verification:** verifier-found

### DATA-IV04

**Latest note is blank on 674 of 675 deals because imported notes are filtered out**

High · Fix · effort S · `/deals Latest note column` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, deals): Changed the /deals Latest note query (src/app/(app)/deals/page.tsx) to drop only source 'change' entries instead of keeping only 'manual', so imported spreadsheet notes show again. It sorts by noteDate desc with nulls last, then createdAt. An undated imported line now passes date null, so its tooltip no longer shows the import run's createdAt as the note date (deal-row.tsx). Left: DATA-IV04: pairing with DATA-I13's single dated line. The deal page timeline still orders noteDate desc with Postgres default nulls first, so undated imported lines sit at the top there.
- **Today:** The list loads only notes whose source is 'manual'. That drops the 1,050 notes imported from the spreadsheet on 517 deals. Only 29 Livingston, with three test notes, shows anything, so 12 of the 13 Active deals have an empty Latest note cell. The code comment says the goal was to skip auto-logged 'change' entries.
- **Why:** The pipeline's most useful column is empty, so every deal has to be opened to see where it stands. That is the job the column exists for.
- **Change:** Exclude only change entries (source not 'change') and order by note date, newest first, with undated notes last. Pair it with DATA-I13's single dated line.
- **Desktop, tablet, phone:** No layout change. On phone the note becomes the muted second line of the row per DATA-018.
- **Reuse:** The same Prisma include in deals/page.tsx; DealNote.noteDate is already set on 947 imported notes.
- **Code:** `src/app/(app)/deals/page.tsx:76-82`, `DB: DealNote source migration 1,050 rows on 517 deals; manual 3 rows on 1 deal`
- **Also found as:** DEALS-016 (Deals pipeline, new deal and deal detail)
- **Verification:** verifier-found

### DATA-V01

**The CapEx forecast silently leaves out 22 undated items, 7 of them HVAC**

High · Fix · effort S · `Home and property "5-year CapEx forecast"` · Fix wrong numbers and records first · quick win

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, property-money): The Home and property 5-year CapEx forecast totals now show a muted line under them, e.g. "Excludes 22 items with no install year", and hide it at zero. Before, undated equipment was dropped with no sign. portfolioCapexForecast now adds up each property's unknownCount, and the copy comes from a new tested helper, capexUndatedNote, in src/lib/property-types.ts. Left: DATA-V01: the property card's undated-items line doesn't link to the Units section yet. UnitsSection has no anchor, and adding one means touching edit-units.tsx, which is outside this area. DATA-V01 / PROPERTY-022 / DATA-036: making Year a numeric field with an 'Approx.' checkbox, moving the existing words (Old, Newer, x) into a comment, and adding an 'N items need a year' link that filters the register to those items are a redesign plus a data migration, so they're not done.
- **Today:** capexForecast skips any unit equipment whose install year doesn't parse and counts it in unknownCount, but nothing under src/app ever reads unknownCount. Across the 11 properties, 22 of 55 equipment rows are skipped: 19 have words in Year (Newer, Old, Older, New, Fine, x) and 3 are blank. 7 of the 22 are HVAC units, $8,000 each under the rules. Home still presents "$38,900" as the 5-year total with no hint that 40% of the equipment isn't counted.
- **Why:** A forecast total that quietly omits a third of its inputs reads as complete, and partners will budget from it. Trustworthy money pages state their coverage when the inputs are incomplete.
- **Change:** When unknownCount > 0, add one muted line under the headline total: "Excludes 22 items with no install year". On the property card it reads "Excludes 3 items with no install year" and links to that property's Units section. Hide the line at zero. Pair it with the Year validation and cleanup in DATA-036 so the count falls over time.
- **Desktop, tablet, phone:** One line under the total at desktop and tablet. On phone, shorten to "22 items undated" on the same line.
- **Reuse:** capexForecast().unknownCount in src/lib/property-types.ts (already returned, line 446); CapexForecastCard and PortfolioCapexForecastCard
- **References:** 
  - [Copilot](https://mobbin.com/screens/d9ca88ae-5d46-4213-a5aa-5afeb48d4d06): An 'Excluded' group sits at the foot of the categories, so the total says what it leaves out.
- **Code:** `src/lib/property-types.ts:262-265 (parseInstallYear needs a 19xx/20xx year)`, `src/lib/property-types.ts:410-417 (undated items counted in unknownCount and skipped)`, `grep: unknownCount is not referenced anywhere under src/app`, `Scripted scan of all 11 property pages: 55 equipment rows, 22 undated (Newer 9, Old 5, New 2, Older 1, Fine 1, x 1, blank 3), 7 of them HVAC`, `src/app/(app)/portfolio-capex.tsx:33,82-104`, `src/lib/property-types.ts:349-353`
- **Also found as:** SHELL-015 (App shell, sidebar, top bar, global search and Home)
- **Verification:** verifier-found

### DATA-023

**Category bars are unsorted, cut off and show no share**

Medium · Design change · effort S · `/financials Operating expense by category, property Financials card` · The QuickBooks mirror is honest about what it covers

- **Today:** MoneyBars lists categories in object order (Repairs $988, Legal $855, Other operating $4,897, Utilities $245). Labels truncate at w-32 ("Repairs & mainten…", "Legal & profession…"). There are no percentages.
- **Why:** A ranking chart that isn't ranked hides the biggest cost. Truncated labels force a hover.
- **Change:** Sort descending. Put the label and amount on one line with the share after the amount ("$4,897 · 70%") and a thin full-width bar beneath, as in Mercury's ledger list. That gives labels the full width, so nothing truncates.
- **Desktop, tablet, phone:** The same stacked layout at every size, which also fixes 320px (DATA-048).
- **Reuse:** MoneyBars in financials/_components/ui.tsx
- **References:** 
  - [Mercury](https://mobbin.com/screens/18f7213d-0beb-4436-ad3d-0891b5bd5efe): "By ledger account" ranked rows with amount, percent and a thin bar under each label
  - [Mercury](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa): Rows rank by share, largest first, with % of total, a slim bar and the amount. A 'Remaining recipients' row closes the list.
  - [Origin](https://mobbin.com/screens/14debadb-80c2-4a3f-8ea6-7cef96d5661e): Categories sorted by spend, largest first
  - [Dub](https://mobbin.com/screens/938a51d4-14bf-42df-952b-dff298f78f91): The bar is drawn behind the label as the row's tint, so the name gets the full row width and never truncates. The value sits right-aligned.
  - [YNAB](https://mobbin.com/screens/cefe9877-b5f8-482d-bb3b-e3d4b210d2da): Category name and amount on one line, bar and % beneath
  - [Wise](https://mobbin.com/screens/b2d58d78-50f9-45bc-98ba-daa46314b5c2): Phone category rows with a thin bar under the name
  - [YNAB](https://mobbin.com/screens/f9387a42-18ab-4c36-a7f5-425845680ff8): Phone category rows with a % under the bar
  - [Mercury](https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): Expenses by ledger account: the label and '$90 78%' on one line, with a thin bar beneath.
- **Code:** `src/app/(app)/financials/_components/ui.tsx:47-77`, `src/app/(app)/financials/page.tsx:120-125`, `src/lib/quickbooks/queries.ts:225-228`, `src/app/(app)/financials/_components/ui.tsx:61`
- **Also found as:** FINANCIALS-036 (Financials, rent roll and financial settings), FINANCIALS-055 (Financials, rent roll and financial settings), FINANCIALS-056 (Financials, rent roll and financial settings), G2A-I11 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Confirmed: order $988, $855, $4,897, $245; labels cut to "Repairs & mainten…" and "Legal & profession…". This finding should absorb DATA-048, which proposes the same change.

### DATA-039

**Accounting caveats are written into the UI as paragraphs**

Medium · Fix · effort S · `/financials, /financials/rent-roll, property Financials card` · Plain, consistent words

- **Today:** The UI shows "Per-property figures use directly-classed lines only. Portfolio NOI = Σ per-property NOI + unattributed.", a 3-sentence rent roll paragraph ("Section-8 / voucher rent is included; owner P2P deposits mis-booked to Rents are excluded…"), "principal & CapEx are balance-sheet, not here", and "Direct-classed lines only…".
- **Why:** The copy rules say internal caveats stay out of the UI and never use a paragraph.
- **Change:** Delete these lines and move them to code comments or docs. If one is needed, use a single info tooltip on the table title ("Lines classed to each property").
- **Desktop, tablet, phone:** Nothing to wrap at any size.
- **Reuse:** Tooltip in src/components/tooltip.tsx
- **References:** 
  - [Mercury](https://mobbin.com/screens/18f7213d-0beb-4436-ad3d-0891b5bd5efe): An info icon on a label instead of explanatory sentences
  - [Mercury](https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): The header is the company name with 'Last month', followed directly by the figures.
  - [Stripe Dashboard](https://mobbin.com/screens/e345975a-5113-4ffd-8b71-1abc1481379e): Phone Home opens on numbers (Today strip, then period pills and charts) with no explanatory prose.
  - [Mercury](https://mobbin.com/flows/fd8c08f3-1587-47b6-931c-2b1eb563592a): Home is one balance with Money in and Money spent under it; method notes live behind an info icon.
  - [Neo Financial](https://mobbin.com/screens/c15a8a82-db46-4b6b-85f9-a355ca20b9ab): Title, tabs, then the list; no explanatory prose
  - [Vercel](https://mobbin.com/screens/e828f30f-3564-432d-8a2f-33b3116dd465): One quiet footnote under the table ('Usage data can be up to 1 hour old.') instead of caveats in every tile.
  - [Mercury](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62): An info icon beside 'By ledger account' holds the explanation; the module itself shows only figures.
- **Code:** `src/app/(app)/financials/page.tsx:85,226-229`, `src/app/(app)/financials/rent-roll/page.tsx:28-33`, `src/app/(app)/properties/[id]/financials.tsx:95-101`, `src/app/(app)/financials/layout.tsx:9-12`, `src/app/(app)/financials/page.tsx:85`, `src/app/(app)/financials/page.tsx:226-229`, `src/app/(app)/financials/rent-roll/page.tsx:29`, `src/app/(app)/financials/layout.tsx:11`, `src/app/(app)/financials/page.tsx:227`, `src/app/(app)/contractors/[id]/page.tsx:85`, `branch src/app/(app)/contractors/[id]/page.tsx:124-127`, `branch src/app/(app)/financials/page.tsx:89`, `branch src/app/(app)/financials/page.tsx:231`, `branch src/app/(app)/financials/settings/page.tsx:260`
- **Also found as:** G2A-I24 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), MOBILE-024 (Lens: phone and tablet experience on every route), VISUAL-V06 (Lens: visual design system across every screen)
- **Verification:** confirmed. All four caveats are present on screen, including the Σ formula and the 3-sentence rent roll paragraph (rr--desktop-light.png).

### DATA-041

**Hard caps of 300 and 400 rows with a note instead of a count and pager**

Medium · New capability · effort M · `/deals (All 675) and /tasks` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. /deals still stops at 300 with 'Showing first 300. Use the address filter to narrow.' The task list moved to /tasks/all with the same 400 cap and the note 'Showing first {400} of {total}. Narrow the filters to see the rest.' There is no pager.
- **Today:** Deals silently stops at 300 of 675; the total appears only in the All 675 tab. Tasks caps at 400 and does say "Showing first 400 of N".
- **Why:** Records past the cap can't be reached without guessing a filter. Stripe shows "6 results" with Previous and Next.
- **Change:** Footer: "675 deals" on the left; Previous and Next with "1 to 100" on the right. 100 rows per page, with the page in the URL.
- **Desktop, tablet, phone:** Desktop and tablet show the count and pager in the table footer. Phone shows the count plus a "Show more" button at the end of the list.
- **Reuse:** Table footer in ui.tsx; the searchParams pattern already used for sort
- **References:** 
  - [Dub](https://mobbin.com/screens/104187d7-5f59-49a5-b7c6-ec932f3e0ce1): Table footer 'Viewing 1-1 of 1 partner' with Previous and Next.
  - [Mercury](https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05): '2 Transactions' count with pager arrows under a filtered list.
  - [Jobber](https://mobbin.com/screens/7b0579b2-4f76-41d9-a57a-01402ca970f1): 'Showing 1-5 of 5 items' with a per-page picker and arrows.
  - [Stripe](https://mobbin.com/screens/62ca0ad2-5291-4edb-8238-f19a2805f5f3): Previous and Next under the table
  - [Squarespace](https://mobbin.com/screens/5518c739-0390-4bae-9751-9aaeadd23f96): "20 per page" and "1 to 3 of 3 items" footer
  - [Mercury](https://mobbin.com/screens/9b38d5b4-4b72-4c88-8c3c-8fd754225324): Footer with a total and previous/next arrows.
  - [Stripe](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258): Result count under the table.
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): Result count under the table ("6 results"), with paging.
  - [Linear](https://mobbin.com/screens/610d34b6-6ad8-45ab-80fb-2107b31ed01e): Rows are static text with small property chips; the editors open on demand.
- **Code:** `src/app/(app)/deals/page.tsx:89-91,160-162`, `src/app/(app)/tasks/page.tsx:31,219-223`, `src/app/(app)/deals/page.tsx:74,89-90,161`, `src/app/(app)/tasks/all/page.tsx:12,25,62-66`, `src/lib/tasks/queries.ts:78-90`, `src/app/(app)/deals/page.tsx:67-90`, `src/app/(app)/deals/page.tsx:160-162`, `branch:src/app/(app)/tasks/all/page.tsx:12,62-66`, `dom eval on /tasks?status=all (mobile): [20554 nodes, 400 rows, 6058 options]`, `curl /tasks: 1,113,951 bytes HTML (32 KB compressed)`, `src/app/(app)/tasks/page.tsx:31,218-222`, `src/app/(app)/tasks/task-row.tsx:164-229`, `src/app/(app)/tasks/all/page.tsx:12 (PAGE = 400), :62-66 (footer)`, `src/app/(app)/tasks/task-row.tsx:70-160 (static row, DueDatePicker only)`, `src/components/due-date-picker.tsx:80-104 (popover or sheet mounts on open)`, `eval /tasks/all?status=all mobile: nodes 12969, options 56, rows 400, outerHTML 1,796,746 chars, footer 'Showing first 400 of 2061…'`
- **Also found as:** DEALS-004 (Deals pipeline, new deal and deal detail), DEALS-V09 (Deals pipeline, new deal and deal detail), TASKS-035 (Tasks list, new task and task detail), FEEL-035 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** partly. The deals cap is confirmed ("Showing first 300. Use the address filter to narrow."). But Tasks does show the count when capped ("Showing first {PAGE} of {matchCount}", tasks/page.tsx:219-223), and Deals shows totals in the segmented control (All 675). The "no count" claim is wrong for Tasks.

### DATA-043

**Green marks seven different things, and the tone map exists twice**

Medium · Fix · effort S · `Badges app-wide (Contractors, Deals, Building CapEx, Settings)` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. 'tenant fixes' is still a green Badge, lowercase, on /contractors and next to the name on /contractors/cmtg25y9x000djphsbqty81fr. On that same page the job status chips use the approved task tones, where Done is green. TONE_CLASSES still sits in lib/config.ts beside badgeTones in ui.tsx, and deals still read it through toneClass().
- **Today:** Green marks "tenant fixes" (a capability tag), Good, Available, ACTIVE, CLOSED!, and Refinanced, Stabilized and Hold. Tone classes are defined twice: badgeTones in ui.tsx and TONE_CLASSES in lib/config.ts.
- **Why:** The house rule says statuses keep fixed colors that no other mark reuses. A green tag next to a name reads as a status, and two tone maps will drift apart.
- **Change:** Make tags ("Tenant fixes", "Inactive") neutral outline chips in sentence case. Keep green only for completed or healthy states. Delete TONE_CLASSES and have toneClass read badgeTones from ui.tsx.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** Badge in src/components/ui.tsx; lib/config.ts
- **References:** 
  - [Jobber](https://mobbin.com/screens/a6fb2d6f-b990-48c4-91c0-9a4dac929ea4): A small set of status dots with fixed meanings, listed in an overview legend
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Categories as tags inside the details rail rather than next to the record's title
- **Code:** `src/components/ui.tsx:107-115`, `src/lib/config.ts:95-106`, `src/app/(app)/contractors/page.tsx:48`, `src/app/(app)/contractors/page.tsx:48-49`, `src/app/(app)/contractors/[id]/page.tsx:58`, `src/lib/config.ts:93-104`, `src/components/ui.tsx:114-135`, `src/components/status-badge.tsx:12-20`, `src/app/(app)/contractors/[id]/page.tsx:37`, `branch:src/app/(app)/contractors/[id]/portal-access-card.tsx:66`, `branch:src/app/(app)/contractors/[id]/page.tsx:58`, `branch:src/app/(app)/contractors/page.tsx:48`, `branch:src/components/status-badge.tsx:12-18`
- **Also found as:** ADMIN-030 (Contractors directory, contractor detail and Settings)
- **Verification:** confirmed. Confirmed: "tenant fixes" is a green Badge (contractors/page.tsx:48), CLOSED! is green, Settings ACTIVE is green, Available is green. TONE_CLASSES duplicates badgeTones verbatim (config.ts:95-102 vs ui.tsx:107-115).

### DATA-049

**The portfolio CapEx tooltip lists 20 items without saying which property each is in**

Medium · Fix · effort S · `Home CapEx matrix tooltip` · Home and Today become one work queue

- **Today:** The tooltip names type and unit only, with two identical "Water Heater · Front" lines. A tap on touch opens it via emulated mouseenter, but it has no close and overflows the bottom of the screen at 768.
- **Why:** "1st Rear / Apt #3" exists in several buildings, so the list can't be acted on. The touch rule says tooltip content needs a tap path.
- **Change:** Prefix each line with the short address ("767 Prospect · HVAC · Apt 3") in the portfolio-level tooltips. Open the breakdown on click or tap as an anchored popover (React Aria Popover) rather than on hover, capped at 8 lines with "View all".
- **Desktop, tablet, phone:** Desktop opens a popover on click. Tablet opens the same on tap. Phone opens a bottom sheet.
- **Reuse:** React Aria Popover (approved); PortfolioCapexForecastCard
- **References:** 
  - [Mercury](https://mobbin.com/screens/38664478-d88e-4575-a0b0-78ec6c218ce9): Chart tooltip names the group, then Net change, Money in and Money out on aligned rows.
  - [Monarch](https://mobbin.com/screens/a4f7cf3b-c496-4a88-ac97-fa361f20bfc3): Breakdown popover with labelled lines and a total
- **Code:** `src/app/(app)/portfolio-capex.tsx:64-67,268-270,300-322`
- **Verification:** partly. Missing property names confirmed. "Water Heater · Front" appears twice, ambiguous across buildings (verify-DATA/hometip--tip--desktop-light.png). On desktop it opens upward over the KPI row. It isn't strictly hover-only: a tap at 768 fires mouseenter and opens it (hometap--tap--tablet-light.png). But it can't be dismissed deliberately, it is pointer-events-none, and it runs off the bottom of the tablet viewport.

### DATA-051

**Deals has no price per unit, the number buyers compare**

Medium · New capability · effort S · `/deals table` · Lists answer first and stay calm at 675 rows

- **Today:** Rows show Units, Their price and Our price as separate cells. Comparing a $425,000 4-unit against a $750,000 7-unit means doing the division in your head.
- **Why:** Price per door is the core screening figure for small multifamily, and the data is already there.
- **Change:** Add a computed, read-only "Per unit" column after Our price (Our price when set, otherwise Their price, divided by Units), right-aligned in compact form ("$106K"). Make it sortable.
- **Desktop, tablet, phone:** Desktop and tablet show the column. On phone it appears on the meta line ("4 units · $106K/unit").
- **Reuse:** Td numeric (DATA-013); fmtMoney compact
- **References:** 
  - [Attio](https://mobbin.com/screens/a44be622-b84a-4805-ad7a-6f600ece6356): A computed numeric column with a footer aggregate
  - [Zillow](https://mobbin.com/screens/82a740cd-7cde-4aa7-bc7b-63451d23c2ad): Price/sqft sits right below list price.
- **Code:** `src/app/(app)/deals/page.tsx:119-129`
- **Also found as:** DEALS-065 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. Valid screening metric. It conflicts with DATA-031: the table already overflows 1150 by 60px. Put per-unit as a muted second line in the Our price cell rather than a new column, or retire Latest note to make room.

### DATA-I03

**58 Mariner's 50% share prints as raw text and counts at 100% in totals**

Medium · Fix · effort M · `/properties Portfolio Entity cell and totals` · Fix wrong numbers and records first

- **Today:** The Entity cell for 58 Mariner reads '1) 50% BK 2) 50% HG Buffalo Holding 1 LLC', the spreadsheet text pasted as is (llcOwner is free text). The Value footer ($4,973,000) and the Purchase footer ($2,644,650) include the property's full $550,000 value and $314,150 price, though HG holds half.
- **Why:** A total that mixes wholly owned and half-owned properties overstates what HG holds by $275,000 of value, and nothing on screen says so. The '1) 2)' string reads like an import error on the page partners and lenders look at most.
- **Change:** Store ownership as an entity plus a share (100 by default, 50 for 58 Mariner with the partner named). The cell reads 'HG Buffalo Holding 1 LLC · 50%', with the partner in a tooltip. Totals stay gross. When any property is below 100%, the footer adds one muted line: 'HG share $4,698,000'. That line is a new visual element, so it needs Connor's OK.
- **Desktop, tablet, phone:** Same text at every size. On phone the share sits in the row's muted second line, and the HG share line wraps under the total.
- **Reuse:** Td, Tooltip (components/tooltip.tsx); Property.llcOwner gains a structured share field (schema change, data entry for one row).
- **References:** 
  - [Copilot](https://mobbin.com/screens/fcb4126b-4d10-4708-98ae-ddbf5ed80ba4): Allocations panel shows a holding's share as a plain percent beside the figure instead of inside a label.
  - [Copilot](https://mobbin.com/screens/2d7f5bba-90ee-4a0f-a675-7683b5aa512f): Net worth settings state what is counted ('Included in chart, 7 accounts') instead of silently summing everything.
  - [Copilot](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099): Totals are built from visible per-account rows, so a partial holding can be shown at its counted amount.
- **Code:** `src/app/(app)/properties/page.tsx:70`, `src/app/(app)/properties/page.tsx:94-95`, `prisma/schema.prisma:102`, `src/app/(app)/properties/page.tsx:22-31`, `inspire-PORTFOLIO/keyfacts-scan.txt`, `src/lib/quickbooks/entities.ts:47-54`, `prisma/schema.prisma:489`, `src/lib/quickbooks/sync.ts:91`, `src/lib/quickbooks/queries.ts:86-116`
- **Also found as:** PORTFOLIO-I04 (Portfolio list and new property), FINANCIALS-IV01 (Financials, rent roll and financial settings)
- **Verification:** confirmed. The DB value is '1) 50% BK\n2) 50% HG Buffalo Holding 1 LLC' and renders on one line as stated. Both footers include the full $550,000 and $314,150. The reference is weak: the Copilot fcb4126b Allocations panel splits a holding by asset class (Crypto 98%), not by ownership share. The partner name can't live only in a tooltip, because touch has no hover; it needs a tap target or a second line. The data cleanup is a fix, but the 'HG share' footer line needs approval, as the finding says.

### DATA-I13

**Latest note stacks two undated notes, so 'tomorrow' has no anchor**

Medium · Design change · effort S · `/deals Latest note column` · Lists answer first and stay calm at 675 rows

- **Today:** The Latest note cell stacks the two newest notes with dates only in a hover tooltip, but only 29 Livingston shows any notes. The query keeps manual notes only, so 12 of 13 Active deals and 674 of 675 overall have an empty Latest note cell despite 1,050 imported notes.
- **Why:** Notes like 'seeing tomorrow' mean nothing without the day they were written, and two notes per cell break the one-line row. Zillow's leads table pairs the latest contact with its date in one cell, so the cell also serves as last activity.
- **Change:** Show only the newest note, on one line, prefixed by its short date: 'Sep 2 · seeing tomorrow (CS)'. That date is the deal's last activity, so once DATA-V02's sort reads from the same note the Updated column can go.
- **Desktop, tablet, phone:** Desktop and tablet: one truncated line. Phone: date and note become the muted second line of the two-line row (DATA-018).
- **Reuse:** fmtDay with year auto (DATA-058); latestNotes already carries the date.
- **References:** 
  - [Zillow](https://mobbin.com/screens/415d4351-2979-4111-a418-09b3ca511959): Leads table 'Latest contact' cell: the latest message with its date ('Today') attached.
- **Code:** `src/app/(app)/deals/deal-row.tsx:128-137`, `src/app/(app)/deals/deal-row.tsx:149-151`
- **Verification:** partly. The recommendation (one newest note on one line with its date) is right, but the observation misses the bigger defect. The column queries only source 'manual' notes, so the stacked 'seeing tomorrow (CS)' cell appears on exactly one deal (29 Livingston, with test notes), and the other 674 deals show an empty cell (see DATA-V04). 'Updated' is Aug 30 or 31 (the import) for 672 of 675 deals, which confirms the Updated point. The Updated column is also clipped at 1280 (DATA-V05), so dropping it helps twice. Zillow 415d4351 wasn't spot-checked.

### DATA-V02

**"Updated" shows the import date on 297 of 300 deals**

Medium · Fix · effort S · `/deals Updated column` · Fix wrong numbers and records first

- **Today:** The Updated column renders deal.updatedAt. In the All view, 297 of the 300 rows read "Aug 30, 2026", and the other three read Aug 31 or Sep 2. The bulk import and the Aug 31 address cleanup bumped updatedAt and also wrote "Address: … → …" entries into each deal's activity timeline.
- **Why:** A recency column where every row has the same date carries no signal, and sorting by it does nothing. The question it should answer is "when did we last touch this deal". Attio answers it with a Last interaction column.
- **Change:** Rename the column "Last activity" and compute it from the latest note date or status change, not updatedAt. Show it as a short date ("Sep 2") or relative ("3d ago"), and "—" when there's none. Make it the default sort for Active. Keep system edits (imports, address normalization) from setting it.
- **Desktop, tablet, phone:** Desktop and tablet keep the column. On phone it moves to the row's meta line ("Last activity Sep 2").
- **Reuse:** Notes are already loaded per row in deals/page.tsx (take: 2); DealRowEditable in deals/deal-row.tsx; SortHeader
- **References:** 
  - [Attio](https://mobbin.com/screens/799e97d9-9f9f-47b2-8dad-6b87827165f6): Last interaction column in relative time ("about 3 hours ago", "2 days ago", "No contact") with a count footer
  - [Attio](https://mobbin.com/screens/66dc9e4e-f6c3-43d3-8544-0de050695516): List sorted by Last interaction, the recency signal people act on
  - [Attio](https://mobbin.com/screens/a2b97705-be0b-44a3-84ec-522316c873bf): Each card shows last activity in a fixed row ('About 14 hours ago') separately from time in stage ('0d').
  - [Sentry](https://mobbin.com/screens/92525937-e703-4e62-bd8a-2b6bcb7ca627): Rows show 'Last Seen' and 'Age' as two narrow columns of relative times.
  - [Attio](https://mobbin.com/screens/454a3d55-3d18-47fa-b3ba-1361377bd49b): A Last interaction column in relative time.
  - [Pipedrive](https://mobbin.com/screens/2ff3c977-7902-48b5-8361-0c89710e5c2e): Sort by next activity.
- **Code:** `src/app/(app)/deals/deal-row.tsx:149-151`, `Scripted count on /deals?status=all: Updated = Aug 30, 2026 on 297 of 300 rows`
- **Also found as:** DEALS-047 (Deals pipeline, new deal and deal detail)
- **Verification:** verifier-found

### DATA-057

**The "Rent roll" tab is rent received per month, not a rent roll**

Low · Fix · effort S · `/financials Rent roll tab` · Plain, consistent words

- **Today:** The tab lists cash received by property and month, with a note saying there is no lease data. In real estate, a rent roll means units, tenants, lease terms and scheduled rent.
- **Why:** The label promises data the page doesn't have.
- **Change:** Rename the tab "Rent collected". Keep "Rent roll" for a future unit-level view built from units and leases.
- **Desktop, tablet, phone:** A shorter tab label fits the phone tab row.
- **Reuse:** TopTabs in components/nav.tsx
- **References:** 
  - [Mercury](https://mobbin.com/screens/14ec88c9-760c-44a2-bd34-d0e0de2f3aff): The view name says what it sums ("Money in Sep 1 to Today")
- **Code:** `src/app/(app)/financials/layout.tsx:18`
- **Verification:** confirmed. Confirmed: the page itself says it is cash received with no lease data.

### DATA-058

**Every table date repeats ", 2026"**

Low · Design change · effort S · `Dates in tables (Deals Updated, property Tasks, contractor Jobs, deal timeline)` · Money, numbers and dates read one way

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Duplicate of COPY-065. Fix once.
- **Today:** Task list cells no longer repeat the year (dueLabel, year:auto). The deal Updated column (fmtDate), deal timeline (fmtDate), property Tasks card (fmtDay, 'Aug 28, 2026') and contractor Jobs list ('Oct 23, 2026') still do.
- **Why:** The current year is noise. Stripe shows "6 Dec, 09:00" and Mercury "Oct 28".
- **Change:** Scope is now deals/deal-row.tsx:150, deals/[id]/page.tsx:113, properties/[id]/page.tsx:216 and contractors/[id]/page.tsx:153. Task lists are done.
- **Desktop, tablet, phone:** Shorter dates fit on phone meta lines.
- **Reuse:** fmtDay in src/lib/dates.ts (year: "auto" already exists)
- **References:** 
  - [Mercury](https://mobbin.com/screens/d14e9441-a25f-4730-97a3-d7e7ed531af4): Date column "Oct 29", with no year for the current year
  - [Linear](https://mobbin.com/screens/d4e0a8da-a387-49c7-8940-b64521bd3809): Dates as 'Mar 31' with no year
- **Code:** `src/app/(app)/deals/deal-row.tsx:149-151`, `src/lib/utils.ts:21-26`, `src/app/(app)/deals/deal-row.tsx:150`, `src/app/(app)/deals/[id]/page.tsx:113`, `src/app/(app)/properties/[id]/page.tsx:216`, `src/app/(app)/contractors/[id]/page.tsx:153`, `src/lib/utils.ts:22-27`, `src/lib/dates.ts:161-177`, `src/app/(app)/properties/[id]/page.tsx:215-217`, `src/app/(app)/contractors/[id]/page.tsx:152-154`
- **Also found as:** COPY-065 (Lens: words on every screen)
- **Verification:** confirmed. Confirmed. Implementation note: updatedAt is an instant, and fmtDay reads date-only values as UTC, so use an instant formatter with the year rule rather than fmtDay. Also see DATA-V02: 297 of 300 Updated values are the import date, so the format barely matters until the source changes.

### DATA-060

**Relative dates only count days, so a 5-year loan would read "in 1823d"**

Low · Fix · effort S · `Loan maturity, any multi-year relative date` · Money, numbers and dates read one way

- **Today:** relativeDays returns "in Nd" or "Nd ago" at any distance, and the Loan card uses it beside Maturity. Every loan's maturity is empty today, so this is verified in code.
- **Why:** Day counts are unreadable for long horizons, and maturity is the date that matters most on a loan.
- **Change:** relativeDays steps up: days under 45, then months ("in 7 mo"), then years with one decimal ("in 4.9 yr"). Keep the absolute date as the primary value.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** src/lib/dates.ts (add tests)
- **References:** 
  - [Flighty](https://mobbin.com/screens/0f1d7f88-cd0a-4921-ada2-0df15f4cd6cd): 'Departs in 7h 35m', 'Arrives in 9h 17m': the unit steps up with the span instead of counting in one unit.
  - [Things 3](https://mobbin.com/screens/97952802-d1f3-4324-8a5b-fab1bc02c29e): '4d left' for the near term; the date itself carries longer spans.
  - [Midday](https://mobbin.com/screens/ab800b0e-8693-4df7-8a3f-f6ef12a33219): Human relative line ("in 30 days") under the date
- **Code:** `src/lib/dates.ts:105-113`, `src/app/(app)/properties/[id]/edit-loan.tsx:44-57`
- **Verification:** confirmed. Code-only: no maturity dates are set. Insurance renewal (edit-insurance.tsx:56) uses the same relativeDays.

### DATA-I07

**Done jobs show a date but not whether they beat the due date**

Low · New capability · effort S · `/contractors/[id] Jobs` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The Jobs header shows only a count ('8'). Closed rows show fmtDate(completedAt) and open rows show fmtDay(dueDate) in the same gray w-24 slot, with no comparison. Overdue open jobs are gray too: Jake's 'Finish Electric' reads 'Oct 16, 2026'. On :3300 no done jobs are linked to any contractor, so the Done half can't be seen live.
- **Today:** Done rows show their completion date and open rows their due date in the same slot, with no comparison. The header reads 'matched by name/email · 60 shown', though 68 tasks match. The task-to-contractor match is a first-name substring, and imported completion dates include bulk closes, so on-time counts from today's data would mislead.
- **Why:** Contractor logins are coming, and finishing on time is the figure the partners will use to pick a crew. Flighty shows the actual time beside the scheduled one, says the slip in words ('1h 8m Late') and strikes through the original. Jobber records 'Completed on' and 'Completed by' on each visit.
- **Change:** Done rows read 'Done Aug 6', plus a muted '2d after due' only when the job slipped. Builds on DATA-042's DueDate. The Jobs card header gets one muted line with real counts: open, done, and how many done jobs met their due date ('4 open · 64 done · 16 on time'). Red stays reserved for open jobs past due, so this doesn't paint history red.
- **Desktop, tablet, phone:** Desktop and tablet: the slip sits after the date on the row's single line. Phone: date and slip move to the muted second line; the header line stays one line.
- **Reuse:** DueDate from DATA-015/042, fmtDay; Task.completedAt and dueDate already stored.
- **References:** 
  - [Flighty](https://mobbin.com/screens/d2a15492-9519-4965-826f-649edbfc3521): Actual time with the scheduled one struck through and the slip in words ('1h 8m Late').
  - [Flighty](https://mobbin.com/screens/0f1d7f88-cd0a-4921-ada2-0df15f4cd6cd): 'On Time' and '1m Early' as a plain status word beside the time.
  - [Jobber](https://mobbin.com/screens/b90508d1-dc0d-47d2-a61a-3c49a4119f55): Completed visits list 'Completed on' with date and time and 'Completed by' the person.
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:25-27`, `src/app/(app)/contractors/[id]/page.tsx:97`, `src/app/(app)/contractors/[id]/page.tsx:110`, `branch-src/src/app/(app)/contractors/[id]/page.tsx:124-127`, `branch-src/src/app/(app)/contractors/[id]/page.tsx:152-154`
- **Verification:** partly. Dates show as described, but the summary line would publish wrong or noisy numbers today. (1) The Jobs list comes from a first-name substring matcher that gives contractors other people's jobs (DATA-V02 is about money; see DATA-V01). (2) '60 shown' is a silent cap: Zack has 68 matches (4 open, 64 done). His real figure is 14 of 62 dated done jobs on time, not the illustrative 16. (3) Imported Asana completion dates include bulk closes: 302 of the 961 'late' completions fall on days with 15 or more closures, so 'after due' overstates lateness. Count on-time only for jobs closed in the app after the Nov 1 cutover, and build on assigneeContactId. The Flighty and Jobber references weren't spot-checked.

### DATA-I09

**Deals can't be filtered by price or unit count**

Low · New capability · effort M · `/deals filters` · Lists answer first and stay calm at 675 rows

- **Today:** The only filters are the address box, All / TBD / Active / Pass and the status multiselect. With 13 Active deals, sorting by Their price or Units covers most screening, so a range filter matters mainly in the All and Holding views.
- **Why:** Price and size are how buyers screen a pipeline. Mercury's amount filter turns a range into one removable chip, and Dub lists active filters as sentence chips you clear with Esc, so a narrowed list says what it is.
- **Change:** Add a Filter button that creates range chips: 'Price ≤ $300K' and 'Units ≥ 4', each removable. The popover has At least and No more than fields, and '300k' parses as 300,000. Chips apply on top of the current view and live in the URL. Price uses Our price when set, otherwise Their price, matching DATA-051.
- **Desktop, tablet, phone:** Desktop: chips sit after the views in the existing filter row. Tablet: the Filter button also absorbs the status multiselect so the row never wraps. Phone: Filter opens a bottom sheet with both ranges, and the chips scroll in one row.
- **Reuse:** React Aria Popover and Sheet (approved), the segmented control in deals/filters.tsx, parseAmount in lib/money.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05): Amount popover with Direction, At least and No more than, shown as a '≥ $1,000' chip with Reset and Create View.
  - [Dub](https://mobbin.com/screens/2a1f9131-8c1a-48ec-8d48-3958b3505b12): Active filters as 'Field is value' chips with an x each, plus Clear Filters with an Esc hint.
- **Code:** `src/app/(app)/deals/page.tsx:52-61`, `src/app/(app)/deals/filters.tsx:58`, `src/app/(app)/deals/filters.tsx:80`
- **Verification:** partly. No price or unit filter exists (deals/page.tsx:52-61), as stated. Severity is overstated. The Active view holds 13 deals, where sorting the existing Their price and Units columns already answers the question. A range filter only pays off in All (675) or Holding (206), which the partners rarely screen by price. It also adds a Filter button and chips to a row that already has search, the segmented control and All statuses. Treat it as a later nicety. Mercury's amount popover is confirmed on Mobbin (4b9388c2: Direction, At least, No more than).

### DATA-I18

**Show Income, Opex, NOI and cash flow as one equation**

Low · Design change · effort S · `/financials KPI row` · The QuickBooks mirror is honest about what it covers

- **Today:** The KPI row is six equal tiles. The reader has to work out that $5,080 minus $6,984 is the −$1,904 NOI, and that cash flow after debt matches NOI only because debt interest is $0.
- **Why:** For a P&L, how the figures relate is the point. Jobber's job profitability strip writes the arithmetic out (price minus costs equals profit, with the margin beside it), so the result explains itself without a caveat line.
- **Change:** Render DATA-021's four Stats as one row joined by operators: 'Income $5,080 − Opex $6,984 = NOI −$1,904 − Debt interest $0 = Cash flow −$1,904'. NOI margin goes in the NOI sub-line. It uses the same Stat primitive and the same space.
- **Desktop, tablet, phone:** Desktop: one row. Tablet: two rows, 'Income − Opex = NOI' and '− Debt interest = Cash flow'. Phone: a stacked statement with the operator at the left of each line and figures right-aligned.
- **Reuse:** Stat (DATA-026) inside the Financials header card; builds on DATA-021.
- **References:** 
  - [Jobber](https://mobbin.com/screens/50f5f03d-9bbb-4e5b-aae8-7051e509dbd6): Profitability strip: Total price − Line item cost − Labor − Expenses = Profit, with the margin beside it.
- **Code:** `src/app/(app)/financials/page.tsx:77-88`
- **Verification:** confirmed. The six tiles are as described, and the equation drops the 'principal & CapEx are balance-sheet, not here' caveat while taking no more space, so it simplifies. It depends on DATA-021. My Jobber search returned Jobber's dashboard and Insights screens but not 50f5f03d, so check that URL before citing it.
