# Rehab draws

Planned with Connor on Nov 20, 2026, one question at a time (R1 to R11 below), and its layouts picked the same day (L1 to L4, section 6). He took every recommendation and asked to keep it "MVP and lightweight". Nothing here gets built until he says "build it".

## 1. Summary

**Why.** Every rehab loan holds back a budget that HG Capital draws on as work gets done. Pieter builds the budget before the rehab, sends each draw, books the inspection and watches for the wire, all from his inbox and the lender's worksheet. Connor's words: "I have no insight into knowing how much is coming." Today a draw is a bare task ("take a draw") with nothing behind it.

**What changes.**

- A **Draws** page of its own in the sidebar, after Portfolio (R10). At the top, across every open rehab: ready to draw, at the lender, funded and left in budgets. Below, one row per rehab with its progress bar (R2).
- A **rehab** follows the loan, so one rehab can cover more than one property: 765 and 767 Prospect share one Vontive loan and one rehab (R6). Each property page gets a small Rehab section that opens it.
- Each rehab holds its **budget line by line**: original, change order, revised, funded, at the lender, draft and left (R1). Lines are grouped by unit when the lender's sheet splits by unit, as on 23 Sherwood (R8).
- A Vontive rehab starts from an **uploaded Renovation Draw Worksheet**: its lines, change orders and past draws come in whole. Conventus rehabs and new ones are typed in (R7).
- The **next draw is always open as a draft**. Pieter types amounts on its lines as work wraps up; the draft's total is "ready to draw" (R3).
- A draw moves through **Draft, Sent, Inspection, Approved and Funded** (R4), one step at a time with a next-step button. Pieter moves it by hand (R5).
- Home's **Needs you** flags a draw with no change in 10 days, and a loan maturing with money not drawn (R11).
- Tasks don't connect to budget lines in the MVP (R9). Costs, tasks and forwarded emails come after it (section 8).

## 2. Decisions

| # | Decision |
|---|---|
| R1 | The budget is kept line by line, the way Vontive's worksheet keeps it: original, change order and revised per line, and each draw's amount per line. Totals only couldn't say which lines still have money |
| R2 | One Draws page summarizes every open rehab (how much can be pulled, what's coming), and each rehab opens to its own progress and over or under. Connor: "an entire draws page where I can see all draws and everything going on as a summary" |
| R3 | MVP: no payments or costs. The next draw stays open as a running draft that Pieter fills in as work wraps up, like Vontive's next column today. Its total is ready to draw. Over or under in the MVP compares funded, at the lender and draft against the revised budget per line; true spend comes with costs later |
| R4 | Five stages: Draft, Sent (date, amount sent), Inspection, Approved (approved amount), Funded (date, amount that landed). A Waiting on us flag with a short note can sit on any stage after Draft. Each draw shows its days in the current stage. (Nov 20: the Waiting on us flag was removed; see section 10.) |
| R5 | Pieter moves stages by hand in the MVP. Forwarding lender emails to a draws@ address that suggests the next stage is the first add-on. Reading Pieter's Gmail directly is out |
| R6 | One rehab per loan. A rehab links one or more properties and shows on each of their pages |
| R7 | A Vontive rehab is set up by uploading its Renovation Draw Worksheet (.xlsx): lines, change orders, the rehab holdback and every past draw. Anything else is typed: line name, original and change order. The upload happens once, at setup; after that the app is the record |
| R8 | When the lender splits the budget by unit, lines are grouped under each unit with its own totals, and the draft is filled per unit. A rehab without a split shows a plain list |
| R9 | Tasks stay out of the MVP. Linking them to lines gives a hint ("2 of 3 done") but no dollars, since tasks carry no cost |
| R10 | Draws is its own sidebar item, right after Portfolio (and in the phone drawer). Not a Financials tab: Financials reads QuickBooks and draws don't |
| R11 | Needs you gets three draw flags: a draw Waiting on us, a draw in Sent, Inspection or Approved with no change in 10 days, and a loan maturing with holdback not yet drawn (the existing loan maturity row gains the undrawn amount). A ready draft doesn't flag. (Nov 20: the Waiting on us flag was removed; stuck and maturity remain.) |

**Defaults taken with the summary (Connor, Nov 20: "Yes, save the spec").**

- Only rehabs with lender draws are tracked. A cash rehab has nothing to draw.
- Only open rehabs come in. Refinanced rehabs' history isn't imported.
- "At the lender" shows amounts by stage, not predicted dates.
- A rehab is marked done after its last draw or the refi, and stays viewable under a Done filter.
- No files on draws. Worksheets, acceptance forms and lien waivers stay in email and Drive. The uploaded worksheet is read and not kept.
- Partners only. Contractors never see a rehab, a draw or an amount.

## 3. What we found

**The lender's worksheet is the budget.** Vontive's "Renovation Draw Worksheet" (copies of 23 Sherwood draw 3 and 765/767 Prospect draws 6 and 7 are in the main checkout's gitignored `_private/`) has numbered Scope of Work lines with Original Budget, Change Order, Revised Budget, Remaining Balance, % Done and columns Draw 1 to Draw 15, plus an Outstanding Balance sheet with the loan overview: initial financing, initial rehab holdback, draws to date and draws remaining.

- 765 and 767 Prospect: one loan and one sheet for both properties, about a dozen lines, seven draws so far. Change orders moved the contingency line into the rough-in lines and took some from another line; the total stayed the same.
- 23 Sherwood: a Combined sheet that adds up one sheet per unit, about 20 lines per unit. Amounts carry cents.
- The worksheet has no dates. Draw columns hold amounts only.
- Its note: draws are "on a reimbursement basis"; soft costs, rough MEPs, lien waivers, contingency use and change orders need more paperwork.

**How a draw runs (Gmail and Drive, Jul to Nov 2026).**

- **Vontive.** Pieter emails Vontive's draws inbox with the worksheet's next column filled in. Vontive confirms and sends an inspection booking link. Approval comes within about 3 business days of the inspection, then a draw acceptance form to sign, then the wire within a day. $200 per draw comes out of the wire. Request to approval took 7 to 21 days this year; the longest waited on a lien waiver. Approved is often less than sent. Vontive won't raise the overall rehab holdback; change orders move money between lines, and lines can be added.
- **Conventus.** Draws go through its OneSite (Land Gorilla) portal. Conventus orders the inspection and shows a status tracker on its site. $265 per draw. Contingency needs a change order before it can be drawn.
- **Both** charge interest only on money drawn. A loan that reaches maturity with holdback still undrawn needs a paid extension, which is why R11 flags it.

**What Pieter keeps today.** The HG Master Database has Rehab Line Items (a budget per property by category, with paid to date), Rehab Summary, Rehab Project View, a Rehab Template, Rehab Actuals (rehab payments from the Baselane export, tagged by property, beside lender draws received; some payments still have no property) and Checks (check photos from a Google Form). Only 23 Sherwood has its lines filled in.

**Outside references.** Vontive's own product page: reimbursed through a construction holdback, interest on disbursed funds only ([vontive.com/products](https://www.vontive.com/products)). Kiavi's and Lima One's draw guides for the usual flow, change orders and holdback rules ([Kiavi](https://www.kiavi.com/blog/how-fix-and-flip-draw-process-works), [Lima One](https://www.limaone.com/construction-draw-process-explained/)). Rabbet's lender-side line-item table ([Rabbet hard costs](https://help.rabbet.com/en/articles/4619967-hard-cost-tab-explained)).

## 4. How the numbers work

Per line:

- **Revised** = original + change order.
- **Funded** = the line's amounts on Funded draws.
- **At the lender** = its amounts on Sent, Inspection and Approved draws.
- **Draft** = its amount on the open draft.
- **Left** = revised − funded − at the lender − draft.
- **Over**: a draft or a sent draw's line can't take more than the line has left (Connor, Nov 20: "dont allow me to try and pull more than what I have remaining available"); the refusal reads "Only $4,000 is left on Framing." A line can still show "Over by $X" when its budget is cut below what's already drawn. This is the MVP's over or under (R3).

Per draw: **sent** is the draft's total at the moment it's marked Sent. **Approved** is entered at Approved, and the line amounts are adjusted to add up to it (the lender's returned worksheet shows which lines were cut). **Funded** is what landed; the **fee** is approved − funded.

On the Draws page, across open rehabs: **ready to draw** = the drafts' totals; **at the lender** = sent amounts in Sent and Inspection plus approved amounts in Approved; **funded** and **left in budgets** add up the lines.

A rehab's **holdback** comes from the worksheet's Initial Rehab Holdback, or the lines' original total when typed. When the revised total stops matching it, the rehab says so, since a lender won't raise it.

## 5. Data

Planning-level sketch; the build settles names and indexes (Opus for the schema and migration). Every new table gets row level security in its migration (README, Rules of the road; `src/lib/db-rls.test.ts`).

- **Rehab**: name ("765 and 767 Prospect"), lender, holdback, status (open or done) with done date, notes, how it started (upload or typed), who changed it last.
- **RehabProperty**: links a rehab to each property it covers.
- **RehabLine**: rehab, position, unit (the property unit's lasting id, picked from the rehab's properties' units, and its label when set; a worksheet's "Unit 1" that wasn't matched keeps its words), name, original, change order.
- **Draw**: rehab, number, stage, stage changed at, sent at and amount, approved at and amount, funded at and amount. One open Draft per rehab at most. Imported past draws arrive as Funded with no dates; Pieter can add them.
- **DrawLine**: draw, line, amount.

Amounts are `Decimal(12, 2)`. `Property.rehabAmount` stays dormant; the rehab's lines replace it.

## 6. Screens

Picked with Connor on Nov 20, one at a time, each drawn as low-fi options at laptop and phone width. He took every recommendation.

| # | Decision |
|---|---|
| L1 | **The Draws page** is the totals strip (`FactStrip`: Ready to draw, At the lender, Funded, Left) over one table of open rehabs: Rehab, Current draw, Ready, Left and a Funded meter. The current draw cell reads "Draw 4 · Inspection · 6 days", or "Waiting on us" in the warning color. A row opens the rehab. It's built like the Portfolio page. A separate "In progress" list of draws above the table was turned down: every open draw would show twice |
| L2 | **A rehab is its own page** (`/draws/[id]`), laid out like the lease page: a BackLink to Draws, the rehab's figures (Holdback, Funded, At the lender, Ready, Left), then Budget and Draws sections in the main column, and a sticky Details rail with the lender, the holdback and the properties as links (Connor, Nov 20, dropped the loan's maturity and notes from it). Not a sheet over the list as deals open: 20 to 40 lines and a typed draft don't fit 672px, and the property pages link to it |
| L3 | **The property page shows a Rehab section right after Tasks** while a rehab is open: the current draw with its stage and days, a Meter for funded of the holdback, ready and left, and Open rehab. A Rehabbing property with no rehab shows Add rehab there. A done rehab leaves the property page and stays under Done on Draws. Not in the rail under Loan: below laptop width the rail stacks under the whole main column |
| L4 | **New rehab is a short sheet** (properties, prefilled when it starts from a property, and the lender). The rehab page then opens with an empty Budget offering Upload Vontive's worksheet or Add a line. An upload shows what it found (units, lines, holdback, past draws, and that past draws arrive as Funded without dates) before Add to rehab saves it. Typed lines use the same table's Add a line. Not one stepped sheet: 40 typed lines cramp it, and it would be a second place that edits a budget |

**At each size.**

- **Draws page.** Laptop 1280: everything above. Tablet 768: the strip stays four across; the table drops the Funded meter. Phone 375: the strip is FactStrip's own 2 by 2; each rehab is a two-line row (the name, then the current draw) with the meter under it, and its amounts live on the rehab page.
- **Rehab page.** Laptop: the main column and the sticky rail. Tablet: the rail moves under the main column, as on the lease page, and the Budget table drops Funded, which the figures above still show. Phone: the figures cut to Ready and Left; each line shows its name and its draft amount, or what's left; tapping a line opens a small sheet for its draft amount.
- **Property page.** The Rehab section keeps its place after Tasks at every size, so it's second on a phone.
- **New rehab.** The sheet is Sheet's own: a centered dialog from md, a bottom sheet below it. On a phone the upload opens the Files app, so a worksheet saved from email works.

**Color and charts.** No stacked bars: docs/specs/charts.md 2.9, ruling 1, allows no stacked categories and puts comparisons across properties in tables. Progress is the stock `Meter` (funded of the holdback, `--chart-1`). A line past its budget shows "Over by $X" in `--destructive` on that figure only, as charts.md plans for budget against actual. Stages are words, not colored chips, so they never echo the task `StatusMark` tones.

Mobbin references behind the picks:

- Stripe's balance summary, one bar split by status with amounts under it ([Mobbin](https://mobbin.com/screens/ec4bf8ef-b6b8-4fb7-b866-293ac767904e)), for the totals.
- Copilot's category budgets, a thin bar per row with spent and budget ([Mobbin](https://mobbin.com/screens/8fcfa6a7-f247-4a53-ab29-bab4255199bd)), for budget lines on a phone.
- Venmo's pending group above completed ([Mobbin](https://mobbin.com/screens/24ca4559-d881-4b58-966d-809e88350a06)) and Lightyear's two-step timeline ([Mobbin](https://mobbin.com/screens/bc40b4de-9e9e-41a4-a388-b2d5b7e22ddd)), for draws and their stages.
- Klarna's set-budget sheet ([Mobbin](https://mobbin.com/screens/4f1479d5-a74e-4b75-8b14-ea8797ec9143)), for entering an amount.

Also the Snowflake cost table on Mobbin ([Mobbin](https://mobbin.com/screens/acf53a58-0fc7-49b7-93e0-f62c164ecc79)), a status column beside amounts, for L1; and the app's own Portfolio page (L1) and lease page (L2). Every control comes from the stock components (docs/components.md); the stage control and the Needs you rows reuse what's there.

## 7. Reuse check

**Reused.**

- The property's `lender`, `loanNumber` and `loanMaturityDate` (prisma/schema.prisma, Property), and the Rehabbing status (`PROPERTY_STATUSES` in src/lib/config.ts; the `^rehab` match in src/lib/missing/checks.ts).
- `Section`, `FormSheet`, `useRun` with Undo, `NumberInput kind="money"`, `Money` and `fmtMoney`. Amounts show in whole dollars (Connor, Nov 20: "we don't need" decimals); they're stored to the cent so an uploaded worksheet adds up exactly.
- `FactStrip` and `Table`, `Th`, `Td`, `RowCell`, as the Portfolio page uses them (L1); `Meter` for funded of the holdback; `StatusMenu` to move a draw's stage; `EmptyState` and `AddRow` for the empty Budget and typed lines; the lease page's grid, sticky rail and `BackLink` (L2); the documents section's drop target for the worksheet upload (L4).
- The tenants feature as the template for a money record on a property: `src/lib/tenants/{core,service}.ts`, actions with zod, delete with a snapshot and Undo (docs/specs/lease-term-edits.md).
- `exceljs`, already a dependency (scripts/migrate/_lib.ts), to read the worksheet.
- Needs you's pure builders and their tests (src/lib/home/needs-you.ts).

**Extended.**

- The sidebar's `LINKS` (src/components/nav.tsx) and the command list (src/lib/commands.ts) gain Draws.
- Needs you gains a draw kind with its three cases, and the loan maturity row gains the undrawn amount.
- The property page gains a Rehab section.

**New.**

- The five tables above, with RLS.
- `src/lib/draws/` (core rules, service, queries, the worksheet reader with tests for both layouts: one Scope of Work sheet, and a Combined sheet over Unit (n) sheets).
- The Draws routes and their sheets.

## 8. After the MVP

- **Costs.** Every rehab payment as a record tagged to a rehab and a budget line, from invoices, check photos and the Baselane export. Gives true spend, true over or under, and ready to draw as paid minus drawn. This is where Connor's "each invoice that we pay has costs associated with it" lands.
- **Tasks on lines**, worth it once costs exist.
- **Forwarded lender emails** to a draws@ address, suggesting the next stage. The app already receives mail (`src/app/api/email/inbound/route.ts`).
- **Filling the lender's next column**: writing the draft into Vontive's worksheet for Pieter to send.

## 9. Conflict to settle when costs are planned

The contractor invoices plan (docs/contractor-invoices-plan.md, Oct 23) keeps an invoice as "a total plus the jobs it covers", says "the app isn't for reconciling to properties" (I4), and covers contractor invoices only (I11). Costs on budget lines need invoices, and materials receipts, tied to a rehab and a line. It doesn't touch this MVP. Decide it when costs get their own planning pass; that plan carries a note pointing here.

## 10. Build notes (Nov 20)

Connor's calls during the build, all in the code:

- **Whole dollars.** Every amount shows without cents; they're stored to the cent so a worksheet adds up exactly.
- **Units come from the property.** A line's unit is picked from the rehab's properties' units (house-meter rows left out), never typed; on a rehab over two properties the pick reads "765 Prospect Avenue · Upper". A unit saved before ids existed gets its lasting id on that save, as a lease's does. A worksheet split by unit asks which of the property's units each worksheet unit is before it saves, defaulting by order; one left unmatched keeps its words.
- **No more than what's left.** A draft amount, or a sent draw's amount on a line, can't go past what the line has left.
- **"Submitted", not "At the lender".** The figure and the column for money on draws that are sent and not yet funded (Sent, Inspection, Approved) read "Submitted" (Connor: "submitted and waiting"); this spec's "at the lender" means the same. The Budget table shows its Submitted column only while a line has some.
- **The Details rail** is Lender, Holdback and Properties.
- **Rows** take the app's usual table hover on a laptop, and a whole budget row opens its line (the draft input aside).
- **Table padding**: the first and last columns sit inset from the row edge, as the app's other tables do.

**Ready is gone (Connor, Nov 20, after seeing it built).** A standing "ready to draw" total read as if the app knew what could be drawn; it only knew what Pieter had typed. The real workflow: Connor says money is running low, Pieter checks each rehab's lines for what's been drawn and what's left, builds a request and sends it. So:

- **Available** replaces Ready and Left: revised less funded and submitted, per line, per rehab and across every open rehab. The Draws strip is Available, Submitted, Funded.
- **New draw** on a rehab opens the next draw (no running draft between draws). While it's open, the budget gets a "Draw N" column to fill in line by line, each capped at the line's Available, with Cancel and Send to lender under it. Otherwise the budget has no draft column.
- **Each line's history**: its sheet lists what every sent draw took from it ("Draw 1 · Funded · $8,000"), so a line isn't drawn twice. Vontive's worksheet and Conventus's approvals both work line by line.
- **Next-step button** (option A): an open draw's row has "Mark inspection", "Mark approved" or "Mark funded". Inspection is one tap; Approved and Funded ask for the amount, filled in from the step before. Each has Undo. It's on the rehab's Draws rows and in the Draws list's last column (laptop and tablet).
- The Draws list moved into the rehab page's right column, under Details.
- **Waiting on us is gone** (Connor: "get rid of the whole waiting on us toggle/feature"). No switch or note on a draw, no amber label, no Needs you row for it; a draw that sits shows as stuck after 10 days. Migration 20261120140000_drop_draw_waiting drops the two columns.
- **The draw being built's footer** sits at the bottom right: its total, Cancel and Send to lender, as QuickBooks' invoice and Airwallex's payment pages set their actions ([QuickBooks](https://mobbin.com/screens/8c6e5809-f27c-403e-8055-5007b16d5b81), [Airwallex](https://mobbin.com/screens/8127491a-6e62-492e-bac5-5c6d59840c5a)). Send opens a short confirm with the amount, the lender and the day it went (today unless changed), the way Mercury's and Melio's reviews ask before money moves ([Mercury](https://mobbin.com/screens/cd2dc4bc-de9e-447e-93bf-c12e92c2f2dc), [Melio](https://mobbin.com/screens/7382bfe2-2bbe-4353-8546-5319faec7cea)). On a phone the total sits on its own line above the two buttons.
- **Requested** on the Draws list: each rehab's current draw's requested amount, beside Current draw.
- **The draw sheet's Delete draw** sits at the footer's bottom left, opposite Cancel and Save draw (FormSheet's `footerStart`).
- **The rehab's Draws rows** are one line each (Connor picked option A, "action on the row"): the stage mark, "Draw 3 · $12,000" over its stage, and the next-step button at the right, the way Deel's Action required rows carry approve ([Deel](https://mobbin.com/screens/ebede796-0ca0-408a-bf05-630420732e1f)). The mark is the status ring's stage variant, as deal stages use it: Sent a quarter, Inspection half, Approved three-quarters, Funded the Done check. Where a row is under 320px (a 320 phone), the button reads only the stage it moves to ("Approved") so the amount is never cut off.

The device check's setup seeds one small open rehab when a local DB has none, so /draws/[id] always has a page.

