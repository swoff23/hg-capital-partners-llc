# Portfolio list and new property

Part of the [UI/UX review](README.md). 34 findings: 0 critical, 2 high, 17 medium, 15 low.

## How it should work

Portfolio is the one page that answers two questions: what is the book worth, and which buildings need us. Under D10 each property sits in the sidebar, so this page is an overview, not the way in.

Header. The title and an icon-plus New property button, as quiet as Airbnb's Your listings (https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c). While key facts are missing, one pinned line above everything names the blocker, the way Airbnb pins "Confirm a few key details" on web and phone (https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a). Today it would read "Insurance and loan dates missing on 11 properties". Fill in opens a grid where each empty cell says Add, after Brex's Missing documentation queue (https://mobbin.com/screens/47dfde64-0ad0-41c6-978c-c56480db69de).

Figures. Value, Debt, Equity and Rent sit in one Geist Mono strip shaped like Copilot's Assets and Debts header (https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099). It recomputes for the chosen segment, as Mercury's summary does under a filter (https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05), counts only HG's share of the 58 Mariner joint venture, and rests on a loan balance people can see and correct.

Table. Segments for All, Rehabbing, Stabilized and Sold follow Zillow's Properties (https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47). Each row has a cover photo or a neutral building tile, the street, one status badge, units with vacancy, Value, Equity with LTV, and one Needs attention line. Rehabbing rows add months elapsed against months planned, read like Flighty's slipped times (https://mobbin.com/screens/e5d1a616-c644-4ef6-aa4c-9f9830292c9c). Entity becomes a group-by with subtotal rows, as in Copilot's accounts. On desktop, checking rows raises a bar with their combined figures for a refi package, after Shopify's bulk bar (https://mobbin.com/screens/2f59c8fc-2374-4fc4-9157-0767616b7f74).

Below the table. A Next 90 days list of insurance renewals, tax installments and loan maturities, shaped like Copilot's Recurrings (https://mobbin.com/screens/c7b52d0f-77d7-4434-b991-b0b2f20ad225), then the 5-year CapEx forecast moved from Home.

Phone. Rows reflow to two lines like Shopify's iOS Products (https://mobbin.com/screens/a49bce9c-6f95-4c9b-a877-d2c79a8e77c0): photo, street and badge, then units, value and any problem in red. Status headers replace the segment control. Selection, the fill-in grid and group-by stay on desktop.

Creating. Unchanged from the earlier concept: a side sheet with a closed-deal picker or a validated address, as in Zillow's Add property (https://mobbin.com/flows/45f9651a-dd33-4d39-9e78-88f40c08373b), plus an entity combobox, landing on the new property.

Left out on purpose: a card grid. Airbnb's photo cards are the right signature, but no property has a photo yet, so cards wait until every building has a cover.

<details><summary>What the reviewer covered</summary>

Server on :3200 was up; everything below was exercised against it through the read-only helper (all writes aborted).

/properties: viewport shots at desktop 1280, laptop 1440, wide 1920, tablet 768 and mobile 375 in light (Chromium); 320 in light; desktop and mobile in dark (with row hover); mobile and tablet in WebKit, including scrolled states; ARIA snapshots at four sizes. I measured link targets (222x18px), row height (37px), the nested table scroll box (tablet 717px of 857px content, mobile 467px of 1337px, totals row off-screen) and sideways page scroll (none). I also cross-checked every row against its property page by fetching all 11 /properties/[id] pages. Units disagree on 5 of 11 rows. Overdue tasks counted per property: 78 of 137 open tasks are past due as of 2026-10-22. Loan amounts are empty on all 11, and 415 Crescent's insurance renewal (Sep 30, 2026) has passed. The rent roll has no QuickBooks classes mapped. There is no sort, filter or Cancel to exercise; the only click target is the address link.

/properties/new: desktop, tablet and mobile in light; 320 and tablet in dark. Tested an empty submit (native browser bubble), a 2-character address, a valid duplicate address, the native status select open, and the pending state (none). Because writes are aborted, I could not observe the real server response. The zod crash path for short or whitespace-only addresses and the silent ?dup=1 redirect are verified from code: actions.ts:16-29, server-action.ts:34-41, service.ts:49-54, and properties/[id]/page.tsx (no searchParams). Cancel does not exist.

Also read: Home (/) for the portfolio CapEx card and stat tiles, /financials/rent-roll, /tasks?property= filter, docs/components.md, ui.tsx primitives, config.ts statuses, the Prisma Property and Deal models, and normalize.ts.

Mobbin: 15 searches (web and iOS screens, plus one flows search). Ramp and Brex returned no screens, so I cite Stripe, Mercury, Zillow, Origin, Attio, YNAB, Copilot, HoneyBook, Quicken, PayPal, Nextdoor, Jira, Docusign, Airbnb, Google, Plane and Unify.

Mobbin returned this notice, reproduced word for word:
---

**Your Mobbin AI usage is high this month**

Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect. [View usage and plan options](https://mobbin.com/settings/billing-and-usage)

</details>

## Findings

### PORTFOLIO-004

**Replace the phone table with stacked property rows**

High · Design change · effort M · `/properties` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 and 320 the 7-column table scrolls sideways and vertically inside a 467px box. Addresses wrap to five lines ("118 / Congress / St. / Buffalo, / NY 14213"), entity wraps to four, and Units, Purchase and Value are off-screen unless you swipe inside the card.
- **Why:** On a phone the job is "which building, what state, is anything wrong". A sideways-scrolling table hides the money and the problems, and feels like a desktop page shrunk down rather than a designed phone view.
- **Change:** Below md, render each property as one tappable row. Line 1: the street (shortAddress, medium weight) with the status Badge right-aligned. Line 2, muted, in Geist Mono for the figures: "3 units · $430K · 14 overdue". Drop entity and purchase on phone. Rows are at least 56px tall with a full-row tap target.
- **Desktop, tablet, phone:** Desktop 1280: table. Tablet 768: table with fewer columns (PORTFOLIO-019). Phone 375 and 320: stacked rows. Drops entity, purchase and the ZIP; keeps status, units, value and the attention count.
- **Reuse:** New feature-only composition beside the page, using Badge, fmtMoney({compact:true}) and shortAddress. Same breakpoint approach as AppShell.
- **References:** 
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): iOS Orders: two-line rows with the identifier left and the amount right-aligned on line one, context on line two, status chips below. The exact reflow for a property row (street and value, then units and status).
  - [Shopify](https://mobbin.com/screens/a49bce9c-6f95-4c9b-a877-d2c79a8e77c0): iOS Products: thumbnail, name, a red problem sublabel ('0 available') and a status badge pinned right. Shows where Needs attention and the badge sit on a phone row.
  - [Stripe Dashboard](https://mobbin.com/screens/d8b72d98-48cd-4829-ad08-309ae833dfe4): The table collapses to rows: the primary figure and status on line 1, context on lines 2 and 3.
  - [Mercury](https://mobbin.com/screens/7748c548-8c81-4258-87cd-33b7787a57cf): Account name over its balance, a plain list with no card chrome.
  - [Lemonade Insurance](https://mobbin.com/screens/3bb68680-0522-4190-99a9-587e2557bcad): Property address card with the status chip in one fixed spot.
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): Host 'Your listings' leads with the property photo and an 'Action required' pill
- **Code:** `src/app/(app)/properties/page.tsx:50-98`, `probe: 'DIV.w-full.max-w-full 620x1337 in 341x467'`
- **Also found as:** MOBILE-011 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. Seen at 375 and 320. The table box is 467px (398px at 320) over 1337px of content and 620px of width inside a 341px box, so it scrolls both ways. Address cells wrap to 5 lines and rows are 117px. The references are plausible. The recommendation removes columns rather than adding chrome.

### PORTFOLIO-006

**Add a four-figure portfolio strip and drop the count subtitle and totals footer**

High · Design change · effort M · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** The page header is "Portfolio" with the subtitle "11 owned properties". The only aggregates are a bold tfoot row at the bottom of the table (Open tasks 137, Units 31, Purchase $2,644,650, Value $4,973,000). There is no debt, equity or rent anywhere on the page.
- **Why:** "See the whole portfolio at a glance" is the page's first job. Stripe, Mercury and YNAB lead with the few numbers that matter, in large type, before any table. A footer row at the bottom of a scroll box is the opposite of at a glance.
- **Change:** Under the header, show one row of four Kpi tiles:
- **Value:** $4.97M.
- **Debt:** sum of currentLoan, or loanOriginalAmount as a fallback.
- **Equity:** value minus debt.
- **Rent / mo:** last full month from the rent roll.

Any figure without enough data shows "—" plus a muted one-line reason on hover, for example "Loan amounts missing on 11". Remove the subtitle and the tfoot, since the strip restates both.
- **Desktop, tablet, phone:** Desktop 1280: 4 across. Tablet 768: 4 across, compact type. Phone 375: 2x2 grid with Value and Equity first. Drops the hover reason on touch; tap opens it.
- **Reuse:** Kpi from src/app/(app)/financials/_components/ui.tsx, moved to src/components/ before reuse (as docs/components.md says). Home's Stat tile is the other candidate; fold them into one.
- **References:** 
  - [Copilot](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099): Accounts page opens with Assets and Debts side by side above the grouped account list. Take the pairing of value and debt in one quiet header.
  - [Shopify](https://mobbin.com/screens/d47da099-6b76-4b32-a93d-843cb498d1de): Orders index: a single KPI bar sits directly above the table, flat and the same width, so the figures read as the table's summary.
  - [Mercury](https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05): Net change, Money in and Money out as plain label-over-figure pairs with no cards around them; the strip recomputes under an active filter.
  - [YNAB](https://mobbin.com/screens/4d946d9e-a904-426c-b36c-0b1782ab3938): One headline figure with Assets and Debts beneath it, nothing else.
  - [Mercury](https://mobbin.com/screens/607720b2-bd1f-4d7f-90e0-aa31e341fd92): Big balance figure with an accounts list beside it; figures in tabular type with small cents.
  - [Copilot](https://mobbin.com/screens/4e13cc80-a9e1-48b0-8882-c8857758acc5): Net worth card splitting Assets and Debts as two quiet figures.
- **Code:** `src/app/(app)/properties/page.tsx:35-43`, `src/app/(app)/properties/page.tsx:87-97`
- **Verification:** confirmed. The observation is right, and Debt and Equity can ship with real numbers today. currentLoan is filled on all 11 properties (imported from SREO column N, scripts/migrate/01-properties.ts:125), so the example reason 'Loan amounts missing on 11' is wrong; only loanOriginalAmount is empty. Rent / mo will show '—' until QuickBooks classes are mapped. Fix PORTFOLIO-V01 first, or the Value and Debt tiles carry the 765/767 double count ($550K of value, about $293K of debt).

### PORTFOLIO-002

**A short or blank address crashes create instead of showing a field error**

Medium · Fix · effort S · `/properties/new` · Every save is safe, instant and undoable

- **Today:** By code, a 1 to 3 character or whitespace-only address passes the browser's required check and reaches z.string().min(4) inside withLog, which rethrows to the (app) error boundary. The reviewer's screenshot shows the helper's blocked POST, not this crash.
- **Why:** Bad input is the most common form state. Stripe and Ramp never answer it with a crash page; they keep the person in the form with a one-line error under the field.
- **Change:** Switch createProperty to withResult and return field errors, such as { field: "address", error: "Enter a full street address" }. Render them with useActionState under the field. Mirror the rule on the client with minLength={4} and a trim check so most cases never post.
- **Desktop, tablet, phone:** Error line sits under the field at every size; it must fit on one line at 320px ("Enter a full street address" does).
- **Reuse:** withResult in src/lib/server-action.ts; the inline error pattern in properties/[id]/edit-units.tsx (docs/components.md, Feedback).
- **References:** 
  - [Stripe](https://mobbin.com/screens/d36ef36b-d2e9-46ff-bac5-f1d715f30ec0): Error stays under the field with an icon; the form and its values stay put.
- **Code:** `src/app/(app)/properties/actions.ts:16-29`, `src/lib/server-action.ts:34-41`, `src/app/(app)/properties/new/page.tsx:16`
- **Verification:** partly. The code path is real. propertySchema.parse runs inside withLog (actions.ts:23-25), and the ZodError rethrows to (app)/error.tsx. Inputs that pass the client check, such as '12' or three spaces (formToObject drops them, so address is undefined), will crash. The cited screenshot proves nothing, however. The helper aborts every POST, and a valid address ('999 Test Valid Street, Buffalo, NY 14201') produces the same 'Something went wrong' card (verify-PORTFOLIO/new--valid--desktop-light.png). 'Bad input is the most common form state' overstates it for a form used a few times a year, so I set medium. The fix (withResult plus useActionState, minLength on the client) is right and cheap.

### PORTFOLIO-003

**Duplicate check misses common address variants and creates duplicates**

Medium · Fix · effort S · `/properties/new` · Fix wrong numbers and records first

- **Today:** findDuplicateProperty runs a contains match on the text before the first comma, then requires the full normalized strings to be equal. Stored "118 Congress St. Buffalo, NY 14213" normalizes to "118 congress st buffalo ny 14213". Typing "118 Congress St, Buffalo, NY" (no ZIP) gives a different normalized string, so a second 118 Congress row is created. "118 Congress Street" also misses, because the contains step looks for "Street" in a row that stores "St.".
- **Why:** A duplicate property splits tasks, documents and QuickBooks mapping across two records, which is the kind of data rot a calm, trustworthy tool never allows.
- **Change:** Match on addressKey(input) (house number plus first street word), plus ZIP when both sides have one. On a hit, return { duplicateOf } to the form instead of redirecting (see PORTFOLIO-010).
- **Desktop, tablet, phone:** No layout impact.
- **Reuse:** addressKey in src/lib/normalize.ts:27, already used for QuickBooks class matching.
- **Code:** `src/lib/properties/service.ts:49-54`, `src/lib/normalize.ts:1-14`, `src/lib/normalize.ts:27-31`
- **Verification:** partly. Reproduced by tracing the code against real data. Stored '118 Congress St. Buffalo, NY 14213' plus typed '118 Congress St, Buffalo, NY' passes the contains step, but the normalized strings differ, so a duplicate gets created. '118 Congress Street' fails the contains step. Severity drops to medium because creates are rare (all 11 rows came from the import). Caveat for the fix: addressKey matches only the house number and first street word, so it can produce false positives ('15 Oxford Ave' and '15 Oxford Pl'). Use the ZIP check, and treat a hit as a warning with 'Create anyway', not a hard block.

### PORTFOLIO-007

**Replace "Open tasks" with one Needs attention cell per property**

Medium · New capability · effort M · `/properties` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. /properties still has an unlinked raw 'Open tasks' column (0 of 11 cells link). It now counts the five active statuses (767 Prospect 32, 415 Crescent 32, 58 Mariner 24). There is no overdue or key-date signal.
- **Today:** Open tasks is an unlinked raw count, and most dated open tasks are past due (767 Prospect 19 of 29, 415 Crescent 14 of 23, 765 Prospect 12 of 13). No key dates (insurance renewal, loan maturity, rental registration) are filled on any property, so nothing date-based is lapsing in the data. The 'Sep 30' items on 415 Crescent are lease-renewal tasks, not insurance.
- **Why:** "Problems" is a named job of this page. A count of all open work says nothing about urgency. A lapsed insurance policy is a lender default risk, and it is invisible here.
- **Change:** Add a Needs attention column showing the single most urgent item as a short line, plus "+N" when there is more:
1. A passed key date, in red: "Insurance lapsed Sep 30".
2. Overdue tasks, in red: "14 overdue tasks".
3. A key date within 30 days, in amber: "Loan due in 40 days" turns amber at 30.
4. CapEx due this year, in muted text.

The cell links to the source: /tasks?property=ID (filter already exists) or the property's Loan or Insurance section. Rows with nothing show nothing. Count overdue as any task not Done or Canceled with a due date before today, so it survives the seven-status change.
- **Desktop, tablet, phone:** Desktop and tablet: its own column, one line, truncated. Phone: appended to row line 2 in red ("· 14 overdue"). Drops the +N on phone.
- **Reuse:** relativeDays, dueLabel and isPastDay in src/lib/dates.ts; the tasks property filter at src/app/(app)/tasks/page.tsx:84; portfolioCapexForecast in lib/property-types.
- **References:** 
  - [Zillow](https://mobbin.com/screens/c84e5a02-a339-4398-aca6-62e505305f35): Rental Manager Properties: a per-row Lease cell holds one status chip plus one action link ('View lease'). One cell, one state, one next step.
  - [Brex](https://mobbin.com/screens/47dfde64-0ad0-41c6-978c-c56480db69de): Task rows name exactly what is missing ('Add missing memo and receipt') and end in the verb. Model for wording such as 'Insurance renewal missing'.
  - [Shopify](https://mobbin.com/screens/a49bce9c-6f95-4c9b-a877-d2c79a8e77c0): The only red on the row is the problem sublabel, so the eye goes straight to it.
  - [Mercury](https://mobbin.com/screens/607720b2-bd1f-4d7f-90e0-aa31e341fd92): Bill Pay card splits Outstanding, Overdue and Due soon: urgency, not raw volume.
  - [HoneyBook](https://mobbin.com/screens/7441f67f-33b3-469f-8396-063c45a8a398): Status row with Overdue called out by color and count.
  - [Copilot](https://mobbin.com/screens/4e13cc80-a9e1-48b0-8882-c8857758acc5): "Next two weeks" list of dated obligations in one line each.
- **Code:** `src/app/(app)/properties/page.tsx:15-20`, `src/app/(app)/properties/page.tsx:80`, `prisma/schema.prisma:129-143`, `branch src/app/(app)/properties/page.tsx:16-20`, `branch src/app/(app)/properties/page.tsx:57,81`, `branch src/lib/task-scope.ts:62-66`, `branch src/app/(app)/tasks/page.tsx:11-20`
- **Verification:** partly. The overdue counts check out against every property page (767: 19 of 29, 415: 14 of 23, 765: 12 of 13; 78 of 137 overall). The insurance claim is wrong. The 'Sep 30, 2026' items on 415 Crescent are four 'Align on Unit N renewal' lease tasks, and its Insurance section is empty. insuranceRenewalDate, loanMaturityDate and rentalRegistrationExpiry are null on all 11 properties, so today the key-date tiers would never fire and the cell would show overdue counts only. With 57% of open property tasks past due (mostly imported Aug and Sep dates), the column would be a wall of red until the tasks are cleaned up. Changing the cell to 'N overdue' linked to /tasks?property=ID is the S-sized, high-value part. Key dates also overlap D10's Home 'what needs me'.

### PORTFOLIO-009

**Add a way back: Cancel next to Create and a Portfolio back link**

Medium · Design change · effort S · `/properties/new` · Create where you are

- **Today:** The page has no Cancel, no BackLink and no breadcrumb. The only way out is the sidebar or the browser back button; on phone the sidebar is behind the hamburger.
- **Why:** Every create surface in Stripe offers an explicit Cancel beside the primary. Without one, the form feels like a dead end, and on phone it costs two taps to escape.
- **Change:** If the page stays a page, put a BackLink labelled "Portfolio" above the title, as on the property page. Put a secondary Cancel button left of Create property that returns to the previous list state. The sheet version (PORTFOLIO-008) has Cancel in its footer.
- **Desktop, tablet, phone:** Same at all sizes; on phone the Cancel and Create pair sits in a docked bottom bar at 48px.
- **Reuse:** BackLink (src/components/back-link.tsx) and Button variant secondary.
- **References:** 
  - [Stripe](https://mobbin.com/screens/f1abdc0b-be78-46a6-aff4-4413503146f8): Cancel and Save always paired in the footer.
- **Code:** `src/app/(app)/properties/new/page.tsx:10-36`
- **Verification:** confirmed. No BackLink, Cancel or breadcrumb (new/page.tsx:10-36). This is moot if PORTFOLIO-008 ships, since the sheet's footer carries Cancel. Do only one of the two.

### PORTFOLIO-013

**Make the whole row the link, with a visible focus ring**

Medium · Design change · effort S · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** Desktop: only the 222x18px address text is a link inside a 1150x37px row that highlights on hover. On tablet and phone the wrapped address makes the link 38px and 98px tall, so the 18px touch target holds only on desktop.
- **Why:** In Stripe and Mercury lists the row is the target; a hover state that promises a click and then ignores it feels broken.
- **Change:** Keep the address as the real link and stretch its hit area over the row (after:absolute inset-0 on the link, relative on the tr). Add focus-visible:ring-2 ring-primary/40 on the row, and keep the overdue link (PORTFOLIO-007) above the stretched layer with relative z-10. Raise the row to 48px.
- **Desktop, tablet, phone:** Desktop and tablet: full-row click with hover on pointer devices only. Phone: full-row tap on the stacked rows.
- **Reuse:** Table, Td; the same pattern can serve deals and tasks rows.
- **References:** 
  - [Mercury](https://mobbin.com/screens/aded2b48-4d84-4940-8dfa-92fdab1512ef): Each account row is one target with the kebab as the only nested control.
- **Code:** `src/app/(app)/properties/page.tsx:64-69`
- **Verification:** partly. Desktop measures exactly as claimed: a 222x18 link in a 1150x37 row, with cursor:auto on the other cells while the row highlights. The touch claim is wrong. Addresses wrap, so the link is 113x38 at 768 and 62x98 at 375. The full-row target is still the right fix.

### PORTFOLIO-016

**Separate lifecycle status from strategy**

Medium · Design change · effort M · `/properties` · Plain, consistent words

- **Today:** PROPERTY_STATUSES is Rehabbing, Refinancing, Refinanced, Stabilized, Hold, Flip and Sold. PROPERTY_STRATEGIES is Hold, Flip, BRRRR, Sell and TBD, so Hold and Flip are both a status and a strategy. "Refinanced" is a past event, not a state. In the data, 6 of 11 properties are "Refinanced".
- **Why:** A status filter (PORTFOLIO-017) only works if each property sits in exactly one stage. Overlapping vocabularies make the segment counts meaningless.
- **Change:** Use a five-stage lifecycle for status: Rehabbing, Leasing, Stabilized, Refinancing, Sold. Strategy stays Hold, Flip, BRRRR. Migrate Refinanced to Stabilized, and Hold or Flip statuses to Stabilized with that strategy. Connor confirms the stage names.
- **Desktop, tablet, phone:** No layout impact; fewer segments keep the control on one row at 320.
- **Reuse:** src/lib/config.ts constants; the field edit in properties/[id]/edit-details.tsx.
- **References:** 
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): Each order carries two independent chips (Unfulfilled, Paid) for two different dimensions; lifecycle and strategy can sit side by side the same way without merging into one status.
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): Property type and market state appear as a muted sublabel ('House • Off-market') under the address, separate from the status column.
  - [Plane](https://mobbin.com/screens/b274b760-5c97-4900-ae57-115489320c86): One ordered set of stages, each with a count; no item in two stages.
  - [Zillow](https://mobbin.com/screens/5cd12c32-2216-45f0-bf87-6ccd06b0476e): One lifecycle chip ('OFF-MARKET') next to the property title.
  - [Attio](https://mobbin.com/screens/e275641a-a3e8-440a-b53e-983bb9cec7c7): Stage and other qualifiers are separate attributes
- **Code:** `src/lib/config.ts:60-70`, `src/app/(app)/properties/new/page.tsx:21-26`, `src/app/(app)/properties/page.tsx:70-77`, `src/app/(app)/properties/[id]/page.tsx:83-89`, `src/lib/config.ts:61-71`
- **Also found as:** IA-026 (Lens: information architecture and global SaaS patterns), COPY-046 (Lens: words on every screen)
- **Verification:** confirmed. The overlap is real (config.ts:60-70). In the data, status is Refinanced (6) or Rehabbing (5), and strategy is Hold, Flip or TBD. This is a data migration plus a decision on stage names, so Connor confirms first.

### PORTFOLIO-019

**Give tablet a five-column table that doesn't wrap**

Medium · Design change · effort S · `/properties` · The phone is a chosen subset, and touch has no hover

- **Today:** At 768 all 7 columns squeeze in: addresses wrap to 2 or 3 lines ("415 Crescent / Ave., Buffalo, NY / 14214"), entity wraps to 3 lines, and rows grow to about 77px.
- **Why:** Tablet gets the touch layout per the house rules; wrapped three-line rows halve how many properties fit and break the calm rhythm.
- **Change:** Between md and lg, show Property (short street), Status, Units, Value and Needs attention, all one line. Hide Entity and Purchase. Rows are 52px with full-row tap.
- **Desktop, tablet, phone:** Tablet 768: 5 columns, no wrap. Desktop 1280: full set. Phone: stacked rows.
- **Reuse:** Table and Td with hidden md:table-cell lg:table-cell utilities.
- **References:** 
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): Four columns only; secondary facts (city, type, market state) ride as sublabels in the address cell, which is how a 768 table stays on one line without dropping information.
  - [Square](https://mobbin.com/screens/ed99d05a-2542-4092-b00d-57e0281b30b6): Three-column vendor table with generous rows, nothing wraps.
- **Verification:** confirmed. Seen at 768: addresses and entities wrap to 2 or 3 lines, and rows are 77px against 57px for single-line ones. Hiding Entity and Purchase between md and lg fixes it.

### PORTFOLIO-020

**Turn Entity from a column into an optional group-by with subtotals**

Medium · Design change · effort M · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** Entity is a muted 12px column of free text repeated per row ("HG Capital Partners LLC" x4, "HG Buffalo Holding 1 LLC" x3...). One row reads "1) 50% BK 2) 50% HG Buffalo Holding 1 LLC".
- **Why:** Entities matter in groups (which LLC holds what, what moves into the next refi entity), not per row. A repeated muted column is chrome; a grouping with subtotals answers a real question.
- **Change:** Remove the Entity column. Add a "Group by entity" option in a small Display menu beside the segmented control. Each group header shows the LLC name, property count and subtotal value ("HG Buffalo Holding 1 LLC · 3 · $885K"). Clean the split-ownership row into the property notes until ownership splits get a real field.
- **Desktop, tablet, phone:** Desktop and tablet: group headers span the table. Phone: group headers above the stacked rows. Display menu becomes a bottom sheet on phone.
- **Reuse:** Group header styling can follow the Table header row; the Display menu uses the approved React Aria menu.
- **References:** 
  - [Copilot](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099): Accounts grouped under Depository, Investments, Loans, each group closed by a subtotal row in the same right-aligned column. Direct model for grouping by LLC with a value per entity.
  - [Mercury](https://mobbin.com/screens/f964f8c4-c630-406a-b599-585edf376533): Grouped transactions with per-group counts and sums and a '1-8 of 8 Groups' footer; groups collapse with a chevron.
  - [Mercury](https://mobbin.com/screens/7748c548-8c81-4258-87cd-33b7787a57cf): Accounts grouped under section headings rather than a repeated column.
  - [Unify](https://mobbin.com/screens/88067276-8de6-4435-bcba-91a909d74b6f): Display popover with Group by and Sort by, kept out of the main toolbar.
  - [Copilot](https://mobbin.com/screens/fcb4126b-4d10-4708-98ae-ddbf5ed80ba4): Depository, Investments and Loans groups, each closed by a subtotal row.
  - [Airtable](https://mobbin.com/screens/06e3f847-9156-42de-b9bd-71378b176f5e): Grouped grid with a count and aggregate in each group header and a grand figure in the footer.
- **Code:** `src/app/(app)/properties/page.tsx:54`, `src/app/(app)/properties/page.tsx:70`
- **Also found as:** DATA-I02 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. Dropping the Entity column simplifies the page, which is good. Adding a Display menu and group headers for one option across 11 rows and 4 LLCs adds the chrome the bar warns against. Keep entity on the property page and in the SREO export (PORTFOLIO-030) instead. Fixing the '1) 50% BK 2) 50% HG Buffalo Holding 1 LLC' row is a data fix.

### PORTFOLIO-021

**Make Entity a find-or-add combobox of existing LLCs**

Medium · Design change · effort S · `/properties/new` · Create where you are

- **Today:** Entity is free text with a placeholder that names it differently ('LLC owner'). The existing entity names come from the SREO import and are consistent except the split-ownership row.
- **Why:** Typing the same four legal names by hand guarantees drift. Stripe's "Find or add a customer" picks from what exists and creates only when needed.
- **Change:** Use a combobox listing the distinct llcOwner values, with "Add “…”" as the last option. The label is "Entity" and the field is marked Optional.
- **Desktop, tablet, phone:** Desktop and tablet: inline listbox under the field. Phone: the listbox opens as a sheet; the field sits full width on its own row.
- **Reuse:** New combobox on React Aria Components (approved), built in src/components/ with a row in docs/components.md; GlobalSearch shows the dropdown look already in use.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ccf451fc-5f28-48ff-9fbd-e6fa1ecd0f70): "Find or add a customer..." single field that searches existing records first.
- **Code:** `src/app/(app)/properties/new/page.tsx:28-31`
- **Also found as:** COPY-047 (Lens: words on every screen)
- **Verification:** partly. The label and placeholder mismatch ('Entity' vs 'LLC owner') is real. The causal claim is wrong: all 11 rows came from the SREO import, not this form, and the names are consistent apart from the split-ownership row. The combinator pattern is fine (Stripe ccf451fc verified: 'Find or add a customer...'), but for a rare form a native datalist of the distinct llcOwner values gets most of the benefit at S effort.

### PORTFOLIO-025

**Land on the new property with a short setup checklist**

Medium · New capability · effort M · `/properties/new` · Create where you are

- **Today:** After Create, the server redirects to the property page, which looks like any other property: empty Loan, Insurance and Units sections full of "—", with no sign anything was just created or what to do next.
- **Why:** House rule: payoff moments show what happened and what's next. Airbnb's listing editor tells a new host exactly which steps remain.
- **Change:** For a property with no units, loan or insurance, show a top card: "118 Congress St is in your portfolio. Next: add units, loan and insurance." It lists three rows (Units, Loan, Insurance), each opening its edit section, and each ticks off as it fills. The card disappears when all three are done. Add a toast "Property created".
- **Desktop, tablet, phone:** Desktop: card spans the main column. Tablet: same. Phone: full-width card above the tabs, rows 48px.
- **Reuse:** Card, SectionCard edit entry points already on the property page; Toast is a Known gap and gets built here.
- **References:** 
  - [Airbnb](https://mobbin.com/flows/ba34f8a2-7c60-427d-bda1-0867f796469c): Listing editor "Complete required steps" card plus a short toast when an item is added.
  - [Zillow](https://mobbin.com/flows/45f9651a-dd33-4d39-9e78-88f40c08373b): New property overview with a Next steps panel.
- **Code:** `src/app/(app)/properties/actions.ts:28`, `src/app/(app)/properties/[id]/page.tsx:93-140`
- **Verification:** confirmed. Supported by the house rule on payoff moments. On Mobbin, Zillow Rentals' new-property overview has a 'Next steps' card (https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430), and Stripe shows a 'Product created · View product' toast (https://mobbin.com/screens/bab2a73a-7ec5-46c7-8fd8-cc0f962e0a83). Under D10 the card belongs in the property hub's Overview tab.

### PORTFOLIO-026

**Swap the Purchase column for Equity**

Medium · New capability · effort S · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** currentLoan is populated for all 11 properties but rendered nowhere. The Loan section shows only the empty loanOriginalAmount, so it reads as if no loan data exists.
- **Why:** Purchase price is history; equity is the decision number (refi, sell, borrow). Stripe-level overviews show the figure you act on and leave the history on the detail page.
- **Change:** Replace Purchase with Equity (value minus currentLoan, falling back to loanOriginalAmount). Rows without loan data show "—" with a hover hint "No loan amount". Add a Current balance field to the loan edit section so the number can be kept up to date. Purchase stays on the property page.
- **Desktop, tablet, phone:** Desktop and tablet: Equity column, right-aligned. Phone: Value stays in line 2; Equity drops.
- **Reuse:** fmtMoney; PropertyLoanSection in properties/[id]/edit-loan.tsx gets the currentLoan field.
- **References:** 
  - [Copilot](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099): Assets and Debts shown together, with loans listed as their own rows and balances, so equity can be traced to its parts.
  - [YNAB](https://mobbin.com/screens/4d946d9e-a904-426c-b36c-0b1782ab3938): Assets, Debts and the resulting net figure shown together.
  - [Copilot](https://mobbin.com/screens/fcb4126b-4d10-4708-98ae-ddbf5ed80ba4): Each account row carries its value with a small change pill beside it; groups get subtotal rows.
  - [Quicken](https://mobbin.com/screens/4ccc8fa1-4cce-4ec8-a469-5c921643f512): Value with an all-time change line beside each account
- **Code:** `src/app/(app)/properties/page.tsx:58-59`, `prisma/schema.prisma:114-115`, `src/app/(app)/properties/[id]/edit-loan.tsx:61-67`, `src/app/(app)/properties/page.tsx:82-96`
- **Also found as:** DATA-054 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. True that no view renders a loan balance: currentLoan appears only in the service's patch field list (service.ts:83). The data is not missing, though. currentLoan is filled on all 11 properties from the SREO (scripts/migrate/01-properties.ts:125); only loanOriginalAmount is empty, which is why the Loan section reads 'Original amount —'. Equity can therefore show a real figure on every row today, and the Loan section should display the balance it already has. 765 and 767 share one combined loan figure (PORTFOLIO-V01).

### PORTFOLIO-027

**Show monthly rent per property from the QuickBooks rent roll**

Medium · New capability · effort M · `/properties` · The QuickBooks mirror is honest about what it covers

- **Today:** Rent is one of the at-a-glance figures, but the list has none. /financials/rent-roll already computes cash rent by month per property, but no QuickBooks class is mapped locally, so every property page says "No QuickBooks class is mapped to this property yet".
- **Why:** Rent is the income half of the portfolio. Mercury's accounts list puts the live figure next to each name; here it hides two clicks away under Financials.
- **Change:** Add a Rent column showing the last full month's cash rent from getRentRoll (Geist Mono, right-aligned), linking to the rent roll filtered to that property. When no property is mapped, show one line above the table instead of per-row text: "Map properties to QuickBooks to see rent" linking to Financials settings.
- **Desktop, tablet, phone:** Desktop: column. Tablet: replaces Units if space runs out. Phone: drops from the row; it appears in the KPI grid as Rent / mo.
- **Reuse:** getRentRoll in src/lib/quickbooks/queries; fmtCents and SourceBadge from financials/_components/ui.tsx.
- **References:** 
  - [Zillow](https://mobbin.com/screens/c84e5a02-a339-4398-aca6-62e505305f35): Rental Manager names the column for the current month ('May rent'), so the cell answers whether this month's rent came in, not just the contract amount.
  - [Copilot](https://mobbin.com/screens/c7b52d0f-77d7-4434-b991-b0b2f20ad225): Recurrings list: 'Rent Payment, Monthly' with its amount and a check once paid, a quiet paid-or-not mark beside a fixed figure.
  - [Mercury](https://mobbin.com/screens/607720b2-bd1f-4d7f-90e0-aa31e341fd92): Each account row carries its live money figure, right-aligned.
  - [Mercury](https://mobbin.com/screens/91ad4bbc-ef0f-4edf-a79f-fc6b9cb4ab7c): "Total cash · As of Aug 31" freshness stated once, not per row.
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:9-20`
- **Verification:** confirmed. Every property page says 'No QuickBooks class is mapped to this property yet', so the column would be empty until production QuickBooks mapping is done. Ship it with that mapping, and show the one-line notice rather than a column of dashes. Mercury 91ad4bbc verified ('Total cash · As of Aug 31, 2026').

### PORTFOLIO-028

**Show vacancy in the Units cell from active rental listings**

Medium · New capability · effort S · `/properties` · Rentals, residents and the public site run one lifecycle

- **Today:** Occupancy appears nowhere in the app. The Listing model has status AVAILABLE, LEASED or HIDDEN, and properties such as 767 and 647 Prospect have available listings, but the Units cell shows only a bare number.
- **Why:** Occupancy is a named at-a-glance need. The data to approximate it already exists, so the portfolio can answer "what's empty" without new entry work.
- **Change:** Render the Units cell as "3" when fully leased and "3 · 1 vacant" (vacant in amber) when available listings exist. Count AVAILABLE listings per property in the same query. Label it "listed" rather than "vacant" if Connor prefers wording that reflects the data source.
- **Desktop, tablet, phone:** Desktop and tablet: inside the Units cell. Phone: "3 units · 1 vacant" in row line 2.
- **Reuse:** Listing relation already included on the property page; Badge tone amber or plain amber text.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): Listing state carried on the property itself (Action required) instead of a separate screen.
- **Code:** `prisma/schema.prisma:292`, `src/app/(app)/properties/page.tsx:81`
- **Verification:** confirmed. AVAILABLE listings exist on 647 Prospect, 767 Prospect and 933 Lafayette. An AVAILABLE listing can be a pre-lease with a future date, so default to the honest label '1 listed' rather than 'vacant'.

### PORTFOLIO-030

**Export the portfolio as a lender-ready schedule (SREO)**

Medium · New capability · effort M · `/properties` · The QuickBooks mirror is honest about what it covers

- **Today:** No export exists. The schema notes the data was imported from an SREO (refiTarget "from SREO"), and refinances into new entities are an active workflow.
- **Why:** Lenders ask for a schedule of real estate owned on every refi. Stripe puts Export beside every list; here the partners rebuild a spreadsheet by hand.
- **Change:** Add a secondary Export button in the page header that downloads CSV with address, entity, status, units, purchase date and price, value, lender, loan balance, rate, payment and maturity. Respect the current segment. Name the file "HG portfolio 2026-10-22.csv".
- **Desktop, tablet, phone:** Desktop and tablet: secondary button left of New property. Phone: in an overflow menu, since lender packages are built at a desk.
- **Reuse:** Button variant secondary; a route handler in src/app/(app)/properties/export/route.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05): With a filter active the button reads 'Export Filtered', so the export scope is stated on the control. Apply to the SREO export when a segment or selection is active.
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Export sits in the list toolbar and honors the current filter.
  - [Stripe](https://mobbin.com/screens/d96ae5a5-92e6-41e4-80b3-0a7f95652c50): "Preparing export…" modal with Cancel for longer exports.
  - [Mercury](https://mobbin.com/screens/74accd0e-00bb-49b2-91aa-b9d6063452e5): Documents & Data generates statements on demand with Year and Account pickers.
  - [Gusto](https://mobbin.com/screens/1bf4cc38-732e-4473-8bd2-9f39da6c9c34): One Download menu with CSV, PDF and Excel beside a data-synced line.
  - [Stripe](https://mobbin.com/screens/b7dd016d-5f5f-4923-aecd-08c88d8646dc): Download dialog titled with the range and a Columns choice.
  - [Shopify](https://mobbin.com/screens/c036a306-c929-43c2-b978-637fc002ce33): Export dialog scoped to Current page, All orders or 'N orders matching your search', as CSV.
  - [Jobber](https://mobbin.com/screens/7b0579b2-4f76-41d9-a57a-01402ca970f1): Report table with Columns and a CSV export beside its filters.
- **Code:** `prisma/schema.prisma:103`, `src/app/(app)/properties/page.tsx:38-42`, `scripts/migrate/01-properties.ts:111-129`
- **Also found as:** G1E-I07 (What leaves the app: printouts, PDFs and the Google listing), DATA-I11 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. No export exists. Fix PORTFOLIO-V01 first, or the schedule sent to a lender double-counts 765/767. 'Respect the current segment' depends on PORTFOLIO-017, which I downgraded.

### PORTFOLIO-I01

**Pin one line naming the missing key facts above the portfolio**

Medium · Design change · effort S · `Portfolio list (/properties)` · Lists answer first and stay calm at 675 rows

- **Today:** All 11 properties lack an insurance renewal date, a loan maturity, a loan number, a rate and a payment, and every carrier, policy and premium is a dash. Four refinanced properties also have no lender. The property page hides the empty Maturity and Renewal lines (already JOURNEYS-006), and PORTFOLIO-007 already notes that no key dates are filled. The Portfolio list itself gives no hint of this.
- **Why:** The schema says an insurance lapse means force-placed cover and a technical default, and calls maturity load-bearing. The planned Needs attention cell (PORTFOLIO-007), the SREO export (PORTFOLIO-030) and any key-dates view read these fields, so today they would all come up empty and look reassuring. Airbnb puts the single thing blocking a listing in one pinned card above the list; HG spreads it across 11 pages nobody is prompted to open.
- **Change:** While anything is missing, show one flat row between the header and the figures strip: an amber dot, 'Insurance and loan dates missing on 11 properties' and a 'Fill in' text button that opens the fill-in grid (PORTFOLIO-I02). Count properties, not fields. The row disappears once every property has a carrier, renewal date, lender and maturity date. No card, illustration or dismiss button.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one line, Fill in at the right end. Phone 375: the line shortens to 'Key dates missing on 11' and stays at the top of the list; Fill in opens the first incomplete property's Loan section and steps to the next, since the grid is desktop only.
- **Reuse:** Extend PageHeader (src/components/ui.tsx) with an optional notice slot under the title row; Button ghost for Fill in; amber from the Badge amber tone. Counts come from the Property query already in src/app/(app)/properties/page.tsx.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c): Your listings opens with one pinned card, 'Confirm a few key details, Required to publish', above the grid.
  - [Airbnb](https://mobbin.com/screens/fc6b314f-c9b0-4ce8-bdc2-a68c51017c08): Today page: a single 'Confirm important details' card with a Start link; red is used only for that blocker.
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): iOS keeps the same blocker pinned just above the tab bar, so phone users see it without scrolling.
- **Code:** `inspire-PORTFOLIO/keyfacts-scan.txt`, `src/app/(app)/properties/[id]/edit-insurance.tsx:45`, `src/app/(app)/properties/[id]/edit-loan.tsx:44`, `prisma/schema.prisma:129`, `prisma/schema.prisma:132`
- **Verification:** partly. I reproduced the data: I fetched all 11 property pages from /properties (skeptic-portfolio-tools/kf-out.json). None renders a Renewal, Maturity, Balance or tax-due line, and every Carrier, Policy # and Premium is a dash. The edit-loan.tsx:44 and edit-insurance.tsx:45 claims hold. Two parts are already filed elsewhere. JOURNEYS-006 (high) covers the hidden empty Maturity and Renewal lines and proposes the per-property notice. PORTFOLIO-007 already records that no key date is filled. That leaves one new idea: a portfolio-level line. It's a one-time backfill prompt, so it shouldn't widen PageHeader for everyone. Fold the count into the 'Missing' group of the JOURNEYS-007 Key dates list or into the PORTFOLIO-006 strip hint ('Loan amounts missing on 11'). The phone 'step through properties' flow is extra machinery. I calibrated it down from high because nothing is lapsing in the data and the stake is already filed at high under JOURNEYS-006. Reference check: Airbnb d8494673 is real and matches ('Confirm a few key details, Required to publish' pinned above Your listings).

### PORTFOLIO-I06

**Show months elapsed against the planned rehab on Rehabbing rows**

Medium · New capability · effort M · `Portfolio list (Status cell on Rehabbing rows)` · Lists answer first and stay calm at 675 rows

- **Today:** rehabAmount and rehabMonths are imported (01-properties.ts:128-129) and shown or editable nowhere (already PROPERTY-007). rehabMonths sits in MONEY_FIELDS, but no form posts it, so nothing is mis-parsed today. Whether any property has a planned duration is unverified. The portfolio badge says nothing about time, although 765 and 767 Prospect have been Rehabbing for 15 months.
- **Why:** Every month a rehab runs over costs bridge-loan interest, and 5 of 11 properties are Rehabbing. Flighty shows the scheduled time beside the actual, strikes through a slipped time and adds one colored status line; Copilot's budget rows turn red only when over. HG has the plan in the database and shows none of it.
- **Change:** Under the Rehabbing badge, one muted Geist Mono line: 'Month 15 of 6' when a plan exists, turning red only once past plan; 'Month 15' when there is no plan. On the property Details card, show 'Rehab plan' as amount and months and make both editable. Move rehabMonths out of MONEY_FIELDS into a number field.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: sublabel under the badge in the Status column. Phone 375: appended to the second line only when over plan ('Month 15 of 6' in red); on-plan rows omit it.
- **Reuse:** Badge; daysUntil and relativeDays from lib/dates.ts; Field in src/app/(app)/properties/[id]/edit-details.tsx.
- **References:** 
  - [Flighty](https://mobbin.com/screens/f642c78d-91ab-484f-b782-692aef2c174a): Scheduled and Estimated sit in aligned columns, and only late values turn red.
  - [Flighty](https://mobbin.com/screens/e5d1a616-c644-4ef6-aa4c-9f9830292c9c): A slipped time is struck through with the new time beneath and one status line such as 'Departed 56m Late'.
  - [Copilot](https://mobbin.com/screens/8edbc5d1-5e4d-4b8a-b916-c19f9558b6d4): Top categories rows show spent, a slim bar and the budget, red only when over.
  - [Flighty](https://mobbin.com/screens/d2a15492-9519-4965-826f-649edbfc3521): Each leg is judged against its schedule; only the late part ('1h 8m Late') is red.
  - [Vercel](https://mobbin.com/screens/ac75e179-8e00-463a-9cba-b20d424db41c): Status word with its duration beneath, in one fixed column on every row.
- **Code:** `scripts/migrate/01-properties.ts:128-129`, `src/lib/properties/service.ts:82`, `inspire-PORTFOLIO/keyfacts-scan.txt`, `scripts/migrate/01-properties.ts:129`, `src/app/(app)/properties/page.tsx:71-79`
- **Also found as:** DATA-I15 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. These parts hold: rehabAmount and rehabMonths have no UI, and 765/767 have been Rehabbing for 15 months since Jul 16, 2025. Three parts don't. (1) The missing-UI part duplicates PROPERTY-007, which also suggests dropping rehabMonths if unused. (2) The MONEY_FIELDS 'parses as dollars' claim is overstated. No form posts rehabMonths, and parseAmount reads '6' as 6. Only a '6m' entry would become 6,000,000, and Decimal(8,2) would reject that. (3) Nobody has checked whether rehabMonths is populated, because nothing displays it, so 'Month 15 of 6' may have no plan to compare against. The simpler version holds up: months since purchase on Rehabbing rows. Route it as one item in the PORTFOLIO-007 Needs attention cell ('Rehab 15 months') instead of a third line in the Status cell. Flighty and Copilot are loose analogies.

### PORTFOLIO-V02

**Split sq ft and replacement cost on 765 and 767 Prospect too, not just value and loan**

Medium · Fix · effort S · `Portfolio list and property pages for 765 and 767 Prospect` · Fix wrong numbers and records first

- **Today:** Besides the identical purchase, value, loan and unit count that PORTFOLIO-V01 names, both property pages show the same Sq ft (4,593), Replacement cost ($800,000), Purchase date (Jul 16, 2025), Strategy and Status. findSreoLoose and the combined-key match in scripts/migrate/01-properties.ts:196-216 hand the whole '765/767 Prospect' SREO row to both records. So every SREO column is duplicated: sqft (col E), replacementCost (Q), rehabAmount and rehabMonths (K, L) and refiTarget (F).
- **Why:** V01's fix only splits purchase, value and loan. If replacement cost stays at $800,000 on each building, any statement of values for the insurance renewal (G1E-020) or coverage check doubles the insured amount for the pair. Per-building sq ft, rehab budget and refi group also stay wrong, and those feed the CapEx, rehab and refi ideas in this review.
- **Change:** Merge this into V01's correction. When the '765/767 Prospect' line is split, also split or re-enter sq ft, replacement cost, rehab amount and months, and the refi target for each building. Make the importer's combined-key guard skip every SREO column for a multi-match, not only the money fields, and log the line for a manual split.
- **Desktop, tablet, phone:** Data and importer change only. No layout change at 1280, 768 or 375.
- **Reuse:** The existing Details and Insurance edit forms (src/app/(app)/properties/[id]/edit-details.tsx, edit-insurance.tsx) for the manual correction. The matchesCombined and findSreoLoose helpers in scripts/migrate/01-properties.ts for the guard.
- **Code:** `skeptic-portfolio-tools/kf-out.json`, `inspire-PORTFOLIO/keyfacts-scan.txt`, `scripts/migrate/01-properties.ts:117-131`, `scripts/migrate/01-properties.ts:196-216`
- **Verification:** verifier-found

### PORTFOLIO-017

**Add a status segmented control with counts above the table**

Low · Design change · effort S · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** There is no way to narrow the list: no filter, no tabs, no search on the page.
- **Why:** "Show me what's in rehab" is a daily question. Stripe and Zillow answer it with one row of segments carrying counts, no filter builder needed at this scale.
- **Change:** Above the table, add a segmented control: "All 11 | Rehabbing 5 | Stabilized 6" (stages per PORTFOLIO-016; Sold appears only when there is one). State lives in the URL (?status=). The selected fill alone marks the pick, and the active and inactive weights match.
- **Desktop, tablet, phone:** Desktop and tablet: left of the table toolbar. Phone: full-width segmented control under the KPI grid; counts kept, and labels shorten to "Rehab" at 320 so the row never wraps.
- **Reuse:** Segmented control in src/app/(app)/deals/filters.tsx, extracted to src/components/ as SegmentedControl per the Duplicates table.
- **References:** 
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Status tiles with counts double as the filter.
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): All (1) | For rent (0) | Off market (1) segments above the property table.
- **Code:** `src/app/(app)/properties/page.tsx:8-13`
- **Verification:** partly. True that no filter exists. At 11 rows that all fit on one screen with a status chip each, a segmented control adds a toolbar to answer a question the eye already answers, which fails the simplicity bar. It becomes worth it once Sold properties pile up. Until then, hiding Sold behind a 'Show sold' link (PORTFOLIO-031) is lighter.

### PORTFOLIO-018

**Make Value, Equity, Units and Needs attention sortable**

Low · Design change · effort S · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** Headers are static. The order is a string sort on address, so it runs 118, 15, 23, 415, 428, 58, 647...
- **Why:** "Biggest equity" and "most urgent" are the two sorts a partner reaches for; Stripe and Origin show the active sort with a small arrow in the header.
- **Change:** Use SortHeader on Value, Equity, Units and Needs attention, with state in the URL and aria-sort on the active Th. The default sort is Needs attention (most urgent first), then street name.
- **Desktop, tablet, phone:** Desktop and tablet: header arrows. Phone: a compact "Sort" menu button beside the segmented control.
- **Reuse:** src/app/(app)/deals/sort-header.tsx SortHeader, made generic per the Duplicates table.
- **References:** 
  - [Attio](https://mobbin.com/screens/f87ae525-00b1-405b-b82c-a38a96811837): Column header menu with Sort ascending and Sort descending; sorting starts from the header the user is looking at.
  - [Attio](https://mobbin.com/screens/80084b63-9adc-4023-ac6e-4097d448e53e): An active sort shows as a 'Sorted by Funding raised' chip above the table, so the order is never a mystery.
  - [Origin](https://mobbin.com/screens/f5b04e19-0514-4261-8e8e-c03341075c32): "↓ Total value" header shows the active sort in place.
  - [Unify](https://mobbin.com/screens/88067276-8de6-4435-bcba-91a909d74b6f): Display menu with Sort by for narrow layouts.
- **Code:** `src/app/(app)/properties/page.tsx:11`, `src/app/(app)/properties/page.tsx:52-60`
- **Verification:** partly. The headers are static. Default order is covered separately by PORTFOLIO-039. For 11 rows, sorting is a nice-to-have: SortHeader exists, so it's cheap, but it isn't medium friction.

### PORTFOLIO-031

**"Owned" count and totals include Sold properties**

Low · Fix · effort S · `/properties` · Fix wrong numbers and records first

- **Today:** The subtitle says "11 owned properties", and the totals sum every row, but the query has no status filter and Sold is a valid status. The first sale will inflate the owned count, units and value.
- **Why:** A latent money and count error on the overview; it will mislead the moment a property sells.
- **Change:** Exclude status Sold from the owned count, the totals and the KPI strip. Show sold properties only under a Sold segment (PORTFOLIO-017) that appears when one exists.
- **Desktop, tablet, phone:** No layout impact.
- **Reuse:** Same Prisma query with where: { status: { not: "Sold" } } for aggregates.
- **References:** 
  - [Zillow](https://mobbin.com/screens/8bd2bd51-b6f5-495d-934a-867464d96561): Archived properties live in their own segment, outside All, so counts and lists describe what is still held.
  - [Shopify](https://mobbin.com/screens/a49bce9c-6f95-4c9b-a877-d2c79a8e77c0): Archived is the last chip in the row (All, Active, Draft, Archived): reachable but never mixed into the working set.
- **Code:** `src/app/(app)/properties/page.tsx:10-13`, `src/app/(app)/properties/page.tsx:22-31`, `src/app/(app)/properties/page.tsx:37`, `src/lib/config.ts:67`
- **Verification:** partly. Correct in code: there is no status filter, and the subtitle says 'owned'. It is latent, though, since no property is Sold today. Low until the first sale; fix it alongside PORTFOLIO-006.

### PORTFOLIO-032

**Row hover darkens in dark mode and sticks after taps on touch**

Low · Design change · effort S · `/properties` · One design system, fixed in the primitives

- **Today:** Rows use hover:bg-background. In dark mode background is darker than surface, so the hovered row sinks into a hole. On tablet, the hover style is also applied after a tap and stays until the next tap.
- **Why:** Hover should lift or tint, not recede; house rule: touch has no hover.
- **Change:** Use a dedicated hover token (zinc-50 light, white/4% dark) and apply it only under @media (hover: hover), via a Tailwind variant such as hover-hover:.
- **Desktop, tablet, phone:** Desktop: tint on hover. Tablet and phone: no hover; a pressed state on tap only.
- **Reuse:** Token in src/app/globals.css; apply in Td or table row styling so every table benefits.
- **References:** 
  - [Mercury](https://mobbin.com/screens/aded2b48-4d84-4940-8dfa-92fdab1512ef): Light, even rows; hover is a faint tint over the surface.
- **Code:** `src/app/(app)/properties/page.tsx:64`
- **Verification:** confirmed. Measured in dark mode: the hovered row is rgb(11,12,14) on a card of rgb(22,24,25), so it sinks. The same token puts the sticky Th band (bg-background) below the card in dark mode, so fix both with one subtle-surface token.

### PORTFOLIO-036

**Write a real empty state for no properties and for empty segments**

Low · Design change · effort S · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** With zero properties the card shows a dashed box reading "No properties." with no action. Filtered segments (once added) would have no empty state at all.
- **Why:** Zillow's empty Properties page says what to do and offers the button; a bare sentence is a dead end.
- **Change:** Zero properties: a single-color line building spot art, the heading "Add your first property" and the New property button. Empty segment: a muted one-line "No properties in rehab" inside the table frame, with no art.
- **Desktop, tablet, phone:** Same content at all sizes; art drops on phone.
- **Reuse:** EmptyState in src/components/ui.tsx (add optional action and art slots).
- **References:** 
  - [Zillow](https://mobbin.com/flows/45f9651a-dd33-4d39-9e78-88f40c08373b): Empty Properties page with illustration, one line and the Add a property button.
- **Code:** `src/app/(app)/properties/page.tsx:45-48`
- **Verification:** partly. The bare 'No properties.' state is real (page.tsx:45-48), but with 11 properties it is never seen. The recommended spot art conflicts with the Imagery house rule, which limits spot art to payoff moments, and conflicts_with doesn't name it. Use a heading plus the New property button without art.

### PORTFOLIO-039

**Order properties by street name, not by the address string**

Low · Fix · effort S · `/properties` · Lists answer first and stay calm at 675 rows

- **Today:** orderBy address asc gives 118 Congress, 15 Oxford, 23 Sherwood, 415 Crescent, 428 Normal, 58 Mariner, 647 Prospect...: a character sort on house numbers that matches no mental model.
- **Why:** People scan for a street; three Prospect buildings should sit together, and Congress should come before Crescent.
- **Change:** Sort in memory by street name, then by house number numerically. Keep this as the tie-break under the user-chosen sort (PORTFOLIO-018).
- **Desktop, tablet, phone:** Same order at all sizes.
- **Reuse:** shortAddress and addressKey in src/lib/normalize.ts; localeCompare with numeric: true.
- **Code:** `src/app/(app)/properties/page.tsx:11`
- **Verification:** confirmed. The order matches a character sort on house numbers (orderBy address asc).

### PORTFOLIO-040

**Drop the unused task _count include from the list query**

Low · Fix · effort S · `/properties` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. properties/page.tsx still includes _count of all tasks per property in findMany and never reads it. Open counts come from the separate groupBy.
- **Today:** findMany includes _count of all tasks per property, but the page never reads it; open counts come from a separate groupBy.
- **Why:** A wasted count join on every render of a force-dynamic page.
- **Change:** Remove include: { _count } and fold the overdue count (PORTFOLIO-007) into the existing groupBy.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** Existing groupBy at page.tsx:15-19.
- **Code:** `src/app/(app)/properties/page.tsx:10-13`, `branch src/app/(app)/properties/page.tsx:11-14`
- **Verification:** confirmed. The _count include at page.tsx:12 is never read.

### PORTFOLIO-041

**Apply excludeTemplateTasks to the open-task count**

Low · Fix · effort S · `/properties` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. The /properties groupBy now spreads activeTask but still not excludeTemplateTasks: where { ...activeTask, propertyId: { not: null } }. Home's count and myOpenTasks both apply excludeTemplateTasks.
- **Today:** The groupBy counts status OPEN with propertyId not null and skips excludeTemplateTasks, which config.ts says every task list and count must use. It is harmless today only because imported templates have no property.
- **Why:** The moment a template is attached to a property, the portfolio count drifts from Home and Tasks.
- **Change:** Spread ...excludeTemplateTasks into the groupBy where clause, as Home and Tasks already do.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** src/lib/task-scope.ts excludeTemplateTasks.
- **Code:** `src/app/(app)/properties/page.tsx:15-19`, `src/lib/config.ts:52-57`, `src/app/(app)/page.tsx:28`, `branch src/app/(app)/properties/page.tsx:16-20`, `branch src/app/(app)/page.tsx:25`, `branch src/lib/tasks/queries.ts:51`
- **Verification:** confirmed. Home uses excludeTemplateTasks (page.tsx:20, 28) and this groupBy doesn't. It is harmless today.

### PORTFOLIO-042

**Stop browser autofill offering a personal address in the property field**

Low · Fix · effort S · `/properties/new` · Create where you are

- **Today:** The input is named "address" with no autocomplete attribute, so browsers treat it as the user's own street address and offer saved home addresses.
- **Why:** A partner's home address suggested into a company property form is noise at best and a privacy slip at worst.
- **Change:** Set autoComplete="off" and a non-standard name on the visible input (keep address as the submitted name via the combobox's hidden field), or rely on the autocomplete combobox from PORTFOLIO-024.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** Input in src/components/ui.tsx.
- **Code:** `src/app/(app)/properties/new/page.tsx:16`
- **Verification:** partly. Confirmed that the input is name=address with no autocomplete attribute. Autofill can't be reproduced in headless Chromium. Chrome often ignores autocomplete='off' for address autofill, so use an unrecognized token or the combobox's hidden field rather than 'off'.

### PORTFOLIO-044

**Drop Status from the create form and default new properties to Rehabbing**

Low · Design change · effort S · `/properties/new` · Create where you are

- **Today:** The create form asks for Status with a native select defaulting to "None" and offering Refinanced and Sold, states a brand-new acquisition cannot be in.
- **Why:** Every field on a quick-add form must earn its place. Stripe's Add product asks for the minimum and tucks the rest behind More options.
- **Change:** Remove Status from create and default new properties to Rehabbing (or Leasing, per PORTFOLIO-016). Status is edited on the property page as today. The create form is then From a deal or Address, plus Entity.
- **Desktop, tablet, phone:** Shorter form everywhere; on phone the whole sheet fits without scrolling.
- **Reuse:** createProperty service default; edit-details.tsx keeps status editing.
- **References:** 
  - [Stripe](https://mobbin.com/screens/f0721d55-7d3c-4827-ba9e-e6bcbdfe9c2d): Only the essentials up front; secondary fields behind More options.
- **Code:** `src/app/(app)/properties/new/page.tsx:18-27`
- **Verification:** confirmed. Seen: a native select defaulting to 'None' with all 7 statuses, including Sold. Removing it shortens the form, and status stays one click away on the property page.

### PORTFOLIO-046

**Put a + beside the Properties heading in the D10 sidebar**

Low · Design change · effort S · `/properties` · A quiet shell with real search, navigation and sign-in

- **Today:** Today New property is reachable only from the Portfolio page header. Under D10 the sidebar will list each property, so the natural place to add one is that list.
- **Why:** Zillow Rental Manager puts a + next to Properties in the sidebar; adding sits where the list lives, from any page.
- **Change:** When D10 ships, add a 24px + icon button with aria-label "New property" at the right of the sidebar's Properties heading, opening the same sheet as PORTFOLIO-008. Keep the page-header button too.
- **Desktop, tablet, phone:** Desktop: shown on heading hover and focus, always visible when pinned open. Tablet: visible in the drawer. Phone: in the drawer and the page header; the D10 bottom bar does not get a create item.
- **Reuse:** SideNav in src/components/nav.tsx; the Dialog shell from PORTFOLIO-008.
- **Challenges:** Builds on D10 (sidebar lists the properties); no conflict, just placement detail for it.
- **References:** 
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): Sidebar Properties item with a + beside it.
- **Code:** `src/app/(app)/properties/page.tsx:38-42`
- **Verification:** confirmed. Zillow Rentals' sidebar shows 'Properties +' (seen in https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430). It builds on D10 without conflict.

### PORTFOLIO-I05

**Recompute the figures strip for the selected segment**

Low · Design change · effort S · `Portfolio list (figures strip)` · Lists answer first and stay calm at 675 rows

- **Today:** Totals are computed once over all 11 rows and shown in a tfoot row (page.tsx:22-31, 87-97). There is no segment or strip today, so the interaction is a spec gap in PORTFOLIO-006 and PORTFOLIO-017, not something visible in the app.
- **Why:** Picking Rehabbing is asking about the refi pipeline: what those 5 buildings are worth and owe. Mercury recomputes Net change, Money in and Money out under every filter, and Airtable's summary bar narrows to the filtered rows, so the answer always matches the list on screen.
- **Change:** Compute the strip from the rows in view. When a segment other than All is active, a muted 'Rehabbing · 5' label sits before the figures; on All there is no label. Figures change with a short crossfade that respects reduced motion.
- **Desktop, tablet, phone:** Same behavior at 1280, 768 and 375. On phone the strip is a 2 by 2 grid with compact money ($1.9M) and the label sits above it.
- **Reuse:** Kpi from src/app/(app)/financials/_components/ui.tsx, moved to src/components/ per the inventory; fmtMoney with compact on phone; the segmented control from src/app/(app)/deals/filters.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/a8225239-95e8-4be6-8f48-2cbf3e15ed05): With a '≥ $1,000' filter chip active, Net change, Money in and Money out describe only the filtered rows.
  - [Airtable](https://mobbin.com/screens/8fc4fa0c-c424-4851-8cd7-3e28149e9568): Filtered to 2 projects, the summary bar shows '2 projects' and sums only those rows.
- **Code:** `src/app/(app)/properties/page.tsx:22-31`, `src/app/(app)/properties/page.tsx:87-97`
- **Verification:** partly. This isn't a standalone finding. The segment and the strip don't exist yet, so this is a behavior rule to write into PORTFOLIO-006 and PORTFOLIO-017. Keep the rule that the strip sums only the rows in view. Drop the muted 'Rehabbing · 5' label: the selected segment already shows the name and count, so the label restates the layout and breaks the copy rule. Reference check: the Mercury pattern is real. A spot-check returned aabcc897, which shows a '≥ $1,000' chip with Net change and Money in recomputed to $2,002. The cited a8225239 didn't come back but is consistent with it.

### PORTFOLIO-I09

**Show loan-to-value under each Equity figure, amber above the refi limit**

Low · Design change · effort S · `Portfolio list (Equity cell)` · Lists answer first and stay calm at 675 rows

- **Today:** The portfolio shows Purchase and Value only, and no cell relates debt to value. currentLoan exists for every property but is rendered nowhere, so there is no LTV anywhere in the app today.
- **Why:** Equity alone reads the same for $210K on a $430K building and $210K on an $850K one. Loan-to-value is the number lenders use to size a cash-out refi, which is the next move for every Rehabbing property. Copilot puts the comparison beside the amount and adds color only when the line is crossed.
- **Change:** Under each Equity figure, a muted 'LTV 62%' in Geist Mono. It turns amber above the cash-out limit set once in Settings (default 75%). No bar. The strip shows portfolio LTV the same way. Rows with no balance show a lone dash.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: sublabel under Equity. Phone 375: dropped unless amber, then 'LTV 81%' joins the second line.
- **Reuse:** The Equity cell from PORTFOLIO-026; amber from the Badge amber tone; the limit stored in AppConfig with Settings.
- **References:** 
  - [Copilot](https://mobbin.com/screens/8edbc5d1-5e4d-4b8a-b916-c19f9558b6d4): Each category row pairs the amount with its limit and turns red only when over.
  - [Copilot](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099): Assets and Debts presented together, the relationship LTV expresses as one number.
- **Code:** `src/app/(app)/properties/page.tsx:57-59`, `src/app/(app)/properties/page.tsx:82-83`
- **Verification:** partly. The observation is right: no cell relates debt to value. But a muted LTV sublabel under every Equity cell, plus a configurable threshold in Settings, adds clutter and a config surface for 11 rows. LTV is already planned where it belongs, on the property Loan card and Overview (PROPERTY-002, PROPERTY-012). On Portfolio, one portfolio-level LTV in the PORTFOLIO-006 strip is enough. If a per-row cue is wanted, show it only when it's over a hard-coded cash-out limit, inside the Needs attention cell (PORTFOLIO-007), not as a new sublabel. It depends on the balance (PORTFOLIO-026) and on the 765/767 loan split (V01). The Copilot budget-row references are a loose fit for LTV.

### PORTFOLIO-I10

**Keep a dated value history and show the equity change in the strip**

Low · New capability · effort M · `Portfolio list (figures strip) and property Details` · Lists answer first and stay calm at 675 rows

- **Today:** Value is one overwritten number per property with no date, source or history (prisma/schema.prisma:115), so the portfolio cannot say whether the book grew; the footer shows a bare $4,973,000.
- **Why:** For a buy, rehab, refinance company, forced appreciation is the scoreboard. Copilot shows each balance with a change chip and range pills, Mercury puts 'vs. last month' under its net change, and Shopify draws a small trend per KPI. A static total gives the partners nothing to compare against. This extends PORTFOLIO-038, which only dates the latest value.
- **Change:** Record each value change with its date and source (Appraisal, Estimate, Refi). The strip gets one muted line under Equity, for example '+$120K since Jan 1'. No chart on the portfolio; the property page lists the value history.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the change line shows under Equity. Phone 375: dropped.
- **Reuse:** Kpi for the figure; the SourceBadge idiom from financials/_components/ui.tsx for the source; a new PropertyValue history table written by the existing property service.
- **References:** 
  - [Copilot](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099): Balances carry change chips, with 1W to ALL range pills above.
  - [Mercury](https://mobbin.com/screens/f77b24a7-e68e-4fc1-b5ac-91856a92f12b): 'Net change this month' with a muted 'vs. last month' comparison beneath it.
  - [Shopify](https://mobbin.com/screens/d47da099-6b76-4b32-a93d-843cb498d1de): Each KPI in the analytics bar carries a small trend line beside the figure.
- **Code:** `prisma/schema.prisma:115`
- **Verification:** partly. The observation is right: value is one overwritten number with no date (schema.prisma:115). It overlaps PORTFOLIO-038, which already proposes valueAsOf and a muted 'Values set Jul to Oct 2026' line under the Value figure. A full value history with a source belongs in the D10 property Activity tab and the IA-034 shared activity timeline, not a new PropertyValue table. Drop the '+$120K since Jan 1' strip line. Values change at a few appraisals a year, and in year one the delta would measure against imported guesses. The Mercury and Shopify trend references fit transaction volumes better than appraisal values.

### PORTFOLIO-I11

**On phone, group rows under status headers instead of a segmented control**

Low · Design change · effort S · `Portfolio list on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 the 7-column table wraps addresses over five lines and entities over four. Only 4 of 11 rows show because the table sits in a 70vh inner scroll box (PORTFOLIO-005), not because of the page. There is no grouping or filter at any size.
- **Why:** On a phone, a segmented control above 11 rows is extra chrome and hides most of the set behind taps. Group headers give the same Rehabbing and Stabilized split while every building stays one scroll away. Mercury iOS groups accounts under plain headers, and Shopify iOS puts a group header over its two-line rows.
- **Change:** Below 768px, drop the segmented control and render the two-line rows (PORTFOLIO-004) under small muted headers with counts: 'Rehabbing 5', then 'Stabilized 6'. Sold collapses into a final 'Sold' header that expands on tap. Desktop and tablet keep the segment from PORTFOLIO-017.
- **Desktop, tablet, phone:** Phone 375 and 320 only: headers and rows, no segment. Tablet 768 and desktop 1280 keep the segmented control with counts.
- **Reuse:** The phone rows from PORTFOLIO-004; group header styled like Th; the status order from lib/config.ts PROPERTY_STATUSES.
- **References:** 
  - [Mercury](https://mobbin.com/screens/7748c548-8c81-4258-87cd-33b7787a57cf): iOS Accounts split under plain 'Mercury accounts' and 'Linked accounts' headers, no filter control.
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): iOS Orders: a muted group header ('Today') above two-line rows.
- **Code:** `src/app/(app)/properties/page.tsx:50-98`
- **Verification:** partly. The squeeze is real: addresses wrap over 5 lines and entities over 4. Only 4 rows show because Table caps the table at maxHeight 70vh (ui.tsx:172), which makes an inner scroll box, and that is already PORTFOLIO-005. Two-line phone rows are PORTFOLIO-004. The grouping idea is the good part, but it should apply at every width. Eleven rows don't need a filter. Status headers with counts ('Rehabbing 5', 'Stabilized 6', Sold collapsed) at 1280, 768 and 375 would replace the PORTFOLIO-017 segmented control and keep one pattern across sizes. Swapping the control by breakpoint gives the same job two different switches, against the spirit of 'One switch per job', and conflicts_with should name PORTFOLIO-017. A Mobbin spot-check backs the all-width version: Linear groups its list under status headers with counts (https://mobbin.com/screens/610d34b6-6ad8-45ab-80fb-2107b31ed01e).
