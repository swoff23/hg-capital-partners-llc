# Rehab draws

Planned with Connor on Nov 20, 2026, one question at a time (R1 to R11 below). He took every recommendation and asked to keep it "MVP and lightweight". The screen layouts get their own short round (section 6) before he says "build it". Nothing here gets built until then.

## 1. Summary

**Why.** Every rehab loan holds back a budget that HG Capital draws on as work gets done. Pieter builds the budget before the rehab, sends each draw, books the inspection and watches for the wire, all from his inbox and the lender's worksheet. Connor's words: "I have no insight into knowing how much is coming." Today a draw is a bare task ("take a draw") with nothing behind it.

**What changes.**

- A **Draws** page of its own in the sidebar, after Portfolio (R10). At the top, across every open rehab: ready to draw, at the lender, funded and left in budgets. Below, one row per rehab with its progress bar (R2).
- A **rehab** follows the loan, so one rehab can cover more than one property: 765 and 767 Prospect share one Vontive loan and one rehab (R6). Each property page gets a small Rehab section that opens it.
- Each rehab holds its **budget line by line**: original, change order, revised, funded, at the lender, draft and left (R1). Lines are grouped by unit when the lender's sheet splits by unit, as on 23 Sherwood (R8).
- A Vontive rehab starts from an **uploaded Renovation Draw Worksheet**: its lines, change orders and past draws come in whole. Conventus rehabs and new ones are typed in (R7).
- The **next draw is always open as a draft**. Pieter types amounts on its lines as work wraps up; the draft's total is "ready to draw" (R3).
- A draw moves through **Draft, Sent, Inspection, Approved and Funded**, with a **Waiting on us** flag and note that can sit on any stage (R4). Pieter moves it by hand (R5).
- Home's **Needs you** flags a draw waiting on us, a draw with no change in 10 days, and a loan maturing with money not drawn (R11).
- Tasks don't connect to budget lines in the MVP (R9). Costs, tasks and forwarded emails come after it (section 8).

## 2. Decisions

| # | Decision |
|---|---|
| R1 | The budget is kept line by line, the way Vontive's worksheet keeps it: original, change order and revised per line, and each draw's amount per line. Totals only couldn't say which lines still have money |
| R2 | One Draws page summarizes every open rehab (how much can be pulled, what's coming), and each rehab opens to its own progress and over or under. Connor: "an entire draws page where I can see all draws and everything going on as a summary" |
| R3 | MVP: no payments or costs. The next draw stays open as a running draft that Pieter fills in as work wraps up, like Vontive's next column today. Its total is ready to draw. Over or under in the MVP compares funded, at the lender and draft against the revised budget per line; true spend comes with costs later |
| R4 | Five stages: Draft, Sent (date, amount sent), Inspection, Approved (approved amount), Funded (date, amount that landed). A Waiting on us flag with a short note can sit on any stage after Draft. Each draw shows its days in the current stage |
| R5 | Pieter moves stages by hand in the MVP. Forwarding lender emails to a draws@ address that suggests the next stage is the first add-on. Reading Pieter's Gmail directly is out |
| R6 | One rehab per loan. A rehab links one or more properties and shows on each of their pages |
| R7 | A Vontive rehab is set up by uploading its Renovation Draw Worksheet (.xlsx): lines, change orders, the rehab holdback and every past draw. Anything else is typed: line name, original and change order. The upload happens once, at setup; after that the app is the record |
| R8 | When the lender splits the budget by unit, lines are grouped under each unit with its own totals, and the draft is filled per unit. A rehab without a split shows a plain list |
| R9 | Tasks stay out of the MVP. Linking them to lines gives a hint ("2 of 3 done") but no dollars, since tasks carry no cost |
| R10 | Draws is its own sidebar item, right after Portfolio (and in the phone drawer). Not a Financials tab: Financials reads QuickBooks and draws don't |
| R11 | Needs you gets three draw flags: a draw Waiting on us, a draw in Sent, Inspection or Approved with no change in 10 days, and a loan maturing with holdback not yet drawn (the existing loan maturity row gains the undrawn amount). A ready draft doesn't flag |

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
- **Over**: when left would go below zero the line shows "Over by $X". It warns; it doesn't block. This is the MVP's over or under (R3).

Per draw: **sent** is the draft's total at the moment it's marked Sent. **Approved** is entered at Approved, and the line amounts are adjusted to add up to it (the lender's returned worksheet shows which lines were cut). **Funded** is what landed; the **fee** is approved − funded.

On the Draws page, across open rehabs: **ready to draw** = the drafts' totals; **at the lender** = sent amounts in Sent and Inspection plus approved amounts in Approved; **funded** and **left in budgets** add up the lines.

A rehab's **holdback** comes from the worksheet's Initial Rehab Holdback, or the lines' original total when typed. When the revised total stops matching it, the rehab says so, since a lender won't raise it.

## 5. Data

Planning-level sketch; the build settles names and indexes (Opus for the schema and migration). Every new table gets row level security in its migration (README, Rules of the road; `src/lib/db-rls.test.ts`).

- **Rehab**: name ("765 and 767 Prospect"), lender, holdback, status (open or done) with done date, notes, how it started (upload or typed), who changed it last.
- **RehabProperty**: links a rehab to each property it covers.
- **RehabLine**: rehab, position, unit label (null without a split), name, original, change order.
- **Draw**: rehab, number, stage, stage changed at, sent at and amount, approved at and amount, funded at and amount, waiting on us with its note. One open Draft per rehab at most. Imported past draws arrive as Funded with no dates; Pieter can add them.
- **DrawLine**: draw, line, amount.

Amounts are `Decimal(12, 2)`. `Property.rehabAmount` stays dormant; the rehab's lines replace it.

## 6. Screens (layouts still to pick)

Before "build it", Connor picks from 2 or 3 low-fi layouts for each, drawn at laptop 1280x800, tablet 768x1024 and phone 375x667, each saying what drops on the phone:

1. **The Draws page**: the four totals and the rows of rehabs.
2. **A rehab's own view**: the line table with the draft column, unit groups, the draws list with stages, and where Approved and Funded ask for their amounts. Whether it's a page or a sheet over the list, as deals open, is part of this round.
3. **The property page's Rehab section** and **New rehab** (upload or type).

Mobbin references from the research, to start from:

- Stripe's balance summary, one bar split by status with amounts under it ([Mobbin](https://mobbin.com/screens/ec4bf8ef-b6b8-4fb7-b866-293ac767904e)), for the totals.
- Copilot's category budgets, a thin bar per row with spent and budget ([Mobbin](https://mobbin.com/screens/8fcfa6a7-f247-4a53-ab29-bab4255199bd)), for budget lines on a phone.
- Venmo's pending group above completed ([Mobbin](https://mobbin.com/screens/24ca4559-d881-4b58-966d-809e88350a06)) and Lightyear's two-step timeline ([Mobbin](https://mobbin.com/screens/bc40b4de-9e9e-41a4-a388-b2d5b7e22ddd)), for draws and their stages.
- Klarna's set-budget sheet ([Mobbin](https://mobbin.com/screens/4f1479d5-a74e-4b75-8b14-ea8797ec9143)), for entering an amount.

Every control comes from the stock components (docs/components.md); the stage control and the Needs you rows reuse what's there.

## 7. Reuse check

**Reused.**

- The property's `lender`, `loanNumber` and `loanMaturityDate` (prisma/schema.prisma, Property), and the Rehabbing status (`PROPERTY_STATUSES` in src/lib/config.ts; the `^rehab` match in src/lib/missing/checks.ts).
- `Section`, `FormSheet`, `useRun` with Undo, `NumberInput kind="money"`, `fmtMoney` and `MoneyCents` (cents are needed).
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
