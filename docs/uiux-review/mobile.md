# Lens: phone and tablet experience on every route

Part of the [UI/UX review](README.md). 26 findings: 0 critical, 6 high, 11 medium, 9 low.

## How it should work

The phone becomes a chosen subset of HG, not a smaller desktop. Stripe Dashboard and Brex keep a few jobs on the phone and leave the rest to the desk. HG's phone jobs are: see what needs me, work Today, look up a property while standing in it, capture photos and punch-list items, and approve contractor work. Configuration (QuickBooks, CapEx rules, the move-in form) stays readable but is changed on a computer, which Jobber says in one plain line (https://mobbin.com/screens/7f8a7d6c-bfcb-4347-abe3-b0a9b26603d1).

Shell. The approved labeled bottom bar carries Home, Tasks, Properties, Deals and Menu, with search as its own button, the way Linear Mobile separates it (https://mobbin.com/screens/2d1fdc3c-3758-46bb-88e1-5cfd39ce4148). Menu is a grouped list like Airbnb's (https://mobbin.com/screens/ec965d5f-a216-49db-b44b-7ee988a9d7d7): Financials, Contractors, Settings, then Appearance and Sign out. Lists get a large title; records get a back chevron and the record name. Search opens full screen on recent records, with scope tabs and counts as in Shopify (https://mobbin.com/screens/83a79099-6b71-454f-817e-a701eb23811e).

Lists. At phone and tablet portrait widths every list is two-line rows: title and figure on line one, property, date and a status word on line two, like Shopify orders (https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a). The page scrolls, not a box. Filters live in one sheet that ends in See results and leaves removable chips behind (Mercury, https://mobbin.com/screens/aafea5a6-f4ee-47c4-9a83-4f56701c18e8). Sort and grouping share one Display sheet (Linear, https://mobbin.com/screens/a8d2df88-10dc-4ac7-8cfb-4011f0082501). Task rows start with a check circle, so a walk-through costs one tap per item.

Records. A status dot and word sit above the title, the next step is the one full-width button, and rarer actions wait behind a ... sheet with the destructive one last, all from Jobber (https://mobbin.com/screens/d1f48426-fe89-43ab-bacf-619dcdee2ba0). Tapping status shows the path so far and who acts next, as Brex does (https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811). A property opens on the driveway essentials: Directions, the lockbox code to copy, open tasks and Add photos. Every record has Share, because the installed app has no address bar.

Capture. Create happens in a sheet with chips docked above the keyboard (Linear, https://mobbin.com/screens/be8b3b59-8285-4c7e-835c-b561f683c565), stays open for the next punch-list item, and confirms with a short toast. Photos start with the camera (Airbnb, https://mobbin.com/screens/fcda60ea-e958-46fc-8db9-09ec2db05879).

Feedback. Reversible changes end in an Undo toast above the bar (Linear, https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3); deletions ask in a bottom card that names the item. One obvious action per screen, nothing behind hover, and deliberately less than the desk.

<details><summary>What the reviewer covered</summary>

Server on :3200 was up; every shot is from the live production build, signed in as Connor.

Signed-in routes in WebKit (iPhone Safari) at mobile 375x667: /, /deals, /deals/[id] (cmtg25yd8002cjphs49ovlvob), /deals/new, /properties, /properties/[id] (767 Prospect, all sections scrolled; 647 Prospect in edit mode), /properties/new, /financials, /financials/rent-roll, /financials/settings, /tasks, /tasks/[id] (cmtg25z7s048mjphsikewzpy1), /tasks/new, /contractors, /contractors/[id] (cmtg25y9x000djphsbqty81fr), /settings, /settings/storage, /settings/move-in-form.
- Narrow 320x568 WebKit: /, /deals, /tasks, /properties/[id], /financials, /contractors/[id], /tasks/[id], /settings/move-in-form.
- Tablet 768x1024 touch in Chromium: /, /deals, /deals/[id], /properties, /properties/[id], /financials, /tasks, /tasks/[id], /contractors, /contractors/[id], /settings. Also /tasks and /properties/[id] in WebKit at 768.
- Dark mode in WebKit at 375: home, property, drawer.
- Desktop 1280 WebKit: home, to see the collapsed rail.

Public routes, signed out, in WebKit at 375 and 320: /welcome, /rentals, /residents, /residents/moving-in, /login.

States opened:
- Nav drawer, open and closed, light and dark.
- Global search with typed results.
- Deals "All statuses" popover.
- Tasks: tapping a title on tablet.
- Property Rentals and Units & access edit modes, including Remove unit.
- Settings "Reset to defaults" confirm dialog, with an Esc test.
- Move-in report: rating pick and empty Submit (validation).
- Deal price cell overflow, measured at tablet and desktop.

I ran a per-page probe for nested scroll boxes, sticky and fixed elements, tap targets under 44px and inputs under 16px. I also checked input attributes (type, inputmode, autocomplete), the head meta tags and the drawer's inert state.

Could not reach or emulate:
- The iOS on-screen keyboard. The headless browser has none, so keyboard-over-form findings come from code.
- iPad landscape with touch. The helper has no 1024x768 touch preset, so rail behavior on touch comes from app-shell.tsx.
- A public listing with more than one photo. The rentals carousel finding comes from code.
- The contractor portal, which is not built yet.

No sideways page scroll and no input under 16px on touch showed up on any route.

Mobbin: about 18 searches, iOS and web. Ramp is not on Mobbin, so I used Stripe Dashboard iOS, Mercury, Linear Mobile, Jobber and Airbnb host. Mobbin returned this notice, quoted word for word:

---

**Your Mobbin AI usage is high this month**

Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect. [View usage and plan options](https://mobbin.com/settings/billing-and-usage)

</details>

## Findings

### MOBILE-008

**Phone search should be a full-screen sheet with grouped two-line results**

High · Design change · effort M · `Global search on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** At 320 the results dropdown is 146px wide (201px at 375). After the 64px type label (PROPERTY, DEAL, TASK), each result keeps about four characters ('647 P…', '99 Pr…', 'Showi…'), so you can tell the type but not which address or task it is. The input is type=text with no enterkeyhint and no clear button, and it closes only on a document mousedown.
- **Why:** Search is the fastest way around 675 deals and 2,086 tasks from a driveway, and today its results are unreadable.
- **Change:** The phone search icon (MOBILE-007) opens a full-screen sheet: an auto-focused input of type=search with enterkeyhint=search and a Cancel button. Results are grouped under Properties, Deals, Tasks and Contractors, each a two-line row (name; subline with status or property). Show recent searches when empty. Esc or Cancel closes it.
- **Desktop, tablet, phone:** Desktop: current header field, dropdown at least 420px wide with two-line rows. Tablet: header field, dropdown at least 360px. Phone: full-screen sheet.
- **Reuse:** GlobalSearch and /api/search; new sheet (React Aria Modal, approved).
- **References:** 
  - [Shopify](https://mobbin.com/screens/83a79099-6b71-454f-817e-a701eb23811e): Full-screen search with an X, scope tabs with counts (All 19, Navigation 7, Settings 5) and mixed two-line results that keep status chips and amounts.
  - [Jobber](https://mobbin.com/screens/46b551e5-d5c6-4efc-8207-c57159c28652): Before you type, search shows Recently active records with a type icon and a status word at the right, so the sheet is useful at zero characters.
  - [Mercury](https://mobbin.com/screens/a7432ddf-83b9-4ca1-b451-1704f18afe41): Results keep the list's date headers and right-aligned amounts, so a search result reads like the list it came from.
  - [Google](https://mobbin.com/screens/41a315c9-a751-4e06-b63a-c446d9d5b054): Full-screen search with results grouped by type under small section labels
  - [LinkedIn](https://mobbin.com/screens/0af69829-c83d-4fcd-a42b-6038cdb6b57c): Type chips and grouped sections with 'Show all' per group
  - [Linear Mobile](https://mobbin.com/screens/652dac8a-d883-4034-8811-0956e4c0ef38): Full-screen search with the field docked at the bottom in thumb reach and a small type eyebrow over each result.
  - [Linear Mobile](https://mobbin.com/screens/ce539bef-e6ae-4c4e-9656-840a33df6ec2): Scope menu (All, Issues, Projects, Documents) instead of a chip row on a narrow screen.
  - [ClickUp](https://mobbin.com/screens/b86be07c-0f16-46c4-bd1b-2d46b8a83390): Full-screen search with Cancel, type tabs, filter chips and Recents with an 'In …' context line
  - [Stripe Dashboard](https://mobbin.com/screens/e345975a-5113-4ffd-8b71-1abc1481379e): Search as a first-class bottom tab on iOS
  - [N26](https://mobbin.com/screens/c4c4ed50-dda0-4bb5-94fe-25fbdb685a45): Search as an icon in the phone header beside notifications and avatar
  - [Linear Mobile](https://mobbin.com/screens/e9b4ccc3-e76f-4594-acc4-1a43828e8e39): Full-screen Search with Recently viewed above the keyboard and a clear close button.
  - [Jobber](https://mobbin.com/screens/8a9ce411-4444-450e-96f7-b3fc5eef9654): Phone search: full width, scope chips (Clients, Requests, Jobs), two-line rows with status on the right
  - [Craft](https://mobbin.com/screens/bafd6326-3a72-414a-9935-9b8658881ab4): Quick Open sheet with grouped results and a subtitle line
  - [Slopes](https://mobbin.com/screens/f141a768-2c84-40ac-970f-8fa507d16128): Full-screen search sheet with two-line results
- **Code:** `probe: input type=text, enterKeyHint '', width 146 (320) / 201 (375)`, `src/components/global-search.tsx:29-66`, `src/components/global-search.tsx:48-62`, `src/components/app-shell.tsx:83-88`, `src/components/global-search.tsx:49`, `src/components/global-search.tsx:48-66`, `src/components/app-shell.tsx:86-88`
- **Also found as:** SHELL-005 (App shell, sidebar, top bar, global search and Home), SHELL-V04 (App shell, sidebar, top bar, global search and Home), JOURNEYS-008 (Lens: the core jobs, end to end)
- **Verification:** partly. Each result has a 64px PROPERTY / DEAL / TASK label column, so result types are distinguishable. What breaks is the label itself: at 320 every one is cut to about four characters. The input is type=text with no enterkeyhint, and the menu closes only on mousedown (confirmed in global-search.tsx).

### MOBILE-009

**Filter bars wrap to three rows on phones; collapse to search plus a Filters sheet**

High · Design change · effort M · `/tasks and /deals filter bars on phone` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** /tasks/all at 375 and 320 now has two deliberate rows: search plus All/Open/Done, then All assignees and All properties. At 320 the search squeezes to about 110px ("Filter by ti"). /deals at 375 is unchanged: the address field, then All/TBD/Active/Pass (now SegmentedControl), then "All statuses" on a third row via flex-wrap.
- **Why:** Wrapped controls push content down and break a house rule. Phones should show one quiet row and put the rest in a sheet that reports its result count.
- **Change:** On /tasks/all, collapse Assignee, Property and Done into a Filters sheet (the branch's Sheet component) so search gets the full row. On /deals, do the same with the status segment and the multiselect (deals/filters.tsx:54-61).
- **Desktop, tablet, phone:** Desktop: current one-row bar. Tablet: search, scope segment and a Filters button. Phone: search plus Filters. Owner, property and status selects drop into the sheet.
- **Reuse:** Segmented control in src/app/(app)/deals/filters.tsx (extract as SegmentedControl), StatusMultiSelect content, React Aria Modal.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c8fa1289-60f1-4d40-9f90-c283df569b04): Filters sheet with collapsible sections, a pinned See Results button and Clear Filters (2) under it.
  - [Mercury](https://mobbin.com/screens/01a63485-5164-4ae0-a9cb-de23534442f9): After applying, the filter stays visible as one removable chip in the chip row (Money Out, $1 to $50 with an x).
  - [Shopify](https://mobbin.com/screens/e0a3f3f2-db73-430d-8259-e4b59fa6c843): Search field plus sort and filter icon buttons on one line, filter showing a count badge, status chips scrolling underneath.
  - [Instagram](https://mobbin.com/screens/f3907dff-8e18-4f7c-bc76-d16d8cf36901): Sort & filter sheet as rows with current value on the right and 'View 26 products' as the action
  - [Airwallex](https://mobbin.com/screens/c8a16042-c600-439b-9d23-91dda0ea985a): Status pills grouped by facet with Clear filters and a sticky Cancel/Apply
  - [Mercury](https://mobbin.com/screens/e1b077a6-331f-4632-a1c9-1c205607fa8f): Search field plus one row of scrollable filter chips above the list
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): One row holds the search field, a sort icon and a filter icon. Status views sit below as a single chip row that scrolls sideways, so nothing wraps.
  - [Shopify](https://mobbin.com/screens/ff016813-d7d7-4e02-b27d-4170390b6225): The page title 'Orders' opens a menu of views, so the phone needs no segmented control.
  - [Mercury](https://mobbin.com/screens/a7432ddf-83b9-4ca1-b451-1704f18afe41): Search plus a Views chip in one row.
  - [Attio](https://mobbin.com/screens/a84efb46-b3c6-45c2-a707-edfdf6654ab7): A single "Pipeline" view menu on iOS.
  - [Todoist](https://mobbin.com/screens/a8b34ad5-5892-42c4-b5fe-665fa98a3e89): 'Display: 3' button opens one popover with Layout, Completed tasks toggle, Grouping, Sorting and filters; the count on the button replaces a row of selects.
  - [Linear](https://mobbin.com/screens/c15e23d9-67b4-4a87-af34-117ae648c266): Active filter becomes one removable chip 'Status is In Progress' on a single line.
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): "+ Status", "+ Date" filter pills on one row, with a result count.
  - [Stripe](https://mobbin.com/screens/78430f40-1d9b-45de-8c03-d25b8e33d728): A filter pill opens a small checklist popover with Apply, plus Clear filters.
  - [Jira Cloud](https://mobbin.com/screens/b037f71c-bf63-4d7d-9315-0eae630add1e): Phone: search, then filter chips scrolling sideways, a result count, and a sheet for each filter.
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Transactions filters as one row of compact chips ending in 'More filters'.
  - [Linear](https://mobbin.com/screens/ed670cda-0527-4716-a1a6-0159f12c4f42): One filter button opens a menu of fields (Status, Assignee, Project) instead of a select per field.
  - [Linear Mobile](https://mobbin.com/screens/881d5cef-d07f-4e16-a579-636514afd846): View tabs with filter and display icon buttons on a single row.
  - [Linear Mobile](https://mobbin.com/screens/d94d16a0-e93a-46e0-89a1-84d621b17d19): Grouping, ordering and display options live in a bottom sheet.
  - [Copilot](https://mobbin.com/screens/0a8866fc-d1b9-4ca0-9a1b-985eff471f55): Search field with a single filter icon button on the same row.
  - [Mercury](https://mobbin.com/screens/f0d19b48-c4fa-4fc2-9cdc-bf999b23836e): Phone filters are one row of chips (Views, Methods, Amount and more) that scrolls sideways under the search field and never wraps.
  - [Quo](https://mobbin.com/screens/067b79b5-e76a-4aa2-b885-8bffbbee2aa2): Phone Filters sheet: Open/Done as a checked list, then 'Company: Any >', with Clear all and Done.
  - [Fabric](https://mobbin.com/screens/7ac3ad82-b19c-4c69-ba0e-cc12333c294b): Phone task list with one filter icon beside the search field instead of a row of selects.
- **Code:** `src/app/(app)/deals/filters.tsx:54-61`, `src/app/(app)/tasks/filters.tsx:48-56`, `branch src/app/(app)/tasks/filters.tsx:60-132`, `branch src/app/(app)/deals/filters.tsx:54-61`, `src/app/(app)/deals/filters.tsx:54-82`, `src/app/(app)/tasks/filters.tsx:48-113`, `branch:src/app/(app)/tasks/filters.tsx:57-133`, `src/app/(app)/tasks/filters.tsx:48`, `src/app/(app)/tasks/filters.tsx:56`, `branch src/app/(app)/tasks/filters.tsx:58-62`, `eval control tops: 193 for all at 1280; 201 for all at 768; 193 and 248 at 375 and 320`, `src/app/(app)/deals/filters.tsx:61`, `branch src/app/(app)/tasks/filters.tsx:57-131`, `branch src/app/(app)/deals/filters.tsx:62-67`, `src/app/(app)/tasks/filters.tsx:74-110`, `branch: src/app/(app)/tasks/filters.tsx:57-132`, `src/app/(app)/tasks/filters.tsx:57-133`, `eval /tasks/all mobile: filter block 102px; INPUT:193:16:167, segmented:190:191, SELECTs at y=248`, `eval narrow: INPUT width 112`
- **Also found as:** DEALS-026 (Deals pipeline, new deal and deal detail), TASKS-017 (Tasks list, new task and task detail), TASKS-V08 (Tasks list, new task and task detail), VISUAL-V03 (Lens: visual design system across every screen), IA-V03 (Lens: information architecture and global SaaS patterns), FEEL-V04 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. The rule break is confirmed, but the size is overstated. At 375 the filter rows take 129px (y 142 to 271) before the table, not about 220px. At 320 the bar wraps to four rows, and the table header starts near y 357 of 568. At 768 the tasks bar also wraps, to two rows. Mercury e1b077a6 checked: a real screen with a search field over one row of scrollable chips.

### MOBILE-010

**Deals on phone: two-line rows instead of an 8-column table**

High · Design change · effort M · `/deals on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** A 1,210px-wide table sits in a 341px box. Addresses wrap to two lines with raw text ('256 Auburn Avenue Buffalo , NY 14213'). Status badges are cut ('2 - Medi', '4 - To Sc'). Units, both prices, latest note, next action and updated are off-screen with no scroll cue.
- **Why:** On site you need to know: which house, what stage, what price, what's next. Today the phone shows a wrapped address and half a badge.
- **Change:** Each deal is a row. Line one: short address (shortAddress) with the status chip right-aligned. Line two, muted: '4 units · $425k ask · run numbers'. Tap opens the deal. Sort and status filters live in the Filters sheet (MOBILE-009).
- **Desktop, tablet, phone:** Desktop: current table. Tablet: table minus Latest note and Updated. Phone: rows; Latest note and Updated drop.
- **Reuse:** Badge (status tones), shortAddress, fmtMoney compact; DealRowEditable stays desktop-only.
- **References:** 
  - [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9): Name, muted subline, status chip and amount in one compact row
  - [Linear Mobile](https://mobbin.com/screens/30ebc468-06c8-46dd-9503-e197e89a1e5c): Grouped list by status, one line per item, details on tap
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): Phone orders are two-line rows: the bold name with the amount right-aligned, then a muted meta line with status chips. Rows sit under date headers.
  - [Linear Mobile](https://mobbin.com/screens/0b396f0b-077e-41e9-896b-704c4fab59ee): The phone list is grouped under status headers, each with a + to add to that group, and matches the desktop grouping.
  - [Mercury](https://mobbin.com/screens/a7432ddf-83b9-4ca1-b451-1704f18afe41): Two-line rows with the amount right-aligned, under search and filter chips.
  - [Public](https://mobbin.com/screens/9dcede7f-3a58-47b2-a910-0a342f0e38e4): Title and date on the left, amount on the right, chevron to open.
- **Code:** `probe: 'DIV.w-full.max-w-full overflow-auto sw=1210 cw=341'`, `src/app/(app)/deals/page.tsx:108-140`
- **Also found as:** DEALS-010 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. Reproduced in light and dark: sw=1210 in cw=341, raw addresses ('256 Auburn Avenue Buffalo , NY 14213'), and badges cut to '2 - Medi' and '4 - To Sc'. Mercury 628c4fb3 checked: a good fit.

### MOBILE-013

**Task page on phone: chips under the title and a sticky bottom bar**

High · Design change · effort M · `/tasks/[id] on phone` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. This matches the approved D31 task page. At 375, /tasks/cmtg25yuf01zsjphs0xu5d2fl shows the status control ("Done") beside Back, then the title, then a sideways chip row (Assignee, Due, Property, Repeats). Due uses DueDatePicker, red when overdue. Notes, Checklist and Activity follow, and the composer (camera plus comment) is sticky at the bottom with a safe-area inset. Mark done lives in the status control, not a bottom-bar button, per the spec's "composer sticks to the bottom". Removal not upheld: Mostly fixed, with one close variant still there. Fixed: a status chip at the top (20px badge, extended to a 44px hit area on touch); a sideways chip row (Assignee, Due, Property, Repeats); and the overdue Due chip in red as 'Apr 19, 2025' on cmtg25z7s048mjphsikewzpy1. Still there: the 'sticky bottom bar' only pins on long pages. On short tasks, which is most of them, the composer sits mid-screen with empty gray below it. Measured in WebKit at 375x667: on cmtg25z7s048mjphsikewzpy1 the composer runs from 499 to 558, leaving 109px below it. The same happens on cmtg25yuf01zsjphs0xu5d2fl (499-558), cmtg25yzx02wmjphswsl6zgq5 (522-581) and cmtg25z0g02zsjphsayxnyw1y (523-582). It only reaches the bottom on longer pages (608-667 on cmtg25yzl02ukjphs9xko5x42 and cmtg25yza02ssjphsua8518gz). The rechecker's own evidence, recheck-09/task--mobile-light.png, shows the composer floating the same way. Cause: composer.tsx:191 uses max-md:sticky bottom-0 at the end of the content flow, so on a short page it sits at the end of the content instead of at the bottom of the screen. The spec says 'the composer sticks to the bottom'. Suggest narrowing the finding to pinning the composer on short pages too (fixed to the viewport, or a min-h-dvh flex column with mt-auto). The finding's one-tap primary 'Mark done' in the bar differs from approved D31, where marking done goes through the status chip and its menu (two taps). Move that to conflicts_with as a question for Connor rather than counting it as a defect.
- **Today:** 'Mark complete' is a 36px secondary button at the top of the card. Assignee, Due date and Project sit in a label/value box. The due date is a native '04 / 19 / 2025' with no overdue signal, though it is 18 months past. There is no status. Description and Attachments follow; nothing is pinned to the bottom.
- **Why:** On a phone the next step should stay under your thumb, and the state (overdue, who, where) should read in one line. The approved spec already says phone gets chips and a composer that sticks to the bottom.
- **Change:** Layout: title, then one sideways-scrolling chip row (Status, Assignee, Due in red as 'Apr 19, 2025', Property), then notes, checklist, photos and activity. A sticky bottom bar holds the composer (camera and text) and a primary 'Mark done'.
- **Desktop, tablet, phone:** Desktop: approved side rail. Tablet: chip row under the title. Phone: chips plus sticky bar; Created by and Repeats move into an overflow 'Details' sheet.
- **Reuse:** Settled D31 task page; TaskCheckbox; Badge tones; fmtDay and dueLabel.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/4d807c4c-b0a5-4e87-86bd-154fb51d3f32): Property chips (status, assignee, project, date) directly under the title, comment bar pinned at the bottom
  - [Asana](https://mobbin.com/screens/2b1d77ef-b582-4103-b341-297602349d17): Mark complete in the top bar, composer fixed at the bottom
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): Address with Directions and a full-width 'Complete Task' primary on a field-work task
- **Code:** `branch src/app/(app)/tasks/[id]/view.tsx:58-148`, `branch src/app/(app)/tasks/[id]/fields.tsx:73-172`, `branch src/app/(app)/tasks/[id]/composer.tsx:191`
- **Verification:** confirmed. Reproduced: a 36px secondary 'Mark complete', a label/value box, and a native '04 / 19 / 2025' with no overdue color. The /tasks list labels the same date 'yesterday' (MOBILE-V01). Linear https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8 is confirmed and fits exactly (chip row under the title, Comment bar pinned at the bottom). The cited 4d807c4c wasn't returned but is plausible.

### MOBILE-014

**Property hub on phone: scrollable tabs and an on-site first screen**

High · Design change · effort L · `/properties/[id] on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** One 3,836px scroll at 375 with 11 cards. The first card is 'No QuickBooks class is mapped to this property yet'. Lockbox codes show inline in each unit header in the fourth card, after Financials, the 5-year CapEx forecast and Building CapEx. The address title is truncated, and the Tasks card is a 420px inner scroll.
- **Why:** On site you need the address, the lockbox and what's open there. Financial mapping and insurance can wait a tab away. D10 already approves the hub with tabs.
- **Change:** Under the title, the approved tabs as a horizontally scrolling underline row: Overview, Tasks, Units, Documents, Financials, CapEx, Activity. On phone, Overview leads with: short address (tap opens Maps), status and units, per-unit lockbox codes with tap-to-copy, the next 3 open tasks, and an action row (Add task, Add photo). The QuickBooks mapping prompt moves to the Financials tab as a one-line empty state.
- **Desktop, tablet, phone:** Desktop: tabs plus a two-column body with a facts rail. Tablet: tabs, single column. Phone: scrollable tabs with a fade on the right edge; Overview as above; Loan and Insurance live under Financials.
- **Reuse:** TopTabs (src/components/nav.tsx) with horizontal scroll on overflow; settled D10 hub.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/bb3a9535-0ef0-4dc6-b2de-bbf5113ebc15): Stay page opens on a real photo with one status pill in its corner, a two-column check-in card, then icon rows with sublabels (Getting there with the address, House manual).
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): Address, a full-width Directions button and the next-step primary button fill the first screen.
  - [Shopify](https://mobbin.com/screens/b1bce388-5468-4881-9e33-827b4581cb3b): Copy icon beside the address and a short toast confirming the copy; the same treatment fits lockbox codes.
  - [Realtor.com](https://mobbin.com/screens/84be59cc-49db-45f8-88ba-99661e45003b): Home details: scrollable underline tabs cut at the edge to show there's more, label/value rows, sticky primary
  - [Mindtrip](https://mobbin.com/screens/ffb04631-4030-4d88-bcf5-25153bd2bcb3): Overview, Guides, Amenities, Reviews tabs scrolling under the header
- **Code:** `src/app/(app)/properties/[id]/page.tsx:80-178`
- **Verification:** partly. Lockbox codes aren't behind accordions. Each unit header shows the code inline ('🔒 7676'), and the accordions hold only Utilities and Equipment. Units & access is the fourth card, after Financials, the CapEx forecast and Building CapEx. Everything else reproduced: a 3,836px page, the QuickBooks nag first, the truncated title and a 420px inner Tasks scroll. This builds on settled D10. Jobber fd3c5053 (Directions button under the address) is confirmed and fits.

### MOBILE-015

**Edit property sections in a sheet with a sticky Save on phones**

High · Design change · effort L · `/properties/[id] section edit modes on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** Edit expands the card in place. Units & access edit at 647 Prospect renders 66 fields, and the card header crams '+ Add unit', 'Save' and 'Cancel', which scroll away as you work down. In each unit block, the 'Lockbox' label floats to the right of the unit name while its value wraps below next to 'Remove unit'. Rentals edit is the same: '+ Add listing', 'Save' and 'Cancel' sit in a 52px header.
- **Why:** Long inline edits on a phone lose the Save button and the page context. Sheets with a pinned Save are the standard (approved React Aria sheets).
- **Change:** On touch below md, 'Edit' opens a full-height sheet titled 'Edit units' with Cancel left and Save right in its header, plus a sticky bottom Save when the form is longer than a screen. Fields are one column with labels above; 'Add unit' sits at the end of the list. Desktop keeps inline edit.
- **Desktop, tablet, phone:** Desktop: inline edit as today. Tablet: large-detent sheet. Phone: full-screen sheet with a sticky Save.
- **Reuse:** SectionCard (src/components/ui.tsx:29-60) gains a sheet edit mode; grow ConfirmDialog into the Dialog/Sheet shell listed in Known gaps; React Aria Modal.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/fcaa5b1e-cf08-46e0-a083-8d0e8fecbb8a): Sheet form with back/close in the header and a full-width sticky 'Create link'
  - [Airbnb](https://mobbin.com/screens/f8e40672-eb5e-44fe-bef9-827075ba9221): Long host form with 'Save & exit' up top and a sticky Back / Next bar
- **Code:** `probe: 66 visible inputs in edit mode`, `src/app/(app)/properties/[id]/edit-units.tsx:312`
- **Verification:** confirmed. Reproduced on 647 Prospect: 57 visible fields in Units edit (66 probably counted hidden inputs). '+ Add unit', 'Save' and 'Cancel' sit in the card header, and the 'Lockbox' label floats beside the unit name while its value wraps under it next to 'Remove unit'. The Loan edit form is also a fixed grid-cols-2 at phone width (edit-loan.tsx:92), so the one-column rule should cover it too.

### MOBILE-007

**Phone top bar: show where you are, not the wordmark**

Medium · Design change · effort M · `App header on phone, every route` · The phone is a chosen subset, and touch has no hover

- **Today:** Every phone page shows the 'HG Capital OS' wordmark beside a header search squeezed to 201px at 375 and 146px at 320 (placeholder cut to 'Search addresse'). Detail pages use a 16px-tall BackLink, '+ New task' wraps under the title at 320, and the property address title truncates. Page titles scroll with the content, which is normal on the web and not a defect on its own.
- **Why:** On a phone the top bar is the only constant context. Linear, GitHub and Mercury put the screen's title and one action there.
- **Change:** A 52px phone bar. On list pages: the page title left, then a search icon and a '+' icon right (+ creates in that section). On detail pages: a 44px back chevron (same return-to-filtered-list logic as BackLink), the record's short name once the large title scrolls off, and an overflow menu. No wordmark on phone.
- **Desktop, tablet, phone:** Desktop and tablet: current header (wordmark, wide search), plus back on detail pages at tablet. Phone: as described. The wordmark and inline search drop.
- **Reuse:** BackLink (src/components/back-link.tsx) logic; PageHeader actions move into the bar on phone.
- **References:** 
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): List pages open with a large left-aligned title and at most two icon actions on the right; no wordmark.
  - [Mercury](https://mobbin.com/screens/6aa8686b-430d-49dd-a4df-6b9fadcba678): Large title Transactions with two quiet round icon buttons above it; the search field sits under the title, not in the bar.
  - [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): Record pages swap the title for a back chevron on the left and edit plus ... on the right.
  - [Linear Mobile](https://mobbin.com/screens/4d807c4c-b0a5-4e87-86bd-154fb51d3f32): Back chevron left, compose and overflow right; the title lives in the content
  - [GitHub](https://mobbin.com/screens/7c050b69-7d11-49e1-b6ee-7c6595e031c6): '+' and search as icon buttons top-right, large section title below
  - [Stripe Dashboard](https://mobbin.com/screens/d8b72d98-48cd-4829-ad08-309ae833dfe4): Phone title bar with one action; search lives in the bottom bar.
  - [Things 3](https://mobbin.com/screens/97952802-d1f3-4324-8a5b-fab1bc02c29e): Title moves into the navigation bar after scrolling.
- **Code:** `src/components/app-shell.tsx:83-88`, `src/components/app-shell.tsx:63-92`
- **Also found as:** VISUAL-045 (Lens: visual design system across every screen), SHELL-I17 (App shell, sidebar, top bar, global search and Home)
- **Verification:** partly. The observations hold, but the real pain is the squeezed search, and MOBILE-008 already covers it. Once the bottom bar (006) and search sheet (008) land, the rest of this is a header re-layout, so medium fits better than high. The '+ New task' wrap at 320 is confirmed in the narrow tasks shot. Linear 4d807c4c wasn't returned in my spot-check. Linear https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8 is confirmed (back chevron left, edit and overflow right).

### MOBILE-019

**Raise touch targets to 44px in the primitives, not per page**

Medium · Fix · effort M · `All app routes on touch` · The phone is a chosen subset, and touch has no hover

- **Today:** Measured on touch:
- Button md 36px, sm 32px; Input and Select 36px; LinkButton 36px.
- Drawer nav rows 36px, hamburger 32px, drawer close 28px, Sign out 16px.
- BackLink about 16px tall; SectionCard 'Edit' 22x16; Financials Cash/Accrual toggle 24px.
- Settings move-in editor checkboxes 12px and remove buttons 14px.
- 125 small targets on the contractor page; 1,583 on /tasks at tablet.
- **Why:** Apple's minimum is 44pt. Small targets make the app feel fiddly next to Stripe or Mercury and cause mis-taps on site.
- **Change:** In ui.tsx, under pointer: coarse: Button md and Input/Select become h-11; Button sm becomes h-10 with a 44px hit area through an inset pseudo-element; text links (BackLink, Edit, View all) get a py-3 -my-3 hit area. Checkboxes and remove buttons get a 44px hit area around the visible 16px mark. Desktop sizes stay compact.
- **Desktop, tablet, phone:** Desktop: unchanged. Tablet and phone: 44px targets with the same visual weight.
- **Reuse:** Button, LinkButton, Input, Select in src/components/ui.tsx; closes the 'Tap targets' Known gap in docs/components.md.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/187975d8-3298-45c2-bb31-933aa892f69a): Full-width 44pt rows and a full-width Share bar; nothing tappable is small
  - [Jobber](https://mobbin.com/screens/d1f48426-fe89-43ab-bacf-619dcdee2ba0): The phone '…' opens a sheet of full-width icon rows (Resend booking confirmation, Create invoice, Close job) with Delete job last in red.
- **Code:** `probe drawer heights '28,0,36,36,36,36,36,36,36,32,16'`, `probe /contractors/[id]: 125 small targets; /tasks tablet: 1583`, `src/components/ui.tsx:78,97,138,160`, `src/components/nav.tsx:102`, `src/components/app-shell.tsx:69,120,178`, `src/components/app-shell.tsx:69,120`, `src/components/theme-toggle.tsx:21`, `src/components/global-search.tsx:46`, `Probe at 375: field 31px, Reset 32px, + Add appliance 16px, name link 38px, move-in trash 14x14`, `src/app/(app)/settings/capex-rules-editor.tsx:29-30`, `branch src/components/ui.tsx:62-66 (TOUCH_HEIGHT) and Button/Input/Select`, `Probe at 375 on :3300 /settings: Reset 118x44, + Add appliance 90x16, cells 31px, tabs 38px`, `Probe at 375 on :3300 /settings/move-in-form: Save 48x44, + Add item 60x16, Remove 14x14, item input 31px`, `Probe at 375 on :3300 /contractors: first name link 52x38`, `branch src/app/(app)/settings/capex-rules-editor.tsx:27-30`, `src/components/ui.tsx:79`, `src/app/(app)/financials/page.tsx:55-62`, `src/app/(app)/properties/[id]/edit-units.tsx:318-323`, `src/app/(app)/properties/[id]/edit-units.tsx:431-436`, `src/app/(app)/properties/[id]/edit-listings.tsx:304-309`
- **Also found as:** SHELL-038 (App shell, sidebar, top bar, global search and Home), ADMIN-044 (Contractors directory, contractor detail and Settings), FINANCIALS-066 (Financials, rent roll and financial settings), PROPERTY-055 (Property detail page (future property hub))
- **Verification:** confirmed. The primitives use h-8 and h-9 (ui.tsx), the drawer heights are as quoted, and the confirm buttons are 32px. Tap targets are already a Known gap in docs/components.md. For dense rows, prefer growing the hit area over growing the visual height, so tables don't swell on touch.

### MOBILE-027

**On phones, confirmations should be bottom action sheets, not a small centered modal**

Medium · Design change · effort S · `Confirmations on phone (e.g. Settings 'Reset to defaults')` · The phone is a chosen subset, and touch has no hover

- **Today:** ConfirmDialog renders a centered card with 32px Cancel and Reset buttons in the bottom-right corner. Pressing Escape left it open.
- **Why:** On a phone the destructive choice should be a full-width, thumb-reachable button with a clear Cancel. One Esc closes one layer (house rule).
- **Change:** Phone: a bottom sheet with a title, one line of body, and full-width 44px 'Reset rules' (red) and 'Cancel'. Desktop: a centered dialog with Esc, focus trap and portal through React Aria.
- **Desktop, tablet, phone:** Desktop and tablet: centered dialog at max-w-sm. Phone: bottom action sheet above the safe area.
- **Reuse:** ConfirmDialog (src/components/confirm-dialog.tsx), grown into the Dialog shell from Known gaps; React Aria Modal.
- **References:** 
  - [Shopify](https://mobbin.com/screens/ea4670aa-8895-4f88-9774-ef93c80b43a5): Bottom card over a dimmed page: title, one-line consequence, then two stacked full-width buttons in thumb reach.
  - [Linear Mobile](https://mobbin.com/screens/5911d6e4-808e-40e9-8fbb-300e7c9c4e9e): Record menu groups neutral actions first and puts Delete issue last in red.
  - [Linear Mobile](https://mobbin.com/screens/cc676be7-dd3c-44ad-a9ad-195ec1f3d6b7): The confirm names the exact item being deleted before the red button.
  - [Craft](https://mobbin.com/screens/6724ed7d-c631-4b7e-a26f-a44f83b6bc12): Bottom sheet of actions with the destructive one in red at the end
  - [Joi](https://mobbin.com/screens/232e633c-a229-47bd-9e95-53acc546fa99): Delete confirm with two equal-width buttons, destructive in red
- **Code:** `probe: buttons 'Cancel:32,Reset:32'; dialog still present after Escape`, `src/components/confirm-dialog.tsx:16-27`
- **Verification:** confirmed. Reproduced on /settings: Cancel and Reset are 32px, and the dialog is still open after Escape. Missing Esc, focus trap and portal are already Known gaps. A centered alert with full-width 44px buttons would also meet Apple HIG, so the bottom sheet is a preference. The must-fix parts are Esc, focus and target size.

### MOBILE-032

**Deal page on phone: pin the note composer to the bottom**

Medium · Design change · effort S · `/deals/[id] on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** The 'Add a note' textarea and its 'Add' button sit side by side at the top of the Activity card, and the 18-entry timeline below scrolls in its own 520px box.
- **Why:** Notes from a showing are the main thing typed on a phone here. A bottom composer keeps the input by the keyboard and the history above it.
- **Change:** Phone: a one-line composer pinned above the bottom bar that grows as you type, with a send button. The timeline flows with the page, newest first, and status-change entries collapse into one muted line each.
- **Desktop, tablet, phone:** Desktop: composer at the top of the Activity card, as today. Tablet: same. Phone: sticky bottom composer.
- **Reuse:** The same composer as the approved task page (D31); deal detail in src/app/(app)/deals/[id]/.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): A floating + Comment pill pinned at the bottom of the record, with the activity log above it.
  - [Asana](https://mobbin.com/screens/2b1d77ef-b582-4103-b341-297602349d17): 'Ask a question or post an update' pinned to the bottom of the task
  - [Linear Mobile](https://mobbin.com/screens/4d807c4c-b0a5-4e87-86bd-154fb51d3f32): Comment field floating at the bottom of the issue
- **Verification:** confirmed. Reproduced: the textarea and Add button sit at the top of the card, and an 18-entry OL scrolls 959px inside a 520px box. A confirmed reference that fits: Linear https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8 (Comment bar pinned at the bottom).

### MOBILE-034

**Tablet navigation: the touch bar at 768 and a labeled rail in landscape**

Medium · Design change · effort M · `App shell on iPad, portrait 768 and landscape 1024+` · The phone is a chosen subset, and touch has no hover

- **Today:** At 768 the iPad gets the phone hamburger and drawer. At 1024 and up (iPad landscape) it gets the desktop 64px icon rail. That rail expands only on mouseenter, its Pin button is pointer-events-none until expanded, and labels exist only as title tooltips, so a touch user sees seven unlabeled icons.
- **Why:** CLAUDE.md says tablet gets the touch layout. A rail with no labels and hover-only expansion fails on touch.
- **Change:** 768 to 1023: the same labeled bottom bar as phone (MOBILE-006). 1024 and up on (hover: none): a 72px rail with small labels under each icon and no hover expansion; the D10 property list opens as an overlay panel from a Properties item.
- **Desktop, tablet, phone:** Desktop: unchanged hover-expand sidebar. Tablet portrait: bottom bar. Tablet landscape: labeled rail. Phone: bottom bar.
- **Reuse:** AppShell and SideNav (src/components/app-shell.tsx, src/components/nav.tsx).
- **Challenges:** D10 names a 'labeled phone bottom bar'. This extends the same bar to tablet portrait and adds a labeled rail for iPad landscape, which D10 doesn't cover.
- **References:** 
  - [Turo](https://mobbin.com/screens/981f11b2-a21e-4427-9aa7-e420343c0935): Narrow host rail with a label under each icon and a badge on More
  - [Hootsuite](https://mobbin.com/screens/155a6fa5-52e6-466e-b3b3-6333eb747dd6): Icon rail with labels that opens a panel for secondary items
- **Code:** `src/components/app-shell.tsx:104-113,134-143`
- **Verification:** confirmed. The code confirms lg:hidden on the hamburger (so the 768 iPad gets the drawer), a mouseenter-driven rail at 1024 and up, a pointer-events-none pin while collapsed, and labels only as title or aria-label. I couldn't test 1024 touch live because the helper has no preset for it. conflicts_with correctly names D10.

### MOBILE-035

**Due date on phones: a quick-pick sheet, then an Undo toast above the bar**

Medium · New capability · effort M · `Due date on task rows, task page and new task (phone)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Built for rows and the task page. In WebKit at 375, tapping a row's due chip on /tasks opens a bottom sheet "Due date" with Today (Fri), Tomorrow (Sat), Monday (Oct 26), Next week (Fri, Oct 30), No date and a month calendar. Reschedules toast with Undo (task-list-context.tsx:69-81), and the task page's Due sets "Due date set to …" with Undo. Still native: the New task form's Due date (mm/dd/yyyy) and its Scheduled visit date.
- **Why:** The approved design is one Due date with quick picks and an Undo toast. On a phone that wants a sheet, not a popover.
- **Change:** Swap the native inputs in new-task-fields.tsx:44-47 and 74-78 for DueDatePicker with hidden fields, as the form already does for Assignee and Repeats.
- **Desktop, tablet, phone:** Desktop: popover anchored to the field. Tablet: popover. Phone: bottom sheet; toast above the bar and safe area.
- **Reuse:** Settled D31 reschedule popover or sheet plus Undo toast; React Aria DatePicker (approved); new Toast (Known gap).
- **References:** 
  - [Things 3](https://mobbin.com/screens/79b21b78-f56c-4d87-8b89-466ee2ef180c): When picker: Today and This Evening as named rows, a compact month grid, then Someday; one tap sets the day.
  - [Todoist](https://mobbin.com/screens/7ff218cf-1ddd-47ee-9123-72535e5f9283): Overdue group header with a count and a single Reschedule action for the whole group.
  - [Todoist](https://mobbin.com/screens/11b9d667-53e6-4af4-abd8-d8c726a6b29a): Date sheet with quick picks and the weekday on the right, calendar below
  - [Superlist](https://mobbin.com/screens/81b1dbef-6f67-4068-8aab-8347653a97c3): Today, Tomorrow, Next week rows with Clear and Done in the header
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Dark toast with Undo floating just above the bottom bar
- **Code:** `branch src/components/due-date-picker.tsx:43-105`, `branch src/app/(app)/tasks/task-list-context.tsx:69-81`, `branch src/app/(app)/tasks/[id]/fields.tsx:89-101`, `branch src/app/(app)/tasks/new/new-task-fields.tsx:44-47,74-78`
- **Verification:** confirmed. Consistent with settled D31. Toast is a Known gap. Native date inputs confirmed on the task page and on new task. Confirmed toast alternates: Mercury https://mobbin.com/screens/6aa8686b-430d-49dd-a4df-6b9fadcba678 ('Receipt matched' toast above the tab bar) and Linear https://mobbin.com/screens/f8e3aa03-00f2-4985-a6ae-1055ae0f4144.

### MOBILE-036

**Make the app installable on the home screen**

Medium · New capability · effort S · `Whole app on iPhone and iPad` · The phone is a chosen subset, and touch has no hover

- **Today:** The head has only a favicon and a basic viewport meta. There is no apple-touch-icon, web manifest or theme-color, and no viewport-fit=cover.
- **Why:** Connor and Pieter run the business from a phone, and contractors are about to. A home-screen icon that opens full-screen, with a status bar matching light or dark, is what makes a web app feel like Mercury or Stripe's apps.
- **Change:** Add a manifest (name 'HG Capital', short_name 'HG', display standalone, start_url '/'), a 180px apple-touch-icon, appleWebApp capable with a matching status-bar style, and theme-color for light (#ffffff) and dark (#161819) through media queries. Ship it together with the safe-area padding from MOBILE-006. Contractors land on My jobs from the same icon.
- **Desktop, tablet, phone:** Phone and tablet: standalone launch. Desktop: installable in Chrome; no visual change.
- **Reuse:** Next metadata (manifest, appleWebApp) and the viewport export (themeColor, viewportFit) in src/app/layout.tsx.
- **References:** 
  - [Jobber](https://mobbin.com/screens/bc7ab501-113a-46c8-8489-92e99140ea45): Field-team home that opens straight to today's work, as an installed app should
- **Code:** `curl of <head>: only charset, viewport 'width=device-width, initial-scale=1', description, favicon`, `src/app/layout.tsx:9-12`
- **Verification:** confirmed. Confirmed: the head carries only charset, viewport 'width=device-width, initial-scale=1', description and favicon, with no theme-color, manifest or apple-touch-icon. The proposed dark theme-color #161819 matches the --surface token used by the header.

### MOBILE-037

**Teach the device check the phone failures it misses**

Medium · Fix · effort S · `tests/devices (device check)` · The phone is a chosen subset, and touch has no hover

- **Today:** The sideways-scroll check skips any element inside an overflow container (escapesFlow). So the 1,210px Deals table, the 0px Task column and the off-screen status popover all pass. Nothing flags nested vertical scroll on touch or hover-only controls, and there is no iPad landscape device.
- **Why:** The commit gate is how UI quality is enforced. Today it lets through the two worst phone bugs in this review.
- **Change:** Add four checks:
- A table column narrower than 24px (error).
- A vertical scroll container on touch taller than 50% of the viewport (warning).
- Any visible element with role=dialog, menu or listbox outside the viewport (error).
- On (hover: none), interactive elements at opacity 0 (warning).
Also add an 'iPad landscape' device at 1024x768 with touch.
- **Desktop, tablet, phone:** n/a (tooling).
- **Reuse:** scanPage in tests/devices/checks.ts; devices in tests/devices/config.ts.
- **Code:** `tests/devices/checks.ts:1-29,104-120`, `tests/devices/config.ts:63-77`
- **Verification:** confirmed. escapesFlow (checks.ts:107-119) skips anything inside an overflow container, so both the 1210px Deals table and the 0px Task column pass. Two caveats. The sweep sees only default states, so an off-viewport popover check fires only if the test also opens states. New error kinds will surface existing failures, and CLAUDE.md requires Connor's OK to add known issues.

### MOBILE-I06

**Phone Financials leads with three numbers and folds the bookkeeping tiles into one row**

Medium · Design change · effort S · `Financials Overview (phone)` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375, nine cards come before the first chart, after a two-line reconciliation notice. Six are KPIs: Operating income, Operating expense, NOI, Debt interest, Cash flow after debt and Bank interest. Three are cleanup tiles. The first chart is Operating expense by category; Monthly income vs expense comes second (src/app/(app)/financials/page.tsx:75-160, verify-MOBILE/fin--s1--mobile-light-webkit.png).
- **Why:** Stripe Dashboard's phone Home is a short Today strip and then charts with period pills; Mercury's phone Home is one balance with Money in and Money spent. The cleanup tiles are bookkeeping work for a desk, not a phone glance, and eight equal cards hide the answer.
- **Change:** Below md show Income, Expense and NOI in one strip (NOI red when negative), then the monthly income vs expense chart. Replace the four cleanup tiles with one row "QuickBooks cleanup · $12,065 unclassified" with a chevron to the Settings cleanup list. Debt interest and Bank interest move under the chart as label-value rows. This narrows MOBILE-028's 2x2 grid to three figures on phones.
- **Desktop, tablet, phone:** Desktop 1280: unchanged. Tablet 768: strip of three plus the cleanup row. Phone 375: same; the four cleanup tiles drop.
- **Reuse:** Kpi and MoneyBars (src/app/(app)/financials/_components/ui.tsx); Field for label-value rows.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/e345975a-5113-4ffd-8b71-1abc1481379e): Three figures in one Today strip, then period pills and a current vs prior chart.
  - [Mercury](https://mobbin.com/flows/fd8c08f3-1587-47b6-931c-2b1eb563592a): Home opens on one balance with Money in and Money spent beneath it.
- **Code:** `src/app/(app)/financials/page.tsx:77-106`
- **Verification:** partly. The direction is right and the Stripe Today strip reference is verified (e345975a: three figures, then period pills and charts). The recommendation drops Cash flow after debt, which for a leveraged rental portfolio is arguably the partners' key number. Keep it in the strip (Income, NOI, Cash flow after debt) or directly under it. The finding notes it overlaps MOBILE-028's KPI grid; merge the two.

### MOBILE-I08

**Tablet portrait gets the phone's two-line rows, not a squeezed table**

Medium · Design change · effort S · `Every list at tablet portrait (768)` · The phone is a chosen subset, and touch has no hover

- **Today:** At 768 the Task column is 274px (the title input is about 210px), so titles truncate, while the Owner and Due columns are mostly empty. Tablet rows for Tasks are already settled: spec section 6 says tablet and phone get two-line rows where the whole row opens the task. Contractors at 768 fit all five columns. Deals need sideways scroll (1210px of table in 718px).
- **Why:** CLAUDE.md gives the 768x1024 tablet the touch layout, and the settled Today spec says tablet and phone get two-line rows. Linear Mobile and Shopify rows give the title the full width and put context on line two. Truncated titles make the list unreadable.
- **Change:** Switch the Table primitive to row mode below lg (1024), not md. Row: title on line one with status at the right; property, owner and due on line two. iPad landscape at 1024 keeps the table.
- **Desktop, tablet, phone:** Desktop 1280: table. Tablet 768: rows, full-width titles. Phone 375: rows. Nothing drops at 768.
- **Reuse:** Table primitive row mode from the concept; TaskRow (src/app/(app)/tasks/task-row.tsx).
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/30ebc468-06c8-46dd-9503-e197e89a1e5c): Rows give the title the full width with the status icon leading and the owner at the end.
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): Two-line rows: identifier and amount, then context, then status chips.
- **Code:** `src/app/(app)/tasks/page.tsx:186-192`, `Asana migration spec section 6, Today: "Tablet and phone: a Mine | Contractors switch at the top, with two-line rows"`
- **Verification:** partly. For Tasks this restates a settled decision. The new part is moving the shared Table primitive's row breakpoint to lg for every list, and that is too broad: decide per list (Tasks and Deals as rows below lg, Contractors below md). At tablet the more urgent problem is that nothing in a row opens the task (MOBILE-V02). Titles stay mostly readable when truncated, so medium rather than high.

### MOBILE-V08

**Move-in comment fields are invisible on touch**

Medium · Fix · effort S · `/residents/moving-in (public, phone)` · Rentals, residents and the public site run one lifecycle

- **Today:** Each item's 'Comment (optional)' input has a transparent border and background. Its outline appears only on hover (hover:border-white/10) or focus, so on a phone you see floating placeholder text, not a field. The placeholder color #4c525c on the near-black card measures about 2.5:1.
- **Why:** Touch has no hover, so tenants don't see a field they can type in. 2.5:1 fails WCAG's 4.5:1 for text on the form that records the unit's condition.
- **Change:** Give the field a visible 1px white/10 border at rest on every device, and use the public muted gray #767d8a for the placeholder (about 4.8:1). Once MOBILE-017 lands, show the field only after Fair or Poor is picked.
- **Desktop, tablet, phone:** Same on every size. On phone the field spans the full width under the rating control.
- **Reuse:** move-in-form.tsx comment input; the public palette tokens in CLAUDE.md.
- **Code:** `probe: comment input border rgba(0,0,0,0), background transparent, placeholder rgb(76,82,92)`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:317`
- **Verification:** verifier-found

### MOBILE-022

**Upload boxes say 'Click to upload or drag files here' on phones and don't lead with the camera**

Low · Fix · effort S · `Property Documents and task Attachments on touch` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Same as JOURNEYS-024.
- **Today:** Task uploads moved to the composer with a Camera button (capture="environment") and a files button with typed accept lists. The property Documents dropzone on /properties/cmtg25y4k0002jphsxww4tv6k still reads "Click to upload or drag files here" at 375 with no accept attribute.
- **Why:** You can't click or drag on a phone, and on site the job is 'take a photo'. The copy is wrong for the device.
- **Change:** Limit the fix to the property Documents dropzone (attachments.tsx:226).
- **Desktop, tablet, phone:** Desktop: dashed dropzone with drag copy. Tablet and phone: one 44px button; uploaded items in a 3-up thumbnail grid.
- **Reuse:** Attachments (src/components/attachments.tsx).
- **References:** 
  - [Airbnb](https://mobbin.com/screens/fcda60ea-e958-46fc-8db9-09ec2db05879): Two plain rows, Add photos and Take new photos, with a camera line icon; no drag-and-drop copy on a phone.
  - [Jobber](https://mobbin.com/screens/3bd617fc-464a-4f6d-891f-4b65f962b2cb): Notes tab puts Add Note and a camera button side by side, so a photo is one tap from the record.
  - [Jobber](https://mobbin.com/screens/a9ae73c4-ea73-4778-a64c-1590c987122f): Image tile with a 0/10 counter and a pinned Save Request button.
  - [Slack](https://mobbin.com/screens/7751f85b-0de1-4d60-a1d4-600d0fa4fcca): Attach sheet that starts with the camera tile and recent photos
  - [Todoist](https://mobbin.com/screens/4e93fa4a-15dc-419c-874e-c6aaf794f08d): Attach menu: Camera, Last photo taken, Library, Files
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): The phone form shows "Share images of the work to be done 0/10" as an image tile that opens the camera or library, not a drag zone.
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): Receipts section with one + tile and a red Missing flag when a photo is required.
  - [Airbnb](https://mobbin.com/screens/b62a3448-d66c-4564-a769-24e8f741d43c): "Add photos" tile with a camera icon instead of drag wording
- **Code:** `src/components/attachments.tsx:150-160`, `branch src/components/attachments.tsx:226`, `branch src/components/media-uploader.tsx:254-255`, `src/components/attachments.tsx:152-154`, `branch src/app/(app)/tasks/[id]/composer.tsx:249-251`, `src/components/attachments.tsx:153`, `branch-src/src/components/attachments.tsx:226`, `branch-src/src/app/(app)/tasks/[id]/composer.tsx:250`, `src/components/attachments.tsx:225-227`, `src/app/(app)/properties/[id]/edit-documents.tsx:23`, `src/app/(app)/tasks/[id]/composer.tsx:185-230`, `src/components/attachments.tsx:152-154,157-165`, `branch src/app/(app)/tasks/[id]/composer.tsx:218,250`, `src/components/attachments.tsx:152-153`, `src/app/(app)/properties/[id]/edit-documents.tsx:23 and src/app/(app)/tasks/[id]/task-detail.tsx:249 (both use Attachments)`, `4652abb:src/components/attachments.tsx:226`, `grep 4652abb:src for 'components/attachments"': only src/app/(app)/properties/[id]/edit-documents.tsx`
- **Also found as:** TASKS-V04 (Tasks list, new task and task detail), MOBILE-IV08 (Lens: phone and tablet experience on every route), COPY-060 (Lens: words on every screen), JOURNEYS-024 (Lens: the core jobs, end to end), G1D-IV03 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** partly. The copy problem is real. The accept recommendation is wrong, though. iOS already offers Take Photo, Photo Library and Choose File for a file input with no accept attribute. Adding accept="image/*,video/*,application/pdf" would block .docx and .xlsx files (leases, bids) from property Documents. Keep the touch copy change and leave accept unset.

### MOBILE-028

**Financials KPIs should sit in a 2x2 grid on phones**

Low · Design change · effort S · `/financials on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** Below sm the four KPIs stack as full-width cards 64 to 87px tall (about 300px together). The source line fits on one line at 375. 'Show accrual basis' and 'Refresh from QuickBooks' sit on their own row, followed by a two-line reconciliation warning.
- **Why:** Stripe puts three figures in one strip, so the whole P&L should be visible in one glance on a phone.
- **Change:** Use grid-cols-2 below sm with the figure at text-xl. The source line becomes one line ('Cash · synced 51d ago'), with Refresh as a 44px icon button and the basis switch in the Filters/overflow menu.
- **Desktop, tablet, phone:** Desktop: 6 across. Tablet: 3 across. Phone: 2x2, with the memo KPIs in a second 2-up row.
- **Reuse:** Kpi and SourceBadge in src/app/(app)/financials/_components/ui.tsx.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/fba86a00-cfc6-43b3-af79-052679faa58e): 'Today' card with three figures side by side, separated by space, not boxes
  - [Airbnb](https://mobbin.com/screens/ec1e902b-2557-4657-913c-9d29c531a542): Insights stats in a compact row: figure over label
- **Code:** `src/app/(app)/financials/page.tsx:76`
- **Verification:** partly. The heights were overstated about 2x, which looks like image pixels from 2x screenshots. The KPI cards measure 68, 68, 87 and 64 CSS px (about 300px for four), not about 140px each and 600px total. The source line fits on one line at 375. The 2x2 grid is still an improvement. Stripe fba86a00 (Today strip) and Airbnb ec1e902b (stats row) are both confirmed.

### MOBILE-043

**Long-press a task row for quick actions**

Low · New capability · effort M · `Task rows on phone (Today and All)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Phone rows on Today and All are no longer clipped. Each row has a 44px checkbox (done) and a due chip that opens the quick-pick sheet in place, and the rest of the row opens the task. Only reassigning still needs the task page. There's no long-press.
- **Why:** Triage on a phone is 'done, push to tomorrow, give to Zack'. A long-press sheet does that without leaving the list, with no extra chrome on screen.
- **Change:** Long-press is now low value: reschedule and done already work in the row. If anything, add Reassign to a row menu, or wait for the bulk action bar planned after cutover (spec §4). Lower to optional.
- **Desktop, tablet, phone:** Desktop: right-click or the overflow menu on hover. Tablet and phone: long-press sheet.
- **Reuse:** The bottom action sheet (MOBILE-027), the due sheet (MOBILE-035), Toast.
- **References:** 
  - [Things 3](https://mobbin.com/screens/c89b824c-7ad7-4fb4-9e0c-44f8af421629): Long-press menu on a to-do: Mark as Completed first, then date and tag actions, grouped with dividers; every item also exists as a visible control.
  - [Craft](https://mobbin.com/screens/6724ed7d-c631-4b7e-a26f-a44f83b6bc12): Item sheet with Mark as Resolved, Reschedule and Remove
  - [Joi](https://mobbin.com/screens/232e633c-a229-47bd-9e95-53acc546fa99): Long-press task sheet: Complete, Edit, Remove as three large buttons
- **Code:** `src/app/(app)/tasks/task-row.tsx:115-150`, `branch src/app/(app)/tasks/task-row.tsx:84-91,146-155`
- **Verification:** partly. Rows already have inline owner, address and due-date pickers, so on desktop and tablet you can reschedule or reassign without opening the task. On phone those cells are clipped (MOBILE-001), and their clear buttons are hover-only. Long-press on iOS Safari also collides with the native link-preview callout and needs -webkit-touch-callout handling. It's a hidden gesture, so low is right.

### MOBILE-044

**iPad landscape: list and detail side by side**

Low · New capability · effort L · `/tasks and /deals on iPad landscape` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. Tapping a row on /tasks or /tasks/all (WebKit, 768 touch) navigates to the full /tasks/[id] page. There's no list-plus-detail pane at any tablet size, and /deals is unchanged. Today does show Mine and Contractors side by side from 1024.
- **Today:** On every tablet size, opening a task or deal replaces the list with a full page, and Back reloads the list.
- **Why:** In landscape there's room for both. Working down a list of 13 active deals or today's tasks is faster when the list stays put.
- **Change:** At 1024 and up on (hover: none), tapping a row opens its detail in a right pane (about 55%), with the URL updating and the selected row highlighted. Portrait and phone keep full-page detail. The pane uses the same task-page content, with its rail turned into a chip row.
- **Desktop, tablet, phone:** Desktop: optional, the same pane. Tablet landscape: split view. Tablet portrait and phone: full-page detail.
- **Reuse:** Task page and deal detail components rendered in a pane; Next parallel or intercepting routes.
- **Challenges:** D31 approved the task as a page with a side rail. This adds a landscape-tablet pane that reuses that page's content; it doesn't replace it.
- **References:** 
  - [Asana](https://mobbin.com/screens/95628ff8-7999-4c30-9820-5924b8fd9c59): List on the left, task detail with Mark complete on the right
  - [Superlist](https://mobbin.com/screens/f056c26d-f67f-49e2-b682-e290d350e56c): Calm two-pane list and detail with Complete in the pane header
- **Code:** `branch src/app/(app)/tasks/task-row.tsx:77-82`
- **Verification:** confirmed. The routing confirms full-page detail at every size. I couldn't test iPad landscape live (no 1024 touch preset). conflicts_with correctly names D31 and keeps the rail content.

### MOBILE-I02

**Sort and grouping move into one Display sheet on phones**

Low · Design change · effort M · `Tasks and Deals lists (phone, tablet portrait)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Tasks no longer have a table or sort headers. All lists tasks in a fixed soonest-due order with no sort or group control, and its filters fit in two rows at 375 and 320 (tasks/filters.tsx:57-132). Deals is unchanged and still sorts only through header buttons.
- **Why:** Linear Mobile keeps grouping, ordering and which properties show on each row in one Display sheet, and Shopify puts a single sort button beside the search field. Without a home for sort, phone lists lose it entirely.
- **Change:** Apply this to Deals only: a sort button next to the phone search that opens a sheet (Status, Price, Updated; Ascending | Descending) and writes the same params as SortHeader. Tasks don't need it, since Today groups by person and All is ordered by date per the approved spec.
- **Desktop, tablet, phone:** Desktop 1280: header sorting stays, no button. Tablet 768: button shown with the row layout (MOBILE-I08). Phone 375: button beside search, sheet with a pinned Done.
- **Reuse:** SortHeader URL params (src/app/(app)/deals/sort-header.tsx, src/app/(app)/tasks/sort-header.tsx); SegmentedControl from deals/filters.tsx for direction; React Aria sheet (approved). New: Display sheet based on Linear Mobile.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/a8d2df88-10dc-4ac7-8cfb-4011f0082501): One sheet holds Grouping, Ordering, completed items and row properties.
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): Sort is one icon button beside the search field, next to the filter button.
- **Code:** `src/app/(app)/tasks/page.tsx:189-192`, `branch:src/app/(app)/tasks/filters.tsx:57-132`, `branch:src/app/(app)/tasks/all/all-list.tsx:5-14`
- **Verification:** partly. The finding misses the bigger break: on phones the task titles aren't there at all (filed as MOBILE-V01). Group by adds a control desktop doesn't have, and the settled Today view already groups (Overdue, Today, Waiting, No date), so it is redundant for tasks. House rule: a control row that would wrap collapses into a Filters button. Put Sort inside that one Filters sheet rather than adding a second icon button by the search field. Linear's Display options sheet is real (seen at mobbin.com/screens/fea8a7b6-2b61-4b0b-a13d-2d2b7a610d63), but Linear opens it from the record's ... menu, not from a button beside search.

### MOBILE-I04

**Settings on phone opens as a grouped list, not tabs over the CapEx grid**

Low · Design change · effort S · `Settings (phone)` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 the three TopTabs fit with no sideways scroll. At 320 the labels wrap to two lines ("CapEx / rules", "Move-in / form") and the CapEx Replace column clips (verify-MOBILE/settings-n--narrow-light-webkit.png). The tabs sit above the Settings title. Reset to defaults is the first control, but it opens a confirm dialog. Appearance and Sign out exist only in the drawer.
- **Why:** Monzo's settings and Airbnb's Menu open on a grouped list of plain rows with chevrons, each opening its own page. Underline tabs scroll sideways and hide options at 375, and the first thing on the page should not be a reset.
- **Change:** Below md, /settings shows a grouped list. Workspace: CapEx rules, Move-in form, Storage, QuickBooks (once it moves in under D10). You: Appearance with its current value on the right, then Sign out in red at the end. Each row opens the existing page with a back chevron. The same list is the bottom bar's Menu destination (MOBILE-006).
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: TopTabs stay. Phone 375: grouped list; tabs drop.
- **Reuse:** TopTabs (src/components/nav.tsx) on desktop; ThemeToggle. New list-row component in src/components/ based on Monzo and Airbnb.
- **References:** 
  - [Monzo](https://mobbin.com/screens/6b891ec1-ab93-464c-b98d-0fef1c262968): Settings as grouped inset rows with line icons and chevrons; Log out last.
  - [Airbnb](https://mobbin.com/screens/ec965d5f-a216-49db-b44b-7ee988a9d7d7): Menu groups work rows under Hosting and personal rows under Account.
- **Code:** `src/app/(app)/settings/layout.tsx:14-20`, `src/app/(app)/settings/capex-rules-editor.tsx:303-306`
- **Verification:** partly. A grouped list adds a navigation level for three short tabs. It earns its place once QuickBooks and Appearance move in under D10. conflicts_with should name the house rule "Page sections that are separate routes use TopTabs", because this swaps TopTabs for a list on phones. The real fixes today are smaller: put the title above the tabs and keep labels on one line at 320.

### MOBILE-I05

**Phones show setup and connection settings read-only, with one line pointing to a computer**

Low · Design change · effort S · `Financials Settings, Settings and the property page (phone)` · The phone is a chosen subset, and touch has no hover

- **Today:** Disconnect opens a Keep data / Delete everything confirm (src/app/(app)/financials/settings/controls.tsx:31-66). Reset to defaults opens a confirm dialog (src/app/(app)/settings/capex-rules-editor.tsx:395-406). Mis-taps don't act. The property page's "No QuickBooks class is mapped" card is first at tablet and desktop too, so it is not a phone-only problem (verify-MOBILE/prop767b--tablet-light-webkit.png).
- **Why:** Stripe Dashboard's phone app is a deliberate subset, and Jobber tells you on the phone "To add codes, use Jobber in your web browser" instead of offering the editor. Rare, high-stakes configuration on a phone invites mis-taps and pushes daily information down the screen.
- **Change:** Below md: the QuickBooks card shows status, last sync and Refresh only, with Disconnect, Basis and class mapping replaced by one muted line "Change these on a computer." CapEx rules and the move-in form editor render read-only with the same line, and Reset to defaults is hidden. The property page's QuickBooks setup card is hidden on phones. Refresh stays because it's a glance-and-tap job.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: unchanged. Phone 375: read-only views plus the one line; destructive and setup controls drop.
- **Reuse:** Existing pages with a md visibility wrapper; RefreshButton (src/app/(app)/financials/_components/refresh-button.tsx).
- **References:** 
  - [Jobber](https://mobbin.com/screens/7f8a7d6c-bfcb-4347-abe3-b0a9b26603d1): The phone form says in one line that codes are set up in the web browser instead of offering setup.
  - [Stripe Dashboard](https://mobbin.com/screens/e345975a-5113-4ffd-8b71-1abc1481379e): The phone app is a subset: numbers and lists, no account configuration on the first screens.
- **Code:** `src/app/(app)/financials/settings/controls.tsx:31-39`, `src/app/(app)/settings/capex-rules-editor.tsx:303-306`, `src/app/(app)/properties/[id]/financials.tsx:25`
- **Verification:** partly. The finding bundles three changes into one. Making phones read-only removes capability and adds a caveat line ("Change these on a computer"), which the copy rules push against. The cited Stripe screen e345975a is a Home screen. It shows nothing about setup being withheld on phones, so it is a weak reference. I did not verify the Jobber screen. Keep the one useful piece: at every width, move the unmapped-class prompt below the daily cards or into the Financials Settings cleanup list.

### MOBILE-I09

**Put each record's status in one spot on phones: a dot and word above the title**

Low · Design change · effort M · `Property, deal, task and contractor pages (phone)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The task page now follows the spec. On phones the status chip sits at the right end of the back-link row next to the '...' menu, the title gets the full width and wraps, and tapping the chip opens the status menu (tasks/[id]/view.tsx:67-98). From md up, the status sits beside the title. The deal page is unchanged: its status select is still inside the Deal card. Property and contractor headers are unchanged too.
- **Why:** Jobber puts a colored dot and status word above the title in the same place on every record, which frees the title to use the full width and makes status skimmable. House rule: per-item status sits in one fixed, skimmable spot. The settled task page already puts status before the title.
- **Change:** Use the task page's header grid on the deal page: status chip in the back-link row on phones, beside the title from md up. The contractor's 'tenant fixes' chip is a tag, not a status, so it stays out of this spot.
- **Desktop, tablet, phone:** Desktop 1280: status beside the title in the header. Tablet 768 and phone 375: eyebrow above the title. Nothing drops.
- **Reuse:** Badge tones (src/components/ui.tsx); the existing status selects move into a sheet.
- **References:** 
  - [Jobber](https://mobbin.com/screens/d1f48426-fe89-43ab-bacf-619dcdee2ba0): Dot and Upcoming above the job title; title, subtitle and address follow at full width.
  - [Jobber](https://mobbin.com/screens/31d2f003-1b0b-41b4-9e38-a51b2c78353a): Same eyebrow spot on a different record type (Assessment completed), so status is always found in one place.
- **Code:** `branch:src/app/(app)/tasks/[id]/view.tsx:67-98`
- **Verification:** partly. Jobber's dot-and-word eyebrow is real (seen at mobbin.com/screens/fb82e72d-18f7-41ae-9127-6ec221711f74). Two cautions. Tapping the eyebrow opens the I14 sheet, which I refute. The house rule on fixed status position is about cards in lists, so this is a consistency nicety rather than a rule breach. Severity low.

### MOBILE-I10

**Give every record a Share action, since the installed app has no address bar**

Low · New capability · effort S · `Property, deal, task and contractor pages (installed app)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The task page now has a '...' menu with Copy link, which shows a 'Link copied' toast (tasks/[id]/header.tsx:50-71). Nothing in the branch calls navigator.share, and deal, property and contractor pages still have no menu.
- **Why:** Stripe Dashboard pins Share at the bottom of every record, and Linear Mobile's record menu opens with Share and Copy link. Two partners texting each other "look at this one" is a daily job.
- **Change:** In the task menu on touch devices, call navigator.share when it's available and fall back to the existing Copy link. Add the same menu to deals, properties and contractors (see IA-I08).
- **Desktop, tablet, phone:** Desktop 1280: Copy link in the record menu. Tablet 768 and phone 375: Share opening the system share sheet.
- **Reuse:** New small helper in src/components/; Toast (Known gap).
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/187975d8-3298-45c2-bb31-933aa892f69a): Share pinned at the bottom of the payment record.
  - [Linear Mobile](https://mobbin.com/screens/5911d6e4-808e-40e9-8fbb-300e7c9c4e9e): Record menu starts with Share and Copy link, destructive action last in red.
- **Code:** `grep for navigator.share and clipboard under src/ returns nothing`, `branch:src/app/(app)/tasks/[id]/header.tsx:50-71`, `grep for navigator.share under branch src/ returns nothing`
- **Verification:** partly. Linear's record menu with Copy link is real (mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690). Worth doing once the installable app exists. Until then it is low.
