# Property detail page (future property hub)

Part of the [UI/UX review](README.md). 45 findings: 0 critical, 12 high, 20 medium, 13 low.

## How it should work

The property page becomes HG's one record anatomy, the shape Stripe uses for a customer (https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786) and Zillow uses for a rental (https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd). It has a small property photo, the short address as the h1, one status pill and a muted subline (Buffalo 14213 · 3 units · HG Capital Partners LLC · From deal), then the D10 tabs with counts. One primary action and a "…" menu sit on the right, and a "3 of 11" stepper with chevron buttons walks the portfolio the way Linear steps through issues (https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270).

Under the header, a dated lifecycle strip taken from Resend's domain events (https://mobbin.com/screens/8ba08c9e-7fb1-4028-be55-dfa8757f733a) shows where the property is and how long it has been there: Acquired Jul 16, 2025, Rehab 15 months, Refinance next. The next stage is the primary button, the way Jobber makes Create Invoice the job's next step (https://mobbin.com/screens/1717a0a9-386f-4bfc-a4f6-3d9550db0778). Log refinance updates status, loan and dates in one sheet that shows the loan and LTV before and after, as Stripe's balance adjustment does (https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8).

Overview answers keep, refi or sell. The stat row comes first, and each figure carries its source and date in the style of Stripe's Source row (https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2). Next comes Next steps, after Zillow's rail and Airbnb's required-steps card (https://mobbin.com/screens/d3fb097f-a4e7-43be-a24a-a3e26c185ba7). It lists the three or four open gaps, each ending in its verb, and the block disappears once they're done. Below it, Coming up is a dated list like Copilot's Next two weeks (https://mobbin.com/screens/0abca29e-c16e-45bb-9134-21dbc0c20c37), followed by the top five tasks. Tasks are created in place, the way Linear adds a sub-issue (https://mobbin.com/screens/1ea32209-1221-46de-b4ad-875a8f1b5777).

The rail holds what people look up. Access comes first, modeled on Airbnb's arrival guide (https://mobbin.com/screens/eb1998c1-b613-4512-9fe1-90ef4595ae67). It has Directions, a lockbox code for each unit labeled as shown to contractors on their open jobs, and entry notes. Numbers people paste or read aloud copy with one tap, as on Mercury's account page (https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930). Facts read as label-left rows, and empty facts read as verbs, as in Attio (https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f).

Activity is one timeline. It opens with the linked deal's notes, then adds field changes, refinance events and new notes, with Esc and Cmd-Enter printed on the composer. Financials ends on a breakdown in Stripe's style whose bold last row is Cash left in deal (https://mobbin.com/screens/7af4eefa-754f-4c2f-a689-c790b1eb4cad).

On a phone the page is a deliberate subset: header, Access, Next steps and tasks. Facts stack the way they do on Stripe Dashboard's iOS customer sheet (https://mobbin.com/screens/8113ccdd-0eac-4bb5-9731-55cf00a433a1), and CapEx and Financials stay one tab away.

<details><summary>What the reviewer covered</summary>

Routes: /properties/[id] for 767 Prospect (cmtg25y4p0006jphsv3frndk6), 118 Congress (cmtg25y4k0002jphsxww4tv6k), 647 Prospect (cmtg25y4m0003jphsrpe7xpb8) and 58 Mariner (cmtg25y4q0008jphsayu0rycs), plus /properties (to compare unit counts and open-task counts) and public /rentals (to see what Available listings publish). Port 3200 was up; all loads 200, no console errors, no failed requests, no sideways page scroll at any width.
Viewports: desktop 1280 (all four properties, viewport and full page), wide 1920 (118 Congress), tablet 768 touch (767 Prospect, including a computed-opacity check on every Edit control), mobile 375 touch (767 Prospect walked top to bottom, 58 Mariner), narrow 320 (767 Prospect). Themes: light everywhere; dark mode on 118 Congress at desktop and mobile with unit accordions open. Browsers: Chromium everywhere; WebKit (Safari) at 375 on 58 Mariner.
States exercised on 767 Prospect: CapEx year-bar filter (2026 selected); unit Utilities and Equipment accordions; inline address field (hover, measured width; the focus shot timed out); every edit mode (Details, Loan, Insurance, Notes, Building CapEx, Units, Rentals) at desktop and the main ones at 375; Rentals "+ Add listing"; Units dirty-cancel confirm dialog, then Esc (dialog stayed open). Save attempts were not needed; blockedWrites stayed empty.
Code read: everything in src/app/(app)/properties/[id]/, plus SectionCard/Field in src/components/ui.tsx, inline-address-field.tsx, back-link.tsx, attachments.tsx, confirm-dialog.tsx, src/lib/properties/service.ts, src/lib/property-types.ts, src/lib/quickbooks/queries.ts, the Property and TaskStatus models in prisma/schema.prisma, docs/property-page-plan.md, docs/components.md and the D10/D21/D31 rows of the Asana migration spec.
Data check: one read-only SELECT against the local dev database (hg_capital_dev) confirmed currentLoan, attorney and refiTarget are populated and unitCount disagrees with the units JSON; a second count query was blocked by the permission classifier, so overdue counts come from the rendered page.
Not reached: a document list with real files (no property has any; uploads are writes), photo upload and the uploading state, post-save and save-error states (writes are aborted), the Financials expense bars and recent-transactions list (no mapped property has classed lines), and the not-found route.
Mobbin: 17 searches (web and iOS). Ramp is not in Mobbin, so Ramp-style claims are backed by Stripe, Mercury, Attio, Linear, Shopify, Vanta and Origin screens. Mobbin attached a notice on every result saying AI usage is high this month (unlimited during beta, credits may need buying once limits take effect).

</details>

## Findings

### PROPERTY-002

**The current loan balance is stored for every property but never shown, so equity and LTV are invisible**

High · Fix · effort S · `Property page, Loan card` · One record layout for every record · quick win

- **Today:** Property.currentLoan is stored for all 11 properties but no component renders or edits it. The data also suggests 765 and 767 Prospect share one loan, since both carry $292,890 against $550,000.
- **Why:** The page's first job is 'keep, refi or sell'. That decision runs on loan balance against value: roughly $108k of equity and 75% LTV at 118 Congress. The number is already in the database. Stripe's customer page leads with the money that matters, and here it is hidden.
- **Change:** Add a 'Balance' row (current loan) as the first row of the Loan card and to its edit form. Show the derived 'Equity' (value minus balance) and 'LTV' (balance over value, one decimal) right under it, in tabular figures. This is a data-surfacing fix that needs no layout change; the stat strip in PROPERTY-012 later promotes these figures.
- **Desktop, tablet, phone:** Desktop and tablet: three rows in the Loan card. Phone: the same rows, with the label on the left and the value on the right.
- **Reuse:** Field in components/ui.tsx, fmtMoney in lib/utils.ts. patchProperty already accepts currentLoan (MONEY_FIELDS in src/lib/properties/service.ts:81-85).
- **References:** 
  - [Copilot](https://mobbin.com/screens/0abca29e-c16e-45bb-9134-21dbc0c20c37): The Net worth card puts Assets and Debts side by side with one change chip each. Pair Value with Loan balance so equity reads as a single subtraction.
  - [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4): Library north-star screen for calm money UI. The concrete pattern is on the account page below.
  - [Mercury](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930): The account page leads with the balance as the key figure and puts small Current and Pending facts under it. The loan balance can lead the Loan section the same way.
  - [Quicken](https://mobbin.com/screens/4ccc8fa1-4cce-4ec8-a469-5c921643f512): Debt-to-asset ratio shown as one headline percentage next to the asset and debt totals
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): The Insights block leads the right rail with the money figure
  - [Copilot](https://mobbin.com/screens/fcb4126b-4d10-4708-98ae-ddbf5ed80ba4): Assets and Debts lead the accounts page as two figures, and loans are a group with their own subtotal.
- **Code:** `prisma/schema.prisma:113`, `src/lib/properties/service.ts:81-85`, `src/app/(app)/properties/[id]/edit-loan.tsx:60-68`, `src/app/(app)/properties/[id]/page.tsx:140-153`, `prisma/schema.prisma:114`, `scripts/migrate/01-properties.ts:125`, `src/app/(app)/properties/[id]/edit-loan.tsx:61-67`, `src/app/(app)/properties/[id]/page.tsx:141-152`, `src/app/(app)/properties/page.tsx:53-59`, `Helper run 'loans' over all 11 /properties/<id> pages: Loan #, Original amount, Rate, Payment / mo and Originated are '—' on every property`, `src/app/(app)/properties/[id]/edit-loan.tsx:61-67, 94-101`, `grep: currentLoan appears only in prisma/schema.prisma, scripts/migrate/01-properties.ts and src/lib/properties/service.ts:83`
- **Also found as:** DATA-I01 (Lens: tables, numbers, money, charts and status), G1E-IV02 (What leaves the app: printouts, PDFs and the Google listing)
- **Verification:** partly. Verified in the DB: currentLoan is filled for all 11 properties (118 Congress $321,603.45 against a $430,000 value), and grep finds it only in service.ts, never in a .tsx file. The finding's 'six of seven are a dash' matches 767 and 118. Calibrated to high: the figure is missing, not wrong. Two cautions for the recommendation. First, 765 and 767 Prospect carry an identical $292,890 balance and $550,000 value, which looks like one blanket loan entered on both rows; per-property equity and LTV would double count it. Second, value is 'appraised / estimated' and currentLoan has no as-of date, so show 'as of' beside Balance, as the plan doc's section 1 table asks. Quicken and Stripe references are weak support for an LTV row.

### PROPERTY-007

**Ten stored property fields have no UI, so the tax-due reminder can never be created**

High · Fix · effort M · `Property page, Details, Loan and Insurance cards` · One record layout for every record

- **Today:** patchProperty accepts propertyTaxDueDate, attorney, refiTarget, loanType, closingCosts, rehabAmount, rehabMonths and the three insurance fields, but no UI renders them. loanEscrow exists only in the schema and isn't accepted by patchProperty.
- **Why:** The auto-reminder system for key dates is built but starved of input for taxes. Purchase basis (price plus closing plus rehab) can't be shown, and the deductible is the number you need after a loss.
- **Change:** Add each field where it belongs:
- Tax due date beside rental registration under Details (or the Key dates band in PROPERTY-013).
- Loan type and escrow (yes or no) in Loan.
- Coverage, deductible and liability in Insurance.
- Closing costs and rehab spend in Details, with a derived 'All-in basis' row.
- Attorney and refi target in the facts rail.
Drop rehabMonths if no one uses it.
- **Desktop, tablet, phone:** Same fields at every size. On phone, empty optional fields collapse behind 'Show 4 empty' (see PROPERTY-020).
- **Reuse:** Field, Input and Select in components/ui.tsx; patchProperty already handles these columns; LOAN_TYPES in lib/config.ts.
- **References:** 
  - [Attio](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf): Full attribute list where empty fields read 'Set Estimated ARR…' and fill in place
  - [Remote](https://mobbin.com/screens/e2474395-d7d2-491b-9827-738450004079): Compact plan facts with dated rows such as 'Expiration date'
- **Code:** `src/lib/properties/service.ts:76-97`, `src/lib/properties/service.ts:143-158`, `src/app/(app)/properties/[id]/page.tsx:123-165`, `prisma/schema.prisma:100-143`
- **Verification:** partly. Grep confirms none of these fields appear in any .tsx file. The DB confirms attorney is set on all 11 (Nick, Neil, Dan), refiTarget on 3 (118 Congress, 765 and 767), and propertyTaxDueDate on 0, while the propertyTax reminder in syncPropertyReminders reads it. One factual slip: loanEscrow is in the schema (Boolean default false), but patchProperty does not accept it. It is in none of TEXT_FIELDS, MONEY_FIELDS or DATE_FIELDS, so surfacing it needs a service change too. Adding ten fields fights the simplicity bar unless 020's fold of empty fields ships with it. The Attio cf4f2b49 reference fits.

### PROPERTY-011

**Split the 12-card scroll into the D10 tabs and define what each tab holds**

High · Design change · effort L · `Property hub (D10), page structure` · One record layout for every record · big bet

- **Today:** The page stacks 12 cards in two uneven columns: Financials, 5-year CapEx, Building CapEx, Units & access and Rentals on the left; Details, Loan, Insurance, Tasks, Documents and Notes on the right. It is 2,182px tall on desktop, 3,728 on tablet and 3,836 on phone (5,639 with Units in edit mode). On phone, Value and the loan sit about 2,000px down, below CapEx tables and unit accordions. At desktop the left column ends about 700px before the right one, leaving a large empty area. Finding anything means scrolling and scanning card titles.
- **Why:** Stripe, Attio and Linear give each record one job per view and keep a short Overview. D10 already approved a tabbed hub. This page is past the plan doc's own 'go to tabs past ~10 sections' threshold.
- **Change:** Use underline tabs with counts. Each tab and its contents:
- **Overview:** stat strip, Coming up (key dates and overdue items), the top 5 tasks, and the facts rail (Details, Loan, Insurance summary).
- **Tasks (29):** the full grouped list with quick add.
- **Units (3):** unit table; each unit sheet holds lockbox, utilities, equipment and its listing.
- **Documents:** files grouped by category.
- **Financials:** QuickBooks P&L, the expense breakdown and transactions.
- **CapEx:** forecast chart and one asset register (building and unit).
- **Activity:** notes and change history.
The current Rentals card moves into Units. Notes moves into Activity. The Financials, 5-year CapEx and Building CapEx cards leave Overview except for their headline numbers.
- **Desktop, tablet, phone:** Desktop 1280: tabs under the header, rail at 320px on the right of Overview. Tablet 768: same tabs, and the rail drops below the strip as a two-column field grid. Phone 375: the tab row scrolls sideways, Overview shows strip, Coming up and tasks, and the rail becomes a 'Details' section at the bottom.
- **Reuse:** TopTabs (components/nav.tsx) for route-based tabs (/properties/[id]/units and so on), so tabs deep-link and Back works. SectionCard content moves as-is into tabs first.
- **Challenges:** docs/property-page-plan.md section 6 ('Keep it one page… Only go to tabs if it passes ~10 sections'). D10 supersedes it, and the page now has 12 sections.
- **References:** 
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The domain twin for the D10 hub. The header has a photo thumbnail, the address, a status pill and an overflow, over the tabs Overview, Listing, Applications, Leases, Payments and Maintenance. Overview pairs content cards with a Next steps rail.
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): Record tabs with counts (Emails 73, Team 1, Notes 0) beside a persistent details rail
  - [Linear](https://mobbin.com/screens/f63720fa-32c2-42da-aa5a-9c8d2083053d): Overview, Updates and Issues tabs on a project, with a properties rail on Overview
  - [Vanta](https://mobbin.com/screens/04700d4b-5e9e-4d23-99aa-0bb96e3adc05): Vendor record split into Overview, Risk management and Security review tabs with an 'Additional details' rail
  - [Tonal](https://mobbin.com/screens/2d0bfd69-e610-48f4-adf7-8ce2ffdaed0d): iOS underline tab row that scrolls sideways for four or more tabs
  - [Zillow](https://mobbin.com/screens/5cd12c32-2216-45f0-bf87-6ccd06b0476e): Property header with status chip, then Overview, Listing, Leases and Payments tabs, with Next steps on Overview.
  - [Linear](https://mobbin.com/screens/1a4540b2-6c15-49ff-a07f-4fddb7490e38): Overview and Issues tabs with a properties rail.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:94-227`, `docs/property-page-plan.md:152-165`, `src/app/(app)/properties/[id]/page.tsx:96-226`
- **Also found as:** IA-008 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. Heights reproduce: 2,182 desktop, 3,728 tablet, 5,639 phone with Units in edit mode. On phone, Details (Value) starts at 1,839px. One overstatement: at 1280 the left column ends about 460px above the right one, not 700. The plan doc does say 'Only go to tabs if it passes ~10 sections', and D10 supersedes it; conflicts_with names this correctly. The Attio tabs-with-counts pattern was spot-checked; similar Attio record screens came back with counted tabs and a details rail. This is the umbrella for 012, 018, 019, 027 and 028; those carry the detail.

### PROPERTY-012

**Open Overview with one flat stat row: Value, Loan balance, Equity, LTV, NOI and CapEx due**

High · Design change · effort M · `Property hub, Overview above the fold` · One record layout for every record

- **Today:** Above the fold at 1280 you see the header, a Financials card that says 'No QuickBooks class is mapped…' on 3 of 4 properties ($0 / $0 / $0 on the fourth), and the 5-year CapEx bars. The value appears once, as an uppercase row in Details. There is no equity, LTV, NOI or next-date figure anywhere above the fold.
- **Why:** Stripe and Mercury put the two or three numbers that decide what you do next at the very top. A partner opening 118 Congress should see '$430k value · $322k loan · $108k equity · 75% LTV' in one glance.
- **Change:** Under the tabs, one row of six figures separated by hairlines, with no card boxes: Value, Loan balance, Equity, LTV, NOI (12 mo) and CapEx due (red only when overdue items exist). Each is a muted label over a Geist Mono figure. Missing inputs show 'Add value' as a link that opens that field.
- **Desktop, tablet, phone:** Desktop: 6 across. Tablet: 3 by 2. Phone: 2 by 2 showing Equity, LTV, NOI and CapEx due; Value and Loan move into the rail.
- **Reuse:** Kpi from financials/_components/ui.tsx (move it to components/ first, as docs/components.md requires), restyled flat; fmtMoney compact.
- **References:** 
  - [Shopify](https://mobbin.com/screens/5070a71f-df97-4c8a-b3cf-2c1eeb0d931e): Unpaid, Scheduled and Paid as one flat figure row at the top of a vendor record
  - [Mercury](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930): One large balance with small Current, Pending in and Pending out figures beside it
  - [Mercury](https://mobbin.com/screens/7a717e40-6b9a-4dbc-a81c-b7da99d784cb): Phone version: one large number, then a two-up pair (Money in, Money spent)
  - [Copilot](https://mobbin.com/screens/fcb4126b-4d10-4708-98ae-ddbf5ed80ba4): Assets and Debts lead the page as two figures with change pills; each account shows value and change.
  - [Zillow](https://mobbin.com/screens/7174235e-3a68-4cc5-ba03-7edeb1507de0): Three figure tiles (estimate, range, rent) over the value history.
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The property overview leads with the asset's key status and next steps
  - [Quicken](https://mobbin.com/screens/4ccc8fa1-4cce-4ec8-a469-5c921643f512): Real estate value with an all-time change figure
- **Code:** `docs/property-page-plan.md:45-60`, `src/app/(app)/properties/[id]/page.tsx:94-138`
- **Also found as:** DATA-053 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. Above the fold at 1280 there is only the unmapped Financials nag and the CapEx card; Value appears once, as an uppercase Details row. The plan doc's section 1 already specs this strip (All-in basis, Value, Equity, LTV, CapEx due, Next key date), so it is reuse of an earlier plan. Caveat from 002: the 765/767 shared loan needs handling before LTV is shown per property. Kpi lives in financials/_components and must move to components/ first, as the inventory says.

### PROPERTY-013

**Replace the scattered Maturity and Renewal boxes with one 'Coming up' list of key dates**

High · New capability · effort M · `Property hub, Overview 'Coming up'` · One record layout for every record

- **Today:** Loan maturity and insurance renewal each render as a bordered box inside their card, and only when set. None of the four sample properties has either date, so no box ever appears. Rental registration is a dash inside Details, and the tax date has no field at all. Meanwhile the real dates live as hand-made tasks ('loan is due' Nov 1, 2026 at 767 Prospect; 'loan due' Dec 1, 2026 at 58 Mariner).
- **Why:** Missing a balloon date or an insurance lapse is the costliest failure on this page. One list in date order is how Mercury and Programa show what is due; separate cards hide it.
- **Change:** A 'Coming up' list on Overview, sorted by date. It holds loan maturity, insurance renewal, tax due, rental registration and CapEx items past their life. Each row shows its name, date and a countdown ('in 10 days', or a red '3 wk overdue'), plus a link to its reminder task. Unset dates appear at the end as muted 'Add loan maturity' rows, so missing dates are visible rather than silently absent.
- **Desktop, tablet, phone:** Desktop and tablet: the list sits under the stat row, left of the rail. Phone: directly under the stat tiles, showing the first 4 rows and a 'Show all' link.
- **Reuse:** syncPropertyReminders and KEY_DATE_FIELDS in lib/properties/service.ts, relativeDays in lib/dates.ts, the row style from the Today list.
- **References:** 
  - [Copilot](https://mobbin.com/screens/0abca29e-c16e-45bb-9134-21dbc0c20c37): The 'Next two weeks' card is one dated row per upcoming item ('Today', 'Jun 26th') with the name, a category chip and a right-aligned amount. Coming up should use this shape for loan maturity, renewal and tax dates.
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): Countdown wording ('4d left'), with red reserved for the day itself.
  - [Programa](https://mobbin.com/screens/079d676e-8012-4f1d-b29a-a20bfb05a015): Deadlines grouped Overdue and This week, with typed dates (Install, Deposit due) in one table
  - [Mercury](https://mobbin.com/screens/607720b2-bd1f-4d7f-90e0-aa31e341fd92): Bill Pay block with Outstanding, Overdue and Due soon counts
- **Code:** `src/app/(app)/properties/[id]/edit-loan.tsx:43-59`, `src/app/(app)/properties/[id]/edit-insurance.tsx:45-60`
- **Verification:** confirmed. The DB shows loanMaturityDate, insuranceRenewalDate, rentalRegistrationExpiry and propertyTaxDueDate empty on all 11 properties. The real dates sit in hand-made tasks ('loan is due' Nov 1 at 767, 'loan due' Dec 1 at 58 Mariner). The boxes in edit-loan.tsx:43-59 never render. The plan doc's 'Key dates card' asks for exactly this. Keeping unset dates as muted 'Add loan maturity' rows is the right call.

### PROPERTY-016

**Replace whole-card edit modes with tap-to-edit per field**

High · Design change · effort L · `Property page, all view and edit sections` · One record layout for every record · big bet

- **Today:** Edit flips a whole card into a form: Details becomes 10 inputs with Cancel and Save, and Loan becomes 8. Units turns every unit, every utility and every equipment row into inputs at once, which takes the phone page to 5,639px. To change one rate you open the whole form, scroll and save.
- **Why:** Attio and Linear edit one value in place, and Stripe opens a focused drawer. CLAUDE.md asks for tap-to-edit on touch instead of edit pencils everywhere. Whole-card forms are the heaviest, least modern pattern here.
- **Change:** Click or tap a value to edit it in place: an input for text and money, a date picker for dates, a menu for selects. Enter or blur saves, Esc reverts, and a toast confirms with Undo. Keep a sheet only for multi-row editors (one unit's equipment, one listing). Empty values show 'Add rate' as the target.
- **Desktop, tablet, phone:** Desktop: inline, with a hover outline as the cue. Tablet and phone: tapping a row opens a small bottom sheet with that one field and Cancel and Save in its header.
- **Reuse:** Generalize InlineAddressField into an InlineField (docs/components.md already names it the base for any inline edit) and React Aria DatePicker and Menu (approved). This retires SectionCard's edit mode for these cards.
- **Challenges:** docs/components.md pick for 'Section with view and edit modes' (SectionCard). Not a settled decision, but this changes the documented default for record fields.
- **References:** 
  - [Attio](https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f): A single attribute ('Funding raised') turns into an input in place inside the details rail
  - [Shopify](https://mobbin.com/screens/762e9378-9959-4f4b-828f-1786036face1): iOS one-field sheet with Cancel and Save in its header
  - [Mercury](https://mobbin.com/screens/cc047c78-63c7-4640-a2ce-35f6cee4bba7): Each fact has its own 'Edit ›'; the toast confirms 'Entries start date updated'.
  - [Mercury](https://mobbin.com/screens/f02d23c4-f6ae-4eaa-8a09-c01b098cb7a1): Profile facts are each editable on their own, with no card-wide edit mode, and the toast says what changed.
  - [Airbnb](https://mobbin.com/screens/bc83ce0c-a98c-4b24-95db-b1bc329d288d): Settings save on change in the side panel, with the toast 'Advance notice updated' and no Save button.
- **Code:** `src/app/(app)/properties/[id]/edit-details.tsx:70-131`, `src/app/(app)/properties/[id]/edit-units.tsx:112-120`, `src/app/(app)/properties/[id]/edit-details.tsx:47-125`, `src/components/ui.tsx:46-55 (Edit hidden until group hover)`
- **Also found as:** FEEL-I07 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Details edit opens 10 inputs and Loan 8. On phone, Units edit takes the page from 3,836 to 5,639px (5,815 at 320), measured. InlineAddressField is documented as 'the base for any inline text edit', so generalizing it is reuse. This depends on the Toast that the spec builds in cutover week. Large effort, but the right direction.

### PROPERTY-018

**Replace box-in-box unit accordions with one Units table and a unit sheet**

High · Design change · effort L · `Property hub, Units tab` · Rentals, residents and the public site run one lifecycle

- **Today:** 'Units & access' is a card holding one bordered box per unit, each with a gray header (label and a lock emoji with the code) and two collapsed accordions, Utilities and Equipment. That is three nested borders. Seeing whether any unit has equipment to replace takes two clicks per unit. Listings for the same units sit in a separate Rentals card below.
- **Why:** Zillow and Stripe show a list of children as a table with one row each. Nested boxes and default-closed accordions hide the 'Replace' flags that matter, and they make the page read heavy.
- **Change:** Units tab: a table with columns Unit, Lockbox, Utilities (tenant or owner pays), Equipment ('2 to replace' in red, or 'OK'), Listing (status badge plus rent) and a chevron. A row opens a unit sheet with sections for Access, Utilities, Equipment and Listing. Overview shows only the unit count in the header.
- **Desktop, tablet, phone:** Desktop: full table. Tablet: the Utilities column drops. Phone: list rows with unit name and listing badge on line 1, and lockbox plus '2 to replace' on line 2; tapping opens a full-height sheet.
- **Reuse:** Table primitives; UnitsSection and ListingsSection content moves into the sheet. Property.units JSON stays the source (D21 reads it), and the Unit model in plan doc section 2 can follow.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/f9bb1773-52bd-4158-82fb-4340ed6aa13e): The room page puts photos at the top, then rows with chevrons and one-line summaries ('Lock on bedroom door', 'Add details'), with a left column of rooms to switch between. The unit sheet can use rows for Access, Utilities, Equipment and Listing and switch units without closing.
  - [Airbnb](https://mobbin.com/screens/0b18b761-107c-4e36-b112-df4bfc73b402): Editing one row opens a side panel with Cancel and Done while the room page stays in view.
  - [Zillow](https://mobbin.com/screens/a8e8b6ba-4655-4505-8d1c-64f2386e12bf): Available units table: unit with beds and baths, sqft, available date, price and a row chevron
  - [Zillow](https://mobbin.com/screens/9359a8d4-5617-4236-83d7-5260cac892ab): Lease rows with a status chip and one primary action per row
  - [Zillow](https://mobbin.com/screens/33d4307f-0f26-44a8-bf28-298ba22f160b): Available units table: Unit, Sqft, Available (date or 'Now'), Price in one row
  - [Zillow](https://mobbin.com/screens/afce10d7-7bd9-4529-96fe-c1e1ab8d2434): Phone unit rows: name, then '1 bd, 1 ba · 672 · Aug 20 · $3,122' on one line
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Subscription row: product, dated status, frequency, next invoice amount
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:157-290`, `src/app/(app)/properties/[id]/page.tsx:107-119`
- **Also found as:** G2C-003 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** confirmed. Seen: a card, then a bordered unit box with a gray header, then bordered accordion rows. Utilities and Equipment are closed by default, and 'Replace' pills only show once each is opened. Overlaps 057 on removing the sub-box borders; keep the table and sheet here and leave the chrome rule to 057.

### PROPERTY-019

**Merge the forecast, Building CapEx and unit equipment into one CapEx tab with one chart and one register**

High · Design change · effort L · `Property hub, CapEx tab` · One record layout for every record

- **Today:** Lifecycle data shows up in three places with three treatments:
- the 5-year forecast card (bars, then a table with 'Due soon' in red);
- the Building CapEx card (11-row grid with Good, Monitor or Unknown text and a red 'Replace' badge);
- each unit's Equipment accordion (a separate table with a red Replace pill and red cost).
The forecast total includes unit items that you can only see inside closed accordions.
- **Why:** One concept, three UIs. Origin and Rocket Money show a chart over the one table it summarizes, and clicking a bar filters that table. That is simpler and clearer.
- **Change:** CapEx tab layout:
- A headline ('$14,500 over 5 years · $13,000 overdue').
- The year bars; clicking one filters the register below.
- One register of every asset, building and unit, grouped by location, with columns Asset, Location, Installed, Age, Status and Cost, plus a 'Needs a year' filter.
Editing happens per asset row. Overview keeps only the 'CapEx due' tile and overdue assets in Coming up.
- **Desktop, tablet, phone:** Desktop: chart 200px tall over the register. Tablet: same. Phone: bars as a compact list of years with totals, and the register as two-line rows (PROPERTY-017).
- **Reuse:** capexForecast, lifecycleStatus and equipmentStatus in lib/property-types.ts already compute every row. CapexForecastCard and BuildingCapexSection collapse into one component.
- **References:** 
  - [Copilot](https://mobbin.com/screens/e4104151-c47b-47fb-9971-327ce2ad89c4): One list of categories with a spent bar against the budget, red only when over. Selecting a row gives it a light fill and opens a detail with monthly bars and a dashed budget line. This is one chart and one register, with the selection driving both.
  - [Rocket Money](https://mobbin.com/screens/90eca6fd-2b6e-409c-ba78-52b93097ed7e): Monthly bars where the selected month (dark pill) drives the transactions table below
  - [Origin](https://mobbin.com/screens/0ab66387-cf7d-4042-9249-519ac8ff5215): Chart, then a KPI row, then a month table with right-aligned money
- **Code:** `src/app/(app)/properties/[id]/capex-outlook.tsx:14-193`, `src/app/(app)/properties/[id]/building-capex.tsx:54-246`, `src/app/(app)/properties/[id]/edit-units.tsx:237-283`
- **Verification:** confirmed. Three treatments confirmed: forecast table 'Due soon', the Building CapEx grid, and unit Equipment tables with a red Replace pill. Also, 'Unknown' renders in foreground ink in unit equipment (toneText gray is '') but muted in Building CapEx. capexForecast already returns the items, so one register is mostly a UI merge.

### PROPERTY-022

**Free-text install years ('Old', 'Newer', 'x') silently drop equipment out of status and the forecast**

High · Fix · effort M · `Property page, unit Equipment` · Fix wrong numbers and records first

- **Today:** The equipment Year field is a free-text input. At 767 Prospect, Upper / Upper Front has an Oven with year 'Newer' and an HVAC with 'Old'. At 118 Congress, Rear has a Dishwasher with model 'x' and year 'x', and a Washing Machine with 'Newer'. parseInstallYear finds no year, so these show 'Unknown' and are left out of the 5-year total with no warning. An 'Old' HVAC is an $8,000 line.
- **Why:** The forecast total looks precise but omits known-old equipment, which is a money-accuracy problem, not just a data-entry one.
- **Change:** Make Year a numeric year field with an 'Approx.' checkbox instead of free text, and migrate the existing words into a comment. In the CapEx headline, add '3 items need a year' as a link that filters the register to them.
- **Desktop, tablet, phone:** Year field is 16px numeric on touch with `inputmode="numeric"`; the count link sits under the headline at all sizes.
- **Reuse:** parseInstallYear and equipmentAge in lib/property-types.ts; Input with type number.
- **References:** 
  - [Attio](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf): Typed attributes ('Foundation date', 'Set Foundation date…') rather than free text
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:406-412`, `src/lib/property-types.ts:261-262`, `src/lib/property-types.ts:262-265,414-418`, `grep: unknownCount is never referenced under src/app or src/components`, `src/lib/capex-rules.ts:31`
- **Also found as:** COPY-V05 (Lens: words on every screen), DATA-036 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. The DB confirms the words cited, and it is worse. At 767 both 1st Front and Upper HVAC are 'Old' (two $8,000 lines, $16,000 left out), and 1st Rear's oven says 'Fine'. At 118 Front the water heater reads '2006 or 2012? Both Low front...'; parseInstallYear takes the first match, so it shows 20 yrs and 'Due soon'. capexForecast already computes unknownCount, which no UI renders; use it for the '3 items need a year' link.

### PROPERTY-IV01

**Show the full address as the page title instead of clipping it at about 20 characters**

High · Fix · effort S · `/properties/[id] (header), also /deals/[id]` · One record layout for every record · quick win

- **Today:** The page title is an always-on text input that cuts off mid-word. It reads '767 Prospect Avenue, Buffalo,' at 1280, '767 Prospect Avenue, Buffal' at 375 (input scrollWidth 317 against clientWidth 239) and '118 Congress St. Buffalo, NY 1' on 118 Congress. The page has no h1: the first item in main's accessibility tree is textbox 'Address'. The same component heads the deal page.
- **Why:** Stripe's record pages lead with the full title, the status badge beside it and the related record under it. A clipped title is the first thing on every property and deal, makes the page read unfinished, and leaves screen readers without a page heading.
- **Change:** Render the address as an h1 that sizes to its text and wraps, followed by the status badge. Clicking it on desktop, or tapping it on touch, swaps in the input. Enter saves and Esc reverts, as today. The input styling appears only while editing.
- **Desktop, tablet, phone:** Desktop 1280: one line with the badge inline. Tablet 768: wraps to a second line when needed, with the badge after the last word. Phone 375: wraps, and '3 units' moves to the muted subline.
- **Reuse:** Extend InlineAddressField (src/components/inline-address-field.tsx) with a display state. It serves both properties/[id] and deals/[id].
- **References:** 
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): The payment page title is shown in full with the status badge beside it and 'Charged to Leonard Kim' under it.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): The record name is the h1, with a muted secondary line under it
  - [Linear](https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33): Editable title that sizes to its text.
  - [Jobber](https://mobbin.com/screens/fb82e72d-18f7-41ae-9127-6ec221711f74): The record title wraps to two lines at full width under its status line instead of truncating.
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): Street on the first line, city/state/ZIP on the second
  - [Stripe](https://mobbin.com/screens/d7461782-27a7-41e9-aa99-ac528bcd4fca): Short title with a separate meta row ('Created on', 'Expires in')
  - [Attio](https://mobbin.com/flows/ed18fe27-a14a-4331-9d02-c5dceb2c60b9): The record header shows the full record name, with actions on the right
  - [Linear](https://mobbin.com/screens/5bc1daea-c0a9-4e20-8f0d-77163691df63): The title edits in place as plain text.
- **Code:** `src/components/inline-address-field.tsx:36-51 (w-full input inside an auto-width flex item falls back to its default size)`, `src/app/(app)/properties/[id]/page.tsx:82-83`, `src/components/inline-address-field.tsx:36-51`, `src/app/(app)/properties/[id]/page.tsx:80-92`, `src/components/inline-address-field.tsx:50`, `src/app/(app)/properties/[id]/page.tsx:82-90`, `src/app/(app)/properties/[id]/edit-details.tsx:36-50`, `probe: Address input 246x30 at 375, 239x30 at 768`, `src/components/inline-address-field.tsx:36-50`, `src/components/inline-address-field.tsx:37-50`, `eval: address input scrollWidth/clientWidth 390/313 at 1280, 319/246 at 768 and 375; h1 count 0`, `eval on /properties/<767> and <23 Sherwood>: input scrollWidth 388/317/344 vs clientWidth 299/239/299`, `src/app/(app)/properties/[id]/page.tsx:81-91`, `src/components/inline-address-field.tsx:35-62`
- **Also found as:** PROPERTY-003 (Property detail page (future property hub)), VISUAL-002 (Lens: visual design system across every screen), IA-IV03 (Lens: information architecture and global SaaS patterns), MOBILE-023 (Lens: phone and tablet experience on every route), MOBILE-IV07 (Lens: phone and tablet experience on every route), DATA-V04 (Lens: tables, numbers, money, charts and status), COPY-016 (Lens: words on every screen), JOURNEYS-V01 (Lens: the core jobs, end to end), DEALS-033 (Deals pipeline, new deal and deal detail)
- **Verification:** verifier-found

### PROPERTY-V01

**National Grid 'LOFL' stores account numbers but edits as a status select, so one touch erases them**

High · Fix · effort S · `Property page, Units edit (utilities)` · Fix wrong numbers and records first · quick win

- **Today:** nationalGridLofl is in UTILITY_STATUS_FIELDS, so edit mode renders it as a select with Done, Need to set up, Call to confirm and NA. In the DB, all 27 unit rows across the 11 properties store an account-style number there (81531-59050, 37435-37003, 22803-89006). Read mode shows 'LOFL 81531-59050'; edit mode shows the select at '—' because the stored value isn't an option. Leaving the select untouched keeps the number. Picking anything replaces it for good. National Fuel 'LOFL' holds statuses ('Done', 'Call to confirm'), so one label means two different things.
- **Why:** An edit form that shows '—' for a value that exists invites overwriting it, and the number is what you read to National Grid on the phone. This is silent data loss in the one editor that holds every unit's utility setup.
- **Change:** Render nationalGridLofl as a text input (drop it from UTILITY_STATUS_FIELDS), and ask Connor what LOFL means so the label says it. As a guard for every status select, when the stored value isn't an option, add it as a selected option, the way EditListingCard keeps a renamed unit label.
- **Desktop, tablet, phone:** No layout change. On phone the field is a 16px text input like the Acct # field beside it.
- **Reuse:** UTILITY_GROUPS and UTILITY_STATUS_FIELDS in lib/property-types.ts. The keep-the-current-value option pattern from edit-listings.tsx:276.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:333-345`, `src/lib/property-types.ts:79-87`, `src/lib/property-types.ts:78-84 (nationalGridLofl in UTILITY_STATUS_FIELDS)`, `src/app/(app)/properties/[id]/edit-units.tsx:333-345 (status select)`, `Local DB: 27 nationalGridLofl values that are not one of the four statuses`
- **Also found as:** PROPERTY-IV02 (Property detail page (future property hub))
- **Verification:** verifier-found

### PROPERTY-V05

**On phone, show CapEx items as stacked rows so Cost and the 5-year total stay visible**

High · Design change · effort M · `/properties/[id] (5-year CapEx forecast, Equipment tables)` · The phone is a chosen subset, and touch has no hover

- **Today:** The CapEx forecast table has a min-width of 420px inside a sideways-scrolling box. At 375 the Due column is cut to 'Du' and Cost is off screen. At 320 only Location and Asset show, and the 5-year total row shows its label with no amount. The unit Equipment table (min-width 640px) scrolls sideways the same way.
- **Why:** Money is the point of this card, and on phone it's hidden behind a sideways scroll nobody discovers. Stripe's phone app never shows a payments table: each row stacks the amount, description and date.
- **Change:** Below 640px, render each forecast item as a two-line row: asset and location on the left with the cost right-aligned in Geist Mono, then age and due status on the second line ('16 yrs · Due soon' in the red tone). The 5-year total stays a bold row at the bottom. Equipment uses the same pattern.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the current table, unchanged. Phone 375 and 320: stacked rows with no sideways scroll. Location shortens to the unit label, and the Age column becomes part of the second line.
- **Reuse:** The rows already built in capex-outlook.tsx:142-143 and Badge tones for due status. Add the stacked variant to the Table primitive or compose it beside the page.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/d8b72d98-48cd-4829-ad08-309ae833dfe4): The phone payments list stacks the bold amount and status, then the description, then the date in each row, with no table.
  - [Stripe Dashboard](https://mobbin.com/screens/8113ccdd-0eac-4bb5-9731-55cf00a433a1): Payments on iOS as two-line rows: amount and status, then the date
  - [Stripe Dashboard](https://mobbin.com/screens/51b576a6-2ec6-4a8d-ae2f-0695dc005336): Short phone list with a 'View all · 19 total' row
  - [Stripe Dashboard](https://mobbin.com/screens/4faf8630-06a3-4a56-8271-b6cd5bec3a25): Label left, amount right, Total bold: no horizontal table on phone
  - [Copilot](https://mobbin.com/screens/8fcfa6a7-f247-4a53-ab29-bab4255199bd): One row per category fits a phone: name, spent, a slim bar, budget. HG: property, 2026 due, slim bar, 5-year total.
  - [Copilot](https://mobbin.com/screens/2bd097b7-42c9-406a-ae97-d7658b248720): Tapping a row opens one big figure with a left amount, monthly bars and a budget line, then the line items.
  - [Neo Financial](https://mobbin.com/screens/c15a8a82-db46-4b6b-85f9-a355ca20b9ab): Category rows with the amount right-aligned and a count subline; no grid on phone
  - [Mercury](https://mobbin.com/screens/7a717e40-6b9a-4dbc-a81c-b7da99d784cb): Phone sections as simple lists with figures right-aligned
- **Code:** `src/app/(app)/properties/[id]/capex-outlook.tsx:142-143 (overflow-x-auto, min-w-[420px])`, `src/app/(app)/properties/[id]/edit-units.tsx Equipment table min-w-[640px]`, `src/app/(app)/properties/[id]/capex-outlook.tsx:142-143`, `src/app/(app)/properties/[id]/building-capex.tsx:153-154`, `src/app/(app)/properties/[id]/edit-units.tsx:239-240`, `src/app/(app)/properties/[id]/capex-outlook.tsx:136`, `src/app/(app)/portfolio-capex.tsx:165`, `src/app/(app)/portfolio-capex.tsx:164`, `src/app/(app)/properties/[id]/building-capex.tsx:19`, `src/app/(app)/portfolio-capex.tsx:163-165`
- **Also found as:** PROPERTY-017 (Property detail page (future property hub)), DATA-019 (Lens: tables, numbers, money, charts and status), MOBILE-030 (Lens: phone and tablet experience on every route), SHELL-026 (App shell, sidebar, top bar, global search and Home)
- **Verification:** verifier-found

### PROPERTY-014

**Move the 'No QuickBooks class is mapped' notice out of the page's top slot**

Medium · Design change · effort S · `Property page, Financials card` · One record layout for every record

- **Today:** On 767 Prospect, 647 Prospect and 58 Mariner the first card on the page is a Financials box that only says 'No QuickBooks class is mapped to this property yet. Map it in Financials → Settings.' It takes the most valuable spot on the screen for a one-time admin task.
- **Why:** A setup nag in the hero position is clutter; Stripe puts setup prompts in a dismissable banner or inside the relevant tab. It also pushes CapEx and everything else down.
- **Change:** Inside the Financials tab, the empty state is one line: 'Not linked to QuickBooks yet' with a 'Link class' button that opens the mapping inline. On Overview, the NOI tile shows 'Link QuickBooks' in place of a figure. Nothing else.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** PropertyFinancialsCard (financials.tsx) with the unmapped branch moved into the Financials tab; the class mapping control from financials/settings.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d3fb097f-a4e7-43be-a24a-a3e26c185ba7): The 'Complete required steps' card has one line, a small red dot and a chevron, and it sits above the editor's sections instead of in a banner.
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The Next steps rail lists one tappable row per pending setup item.
  - [HoneyBook](https://mobbin.com/screens/f32e5716-bf30-4944-8210-5b01ad695bc1): The unlinked account state sits inside its own 'Financial tracker' panel with a '+ Link account' action, not over the page
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:18-33`, `src/app/(app)/properties/[id]/page.tsx:96`
- **Verification:** partly. Observed as described on 767, 647 and 58 (only 2 of 11 properties have a QuickBooks class locally). It is a one-line card, though, about 100px tall, and moving it is a placement change rather than a usability blocker, so it is medium. The 'Financials → Settings' arrow copy is also counted in 047 and 052.

### PROPERTY-015

**Swap stacked uppercase label-over-value rows for compact label-left, value-right rows**

Medium · Design change · effort M · `Property page, Details, Loan and Insurance cards` · One record layout for every record

- **Today:** Read views use uppercase, letter-spaced labels stacked over values, while edit forms, Financials and CapEx use sentence case. Stripe itself stacks labels in its narrow details rail and uses label-left only in wide sections.
- **Why:** Stripe, Attio and Linear rails use a 13px sentence-case label on the left and the value on the right, about 32px per row. It's calmer, about half the height, and easy to scan. All-caps labels in a column read as a form printout.
- **Change:** Change Field to a two-column row: muted sentence-case label (Geist 13px) on the left, value on the right, a hairline between groups rather than between rows. Group the rail as Ownership (Status, Strategy, Entity, Purchased, Basis), Loan (Lender, Balance, Rate, Payment, Maturity) and Insurance (Carrier, Premium, Renewal, Deductible). Use the same style for every card.
- **Desktop, tablet, phone:** Desktop rail 320px: label 40%, value 60%. Tablet: two groups side by side. Phone: the same rows at full width; the label never wraps, so use short labels ('Reg. expires').
- **Reuse:** Field in components/ui.tsx: change its markup once and every use follows. Delete the local L and R helpers in edit-details.tsx, edit-loan.tsx and edit-insurance.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/be433724-f6fd-47e9-865d-004bc3e7734f): Subscription details as a two-column label-left, value-right grid
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): Record Details rail with small icon, label and value on one line
  - [Stripe Dashboard](https://mobbin.com/screens/8113ccdd-0eac-4bb5-9731-55cf00a433a1): iOS: label left, value right in one row per field
  - [Linear](https://mobbin.com/screens/fb59ac32-54a6-4539-8a03-450addb61b6d): Properties rail: sentence-case labels, empty fields read as verbs with an icon ('Add lead', 'Add members', 'Add label'), no dashes.
  - [Attio](https://mobbin.com/screens/fdc76916-ff87-4e2a-8256-80939ffa935c): Deal card values prefixed by small line icons (amount, date, owner, last activity) instead of uppercase labels.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Details shows filled fields with 'Show more'.
  - [Attio](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf): Empty attributes as muted prompts instead of dashes.
  - [Mercury](https://mobbin.com/screens/c198da44-d431-45bd-8154-6253fdb53836): Label left, value right rows on phone
  - [Stripe Dashboard](https://mobbin.com/screens/187975d8-3298-45c2-bb31-933aa892f69a): Label left, value right, about 36 to 44pt per row, grouped sections
  - [Realtor.com](https://mobbin.com/screens/84be59cc-49db-45f8-88ba-99661e45003b): Home details as two-column label/value rows; blanks left out
- **Code:** `src/components/ui.tsx:217-224`, `src/app/(app)/properties/[id]/edit-insurance.tsx:19-24`, `src/app/(app)/properties/[id]/edit-details.tsx:54-66`, `src/app/(app)/properties/[id]/edit-loan.tsx:60-68`
- **Also found as:** VISUAL-028 (Lens: visual design system across every screen), DATA-038 (Lens: tables, numbers, money, charts and status), MOBILE-031 (Lens: phone and tablet experience on every route)
- **Verification:** partly. The uppercase letter-spaced label over value (ui.tsx:217-224) and the three label styles on one page are real. On tablet, Details stretches one label per line across 720px (tab767--details shot). But the claim that Stripe rails put the label on the left is wrong. Stripe's payment Details rail (Mobbin f8db8469, returned to me) stacks sentence-case labels over values. Label-left rows appear in Stripe's wide sections, in Attio's rail, and in Mercury's Books Details (cc047c78). The real fix is sentence-case labels with label-left rows in wide containers; stacked is fine in a narrow rail. Also, L in edit-details is the edit-form label helper, not a read helper, so it isn't deleted by changing Field. Medium, since this is visual polish.

### PROPERTY-020

**Empty fields print as a column of dashes; show 'Add …' targets and fold empty optional rows**

Medium · Design change · effort S · `Property page, Loan, Insurance and Details read views` · One record layout for every record

- **Today:** At 767 Prospect the Loan card is Lender 'Vontive' followed by six dashes, Insurance is three dashes and one value, and Details has two dashes. At 118 Congress the Loan card is six dashes and 'Fay Servicing'. Across the four sample properties roughly half the rail is dashes.
- **Why:** A wall of dashes reads like an unfinished app. Attio turns each gap into an action ('Set Description…'), which both explains the gap and fixes it.
- **Change:** Empty required fields (Balance, Rate, Maturity, Carrier, Renewal) show a muted 'Add rate' that edits in place. Empty optional fields hide behind one 'Show 4 empty fields' row per group. A lone dash stays only in tables.
- **Desktop, tablet, phone:** Same at all sizes; on phone the 'Show empty' row is a full-width 44px tap target.
- **Reuse:** Field in components/ui.tsx with an `onAdd` affordance, plus the InlineField from PROPERTY-016.
- **References:** 
  - [Attio](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf): Empty attributes show muted 'Set Twitter…' prompts instead of dashes
  - [Linear](https://mobbin.com/screens/f63720fa-32c2-42da-aa5a-9c8d2083053d): Empty properties read 'Add lead' and 'Add label' in the rail
  - [Linear](https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33): Empty properties read as verbs (Set priority, Assign, Add to project) instead of dashes.
  - [Airbnb](https://mobbin.com/screens/d95c445f-74d4-435f-9a51-e983738e8d4b): Listing editor section cards show a summary when filled and 'Add details' when empty, which suits the Loan and Insurance cards.
  - [Stripe](https://mobbin.com/screens/f8db8469-2830-4c6b-98ca-53bf4c1e3caf): Empty sub-sections say 'No metadata' once instead of listing blank fields
- **Code:** `src/app/(app)/properties/[id]/edit-loan.tsx:60-68`
- **Also found as:** COPY-048 (Lens: words on every screen)
- **Verification:** confirmed. Seen: Loan at 767 is Vontive plus six dashes, and Insurance is three dashes plus $800,000. Pairs with 007 and 015.

### PROPERTY-025

**Save and Cancel sit at the top of long forms and in a different order per card**

Medium · Design change · effort S · `Property page, edit modes` · One design system, fixed in the primitives

- **Today:** SectionCard cards put 'Cancel, Save' top-right. Units and Rentals put '+ Add unit, Save, Cancel', with Save in the middle and Cancel last. On phone, the Details, Units and Rentals forms run 600 to 2,000px below their buttons, so after editing the last field you scroll back up to save; there is no Save at the bottom.
- **Why:** A primary button that moves position between cards, and scrolls out of reach on phone, is the kind of rough edge Stripe and Airbnb avoid. Airbnb's editor keeps one sticky Save bar.
- **Change:** One order everywhere: secondary actions left ('Add unit'), then Cancel, then Save on the far right. On phone and tablet, while a form is dirty, show a sticky bottom bar with Cancel and Save above the bottom nav. Disable Save until something changes.
- **Desktop, tablet, phone:** Desktop: buttons in the section header. Tablet and phone: sticky bottom bar, 56px, full-width buttons.
- **Reuse:** Button in components/ui.tsx; the sheet header pattern from PROPERTY-016 once inline edit lands.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/4b427413-1a53-4df8-84bd-a7f4e13f1103): Listing editor with a persistent bottom Save that stays disabled until a change
  - [Shopify](https://mobbin.com/screens/762e9378-9959-4f4b-828f-1786036face1): Phone editor with Cancel left and Save right in a fixed header
  - [Stripe](https://mobbin.com/screens/ed53af21-56c6-479b-b49f-3c5ab4c875f3): The Credit balance adjustment dialog ends with Cancel, then the primary 'Apply to credit balance' at the right edge.
  - [Stripe](https://mobbin.com/screens/3401eb4e-f2b1-470a-8d27-b1733af6b237): An inline Customer form in Create invoice uses the same Cancel then Save order.
  - [Mercury](https://mobbin.com/screens/d1bacbce-957f-4250-81c4-ec1dd865bce8): Side panel: Cancel then Save at the top right, the same order on every panel.
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Note composer: Cancel then the primary 'Add note', primary always last.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:97-108`, `src/app/(app)/properties/[id]/edit-listings.tsx:122-145`, `src/app/(app)/properties/[id]/edit-details.tsx:74-89`, `src/app/(app)/properties/[id]/edit-units.tsx:100-106,147`, `src/app/(app)/properties/[id]/edit-listings.tsx:139-142,202`, `src/app/(app)/properties/[id]/edit-units.tsx:100-106`
- **Also found as:** PROPERTY-V08 (Property detail page (future property hub)), VISUAL-037 (Lens: visual design system across every screen)
- **Verification:** confirmed. Units and Rentals read '+ Add unit / Save / Cancel', while SectionCard reads 'Cancel / Save'. On phone, Units' Save sits at 1,222px and the card ends at 3,438px, measured.

### PROPERTY-028

**Group documents by category and drop the 160px dropzone from every page**

Medium · Design change · effort M · `Property hub, Documents tab` · One record layout for every record

- **Today:** An empty Documents card about 185px tall holds a dashed dropzone about 96px tall.
- **Why:** An empty dropzone is the biggest object in the right column, decoration with no job. Origin and Aboard organize record documents into named groups so a closing statement is findable in a second.
- **Change:** Documents tab: fixed categories (Closing, Loan, Insurance, Leases, Permits and inspections, Other), each with a count and a '+'. Each row shows the file name, date added and an overflow menu (Download, Rename, Move, Remove). Dropping a file onto the tab uploads it, and a small 'Upload' button sits in the tab header. Overview shows nothing for documents except the count on the tab.
- **Desktop, tablet, phone:** Desktop and tablet: category sections stacked, rows full width. Phone: same, with Upload opening the native picker and the camera.
- **Reuse:** Attachments (components/attachments.tsx) per category; PropertyAttachment needs a category column.
- **References:** 
  - [Attio](https://mobbin.com/screens/7a561314-128a-4336-aafc-d1f570283204): The record's Files tab has Upload file and Create folder buttons in the header and folders named inline, with no dropzone taking up the page.
  - [Attio](https://mobbin.com/screens/8f45efe4-1011-4a3b-bed0-ea66509ed4fb): Files is one tab in the record tab row beside a details rail, which is how Documents fits the D10 hub.
  - [Aboard](https://mobbin.com/screens/10a8be03-81e7-41bc-a8dd-636c98394bea): Document categories with counts, a '+' each, and a slim 'No documents' row
  - [Origin](https://mobbin.com/screens/d52a81bd-1009-4ca3-852b-175a33d8c772): Documents tab with labeled groups and a per-row status chip and overflow menu
- **Code:** `src/app/(app)/properties/[id]/edit-documents.tsx:14-33`
- **Verification:** partly. The dropzone is the largest object in an empty Documents card, and the card has no categories. But I measured the dashed box at about 96px tall (the whole card about 185px), not 160px. The category list adds structure (and a schema column), which suits a Documents tab but is heavier than needed while there are 0 files.

### PROPERTY-029

**The Tasks card scrolls inside the page; show the top five, grouped, with 'View all 29'**

Medium · Design change · effort S · `Property page, Tasks card` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. /properties/cmtg25y4p0006jphsv3frndk6: the Tasks list is still capped at max-h-[420px] with its own scroll (scrollHeight 1183 against 420), cut mid-list on desktop. All 32 open tasks load with no grouping and no count. '+ Task' still leaves for /tasks/new?propertyId=...
- **Today:** The Tasks list is capped at 420px with its own overflow scroll, so at desktop it cuts off mid-row (a half-visible row at the bottom) and needs a second scroll wheel. All 29 tasks at 767 Prospect load, in due-date order with undated tasks last, with no grouping and no count. '+ Task' leaves the page for /tasks/new.
- **Why:** Scroll inside scroll is fiddly, especially on touch. Stripe shows a few rows and a 'View all' link. The Overview should show the urgent handful and leave the full list to the Tasks tab.
- **Change:** Overview: the five most urgent tasks, overdue first, then a 'View all 29 tasks' row linking to the Tasks tab. Tasks tab: the full list grouped Overdue, This week, Later and No date, with quick add at the top ('Add a task for 767 Prospect') instead of leaving the page.
- **Desktop, tablet, phone:** Desktop: five rows. Tablet: five rows. Phone: three rows plus 'View all'.
- **Reuse:** The Today task row and quick-add from the Asana migration build; the Tasks tab reuses its grouping.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/51b576a6-2ec6-4a8d-ae2f-0695dc005336): Two payment rows, then a 'View all · 19 total' row
  - [Attio](https://mobbin.com/screens/16b2e7b2-da40-4dc2-a63b-139c3078c1d9): Tasks grouped Today, This week, Upcoming and Completed with counts
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): The customer page's Payments list shows six rows and then a '6 results' link instead of an inner scroll.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:167-206`, `branch src/app/(app)/properties/[id]/page.tsx:186,195`, `src/app/(app)/properties/[id]/page.tsx:178 (max-h-[420px] overflow-y-auto)`, `eval at 375: task list scrollHeight 1072 vs clientHeight 420`, `branch-src/src/app/(app)/properties/[id]/page.tsx:195`, `eval at 375 on :3300: [scrollHeight 1183, clientHeight 420, 32 rows]`
- **Also found as:** PROPERTY-V09 (Property detail page (future property hub))
- **Verification:** confirmed. The list is 420px tall with a 1,072px scrollHeight. At 1280 a half row is cut at the bottom (seen). '+ Task' leaves the page for /tasks/new.

### PROPERTY-030

**Status shows twice, and 'Refinanced' is gray text while other statuses are badges**

Medium · Fix · effort S · `Property page header and Details` · One design system, fixed in the primitives

- **Today:** The header shows status, and Details repeats it as a 'Status' row. page.tsx special-cases 'Refinanced' as muted text (118 Congress, 647 Prospect) while 'Rehabbing' gets an amber Badge (767 Prospect, 58 Mariner). A status chip that is sometimes a chip and sometimes plain text breaks the fixed-position status rule.
- **Why:** CLAUDE.md: 'Per-item status sits in one fixed, skimmable spot'. Statuses keep fixed Badge colors.
- **Change:** Always render status as a Badge in the header, with Refinanced in its own fixed tone. Remove the Status row from Details. Clicking the badge opens a status menu to change it.
- **Desktop, tablet, phone:** Same at all sizes; on phone the badge sits on the subtitle line.
- **Reuse:** Badge and propertyStatusTone in lib/config.ts; React Aria Menu for the change.
- **References:** 
  - [Stripe](https://mobbin.com/screens/be433724-f6fd-47e9-865d-004bc3e7734f): One status chip beside the record title ('Trial ends 19 Dec'), not repeated in the details grid
- **Code:** `src/app/(app)/properties/[id]/page.tsx:84-89`, `src/app/(app)/properties/[id]/edit-details.tsx:63`
- **Verification:** confirmed. Seen: 'Refinanced' renders as gray text at 118 (page.tsx:84-89) and Details repeats a Status row. Note that propertyStatusTone maps Refinanced to green, the same green as the 'Available' listing badge, 'Good' and 'Done' on this page. A badge needs a tone no other mark in the view uses, so pick it with 031.

### PROPERTY-032

**Eight of eleven Building CapEx rows say 'Unknown'; fold them into one 'needs a year' row**

Medium · Design change · effort S · `Property page, Building CapEx` · One record layout for every record

- **Today:** On every sample property, 3 of 11 systems are dated. The other eight rows (Windows, Main Sewer Line, Porches, Driveway, Siding, Garage, Masonry, New system) are '— — — Unknown' with an empty Cost column, about 200px of dashes.
- **Why:** Rows that say nothing dilute the three that do. The plan doc already suggested collapsing undated rows, and Airbnb lists unreported items compactly with a clear prompt.
- **Change:** List dated systems only. End with one row: '8 systems need an install year', with an 'Add years' button that opens the year-entry sheet, listing just those eight with a year field each.
- **Desktop, tablet, phone:** Same at all sizes; on phone the prompt row is a 44px tap target.
- **Reuse:** BuildingCapexSection's datedCount; the year sheet uses Input type number.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/5c62c16b-2297-45d7-b8ee-288cd20794a2): Guest safety lists 'not reported' items compactly as prompts to complete
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Empty properties read as verbs ('Set estimate') instead of dashes.
  - [Copilot](https://mobbin.com/screens/d9ca88ae-5d46-4213-a5aa-5afeb48d4d06): Excluded items sit together in one group at the bottom so the main list stays meaningful.
- **Code:** `src/app/(app)/properties/[id]/building-capex.tsx:72-74`, `src/app/(app)/properties/[id]/building-capex.tsx:164-239`, `docs/property-page-plan.md:38-39`, `src/app/(app)/properties/[id]/building-capex.tsx:72`, `src/app/(app)/properties/[id]/building-capex.tsx:128`, `src/app/(app)/properties/[id]/building-capex.tsx:164`
- **Also found as:** DATA-I17 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. 8 of 11 rows are Unknown on every sample property (one is the 023 placeholder). The plan doc already suggested collapsing them. Overlaps 019's 'Needs a year' filter; ship one of the two. The Airbnb 5c62c16b reference is cited here, in 005 and in 040 for three different patterns, so treat it as weak.

### PROPERTY-034

**The equipment edit grid is clipped inside the card at 1280; the Cost column is cut off**

Medium · Fix · effort S · `Property page, Units edit (equipment grid)` · One record layout for every record

- **Today:** In Units edit mode, the equipment grid uses a fixed min-w-[760px] inside a card about 730px wide at 1280. The Model # inputs truncate ('ET4WSKXSQ0(') and the cost column is cut to a stray red '$' at the right edge, so you have to scroll sideways inside the card.
- **Why:** A desktop form that doesn't fit at the target laptop width breaks the 'things line up' rule and hides the cost being calculated.
- **Change:** Short term, drop the Age and Cost columns in edit mode, since they're derived and shown in read mode, and let Comments flex. That fits in about 620px. Long term, edit equipment per unit in the unit sheet (PROPERTY-018).
- **Desktop, tablet, phone:** Desktop: no inner scroll. Tablet: Comments moves under the row. Phone: one stacked card per equipment item.
- **Reuse:** EditUnitCard in edit-units.tsx.
- **References:** 
  - [Clerk](https://mobbin.com/screens/bceecfc6-3efc-4ef5-a682-54f7ede1dae5): Edit form fields stay inside their card with label-over-field rows; nothing clips at the card edge.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:364-384`, `units-edit eval: overflow past the card edge = 27 px desktop, 70 px tablet`, `src/app/(app)/properties/[id]/edit-units.tsx`
- **Also found as:** FEEL-013 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Measured: the equipment grid is 760px inside a 703px container at 1280. Model # shows 'ET4WSKXSQ0(' and the cost column shows a lone red '$' (i767--units-edit shot).

### PROPERTY-035

**On phone, Building CapEx edit truncates years to '202' and pushes Status and Cost off-screen**

Medium · Fix · effort S · `Property page, Building CapEx edit on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375, Building CapEx edit keeps the six-column grid. With 16px touch text, the 52px Year input shows '202' for 2025, the Type input shows 'Copper/', and the Status and Cost inputs sit off-screen to the right.
- **Why:** You can't verify what you typed, and you can't reach the cost override on the phone you'd use while standing in the basement.
- **Change:** Below 640px, render each system as a block: the system name on one line, then Type, Year (numeric) and Cost override side by side at equal widths, with derived age and status as a muted line under them.
- **Desktop, tablet, phone:** Desktop and tablet: the current grid. Phone: one stacked block per system with no sideways scroll.
- **Reuse:** BuildingCapexSection; Input primitive.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/c53803b3-5cd4-420f-8135-4a2d26bb8ec5): Phone form with one full-width field per row and labels above
- **Code:** `src/app/(app)/properties/[id]/building-capex.tsx:18-19`, `src/app/(app)/properties/[id]/building-capex.tsx:195-228`
- **Verification:** confirmed. At 375 the Year input is 50px wide against a 56px scrollWidth at 16px, showing '202'. Type shows 'Copper/', and Status and Cost are off-screen (mob767b--bcapex-edit shot).

### PROPERTY-038

**The header has no actions; add 'New task' and a '…' menu**

Medium · Design change · effort S · `Property page header` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. The property header still holds only the back link, address, status badge and unit count. The Tasks card now has two buttons, 'Apply playbook' and '+ Task', far down the right column (y=3029 at 375). The source deal link is still 12px muted text at the very bottom.
- **Today:** The header holds only the back link, address, badge and unit count. '+ Task' is buried in the Tasks card far down the right column (about 1,900px down on phone). Uploading a document, adding a note or jumping to the source deal each live in their own distant card. The source deal link is 12px muted text at the very bottom.
- **Why:** Stripe's record header carries the two or three things you do most ('Create payment', 'Create invoice', '…'). Actions should not depend on scrolling to the right card.
- **Change:** Header right: a primary 'New task', then a '…' menu with Upload document, Add note, Open in Google Maps, View source deal and Copy address. Remove '+ Task' from the Tasks card on Overview.
- **Desktop, tablet, phone:** Desktop and tablet: button plus menu at the right of the title row. Phone: just the '…' icon button in the title row; 'New task' moves into the menu and the D10 bottom bar.
- **Reuse:** LinkButton and Button in components/ui.tsx; React Aria Menu (approved).
- **References:** 
  - [Zillow](https://mobbin.com/screens/e668a0c3-6dbe-44aa-9a9f-d5bacb907ac4): The overflow menu lists concrete verbs (Download signed PDF, Set up rent payment, Create a property condition report, Duplicate) and puts the destructive Deactivate last.
  - [Jobber](https://mobbin.com/screens/536351e7-656d-444e-867d-38eb7f48e146): On phone, one full-width primary button sits beside a square '…' under the title and address.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): 'Create payment', 'Create invoice' and a '…' overflow in the customer header
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): Header actions 'Add to List', 'Run workflow', 'Compose Email' on the record
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The property header has a photo, address, status pill (Listed for rent) and overflow, then tabs. View your listing and Edit your listing sit right under it, with a Next steps rail.
  - [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb): Add tenant sits on the Tenants card, and a toast confirms "Tenants added successfully".
  - [Attio](https://mobbin.com/flows/ed18fe27-a14a-4331-9d02-c5dceb2c60b9): Record header with Add to List / Run workflow / Compose Email above Activity, Emails, Notes, Tasks, Files tabs
  - [Mercury](https://mobbin.com/flows/1d51be38-aff7-4a34-835d-8c50f89f4fd5): Compact row of the few most common actions (Send, Transfer, Upload bill) at the top of the page
- **Code:** `src/app/(app)/properties/[id]/page.tsx:80-92`, `src/app/(app)/properties/[id]/page.tsx:168-173`, `src/app/(app)/properties/[id]/page.tsx:218-225`, `branch src/app/(app)/properties/[id]/page.tsx:92-104,182-189,236-243`
- **Also found as:** JOURNEYS-023 (Lens: the core jobs, end to end)
- **Verification:** confirmed. The header holds only BackLink, the title, the badge and the count. '+ Task' lives in the Tasks card, which starts at 3,035px on phone. One primary button plus a menu consolidates scattered actions rather than adding chrome.

### PROPERTY-039

**Utilities read as a raw spreadsheet grid ('Acct # TENANT', 'Autopay NA')**

Medium · Design change · effort M · `Property page, unit Utilities` · One record layout for every record

- **Today:** Each unit's Utilities accordion is a three-column grid (National Grid, National Fuel, Buffalo Water) with label and value pairs. The account-number slot often holds 'TENANT', and Autopay holds 'NA' or 'Done'. The LOFL value '81531-59050' and 'Call to confirm' sit alongside them. All values are uppercase spreadsheet strings.
- **Why:** The real question is 'who pays, and is it set up?', and it is buried in raw cells. 'Acct #: TENANT' conflates the payer with an account number.
- **Change:** One row per utility: provider, then 'Tenant pays' or 'Owner pays', then autopay state ('Autopay on' or 'Off'), then the account number with a copy button. Show 'Needs a call' (amber) only when confirmation is pending. In the Units table (PROPERTY-018) this becomes one 'Utilities' cell: 'Tenant pays all' or '1 owner-paid'.
- **Desktop, tablet, phone:** Desktop and tablet: rows of four short columns. Phone: two-line rows, with provider and payer on line 1, and account number plus copy on line 2.
- **Reuse:** UTILITY_GROUPS and utilityStatusTone in lib/property-types.ts; reshape the read view only, with the stored keys unchanged.
- **References:** 
  - [Mercury](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930): Routing number, account number and bank are label-left rows with copy icons, and the account number is masked with a reveal toggle. Utilities can become one row per provider with the account number and a copy action instead of a grid.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:205-236`
- **Verification:** confirmed. Seen at 767: 'Acct # TENANT', 'Autopay NA', 'LOFL 81531-59050', 'Call to confirm'. A related data bug sits under this grid and is filed separately as PROPERTY-V01: the National Grid LOFL value is an account-style number on all 27 units, but edit mode renders it as a status select.

### PROPERTY-040

**Edit each listing in its own editor with a public preview, not inline across the whole Rentals card**

Medium · Design change · effort M · `Property hub, unit sheet, listing editor` · Rentals, residents and the public site run one lifecycle

- **Today:** Edit turns every listing into a form at once: unit select, status select, photo strip and six raw inputs. '+ Add listing' appends another blank card that defaults to Hidden with an empty unit select. Nothing shows how the listing will look on /rentals.
- **Why:** Airbnb's listing editor shows summary tiles, edits one aspect at a time and puts a 'View' button for the guest view beside it. For the public face of the company, previewing before publishing is the expected flow.
- **Change:** Each listing row in the Units tab opens a listing editor with Photos, Rent and availability, and Details sections. A 'Preview' button opens /rentals in a new tab, scrolled to that listing. Publishing is the last step ('Publish to rentals page') once rent and a photo exist (ties to PROPERTY-009).
- **Desktop, tablet, phone:** Desktop: two-pane (sections left, editor right), as in Airbnb. Tablet: the same at 768. Phone: a section list that pushes to each editor, with a sticky 'Publish' bar.
- **Reuse:** EditListingCard and PhotoGallery from edit-listings.tsx; PhotoCarousel from (marketing)/rentals for the preview.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/5c62c16b-2297-45d7-b8ee-288cd20794a2): Listing editor with section tiles on the left, editing on the right and a 'View' preview button
  - [Airbnb](https://mobbin.com/screens/8d239705-3784-4839-b6f3-6d39161ce479): Per-room photos with 'Manage photos' and plain rows for the remaining details
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:148-170`, `src/app/(app)/properties/[id]/edit-listings.tsx:259-390`
- **Verification:** confirmed. blankListing() defaults to HIDDEN with an empty unit (edit-listings.tsx:36-49). Edit mode turns every listing into a form at once, and nothing links to /rentals. Pairs with 009.

### PROPERTY-041

**Listing fields are raw 12px inputs, and the Beds and Baths placeholders look like real values**

Medium · Fix · effort S · `Property page, Rentals edit fields` · Rentals, residents and the public site run one lifecycle

- **Today:** The listing form hand-rolls `inp` inputs at text-xs (12px on desktop) instead of the Input primitive. The Beds and Baths placeholders are '2' and '1' in gray, so an empty listing appears to already say 2 bed / 1 bath. Rent has no $ prefix, and Sqft and Rent are type=number with spinners.
- **Why:** Fake-value placeholders are a known cause of wrong data, and here the data publishes to the public site. The mismatch with the app's Input primitive is visible next to the Details form.
- **Change:** Use Input and Select. Make Beds and Baths small selects (Studio, 1, 2, 3, 4+ and 1, 1.5, 2, 2.5, 3+) with no placeholder value. Rent uses the MoneyInput with '/ mo' suffix (PROPERTY-033).
- **Desktop, tablet, phone:** Desktop: three columns. Tablet: three columns. Phone: two columns (Beds and Baths side by side, then Rent and Sqft).
- **Reuse:** Input and Select in components/ui.tsx; the duplicate raw-field row in docs/components.md says to use them.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/21241a49-b842-4748-9c54-a3eb336600c8): The side-panel editor has a small floating label above each value ('Start time 3:00 PM') and the Save button pinned at the bottom right. No placeholder can be mistaken for real data.
  - [Square](https://mobbin.com/screens/6e0e0c74-3098-4308-b446-a488169e61f2): Labeled fields with real labels inside the box and empty optional fields left blank
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:22-23`, `src/app/(app)/properties/[id]/edit-listings.tsx:368-385`
- **Verification:** confirmed. Eval: listing fields are 12px, and the Beds and Baths placeholders are '2' and '1'. Also, the read view prints rent raw as `$${l.rent}/mo` (edit-listings.tsx ReadListings), so a $1,450 rent would show '$1450/mo'. The MoneyInput from 033 plus fmtMoney fixes both.

### PROPERTY-I01

**Gather open gaps into one Next steps list, starting with the 3 hidden 'Call to confirm' utilities**

Medium · Design change · effort M · `/properties/[id] (Overview)` · One record layout for every record

- **Today:** Accurate except the Building CapEx count. '3 / 11 systems dated' counts a stray 'New system' placeholder rule from Settings, so 7 of the 10 real systems are undated, not 8 of 11.
- **Why:** Zillow's property overview ends in a Next steps rail with the two or three things that move the property forward, and Airbnb pins one 'Complete required steps' card in the listing editor. HG makes people find gaps by expanding boxes and scanning for dashes, and the amber utility status, the one color on the page with a job, is hidden by default.
- **Change:** Add a 'Next steps' list to Overview under the stat row. Each open gap gets one row that ends in its verb: 'National Fuel LOFL · 3 units to confirm · Call', 'No QuickBooks class · Map', 'Loan terms missing · Add', '8 systems undated · Add years'. A row disappears when its gap is resolved, and the whole block is gone when nothing is open. Utility rows open the Units tab with the amber statuses expanded. This becomes the home for PROPERTY-014's notice and the single entry point to PROPERTY-020 and PROPERTY-032.
- **Desktop, tablet, phone:** Desktop 1280: full-width list in the Overview main column, four rows, then 'Show all'. Tablet 768: the same list in one column. Phone 375: each row becomes two lines (the gap, then a 44px verb button on the right), only the top three show, and desk-only verbs such as Map class become plain links.
- **Reuse:** Extend the row pattern of the property Tasks card (page.tsx:178) and use the Badge amber tone through utilityStatusTone (src/lib/property-types.ts:89). New: a small derive-gaps function over the property record, based on Zillow's Next steps rail.
- **References:** 
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The Next steps rail has one tappable row per pending item, beside the overview cards.
  - [Airbnb](https://mobbin.com/screens/d3fb097f-a4e7-43be-a24a-a3e26c185ba7): The 'Complete required steps' card has one line, a red dot and a chevron, and it disappears when the steps are done.
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): The 'Missing' chip and its inline reason are named after the problem.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:167-186 (Accordion <details> collapsed unless defaultOpen)`, `src/lib/property-types.ts:87 (UTILITY_STATUS_OPTIONS)`, `Local DB: 15 'Need to set up' + 27 'Call to confirm' utility statuses across 11 properties`
- **Verification:** partly. Reproduced: on 767 all three National Fuel LOFL values read 'Call to confirm', and the amber shows only after you expand a collapsed Utilities accordion (p767m--util--mobile-light.png). The DB counts (15 'Need to set up', 27 'Call to confirm') match, and so do the Loan (6 of 7 dashes) and Insurance (3 of 4) gaps. One count is inflated: 'Building CapEx 3 / 11 systems dated' includes a stray placeholder rule named 'New system' (see PROPERTY-V06), so the real figure is 7 of 10 undated. Main risk: if every empty field gets a row ('Loan terms missing', '8 systems undated'), the block becomes a permanent nag list on nearly every property. Limit it to operational gaps someone can close this week (utility statuses, the QuickBooks mapping) and leave blank reference fields to their cards. References checked: Zillow cc09445f does show a Next steps rail beside Tenants, and Airbnb d3fb097f shows the 'Complete required steps' card.

### PROPERTY-I02

**Add an Access block like Airbnb's arrival guide and put it first on phone**

Medium · Design change · effort M · `/properties/[id] (header and Overview rail; phone first block)` · One record layout for every record

- **Today:** Codes sit about two screen-heights down on phone and tablet, and no Directions link or entry-notes field exists. This is friction for staff, not a blocked job: under D21, contractors get their unit's code on the portal job page.
- **Why:** Looking up a property on site is one of the five phone jobs in the library. Airbnb splits the listing into 'Your space' and an 'Arrival guide' (Directions, Check-in method, Wifi, House manual), and the guest view opens on Getting there with Copy address and Get directions. Jobber's job page puts a full-width Directions button right under the address.
- **Change:** Add an 'Access' section with the address plus Directions (opens Apple or Google Maps) and Copy, one row per unit with its lockbox code, and one 'Entry notes' line. On desktop it sits at the top of the Overview rail. On phone it is the first block under the header, ahead of the stat row. Lockbox codes move here from the unit headers.
- **Desktop, tablet, phone:** Desktop 1280: a rail block of about four rows. Tablet 768: a two-column strip under the header, with the address and Directions on the left and unit codes on the right. Phone 375: the first block, with 44px rows, Directions as a full-width secondary button and entry notes clamped to two lines with More.
- **Reuse:** Field rows from PropertyDetailsSection (edit-details.tsx:55-63), lockboxCode from PropertyUnit (src/lib/property-types.ts:21) and Button secondary. New: an entryNotes text column and a Directions link built from the address, following Airbnb's Getting there.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d3fb097f-a4e7-43be-a24a-a3e26c185ba7): The Arrival guide tab is separate from the space description: Directions, Check-in method (Lockbox is an option) and Wifi details.
  - [Airbnb](https://mobbin.com/screens/eb1998c1-b613-4512-9fe1-90ef4595ae67): Getting there shows the address, the host's directions, then Copy address and Get directions rows.
  - [Jobber](https://mobbin.com/screens/5b5a58a1-4e0f-4f7d-8940-b587af7bfea5): On phone, the address sits under the title with a full-width Directions button.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:94-120 (main column order puts UnitsSection after both CapEx cards; lg:grid-cols-3 means one column below 1024)`, `src/app/(app)/properties/[id]/edit-units.tsx:201-202 (lockbox as text-xs muted)`
- **Verification:** partly. The offsets reproduce exactly. At 375, Units & access is at 1222 and Tasks at 3035; at 768, they are at 1124 and 2919. There is no Directions link and no field for entry notes. The pattern fits D10's Overview tab and is backed by references: Airbnb d3fb097f shows the Arrival guide with Directions and Check-in method, with Lockbox as an option. High overstates it, though. The codes are two scrolls away, not blocked. Under D21, contractors will get their unit's code on the portal job page, so this lookup is staff-only. The worse phone problem on this page is that the CapEx table hides its money columns (PROPERTY-V05). Also note that the lock glyph in the unit headers is an emoji (PROPERTY-V07).

### PROPERTY-I08

**Add a Cost basis breakdown that ends on Cash left in deal**

Medium · New capability · effort M · `/properties/[id] (Financials tab)` · The QuickBooks mirror is honest about what it covers

- **Today:** The only cost figure on the page is Purchase price ($240,000 on 767). closingCosts and rehabAmount are stored but blank on all 11 properties and have no UI, and currentLoan ($292,890 on 767) is stored but hidden. On 118 Congress the loan ($321,603) is larger than the purchase price ($295,000), and nothing on the page says whether that means HG's cash came back out.
- **Why:** Stripe's payment page has a breakdown block (amount, fees, refunded) that ends on a bold Net amount row. The BRRRR question 'how much of our cash is still in this house' is the same kind of subtraction and should read the same way.
- **Change:** In the Financials tab, add a block with these rows: Purchase price, Closing costs ('Add' when empty), Rehab (from the QuickBooks class when it's mapped, otherwise 'Add'), All-in cost, Current loan as a negative, and a bold 'Cash left in deal'. A negative result reads 'Cash out $X'. Money is right-aligned in Geist Mono. The bold figure can also be one tile in PROPERTY-012's stat row.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a six-row block in the Financials main column. Phone 375: the same rows in two columns (label, value). This is money, so it stays on phone.
- **Reuse:** fmtCents and MoneyBars from financials/_components/ui, and getPropertyFinancials for rehab spend. The field edits ride on PROPERTY-007's exposure of the stored fields.
- **References:** 
  - [Stripe](https://mobbin.com/screens/7af4eefa-754f-4c2f-a689-c790b1eb4cad): The Payment breakdown runs Payment amount, then minus processing fees, then a bold Net amount row with right-aligned figures.
- **Code:** `prisma/schema.prisma:111-117 (purchasePrice, closingCosts, currentLoan, rehabAmount)`, `Local DB: closingCosts and rehabAmount null for all 11 properties`
- **Verification:** confirmed. Verified: closingCosts and rehabAmount are null on all 11 properties, and currentLoan is stored (767 $292,890; 118 Congress $321,603.45 against a $295,000 purchase) but shown nowhere. The Stripe Payment breakdown pattern, which ends on a bold Net amount row, is real (seen on Stripe payment pages). It's the right shape for 'cash left in deal'. It depends on PROPERTY-007 and PROPERTY-002 exposing the fields.

### PROPERTY-I09

**Show where Value came from and when it was set**

Medium · New capability · effort M · `/properties/[id] (Value and loan balance figures)` · One record layout for every record

- **Today:** 'VALUE $550,000' has no source and no date. The schema comment says 'appraised / estimated', but no field records which one or when. 765 and 767 both show exactly $550,000. Once equity and LTV ship (PROPERTY-002 and PROPERTY-012), they will inherit a figure nobody can date.
- **Why:** Stripe's details rail lists the Source ('Manually entered from Dashboard') and Last updated next to the data. Zillow's owner page shows a value range and its last 30-day change. A value with no date can't support a refinance or sale decision.
- **Change:** Add valueSource (Appraisal, BPO, Our estimate) and valueAsOf to the property. Show them as a muted sublabel under the figure, such as 'Appraisal · Mar 2025' or 'Our estimate · Connor, Oct 2026'. After 12 months the sublabel reads 'Updated 19 months ago' in the same muted tone, without color. Give the loan balance the same treatment, for example 'Servicer statement · Sep 2026'.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a one-line sublabel under the value in the stat row. Phone 375: the tile shows only the month and year ('Mar 2025'), and tapping it shows the source.
- **Reuse:** The stat row from PROPERTY-012, plus two fields added to the Details editor (edit-details.tsx).
- **References:** 
  - [Stripe](https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2): The details rail carries Last updated and Source ('Manually entered from Dashboard') as plain rows.
  - [Zillow](https://mobbin.com/screens/c504ce8b-bcf3-4203-a7b6-be84ea76f96c): 'Your home value' shows an estimate range with its last 30-day change, so the figure carries its uncertainty and recency.
  - [Zillow](https://mobbin.com/screens/7174235e-3a68-4cc5-ba03-7edeb1507de0): Value labeled as an estimate, with a range tile and a dated history chart.
  - [Stripe](https://mobbin.com/screens/a45686d8-0bea-4626-b70b-d432517dce71): Each figure carries 'Updated 10 Dec, 00:00'.
  - [Copilot](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099): Every account carries a muted 'Manual account' sublabel under its name, marking hand-entered balances apart from synced ones. Use 'Estimate, Mar 2026' or 'Appraisal, Jan 2026' under each value.
  - [Mercury](https://mobbin.com/screens/91ad4bbc-ef0f-4edf-a79f-fc6b9cb4ab7c): "Total cash · As of Aug 31, 2026" above the figure.
- **Code:** `prisma/schema.prisma:115 (value // appraised / estimated, no source or date field)`, `prisma/schema.prisma:115`, `src/app/(app)/properties/page.tsx:83`
- **Also found as:** DATA-I16 (Lens: tables, numbers, money, charts and status), PORTFOLIO-038 (Portfolio list and new property)
- **Verification:** confirmed. Verified: the schema has value with only the comment 'appraised / estimated' and no source or date field. 765 and 767 both show $550,000 (likely the duplication in PROPERTY-I14). Portfolio sums value into a total, so an undated figure flows into the headline number. The Stripe Source and Last updated rows are real (seen on Stripe payment pages). Keep the sublabel muted, as proposed.

### PROPERTY-I12

**Create tasks in place on the property, with Unit and Assignee chips**

Medium · Design change · effort M · `/properties/[id] (Tasks tab and Overview task list)` · Create where you are

- **Migration branch:** Still applies on the migration branch. The property Tasks card header now holds 'Apply playbook' and '+ Task'. '+ Task' still leaves the property for /tasks/new?propertyId=…, a separate form with Title, Description, Assignee, a native Due date input, Status, Repeats and a Property select, but no Unit. The Unit picker exists only in the task page rail after creation.
- **Today:** Creating a task leaves the property and lands on the new task page. The missing Unit field is a known gap that the approved migration spec closes on the task page by Oct 28.
- **Why:** Linear's sub-issue composer opens inline under the list, with a title, a description and chips for assignee, priority and estimate, then Create. A toast confirms with 'View issue'. Creating in context keeps your place, which is the Things 3 and Linear norm.
- **Change:** In the Tasks tab and the Overview top-five list, 'New task' expands an inline row: a title field, then chips for Assignee, Due and Unit (the chip lists this property's units), then Create (Enter). The property is implied. A toast reads 'Task created · View' with Undo. The full form stays at /tasks/new for other contexts.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the row expands inside the list. Phone 375: a bottom sheet opens with the chips docked above the keyboard and Create pinned.
- **Reuse:** The task create server action, the Today view's task row, React Aria popovers for the chips (approved) and the new Toast (a gap in docs/components.md:66).
- **References:** 
  - [Linear](https://mobbin.com/screens/1ea32209-1221-46de-b4ad-875a8f1b5777): The inline sub-issue composer has a title, a description, a chip row (assignee, priority, estimate) and Cancel and Create, all inside the record.
  - [Linear](https://mobbin.com/screens/1a4540b2-6c15-49ff-a07f-4fddb7490e38): After creating, an 'Issue created' toast names the issue and offers 'View issue'.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:170 (LinkButton to /tasks/new?propertyId=)`, `asana-migration-plan.md:82 (D21 needs the job's unit for the lockbox)`, `branch-src/src/app/(app)/properties/[id]/page.tsx:180-189`, `branch-src/src/app/(app)/tasks/new/page.tsx:30-59`
- **Verification:** partly. '+ Task' links to /tasks/new (page.tsx:170), and the create action redirects to /tasks/{id} (tasks/actions.ts:37), so you lose your place. That friction is real and the inline composer is a good Linear pattern (Linear's inline sub-issue composer is visible in Mobbin results). The Unit gap is already being closed by the approved migration spec: Task.unitLabel (plan line 227), a unit field (line 130) and a Unit row on the task page rail (line 403), scheduled for Oct 28. The inline chips should reuse that picker, not invent one.

### PROPERTY-V11

**Say what period the property's Income, Opex and NOI cover**

Medium · Fix · effort S · `/properties/[id] (Financials card)` · The QuickBooks mirror is honest about what it covers

- **Today:** The Financials card shows Income, Opex and NOI as bare figures ('$0 / $0 / $0' on 118 Congress locally) with only 'Cash basis · synced 51d ago'. The code totals every synced month from purchase through the last full month (compute.ts:84-93), but nothing on the card says so.
- **Why:** A bare Income figure reads as monthly or annual. Here it's lifetime since purchase, so it would be misread for exactly the decisions it informs (rent, refinance). Stripe labels every figure's time range.
- **Change:** Add the range after the source line, such as 'Nov 2024 to Sep 2026', or 'Since purchase' when it starts at purchaseDate. When fewer than 12 months are present, keep the existing partial label.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one muted line under the QuickBooks badge. Phone 375: the same line, shortened to 'Nov 24 to Sep 26'.
- **Reuse:** SourceBadge and PartialLabel in financials/_components/ui.tsx, plus the first and last months computeNoi already derives.
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:46-63`, `src/lib/quickbooks/compute.ts:84-93 (window runs from ownership start month to the previous month)`
- **Verification:** verifier-found

### PROPERTY-042

**'Monitor' rows show a replacement cost that is not in the 5-year forecast**

Low · Fix · effort S · `Property page, Building CapEx read view` · Plain, consistent words

- **Today:** At 58 Mariner, the Roof (2011, 15 yrs) shows 'Monitor' with '$25,000' in amber in the Cost column. Its replacement year is 2031, outside the 2026 to 2030 forecast, so the forecast card above totals $12,000 with no roof. At a glance the two cards disagree.
- **Why:** A bold amber dollar figure reads as money coming, yet it isn't counted. The display should say when it's due.
- **Change:** For Monitor rows, show the projected year instead of the cost ('Due 2031'). Show cost only for items inside the forecast window, so every dollar figure on the page ties to a total.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** rowFor() in building-capex.tsx plus the replace band from CapexRules.
- **References:** 
  - [Origin](https://mobbin.com/screens/0ab66387-cf7d-4042-9249-519ac8ff5215): Every figure in the table rolls up to the totals shown above it
- **Code:** `src/app/(app)/properties/[id]/building-capex.tsx:182-189`
- **Verification:** confirmed. Seen at 58 Mariner: Roof 2011, 15 yrs, Monitor, $25,000 in amber, while the forecast totals $12,000 because the roof's 20-year life lands in 2031.

### PROPERTY-044

**The address is editable in two places**

Low · Fix · effort S · `Property page, Details edit` · One record layout for every record

- **Today:** The heading is an inline address field, and the Details edit form has an 'Address' input too. Two editors for one value, and the form version is full width at the top of Details.
- **Why:** Duplicate editors invite conflicting edits (both forms post a version), and they clutter the form.
- **Change:** Remove the Address input from the Details form, keeping editing only in the heading.
- **Desktop, tablet, phone:** N/A.
- **Reuse:** PropertyAddressField stays; delete edit-details.tsx line 97.
- **Code:** `src/app/(app)/properties/[id]/edit-details.tsx:97`, `src/app/(app)/properties/[id]/page.tsx:83`
- **Verification:** confirmed. The Details edit form has its own Address input (seen in j767--details-edit) beside the inline heading field.

### PROPERTY-047

**Internal caveats, arrow glyphs, positional copy and a dialog body that repeats its heading**

Low · Fix · effort S · `Property page, copy across cards` · Plain, consistent words

- **Today:** Copy issues across the page:
- The Financials footnote 'Direct-classed lines only. Entity and overhead costs show in the portfolio view.' is an internal caveat.
- 'Map it in Financials → Settings.' and 'Portfolio →' use arrow glyphs, and that 'Portfolio' link goes to /financials while the sidebar's Portfolio is /properties.
- 'Add at least one unit in Units & access above before creating a listing.' depends on position, which breaks once there are tabs.
- The discard dialog says 'Discard unsaved changes?' then 'You have unsaved changes to units & access. Save them, or discard and exit.'
- The notes placeholder is 'Additional notes on this property…'.
- **Why:** CLAUDE.md copy rules: internal caveats stay out of the UI; don't restate the heading; use the lightest form that works.
- **Change:** Make these changes:
- Drop the footnote and put the caveat in a tooltip on the 'NOI' label: 'Excludes entity overhead'.
- Change 'Portfolio →' to 'All properties P&L'.
- Replace positional copy with 'Add a unit first'.
- Make the dialog body 'Your edits to Units will be lost.'
- Change the notes placeholder to 'Add a note'.
- **Desktop, tablet, phone:** Shorter strings fit on one line at 375.
- **Reuse:** Tooltip (components/tooltip.tsx) with a tap path on touch.
- **References:** 
  - [Stripe](https://mobbin.com/screens/fb0b91ce-234b-44d5-9f8b-18864cc63941): One short helper line per section, no caveats
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:25-29`, `src/app/(app)/properties/[id]/financials.tsx:41-43`, `src/app/(app)/properties/[id]/financials.tsx:95-101`, `src/app/(app)/properties/[id]/edit-listings.tsx:153`, `src/app/(app)/properties/[id]/edit-units.tsx:135-138`
- **Verification:** confirmed. All strings were found as quoted (financials.tsx:25-29, 41-43, 95-101; edit-listings.tsx:153; edit-units.tsx:135-138; edit-details.tsx:190). 'Portfolio →' goes to /financials while the sidebar's Portfolio is /properties. Overlaps 052 on the arrow glyphs; fix them once.

### PROPERTY-053

**The selected-year state is a heavy blue ring that fades every other row**

Low · Design change · effort S · `Property page, CapEx year bars` · One design system, fixed in the primitives

- **Today:** Clicking 2026 draws a 2px primary ring around the row, fills its bar solid blue (it was red), turns the year, total and count blue, drops other rows to 40% opacity and dims non-matching table rows to 30%. A 'Highlighting 2026 clear' line appears above the table.
- **Why:** The CLAUDE.md rule for pickers is that the selected fill alone marks the pick. Here the ring, recolor and double fade together are louder than the data, and the bar changes from red to blue on select, which reads as a state change.
- **Change:** Mark the selected year with only a light background and a bold year label, keeping the bar's own color. Filter the table to that year rather than dimming it, with an '×' chip ('2026 ×') to clear.
- **Desktop, tablet, phone:** Same at all sizes; bar rows are 44px tall on touch.
- **Reuse:** CapexForecastCard; the SegmentedControl selection styling.
- **References:** 
  - [Copilot](https://mobbin.com/screens/e4104151-c47b-47fb-9971-327ce2ad89c4): The selected category row gets a light fill and the detail opens beside it, while the other rows stay at full strength with no ring or fade.
  - [Rocket Money](https://mobbin.com/screens/90eca6fd-2b6e-409c-ba78-52b93097ed7e): The selected month is a small dark pill on the axis label; bars keep their color and the table below filters
- **Code:** `src/app/(app)/properties/[id]/capex-outlook.tsx:63-117`, `src/app/(app)/properties/[id]/capex-outlook.tsx:124-141`
- **Verification:** confirmed. Reproduced (j767--capex2026 shot): a 2px ring, the bar turns from red to blue, other rows fade to 40% and table rows to 30%. The code comment says the full table stays to avoid reflow, which was deliberate; filtering is still the calmer pattern.

### PROPERTY-058

**Money figures are bold Geist rather than Geist Mono, and column alignment varies**

Low · Design change · effort S · `Property page, CapEx and Financials figures` · Money, numbers and dates read one way

- **Today:** Money cells mostly use tabular-nums already. The visible problems are the bar list at 320 (bars about 42px wide) and Geist rather than the house Geist Mono for figures.
- **Why:** CLAUDE.md names Geist Mono for figures. Stripe and Mercury right-align figures in a consistent numeric face, so columns scan cleanly.
- **Change:** Add a `.figure` utility (Geist Mono, tabular-nums) and apply it to every money, age and date-count cell. Right-align all money columns. At phone width, drop the 'N items' column from the bar list so the bars get their space back.
- **Desktop, tablet, phone:** Desktop and tablet: figures right-aligned in their columns. Phone: bars plus value only.
- **Reuse:** The Geist Mono variable already loaded in app/layout.tsx; fmtMoney.
- **References:** 
  - [Mercury](https://mobbin.com/screens/269ac107-c09e-4c57-a263-2a82ff06c4cd): Balance sheet with tabular, right-aligned figures in every column
- **Code:** `src/app/(app)/properties/[id]/capex-outlook.tsx:49`, `src/app/(app)/properties/[id]/capex-outlook.tsx:100-115`, `src/app/(app)/properties/[id]/building-capex.tsx:230-235`
- **Verification:** partly. Partly wrong. Building CapEx Age (building-capex.tsx:217) and Cost (costClass at :184) already use tabular-nums. No listing has a rent, so '$1,450/mo' can't be seen; the code would print it ungrouped as '$1450/mo' (see 041). The 320 squeeze is real: bars render about 42px wide. The Geist Mono point follows the house rule; Stripe and Mercury use tabular sans figures, so tabular-nums with right alignment already gets most of the gain.

### PROPERTY-I03

**Say beside each lockbox code that contractors see it, and show the last view**

Low · New capability · effort S · `/properties/[id] (Access block, lockbox rows)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The view log this needed now ships; the property page hasn't adopted it.
- **Today:** The D21 pieces now exist. The portal logs one LOCKBOX_VIEWED security event per contractor, job and Buffalo day. The task rail has a Lockbox row ('Shown to Zack', or 'Pick a unit so Jose sees the lockbox code'). The property page's Units & access block is unchanged: each unit header still shows a lock emoji and the bare code ('Upper / Upper Front 🔒 7676'), with no note that contractors see it and no last view.
- **Why:** Jobber labels its notes block 'Internal notes will only be seen by your team', and Stripe's adjustment dialog says its note 'will not be visible to your customer'. Who can see a piece of data should be stated where that data lives. D21 already writes the view log, so showing it on the property costs little and closes the loop.
- **Change:** Keep the muted line under the codes ('Shown to the assigned contractor on open jobs'). Build each code row's sublabel ('Viewed by Jose A. · Oct 21') from the LOCKBOX_VIEWED events the portal now writes, joined to the job's unit. Replace the lock emoji with the KeyRound line icon the task rail uses, per the no-emoji rule.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a one-line sublabel under each code row. Phone 375: the sublabel stays on one line, shortens the name to initials when needed, and the view list opens as a sheet.
- **Reuse:** The SecurityEvent 'lockbox viewed' rows from the approved migration spec, muted text style and the Access block from PROPERTY-I02.
- **References:** 
  - [Jobber](https://mobbin.com/screens/228fe97b-859a-4c8b-bc9d-e7398bdb16c6): The 'Internal notes will only be seen by your team' helper line sits right under the section title.
  - [Stripe](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8): Helper text under the internal note field states that the customer won't see it.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:201-202`, `branch: docs/asana-migration-plan.md:82 (D21) and :218 (lockbox viewed logging) and :477 (portal lockbox on Oct 29)`, `branch-src/src/app/(app)/properties/[id]/edit-units.tsx:201-202`, `branch-src/src/lib/portal/jobs.ts:73-87 (logLockboxView)`, `branch-src/src/app/(app)/tasks/[id]/fields.tsx:159-167 (Lockbox rail row)`
- **Verification:** partly. The code display matches (edit-units.tsx:201-202) and all three 767 units share 7676. The finding leans on infrastructure that isn't built on this branch: the D21 portal display and the SecurityEvent 'lockbox viewed' log. The approved task page rail already includes 'Lockbox (when a contractor will see it)' (migration plan line 403), so the visibility statement already has a home on the task, where it applies per job. One muted line on the property is fine. A 'Viewed by José A. · Oct 21' sublabel under every code adds chrome to the most-glanced block, so the view history belongs in the property's Activity instead. The Jobber and Stripe references support the helper-line pattern only.

### PROPERTY-I04

**Make account, loan, policy and lockbox numbers copy with one tap**

Low · Design change · effort S · `/properties/[id] (Utilities, Loan, Insurance, Access)` · One record layout for every record

- **Today:** The numbers people paste into a portal or read to a utility are plain text: National Grid Acct # 2714917381, LOFL 81531-59050 and Buffalo Water 'Meter - 05361966' on 118 Congress, plus Loan #, Policy # and lockbox codes. Nothing in src calls the clipboard. On a phone, copying '81531-59050' from a right-aligned cell takes a long press and dragging the selection handles.
- **Why:** Mercury puts a copy icon beside routing and account numbers, Stripe puts one beside every ID in its rail, and Zillow puts 'Copy email' beside a tenant's address. These are values that get pasted or read aloud, and copying one wrong costs a second phone call.
- **Change:** Make each of these values a copy target. Tapping the value, or the small copy icon on desktop hover, copies it and shows a toast such as 'Copied National Grid account'. Show the digits in Geist Mono. This applies to utility account and LOFL numbers, Loan #, Policy #, lockbox codes and the address.
- **Desktop, tablet, phone:** Desktop 1280: the copy icon appears on row hover and on keyboard focus, and clicking the value also copies. Tablet 768 and phone 375: there is no hover, so the whole value is the tap target in a row at least 44px tall and the toast confirms the copy. No permanent icons on touch, per the touch rule.
- **Reuse:** New CopyValue primitive in src/components/ui.tsx with a row in docs/components.md, based on Mercury's account rows. It needs the toast that docs/components.md:66 lists as a gap.
- **References:** 
  - [Mercury](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930): Routing number, account number and bank address each carry a copy icon, and the account number has a reveal toggle.
  - [Stripe](https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2): The Payment ID in the details rail has an inline copy icon.
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): A quiet 'Copy email' link sits beside the tenant's email in the Tenants card.
- **Code:** `grep -rn clipboard src returns no matches`, `docs/components.md:66 (Toast: nothing yet)`
- **Verification:** partly. Confirmed: nothing under src calls the clipboard, and the values are plain text (118 Congress National Grid 2714917381, Buffalo Water 'Meter - 05361966'). Copy on hover or focus on desktop is a good Stripe and Mercury pattern, and Zillow cc09445f does show 'Copy email'. On touch, though, making the whole value a copy target collides with the house rule 'Touch has no hover ... use tap-to-edit instead' and with PROPERTY-016's per-field editing, because one tap can't both copy and edit. Use long-press, or a row menu with Copy, on touch. conflicts_with should name that touch rule. Severity is low: these values are copied occasionally, mostly on desktop, where text selection already works.

### PROPERTY-I06

**Show the lifecycle as a dated strip with time in the current stage**

Low · Design change · effort M · `/properties/[id] (under the header)` · One record layout for every record

- **Today:** Accurate, with two caveats. The '15 months rehabbing' is time since purchase, since no rehab start date exists. Statuses are not one linear path (Hold, Flip, Sold, Stabilized), so a fixed BRRRR stepper fits only some properties.
- **Why:** Resend's domain page shows Domain added, DNS verified and Domain verified as a horizontal strip with a date under each step. Brex shows the same on phone as a vertical list with the future step drawn hollow. Time in stage is how one partner notices that a rehab is dragging, the same signal Attio puts on deal cards.
- **Change:** Replace the three Details rows with one neutral strip under the header, joined by a hairline: 'Acquired · Jul 16, 2025', then 'Rehab · 15 mo' as the current step in bold, then 'Refinance' drawn hollow. A refinanced property reads 'Acquired Oct 30, 2024', 'Refinanced Mar 27, 2025 · 4.9 mo', 'Hold'. The header badge stays the only colored mark for status.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: horizontal, three or four steps with the date under each label. Phone 375: a vertical list in the Brex style that collapses to the current-stage line with 'Show history'.
- **Reuse:** propertyStatusTone and the status list in src/lib/config, fmtDay from src/lib/dates. New: a Stepper component, which docs/components.md doesn't have, based on Resend's domain events.
- **References:** 
  - [Resend](https://mobbin.com/screens/8ba08c9e-7fb1-4028-be55-dfa8757f733a): The horizontal events strip shows Domain added, DNS verified and Domain verified, each with a timestamp, above the tabs.
  - [Brex](https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811): On phone the status timeline is vertical, with checks on done steps and a hollow future step carrying its expected date.
- **Code:** `src/app/(app)/properties/[id]/edit-details.tsx:57-63`, `prisma/schema.prisma:108-118 (status, purchaseDate, refinanceDate, rehabMonths)`
- **Verification:** partly. Status shows twice (header badge and the Details row), and purchase and refinance dates are separate rows. rehabMonths (118 Congress 4.92, 15 Oxford 12.19) never appears. The stepper overfits BRRRR, though. Statuses include Hold, Flip, Sold and Stabilized, and 767's strategy is 'Hold', so an 'Acquired, Rehab, Refinance' strip is wrong for some properties. There is also no rehab start date, so '15 mo' is really time since purchase. A new Stepper component adds chrome. The valuable part is time in stage, and one muted line beside the badge carries it ('Rehabbing · 15 mo since purchase'), with the Details status row dropped. Severity is low because this adds a missing signal and doesn't remove friction.

### PROPERTY-I07

**Make 'Log refinance' the primary action while a property is rehabbing**

Low · New capability · effort M · `/properties/[id] (header primary action)` · One record layout for every record

- **Today:** Five properties are Rehabbing, not four. Recording a refinance does take two editors with separate Saves, and no field holds the current balance.
- **Why:** Jobber makes a record's next lifecycle stage its primary button: a job that 'Requires Invoicing' leads with Create Invoice. Stripe's balance adjustment shows the starting balance and the new balance before you apply it. A refinance is the largest money event in a BRRRR property and deserves one guided step that states what changes.
- **Change:** When status is Rehabbing or Refinancing, the header's primary button reads 'Log refinance'. It opens a sheet with close date, lender, loan amount, rate, monthly payment and maturity, plus two columns, Before and After, showing loan, cash out and LTV. The button reads 'Save refinance for 767 Prospect'. Saving sets status to Refinanced, writes refinanceDate and the loan fields, and adds one 'Refinanced' event to Activity. For other statuses the primary stays 'New task' (PROPERTY-038).
- **Desktop, tablet, phone:** Desktop 1280: a 480px right-side sheet with the page still visible. Tablet 768: the same sheet at full height. Phone 375: a full-screen sheet with Save pinned above the keyboard and Before/After stacked as two rows.
- **Reuse:** React Aria sheet (approved), Field and Input primitives, the existing property update action, and Geist Mono figures.
- **References:** 
  - [Jobber](https://mobbin.com/screens/1717a0a9-386f-4bfc-a4f6-3d9550db0778): The status 'Requires Invoicing' sits above the title, and the primary buttons are the next lifecycle steps (Create Invoice, Collect Signature).
  - [Stripe](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8): Starting balance and New balance sit side by side at the top of the dialog before Apply.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:123-153 (Details and Loan are separate sections)`
- **Verification:** partly. The Details and Loan editors are separate, and currentLoan has no UI (it appears only in src/lib/properties/service.ts:83). The count is wrong: five properties are Rehabbing (765 and 767 Prospect, 58 Mariner, 415 Crescent, 23 Sherwood). A refinance happens about once per property, so a dedicated header primary plus a Before/After sheet is a lot of UI for a rare event. The schema also keeps one flat loan ('refi history is a later model'), so 'Before' needs the old loan captured first, and effort M is optimistic. Simpler: let the Loan editor also set status and refinance date. Jobber's lifecycle button is a fair reference. The Stripe balance dialog pattern is real (Starting balance and New balance are visible on Stripe ed53af21).

### PROPERTY-I10

**Show how many days each available unit has been listed**

Low · Design change · effort S · `/properties/[id] (Rentals / Units listing rows)` · Rentals, residents and the public site run one lifecycle

- **Today:** No listing has availableDate, rent or any detail. The Aug 31, 2026 createdAt is the import date, so '53 days' would measure time since the import, not vacancy.
- **Why:** Zillow's property overview opens its listing card with 'Active for' and a duration, and its Listing tab leads with 'Last listed'. Days on market is what vacancy costs, and it is the number that prompts a price change or a new photo.
- **Change:** Next to the Available pill, add a duration such as '53 days', counted from availableDate or, when that is empty, from the date the listing was marked Available. After 30 days the count takes the amber tone to mark it stale. Show the same count on Portfolio rows.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: inline after the pill. Phone 375: the same line, shortened to '53d'.
- **Reuse:** Badge, plus the listing row in edit-listings.tsx:240. Needs a markedAvailableAt timestamp, or use the listing's updatedAt when its status changes.
- **References:** 
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The Basic listing card leads with 'Active for' and a duration, followed by View and Edit.
  - [Zillow](https://mobbin.com/screens/e6bd4d1f-7cb6-4cff-89ac-5fe99420e075): The Listing tab opens on facts ('Last listed May 2026', Rent Zestimate) before any form.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:240 ('No details yet')`, `Local DB: 3 listings, status AVAILABLE, createdAt 2026-08-31, availableDate null`
- **Verification:** partly. 'Available · No details yet' with no date reproduces (p767b--s1400--desktop-light.png). In the DB, all three listings have createdAt and updatedAt of 2026-08-31, which is the import date, and none has rent or availableDate. Counting from createdAt would show '53 days' of vacancy that is really time since the import, and the fallback 'date the listing was marked Available' doesn't exist yet. Ship it only with a markedAvailableAt that is set on status change, and leave imported rows without a count. Zillow cc09445f does show 'Active for'.

### PROPERTY-I13

**Esc cancels and Cmd-Enter saves in every property editor, with the keys printed on the buttons**

Low · Design change · effort S · `/properties/[id] (every editor)` · A quiet shell with real search, navigation and sign-in

- **Today:** With the Details editor open, pressing Esc leaves it open: all 10 inputs stay on screen. The Cancel and Save buttons show no key hints. None of the property edit sections handles keys; only inline-address-field handles Escape.
- **Why:** Stripe's note composer prints 'Cancel Esc' and 'Add note Cmd Enter' on its buttons, and the house rule is that one Esc closes one layer. Keyboard flow is part of what makes Linear and Superhuman feel fast.
- **Change:** In every property editor, Esc acts as Cancel and asks to discard only when there are unsaved changes (PROPERTY-024), and Cmd-Enter or Ctrl-Enter saves. On desktop, show small 'Esc' and 'Cmd Enter' keycaps inside the buttons. This applies whether editing stays per card or moves to per-field editing (PROPERTY-016).
- **Desktop, tablet, phone:** Desktop 1280: keycaps show inside the buttons. Tablet 768 and phone 375: keycaps are hidden because no keyboard can be assumed, and the buttons are unchanged.
- **Reuse:** Button, plus a new Kbd primitive in src/components/ui.tsx with a row in docs/components.md, based on Stripe's composer.
- **References:** 
  - [Stripe](https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2): The timeline note composer shows 'Cancel Esc' and 'Add note Cmd + Enter' keycaps on its buttons.
- **Code:** `src/app/(app)/properties/[id]/edit-details.tsx:83-86 (Cancel/Save, no key handling)`, `src/components/inline-address-field.tsx:43-45 (the only Escape handler)`
- **Verification:** partly. Reproduced: after clicking Edit on Details and pressing Esc inside the Value field, the editor stays open with all 11 fields (p767esc--after-esc--desktop-light.png). Only inline-address-field.tsx handles Escape. Esc to cancel and Cmd-Enter to save are worth doing under 'One Esc closes one layer'. Printing keycaps inside every Cancel and Save button on seven editors adds chrome. Put the hints in the buttons' tooltips, or show them only in long forms. The Stripe keycap pattern is real (Stripe 3401eb4e shows 'Save ⌘ + ↵').

### PROPERTY-I15

**List the contractors with open jobs at the property, with tap to call**

Low · New capability · effort S · `/properties/[id] (Overview rail)` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. On 767 the Tasks card shows contractors only as 20px initials avatars, outlined for contractors and filled for legacy names: 'J(' for Jacob (Jake) hoak, 'IF' Idrius Falleta twice, 'ZR' Zack Reading, 'KG' Kenneth Gonzalez, and a filled 'JA' for the legacy José Alvarez text. Each full name sits in a hover title and an sr-only span. There is no contractor section and no phone number on the property.
- **Today:** Contractors appear only as initials chips on task rows ('JA', 'KG'), and the full name is only in a hover title, which touch can't reach. At 767, José Alvarez has one open job (overdue) and Kenneth Gonzalez has one. Neither phone number can be reached from the property.
- **Why:** Jobber's property details page has a Contacts table (name, role, phone), and its phone job page puts a call icon in the header. On site, or when a tenant calls, the question is 'who's working here', and the answer should be one tap away.
- **Change:** Add a 'Contractors' rail section that lists each contractor with an open job here: name over trade, an open-job count ('1 open job · overdue'), and tap to call or text. The section is hidden when there are none.
- **Desktop, tablet, phone:** Desktop 1280: a rail section. Tablet 768: the same, below Access. Phone 375: 44px rows with a call button, limited to three with 'Show all'.
- **Reuse:** The Contact model and the contractor directory row, tel: and sms: links, and the Badge red tone for overdue.
- **References:** 
  - [Jobber](https://mobbin.com/screens/a96589e2-e854-4524-b3b9-58d4000f2562): The Property Details page has a Contacts table with Name, Role, Phone and Email beside Overview and Schedule.
  - [Jobber](https://mobbin.com/screens/536351e7-656d-444e-867d-38eb7f48e146): The phone job header has a call icon at the top right.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:189-196 (initials with title tooltip only)`, `Local DB: 767 open tasks by assignee: Connor 16, Pieter 9, José Alvarez 1, Kenneth Gonzalez 1`, `branch-src/src/app/(app)/properties/[id]/page.tsx:209-214`
- **Verification:** confirmed. Verified: the assignee shows only as initials with a title tooltip (page.tsx:189-196), which breaks the touch rule because no tap reveals the name. 767 has one open task each for José Alvarez (Mud Drywall, due Aug 28, overdue) and Kenneth Gonzalez. Build it to replace the tooltip-only chips as the way to learn who is working here, not as one more block. Under D10 it may live in the Tasks tab grouped by assignee. Jobber references are plausible.

### PROPERTY-V10

**Translate raw spreadsheet values in Utilities and Equipment into plain words**

Low · Fix · effort S · `/properties/[id] (Utilities and Equipment values)` · Plain, consistent words

- **Today:** The Utilities block shows imported codes as-is: 'Acct # TENANT', 'Autopay NA', 'Meter - 05179975'. Equipment rows hold 'x' as both model and year (118 Congress dishwasher) and years such as 'Old', 'Newer' and 'Fine'.
- **Why:** 'TENANT' in an account-number slot and 'x' as a model number read as data errors. Stripe's detail rails show either a value or a clean dash, never placeholder codes.
- **Change:** Map imported codes when displaying them. 'TENANT' becomes 'Tenant pays' and 'NA' becomes 'Not needed'. A 'Meter - 05179975' value splits into the number, with 'Meter' as a muted sublabel. Clean the 'x' rows to empty once. Leave free-text years such as 'Old' as entered, but don't compute an age from them.
- **Desktop, tablet, phone:** No layout change. On phone the shorter words fit the existing right-aligned value column without wrapping.
- **Reuse:** utilityStatusTone and UTILITY_GROUPS in src/lib/property-types.ts and the value cell at edit-units.tsx:216-227.
- **Code:** `Local DB units JSON on 767 and 118 Congress`
- **Verification:** verifier-found
