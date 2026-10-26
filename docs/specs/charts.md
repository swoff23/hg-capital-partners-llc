# Spec: Charts and data visualization

Status: draft for Connor's approval. Nothing here is built. Read against HEAD 2a07648 on 2026-10-25 (the inventory was taken at 0677dd3; since then `SegmentedControl` sm moved from 12px type to `text-label`, so every control width below uses 14px with a mouse and 16px on touch). Visual rules come from `docs/brand-guidelines.md` ("Ink and Limestone"). Anything the guidelines don't cover is marked **new** and collected in section 2.9.

Reference check: on Mobbin, c50126f3 (Mercury Insights, Recipient | Category | GL Code with share, bar and "Remaining recipients"), c6cc0102 (Mercury Books, hairline bars with share), f41ddda3 (Mercury Cash Flow Analysis, "Sep MTD" and a pinned first column) and f972bbd5 (Stripe iOS, scrubbing swaps the header figure) were reopened and show what's cited. The rest were not reopened in this pass.

## 1. Summary

**What's wrong today.**
- Financials has no time chart. "Monthly income vs expense" is a list of horizontal rows with no month cap, no MTD and no empty months, and the expense series borrows `--chart-ref`, whose job is prior period or budget.
- Four bar idioms exist (MoneyBars, IncomeExpenseBars, ForecastYearBars, the checklist bar), with different heights, radii and widths, and two figure strips (Strip plus Kpi, and FactStrip).
- The CapEx charts dim unpicked years and rows to 30% and 40%, which drops real figures to about 2:1. This year's spend shows in `--danger` though it isn't late.
- Every bar is a CSS background, so charts vanish on paper, and the dark theme leaks into print.
- No figure has a period control or a comparison. The Overview totals run from history start with no end.

**What replaces it.**
- One shared month chart, **MonthBars** (new), on the Financials Overview and the property page. It plots one series at a time (NOI, Income or Expense), always 12 months, with a readout above the plot that names the picked month's figures. It fits 320 without scrolling.
- One shared **Meter** (new) for every horizontal bar: ranked expense, CapEx by year, checklist progress, data completeness.
- One **FactStrip** for every figure strip, moved to `src/components/`, with an optional comparison line in words.
- A period row on the Overview (Last month, Year to date) with Cash and Accrual as a segmented control.
- CapEx picks stop dimming: a picked year filters the table instead. The breakdown panel becomes a Popover with a mouse and a Sheet on touch.
- Charts print in light colors, with the figures in a table under each month chart.

## 2. The components

Every size below uses the app's sizes: laptop 1280 (pointer fine), tablet 768 (touch layout, `pointer: coarse`), phone 375 and 320. Widths come from the shell: a 240px pinned or 64px collapsed sidebar from `lg`, page gutters of 32, 24 and 16, and 16px card padding.

### 2.1 MonthBars (new, `src/components/month-bars.tsx`)

**Job.** Monthly flows over time: NOI, income or expense, one at a time, for the 12 months ending with the running month.

**Anatomy, top to bottom.**
1. **Header.** The title ("By month") on the left. On the right, a `SegmentedControl` sm: "NOI | Income | Expense", NOI pressed by default. When the card is narrower than 340px (a container query, so a pinned sidebar counts), the labels shorten to "NOI | In | Out" and title and control still share one row: about 221px of 256 at 320. The pick is local state; it isn't kept in the URL.
2. **Readout.** Three fixed lines, so the block never changes height while scrubbing:
   - Line 1, `text-meta` `--fg-3`: the plotted metric and month, "NOI · Sep 2026".
   - Line 2, `text-figure-m` `--fg-1`: that month's figure through `Money`, whole dollars, true minus.
   - Line 3, `text-meta` `--fg-3`: the other two metrics, "Income $12,400 · Expense $8,190" ("In $12,400 · Out $8,190" under 340px).
3. **Plot.**
   - 12 equal slots. One column per slot in `--chart-1`, centered, 60% of the slot wide, capped at 24px, square ends.
   - The zero baseline is 1px `--line-strong`. One gridline at the top tick is 1px `--line`, plus one at the bottom tick when any month is negative.
   - The top tick is the smallest of 1, 2, 2.5 or 5 times a power of ten at or above the largest value. Its label ("$5k") sits at the left edge in `text-meta` `--fg-3`, in a 16px band above the gridline that columns never enter. A bottom tick reads "−$5k". Compact dollars appear here only (brand section 3).
   - A negative month (NOI below zero, a net refund) hangs below the baseline in the same `--chart-1`. Never red, never outlined.
4. **Month axis.**
   - Line one: "Sep" in `text-meta` `--fg-3` when the plot is at least 384px wide, initials (J F M) below that. A container query, so a pinned sidebar counts.
   - Line two, only from 384px: the year under the first slot and under each January.
   - "MTD" under the running month at every width, right-aligned to the plot edge when the slot is too narrow.
   - The axis is the chart's period statement (brand section 3). The chart keeps its own 12-month window and doesn't follow the period row; `SourceLine` above carries the source.
5. **Print table.** Month, Income, Expense, NOI for all 12 months. It's `hidden print:table`, so paper carries every figure and screen readers don't hear the values twice.

**The picked month.**
- Its slot gets a `--fill-1` band behind the column, full plot height, with a 1px inset `--line-control` edge. That edge is the selected segment's edge and the picked CapEx year's ring today (3.89 / 4.03 against `--surface`, 3.42 / 3.65 against the band), so the pick carries a 3:1 mark without a new one (principle 6). Mercury draws its picked period the same way: a pale band with a 1px edge ([Mercury Books](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62), [Mercury Insights](https://mobbin.com/screens/10e9460a-1e44-4361-afe6-e0e9d857e6d9)).
- Its month label turns `--fg-1`, same weight.
- Other months are never dimmed.

**Default month.** The latest complete month inside history, even when it has no lines, so a gap still shows. When history began this month, it's the running month. Otherwise the running month is never the default (Copilot leaves it out until it's complete).

**States.**

| State | Plot | Readout |
|---|---|---|
| Loaded | Columns as above | The picked month |
| Running month | A hollow column: 1px `--chart-1` edge on `--surface`, and "MTD" on the axis | "NOI · Oct 1 to 25" (through the last sync day, Eastern) |
| A month in history with no lines | No column | Line 2 reads "No QuickBooks lines for Mar" in `text-body` `--fg-3`, inside the figure line's 28px box; line 3 is blank |
| A slot before history start | No column; the label stays | "QuickBooks history starts Jan 2026" |
| A slot before purchase (property page) | No column; the label stays | "Bought Aug 2026" |
| No lines in the whole window | The frame stays: axis labels and baseline. No ticks | No readout and no tab stop. One `text-body` `--fg-3` sentence centered in the plot: "No QuickBooks lines for Nov 2025 to Oct 2026." Under 384px it balances onto two lines (`text-wrap: balance`). Before the first sync: "Lines show up after the first sync." |
| Loading | Labels and month initials draw at once. 12 equal `--fill-1` columns at 40% of the plot, so no fake trend. Static, no shimmer, `aria-busy` on the card | Labels drawn; the figure is a `--fill-1` block at figure height |
| Refresh, or a period or basis switch | The old chart stays until the new data lands. `RefreshButton` keeps its spinner rule (after 200ms, at least 400ms) | Figures fade in over 120ms when the new data lands |
| Stale sync, Reconciliation off | No change | No change; `SourceLine` carries them |

These rules need every month emitted, empty ones included. `queries.ts` builds the axis with the existing `monthRange` in `src/lib/quickbooks/months.ts` (FINANCIALS-V03).

**Mouse (pointer fine, `@media (hover: hover)`).**
- Moving across the plot previews the slot under the pointer: the band follows, and the readout shows that month.
- A click picks it. Leaving the plot returns the readout to the pick.
- The cursor stays the default arrow.

**Touch (tablet and phone).**
- A tap picks the month.
- A horizontal drag scrubs once it passes 8px, with pointer capture. The readout and band follow the finger, and lifting it keeps the pick.
- `touch-action: pan-y` keeps vertical swipes scrolling the page.
- No hover band. The value never sits under the finger, since the readout is above the plot (Stripe iOS, Apple Health).

**Keyboard.**
- The 12 slots are a React Aria `RadioGroup` (in `react-aria-components` 1.21.1): one tab stop on the picked slot.
- Left and Right move the pick (RadioGroup's own arrows). Home and End go to the first and last slot; RadioGroup has no Home or End, so MonthBars adds them.
- Focus is the 2px `--act` ring around the slot.
- Esc returns to the default month. When the default is already picked, Esc does nothing, so it never eats an outer layer's Esc.
- The metric control is its own group of `aria-pressed` buttons before the plot.

**Screen readers.**
- The group is named "NOI by month, Nov 2025 to Oct 2026", following the metric.
- Each slot is named with a full sentence: "Sep 2026: NOI $4,210, income $12,400, expense $8,190". A running month reads "Oct 2026 so far, through Oct 25: …", and an empty one reads "Mar 2026: no QuickBooks lines".
- Visible axis labels, ticks and the readout are `aria-hidden` (Apple HIG, Charts).

**Motion.**
- Switching the metric moves each column to its new height with `transform: scaleY()` from the baseline over `--dur-base` `--ease-spring` (ruling 11). A transform animates in WebKit too, which a CSS `height` change would not.
- There's no grow-in on first paint, and columns don't move while scrubbing.
- Readout figures fade in over 120ms (`animate-fade-in`, keyed on the value). They never count up.
- Reduced motion: the global block in `globals.css` already makes the transition instant and keeps the 120ms fade.

**Build.** HTML and CSS, like the other bars, so labels use the type tokens and their `pointer: coarse` sizes. No chart library and no SVG. The root carries `data-chart` for the print rule in 2.8. `fmtMonth` comes from `period.ts`, which moves to `src/lib/quickbooks/period.ts` (a component in `src/components/` can't import from a feature folder).

**Sizes.**

| Width | Where | Plot width | Slot | Column | Month labels | Plot height | Input |
|---|---|---|---|---|---|---|---|
| 1280, sidebar pinned | Overview, left half of the lg grid | about 448 | 37 | 22 | "Sep" plus year line | 160 | Hover previews, click picks |
| 1280, sidebar collapsed | Overview | about 536 | 45 | 24 | "Sep" plus year line | 160 | Same |
| 1024 to 1279 | Overview, half card | 320 (pinned) to 408 (collapsed) at 1024 | 27 to 34 | 16 to 20 | Initials under 384, "Sep" from 384 | 160 | Same; an iPad in landscape taps and drags |
| 1280 | Property page main column | about 620 (pinned) | 52 | 24 | "Sep" plus year line | 120 | Hover, click |
| 768 (touch) | Overview, full width | about 688 | 57 | 24 | "Sep" plus year line | 160 | Tap, drag |
| 768 (touch) | Property page | about 720 | 60 | 24 | "Sep" plus year line | 120 | Tap, drag |
| 375 | Either | about 311 | 26 | 15 | Initials | 128 (property 96) | Tap, drag |
| 320 | Either | about 256 | 21 | 13 | Initials | 128 (property 96) | Tap, drag |

**What drops on phones.** The hover preview, three-letter month labels, the year line (the readout carries the year), and the words Income and Expense in the control and line 3 (they become In and Out). All 12 months stay and nothing scrolls sideways. Slots at 375 and 320 are under 44px wide, so the device check will warn on tap targets. The whole plot is one scrub surface, as HIG recommends for compact charts, so this warning is accepted, not added to `known-issues.json`.

**Later, not built now.**
- A prior-year reference, once a year of history exists (from Jan 2027): a 1.5px dashed `--chart-ref` tick across the slot at the same month last year, drawn behind the column. Line 3 of the readout then adds "$3,900 in Sep 2025". This is brand section 4's rule as written.
- Budget against actual, once rehab budgets exist (PORTFOLIO-I06): actual in `--chart-1`, the budget as the dashed tick, and `--danger` only on the part over, with the words "$1,200 over".
- Closed-books marks on months (FINANCIALS-I09). They need QuickBooks' close date, which the sync doesn't read today.
- No event annotations, no value on every column, no second axis (the Causal counter-example).

**References.**
- Apple Health: [default readout over the plot](https://mobbin.com/screens/92cf868c-3d1c-434b-aba1-ea52a196e03a), [a tap swaps the readout](https://mobbin.com/screens/51dd8941-0326-4b0d-8f48-b5fbbcdd3539).
- Stripe Dashboard iOS: [scrubbing updates the header figure](https://mobbin.com/screens/f972bbd5-699d-42c3-942e-1cf9f3d25eda).
- Vercel: [a metric switch over one series, three ticks](https://mobbin.com/screens/172f9834-0e6a-4fa8-abd4-6e91b02b5ef4), [one hue in dark](https://mobbin.com/screens/900542f7-c157-4445-8f88-d79dca719c7a).
- Mercury iOS: [Money in | Money spent switch](https://mobbin.com/screens/33aa85ec-2765-421d-b954-5ef74b748e81).
- Mercury web: [picked period as a band with a 1px edge](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62), [the running month shaded and labeled "Sep MTD"](https://mobbin.com/screens/f41ddda3-30cd-4bed-8730-9ab936b86a4c).
- Strava: [12 months as initials at 375, none dimmed](https://mobbin.com/screens/72993508-4631-4347-bf9a-666982abfe87). Revolut Business: [12 initials in dark, partial month set apart](https://mobbin.com/screens/66fbb31a-0367-4c14-bdd9-d76ad9a2f79d).
- Copilot: [picking a month swaps the header](https://mobbin.com/flows/d630b4f3-dc3d-4c04-b2bc-3b19d1611a0a), [the running month left out of the default](https://mobbin.com/flows/a97f2c19-d907-45cb-88a3-89ae12163412), [incomplete months drawn apart](https://mobbin.com/screens/278401e5-13b2-4778-8fb4-cfeccbf12357). Copilot fades the incomplete month; a fade is the dimming this spec rules out, so the hollow column is the adaptation (ruling 5).
- Cash App: [empty chart keeps its frame](https://mobbin.com/screens/80bc3ee0-fc2b-47c4-91b1-d4b2c8d196ef). Square: [flat skeleton](https://mobbin.com/screens/09371ef3-f0d0-4fc9-8ab1-607ab3d0e4ab). Klarna counter-example: [ghost bars of varying height read as data](https://mobbin.com/screens/1b5919b4-9b02-43db-8e30-540ea5f01fce).
- [Apple HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts): don't require interaction for critical values, make the whole plot the hit target, describe values to assistive tech.
- Causal counter-example: [values on every column and a second axis](https://mobbin.com/screens/512574a7-274d-469c-9430-1474c3b97f8c).

### 2.2 FactStrip (extended; moves from `src/app/(app)/properties/fact-strip.tsx` to `src/components/fact-strip.tsx`)

**Job.** Every row of headline figures: the Financials KPI strip, the property Financials figures, the Portfolio strip and the record fact strip. It replaces `Strip`, `Kpi` and `DqStat` in `financials/_components/ui.tsx` and `financials/page.tsx`.

**Anatomy (kept).** Four facts in one row split by `--line` rules, 16px in from each rule. A 2 by 2 grid on phones. Labels in `text-meta` `--fg-3` over the figure. The key figure shares a baseline with the rest through the invisible strut.

**Extensions.**
- `size="l"` sets every figure to `text-figure-l`, for the KPI strip (brand section 3). The default stays `text-figure-m` with an optional `key` fact.
- `sub` per fact: one `text-meta` `--fg-3` line under the figure. It holds the comparison (2.6) and nothing else. From sm the strip's grid takes a third row when any fact has one, so the subs share a line.
- **One size step for the whole strip**, so figures in a strip always match. A container query on the strip steps every `text-figure-l` to `text-figure-m` when a cell would be under 136px, the room an eight-character figure ("$398,400", "−$12,400") needs at 28px. It replaces today's viewport rule (`max-[360px]`) and also covers a pinned sidebar. A strip whose longest figure runs past eight characters ($1,240,000) uses `text-figure-m` at every width.
- `empty` per fact: a verb in place of the dash for a fact the user can fill ("Add value"). It's a `textLinkClass` button at `text-body` that opens the editor where the value lives.
- A changed figure fades in over 120ms (`animate-fade-in` keyed on the value) after Refresh (brand section 7).

**Sizes (the Overview KPI strip, four facts at `size="l"`).**
- 1280: one row, about 211px a cell with the sidebar pinned. 28px.
- 768: one row, about 147px a middle cell. 28px.
- 640 to 700: one row under 136px a cell, so the strip steps to 20px.
- 375: 2 by 2, about 158 to 171px a cell. 28px.
- 320: 2 by 2, about 131 to 144px a cell, so the strip steps to 20px.
- Nothing drops. A `sub` line fits about 120px ("Down $12,400"), since the comparison's basis is stated once in `SourceLine`.

**Touch and keyboard.** Static. The only interactive piece is an `empty` verb, which is 44px tall on touch.

**References.** Brand section 5 (record fact strip); [Mercury summary strip](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79); [Stripe figure beside its previous period](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b); [QuickBooks "Up 79% from prior month"](https://mobbin.com/screens/01b4b6ad-96d1-48e9-8b8a-10dab1115f6b); [Rocket Money compares in words, not color](https://mobbin.com/screens/b97356ea-e602-4545-bdc9-072d6e36e84a); [Mercury Books "+$115 vs prior period" in gray under the figure](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62).

### 2.3 Meter (new, `src/components/meter.tsx`)

**Job.** A measured share as a horizontal bar: a ranked amount, a year's spend, checklist progress, data completeness.

**Anatomy.** A 4px `--fill-1` track the width of its box (the "meter track" job brand section 4 already gives `--fill-1`), with a `--chart-1` fill from the left. Square ends. Props: `value`, `max`, optional `label`.

**Behavior.**
- With `label`, it's `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` ("2 of 5 done").
- Without `label`, it's `aria-hidden`, and the row's text carries the value (MoneyBars, ForecastYearBars).
- Where it follows a tick (the checklist), the width springs over `--dur-check` `--ease-spring`. Elsewhere it's static. Reduced motion makes it instant.
- `data-chart` on the root, so it prints (2.8).
- Same at every size, and same on touch and desktop. Status colors never fill it: a full checklist stays `--chart-1`.

**References.** [Material linear progress indicator](https://m3.material.io/components/progress-indicators/overview) for the 4dp track-and-fill anatomy; [Mercury Books expenses with a hairline bar and share](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62); [Mercury ranked recipients](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa); [Square "Complete your setup" bar for completeness](https://mobbin.com/screens/f754f017-d74c-40f2-a016-e2eabaf6b518).

### 2.4 MoneyBars (extended; moves from `financials/_components/ui.tsx` to `src/components/money-bars.tsx`)

**Job.** Where operating expense went in the period, ranked. The property page already imports it from Financials, so it moves first (components.md rule).

**Anatomy.**
- **Header (Overview card).** "Operating expense" on the left and a `SegmentedControl` sm "Category | Account | Payee" on the right, Category by default. Under the title, one `text-meta` `--fg-3` line gives the period and total: "Jan 1 to Oct 25, 2026 · $61,200". Title and control need about 365px with a mouse and 400px on touch, so when the card is narrower than 400px (a container query) the control sits on its own line under the title. That's 1024 with the sidebar pinned (320px), 375 (311) and 320 (256, where the control alone is about 243). At 1280, 768 and 1024 collapsed they share one row.
- **Row**, the same layout at every size (today's phone layout, used everywhere):
  - Line 1: the label in `text-body` `--fg-1`, truncating only at the card edge. Then the share in `text-meta` `--fg-3` ("31%", "<1%"). Then the amount, right-aligned, through `Money`.
  - Line 2: a `Meter` the full row width, scaled to the largest row.
  - Rows are 8px apart, 12 on touch.
- **Cap.** The top 7 rows show, then "Everything else", which sums the rest with its share and a meter, and "9 more" in `--fg-3` after its label ([Mercury "Remaining recipients"](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa)). It's a button with `aria-expanded`. Opening it replaces the row with the remaining rows in place and moves focus to the first of them; a "Show fewer" `textLinkClass` button ends the list and puts the row back.
- **Negative total** (refunds over spend): no meter and no share. The amount has a true minus, and the row sorts last. This replaces the outline-bar rule.
- **Breakdowns.**
  - Category is today's `CATEGORY_LABELS`.
  - Account groups on `LedgerLine.accountName`.
  - Payee groups on `LedgerLine.name` (QuickBooks' Name, verbatim). Lines with no name gather under "No payee". Joining payees to Contacts waits on FINANCIALS-V02.
- **Empty.** "No operating expenses in QuickBooks for Jan 1 to Oct 25, 2026." The sentence carries the period, which fixes problem 7.

**Behavior.**
- The list follows the page period (2.6), not the chart's picked month (choice D3).
- The switch swaps the list at once, with no animation (`--dur-0`, like tab switches).
- On the property page there's no switch: "Expense by category", top 7 and "Everything else".
- Same at 1280, 768 and 375. At 320 the share stays, and a long label truncates before it.

**References.** [Mercury Money out with a Recipient | Category | GL Code switch, share, bar and Remaining row](https://mobbin.com/screens/c50126f3-c02b-4c44-a643-a26c0db602aa); [Mercury Books](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62); [Wise ranked categories with share](https://mobbin.com/screens/a48799b7-4e7c-4a57-a568-10f4c37fb8ff).

### 2.5 ForecastYearBars and the CapEx breakdown (extended in place: `src/app/(app)/properties/capex-ui.tsx`, `src/app/(app)/portfolio-capex.tsx`, `src/app/(app)/properties/[id]/capex-outlook.tsx`)

**ForecastYearBars row.** It keeps its parts: the year (`.num`, `w-10`), then a `Meter` where the inline spans are today, then the amount through `Money` in `w-20`, then on the property card "3 items" (drops below 400px, as today). At 320 the meter gets about 140px. Each row prints its amount, so the bars need no axis.
- **Picked year.** Keeps the 1px inset `--line-control` ring (the same mark as MonthBars' picked month), and its year turns `--fg-1`. The other years stay at full strength (no 40%).
- **Zero years** become plain text rows with the dash glyph, not disabled buttons. They read in order, and they aren't tab stops because there's nothing to pick.
- **Names.** Each button's accessible name is a sentence: "2026: $13,000 spend, 3 items".
- **Esc** clears the pick when focus is in the bars (one layer).
- **Hover** `--fill-1` only under `@media (hover: hover)`, with 44px rows on touch, as today.

**What a picked year does (no dimming anywhere).**
- **Property card.** The item table filters to that year's items. The total row reads "2026 total". The line above the table reads "2026 · All 5 years", where "All 5 years" is a `textLinkClass` button that clears the pick. It replaces the lowercase "clear". This follows Copilot and Mercury iOS: a pick swaps the list below it.
- **Portfolio card.**
  - The matrix shows only properties with spend that year.
  - The picked year's column header turns `--fg-1`. The pick's mark is the ring on its year bar just above, so the header takes no mark of its own.
  - The big total swaps to "$13,000 · 2026 spend · All 5 years".
  - Below sm the matrix shows two columns: Property, plus one money column for the picked year, or the 5-yr total when nothing is picked. The year bars above are the switch, so the matrix never scrolls sideways on a phone.

**Red means late only (a wrong-state fix, made directly).**
- `--danger` marks only items whose replacement year is before this year: "Past due" in the Due column, and "$4,000 past due" beside the total.
- Items due this year read their year in `--fg-2`, and the matrix's first-year cells are `--fg-1` like the rest.
- The breakdown says "Past due", never "now".
- In `capexForecast`, an item's `overdue` flag is `projected <= fromYear` today, which is what paints this year's items red. It becomes `projected < fromYear`, and `capexForecast` and `portfolioCapexForecast` add an `overdueTotal` beside `dueNowTotal`.

**Breakdown.**
- The fixed 336px `role="tooltip"` panel goes.
- Each nonzero value stays a button with today's dotted `--line-strong` underline (ruling 12). With a mouse it opens a `Popover`; on touch it opens a `Sheet` (`useCoarsePointer`, the picker pattern). That fixes SHELL-025 and VISUAL-051.
- Content: the title ("118 Congress St · 2026"), then one line per asset: type · unit, with the year when the value spans years, and the cost. Portfolio-level values add the property's short address on a second `text-meta` `--fg-3` line. A Total row follows with the grand-total rule (a breakdown's net, brand section 3).
- The surface is sized to content, with a max height of 60vh that scrolls inside.
- Esc closes it and focus returns to the value.
- It opens on click, not hover, because it holds a list.

### 2.6 Period row, comparisons and SourceLine (extended; `SourceLine`, `WarnMark` and `Notice` move to `src/components/source-line.tsx`, since the property page already uses them)

**Period row (Overview only, FINANCIALS-001).** One row above everything it scopes:
- Left: `SegmentedControl` sm "Last month | Year to date", Year to date by default, kept in `?period=last|ytd`. "12 months" joins from Jan 2027. Until then it would equal Year to date.
- Then a `SegmentedControl` sm "Cash | Accrual", kept in `?basis=`. It replaces the "Show accrual basis" TextLink, and the default still comes from Settings.
- Right: Refresh.
- `TopTabs` already keeps `basis`; it keeps `period` too.
- A switch keeps the old figures on screen until the new ones land, like Refresh.

**Period row sizes.**
- 1280: one row, about 430px wide with a mouse.
- 768: one row, about 500px on touch, in 720.
- Below sm: one `pickerChip` "Year to date · Cash" plus Refresh, about 260px at 320. The two controls side by side need about 380px on touch, so they collapse into the chip (CLAUDE.md, rows never wrap). The chip opens a `Sheet` titled "Period and basis" with the same two controls at md. A tap applies, and Esc or the close button shuts it.
- The row never wraps from 320 to 1920.

**SourceLine.** It sits on its own line under the period row, directly above the strip.
- **Period text.** When the period ends in the running month, it states the last synced day: "Jan 1 to Oct 25, 2026 · QuickBooks, cash basis, synced 6h ago". `periodLabel` gets a `through` day option.
- **Comparison basis.** When a comparison shows, it's stated once here: "Sep 2026 vs Aug · QuickBooks…".
- **Below sm** the basis clause drops, as today; the chip carries the basis.
- **Stale** and **Reconciliation off** stay as warn marks.

**Comparison line (FactStrip `sub`).**
- Words in `--fg-3`: "Up $310", "Down $1,200", "No change". No arrows and no green or red, since status colors don't decorate.
- It shows only when the prior span is fully inside history. In 2026 that's Last month against the month before. Year to date and 12 months get it from Jan 2027 (vs the same months a year earlier). Until then the line is left out, not shown as a dash.

**References.** [Stripe control row above the cards](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3); [Stripe range pills beside the explicit range](https://mobbin.com/screens/a35ca351-394d-47f0-b96f-5e5cb6356bfb); [Dub period presets](https://mobbin.com/screens/fa13abe1-ef50-478f-a64d-2d124bc407f7); [Xero "up 6,528 vs last period"](https://mobbin.com/screens/5f186488-9c1c-4065-ab67-22e4fe9e6a2e); [Rocket Money in words](https://mobbin.com/screens/b97356ea-e602-4545-bdc9-072d6e36e84a).

### 2.7 Rent roll grid and MonthStepper (extended in place: `src/app/(app)/financials/rent-roll/page.tsx`; MonthStepper is feature-local, `rent-roll/month-stepper.tsx`)

A statement grid, the dense form (Mercury P&L): a table is the right home for comparing properties (brand section 4), so no heat or color encoding is added.

**From sm (1280 and 768).**
- **Months.** The 12 months ending with the running month, built with `monthRange`, so empty months keep their column. Headers come from `fmtMonth`, and the running month reads "Oct MTD".
- **First column.** Pinned (`position: sticky; left: 0` on `--surface`) inside `TableFrame`'s sideways scroll. While it's scrolled, a `--line` rule on its right edge clips the months under it.
- **Width.** 12 months, Total and the Property column need about 1,300px, so the grid scrolls sideways at 1280 (976 or 1152 of room) and at 768 (720), with the pinned column holding the addresses. While it scrolls, `Th` doesn't stick to the page (the known gap in `docs/components.md`); at 11 properties the grid is about one screen tall.
- **Cells.** A month before the property's purchase is blank. A month after purchase with no matched rent is the dash glyph. A property bought inside the window gets "Bought Aug 2026" in its subline, so a blank reads as not owned yet. This replaces "N mo". The Voucher and Owner-funded sublines stay.
- **Unassigned row.** "Rent not tied to a property", with a Map classes TextLink, sits above the footer. The Portfolio total then matches the Overview's rent.
- **Copy.** The four-line explainer goes. The basis is in `SourceLine`; the voucher and owner-funded rules show on their rows; "no lease data" and how classes roll up are internal caveats and move to a code comment (CLAUDE.md copy rules).
- **Totals.** Total sums the shown months, and the Portfolio grand total keeps its statement rules. The Portfolio row is each month's headline from sm, so no separate "Collected $x" line is added there.

**Below sm (375 and 320): one month at a time.**
- A `MonthStepper` "‹ Sep 2026 ›": two 44px ghost icon buttons (lucide `ChevronLeft`, `ChevronRight`) around the month in `text-label`. It starts on the last complete month. Next is disabled at the running month, Previous at history start. Left and Right arrow keys step when it has focus.
- Under it: "$18,400 received" (cash) or "$18,400 earned" (accrual) in `text-figure-m`, then one two-line row per property (address, and its amount right-aligned; "Bought Aug 2026" or the dash glyph where there's no amount), then the unassigned row, then the Portfolio row with the grand-total rule.
- What drops on phones: the other months, which are a step away.

**Not built now:** expected rent (no lease data), and opening a cell's deposits (DATA-I04, waits on the line drill).

**References.** [Mercury Cash Flow Analysis, months as columns ending "Sep MTD" with the account column pinned](https://mobbin.com/screens/f41ddda3-30cd-4bed-8730-9ab936b86a4c); [Mercury P&L](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4); [Airtable frozen first column on a divider](https://mobbin.com/screens/43c68538-9718-48ce-85b0-fc3e236641af); [AWS "Sep 2025 (MTD)" history table](https://mobbin.com/screens/d3ff9452-2c33-4222-b18f-c9df01dc7f33); [Mercury iOS "‹ October 2025 ›" stepper](https://mobbin.com/screens/4de25abd-3405-4777-8d93-9ad39f0ad5c6); [Mercury web "‹ Sep 2026 ›" money movement](https://mobbin.com/screens/77963885-5965-4f86-81f8-32dbffe67dc9); [Splitwise month stepper](https://mobbin.com/screens/f77b2738-8716-4219-932f-3e9080cbbd2c).

### 2.8 Cross-cutting: print, dark, accessibility

**Print** (`src/app/globals.css`, G1E-008 and G1E-009).
- Inside the existing `@media print` block, `:root[data-theme="dark"]` takes the light token values and `color-scheme: light`, so paper is always ink on white.
- `[data-chart] { print-color-adjust: exact; }` keeps every bar's background. The marks stay CSS backgrounds.
- MonthBars adds its print table.

**Contrast.** It works through the existing tokens with no new values.
- `--chart-1` is 8.46 / 12.03 on `--surface` and 7.43 / 10.89 on the `--fill-1` band.
- `--fg-3` axis text is 5.89 / 6.90 on `--surface`.
- The picked slot's `--line-control` edge is 3.89 / 4.03 on `--surface` and 3.42 / 3.65 on the band. The band itself is decorative at 1.14 / 1.10.
- No status color or gold appears in any mark.

**Screen readers, one approach for every chart.**
- MonthBars uses sentence names per slot.
- MoneyBars rows read their label, share and amount, with the meter hidden.
- ForecastYearBars buttons read a sentence.
- Meters that show progress are progress bars with `aria-valuetext`.

### 2.9 Rulings for Connor (all **new**: the guidelines don't cover them)

1. **Chart forms.** Monthly flows are columns, one series at a time. Comparisons across properties are tables. No stacked categories, donuts or rainbow series. A balance over time (loan balance), when one comes, is a 2px `--chart-1` line.
2. **Sizes.**
   - Plots are 160px tall (128 below sm) on the Overview and 120px (96 below sm) on the property page.
   - Columns are 60% of their slot, capped at 24px.
   - Meters and ranked bars are 4px.
3. **Axis.** The baseline is 1px `--line-strong`, gridlines are 1px `--line`, and tick and month labels are `text-meta` `--fg-3` with compact dollars on ticks only.
4. **Picked month or year.** A `--fill-1` band with a 1px inset `--line-control` edge, the label in `--fg-1`. It reuses the selected segment's edge, so it adds no 2px mark (brand section 5 keeps 2px for focus, the tab underline and the nav notch). Nothing is ever dimmed to show a pick; CapEx picks filter instead.
5. **Running month.** A hollow column (1px `--chart-1` edge) and "MTD". Never dashed, because dashes mean prior period or budget, and never faded, because fades read as dimming.
6. **Square ends** on every chart mark and meter. The radius table covers components, not marks, and the system is rectilinear. `rounded-xs` and `rounded-sm` on bars go, and so does the checklist's `rounded-full`.
7. **Meter fill is `--chart-1`** on a `--fill-1` track, including checklist progress, which is `--act` today. This widens `--chart-1`'s job from "current period, actuals" to "a measured amount". `--act` stays with controls.
8. **Comparisons are words** in `--fg-3`, with the basis stated once in `SourceLine`.
9. **Expense stops using `--chart-ref`.** That token keeps its one job, prior period or budget.
10. **Negatives** hang below the baseline in the series color (columns), or show no bar with a true-minus amount (ranked bars). Never an outline, never red.
11. **Marks move, lists swap.** When a chart's metric switches, its columns spring to their new heights over `--dur-base` `--ease-spring`. Lists and tables swap at once (`--dur-0`), like tabs. Brand section 7 names no duration for a chart change.
12. **Breakdown triggers** keep today's dotted `--line-strong` underline on CapEx figures. It's lighter than `TextLink`'s solid underline, which would underline every figure in the matrix.

## 3. Design choices

Four real choices. Each has a recommendation; the rest of this spec assumes the recommended option.

Key for the previews:

| Mark | Meaning |
|---|---|
| `█` | A column in `--chart-1` |
| `▒` | A second series (expense in options B and C) |
| `▯` | The hollow running month |
| `░` | The picked slot: a `--fill-1` band with a 1px `--line-control` edge |
| `┈` | A gridline |
| `─` | The baseline |
| `\|[NOI] Income  Expense\|` | A segmented control with NOI pressed |

### D1. What the month chart plots

FINANCIALS-013 asked for income over expense with NOI as a line or dot. Brand section 4 allows one series in color plus a dashed reference, so B and C each need a section 4 amendment. A is the option that fits the guidelines as written.

**A. One metric at a time, NOI by default (recommended).**

Desktop 1280, the left half of the Overview grid:
```
By month                               |[NOI] Income  Expense|
NOI · Sep 2026
$4,210
Income $12,400 · Expense $8,190
$5k
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
                                ██        ██       ░██░
            ██   ██        ██   ██        ██   ██  ░██░
            ██   ██        ██   ██        ██   ██  ░██░  ▯▯
────────────────────────────────────────────────────────────
                                     ██            ░  ░
 Nov  Dec  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct
 2025      2026                                         MTD
```
Tablet 768, full width, touch (a tap picks, a drag scrubs, no hover band):
```
By month                                       |[NOI] Income  Expense|
NOI · Sep 2026
$4,210
Income $12,400 · Expense $8,190
$5k
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
                                      ██          ██         ░██░
              ██    ██          ██    ██          ██    ██   ░██░
              ██    ██          ██    ██          ██    ██   ░██░   ▯▯
────────────────────────────────────────────────────────────────────────
                                            ██               ░  ░
  Nov   Dec   Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct
  2025        2026                                                  MTD
```
Phone 320, initials, same 12 months:
```
By month          |[NOI] In  Out|
NOI · Sep 2026
$4,210
In $12,400 · Out $8,190
$5k
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
                   █     █    ░█░
       █  █     █  █     █  █ ░█░
       █  █     █  █     █  █ ░█░ ▯
────────────────────────────────────
                      █       ░ ░
 N  D  J  F  M  A  M  J  J  A  S  O
                                 MTD
```
- **Why.** It is brand section 4's rule as written: one series in color, with room for the dashed reference later. It reaches 320 with no second design, and expense stops borrowing `--chart-ref`. NOI answers the first question: which months made money. Vercel, Dub and Mercury iOS switch the metric the same way.
- **Cost.** Income and expense are never drawn side by side, which is what FINANCIALS-013 asked for. The readout always prints both for the picked month.

**B. Income and expense as a pair per month (needs a section 4 amendment).**

Desktop 1280:
```
Monthly income vs expense
Sep 2026
█ Income $12,400   ▒ Expense $8,190   NOI $4,210
$15k
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
           █▒   █▒        █▒   █▒   █▒   █▒   █    ░█▒░
           █▒   █▒        █▒   █▒   █▒   █▒   █▒   ░█▒░ ▯▯
────────────────────────────────────────────────────────────
 Nov  Dec  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct
```
Tablet 768: the same, full width, with 16px bars. Phone 320: 7px bars with a 2px gap.
```
Sep 2026
█ In $12,400  ▒ Out $8,190  $4,210
       █▒ █▒    █▒ █▒ █▒ █▒ █▒░█▒░▯
────────────────────────────────────
 N  D  J  F  M  A  M  J  J  A  S  O
```
- **For.** It shows the gap between income and expense across the year at a glance, as the review asked.
- **Against.** Expense needs a second series, and the dashed `--chart-ref` outline can't survive a 7px bar. It would take a solid `--line-control` fill, a new job for that token, and section 4 would have to allow two series. Bars fall to 7px at 320.

**C. Mirrored: income above zero, expense below, NOI as a line (needs a section 4 amendment; [Mercury Insights](https://mobbin.com/screens/67a22ab9-8672-4acb-a980-cfda6b7e810d)).**

Desktop 1280:
```
Net $4,210 · In $12,400 · Out $8,190                  Sep 2026
$15k┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
           █    █         █    █    █    █    █    ░█░
           █ ●──█─────────█──●─█─●──█──●─█──●─█─●  ░█●
────────────────────────────────────────────────────────────
           ▒    ▒         ▒    ▒    ▒    ▒    ▒    ░▒░
           ▒              ▒         ▒    ▒         ░▒░
−$15k┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
```
Tablet 768: the same at 688px, with a readout line in place of hover. Phone: it doesn't fit, so it needs a separate one-series design, as Mercury's own iOS app does ([Mercury iOS](https://mobbin.com/screens/f2cff3f5-1af2-44eb-9243-61dfc93ca146)).
```
|[Money in]  Money out|
$12,400 · Sep 2026
    █        █        █       ░█░
 $11,200  $12,100  $9,800  $12,400
‹          Sep 2026          ›
```
- **For.** All three figures in one picture, the closest match to the review.
- **Against.** Two new color rules (two series in one hue, and an `--fg-1` net marker), a taller plot, and a second design for phones. One lumpy month flattens the others, and a net near zero hides behind the baseline.

### D2. How a month's figures are read

**A. A readout above the plot that always shows the picked month; hover previews, click or tap picks, drag scrubs; all 12 months at every width (recommended).** The previews are D1 option A: the three readout lines are this choice.
- **Why.** The same design works for a mouse, a finger and a screen reader, and it adds no fourth floating style (VISUAL-051). The default month's values are always printed (HIG). Nothing sits under the finger (Stripe iOS).
- **Cost.** Exact figures for other months need a hover or a tap. Initials are ambiguous (J J, M M) until the readout names the month.

**B. A floating tooltip with a mouse, a readout line on touch, six months and a stepper on phones.**

Desktop 1280:
```
By month                               |[NOI] Income  Expense|
                                  ┌──────────────────┐
                                  │ Sep 2026         │
                                  │ $4,210 NOI       │
                                  │ $12,400 Income   │
                                  │ $8,190 Expense   │
                                  └────────▽─────────┘
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
            ██   ██        ██   ██        ██   ██  ░██░  ▯▯
────────────────────────────────────────────────────────────
 Nov  Dec  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct
```
Tablet 768:
```
Sep 2026 · NOI $4,210 · Income $12,400 · Expense $8,190
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
              ██    ██          ██    ██    ██    ██   ░██░   ▯▯
────────────────────────────────────────────────────────────────────
  Nov   Dec   Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct
```
Phone 375:
```
By month          |[NOI] In  Out|
Sep 2026 · NOI $4,210
In $12,400 · Out $8,190
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
   ██    ██          ██   ░██░
   ██    ██    ██    ██   ░██░
────────────────────────────────────
  Apr   May   Jun   Jul   Aug   Sep
‹            Sep 2026            ›
```
- **For.** Phone slots reach 43 to 52px, so taps land.
- **Against.** It needs `Tooltip` extended to rich content, three readout designs, and a stepper row. Phones lose half the year.

**C. Values printed under every column, in a window of months, with a stepper ([Mercury iOS](https://mobbin.com/screens/f2cff3f5-1af2-44eb-9243-61dfc93ca146)).**

Desktop 1280:
```
By month                               |[NOI] Income  Expense|
         ██                                     ██
         ██           ██          ██            ██
──────────────────────────────────────────────────────────
       $3,900       $2,800      $4,020        $4,210
        Jun          Jul         Aug           Sep
                     ‹      Sep 2026      ›
```
Tablet 768: six months. Phone 375: four months.
```
   █      █      █     ░█░
 $3,900 $2,800 $4,020 $4,210
  Jun    Jul    Aug    Sep
‹          Sep 2026          ›
```
- **For.** Every visible value is printed, which is strong in sunlight.
- **Against.** The year trend disappears at every size, and a stepper is needed even on desktop. Whole-dollar labels need about 78px a slot, so six-figure months won't fit at 320.

### D3. What picking a month changes

These page sketches shorten the card switches ("Inc Exp", "Cat Acct Payee") to fit. The real labels are in 2.1 and 2.4.

**A. The chart's readout only (recommended).** The strip, Operating expense and By property follow the period row.

Desktop 1280:
```
|Last month [Year to date]|   |[Cash] Accrual|               (↻) Refresh
Jan 1 to Oct 25, 2026 · QuickBooks, cash basis, synced 6h ago
Income        │ Expense       │ NOI           │ NOI after interest
$98,400       │ $61,200       │ $37,200       │ $29,900
┌ By month ──────── |[NOI] Inc Exp| ┐ ┌ Operating expense |[Cat] Acct Payee| ┐
│ NOI · Sep 2026                    │ │ Jan 1 to Oct 25, 2026 · $61,200      │
│ $4,210                            │ │ Repairs              31%   $18,970   │
│  ██  ██   ██  ██  ██ ░██░ ▯▯      │ │ ████████████░░░░░░░░░░░░░░░░░░░░░    │
└───────────────────────────────────┘ └──────────────────────────────────────┘
```
Tablet 768: the same, with the two cards stacked (By month first). Phone 375:
```
[Year to date · Cash ⌄]                    (↻)
Jan 1 to Oct 25, 2026 · synced 6h ago
Income          │ Expense
$98,400         │ $61,200
NOI             │ NOI after interest
$37,200         │ $29,900
┌ By month      |[NOI] In  Out| ┐
│ NOI · Sep 2026                │
```
- **Why.** Each pick costs no server round trip, there's one period for the whole page, and the readout and strip never disagree. Last month is one tap in the period row. Older single months get their full picture in the planned Statement tab (FINANCIALS-I01), which is the grid (Mercury P&L).
- **Cost.** Operating expense and By property can't show March unless March is Last month.

**B. The whole Overview re-scopes to the picked month** (`?period=2026-09`). The period control shows no pressed segment, and Esc returns to Year to date.

Desktop 1280:
```
|Last month  Year to date|   |[Cash] Accrual|               (↻) Refresh
Sep 2026 vs Aug · QuickBooks, cash basis, synced 6h ago
Income        │ Expense       │ NOI           │ NOI after interest
$12,400       │ $8,190        │ $4,210        │ $3,350
Up $310       │ Down $120     │ Up $430       │ Up $430
┌ By month ──────── |[NOI] Inc Exp| ┐ ┌ Operating expense |[Cat] Acct Payee| ┐
│  ██  ██   ██  ██  ██ ░██░ ▯▯      │ │ Sep 2026 · $8,190                    │
```
Tablet 768: the same, stacked. Phone 375: the chip reads "Sep 2026 · Cash", and the strip above the chart becomes the readout.
- **For.** Any month's categories and properties are one tap away (Mercury iOS, Copilot).
- **Against.** A server round trip per pick, and scrubbing can't follow the finger without a separate readout anyway. The page has two ways to set the same thing.

### D4. Portfolio strip and table footer

The review asked to drop the footer (PORTFOLIO-006), but brand section 9 says a footer row counts and sums. The review's strip also had Rent/mo (PORTFOLIO-027); units carry no rent today (only public listings do), so LTV takes that slot until lease data exists.

**A. Keep the footer; the strip carries leverage (recommended).**

Desktop 1280:
```
Value          │ Loan balance   │ Equity         │ LTV
$4,970,000     │ $3,110,000     │ $1,860,000     │ 62.6%
Property                                  Units  Open tasks   Purchase        Value
...
11 properties                                31         137  $2,640,000  $4,970,000
```
Tablet 768: the same; Purchase drops below md, as today. Phone 375:
```
Value            │ Loan balance
$4,970,000       │ $3,110,000
Equity           │ LTV
$1,860,000       │ 62.6%
Property                         Value
...
11 properties               $4,970,000
```
- **Why.** It follows brand section 9. The strip stops repeating Purchase and Open tasks, which the footer sums, so one figure (Value) repeats instead of three. The record page's strip uses the same four facts, so both strips read the same way. Seven-figure values put this strip at `text-figure-m` at every width (2.2).
- **Data.** Equity and LTV count only properties with a value on file, so a missing value can't read as negative equity.

**B. Drop the footer, keeping the same strip.** The previews are the same without the footer row.
- **For.** No figure repeats.
- **Against.** It contradicts brand section 9, and the column sums for Units, Open tasks and Purchase disappear.

## 4. Migration map

### /financials (Overview)

| Instance | Becomes | What changes for the user |
|---|---|---|
| KPI strip: `Strip` plus six `Kpi` (`page.tsx` L141-164) | `FactStrip size="l"` with four facts: Income, Expense, NOI, NOI after interest ("After interest" below 360px). Read left to right they are DATA-I18's equation | Four figures instead of six. Debt interest and Margin move to the By property Portfolio row, already there from sm; on phones they drop with their columns, as today. Bank interest (memo) leaves the Overview (question 2). A comparison line ("Up $310") shows on Last month. Values never clip at 320 or with the sidebar pinned. Figures fade in after Refresh. Not built: opening a figure's QuickBooks lines (DATA-I04), which needs a line view first |
| Bookkeeping strip: `DqStat` x3 (L166-199) | One `Notice` line under the strip, only when a check fails. From sm: "14 lines unclassified · $310 in suspense · Review"; below sm: "2 items need cleanup · Review". Review opens `/financials/settings#cleanup`. The thresholds move to `needsReview()` in `src/lib/quickbooks/data-quality.ts` | Three stacked rows on phones become one line, or nothing. "Not assigned" shows once, in By property. $0 suspense no longer shows |
| "Operating expense by category" `MoneyBars` (L207-219) | `MoneyBars` (2.4) in the right card, titled "Operating expense", with the Category, Account and Payee switch, share, top 7 and "Everything else" | Shares show. Labels stop truncating at 9rem. The list follows the period. The empty sentence names the period |
| "Monthly income vs expense" `IncomeExpenseBars` and `HeadBar` (L221-229) | `MonthBars` (2.1) titled "By month", moved to the left card. `IncomeExpenseBars` and `HeadBar` are deleted | Time reads left to right. It holds 12 months with empty months kept, an MTD running month and a readout, works at 320, and prints |
| By property table (L232-345) | Same table, following the period. The whole row opens the property: `RowCell` moves from `properties/page.tsx` into `src/components/ui.tsx` on this second use. "Debt int." becomes "Interest". "N mo" becomes "Bought Aug 2026", only when the purchase falls inside the period. The footnote stays. Phones keep Property and NOI (FINANCIALS-040): the row now opens the property, whose page carries its full P&L | Rows are one big target. The period is stated once in SourceLine. Not in this spec: LLC grouping (FINANCIALS-I07) and DSCR (FINANCIALS-008, from `loanPaymentMonthly`), which are table work for the Statement tab pass, and per-row sparklines (FINANCIALS-042; its verifier advised against a mark per row, and each property page carries its own chart) |
| `SourceLine` and the basis TextLink (L106-123) | Period row plus SourceLine (2.6) | A period choice, Cash and Accrual as a switch, the running month's last day stated |
| Period comparisons (absent) | The FactStrip `sub` line (2.6) | Last month compares with the month before, in words. Year to date from Jan 2027 |
| Loading (none) | `src/app/(app)/financials/loading.tsx` (new): labels drawn, `--fill-1` figure blocks, the MonthBars skeleton, static | The page holds its shape while QuickBooks data loads |

### /financials/rent-roll

| Instance | Becomes | What changes for the user |
|---|---|---|
| Rent roll table (L71-133) | The grid in 2.7: 12 months with empty ones kept, "Oct MTD", pinned addresses, blank pre-purchase months, an unassigned row, no explainer paragraph. Below sm, a month at a time with the stepper | Addresses stay put while months scroll. A missed month reads apart from not-owned-yet. The total matches the Overview. Phones read one month cleanly |
| `SourceLine` (L35) | Same SourceLine, with the running month's day | The period ends on the last synced day |

### /financials/settings

| Instance | Becomes | What changes for the user |
|---|---|---|
| "QuickBooks cleanup list" (`DqRow`, `ReconSummary`, L148-235) and its `SourceLine` (L151-156) | Kept as the long form, with SourceLine from its new home. It's the Overview Notice's Review target | No longer duplicated on the Overview. Two logic fixes, made directly: expected cash and accrual differences stop being flagged (in `data-quality.ts`), and "this period" on the negative reclass row reads the real span from `periodLabel` |

### /properties (Portfolio)

| Instance | Becomes | What changes for the user |
|---|---|---|
| `FactStrip` (L92-99) | `FactStrip` from `src/components` with Value, Loan balance, Equity and LTV (choice D4) | Leverage at a glance. Purchase and Open tasks stay in the footer only |
| Table footer (L166-182) | Kept (D4) | Sold properties leave every total, strip and header subtitle included. That's a data fix, latent today; the count reads "10 owned" once one sells |
| `PortfolioCapexForecastCard` | 2.5: the year pick filters the matrix rows; the picked year's header turns `--fg-1`. Popover or Sheet breakdowns with property names. Red only for past due. Two columns below sm | Every figure stays readable when a year is picked. Breakdowns can be dismissed, fit the screen and name the property. This year's spend stops reading as late. No sideways scroll on phones. The bars print |
| `ForecastYearBars` | 2.5: Meter, no dimming, sentence names, zero years as text | Full-strength figures, a screen reader hears "2026: $13,000 spend, 3 items", and it prints |

### /properties/[id] (record)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Record `FactStrip` (`page.tsx` L136-144) | Value (key), Loan balance, Equity, LTV. An empty Value is the "Add value" verb, which opens Details. LTV for 765 and 767 depends on question 1. NOI and CapEx due (PROPERTY-012) stay in their own sections below, so the strip holds four | LTV joins the strip. Open tasks leaves; the Tasks section shows its count |
| Loan rail Equity and LTV (`edit-loan.tsx` L53-54) | Dropped from the rail, since the strip now shows both (question 3). Balance stays: it's the editable fact | Each figure shows once on the page |
| `PropertyFinancialsCard` (`financials.tsx`) | `FactStrip` m with Income, Expense, NOI and Margin (2 by 2 on phones). Then SourceLine (Year to date). Then "By month" `MonthBars` at 120px from `data.monthly`, padded with `monthRange` and the purchase month. Then "Expense by category" `MoneyBars` with top 7. Then Recent transactions. "Portfolio" keeps its lucide `ArrowRight`; it isn't a typed glyph today | The property's months are finally charted (FINANCIALS-I15). Margin shows. No clipping at 320. Figures cover a stated period instead of all history. When the property page becomes the hub with tabs (D10 in `docs/asana-migration-plan.md`), the section moves as a whole |
| `CapexForecastCard` (`capex-outlook.tsx`) | 2.5: a pick filters the item list, "2026 · All 5 years", "Past due" only for past due | No unreadable rows. Red means late |
| "3 of 11 systems dated" and `EquipmentStatusText` (`building-capex.tsx`; unit equipment in `edit-units.tsx` L366-387, L490-535) | The count drops placeholder rules (a data fix). A 64px `Meter` sits inline after the text. Monitor and Replace costs show their projected year ("$8,000 in 2032") in both places, so a cost beyond the forecast reads as later, not missing. Merging the three CapEx treatments (PROPERTY-019) belongs to the property page spec | A true count with a glanceable cue |

### Home

| Instance | Becomes | What changes for the user |
|---|---|---|
| Summary line (`page.tsx` L33, `summary.ts`) | No change | None |
| Needs you CapEx row (`needs-you.ts` L103-119) | The amount keeps the lead of the subline, where nothing cuts it. Under a 360px list the "across 4 properties" clause drops instead of truncating (brand section 5: secondary clauses drop rather than wrap). When anything is past due, a "$4,000 past due" clause in `--danger` follows the amount (uses `overdueTotal`). The mark stays `--warn`, since a partner decides the spend | The row's key figure is never cut off at 320. Red shows only for late items |

### /tasks/[id] and the HG Jobs portal

| Instance | Becomes | What changes for the user |
|---|---|---|
| Staff checklist bar (`checklist.tsx` L24-52) | `Meter` with label: 4px, `--chart-1`, square, springing on each tick, `aria-valuetext` "2 of 5 done". At 5 of 5 the count becomes lucide `Check` plus "All done" in `--ok`, same weight | Visible in sunlight. A finished checklist says so |
| Portal `JobChecklist` count (`job-details.tsx` L95-140) | The same `Meter` under the heading, and the same "All done" | Contractors see the same progress as staff. Native checkboxes (BPORTAL-016) belong to the forms spec |
| Upload `ProgressRing` (`media-uploader.tsx`) | Owned by the uploads spec. `Meter` is available if it wants a linear bar | None here |

### Public site and cross-cutting

| Instance | Becomes | What changes for the user |
|---|---|---|
| Rentals eyebrow count, rent and facts line | No change | None |
| Chart tokens, print and reduced motion (`globals.css`) | 2.8: the light reset in print, `[data-chart]` exact color, no new tokens. Reduced motion is already covered | Charts print legibly from either theme |
| Deals list figures (absent) | Not in this spec. Brand section 9's footer rule already covers a deals footer (DEALS-I09) | None here |

### Review findings this spec leaves open, with why

- PORTFOLIO-I05 (strip per segment): Portfolio has no segment filter today.
- PORTFOLIO-I06 (rehab months against plan): no rehab plan data; `Meter` and the budget tick are ready for it.
- PORTFOLIO-I10 (equity change): its verifier advised against a delta line.

## 5. Layout changes Connor approves with this spec

D1 to D4 are the big choices. These smaller moves are also layout changes (CLAUDE.md: ask first), listed so approving the spec approves them by name:
1. Overview: the period row above SourceLine, and the two cards swapping sides (By month left).
2. Overview: the bookkeeping strip becoming one Notice line.
3. MoneyBars: one row layout at every size, and the control under the title in a narrow card.
4. Rent roll: the pinned first column, the explainer removed, and the phone month stepper.
5. Record page: Open tasks leaving the strip, and Equity and LTV leaving the Loan rail.
6. Building CapEx: the 64px meter after "3 of 11 systems dated".
7. Checklists: the meter under the portal checklist heading.

## 6. Reuse check

**Reused as is.**
- `Card`, `CardHeader`, `Section`, `Table`, `Th`, `Td`, `TableFrame`, `TextLink`, `textLinkClass`, `pickerChip`, `Button` (ghost icon), `EmptyState`.
- `SegmentedControl` (metric, period, basis and breakdown switches; `value: null` already supported).
- `Popover`, `Sheet`, `useCoarsePointer`, `Money`, `RefreshButton`.
- `monthRange` and `qbo.historyStart()`, `fmtMonth`, `CATEGORY_LABELS`.
- React Aria `RadioGroup` (in 1.21.1).

**Extended.**
- `FactStrip`, moved to `src/components/fact-strip.tsx`: `size="l"`, `sub`, the strip-wide container step, `empty`, the 120ms fade. It absorbs `Strip`, `Kpi` and `DqStat`.
- `MoneyBars`, moved to `src/components/money-bars.tsx`: share, top 7 and "Everything else", one layout, `Meter` inside, negatives without a bar.
- `ForecastYearBars` and both CapEx cards: `Meter`, no dimming, filtering picks, sentence names, the `overdue` fix and `overdueTotal`, Popover or Sheet breakdowns.
- `SourceLine`, `WarnMark` and `Notice`, moved to `src/components/source-line.tsx`: the comparison basis and the `through` day.
- `period.ts` (`fmtMonth`, `periodLabel`, `periodOf`), moved to `src/lib/quickbooks/period.ts` beside `months.ts`; `periodLabel` takes the `through` option.
- `grandTotalRow`, moved to `src/components/ui.tsx`; the CapEx cards' copy, `grandTotalCell`, folds into it (the duplicate `docs/components.md` lists).
- `RowCell`, moved from `properties/page.tsx` into `src/components/ui.tsx` on its second use.
- `src/lib/quickbooks/queries.ts`:
  - `getFinancialsOverview({ basis, period })` scopes every figure to `from` and `to`.
  - A trailing 12-month series built with `monthRange`.
  - Expense grouped by category, account or payee.
  - Prior-span figures for the comparison.
  - The rent roll with 12 months and the unassigned row.
  - `getPropertyFinancials` with the padded months and purchase month.
- `src/lib/quickbooks/data-quality.ts`: `needsReview()`.
- `src/lib/property-types.ts`: the `overdue` flag fix, `overdueTotal`, and the placeholder-rule fix in the systems-dated count.
- `src/app/globals.css`: the print block.

**New.**
- `src/components/month-bars.tsx` **MonthBars**. References are in 2.1 (Apple Health, Stripe iOS, Vercel, Mercury, Strava, Copilot, Revolut Business, Apple HIG Charts).
- `src/components/meter.tsx` **Meter**. References are in 2.3 (Material progress indicator, Mercury Books, Square).
- `src/app/(app)/financials/rent-roll/month-stepper.tsx` **MonthStepper**, feature-local with one use, so no inventory row. References: [Mercury iOS](https://mobbin.com/screens/4de25abd-3405-4777-8d93-9ad39f0ad5c6), [Mercury web](https://mobbin.com/screens/77963885-5965-4f86-81f8-32dbffe67dc9), [Splitwise](https://mobbin.com/screens/f77b2738-8716-4219-932f-3e9080cbbd2c).
- `src/app/(app)/financials/loading.tsx`. References: brand section 7 skeleton rule, [Mercury loading](https://mobbin.com/screens/45195749-04f0-4ab5-95ee-7c909102992f), [Square skeleton](https://mobbin.com/screens/09371ef3-f0d0-4fc9-8ab1-607ab3d0e4ab).

**Retired.** `IncomeExpenseBars`, `HeadBar`, `Strip`, `Kpi`, `DqStat`, `PartialLabel` (replaced by "Bought Aug 2026"), `grandTotalCell`, the fixed CapEx tip panel, and the "Show accrual basis" link.

**`docs/components.md` in the same commit.**
- Where things live: the Financials row drops `Kpi`, `Strip`, `IncomeExpenseBars`, `SourceLine`, `WarnMark`, `Notice`, `PartialLabel`, `grandTotalRow` and `period.ts`, which have new homes.
- Replace the "Money figure tile" (`Kpi`) row with FactStrip, and point the "Record fact strip" row at `src/components/fact-strip.tsx`.
- Rewrite "Horizontal bars" to point at MoneyBars, ForecastYearBars and Meter, and add a "Monthly chart" row for MonthBars.
- Point "Data source and freshness" and "Notice above figures" at `src/components/source-line.tsx`, and add WarnMark there.
- Update "Grand total rule" in the duplicates table to resolved, and note RowCell under Table.
- Replace the "Loading state" gap line: the Financials skeleton is the first, and its pattern is the one to copy.

## 7. Open questions for Connor

Besides picking D1 to D4, three questions block building.

1. **Where is the shared 765 and 767 loan recorded: on one record, on both, or split?** This decides LTV on both records and the Portfolio's Loan balance and LTV. Recommendation: the balance lives on one record, and both records show LTV against the two values combined, with "Shared with 767 Prospect Ave" under the figure.
2. **Can Bank interest (memo) leave the Overview strip?** It's usually $0 and isn't part of NOI. Recommendation: yes. It stays in QuickBooks and gets a line on the planned Statement tab.
3. **Can the Loan rail drop Equity and LTV once the record strip shows them?** Recommendation: yes. They're derived, so the rail has nothing to edit there, and each figure then shows once.
