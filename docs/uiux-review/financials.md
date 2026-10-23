# Financials, rent roll and financial settings

Part of the [UI/UX review](README.md). 64 findings: 0 critical, 7 high, 35 medium, 22 low.

## How it should work

Financials becomes three quiet tabs: Overview, Statement and Rent. The QuickBooks connection and mapping move into the merged Settings as D10 decided. There they follow Mercury's Books Details layout, with the label and helper on the left and the value and action on the right (https://mobbin.com/screens/5dca96bc-dcc4-4567-afeb-ad744b7e9f8f). One control row sits under the title on every tab. It holds Stripe's period presets, from Month to date to Last 12 months, compared to the previous period (https://mobbin.com/screens/266228e3-d7ac-436a-bb53-c0a89ae421af). Next to them are a Cash | Accrual segmented control and one freshness line. That line says when QuickBooks last updated and which months are closed, the way every Stripe overview card carries its own Updated time (https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3).

Overview answers how the portfolio did. Four figures (Rent collected, Operating expenses, NOI and Cash flow after debt service) sit in one hairline strip, as on Dub's record pages (https://mobbin.com/screens/02b78ee2-adec-4ddd-9d1d-39994e1ac1e2). They double as tabs for the single chart below (https://mobbin.com/screens/df73a9f4-ef84-4bf0-ae95-9bbc9fed055b). Properties come next, grouped under each LLC with a subtotal, the way Airtable groups rows (https://mobbin.com/screens/06e3f847-905c-49c7-87de-a8a9d1f4d2b5). Below them, one ranked list shows where the money went. It switches between Category, Account and Payee and shows each row's share of the total, as Mercury Insights does (https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa). Each category shows its 3-month average. Everything left out of NOI collapses into one row, the way Copilot keeps excluded categories (https://mobbin.com/screens/e4104151-c47b-47fb-9971-327ce2ad89c4). Payees linked to contractors open the contractor.

Statement is the P&L mirror, built like Mercury Books (https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4). Months run across as columns, with a sticky Total, collapsible category groups and a small chart whose hover tints the matching column. Every figure opens Mercury's report drilldown (https://mobbin.com/screens/00c8f4dd-af66-45f9-9748-10bc2ad290fc). Every line opens a sheet with its QuickBooks account, class and property, plus Open in QuickBooks and Ask bookkeeper.

Rent answers who paid. It opens with Overdue and Paid totals with counts, after Mercury Invoicing (https://mobbin.com/screens/bdce7bfe-7887-4a73-b548-1dfdf434b268). Below that is this month's expected rent per unit, as a Copilot Recurrings-style list with due date, received date and a check (https://mobbin.com/screens/c7b52d0f-77d7-4434-b991-b0b2f20ad225). The history grid stays underneath, and each cell opens the deposits behind it.

On phones the period becomes Stripe's sticky pills (https://mobbin.com/screens/680e6293-b64e-4fed-8537-94a667a4420f). The chart becomes Mercury's Money in | Money spent month view (https://mobbin.com/screens/33aa85ec-2765-421d-b954-5ef74b748e81), and tables become two-line rows. The statement grid stays on desktop. Each color keeps one job: blue for income, neutral for expense, and red only for short, late or negative figures.

<details><summary>What the reviewer covered</summary>

Routes: /financials (cash default and ?basis=accrual), /financials/rent-roll (cash and ?basis=accrual), /financials/settings. Viewports: desktop 1280, wide 1920, tablet 768, mobile 375 and narrow 320 for Overview and Settings; desktop, tablet and mobile for Rent roll. Dark mode on Overview (desktop, mobile) and Settings (desktop). WebKit on mobile Overview. States I opened: the Disconnect inline confirm, tab navigation from the accrual view (the basis gets dropped), the Settings tables scrolled at every size (90-row account table inside a 560px inner scroll box), the stale-sync and reconciliation-off banners, and accrual vs cash figures on the same screen. ARIA text captured for every route.

What I couldn't reach: (1) The Refresh button's pending and result states. The auto-mode permission classifier refused a helper run that clicked it, even though the helper blocks writes, so I reviewed that from refresh-button.tsx. (2) A read-only SQL check against the local DB was also refused, so I worked from the UI and the code. (3) The local connection is a QuickBooks sandbox company last synced Sep 2. It has no property-attributed lines and no RENT-category lines, so the populated By property rows and the month-by-property rent grid were never on screen. Findings about them come from the code (queries.ts, rent-roll/page.tsx). (4) The not-connected and expired states come from the code only. (5) The property page Financials card belongs to the Portfolio unit and was read in code only.

Mobbin: 13 searches (Stripe overview, reports, invoices and transactions; Mercury Insights, Books and Balance Sheet; Mercury iOS; P&L tables; spend by category on web and iOS; rent collection; accounting integration settings; category mapping; bookkeeping review queues; sparkline tables). Ramp didn't come back; Stripe, Mercury, YNAB, Monarch, Copilot, Origin, HoneyBook, Xero, Wise, Quicken, Midday and others are cited instead.

</details>

## Findings

### FINANCIALS-001

**Add a period picker with previous-period comparison to Overview**

High · New capability · effort M · `/financials (Overview)` · The QuickBooks mirror is honest about what it covers

- **Today:** Overview totals every synced line since the history start, labeled '(5 mo)'. The trend card lists each month's NOI (2026-05 -$317 ... 2026-08 -$1,185), so one month's NOI can be read there. A month's income or expense, year to date, or a comparison can't be read anywhere.
- **Why:** This area's first job is knowing how each property and the portfolio are doing this month and this year, and the page can't answer that today. Stripe and Mercury open every financial view with a period control and a comparison.
- **Change:** Add one control row under the title with a period control: 'This month | Last month | Year to date | Last 12 months', plus 'vs previous period'. Default to Year to date. Keep the choice in the URL (?period=ytd&basis=cash) so the tabs and drill links carry it. Filter KPIs, chart and tables in the query with periodMonth BETWEEN from and to.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: an inline segmented control left of basis and sync. Phone 375: one chip labeled 'Year to date' that opens a sheet listing the periods. Custom ranges and the comparison selector drop on phone; the comparison still shows as the delta line under each number.
- **Reuse:** Extend the segmented control in src/app/(app)/deals/filters.tsx (extract it to src/components as SegmentedControl, as docs/components.md Duplicates recommends). Use a React Aria sheet for the phone picker (D9). Add a {from, to} argument to getFinancialsOverview in src/lib/quickbooks/queries.ts.
- **References:** 
  - [Stripe](https://mobbin.com/screens/266228e3-d7ac-436a-bb53-c0a89ae421af): Period presets (Today, Last 7 days, Last month, Last 3 months, Month to date, Quarter to date, Year to date, All time) listed beside a two-month calendar with Clear and Apply.
  - [Stripe Dashboard](https://mobbin.com/screens/680e6293-b64e-4fed-8537-94a667a4420f): Phone version: 1W, 4W, 1Y, MTD, QTD, YTD and ALL pills. Each card shows the current figure with its date range beside the prior figure in gray with its own range, plus the delta.
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): 'Last 7 days compared to Previous period, Daily' as one compact control row above the metrics
  - [Mercury](https://mobbin.com/screens/10e9460a-1e44-4361-afe6-e0e9d857e6d9): Date range chip plus 'Compare to' on Insights
  - [Copilot](https://mobbin.com/screens/4377be87-da0d-4077-93b0-55bb51d99ab9): 1W 1M 3M YTD 1Y ALL range chips
  - [YNAB](https://mobbin.com/screens/f9387a42-18ab-4c36-a7f5-425845680ff8): Phone pattern: a Month | Preset segmented control plus a 'Last 3 Months' chip
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): P&L with a Monthly or year selector and month chips across the top
  - [Turo](https://mobbin.com/screens/da7b1b2b-c1fd-4b93-901a-c1e2d7999e83): Earnings filtered by "All vehicles" (one asset) and year: the per-asset pattern for per-property
  - [YNAB](https://mobbin.com/screens/62817fae-ab1b-43cf-a15d-3d372afd32ca): Period stepper with readable month labels above an income and expense table
- **Code:** `src/lib/quickbooks/queries.ts:16-30`, `src/lib/quickbooks/queries.ts:73-87`, `src/app/(app)/financials/page.tsx:19-21`, `src/app/(app)/financials/page.tsx:52-64`, `src/app/(app)/financials/page.tsx:16-21`, `src/lib/quickbooks/queries.ts:73`, `src/app/(app)/financials/page.tsx:17-21 (only basis is read from searchParams)`, `src/app/(app)/properties/[id]/financials.tsx:14-33`
- **Also found as:** G2A-I20 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), JOURNEYS-002 (Lens: the core jobs, end to end)
- **Verification:** partly. Reproduced: no period control, and loadLines has no date filter (queries.ts:16-30). I'm lowering it from critical because nothing is broken or wrong, and the trend card already shows each month's NOI. The Stripe ref a31f7d76 came back in my own search ('Last 7 days compared to Previous period, Daily') and supports it. FINANCIALS-012 repeats this finding's 'vs previous period' half, so fold its extras (a Change column, red only when NOI drops) in here. Context: the local connection is the QuickBooks sandbox (Settings shows Environment 'sandbox'), so every dollar figure is sample data, not HG's books.

### FINANCIALS-002

**Stop hiding the months label once history reaches 12 months**

High · Fix · effort S · `/financials, /financials/rent-roll, property Financials card` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, financials): PartialLabel ('(N mo)') no longer hides at 12 months or more, so cumulative totals past a year stay labelled. Left: FINANCIALS-002: replacing the '(N mo)' pill with an explicit date range in the control row is a redesign, so it isn't built. Capping the Overview at the current calendar year until FINANCIALS-001 is a scope and product call, so it isn't done either. Separately, monthsOfData leaves out the running month while the totals include it.
- **Today:** PartialLabel returns nothing once months >= 12, and the Overview totals have no date filter. History starts 2026-01, so from the January 2027 sync every KPI and table cell will show 13 or more months of cumulative figures with no label at all.
- **Why:** An unlabeled multi-year total reads as an annual figure. That's wrong-looking money on the main screen within about ten weeks.
- **Change:** Replace the '(N mo)' pill with an explicit range in the control row, such as 'Jan 1 to Oct 22, 2026', built from the first month with data and the last sync date. Never hide it. Until FINANCIALS-001 ships, cap Overview at the current calendar year.
- **Desktop, tablet, phone:** Desktop and tablet: the range sits as muted text in the control row. Phone: it becomes the period chip's label ('2026 to date').
- **Reuse:** PartialLabel and Kpi in src/app/(app)/financials/_components/ui.tsx; month helpers in src/lib/quickbooks/months.ts.
- **References:** 
  - [Turo](https://mobbin.com/screens/df24d3eb-0f6b-4a9c-9f62-3b785c1b9b7e): '$0 earned in 2026' puts the period in the headline
  - [Stripe](https://mobbin.com/screens/cb9a784d-e7d5-451b-88a8-bac710506120): Explicit '2 Dec–9 Dec' range chip next to 'Last 4 weeks'
- **Code:** `src/app/(app)/financials/_components/ui.tsx:10-13`, `src/lib/quickbooks/queries.ts:16-30`, `src/lib/quickbooks/config.ts:29-30`
- **Verification:** confirmed. PartialLabel returns null at months >= 12 (ui.tsx:11), and totals have no date filter. With history starting 2026-01, the label disappears on the January 2027 sync. The total then covers 12 months plus the January MTD lines, and it keeps growing after that. Fix together with FINANCIALS-023, which covers the same label logic.

### FINANCIALS-007

**Add scheduled rent per unit so Rent shows collected vs expected**

High · New capability · effort L · `/financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** The page itself says 'No lease data yet, so scheduled/market rent, delinquency, and vacancy are out of scope.' Property.units is JSON with no rent field. The only rent figure stored is Listing.rent, which is the asking rent.
- **Why:** Seeing rent collected against rent expected is one of this area's three jobs, and right now it can't be done.
- **Change:** Add a scheduled monthly rent, with an optional voucher portion, to each unit on the property hub's Units tab (D10). Rent then shows per property per month: Expected, Collected, Short, and a status of Paid, Short or Missing. Lead the page with 'Collected $41,200 of $44,800 in October'.
- **Desktop, tablet, phone:** Desktop: grid of Expected and Collected for the selected month plus 12 months of history. Tablet: history collapses to a sparkline. Phone: list rows such as '767 Prospect · $2,400 of $2,400 · Paid'.
- **Reuse:** Units editor in src/app/(app)/properties/[id]/edit-units.tsx; getRentRoll; Badge.
- **References:** 
  - [Copilot](https://mobbin.com/screens/c7b52d0f-77d7-4434-b991-b0b2f20ad225): Recurrings: a header reading '$0 left to pay' and '$1,714 paid so far', then a This month list with date, name, cadence, category chip, amount and a check once paid.
  - [Copilot](https://mobbin.com/screens/0f4d6bb7-d6c1-47e6-bc7d-16be6c6ed1bc): Each expected payment is an editable sentence of chips ('from $15.00 to $25.00', 'every month', 'around the 6th') with the next payment date. That's the model for a unit's scheduled rent and how a deposit gets matched to it.
  - [HoneyBook](https://mobbin.com/screens/f32e5716-bf30-4944-8210-5b01ad695bc1): Paid / Processing / Overdue / Upcoming totals in one row
  - [Stripe](https://mobbin.com/screens/5aba8f78-028a-4ad6-81f1-6ca698a41451): Status count tabs (All 6, Succeeded 1, Failed 3) above the list
  - [Stripe](https://mobbin.com/screens/54ef3db8-2b9e-4ef3-a91a-cad15de1e1c9): Outstanding invoices grouped by how overdue they are
  - [Mercury](https://mobbin.com/screens/2cc902ac-0a58-4fa2-87ff-1738b99aab56): Due phrase 'Nov 1 · in 3 days' with a Not due yet chip.
  - [Mercury](https://mobbin.com/screens/bdce7bfe-7887-4a73-b548-1dfdf434b268): An Overdue row reads 'Oct 28 · 1 day ago', and the Overdue total is the only colored figure.
- **Code:** `prisma/schema.prisma:146-150`, `prisma/schema.prisma:300`, `src/app/(app)/financials/rent-roll/page.tsx:28-33`
- **Also found as:** FINANCIALS-I08 (Financials, rent roll and financial settings)
- **Verification:** confirmed. Schema confirmed: units JSON has no rent field (schema.prisma:146-150), and only Listing.rent exists. Placing scheduled rent on the D10 Units tab follows the settled layout. This is also what makes the 'Missed' status in FINANCIALS-006 meaningful. FINANCIALS-031's headline is the interim version of the same lead line.

### FINANCIALS-008

**Show debt service and DSCR from the loan data already on each property**

High · New capability · effort M · `/financials (Overview and By property)` · The QuickBooks mirror is honest about what it covers

- **Today:** Debt appears only as 'Debt interest' from QuickBooks. Property already stores loanPaymentMonthly, loanRate, currentLoan and loanType (for example 'DSCR 30yr'), but Financials never uses them. There's no DSCR and no cash flow after full debt service.
- **Why:** DSCR is the covenant on their DSCR loans and the first number a lender asks for. A best-in-class dashboard puts the number decisions hang on up front.
- **Change:** Add 'Debt service' (loanPaymentMonthly times the months in the period), 'Cash flow after debt service' and 'DSCR' (NOI divided by debt service) as columns in the By property table and as one KPI in the strip. Show DSCR in red text only when it's under 1.20. For a property with no loan payment, show 'Add loan payment', linking to its loan section.
- **Desktop, tablet, phone:** Desktop and tablet: a DSCR column after NOI. Phone: DSCR in each property row's sublabel ('NOI $1,840 · DSCR 1.34').
- **Reuse:** Property loan fields; Kpi; Table.
- **References:** 
  - [Mercury](https://mobbin.com/screens/8b7983c7-5c51-4e71-93ae-e0f952277fd7): In the Books home Cash column, derived ratios (Coverage 26 mo, Monthly build) sit as labeled rows under the headline net figure. DSCR can sit under Cash flow after debt service the same way.
  - [Perplexity](https://mobbin.com/screens/9403c5aa-9ecf-4e38-828f-7f702ef23448): Ratio rows ('% Margin') right under the money row in the same grid
  - [Fey](https://mobbin.com/screens/79b0c10a-d412-4050-808c-bdb04b2d7271): Interest and operating income shown in one statement grid with the current period highlighted
- **Code:** `prisma/schema.prisma:114-130`, `src/app/(app)/financials/page.tsx:80-88`
- **Verification:** confirmed. loanPaymentMonthly, loanRate, loanType and currentLoan exist (schema.prisma:122-130) and Financials never reads them. One caveat for the build: loanEscrow exists, and an escrowed payment includes taxes and insurance that QuickBooks also books as opex. Debt service must therefore be principal and interest only, or DSCR double-counts those costs. The refs (Perplexity, Fey statement grids) are plausible for ratio rows but generic.

### FINANCIALS-009

**Replace the nine equal tiles with a flat strip of four headline numbers**

High · Design change · effort M · `/financials (Overview)` · The QuickBooks mirror is honest about what it covers

- **Today:** Six equal bordered tiles (Operating income, Operating expense, NOI, Debt interest $0, Cash flow after debt, Bank interest (memo) $0) sit above three more tiles of bookkeeping figures. That's nine boxes, two of them $0, before the first chart.
- **Why:** Stripe and Mercury lead with three or four numbers in a clear order. Equal-weight tiles make every figure look equally important, and the $0 memo tiles are noise.
- **Change:** One borderless strip of four metrics separated by hairline dividers: Rent collected, Operating expenses, NOI (margin beneath), and Cash flow after debt service (DSCR beneath). Move Debt interest into the property table and drop Bank interest from the overview.
- **Desktop, tablet, phone:** Desktop and tablet: four across in one row. Phone: a 2x2 grid with sublabels shortened to a single delta.
- **Reuse:** Kpi (add a borderless variant); Card.
- **References:** 
  - [Dub](https://mobbin.com/screens/02b78ee2-adec-4ddd-9d1d-39994e1ac1e2): Six metrics in one flat strip split by hairlines, with a label over each value and no boxed tiles.
  - [Dub](https://mobbin.com/screens/df73a9f4-ef84-4bf0-ae95-9bbc9fed055b): Metric cards double as tabs for one chart, and an underline is the only mark of the selected one.
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Gross volume and Net volume as open metrics with a delta pill, no tile boxes
  - [Mercury](https://mobbin.com/screens/db1f0dad-fe1c-4a3d-992a-1900c331e113): Cash, Expenses and Revenue as three columns, each with one number and 'vs prior period'
  - [Xero](https://mobbin.com/screens/830b74d7-ebf9-4b60-958e-0e759d88dffa): Four-metric strip with dividers above the chart
  - [Mercury](https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): Three columns (Cash, Expenses, Revenue), each with one headline figure and one comparison line.
  - [Stripe](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b): Few cards, each with value, the previous-period figure, a delta pill and an Updated stamp.
  - [Mercury](https://mobbin.com/screens/18f7213d-0beb-4436-ad3d-0891b5bd5efe): Three cards: Cash, Expenses, Revenue, each with one headline and one comparison line
  - [Origin](https://mobbin.com/screens/f36cc102-ee4d-4eca-93f0-30e903dd468b): Total income, Total expenses, Net cash flow, Avg per month in one quiet strip
- **Code:** `src/app/(app)/financials/page.tsx:76-89`
- **Also found as:** G2A-I14 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), DATA-021 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. Seen at 1280: six bordered tiles, then three data-quality tiles. Debt interest reads $0 only because this is sandbox data; with real DSCR loans it won't be zero, but the argument for four ordered numbers still holds. Stripe a31f7d76 and Mercury db1f0dad both came back in my searches and match the notes: open metrics with a delta, no tile boxes. The phone 2x2 in this finding's responsive section is the whole of FINANCIALS-016.

### FINANCIALS-013

**Rebuild the monthly trend as a vertical income-over-expense chart with values**

High · Design change · effort M · `/financials (Monthly income vs expense)` · The QuickBooks mirror is honest about what it covers

- **Today:** 'Monthly income vs expense' pairs two horizontal bars per month. Months are labeled '2026-05', there's no axis, and income and expense amounts appear nowhere; only NOI is printed at the right. The legend reads 'right column = NOI'. The 2026-06 row has no income bar and no explanation.
- **Why:** You can't read what came in or went out in a given month. Every finance tool reads time left to right, not top to bottom.
- **Change:** Draw vertical bars: income above the axis in blue, expenses below it in neutral zinc, and NOI as a line or dot. Label the x-axis with month names. On hover (desktop) or tap (touch), show a tooltip: 'Aug 2026 · Income $3,100 · Expenses $4,285 · NOI −$1,185'. Show at most 12 months and mark the running month MTD.
- **Desktop, tablet, phone:** Desktop and tablet: full width under the KPI strip. Phone: Mercury's pattern of four visible month bars with the selected month's numbers above and a month stepper below.
- **Reuse:** New: src/components/money-chart.tsx in inline SVG (no chart library today), following the dataviz skill; it replaces the hand-built bars at page.tsx:133-166.
- **References:** 
  - [Mercury](https://mobbin.com/screens/67a22ab9-8672-4acb-a980-cfda6b7e810d): Money in above the axis, money out below, month labels, one hue each
  - [HoneyBook](https://mobbin.com/screens/f32e5716-bf30-4944-8210-5b01ad695bc1): Tooltip listing Net income, Expenses and Paid for the hovered month
  - [Stripe](https://mobbin.com/screens/268d429c-0b02-46f6-b3a6-c5bfa29da2dc): Minimal hover tooltip with date and value
  - [Mercury](https://mobbin.com/screens/4de25abd-3405-4777-8d93-9ad39f0ad5c6): Phone: month bars with a '< October 2025 >' stepper
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): The P&L chart shows revenue bars above and expense bars below a baseline, with net profit marked per month.
  - [Mercury](https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): The 'Cash in vs out' column chart uses the same up and down convention in a small card.
  - [Mercury](https://mobbin.com/screens/c89c2bed-2255-4da1-92d0-96d0d26825f4): Monthly bars with money in above zero, money out below, a net line and short month labels.
  - [Stripe Dashboard](https://mobbin.com/screens/f972bbd5-699d-42c3-942e-1cf9f3d25eda): On phone, scrubbing shows the value at the finger with the prior period in gray.
  - [Origin](https://mobbin.com/screens/f36cc102-ee4d-4eca-93f0-30e903dd468b): Monthly bars with a dashed net line, then a Month / Income / Expenses / Net table
  - [Monarch](https://mobbin.com/screens/a4f7cf3b-c496-4a88-ac97-fa361f20bfc3): Month tooltip listing each value with a total
  - [Mercury](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2): Chart axis uses short dates ('Aug 29', 'Sep 3').
- **Code:** `src/app/(app)/financials/page.tsx:129-167`, `src/app/(app)/financials/page.tsx:141`, `src/app/(app)/financials/page.tsx:159-165`
- **Also found as:** G2A-I12 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), DATA-022 (Lens: tables, numbers, money, charts and status), VISUAL-020 (Lens: visual design system across every screen)
- **Verification:** confirmed. Seen at 1280 and 375. Month labels are '2026-05'. No axis. Income and expense values appear nowhere on screen or in the accessibility tree, only NOI. The legend reads 'right column = NOI'. The 2026-06 row has no income bar. No chart library is installed (package.json), so hand-written inline SVG fits. Mercury's money-in/money-out chart is a good model.

### FINANCIALS-I10

**Show money in and money out apart in a property's recent transactions**

High · Fix · effort S · `/properties/[id] Financials card (future hub Financials tab)` · Money, numbers and dates read one way

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, property-money): Recent transactions are now signed from their treatment: +$1,350 for income and non-operating money in, and −$1,350 (true minus sign) for expenses and debt interest. A negative expense, such as a refund, shows as money in. EXCLUDED lines are filtered out in the query, and it now fetches 8 rows instead of 15. The signing logic is a new tested helper, signedLineCents, in src/lib/quickbooks/compute.ts. Left: FINANCIALS-I10: showing income amounts in an income color waits on FINANCIALS-015 settling that color. For now the signs use the default text color.
- **Today:** The property card's 'Recent transactions' lists QuickBooks lines with date, name and an amount (src/app/(app)/properties/[id]/financials.tsx:78-93). The query pulls every line for the property whatever its treatment (src/lib/quickbooks/queries.ts:202-214). Amounts are stored signed naturally, with income and expense both positive (prisma/schema.prisma LedgerLine.amount). So a $1,350 rent deposit and a $1,350 repair print identically, and excluded lines such as transfers appear unmarked. The query fetches 15 lines and the card shows 8 (financials.tsx:82). The card renders empty locally because no property has classed lines.
- **Why:** Mercury prints money in with a plus sign and color, prints money out plain, and strikes through failed items, so a list reads like a statement. A money list that hides direction is a correctness problem, not polish.
- **Change:** Sign each row from its treatment. Income reads '+$1,350' in the income color FINANCIALS-015 settles on, and expense reads '−$1,350' in the default text color. Leave excluded lines out of this list, and fetch 8 rows instead of 15.
- **Desktop, tablet, phone:** Same at every size. On phone the row is date, name and signed amount, and the account name drops.
- **Reuse:** fmtCents with a signed variant, plus the existing text color tokens.
- **References:** 
  - [Mercury](https://mobbin.com/screens/3e5ccd40-7dbf-4fb4-a26d-915180a2cd64): Money in is colored with a plus, money out is plain with a minus, and failed amounts are struck through.
  - [Mercury](https://mobbin.com/screens/f77b24a7-e68e-4fc1-b5ac-91856a92f12b): Money in and Money out totals sit above a list where every amount shows its direction.
  - [Mercury](https://mobbin.com/screens/092df116-f17c-4ffe-89b6-4e2026e58168): The Home 'Transactions' card applies the same rule in a compact recent list.
  - [Mercury](https://mobbin.com/screens/28f577f9-1da9-46ec-8ca8-aa5648ba113d): Money out reads '−$2.55' in neutral ink and money in reads '$1,001.00' in green. Failed items are struck through. Rent and repairs on the property card should follow this.
  - [Monarch](https://mobbin.com/screens/5e408508-0a7e-42d0-8fe4-879ab707bbc1): Income as "+$2,000.00" in green, spending plain, category column beside the payee.
  - [Upwork](https://mobbin.com/screens/3f0c0858-5839-4056-878c-709f060cebcc): Signed amounts (+$4.50 / -$0.50) in a right-aligned Amount column.
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:78-93`, `src/lib/quickbooks/queries.ts:202-214`, `src/app/(app)/properties/[id]/financials.tsx:78-90`, `prisma/schema.prisma:616`, `src/app/(app)/properties/[id]/financials.tsx:82-90`
- **Also found as:** DATA-I06 (Lens: tables, numbers, money, charts and status), G2A-020 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** partly. The observation is accurate. queries.ts:202-214 fetches 15 lines with no treatment filter, financials.tsx:82 shows 8, and the schema comment on LedgerLine.amount reads 'income +, expense +, contra/reclass -'. So a deposit and a repair both print positive, and a negative reclass prints with a minus, as if it were money out. Code-only: 118 Congress is mapped but has no lines locally, and its card shows three $0 figures. Two corrections. (1) 'Leave excluded lines out' is wrong for a property record. EXCLUDED covers CapEx and principal (schema QboTreatment comment), which a partner wants to see on the building. Show them muted with their category ('CapEx', 'Transfer') instead of dropping them. (2) In the Mercury screens I pulled (b83e3032, 868560a8), money in is green with no plus sign, and money out carries the minus. Either works, but the citation overstates the plus.

### FINANCIALS-006

**Tell missed rent apart from months before purchase**

Medium · Design change · effort S · `/financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** Every rent-grid cell without rent shows a muted '—', whether the month is before purchase or after it (seen in code; the local sandbox has no rent lines). Whether an owned month with no rent is missed, vacant or in rehab can't be told from QuickBooks alone.
- **Why:** Spotting missed rent is the main reason to open this page, and the muted dash hides exactly the cell that matters.
- **Change:** Leave cells before the purchase month blank. For owned months with no rent, show '$0' in red with a 'Missed' tooltip. Show months well below the property's trailing median in amber text. Add a 'Missing' count to the page header.
- **Desktop, tablet, phone:** Desktop and tablet: grid cells. Phone: the month list shows a red 'Missed' label, right-aligned, where the amount would be.
- **Reuse:** Badge tones (red reserved for this status in the view); Tooltip (needs the tap path listed in Known gaps).
- **References:** 
  - [Stripe](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258): Failed status marked right next to the amount in each row
  - [YNAB](https://mobbin.com/screens/3a34e509-965a-44cc-97cf-12ebd76adf78): Problem rows flagged inline ('This needs a category') rather than muted
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:72-76`, `src/lib/quickbooks/queries.ts:319-341`
- **Verification:** partly. The local sandbox has no RENT lines, so I could only check this in code (rent-roll/page.tsx:74; purchaseDate is selected at queries.ts:289 and never used). Blanking pre-purchase months is a clear win. The red 'Missed' label is not safe yet. Without lease or occupancy data, an owned month with no rent may be rehab (HG runs BRRRR-style holds; the Property status field includes 'Rehabbing') or a vacant unit, so red '$0 Missed' would raise false alarms. Ship the pre-purchase blanking now and add 'Missed' with FINANCIALS-007 once rent is scheduled. The YNAB ref 3a34e509 ('needs a category') supports this only weakly.

### FINANCIALS-010

**Collapse the bookkeeping tiles into one 'needs review' line**

Medium · Design change · effort S · `/financials (Overview)` · The QuickBooks mirror is honest about what it covers

- **Today:** Between the KPIs and the charts sit three tiles: 'Unclassified in QuickBooks $12,065 / 87 lines' (amber), 'Suspense / clearing (excluded) $0' and 'Unattributed (entity / no-class) -$1,904'.
- **Why:** Bookkeeping cleanup isn't performance, and a $0 suspense tile adds nothing. Calm products surface cleanup as one line with an action.
- **Change:** Remove the three tiles. When something needs action, show one slim line above the strip: 'QuickBooks has 87 lines with no class ($12,065). Review', linking to the review list. Show nothing when everything is clean.
- **Desktop, tablet, phone:** The same single line at every size; on phone it shortens to '87 lines need a class. Review'.
- **Reuse:** The existing one-line notice styling at page.tsx:66-74; remove DqStat.
- **References:** 
  - [Mercury](https://mobbin.com/screens/67a22ab9-8672-4acb-a980-cfda6b7e810d): Insights states cleanup as one sentence with a count and share, for example '4 uncategorized payments made up 8% of 48 money-out transactions', with the key term as an inline chip.
  - [Copilot](https://mobbin.com/screens/8edbc5d1-5e4d-4b8a-b916-c19f9558b6d4): The dashboard's Transactions to review card has a View all link, and its done state is one line ('You've reviewed 30 transactions').
  - [YNAB](https://mobbin.com/screens/3a34e509-965a-44cc-97cf-12ebd76adf78): One banner: '30 new transactions to approve or categorize. View'
  - [Deel](https://mobbin.com/screens/b6d82ee0-8694-4f55-a1d5-9f0964c8b13c): 'Action required' with a count instead of a wall of figures
  - [Mercury](https://mobbin.com/screens/c6574c88-b41c-417d-acf3-3bd0fc60c6b1): '4 uncategorized payments made up 8% of 48 money-out transactions', with the noun as a link to them.
  - [Mercury](https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605): Books home carries context as one sub-line under a figure instead of extra tiles.
  - [Mercury](https://mobbin.com/screens/c2e587ee-46c0-45a2-8030-15b54542e9c4): Data issues written as short sentences with highlighted tokens beside the chart, not as tiles.
- **Code:** `src/app/(app)/financials/page.tsx:91-112`, `src/app/(app)/financials/page.tsx:93-110`, `src/app/(app)/financials/page.tsx:203`
- **Also found as:** DATA-I05 (Lens: tables, numbers, money, charts and status), G2A-I16 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** partly. Observation confirmed. Lowered to medium because FINANCIALS-009 already settles the page composition, and this finding is its data-quality half. It overlaps FINANCIALS-041 (both delete the Unattributed tile) and FINANCIALS-020 (the same 'Needs review' destination), so build the three together.

### FINANCIALS-011

**Say plainly when QuickBooks hasn't synced, and put Sync now beside it**

Medium · Fix · effort S · `/financials, /financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** The local data was last synced Sep 2 (51 days); in production the nightly cron normally keeps it within a day. When sync does fail, Overview shows only an amber 'QuickBooks' chip and 12px 'synced 51d ago'. The rent roll drops the reconciliation state.
- **Why:** On a finance page, data seven weeks old quietly turns 'this month' into $0. The state needs to be said in words, with the fix right next to it.
- **Change:** When the last success is more than 36 hours old, show one line: 'Not synced since Sep 2. September and October are missing.' with a Sync now button. After three days, also add it to Home's 'what needs me' list (D10).
- **Desktop, tablet, phone:** Same line at every size; on phone it shortens to 'Not synced since Sep 2. Sync now'.
- **Reuse:** hoursSince in SourceBadge; RefreshButton.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Each overview card ends with a quiet freshness note in plain words ('Updated yesterday', 'Updated 06:23') in the same spot every time.
  - [Xero](https://mobbin.com/screens/830b74d7-ebf9-4b60-958e-0e759d88dffa): 'Last synced 1 day ago · Refresh now' in the page header
  - [Monarch](https://mobbin.com/screens/3aa499af-7109-44c3-be79-97076779ce09): Freshness ('3 hours ago') plus 'Refresh all'
- **Code:** `src/app/(app)/financials/_components/ui.tsx:94-112`, `src/app/(app)/financials/rent-roll/page.tsx:26`
- **Verification:** partly. The 51-day gap is the local database snapshot. Production runs a nightly cron (vercel.json: /api/quickbooks/sync at 0 8 * * *), so this is the failure state, not the normal one, and medium fits better. The rent roll does omit status: SourceBadge gets no status prop at rent-roll/page.tsx:26. This is a layout and copy change, so kind should be design, not fix. It overlaps FINANCIALS-033 and FINANCIALS-044; build them as one freshness-and-sync control.

### FINANCIALS-015

**Give each chart color one job: blue income, neutral expense, amber warnings only**

Medium · Design change · effort S · `/financials (charts, banners, tiles)` · One design system, fixed in the primitives

- **Today:** Amber marks expense bars in the trend, negative category bars, the warning banner, the stale QuickBooks chip, the Unclassified tile and owner-funded text. Blue marks income in the trend, yet expense categories in the card right next to it are also blue.
- **Why:** The house rule says every color has a job. Here expense is blue in one card and amber in the next, and amber means both 'expense' and 'warning'.
- **Change:** Income in primary blue. Expense in neutral zinc (zinc-400 in light, zinc-500 in dark). Amber only for warnings. Red only for negative or missed figures. Category bars become neutral.
- **Desktop, tablet, phone:** Same at every size; check contrast in dark mode.
- **Reuse:** MoneyBars and the trend bars; add --chart-income and --chart-expense tokens to src/app/globals.css.
- **References:** 
  - [Mercury](https://mobbin.com/screens/67a22ab9-8672-4acb-a980-cfda6b7e810d): One hue for money in, one for money out, nothing else colored
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Single-hue line charts; color kept for status
  - [Mercury](https://mobbin.com/screens/f6fbe6f0-e531-4833-9c59-61f4d575b38a): Money in and out in restrained tones; warning colors don't appear in charts
- **Code:** `src/app/(app)/financials/_components/ui.tsx:66`, `src/app/(app)/financials/page.tsx:145-152`, `src/app/(app)/financials/page.tsx:151`, `src/app/(app)/financials/_components/ui.tsx:66,105`
- **Also found as:** DATA-024 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. Confirmed in light and dark: expense is blue in the category card (ui.tsx:66 bg-primary/50) and amber in the trend (page.tsx:151). Amber also marks the warning banner, the stale chip and the Unclassified tile. This is an inconsistency rather than a usability blocker, so medium. The Mercury and Stripe refs plausibly support it.

### FINANCIALS-019

**Confirm mapping changes with a toast that says what moved, plus Undo**

Medium · New capability · effort M · `/financials/settings (mapping tables)` · Every save is safe, instant and undoable

- **Today:** Changing a class role or account category immediately rewrites every ledger line for that class or account (restampClass, updateMany). The whole table dims to 60% while it saves, and nothing afterwards says what changed.
- **Why:** These edits change a property's historical NOI. The 'close the loop' rule and the approved Undo toast pattern both call for showing what happened.
- **Change:** After a save, show a toast for 8 seconds: 'HGC 118 Congress now maps to 118 Congress St. 214 lines moved. Undo'. Dim only the edited row.
- **Desktop, tablet, phone:** Desktop and tablet: toast bottom-right. Phone: bottom, above the bottom bar.
- **Reuse:** New shared Toast (a Known gap), built once and shared with the Tasks reschedule Undo toast from the approved decisions.
- **References:** 
  - [Copilot](https://mobbin.com/screens/0f4d6bb7-d6c1-47e6-bc7d-16be6c6ed1bc): The toast names the change and its scope ('The change is applied to future transactions') and offers Undo. HG's version should say it applies to all months.
  - [Acctual](https://mobbin.com/screens/78868383-2fad-4b4a-a527-5c77e4ca5d18): Small success toast after a QuickBooks change
  - [QuickBooks](https://mobbin.com/screens/8fd16d88-dd92-4c23-a3d5-bc5cebd032ca): 'Transaction posted' toast after categorizing
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): A bottom-right toast names the action and carries Undo.
  - [Mercury](https://mobbin.com/screens/cd0b9b16-b7d2-4ea6-a227-bbdc9e1e9506): A dark toast ('Category created') confirms a categories change without a page reload.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:51`, `src/app/(app)/financials/settings/tables.tsx:136`, `src/app/(app)/financials/settings/actions.ts:27-34`, `src/app/(app)/financials/settings/actions.ts:94-103`, `src/app/(app)/financials/settings/tables.tsx:36`, `docs/components.md:66`
- **Also found as:** G2A-I05 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** partly. Confirmed: the whole table dims via the shared pending flag (tables.tsx:51, 136), and nothing confirms afterwards. The Toast is a Known gap and should be built once and shared with the approved Tasks Undo toast. This is a new pattern rather than a usability blocker, so medium. Undo needs the previous mapping stored, which adds to the effort.

### FINANCIALS-021

**List the unclassified QuickBooks lines behind the total**

Medium · New capability · effort M · `/financials/settings (Needs review)` · The QuickBooks mirror is honest about what it covers

- **Today:** The 87 unclassified lines appear only as a sum ('$12,065 · 87 lines') with the note 'assign a class in QuickBooks'. There's no list and no link.
- **Why:** The bookkeeper can't fix what they can't find, so the total just sits there.
- **Change:** 'Review' opens the lines: date, vendor, account, amount, and 'Open in QuickBooks' when qboTxnId is a real Intuit id. A segmented filter switches between No class, Suspense, Uncategorized and Owner-funded.
- **Desktop, tablet, phone:** Desktop and tablet: a table with right-aligned amounts. Phone: list rows with vendor and amount, plus date and account as the sublabel.
- **Reuse:** LedgerLine fields (txnDate, name, accountName, qboTxnId); Table; SegmentedControl.
- **References:** 
  - [Mercury](https://mobbin.com/screens/bad0bbdd-bcae-4932-82fa-d42d249dd488): In the Books transactions list, Uncategorized lines show their ledger account. There's a Review filter, and each row marks whether it was categorized automatically, by a rule or by a person.
  - [Copilot](https://mobbin.com/screens/7ecdbf50-e381-40ac-a33c-0edcec8d4c54): Lines are grouped under day headers. Selecting several raises a floating '4 selected · Category' bar with a searchable category menu.
  - [QuickBooks](https://mobbin.com/screens/8fd16d88-dd92-4c23-a3d5-bc5cebd032ca): 'Pending (764) | Posted | Excluded' queue of lines to fix
  - [YNAB](https://mobbin.com/screens/3a34e509-965a-44cc-97cf-12ebd76adf78): The flagged rows themselves, one per transaction
  - [Mercury](https://mobbin.com/screens/28f577f9-1da9-46ec-8ca8-aa5648ba113d): Rows open in a right drawer with the line's details while the list stays in place.
  - [Wise](https://mobbin.com/screens/9a1210ff-734d-4e13-8e18-00de06ef3897): The QuickBooks connection page closes with a direct 'Go to QuickBooks' link for the step that happens there.
- **Code:** `src/app/(app)/financials/settings/page.tsx:108-113`, `src/lib/quickbooks/data-quality.ts:73-77`, `src/app/(app)/financials/settings/page.tsx:201-211`
- **Also found as:** G2A-I26 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** partly. Confirmed: only a sum plus 'assign a class in QuickBooks', with no list (settings/page.tsx:108-113). qboTxnId and txnDate exist on LedgerLine. The fix happens in QuickBooks, so this is a convenience for the bookkeeper rather than a blocked core job. Medium.

### FINANCIALS-022

**Turn the mapping tables into tappable rows on phones**

Medium · Design change · effort M · `/financials/settings (phone and tablet)` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 the class table's Role select shows a single letter ('I') and Property shows '118 Cc'. At 320 the selects collapse to bare chevrons and the account Category column is pushed off-screen. At 768, property addresses are cut off inside the selects.
- **Why:** Mapping can't be done on a phone, and on a tablet the pick can't be read.
- **Change:** On phone and tablet, each class or account becomes a list row: name, current mapping as text on the right, and a chevron. Tapping opens a bottom sheet with the picker. On desktop, keep a table of text cells with tap-to-edit.
- **Desktop, tablet, phone:** Desktop: table with tap-to-edit. Tablet: list rows that open a side sheet. Phone: list rows that open a bottom sheet; the entity line drops.
- **Reuse:** React Aria menu and sheet (D9).
- **References:** 
  - [Midday](https://mobbin.com/screens/85a64f64-2ec8-4543-9f05-ed5b97f64d24): Category list stays readable; editing happens in a sheet
  - [Quicken](https://mobbin.com/screens/5892043e-7b8b-4ceb-ae9e-07a35f9b150d): Read-only rows with a hover menu instead of a select in every cell
  - [Monarch](https://mobbin.com/screens/34868ff1-6d93-40d4-92fa-eb3bf280bbd0): 'Select category' sheet with search and section headers (Income, Gifts and Donations) for a long option list.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:65-100`, `src/app/(app)/financials/settings/tables.tsx:39-105`
- **Also found as:** G2A-V08 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** partly. Reproduced. At 375 the Role select shows 'I' and Property shows '118 Cc' (selects 41, 81 and 58 px wide). At 320 the account table is 392 px inside a 286 px box. At 768 the property reads '118 Congress St. Buffal'. Class mapping is a rare desktop setup job, and FINANCIALS-049's single picker would replace these selects anyway, so medium. Build it as FINANCIALS-049's responsive behavior.

### FINANCIALS-023

**Count months from the data and the sync date, and treat the running month consistently**

Medium · Fix · effort S · `/financials (KPI month count)` · The QuickBooks mirror is honest about what it covers

- **Today:** KPIs say '(5 mo)' while the trend lists four months (May to Aug). On accrual it's '(6 mo)' with five months listed. monthsOfData runs to the month before today rather than the last synced month. Meanwhile the totals include current-month lines, which the count leaves out.
- **Why:** The month label and the totals describe different spans, so any average is off.
- **Change:** End the range at the earlier of the last complete month and the last sync date, and label it with dates ('May 1 to Sep 2'). Treat the running month the same way in totals and label: include it in both, marked MTD.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** monthsOfData in src/lib/quickbooks/compute.ts.
- **Code:** `src/lib/quickbooks/compute.ts:83-96`, `src/lib/quickbooks/queries.ts:86-87`, `src/lib/quickbooks/queries.ts:121-136`, `src/lib/quickbooks/queries.ts:86-87,129-137`
- **Also found as:** DATA-008 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. Reproduced: cash shows '(5 mo)' with 4 trend months (May to Aug), and accrual shows '(6 mo)' with 5 months (Apr to Aug). monthsOfData ends at prevMonth(currentMonth) = 2026-09 (compute.ts:93) even though nothing has synced since Sep 2. computeNoi totals include current-month lines that the count leaves out (compute.ts:84 vs 112-142).

### FINANCIALS-024

**Use one month formatter: 'Jan', 'Aug 2026', 'Oct MTD'**

Medium · Fix · effort S · `/financials, /financials/rent-roll` · Money, numbers and dates read one way

- **Today:** Trend rows are labeled '2026-05'. Rent roll column headers are m.slice(2), which prints '26-01'. The running month carries no marker.
- **Why:** These are machine formats, and the running month's partial total looks like a bad month.
- **Change:** Add one fmtMonth helper to src/lib/dates.ts: 'Jan' in grids with a year divider, 'Aug 2026' in tooltips, and 'Oct MTD' for the running month.
- **Desktop, tablet, phone:** Same everywhere; phone grids use single-letter months only inside sparklines.
- **Reuse:** src/lib/dates.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/269ac107-c09e-4c57-a263-2a82ff06c4cd): Columns 'Apr 2026 ... Aug 2026, Sep MTD'
  - [Mercury](https://mobbin.com/screens/f41ddda3-30cd-4bed-8730-9ab936b86a4c): Cash flow chart and columns labeled 'Jan 2026', 'Feb 2026'.
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): P&L columns and chart axis read 'Jan 2026', 'Feb 2026', and the partial month reads 'Sep MTD'.
- **Code:** `src/app/(app)/financials/page.tsx:141`, `src/app/(app)/financials/rent-roll/page.tsx:41-45`, `src/app/(app)/financials/rent-roll/page.tsx:43`, `src/app/(app)/financials/settings/page.tsx:95`
- **Also found as:** VISUAL-V09 (Lens: visual design system across every screen), DATA-040 (Lens: tables, numbers, money, charts and status), G2A-V09 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Trend labels are '2026-05' (page.tsx:141). Rent-roll headers use m.slice(2), giving '26-01' (rent-roll/page.tsx:43). The Mercury balance sheet I pulled (https://mobbin.com/screens/86d1b223-4450-4f3e-ac66-72a05f9a8ea3) shows the 'Jan 2026 ... Sep MTD' column pattern the finding cites.

### FINANCIALS-025

**Add a 'Not tied to a property' row so the rent total matches Overview**

Medium · Fix · effort S · `/financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** getRentRoll skips any rent line without a property-role class before it adds to portfolioByMonth, and the page has no row for those lines. Overview does show an Unattributed row. So the Rent roll's Portfolio total quietly leaves out rent that Overview counts.
- **Why:** The two tabs disagree on total rent with no explanation.
- **Change:** Add a 'Not tied to a property' row under the properties, linking to the review list, and include it in the Portfolio total.
- **Desktop, tablet, phone:** A last row in the table; on phone, a last list item.
- **Reuse:** getRentRoll.
- **Code:** `src/lib/quickbooks/queries.ts:299-317`, `src/app/(app)/financials/rent-roll/page.tsx:81-94`, `src/app/(app)/financials/page.tsx:201-213`
- **Verification:** confirmed. queries.ts:301 skips non-property rent lines before they reach portfolioByMonth, yet still adds their month to monthSet at :300. So a month can get a column with no rows behind it. Naming: this finding says 'Not tied to a property' while FINANCIALS-041 says 'Company overhead' for the same bucket. 'Not tied to a property' is the accurate name.

### FINANCIALS-026

**Make the rent page's month count mean what Overview's means**

Medium · Fix · effort S · `/financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** The rent page's '(N mo)' counts only months that had rent, so a property that missed two months shows '(7 mo)'. Overview's '(N mo)' counts every month since first activity or ownership.
- **Why:** The same pill means two different things on adjacent tabs, and on Rent it hides the missed months.
- **Change:** Drop the pill on Rent. Show ownership start as blank leading cells and missed months as flagged cells (FINANCIALS-006).
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** PartialLabel; getRentRoll.
- **Code:** `src/lib/quickbooks/queries.ts:331`, `src/app/(app)/financials/rent-roll/page.tsx:59`, `src/lib/quickbooks/compute.ts:77-96`
- **Verification:** confirmed. The rent page counts only months with rent before the current month (queries.ts:331). Overview counts the span (compute.ts:83-96). Same pill, different meaning. Seen in code only, since the local sandbox has no rent lines.

### FINANCIALS-027

**Carry the basis across tabs and match the copy to it**

Medium · Fix · effort S · `/financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** Rent roll reads ?basis=accrual but has no control for it. TopTabs builds plain hrefs, so switching to accrual on Overview and then opening Rent roll lands on /financials/rent-roll in cash. On accrual, the explainer still says 'Cash rent received'.
- **Why:** The basis silently resets between tabs, and the copy contradicts the badge right above it.
- **Change:** Have TopTabs keep the current search params (or move basis and period into a shared layout control row), show the same control row on Rent, and use 'Rent received' on cash and 'Rent billed' on accrual.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** TopTabs in src/components/nav.tsx; SegmentedControl.
- **Code:** `src/components/nav.tsx:126-150`, `src/app/(app)/financials/rent-roll/page.tsx:11`, `src/app/(app)/financials/rent-roll/page.tsx:28-33`
- **Verification:** confirmed. Reproduced: from /financials?basis=accrual, clicking 'Rent roll' lands on /financials/rent-roll with no basis. On /financials/rent-roll?basis=accrual the badge reads 'Accrual basis' while the explainer still says 'Cash rent received'. TopTabs builds plain hrefs (nav.tsx:126-150).

### FINANCIALS-028

**Delete the four-line explainer above the rent table**

Medium · Fix · effort S · `/financials/rent-roll` · Plain, consistent words

- **Today:** A gray box of four lines (seven at 375) explains class summing, refinance entity transfers, missing lease data, Section-8 and P2P handling before the table starts.
- **Why:** The copy rules say internal caveats stay out of the UI and to use the lightest form that works.
- **Change:** Remove it. Put one info tooltip on the 'Collected' header: 'Rent received in QuickBooks, including voucher payments.' Move the rest to a comment in queries.ts.
- **Desktop, tablet, phone:** Tooltip on hover on desktop; tap on touch, which needs the Tooltip tap path from Known gaps.
- **Reuse:** src/components/tooltip.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888): A small info icon next to each metric title holds the definition
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): The P&L report has a title and controls, then data, with no explanatory paragraph.
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:28-33`
- **Also found as:** G2A-I23 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Seen: four lines at 1280 and seven at 375, all internal caveats. The replacement Tooltip is hover only (Known gaps), so the tap path must land first, as the finding says.

### FINANCIALS-030

**Pin the address column, shorten addresses, and use a month stepper on phones**

Medium · Design change · effort M · `/financials/rent-roll (grid)` · The QuickBooks mirror is honest about what it covers

- **Today:** The property column doesn't stay put when the grid scrolls sideways, and addresses are full ('767 Prospect Avenue, Buffalo, NY 14213'). History runs from January, so ten or more month columns push the address off-screen on tablet and phone. (Seen in code; the local sandbox has no rent rows.)
- **Why:** You lose track of which property a number belongs to as soon as you scroll.
- **Change:** Pin the first column with shortAddress ('767 Prospect'), show at most 12 months, and right-align figures. On phones, replace the grid with a '< October 2026 >' month stepper and a list of properties with that month's amount.
- **Desktop, tablet, phone:** Desktop: sticky first column with 12 months. Tablet: sticky column, 6 months visible. Phone: month stepper list; the full grid drops.
- **Reuse:** shortAddress in src/lib/normalize.ts; Table and Th (sticky header already exists).
- **References:** 
  - [Mercury](https://mobbin.com/screens/269ac107-c09e-4c57-a263-2a82ff06c4cd): Month columns with a fixed account column and right-aligned figures
  - [Mercury](https://mobbin.com/screens/4de25abd-3405-4777-8d93-9ad39f0ad5c6): Phone month stepper over a list
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:36-58`
- **Verification:** confirmed. Seen in code only: no sticky first column, Th is sticky top only (ui.tsx:181-190), and rows use the full address. It can't be seen locally because there are no rent rows. With history from 2026-01 the grid already reaches 10 month columns plus Total in October.

### FINANCIALS-031

**Open the rent page with this month's collection as the headline**

Medium · Design change · effort S · `/financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** The page opens with a source chip and a paragraph. Nothing answers 'how much came in this month?' without reading a grid.
- **Why:** The page's main question should be answered in its first line.
- **Change:** Lead with 'Collected $38,450 in October', with last month muted beside it. Once FINANCIALS-007 ships, it reads 'of $44,800 expected'.
- **Desktop, tablet, phone:** Same headline at every size; on phone last month moves under it.
- **Reuse:** Kpi (hero size).
- **References:** 
  - [Mercury](https://mobbin.com/screens/bdce7bfe-7887-4a73-b548-1dfdf434b268): Invoicing leads with three totals and counts: Total open, Overdue (orange only when nonzero) and Paid. Rows read 'Oct 28 · 1 day ago' with an Overdue chip.
  - [Mercury](https://mobbin.com/screens/2cc902ac-0a58-4fa2-87ff-1738b99aab56): The not-yet-due state reads 'Nov 1 · in 3 days' with a neutral 'Not due yet' chip, so early in the month doesn't look like missing rent.
  - [Turo](https://mobbin.com/screens/df24d3eb-0f6b-4a9c-9f62-3b785c1b9b7e): '$0 earned in 2026' as the page headline
  - [Airbnb](https://mobbin.com/screens/02184364-327d-4c8b-b5c8-7424686b207a): '$0.00 this month' above the month chart
  - [Wise](https://mobbin.com/screens/b2d58d78-50f9-45bc-98ba-daa46314b5c2): 'Spent this month' against 'Avg monthly spend'
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:24-33`
- **Verification:** confirmed. Valid as the interim headline before FINANCIALS-007, which proposes the final 'Collected ... of ... expected' line. Merge them as one headline that gains 'of $X expected' once scheduled rent exists. The Airbnb ref 02184364 ('$0.00 this month' above the month chart) came back in my search and matches.

### FINANCIALS-032

**Stop filling KPI tiles with the page background color**

Medium · Design change · effort S · `/financials (KPI tiles)` · One design system, fixed in the primitives

- **Today:** Kpi and DqStat tiles use bg-background: the same gray as the page in light mode, and near-black holes in dark mode. The cards beside them are white or surface with shadow-sm.
- **Why:** Two surface languages on one screen reads as unfinished, and in dark mode the tiles look recessed.
- **Change:** Put the KPI strip (FINANCIALS-009) inside one surface Card, or straight on the page with no fill. Never use bg-background as a fill on the page background.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** Card; Kpi.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Metrics sit straight on one surface
- **Code:** `src/app/(app)/financials/_components/ui.tsx:29`, `src/app/(app)/financials/page.tsx:249-252`
- **Verification:** confirmed. Measured in dark: KPI tile background rgb(11,12,14) equals the page background rgb(11,12,14), while cards are rgb(22,24,25). In light the tiles are page gray inside white-card territory too.

### FINANCIALS-033

**Merge the source chip, status text and banner into one freshness line**

Medium · Design change · effort S · `/financials (source row)` · The QuickBooks mirror is honest about what it covers

- **Today:** The source row shows an amber 'QuickBooks' badge and 'Cash basis · synced 51d ago · reconciliation off'. Below it, a full-width amber banner repeats the reconciliation problem. The badge's color stands for freshness while its word is the vendor name.
- **Why:** Three marks say the same thing, and a vendor-name badge in a status color doesn't say what state it means.
- **Change:** One muted line at the right of the control row: 'QuickBooks · synced 2 hours ago', with no badge. Problems become a single notice line with its action (FINANCIALS-011, FINANCIALS-051).
- **Desktop, tablet, phone:** Desktop and tablet: right end of the control row. Phone: under the period chip, shortened to 'Synced 2h ago'.
- **Reuse:** SourceBadge (simplify it).
- **References:** 
  - [Stripe](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b): Freshness is one muted 'Updated 11:18' note at the card's bottom right, with no badge and no banner.
  - [HoneyBook](https://mobbin.com/screens/f32e5716-bf30-4944-8210-5b01ad695bc1): 'Last updated 46 minutes ago' as plain muted text
  - [Xero](https://mobbin.com/screens/830b74d7-ebf9-4b60-958e-0e759d88dffa): Freshness and Refresh in one header line
- **Code:** `src/app/(app)/financials/_components/ui.tsx:94-112`, `src/app/(app)/financials/page.tsx:52-74`
- **Verification:** confirmed. Seen: the amber 'QuickBooks' badge, then 'Cash basis · synced 51d ago · reconciliation off', then a full-width amber banner restating it. Build this with FINANCIALS-011 and FINANCIALS-044 as one control row. Don't ship three separate changes.

### FINANCIALS-034

**Switch basis with a Cash | Accrual segmented control, not a text link**

Medium · Design change · effort S · `/financials, /financials/settings` · The QuickBooks mirror is honest about what it covers

- **Today:** Overview switches basis with a blue text link, 'Show accrual basis'; the current basis appears only as gray text in the source line. Settings uses a different BasisToggle with a primary-blue fill.
- **Why:** The current state is hard to see, and two different controls do one job.
- **Change:** Use a Cash | Accrual segmented control in the control row on both pages, where the selected fill alone marks the pick. Expose the state with aria-pressed.
- **Desktop, tablet, phone:** Desktop and tablet: inline. Phone: moves into the period sheet.
- **Reuse:** Extract the segmented control from src/app/(app)/deals/filters.tsx (docs/components.md Duplicates already names BasisToggle).
- **References:** 
  - [Mercury](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa): A three-way segmented control (Source, Category, GL Code) switches the same list in place, and the selected fill is the only state mark.
  - [Mercury](https://mobbin.com/screens/33aa85ec-2765-421d-b954-5ef74b748e81): Phone version: a full-width Money in | Money spent segmented control above the figure.
  - [Perplexity](https://mobbin.com/screens/9403c5aa-9ecf-4e38-828f-7f702ef23448): 'Annual | Quarterly | TTM' segmented control over a financial table
  - [Monarch](https://mobbin.com/screens/535fbe4d-18fb-4935-9065-2417c513a70e): 'Totals | Change' segmented control
  - [Dub](https://mobbin.com/screens/2a1f9131-8c1a-48ec-8d48-3958b3505b12): A two-option toggle ('$ / 123') sits beside the figures it changes; the selected fill alone marks the pick.
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): Report-level options (Monthly, 2026) live in the report header row, not in a link elsewhere.
  - [Laravel Cloud](https://mobbin.com/screens/b1cd2fc4-7079-4628-a8fd-8afe228908ce): Segmented range control in the report header
  - [Stripe](https://mobbin.com/screens/a35ca351-394d-47f0-b96f-5e5cb6356bfb): The Revenue recovery range picker (3m/6m/1y/2y) marks the pick with a quiet outlined chip, not a brand fill.
- **Code:** `src/app/(app)/financials/page.tsx:55-61`, `src/app/(app)/financials/settings/controls.tsx:9-29`, `src/app/(app)/financials/settings/controls.tsx:9-28`, `src/app/(app)/financials/settings/controls.tsx:19-23`
- **Also found as:** G2A-I19 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), DATA-062 (Lens: tables, numbers, money, charts and status), FEEL-V06 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Confirmed: a text link on Overview (page.tsx:55-61) and BasisToggle with a primary fill in Settings (controls.tsx:9-29), which docs/components.md Duplicates already lists. BasisToggle marks the current option only by disabling it and has no aria-pressed, which breaks the house toggle rule. That supports this finding.

### FINANCIALS-035

**Fit the header into title, tabs and one control row**

Medium · Design change · effort S · `/financials (header)` · The QuickBooks mirror is honest about what it covers

- **Today:** Title, subtitle, tabs, source row and banner take about 240 CSS px at 1280 and about 300 CSS px at 375 before the first number. At 375 and 320 the basis link and Refresh button wrap to a second line.
- **Why:** Stripe and Mercury reach the data within one control row of the title.
- **Change:** PageHeader with the title only, then the tabs, then one control row (period, basis, freshness, sync icon). Drop the subtitle (FINANCIALS-054).
- **Desktop, tablet, phone:** Desktop and tablet: one control row. Phone: the period chip and sync icon only; basis moves into the period sheet.
- **Reuse:** PageHeader in src/components/ui.tsx (the layout hand-rolls the h1 today).
- **References:** 
  - [Stripe](https://mobbin.com/screens/63b47007-2529-42d0-8701-6ef4ff10342e): Title, tabs and then a single date and compare row
  - [Mercury](https://mobbin.com/screens/10e9460a-1e44-4361-afe6-e0e9d857e6d9): Title, then one filter row, then data
- **Code:** `src/app/(app)/financials/layout.tsx:8-21`
- **Verification:** partly. The figures are overstated. Measured: first KPI at y=298 at 1280 (about 240 px below the 56 px top bar) and y=354 at 375 (about 300 px). The '560px' is device pixels from the 2x screenshot. A miss the finding didn't name: at 375 and 320 the 'Show accrual basis' and Refresh controls wrap onto their own line under the source text. That breaks the house rule that rows of controls never wrap, and backs the one-control-row recommendation. Largely the sum of FINANCIALS-033, 034, 044 and 054.

### FINANCIALS-037

**Keep negative amounts on one line, with a true minus and a dark-mode red**

Medium · Fix · effort S · `/financials (all money)` · Money, numbers and dates read one way

- **Today:** Negative figures use a hyphen-minus and can break: in WebKit at 375 the NOI cell wraps into '-' on one line and '$1,904' on the next. Negative KPIs use text-red-600 with no dark-mode variant, so the red is dim on the near-black surface.
- **Why:** A minus sign stranded on its own line reads as a different number.
- **Change:** Add whitespace-nowrap to every money cell, have fmtMoney output a true minus (U+2212) via signDisplay, and add dark:text-red-400 to negative values.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** fmtMoney in src/lib/utils.ts; Kpi.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62): 'Net cash flow −$225' uses a true minus in body color, with '−122.5% vs prior period' beneath; a negative result is not painted as an error.
  - [Stripe Dashboard](https://mobbin.com/screens/b2499df0-b3fd-4f85-9b34-fa551a598e23): Falling deltas ('−5.9%') are orange, rising ones green; red is kept for failures.
  - [Mercury](https://mobbin.com/screens/7a717e40-6b9a-4dbc-a81c-b7da99d784cb): Money spent shown with a true minus sign.
  - [Mercury](https://mobbin.com/screens/d14e9441-a25f-4730-97a3-d7e7ed531af4): "−$2.55" with a true minus; money in in green, out in the default color
  - [Mercury](https://mobbin.com/screens/18f7213d-0beb-4436-ad3d-0891b5bd5efe): Negative cash flow shown as '−$225' with a true minus
- **Code:** `src/app/(app)/financials/_components/ui.tsx:35`, `src/lib/utils.ts:8-18`, `src/app/(app)/financials/settings/page.tsx:132`
- **Also found as:** VISUAL-018 (Lens: visual design system across every screen), DATA-025 (Lens: tables, numbers, money, charts and status), COPY-066 (Lens: words on every screen)
- **Verification:** confirmed. Reproduced in WebKit at 375: the NOI cell breaks into '-' and '$1,904'. In dark the computed red sits on rgb(11,12,14) at roughly 4:1, under AA for this text size. One technical correction: Intl signDisplay does not emit U+2212; fmtMoney needs a replace('-', '−'), and fmtMoney is used app-wide. whitespace-nowrap on money cells is the essential part.

### FINANCIALS-040

**Make By property a list on phones**

Medium · Design change · effort M · `/financials (By property, phone)` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 the table scrolls sideways inside the card, so Margin and Debt int. are off-screen. 'Unattributed (entity / overhead / no class) Review' wraps to five lines.
- **Why:** Sideways scrolling inside a card hides the comparison columns on the device used most away from a desk.
- **Change:** On phones, each property is a row: short address with 'Income $x · Expenses $y' as the sublabel, and NOI right-aligned and bold. Tablet keeps the table with Margin and drops interest.
- **Desktop, tablet, phone:** Desktop: full table. Tablet: table without the interest column. Phone: list rows.
- **Reuse:** Table on desktop; a new list row pattern built from Card plus divide-y.
- **References:** 
  - [Mercury](https://mobbin.com/screens/33aa85ec-2765-421d-b954-5ef74b748e81): On a phone, each row has the name on the left and the amount right-aligned on one line, under a month bar strip and a month stepper.
  - [Monarch](https://mobbin.com/screens/3aa499af-7109-44c3-be79-97076779ce09): Name and type on the left, amount on the right
  - [Lloyds Mobile Banking](https://mobbin.com/screens/6627d8e3-daf4-4ea5-9a9d-dd7c5bae3cf0): Phone list rows with a sublabel and the amount at the right
- **Verification:** confirmed. Reproduced: at 375 the table is 481 px inside a 341 px box, so Margin and Debt int. are off-screen. The Unattributed label wraps to five lines.

### FINANCIALS-041

**Call it 'Company overhead', show it once, and drop the Σ footnote**

Medium · Fix · effort S · `/financials (Unattributed)` · Plain, consistent words

- **Today:** The same amount shows as an italic table row, 'Unattributed (entity / overhead / no class) Review'; as a tile, 'Unattributed (entity / no-class) · real cost, no property'; as a Settings row; and in the footnote 'Portfolio NOI = Σ per-property NOI + unattributed.'
- **Why:** One amount under three wordings, plus a math footnote, is internal reasoning showing on screen.
- **Change:** Name it 'Company overhead' and show it once, as the last table row in normal weight. Delete the tile and the footnote.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** The By property table row.
- **Code:** `src/app/(app)/financials/page.tsx:105-110`, `src/app/(app)/financials/page.tsx:201-213`, `src/app/(app)/financials/page.tsx:226-229`
- **Verification:** partly. The three wordings and the Σ footnote are confirmed. The proposed name is wrong. The bucket includes unclassified lines (classKey UNCLASSED; $12,065 over 87 lines in the sandbox) and ENTITY-role classes as well as overhead. Unclassified lines are often property costs missing a class, so 'Company overhead' would misstate them. Use 'Not tied to a property' (FINANCIALS-025's wording), or split overhead from unclassified.

### FINANCIALS-044

**Turn Refresh into a small Sync now control with a plain result**

Medium · Fix · effort S · `/financials, /financials/settings (Refresh)` · The QuickBooks mirror is honest about what it covers

- **Today:** The button reads 'Refresh from QuickBooks'. While pending it reads 'Syncing…'. Results appear as 11px lowercase text beside the button, such as 'partial · 412 lines', 'a sync is already running' or the raw 'failed: <error>'. Reviewed from code only; clicking it was blocked in this review.
- **Why:** The label is long, the result is jargon, and the raw error exposes internals.
- **Change:** An icon button labeled 'Sync now' (lucide RefreshCw) beside the freshness line, spinning while pending. Report the result in a toast: 'Synced through Oct 22.' or 'Sync didn't finish. Try again.' The freshness line then updates.
- **Desktop, tablet, phone:** Desktop and tablet: icon with label. Phone: icon only, 44px tap target, with aria-label 'Sync now'.
- **Reuse:** Button sm; lucide-react; Toast (Known gap).
- **References:** 
  - [Monarch](https://mobbin.com/screens/3aa499af-7109-44c3-be79-97076779ce09): Compact 'Refresh all' button top right
  - [Acctual](https://mobbin.com/screens/78868383-2fad-4b4a-a527-5c77e4ca5d18): Result reported as a short toast
  - [Vercel](https://mobbin.com/screens/87d19b6c-7a3b-4ce7-985c-5c4d13641701): One quiet freshness line under the data, 'Usage data can be up to 1 hour old', instead of status text that never clears.
  - [PandaDoc](https://mobbin.com/screens/31525e10-c6ba-4a23-83d9-0329fb101f0c): Freshness stated as "Updated 1 minute ago" next to the record title.
  - [Stripe](https://mobbin.com/screens/fa14d771-ae36-4074-8532-06dbcfd8ff74): Outcome as a short toast rather than inline text.
  - [Linear](https://mobbin.com/screens/c7223b87-8318-4848-8453-2ac4b1e1a0a9): A toast with a bold title and one explanatory line, dismissible.
  - [Vercel](https://mobbin.com/screens/156e9938-1514-4396-bfcd-917d05a67665): 'Connected Git Repository successfully.' as a toast, while the row updates to 'Connected just now'.
- **Code:** `src/app/(app)/financials/_components/refresh-button.tsx:8-41`, `src/app/(app)/financials/_components/refresh-button.tsx:15,25-34`, `src/app/(app)/financials/_components/refresh-button.tsx:15`, `src/app/(app)/financials/_components/refresh-button.tsx:25-34`
- **Also found as:** FEEL-029 (Lens: interaction quality, feedback, states, speed and accessibility), G2A-I22 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. I clicked it with writes blocked. The raw 'Failed to fetch' appeared as 11px gray text between 'Show accrual basis' and the button, widening the row. The skipped case reads 'a sync is already running'. The label change and icon-on-phone are design changes. The raw error string is a copy bug fixable directly.

### FINANCIALS-046

**Show the connection as one plain row instead of raw codes**

Medium · Fix · effort S · `/financials/settings (Connection)` · Plain, consistent words

- **Today:** Status shows an 'ACTIVE' badge. Company shows '9341457820052079', the realm id, because companyName is empty. Environment shows 'sandbox'. The last sync shows '(PARTIAL)', and 'History from' shows '2026-01'.
- **Why:** Enum values and ids on screen read as a debug panel.
- **Change:** One row: 'HG Capital Partners LLC' (fetch the company name at connect) with 'Connected · Synced Oct 22, 6:02 AM'. Under it, 'History since January 2026' and 'Reconnect by Dec 12, 2026'. Show 'Sandbox company' only when it applies.
- **Desktop, tablet, phone:** Desktop and tablet: a single row with the action at the right. Phone: stacked lines.
- **Reuse:** fmtDateTime; Badge only for an error state.
- **References:** 
  - [Mercury](https://mobbin.com/screens/cb40503d-fd6c-437c-bbba-aaec53ce22f3): An active integration is one row: logo, name, what it does in plain words ('Categorize transactions and sync your bank feed'), 'Connected' and a chevron into details.
  - [Wise](https://mobbin.com/screens/9a1210ff-734d-4e13-8e18-00de06ef3897): Company name with 'Your QuickBooks account is connected.'
  - [Acctual](https://mobbin.com/screens/78868383-2fad-4b4a-a527-5c77e4ca5d18): One row: company name and a green 'Connected'
  - [QuickBooks](https://mobbin.com/screens/c846a277-b056-4f86-a879-8822b316bc1d): Reauthorization deadline explained in plain words
  - [Vercel](https://mobbin.com/screens/2d216618-1a78-48ed-8279-01c025c60423): Connection facts as plain label and value pairs ('Status Ready', 'Created 22h ago by'), sentence case, no caps.
  - [Xero](https://mobbin.com/screens/5f186488-9c1c-4065-ab67-22e4fe9e6a2e): "Last synced 1 day ago" in plain words
- **Code:** `src/app/(app)/financials/settings/page.tsx:75-95`
- **Also found as:** COPY-026 (Lens: words on every screen), DATA-061 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. Seen: ACTIVE badge, realm id 9341457820052079, 'sandbox', '(PARTIAL)', '2026-01'. Root cause: companyName is never written anywhere. The callback route sets tokens and accountingMethod but no name, so the realm id will show in production too, and fix is the right kind. At 320 the Row layout (w-40 label with flex-wrap) breaks unevenly: Company, Basis and Last successful sync drop their values to a new line while the others stay inline. The stacked phone layout proposed here fixes that.

### FINANCIALS-048

**Replace the emoji and symbols in Settings with icons and words**

Medium · Fix · effort S · `/financials/settings` · One design system, fixed in the primitives

- **Today:** A 🔒 emoji marks pinned accounts, '⚠' prefixes a cleanup label, '✓' appears in the reconciliation line, and the card title reads 'Class → property mapping'.
- **Why:** The house rules ban emoji in product copy and call for single-color line icons.
- **Change:** Use a muted lucide Lock icon with the tooltip 'Category set by you', drop the ⚠ (the row's color already flags it), say 'Matches' instead of ✓, and title the card 'Class mapping'.
- **Desktop, tablet, phone:** Same at every size; the tooltip needs the tap path on touch.
- **Reuse:** lucide-react; Tooltip.
- **References:** 
  - [Mercury](https://mobbin.com/screens/aded2b48-4d84-4940-8dfa-92fdab1512ef): Status is a short word chip ('Auto-synced') in a fixed Status column, with no glyphs.
  - [Vercel](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7): Status is a colored dot plus a word in one column, which replaces the lock, warning and check glyphs in Settings.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:138-143`, `src/app/(app)/financials/settings/page.tsx:155`, `src/app/(app)/financials/settings/page.tsx:168`, `src/app/(app)/financials/settings/page.tsx:258-261`, `src/app/(app)/financials/settings/tables.tsx:139-141`, `src/app/(app)/financials/settings/page.tsx:155,258-259`, `src/app/(app)/financials/settings/tables.tsx:139-143`
- **Also found as:** G2A-V06 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), G2A-V07 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Seen: the 🔒 after pinned accounts (tables.tsx:141), the ⚠ label prefix (settings/page.tsx:155), and the ✓ in the reconciliation line. The emoji ban is a house rule. The arrow in 'Class → property mapping' isn't an emoji, but 'Class mapping' is shorter anyway.

### FINANCIALS-049

**Replace the three selects per class with one 'Maps to' picker**

Medium · Design change · effort M · `/financials/settings (Class mapping)` · The QuickBooks mirror is honest about what it covers

- **Today:** Each class row has three selects: Role, Property (disabled unless Role is Property) and Entity. Picking a property already sets the role, because mapClassToProperty sets role PROPERTY.
- **Why:** Three controls for one decision, two of them redundant, is the opposite of simple.
- **Change:** Two columns: Class, and a 'Maps to' picker grouped into Properties (11), Company overhead, Entity and Ignore. Show the entity, taken from the parent class, as a muted sublabel that can be edited in the sheet. Put a 'Not mapped (2)' filter above the table.
- **Desktop, tablet, phone:** Desktop: a table with the picker in a popover. Tablet and phone: rows that open a sheet (FINANCIALS-022).
- **Reuse:** React Aria menu (D9); SegmentedControl for the filter.
- **References:** 
  - [Copilot](https://mobbin.com/screens/7ecdbf50-e381-40ac-a33c-0edcec8d4c54): One searchable picker lists every target and ends with 'Exclude'. That maps to one 'Maps to' picker covering properties, entity overhead and Ignore.
  - [HubSpot](https://mobbin.com/screens/81446fd8-96d9-4e45-8414-c623d21519fb): One target picker per row, a Mapped check column and an 'All mapped statuses' filter
  - [Xero](https://mobbin.com/screens/506d9a4c-80e8-4f74-a570-5b1acef66d17): A single assign dropdown that marks options already 'Assigned'
- **Code:** `src/app/(app)/financials/settings/tables.tsx:65-100`, `src/app/(app)/financials/settings/actions.ts:52-67`
- **Verification:** confirmed. It's worse than described. The Property select is disabled unless Role is already Property (tables.tsx:77), so mapping a class takes two sequential saves, each restamping ledger lines and refreshing the page. A single 'Maps to' picker removes that.

### FINANCIALS-050

**Group, search and un-nest the 90-account category table**

Medium · Design change · effort M · `/financials/settings (Account categories)` · The QuickBooks mirror is honest about what it covers

- **Today:** Ninety accounts sit in one flat table inside a nested scroll box (4,802px of content in a 560px window), so the page scrolls inside the page. Balance-sheet accounts (A/P, Checking, Visa) are mixed in, locked to 'Excluded'. Every row carries a full-width select, and there's no search.
- **Why:** Finding one account means scrolling a box inside a page past nine accounts that can't change anyway.
- **Change:** Group rows by P&L section (Income, Expenses, Other) with collapsible parent and child accounts. Hide balance-sheet accounts behind 'Show 9 balance sheet accounts'. Add a search field. Show categories as text with tap-to-edit, and let the table grow with the page instead of scrolling inside it.
- **Desktop, tablet, phone:** Desktop: grouped table. Tablet: grouped list with sheet editing. Phone: grouped list; the account type column drops.
- **Reuse:** Table (pass maxHeight='none'); InlineAddressField pattern for tap-to-edit; Input for search.
- **References:** 
  - [Airtable](https://mobbin.com/screens/7612f4c4-4104-4dbc-8e5f-579dde687f2b): Grouped rows with a group header label and count, plus Collapse all and Expand all in the Group by popover.
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): Accounts nest under collapsible parents with an indented child and a Total row, so the long list reads by group.
  - [Quicken](https://mobbin.com/screens/5892043e-7b8b-4ceb-ae9e-07a35f9b150d): Categories as a collapsible tree with a Type column
  - [Midday](https://mobbin.com/screens/85a64f64-2ec8-4543-9f05-ed5b97f64d24): Grouped category tree with edit in a sheet
- **Code:** `src/components/ui.tsx:170-179`, `src/app/(app)/financials/settings/tables.tsx:109-167`
- **Verification:** confirmed. Measured: 90 rows, 4,802 px of content in a 560 px box (Table maxHeight 70vh). One correction: balance-sheet rows are pinned (categoryLocked, set by the seed or a person), not read-only. Their selects are enabled. Since the P&L detail sync brings in no lines for those accounts, editing them has no effect, which strengthens the case for hiding them.

### FINANCIALS-052

**Expose chart values to screen readers**

Medium · Fix · effort S · `/financials (charts)` · One design system, fixed in the primitives

- **Today:** The accessibility tree for the trend exposes only lines like '2026-05 -$317'. Income and expense values appear nowhere, because the bars are spans with inline widths.
- **Why:** Screen-reader users get NOI and nothing else, and that same data is missing for sighted users too (see FINANCIALS-013).
- **Change:** Give the chart role='img' with a one-sentence aria-label summary, plus a visually hidden table of month, income, expense and NOI. Give each MoneyBars row an aria-label with its amount and share.
- **Desktop, tablet, phone:** No visual change.
- **Reuse:** MoneyBars; the new chart component.
- **Code:** `src/app/(app)/financials/page.tsx:133-166`
- **Verification:** confirmed. The accessibility tree for the trend exposes only '2026-05 -$317' and the like. The bars are styled spans.

### FINANCIALS-I01

**Add a Statement tab with the P&L laid out by month**

Medium · New capability · effort L · `/financials (new Statement tab)` · The QuickBooks mirror is honest about what it covers

- **Today:** Financials has no category-by-month table. The 'Monthly income vs expense' card does list each month (2026-05 to 2026-08) with its NOI, so per-month results exist at summary level. What's missing is categories and accounts by month. QuickBooks' own P&L can already show months as columns filtered by class, so the gap that only HG can fill is a statement by property using HG's mapping.
- **Why:** A P&L by month is the document partners and the bookkeeper actually compare. Mercury Books leads its reports with that statement: months as columns, a Total column, collapsible category groups with Total rows, and a small revenue, expense and net chart whose hover highlights the matching column. Without it, HG's mirror says how much but not when, and checking a figure means opening QuickBooks.
- **Change:** Add a Statement tab between Overview and Rent. Rows: Income (Rent, Other income), then Operating expenses by category with each QuickBooks account nested under it and collapsible, then bold total rows for NOI, Debt interest and Cash flow after debt. Columns: one per month in the selected period, with the running month labeled 'Oct MTD', then a sticky Total on the right. A 120px income, expense and net chart sits above the table. Hovering a month tints that column, and the reverse. One Collapse all / Expand all icon button goes in the table header. Figures are right-aligned Geist Mono, with a lone dash for zero.
- **Desktop, tablet, phone:** Desktop 1280: chart over the table, with the Total column sticky and horizontal scroll only inside the table. Tablet 768: same, with a sticky 160px first column and about four months visible. Phone 375: no grid. The tab shows each group's period total as two-line rows, and tapping a group lists its months. The wide statement stays a desktop job.
- **Reuse:** Table, Th and Td from src/components/ui.tsx (sticky header already), TopTabs, fmtCents. New: collapsible group rows and a sticky right column, based on Mercury Books.
- **References:** 
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): P&L with months as columns, Total column, collapsible category groups with Total rows, month chips and a small revenue, expense and net chart above.
  - [Mercury](https://mobbin.com/screens/87c57e5e-9b5d-4354-b7ab-c56410f777d3): Hovering a chart month tints the matching table column and shows a value tooltip.
  - [Mercury](https://mobbin.com/screens/86d1b223-4450-4f3e-ac66-72a05f9a8ea3): The same report collapsed to its total rows with one control.
- **Code:** `src/app/(app)/financials/page.tsx:114-167`, `src/app/(app)/financials/settings/page.tsx:201-211`
- **Verification:** partly. Code claims check out: page.tsx:114-167 has no category-by-month table, and settings/page.tsx:201-211 names P&L by Class as the reconciliation target. 'Says how much but not when' goes too far, though. The trend card already prints NOI for each month (ov--s1--desktop-light.png), and FINANCIALS-013 rebuilds it with income and expense values. QuickBooks can already show its own P&L with months as columns, filtered by class, so a firm-wide statement mostly copies the system of record. The version only HG can build is one scoped to a property (All properties or one), using HG's class-to-property mapping. That version doubles as the D10 hub Financials tab, and it is the reason this deserves an L. Refs: I spot-checked 39aedac6 and it matches (Mercury P&L with months as columns, a Total column, collapsible groups, a chart above and month chips). 86d1b223 is Mercury's Balance Sheet showing total rows only, not 'the same report collapsed'. It is weak support for Collapse all. Severity drops to medium because QuickBooks covers this job today.

### FINANCIALS-I02

**Open the deposits behind each rent cell**

Medium · Design change · effort M · `/financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** Each month cell in the rent grid is plain text (src/app/(app)/financials/rent-roll/page.tsx:72-76). A month that is double or half the usual rent can only be explained by searching QuickBooks, even though every deposit is stored as a ledger line with property, month, payee and date (src/lib/quickbooks/queries.ts:279, prisma/schema.prisma:578-613). Locally the grid renders empty.
- **Why:** Mercury Books makes every report figure a doorway. A click opens a Report drilldown with the title, date range and total, Line entries and Transactions tabs with counts, removable filter chips, and up and down arrows to step to the next figure. A mirror is trusted when you can see what a number is made of.
- **Change:** Make each rent cell a button that opens a right sheet titled '118 Congress · Oct 2026'. It shows the total, then one row per deposit: date, payer, memo, amount, and a Voucher or Owner-funded tag where it applies. Arrow keys step to the next property (up and down) or month (left and right), and Esc closes. The sheet ends with 'Open in QuickBooks'.
- **Desktop, tablet, phone:** Desktop: 420px right sheet over the grid, which keeps its scroll position. Tablet: same sheet at 380px, opened by tap. Phone: the grid is the month stepper list (FINANCIALS-030). Tapping a property's amount opens a bottom sheet with the same rows. Arrow-key stepping drops.
- **Reuse:** Table rows, Badge for the tags, fmtCents. Sheet built on React Aria (approved); docs/components.md lists no sheet yet.
- **References:** 
  - [Mercury](https://mobbin.com/screens/00c8f4dd-af66-45f9-9748-10bc2ad290fc): Report drilldown: figure title, date range and total, line tabs with counts, filter chips, and up and down stepping.
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:72-76`, `src/lib/quickbooks/queries.ts:279`
- **Verification:** confirmed. rent-roll/page.tsx:72-76 renders plain text cells, as claimed. Locally the grid is empty (rent--desktop-light.png shows just 'Property | Total' and 'Portfolio $0') because the local connection is the QuickBooks sandbox with no RENT-category lines, so this was checked from code only. LedgerLine stores txnDate, name, memo and lineTags (SUBSIDY, OWNER_FUNDED), so the sheet is buildable. One detail is off: owner-funded lines are left out of the cell sum (queries.ts:301-303), so they belong in a note, not as rows that add up to the cell. Build this, FINANCIALS-I11 and FINANCIALS-014 as one sheet component with one width. I02 says 420px and I11 says 400px. docs/components.md lists no sheet yet. Reference 00c8f4dd not spot-checked, but the Mercury Books drilldown pattern is real.

### FINANCIALS-I03

**Let the expense list switch between Category, Account and Payee**

Medium · Design change · effort M · `/financials (Overview, expense card)` · The QuickBooks mirror is honest about what it covers

- **Today:** The expense card lists categories only. Locally 'Other operating' is $4,897 of $6,984, but that's the QuickBooks sandbox company (landscaping sample accounts such as Job Expenses mapped to Other operating), not HG's books. Each ledger line stores accountName and the payee name. vendorQboId exists in the schema but is always null (sync.ts:284).
- **Why:** When the biggest bar is 'Other', the card can't answer where the money went. Mercury Insights puts a segmented control (Recipient | Category | GL Code) on its Money out card over one ranked list with % of total and a closing 'Remaining recipients' row. Mercury Books' home also breaks expenses down 'By ledger account' with each account's share.
- **Change:** Add a Category | Account | Payee segmented control to the card header. Each view is the same ranked list: name, share of total, slim bar and amount, largest first. Show the top 8, then one 'Everything else' row. Remember the last choice per viewer.
- **Desktop, tablet, phone:** Desktop and tablet: control at the right of the card header. Phone: control spans the card under the title, and rows show name and amount on one line with the share as a smaller second line.
- **Reuse:** Segmented control from src/app/(app)/deals/filters.tsx, extracted to components/ as SegmentedControl per docs/components.md. MoneyBars extended with a share column.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa): Money in and Money out cards with a Source / Recipient | Category | GL Code switch, % of total, a bar, the amount and a Remaining row.
  - [Mercury](https://mobbin.com/screens/8b7983c7-5c51-4e71-93ae-e0f952277fd7): The Books home Expenses column lists 'By ledger account' with amount and share under the headline figure.
- **Code:** `src/app/(app)/financials/page.tsx:114-127`, `prisma/schema.prisma:592`
- **Verification:** partly. The figure 'Other operating $4,897 of $6,984' is real on screen (ov--desktop-light.png). But the local books are the Intuit sandbox sample company (Settings shows Environment 'sandbox' and accounts like 'Job Expenses:Job Materials:Decks and Patios', 'Design income' and 'Landscaping Services'). The 70% 'Other' bucket comes from mapping sample accounts, not from HG's books, so it can't justify high. LedgerLine.vendorQboId is hard-coded null (sync.ts:284), so a Payee view has to group on LedgerLine.name or wait for FINANCIALS-V02. This overlaps FINANCIALS-014 (open a category into its transactions and filter by vendor) and FINANCIALS-056 (share of total). The new piece is the Category | Account | Payee switch. The c50126f3 reference checks out: Mercury Money in and Money out with a Source/Recipient | Category | GL Code control, % of total, a bar, the amount and a Remaining row.

### FINANCIALS-I04

**Link QuickBooks vendors to contractors so payee rows open the contractor**

Medium · New capability · effort M · `/financials (Payee view) and /contractors/[id]` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. src/lib/quickbooks/sync.ts is identical to main. Vendors are matched to a Contact only when first created (sync.ts:193-201), ledger lines are written with vendorQboId: null (sync.ts:284), and no screen reads QboVendor.contactId. The branch's contractor record shows Contact, Portal access and Jobs, with nothing paid.
- **Today:** QboVendor.contactId is set by the sync, which auto-matches each new QuickBooks vendor to a Contact by normalized name (sync.ts:176-203). Existing vendors are never re-matched, and no screen reads the link. LedgerLine.vendorQboId exists but is written as null on every line (sync.ts:284), so ledger lines can't be tied to vendors or contractors without matching the free-text payee name.
- **Why:** Mercury's Money out view ranks real counterparties by share of spend. For HG, 'what did we pay this plumber this year' belongs with the contractor directory, which is about to get portal logins. The library's Gusto principle applies: enter data once.
- **Change:** On each sync, auto-match vendors to contractors by name, marked 'auto' like class auto-matches. A partner confirms or changes a match from the Payee row's menu ('Link to contractor'). Linked payee rows open the contractor, and the contractor record shows 'Paid $X this year' with the QuickBooks freshness line.
- **Desktop, tablet, phone:** Desktop and tablet: the row's overflow menu holds Link to contractor. Phone: tapping the payee row opens a sheet with the same action. The contractor's paid figure shows at every size.
- **Reuse:** The autoMatched marker pattern from src/app/(app)/financials/settings/tables.tsx:59 and contractor pages under src/app/(app)/contractors. The Payee view comes from FINANCIALS-I03.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa): Money out by Recipient: named counterparties ranked by share, each a real entity rather than a ledger code.
- **Code:** `prisma/schema.prisma:557-573`, `prisma/schema.prisma:613`, `src/lib/quickbooks/sync.ts:177-203`, `branch src/lib/quickbooks/sync.ts:176-203,284 (diff vs main: identical)`, `branch prisma/schema.prisma:910-926,966`
- **Verification:** partly. The core claim is wrong. sync.ts:176-203 ('vendors: matched to Contact best-effort, stored, not surfaced in v1') already auto-matches QuickBooks vendors to Contacts by normalized fullName or company and stores contactId. It only does this when a vendor is first created, and nothing reads the link. Also, LedgerLine.vendorQboId is always null (sync.ts:284) even though report-parse.ts:152-163 has the Name cell's id on hand, so lines can't be joined to vendors today (see FINANCIALS-V02). The capability is still worth having. 'Paid this year' on a contractor record helps at 1099 time and as the portal launches. Medium is fine. The Mercury Money out reference shows ranked recipients but no link to a directory record, so it only loosely backs the linking. The recommendation should say: re-run the existing matcher on every sync and surface it, not build a new one.

### FINANCIALS-I11

**Open any QuickBooks line in a side sheet that shows where it came from**

Medium · Design change · effort M · `/properties/[id] Financials card and Financials drilldowns` · The QuickBooks mirror is honest about what it covers

- **Today:** Transaction rows on the property card are static. Names truncate and are explained only by a title tooltip, which is hover-only and does nothing on touch (src/app/(app)/properties/[id]/financials.tsx:85-87). Each line's account, class, type, document number and memo are stored (prisma/schema.prisma:587-601) but never shown.
- **Why:** Mercury opens any transaction in a right drawer with the amount, a short trail from account to merchant, the GL code it syncs to, notes and attachments, and the list keeps its place. For HG the useful part is provenance: which QuickBooks account and class put this line on this property.
- **Change:** Rows open a right sheet showing the signed amount, payee and date, then a short facts list: QuickBooks account, class, Mapped to (property or overhead), type and number, and memo. One 'Open in QuickBooks' link sits at the bottom. Arrow keys step through the list, and Esc closes. The rent drilldown (FINANCIALS-I02) and category drilldown (FINANCIALS-014) reuse the same sheet.
- **Desktop, tablet, phone:** Desktop and tablet: 400px right sheet. Phone: full-height bottom sheet with the QuickBooks link pinned at the bottom.
- **Reuse:** Sheet built on React Aria (approved). The facts list follows the property Details card's label-over-value style.
- **References:** 
  - [Mercury](https://mobbin.com/screens/b71279bb-6f4a-4ec2-83b7-9b73d5530ca4): Transaction drawer: amount, a trail from card to merchant, Xero GL code, notes, attachments and comments, with the list still visible.
  - [Mercury](https://mobbin.com/screens/00c8f4dd-af66-45f9-9748-10bc2ad290fc): Drilldown rows with a chevron into each line and up and down stepping.
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:85-87`, `prisma/schema.prisma:587-601`
- **Verification:** confirmed. financials.tsx:85-87 truncates names with a title tooltip only, and account, class, txnType, docNumber and memo are stored but never shown. A stronger reference is Mercury Books' transaction drawer, https://mobbin.com/screens/b6a338a6-37e9-42c2-9363-e402adb5b103: Account, Type, Date, Memo, and line items by ledger account, next to the ledger table. That is exactly the provenance view HG needs. 'Open in QuickBooks' should appear only when qboTxnId is a real Intuit id. sync.ts:266 synthesizes ids when the report lacks one. Share the component with FINANCIALS-I02 and FINANCIALS-014.

### FINANCIALS-I15

**Chart the property's months, which the query already returns**

Medium · Design change · effort S · `/properties/[id] Financials card (future hub Financials tab)` · The QuickBooks mirror is honest about what it covers

- **Today:** getPropertyFinancials builds a month-by-month income and expense series (src/lib/quickbooks/queries.ts:233-242), but the card never renders it: src/app/(app)/properties/[id]/financials.tsx never reads data.monthly. The card shows three totals, category bars and recent transactions only.
- **Why:** Copilot's category panel pairs one big figure with 12 monthly bars, and Mercury's phone Money movement screen shows recent months as bars with the selected one highlighted. A property's trend is the first thing a partner looks for on its Financials tab.
- **Change:** Add a 12-month chart under the three totals, built from the Overview chart (FINANCIALS-013): income up, expense down and an NOI line. Hovering or tapping a month shows its values and filters the transaction list below to that month.
- **Desktop, tablet, phone:** Desktop and tablet: full-width chart, 140px tall. Phone: the last six months with a month stepper.
- **Reuse:** The Overview chart from FINANCIALS-013 once it's built, fed by the existing monthly series.
- **References:** 
  - [Copilot](https://mobbin.com/screens/e4104151-c47b-47fb-9971-327ce2ad89c4): The category detail pairs one figure with a 12-month bar history above that month's transactions.
  - [Mercury](https://mobbin.com/screens/63de2630-792b-452a-b078-251e73d18932): Phone month bars with the selected month highlighted, its total and the payee list below.
- **Code:** `src/lib/quickbooks/queries.ts:233-242`, `src/app/(app)/properties/[id]/financials.tsx:45-101`
- **Verification:** confirmed. queries.ts:233-242 builds the monthly series, and financials.tsx never reads data.monthly. That's wasted work today. Code-only: 118 Congress's card shows $0 with no lines (p118--desktop-light.png). Effort S holds only after FINANCIALS-013's chart is built. Put it on the D10 hub Financials tab rather than the current card, which sits first on every property page. It fits with FINANCIALS-042 (sparkline per Overview row). References are reasonable.

### FINANCIALS-V03

**Keep empty months on the month axis instead of dropping them**

Medium · Fix · effort S · `/financials (Monthly trend), /financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** The trend rows and rent-grid columns come only from months that have lines (queries.ts:121-136 and 292-318). History starts 2026-01, yet the cash trend begins at 2026-05 and the accrual trend at 2026-04, with nothing to show January to April are empty. A month in which no property received rent would drop out of the rent grid entirely.
- **Why:** On these pages the gap is the signal. Dropping empty months hides a missed month and shifts every column beside it.
- **Change:** Build the axis with monthRange(from, to) from src/lib/quickbooks/months.ts, from the period start to the last synced month. Show empty months as a zero bar in the trend and a blank cell in the grid.
- **Desktop, tablet, phone:** Same at every size. On phone the month stepper from FINANCIALS-030 steps through empty months too.
- **Reuse:** monthRange in src/lib/quickbooks/months.ts; getFinancialsOverview and getRentRoll.
- **References:** 
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): The P&L keeps every month column (Jan to Sep MTD) even where a row is 0.00, and the chart above keeps empty months on the axis.
  - [Turo](https://mobbin.com/screens/da7b1b2b-c1fd-4b93-901a-c1e2d7999e83): The earnings chart keeps a full Jan to Dec axis with the empty months shown
  - [Airbnb](https://mobbin.com/screens/02184364-327d-4c8b-b5c8-7424686b207a): The month axis runs Dec to Nov even when every month is $0
  - [Mercury](https://mobbin.com/screens/f41ddda3-30cd-4bed-8730-9ab936b86a4c): Columns "Jan 2026" to "Sep MTD": every month present (0.00 when empty) and the running month marked.
- **Code:** `src/lib/quickbooks/queries.ts:121-136`, `src/lib/quickbooks/queries.ts:292-318`, `src/lib/quickbooks/queries.ts:120-136`, `src/app/(app)/financials/page.tsx:141`, `src/app/(app)/financials/rent-roll/page.tsx:41-45`
- **Also found as:** G2A-V05 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** verifier-found

### FINANCIALS-039

**Open the property hub's Financials tab from the whole row**

Low · Design change · effort S · `/financials (By property table)` · The QuickBooks mirror is honest about what it covers

- **Today:** Only the address links, and the row has a hover color without being clickable. The link opens /properties/[id], where the Financials card is already the first card.
- **Why:** A hover cue on something you can't click is misleading, and the link lands far from the property's numbers.
- **Change:** Make the whole row a link to the property hub's Financials tab (D10), carrying the period and basis.
- **Desktop, tablet, phone:** Desktop: row hover. Tablet and phone: the whole row is the tap target, with no hover cue.
- **Reuse:** The D10 property hub tabs.
- **References:** 
  - [Monarch](https://mobbin.com/screens/3aa499af-7109-44c3-be79-97076779ce09): Whole account rows open their detail
  - [Copilot](https://mobbin.com/screens/4377be87-da0d-4077-93b0-55bb51d99ab9): Selecting a row opens its detail panel
- **Code:** `src/app/(app)/financials/page.tsx:186-199`
- **Verification:** partly. The whole-row target is a fair polish item: rows hover but only the address links (page.tsx:187-191). The claim that the link 'lands far from the property's numbers' is wrong. PropertyFinancialsCard is the first card on /properties/[id] (page.tsx:96); I saw it at the top for 118 Congress St.

### FINANCIALS-042

**Add a 12-month NOI sparkline to each property row**

Low · New capability · effort M · `/financials (By property)` · The QuickBooks mirror is honest about what it covers

- **Today:** There's no per-property trend anywhere. A property whose NOI has fallen three months running looks the same as a steady one.
- **Why:** Spotting a problem property is a core job, and a single total hides direction.
- **Change:** Add a small neutral NOI sparkline column covering 12 months, with a red dot only on months where NOI went negative.
- **Desktop, tablet, phone:** Desktop and tablet: a column after NOI. Phone: the sparkline drops.
- **Reuse:** The new money-chart component (FINANCIALS-013) in a mini variant.
- **References:** 
  - [Causal](https://mobbin.com/screens/44698b18-2a22-4b60-8590-113f24940b97): A sparkline beside each row's name
  - [Monarch](https://mobbin.com/screens/3aa499af-7109-44c3-be79-97076779ce09): A muted sparkline before the amount in account rows
- **Code:** `src/app/(app)/financials/page.tsx:170-225`
- **Verification:** partly. No per-property trend exists (true). A sparkline column adds a mark to every row, which runs against the simplicity bar. With 11 properties and the Change data from FINANCIALS-001, it's a nice-to-have. Lowered to low.

### FINANCIALS-043

**Show up to three plain-language notes on what changed**

Low · New capability · effort M · `/financials (Overview)` · The QuickBooks mirror is honest about what it covers

- **Today:** Nothing on the page points at what changed or what's unusual.
- **Why:** Mercury turns the same ledger data into one-line notes that save the reader from scanning every row.
- **Change:** Under the strip, show up to three computed lines, such as 'Repairs at 767 Prospect were $2,400 in September, 3x the 3-month average.' Each links to its drill-down. Use a line icon, no sparkle.
- **Desktop, tablet, phone:** Desktop: beside or under the chart. Tablet: under the strip. Phone: two lines at most.
- **Reuse:** Ledger aggregates from queries.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/10e9460a-1e44-4361-afe6-e0e9d857e6d9): 'Higher spend to Uhold... up from the preceding three-month average'
  - [Lloyds Mobile Banking](https://mobbin.com/screens/6627d8e3-daf4-4ea5-9a9d-dd7c5bae3cf0): A one-sentence comparison chip on phone
- **Verification:** partly. Nothing points at what changed (true). Adding a computed-notes block to Financials adds content to a page this review is trying to thin. Anomalies like this belong on Home's 'what needs me' list (D10), linking into Financials. Low.

### FINANCIALS-047

**Warn before the QuickBooks connection expires**

Low · New capability · effort S · `/financials, Home` · The QuickBooks mirror is honest about what it covers

- **Today:** 'Reconnect before Dec 12, 2026' appears only in Settings. The date is 100 days after the last successful token refresh and moves forward with each nightly sync, so it only approaches when syncing has stopped.
- **Why:** If they miss it, sync stops quietly and every figure goes stale.
- **Change:** Starting 14 days before expiry, show a notice line on Financials, 'QuickBooks needs reconnecting by Dec 12. Reconnect', and add the same item to Home's 'what needs me' (D10).
- **Desktop, tablet, phone:** The same single line at every size.
- **Reuse:** The notice line from FINANCIALS-011; the D10 Home list.
- **References:** 
  - [Stripe](https://mobbin.com/screens/63b47007-2529-42d0-8701-6ef4ff10342e): A one-line countdown banner ('30 days left') with its action
- **Code:** `src/app/(app)/financials/settings/page.tsx:92-94`
- **Verification:** partly. refreshTokenExpiresAt is rewritten on every token refresh (client.ts:87; Dec 12 is exactly 100 days after the Sep 2 sync), and the nightly cron refreshes it. So the date only nears expiry after syncing has been failing for about three months, and FINANCIALS-011's stale-sync notice catches that first. Keep the reconnect wording as one variant of that notice, not a separate warning.

### FINANCIALS-053

**Aggregate in SQL and read data quality from the sync instead of loading every line**

Low · Fix · effort M · `/financials, /financials/settings` · The QuickBooks mirror is honest about what it covers

- **Today:** Every Overview load pulls all ledger lines for the basis into memory (loadLines has no date filter), recomputes per property in JavaScript, then runs 11 more aggregate queries for data quality. Settings calls the same getFinancialsOverview only to read dataQuality, even though the sync already stores it in QboSyncRun.stats.
- **Why:** Load time grows with the age of the books. A Stripe-class feel needs instant loads.
- **Change:** Group in SQL by propertyId, periodMonth, treatment and category with the period filter applied. Read data quality from the latest QboSyncRun.stats. Add a loading.tsx skeleton for the KPI strip.
- **Desktop, tablet, phone:** No visual change apart from the skeleton.
- **Reuse:** queries.ts; sync.ts already computes the stats.
- **Code:** `src/lib/quickbooks/queries.ts:16-30`, `src/lib/quickbooks/queries.ts:77-84`, `src/lib/quickbooks/queries.ts:144-147`, `src/lib/quickbooks/data-quality.ts:60-103`, `src/app/(app)/financials/settings/page.tsx:56`
- **Verification:** partly. The code facts are right: no date filter, and 11 parallel data-quality queries. Overview loaded in about 650 ms here, so there's no felt problem yet. Reading data quality from QboSyncRun.stats would also be a regression. data-quality.ts:8-10 recomputes live on purpose, so a mapping edit shows at once; sync stats would stay stale until the next night. Keep the live recompute, and aggregate in SQL once FINANCIALS-001 adds a period filter.

### FINANCIALS-054

**Delete the subtitle 'Read-only from QuickBooks...'**

Low · Fix · effort S · `/financials (header)` · Plain, consistent words

- **Today:** Under the title: 'Read-only from QuickBooks. QuickBooks stays the system of record.' It wraps to two lines at 375.
- **Why:** It restates what the freshness line already says and repeats a word, which the copy rules call filler.
- **Change:** Remove it. The freshness line, 'QuickBooks · synced 2 hours ago', names the source.
- **Desktop, tablet, phone:** Saves two lines on phone.
- **Reuse:** PageHeader without a subtitle.
- **References:** 
  - [Acctual](https://mobbin.com/screens/b1a37afa-7b0f-4335-ba33-2db1278948cd): Accounting section explained in one short line
  - [Melio](https://mobbin.com/screens/15965f92-ba3b-45fd-b304-ffd6d43902ed): Sync relationship stated once, in one sentence
- **Code:** `src/app/(app)/financials/layout.tsx:10-12`, `src/app/(app)/financials/layout.tsx:11`
- **Also found as:** IA-044 (Lens: information architecture and global SaaS patterns), COPY-025 (Lens: words on every screen)
- **Verification:** confirmed. Wraps to two lines at 375 (seen).

### FINANCIALS-059

**Stop flagging normal cash vs accrual differences as problems**

Low · Fix · effort S · `/financials/settings (cleanup list)` · The QuickBooks mirror is honest about what it covers

- **Today:** 'Cash vs accrual net income -$3,547' turns amber (flagged) whenever the difference is over $100.
- **Why:** Cash and accrual always differ by timing, so the warning color here is a false alarm.
- **Change:** Treat it as informational and move it to 'About these numbers' with no warning color.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** DqRow.
- **Code:** `src/app/(app)/financials/settings/page.tsx:148-152`
- **Verification:** confirmed. Seen: 'Cash vs accrual net income -$3,547' in amber (threshold $100 at settings/page.tsx:151).

### FINANCIALS-061

**Use one marker for 'set by you' in both mapping tables**

Low · Design change · effort S · `/financials/settings (mapping tables)` · One design system, fixed in the primitives

- **Today:** The class table marks automatic matches with an 'auto' badge. The account table marks manual picks with a 🔒 whose only explanation is the title 'pinned'. The two tables use opposite conventions.
- **Why:** Two markers with opposite meanings make you guess which rows are safe to leave alone.
- **Change:** Mark only what the user set, with muted 'Set by you' text in both tables, and nothing for automatic matches.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** Badge gray or muted text.
- **References:** 
  - [Mercury](https://mobbin.com/screens/bad0bbdd-bcae-4932-82fa-d42d249dd488): Each row carries one small icon showing whether it was set automatically, by a rule or by a person, explained once ('Always transparent') and filterable by Categorization method.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:54-63`, `src/app/(app)/financials/settings/tables.tsx:138-143`
- **Verification:** confirmed. Minor correction: 🔒 marks categoryLocked, which is set by a person or pinned by the seed (schema.prisma:548). It isn't only manual picks; A/P, Checking and Visa carry it without anyone choosing them. That makes one 'Set by you' marker more useful, since today the lock means two different things.

### FINANCIALS-062

**Put names in sans and table figures in Geist Mono**

Low · Design change · effort S · `/financials (all), /financials/settings` · Money, numbers and dates read one way

- **Today:** Class and account names render in Geist Mono (font-mono text-xs), while every money figure renders in Geist sans with tabular numerals.
- **Why:** It's the reverse of the house rule: mono names read as code.
- **Change:** Names in Geist sans at 14px. Figures in Geist Mono in dense tables, per the house rule. Keep hero KPI numbers in Geist sans with tabular numerals, as Stripe and Mercury do.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** The font tokens in src/app/globals.css.
- **Challenges:** House rule 'Geist Mono for figures': this keeps hero KPI numbers in Geist sans with tabular numerals, as Stripe and Mercury do, and uses Mono only for table figures.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Hero metrics in the sans face
  - [Mercury](https://mobbin.com/screens/db1f0dad-fe1c-4a3d-992a-1900c331e113): Large sans headline figures
- **Code:** `src/app/(app)/financials/settings/tables.tsx:53`, `src/app/(app)/financials/settings/tables.tsx:138`, `src/app/(app)/financials/_components/ui.tsx:31-38`
- **Verification:** confirmed. Class and account names are font-mono text-xs (tables.tsx:53, 138), and figures are Geist sans with tabular-nums. conflicts_with correctly names the 'Geist Mono for figures' house rule for the hero-KPI exception.

### FINANCIALS-063

**Center row text against the selects**

Low · Fix · effort S · `/financials/settings (mapping tables)` · One design system, fixed in the primitives

- **Today:** Td is align-top, so account names and type text sit about 10px above the text inside the 36px selects on the same row.
- **Why:** The house rule says things that should line up, line up exactly.
- **Change:** Add an align prop to Td and use middle alignment on rows that contain controls.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** Td in src/components/ui.tsx.
- **Code:** `src/components/ui.tsx:192-194`
- **Verification:** confirmed. Seen at 1280: class names sit about 7 px above the centered select text. Td is align-top (ui.tsx:193).

### FINANCIALS-064

**Remove the reconciliation footnote from Settings**

Low · Fix · effort S · `/financials/settings (footer)` · Plain, consistent words

- **Today:** The page ends with 'Reconciliation target: our numbers tie to QuickBooks' own Profit & Loss by Class report. Independent check: per-property rent vs the old rent spreadsheet.' plus a generic link to qbo.intuit.com.
- **Why:** It's an internal process note.
- **Change:** Delete it and keep the note in docs.
- **Desktop, tablet, phone:** n/a
- **Reuse:** n/a
- **Code:** `src/app/(app)/financials/settings/page.tsx:201-211`
- **Verification:** confirmed. Footnote confirmed at settings/page.tsx:201-211. The link goes to the generic qbo.intuit.com, not the report it names.

### FINANCIALS-068

**Add CSV export for P&L by property and rent history**

Low · New capability · effort S · `/financials, /financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** Neither view can be exported. Lenders and the accountant regularly ask for rent rolls and property P&Ls.
- **Why:** Without export, the partners rebuild these in a spreadsheet by hand.
- **Change:** Add 'Export CSV' to each tab's overflow menu, respecting the current period and basis.
- **Desktop, tablet, phone:** Desktop and tablet: overflow menu. Phone: the same menu; sharing the file is optional.
- **Reuse:** The React Aria menu (D9).
- **References:** 
  - [Stripe](https://mobbin.com/screens/a45686d8-0bea-4626-b70b-d432517dce71): Report downloads: each report is named with a one-line description and its own Download button below the charts.
  - [Stripe](https://mobbin.com/screens/8f736fe0-96d7-4c56-a2d5-a9156acc3c1e): The export dialog lists date ranges with their resolved dates ('Last month 1 Nov to 30 Nov') and a Columns choice.
  - [Turo](https://mobbin.com/screens/df24d3eb-0f6b-4a9c-9f62-3b785c1b9b7e): 'Download CSV' next to the period selector
  - [YNAB](https://mobbin.com/screens/62817fae-ab1b-43cf-a15d-3d372afd32ca): Export at the top right of the report
- **Code:** `src/app/(app)/financials/page.tsx`, `src/app/(app)/financials/rent-roll/page.tsx`
- **Verification:** confirmed. The Turo earnings page in my search (https://mobbin.com/screens/da7b1b2b-c1fd-4b93-901a-c1e2d7999e83) shows 'Download CSV' beside the period selector, the same pattern as the cited Turo screen.

### FINANCIALS-069

**Compute the current month in Buffalo time, not UTC**

Low · Fix · effort S · `/financials, /financials/rent-roll` · The QuickBooks mirror is honest about what it covers

- **Today:** currentMonth() uses getUTCFullYear and getUTCMonth. In Buffalo, UTC rolls into the next month at 8 pm on the last day (7 pm in winter), so the month count and the running-month handling flip hours early.
- **Why:** For a few hours each month the labels and averages are a month off.
- **Change:** Compute the month in America/New_York.
- **Desktop, tablet, phone:** n/a
- **Reuse:** src/lib/dates.ts.
- **Code:** `src/lib/quickbooks/months.ts:21-23`, `src/lib/quickbooks/queries.ts:86`
- **Verification:** confirmed. months.ts:21-23 uses getUTC*. The month flips at 8 pm EDT or 7 pm EST on the last day.

### FINANCIALS-I07

**Group By property rows under each LLC with a subtotal**

Low · Design change · effort M · `/financials (By property)` · The QuickBooks mirror is honest about what it covers

- **Today:** By property is one flat list sorted by NOI (queries.ts:86-116). Locally it shows only the Unattributed and Portfolio rows. Five LLCs are seeded, and one of them, BMK Property Group LLC, is a 50/50 joint venture (entities.ts:47-54). Nothing in the repo shows the LLCs file separately.
- **Why:** Partners and the accountant read results per LLC. Airtable groups rows under a header with a count and a per-group summary, and offers Collapse all and Expand all. Mercury Books nests accounts under collapsible parents with a Total row. Grouping also gives each LLC's overhead a home instead of one catch-all row.
- **Change:** Group the rows by entity. Each group header shows the LLC name, its property count, and its income, opex and NOI in the same columns. The entity's own overhead is the group's last row, named 'Company overhead' per FINANCIALS-041. Groups open by default with a chevron to collapse, and Portfolio stays as the footer. Skip the grouping when only one entity has activity in the period.
- **Desktop, tablet, phone:** Desktop and tablet: group headers are bold rows inside the table. Phone: list rows (FINANCIALS-040) under sticky LLC section headers, with the group NOI right-aligned.
- **Reuse:** Table, Th and Td from src/components/ui.tsx. The group row is new, based on Airtable.
- **References:** 
  - [Airtable](https://mobbin.com/screens/06e3f847-905c-49c7-87de-a8a9d1f4d2b5): Rows grouped under labeled headers with a count and a per-group summary.
  - [Airtable](https://mobbin.com/screens/7612f4c4-4104-4dbc-8e5f-579dde687f2b): Group by popover with Collapse all and Expand all.
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): Collapsible parent rows with a Total row per group.
- **Code:** `src/app/(app)/financials/page.tsx:185-224`, `prisma/schema.prisma:609`
- **Verification:** partly. Five LLCs are seeded (entities.ts:18-55), every line carries entityId from its class, and the Settings Entity select lists them. 'Each files its own taxes' has nothing in the repo behind it. HG Buffalo Holding 1 and 2 may well roll up to HG Capital Partners. The strongest reason to show entity is one the finding misses. BMK Property Group LLC is flagged isJointVenture (58 Mariner, 50% with partner BK), and nothing reads that flag. FINANCIALS-V01 handles it more directly. For an 11-row table, group headers with subtotals add four or five chrome rows on every visit. Grouping fits better as an option, or a muted LLC sublabel, than as the default. Locally By property has no property rows at all (FINANCIALS-V02 in the kept list). Airtable references are fine for the anatomy.

### FINANCIALS-I09

**Mark which months the books are closed for, so figures read as final or still moving**

Low · New capability · effort M · `/financials (month headers on Overview, Statement, Rent)` · The QuickBooks mirror is honest about what it covers

- **Today:** Every month is shown the same way. The only signals are the '(5 mo)' label and an amber banner when a sync didn't reconcile (src/app/(app)/financials/page.tsx:66-74). The sync never reads QuickBooks' book close date (no Preferences query in src/lib/quickbooks/sync.ts). A partner can't tell whether August is final or the bookkeeper is still posting to it.
- **Why:** Mercury Books keeps a Close date in its Books Details ('Not yet closed', with Edit), and its reports label the running month 'Sep MTD'. In a mirror whose numbers shift as the bookkeeper catches up, closed versus open is the trust signal.
- **Change:** Read the book close date from QuickBooks company preferences on every sync. Month headers through the close date show plainly. Later months get a muted 'Open' suffix, and the running month stays 'Oct MTD'. The freshness line adds 'Books closed through Aug'.
- **Desktop, tablet, phone:** Same header suffix at every size. On phone the month stepper shows 'Open' under the month name.
- **Reuse:** The SourceBadge freshness line and the month formatter in src/lib/quickbooks/months.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/5dca96bc-dcc4-4567-afeb-ad744b7e9f8f): Books Details lists Close date ('Not yet closed') beside Start date and Accounting basis.
  - [Mercury](https://mobbin.com/screens/269ac107-c09e-4c57-a263-2a82ff06c4cd): Report columns end with 'Sep MTD', so the running month reads as unfinished.
- **Code:** `src/app/(app)/financials/page.tsx:66-74`, `src/lib/quickbooks/sync.ts:177`
- **Verification:** partly. Accurate: no Preferences or BookCloseDate read in src/lib/quickbooks, and the only signals are '(5 mo)' and the PARTIAL banner. QuickBooks does expose Preferences.AccountingInfoPrefs.BookCloseDate. The 5dca96bc reference matches (Mercury Books Details: Close date, 'Not yet closed', Edit). The value depends on HG's bookkeeper actually setting a close date in QuickBooks. If they don't, the line reads 'Not yet closed' forever and every month gets 'Open', which is noise. 'Oct MTD' is already FINANCIALS-024, and the freshness line is FINANCIALS-033. The real trust problem in this data is a sync 51 days stale (FINANCIALS-011). Low, and only worth doing after confirming the bookkeeper closes months.

### FINANCIALS-I12

**Show cents on single transactions and whole dollars on totals**

Low · Design change · effort S · `Financials line-level lists (property recent transactions, drilldowns)` · Money, numbers and dates read one way

- **Today:** fmtMoney always rounds to whole dollars (src/lib/utils.ts:12-17). Line-level amounts on the property card print as '$1,350' even when QuickBooks holds $1,349.62 (src/app/(app)/properties/[id]/financials.tsx:88). Totals and single lines share one format.
- **Why:** Vercel's guidelines and Mercury both use 0 decimals for totals and 2 for individual transactions, and Mercury sets the cents smaller and raised. Matching a line to a bank statement needs the cents. A headline doesn't.
- **Change:** Give fmtCents a cents option for line-level rows (recent transactions, rent drilldowns, the line sheet) and render the cents at about 75% size, raised. Keep whole dollars for headline figures, charts and tables of totals, and never mix the two in one column.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** An option on fmtCents and fmtMoney. No new component.
- **References:** 
  - [Mercury](https://mobbin.com/screens/3e5ccd40-7dbf-4fb4-a26d-915180a2cd64): Transaction amounts show raised, smaller cents.
  - [Mercury](https://mobbin.com/screens/b71279bb-6f4a-4ec2-83b7-9b73d5530ca4): The drawer's headline amount keeps cents for a single transaction.
  - [Mercury](https://mobbin.com/screens/f77b24a7-e68e-4fc1-b5ac-91856a92f12b): Cents are set smaller and raised ('−$6.41'), so two-decimal lines stay readable beside whole-dollar totals.
  - [Mercury](https://mobbin.com/screens/d14e9441-a25f-4730-97a3-d7e7ed531af4): Transaction amounts keep cents (smaller superscript)
- **Code:** `src/lib/utils.ts:12-17`, `src/app/(app)/properties/[id]/financials.tsx:88`, `src/app/(app)/financials/_components/ui.tsx:5-7`
- **Also found as:** DATA-059 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. fmtMoney uses maximumFractionDigits 0 (utils.ts:12-17), so line amounts lose their cents. Today the only line-level list is the property card's recent transactions, which is empty locally. The raised, 75%-size cents are Mercury Banking's decoration. Mercury Books' own ledger and drawer (b6a338a6, 351a9ec6) print plain two-decimal figures, which fits the calm, low-chrome bar better. Recommend plain cents in Geist Mono on line rows and in the line sheet, whole dollars on totals, and no superscript.

### FINANCIALS-I14

**Turn a wrong-looking number into a task for whoever keeps the books**

Low · New capability · effort M · `Financials line sheet and cleanup line` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. Unchanged. The cleanup list still says 'assign a class in QuickBooks' (settings/page.tsx:110-115), and the PARTIAL banner still says 'See Settings for the details' (financials/page.tsx:70-77). Nothing records that someone asked the bookkeeper.
- **Today:** When a figure looks wrong, the app can only point elsewhere. The cleanup list says 'assign a class in QuickBooks' (src/app/(app)/financials/settings/page.tsx:108-113), and the banner says 'See Settings for the details' (src/app/(app)/financials/page.tsx:66-74). Nothing records that someone noticed a problem or asked the bookkeeper about it.
- **Why:** Flighty ends each flight page with a quiet 'Report Data Issue' link, so a bad number becomes a report instead of a shrug. HG already has tasks replacing Asana, and the house rules ask the app to close the loop.
- **Change:** Add a quiet 'Ask bookkeeper' text button to the line sheet (FINANCIALS-I11) and to the cleanup line. It creates a task linked to the property and assigned to the bookkeeper, chosen once in QuickBooks settings. The task carries the line's date, payee and amount, plus a note field. The line then shows 'Asked Oct 23' until the task is done.
- **Desktop, tablet, phone:** Same button at every size. On phone it sits just above the pinned 'Open in QuickBooks' link.
- **Reuse:** Task creation from src/app/(app)/tasks, and Badge for the Asked state.
- **References:** 
  - [Flighty](https://mobbin.com/screens/caeafddd-565d-4209-9497-03c8bd51195c): A quiet 'Report Data Issue' link at the end of the record, below Updates and Notes.
- **Code:** `src/app/(app)/financials/settings/page.tsx:108-113`, `src/app/(app)/financials/page.tsx:66-74`, `branch src/app/(app)/financials/settings/page.tsx:110-115`, `branch src/app/(app)/financials/page.tsx:70-77`, `branch src/lib/tasks/assignee-options.ts:17-24`
- **Verification:** partly. The copy claims are accurate (settings/page.tsx:112 'assign a class in QuickBooks', and the banner at page.tsx:66-74). The routing is the weak part. Task assignees are a User or free text (schema Task.assigneeUserId, assigneeName, assigneeEmail), and nothing in the repo identifies a bookkeeper user. A task 'assigned to the bookkeeper' would sit in HG's own list unless it also emails them. It also adds a setting (the bookkeeper picker) and depends on FINANCIALS-I11. Flighty's 'Report Data Issue' is a loose analog: it reports to the vendor, not to a person on your team. Worth doing once the line sheet exists, as a plain 'New task' prefilled with the line. Low.

### FINANCIALS-I16

**Assign properties to unclassified lines in HG and write the class back to QuickBooks**

Low · New capability · effort XL · `/financials cleanup (unclassified lines)` · The QuickBooks mirror is honest about what it covers

- **Today:** Overview flags 'Unclassified in QuickBooks $12,065 · 87 lines', and Settings says 'assign a class in QuickBooks' (src/app/(app)/financials/settings/page.tsx:108-113). Fixing them means leaving HG, finding each line in QuickBooks and setting its class there, 87 times over.
- **Why:** Copilot lets you select many rows and set a category from a floating '4 selected · Category' bar. Ramp prefills categories from history so most items confirm with one tap. HG knows each line's payee and how that payee was classed before, so it can suggest the property.
- **Change:** In the unclassified list (FINANCIALS-021), suggest a property for each line from the payee's past classes, for example '118 Congress · 9 of 10 times'. After selecting rows, a floating bar reads '12 selected · Assign property'. Confirming asks 'Set class on 12 QuickBooks lines?', then HG writes the class through the QuickBooks API and re-syncs those lines.
- **Desktop, tablet, phone:** Desktop: table with checkboxes and the floating bar. Tablet: same, with 44px rows. Phone: one line at a time with Accept suggestion or Choose property. Bulk edits stay on desktop.
- **Reuse:** The Settings mapping picker and ConfirmDialog. The floating selection bar is new, based on Copilot.
- **Challenges:** Financials is read-only from QuickBooks (src/app/(app)/financials/layout.tsx:10-12, 'Read-only from QuickBooks. QuickBooks stays the system of record.'). Writing only the class keeps QuickBooks the system of record, and the OAuth scope com.intuit.quickbooks.accounting already allows it, but ending read-only is Connor's call.
- **References:** 
  - [Copilot](https://mobbin.com/screens/7ecdbf50-e381-40ac-a33c-0edcec8d4c54): Multi-select with a floating 'N selected · Category · Type · Tag' bar and a searchable category menu.
  - [Mercury](https://mobbin.com/screens/bad0bbdd-bcae-4932-82fa-d42d249dd488): Each row marks whether its categorization was automatic, from a rule or from a person, so suggested assignments stay visible.
- **Code:** `src/app/(app)/financials/settings/page.tsx:108-113`, `src/lib/quickbooks/config.ts:49`
- **Verification:** partly. The facts check out: '$12,065 · 87 lines' with 'assign a class in QuickBooks' (settings/page.tsx:108-113), and the scope at config.ts:49 is com.intuit.quickbooks.accounting, which allows writes. conflicts_with correctly names the read-only stance (layout.tsx:10-12). Severity and scope are off, though. Setting a class means a sparse update of the whole transaction (Purchase, Deposit, JournalEntry lines). That can collide with the bookkeeper's edits and closed periods, and it is XL work for the sandbox-scale problem seen locally. The cheap, valuable part is the payee-history suggestion ('118 Congress · 9 of 10 times') inside FINANCIALS-021's unclassified list, handed to the bookkeeper. Write-back should wait until that list proves the volume. The bulk-select bar pattern is real: Mercury Books shows a '1 selected' bar (351a9ec6).

### FINANCIALS-IV02

**Fill vendorQboId on ledger lines and re-run the vendor match on every sync**

Low · Fix · effort S · `QuickBooks sync (feeds the Payee view and contractor 'Paid this year')` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. sync.ts and report-parse.ts are byte-identical to main. Every LedgerLine is still written with vendorQboId: null, the update branch never sets contactId, and no screen reads the link.
- **Today:** Every LedgerLine is written with vendorQboId: null (src/lib/quickbooks/sync.ts:284). The report parser has the Name cell, ids included, but keeps only its text (src/lib/quickbooks/report-parse.ts:152-163). The vendor-to-Contact match runs only when a vendor is first created. The update branch at sync.ts:193 never sets contactId, so a contractor added to the app after the first sync never gets linked. No screen reads QboVendor.contactId.
- **Why:** The proposed Payee view (FINANCIALS-I03), 'Paid this year' on contractor records (FINANCIALS-I04) and the payee in the line sheet (FINANCIALS-I11) all need lines tied to a vendor and the vendor tied to a contractor. Today they could only match the free-text payee name, which breaks as soon as the bookkeeper renames a vendor in QuickBooks.
- **Change:** Store the Name cell's id from the ProfitAndLossDetail row as vendorQboId whenever it matches a QboVendor.qboId. On every sync, re-run the existing name matcher for vendors that have no contactId, and never overwrite a link a person set. Mark auto links the way QboClass.autoMatched does. No UI change until the payee features ship.
- **Desktop, tablet, phone:** No UI.
- **Reuse:** The matcher already in src/lib/quickbooks/sync.ts:178-186, and the autoMatched pattern on QboClass.
- **Code:** `src/lib/quickbooks/sync.ts:284`, `src/lib/quickbooks/sync.ts:176-203`, `src/lib/quickbooks/report-parse.ts:152-163`, `prisma/schema.prisma:557-573`, `branch src/lib/quickbooks/sync.ts:193,284 (identical to main)`, `branch src/lib/quickbooks/report-parse.ts (identical to main)`
- **Verification:** verifier-found

### FINANCIALS-IV03

**Fade only the row that's saving in the mapping tables, and lock its select**

Low · Fix · effort S · `/financials/settings (Class mapping and Account categories tables)` · The QuickBooks mirror is honest about what it covers

- **Today:** Each mapping table shares one useTransition across all rows (src/app/(app)/financials/settings/tables.tsx:35, 122). While any single select saves, every row gets opacity-60 (tables.tsx:51, 136), so the whole 90-row account table fades at once. Every select stays enabled, so a second change can start while the first save and its router.refresh are still running.
- **Why:** A whole table fading reads as the page failing, and it hides which row changed. Overlapping saves can also finish out of order. Stripe and Linear show pending state on the field that changed, not on the whole list.
- **Change:** Track the id of the row that's saving. Fade and disable only that row's selects, and keep every other row live. Once FINANCIALS-019's toast lands, it confirms the row ('725 Linwood now maps to Company overhead').
- **Desktop, tablet, phone:** The same at desktop 1280, tablet 768 and phone 375. On the phone row layout (FINANCIALS-022), only the tapped row fades.
- **Reuse:** Select from src/components/ui.tsx with its disabled state. A per-row pending id replaces the shared useTransition flag.
- **Code:** `src/app/(app)/financials/settings/tables.tsx:35`, `src/app/(app)/financials/settings/tables.tsx:51`, `src/app/(app)/financials/settings/tables.tsx:122`, `src/app/(app)/financials/settings/tables.tsx:136`
- **Verification:** verifier-found

### FINANCIALS-V04

**Drop 'this period' from the negative reclass row: it covers all history**

Low · Fix · effort S · `/financials/settings (QuickBooks cleanup list)` · The QuickBooks mirror is honest about what it covers

- **Today:** The cleanup list labels a row 'Negative reclass lines this period', but buildDataQuality adds up every synced line with the NEGATIVE_RECLASS tag, with no date filter. The page has no period at all.
- **Why:** The label claims a time span the number doesn't have.
- **Change:** Label it 'Negative reclass lines'. Once FINANCIALS-001 adds a period, scope it to the chosen period. If FINANCIALS-020 moves it into 'About these numbers', carry the corrected label there.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** DqRow in src/app/(app)/financials/settings/page.tsx; buildDataQuality.
- **Code:** `src/app/(app)/financials/settings/page.tsx:125-129`, `src/lib/quickbooks/data-quality.ts:80-84`
- **Verification:** verifier-found

### FINANCIALS-V05

**Point 'Review' and the banner link at the section they mean**

Low · Fix · effort S · `/financials (Unattributed row, reconciliation banner)` · The QuickBooks mirror is honest about what it covers

- **Today:** The 'Review' link in the Unattributed row (page.tsx:204) and the 'Settings' link in the reconciliation banner (page.tsx:69) both open /financials/settings at the top, on the Connection card. The cleanup list and reconciliation line sit about 600 px further down on desktop, and further on phone.
- **Why:** A 'Review' link that lands on connection details makes the reader hunt for what it meant.
- **Change:** Until FINANCIALS-021's review list exists, link to anchors: /financials/settings#needs-review for the cleanup card and #reconciliation for the reconciliation line. Give both cards the matching ids.
- **Desktop, tablet, phone:** Same at every size. Matters most on phone, where the cleanup card is several screens down.
- **Reuse:** The existing Link elements in src/app/(app)/financials/page.tsx; Card ids in settings/page.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/28f577f9-1da9-46ec-8ca8-aa5648ba113d): An inline link from the field to the exact page where it is reviewed.
- **Code:** `src/app/(app)/financials/page.tsx:66-74`, `src/app/(app)/financials/page.tsx:201-207`, `src/app/(app)/financials/page.tsx:204`
- **Also found as:** G2A-I25 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** verifier-found
