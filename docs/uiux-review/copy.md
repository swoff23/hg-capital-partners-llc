# Lens: words on every screen

Part of the [UI/UX review](README.md). 39 findings: 0 critical, 9 high, 14 medium, 16 low.

## How it should work

HG's words should work the way Stripe's and Wise's do. The vocabulary is closed, formats are made by machine, and every sentence says who did what, who can see it and what happens next. Today each screen was written by whoever built it. One object has three names, statuses read like spreadsheet codes, and the app does things automatically without saying so.

1. One page of rules, enforced where possible. docs/writing.md holds the glossary and voice with ten before-and-after pairs from HG, the way Monzo onboards every hire. Buttons follow Basecamp: a verb plus its object, and a calm way out (Save card, Save and add another, Never mind: https://mobbin.com/screens/56f50dc4-7b99-409c-9d84-4bd6795fb5f3). A strings module and lint keep the glossary honest.

2. Say who sees it. Anything public or shared gets one line about visibility. Basecamp asks "Who should see this?" (https://mobbin.com/screens/0bc24c79-1906-420b-8c71-4c4c9fada060), and Zillow shows "Listed for rent" beside View your listing (https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd). Listings, the move-in form and contractor-facing notes all need this.

3. Say what happens automatically. Key dates, toggles and editors explain their effect in one sublabel. Monzo writes "We'll show this for you in Scheduled Payments" (https://mobbin.com/screens/f8901c1a-fc08-4218-8263-4cf9471cb998), and Linear writes each automation as a sentence (https://mobbin.com/screens/8720abc2-c855-44ee-911d-bc15fc1707eb).

4. Write status as sentences, in order. Progress uses dated you and we sentences, with the current step bold and later steps gray, as Wise does (https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614). A waiting state names the person who acts next, like Brex's "Pending review from" (https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c).

5. State the stakes, then close the loop. Confirm buttons restate the action and its object, as in Stripe's "Yes, cancel refund" (https://mobbin.com/screens/49670294-fe7b-4294-989a-cf7ba72ff1d1). Sent screens say what happened and what comes next, as Gusto does (https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c).

6. Errors point at the field. Each is one inline line that names what's needed, like Mercury's "Phone number is too short." (https://mobbin.com/screens/ed547eec-2691-473e-9844-ed3dfe315326).

7. Records remember where they came from. A muted line such as "Imported from Asana" or "Added from the loan maturity date" gives provenance. It follows Stripe's Source and Last updated rail (https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b) and the first line of Linear's activity, "created the issue" (https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33).

8. Formats come from one layer. Dates follow Things 3: a planned day, plus a deadline that reads "4d left" and turns red on the day (https://mobbin.com/screens/aed0da9d-712a-4253-a8da-f08b9b2f9d9a). Money, addresses, units of measure and empty values each get one helper.

The result is fewer words on every screen, each with a job, in an app that reads like a well-run property company.

<details><summary>What the reviewer covered</summary>

Production build on http://localhost:3200 was up and signed in as Connor. Chromium only (no WebKit run). Desktop 1280 with aria snapshots on all 24 routes: Home, Deals, Deal detail (3 deals, including one whose address is a pasted Maps URL), New deal, Portfolio list, Property detail (767 Prospect, 118 Congress), New property, Tasks, Task detail (2), New task, Contractors list, Contractor detail (2), Financials Overview, Rent roll, Financials Settings, Settings (CapEx rules, Move-in form, Storage), plus public Welcome, Rentals, Residents, Moving in, and Login signed out. Mobile 375 and tablet 768 on Home, Tasks, Deals, Portfolio, 767 Prospect, Deal detail, Task detail, Contractors, Contractor detail, Financials, Rentals and Login. Narrow 320 on Deals, Financials, 767 Prospect and Moving in. Dark mode on Home (mobile) and Financials Settings (desktop). States opened: property Units & access edit, Rentals edit, Building CapEx edit, global search with results and with zero results, Tasks and Deals no-match filters. I read every page and component under src/app and src/components for strings, and ran a script to pull out literal copy (585 lines). Not reached: the confirm dialogs (Reset to defaults, Disconnect QuickBooks, Discard changes) were read from code only. The contractor portal, Today view and property hub tabs don't exist yet. Pre-sync QuickBooks states were read from code. 16 Mobbin searches. Ramp isn't on Mobbin; Ramp-style queries returned Acctual, Expensify, Melio, Navan, Programa and Airwallex, which are cited by name. Mobbin also warned during the searches: 'Your Mobbin AI usage is high this month. Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect.' (https://mobbin.com/settings/billing-and-usage). Screenshots and aria text are in COPY/ and the extracted string list is at copy-strings.txt.

</details>

## Findings

### COPY-004

**Finish the approved rename from 'Vendors' to 'Contractors'**

High · Fix · effort S · `Sidebar, Contractors list and detail, global search` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly fixed in 9f74ea1: the global search placeholder now reads 'Search addresses, contractors, tasks…'. Still open: search results still label a contractor 'Vendor', which needs the w-16 type column widened, a layout call for Connor. The directory subtitle still reads 'N contractors & service providers', a plain copy fix that wasn't made and isn't in the claim. Approved D11 rename is mostly done on the branch.
- **Today:** Nav, H1, back link and empty states now say Contractors (nav.tsx:62; contractors/page.tsx:24, 28; contractors/[id]/page.tsx:54, 130). Three spots still say vendor. The global search placeholder 'Search addresses, vendors, tasks…' shows on every screen (global-search.tsx:45). Search results for a contractor come back typed 'Vendor' (api/search/route.ts:44). The directory subtitle still reads '31 contractors & service providers' (contractors/page.tsx:24).
- **Why:** There are two words for one thing in the same header. D10 approved 'Contractors', and contractors are about to sign in and see themselves called vendors.
- **Change:** Finish the last three: placeholder 'Search addresses, contractors, tasks…', result type 'Contractor', and either no subtitle or '31 contractors'.
- **Desktop, tablet, phone:** Copy only. Same at all widths.
- **Reuse:** src/components/nav.tsx:62, contractors/page.tsx:24-28, contractors/[id]/page.tsx:33,90, global-search.tsx:45, api/search/route.ts:44
- **References:** 
  - [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): Uses 'contractor' as the noun everywhere a per-job payee appears ('Your contractor payment has been submitted', a 'Contractors' column).
  - [Square](https://mobbin.com/screens/ed99d05a-2542-4092-b00d-57e0281b30b6): One noun carried through title, button and filter ('Vendors', 'Create vendor', 'Filter by vendor name')
  - [Linear](https://mobbin.com/screens/ae99a607-158a-4642-a69f-00c024381bd0): 'Members 5': the count sits beside the page title in a muted weight
  - [Clerk](https://mobbin.com/screens/44bc0d58-f212-4efc-8309-2fe44c899f5f): Team page with Members 1, Invites 0, Requests 0 counts on the tabs
  - [Quo](https://mobbin.com/screens/76e63179-80a3-4b1f-9e62-f38b2d1a7593): 'Contacts 2': the count sits beside the title
- **Code:** `branch src/components/global-search.tsx:45`, `branch src/app/api/search/route.ts:44`, `branch src/app/(app)/contractors/page.tsx:24`, `Probe on :3300: /api/search?q=Fuller -> type 'Vendor'`, `src/components/nav.tsx:60-66`, `src/components/global-search.tsx:45`, `src/app/api/search/route.ts:44`, `branch src/components/nav.tsx:62`, `src/app/(app)/contractors/page.tsx:24-28`, `src/app/(app)/contractors/[id]/page.tsx:33`, `src/app/(app)/contractors/[id]/page.tsx:90`, `src/app/api/search/route.ts:43-48`, `branch:src/components/nav.tsx:62`, `branch:src/app/(app)/contractors/page.tsx:24`, `branch:src/app/(app)/contractors/page.tsx:28`, `branch:src/app/(app)/contractors/[id]/page.tsx:54`, `branch:src/components/global-search.tsx:45`, `branch:src/app/api/search/route.ts:44`, `src/components/nav.tsx:62`, `branch: src/components/global-search.tsx:45`, `branch: src/app/api/search/route.ts:44`
- **Also found as:** SHELL-036 (App shell, sidebar, top bar, global search and Home), ADMIN-025 (Contractors directory, contractor detail and Settings), IA-IV06 (Lens: information architecture and global SaaS patterns), BTASKS-V03 (Branch: Today, All tasks, new task and the task page), BCONTRACT-024 (Branch: contractors directory, portal access, Home and emails)
- **Verification:** confirmed. Verified: nav 'Vendors', H1 'Vendors' with '29 contractors & service providers', back control 'Vendors', search placeholder 'Search addresses, vendors, tasks…', API type 'Vendor' (api/search/route.ts:43), empty 'No vendors.' This finishes the settled D10 rename. Overlaps COPY-035 on the search placeholder.

### COPY-009

**Stale QuickBooks data is labeled with a brand name instead of its state**

High · Design change · effort S · `Financials Overview and Rent roll` · The QuickBooks mirror is honest about what it covers

- **Today:** The source line is an amber 'QuickBooks' badge followed by 'Cash basis · synced 51d ago · reconciliation off'. The badge's color carries the warning while its text names the source. Every figure on the page is 51 days old and no date is given.
- **Why:** The most important fact, that these numbers are seven weeks old, hides in gray abbreviations. 'reconciliation off' is jargon.
- **Change:** Lead with the state: 'Last synced Sep 2 · 51 days ago', with an amber 'Out of date' badge once the data is older than 36 hours and a green 'Up to date' otherwise. Drop 'reconciliation off'; the banner covers it. Write the basis once as 'Cash basis'.
- **Desktop, tablet, phone:** Desktop and tablet keep one line with Refresh on the right. On phone the badge and date sit on one line and Refresh becomes an icon button.
- **Reuse:** SourceBadge in financials/_components/ui.tsx:98-112, Badge tones.
- **References:** 
  - [Quicken](https://mobbin.com/screens/ac605032-527c-4193-a824-44620a60c79c): 'Updated May 08, 2026 · 3:15 AM' next to a refresh button
  - [Stripe](https://mobbin.com/screens/ecc46dad-d2f3-4cc7-a222-a444c74bdf47): Report header states 'Data updated' with an absolute timestamp
  - [Stripe](https://mobbin.com/screens/a45686d8-0bea-4626-b70b-d432517dce71): Each figure card ends with a quiet 'Updated 10 Dec, 00:00' stamp; freshness is a line of text, not a brand chip.
  - [Stripe](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b): Each widget carries "Updated 06:23" in muted text, no brand chip
  - [Xero](https://mobbin.com/screens/5f186488-9c1c-4065-ab67-22e4fe9e6a2e): "Last synced 1 day ago · Refresh now" in the header
  - [Stripe](https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2): 'Last updated 6 Dec, 00:42' is a plain row in the details rail. Freshness is a fact, not a colored chip.
  - [HoneyBook](https://mobbin.com/screens/f32e5716-bf30-4944-8210-5b01ad695bc1): 'Last updated 46 minutes ago' as plain muted text under the chart
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): State as a colored dot plus the word it describes.
  - [Vercel](https://mobbin.com/screens/e828f30f-3564-432d-8a2f-33b3116dd465): Freshness as one quiet muted line under the data.
  - [Mercury](https://mobbin.com/screens/340a46db-da79-4acf-b8bc-f0a0621deed3): 'Auto-reconciled' chip: the colored mark names the state it colors.
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): 'Updated yesterday' and 'Updated 06:23' in quiet text at the foot of each overview card.
- **Code:** `src/app/(app)/financials/_components/ui.tsx:98-112`, `src/app/(app)/financials/_components/ui.tsx:94-113`, `src/app/(app)/financials/_components/ui.tsx:94-109`, `src/app/(app)/financials/_components/ui.tsx:103-109`
- **Also found as:** DATA-009 (Lens: tables, numbers, money, charts and status), PROPERTY-048 (Property detail page (future property hub)), VISUAL-I06 (Lens: visual design system across every screen), G2A-I18 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Verified: amber 'QuickBooks' badge followed by 'Cash basis · synced 51d ago · reconciliation off'. The badge color carries the warning and no absolute date is shown. On Rent roll the same line omits 'reconciliation off'.

### COPY-011

**Overview tiles are written for a bookkeeper, not an owner**

High · Design change · effort M · `Financials Overview KPI and data-quality tiles` · The QuickBooks mirror is honest about what it covers

- **Today:** Tiles read as described, but the 'Unattributed (entity / no-class) -$1,904' tile is a net of all $5,080 income and $6,984 expense, not a cost bucket, so it can't become a 'Company overhead' row.
- **Why:** Nine tiles with accounting qualifiers bury the four numbers Connor needs. Stripe and Mercury headline figures carry a plain label and at most one comparison.
- **Change:** Keep four KPIs: Income, Expenses, NOI, Cash flow after debt. Replace the three data-quality tiles with one line that shows only when non-zero: '$12,065 in 87 QuickBooks lines isn't assigned to a property. Fix in Settings'. Move the 'memo' and 'balance-sheet' notes to docs. Unattributed becomes a 'Company overhead' row in By property.
- **Desktop, tablet, phone:** Desktop shows 4 KPIs in a row. Tablet shows 2x2. Phone shows a stack of 4, with the cleanup line under them.
- **Reuse:** Kpi in financials/_components/ui.tsx. Drop the DqStat usages in financials/page.tsx:93-109.
- **References:** 
  - [Mercury](https://mobbin.com/screens/18f7213d-0beb-4436-ad3d-0891b5bd5efe): Books home: plain labels (Net cash flow, Total expenses) with one comparison line
  - [Mercury](https://mobbin.com/screens/607720b2-bd1f-4d7f-90e0-aa31e341fd92): Explains the headline balance in one plain sentence instead of qualifiers
- **Code:** `src/app/(app)/financials/page.tsx:76-108`
- **Verification:** partly. The tiles are as described, and cutting to four KPIs is right. One part of the recommendation is wrong. 'Unattributed' is not overhead: the cleanup list shows it as '+$5,080 / −$6,984', which is every dollar of operating income for the period plus all expenses. The By property table has no property rows at all. Renaming it 'Company overhead' would label unclassed rent as overhead. Use 'Not assigned to a property' instead (see COPY-V04).

### COPY-013

**The QuickBooks cleanup list is a dump of engineering diagnostics**

High · Design change · effort M · `Financials > Settings, QuickBooks cleanup list` · The QuickBooks mirror is honest about what it covers

- **Today:** Rows include 'Negative reclass lines this period $0 · 0 lines', 'Unattributed (entity / General / no class) -$1,904 net · +$5,080 / −$6,984 real cost, not attributable to a property', 'Owner-funded rent (P2P)' and 'Cash reconciliation: sum-to-whole ✓ · NOI vs QBO off by -$2,916 · no cell mismatches'. A footnote reads 'Reconciliation target: our numbers tie to QuickBooks' own Profit & Loss by Class report. Independent check: per-property rent vs the old rent spreadsheet.' Class rows read 'HGC:HGC 118 Congress auto'.
- **Why:** A cleanup list should be a to-do list. Today most rows are $0 and the one that matters (NOI off by $2,916) is buried at the bottom.
- **Change:** Show only items that need action, each as a sentence, an amount and an action: '87 lines have no class · $12,065 · Open in QuickBooks', 'Our NOI is $2,916 off from QuickBooks · Review'. Hide zero rows. Put the diagnostics behind a 'Details' disclosure. Replace the 'auto' tag with a 'Matched' chip.
- **Desktop, tablet, phone:** Desktop rows: sentence, amount, then a right-aligned action. On phone the action drops below the sentence.
- **Reuse:** SectionCard in components/ui.tsx. financials/settings/page.tsx:105-160.
- **References:** 
  - [Stripe](https://mobbin.com/screens/dfabb4e7-d873-431f-9856-213a3c92a001): Account tasks are a short list of sentences, each with status and 'View details'
  - [Shopify](https://mobbin.com/screens/2f6123d0-2fb0-4e5f-87c3-9a3ce0432c24): Problems are written as plain status ('Missing receiving method')
  - [Copilot](https://mobbin.com/screens/8edbc5d1-5e4d-4b8a-b916-c19f9558b6d4): The review queue is one card with a count and View all, and the cleared state is a single line.
  - [YNAB](https://mobbin.com/screens/3a34e509-965a-44cc-97cf-12ebd76adf78): A count and a View action instead of a ledger of zeros
  - [Midday](https://mobbin.com/screens/04b800ad-519e-40d8-b1fc-b9a21b54c7ad): 'All | Review (1)' switch onto items needing attention
  - [Copilot](https://mobbin.com/screens/c249e8cb-67cb-4d06-a431-7b728d51b95d): A 'NEEDS ATTENTION' group first, with healthy connections listed quietly after it.
  - [Mercury](https://mobbin.com/screens/340a46db-da79-4acf-b8bc-f0a0621deed3): Passing months collapse to small checked chips. Detail opens only for the selected month.
- **Code:** `src/app/(app)/financials/settings/page.tsx:105-160,202,258`, `src/app/(app)/financials/settings/page.tsx:102-164`
- **Also found as:** FINANCIALS-020 (Financials, rent roll and financial settings), G2A-I17 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** confirmed. Verified in the cleanup list: '$0 · 0 lines' rows, 'Unattributed … real cost, not attributable to a property', and 'sum-to-whole ✓ · NOI vs QBO off by -$2,916' last. Class rows read 'HGC:HGC 118 Congress auto'. The 'Reconciliation target' footnote wasn't in my aria capture of the page body, but the rest stands.

### COPY-017

**Addresses are formatted a dozen different ways**

High · Fix · effort M · `Every list, dropdown and table with addresses` · Fix wrong numbers and records first

- **Today:** Examples: '118 Congress St. Buffalo, NY 14213' (no comma), '23 Sherwood St, Buffalo', '415 Crescent Ave., Buffalo', '428 Normal Avenue', '256 Auburn Avenue Buffalo , NY 14213' (space before the comma), '25 Hoyt Street,  Buffalo' (double space). The Home CapEx table mixes '767 Prospect Avenue' and '647 Prospect Ave.'. The deal list repeats 'Buffalo, NY 142xx' on 675 rows, which doubles row height at tablet width.
- **Why:** Ragged data reads as an unfinished import, and the repeated city wastes the widest column.
- **Change:** Add one display formatter. Street line uses USPS short form ('767 Prospect Ave', '118 Congress St'); city line is 'Buffalo, NY 14213'. Lists and dropdowns show the street line only; detail pages show both. Normalize on save and run a one-time cleanup.
- **Desktop, tablet, phone:** Street only in lists at every width, so deal rows stay one line on tablet and phone.
- **Reuse:** Extend lib/normalize.ts (normalizeAddress, shortAddress).
- **References:** 
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): Consistent two-line address format
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The address is written one consistent way: '1226 University Dr' over 'Menlo Park, CA 94025'.
- **Code:** `src/app/(marketing)/rentals/page.tsx:110`, `hg_capital_review DB: SELECT address FROM "Property" returns the mixed styles`, `branch-src/src/lib/properties/service.ts:53`, `src/lib/normalize.ts:16-19`, `src/lib/tasks/list.ts:76`, `src/app/(app)/tasks/task-row.tsx:109-117`, `src/lib/normalize.ts:1-14`, `local DB: Deal.address doubled spaces 173, space before comma 157, plus sign 1, of 675`, `src/lib/deals/service.ts:59-61`, `src/lib/deals/service.ts:120`
- **Also found as:** PORTFOLIO-047 (Portfolio list and new property), PUBLIC-V12 (Login and the public site), G1E-IV03 (What leaves the app: printouts, PDFs and the Google listing), PUBLIC-028 (Login and the public site), COPY-V08 (Lens: words on every screen), DATA-030 (Lens: tables, numbers, money, charts and status), JOURNEYS-IV04 (Lens: the core jobs, end to end), DEALS-025 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. Verified in Deals ('256 Auburn Avenue Buffalo , NY 14213', '25 Hoyt Street,  Buffalo'), Properties ('118 Congress St. Buffalo, NY 14213' with no comma), filter options ('428 Normal Avenue' next to '647 Prospect Ave.'), and the public move-in property select. Deal rows wrap to two lines at 768.

### COPY-019

**Public listings show placeholders and internal unit names**

High · Design change · effort M · `Public /rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** All three public cards read 'No photo yet', 'Price on request' and 'Details on request'. Unit lines use internal labels: '1st Front / Lower Front', 'Rear', 'Floor 1'. Addresses are inconsistent ('647 Prospect Ave. Buffalo, NY 14213').
- **Why:** A renter sees three cards with nothing in them. 'yet' is an internal note, and the unit names are HG's own shorthand.
- **Change:** Card copy should read like 'Lower unit · 2 bd · 1 ba · $1,450/mo · Available now'. Add a public unit name separate from the internal label. A listing can't go public without rent, beds, baths and one photo. Until it has them, show a single CTA, 'Ask about this apartment', instead of the three placeholders.
- **Desktop, tablet, phone:** Desktop and tablet use a 2 to 3 column grid. Phone stacks one card per row with price on the same line as the unit name.
- **Reuse:** rentals/page.tsx:116-128, rentals/photo-carousel.tsx:16, the listing editor in properties/[id]/edit-listings.tsx
- **References:** 
  - [Zillow](https://mobbin.com/screens/33d4307f-0f26-44a8-bf28-298ba22f160b): Units listed as 'Unit 426 · 2 bd, 2 ba · Available Now · $2,884'
  - [Airbnb](https://mobbin.com/screens/a92f14ea-1a94-4a63-99f3-8b5fbd42d106): Each card is photo, short title, price; nothing without data is shown
- **Verification:** confirmed. Verified: all three cards read 'No photo yet', 'Price on request', 'Details on request', with unit lines '1st Front / Lower Front', 'Rear', 'Floor 1'. Each links to a Zillow listing that has the details the HG page hides.

### COPY-021

**CapEx timing words contradict each other and hide what's overdue**

High · Design change · effort S · `Home CapEx card, Property CapEx forecast, Unit equipment, Building CapEx` · Plain, consistent words

- **Today:** Home and the property page say '$32,000 due soon', a bucket that includes everything due this year and everything already overdue. Home's tooltip calls the same thing 'now'. The property table's Due column mixes 'Due soon' and '2027'. Unit equipment status says 'Replace' in a red chip, while Building CapEx status says 'Good' or 'Unknown'. The header reads '3 / 11 systems dated'.
- **Why:** 'Due soon' softens items that are years past end of life, and five words for one timeline make the forecast hard to trust.
- **Change:** Separate overdue from this year: '$32,000 due in 2026 · $21,000 overdue'. Due column values: 'Overdue', '2026', '2027'. Equipment status: 'Overdue', 'Due 2027', 'Good', 'No install year'. Replace the header with '8 systems missing an install year'.
- **Desktop, tablet, phone:** Same words at all sizes. On phone the summary line wraps under the total.
- **Reuse:** capex-outlook.tsx:52,171, portfolio-capex.tsx:100,314, building-capex.tsx:128, lib/property-types.ts forecast (dueNowTotal plus overdue flag)
- **References:** 
  - [Things 3](https://mobbin.com/screens/aed0da9d-712a-4253-a8da-f08b9b2f9d9a): Only two timing words exist: a countdown ('4d left') and 'today' in red. Overdue items keep their date. CapEx should use 'Due 2026', 'Overdue since 2024' and a countdown, not 'Due soon'.
  - [Mercury](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1): Separate labeled counts for 'Outstanding', 'Overdue' and 'Due soon'
  - [QuickBooks](https://mobbin.com/screens/a5de8e82-01ab-44ca-a68c-82fa9753cab2): 'Overdue' and 'Open bills' are distinct totals
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): Relative deadline text such as '4d left'. HG's equivalent is 'Overdue 6 yrs' or 'Due 2027' instead of one 'Due soon' label for everything.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): 'Overdue' with the age beside it, so lateness has a size.
  - [ClickUp](https://mobbin.com/screens/bc8a4bb6-6f82-4001-a0d4-4ffa237149fd): States how late an item is ('2 days ago') instead of a generic soon label
  - [Things 3](https://mobbin.com/screens/97952802-d1f3-4324-8a5b-fab1bc02c29e): One short state word per row ('4d left', 'today') in a fixed spot.
  - [Flighty](https://mobbin.com/screens/d2a15492-9519-4965-826f-649edbfc3521): Late items say how late ('1h 8m Late'); applied here, 'Overdue' can carry its size ('Overdue 8 yrs') so the worst items sort first.
  - [Midday](https://mobbin.com/screens/ab800b0e-8693-4df7-8a3f-f6ef12a33219): "Overdue" is one fixed status with its own KPI
- **Code:** `src/app/(app)/properties/[id]/capex-outlook.tsx:50-54`, `src/app/(app)/properties/[id]/capex-outlook.tsx:163-172`, `src/lib/property-types.ts:389-397`, `src/app/(app)/properties/[id]/capex-outlook.tsx:50-53,174`, `src/app/(app)/portfolio-capex.tsx:99-101,314`, `src/app/(app)/portfolio-capex.tsx:98-101`, `src/lib/property-types.ts:349-351`
- **Also found as:** PROPERTY-021 (Property detail page (future property hub)), DATA-033 (Lens: tables, numbers, money, charts and status), SHELL-046 (App shell, sidebar, top bar, global search and Home)
- **Verification:** confirmed. Verified: '$32,000 due soon' on Home and '$13,000 due soon' on 767. The Due column mixes 'Due soon' and '2027' (capex-outlook.tsx:171), the Home tooltip says 'now' for overdue items (portfolio-capex.tsx:314), the unit equipment badge reads 'Replace', and the header reads '3 / 11 systems dated'. dueNowTotal counts dueYear === this year, which includes overdue (property-types.ts:401-404). The '$21,000 overdue' figure is only illustrative.

### COPY-I02

**Listing statuses don't say the listing is on the public site**

High · Design change · effort S · `Property page > Rentals card (read and edit)` · Rentals, residents and the public site run one lifecycle

- **Today:** Every public listing is a placeholder right now. All three cards on /rentals (767 Prospect, 647 Prospect, 933 Lafayette) read 'No photo yet / Price on request / Details on request'. The property Rentals card shows 'Available' plus 'No details yet', with no word that 'Available' means public and no link to the public page. Hidden already uses the amber Badge tone.
- **Why:** Only one of the three words is private, and the UI never says which. An owner can publish a placeholder listing without knowing it, which is exactly what happened at 767 Prospect. Basecamp, Zillow and Stripe all state visibility next to the control ('Who should see this?', 'Listed for rent', 'This information may be visible in...').
- **Change:** Keep the three statuses and add one muted line under the status that says where the listing shows. Available: 'Live on /rentals · View page'. Leased: 'On /rentals, marked leased'. Hidden: 'Not on the public site'. In the read row, a live listing with no rent or photos replaces 'No details yet' with 'Live without rent or photos' in the amber Badge tone. The edit select uses the same words as the read badge.
- **Desktop, tablet, phone:** Desktop and tablet: the line sits under the unit name next to the badge. Phone (375): shorten to 'Live · View page' and put it under the wrapped unit name, keeping the Zillow link. Nothing else drops.
- **Reuse:** ReadListings and EditListingCard in src/app/(app)/properties/[id]/edit-listings.tsx; Badge and its tones from src/components/ui.tsx.
- **References:** 
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The status pill names the public state ('Listed for rent') next to 'View your listing'.
  - [Basecamp](https://mobbin.com/screens/0bc24c79-1906-420b-8c71-4c4c9fada060): Visibility is a stated choice ('Our team only, private to us' or 'Allow the client to see this too'), never implied.
  - [Stripe](https://mobbin.com/screens/2a33899e-187f-47f7-b996-7d5eb955ba1a): One line above the fields says where the information will appear publicly.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:30-34 STATUS_LABEL`, `src/app/(app)/properties/[id]/edit-listings.tsx:300-302 status options`, `src/app/(app)/properties/[id]/edit-listings.tsx:240 'No details yet'`, `src/app/(marketing)/rentals/page.tsx:27 status in AVAILABLE, LEASED`
- **Verification:** partly. Confirmed live and understated. Signed out, /rentals shows all three listings (767 Prospect, 647 Prospect, 933 Lafayette) as 'No photo yet / Price on request / Details on request', because rentals/page.tsx:27 publishes both AVAILABLE and LEASED. One problem in the recommendation: STATUS_TONE already uses amber for Hidden (edit-listings.tsx:25-29). An amber 'Live without rent or photos' mark in the same card would reuse a status color, which the house rule forbids. Use the red or attention tone, or plain text. In the hint, 'Live on your site · View page' reads better than a raw '/rentals' path. Zillow reference cc09445f verified: a 'LISTED FOR RENT' pill beside 'View your listing'. Zillow's Listing tab also shows a completeness meter, which supports the incomplete-listing warning.

### COPY-V04

**The 'Unattributed' figure is called 'real cost' but contains all of the period's income**

High · Fix · effort S · `Financials Overview and By property table` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, financials): 'Unattributed (entity / no-class) ... real cost, no property' is now 'Not assigned to a property' with '$X in · $Y out' on the Overview tile, the By property row (link now reads 'Map classes' and goes to #class-mapping) and the Settings cleanup list. The 'real cost' note and the parentheticals are gone. Left: COPY-V04: the Overview tile has no 'Map classes' link of its own. The By property row carries it.
- **Today:** The Overview tile reads 'Unattributed (entity / no-class) -$1,904 · real cost, no property'. The Settings cleanup list shows the same bucket as '+$5,080 / −$6,984'. That's every dollar of operating income for the period (the Income KPI is $5,080) plus every expense. The By property table has no property rows, only this bucket and the total.
- **Why:** 'Real cost' tells the owner that $1,904 of company overhead was spent. In fact, all of the rent came in unclassed. Two findings in this review (COPY-011 and COPY-024) would rename it 'Company overhead', which repeats the error. Wrong labels on money undercut trust faster than anything else.
- **Change:** Label the bucket by its state: 'Not assigned to a property'. Show income and expenses separately as '$5,080 in · $6,984 out', with a 'Map classes' link to the mapping table. Drop 'real cost' and the parenthetical. In By property, the row reads 'Not assigned to a property · Map classes'.
- **Desktop, tablet, phone:** Desktop: a row in the By property table. Tablet: same row, with the Margin column dropped. Phone: the row becomes a card, with 'in' and 'out' on one line and the link below.
- **Reuse:** DqStat usage in src/app/(app)/financials/page.tsx:93-109 and the unattributed row in the By property table (financials/page.tsx:177-190). Cleanup row in financials/settings/page.tsx.
- **Verification:** verifier-found

### COPY-005

**'Portfolio' names both the property list and the money total**

Medium · Design change · effort S · `Sidebar, Portfolio list, Property back link, Financials` · Plain, consistent words

- **Today:** The nav item 'Portfolio' opens /properties, titled 'Portfolio', with the button '+ New property' and the subtitle '11 owned properties'. Home's stat tile says 'Properties'. Financials uses 'Portfolio' as the all-properties total row. The property Financials card has a 'Portfolio →' link, and the Rent roll total row is also 'Portfolio'.
- **Why:** One word points at two different objects. The URL, the button and the Home tile all say 'property', so the nav is the odd one out.
- **Change:** Use 'Properties' for the list (nav, H1, back link 'Properties') and 'All properties' for every total row. This lines up with D10, where the sidebar lists the properties under a 'Properties' header.
- **Desktop, tablet, phone:** Same label at all sizes. The phone bottom bar label is 'Properties'.
- **Reuse:** nav.tsx:30, properties/page.tsx:36, properties/[id]/page.tsx:81, financials/page.tsx:217, rent-roll/page.tsx:83
- **References:** 
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): Rental owner tool titles the list 'Properties' with 'Add a property'
  - [Stripe](https://mobbin.com/screens/cffea421-b951-4ba7-8ddd-571a990d3ed1): Nav label, page title and create button share one noun ('Customers', 'Add customer')
- **Verification:** partly. Every observation checks out: nav 'Portfolio', H1 'Portfolio' with '11 owned properties', '+ New property', Home tile 'Properties', the Financials total row 'Portfolio', and 'Portfolio →' on the property Financials card. It's a naming inconsistency that doesn't block any job, so medium rather than high. It aligns with D10's properties sidebar. 'All properties' for total rows is right.

### COPY-020

**Accessible names are variable names, dashes and glyphs**

Medium · Fix · effort S · `Deal detail, Deals list, Tasks filters, Units edit, CapEx rules` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Checked against ARIA snapshots of /deals and /deals/cmtg25ycu0016jphspf6k0jmj on the branch.
- **Today:** On Tasks, the filters are now named: 'Assignee' and 'Property' comboboxes plus a 'Status' group (filters.tsx:84, 121, 70-77). Everything else in the finding is unchanged on :3300. The deal detail still announces textbox 'theirPriceRaw', 'ourPriceRaw', 'nextAction' and 'sourceUrl' (deal-detail.tsx:138). Deal rows still name their Units and price fields '—' and the listing link '↗', and the row status select has no name (deal-row.tsx:75). The equipment and listing remove buttons are still '✕' (edit-units.tsx:435, edit-listings.tsx:483), and the CapEx year and cost inputs are still unnamed.
- **Why:** VoiceOver users hear code. The visible labels already exist, so the names just need wiring.
- **Change:** The Tasks part is done. The remaining items are the deal, units and CapEx controls listed in the original.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** deals/[id]/deal-detail.tsx:136, deals/deal-row.tsx:46-69 and 65, tasks/filters.tsx:75-106, properties/[id]/edit-units.tsx, settings/capex-rules-editor.tsx
- **Code:** `branch src/app/(app)/tasks/filters.tsx:70-77, 84, 121`, `branch src/app/(app)/deals/[id]/deal-detail.tsx:138`, `branch src/app/(app)/deals/deal-row.tsx:75`, `branch src/app/(app)/properties/[id]/edit-units.tsx:435`, `src/app/(app)/deals/[id]/deal-detail.tsx:136-153`, `src/app/(app)/deals/[id]/deal-detail.tsx:138`, `src/app/(app)/deals/deal-row.tsx:73-145`, `src/app/(app)/deals/filters.tsx:63-77`
- **Also found as:** DEALS-IV04 (Deals pipeline, new deal and deal detail), IA-V06 (Lens: information architecture and global SaaS patterns), FEEL-019 (Lens: interaction quality, feedback, states, speed and accessibility), JOURNEYS-IV05 (Lens: the core jobs, end to end), DEALS-029 (Deals pipeline, new deal and deal detail)
- **Verification:** partly. Every name checks out: textboxes 'theirPriceRaw', 'ourPriceRaw', 'nextAction', 'sourceUrl'; deal-row inputs named '—'; link '↗'; unnamed status selects on the Deals list; unnamed Owner and Property filter selects on Tasks; unnamed CapEx rule textboxes. It's an S-sized a11y fix for an internal two-person tool, so medium is the better calibration.

### COPY-024

**The By property table uses a formula footnote and abbreviated headers**

Medium · Fix · effort S · `Financials Overview, By property table` · Plain, consistent words

- **Today:** The table has no property rows; the only rows are 'Unattributed (entity / overhead / no class)', which contains all income and expense, and the 'Portfolio' total.
- **Why:** A formula with Σ is an internal note. Abbreviations save no space on a 1280 table.
- **Change:** Rename the row 'Company overhead' with a 'Review' link, the total 'All properties', and the headers 'Expenses' and 'Debt interest'. Delete the footnote.
- **Desktop, tablet, phone:** Desktop shows all columns. Tablet drops Margin. Phone shows Property and NOI, with tap to expand.
- **Reuse:** Table/Th/Td in components/ui.tsx. financials/page.tsx:172-227
- **References:** 
  - [Stripe](https://mobbin.com/screens/f8db8469-2830-4c6b-98ca-53bf4c1e3caf): Table headers are plain full words; count line '3 results' instead of notes
- **Code:** `src/app/(app)/financials/page.tsx:177-227`, `src/app/(app)/financials/page.tsx:177-183`, `src/lib/quickbooks/queries.ts:107`
- **Also found as:** FINANCIALS-057 (Financials, rent roll and financial settings)
- **Verification:** partly. Headers ('Opex', 'Debt int.'), the Σ footnote and the 'Portfolio' total are as described. The proposed row name 'Company overhead' is wrong: that row holds all $5,080 of income plus $6,984 of expense (see COPY-011 and COPY-V04). Name it 'Not assigned to a property' with a 'Review' link.

### COPY-028

**The property Financials card uses 'QuickBooks class' jargon and arrow paths**

Medium · Fix · effort S · `Property detail, Financials card` · Plain, consistent words

- **Today:** Unmapped properties show 'No QuickBooks class is mapped to this property yet. Map it in Financials → Settings.' Mapped properties show a 'Portfolio →' link and the note 'Direct-classed lines only. Entity and overhead costs show in the portfolio view.'
- **Why:** 'Class' and 'direct-classed' are bookkeeping terms. The arrow path describes navigation instead of doing it.
- **Change:** Unmapped: 'Not linked to QuickBooks yet', with a 'Link' button that deep-links to this property's row in the mapping table. Mapped: drop the note and label the link 'All properties'.
- **Desktop, tablet, phone:** Same at all sizes. On phone the button sits under the line.
- **Reuse:** properties/[id]/financials.tsx:18-61
- **References:** 
  - [Stripe](https://mobbin.com/screens/0e51dae9-65d8-44b9-8541-287ba63a435b): Missing setup shown as a heading plus one direct action button
- **Verification:** confirmed. Verified on 767 ('No QuickBooks class is mapped to this property yet. Map it in Financials → Settings.') and 118 ('Portfolio →' and 'Direct-classed lines only…'). Overlaps COPY-005 ('Portfolio') and COPY-043 (arrows). Keep this one as the card-level rewrite.

### COPY-030

**'Their price' and 'Our price (target/max)' are vague labels**

Medium · Design change · effort S · `Deals list, Deal detail, New deal` · Plain, consistent words

- **Today:** The columns are 'Their price' and 'Our price'. The New deal label is 'Our price (target/max)', with a parenthetical admitting it means two things.
- **Why:** Real estate already has precise words for both, and the parenthetical shows the label is doing two jobs.
- **Change:** Use 'Asking price' and 'Max offer' (or 'Target', if that's what Connor and Pieter mean). Use the same pair on the list, detail and form.
- **Desktop, tablet, phone:** On phone the list shows 'Asking $425K' in the meta line.
- **Reuse:** deals/page.tsx:122-123, deals/[id]/page.tsx:70-73, deals/new/page.tsx:32-37
- **References:** 
  - [Attio](https://mobbin.com/screens/e275641a-a3e8-440a-b53e-983bb9cec7c7): Precisely named value attribute ('Estimated contract value')
- **Verification:** confirmed. Verified: 'Their price' and 'Our price' on the list and detail, 'Our price (target/max)' on New deal. Whether it's 'Max offer' or 'Target' is correctly left for Connor and Pieter to decide.

### COPY-031

**Deal activity reads as a change log, not as sentences about people**

Medium · Design change · effort M · `Deal detail, Activity timeline` · One record layout for every record

- **Today:** Activity is a diff log with a pluralization bug ('1 entries'); the date and '· note' are visually spaced, and only the accessible text runs them together.
- **Why:** Arrows and colons read like a database diff. The count restates the list.
- **Change:** Title the card 'Activity' with no count. Write entries as sentences: 'Pieter moved this to High · Sep 2', 'Connor added the listing link · Aug 31'. Notes show first name and date with no '· note' tag. Imported rows collapse into one 'Imported from the deal spreadsheet' line, and system normalizations aren't logged.
- **Desktop, tablet, phone:** Desktop is a two-column timeline. Phone is a single column with the date under each sentence.
- **Reuse:** deals/[id]/page.tsx:94-131, lib/deals/log.ts
- **References:** 
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): 'Alex Smith moved from Todo to In Progress · 10d ago' sentence-style activity
- **Code:** `src/app/(app)/deals/[id]/page.tsx:97,118-119`
- **Verification:** partly. 'Activity timeline' with '18 entries', the '1 entries' bug (deals/[id]/page.tsx:97), arrow diffs, and address normalizations credited to Connor are all real. The 'Aug 31, 2026· note' missing space is only in the accessible text: the span has ml-1 (page.tsx:118), so it renders with a gap. A good reference I verified: Stripe customer Recent activity (https://mobbin.com/screens/fb0b91ce-234b-44d5-9f8b-18864cc63941) uses sentences like 'Subscribed to Yearly plan for promotion'.

### COPY-034

**Empty sections say only 'No X.' with no next step**

Medium · Design change · effort S · `Property cards, Home, Lists, Settings` · Plain, consistent words

- **Today:** Examples: 'No unit-level records.', 'No listings yet.', 'No notes yet.', 'No open tasks.', 'No properties.', 'No vendors.', 'No appliance rules.' and Home's 'Nothing assigned to you. Nice.'
- **Why:** Each empty state is a chance to say what goes there and how to add it. 'Nice.' is filler.
- **Change:** Write each as purpose plus action. 'No units yet' with an 'Add unit' button. 'No listings' with 'Add listing'. 'No notes' with 'Add note'. Home: 'You're clear. Tasks assigned to you land here.' Inside framed cards keep it to one muted line plus the action.
- **Desktop, tablet, phone:** Same at all sizes. On phone the action button sits full-width under the line.
- **Reuse:** EmptyState in components/ui.tsx (add an optional action prop). edit-units.tsx:191, edit-listings.tsx:155,213, edit-details.tsx:154, (app)/page.tsx:67
- **References:** 
  - [Linear](https://mobbin.com/screens/a085c0e8-477c-4459-b2ee-25d5a4c0340a): 'No issues assigned to you' with 'Create new issue'
  - [Mercury](https://mobbin.com/screens/dbf9eb63-dcfe-4876-965a-e8a6d8702092): 'No incoming transfers · Add funds to get started' with an add button
  - [Stripe](https://mobbin.com/screens/9024ef2c-1a0e-490b-8aba-350bdb1cf892): Card-level empties: 'No orders · You haven't ordered any card readers' plus Shop
- **Code:** `src/app/(app)/page.tsx:67`
- **Verification:** confirmed. All the strings exist: page.tsx:67, edit-units.tsx:191, edit-listings.tsx:155,213, edit-details.tsx:154, properties/page.tsx:47, contractors/page.tsx:28, capex-rules-editor.tsx:338. Adding an action prop to EmptyState is the right reuse.

### COPY-041

**'Mark done' on the list, 'Mark complete' / 'Completed' on the detail page**

Medium · Fix · effort S · `Tasks list and Task detail` · Plain, consistent words

- **Migration branch:** Still applies on the migration branch. The task page has no 'Mark complete' or 'Completed' button anymore. Status is a control that reads 'Done' ('Status: Done. Change status'). The list checkbox is named after the task title, with no 'Mark done' or 'Mark open' text, and the All filter uses 'Done'.
- **Today:** The list checkbox says 'Mark done' or 'Mark open'. The detail button says 'Mark complete' and flips to 'Completed'. The filter says 'Done'.
- **Why:** There are three words for one state, and the approved status set uses 'Done'.
- **Change:** Use 'Mark done', 'Done' and 'Reopen' everywhere.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** tasks/task-checkbox.tsx:10, tasks/[id]/task-detail.tsx:59
- **References:** 
  - [Jira Cloud](https://mobbin.com/screens/8d73769f-ed59-41fa-b475-b0697d6b9ad9): One status vocabulary (TO DO, IN PROGRESS, DONE) across list and detail
- **Code:** `branch src/app/(app)/tasks/[id]/status-control.tsx:52`, `branch src/lib/task-scope.ts:47-55`, `branch src/app/(app)/tasks/task-checkbox.tsx:24-31`, `branch src/app/(app)/tasks/filters.tsx:8-12`
- **Verification:** confirmed. Verified: the checkbox aria-label is 'Mark done' / 'Mark open' (task-checkbox.tsx:10), the detail button reads 'Mark complete' / 'Completed' (task-detail.tsx:59), and the filter says 'Done'.

### COPY-044

**Utility fields use unexplained 'LOFL' and store 'TENANT' as an account number**

Medium · Design change · effort S · `Property > Units & access (edit)` · Plain, consistent words

- **Today:** Each utility has 'Acct #' (values like 'TENANT'), 'Autopay' (value 'NA') and 'LOFL' (values like 'Call to confirm'). 'LOFL' isn't explained anywhere.
- **Why:** An acronym and status words stuffed into an account-number field make the record unreliable when someone needs to transfer a utility.
- **Change:** Split this into 'Account holder: Tenant | HG', 'Account #' (only when HG holds the account), and 'Autopay: On | Off | Not set'. Spell LOFL out; Connor needs to say what it stands for, since it isn't defined in the code.
- **Desktop, tablet, phone:** Three utility columns on desktop, two on tablet, one stacked on phone.
- **Reuse:** lib/property-types.ts:50-70 UTILITY_GROUPS, properties/[id]/edit-units.tsx
- **References:** 
  - [Airbnb](https://mobbin.com/screens/94fe8072-4994-49ea-a4b7-fb4662c140cb): Each option carries a plain sublabel saying who does what ('Guests will use a code...'). Utility responsibility can read the same way: 'Resident pays' or 'We pay', with no 'LOFL' code.
  - [QuickBooks](https://mobbin.com/screens/3cd3650d-6231-4e48-ae12-bf7cb1ac1042): Setting row: plain label, value, one-line helper
- **Code:** `src/lib/property-types.ts:58,66`
- **Verification:** confirmed. Verified in Units edit for 767: Acct # 'TENANT', Autopay 'NA', LOFL 'Call to confirm' (labels from property-types.ts:58,66). LOFL most likely means 'Leave on for landlord', but Connor should confirm before it's spelled out.

### COPY-058

**Move-in errors don't say which field is wrong**

Medium · Fix · effort S · `Move-in form submit errors` · Rentals, residents and the public site run one lifecycle

- **Today:** Errors read 'Please check the form and try again.', 'Something went wrong. Please try again in a moment.', 'Please select a valid property.' and 'Too many submissions right now. Please try again later, or text us instead.'
- **Why:** A resident on a phone can't find which of roughly 60 rows is the problem.
- **Change:** Show errors per field and scroll to the first one: 'Choose your property', 'Rate every kitchen item or mark N/A'. Keep one summary line at the top: '2 items need an answer'.
- **Desktop, tablet, phone:** Inline under each field at all sizes.
- **Reuse:** residents/moving-in/actions.ts:18,52,59,73
- **References:** 
  - [Mercury](https://mobbin.com/screens/85da4e09-98b5-4461-b34b-3653b5083e6f): Error placed under the specific field
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:18,52,59,73`
- **Verification:** confirmed. The strings at actions.ts:18,52,59,73 are as described. A single form-level error on a roughly 60-row form is the real problem.

### COPY-I03

**The listing's date field is labeled 'Available', the same word as the status beside it**

Medium · Fix · effort S · `Property page > Rentals edit` · Rentals, residents and the public site run one lifecycle

- **Today:** In edit mode the status select reads 'Available', and the date input under it is also labeled 'Available'. The date is saved but never displayed, either in the property's read row or on the public /rentals card.
- **Why:** One word has two meanings in the same card. It reads as a second status, and an owner can't tell whether to fill it in to publish. Stripe and Zillow label dates by the event ('Last listed', 'Available now').
- **Change:** Rename the date label 'Move-in date' and show it in the read row as 'Move-in Nov 1' (year only when it isn't this year). Keep 'Available' for the status alone. Add both to the glossary.
- **Desktop, tablet, phone:** Same label at every width. On phone the 3-column grid stacks and the label stays one line.
- **Reuse:** EditListingCard field grid in src/app/(app)/properties/[id]/edit-listings.tsx; fmtDay in src/lib/dates.ts for the read row.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:301 option 'Available'`, `src/app/(app)/properties/[id]/edit-listings.tsx:340 label 'Available'`, `src/app/(app)/properties/[id]/edit-listings.tsx:301, 340`
- **Also found as:** G1E-V04 (What leaves the app: printouts, PDFs and the Google listing)
- **Verification:** partly. The label collision is real: an 'Available' status select sits directly above an 'Available' date input (verified in p767-redit--edit). The finding misses the bigger half. availableDate is saved (service.ts:275) but shown nowhere: not in the read row, and not on /rentals, whose ListingCardData has no date. So the field captures data no one sees. The rename should ship together with showing the date on the public card ('Available Nov 1'), which renters care about. Otherwise drop the field. It's fine as a fix with no reference.

### COPY-I04

**Key-date fields create reminder tasks without saying so**

Medium · Design change · effort S · `Property page > Loan, Insurance and Details edit` · Plain, consistent words

- **Migration branch:** Still applies on the migration branch. Unchanged. The loan form still shows a bare 'Maturity date' input (edit-loan.tsx:101), and REMINDERS still creates tasks 60, 30, 21 and 30 days ahead with no hint in the forms or read cards (service.ts:130-135).
- **Today:** Saving a Maturity date, Renewal date or Rental registration expires date creates a task due 60, 30 or 30 days earlier ('Refinance or extend the loan maturing …'). The edit forms show only the bare label, and the read cards never mention the reminder.
- **Why:** Automatic behavior that isn't named feels like a bug when the task shows up, and partners can't trust that a reminder exists without checking Tasks. Monzo and Linear explain automatic effects in one sublabel ('We'll show this for you in Scheduled Payments'; 'When you move an unassigned issue to started, it will be automatically assigned to you').
- **Change:** Add a one-line muted hint under each key-date input: 'Task 60 days before' (maturity), 'Task 30 days before' (insurance renewal, rental registration). In the read card, the existing Maturity or Renewal block gets a second muted line, 'Reminder task Sep 2', linking to that task.
- **Desktop, tablet, phone:** Desktop and tablet: the hint sits under the input in the 2-column grid, short enough for one line at the card's ~165px column. Phone: the grid stays one line per field and the hint fits at 375. At 320 the hint drops to 'Task 60d before'.
- **Reuse:** The per-file label helpers L in edit-loan.tsx:21, edit-insurance.tsx:26 and edit-details.tsx:25 consolidate into one FormField with a hint prop in src/components/ui.tsx. The reminder lead days come from REMINDERS in src/lib/properties/service.ts so the copy can't drift.
- **References:** 
  - [Monzo](https://mobbin.com/screens/f8901c1a-fc08-4218-8263-4cf9471cb998): 'Repeating payment' with the sublabel 'We'll show this for you in Scheduled Payments' names where the automatic result will appear.
  - [Linear](https://mobbin.com/screens/8720abc2-c855-44ee-911d-bc15fc1707eb): Automation rows are sentences that say exactly what will happen and when.
- **Code:** `src/app/(app)/properties/[id]/edit-loan.tsx:101 'Maturity date'`, `src/app/(app)/properties/[id]/edit-insurance.tsx:96 'Renewal date'`, `src/app/(app)/properties/[id]/edit-details.tsx:121 'Rental registration expires'`, `src/lib/properties/service.ts:130-135 REMINDERS (leadDays 60/30/21/30)`, `branch-src/src/app/(app)/properties/[id]/edit-loan.tsx:101`, `branch-src/src/lib/properties/service.ts:130-135`
- **Verification:** confirmed. Verified. REMINDERS in service.ts:130-135 creates tasks 60 days before loan maturity and 30 days before insurance renewal and rental registration expiry. The edit forms show bare labels (p118--loan-edit), and the read cards never mention the reminder. The read-card line linking to the reminder task is the more valuable half. Side note: the 21-day property-tax reminder has no UI field that sets propertyTaxDueDate. References are plausible but I did not spot-check them.

### COPY-IV04

**The move-in form's 'Required' settings aren't enforced**

Medium · Fix · effort S · `Settings > Move-in form, and public /residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** The editor's 'Required' and 'At least one required' checkboxes set minCount to 1. On the public form, minCount only hides the '(optional)' tag next to a section name. Each section starts with max(1, minCount) instances either way. Neither the client submit nor submitMoveInInspection checks ratings or minCount, so a resident can submit a report with every section blank.
- **Why:** The setting promises a rule the product doesn't keep, and the record that protects the deposit can arrive empty. Settings copy has to match behavior.
- **Change:** Enforce it. A required section needs a rating on every item, or at least one instance for repeatable sections. Check it in the zod schema on the server and show it inline under the section on the client ('Rate each item in Kitchen'). Then apply COPY-I14's wording. If Connor doesn't want enforcement, rename the checkbox 'Optional for residents' (inverted) so it says what it does.
- **Desktop, tablet, phone:** The inline error sits under the section header at every width. On phone, submit scrolls to the first incomplete section.
- **Reuse:** submissionSchema in src/app/(marketing)/residents/moving-in/actions.ts; SectionCard in move-in-form.tsx; minCount in src/lib/move-in-form-types.ts.
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:71-78`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:28, 83-105 (no validation), 257 (only use of minCount)`, `src/app/(marketing)/residents/moving-in/actions.ts:35-41 (schema has no minCount check)`, `src/lib/move-in-form-types.ts:8`
- **Verification:** verifier-found

### COPY-V10

**Beds and Baths placeholders '2' and '1' look like saved values**

Medium · Fix · effort S · `Property page > Rentals edit` · Rentals, residents and the public site run one lifecycle

- **Today:** In the listing editor, the empty Beds and Baths inputs show gray placeholders '2' and '1', right beside the empty Rent and Sqft fields. The read row for the same listing says 'No details yet', and /rentals shows 'Details on request'.
- **Why:** A number used as a placeholder in a number field reads as data. An owner can believe beds and baths are set and leave a public listing without details. Zillow's listing form uses real selected values and puts the unit in a suffix, with no example numbers.
- **Change:** Remove the numeric placeholders and leave Beds and Baths empty. Better, make them selects ('Studio', '1', '2', '3', '4+'; '1', '1.5', '2', '2.5+'), which also keeps the stored values consistent.
- **Desktop, tablet, phone:** Same at every width. On phone the grid stacks one field per row.
- **Reuse:** EditListingCard in src/app/(app)/properties/[id]/edit-listings.tsx:368-385; Select in src/components/ui.tsx.
- **References:** 
  - [Zillow](https://mobbin.com/screens/e95c9686-1420-4e46-9a25-385b07651d07): 'Total bedrooms' and 'Total bathrooms' are selects with real values, and 'Square footage' has a 'sq. ft.' suffix. No example numbers.
  - [Attio](https://mobbin.com/screens/380922eb-8c4a-4458-b44c-c4161d8088d5): Empty attributes read 'Set Description…', 'Set Team', never a sample value.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:372 placeholder="2", 381 placeholder="1"`, `src/app/(app)/properties/[id]/edit-listings.tsx:372,381`, `Local DB: Listing rows (3) all with null rent, beds, baths, sqft`, `src/app/(app)/properties/[id]/edit-listings.tsx:372`, `src/app/(app)/properties/[id]/edit-listings.tsx:381`
- **Also found as:** G1D-IV02 (Photos, videos and documents: viewing and capturing, not just the upload box), G2C-I17 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** verifier-found

### COPY-022

**The 'What needs attention' subtitle promises something the page doesn't show**

Low · Design change · effort S · `Home` · Home and Today become one work queue

- **Today:** Under 'Good evening, Connor' the subtitle says 'What needs attention'. The page then shows totals (13 Active deals, 11 Properties, 193 Open tasks), a CapEx table and a task list. Nothing on it is ranked by urgency.
- **Why:** The subtitle makes a promise the page doesn't keep. Mercury's home uses only the greeting.
- **Change:** Make the subtitle a sentence built from data, such as 'Hi Connor, 12 tasks are overdue and 3 are due this week.', or drop it until the D10 'what needs me' Home ships.
- **Desktop, tablet, phone:** One line on desktop and tablet. On phone it's the first line under the greeting and can wrap to two.
- **Reuse:** PageHeader subtitle in components/ui.tsx. (app)/page.tsx:46
- **References:** 
  - [Mercury](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1): 'Welcome, Sam' with no filler subtitle; urgency lives in labeled counts
- **Code:** `src/app/(app)/page.tsx:46`
- **Verification:** partly. The subtitle 'What needs attention' is there as described. Home is being rebuilt as 'what needs me' under settled D10, so this is a one-line polish item until then. The data sentence it proposes is good copy for that rebuild.

### COPY-042

**Create verbs vary and a typed '+' stands in for an icon**

Low · Fix · effort S · `All create and add buttons` · Plain, consistent words

- **Today:** Buttons read '+ New task', '+ New deal', '+ New property', '+ Task' (property card), '+ Add unit', '+ Add listing', '+ Add photo', '+ Add appliance', '+ Add another bathroom', plus submit buttons 'Create task / deal / property' and 'Add' for notes. The '+' is typed text.
- **Why:** '+ Task' is a fragment, and a text plus sign doesn't line up with the rest of the line-icon set.
- **Change:** Page actions: 'New task' with a plus line icon. Inline actions: 'Add unit'. Submits: 'Create task'. Property card: 'Add task'. Note button: 'Add note'.
- **Desktop, tablet, phone:** Same labels everywhere. At 320 a page action can collapse to the icon with an aria-label.
- **Reuse:** Button and LinkButton in components/ui.tsx
- **References:** 
  - [Stripe](https://mobbin.com/screens/cffea421-b951-4ba7-8ddd-571a990d3ed1): Icon plus verb-noun ('Add customer')
  - [Stripe](https://mobbin.com/screens/0e51dae9-65d8-44b9-8541-287ba63a435b): 'Create shipping rate' as both header action and empty-state CTA
- **Code:** `src/app/(app)/properties/[id]/page.tsx:169-172`
- **Verification:** partly. The typed '+' labels are as described, including the fragment '+ Task' on the property card. It's verb and icon polish, so low. The Stripe references are plausible.

### COPY-045

**Field labels change between view and edit mode**

Low · Fix · effort S · `Property Details, Loan, Insurance, Rentals (view vs edit)` · Plain, consistent words

- **Today:** Labels shift between modes. 'Entity' becomes 'Entity / LLC'. 'Rate' becomes 'Rate %'. 'Originated' becomes 'Origination date'. 'Renewal' becomes 'Renewal date'. Details says 'Sq ft' where the listing says 'Sqft'. The listing's 'Available' date field sits next to a status option that is also called 'Available'.
- **Why:** The same field shouldn't rename itself when it's edited.
- **Change:** Use one label in both modes: 'Entity', 'Rate', 'Originated', 'Renewal', 'Sq ft', and 'Available from' for the date.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** edit-details.tsx:62/112, edit-loan.tsx:61-67/94-101, edit-insurance.tsx:47/96, edit-listings.tsx:340-359
- **Code:** `src/app/(app)/properties/[id]/edit-details.tsx:62,112`, `src/app/(app)/properties/[id]/edit-loan.tsx:61-67,94-101`
- **Verification:** partly. Confirmed in edit mode: 'Entity / LLC', 'Rate %', 'Origination date', and the Loan card's 'Maturity' becomes 'Maturity date'. Details says 'Sq ft' and the listing says 'Sqft' (edit-listings.tsx:359). It's label polish, so low.

### COPY-052

**Setup instructions and env var names are shown to end users**

Low · Fix · effort S · `File uploads, Financials when QuickBooks isn't connected` · Plain, consistent words

- **Today:** A failed upload says 'Connect a Blob store in Vercel (Storage tab) to turn on file uploads.' The not-connected Financials pages list 'QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_TOKEN_SECRET' and 'QBO_*'.
- **Why:** Contractors and Pieter can't act on Vercel or env vars. These belong in the README and the logs.
- **Change:** Users see 'Uploads aren't available right now. Try again later.' and 'QuickBooks isn't connected · Connect'. Log the env detail server-side.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** components/attachments.tsx:71, financials/page.tsx:27-38, financials/settings/page.tsx:22-32
- **Code:** `src/components/attachments.tsx:71`, `src/app/(app)/financials/page.tsx:27-38`, `src/app/(app)/financials/page.tsx:23-44`, `src/app/(app)/financials/settings/page.tsx:18-38`
- **Also found as:** FINANCIALS-067 (Financials, rent roll and financial settings)
- **Verification:** partly. Both strings exist (attachments.tsx:71, financials/page.tsx:34-36). They only appear in a misconfigured environment, not in normal production use, so low.

### COPY-062

**'HG Login' in the public nav should become 'Sign in' before contractors use it**

Low · Design change · effort S · `Public header` · Plain, consistent words

- **Migration branch:** Still applies on the migration branch. Signed out, the /login header links read 'HG CAPITAL PARTNERS', 'Rentals', 'Residents', 'HG Login'. AuthFrame still shows the gold 'HG Login' eyebrow above the form, and /login has no H1 (h1 count 0). This now matters more: under D14, contractors sign in on this same page, and every forgot, reset and first-password screen uses the same frame.
- **Today:** The public nav ends with 'HG Login', styled as the quietest link. The login page eyebrow repeats 'HG LOGIN'.
- **Why:** Contractors are about to use this door. 'Sign in' is the universal verb, and 'Login' is a noun.
- **Change:** Rename the nav link 'Sign in' and keep it quiet. The page H1 is also 'Sign in' (see COPY-018).
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** components/public/header.tsx:34-39
- **Challenges:** src/components/public/header.tsx cites PRD §3: 'Primary navigation: Rentals | Residents | HG Login'.
- **References:** 
  - [Mercury](https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7): Plain 'Log in' wording for the door
- **Code:** `src/components/public/header.tsx:38`, `src/app/login/_components/auth-frame.tsx:29`, `src/app/login/page.tsx:23-55`, `eval /login (session none): h1 count 0; header links [HG CAPITAL PARTNERS, Rentals, Residents, HG Login]`
- **Verification:** confirmed. Verified: the nav ends in 'HG Login' (the dimmest link), and the eyebrow repeats it. conflicts_with correctly cites the PRD line.

### COPY-063

**The 'HG Capital OS' wordmark reads as a template name**

Low · Design change · effort S · `App top bar` · Plain, consistent words

- **Today:** The top bar shows 'HG Capital OS', and the site description is 'Internal operating system for HG Capital'. The public brand is 'HG Capital Partners'.
- **Why:** 'OS' is SaaS-template language. Stripe and Mercury show only the company name.
- **Change:** Wordmark 'HG Capital', or an 'HG' monogram at 320. Tab titles end in '· HG'.
- **Desktop, tablet, phone:** Full name on desktop and tablet, monogram on phone.
- **Reuse:** components/app-shell.tsx:84, app/layout.tsx:10-11
- **References:** 
  - [Mercury](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1): Top-left shows the company name only
- **Verification:** confirmed. Verified: the app-shell wordmark is 'HG Capital OS' (app-shell.tsx:84), and the metadata description is 'Internal operating system for HG Capital'.

### COPY-067

**Every system's Type field says 'e.g. Shingle', and default costs look like entered values**

Low · Fix · effort S · `Property > Building CapEx (edit)` · Plain, consistent words

- **Today:** Windows, Main Sewer Line, Garage and Exterior Siding all use the Type placeholder 'e.g. Shingle'. The cost fields show the rule default ('$25,000') as a placeholder, so empty fields look filled.
- **Why:** A roof example on a sewer line is wrong, and placeholder costs blur 'not set' with 'set'.
- **Change:** Give each system its own example (Windows 'Vinyl', Sewer 'Clay', Siding 'Vinyl'). Cost placeholder: 'Default $25,000'.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** properties/[id]/building-capex.tsx:198-209
- **References:** 
  - [Basecamp](https://mobbin.com/screens/7ae39ce1-3be5-478b-be01-abd019105b6c): Empty fields use placeholders that name the action ('Type names to assign…', 'Select a due date…') and never a sample value that looks entered. The same applies to the listing editor's Beds '2' and Baths '1' placeholders.
- **Verification:** confirmed. Verified: one hard-coded placeholder 'e.g. Shingle' for every system (building-capex.tsx:198), and the cost placeholder is fmtMoney(item.defaultCost) (line 225).

### COPY-I01

**Write a one-page HG writing guide with a glossary and before-and-after pairs**

Low · New capability · effort S · `All screens (docs/writing.md, linked from CLAUDE.md Copy)` · Plain, consistent words

- **Today:** The copy rules live as bullets in CLAUDE.md. docs/ holds components.md and two plans. Naming drift on screen is real: nav 'Vendors' vs 'Contractors'; 'Mark done' (list checkbox) vs 'Mark complete' (task page); and for one field, 'Project', 'Property' and 'Address' plus 'Owner' and 'Assignee'. But D11 in the approved spec already fixes the main nouns.
- **Why:** Monzo teaches its writing principles to every hire, so screens written by different people still sound like one company. HG now has two partners, Claude sessions and soon contractors reading the app. Rules without a glossary and examples get applied one screen at a time, which is how the existing 73 findings piled up.
- **Change:** Add docs/writing.md, one page with four parts. 1) Glossary: one noun per object (Property, Unit, Deal, Task, Contractor, Resident, Move-in report) and one label per field (Assignee, Due date, Property, Notes). 2) Button grammar: verb plus object ('Create task', 'Save changes', 'Discard changes'), 'Cancel' as the only way out, an ellipsis when a further step follows ('Reset to defaults…'). 3) Status and dates: you and we sentences, a real date before a relative one, 'yesterday' only for yesterday. 4) Ten before-and-after pairs taken from real HG screens. Link it from the Copy section of CLAUDE.md, and export the glossary from the strings module the existing concept proposes so lint can catch banned synonyms.
- **Desktop, tablet, phone:** Not a UI change. It shapes copy at every width. The guide includes a 'phone length' column for labels that must shorten at 375 (for example 'Live on site' instead of 'Live on hgcapitalpartners.com').
- **Reuse:** Extends the CLAUDE.md Copy rules and the eslint em dash rule in eslint.config.mjs. The new doc sits beside docs/components.md.
- **References:** 
  - [Monzo](https://mobbin.com/screens/3e158bc0-23e0-484d-9742-1064ad6c458b): The voice to emulate: every action row is a short title plus a one-line sublabel in plain words ('Have anyone pay you back, instantly').
  - [Basecamp](https://mobbin.com/screens/56f50dc4-7b99-409c-9d84-4bd6795fb5f3): Button grammar for the guide: 'Save card', 'Save and add another', 'Never mind'. An empty column that says what will happen: 'When you add the first card, it will start in this column.'
- **Code:** `CLAUDE.md (Copy section)`, `docs/ (components.md, property-page-plan.md, task-templates-plan.md only)`, `src/app/(app)/contractors/page.tsx:24 title 'Vendors' with subtitle '... contractors & service providers'`, `src/app/(app)/properties/[id]/edit-units.tsx:103 'Save' vs :147 'Save changes'`
- **Verification:** partly. A glossary is useful, but this is a process doc, not something a user sees, so medium is too high. D11 in the approved migration spec already settles three of its nouns ('Contractors', 'Assignee', 'Property'), so the glossary should start from D11 and not reopen it. It would fit better as a short Glossary block inside the existing CLAUDE.md Copy section than as a new doc plus a strings module and lint tooling. That extra tooling is scope creep. Some evidence is weak. In edit-units.tsx, 'Save' (the header button) and 'Save changes' (inside the discard dialog) are different contexts, and the dialog wording is the correct restating pattern. The '73 findings' claim can't be verified. I did not spot-check the Monzo and Basecamp references, but they look plausible for a voice guide.

### COPY-I07

**Create forms end in one button, with no way back and no 'add another'**

Low · Design change · effort S · `New task, New deal, New property forms` · Create where you are

- **Migration branch:** Still applies on the migration branch. New task still ends in a single Create task button (new/page.tsx:59), with no Cancel and no BackLink above the title. New deal and New property are unchanged.
- **Today:** The create pages end in one primary button with no Cancel. Unlike every detail page, they also have no BackLink above the title.
- **Why:** Basecamp, Stripe and Jobber all pair the commit with a named way out ('Never mind', 'Cancel') and, where batches are common, a 'Save and add another' ('Submit and create another'). HG is about to re-enter Asana work in bursts, and a one-button dead end is the opposite of 'no dead ends'.
- **Change:** Add a text-style 'Cancel' that returns to where the user came from. On New task only, add a secondary 'Create and add another' that keeps Property and Assignee filled. New deal and New property keep a single primary.
- **Desktop, tablet, phone:** Desktop and tablet: primary, then secondary, then Cancel on one row under the form. Phone: the primary is pinned full width at the bottom, 'Create and add another' sits as a secondary above it, and Cancel moves to the top-left as a back link.
- **Reuse:** Button variants in src/components/ui.tsx; BackLink in src/components/back-link.tsx for the return target.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/56f50dc4-7b99-409c-9d84-4bd6795fb5f3): 'Save card', 'Save and add another', 'Never mind' all name exactly what happens.
  - [Stripe](https://mobbin.com/screens/d280c443-8062-4fa4-a9f8-170ab2f1ccc6): 'Submit and create another' beside 'Submit payment', with a close X as the way out.
  - [Jobber](https://mobbin.com/screens/29ca5a7a-f0a8-48f6-bce2-d1e3fa4bb9fb): 'Cancel' on the left, 'Save Job' and 'Save And…' on the right.
- **Code:** `src/app/(app)/tasks/new/page.tsx:69`, `src/app/(app)/deals/new/page.tsx:54`, `src/app/(app)/properties/new/page.tsx`, `branch-src/src/app/(app)/tasks/new/page.tsx:24-27,59`, `branch-src/src/app/(app)/deals/new/page.tsx`
- **Verification:** partly. True: New task, New deal and New property have no back link and no Cancel. The task, deal, property and contractor detail pages all use BackLink, so adding BackLink to the create pages is the clean fix and reuses an existing pattern. 'Create and add another' adds chrome, and its premise is wrong. D24 imports open Asana tasks by script, so there is no manual re-entry burst. Drop that part to meet the simplicity bar.

### COPY-I08

**Mark the optional fields, not the required one with an asterisk**

Low · Design change · effort S · `New task, New deal, New property forms` · Create where you are

- **Migration branch:** Still applies on the migration branch. 'Title *' is still the label and the accessible name ('textbox "Title *"'). The form now pairs that one required field with six optional ones (Description, Assignee, Due date, Status, Repeats, Property). 'Address *' remains on New deal and New property.
- **Today:** Required fields carry a bare asterisk ('Title *', 'Address *'), and the accessible names include it ('Address *'). The public move-in form marks the other way, with 'Comment (optional)'. Each app form has exactly one required field.
- **Why:** An asterisk is a symbol to decode, and two conventions in one product read as unfinished. Stripe and Wise label the exception in words ('Optional', '(Optional)') and leave required fields plain.
- **Change:** Remove the asterisks. Where a form mixes required and optional fields, add a muted 'Optional' after the label of each optional one. With a single required field, the required state shows only through the inline error (COPY-I09). Accessible names become 'Title' and 'Address'.
- **Desktop, tablet, phone:** Same at all widths. 'Optional' sits inline after the label and never wraps at 320.
- **Reuse:** The FormField wrapper proposed in COPY-I04 takes an optional prop. Form labels in tasks/new, deals/new and properties/new page.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/33ac0681-6062-4323-8e54-032447ffb983): 'Customer' with a muted 'Optional' tag. Required fields carry no mark.
  - [Wise](https://mobbin.com/screens/5ddf876c-29ce-431e-ba93-631c56534dfe): 'Trading Business Name (Optional)' among plain required labels.
  - [Stripe](https://mobbin.com/screens/f1abdc0b-be78-46a6-aff4-4413503146f8): "Estimated shipping time" label with a small Optional chip.
- **Code:** `src/app/(app)/tasks/new/page.tsx:30 'Title *'`, `src/app/(app)/deals/new/page.tsx:15 'Address *'`, `src/app/(app)/properties/new/page.tsx:15 'Address *'`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:316 'Comment (optional)'`, `branch-src/src/app/(app)/tasks/new/page.tsx:33-34`, `branch-src/src/app/(app)/properties/new/page.tsx:15`, `branch-src/src/app/(app)/deals/new/page.tsx:15`, `src/app/(app)/properties/new/page.tsx:15-31`
- **Also found as:** PORTFOLIO-043 (Portfolio list and new property)
- **Verification:** confirmed. Verified. 'Title *' and 'Address *' are in the label text and the accessible names, while the public move-in form uses '(optional)'. The real problem is two conventions in one product. An asterisk isn't wrong in itself: Zillow's own listing flow uses red asterisks (Mobbin 1794eb49). With one required field per form, dropping the mark is safe.

### COPY-I10

**Confirm dialogs should name the object and restate the action on the button**

Low · Design change · effort S · `Confirm dialogs (CapEx rules reset, Units and Rentals discard, Move-in form discard)` · Plain, consistent words

- **Today:** There are three wordings for one job. CapEx: 'Reset all CapEx rules to defaults?' with a button reading only 'Reset'; the trigger 'Reset to defaults' gives no hint that a step follows. Units: 'Discard unsaved changes?' with the body 'You have unsaved changes to units & access. Save them, or discard and exit.', which repeats the heading, then 'Keep editing', 'Discard', 'Save changes'. Move-in form: 'Discard changes?' with 'Keep editing', 'Discard'. The Units and Rentals dialogs are inline copies, not ConfirmDialog.
- **Why:** Stripe's buttons restate the decision ('No, keep refund' and 'Yes, cancel refund'; 'Refund MYR 0.50'), and Gusto puts the amount on the commit. A bare 'Reset' or 'Discard' makes the reader go back to the heading, and a body that repeats the heading breaks HG's own copy rule.
- **Change:** Use one pattern. The heading asks with the object ('Leave Units & access without saving?'). The body says what's lost, in numbers ('1 new unit won't be kept.'). Buttons restate the verb: 'Keep editing', 'Discard changes', 'Save changes'. For CapEx, the trigger becomes 'Reset to defaults…' and the confirm button 'Reset all rules', with the body naming the count of custom rules that will be lost. Move the inline copies onto ConfirmDialog.
- **Desktop, tablet, phone:** Desktop and tablet: centered dialog, buttons on one row. Phone: the dialog becomes a bottom sheet with full-width stacked buttons, primary at the bottom. Labels stay at two words so they never wrap at 320.
- **Reuse:** ConfirmDialog in src/components/confirm-dialog.tsx; consolidates the inline dialogs in edit-units.tsx:124-150 and edit-listings.tsx:185 as docs/components.md already recommends.
- **References:** 
  - [Stripe](https://mobbin.com/screens/49670294-fe7b-4294-989a-cf7ba72ff1d1): 'No, keep refund' and 'Yes, cancel refund': both buttons restate the decision.
  - [Stripe](https://mobbin.com/screens/c16180c0-adea-4054-b67d-8bc187348fcb): The commit button carries the exact stakes ('Refund MYR 0.50'), and a one-line callout states the consequence.
  - [Gusto](https://mobbin.com/screens/d62d575b-799c-48bb-a550-973ab7e1da8c): 'Confirm $28,976.77 withdrawal and submit payroll' restates the amount and action.
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:396-410`, `src/app/(app)/properties/[id]/edit-units.tsx:135-147`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:181-195`
- **Verification:** partly. The wording is as described. Units and Rentals use inline dialog copies whose body repeats the heading, CapEx has a bare 'Reset', and move-in uses 'Discard'. But these dialogs show up rarely, so medium is high. docs/components.md already says to grow ConfirmDialog into a Dialog shell (it also lacks Esc and a focus trap, as do the inline copies), so the copy pass should ride on that consolidation. Counting lost items ('1 new unit won't be kept') needs a diff, which may push effort past S. Stripe reference 49670294 verified: 'No, keep refund' / 'Yes, cancel refund'.

### COPY-I14

**'Max instances' and 'At least one required' don't say what residents will see**

Low · Design change · effort S · `Settings > Move-in form editor` · Rentals, residents and the public site run one lifecycle

- **Today:** Repeatable sections show 'Max instances [3]' and 'At least one required'; single sections show 'Required'. These checkboxes aren't enforced anywhere: a resident can submit with every section blank.
- **Why:** 'Instances' is a developer word, and a checkbox label that names a validation rule makes the owner translate it into the resident's experience. Linear and Monzo write each setting as its effect in plain words.
- **Change:** Rewrite each control as a sentence about the resident. Repeatable sections: 'Residents can add up to [3] bathrooms' and a checkbox 'Residents must add at least one'. Single sections: a checkbox 'Residents must rate every item'. The section name fills the noun so the sentence is always specific.
- **Desktop, tablet, phone:** Desktop and tablet: the sentence and its input sit on one row above the items. Phone: the sentence wraps the number input inline and the checkbox goes below, one line each at 375. At 320 'Residents can add up to [3]' drops the noun.
- **Reuse:** SectionEditor in src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:30-105.
- **References:** 
  - [Linear](https://mobbin.com/screens/8720abc2-c855-44ee-911d-bc15fc1707eb): Settings written as the behavior they cause ('When you move an unassigned issue to started, it will be automatically assigned to you').
  - [Monzo](https://mobbin.com/screens/8c95c08a-80ac-4a31-b033-a54411f895c2): Each toggle carries a sublabel saying what the person will get ('Receive a monthly email reminder when a new bank statement is available').
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:55 'Max instances'`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:78 'At least one required' / 'Required'`
- **Verification:** partly. The labels are as described. But the proposed copy would promise behavior that doesn't exist. 'Required' and 'At least one required' only set minCount, which on the public form just hides the '(optional)' tag (move-in-form.tsx:257). Neither the client submit nor submitMoveInInspection checks it. Rewriting the label as 'Residents must rate every item' would make the false promise explicit. Enforce it first (COPY-V04), or label it as what it does. 'Max instances' to 'Residents can add up to [3]' is a good change.

### COPY-I15

**'Save' publishes to the live resident form without saying so**

Low · Design change · effort S · `Settings > Move-in form editor` · Rentals, residents and the public site run one lifecycle

- **Today:** The editor header shows 'Settings', the subtitle 'Rooms and items tenants rate on the move-in inspection', then 'Save' and 'Cancel'. Saving revalidates /residents/moving-in, so the next resident sees the change immediately. There's no preview link and no word that this is public.
- **Why:** An owner editing a public form should know that Save means publish. Basecamp labels the commit by its effect ('Post this message') beside who will see it, and Zillow pairs edit with 'View your listing'.
- **Change:** Rename the button 'Publish changes'. Replace the subtitle with one line, 'Residents see changes on their next report', followed by a 'Preview form' link to /residents/moving-in.
- **Desktop, tablet, phone:** Desktop and tablet: the line and link sit under the title, with buttons on the right. Phone: buttons pin to the bottom bar and the line stays under the title with the link on its own line.
- **Reuse:** PageHeader actions in move-in-form-editor.tsx:154-166; LinkButton from src/components/ui.tsx.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/0bc24c79-1906-420b-8c71-4c4c9fada060): The commit says what it does ('Post this message'), with 'Save a draft' as the private alternative and the audience stated below.
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): 'View your listing' sits next to 'Edit your listing', so the public result is one click away.
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:154-166`, `src/app/(app)/settings/move-in-form/actions.ts:67-68 revalidatePath('/residents/moving-in')`
- **Verification:** confirmed. Verified: the subtitle is 'Rooms and items tenants rate on the move-in inspection', the buttons are Save and Cancel, and actions.ts:67-68 revalidates /residents/moving-in. Zillow reference cc09445f verified: 'View your listing' sits beside 'Edit your listing'.

### COPY-I18

**Empty choices read 'None', 'Unassigned' and 'No project' for the same idea**

Low · Fix · effort S · `Task row, task page, New task, New property, task filters` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The task page now says 'No property' and 'No unit' (fields.tsx:123-124,140), and the assignee picker and All filter say 'Unassigned'. 'No project' is gone. Still 'None': Property on New task (new/page.tsx:50) and Status on New property (properties/new/page.tsx:22). The All filters read 'All assignees' and 'All properties' (filters.tsx:87-88,124).
- **Why:** A bare 'None' in a closed select doesn't say none of what. Mixing three forms for one idea is the inconsistency the glossary should remove. Linear names the field in the empty value ('No assignee').
- **Change:** Two strings are left: New task Property 'None' should be 'No property', and New property Status 'None' should be 'No status'. Keep 'Unassigned' for the empty assignee, since the picker and filter already agree on it.
- **Desktop, tablet, phone:** Same text at all widths. These are native or React Aria pickers that size to their content.
- **Reuse:** src/app/(app)/tasks/task-row.tsx:170 and 218, tasks/new/page.tsx:41 and 58, properties/new/page.tsx:22, tasks/filters.tsx:79-80, tasks/[id]/task-detail.tsx:194.
- **References:** 
  - [Linear](https://mobbin.com/screens/b9104519-abc8-4638-a2fc-206bea260188): The empty group is labeled 'No assignee', naming the field and not just 'None'.
- **Code:** `src/app/(app)/properties/new/page.tsx:22`, `branch-src/src/app/(app)/tasks/[id]/fields.tsx:123-124,140`, `branch-src/src/app/(app)/tasks/new/page.tsx:50`, `branch-src/src/app/(app)/properties/new/page.tsx:22`, `branch-src/src/app/(app)/tasks/filters.tsx:87-88,124`
- **Verification:** confirmed. Verified: 'None' (task row, New task Property, New property Status), 'Unassigned' (New task, row, filter) and 'No project' (task page). It matches D11's settled names. The fix should also cover the list's other names for the same fields: the column headers 'Address' and 'Owner', the filter 'All owners' and the tooltip 'Remove owner'. Mobbin didn't return the exact Linear screen b9104519 for me. Other Linear screens returned show named empty values ('No priority', ffa2e456), which support the same point.

### COPY-I19

**Write Waiting and Review as sentences that name who acts next**

Low · New capability · effort M · `Tasks list and task page (with the settled Waiting and Review statuses)` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Built per the approved spec. Waiting shows its reason under the title ('Waiting on {reason}', tap to edit, status-control.tsx:105-117) and as an amber chip in Today's Waiting section (task-row.tsx:60-65). Review shows the banner '{First} marked this done · N photos' with Approve and Send back (review-banner.tsx:36-48), and a Needs review section lists the person's avatar and first name. Status labels are the seven settled ones, and the 'Mark done' / 'Mark complete' split is gone. :3300 has no Waiting or Review rows to view live. The only part of the finding not covered is how long a task has been Waiting.
- **Why:** Ramp's approval inbox, Brex and Wise all make the next actor explicit ('Pending review from …', 'We pay out your SGD'). A bare 'Waiting' chip on 2,086 tasks shared by two partners and contractors repeats Asana's main failure: you can't tell whose move it is.
- **Change:** Keep the reason line and banner as built. Add only the start date on the task page, 'Waiting on city inspection since Oct 2', taken from the latest STATUS event to WAITING. Lists keep the reason chip.
- **Desktop, tablet, phone:** Desktop: the full sentence in the status column. Tablet: chip plus first name. Phone: the two-line row shows the chip on line two with the first name, and the date drops.
- **Reuse:** Badge tones in src/components/ui.tsx; task-row.tsx and task-detail.tsx. Builds on the settled seven statuses.
- **References:** 
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): Status reads 'Flagged for review on Dec 19, 2024', then 'Pending review from {name} (admin) or 10 others': state, person and date.
  - [Wise](https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614): Each step is a sentence about who does what ('We received your SGD', 'We pay out your SGD').
- **Code:** `prisma/schema.prisma:203-206 enum TaskStatus { OPEN DONE }`, `src/app/(app)/tasks/[id]/task-detail.tsx:59`, `branch-src/src/app/(app)/tasks/[id]/status-control.tsx:105-117`, `branch-src/src/app/(app)/tasks/[id]/review-banner.tsx:36-48`, `branch-src/src/app/(app)/tasks/task-row.tsx:60-68`, `branch-src/src/lib/task-scope.ts:47-55`
- **Verification:** partly. Mostly already settled. D6 gives Waiting a reason, and the spec has a Review banner ('Zack marked this done · 4 photos [Approve] [Send back]'), a 'Needs review' group and contractor rows with status and target date. 'Needs your review' versus 'With Pieter for review' assumes one designated reviewer. That conflicts with D6b and approved default 3: both partners get the email, and either can approve. What's left is adding 'since {date}' to Waiting. I did not spot-check the Brex and Wise references.

### COPY-I20

**Square feet is written 'Sq ft', 'Sqft' and 'sqft' on one page**

Low · Fix · effort S · `Property page > Details and Rentals` · Plain, consistent words

- **Today:** Details labels the field 'Sq ft'. The listing editor labels it 'Sqft', and the listing read row prints '1,200 sqft' next to 'bd' and 'ba'.
- **Why:** Three spellings of one unit on one page is the kind of small inconsistency that makes data look hand-entered. Stripe and Mercury format units through one helper.
- **Change:** Use 'sq ft' everywhere, written lowercase after a number ('1,200 sq ft') and as 'Square feet' when it's a field label. Keep 'bd' and 'ba' only in compact rows and spell out 'Beds' and 'Baths' as labels. Put the abbreviations in the glossary and a fmtArea helper.
- **Desktop, tablet, phone:** Same at all widths. Compact abbreviations are what make the phone row fit.
- **Reuse:** src/lib/utils.ts gains fmtArea next to fmtMoney; edit-details.tsx:61 and 111, edit-listings.tsx:236 and 359.
- **Code:** `src/app/(app)/properties/[id]/edit-details.tsx:61`, `src/app/(app)/properties/[id]/edit-listings.tsx:236,359`
- **Verification:** confirmed. Verified: 'Sq ft' (Details), 'Sqft' (listing editor) and 'sqft' (listing read row and the public card). The same rows also skip thousands separators. The app read row prints rent as `$${rent}/mo` and sqft raw ('$1500/mo', '1200 sqft'), while Details shows '4,593' and /rentals uses toLocaleString for rent. The fmtArea helper should fix both. Zillow writes the unit as a field suffix ('sq. ft.', Mobbin e95c9686).
