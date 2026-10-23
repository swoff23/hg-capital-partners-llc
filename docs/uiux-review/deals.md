# Deals pipeline, new deal and deal detail

Part of the [UI/UX review](README.md). 61 findings: 0 critical, 9 high, 31 medium, 21 low.

## How it should work

Deals becomes a calm pipeline you can read in seconds and act on in one move. It is two views of one set, both opened from the page title the way Attio switches views (https://mobbin.com/flows/26cf9d81-99c8-466c-8a4a-c257690f4551).

Board for the live work. New, Touring, Offer and Under contract are columns, each with a stage dot, a count and the summed asking price, as on Attio's pipeline (https://mobbin.com/screens/a2b97705-be0b-44a3-84ec-522316c873bf). Every card puts the same things in the same places: street, asking, units and town, days in stage, next action and owner initials. Snoozed, Passed and Closed fold into a hidden rail you can drop cards onto, taken from Linear's board (https://mobbin.com/screens/fc208a44-dbf9-4f79-b9b0-db57f9840964).

List for everything else. Rows group by stage under headers with counts, as in Linear (https://mobbin.com/screens/46088879-314c-405c-88b5-eb7820c05efb). The table ends on a footer that counts and sums the way Attio's does (https://mobbin.com/screens/a44be622-b84a-4805-ad7a-6f600ece6356). Filters are dashed chips that read as sentences ("Asking under $300k", "Units 4+", "Town is Tonawanda"), as in Stripe (https://mobbin.com/screens/140880ca-003b-4498-8932-c09c223ed9de), and any useful slice can be saved as a named view, as in Linear (https://mobbin.com/screens/0f263579-9bcb-4815-991e-ad45b408814d). Money is typeset: asking is right-aligned in Geist Mono. A price cut shows the old price struck through above the new one, the way Flighty shows a delayed time (https://mobbin.com/screens/735a1c2a-4ed9-48c1-9ddb-b4d1ca513432), and the gap to our max is written out the way Zillow writes "Under target by" (https://mobbin.com/screens/27fe3126-473a-4bd5-9fe5-5a5b3c5b2d48).

Holding stops being a graveyard. "Not now" becomes Snooze until a date, as in Front (https://mobbin.com/screens/935e62ed-da7a-42d7-9a0f-d3efe66e5746), and when a deal comes back it lands on Home.

The record. A deal opens in a side panel with arrows to step through the view, like Mercury's drawer (https://mobbin.com/screens/b5b9a184-bd88-48e7-ba5a-f3f151278cc2). After you decide on one deal, the next one opens, which is Superhuman's habit (https://mobbin.com/screens/7ae675ae-2423-4231-b8be-2049b4333bec). The header's main button is always the next stage, ending in Create property, after Jobber's Convert to Job (https://mobbin.com/screens/ec252fff-64da-4154-bfed-ccfc579fb2b7). The main column holds notes, where @ asks the other partner, as in Mercury (https://mobbin.com/screens/ed84df94-2b05-4afc-b05f-49213b391967). The side rail holds facts, with empty fields written as verbs (Attio, https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f), plus a Files section (Attio, https://mobbin.com/screens/7a561314-128a-4336-aafc-d1f570283204).

Phone. The phone gets a chosen subset. The grouped list uses the title as the view switcher, with a scrolling row of chips (Shopify, https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a). A capture sheet fills in the address from where you're standing (Zillow, https://mobbin.com/screens/09329482-94ea-4eab-825f-99aabbae3a20). The record has Directions, the next-stage button and Add note beside a camera button (Jobber, https://mobbin.com/screens/3bd617fc-464a-4f6d-891f-4b65f962b2cb).

<details><summary>What the reviewer covered</summary>

Production build at http://localhost:3200, signed in as Connor. Routes: /deals (default Active, All, TBD, Pass, ?statuses=1 - High, CLOSED!, 6 - Holding; sorts by status, -theirPrice, updated, -units; search q in Active and All, a no-match search, address spellings like "Prospect Ave" vs "Prospect Avenue"); /deals/new (empty submit, 3-character address, URL without https, units 0); /deals/[id] for 29 Livingston (cmtg25yd8002cjphs49ovlvob), 256 Auburn (cmtg25ydh002zjphsuyjd90go, has listing URL), 27 Crestwood (cmtg25yfu00fqjphspp5qizdo, URL used as the address), 321 Vermont (Pass), 767 Prospect (CLOSED!), plus ?dup=1. Viewports: desktop 1280, tablet 768 (touch), mobile 375, narrow 320. Dark mode at desktop, mobile and tablet. WebKit on the list at mobile and tablet. Interactions: status multiselect open, toggle, Esc and outside click; segment clicks; sort headers; row hover; note tooltip hover; resize handle hover; keyboard Tab order; inline edits on list and detail (focus, type, Esc, Enter, Tab-blur); status change while pending; listing link hover. Writes are blocked by the harness, so the error-boundary screens I saw are what a failed save looks like. Post-save states (green flash, a row leaving a filtered view, the redirect after create) come from reading the code, not from seeing them. Not covered: laptop 1440 and wide 1920, an actual column drag (hover only), and anything that needs a successful write. Source read: everything in src/app/(app)/deals/, src/lib/deals/*, the relevant parts of src/lib/config.ts, src/components/ui.tsx, inline-address-field.tsx, tooltip.tsx, back-link.tsx, server-action.ts, error.tsx and prisma/schema.prisma. All screenshots are in deals/.

</details>

## Findings

### DEALS-006

**The status filter popover opens off the left edge on phones**

High · Fix · effort S · `/deals` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 and 320, the filter row wraps and the "All statuses" button ends up on the left. Its 224px panel is anchored with right-0, so it opens mostly off-screen and the checkboxes can't be reached. Same in light and dark mode.
- **Why:** Multi-status filtering doesn't work at all on a phone.
- **Change:** Use React Aria Popover, which flips and shifts to stay on screen. On phone, open the filter as a bottom sheet with "Show 13 deals" and "Clear". Or remove the control entirely (DEALS-015).
- **Desktop, tablet, phone:** Desktop and tablet: a popover that stays on screen. Phone: a bottom sheet.
- **Reuse:** StatusMultiSelect, rebuilt on React Aria Popover or Sheet (approved).
- **References:** 
  - [Gusto Mobile](https://mobbin.com/screens/4cc98bf2-fe6e-4324-9378-f46da5f5e0c1): Status checkboxes in a sheet with Apply and Clear all filters.
  - [Mercury](https://mobbin.com/screens/5ac536af-88d5-4269-a0e0-85779c6aff97): Filter sheet with See Results and a count on Clear.
  - [Mercury](https://mobbin.com/screens/aafea5a6-f4ee-47c4-9a83-4f56701c18e8): On phones a multi-pick filter is a section in a full-height Filters sheet with a pinned See Results button, never an anchored popover that can open off-screen.
  - [Shopify](https://mobbin.com/screens/e0a3f3f2-db73-430d-8259-e4b59fa6c843): The filter button beside search carries a count badge, so the active status filter stays visible after the sheet closes.
  - [Instagram](https://mobbin.com/screens/f3907dff-8e18-4f7c-bc76-d16d8cf36901): On a phone, multi-pick filters live in a bottom sheet, not a floating popover
- **Code:** `src/app/(app)/deals/status-multiselect.tsx:52-57`, `probe: popover rect {l:-126, r:98, w:224} at 375 and 320`, `src/app/(app)/deals/status-multiselect.tsx:56`
- **Also found as:** MOBILE-003 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. At 375 the listbox measured left -126px to right 98px, and none of the checkboxes were on screen (verify-DEALS/ms--open--mobile-light.png).

### DEALS-008

**Turn the deals table from a sheet of inputs into read-only rows that open the deal**

High · Design change · effort L · `/deals` · Lists answer first and stay calm at 675 rows · big bet

- **Today:** Almost every cell is a live form control: a status select, a units spinner, two price inputs and a next action input. Only the address text is a link, so clicking anywhere else in a row does nothing. Hovering shows input borders and number spinners, and Safari draws spinners and double chevrons on every row. 300 rows with 6 controls each is about 1,800 tab stops.
- **Why:** Stripe Payments, Mercury and Attio show plain text in rows and do editing in a panel or on the record. That's much of why they feel calm and clean. This table reads as a form and invites accidental edits.
- **Change:** Render cells as text. Make the whole row the click target: it opens the deal, and ⌘-click opens a new tab. Keep exactly one inline control, the stage pill menu (DEALS-020). Edit everything else on the deal page or in the peek (DEALS-049). Add a light hover fill on desktop only.
- **Desktop, tablet, phone:** Desktop and tablet: a table of text rows that open on tap. Phone: stacked rows (DEALS-010).
- **Reuse:** Table, Th and Td in src/components/ui.tsx; Badge for the stage; remove the inputs from DealRowEditable.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258): Text-only rows with the status as the one badge.
  - [Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79): Quiet one-line rows; detail opens on click.
  - [Clay](https://mobbin.com/screens/ff20a3b3-a0d7-4b5b-bcad-6e1a4dd237aa): A selected-cell outline only on the active cell
  - [Attio](https://mobbin.com/screens/9b7cd195-28c6-472d-a3f3-4c3b93f8362b): Status as dot plus label text, not a select control
- **Code:** `src/app/(app)/deals/deal-row.tsx:53-152`, `src/app/(app)/deals/deal-row.tsx:44-147`
- **Also found as:** DATA-016 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. The All view has 1,803 focusable inputs, selects and links in main. WebKit draws spinners on every Units cell and double chevrons on every status (verify-DEALS/wk--tablet-light-webkit.png). Hovering a Units cell shows its border and spinner (all--hover-units--desktop-light.png). The partners came from a spreadsheet. Offer Connor Attio-style cells as a middle option: plain text at rest that turns into an editor on click. That keeps quick edits without a sheet of controls.

### DEALS-009

**Cut the table to six columns so it fits a 1280 laptop without sideways scrolling**

High · Design change · effort M · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** The default column widths add up to 1210px inside an 1150px card at 1280, so the Updated column is clipped and the table scrolls sideways inside the card. At 768, Latest note, Next action and Updated are all off screen.
- **Why:** At the most common laptop size the table looks broken, and the last column is hidden.
- **Change:** Use six columns: Address (street, with "4 units" muted underneath), Stage, Asking and Our max (both right-aligned, mono, Our max muted), Next action, and Last activity. Fold Units into the address line and move Latest note into the peek and the deal page. Use auto layout with minimum widths instead of fixed widths.
- **Desktop, tablet, phone:** 1280: all six fit. 768: drop Our max and Last activity. 375: stacked rows (DEALS-010).
- **Reuse:** Table, Th and Td; removes column-widths.tsx (DEALS-052).
- **References:** 
  - [Stripe](https://mobbin.com/screens/373146e1-8686-43b0-8a10-5da707dc8873): A few purposeful columns, plus Edit columns for extras.
  - [Mercury](https://mobbin.com/screens/868560a8-9acb-41d7-9708-82730b1257ad): A table that fits its width with no sideways scroll.
  - [Stripe](https://mobbin.com/screens/d1ccc54c-679b-406f-893a-8c18cb5690f3): Default columns fit the viewport; extra ones are opt-in via Edit columns
- **Code:** `src/app/(app)/deals/column-widths.tsx:7-16`, `src/app/(app)/deals/page.tsx:115-130`, `src/components/app-shell.tsx:194`, `Measured table box at 1280, 1440 and 1920: client 1150, scroll 1210`, `eval at desktop and laptop: table container clientWidth 1150, scrollWidth 1210`
- **Also found as:** DATA-031 (Lens: tables, numbers, money, charts and status), DATA-IV05 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. Measured at 1280: the table is 1210px inside a 1150px box, and Updated is clipped. At 1440 it fits, so the problem is specific to the most common laptop width.

### DEALS-012

**Search every status when someone types, not just the selected tab**

High · Design change · effort M · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** Search only looks inside the selected segment. From the default Active tab, "Prospect" returns 1 deal. The same search on All returns 19. The segment counts stay at 675 / 17 / 13 / 428, and the empty state only says "No deals match."
- **Why:** Looking up a past deal starts from the default tab, and the search quietly says it doesn't exist. Linear and Shopify tell you results are hidden by filters and offer a way out.
- **Change:** When there's a query, search all statuses and update each segment's count to match, keeping the selected segment. If that segment has no matches, the empty state reads No active deals match "Prospect", with a "Show 18 in other statuses" button. Add a clear (x) button to the field.
- **Desktop, tablet, phone:** Same logic at every size. On phone the counts show in the view menu, and the empty state is one line plus the button.
- **Reuse:** filters.tsx; the one-line EmptyState form for inside a card.
- **References:** 
  - [Linear](https://mobbin.com/screens/90b0ca17-b70a-425c-b28b-ce934231b2b9): When filters hide matches, the empty state says '16 issues hidden by filters' with Clear Filters. Search is never silently scoped.
  - [Stripe](https://mobbin.com/screens/9a241073-d70a-41ef-937e-2c3db273fb34): Search results are grouped by type, each group with 'View N results'. For deals, group the results by stage.
  - [Linear](https://mobbin.com/screens/9dab540b-f7d4-47d4-be77-5facc75f89fa): "14 issues hidden by filters" with Clear Filters.
  - [Shopify](https://mobbin.com/screens/d72b2baa-d912-49d2-9583-5c260fdadd56): No-results state with one clear action.
- **Code:** `src/app/(app)/deals/page.tsx:50-61`, `src/app/(app)/deals/filters.tsx:44-51`
- **Verification:** confirmed. Reproduced: 'Prospect' returns 1 row on Active and 19 on All, and the segment counts don't change (they come from a groupBy with no where).

### DEALS-013

**Split "status" into Stage and Priority, and drop the spreadsheet number prefixes**

High · Design change · effort L · `/deals and /deals/[id]` · Plain, consistent words

- **Today:** One status list mixes priorities ("1 - High", "2 - Medium", "3 - Low"), stages ("4 - To Schedule", "6 - Holding") and outcomes ("CLOSED!", "Pass"), with "5 - TBD" in the middle. The Deal.priority column and DEAL_PRIORITIES list repeat the same values and aren't used anywhere in the UI. The number prefixes only exist so a spreadsheet would sort them.
- **Why:** The current model can't express "a high-priority deal waiting on a tour." Seeing the pipeline by stage is a core job, and these labels get in the way. Pipedrive and Linear keep stage and priority separate.
- **Change:** Stages: New (was TBD), Reviewing, Touring (was To Schedule), Offer, Under contract, On hold (was Holding), Closed, Passed. Priority: High, Medium, Low, shown as a small icon. Migration: 1, 2 and 3 become Reviewing with matching priority; 4 becomes Touring; 5 becomes New; 6 becomes On hold. Settle the exact stage list with Connor in a grilling pass.
- **Desktop, tablet, phone:** A stage pill plus a priority icon. On phone the icon sits left of the address.
- **Reuse:** DEAL_STATUSES and DEAL_PRIORITIES in src/lib/config.ts; the existing Deal.priority column.
- **References:** 
  - [Attio](https://mobbin.com/screens/e275641a-a3e8-440a-b53e-983bb9cec7c7): Stage is the pipeline axis (Prospecting 14, Qualification 2, Meeting 2, Offered 1), each with a color dot. Rating or priority is a separate attribute on the card, not mixed into the stage.
  - [Pipedrive](https://mobbin.com/screens/2ff3c977-7902-48b5-8361-0c89710e5c2e): Stages named by step, with no priority mixed in.
  - [Linear](https://mobbin.com/screens/9dab540b-f7d4-47d4-be77-5facc75f89fa): Status and Priority are separate properties.
  - [Linear](https://mobbin.com/screens/73891735-c12b-4ed3-bd7f-fc6bc3c52228): Status (Backlog) and Priority (No priority) are separate properties in the record rail, each with its own control.
  - [Linear](https://mobbin.com/screens/2579f037-4e90-4330-ac35-19323ca9828a): Priority is its own filter with its own scale (No priority, Urgent, High, Medium, Low), independent of status groups.
  - [Salesforce](https://mobbin.com/flows/f5ad6653-96e5-48d3-a92f-e021f949e1a5): Stage path (New → Contacted → … → Converted) kept separate from other attributes.
  - [Apollo](https://mobbin.com/screens/56e90c39-a8fd-48c6-a027-c4c2408a392c): Deals table with a dedicated Stage chip column.
  - [Attio](https://mobbin.com/screens/eab1b4ff-9efc-4d6d-9065-68afe3514255): Pipeline stages are plain words (Prospecting, Qualification, Meeting, Proposal, Won, Lost)
  - [Attio](https://mobbin.com/screens/51026c49-e8a1-4a9e-accb-29f8aee634cc): Pipeline stages (Prospecting to Won / Lost, plus Paused) with one colored dot per stage
  - [Attio](https://mobbin.com/screens/e9e110f4-72d8-49e6-8486-3a785f88dae5): Plain stage names (Qualification, Meeting, Proposal) with colored dots
- **Code:** `src/lib/config.ts:4-13`, `src/lib/config.ts:47`, `prisma/schema.prisma:56-59`, `src/lib/config.ts:30`, `prisma/schema.prisma:57`, `src/lib/config.ts:4-30`, `src/app/(app)/deals/filters.tsx:8-13`, `src/lib/config.ts:4-13,30`
- **Also found as:** IA-025 (Lens: information architecture and global SaaS patterns), COPY-007 (Lens: words on every screen), JOURNEYS-016 (Lens: the core jobs, end to end), DATA-050 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. A grep confirms DEAL_PRIORITIES is never used outside config.ts. The data adds support for an Under contract stage. Three CLOSED! deals carry 'UNDER CONTRACT' in their addresses (DEALS-V02), and the 29 Livingston timeline shows a legacy 'Closing' status. Running this through a grilling pass before migrating is right.

### DEALS-020

**Replace the native status selects with a single pill menu**

High · Design change · effort M · `/deals and /deals/[id]` · Lists answer first and stay calm at 675 rows

- **Today:** Status is a native select tinted with a tone class, on every row and on the deal page. Chromium shows a small native chevron, Safari shows double chevrons, and dark mode renders heavy filled boxes. The options use OS styling and can't be searched.
- **Why:** It's the busiest mark on the page and it looks like an unstyled form control.
- **Change:** Use a status pill that opens a menu: colored dot, label, a check on the current value, number keys 1 to 8, and type-to-filter. Use the same component in the row, the peek and the deal header.
- **Desktop, tablet, phone:** Desktop and tablet: a menu. Phone: the same options in a sheet.
- **Reuse:** Badge; React Aria Menu (approved).
- **References:** 
  - [Linear](https://mobbin.com/screens/5bc1daea-c0a9-4e20-8f0d-77163691df63): "Change status" menu with a check and number shortcuts.
  - [Attio](https://mobbin.com/screens/8890bae8-747e-460a-846c-5f1fc12ca402): Stage values shown as dot plus label.
  - [Linear](https://mobbin.com/screens/c2cbaff3-1a8d-4fd4-af9a-c5c31533082c): Priority as a quiet chip that opens a compact menu with shortcuts.
  - [Linear](https://mobbin.com/screens/344cad59-d4a8-421a-9c2f-14b3c977e82d): Status and priority as icon plus text, no field chrome.
- **Code:** `src/app/(app)/deals/[id]/deal-detail.tsx:39-76`, `src/app/(app)/deals/deal-row.tsx:74-86`, `src/app/(app)/deals/deal-row.tsx:78`, `src/lib/config.ts:108-125`
- **Also found as:** VISUAL-012 (Lens: visual design system across every screen)
- **Verification:** confirmed. Seen in Chromium, in WebKit (double chevrons) and in dark mode (heavy filled boxes, verify-DEALS/dark--desktop-dark.png). For 8 options, number keys are enough and type-to-filter is unnecessary.

### DEALS-I05

**Replace Holding with Snooze until a date**

High · New capability · effort M · `/deals ('6 - Holding') and deal page` · Lists answer first and stay calm at 675 rows

- **Today:** 206 deals, almost a third of the pipeline, sit in '6 - Holding', and 147 of them have no next action. Holding isn't one of the view segments (All, TBD, Active, Pass), so these deals only come back if someone scrolls All or picks Holding in the status popover. Several say 'wait until price drop' with no date to check back.
- **Why:** Front and Superhuman treat 'not now' as a snooze with a return date: the item leaves the working list and comes back by itself. Workable does the same for hiring pipelines, with 1, 2 or 3 month presets and a note. A parking lot without return dates turns into a graveyard.
- **Change:** Replace Holding with Snooze. From the stage menu or ⋯, pick 1 month, 3 months, 6 months or a date, plus an optional one-line note. The deal leaves the live views, the stage cell shows 'Snoozed until Jan 15', and on that date it returns to its previous stage and appears on Home 'what needs me' that morning ('Back today: 758 Niagara St. You snoozed it Aug 31: wait until price drop'). For the 206 existing Holding deals, Connor picks one review date in a single bulk action.
- **Desktop, tablet, phone:** Desktop and tablet: a popover with preset rows and a calendar. Phone: a bottom sheet with the presets as large rows and the date picker below.
- **Reuse:** The Due date picker with quick picks from the tasks decision (React Aria date picker, approved), Home 'what needs me' (D10), and the stage menu from DEALS-020.
- **References:** 
  - [Front](https://mobbin.com/screens/935e62ed-da7a-42d7-9a0f-d3efe66e5746): Named snooze presets, each with its resolved time as a sublabel (Tomorrow, 'In 1 day at 9:00 AM').
  - [Superhuman Mail](https://mobbin.com/screens/3ae6bf95-6bbd-4232-b045-3160b748393c): 'Remind Me (Snooze)' is a first-class action with its own key (H), next to Mark Done.
  - [Workable](https://mobbin.com/screens/32e629a6-5300-49a5-b02f-adbabff3f70b): Outside the library, but a pipeline twin: 'Snooze for 1 month' with 1, 2, 3 months or Custom, 'Choose a specific date', and a note field.
  - [Linear](https://mobbin.com/screens/b4e6b70d-27e2-4853-8d0b-b44ab3d54967): Remind me submenu in the record menu: An hour from now, Tomorrow, Next week, A month from now, Custom.
  - [Linear](https://mobbin.com/screens/b67521b4-2e36-473d-ab67-81b33a6bbbe7): After setting it, the header shows '16 days from now' and a toast states the exact reminder time.
  - [Linear Mobile](https://mobbin.com/screens/2e52b05e-585c-42f0-bf03-5d7ae4bb4ee7): On the day the record returns to the inbox as 'You asked to be reminded about this issue'.
- **Code:** `src/app/(app)/deals/filters.tsx:8-13`, `src/lib/config.ts:4-13`
- **Also found as:** IA-I07 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. Reproduced exactly: 206 deals in '6 - Holding', 147 with no next action, and Holding missing from the All/TBD/Active/Pass segments (filters.tsx:8-13). It's reachable only through the status popover. Agreed this is the biggest workflow gap in the unit. A simpler build to consider: the schema already has Deal.nextActionDue, which nothing reads or writes, and tasks already link to deals. A snooze can then be Holding plus a dated 'Check price' task (see DEALS-V07), which reuses the approved Due date quick picks and Home 'what needs me' instead of adding a second date mechanism. The Workable ref says 'outside the library' but carries a Mobbin URL, so the wording is off. Front and Superhuman refs plausible.

### DEALS-IV01

**Stop clipping the last digit of prices on touch screens**

High · Fix · effort S · `/deals list on touch (tablet 768, phone 375)` · The phone is a chosen subset, and touch has no hover · quick win

- **Today:** On touch screens every field gets 16px text (globals.css:54-58), but the Their price and Our price cells keep their 100px default width (column-widths.tsx:11-12). At 768 the input needs 79px and gets 74px, so every six-figure price is cut: $425,000 shows as '$425,00' and $120,000 as '$120,00'. Phones do the same once the table is scrolled sideways.
- **Why:** A clipped amount reads as a different number. Stripe truncates text columns, never money.
- **Change:** On coarse pointers, show the price cells as read-only figures (fmtMoney, tabular numerals, right-aligned) that open the field on tap, so the 16px rule applies only while editing. Mouse layouts keep today's inline inputs.
- **Desktop, tablet, phone:** Desktop 1280: unchanged. Tablet 768: figures fit the 100px column, and a tap opens the 16px field over the cell. Phone 375: same until the list becomes rows of cards (DEALS-010).
- **Reuse:** fmtMoney (replacing priceDisplay, per the Duplicates table in docs/components.md) and the commit/Esc behavior of InlineAddressField, generalized as the inline text edit.
- **References:** 
  - [Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79): Amounts are right-aligned and never truncated.
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): Table cells are text at one size; editing happens elsewhere.
  - [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9): Amounts are right-aligned, never truncated, with digits at full size
  - [Attio](https://mobbin.com/screens/a44be622-b84a-4805-ad7a-6f600ece6356): Money cells are plain right-aligned text ('US$56,100,000.00') sized to fit; nothing is an input until the cell is opened, so figures never clip.
  - [Clay](https://mobbin.com/screens/ff20a3b3-a0d7-4b5b-bcad-6e1a4dd237aa): Cells are plain text; only the selected cell becomes an editor
  - [Stripe](https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c): Money columns sized so amounts never truncate
- **Code:** `src/app/globals.css:54-58`, `src/app/(app)/deals/column-widths.tsx:7-16`, `src/app/(app)/deals/deal-row.tsx:105-126`, `src/app/globals.css:51-58`, `src/app/globals.css:52-59`, `src/app/(app)/deals/deal-row.tsx:91-121`, `probe: tablet '$425,000 sw79/cw74'; desktop 'sw74/cw74'`, `src/app/globals.css:54-60`, `src/app/globals.css:54-59`, `eval at 768: price input scrollWidth 81 vs clientWidth 74; at 1280: 74 vs 74`, `src/app/(app)/deals/deal-row.tsx:95-125`
- **Also found as:** DEALS-005 (Deals pipeline, new deal and deal detail), VISUAL-004 (Lens: visual design system across every screen), MOBILE-004 (Lens: phone and tablet experience on every route), MOBILE-IV04 (Lens: phone and tablet experience on every route), DATA-004 (Lens: tables, numbers, money, charts and status), COPY-002 (Lens: words on every screen)
- **Verification:** verifier-found

### DEALS-V01

**Catch duplicates by street number and name, and flag the ones already in the pipeline**

High · Fix · effort M · `/deals and /deals/[id]` · Fix wrong numbers and records first

- **Today:** Some properties exist as two or three deals at different stages. 352 Auburn Avenue is Active (2 - Medium, our price $430,000) and is also two Holding deals: '352 Auburn Avenue Buffalo , NY 14213' at $525,000 and '352 Auburn Ave Buffalo 14213' at $510,000. 971 West Avenue is both Holding and Pass, and 348 Virginia St, 893 Columbus Parkway and 421 W Delavan are doubled too. findDuplicateDeal compares the whole normalized string, so 'buffalo 14213' and 'buffalo ny 14213' don't match. It also runs only on create, not when an address is edited.
- **Why:** One property's notes and prices are split across records with conflicting stages, so whichever record you open has an incomplete history and the counts are inflated. This is wrong data in a core job.
- **Change:** In findDuplicateDeal, match on addressKey (street number plus street name), on create and on address edit. When a deal page has a match, show one muted line under the heading, 'Also a deal: 352 Auburn Ave · Holding', linking to the other record. Put 'Merge' in the ⋯ menu: it moves the other record's notes and tasks into this one and keeps this stage. Run the match once over all 675 deals and list the pairs for Connor to merge or keep.
- **Desktop, tablet, phone:** One line under the heading at every size. On phone it shortens to 'Also a deal · Holding'.
- **Reuse:** addressKey in src/lib/normalize.ts; findDuplicateDeal in src/lib/deals/service.ts; the ⋯ menu from DEALS-030.
- **References:** 
  - [Attio](https://mobbin.com/screens/1fe247ff-420d-4334-a0f0-9efe664e666c): Existing records come up as you type, so '72 Mariner' surfaces the deal already in the pipeline before you create a second one.
  - [folk](https://mobbin.com/screens/ca3f42a1-bbf0-41fe-a634-9514f736f557): 'You're about to merge 2 people' lets you pick which values to keep, and Duplicates has a place in the sidebar.
  - [Calendly](https://mobbin.com/screens/9b1906d3-3035-4a74-a7ff-c72606a8bde5): Merge contacts shows both records side by side with a merge preview.
- **Code:** `src/lib/deals/service.ts:34-39`, `src/lib/normalize.ts:1-14`, `src/lib/normalize.ts:27-31`
- **Verification:** verifier-found

### DEALS-007

**Bad input on the New deal form crashes to an error page and loses everything typed**

Medium · Fix · effort M · `/deals/new` · Every save is safe, instant and undoable

- **Today:** The browser already blocks most bad input. type=url showed the native 'Please enter a URL.' bubble for 'zillow.com/foo', and min=1 blocks units below 1. Only an address of 1 to 3 characters reaches the server unchecked. There dealSchema.parse throws, and withLog sends the form to the error boundary with everything typed lost. Any other server failure does the same. Create deal has no pending or disabled state. The native validation bubbles are also off-brand next to the app's own controls.
- **Why:** Stripe and Attio validate inline and keep what you typed. A crash page over a typo makes the app feel unfinished.
- **Change:** Use useActionState with withResult. Return field errors and render them as one line under each field ("Enter a street address"), keeping the values. Disable the button and relabel it "Creating…" while pending. Make the browser rules match the schema (minLength 4).
- **Desktop, tablet, phone:** Same at every size. The error line stays on one line at phone width.
- **Reuse:** withResult; build the shared Field wrapper with an error line, which components.md lists as a known gap (Form field layout).
- **References:** 
  - [Attio](https://mobbin.com/screens/559623c8-0b2f-4e9e-a144-dc330ee1c80b): Compact create form with clear Cancel and submit actions.
- **Code:** `src/app/(app)/deals/actions.ts:16-36`, `src/app/(app)/deals/new/page.tsx:13-48`
- **Verification:** partly. The missing pending state and the crash-to-boundary path are real. The Attio reference supports a compact form, but not inline field errors.

### DEALS-011

**Rebuild the deal page as a two-column record, with activity on the left and details on the right**

Medium · Design change · effort L · `/deals/[id]` · One record layout for every record

- **Today:** The deal page is a single 672px column, centered. It has a "Deal" card that contains a second bordered box of label rows, then an "Activity timeline" card. At 1280 almost half the width is empty, and the card-inside-a-card doubles the borders and padding.
- **Why:** Attio and Stripe put a record's facts in a right-hand rail and its history in the main column, so you can see both without scrolling.
- **Change:** Header across the top (DEALS-030). Main column of about 640px: the note composer, then activity. A sticky right rail of about 320px: Details (Stage, Asking, Our max, Current offer, Units, Listing, Next action with due date), then Tasks (DEALS-034), then the property once closed. Rail rows are flat, with no inner box.
- **Desktop, tablet, phone:** Desktop: two columns. Tablet: one column with details first, then activity. Phone: Details and Activity tabs, with Details open by default.
- **Reuse:** Card for the rail sections; Field-style rows; removes the inner bordered dl.
- **References:** 
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Activity in the main column, Record details in the right rail.
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): Timeline on the left, Details rail on the right, summary header above.
  - [Attio](https://mobbin.com/screens/1e7edb87-d0dc-458d-a439-b7d357ed8e7f): On iOS the same record splits into Details and Activity tabs.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:45-135`
- **Verification:** partly. The observation is accurate: max-w-2xl (672px), a bordered dl nested inside the Card, and a 'Deal' card title that restates the page. At 1280 every field and the start of the timeline still fit above the fold, so this is page composition rather than lost function, which makes it medium. Pair it with DEALS-030. I verified the Stripe reference 2cf3b950: Timeline on the left, Details on the right.

### DEALS-014

**Group the list by stage under sticky headers instead of sorting by status**

Medium · Design change · effort M · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** The default order is a status sort done in memory, so deals come out in stage order but with no visible breaks between stages. The only way to see a deal's stage is its colored select.
- **Why:** "How many are we touring, and what are they worth?" should take one glance. Linear's group headers and Pipedrive's stage totals answer it.
- **Change:** Add collapsible group headers, sticky under the column header, such as "Touring · 8 · $1.9M asking". Sorting applies within each group. Grouping makes the per-row pill secondary, so it can be quieter.
- **Desktop, tablet, phone:** Headers at every size. On phone they show just "Touring · 8", without the total.
- **Reuse:** Table and Th sticky; new GroupRow beside the page.
- **References:** 
  - [Linear](https://mobbin.com/screens/46088879-314c-405c-88b5-eb7820c05efb): Each group header shows the status icon, name, count and a + at the far right. The 'All issues | Active | Backlog' tabs sit above.
  - [Airtable](https://mobbin.com/screens/7612f4c4-4104-4dbc-8e5f-579dde687f2b): Each group carries its own subtotal (Avg 53) and the view ends on a grand total. Use the same for summed asking per stage.
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Groups by status with counts, collapsible.
  - [Pipedrive](https://mobbin.com/screens/2ff3c977-7902-48b5-8361-0c89710e5c2e): Value and deal count per stage.
- **Code:** `src/app/(app)/deals/page.tsx:13-16`, `src/app/(app)/deals/page.tsx:38-44`
- **Verification:** partly. Rows already come out in stage order, so grouping makes the list easier to scan but hides nothing today. That makes it medium. The reference holds up: my own search returned a Linear project list grouped as In Progress 2, Todo 2/3, Done 11 (https://mobbin.com/screens/ef923b0e-9a40-4fdd-80f2-f3aafb4f36ce).

### DEALS-015

**Order the view segments by pipeline and remove the status multiselect**

Medium · Design change · effort S · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** The segments read All 675 · TBD 17 · Active 13 · Pass 428. Holding (206 deals) and Closed (11) have no segment and can only be reached through the "All statuses" checklist, whose label also starts with "All". The default view, Active, is third.
- **Why:** A third of the pipeline is two clicks deep, and two controls both claim "All".
- **Change:** Order the segments Active · New · On hold · Closed · Passed · All, each with a count. With stage grouping (DEALS-014), the multi-status checklist isn't needed, so remove it.
- **Desktop, tablet, phone:** Desktop and tablet: one segmented control (six segments fit beside search at 768). Phone: a single view menu button (DEALS-026).
- **Reuse:** The segmented control in filters.tsx, pulled out into a shared SegmentedControl component as components.md recommends.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258): Status views with counts in lifecycle order.
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): A short row of views (All issues, Active, Backlog).
- **Code:** `src/app/(app)/deals/filters.tsx:8-13`, `src/app/(app)/deals/status-multiselect.tsx`
- **Verification:** confirmed. The 206 Holding count checks out: 675 minus 17 TBD, 13 Active, 428 Pass and 11 Closed. When the multiselect is active, no segment looks selected and the button shows the raw 'CLOSED!' value (verify-DEALS/dup352--closed--desktop-light.png).

### DEALS-017

**Search misses spelling variants like "Ave" and "Avenue"**

Medium · Fix · effort S · `/deals` · A quiet shell with real search, navigation and sign-in

- **Today:** Search does a raw substring match on the address. On All, "Prospect Ave" returns 19 deals and "Prospect Avenue" returns 17. Typing the full street name doesn't find deals stored with the abbreviation.
- **Why:** When you're looking for a past deal, typing the whole address shouldn't hide it.
- **Change:** Match against a normalized address: normalizeAddress already maps street suffixes. Also ignore commas and doubled spaces.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** normalizeAddress in src/lib/normalize.ts.
- **Code:** `src/app/(app)/deals/page.tsx:60`
- **Verification:** confirmed. Reproduced on All: 'Prospect Ave' returns 19 and 'Prospect Avenue' returns 17. Implementation note: normalizeAddress can't run inside a Prisma contains. This needs a stored normalized address column, or the query expanded to both suffix forms.

### DEALS-018

**Ask why when a deal is passed, answerable in one click**

Medium · New capability · effort M · `/deals and /deals/[id]` · Lists answer first and stay calm at 675 rows

- **Today:** You can set a deal to Pass from the list's select without any prompt. The Pass reason field only appears on the deal page afterwards. Reasons end up in Next action instead: 321 Vermont has Next action "Commercial storefront so cannot do" and Pass reason "—".
- **Why:** Recording a decision is a core job, and reasons make the 428 passes searchable later. Wellfound's Fail button offers reason chips in one click.
- **Change:** Choosing Passed opens a small popover with DEAL_PASS_REASONS as chips and an optional note line. Picking a chip saves the stage and reason and logs "Passed: Price" to the timeline. Skipping is allowed.
- **Desktop, tablet, phone:** Desktop and tablet: a popover anchored to the stage pill. Phone: a bottom sheet.
- **Reuse:** DEAL_PASS_REASONS in src/lib/config.ts; React Aria Popover and Sheet.
- **References:** 
  - [Wellfound](https://mobbin.com/screens/1229140b-783f-41e9-9b4c-9891344bea5b): A Fail split button with reason chips.
  - [Stripe](https://mobbin.com/screens/c16180c0-adea-4054-b67d-8bc187348fcb): A reason select plus an optional note in a small dialog.
  - [Attio](https://mobbin.com/screens/bac70cbe-cc24-40e7-b7dd-81cafe7e1964): A close-lost reason field on the iOS deal entry.
  - [Attio](https://mobbin.com/screens/e275641a-a3e8-440a-b53e-983bb9cec7c7): Sales template carries a Close-lost reason attribute alongside Stage
- **Code:** `src/app/(app)/deals/deal-row.tsx:74-86`, `src/app/(app)/deals/[id]/page.tsx:85-89`, `src/app/(app)/deals/deal-row.tsx:77`
- **Also found as:** JOURNEYS-028 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Confirmed on 321 Vermont: Next action reads 'Commercial storefront so cannot do' and Pass reason is empty (verify-DEALS/auburn--vermont--desktop-light.png).

### DEALS-019

**Show an Undo toast after a stage change**

Medium · New capability · effort M · `/deals` · Every save is safe, instant and undoable

- **Today:** Changing status in a filtered view saves right away with a 700ms green row flash. Once the page refreshes, a deal that no longer matches (Active moved to Pass) disappears, and the only way back is to go find it.
- **Why:** A one-click change should be reversible. The approved spec already sets this pattern for task reschedules.
- **Change:** Show "Moved to Passed · Undo" for six seconds. Undo restores the previous stage and removes the log line.
- **Desktop, tablet, phone:** Bottom center on desktop and tablet; above the phone bottom bar on phone.
- **Reuse:** The settled Undo toast from the Asana migration spec (Toast is a known gap in components.md).
- **References:** 
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): "Added to block list." toast with Undo.
  - [Stripe](https://mobbin.com/screens/cffea421-b951-4ba7-8ddd-571a990d3ed1): "Customer created" toast with View.
- **Code:** `src/app/(app)/deals/deal-row.tsx:35-42`, `src/app/(app)/deals/deal-row.tsx:54`
- **Verification:** confirmed. The row flash is 700ms (deal-row.tsx:35-42). The Stripe 2cf3b950 reference is real and shows exactly an Undo toast. This builds on the settled Undo toast.

### DEALS-021

**The status picker snaps back to the old value while saving**

Medium · Fix · effort S · `/deals/[id]` · Every save is safe, instant and undoable

- **Today:** The deal page select only shows the value from the server. After I picked Pass, it read "1 - High" (disabled and dimmed) until the save returned.
- **Why:** It looks like the choice didn't take, which invites a second click.
- **Change:** Use useOptimistic so the new stage shows immediately, and revert with an error message if the save fails (DEALS-002).
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** StatusControl in deal-detail.tsx.
- **Code:** `src/app/(app)/deals/[id]/deal-detail.tsx:46-58`
- **Verification:** confirmed. Confirmed by code: the select's value={status} is controlled by the server prop, so React resets it to the old value until the refresh lands. I couldn't capture the pending moment because the harness aborts the write at once.

### DEALS-022

**Give each stage its own color and stop using red for "High"**

Medium · Design change · effort S · `/deals` · One design system, fixed in the primitives

- **Today:** "3 - Low", "6 - Holding" and "Pass" all use gray. "1 - High" uses the red tone that marks errors and danger buttons elsewhere. Every row carries a tinted box.
- **Why:** The house rule gives each status a fixed tone that nothing else in the view reuses. Red reads as broken, and 300 tinted boxes is color without a job.
- **Change:** Use a colored dot with a neutral label, as Linear and Attio do, so each stage can have its own hue without a tinted box. Keep red for errors only. Closed is green and Passed is gray. Show priority as an icon, not a color (DEALS-013).
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** Badge with a new dot variant; the tone map in src/lib/config.ts.
- **Challenges:** CLAUDE.md Personality: statuses use the six Badge tones. Eight stages need more distinct marks than six tones, so this adds dot hues outside the Badge set.
- **References:** 
  - [Attio](https://mobbin.com/screens/eab1b4ff-9efc-4d6d-9065-68afe3514255): Stage names with distinct dots on neutral surfaces.
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Status icons with neutral row text.
- **Code:** `src/lib/config.ts:108-128`
- **Verification:** confirmed. Gray is shared by '3 - Low', '6 - Holding' and 'Pass' (config.ts:117-126), which breaks the house rule that a status tone isn't reused. Red for High goes away once DEALS-013 moves priority out of the stage. conflicts_with is named correctly.

### DEALS-030

**Put the deal's headline numbers and actions in the page header**

Medium · Design change · effort M · `/deals/[id]` · One record layout for every record

- **Today:** The header is a back link and an editable address. Status, prices and units sit in a card below it, and there are no actions at the top: no Pass, no archive, no open listing.
- **Why:** Stripe's payment page leads with the amount, the status badge and the main actions, so you get the story in one line.
- **Change:** Header: a small "Deal" label, the street as the title with the city muted below, the stage pill and priority, then "Asking $425,000 · Our max $380,000 · 4 units". Actions on the right: Pass (secondary), an Open listing icon, and a ⋯ menu (Archive, Copy link).
- **Desktop, tablet, phone:** Desktop and tablet: actions to the right of the title. Phone: the figures wrap to their own line, and everything except the stage pill moves into ⋯.
- **Reuse:** PageHeader actions slot; Badge; LinkButton.
- **References:** 
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): Amount, status badge and Refund or ⋯ in the header.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Record title with quick actions on the right.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:46-59`
- **Verification:** confirmed. The Stripe 2cf3b950 reference shows the amount, a status badge, Refund and a ⋯ button in the header, as cited.

### DEALS-031

**Show prices the same way on the list and the deal page**

Medium · Fix · effort S · `/deals/[id]` · Money, numbers and dates read one way

- **Today:** The list shows "$425,000" and "$233,000". The deal page shows what was typed: "425k" and "233k".
- **Why:** The same number in two formats looks like two numbers.
- **Change:** At rest, show the formatted amount (or the raw text if it isn't a number). Switch to the raw text on focus for editing, with a parsed preview while typing (DEALS-041).
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** fmtMoney in src/lib/utils.ts; replaces priceDisplay in deal-row.tsx (listed as a duplicate in components.md).
- **References:** 
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): One money format across header, breakdown and details.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Detail values always formatted the same way as in lists
  - [Stripe](https://mobbin.com/screens/f8db8469-2830-4c6b-98ca-53bf4c1e3caf): Amounts always rendered in one currency format across list and detail
- **Code:** `src/app/(app)/deals/[id]/deal-detail.tsx:157-174`, `src/app/(app)/deals/deal-row.tsx:26-29`, `src/app/(app)/deals/deal-row.tsx:26`, `src/app/(app)/deals/[id]/deal-detail.tsx:157-175`, `probe: 'theirPriceRaw=425k', 'ourPriceRaw=380k'`, `src/app/(app)/deals/deal-row.tsx:25-28`, `src/app/(app)/deals/[id]/deal-detail.tsx:157-171`, `src/app/(app)/deals/[id]/deal-detail.tsx:135-155,157-175`
- **Also found as:** VISUAL-019 (Lens: visual design system across every screen), IA-V05 (Lens: information architecture and global SaaS patterns), MOBILE-V05 (Lens: phone and tablet experience on every route), FEEL-042 (Lens: interaction quality, feedback, states, speed and accessibility), DATA-032 (Lens: tables, numbers, money, charts and status), COPY-029 (Lens: words on every screen), JOURNEYS-044 (Lens: the core jobs, end to end)
- **Verification:** confirmed. The list shows '$425,000', the deal page shows '425k', and 767 Prospect shows '233k' (verify-DEALS/auburn--prospect767--desktop-light.png).

### DEALS-032

**Stack labels above values on the phone deal page**

Medium · Design change · effort S · `/deals/[id]` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 the label column is a fixed 128px of uppercase text, leaving about 180px for values. "Paste a listing URL…" is cut to "Paste a listing UR", and the card plus the inner box take another 48 or so pixels of padding.
- **Why:** Values are the content, and on a phone they get the least room. Attio on iOS puts each label above its value.
- **Change:** On phone, put a muted sentence-case label above each value in full-width rows, with no inner bordered box. Tablet and desktop keep labels beside values in the rail.
- **Desktop, tablet, phone:** Phone stacks. Tablet and desktop stay side by side.
- **Reuse:** The Row in [id]/page.tsx, or Field in ui.tsx, which already stacks.
- **References:** 
  - [Attio](https://mobbin.com/screens/1e7edb87-d0dc-458d-a439-b7d357ed8e7f): Stacked label and value pairs on iOS.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:19-28`, `src/app/(app)/deals/[id]/page.tsx:66`
- **Verification:** confirmed. At 375, 'Paste a listing UR' is cut off and the values get about 180px (verify-DEALS/crest--livingston--mobile-light.png).

### DEALS-034

**Show the deal's tasks, with Add task, on the deal page**

Medium · New capability · effort M · `/deals/[id]` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. /deals/[id] has only the Deal card and Activity timeline. There is no Tasks section and no Add task link, even though /tasks/new?dealId= still works and the task service revalidates /deals/[id] on every task change.
- **Today:** Tasks can belong to a deal: Task.dealId exists, /tasks/new?dealId= works, and it logs to the deal's timeline. But nothing on the deal page lists those tasks or links to create one, so the only way in is typing the URL.
- **Why:** With Asana going away, tasks are where follow-ups live. A deal page should show its own open work.
- **Change:** Add a Tasks section to the rail: open tasks with due dates using the existing task row, an "Add task" link that fills in the deal, and completed tasks collapsed ("2 done").
- **Desktop, tablet, phone:** Desktop: in the rail. Tablet: after Details. Phone: its own section, or a tab next to Details and Activity.
- **Reuse:** Task row components in src/app/(app)/tasks/; /tasks/new?dealId.
- **References:** 
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Record tabs carry counts (Tasks 0, Notes 0, Files), so a deal's open tasks show without opening a tab.
  - [Linear](https://mobbin.com/screens/7c88fd2a-866e-4db1-b3ac-38cb5cd2c043): Sub-issues sit inline on the record with a count (0/4) and a + to add one in place.
  - [Rox](https://mobbin.com/screens/615ec2ea-512f-4f0a-9b2e-788211d40606): Upcoming and completed tasks inside the opportunity, with Add Task.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Related sections (Subscriptions, Payments), each with a '+' button, and a details rail.
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): Tasks tab with a count on the record.
  - [Attio](https://mobbin.com/flows/ed18fe27-a14a-4331-9d02-c5dceb2c60b9): Record page tabs include Tasks next to Activity, Notes and Files
- **Code:** `src/app/(app)/tasks/new/page.tsx:9-28`, `prisma/schema.prisma:73`, `src/app/(app)/deals/[id]/page.tsx:33-39`, `src/app/(app)/deals/[id]/page.tsx:31-133`, `src/app/(app)/tasks/new/page.tsx:16,26,31`, `src/lib/tasks/service.ts:47`, `src/app/(app)/page.tsx:54-72 (Home card pattern to reuse)`, `prisma/schema.prisma:65`, `src/app/(app)/deals/[id]/page.tsx:62-137`, `branch: src/app/(app)/deals/[id]/page.tsx:107-128`, `branch: prisma/schema.prisma:77`, `src/app/(app)/tasks/new/page.tsx:9-28 (dealId supported)`, `src/app/(app)/deals/[id]/page.tsx (no tasks query or link)`, `branch src/app/(app)/deals/[id]/page.tsx (no tasks query)`, `branch src/app/(app)/tasks/new/page.tsx:12,31`
- **Also found as:** IA-027 (Lens: information architecture and global SaaS patterns), JOURNEYS-031 (Lens: the core jobs, end to end)
- **Verification:** confirmed. A grep finds no link anywhere in src to /tasks/new?dealId=, and the deal query includes only notes and convertedProperty.

### DEALS-038

**Warn about a duplicate address while it's being typed**

Medium · New capability · effort S · `/deals/new` · Create where you are

- **Today:** Duplicates are only detected after submitting (findDuplicateDeal), and then the user is redirected without explanation (DEALS-003).
- **Why:** Catching the duplicate while typing saves the round trip and the lost input.
- **Change:** Look up the address as it's typed (debounced) and show one line under the field: "Already a deal: 29 Livingston St · High" with "Open it". Create stays enabled, for addresses with separate units.
- **Desktop, tablet, phone:** One line under the field at every size.
- **Reuse:** findDuplicateDeal in src/lib/deals/service.ts, behind a GET route (or reuse /api/search).
- **References:** 
  - [Attio](https://mobbin.com/screens/1fe247ff-420d-4334-a0f0-9efe664e666c): A single 'Find or add a person...' field lists matching records first and only creates something new when nothing matches. Use it for the address field in New deal.
  - [Dub](https://mobbin.com/screens/a4d79497-fb92-4c42-aeed-92f98a2791e8): An inline warning icon sits on the conflicting field while the rest of the dialog stays editable.
  - [folk](https://mobbin.com/screens/75065e3c-d49c-43fc-8705-fc5d622b140c): Points out the possible duplicate right away.
- **Code:** `src/lib/deals/service.ts:33-39`, `src/lib/deals/service.ts:52-57`
- **Verification:** confirmed. The live check should use addressKey rather than findDuplicateDeal's full-string match, or it misses the variants already in the data (DEALS-V01).

### DEALS-040

**Reject links in the address field and fix the Crestwood deal**

Medium · Fix · effort S · `/deals` · Fix wrong numbers and records first

- **Today:** The only address check is a minimum of 4 characters. "27+Crestwood+Avenue+Buffalo+14216?entry=gmail&source=g" was saved. It has no spaces, so it can't wrap, makes the row taller and runs out of the address column in the TBD view.
- **Why:** Junk data breaks the layout and the search.
- **Change:** Reject addresses that contain "?", "http" or "+", with the message "Paste the link in Listing URL". Fix the Crestwood deal to "27 Crestwood Avenue, Buffalo, NY 14216".
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** The deal schema in src/app/(app)/deals/actions.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/85da4e09-98b5-4461-b34b-3653b5083e6f): Specific inline error under the field
- **Code:** `src/app/(app)/deals/actions.ts:17`
- **Also found as:** COPY-032 (Lens: words on every screen)
- **Verification:** confirmed. Confirmed: the Crestwood row and heading are unbroken text. Extend the same check to the 'UNDER CONTRACT' and partner-note suffixes in DEALS-V02.

### DEALS-042

**Separate notes from automatic change entries in the activity timeline**

Medium · Design change · effort M · `/deals/[id]` · One record layout for every record

- **Today:** Status flips, address edits and "Listing URL added" entries sit between people's notes at nearly the same weight. On 29 Livingston, 13 of 18 entries are automatic changes, mostly same-day status flips.
- **Why:** The notes people wrote get buried. Attio collapses changes into one line you can expand.
- **Change:** Show notes as the main entries, with author initials and the text. Show changes as single muted lines, and collapse consecutive changes by the same person on the same day into "Connor changed status 6 times · Show". Group entries under month headings.
- **Desktop, tablet, phone:** Same structure at every size. On phone, changes stay collapsed by default.
- **Reuse:** The timeline in [id]/page.tsx.
- **References:** 
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): "changed Stage and 7 other attributes" with Hide all changes.
  - [Attio](https://mobbin.com/screens/092b823d-ccad-41b4-ae03-53decae9f257): Month-grouped activity with "Show all changes" on iOS.
  - [Attio](https://mobbin.com/flows/ed18fe27-a14a-4331-9d02-c5dceb2c60b9): Activity line summarising attribute changes with "Show all changes"
  - [ClickUp](https://mobbin.com/screens/3a6160ae-bbc4-4ade-8914-228e7e89f839): "6 more updates" collapses routine changes
- **Code:** `src/app/(app)/deals/[id]/page.tsx:106-131`, `src/lib/deals/service.ts:111-112`
- **Also found as:** JOURNEYS-027 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Counted on 29 Livingston: 13 of 18 entries are automatic changes, including 7 status flips on Aug 31 (verify-DEALS/liv--tl-hover--desktop-light.png).

### DEALS-043

**Undated imported notes show the import time as their date**

Medium · Fix · effort S · `/deals/[id]` · Fix wrong numbers and records first

- **Today:** Imported notes without a date fall back to the import timestamp and show it with a time ("Aug 30, 2026, 7:04 PM · imported" on 321 Vermont), and that entry sits above a dated note from Nov 2025.
- **Why:** It presents a false date on the deal's history.
- **Change:** Label these notes "Undated · imported" and list them after the dated entries (sort undated last).
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** The timeline query and render in [id]/page.tsx.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:36`, `src/app/(app)/deals/[id]/page.tsx:116-117`
- **Verification:** confirmed. 321 Vermont shows 'Aug 30, 2026, 7:04 PM · imported' above Nov 4, 2025. Postgres sorts NULL noteDate first in a DESC order, so undated notes always lead.

### DEALS-044

**Store who wrote each note, and show it the same way every time**

Medium · Fix · effort S · `/deals/[id]` · One record layout for every record

- **Today:** One timeline uses three author formats: "seeing tomorrow (CS)", "going to see it tomorrow — Connor Swofford" and "Status: … · Pieter Louw". The author is pasted into the note text, so it also shows up in the list's Latest note column.
- **Why:** Inconsistent signatures look careless, and the record of who did what isn't structured.
- **Change:** Add an author field to DealNote and show initials, name and time above the text. Fill it for existing notes by parsing the current endings.
- **Desktop, tablet, phone:** Initials and name at every size; phone drops the time to the date only.
- **Reuse:** initials in src/lib/utils.ts; src/lib/deals/log.ts.
- **References:** 
  - [Stripe](https://mobbin.com/screens/966b2f85-123b-4302-b505-08eb9b5a9724): Each timeline note has its author and time as metadata.
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): A timeline step reads 'Submitted Oct 28th at 6:11pm by' plus the person, as metadata rather than inside the content
  - [Linear Mobile](https://mobbin.com/screens/f03367b0-cbbe-497c-bfc5-4479a5ed4fd1): A comment card with the author and time on a header line and the text below
- **Code:** `src/lib/deals/service.ts:149`, `src/lib/deals/log.ts:27-33`, `src/lib/deals/service.ts:147-158`, `prisma/schema.prisma:83-93`
- **Also found as:** G2B-V05 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- **Verification:** confirmed. One timeline mixes '(CS)', '— Connor Swofford' on its own line, and '· Pieter Louw' (verify-DEALS/liv--tl-hover--desktop-light.png). The Stripe 966b2f85 reference is real: a note reading 'by Sam Lee' with its time.

### DEALS-049

**Open deals in a side panel for triage**

Medium · New capability · effort M · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** Opening a deal goes to a full page, and triaging the next one means going back to the list. The back link restores filters, but you lose your place for a moment each time.
- **Why:** Twenty and Mercury open a record in a side panel with previous/next, so you can work down a list without leaving it.
- **Change:** Clicking a row opens a 420px right-hand panel: header (street, stage pill, figures), details, the latest three notes, a note box, and Open full page (⌘↵). Arrows and j/k move to the next row. Esc closes it.
- **Desktop, tablet, phone:** Desktop: the panel sits beside the list. Tablet: it covers the list. Phone: no panel; rows open the full page.
- **Reuse:** The rail components from DEALS-011; a React Aria Dialog shown as a panel.
- **References:** 
  - [Mercury](https://mobbin.com/screens/b5b9a184-bd88-48e7-ba5a-f3f151278cc2): The right drawer has up and down arrows that step through the transactions list without closing, and the list keeps its place on the left.
  - [Attio](https://mobbin.com/screens/825084e6-a0f2-4f5c-9797-49a771fa16a3): The record header reads '28 of 75 in All Companies' with up and down arrows, naming the view you are stepping through.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): In the split inbox, the list stays visible beside the open item, so triage never loses your place.
  - [Twenty](https://mobbin.com/screens/02d0d302-bdc3-4b3c-bdda-7675ba46819e): A side panel from the table with Open ⌘↵.
  - [Linear](https://mobbin.com/flows/3528703d-a543-414c-8f6e-ccf2442bff2f): Issue page with "1 / 11" and up/down arrows to step through the list
- **Code:** `src/components/back-link.tsx`, `src/app/(app)/deals/[id]/page.tsx:46-59`
- **Also found as:** JOURNEYS-033 (Lens: the core jobs, end to end)
- **Verification:** confirmed. This is consistent with DEALS-008 as long as both say rows open the panel on desktop and the page on phone.

### DEALS-050

**Let people archive junk or test deals**

Medium · New capability · effort S · `/deals/[id]` · Lists answer first and stay calm at 675 rows

- **Today:** Deals can't be deleted or archived. Records like the Crestwood link and test notes ("8/27 - this is a test note" on 29 Livingston) stay forever and count toward "All 675".
- **Why:** Without a way to clean up, the data and the counts lose credibility.
- **Change:** Put "Archive" in the deal's ⋯ menu, with an Undo toast. Archived deals drop out of every view and count and can be found with an Archived filter.
- **Desktop, tablet, phone:** In the ⋯ menu at every size.
- **Reuse:** ConfirmDialog is not needed, since Undo covers mistakes; the toast from DEALS-019.
- **References:** 
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): Secondary actions in the record's ⋯ menu, with an Undo toast.
- **Code:** `src/lib/deals/service.ts`
- **Verification:** confirmed. The test note on 29 Livingston and the Crestwood junk deal are both still there. Notes themselves can't be removed either (DEALS-V03).

### DEALS-056

**The listing link in a row can't be reached on touch**

Medium · Fix · effort S · `/deals` · The phone is a chosen subset, and touch has no hover

- **Today:** The ↗ link is only opacity-0. It is still laid out and tappable, so on touch a tap just right of the address opens the external listing with no visible target. It's also rare: 1 of the first 300 rows in All has a listing URL.
- **Why:** House rule: touch has no hover, and the fix isn't to make the cue permanent.
- **Change:** Take it out of the rows and put "Open listing" in the deal header and side panel (DEALS-030).
- **Desktop, tablet, phone:** Desktop rows can keep the hover link. Touch uses the header action.
- **Reuse:** deal-row.tsx.
- **Code:** `src/app/(app)/deals/deal-row.tsx:60-70`, `eval on mobile viewport: [{t:'↗', opacity:'0', width:18.5}]`
- **Also found as:** COPY-V06 (Lens: words on every screen)
- **Verification:** partly. Moving it to the header, as recommended, fixes both problems.

### DEALS-I01

**Show the live pipeline as a board with stage columns**

Medium · New capability · effort L · `/deals (Active and TBD views)` · Lists answer first and stay calm at 675 rows

- **Today:** Deals is a single table. The 13 Active deals are rows sorted by a status select, so you can't see how many deals sit at each stage or how much money is in each. Moving a deal means changing the native select in its row.
- **Why:** Attio and Linear show a pipeline as stage columns, so its shape is the first thing you read and a stuck stage is obvious. HG has about 30 live deals (13 Active plus 17 TBD), which fit on one screen as a board. The table makes you count rows.
- **Change:** Add a Board layout covering only the live stages from DEALS-013 (New, Touring, Offer, Under contract). Each column header shows the stage dot, name, count and summed asking in Geist Mono. Cards always use the same spots: street in bold with asking right-aligned, then a muted line '4 units · 12d in stage', then the next action on one line, with the owner's initials in the bottom-right corner. A card moves by dragging on desktop or through its stage pill menu, which is also the keyboard and touch path. Snoozed, Passed and Closed collapse into a 'Hidden' rail on the right that cards can be dropped onto, as in Linear. The view switches with a List | Board segmented control in the control row.
- **Desktop, tablet, phone:** Desktop 1280: four columns of about 240px fit beside the sidebar. Tablet 768: the board scrolls sideways inside its own area with snap points. The hidden rail becomes a 'Hidden (3)' button. Phone 375: there's no board. The switch disappears and the view renders as the grouped list, because sideways boards fail on phones (the Attio iOS lesson).
- **Reuse:** New, based on Attio's pipeline and Linear's board. Reuse the segmented control in deals/filters.tsx (slated to become SegmentedControl), Badge tones for stage dots, and the stage pill menu from DEALS-020 using the approved React Aria menu.
- **References:** 
  - [Attio](https://mobbin.com/screens/a2b97705-be0b-44a3-84ec-522316c873bf): Stage columns with a color dot, count and +. Cards show value, date, owner and last activity in fixed rows, with days in stage in the corner. View settings picks which attributes cards show.
  - [Attio](https://mobbin.com/screens/e275641a-a3e8-440a-b53e-983bb9cec7c7): A full board with counts per stage (Prospecting 14, Qualification 2) and the same card anatomy on every card.
  - [Linear](https://mobbin.com/screens/fc208a44-dbf9-4f79-b9b0-db57f9840964): The 'Hidden columns' rail (Backlog, Canceled, Duplicate) keeps closed stages out of the way but still reachable. A footer line says '1 issue hidden by filters'.
- **Code:** `src/app/(app)/deals/page.tsx:108-159`, `src/app/(app)/deals/filters.tsx:8-13`
- **Verification:** confirmed. Verified: /deals Active is one table of 13 rows grouped only by the status sort, with no per-status count or sum, and moving a deal is the native select in the row (deal-row.tsx:75-85). Mobbin spot-check: Attio's Sales pipeline board shows the same card anatomy the finding describes (count per column, value, date, owner, '0d'/'4d' days in the card corner, a Visible columns toggle). The cited IDs weren't in my results, but the pattern is real. It depends fully on DEALS-013, because today's statuses are priorities (1 - High ... 4 - To Schedule), not stages. To meet the simplicity bar: make Board the only layout for the live view and keep List for All and Pass, with no List | Board toggle. Also drop the drag-onto-Hidden rail, since the stage pill menu already covers Snooze and Pass.

### DEALS-I02

**Show days in stage so stale deals surface without opening them**

Medium · New capability · effort M · `/deals list rows and board cards` · Lists answer first and stay calm at 675 rows

- **Today:** Updated reads Aug 30, 2026 on 297 of the first 300 rows of All and 11 of 13 Active rows, so it can't show staleness. At 1280 the table (1210px) overflows its card (1150px), and the Updated column is cut off behind a sideways scroll inside the card.
- **Why:** Attio puts time in stage in a fixed corner of every pipeline card (0d, 3d, 5d), and Sentry gives every row an Age column. It's the single number that shows which deals have stalled, and it doesn't move when someone fixes a typo.
- **Change:** Store stageChangedAt on Deal and backfill it from the latest 'Status:' change line. Add a narrow right-aligned 'In stage' column ('12d') in muted Geist Mono, sortable, sitting to the left of Last activity (DEALS-047). Past 30 days the figure switches from muted to foreground text, with no new color or weight, so long waits stand out without a new status tone. Board cards show the same figure in their bottom row.
- **Desktop, tablet, phone:** Desktop and tablet: its own narrow column. Phone: appended to the row's second line ('4 units · 12d'). Sorting by it stays in the phone view menu.
- **Reuse:** Extend DealRowEditable in deals/deal-row.tsx and SortHeader. Set the field in patchDeal in src/lib/deals/service.ts whenever status changes.
- **References:** 
  - [Attio](https://mobbin.com/screens/a2b97705-be0b-44a3-84ec-522316c873bf): A clock icon with '0d' in the card's bottom-right corner, the same spot on every card.
  - [Attio](https://mobbin.com/screens/e275641a-a3e8-440a-b53e-983bb9cec7c7): Across a full board, 3d, 5d, 2d and 4d sit in the same corner, so they can be compared at a glance.
  - [Sentry](https://mobbin.com/screens/92525937-e703-4e62-bd8a-2b6bcb7ca627): Narrow 'Last Seen' and 'Age' columns of short relative times.
- **Code:** `src/app/(app)/deals/deal-row.tsx:150`, `src/lib/deals/service.ts:96-97`
- **Verification:** partly. The observation holds and is stronger than stated: Updated reads 'Aug 30, 2026' on 297 of the first 300 rows in All, all 206 Holding rows and 11 of 13 Active rows, so the column carries no signal. Two problems with the recommendation. (1) Backfilling from 'Status:' lines gives nothing for nearly every deal, because statuses came from the spreadsheet import, not from change lines, so on day one almost every row would read the same ~54d. Backfill from the import date and say so, or show the figure only after a real stage change. (2) The table is already 1210px inside a 1150px card at 1280, which cuts off the Updated column ('UPDA'). 'In stage' must replace Updated, not join it beside a Last activity column. Attio refs fit the pattern.

### DEALS-I04

**Write out the gap between asking and our max**

Medium · Design change · effort S · `/deals list and deal header` · Money, numbers and dates read one way

- **Today:** Only 29 Livingston of the 13 Active deals has both a Their price and an Our price. The deal page shows both as raw text ('425k', '380k'), while the list formats them ('$425,000').
- **Why:** The gap is what decides the next move: offer, wait or pass. Zillow puts the comparison to your own limit next to the price ('Under target by $15,058', with 'Your target' and 'Your max' beside it), so nobody has to do the math.
- **Change:** Under Our max, show the gap in muted Geist Mono: '$45k over' when asking is above our max, 'At max' when they match, '$10k under' when below. Make the column sortable by gap. Keep it neutral, because green is reserved for money in. Within 5% the text switches to foreground so deals close to a number stand out. The deal header (DEALS-030) shows 'Asking $425,000 · Our max $380,000 · $45k apart'.
- **Desktop, tablet, phone:** Desktop and tablet: a sublabel under Our max. Phone: line 2 shows '$45k over max' only when our max is set. Otherwise nothing.
- **Reuse:** Extend the price cells in deals/deal-row.tsx and use fmtMoney with compact output for the gap.
- **References:** 
  - [Zillow](https://mobbin.com/screens/27fe3126-473a-4bd5-9fe5-5a5b3c5b2d48): 'Under target by $15,058' sits beside the estimate, with 'Your target' and 'Your max' figures nearby: a price compared with the buyer's own limit.
  - [Zillow](https://mobbin.com/screens/c105ccb0-8726-49c8-851c-6bce01e8b6f4): Price history rows set the change beside the price ('$520,000 -5.4%'), the domain's own convention for price gaps.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Insights block shows a derived figure above the raw details
- **Code:** `src/app/(app)/deals/page.tsx:122-123`, `src/app/(app)/deals/[id]/page.tsx:70-75`
- **Also found as:** DATA-052 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. True that the deal page shows raw '425k'/'380k' and that the list puts the two prices in separate columns. But only 1 of the 13 Active deals (29 Livingston) has both prices, so the list sublabel would appear on one row and add a second line to a column that is mostly '—'. Keep the gap in the deal header only ('$45k apart') and skip the list sublabel and sort. My Zillow search ('target and max price') didn't surface the cited 'Under target by' screen, so the reference is unverified.

### DEALS-I11

**Add a Files section to the deal for memos, rent rolls and showing photos**

Medium · New capability · effort M · `/deals/[id]` · One record layout for every record

- **Today:** The deal page has a fields card and a timeline, and nothing else. There's nowhere to keep the offering memo, rent roll, inspection report or photos from a showing. The shared Attachments uploader supports only the 'task' and 'property' kinds.
- **Why:** Attio gives every record a Files tab with Upload file. Jobber puts 'Attach files & photos' right in the note composer, and Mercury takes attachments in the record drawer. Underwriting runs on these documents, and today they live in email.
- **Change:** Add a Files section to the deal rail, or a Files tab once the record has tabs (DEALS-011), using Attachments with a new 'deal' kind. Add an attach button to the note composer so a showing photo lands with its note. When the deal converts to a property (DEALS-036), its files move to the property's Documents.
- **Desktop, tablet, phone:** Desktop: a rail section under Details. Tablet: stacked under details. Phone: 'Add photo' opens the camera, and files list as two-line rows (name, then date and size).
- **Reuse:** Attachments in src/components/attachments.tsx, extended with kind 'deal', plus the property Documents that already use it.
- **References:** 
  - [Attio](https://mobbin.com/screens/7a561314-128a-4336-aafc-d1f570283204): Files tab on a record with Upload file and Create folder, one row per file with its date.
  - [Jobber](https://mobbin.com/screens/19ac56a2-4e6f-4c99-aa80-02c6eed8d5b3): The Notes rail has 'Attach files & photos' and a drop zone inside the note composer.
  - [Mercury](https://mobbin.com/screens/ed84df94-2b05-4afc-b05f-49213b391967): The record drawer has an Attachments drop zone ('Drag and drop here or click to upload') above comments.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:61-134`, `src/components/attachments.tsx:20-40`, `docs/components.md:54`
- **Verification:** confirmed. Verified: the deal page is a fields card plus the timeline (deals/[id]/page.tsx:61-134), and AttachmentKind is 'task' | 'property' (attachments.tsx:9). The closed deals' imported notes mention financing and proof documents with nowhere to keep them. Extending Attachments with 'deal' is the right reuse. Mobbin: Attio's record Files tab (Upload file, Create folder, one row per file with date) appeared in my search, so the pattern is backed.

### DEALS-I12

**Make the next stage the deal page's main button**

Medium · Design change · effort S · `/deals/[id] header` · One record layout for every record

- **Today:** The only way to move a deal is the colored native status select inside the 'Deal' card. The page has no main action, and a closed deal reads 'CLOSED!' with no step that creates the property.
- **Why:** Jobber's record header makes the next lifecycle step the main button ('Convert to Quote', then 'Convert to Job'), so the page always says what to do next. Gusto's principle of entering data once means closing a deal should carry its data into the property.
- **Change:** The header's right side holds one main button named for the next stage: New gets 'Schedule showing', Touring gets 'Make offer', Offer gets 'Mark under contract', Under contract gets 'Mark closed', and Closed gets 'Create property'. Next to it sit the stage pill (a menu for any other stage) and ⋯ (Snooze, Pass, Archive). 'Create property' copies the address, units and price into a new property and links the two (DEALS-036).
- **Desktop, tablet, phone:** Desktop and tablet: right side of the header. Phone: a full-width main button under the title and address, with the stage pill and ⋯ beside it, as in Jobber iOS.
- **Reuse:** Button primary from ui.tsx, plus the stage pill menu from DEALS-020. Depends on the stage split in DEALS-013.
- **References:** 
  - [Jobber](https://mobbin.com/screens/ec252fff-64da-4154-bfed-ccfc579fb2b7): An approved quote's header has 'Convert to Job' as the main button, with Edit and More Actions as secondary buttons.
  - [Jobber](https://mobbin.com/screens/3bd617fc-464a-4f6d-891f-4b65f962b2cb): On the phone, the status chip sits above the title, with the next steps as full-width buttons ('Schedule Assessment', 'Convert to Quote') and ⋯.
- **Code:** `src/app/(app)/deals/[id]/deal-detail.tsx:39-80`, `src/app/(app)/deals/[id]/page.tsx:51-58`
- **Verification:** confirmed. Verified: the status select inside the 'Deal' card is the only stage control on the page, and nothing in src creates a convertedPropertyId. All 11 CLOSED! deals show no 'Converted →' link (see DEALS-V03). The Jobber reference ec252fff came back in my search and matches ('Convert to Job' primary, Edit and More Actions secondary). Effort S holds only after the DEALS-013 stage split, since today's statuses are priorities with no 'next stage'.

### DEALS-IV03

**Link the 11 closed deals to the properties they became**

Medium · Fix · effort S · `/deals/[id] for CLOSED! deals` · Fix wrong numbers and records first

- **Today:** None of the 11 CLOSED! deals has convertedPropertyId set, so none shows the 'Converted →' line the page already renders (deals/[id]/page.tsx:51-58). That includes 767 Prospect, 118 Congress, 647 Prospect and 58 Mariner, which are portfolio properties. Their closing history ('42k cash to close', 'earnest money is in') is cut off from the asset. Three of these deals also carry the stage in the address text ('118 Congress Street  UNDER CONTRACT', '647 Prospect Avenue UNDER CONTRACT', '15 Oxford Ave  UNDER CONTRACT').
- **Why:** Closing the loop means a property's purchase record is one click away. Today the link exists in the schema but is empty for every deal.
- **Change:** Run a one-time backfill that matches each CLOSED! deal to its property by normalizeAddress, sets convertedPropertyId, and strips 'UNDER CONTRACT' from the three addresses. The existing 'Converted →' line then appears. The property hub's Activity tab (D10) can show the reverse link later.
- **Desktop, tablet, phone:** No layout change at any size.
- **Reuse:** The Deal.convertedProperty relation, the existing Converted line, and normalizeAddress in src/lib/normalize.ts.
- **References:** 
  - [Attio](https://mobbin.com/screens/8f45efe4-1011-4a3b-bed0-ea66509ed4fb): A Lists card in the record rail shows the pipeline the record belongs to, its stage and when it was added.
  - [Stripe](https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2): The relation sits as a link right under the key figure ('Charged to Leonard Kim').
- **Code:** `src/app/(app)/deals/[id]/page.tsx:51-58`, `prisma/schema.prisma:72-73`, `src/app/(app)/properties/[id]/page.tsx:51 and :218-225`, `grep for convertedPropertyId: only read in deals/[id]/page.tsx:37 and properties/[id]/page.tsx; never written`, `Local DB: count(Deal where convertedPropertyId not null) = 0; 10 deals with status 'CLOSED!' have 4 to 18 DealNote rows each`, `src/app/(app)/deals/[id]/page.tsx:37`, `src/app/(app)/deals/[id]/page.tsx:51-57`, `prisma/schema.prisma:69-70`
- **Also found as:** PROPERTY-I05 (Property detail page (future property hub)), IA-IV04 (Lens: information architecture and global SaaS patterns)
- **Verification:** verifier-found

### DEALS-IV06

**One signature style, and group bursts of system changes**

Medium · Design change · effort M · `/deals/[id] timeline` · One record layout for every record

- **Today:** 29 Livingston has 18 entries. 13 are system lines (9 status, 2 address, 2 listing) and 3 are notes. Authors are shown three ways: '(CS)' appended by addDealNote, '— Connor Swofford' on its own line from an older format, and '· Connor Swofford' at the end of change lines (log.ts:29). The dots marking change lines use the border color and almost disappear.
- **Why:** Notes, the entries people actually wrote, get lost among machine lines, and the mixed signatures read as unfinished. Attio writes the actor once per entry and collapses a burst into 'changed Domains and 1 other attribute' with Show all changes.
- **Change:** Put who and when in each entry's meta line ('Aug 31 · Connor') and stop writing names into the body. Collapse consecutive system changes by one person on one day into one muted line ('Connor changed status 7 times', with Show changes). Notes keep full-weight text.
- **Desktop, tablet, phone:** Same at every size. At 375 the meta line uses initials ('Aug 31 · CS') so it stays on one line.
- **Reuse:** components/activity-timeline.tsx, which the Asana migration spec already extracts from the deal timeline, with TaskEvent's actorLabel pattern.
- **References:** 
  - [Attio](https://mobbin.com/screens/3f58982f-fb3f-46de-a123-70350ebfa604): The Activity feed shows the actor once per entry and folds several edits into 'changed Domains and 1 other attribute' with 'Show all changes'.
- **Code:** `src/lib/deals/log.ts:22-34`, `src/lib/deals/service.ts:143-155`, `src/app/(app)/deals/[id]/page.tsx:106-131`
- **Verification:** verifier-found

### DEALS-V02

**Move 'UNDER CONTRACT' and partner notes out of Closed deals' addresses**

Medium · Fix · effort S · `/deals?statuses=CLOSED!` · Fix wrong numbers and records first

- **Today:** In the Closed view, three deals are named '118 Congress Street UNDER CONTRACT', '647 Prospect Avenue UNDER CONTRACT' and '15 Oxford Ave UNDER CONTRACT', even though their stage is CLOSED!. Two more carry partner notes in the address: '58 Mariner Street Buffalo, NY 14201 (buying with Brandon)' and '1067 Tonawanda St Buffalo, NY 14207 (with Josh, flip)'. These strings are the deal page headings, and DEALS-036 would match them to properties.
- **Why:** The heading contradicts the stage, and who a deal was done with is buried in the address instead of recorded as a note anyone can read.
- **Change:** Do a one-time cleanup. Strip the suffixes and add each one as an imported note on its deal ('Bought with Brandon', 'Flip with Josh'). Extend the DEALS-040 address check to reject stage words and parentheses.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** src/lib/deals/service.ts; the address rule in src/app/(app)/deals/actions.ts (DEALS-040).
- **Verification:** verifier-found

### DEALS-V03

**Let people edit or delete their own notes**

Medium · New capability · effort S · `/deals/[id]` · One record layout for every record

- **Today:** Timeline notes can't be edited or deleted. On 29 Livingston, '8/27 - this is a test note' sits among the real notes for good, and hovering a note shows no controls. The deal service only creates notes (addDealNote); there is no update or delete.
- **Why:** Typos and test notes become permanent history. Stripe's timeline notes carry a ⋯ menu with Edit and Delete.
- **Change:** Give manual notes a ⋯ button, shown on hover on desktop, with Edit and Delete. Delete removes the note and shows an Undo toast. Edit swaps the text into the same note box. Automatic change entries stay read-only.
- **Desktop, tablet, phone:** Desktop: ⋯ on hover at the note's right edge. Tablet and phone: tapping the note opens the same two actions in a sheet.
- **Reuse:** React Aria Menu (approved); the Undo toast (DEALS-019, settled pattern); addDealNote in src/lib/deals/service.ts.
- **References:** 
  - [Stripe](https://mobbin.com/screens/966b2f85-123b-4302-b505-08eb9b5a9724): A timeline note's ⋯ menu offers Pin to the top, Edit and Delete.
  - [Linear](https://mobbin.com/screens/73891735-c12b-4ed3-bd7f-fc6bc3c52228): A comment's ⋯ menu offers Edit and Delete, with Delete last.
- **Code:** `src/lib/deals/service.ts:142-155`, `src/app/(app)/deals/[id]/page.tsx:106-131`, `src/app/(app)/deals/actions.ts:46-51`
- **Also found as:** DEALS-V08 (Deals pipeline, new deal and deal detail)
- **Verification:** verifier-found

### DEALS-V07

**Make Next action the deal's open task with a due date**

Medium · New capability · effort M · `/deals/[id] details` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. The deal page is unchanged on the branch. 'Next action' is a free-text field with no date. Deal.nextActionDue is still in the schema and still unused in src. The page lists no tasks and has no Add task, though /tasks/new?dealId= still works.
- **Today:** Next action is free text with no date ('run numbers', 'aggressive offer'). Deal.nextActionDue exists in the schema, but nothing in src reads or writes it. Tasks can already link to a deal (tasks/new?dealId=, Deal.tasks), and adding or completing one posts into the deal timeline (src/lib/tasks/service.ts:72,86). Yet the deal page lists no tasks and offers no way to add one. 224 of the first 300 deals in All have no next action at all.
- **Why:** What happens next lives in two places, and neither reaches Today or Home for deals. Attio gives every record a Tasks tab with Add task, and a task created anywhere can attach to a record.
- **Change:** Replace the Next action field with a 'Next' row showing the deal's earliest open task (title and due date), plus Add task, which opens the task composer linked to this deal with the approved Due date quick picks. Other open tasks list beneath it. Move existing next-action text into undated tasks on live deals only. Home 'what needs me' and Today then pick up deal work with no deal-specific code, and Snooze (DEALS-I05) becomes Holding plus a dated 'Check price' task.
- **Desktop, tablet, phone:** Desktop and tablet: the Next row and task list sit in the details area. Phone: the same rows, and Add task opens the task sheet. The list's Next action column shows the next task's title and due date.
- **Reuse:** The Tasks composer, Due date picker and TaskCheckbox from the approved Tasks design, the Deal.tasks relation and the existing dealId support in tasks/new.
- **References:** 
  - [Attio](https://mobbin.com/screens/ee14880a-1c0e-46e9-8ccc-5cb1ed1a58e5): A record page with a Tasks tab and an Add task button beside the record's details.
  - [Attio](https://mobbin.com/screens/585d4a62-6654-4a72-8c27-b6e6f3777237): The Create Task bar carries a due date, an assignee and 'Add Record', so a task attaches to a record in one step.
  - [Pipedrive](https://mobbin.com/screens/2ff3c977-7902-48b5-8361-0c89710e5c2e): The board sorts by next activity.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): A date field (projected close) on a deal record.
  - [Zillow](https://mobbin.com/screens/415d4351-2979-4111-a418-09b3ca511959): Every lead row has a Next step column.
  - [Things 3](https://mobbin.com/screens/97952802-d1f3-4324-8a5b-fab1bc02c29e): Deadlines as a small flag that reads '4d left' and turns red only on the day.
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): The request record shows the assessment date under the address, above the primary next-step button.
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): 'Assigned to' and 'Due on' sit right under the to-do text.
- **Code:** `prisma/schema.prisma:64-65`, `src/app/(app)/tasks/new/page.tsx:9-28`, `src/lib/tasks/service.ts:72-87`, `src/app/(app)/deals/[id]/page.tsx:79-81`, `branch-src/src/app/(app)/deals/[id]/page.tsx:80-82`, `branch-src/prisma/schema.prisma:77`, `branch-src/src/app/(app)/tasks/new/page.tsx:12-31`, `src/app/(app)/deals/deal-row.tsx:140-147`, `src/app/(app)/deals/page.tsx:26`, `src/app/(app)/deals/deal-row.tsx:142-143`, `src/app/(app)/deals/[id]/deal-detail.tsx:178`, `src/app/(app)/deals/[id]/page.tsx:79-80`
- **Also found as:** DEALS-035 (Deals pipeline, new deal and deal detail), DATA-I14 (Lens: tables, numbers, money, charts and status), JOURNEYS-I12 (Lens: the core jobs, end to end), G2B-I14 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- **Verification:** verifier-found

### DEALS-039

**Fill in the address from a pasted Zillow link**

Low · New capability · effort S · `/deals/new` · Create where you are

- **Today:** The Crestwood junk is a Google Maps share fragment ('entry=gmail&source=g'), not a Zillow link, so reading the address out of a Zillow URL wouldn't have prevented it. Only 1 of the first 300 rows in All has a listing URL at all, so the data doesn't show that deals usually start as a link.
- **Why:** Deals usually start as a link. Starting from the link saves typing and avoids typos.
- **Change:** Make the first field "Address or listing link". When a link is pasted, save it as the listing URL and read the address out of it for the person to confirm.
- **Desktop, tablet, phone:** Same at every size. On phone, paste is the main way in.
- **Reuse:** src/lib/normalize.ts; the createDeal action.
- **References:** 
  - [Dub](https://mobbin.com/screens/a4d79497-fb92-4c42-aeed-92f98a2791e8): Paste a destination URL and the dialog fills in a preview fetched from that link. Do the same with a Zillow link to fill in the address.
  - [Quicken](https://mobbin.com/screens/b4b6c9e6-5bec-4f9f-9a9b-9655215334bc): "Add with Zillow instead" when adding a property.
- **Verification:** partly. Parsing a Zillow URL still saves typing when a link is the starting point, but it's a nice-to-have, so low.

### DEALS-041

**Cut the New deal form to what triage needs and preview how prices will save**

Low · Design change · effort S · `/deals/new` · Create where you are

- **Today:** The form has seven fields as described. The placeholders '425k', '380k' and '123 Main St, Buffalo, NY 14201' are muted gray like 'Run comps, schedule tour…', so they read as hints rather than filled-in values (verify-DEALS/new--badurl--desktop-light.png).
- **Why:** Every extra field slows triage, and gray example values look like real data.
- **Change:** Keep four fields: Address or listing link, Asking price, Units, Next action. Stage defaults to New, and Our max moves to the deal page. Give the price field a $ prefix and a muted live preview ("$425,000", or "Saved as text" when it isn't a number). Placeholders describe the field ("Street address") instead of imitating data.
- **Desktop, tablet, phone:** Desktop and tablet: one column in the dialog. Phone: the sheet, with the numeric keypad for price and units.
- **Reuse:** parseAmount in src/lib/money.ts for the preview; Input.
- **References:** 
  - [Dub](https://mobbin.com/screens/a4d79497-fb92-4c42-aeed-92f98a2791e8): The create dialog shows only the core fields and moves rarely used options into small chips in the footer (UTM, country, expiry). For New deal, only address, asking, units and next action need to show.
  - [Origin](https://mobbin.com/screens/766e745a-63c2-4a10-865d-415ea6469e0c): A $ prefix and a computed helper line under the price.
  - [Zendesk](https://mobbin.com/screens/53fc762d-4e19-4c73-9a55-caf66b1751e5): "Only show required fields" keeps the create form short.
- **Code:** `src/app/(app)/deals/new/page.tsx:14-47`, `src/lib/money.ts:16-29`
- **Verification:** partly. The point about the number of fields stands, and so does the parsed-price preview. The form is used occasionally, so low.

### DEALS-052

**Remove column resizing**

Low · Design change · effort S · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** Every header has a drag handle that's invisible until hover, with the tooltip "Drag to resize · double-click to reset". Widths are saved per browser.
- **Why:** Once there are six columns sized to their content (DEALS-009), resizing is chrome nobody needs. Stripe offers Edit columns, not resizing.
- **Change:** Remove ResizeHandle, Cols and the saved widths once the columns are trimmed.
- **Desktop, tablet, phone:** Nothing to show on touch anyway.
- **Reuse:** Deletes src/app/(app)/deals/column-widths.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/373146e1-8686-43b0-8a10-5da707dc8873): Fixed columns plus Edit columns, no drag-to-resize.
- **Code:** `src/app/(app)/deals/column-widths.tsx:88-129`
- **Verification:** confirmed. This depends on DEALS-009 landing first.

### DEALS-054

**Drop the "Add next action…" placeholder from empty rows**

Low · Design change · effort S · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** Every empty Next action cell shows gray "Add next action…": 10 of the 13 Active rows and nearly every Pass row, making a column of the same words.
- **Why:** Copy rule: everything on screen should help the user. Repeated prompts are noise, and on passed deals they don't apply.
- **Change:** Leave empty cells blank. "Add next action" appears only on the deal page and in the side panel.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** deal-row.tsx.
- **References:** 
  - [Linear](https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b): Empty properties render nothing in list rows.
- **Code:** `src/app/(app)/deals/deal-row.tsx:144`
- **Also found as:** VISUAL-059 (Lens: visual design system across every screen)
- **Verification:** confirmed. 10 of 13 Active rows and all 11 Closed rows show 'Add next action…'. It's a design finding without a reference, but it applies a copy rule, so that's acceptable.

### DEALS-057

**In list rows, Enter should save and Esc should cancel**

Low · Fix · effort S · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** In the list's Next action field, I typed "x" and pressed Enter, then Esc. Focus stayed in the field with "x" still there. Nothing saves until you Tab away, which is different from how the deal page works.
- **Why:** The same kind of field should behave the same way everywhere.
- **Change:** Use the same InlineTextField handlers as the deal page (after the DEALS-001 fix). This goes away if DEALS-008 removes inline inputs.
- **Desktop, tablet, phone:** Keyboard only.
- **Reuse:** InlineTextField (generalized from InlineAddressField).
- **References:** 
  - [Mercury](https://mobbin.com/screens/83e191aa-091f-4354-91bb-45787672895d): Inline rename in place with Discard and Save, plus a one-line note on what the edit affects.
- **Code:** `src/app/(app)/deals/deal-row.tsx:88-146`, `src/app/(app)/deals/deal-row.tsx:73-81 (defaultValue select)`, `src/app/(app)/deals/deal-row.tsx:89-145 (onBlur only)`
- **Also found as:** FEEL-050 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Reproduced: after typing 'x', both Enter and Esc left focus in the field with the 'x', and nothing saved.

### DEALS-058

**Remove the timeline entry count ("1 entries")**

Low · Fix · effort S · `/deals/[id]` · Plain, consistent words

- **Today:** The timeline header shows "18 entries", and on a deal with one entry it says "1 entries".
- **Why:** Copy rule: don't restate what the layout already shows. And the plural is wrong.
- **Change:** Remove the count.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** [id]/page.tsx.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:97`
- **Verification:** confirmed. '1 entries' is visible on Crestwood at 375 (verify-DEALS/crest--mobile-light.png).

### DEALS-059

**Let the timeline scroll with the page and keep its markers inside the card**

Low · Design change · effort S · `/deals/[id]` · One record layout for every record

- **Today:** The timeline does scroll inside a box capped at 520px. Its markers are clipped at every width, not only at 320. The ol's overflow-y-auto clips everything left of its padding edge, so each 6px dot shows as a 1 to 2px sliver, visible at 1280 in verify-DEALS/liv--tl-hover--desktop-light.png.
- **Why:** Nested scrolling and clipped markers make the page feel unfinished.
- **Change:** No inner scroll. Show 30 entries, then "Show older". Keep markers inside the card padding.
- **Desktop, tablet, phone:** The same single flow at every size.
- **Reuse:** [id]/page.tsx.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:106-115`
- **Verification:** partly. This is a design finding with no reference. The inner-scroll part overlaps DEALS-048.

### DEALS-062

**Make the selected segment visible in dark mode**

Low · Design change · effort S · `/deals` · One design system, fixed in the primitives

- **Today:** In dark mode the selected segment's fill is nearly the same as the background, so "Active 13" barely stands out from the other segments.
- **Why:** House rule: the selected fill alone marks the pick, so it has to be visible in both themes.
- **Change:** In dark mode, give the selected segment a zinc-800 fill with foreground text, or a subtle ring.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** The segmented control in filters.tsx (extracted as SegmentedControl).
- **Code:** `src/app/(app)/deals/filters.tsx:68-71`
- **Verification:** confirmed. In dark mode at 1280 the selected 'Active 13' is visible but faint (verify-DEALS/dark--desktop-dark.png). It's a design finding with no reference.

### DEALS-063

**Wrap long notes in the tooltip**

Low · Fix · effort S · `/deals` · Lists answer first and stay calm at 675 rows

- **Today:** The Latest note tooltip never wraps. In my test a short note already produced a tooltip about 350px wide, and notes run to 150 characters or more (767 Prospect has several), which would run past the screen edge.
- **Why:** Long notes become unreadable exactly where the tooltip is supposed to help.
- **Change:** Cap the tooltip width (max-w-xs) and let the text wrap. It becomes unnecessary once notes move into the side panel.
- **Desktop, tablet, phone:** Desktop only (hover). On touch, the panel or deal page shows the notes.
- **Reuse:** src/components/tooltip.tsx.
- **Code:** `src/components/tooltip.tsx:44-48`
- **Verification:** confirmed. Confirmed by code: whitespace-nowrap, position fixed and centered on the pointer (tooltip.tsx:47). I didn't hover a 150-character note.

### DEALS-I03

**Mark price cuts with the old price struck through**

Low · New capability · effort M · `/deals list price cell and deal timeline` · Money, numbers and dates read one way

- **Today:** 29 of 206 Holding deals carry a next action about waiting for a price drop. Price changes enter only by hand and log as 'Their price: X → Y · Name' in the timeline, and the list shows only the current figure.
- **Why:** A price cut is the strongest reason to revive a parked or passed deal, and the partners are already waiting for cuts by hand. Flighty shows a slipped time struck through next to the new one, so the change reads without opening anything.
- **Change:** Keep the previous asking price and the date it changed. In the Asking cell, show the new figure with the old one struck through in muted text underneath ('$399,000' over '$425,000'). The timeline entry reads 'Asking cut to $399,000 from $425,000 (6%)'. Add 'Price cut in the last 30 days' as a filter value (DEALS-I07), so Holding and Passed deals that dropped can be pulled up in one view.
- **Desktop, tablet, phone:** Desktop and tablet: a two-line cell, right-aligned in Geist Mono. Phone: line 1 shows only the new price, the struck-through figure is dropped, and line 2 adds muted 'Cut 6%'.
- **Reuse:** Extend priceDisplay in deals/deal-row.tsx (consolidate it toward fmtMoney per docs/components.md) and diffDeal in src/lib/deals/service.ts. Backfill from existing 'Their price:' change lines.
- **References:** 
  - [Flighty](https://mobbin.com/screens/735a1c2a-4ed9-48c1-9ddb-b4d1ca513432): The original time is struck through above the new time on every changed row of the departures list.
  - [Flighty](https://mobbin.com/screens/c1455bb0-4bb2-4d9f-b8de-3ee1bd9e41f0): The new figure is large, with the old one small and struck through beside it, plus a one-line explanation of the change.
  - [Zillow](https://mobbin.com/screens/7174235e-3a68-4cc5-ba03-7edeb1507de0): The listing page keeps a Price history table (date, event, price): the domain precedent for treating price changes as events.
  - [Flighty](https://mobbin.com/screens/d2a15492-9519-4965-826f-649edbfc3521): New time in place, the original struck through beside it.
  - [Zillow](https://mobbin.com/screens/c105ccb0-8726-49c8-851c-6bce01e8b6f4): Price history row 'Price change $520,000 -5.4%' with the date.
- **Code:** `src/lib/deals/service.ts:105-106`, `src/app/(app)/deals/deal-row.tsx:26`, `src/lib/deals/service.ts:105`, `src/app/(app)/deals/[id]/page.tsx:70-71`
- **Also found as:** DATA-I12 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. The observation understates the need. 29 of the 206 Holding deals have a next action about waiting for a price drop (19 'wait until price drop', 5 'wait for price drop', plus variants), not three. But the recommendation doesn't serve that job. Prices change in the app only when a partner rechecks the listing and types a new number, so the person who would see the strikethrough is the one who just typed it. What actually serves 'wait until price drop' is a dated check-back (DEALS-I05). If kept, show the struck-through figure only for cuts in the last 30 days, so the cell isn't permanently two lines. Lowered to low. Flighty and Zillow refs not spot-checked; plausible.

### DEALS-I07

**Add sentence filter chips for asking, units and town**

Low · New capability · effort M · `/deals control row` · Lists answer first and stay calm at 675 rows

- **Today:** The only filters are an address text box and status. You can't ask for '4+ units under $300k' or 'only North Tonawanda' across 675 deals. In the first 300 rows of All, 30 addresses are outside Buffalo (North Tonawanda, Tonawanda City and Town, Cheektowaga, Niagara Falls, West Seneca, Lewiston), with the town spelled inconsistently.
- **Why:** Stripe adds filters as dashed '+ Amount' chips that turn into readable chips once set. Airtable's chips read 'Project Status is Planning or In Progress', and Attio's read 'Employee range less than 1K-5K'. For an investor the questions are price, units and area, not status alone.
- **Change:** After the search field, add three dashed chips: '+ Asking', '+ Units', '+ Town'. Asking opens 'under' or 'over' with an amount. Units offers 2+, 3+, 4+, 5+. Town lists normalized towns (Tonawanda City and Tonawanda Town merged under Tonawanda), each with a count. Once set, the chips read 'Asking under $300k ×', 'Units 4+ ×', 'Town is Tonawanda ×'. Esc clears the focused chip. Together they replace the status multiselect, which DEALS-015 removes.
- **Desktop, tablet, phone:** Desktop: one row. Tablet: one row, and the set chips collapse into 'Filters (2)' rather than wrapping. Phone: a single Filters button opens a sheet with the three fields, and set filters show as a chip row that scrolls sideways under the search, as in Shopify.
- **Reuse:** The approved React Aria popover for each chip, replacing StatusMultiSelect. Town comes from the address via src/lib/normalize.ts.
- **References:** 
  - [Stripe](https://mobbin.com/screens/140880ca-003b-4498-8932-c09c223ed9de): Dashed '+ Date and time', '+ Amount' and '+ Status' chips in one quiet row under the status tiles, with a result count below the table.
  - [Airtable](https://mobbin.com/screens/b3b21595-5794-4b20-bb85-ba48a59f12a1): The chip reads as a sentence ('Project Status is Planning or In Progress'), and its popover lists the options with a search field.
  - [Attio](https://mobbin.com/screens/4e6934cc-b936-43f9-a098-f7d7868fadf6): A numeric filter written as a chip, 'Employee range less than 1K-5K', next to the sort chip.
- **Code:** `src/app/(app)/deals/filters.tsx:54-81`, `src/app/(app)/deals/page.tsx:52-61`
- **Verification:** partly. Data verified: the only filters are address text and status, and 30 of the first 300 rows in All are outside Buffalo, with towns spelled 'Tonawanda-City', 'Tonawanda-Town', 'Tonawanda' and 'North Tonawanda'. But the partners work about 30 live deals, so price, units and town filters mainly serve the 428-deal Pass archive. That's real but occasional, and Town depends on normalizing towns that are free text inside the address. Lowered to low. Replacing StatusMultiSelect with the chips keeps the row from growing, which is good. The Stripe dashed-chip pattern is a sound reference.

### DEALS-I09

**End the table on a footer that counts and sums**

Low · Design change · effort S · `/deals list` · Lists answer first and stay calm at 675 rows

- **Today:** No total row. The only count is in the segment control, and views with more than 300 deals end on 'Showing first 300. Use the address filter to narrow.'
- **Why:** Attio puts a count and a chosen calculation (sum, average) under every column, and Airtable gives a total per group and for the whole view. The dollar size of what's in play and the typical price per unit answer 'how big is our pipeline' without an export.
- **Change:** Add one footer row aligned to the columns: '13 deals' under the address, the summed asking under Asking ('$3.1M'), and the median price per unit under the $/unit figure from DEALS-065. It follows the current filters and search. When rows are selected (DEALS-046), it sums the selection instead.
- **Desktop, tablet, phone:** Desktop and tablet: the footer row. Phone: one muted line above the list, '13 deals · $3.1M asking'.
- **Reuse:** Table in src/components/ui.tsx (add a tfoot), with fmtMoney compact in Geist Mono.
- **References:** 
  - [Attio](https://mobbin.com/screens/a44be622-b84a-4805-ad7a-6f600ece6356): Footer row with '13 count' under the name column and 'US$85,325,000.00 avg' under a money column.
  - [Airtable](https://mobbin.com/screens/7612f4c4-4104-4dbc-8e5f-579dde687f2b): Each group has its own subtotal (Avg 53, Avg 65), and the view ends on '10 projects · Avg 58'.
- **Code:** `src/app/(app)/deals/page.tsx:160-162`
- **Also found as:** DATA-056 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. True that there's no total and that Pass ends on 'Showing first 300. Use the address filter to narrow.' But a footer '13 deals' restates the count already in the selected segment ('Active 13'), against the copy rule on not repeating counts shown elsewhere. And summed asking misleads: 4 of 13 Active deals have no asking, and a sum of sellers' asks isn't a buyer's pipeline figure. Keep only a result count, shown when search or filters narrow the view. The 300-row cap is a separate defect (DEALS-V09).

### DEALS-I10

**Give each deal an owner so 'my deals' can reach Home**

Low · New capability · effort M · `/deals list and deal page` · Home and Today become one work queue

- **Today:** Deals have no owner field. The app appends initials to manual notes itself (an older format wrote the full name after a dash), and two deals name an outside partner inside the address text.
- **Why:** Attio cards show the owner in a fixed row, and Linear filters by 'assigned to me'. The approved Tasks design splits Mine and Contractors, and Home becomes 'what needs me'. Both need an owner to route deals to the right partner.
- **Change:** Add Owner (Connor or Pieter), defaulting to whoever creates the deal. Show the owner's initials avatar in a fixed spot at the end of each row and in the deal rail. Make 'Mine' the first view in the title menu. Home lists my deals whose next action is due. Outside partners stay in a separate field (DEALS-V02), not here.
- **Desktop, tablet, phone:** Desktop and tablet: an initials avatar at the end of the row. Phone: the initials lead line 2 ('CS · 4 units · 12d').
- **Reuse:** The initials avatar already used for the signed-in user in the sidebar footer, plus the Home 'what needs me' (D10).
- **References:** 
  - [Attio](https://mobbin.com/screens/a2b97705-be0b-44a3-84ec-522316c873bf): Owner is one of the fixed card rows, with an avatar and name, picked in View settings.
  - [Linear](https://mobbin.com/screens/10d46768-7ef5-4140-9f5f-22a97a207759): 'assigned to me' is the first suggested filter, with lead and owner shown as avatars.
- **Code:** `src/lib/deals/service.ts:142-150`, `prisma/schema.prisma:39-79`
- **Verification:** partly. No owner field is confirmed (prisma Deal model), and two outside partners are confirmed in the address text ('(buying with Brandon)', '(with Josh, flip)'). Misattribution: '(CS)' isn't signed by hand. addDealNote appends the author's initials automatically (service.ts:149). The 'going to see it tomorrow — Connor Swofford' format is an older signature. For a two-partner shop that often works deals together, routing to Home needs a due date (Deal.nextActionDue is unused) more than an owner. The 'Mine' title-menu view depends on DEALS-I08, which I refuted. Lowered to low.

### DEALS-I13

**Let a stage change carry a one-line reason in the same entry**

Low · Design change · effort S · `/deals/[id] timeline and stage pill` · One record layout for every record

- **Today:** Status changes and notes are separate timeline entries, so a move never carries its reason. The cited Aug 31 burst on 29 Livingston is test activity beside a test note.
- **Why:** Linear's project update keeps the status change inside the written update ('Backlog → In Progress' under the text), so the history explains itself. Months later, the reason for a move matters more than the move.
- **Change:** After a stage change, the Undo toast (DEALS-019) also offers 'Add note'. The note is one line and saves into the same timeline entry: 'Moved to Offer · Offered $380k, seller countering (CS)'. Skipping it is fine, and no dialog ever blocks the change.
- **Desktop, tablet, phone:** Desktop and tablet: the toast at the bottom, where 'Add note' expands an inline field. Phone: the toast sits above the bottom bar, and 'Add note' opens a sheet with the field docked above the keyboard.
- **Reuse:** New Toast (a known gap in docs/components.md, needed by DEALS-019), plus addDealNote and logDealChanges in src/lib/deals.
- **References:** 
  - [Linear](https://mobbin.com/screens/7e12afea-77c5-43b2-bbe4-89d107513b7e): The project update post holds the written context and the status change ('Backlog → In Progress') together as one entry.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): A burst of changes reads as one entry ('changed Stage and 7 other attributes') with Hide all changes.
- **Code:** `src/lib/deals/log.ts:25-35`, `src/app/(app)/deals/[id]/page.tsx:100-105`
- **Verification:** partly. The counts are right: seven status lines on Aug 31 and two on Sep 2 on 29 Livingston. But that burst is test toggling (Pass → High → Closing → High → Low → TBD → High in one day), next to a note reading '8/27 - this is a test note', so it's weak evidence that real moves lack reasons. The underlying point stands, and the idea is light because it rides the Undo toast. Severity low is right.

### DEALS-I14

**Write empty deal fields as the action that fills them**

Low · Design change · effort S · `/deals/[id] details` · Plain, consistent words

- **Today:** On the deal page, empty prices and units show a lone dash as their placeholder. The listing field says 'Paste a listing URL…' and next action says 'What's next?'. The dash reads as 'no data' rather than 'you can add this', and the other two use different voices.
- **Why:** Attio's details rail shows 'Set Description…' and 'Set Primary location…', and Linear's properties show 'Set priority' and 'Assign'. Empty fields read as the verb that fills them, all in one voice.
- **Change:** Use muted verbs on the record: 'Add asking price', 'Add our max', 'Add units', 'Add listing link', 'Add next action'. Tapping or clicking the verb opens the edit. List cells keep the lone dash for empty values, which the house rules allow, so the change applies only on the record.
- **Desktop, tablet, phone:** The same at every size. On touch, tap the verb to edit, following the house rule against a permanent edit pencil.
- **Reuse:** The placeholder prop of TextField and UnitsField in deals/[id]/deal-detail.tsx.
- **References:** 
  - [Attio](https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f): In the record details rail, every empty attribute reads as 'Set <field>...' in muted text.
  - [Linear](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270): The properties panel shows 'Set priority', 'Assign' and 'Set estimate' for empty fields.
- **Code:** `src/app/(app)/deals/[id]/deal-detail.tsx:170`, `src/app/(app)/deals/[id]/deal-detail.tsx:178`, `src/app/(app)/deals/[id]/deal-detail.tsx:210`, `src/app/(app)/deals/[id]/deal-detail.tsx:236`
- **Verification:** confirmed. Verified in deal-detail.tsx: '—' placeholders for both prices and units, 'What's next?' for next action and 'Paste a listing URL…' for the listing. The list uses a third voice, 'Add next action…' (deal-row.tsx:144). Mobbin: an Attio record details rail with 'Set Description...' and 'Set Foundation date...' came back in my search (https://mobbin.com/screens/3f58982f-fb3f-46de-a123-70350ebfa604), so the pattern is real. At 375 'Paste a listing URL…' is already clipped to 'Paste a listing UF', and shorter verbs fix that too.

### DEALS-I15

**Capture a deal on the phone from where you're standing**

Low · New capability · effort M · `/deals/new on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** On a phone, New deal is the full desktop form in one card: Address (4+ characters), a native Status select defaulting to 5 - TBD, Units, two prices, Listing URL and Next action.
- **Why:** Zillow's location sheet makes 'Current Location' the first row. In the library's mobile scope, phones are for capture, and Ramp's 15-second budget for the most common phone job applies to the most common way investors find off-market deals.
- **Change:** On touch devices, New deal opens as a bottom sheet with one address field. Its first suggestion is 'Use where I am', which reverse-geocodes the browser location to the nearest street address. Asking and units are optional, followed by 'Add photo'. Saving creates a New-stage deal and runs the duplicate check (DEALS-038) first. The desktop dialog is unchanged and has no location row.
- **Desktop, tablet, phone:** Desktop 1280: dialog (DEALS-037) with no location option. Tablet 768 (touch): the same sheet as phone. Phone 375: a full-height sheet with the primary button pinned above the keyboard.
- **Reuse:** New deal dialog (DEALS-037) on the approved React Aria sheet, Attachments with kind 'deal' (DEALS-I11) and the duplicate check in src/lib/deals/service.ts. Reverse geocoding is new and needs a provider.
- **References:** 
  - [Zillow](https://mobbin.com/screens/09329482-94ea-4eab-825f-99aabbae3a20): An 'Enter location' sheet whose first row is 'Current Location' above the search field results.
  - [Jobber](https://mobbin.com/screens/3bd617fc-464a-4f6d-891f-4b65f962b2cb): A camera button sits beside Add Note, so a photo is one tap from the record.
- **Code:** `src/app/(app)/deals/new/page.tsx:14-43`
- **Verification:** partly. True that New deal on 375 is the desktop form (Address, Status select defaulting to 5 - TBD, Units, two prices, Listing URL, Next action). 'Required full address' is overstated, because the schema needs only 4+ characters. The 'most common way investors find off-market deals' and Ramp '15-second budget' claims carry no evidence or reference. Most HG deals came from listings. Reverse geocoding adds a third-party provider and a location prompt for an unproven job. The light version is the worthwhile part: on phones show Address plus optional Asking and Units, and fold the rest away.

### DEALS-I16

**Add Directions under the deal address on touch devices**

Low · Design change · effort S · `/deals/[id] on phone` · The phone is a chosen subset, and touch has no hover

- **Today:** The deal address is an editable heading and nothing more. No link anywhere in the app opens a map, so heading to a showing means copying the address into Maps by hand.
- **Why:** Jobber's phone record puts a Directions button directly under the address because driving there is what people do next.
- **Change:** On touch devices, show a secondary 'Directions' button under the address that opens Apple Maps on iOS and Google Maps elsewhere. On desktop, 'Open in Maps' goes in the ⋯ menu. Address editing moves into the details rail, so a tap on the heading never starts an edit by accident.
- **Desktop, tablet, phone:** Phone and tablet: a button under the address. Desktop: an item in the ⋯ menu.
- **Reuse:** LinkButton secondary from ui.tsx, plus the address from InlineAddressField.
- **References:** 
  - [Jobber](https://mobbin.com/screens/3bd617fc-464a-4f6d-891f-4b65f962b2cb): A full-width 'Directions' button directly under the record's address.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:47-50`
- **Verification:** confirmed. Verified: no Maps link anywhere in src (no maps.google, maps.apple or geo: links), and the deal address is only an inline edit field. Useful for showings at little cost. It bundles a second change, though (moving address editing into the rail), which belongs with the DEALS-030 header work, not here.

### DEALS-I19

**Keep the town in the row's muted second line when it isn't Buffalo**

Low · Design change · effort S · `/deals list rows` · Lists answer first and stay calm at 675 rows

- **Today:** Rows print full mailing addresses that wrap to two lines ('161 Pullman Avenue Tonawanda-Town, NY 14217'). DEALS-024 moves lists to the street only, which would drop the town, yet about one in nine deals with a town is outside Buffalo, and taxes and rents differ by town.
- **Why:** Shopify's phone rows carry a muted meta line under the name ('Sam Lee • 5 items • 12:31 PM'), and Things 3 puts the project as a gray sublabel. Context goes in a quiet second line instead of a longer first one.
- **Change:** Line 1 is the street. Line 2 is muted: '4 units · Tonawanda', with the town shown only when it isn't Buffalo, so most rows stay short. This refines DEALS-024 rather than replacing it.
- **Desktop, tablet, phone:** The same two lines at every size. On phone, line 2 also carries the stage and next step (DEALS-010), and the town drops first when space runs out.
- **Reuse:** Address parsing in src/lib/normalize.ts, plus the row sublabel planned in DEALS-024.
- **References:** 
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): Two-line rows: a bold identifier, then a muted meta line joined with bullets.
- **Verification:** confirmed. Verified: rows print full mailing addresses that wrap to two lines, and 30 of the 271 addresses with a town in the first 300 rows of All are outside Buffalo (about 1 in 9). It's a sound refinement of DEALS-024. It needs town normalization ('Tonawanda-City', 'Tonawanda-Town', 'Tonawanda') before the label is shown.

### DEALS-IV05

**Log a cleared listing as removed and skip spacing-only address edits**

Low · Fix · effort S · `/deals/[id] timeline` · Fix wrong numbers and records first

- **Today:** diffDeal writes 'Listing URL updated' whenever there was an old value, including when it was cleared (service.ts:110-111). 29 Livingston shows 'Listing URL updated' while its Listing URL field is empty. diffDeal also logs address edits that differ only in spacing and commas: two Aug 31 entries on 29 Livingston turn 'Buffalo ,  NY' into 'Buffalo,  NY'.
- **Why:** The history says something that didn't happen and buries real entries under cleanup noise.
- **Change:** Write 'Listing URL removed' when the new value is empty. Save cleaned addresses, but log nothing when normalizeAddress(before) equals normalizeAddress(after).
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** diffDeal in src/lib/deals/service.ts and normalizeAddress in src/lib/normalize.ts.
- **Code:** `src/lib/deals/service.ts:94-115`, `src/lib/deals/service.ts:108-111`, `src/lib/deals/service.ts:134`, `src/app/(app)/deals/deal-row.tsx:143`, `src/lib/deals/service.ts:93-113`, `DB: DealNote source change body 'Next action: aggressive offer → aggressive offer'`
- **Also found as:** DEALS-051 (Deals pipeline, new deal and deal detail), MOBILE-V07 (Lens: phone and tablet experience on every route), DATA-V08 (Lens: tables, numbers, money, charts and status)
- **Verification:** verifier-found

### DEALS-V04

**Check the listing link before saving it**

Low · Fix · effort S · `/deals/[id]` · Fix wrong numbers and records first

- **Today:** On the Crestwood deal I typed 'zillow.com/homedetails/27-Crestwood' into Listing URL. The field's own validity reported it invalid, and pressing Enter still sent the save. TextField's commit doesn't check validity, and patchDeal stores any text. The 'Open ↗' link then uses that text as its href, which the browser resolves as a path under /deals.
- **Why:** The one external reference a deal has ends up as a broken link.
- **Change:** When a pasted link has no scheme, add https://. If it still isn't a URL, keep the typed text, show 'Not a link' under the field and don't save. Validate in patchDeal with the same z.string().url() rule createDeal uses.
- **Desktop, tablet, phone:** One line under the field at every size.
- **Reuse:** TextField in src/app/(app)/deals/[id]/deal-detail.tsx; dealSchema in src/app/(app)/deals/actions.ts.
- **Code:** `src/app/(app)/deals/[id]/deal-detail.tsx:129-134`, `src/app/(app)/deals/[id]/deal-detail.tsx:229-251`, `src/lib/deals/service.ts:125`, `src/app/(app)/deals/actions.ts:23`
- **Verification:** verifier-found

### DEALS-V06

**Show the time on timeline entries made in the app**

Low · Design change · effort S · `/deals/[id]` · One record layout for every record

- **Today:** Notes and change entries show only the date. 29 Livingston has twelve entries dated 'Aug 31, 2026': seven status flips, two address fixes and three notes. Nothing shows their order within the day or when they happened. noteDate is saved with the time, but the page formats it with fmtDate.
- **Why:** When several changes share a day, a record of what was done needs the time. Stripe's timeline shows the date and time on every entry.
- **Change:** For entries created in the app, show the date and time ('Aug 31, 4:12 PM'), or a relative time within the last day ('2h ago'). Imported entries keep the date alone, or read 'Undated' as in DEALS-043.
- **Desktop, tablet, phone:** Same at every size. On phone the year drops.
- **Reuse:** fmtDateTime in src/lib/utils.ts; the timeline render in src/app/(app)/deals/[id]/page.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/daed2848-67bf-4bad-acbd-233af93bb070): Each timeline entry carries its date and time, such as '9 Dec 2024, 07:37'.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:116-117`, `src/lib/deals/log.ts:26-32`
- **Verification:** verifier-found
