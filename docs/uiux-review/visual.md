# Lens: visual design system across every screen

Part of the [UI/UX review](README.md). 59 findings: 0 critical, 10 high, 33 medium, 16 low.

## How it should work

HG should read as Linear's structure with Mercury's restraint, signed with HG's own gold and photographs. Four moves.

Chrome recedes. The sidebar and top bar sit one zinc step below a white work surface, nav icons drop to secondary gray, and selection becomes a neutral fill, so blue means act and nothing else (Linear https://mobbin.com/screens/fd1b4d88-f021-49a3-98af-4cd3a87e1d29, Mercury https://mobbin.com/screens/d575358b-679b-4d52-aa98-5026970291b3). Content sits on white in sections with a heading and a hairline; bordered cards survive only as dashboard modules. Every list shares one 40px row, every page header holds the same geometry, and side-by-side headers share one height.

Every token has one job. Zinc steps split into fills, borders, secondary text and primary text, taken from Tailwind's OKLCH zinc and blue scales instead of hand-picked hex, so both themes come from the same steps (Vercel https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54). Status tones mark state only: green done, amber needs attention, red overdue or failed. Stages get a quiet dot on a neutral chip (Attio https://mobbin.com/screens/fdc76916-ff87-4e2a-8256-80939ffa935c), tags a gray outline (Linear https://mobbin.com/screens/ed670cda-0527-4716-a1a6-0159f12c4f42), and task status reads by shape first, a ring that fills as work advances (Linear Mobile https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690). Red belongs to the deadline, as in Things 3 (https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58).

Numbers are typeset and charts stay quiet. Money is right-aligned in tabular figures with a true minus (Mercury https://mobbin.com/screens/340a46db-da79-4acf-b8bc-f0a0621deed3). Bars become 3px meters under full labels (Mercury https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62, Copilot https://mobbin.com/screens/f9852ce6-2bba-46cc-a8c5-4f7ca8317074). Type runs page title 24/32, section 16/24, body 14/20 and labels 12/16 in sentence case, nothing smaller. Records open with an h1 title edited in place, and timelines give each event an icon, one sentence and a muted date (Stripe https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b).

Restraint gets a signature. Calm alone looks generic, so HG carries two marks, the way Mercury carries its own typeface. Gold appears in the app exactly twice: the HG monogram, which also replaces the default Vercel favicon, and the single accent fill in line spot art on payoff moments (Gusto https://mobbin.com/screens/f74caf21-298d-44dc-af95-bd86acc044db). Real property photos become each property's identity thumbnail beside its address, with a line-icon tile when there is no photo (Zillow https://mobbin.com/screens/e6bd4d1f-7cb6-4cff-89ac-5fe99420e075 and https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430). Both stretch the two-palette and imagery rules, so they wait on Connor's sign-off. The public site keeps near-black and gold as real tokens; the app keeps zinc and blue.

<details><summary>What the reviewer covered</summary>

Production build on http://localhost:3200, signed in as Connor, read-only helper (no writes). Routes exercised: / (desktop, tablet, phone 375, narrow 320, dark desktop and phone, zoomed stat tiles, mobile nav drawer light and dark); /properties (desktop, phone); /properties/cmtg25y4p0006jphsv3frndk6 (desktop scrolled through every section, tablet, phone, dark, Building CapEx and Units & access edit modes, Edit-button opacity probe at tablet); /deals (desktop 1280, wide 1920, tablet, phone, dark, WebKit desktop, 'All statuses' popover, keyboard Tab focus walk); /deals/cmtg25yd8002cjphs49ovlvob (desktop, phone, timeline); /tasks (desktop, tablet, phone, dark, row hover, column width measurement); /tasks/cmtg25z7s048mjphsikewzpy1 (desktop, phone in Chromium and WebKit, dark color-scheme probe); /financials (desktop, phone, dark); /financials/rent-roll; /financials/settings; /contractors; /contractors/cmtg25y9x000djphsbqty81fr; /settings (CapEx rules) and /settings/move-in-form; global search dropdown ('prospect'). Code read: src/app/globals.css, src/components/ui.tsx, src/app/layout.tsx, app-shell.tsx, nav.tsx, global-search.tsx, theme-toggle.tsx, tooltip.tsx, confirm-dialog.tsx, inline-address-field.tsx, financials/_components/ui.tsx, lib/config.ts tone maps, lib/dates.ts, lib/utils.ts fmtMoney, plus a grep inventory of every inline svg (26 in 16 files), text sizes, weights, radii, shadows, raw palette colors and emoji/glyph icons; contrast ratios computed for every token pair. Mobbin: 15 searches (Stripe home, transactions, customer, settings, empty states, Stripe iOS; Mercury web and iOS; Linear issue and list; Vercel; Attio; dark finance dashboards; rental portfolio lists). Ramp is not on Mobbin; that query returned Origin, Bonsai, Midday, QuickBooks and Expensify, cited honestly. Not reached: public site and /login (outside this unit), /settings/storage, new-record forms, confirm dialogs, the CapEx hover card (headless hover did not trigger it; reviewed from code), contractors at tablet.

</details>

## Findings

### VISUAL-006

**Dark-mode primary buttons fail contrast (white on blue-500 is 3.68:1)**

High · Design change · effort S · `All pages, dark theme` · One design system, fixed in the primitives

- **Today:** Dark --primary is #3b82f6 with white text. '+ New deal', '+ New task', 'Add' and 'Save' measure 3.68:1, below WCAG AA 4.5:1 for 14px text. The same token colors links, active tabs and the active nav item.
- **Why:** The primary action is the most important label on a page and the one that fails.
- **Change:** Split the token: --primary-fill blue-600 #2563eb in dark (5.17:1 with white) and --primary-text blue-400 #60a5fa for links, tabs and active nav on dark surfaces (7.4:1). Light theme stays blue-700.
- **Desktop, tablet, phone:** Token change; identical at every size.
- **Reuse:** src/app/globals.css dark tokens; Button primary in ui.tsx.
- **Challenges:** House rule 'blue primary (blue-700 light, blue-500 dark)'. WCAG AA needs the dark fill at blue-600, with blue-400 reserved for text on dark.
- **References:** 
  - [Vercel](https://mobbin.com/screens/9b397b77-fd80-4157-9867-2ae4010133a4): Dark dashboard keeps the primary button at full contrast.
- **Code:** `src/app/globals.css:23-24`, `contrast scan /deals dark: 3.68 at 14px, white on rgb(59,130,246), "+ New deal"`, `computed: white on blue-600 = 5.17:1`, `src/app/globals.css:23`
- **Also found as:** FEEL-032 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Contrast math checks out: #3b82f6 with white is 3.68:1 and #2563eb is 5.17:1. Blue-500 used as text on #161819 is about 4.8:1, so links pass and only the filled buttons fail. conflicts_with correctly names the house rule. The Vercel reference is weak because Vercel's primary button is black and white, not blue. Cite WCAG instead.

### VISUAL-008

**Type scale is compressed to 20/14/12 and dominated by 12px text**

High · Design change · effort M · `All pages` · One design system, fixed in the primitives

- **Today:** App code uses text-xs (12px) 176 times against text-sm 64 times, plus 11px (17), 10px (5) and 9px (1). Page titles are 20px, card titles 14px (the same size as body), so hierarchy rests on weight alone; table cells, meta and most labels are 12px.
- **Why:** Stripe and Mercury set 24 to 28px page titles, 16 to 20px section heads, 14px body and 13px tables. A flat 20/14/12 scale reads cramped and unfinished, and 9 to 11px text is hard to read on a phone.
- **Change:** Adopt the scale in the token proposal: title 24/32 600, section 16/24 600, body 14/20, table 13/20, label and caption 12/16, nothing below 12px. Add named size tokens in globals.css @theme and apply them first in PageHeader, CardTitle, Th, Td, Field and Badge.
- **Desktop, tablet, phone:** Desktop and tablet as above; phone title 22/28, all else the same (touch fields stay 16px).
- **Reuse:** PageHeader, CardTitle, Th, Td, Field in src/components/ui.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): 'Today' and 'Your overview' section heads clearly larger than body; 14px body.
  - [Mercury](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2): Large welcome heading, 14px body, larger balance figure.
  - [Todoist](https://mobbin.com/screens/e80e5692-9bdd-41ac-81df-25e8dd7e104a): Bold 'Today' title with a small count line beneath
- **Code:** `src/components/ui.tsx:18`, `src/components/ui.tsx:209`, `src/components/ui.tsx:207-210`
- **Also found as:** SHELL-049 (App shell, sidebar, top bar, global search and Home)
- **Verification:** confirmed. Counts reproduce exactly (text-xs 176, text-sm 64, 11px 17, 10px 5, 9px 1). PageHeader is text-xl and CardTitle and SectionCard titles are text-sm. The references are plausible.

### VISUAL-009

**Replace the gray canvas and shadowed card stack with flat sections on white**

High · Design change · effort L · `All pages (Property, Financials, Settings most)` · One design system, fixed in the primitives · big bet

- **Today:** Every page is a #f7f7f8 canvas with stacked white cards, each with a border, shadow-sm and a title bar with its own divider, even when the body is one sentence (property Financials card, Notes 'No notes yet.'). The property page has 11 cards; Financials has 12 tiles and cards.
- **Why:** Repeated chrome is the largest source of visual noise. Stripe, Linear and Vercel put content on a white canvas, separate sections with a heading and a hairline, and keep containers for grouped widgets only.
- **Change:** White canvas in light mode. Detail pages and Settings use a Section (16px heading, optional actions, 1px rule, 32px gap) instead of title-bar cards. Card stays for dashboard widgets and table frames, border only, no shadow. One-line notices become inline text, not cards.
- **Desktop, tablet, phone:** Desktop: sections in the main column and rail. Tablet: rail sections stack under main. Phone: sections run full width inside 16px gutters with no card edges.
- **Reuse:** Extend SectionCard into a Section with a plain variant in ui.tsx; Card stays for widgets.
- **Challenges:** House rule 'Shadows follow a hierarchy ... cards soft (shadow-sm)'. Stripe, Linear and Vercel keep in-flow containers flat with a stroke; this proposes shadow only on floating layers.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Customer page: headings plus hairlines, no cards.
  - [Stripe](https://mobbin.com/screens/e6b65816-eb18-400a-a3ba-545f05de645c): Settings sections as heading, description and rule.
  - [Stripe](https://mobbin.com/screens/731c4495-3c95-42b2-9502-5a1b60ab96eb): Quotes, Credit grants and Recent activity stacked as unboxed sections
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): Details rail as plain rows, no inner boxes.
- **Code:** `src/components/ui.tsx:9`, `src/components/ui.tsx:15`, `src/app/globals.css:7`, `src/components/ui.tsx:6-60`, `src/app/(app)/properties/[id]/edit-units.tsx:198-204`, `branch src/app/(app)/tasks/[id]/view.tsx:118-136`, `branch src/app/(app)/deals/[id]/page.tsx:67`, `branch src/app/(app)/properties/[id]/edit-units.tsx:198`, `branch src/app/(app)/properties/[id]/edit-listings.tsx:217`
- **Also found as:** PROPERTY-057 (Property detail page (future property hub)), VISUAL-026 (Lens: visual design system across every screen)
- **Verification:** confirmed. The property page has 11 title-bar cards (Financials, CapEx forecast, Building CapEx, Units, Rentals, Details, Loan, Insurance, Tasks, Documents, Notes). Notes and Financials hold a single sentence. conflicts_with names the shadow rule. Even Stripe keeps a dashed frame for empty in-section blocks (Mobbin fb0b91ce), so 'no containers' should mean no title-bar chrome rather than no outlines at all. VISUAL-026 is a subset of this.

### VISUAL-010

**Right-align every money, count and percent column**

High · Design change · effort S · `Portfolio, Deals, Financials by property, Settings CapEx rules` · Money, numbers and dates read one way

- **Today:** Portfolio (Open tasks, Units, Purchase, Value), Deals (Units, Their price, Our price), Financials by property (Income, Opex, NOI, Margin, Debt int.) and CapEx rules (Cost) are left-aligned under left-aligned headers. Th and Td have no numeric option.
- **Why:** Left-aligned digits cannot be compared by magnitude at a glance. Stripe, Origin and Bonsai right-align amounts.
- **Change:** Add a numeric prop to Th and Td (text-right, tabular-nums, header right-aligned) and apply it to every money, count and percent column and its totals row.
- **Desktop, tablet, phone:** Same on desktop and tablet; on phone the figure is the right edge of each list row.
- **Reuse:** Th and Td in src/components/ui.tsx:181-194.
- **References:** 
  - [Mercury](https://mobbin.com/screens/340a46db-da79-4acf-b8bc-f0a0621deed3): Reconciliation table: Amount and Balance right-aligned in tabular figures with a true minus, headers sitting on the figures' right edge.
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Transactions: bold amount with a muted currency code, every row's figure on one right edge.
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): Amount column bold and aligned.
  - [Origin](https://mobbin.com/screens/5ed43577-22f5-480e-af82-edd689e5f907): Amount right-aligned at the row end.
  - [Stripe](https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c): Total spend, Payments and Refunds right-aligned with their headers.
  - [Origin](https://mobbin.com/screens/f5b04e19-0514-4261-8e8e-c03341075c32): Holdings table: every money column and its header right-aligned.
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Payment breakdown amounts are right-aligned against left labels.
  - [Mercury](https://mobbin.com/screens/d14e9441-a25f-4730-97a3-d7e7ed531af4): Amount column right-aligned with tabular figures
  - [Attio](https://mobbin.com/screens/c6a29ce7-72af-4679-bd07-0085f5aa05b3): Currency column right-aligned; text columns left
  - [YNAB](https://mobbin.com/screens/62817fae-ab1b-43cf-a15d-3d372afd32ca): Income v Expense with right-aligned month, Average and Total columns
  - [Mercury](https://mobbin.com/screens/269ac107-c09e-4c57-a263-2a82ff06c4cd): Right-aligned figures with digits lined up
  - [Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79): Right-aligned amounts with tabular digits.
- **Code:** `src/app/(app)/properties/page.tsx:56-59`, `src/app/(app)/properties/page.tsx:80-83`, `src/app/(app)/financials/page.tsx:177-194`, `src/components/ui.tsx:181-194`, `src/app/(app)/properties/page.tsx:82-95`, `src/app/(app)/financials/page.tsx:194-222`, `src/app/(app)/financials/page.tsx:177-198`, `src/app/(app)/deals/deal-row.tsx:105-126`, `src/app/(app)/deals/page.tsx:122-123`
- **Also found as:** PORTFOLIO-012 (Portfolio list and new property), VISUAL-IV03 (Lens: visual design system across every screen), DATA-013 (Lens: tables, numbers, money, charts and status), FINANCIALS-038 (Financials, rent roll and financial settings), DEALS-023 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. Confirmed on Portfolio, Deals, Financials By property and the Settings rules. The CapEx forecast tables on Home and the property page already right-align their money, so that's the in-house precedent. Stripe Transactions (Mobbin 1bbafee3, seen) right-aligns amounts.

### VISUAL-011

**Status is rendered five different ways; make one StatusPill**

High · Design change · effort M · `Portfolio, Property, Deals, Financials settings, unit equipment` · One design system, fixed in the primitives

- **Today:** Badge chips (Rehabbing, Available), tinted native selects (deal status), colored plain text (red 'Due soon', green 'Good'), bare text (Refinanced, Unknown) and uppercase badges ('ACTIVE', red 'Replace'). The badge palette is defined twice, in ui.tsx badgeTones and lib/config.ts TONE_CLASSES.
- **Why:** Status should sit in one fixed, skimmable form; mixed renderings make every screen a new legend and break the house rule that statuses keep fixed colors.
- **Change:** One StatusPill: 6px dot plus label, 12px medium, neutral pill background, the dot carries the color. Same component in tables, headers and menus. Quiet states (Refinanced, Unknown) get a gray dot instead of bare text. One tone map in lib/config.ts feeds Badge.
- **Desktop, tablet, phone:** Identical at all sizes; on phone the pill sits on the row's second line.
- **Reuse:** Badge (ui.tsx:107-131) gains a dot variant; delete TONE_CLASSES (config.ts:95-102).
- **References:** 
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Status badges pair the tone with a small glyph (check, cross, info) so state reads without color, in sentence case.
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): Status as a colored dot plus one word ('Ready', 'Error') in the same column on every row.
  - [Gusto](https://mobbin.com/screens/f5b9c069-c026-4bf7-bc30-f39f61330d79): Dot plus word ('Canceled') with a 'See details' link under it; the StatusPill can carry a detail link the same way.
  - [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a): Stage shown as dot plus label everywhere.
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): One small pill style for every payment status.
  - [Vercel](https://mobbin.com/screens/ac75e179-8e00-463a-9cba-b20d424db41c): Status is a colored dot plus one word ('Ready', 'Error') in the same column on every row.
  - [Shopify](https://mobbin.com/screens/d47da099-6b76-4b32-a93d-843cb498d1de): Payment and fulfillment statuses as dot badges in fixed columns, one tone per state.
  - [Attio](https://mobbin.com/screens/9b7cd195-28c6-472d-a3f3-4c3b93f8362b): "Weak", "Very weak" and "No communication" all as dot plus label
  - [PayPal](https://mobbin.com/screens/9b74f0db-1745-48e7-8a95-8715e3cf2e88): Invoice status as small dot plus word
  - [Linear](https://mobbin.com/screens/610d34b6-6ad8-45ab-80fb-2107b31ed01e): One consistent status glyph per row; color is reserved for state
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Payment status always as the same small chip shape (Succeeded, Failed, Incomplete)
  - [Stripe](https://mobbin.com/screens/f15b2bf5-9e01-40a8-9cbe-d01edfabba56): Every row carries the same status chip in the same column.
- **Code:** `src/lib/config.ts:95-102`, `src/components/ui.tsx:107-115`, `src/app/(app)/properties/[id]/building-capex.tsx:47-52`, `src/app/(app)/properties/[id]/edit-units.tsx:265`, `src/app/(app)/properties/page.tsx:72-78`, `src/app/(app)/properties/[id]/building-capex.tsx:21-51`, `src/app/(app)/properties/[id]/edit-units.tsx:25-30`, `src/app/(app)/properties/[id]/edit-units.tsx:264-276`, `src/lib/config.ts:130-145`, `src/app/(app)/properties/[id]/page.tsx:84-88`
- **Also found as:** DATA-035 (Lens: tables, numbers, money, charts and status), PROPERTY-031 (Property detail page (future property hub)), PORTFOLIO-015 (Portfolio list and new property)
- **Verification:** confirmed. Seen: a Rehabbing badge beside bare 'Refinanced' text on Portfolio, tinted selects on Deals, a red 'Replace' badge next to bold 'Unknown' text in the equipment editor, green 'Good' text in Building CapEx, and an 'ACTIVE' badge in Financials settings. TONE_CLASSES in config.ts:95-102 duplicates badgeTones in ui.tsx:107-115 line for line.

### VISUAL-014

**List pages are capped at 1152px while their tables clip**

High · Design change · effort S · `Deals, Tasks, Portfolio, Contractors, Financials` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. main still wraps every page in max-w-6xl. At 1920, /tasks/all is a 1152px column starting at x=416 with about 350px empty on each side. /deals at 1920 still cuts off 'Updated' (table scrollWidth 1210 vs 1150 client), and at 1280 the Deals table still scrolls sideways inside its card.
- **Today:** main wraps every page in max-w-6xl. At 1920 the Deals table sits in a 1152px column with about 350px empty on each side, yet its 'Updated' column is cut off and addresses wrap to two lines; at 1280 the same table scrolls sideways inside its card.
- **Why:** Dense lists should use the width; Stripe Transactions and Vercel's list are fluid. A max width suits reading pages, not lists.
- **Change:** Two page widths: full (lists) fluid with 24 to 32px gutters up to 1600px; reading (detail and settings) max 1200px with the rail. Expose it as a width prop on the page shell.
- **Desktop, tablet, phone:** 1920: lists fill to 1600. 1280: lists fill the viewport. Tablet and phone keep 24 and 16px gutters.
- **Reuse:** AppShell main container (app-shell.tsx:194).
- **References:** 
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): Transactions table spans the content area.
  - [Vercel](https://mobbin.com/screens/2dbc8bfc-0725-4682-9453-27f6be9d2bc1): Fluid list view.
  - [Stripe](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13): Content starts at a fixed offset from the sidebar and the table fills the width.
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Content starts at a fixed offset from the sidebar
- **Code:** `src/components/app-shell.tsx:194`, `branch src/components/app-shell.tsx:195`, `src/components/app-shell.tsx:193-194`
- **Also found as:** IA-040 (Lens: information architecture and global SaaS patterns), SHELL-040 (App shell, sidebar, top bar, global search and Home)
- **Verification:** confirmed. Measured: the table is 1210px inside a 1150px box at both 1280 and 1920, with main at 1856px but the content capped at 1152px. 'Updated' is cut at every desktop width.

### VISUAL-015

**Tables shrink onto phones instead of becoming list rows**

High · Design change · effort L · `Portfolio, Deals, property CapEx, Financials on phone` · The phone is a chosen subset, and touch has no hover · big bet

- **Today:** On phone each table keeps its desktop columns and scrolls sideways inside a card: Portfolio addresses wrap to five lines beside four-line entity names, the property CapEx table cuts 'Due' to 'Du', and Deals shows an address and half a status chip.
- **Why:** Phones need lists, not shrunken spreadsheets. Stripe and Mercury phone apps show one row per record with a title, a meta line and the figure at the right.
- **Change:** Add a ListRow primitive (or a mobile list mode on Table): line one title at 14/20 medium with the figure right-aligned; line two 12/16 muted meta (status pill, city, date). Use it below 640px on Portfolio, Deals, Tasks, Contractors, CapEx and Financials by property.
- **Desktop, tablet, phone:** Desktop and tablet keep tables. Phone: 56 to 64px rows, full width with inset dividers; Entity, Units and Next action drop.
- **Reuse:** Table (ui.tsx:170) plus a new ListRow in ui.tsx.
- **References:** 
  - [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58): Each row: title on line one, its parent as a gray sublabel beneath, deadline flag on the right.
  - [Linear Mobile](https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690): One-line phone rows: status glyph, title, avatar at the right edge.
  - [Stripe Dashboard](https://mobbin.com/screens/d8b72d98-48cd-4829-ad08-309ae833dfe4): Amount and status on line one, meta and date below.
  - [Mercury](https://mobbin.com/screens/82e8f14d-9bf6-4956-bb4d-8d9306d167d3): Transactions as rows with the amount at the right edge.
  - [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9): Name left, amount right, method muted under the name
  - [Copilot](https://mobbin.com/screens/0a8866fc-d1b9-4ca0-9a1b-985eff471f55): Phone list rows with the key value trailing, instead of a table.
  - [Todoist](https://mobbin.com/screens/faabd19c-2bbf-42fc-8e16-404c4ce5fb41): Second line carries the context.
- **Code:** `src/components/ui.tsx:168-180`, `src/components/ui.tsx:193-205 (Table, maxHeight 70vh)`, `src/app/(app)/contractors/page.tsx:31-63`, `src/app/(app)/tasks/task-row.tsx:14-27`, `src/app/(app)/contractors/page.tsx:30-40`, `branch: src/app/(app)/contractors/page.tsx:24-40`
- **Also found as:** DATA-018 (Lens: tables, numbers, money, charts and status), IA-V02 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. Portfolio at 375 wraps addresses to five lines beside four-line entity names, and CapEx 'Due' cuts to 'Du'. Mobbin d8b72d98 is verified as the Stripe Dashboard iOS payments list. VISUAL-001 is the urgent Tasks-only slice of this.

### VISUAL-I05

**Replace the default Vercel triangle favicon with an HG mark**

High · Design change · effort S · `Browser tab and home-screen icon on every page (app and public site); app header wordmark` · One design system, fixed in the primitives · quick win

- **Today:** src/app/favicon.ico is the create-next-app default: 25,931 bytes, a white triangle on a black circle, unchanged since commit 79137b5 'Scaffold HG Capital OS v1' (favicon.png converted from it). There is no apple-icon, so a phone home-screen bookmark gets a screenshot. The app header shows 'HG Capital OS' as 14px semibold text (app-shell.tsx:83-85) while the public header uses a spaced-caps wordmark (public/header.tsx:19); the app has no mark of its own.
- **Why:** Every tab, bookmark and the rentals page renters open shows another company's logo, which reads as unfinished. Mercury, Linear and Vercel anchor the top-left with one small identity tile that matches the tab icon.
- **Change:** Draw one HG monogram: 'HG' in Geist medium, off-white on near-black #08090b with a thin gold #c8a765 rule, matching the public wordmark. Ship it as icon.svg and apple-icon.png through the app/ metadata file conventions, and use the same 24px tile beside 'HG Capital' in the app header. Gold appears in the app only here and in payoff art (VISUAL-I11).
- **Desktop, tablet, phone:** Same tile at every size. Phone header keeps the tile and drops the words to give search the room (pairs with VISUAL-045).
- **Reuse:** Next's icon and apple-icon file conventions in src/app (node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md); the tile is new, based on Mercury's workspace tile.
- **Challenges:** CLAUDE.md Personality, Two surfaces, two palettes: the app ignores gold. This uses gold once in the app, on the brand tile.
- **References:** 
  - [Mercury](https://mobbin.com/screens/d575358b-679b-4d52-aa98-5026970291b3): Monogram tile beside the company name at the top-left of the sidebar.
  - [Linear](https://mobbin.com/screens/fd1b4d88-f021-49a3-98af-4cd3a87e1d29): Workspace tile plus name as the only brand mark in the app.
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): Team avatar tile top-left, small and quiet.
- **Code:** `src/app/favicon.ico`, `src/components/app-shell.tsx:83-85`, `src/components/public/header.tsx:19`, `src/app/layout.tsx:9-12`, `src/app/favicon.ico (25,931 bytes, git log: 79137b5 Scaffold HG Capital OS v1)`, `curl http://localhost:3200/welcome and /rentals: only <link rel="icon" href="/favicon.ico…">, no apple-touch-icon`
- **Also found as:** SHELL-019 (App shell, sidebar, top bar, global search and Home), PUBLIC-V01 (Login and the public site), G1E-V01 (What leaves the app: printouts, PDFs and the Google listing)
- **Verification:** confirmed. Verified. src/app/favicon.ico is 25,931 bytes, unchanged since 79137b5 'Scaffold HG Capital OS v1', and it renders the Vercel triangle (favicon.png). There is no icon or apple-icon file in src/app, and layout.tsx metadata sets no icons. It shows on the public rentals pages renters open. The gold-in-app conflict is named, and the HG mark could keep gold for the favicon only while the in-app header tile stays zinc. Pair this with VISUAL-V06 (every tab is titled 'HG Capital OS'). References are plausible; I verified Linear fd1b4d88 shows a workspace tile plus name.

### VISUAL-V01

**Touch users have no visible way to open a task from the Tasks list**

High · Design change · effort S · `Tasks list rows on iPad and phone (touch)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The task part is fixed by task-row.tsx:77-82, and the tablet screenshot shows the two-line rows.
- **Today:** Tasks are fixed. At 768 (touch) every row on /tasks/all is a full-row link to the task, with the checkbox and date chip on top as the only inline controls. Two hover-only controls remain on touch: the deal row's '↗' listing link (opacity-0 until group hover) and the listing photo remove and reorder buttons.
- **Why:** Opening a task is the list's core job, and the house rules make tablet the touch layout. Home and the property Tasks card already link titles to the task page, so the main list is the one place a field user gets stuck. House rule: touch has no hover.
- **Change:** Scope it to the deal row link (deal-row.tsx:66) and the listing photo controls (edit-listings.tsx:481, 485). On touch, move them to the deal page and to an edit mode, never as a permanent icon on every row.
- **Desktop, tablet, phone:** Desktop 1280: unchanged. Tablet 768: tapping the title opens the task, and the owner and due cells read as plain text. Phone 375: list rows per VISUAL-001 and VISUAL-015, where the whole row opens the task.
- **Reuse:** TaskRow in src/app/(app)/tasks/task-row.tsx. Reuse the title Link pattern already in the Home task list ((app)/page.tsx:76) and the property Tasks card.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/3810be1f-d4fa-4938-ae09-d7a2651c0274): Issue rows are tap targets: status, title, then a meta line, with no inline fields.
  - [Stripe Dashboard](https://mobbin.com/screens/d8b72d98-48cd-4829-ad08-309ae833dfe4): Payment rows open the record on tap; nothing in the row is editable.
- **Code:** `src/app/(app)/tasks/task-row.tsx:145`, `src/app/(app)/tasks/task-row.tsx:54`, `src/app/(app)/deals/deal-row.tsx:66`, `src/app/(app)/properties/[id]/edit-listings.tsx:481`, `branch src/app/(app)/tasks/task-row.tsx:77-82`, `branch src/app/(app)/deals/deal-row.tsx:66`, `branch src/app/(app)/properties/[id]/edit-listings.tsx:481-485`
- **Verification:** verifier-found

### VISUAL-V02

**Full-page lists scroll inside a 70vh box instead of the page**

High · Design change · effort S · `Tasks, Deals, Portfolio list pages` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The task part is fixed by the list rebuild (all/page.tsx:49-60, all-list.tsx).
- **Today:** Tasks no longer use Table. /tasks/all puts 236 rows in the page flow (page height 11,833px at 1280, no inner scroll box). Deals, Portfolio, Contractors and Financials still use Table with maxHeight 70vh: /deals at 1280 scrolls inside a 560px box, and at 320 inside a 398px box starting 263px down.
- **Why:** Scroll inside scroll is the clumsiest pattern on touch, and the list never gets the full screen. Stripe Transactions and Linear lists scroll the page and keep the header row stuck under the app bar.
- **Change:** Drop Tasks from scope. Apply the in-page-flow rule with a sticky header to Deals, Portfolio, Contractors and the Financials list pages.
- **Desktop, tablet, phone:** Desktop and tablet: the page scrolls and the header row sticks at the app bar's divider. Phone: list rows (VISUAL-015) scroll with the page, with no inner box.
- **Reuse:** Table's maxHeight prop and Th's sticky positioning in src/components/ui.tsx:170-190.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258): The Transactions table sits in the page flow, with no inner frame or scroll box.
  - [Linear Mobile](https://mobbin.com/screens/3810be1f-d4fa-4938-ae09-d7a2651c0274): The issue list scrolls as the page under a fixed bottom bar.
  - [Stripe](https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c): The list is part of the page scroll; the result count sits right under the last row.
  - [Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79): Page-level scroll with a header row.
  - [Mercury](https://mobbin.com/screens/0546a342-6b5a-47c3-8d95-4871d6eb59d5): Vendor list that flows with the page under a plain header
  - [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9): The list is the page; the large title collapses as you scroll
  - [Stripe Dashboard](https://mobbin.com/screens/8113ccdd-0eac-4bb5-9731-55cf00a433a1): Related lists (Payments) flow in the page with an inline 'Create payment' row, no inner scroll
  - [Copilot](https://mobbin.com/screens/39449ee8-750e-432e-b82f-251a0eb74bbe): A long transactions list scrolls with the page under one search field; no boxed inner scroller.
  - [Attio](https://mobbin.com/screens/24d97071-f951-4c50-b21a-cabe794fe10e): Phone task list is one full-height scroll with grouped rows and no inner scroll box.
  - [Fabric](https://mobbin.com/screens/7ac3ad82-b19c-4c69-ba0e-cc12333c294b): Phone task list scrolls with the page under a compact header and filter field.
  - [Stripe](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13): The page scrolls; the table has no inner scroll box
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Transactions table flows with the page and ends with a "6 results" footer, with no inner scroll box
- **Code:** `src/components/ui.tsx:170-178`, `branch src/components/ui.tsx:193-199`, `src/components/ui.tsx:170-179`, `src/components/ui.tsx:170-180`, `branch:src/components/ui.tsx:193-199`, `probe /tasks at 375: 'DIV.w-full.max-w-full 444x9652 in 341x467'; at 320 '... in 286x398'`, `src/app/(app)/deals/[id]/page.tsx:106`, `src/app/(app)/properties/[id]/page.tsx:178`, `branch src/components/ui.tsx:193-203`, `branch src/app/(app)/properties/[id]/page.tsx:195`, `branch src/app/(app)/deals/[id]/page.tsx:107`, `shoot output: /tasks pageHeight 755 at 375, /contractors pageHeight 667`, `branch-src/src/components/ui.tsx:193-203`, `branch-src/src/app/(app)/properties/[id]/page.tsx:195`, `shoot /contractors at 375: pageHeight 667, box 467px, scrollHeight 2141, overscroll contain`, `shoot /tasks at 375: pageHeight 4857 (list scrolls with page)`, `tasks-scroll eval at mobile: [maxHeight 70vh, clientHeight 467, scrollHeight 9652, overscroll contain, innerHeight 667, page 755]`, `src/components/ui.tsx:172-176`, `src/components/ui.tsx:193-202 (maxHeight = '70vh', overscroll-contain)`, `src/app/(app)/tasks/all/all-list.tsx:9 (ul, no Table)`, `eval /tasks/all mobile: scrollers []`, `eval /contractors mobile: ['70vh 467/2141']`, `src/components/ui.tsx:193-197`, `src/app/(app)/properties/[id]/page.tsx:195`, `src/app/(app)/deals/[id]/page.tsx:107`, `eval: /tasks wrapper scrollHeight 9103 / clientHeight 560; /contractors at 375 1987 / 467, page 667`, `docs/components.md:84`, `branch src/components/ui.tsx:193-203 (same as main)`, `branch src/app/(app)/tasks/all/all-list.tsx:9`
- **Also found as:** PORTFOLIO-005 (Portfolio list and new property), DEALS-048 (Deals pipeline, new deal and deal detail), ADMIN-026 (Contractors directory, contractor detail and Settings), MOBILE-005 (Lens: phone and tablet experience on every route), MOBILE-IV05 (Lens: phone and tablet experience on every route), FEEL-V03 (Lens: interaction quality, feedback, states, speed and accessibility), DATA-045 (Lens: tables, numbers, money, charts and status), JOURNEYS-V04 (Lens: the core jobs, end to end)
- **Verification:** verifier-found

### VISUAL-005

**The property task card still formats due dates its own way**

Medium · Fix · effort S · `Tasks list, property task card` · Money, numbers and dates read one way

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The high-severity 'everything is yesterday' bug is fixed in lib/dates.ts:161-176, with tests in dates.test.ts:67-79.
- **Today:** Today, All and Home now share dueLabel through DueDatePicker. One day back reads 'Yesterday', up to a week reads 'Nd late' ('2d late'), and older dates show the real date ('Oct 16', 'Apr 19, 2025') in red. The property task card (/properties/cmtg25y4k0002jphsxww4tv6k) still formats dates differently: plain fmtDay in muted gray ('Oct 22, 2026', 'Aug 28, 2026', with the current year), and overdue items are not red.
- **Why:** Wrong copy on the core list; how overdue something is drives triage.
- **Change:** Only the property card is left. In properties/[id]/page.tsx:215-217, render the target with dueLabel and red when overdue (or reuse DueDatePicker read-only), so a task reads the same there as on Today.
- **Desktop, tablet, phone:** Same label at all sizes; phone uses the short form 'Sep 2'.
- **Reuse:** src/lib/dates.ts dueLabel and relativeDays.
- **References:** 
  - [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58): Deadline flag reads '4d left' in gray and turns red only on the day ('today'); relative labels are exact counts, never a vague 'yesterday'.
  - [Linear](https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b): List dates shown as calendar dates ('Mar 31') in gray.
  - [Things 3](https://mobbin.com/screens/724087de-2e95-47ec-926c-efbdab249a23): Deadline flag reads '4d left' and turns red as 'today'; the label states the distance in days instead of a vague word.
  - [Things 3](https://mobbin.com/screens/32aaaf2f-9ad2-42c4-86fa-747852952730): Deadline row pairs the date with '14 days left'. HG's overdue label should read '12 days overdue' the same way.
  - [Attio](https://mobbin.com/screens/24d97071-f951-4c50-b21a-cabe794fe10e): Overdue items show the real date ("Aug 9, 2024") or real age ("6 days ago") in a red chip, never a fixed word.
  - [Linear](https://mobbin.com/screens/610d34b6-6ad8-45ab-80fb-2107b31ed01e): Due dates read as "Tomorrow" or "Apr 8": relative only near today, real dates otherwise.
- **Code:** `src/lib/dates.ts:116-125`, `branch src/lib/dates.ts:154-176`, `branch src/app/(app)/properties/[id]/page.tsx:215-217`, `src/lib/dates.ts:115-124`, `src/app/(app)/page.tsx:88 (relativeDays)`, `src/app/(app)/properties/[id]/page.tsx:198 (fmtDay)`, `src/app/(app)/tasks/task-row.tsx:244 (dueLabel)`, `src/lib/dates.ts:154-177`, `src/app/(app)/tasks/my-tasks-list.tsx:27`, `src/app/(app)/tasks/task-row.tsx:146-155`, `src/lib/dates.ts:115-125`, `branch src/lib/dates.ts:154-177`, `branch src/app/(app)/properties/[id]/page.tsx:216`, `branch src/app/(app)/contractors/[id]/page.tsx:152-154`, `src/lib/dates.ts:115-124 dueLabel: if (days < 0) return "yesterday"`, `branch-src/src/lib/dates.ts:161-176 (4652abb)`, `branch-src/src/components/due-date-picker.tsx:71`
- **Also found as:** FEEL-002 (Lens: interaction quality, feedback, states, speed and accessibility), MOBILE-V01 (Lens: phone and tablet experience on every route), COPY-IV01 (Lens: words on every screen)
- **Verification:** confirmed. The Tasks list shows 'yesterday' for an Apr 19, 2025 due date. dueLabel's comment and the unit test (src/lib/dates.test.ts:68, 'any overdue') pin this on purpose, so the fix has to update the test, and Connor should confirm it was not a deliberate choice. There are actually three formats: Home uses relativeDays ('55d ago') and the property Tasks card uses fmtDay ('Aug 28, 2026'). The 'property task card' in the screen field doesn't use dueLabel.

### VISUAL-007

**No focus ring system; focus on the primary button is invisible**

Medium · Fix · effort S · `All pages, keyboard` · One design system, fixed in the primitives

- **Today:** globals.css defines no shared focus style. On the filled primary button, the browser's default ring is blue on blue and nearly invisible. Segmented buttons, links and inputs still show a visible ring of their own, so the gap is mainly the primary actions.
- **Why:** Keyboard users cannot see where they are. Stripe marks the focused or active control with a crisp accent outline.
- **Change:** Global :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px } with --ring blue-600 light and blue-400 dark. Inputs keep border-primary plus a 3px ring at 25%. Remove outline-none wherever no replacement is given.
- **Desktop, tablet, phone:** Same at all sizes; touch shows no ring because focus-visible does not fire on tap.
- **Reuse:** src/app/globals.css; Button, Input, Select, Textarea in ui.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/fa14d771-ae36-4074-8532-06dbcfd8ff74): Active control marked with a clear accent outline.
  - [Linear](https://mobbin.com/screens/610d34b6-6ad8-45ab-80fb-2107b31ed01e): Lists use a single highlighted row as the focus marker, with properties as compact targets.
- **Code:** `src/components/ui.tsx:68`, `src/components/ui.tsx:138`, `tabwalk /tasks: tab 24 outline rgba(107,114,128,0.4); tabs 27 and 29 are selects at opacity 0`, `tabwalk /: tab 4 Pin sidebar at opacity 0; tab 12 Sign out clipped in the rail`, `src/app/(app)/tasks/task-row.tsx:86-87`, `src/components/inline-address-field.tsx:50`, `src/app/(app)/tasks/task-row.tsx:79`, `src/app/(app)/tasks/task-checkbox.tsx:41`, `src/components/ui.tsx:140-151 (pickerChip ring-primary/30)`, `src/app/(app)/tasks/[id]/select-chip.tsx:43`, `src/components/inline-address-field.tsx:77`, `tabwalk /tasks: tab 4 'Pin sidebar open' opacity 0; tab 12 'Sign out' x=52 w=46; row stops box-shadow 'oklab(0.488 -0.021 -0.216 / 0.3) 0 0 0 2px'`, `contrast scan /deals light: 2.25 (12px, rgb(107,114,128) at op 0.6 on rgb(247,247,248), "675")`, `computed: checkbox border 1.98:1, tick 1.7:1, focus ring primary/20 1.37:1 light and 1.26:1 dark`, `src/app/(app)/tasks/task-checkbox.tsx:17`, `src/app/(app)/tasks/task-checkbox.tsx:41-44 (ring-primary/30, border-muted/60, text-transparent tick)`, `src/components/segmented-control.tsx:56,61 (ring-primary/30, count opacity-60)`, `src/app/(app)/tasks/[id]/notes.tsx:51 (ring-primary/20)`, `src/components/ui.tsx:158,170,182 (inputs ring-primary/20 with border-primary)`, `computed: muted/60 on #fff 2.32:1, on #161819 2.79:1; count op60 on #f7f7f8 2.25:1, dark 2.85:1; primary/30 ring 1.63:1 light, 1.51:1 dark`
- **Also found as:** FEEL-017 (Lens: interaction quality, feedback, states, speed and accessibility), FEEL-033 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** partly. The focus crops confirm that the ring on the filled '+ New deal' button is nearly invisible. Other controls do show focus: segmented buttons get the UA ring, inputs get border plus ring, and links get the UA outline. The impact is mostly the primary button, so medium fits better than high. The global focus-visible token is still the right fix.

### VISUAL-013

**One person, four avatar styles and colors that collide with statuses**

Medium · Design change · effort S · `Tasks list, task page, property task card, sidebar` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Most of the original problem is fixed (components/avatar.tsx:1-45, status-badge.tsx:6-11). Only the sidebar chip, the initials parsing and the tiny initials remain.
- **Today:** The branch has one Avatar primitive: neutral stone circles, ringed for contractors. Task rows, Today's contractor groups, the review banner, activity, the assignee picker, the property task card and the portal all use it, and none collide with status tones. Three gaps remain. (1) The sidebar user chip is still a hand-built blue circle (bg-accent text-primary) at 28px. (2) Initials take the first two words, so 'Jacob (Jake) hoak' renders 'J(' on /tasks. (3) The 20px avatar sets initials at 9px, and sizes are 20, 24 and 32.
- **Why:** Identity marks should be stable, and the hashed palette gives colors with no job that reuse fixed status colors, against the house rule.
- **Change:** Swap the sidebar chip (app-shell.tsx:170-175) for <Avatar>. Fix initials() (utils.ts:49-56) to use the first and last words and skip non-letters. Raise the 20px text to 10 or 11px.
- **Desktop, tablet, phone:** 20px in dense rows, 24px on detail pages, 28px in the account menu; the row provides the 44px touch target.
- **Reuse:** New Avatar in ui.tsx replacing task-row.tsx:24-35, task-detail.tsx:126, properties/[id]/page.tsx:192 and app-shell.tsx:169.
- **References:** 
  - [Linear](https://mobbin.com/screens/937fc32e-04c6-4c39-bcd6-17a42b4fe83c): The same avatar for a person in the list and the properties rail.
  - [Attio](https://mobbin.com/screens/8415dcfb-b1f0-46b2-adf3-278d1aa56b3f): Small neutral avatar chips beside names.
  - [Linear](https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b): Small monochrome avatars at the right edge, so color stays for status.
  - [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9): Initials avatars share one shape and size across every row of the list
  - [Linear](https://mobbin.com/screens/c61980d9-a5a7-4ccf-aac8-b3ba125e299a): Small neutral avatars at the row end that don't compete with status color
  - [Attio](https://mobbin.com/screens/16b2e7b2-da40-4dc2-a63b-139c3078c1d9): Assignees as small neutral avatars with names, distinct from blue actions
- **Code:** `src/app/(app)/tasks/task-row.tsx:24-35`, `branch src/components/avatar.tsx:3-44`, `branch src/components/app-shell.tsx:170-175`, `branch src/lib/utils.ts:49-61`, `src/app/(app)/tasks/task-row.tsx:24-36,193-199`, `src/app/(app)/tasks/[id]/task-detail.tsx:124-130`, `branch:src/components/avatar.tsx:17-44`, `src/app/(app)/properties/[id]/page.tsx:188-194`, `branch src/components/avatar.tsx:30-43`, `branch src/lib/utils.ts:49-60`, `probe: 'Jacob (Jake) hoak => J('`, `src/app/(app)/tasks/task-row.tsx:24-36`, `src/app/(app)/properties/[id]/page.tsx:190-195`, `src/components/avatar.tsx:11-44`, `src/app/(app)/tasks/task-row.tsx:134`, `src/app/(app)/tasks/today-view.tsx:118`, `src/app/(app)/properties/[id]/page.tsx:209-213`, `src/components/assignee-picker.tsx:103-105`, `src/app/(app)/properties/[id]/page.tsx:189-196`, `branch src/app/(app)/properties/[id]/page.tsx:209-214`
- **Also found as:** TASKS-022 (Tasks list, new task and task detail), MOBILE-V06 (Lens: phone and tablet experience on every route), DATA-044 (Lens: tables, numbers, money, charts and status), PROPERTY-050 (Property detail page (future property hub))
- **Verification:** partly. Observation reproduced: Pieter is an amber circle in the list, a blue circle on his task page, and a blue rounded square ('PL', 'JA') in the property Tasks card. The status-color collision is a real house-rule breach, but this is an identity inconsistency, not a usability blocker, so medium fits.

### VISUAL-016

**Swap all-caps micro labels and headers for sentence case**

Medium · Design change · effort S · `All tables and label/value blocks` · One design system, fixed in the primitives

- **Today:** Th and every Field label (Details, Loan, Insurance, the deal and task property boxes) are 12px uppercase tracking-wide; Settings rules headers are 10px uppercase; CapEx tables on the same property page use sentence case.
- **Why:** All-caps micro labels read dated and loud; Stripe Transactions, Linear and Attio use sentence-case labels in a muted color.
- **Change:** Th: 12px medium sentence case in muted zinc-500 with no background band. Field: 13px muted label at left, 14px value at right on one row.
- **Desktop, tablet, phone:** Desktop and tablet: label and value on one row. Phone: same row, value right-aligned, wraps under the label only past 60% width.
- **Reuse:** Th and Field (ui.tsx:185, 220); capex-rules-editor.tsx:185.
- **References:** 
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): Sentence-case column headers.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Muted sentence-case property labels.
  - [Stripe](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13): Headers "Amount", "Payment method", "Description" in sentence case on white
  - [Mercury](https://mobbin.com/screens/36f606b5-2ee5-4b26-ba14-0204c5295576): Light sentence-case headers with sort icons
  - [Stripe](https://mobbin.com/screens/f8db8469-2830-4c6b-98ca-53bf4c1e3caf): Detail labels (Name, Number, Fingerprint) in sentence case
  - [Stripe](https://mobbin.com/screens/fc7b35c9-f823-4f28-bb16-d981a05cb530): Settings row labels in sentence case
  - [Stripe](https://mobbin.com/screens/373146e1-8686-43b0-8a10-5da707dc8873): Sentence-case table headers.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Sentence-case attribute labels in the rail.
  - [Stripe](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258): Sentence-case headers: Amount, Payment method, Description
  - [Mercury](https://mobbin.com/screens/269ac107-c09e-4c57-a263-2a82ff06c4cd): Quiet sentence-case column headers
- **Code:** `src/components/ui.tsx:185`, `src/components/ui.tsx:220`, `src/app/(app)/deals/[id]/page.tsx:22`, `src/app/(app)/deals/sort-header.tsx:11-12`, `src/components/ui.tsx:181-190`
- **Also found as:** DATA-028 (Lens: tables, numbers, money, charts and status), COPY-064 (Lens: words on every screen), DEALS-055 (Deals pipeline, new deal and deal detail), FINANCIALS-058 (Financials, rent roll and financial settings)
- **Verification:** confirmed. Th and Field are uppercase tracking-wide in code, and the Settings rules headers are 10px uppercase. This is partly a taste call: Stripe's own search results page uses small uppercase headers (Mobbin 9a241073), while Stripe Transactions (1bbafee3) uses sentence case. Linear and Attio back sentence case. Merge with VISUAL-033 when reporting.

### VISUAL-021

**Red does too many jobs and stops meaning urgent**

Medium · Design change · effort S · `Home, Property, Tasks, Deals` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. This conflicts with an approved design (spec section 7 'Review red', status-badge.tsx:17), so the Review color is a question for Connor, not a fix.
- **Today:** In the task views, red is now the overdue date chip only, which matches the recommendation. But the Review status badge is also red by the approved tone table. On Today's Contractors column, red therefore means both 'needs review' and 'overdue'. Elsewhere it is unchanged: CapEx due-soon and current-year marks are red, the Deals '1 - High' status select is red, 'Replace' badges are red, and negative cents are red in Financials.
- **Why:** When red is on every row it carries no signal. House rule: every color has a job.
- **Change:** Task priority is gone on the branch, so drop that part. Keep the CapEx, Deals status and Replace changes. Raise as a question: Review is red per the approved spec section 7 tones, so should Review move to an unused hue so overdue stays the only red in task views?
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** portfolio-capex.tsx:99, 141-144; capex-outlook.tsx:51, 92-95; tone map in lib/config.ts.
- **References:** 
  - [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58): About 95% neutral; red appears only on the deadline flag for today.
  - [Stripe Dashboard](https://mobbin.com/screens/b2499df0-b3fd-4f85-9b34-fa551a598e23): A drop in volume is orange, not red, so red stays meaningful.
  - [Linear](https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b): Priority as gray bar icons; dates gray.
  - [Stripe](https://mobbin.com/screens/54ef3db8-2b9e-4ef3-a91a-cad15de1e1c9): Red used only for 'Failed'.
- **Code:** `src/app/(app)/portfolio-capex.tsx:141-144`, `branch src/components/status-badge.tsx:12-20`, `branch src/components/due-date-picker.tsx:88`, `branch src/app/(app)/portfolio-capex.tsx:99`, `branch src/app/(app)/portfolio-capex.tsx:219-221`, `branch src/app/(app)/properties/[id]/building-capex.tsx:48`
- **Verification:** confirmed. Red marks the current-year CapEx bar, '$13,000 due soon', five 'Due soon' cells, every overdue task, '1 - High' and 'Replace'. The Tasks list's first screen is a solid red column.

### VISUAL-022

**Chart colors are opacity tints and amber, not chart tokens**

Medium · Design change · effort S · `Home CapEx, property CapEx, Financials charts` · One design system, fixed in the primitives

- **Today:** Bars use bg-primary/50 and /60 (lavender on white, navy on dark), expense bars amber-500/60 (the warning hue, shown right under an amber warning banner) and current CapEx red-500/70.
- **Why:** Opacity tints shift with the background and produce off-palette hues; amber for expense collides with warnings on the same page.
- **Change:** Chart tokens: --chart-1 solid accent (blue-600, dark blue-400), --chart-2 subtle accent (blue-200, dark blue-900), --chart-neutral zinc-300 (dark zinc-700); income accent, expense neutral; tracks on surface-2. Fold the two CapEx bar implementations into MoneyBars.
- **Desktop, tablet, phone:** Same colors at all sizes.
- **Reuse:** MoneyBars (financials/_components/ui.tsx:47-77), portfolio-capex.tsx, capex-outlook.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62): 'Cash in vs out': money in drawn above the baseline, money out below in a pale second tone; one hue per series, no legend needed.
  - [Vercel](https://mobbin.com/screens/fd0e54a5-45cc-4a47-be0d-3fdb7e804ec7): Usage chart: one solid dot color per series, values shown in the hover card instead of a printed legend.
  - [Stripe](https://mobbin.com/screens/99ff48f8-6d2a-444f-bfa0-34377c62bf93): Bar chart uses one accent plus gray.
  - [Mercury](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2): Single-hue balance chart.
- **Code:** `src/app/(app)/financials/page.tsx:146`, `src/app/(app)/financials/page.tsx:152`
- **Verification:** confirmed. Code: bg-primary/60 and bg-amber-500/60 in the monthly chart, bg-primary/50 and amber for negatives in MoneyBars, and red-500/70 for the current year in portfolio-capex. The amber expense bars sit right under the amber sync banner.

### VISUAL-023

**Dark mode nests darker surfaces inside cards**

Medium · Design change · effort S · `All pages, dark theme` · One design system, fixed in the primitives

- **Today:** Inside #161819 cards, table header bands, KPI tiles, unit headers, bar tracks and hovers use --background #0b0c0e, darker than the page itself, so nested elements look like holes.
- **Why:** In dark UIs elevation gets lighter as layers rise (Vercel, Origin, Linear); darker insets invert the hierarchy.
- **Change:** Add --surface-2 (light #fafafa, dark #18181b) and --hover (light #f4f4f5, dark #1f1f23) and use them for Th, Kpi, unit headers, tracks and hovers instead of --background.
- **Desktop, tablet, phone:** Token change; same at all sizes.
- **Reuse:** globals.css; Th (ui.tsx:185); Kpi (financials/_components/ui.tsx:29).
- **References:** 
  - [Linear](https://mobbin.com/screens/e142df2a-3527-499c-8f81-1b715947ac0c): Dark list: content panel one step lighter than the chrome, group header bands lighter again; surfaces brighten as they rise.
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): Dark deployments list on near-black with hairline rows, no darker wells inside the table.
  - [Vercel](https://mobbin.com/screens/9b397b77-fd80-4157-9867-2ae4010133a4): Cards lighter than the page in dark.
  - [Origin](https://mobbin.com/screens/040b3104-43e3-4f66-8143-74d3be989fe3): Summary strip a step lighter than its card.
- **Code:** `src/components/ui.tsx:185`
- **Verification:** confirmed. In dark mode the Th band, bar tracks and unit headers inside #161819 cards are #0b0c0e holes (home and financials dark shots). One detail is off: the Financials KPI tiles sit on the page rather than inside a card, so they merge with the canvas instead of reading as holes. The token fix still applies.

### VISUAL-024

**color-scheme is never set, so native menus and pickers stay light in dark mode**

Medium · Fix · effort S · `All pages, dark theme on a light OS` · One design system, fixed in the primitives

- **Today:** With data-theme=dark the root computes color-scheme: normal; only the task due-date input sets it. When the app is dark and the OS is light, native select menus, date pickers, scrollbars and autofill render light.
- **Why:** White native menus flashing over a dark UI look broken.
- **Change:** Add :root { color-scheme: light } and :root[data-theme=dark] { color-scheme: dark } in globals.css and remove the one-off in task-detail.tsx.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** src/app/globals.css.
- **Code:** `src/app/globals.css:17`, `src/app/(app)/tasks/[id]/task-detail.tsx:166`, `src/app/globals.css:3-24`, `Probe: getComputedStyle(document.documentElement).colorScheme is 'normal' in dark mode`, `Probe on :3300 dark /settings/move-in-form: colorScheme 'normal'`, `branch src/app/globals.css:3-24, 41-91`, `branch src/app/(app)/tasks/filters.tsx:81-130`
- **Also found as:** ADMIN-V02 (Contractors directory, contractor detail and Settings)
- **Verification:** confirmed. Root color-scheme computes 'normal' with data-theme=dark. This is broader than stated: with 'normal', native select popups, date pickers and scrollbars render light in dark mode whatever the OS setting, not only on a light OS. The one-off is at task-detail.tsx:166.

### VISUAL-025

**Danger text uses red-600 in dark mode at 3.69:1**

Medium · Fix · effort S · `Home, Financials, listings, attachments in dark` · One design system, fixed in the primitives

- **Today:** Home overdue labels, Kpi negatives, listing upload errors and attachment errors use text-red-600 with no dark variant: 3.69:1 on the dark surface.
- **Why:** The most urgent text fails AA in dark mode.
- **Change:** A --danger token (red-600 light, red-400 dark at 6.4:1) used for every danger text.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** globals.css; (app)/page.tsx:86; financials/_components/ui.tsx:35; edit-listings.tsx:531; attachments.tsx:167.
- **References:** 
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): 'Error' rendered as a lighter red dot plus word that stays legible on near-black, the dark-mode danger tone HG needs.
- **Code:** `src/app/(app)/page.tsx:86`, `branch: src/components/ui.tsx:77`
- **Also found as:** SHELL-045 (App shell, sidebar, top bar, global search and Home), BCONTRACT-025 (Branch: contractors directory, portal access, Home and emails)
- **Verification:** confirmed. '55d ago' on Home dark renders visibly dimmer, red-600 at about 3.7:1 on #161819. Kpi's negatives (financials _components/ui.tsx:35) have the same issue. The CapEx text already uses dark:text-red-400, which is the in-house precedent.

### VISUAL-027

**Four record types, three detail layouts; use one DetailLayout**

Medium · Design change · effort M · `Deal, task, property and contractor detail pages` · One record layout for every record · big bet

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The approved task page design sets the pattern, so the recommendation now points the remaining pages at it.
- **Today:** The task page is now a main column with a sticky 288px right rail (approved 'page with side rail'), which is close to the recommended DetailLayout. The other detail pages still differ: the deal is a centered max-w-2xl column, the contractor is a 1/3 left column plus 2/3 Jobs, and the property is 2/3 main plus a 1/3 right rail.
- **Why:** Each record looks like a different app. The approved plan already calls for a task side rail and a property hub with tabs.
- **Change:** Extract the task page's grid (view.tsx:60-66, header areas at 67-98) into a shared DetailLayout and move the deal and contractor pages onto it, with the rail on the right. The property page follows when the approved D10 property hub with tabs is built. Settle one rail width (the task rail is 18rem; the original rec said 320px).
- **Desktop, tablet, phone:** Desktop: main plus rail. Tablet: rail becomes a two-column property grid under the header. Phone: one column, properties first as label and value rows, then content.
- **Reuse:** New DetailLayout built from PageHeader, TopTabs and Section; deals/[id]/page.tsx:45 and tasks/[id]/page.tsx:49 move onto it.
- **References:** 
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Title and activity in the main column, properties in a right rail.
  - [Attio](https://mobbin.com/screens/8415dcfb-b1f0-46b2-adf3-278d1aa56b3f): Record header, tabs, details rail.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:45`, `src/app/(app)/tasks/[id]/page.tsx:49`, `branch src/app/(app)/tasks/[id]/view.tsx:58-149`, `branch src/app/(app)/deals/[id]/page.tsx:46`, `branch src/app/(app)/contractors/[id]/page.tsx:62-63`, `branch src/app/(app)/contractors/[id]/page.tsx:123`
- **Verification:** confirmed. Deal and task are a centered narrow column, the property is a main column with a right rail, and the contractor has a left rail with jobs at right (contractor--desktop-light.png). Consistent with the approved D10 hub tabs and the task side rail.

### VISUAL-029

**Three KPI tile designs for one job**

Medium · Design change · effort S · `Home and Financials` · One design system, fixed in the primitives

- **Today:** Home Stat: white card with shadow, 24px count, label below. Financials Kpi: gray inset tile, 16 to 18px value, label above. DqStat: a third, amber-tinted variant.
- **Why:** The same figure type looks different on two screens.
- **Change:** One Stat primitive: 13px muted label above, value 28px semibold with proportional figures, optional 12px meta or delta line; plain and warning variants. Move it to src/components.
- **Desktop, tablet, phone:** Desktop: up to six across. Tablet: three across. Phone: two across (VISUAL-030).
- **Reuse:** Kpi (financials/_components/ui.tsx:15) moved to components; Stat in (app)/page.tsx:102 replaced.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Label above value, small meta under it.
  - [Mercury](https://mobbin.com/screens/a17be959-5966-495f-a230-65fcdcc333cf): Outstanding, Overdue, Due soon as one consistent trio.
  - [Stripe](https://mobbin.com/screens/a45686d8-0bea-4626-b70b-d432517dce71): Identical metric blocks (MRR, Net volume) with a label, value and small delta chip
- **Code:** `src/app/(app)/financials/_components/ui.tsx:29-43`, `src/app/(app)/page.tsx:102-113`, `src/app/(app)/financials/_components/ui.tsx:15-44`, `src/app/(app)/financials/page.tsx:235-260`
- **Also found as:** DATA-026 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. Home tiles put the value above the label on a white shadowed card. Financials Kpi puts the label above the value on a gray inset, and DqStat is amber-tinted. At 320 the Home labels also wrap ('Active deals', 'Open tasks' on two lines), so the shared Stat needs one-line labels.

### VISUAL-030

**Nine KPI tiles stack one per row on phone**

Medium · Design change · effort S · `Financials overview, phone` · The phone is a chosen subset, and touch has no hover

- **Today:** On phone the nine Financials tiles stack one per row, so the first chart starts about 1,100px down, under two phone screens of tiles.
- **Why:** Phone users scan figures in pairs; Mercury pairs Money in and Money spent side by side.
- **Change:** Two-column grid for the six core KPIs (value 20px); the three data-quality tiles collapse into one 'QuickBooks cleanup' row that links to Settings.
- **Desktop, tablet, phone:** Desktop six across, tablet three across, phone two across.
- **Reuse:** Stat (VISUAL-029).
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/12a51197-b6e3-47c6-9b1c-cb2279bfbf9d): Three KPIs (Gross volume, Payments, Customers) sit side by side in one card on a 375px phone.
  - [Mercury](https://mobbin.com/screens/7a717e40-6b9a-4dbc-a81c-b7da99d784cb): Money in and Money spent as a two-up pair.
- **Verification:** partly. The tiles do stack one per row, but measured, the first chart starts about 1,107px down a 1,831px page, roughly 1.7 phone screens, not about four.

### VISUAL-031

**Emoji and typed glyphs stand in for icons**

Medium · Fix · effort S · `Units & access, Financials settings, listings, deals` · One design system, fixed in the primitives

- **Today:** Lockbox codes show a color lock emoji before the code; Financials settings use a warning sign, a check mark and a lock emoji in text; buttons use typed x, diagonal arrow and arrow glyphs.
- **Why:** House rule: no emojis in product copy. Typed glyphs render differently per OS and clash with line icons.
- **Change:** Replace with lucide Lock, AlertTriangle, Check, X, ArrowUpRight and ArrowLeft at 14 to 16px in muted color.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** lucide-react (installed, unused).
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Small line icons beside IDs and dates.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:202`, `src/app/(app)/financials/settings/tables.tsx:141`, `src/app/(app)/financials/settings/page.tsx:155`, `src/app/(app)/financials/settings/page.tsx:258-259`, `src/app/(app)/deals/deal-row.tsx:68`, `src/app/(app)/properties/[id]/edit-units.tsx:201-203`, `src/app/(app)/properties/[id]/edit-units.tsx:435`, `src/app/(app)/financials/settings/tables.tsx:139-142`, `src/app/(app)/contractors/[id]/page.tsx:76-93`, `src/app/(app)/properties/[id]/edit-listings.tsx:250,483`, `src/app/(app)/deals/[id]/deal-detail.tsx:249`, `src/app/(portal)/p/jobs/[id]/_components/job-details.tsx:44-57 (word label, reference)`, `src/app/(app)/tasks/[id]/files-list.tsx:64 (Lock icon, reference)`, `probe on /properties/cmtg25y4k0002jphsxww4tv6k: spans '🔒 2374', '🔒 1181', '🔒 1181'`, `src/app/(app)/properties/[id]/page.tsx:170-172`, `src/app/(app)/properties/[id]/edit-listings.tsx:250`, `src/app/(app)/properties/[id]/edit-listings.tsx:483-503`, `src/app/(app)/properties/[id]/edit-units.tsx:431-436`
- **Also found as:** COPY-043 (Lens: words on every screen), PROPERTY-052 (Property detail page (future property hub))
- **Verification:** confirmed. The lock emoji shows beside lockbox codes and on 14 or more pinned account rows in Financials settings (aria). '✓' appears in the reconciliation line and '⚠' in a DqRow label. lucide-react is in package.json and imported nowhere in src.

### VISUAL-032

**Hand-drawn icons in six stroke weights; switch to one lucide set**

Medium · Design change · effort M · `Sidebar, task rows, attachments, editors` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Counted with grep for '<svg' in branch src vs main src.
- **Today:** All new task and portal UI uses lucide-react (27 files), and the task row icons are lucide. 18 hand-drawn SVGs remain in 13 files (26 in 16 on main): nav icons at 20px with stroke 2, the inline-title pencil at stroke 1.3, the attachments dropzone and others. Lucide is used at its default stroke 2 at sizes 12, 14, 16 and 18px, so strokes are still mixed (1.3, 1.5, 1.75, 2, 2.5).
- **Why:** Mixed weights make the icon set look assembled from parts; Linear and Stripe use one set at one weight.
- **Change:** Finish the move: convert nav.tsx, inline-address-field.tsx, attachments.tsx, theme-toggle and the deals sort header to lucide. Set one strokeWidth (1.5) and the size tokens in a small Icon helper or a global .lucide rule.
- **Desktop, tablet, phone:** Same sizes; touch targets come from the button, not the glyph.
- **Reuse:** lucide-react (docs/components.md already names it the pick).
- **References:** 
  - [Airbnb](https://mobbin.com/screens/ec965d5f-a216-49db-b44b-7ee988a9d7d7): Host menu: one stroke weight and one size for every line icon.
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): Sidebar icons at one small size and weight, secondary gray until selected.
  - [Linear](https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b): One icon weight across sidebar and rows.
  - [Linear](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab): Small light icons subordinate to labels
  - [Stripe](https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888): Compact single-weight nav icons
- **Code:** `src/components/nav.tsx:106-117`, `src/app/(app)/tasks/task-row.tsx:56-76`, `src/components/attachments.tsx:148`, `branch src/components/nav.tsx:106-117`, `branch src/components/inline-address-field.tsx:91-103`, `branch src/components/attachments.tsx:217`, `branch src/components/due-date-picker.tsx:4`
- **Also found as:** SHELL-050 (App shell, sidebar, top bar, global search and Home)
- **Verification:** confirmed. grep: 26 inline SVGs in 16 files with stroke widths 1.25, 1.3, 1.5, 1.75, 2 and 2.25. Nav icons are h-5 at stroke 2.

### VISUAL-033

**Four table header styles**

Medium · Design change · effort S · `Portfolio, property CapEx, Building CapEx, Settings rules` · One design system, fixed in the primitives

- **Today:** Th is 12px uppercase semibold on a gray band; the CapEx forecast table uses 12px sentence case without a band; Building CapEx uses 11px; Settings rules use 10px uppercase.
- **Why:** Tables are the app's core surface; one header style makes every list read as the same system.
- **Change:** One Th (spec in VISUAL-016); hand-built grids reuse its class.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** Th; building-capex.tsx:155; capex-rules-editor.tsx:185; portfolio-capex.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): One header style for every table.
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:185`, `src/app/(app)/properties/[id]/building-capex.tsx:155`
- **Verification:** confirmed. Verified: Th is 12px uppercase on a band, Building CapEx is 11px sentence case, CapEx rules are 10px uppercase, and the CapEx forecast is sentence case with no band. The recommendation defers to VISUAL-016, so report them together.

### VISUAL-034

**Cell text does not line up with its column header**

Medium · Fix · effort S · `Tasks list` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. The approved Today/All row list replaced the Tasks table with column headers and inline title inputs. There is no header row to misalign with, and the title is plain text in a row link (task-row.tsx:100). On wide desktop lists the property and date sit in fixed columns (w-36 and w-28, task-row.tsx:112, 146), so they line up row to row, as the screenshot shows. Removal not upheld: The header row is gone, but the claim that the fixed columns 'line up row to row' fails inside Today's Mine card. Unassigned rows get the avatar column (today-view.tsx:62, TaskRow avatar), and the other Mine sections (Overdue, Today, Waiting, No date) don't. At 1280 the property text sits at x=351 in Unassigned and x=379 in Overdue (671 vs 699 at 1920). That is a 28px jog (w-5 avatar plus gap-2) between stacked sections of one card, while the date right edges agree at 643. You can see it by comparing '767 Prospect Avenue' in Unassigned with '647 Prospect Ave.' in Overdue in shots/skeptic-b12/today-sections--boundary--desktop-light.png and recheck-b12/today--hover--desktop-light.png. The task list's columns still don't line up exactly. Fix: within one card, either reserve the w-5 avatar slot in every section (render it empty when avatar is off) or show no avatar in Unassigned, so property, avatar and date share an x through the whole Mine column.
- **Today:** Task titles start about 7px right of the 'TASK' header because the inline input adds px-1.5; address dashes and owner chips are offset the same way.
- **Why:** House rule: things that should line up, line up exactly.
- **Change:** Pull the quiet field back with -mx-1.5 so its text sits on the cell padding, or pad the header to match.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** quiet class in task-row.tsx:38; Td.
- **References:** 
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Cell text starts exactly on its header's left edge; right-aligned columns sit under right-aligned headers.
  - [Mercury](https://mobbin.com/screens/340a46db-da79-4acf-b8bc-f0a0621deed3): Date, Description, Ledger account and Amount headers share their column's edge with the values.
- **Code:** `src/app/(app)/tasks/task-row.tsx:38`, `branch src/app/(app)/tasks/task-row.tsx:93-157`
- **Verification:** confirmed. Title text starts at about 160px under a header at 153px. The same quiet-input offset recurs in the Settings CapEx rules ('Refrigerator' at 124 against the 'APPLIANCE' header at 117) and in the Move-in items, so fix it in the shared quiet-input styling.

### VISUAL-035

**Native selects, spinners and date fields look different in each browser**

Medium · Design change · effort M · `Deals, task page, property editors` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The task due date is fixed by DueDatePicker (due-date-picker.tsx:43-105).
- **Today:** On the task page, dates are now fmtDay-style chips that open the React Aria calendar, and Property and Unit use SelectChip, a chip with a lucide ChevronDown over a hidden native select, so they look the same in every browser. The /tasks/all filter selects ('All assignees', 'All properties') are still native and show the double chevron in WebKit. Deals still uses native status selects and type=number Units inputs, and there is no global spinner reset in globals.css.
- **Why:** Browser chrome inside a designed surface breaks the single visual language Stripe-level apps keep.
- **Change:** Use SelectChip (or one shared Select trigger with a lucide ChevronDown) for the All tab filters (filters.tsx:81-130) and Deals. Add the global number-spinner reset. The date part is done for tasks.
- **Desktop, tablet, phone:** Desktop popover picker; tablet and phone open the picker as a bottom sheet.
- **Reuse:** Select (ui.tsx:156); React Aria DatePicker (approved); fmtDay.
- **References:** 
  - [Linear](https://mobbin.com/screens/344cad59-d4a8-421a-9c2f-14b3c977e82d): Dates as text chips with a calendar icon.
  - [Stripe](https://mobbin.com/screens/43220568-930a-4934-8df8-9f96e810dbb8): Custom select triggers that match inputs.
  - [Linear](https://mobbin.com/screens/1ebdc50b-e8e5-4b80-8857-4814c7e2b95f): Settings rows with label, description and a toggle on the right
- **Code:** `src/app/(app)/deals/deal-row.tsx:91`, `branch src/app/(app)/tasks/[id]/select-chip.tsx:39-68`, `branch src/app/(app)/tasks/filters.tsx:81-130`, `branch src/app/(app)/deals/deal-row.tsx:89-92`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:52-80`, `Probe on :3300: main inputs = checkbox x5, number x2`, `branch src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:52-80`
- **Also found as:** ADMIN-049 (Contractors directory, contractor detail and Settings)
- **Verification:** confirmed. WebKit shows Units spinners and double chevrons, and the task page due date renders as native '04/19/2025'.

### VISUAL-036

**Controls in one row have three different heights**

Medium · Design change · effort S · `Deals and Tasks filter rows` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. /tasks/all at 1280: search 32px, Status segmented control 38px, both selects 32px, '+ New task' 36px. On touch (768 and 375): fields 44px, segmented 50px. /deals at 1280: filter input 32px, segmented 30px, '+ New deal' 36px.
- **Today:** Deals: filter input 32px at 12px text, segmented control about 30px, 'All statuses' 32px, '+ New deal' 36px. Tasks: input and selects 32px beside a 36px button. Header search is 36px at 14px.
- **Why:** Mismatched heights in one row are the first thing that reads as unpolished.
- **Change:** Control height tokens: 32px for every toolbar control and filter on desktop, 36px only for the page primary, 44px for all on touch; one 13px text size across the row.
- **Desktop, tablet, phone:** Desktop 32/36; tablet and phone 44 everywhere.
- **Reuse:** Input and Select small size (listed as needed in docs/components.md Duplicates); Button sm.
- **References:** 
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): Filter chips, Export and Edit columns share one height.
- **Code:** `src/app/(app)/deals/filters.tsx:58`, `branch src/components/segmented-control.tsx:12-17`, `branch src/components/segmented-control.tsx:45`
- **Verification:** confirmed. Measured on Deals: the filter input is 32px at 12px text, segment buttons are 24px inside an about-30px track, 'All statuses' is 32px and '+ New deal' is 36px.

### VISUAL-038

**Segmented control state is not exposed with aria-pressed**

Medium · Fix · effort S · `Deals and Tasks segmented filters` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. The SegmentedControl was extracted to src/components/segmented-control.tsx with role=group, aria-label and aria-pressed per segment, styled from the attribute (lines 41-63). Deals, the Tasks All filter, Today's Mine | Contractors, the composer and the portal all use it. Deals buttons report aria-pressed (Active13:true), and the Tasks aria tree shows 'Open' [pressed]. Removal not upheld: Deals, Tasks All, Today Mine | Contractors, the composer and the portal now use the shared SegmentedControl (role=group, aria-pressed, styled from the attribute). The recommendation also said to replace all three copies, and the third, BasisToggle in financials/settings/controls.tsx:9-29, is still hand-rolled. On :3300 /financials/settings it has no group name. The buttons render as 'cash' [disabled] and 'accrual' with aria-pressed null, and the pick shows only through a bg-primary fill and by disabling the current button. So segmented state is still not exposed with aria-pressed on that screen, and the primary fill breaks the 'selected fill alone' style. docs/components.md:140 on the branch still lists it as a duplicate. Narrowed fix: swap BasisToggle for SegmentedControl (aria-label 'Basis', size sm) and keep the current segment enabled, treating a re-press as a no-op.
- **Today:** The All, TBD, Active and Pass buttons (and Tasks All, Open, Done) mark the pick only with classes; there is no aria-pressed.
- **Why:** House rule requires aria-pressed on pill toggles with styling from the attribute; screen readers cannot tell which filter is on.
- **Change:** Extract the documented SegmentedControl into src/components with aria-pressed and a global [aria-pressed=true] style; replace the three copies.
- **Desktop, tablet, phone:** Same at all sizes; 44px segments on touch.
- **Reuse:** deals/filters.tsx segmented control, extracted as SegmentedControl.
- **Code:** `src/app/(app)/deals/filters.tsx:61-74`, `branch src/components/segmented-control.tsx:41-63`, `branch src/app/(app)/deals/filters.tsx:62-67`
- **Verification:** confirmed. There is no aria-pressed in deals/filters.tsx or tasks filters. The Financials settings BasisToggle is a third copy that fills with the primary color, and docs/components.md already lists it under Duplicates, so the extraction should pick up that one too.

### VISUAL-039

**Three notice styles, one of them a paragraph**

Medium · Design change · effort S · `Financials, Rent roll, property Financials card` · One design system, fixed in the primitives

- **Today:** Financials uses an amber banner; Rent roll uses a gray box holding a three-line paragraph; the property page uses a plain sentence inside a full card.
- **Why:** Copy rules ask for one line; three treatments for one job read as unplanned.
- **Change:** One Notice: 13px single line, leading icon, info or warning tone, optional link at the end. Long explanations move to docs or a tooltip.
- **Desktop, tablet, phone:** Desktop and tablet single line; phone allows two lines at most with the link on its own line.
- **Reuse:** New Notice in ui.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/e0c8673e-3c63-4a81-895c-e6a71cf5c7c6): Banner anatomy: icon, bold one-line title, one-line detail, action button on the right.
  - [Vercel](https://mobbin.com/screens/d8e63884-5d43-4337-bf31-5667bc4ba5db): Single-line warning strip with the fix as an inline button ('Undo Rollback').
  - [Stripe](https://mobbin.com/screens/5aba8f78-028a-4ad6-81f1-6ca698a41451): One-line recommendation banner with a single action.
- **Verification:** confirmed. Seen: the amber banner on Financials, the gray three-line paragraph on Rent roll, and the one-sentence card on the property page.

### VISUAL-040

**Settings tabs sit above the page title and the subtitle repeats the tab**

Medium · Design change · effort S · `Settings` · A quiet shell with real search, navigation and sign-in

- **Today:** Settings renders TopTabs above the 'Settings' heading, then a subtitle naming the active tab ('CapEx planning rules'); Financials puts its tabs under the title.
- **Why:** The two tabbed sections are built upside down from each other, and the subtitle restates what the tab shows.
- **Change:** Title, then tabs, with page actions on the title row; drop the subtitle.
- **Desktop, tablet, phone:** Same order at all sizes; tabs scroll horizontally on phone.
- **Reuse:** settings/layout.tsx, PageHeader, TopTabs.
- **References:** 
  - [Stripe](https://mobbin.com/screens/43220568-930a-4934-8df8-9f96e810dbb8): Settings breadcrumb, page title, then tabs.
  - [Stripe](https://mobbin.com/screens/5a903fc1-b123-430d-8ac1-1ad2c752417a): 'Settings ›' breadcrumb, section H1, tabs below, no restating subtitle
  - [Stripe](https://mobbin.com/screens/fc7b35c9-f823-4f28-bb16-d981a05cb530): Section helper sits on the section, not the page header
- **Code:** `src/app/(app)/settings/layout.tsx`, `src/app/(app)/settings/layout.tsx:6-19`
- **Also found as:** COPY-053 (Lens: words on every screen)
- **Verification:** confirmed. TopTabs sit above the 'Settings' h1 with subtitles 'CapEx planning rules' and 'Rooms and items tenants rate on the move-in inspection'. Land it with the approved D10 Settings merge.

### VISUAL-041

**Full address repeated in every row with uneven punctuation**

Medium · Design change · effort S · `Portfolio, Deals, Home CapEx` · Plain, consistent words

- **Today:** Portfolio and Deals print 'Street, Buffalo, NY 142xx' on every row with stray spaces and commas ('Buffalo , NY'), which wraps most deal rows to two lines; Home mixes 'Avenue' and 'Ave.'.
- **Why:** The repeated city adds no information for a Buffalo-only portfolio and doubles row height.
- **Change:** Street as the 14px primary; city and ZIP as a 12px muted second line only when it is not Buffalo; suffixes normalized through shortAddress.
- **Desktop, tablet, phone:** Desktop and tablet one line; phone street only, city in the meta line.
- **Reuse:** shortAddress in src/lib/normalize.ts.
- **References:** 
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): Street on line one, city and ZIP muted below.
  - [Zillow](https://mobbin.com/screens/77deb8a7-8316-4402-9026-0dcb61475fc1): A strong headline with the address set small underneath.
- **Code:** `src/app/(app)/deals/deal-row.tsx:56-58`, `src/app/(app)/properties/page.tsx:66-68`, `Measured deal row heights: 57, 57, 39, 57, 39, 57`, `src/lib/normalize.ts:16-19`, `src/app/(app)/deals/deal-row.tsx:55-71`
- **Also found as:** DATA-017 (Lens: tables, numbers, money, charts and status), DEALS-024 (Deals pipeline, new deal and deal detail), PORTFOLIO-014 (Portfolio list and new property)
- **Verification:** confirmed. 'Buffalo , NY' and double spaces show in the Deals rows, the search results and the deal title ('Buffalo,  NY').

### VISUAL-043

**Timeline markers are clipped to half-dots**

Medium · Fix · effort S · `Deal activity timeline` · One design system, fixed in the primitives

- **Today:** Markers are 6px dots positioned 21px left inside an overflow-y-auto list, so the scroll box clips them to slivers on the rail.
- **Why:** The rail looks broken, and notes cannot be told from system changes at a glance.
- **Change:** Pad the scroll container and draw the rail and 8px dots inside it, centered on the line; notes get the accent dot, field changes gray.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** src/app/(app)/deals/[id]/page.tsx:106-112.
- **References:** 
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): Timeline icons sit fully on the rail.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:106-112`, `src/app/(app)/deals/[id]/page.tsx:106`
- **Also found as:** MOBILE-038 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. The dots are at -left-[21px] inside an overflow-y-auto ol whose x-overflow is clipped as a side effect, so the markers render as slivers (timeline-crop and deal desktop shot).

### VISUAL-044

**Tables hide columns behind silent horizontal scroll**

Medium · Design change · effort M · `Deals (1280), unit Equipment editor, CapEx on phone` · Lists answer first and stay calm at 675 rows

- **Today:** In Units and access edit mode at 1280, the Equipment rows overflow and the Cost column is cut to a lone '$' at the card edge, with nothing signalling more columns. The Deals and phone CapEx cases are covered by VISUAL-014 and VISUAL-015.
- **Why:** Users never learn the columns exist.
- **Change:** Edge fade on the overflowing side, a pinned first column, and column priorities (hide Latest note below 1440px).
- **Desktop, tablet, phone:** Desktop: priorities plus fade. Tablet: fade and pinned first column. Phone: list rows (VISUAL-015).
- **Reuse:** Table (ui.tsx:170).
- **References:** 
  - [Stripe](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13): Edit columns lets people choose what shows instead of scrolling.
- **Verification:** partly. The Deals 1280 clipping duplicates VISUAL-014, and the phone CapEx cut duplicates VISUAL-015. The new part is the unit Equipment editor: in edit mode at 1280 the Cost column sits off the right edge with only a '$' showing (units-edit--eq shot), with no fade or cue.

### VISUAL-I01

**Give the seven task statuses a shape-coded glyph set and keep red for overdue**

Medium · Design change · effort M · `Tasks list, task page, Home task rows, contractor job cards` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly built: the faint-check hint is fixed, and the statuses use the spec's chips instead of glyphs. The Review-red vs overdue-red collision is unchanged.
- **Today:** The seven statuses now exist as text chips with one fixed tone each, per the approved spec: To do gray, Scheduled blue, In progress purple, Waiting amber, Review red, Done green, Canceled gray and struck through (status-badge.tsx:12-20). Overdue dates are red text on every date chip (due-date-picker.tsx:88), and Today and All are full of red date chips, so a Review chip would sit next to red overdue dates in the same row. The open ring no longer shows a gray check: the check stays transparent until hover (task-checkbox.tsx:44). The branch DB has no task in Review, so I confirmed the collision from code, not from a screenshot.
- **Why:** Seven statuses across 2,086 tasks cannot be carried by color alone: amber, purple and red pills at 12px blur together and fail for color-blind readers, and red for Review collides with red for overdue, so the one urgent signal stops meaning urgent. Linear and Things 3 make progress legible by shape first, color second.
- **Change:** Keep the approved text chips. Glyphs aren't needed now that every list shows the status word. Move only Review off red: Review becomes amber (it is the 'needs you' state) and Waiting becomes gray with its reason text. Red then stays on overdue dates only. This challenges the tone table in asana-migration-plan.md:446, so Connor has to approve it.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: glyph at the start of each row, the word appears only in the rail and menus. Phone 375: same glyph at row start doubles as the tap target for the status sheet (44px hit area around a 16px glyph); the word drops from rows.
- **Reuse:** Extend Badge (src/components/ui.tsx:116) with a leading glyph slot and replace TaskCheckbox (src/app/(app)/tasks/task-checkbox.tsx) with a StatusGlyph button; icons from lucide-react (circle, circle-dashed, circle-pause, circle-check, circle-x) plus two custom partial rings. New pattern based on Linear.
- **Challenges:** Approved migration spec, status chip row (asana-migration-plan.md:446): In progress purple, Waiting amber, Review red. This keeps one tone per status but adds a glyph and moves Review off red so red means overdue only.
- **References:** 
  - [Linear](https://mobbin.com/screens/ef923b0e-9a40-4fdd-80f2-f3aafb4f36ce): Group headers show the glyph family: empty ring Todo, half ring In Progress, filled check Done.
  - [Linear](https://mobbin.com/screens/e494c7a9-8c56-4840-bca4-a0324b332710): Every workflow state has its own glyph and a quiet tone in settings.
  - [Linear Mobile](https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690): The same glyphs carry status on phone rows, including a dashed ring for Backlog.
  - [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58): Open to-dos are empty boxes; red is reserved for today's deadline.
  - [Linear](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1): Status menu with the glyph family (Backlog, Todo, In Progress, Done, Canceled) and issue counts per status.
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Grouped list with the glyph in the left slot of every row.
- **Code:** `src/app/(app)/tasks/task-checkbox.tsx:14-30`, `branch: docs/asana-migration-plan.md:446`, `branch:src/components/status-badge.tsx:12-20`, `branch:src/components/due-date-picker.tsx:88`, `branch:src/app/(app)/tasks/task-checkbox.tsx:40-45`, `src/app/(app)/tasks/task-row.tsx:117`, `prisma/schema.prisma:203-206`, `branch-src/src/app/(app)/tasks/task-row.tsx:61-68`, `branch-src/src/app/(app)/tasks/task-checkbox.tsx:24-49`, `branch-src/src/components/status-badge.tsx:12-20`, `branch-src/src/app/(app)/tasks/[id]/status-control.tsx:22-60`
- **Also found as:** TASKS-I04 (Tasks list, new task and task detail)
- **Verification:** partly. Glyph-first status is a good direction and the references check out: Linear ef923b0e shows the empty, half and check glyphs on group headers, e494c7a9 shows the per-state glyph settings, and Things 3 feadd020 shows empty boxes with red kept for today's deadline. Moving Review off red is the strongest part, because the approved spec (asana-migration-plan.md:446) gives Review red and red already marks every overdue date. Four problems. (1) Replacing TaskCheckbox with a StatusGlyph menu turns one-click complete into two clicks. It also overrides the spec row 'Done checkbox: Extended, 44px hit area', which conflicts_with doesn't name. Keep a one-tap done circle on rows and change other statuses from the rail or a menu. (2) The proposed amber for In progress breaks VISUAL-I07's rule that amber means 'needs attention' only. (3) The spec's chips carry the status word, so 'fails for color-blind readers' is overstated; it would only become true once the word is dropped from rows as proposed. (4) The faint check on open rings mirrors Asana, the tool being replaced.

### VISUAL-I03

**Turn the 16px track bars into hairline meters under full-width labels**

Medium · Design change · effort M · `Home and property 5-year CapEx forecast; Financials 'Operating expense by category' and 'Monthly income vs expense'` · One design system, fixed in the primitives

- **Today:** MoneyBars and the CapEx year bars are 16px rounded blocks on a gray track, and category labels truncate in a 128px column. The CapEx bar for the current year is always red because it is the first year (i===0), not because of its amount, and the year rows are clickable filters. In dark mode the track is darker than the card.
- **Why:** Mercury, Copilot and Vercel draw proportion as a 3 to 4px meter so the label and the amount carry the row and the bar is supporting evidence. Truncated category names hide the very thing the chart is about, and a block of red dominates Home without adding information beyond the number beside it.
- **Change:** Each row: label left in body text, amount right in tabular figures, share percent muted after it, and a 3px meter spanning the row beneath (zinc-200 track, one chart hue for the fill). Due-soon or over-budget rows tint only the meter amber; the text stays neutral. Labels never truncate on desktop and wrap to two lines at most on phone.
- **Desktop, tablet, phone:** Desktop and tablet: one row per category, meter full row width. Phone: same anatomy, amounts stay right-aligned, all five CapEx years remain; nothing drops.
- **Reuse:** Rework MoneyBars (src/app/(app)/financials/_components/ui.tsx) into the one bar idiom, move it to src/components/, and use it in src/app/(app)/portfolio-capex.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c6cc0102-adb2-4a1d-830c-ddc7f75fac62): 'By ledger account': label, amount and muted percent on one line, a hairline bar under each row.
  - [Copilot](https://mobbin.com/screens/f9852ce6-2bba-46cc-a8c5-4f7ca8317074): Spent, a thin bar, then Budget; the bar is a few pixels tall and full names never truncate.
  - [Vercel](https://mobbin.com/screens/fd0e54a5-45cc-4a47-be0d-3fdb7e804ec7): Included credit shown as a 4px meter under the figure.
- **Code:** `src/app/(app)/financials/_components/ui.tsx:61-66`, `src/app/(app)/portfolio-capex.tsx:136-143`
- **Verification:** partly. Reproduced: h-4 bars (ui.tsx:64, portfolio-capex.tsx:136), the w-32 truncated labels 'Repairs & mainten…' and 'Legal & profession…', and in dark mode a bg-background track darker than its card (fin--desktop-dark.png). The meter idiom is backed by Mercury f3cc6753-dc1c-49ec-babb-99599b85f605: the By ledger account rows show amount, percent and a hairline bar (Mercury truncates long labels too). Three corrections to the recommendation. (1) The CapEx year rows are clickable year filters with a selected ring (portfolio-capex.tsx:120-127), so the whole row must stay the hit target, not just the 3px meter. (2) 'Monthly income vs expense' is a paired time series; meters under labels don't fit it, and a small column chart like Mercury's 'Cash in vs out' does. Its month labels also read raw '2026-05' (financials/page.tsx:141), see VISUAL-V09. (3) The red bar marks the current year (i===0, portfolio-capex.tsx:139), not over-budget.

### VISUAL-I07

**Keep status tones for state; show stages as a dot and tags as neutral chips**

Medium · Design change · effort M · `Portfolio, property header, Vendors list and contractor page, deal status, listings` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. 'tenant fixes' is still a green Badge on the Contractors list and in the contractor header (contractors/page.tsx:48, contractors/[id]/page.tsx:58). Deal statuses still use red and amber for '1 - High' and '2 - Medium' (config.ts:106-125); 256 Auburn's deal page shows an amber '2 - Medium' select. The tone table is still in two places: ui.tsx:114-122 badgeTones and config.ts:93-101 TONE_CLASSES. One new thing on the branch: task statuses map onto the ui.tsx Badge through STATUS_TONE (status-badge.tsx:12), the single-table pattern the finding asks for.
- **Today:** Badge tones mark non-states: Rehabbing is a warning-amber pill, the 'tenant fixes' capability tag is a green pill, and deal statuses '1 - High' and '2 - Medium' are red and amber selects. 'Refinanced' renders as plain text, and no Stabilized or Hold property exists, so green is not currently shown in Portfolio. The tone table is duplicated in ui.tsx:107 and config.ts:95.
- **Why:** When amber means both 'rehab under way' and 'this figure may be wrong', neither works as a signal, and the CLAUDE.md rule that status colors are reused by no other mark is broken on every list. Stripe and Mercury reserve tones for state; Attio gives pipeline stages a small dot on neutral, and Linear draws labels as a dot plus gray text.
- **Change:** Three families. State (green done, amber needs attention, red overdue or failed) only on things that can go wrong or finish. Stages (property lifecycle, deal pipeline) as a neutral chip with a 6px dot from a separate, quieter stage scale that keeps its color from list to record. Tags (tenant fixes, trades, entity) as a zinc outline chip with no fill. One tone table in src/components/ui.tsx; config.ts maps values onto it. Builds on VISUAL-011's StatusPill.
- **Desktop, tablet, phone:** Identical at 1280 and 768. On 375 list rows a stage chip may collapse to its dot with the word shown on the record.
- **Reuse:** Badge (src/components/ui.tsx:107-130) gains 'dot' and 'tag' variants; delete TONE_CLASSES in src/lib/config.ts in favour of the Badge tones.
- **References:** 
  - [Attio](https://mobbin.com/screens/fdc76916-ff87-4e2a-8256-80939ffa935c): Each pipeline stage is a small colored dot beside neutral text; the card itself stays neutral.
  - [Linear](https://mobbin.com/screens/ed670cda-0527-4716-a1a6-0159f12c4f42): Labels drawn as a colored dot plus gray text in a neutral pill, distinct from status glyphs.
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Tones appear only on payment state (Succeeded, Failed, Incomplete).
- **Code:** `src/lib/config.ts:95-150`, `src/app/(app)/contractors/page.tsx:48`, `src/components/ui.tsx:107`, `branch:src/app/(app)/contractors/page.tsx:48`, `branch:src/app/(app)/contractors/[id]/page.tsx:58`, `branch:src/lib/config.ts:93-125`, `branch:src/components/ui.tsx:114-122`
- **Verification:** partly. Rehabbing amber (config.ts:138), the 'tenant fixes' green tag (contractors/page.tsx:48), the red, amber, purple and blue deal-status tones (config.ts:108-125) and the duplicated tone table (ui.tsx:107 and config.ts:95) all check out. The green claim is overstated: 'Refinanced', 7 of the 11 properties, is special-cased to plain text in Portfolio (properties/page.tsx:72) and in the property header ([id]/page.tsx:86), and no property is Stabilized or Hold, so no green status shows in Portfolio today. That plain-default, pill-only-for-exceptions pattern is the Stripe-like rule worth generalizing. Verified references: Attio fdc76916 (stage dots on column headers) and Stripe f576b06e (tones only on Succeeded, Failed, Incomplete). Conflicts internally with VISUAL-I01, which puts In progress on amber.

### VISUAL-I10

**Give timeline events a type icon, a one-line sentence and a muted date**

Medium · Design change · effort M · `Deal page Activity timeline (and the planned task and property timelines)` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The deal timeline now uses the shared ActivityTimeline component but shows the same content: an 11px date over raw change strings, no-op edits included ('Next action: aggressive offer → aggressive offer · Connor Swofford'), inside a 520px scroll box (deals/[id]/page.tsx:107-128). The new task timeline already follows most of the recommendation. System events are one muted sentence with a relative time ('Device check set status to In progress · 2h'). Comments are cards with avatar, name and time. Each day gets a heading, and anything past the latest 15 folds into 'Show N earlier updates' (tasks/[id]/activity.tsx:41-124). Neither timeline has type icons.
- **Why:** Stripe's timeline reads as a story: an icon per event type, a short sentence, the date beneath. Here a reader parses arrows and doubled addresses to find the two notes that matter.
- **Change:** Move the deal timeline onto the task page's TaskActivity layout: one-sentence change lines, note cards with the author, day headings, 'Show N earlier', and scrolling with the page. Hide whitespace-only and no-op edits. Type icons are optional; the task timeline reads clearly without them.
- **Desktop, tablet, phone:** Same anatomy at 1280, 768 and 375; on phone the icon rail narrows to 24px and dates within a week read relative.
- **Reuse:** New Timeline in src/components/ shared by deal, task (approved side-rail task page) and property; avatar from VISUAL-013.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): Icon per event, a plain sentence ('Payment succeeded'), the date beneath in muted text.
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Note composer above the same timeline; notes and system events share one rail.
  - [Linear Mobile](https://mobbin.com/screens/f03367b0-cbbe-497c-bfc5-4479a5ed4fd1): System activity collapsed into 'Show 7 activity items' with comments shown in full.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:106-127`, `branch:src/app/(app)/deals/[id]/page.tsx:107-128`, `branch:src/app/(app)/tasks/[id]/activity.tsx:41-124`
- **Verification:** confirmed. Reproduced on deal cmtg25yd8002cjphs49ovlvob: entries such as 'Status: 2 - Medium → 1 - High · Pieter Louw' and doubled address edits that differ only in spacing. Deal cmtg25ydh002zjphsuyjd90go logs 'Next action: aggressive offer → aggressive offer'. That entry is a whitespace-only diff: diffDeal compares untrimmed strings with strict equality (lib/deals/service.ts:107). Fix it at write time in diffDeal (compare normalized values), not only by hiding it at render. Fits the approved spec row 'Timeline: Extended, moves to components/activity-timeline.tsx'. Stripe ed14dee7 verified: icon per event, sentence, date beneath, composer above.

### VISUAL-I11

**Define HG's spot art: zinc line drawings of Buffalo houses with one gold accent fill**

Medium · New capability · effort M · `Payoff moments: task marked done, Home with no open tasks, Review approved, contractor job sent (portal)` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** There is still no spot art, and docs/components.md:159 still says 'Spot art for payoff moments. None yet'. The portal now has a payoff after Mark done: a Send icon in a tinted circle with a pop-in, 'Thanks, {first name}!', 'Sent to Connor and Pieter. You'll get an email if anything else is needed.' and a 'Back to my jobs' button (p/jobs/[id]/_components/job-actions.tsx:251-275). Staff payoffs are still thin. Today's empty Mine column is plain text, 'Nothing due today.' (today-view.tsx:58, 140-141), and marking a task done only fills the ring green (task-checkbox.tsx:42-43). I couldn't reach the payoff sheet in the read-only build (Mark done first asks 'Add photos of the finished work?'), so it is confirmed from code.
- **Why:** CLAUDE.md asks payoff moments to show line spot art and the next step, but without one defined style each screen will be drawn differently or skipped. Gusto shows how one stroke weight plus a single accent fill makes small art read as brand rather than clip art.
- **Change:** Keep the portal's Payoff layout and replace its Send icon with the first drawing (a clipboard with a check). Add the house drawing to Today's empty Mine column, with 'See tomorrow' as the next step. The five drawings can ship one at a time, starting with these two.
- **Desktop, tablet, phone:** 96px at 1280 and 768, 72px at 375; art never appears in rows or toasts.
- **Reuse:** New SpotArt in src/components/ (inline SVG, aria-hidden) slotted into EmptyState and sent screens; respects reduced motion if any piece animates.
- **Challenges:** CLAUDE.md Personality, Two surfaces, two palettes: gold would appear in the app's payoff art. If gold stays public-only, the accent fill falls back to blue.
- **References:** 
  - [Gusto](https://mobbin.com/screens/f74caf21-298d-44dc-af95-bd86acc044db): Line spot icons in one stroke weight with a single accent fill.
  - [Gusto](https://mobbin.com/screens/f80f8026-7437-46f3-8970-5f4b2aabe0dc): 'All caught up' pairs line art with one sentence about what happens next.
- **Code:** `src/components/ui.tsx:226-231`, `src/app/(app)/tasks/task-checkbox.tsx:14-18`, `docs/components.md (Known gaps, 'Spot art for payoff moments')`, `branch:src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:251-275`, `branch:src/app/(app)/tasks/today-view.tsx:58`, `branch:docs/components.md:159`
- **Verification:** partly. The gap is real: EmptyState is a dashed text box (ui.tsx:226-231) and docs/components.md:145 lists 'Spot art for payoff moments. None yet'. Two problems with the spec. (1) The gold fill conflicts not only with the two-palette rule named in conflicts_with but with CLAUDE.md Imagery, 'simple single-color line spot art', which conflicts_with omits. (2) 'Task marked done' isn't a spot-art moment: art on each of roughly 2,000 task completions would be theater. CLAUDE.md asks for a short spring there. Art belongs on the empty Today view, a sent move-in report and the contractor Mark done screen. Gusto references not spot-checked.

### VISUAL-I13

**Turn the public palette into tokens and fold in the stray grays**

Medium · Design change · effort S · `Public site (/welcome, /rentals, /residents, /residents/moving-in) and /login` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. Public colors are still hard-coded hex values, and there is one more than before. 13 values appear across (marketing), components/public and app/login: #c8a765 43 times, #e8eaee 29, #767d8a 18, #08090b 8, #4c525c 6, #e0796a 4, plus #f2f4f7, #e5a99b, #5b6576, #0d0f13, #080b12 and #454b55. The new sign-in frame used by /login/forgot and /login/reset adds #dcc28f for its notice text (login/_components/auth-frame.tsx:70). globals.css on the branch adds animation keyframes but no public tokens.
- **Today:** Public pages hand-code 12 hex values: the four house colors (#c8a765 used 41 times, #e8eaee 29, #767d8a 16, #08090b 8) plus #4c525c, #5b6576, #454b55, #0d0f13, #080b12, #f2f4f7 and two error reds #e0796a and #e5a99b (grep over src/app/(marketing), src/components/public and src/app/login; public/header.tsx:19-36). globals.css defines no public tokens.
- **Why:** CLAUDE.md defines the public palette as four colors; the extra grays drift a few points each and will multiply as the site grows. Vercel's Geist gives each gray step one role so nobody picks a hex by eye.
- **Change:** Add --public-bg #08090b, --public-surface #0d0f13, --public-text #e8eaee, --public-muted #767d8a, --public-faint #4c525c, --public-gold #c8a765 and --public-danger #e0796a under a .public scope in globals.css, then map each stray gray to its nearest token. The gold token is the one the HG mark (VISUAL-I05) uses.
- **Desktop, tablet, phone:** No layout change at any size.
- **Reuse:** src/app/globals.css @theme; PublicHeader and PublicFooter in src/components/public.
- **References:** 
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): A dark surface built from a few grays, each with one role (surface, border, secondary text, primary text).
- **Code:** `src/components/public/header.tsx:19-36`, `src/app/globals.css:5-28`, `branch:src/app/login/_components/auth-frame.tsx:70`, `branch:src/components/public/header.tsx`, `branch:src/app/globals.css:41-92`, `grep of #hex under branch src/app/(marketing), src/components/public, src/app/login: 13 distinct values`, `docs/components.md:146`, `src/app/login/page.tsx:44-56`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:14-16`, `src/app/(marketing)/welcome/page.tsx:43-49`
- **Also found as:** PUBLIC-049 (Login and the public site)
- **Verification:** confirmed. Counts reproduced exactly: #c8a765 41, #e8eaee 29, #767d8a 16, #08090b 8, #4c525c 7, #e0796a 4, plus #f2f4f7, #e5a99b, #5b6576, #0d0f13, #080b12 and #454b55. globals.css has no public tokens.

### VISUAL-I14

**Record titles are text inputs, so property, deal and task pages have no h1**

Medium · Fix · effort S · `Property, deal and task pages` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. A browser check (querying the live page) finds no h1 in main on the task, property or deal page. The task title is now an auto-growing textarea labeled 'Task title' (tasks/[id]/header.tsx:15-29, inline-address-field.tsx:86-87), so long titles wrap instead of clipping. The accessibility tree still opens main with button 'Tasks', button 'Status: Done. Change status' and textbox 'Task title'. Property and deal titles are still single-line inputs labeled 'Address' (deals/[id]/deal-detail.tsx:32, properties/[id]/edit-details.tsx:35). The contractor page has a real h1 (contractors/[id]/page.tsx:56).
- **Today:** The title on property and deal pages is an input labeled 'Address' (inline-address-field.tsx:37) and on the task page an input labeled 'Task title' (task-detail.tsx:84). The accessibility tree for the property page opens main with a 'Portfolio' button and textbox 'Address', then level-3 section headings; a query for main h1 returns nothing on property, deal and task pages (p767--desktop-light.aria.txt; specs/titles.json run). The always-on input is also why the heading clips (VISUAL-002).
- **Why:** Screen readers and heading navigation lose the record's name, and a permanent field reads as a form rather than a title. Linear and Stripe render the title as a heading that becomes editable when clicked.
- **Change:** Render the title as an h1 (24/32 semibold) that swaps to the input on click or tap, commits on Enter or blur and reverts on Esc, keeping InlineAddressField's logic. Desktop shows a hover underline as the edit cue; touch uses tap-to-edit with no permanent pencil.
- **Desktop, tablet, phone:** Same at 1280, 768 and 375; on phone the h1 wraps to two lines instead of clipping.
- **Reuse:** Generalize InlineAddressField (src/components/inline-address-field.tsx) into an InlineTitle, as docs/components.md already recommends for inline text edits.
- **References:** 
  - [Linear](https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): Issue title is the page heading, edited in place.
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Record header title as a heading with the status beside it.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): The record name is plain heading text, with editing in Details
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): Record-type label ('PAYMENT') above a heading title, with actions on the right.
  - [Linear](https://mobbin.com/screens/62c94bcd-0559-4356-9d0e-bce71c021d88): The title is a real heading in the main column that becomes editable on click, with properties in a right rail. It never shows as a boxed input.
  - [WhatsApp](https://mobbin.com/screens/56113f98-413d-4ea4-b3e8-1aedb33075bc): Name shown as text with a pencil; editing is a deliberate step.
- **Code:** `src/components/inline-address-field.tsx:37`, `src/app/(app)/tasks/[id]/task-detail.tsx:84`, `specs/titles.json`, `branch:src/app/(app)/tasks/[id]/header.tsx:15-29`, `branch:src/components/inline-address-field.tsx:61-90`, `eval on :3300: main h1 count 0 on /tasks/[id], /properties/[id], /deals/[id]`, `src/components/inline-address-field.tsx:37-51`, `src/components/ui.tsx:45`, `branch: src/components/inline-address-field.tsx:15-105`, `branch: src/app/(app)/tasks/[id]/header.tsx:15-30`, `aria snapshots: h1 count 0 on prop767, prop118, prop647, prop58, deal1-3, task1-2`, `src/components/inline-address-field.tsx:35-62`, `src/app/(app)/tasks/[id]/task-detail.tsx:68-104`, `src/components/inline-address-field.tsx:15-105`, `src/app/(app)/tasks/[id]/header.tsx:15-29`, `src/app/(app)/properties/[id]/edit-details.tsx:32-40`, `src/components/inline-address-field.tsx:61-105`, `src/app/(app)/properties/[id]/edit-details.tsx:32-35`, `src/app/(app)/deals/[id]/deal-detail.tsx:32`, `eval /tasks/cmtg25yuf01zsjphs0xu5d2fl: h1 count 0; headings [H2 Checklist, H2 Activity]`, `eval /properties/cmtg25y4k0002jphsxww4tv6k: h1 count 0`, `src/app/(app)/tasks/[id]/task-detail.tsx:84-101`, `branch src/app/(app)/tasks/[id]/header.tsx:15-30`, `branch src/components/inline-address-field.tsx:84-89`, `branch src/app/(app)/tasks/[id]/view.tsx:87-89`
- **Also found as:** PROPERTY-036 (Property detail page (future property hub)), IA-V04 (Lens: information architecture and global SaaS patterns), FEEL-021 (Lens: interaction quality, feedback, states, speed and accessibility), COPY-V03 (Lens: words on every screen), TASKS-043 (Tasks list, new task and task detail)
- **Verification:** confirmed. Verified: querying main h1 returns nothing on property, deal and task pages. The trees open with button 'Portfolio' or 'Deals', then textbox 'Address' or 'Task title', then level-3 headings. The property title input clips ('767 Prospect Avenue, Buffalo,' in p767--desktop-light.png). Matches the approved spec row 'Inline title edit: InlineAddressField generalized'. Linear f00cc4fb verified.

### VISUAL-IV04

**Use one record-page width: deals and tasks float in a 672px center column**

Medium · Design change · effort M · `Deal page, task page vs property page, contractor page` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The task page now uses the full shell width, with the back link at x=96 and a sticky 288px right rail for Assignee, Due, Property, Unit, Repeats, Lockbox and Created (tasks/[id]/view.tsx:58-113). The deal page still sits in mx-auto max-w-2xl, so at 1280 its title starts at x=328, and the deal fields are a card above the timeline (deals/[id]/page.tsx:46). Property and task pages now line up; the deal page is the one left over.
- **Why:** Records are one family, and a jumping title and back link make the app feel assembled from different templates. Stripe and Linear use one record anatomy: title and status top-left on the list's content edge, main column, details rail on the right.
- **Change:** Use TaskPageView's grid on the deal page. Drop max-w-2xl, move Status, the two prices, Units, Next action and Listing URL into the same sticky rail of label-and-chip rows, and keep the timeline in the main column.
- **Desktop, tablet, phone:** Desktop 1280: main plus a 320px rail. Tablet 768: one column, with rail fields as a compact block under the title. Phone 375: one column; secondary fields collapse behind a 'Details' disclosure.
- **Reuse:** The property page grid (lg:grid-cols-3, properties/[id]/page.tsx:93) promoted to a shared layout in src/components/; BackLink and Card.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Record title and status top-left, timeline in the main column, Details rail on the right.
  - [Linear](https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): Issue page with the title as heading and a Properties rail on the right.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:45`, `src/app/(app)/tasks/[id]/page.tsx:49`, `branch:src/app/(app)/tasks/[id]/view.tsx:58-113`, `branch:src/app/(app)/deals/[id]/page.tsx:46`
- **Verification:** verifier-found

### VISUAL-V08

**Stop painting this year's CapEx figures in overdue red**

Medium · Design change · effort S · `Home and property 5-year CapEx forecast` · One design system, fixed in the primitives

- **Today:** On Home, '$32,000 due soon', each 2026 property amount ($13,000, $12,000, $5,500, $1,500) and the 2026 bar are red-600. That's the same red as the overdue '56d ago' task dates below them, about 17 red marks above the fold. The red follows column position (i===0 in portfolio-capex.tsx:219-221), not lateness. The property page repeats it with 'Due soon' in red on five item rows (p767--desktop-light.png).
- **Why:** A forecast of planned spend isn't a failure state. When budgeted replacements wear the same red as missed work, red stops meaning act now. Stripe keeps red for Failed only.
- **Change:** Keep CapEx figures in foreground text. Mark the current year once with an amber 'Due this year' chip by the total, and use red only for items already past their replacement year. With VISUAL-I03 the bar takes the same single amber marker.
- **Desktop, tablet, phone:** Same at 1280 and 768. On phone 375 the summary line keeps the one chip and the per-property figures stay neutral.
- **Reuse:** src/app/(app)/portfolio-capex.tsx; the Badge amber tone; builds on VISUAL-I07's state families.
- **References:** 
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Red appears only on Failed payments; everything else is neutral or a quiet tone.
  - [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58): Red reserved for today's deadline; future deadlines read gray ('4d left').
  - [Jobber](https://mobbin.com/screens/fb9e93ab-0399-4794-9b61-6db077c2acc6): Schedule puts Overdue in its own group above Today; only the overdue dates are red.
  - [Copilot](https://mobbin.com/screens/d9ca88ae-5d46-4213-a5aa-5afeb48d4d06): Bars stay neutral and turn red only when a category is over; red never marks a whole period.
  - [Midday](https://mobbin.com/screens/ab800b0e-8693-4df7-8a3f-f6ef12a33219): Overdue separated from Open as its own figure
  - [Mercury](https://mobbin.com/screens/dbbf7fd1-24e8-4494-9c0c-27007652c7e5): Single-color balance chart; color used sparingly
- **Code:** `src/app/(app)/portfolio-capex.tsx:99`, `src/app/(app)/portfolio-capex.tsx:219-221`, `src/app/(app)/portfolio-capex.tsx:136-147`, `src/app/(app)/properties/[id]/capex-outlook.tsx:87-96`, `src/app/(app)/portfolio-capex.tsx:118-146`
- **Also found as:** DATA-034 (Lens: tables, numbers, money, charts and status), SHELL-047 (App shell, sidebar, top bar, global search and Home)
- **Verification:** verifier-found

### VISUAL-049

**EmptyState is a dashed box of centered gray text**

Low · Design change · effort S · `Empty states (Home tasks, Notes, Documents)` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. The EmptyState primitive is unchanged: a dashed box of centered gray text. /tasks/all with no matches uses it. The property Documents dropzone shows its dashed outline all the time, not only while dragging. Today's columns use their own one-line muted text ('Nothing due today.'), which fits in-section empties.
- **Today:** EmptyState is a dashed box of centered muted text, used both for full lists and for tiny in-section empties ('No notes yet.'). The in-section use matches Stripe's own dashed empties; only full-page empty lists lack a heading and an action.
- **Why:** Dashed frames read as placeholders; Stripe uses a small icon tile, a heading, one line and an action.
- **Change:** EmptyState: 32px icon tile, 14px semibold heading, one muted line, optional button. The dropzone shows a dashed outline only while dragging.
- **Desktop, tablet, phone:** Same on all sizes; phone centers within the section.
- **Reuse:** EmptyState (ui.tsx:226-232); Attachments.
- **References:** 
  - [Vercel](https://mobbin.com/screens/e3e8c78e-8ef5-4562-b44d-457664d5516c): Empty module: a small line icon and one sentence inside the existing card, no dashed frame.
  - [Gusto](https://mobbin.com/screens/f80f8026-7437-46f3-8970-5f4b2aabe0dc): 'All caught up' with single-color line art and a one-line promise of what happens next.
  - [Stripe](https://mobbin.com/screens/ba72cc6a-153e-43d4-81db-dcd9703bdd17): Icon tile, heading, one line, link.
  - [Stripe](https://mobbin.com/screens/0bc4fa17-a5de-4af7-a8f6-3fd5f45a1a7e): Same pattern with a primary action.
  - [Attio](https://mobbin.com/screens/7dea1a05-efa7-4eac-ab37-b0e06e9431d0): An empty section is one muted line ('This record has not been added to any lists') with an 'Add to list' action in the header.
  - [Airbnb](https://mobbin.com/screens/72305d61-a101-4d39-9721-c19ca9375fc0): An empty section card reads 'Accessibility features · Add details', which is the title plus a verb.
  - [Aboard](https://mobbin.com/screens/10a8be03-81e7-41bc-a8dd-636c98394bea): Slim 'No documents' row inside each category, not a large box
- **Code:** `src/components/ui.tsx:226-232`, `branch src/components/ui.tsx:249-255`, `branch src/app/(app)/tasks/all/page.tsx:44-47`, `branch src/app/(app)/tasks/today-view.tsx:140-142`, `src/app/(app)/properties/[id]/edit-listings.tsx:213`, `src/app/(app)/properties/[id]/edit-units.tsx:191`
- **Also found as:** PROPERTY-054 (Property detail page (future property hub))
- **Verification:** partly. The premise that Stripe avoids dashed frames is wrong: Stripe's customer page frames empty sections ('No quotes', 'No credit grants') in dashed boxes (Mobbin fb0b91ce). Mercury's empties are a heading, one line and one button with no icon tile or frame (Mobbin c6e6d13c, 3e0b973c). Adding a 32px icon tile and heading to small in-section empties like 'No notes yet.' adds chrome against the simplicity bar. Keep that treatment for full-page empties only.

### VISUAL-050

**Buttons use a typed '+' instead of an icon**

Low · Design change · effort S · `Page and section actions` · One design system, fixed in the primitives

- **Today:** '+ New deal', '+ New task', '+ New property', '+ Task', '+ Add unit' and '+ Add appliance' type the plus into the label.
- **Why:** A typed plus sits on the text baseline and varies by font; an icon slot keeps spacing exact.
- **Change:** Give Button and LinkButton a leading icon slot and use lucide Plus at 16px.
- **Desktop, tablet, phone:** Same on all sizes; on phone a section's add action can be the icon alone with an aria-label.
- **Reuse:** Button and LinkButton in ui.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/80054ec0-bb9d-4438-9a66-4f7bcd8f103f): 'Create payment' with a plus icon.
  - [Airbnb](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c): Your listings header: the title on the left and a round icon-only plus on the right, no text button.
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): iOS keeps the same icon-only plus in the top-right toolbar beside search and the view switch.
  - [Mercury](https://mobbin.com/screens/d538550f-6446-4e95-871c-3ee284daf776): Round + button on phone opens the create options.
- **Code:** `src/app/(app)/properties/page.tsx:39-41`
- **Also found as:** PORTFOLIO-034 (Portfolio list and new property)
- **Verification:** confirmed. Typed '+' on New deal, New task, New property, Add appliance, Add system and Add unit.

### VISUAL-051

**Two tooltip styles, one with a fixed 336px width**

Low · Design change · effort S · `Tooltips and hover cards` · One design system, fixed in the primitives

- **Today:** Tooltip is a dark inverted bubble; the CapEx breakdown is a white panel fixed at w-[336px].
- **Why:** House rule: popovers size to content; two looks for hover help.
- **Change:** Tooltip (dark, 12px, one line) for labels; a HoverCard (surface, popover elevation, sized to content up to 320px) for breakdowns.
- **Desktop, tablet, phone:** Desktop hover; touch opens the same content on tap.
- **Reuse:** tooltip.tsx; portfolio-capex.tsx:295.
- **References:** 
  - [Linear](https://mobbin.com/screens/c2cbaff3-1a8d-4fd4-af9a-c5c31533082c): Popover sized to its content.
- **Code:** `src/app/(app)/portfolio-capex.tsx:295`, `src/components/tooltip.tsx:45`
- **Verification:** confirmed. tooltip.tsx is a dark inverted bubble. portfolio-capex.tsx:295 is a fixed w-[336px] surface panel that is pointer-events-none, so it is hover-only.

### VISUAL-052

**Radius and elevation are not tokens**

Low · Design change · effort S · `All components` · One design system, fixed in the primitives

- **Today:** Radii in use: rounded-xl cards, rounded-lg buttons and inputs, rounded-md badges, rounded (4px) fields and full. Shadows: shadow-sm cards, shadow-lg dialogs, popovers and tooltips, shadow-2xl drawer and hovered sidebar.
- **Why:** Without tokens each new component picks its own values and the system drifts.
- **Change:** Three radii (6, 8, 12) and three elevations (border only, popover, dialog) defined in @theme; the drawer uses the dialog level.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** src/app/globals.css @theme.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c8f28e2f-7a63-4975-8002-0b747f8a1e80): Only the side panel and the 'Tag created' toast float with shadow; every on-page module stays flat.
  - [Vercel](https://mobbin.com/screens/b313e291-3869-43a6-9125-d98cf9f3ccb8): Uniform card radius and hairline borders.
- **Code:** `src/components/ui.tsx:9`, `src/components/ui.tsx:77`, `src/components/ui.tsx:124`, `src/components/app-shell.tsx:110-112`
- **Verification:** confirmed. rounded-xl, rounded-lg, rounded-md and rounded are all in use, with shadow-sm, shadow-lg and shadow-2xl and no tokens in @theme.

### VISUAL-053

**Neutrals mix Tailwind gray, zinc, slate and indigo**

Low · Design change · effort S · `Tokens` · One design system, fixed in the primitives

- **Today:** Text and borders are zinc, but --muted is gray-500 #6b7280 (blue-gray), the page is a custom #f7f7f8, --accent is indigo-50 #eef2ff in light and slate-800 #1e293b in dark.
- **Why:** House rule says zinc neutrals with a blue primary; mixed tints make grays look slightly off next to each other.
- **Change:** Zinc ramp only (see token proposal); accent-subtle blue-50 #eff6ff in light and blue-950 at 40% in dark.
- **Desktop, tablet, phone:** Token change only.
- **Reuse:** src/app/globals.css:6-26.
- **References:** 
  - [Vercel](https://mobbin.com/screens/b313e291-3869-43a6-9125-d98cf9f3ccb8): One neutral ramp throughout.
- **Code:** `src/app/globals.css:6-26`
- **Verification:** confirmed. globals.css: --muted #6b7280 (gray-500), --accent #eef2ff (indigo-50) and dark --accent #1e293b (slate-800), against zinc everywhere else.

### VISUAL-054

**Status strings in caps or with punctuation ('ACTIVE', '(PARTIAL)', 'CLOSED!')**

Low · Fix · effort S · `Financials settings, deal statuses` · Plain, consistent words

- **Today:** The QuickBooks connection shows an 'ACTIVE' badge and '(PARTIAL)'; the deal status list includes 'CLOSED!'.
- **Why:** Shouting labels break the calm tone the copy rules ask for.
- **Change:** Display map to 'Active', 'Partial' and 'Closed', keeping stored values unchanged.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** Display labels in src/lib/config.ts.
- **References:** 
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Statuses read 'Succeeded', 'Failed', 'Incomplete': sentence case, no punctuation.
  - [Linear](https://mobbin.com/screens/e494c7a9-8c56-4840-bca4-a0324b332710): Workflow status names (Backlog, Planned, In Progress, Completed, Canceled) in plain words.
- **Code:** `src/lib/config.ts:11`
- **Also found as:** DEALS-053 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. 'ACTIVE' and '(PARTIAL)' are visible in Financials settings, and 'CLOSED!' is a deal status in config.ts. Financials settings also shows 'History from 2026-01' as an ISO string, which fits the same display map.

### VISUAL-056

**Motion ignores reduced-motion preferences**

Low · Fix · effort S · `App shell` · One design system, fixed in the primitives

- **Today:** Sidebar width, padding and drawer slide transitions run for everyone; motion-reduce or prefers-reduced-motion appears nowhere in src.
- **Why:** House rule: always respect reduced motion.
- **Change:** A global prefers-reduced-motion block that removes transitions and animations, or motion-safe variants on shell transitions.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** globals.css; app-shell.tsx transitions.
- **Code:** `src/components/app-shell.tsx:109`, `src/components/app-shell.tsx:189`, `src/components/app-shell.tsx:109,189`, `grep prefers-reduced-motion|motion-reduce|motion-safe in src: 0 matches`, `src/components/app-shell.tsx:109,188`
- **Also found as:** SHELL-044 (App shell, sidebar, top bar, global search and Home), FEEL-048 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. No prefers-reduced-motion or motion-safe/motion-reduce anywhere in src, and the shell has transitions on width, padding and transform.

### VISUAL-058

**Mixed text sizes sit on different baselines in one row**

Low · Fix · effort S · `Portfolio table` · One design system, fixed in the primitives

- **Today:** Td defaults to align-top, so the 12px Entity text sits visibly higher than the 14px address beside it.
- **Why:** Things that should line up, line up exactly.
- **Change:** Td aligns to the middle (or baseline) by default; top alignment only for multi-line cells.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** Td (ui.tsx:193).
- **References:** 
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Large amount, muted currency code and status badge share one baseline in the record header.
  - [Vercel](https://mobbin.com/screens/ff81f1e9-25b1-46f9-8448-31fa40a77e4b): Created, Status, Duration, Environment strip: labels and values on shared baselines across mixed sizes.
  - [Attio](https://mobbin.com/screens/c6a29ce7-72af-4679-bd07-0085f5aa05b3): Every cell centered on one row line
  - [Stripe](https://mobbin.com/screens/fb3840bf-2afd-49bb-a4ac-9f44a1d38654): Every cell in a row shares one baseline and size.
  - [Mercury](https://mobbin.com/screens/0546a342-6b5a-47c3-8d95-4871d6eb59d5): One text size across the cells of a row
- **Code:** `src/components/ui.tsx:193`, `src/app/(app)/properties/page.tsx:70`, `src/components/ui.tsx:192-194`, `src/app/(app)/contractors/page.tsx:44-59`, `Probe on :3300 /contractors desktop: name 14px 193-211, others 12px 192-208`, `branch src/app/(app)/contractors/page.tsx:44-59`
- **Also found as:** DATA-029 (Lens: tables, numbers, money, charts and status), PORTFOLIO-035 (Portfolio list and new property), ADMIN-046 (Contractors directory, contractor detail and Settings)
- **Verification:** confirmed. The Portfolio Entity text sits about 3px above the address baseline in every row, from Td's align-top.

### VISUAL-I02

**Mark the selected nav item and tab with a neutral fill so blue only means act**

Low · Design change · effort S · `App shell sidebar and TopTabs (Financials, Settings)` · One design system, fixed in the primitives

- **Today:** The active nav item is an indigo-50 pill with blue icon and label, and the active TopTab has a blue underline and blue text. That matches Stripe's practice of marking location in the brand color. The one off-system piece is the dark-mode selected fill, slate #1e293b, a blue-tinted gray beside zinc surfaces.
- **Why:** Blue already means primary action, link and focus. Spending it on location doubles its job and makes the chrome compete with the work. Linear, Vercel and Mercury all mark selection with a quiet gray fill and full-strength text.
- **Change:** Selected nav item: zinc-100 fill (zinc-800 in dark), foreground icon and label; unselected items in secondary text color. TopTabs: active tab in foreground text with a 2px foreground underline; inactive tabs muted. Blue stays on primary buttons, links and focus rings only.
- **Desktop, tablet, phone:** Same rule at 1280, 768 and 375. The phone drawer's selected row takes the same fill; the planned labeled bottom bar (D10) marks the current tab with foreground icon and label against muted ones, no blue.
- **Reuse:** SideNav and TopTabs in src/components/nav.tsx; retire the --accent token in src/app/globals.css.
- **References:** 
  - [Linear](https://mobbin.com/screens/fd1b4d88-f021-49a3-98af-4cd3a87e1d29): Selected 'Issues' is a light gray fill with dark text; no brand color in the sidebar.
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): Selected 'Deployments' is a neutral fill in dark mode.
  - [Mercury](https://mobbin.com/screens/d575358b-679b-4d52-aa98-5026970291b3): Selected 'Home' is a gray fill; blue appears only on the primary 'Send' pill.
  - [Mercury](https://mobbin.com/screens/607720b2-bd1f-4d7f-90e0-aa31e341fd92): Home marked with a light gray fill only.
  - [Linear](https://mobbin.com/screens/0729ffee-bd71-4cde-8baf-0706ae712d26): Current item (Issues) in a neutral fill.
  - [Vercel](https://mobbin.com/screens/c54df5c8-f72c-406e-bb92-a9a6b116f0a5): Projects marked with a gray fill; color reserved for alerts.
- **Code:** `src/components/nav.tsx:101-103`, `src/components/nav.tsx:137-140`, `src/app/globals.css:27`, `src/components/nav.tsx:103`
- **Also found as:** SHELL-I16 (App shell, sidebar, top bar, global search and Home)
- **Verification:** partly. The code reads as described: nav.tsx:101-103 uses bg-accent text-primary and TopTabs at nav.tsx:137-140 use border-primary text-primary. But Stripe, the named benchmark, does exactly what this finding calls a shortfall: its active sidebar item is brand-colored text and icon with no fill (Stripe e8ddbdc5-bc89-454f-9ebb-846905b83df4 and fb0b91ce-234b-44d5-9f8b-18864cc63941, verified). Linear and Mercury use a neutral fill, so this is a taste call between the two patterns, not a gap against the bar. Two parts are worth keeping. The dark-mode --accent #1e293b is slate, off the zinc palette (drawer--open--tablet-dark.png). Inactive nav icons render in full foreground color. Retint the dark accent to zinc either way.

### VISUAL-I04

**Give each property an identity thumbnail: its photo, or a line-icon tile**

Low · New capability · effort M · `Portfolio list, property header, global search results, property Rentals rows, D10 sidebar property list` · One design system, fixed in the primitives

- **Today:** Properties are text-only in lists. The one visible defect is the Rentals row on the property page, which draws an empty gray placeholder square where a listing photo would go.
- **Why:** The property is HG's core record and an address string is slow to scan; a picture of the building is the fastest recognizer and HG's own signature asset. Zillow Rental Manager and Airbnb both put a small photo beside the address and fall back to a plain icon tile, never an empty gray box.
- **Change:** Add one cover photo per property (pick from listing photos or upload). Render a 32px rounded thumbnail before the address in Portfolio rows, search results and the sidebar property list, and 48px in the property header. With no photo, show a zinc-100 tile with the lucide building icon in secondary gray. The empty square in Rentals rows uses the same fallback.
- **Desktop, tablet, phone:** Desktop and tablet: 32px in rows, 48px in the header. Phone: 40px at the start of two-line list rows (address, then status and neighborhood); the header thumbnail drops so the address keeps its full width.
- **Reuse:** New PropertyAvatar in src/components/ on the same size scale as the person avatar from VISUAL-013; upload reuses the Vercel Blob pattern from Attachments and ListingPhoto.
- **Challenges:** CLAUDE.md Personality, Imagery: real property photography on the public site, single-color line icons in the app. This brings small property photos into the app as identity rather than decoration, which the benchmark library names as HG's signature.
- **References:** 
  - [Zillow](https://mobbin.com/screens/e6bd4d1f-7cb6-4cff-89ac-5fe99420e075): Property header: photo thumbnail beside the address title and one status pill.
  - [Zillow](https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430): Same header with no photo: a gray building-icon tile, not an empty box.
  - [Airbnb](https://mobbin.com/screens/e9da847d-3b16-4b23-a21c-d750ea9dbf06): Small rounded photo beside the title in a summary card.
  - [Airbnb](https://mobbin.com/screens/a92f14ea-1a94-4a63-99f3-8b5fbd42d106): Photo-first cards with a two-line caption: the photo is the identity.
  - [Zillow](https://mobbin.com/screens/b7075027-0608-44d0-ad7a-3bc7f5370c47): A property with no photo gets a neutral building-icon tile the same size as a photo, so rows stay aligned.
  - [Airbnb](https://mobbin.com/screens/9c3ff546-9537-4494-afc5-dded8925fdab): Listing editor Photo tour: photos organized per room with counts, the place to pick a cover.
  - [Airbnb](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c): Photo-led listing cards with one status pill in a fixed top-left spot; the later card view once covers exist.
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): A rounded photo thumbnail about 64px wide sits left of the address and status pill, and an off-market property without a photo gets a neutral building icon tile (https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430).
  - [TravelPerk](https://mobbin.com/screens/ea97d85e-684c-4dc7-afa1-1fea0c1c5165): Small photo thumbnail beside the event title and dates, above the tabs
- **Code:** `prisma/schema.prisma:323`, `src/app/(app)/properties/page.tsx:65-69`, `src/app/(app)/properties/[id]/page.tsx:80-92`, `docs/property-page-plan.md:125-127`
- **Also found as:** PORTFOLIO-037 (Portfolio list and new property), PROPERTY-056 (Property detail page (future property hub))
- **Verification:** partly. The empty gray square in the property Rentals row is real (p647--rentals--desktop-light.png) and should get a fallback tile now. The Zillow references are verified: e6bd4d1f shows a photo thumbnail in the property header, f6fde171 a gray building-icon tile with no photo. But a thumbnail on every Portfolio, search and sidebar row adds visual weight to an 11-property portfolio whose two users know each building by address. It fails the 'prefer removing' bar outside the property header and the future D10 sidebar. Severity medium overstates it; it's a nice-to-have. The house-rule conflict is named correctly.

### VISUAL-I08

**Let the chrome recede: sidebar and top bar one step gray, content on the brightest surface**

Low · Design change · effort S · `App shell on every signed-in page` · One design system, fixed in the primitives

- **Today:** Header and sidebar are white (bg-surface) and the page canvas is #f7f7f8, but content sits in white cards, so the work is as bright as the chrome. Inactive nav icons are 20px, stroke 2, in full foreground color, as dark as body text.
- **Why:** Linear's refresh dimmed its sidebar so content leads, and Vercel keeps navigation on a faint gray beside white work. HG inverts that hierarchy, so the chrome competes with every list.
- **Change:** Sidebar and top bar on zinc-50 (#fafafa; dark one step below the content surface) with a hairline to the content; the content area white. Nav icons 18px at stroke 1.75 in secondary text color, foreground only on hover and when selected (VISUAL-I02). Pairs with VISUAL-009's white canvas.
- **Desktop, tablet, phone:** Desktop: as described. Tablet: the drawer takes the same zinc-50 surface. Phone: top bar zinc-50, content white; the planned bottom bar (D10) uses the top bar's surface.
- **Reuse:** AppShell (src/components/app-shell.tsx) and SideNav (src/components/nav.tsx); tokens in src/app/globals.css.
- **References:** 
  - [Linear](https://mobbin.com/screens/fd1b4d88-f021-49a3-98af-4cd3a87e1d29): Gray chrome with a white inset content panel; the list is the brightest surface.
  - [Linear](https://mobbin.com/screens/e142df2a-3527-499c-8f81-1b715947ac0c): Same hierarchy in dark: chrome darkest, content panel one step up.
  - [Vercel](https://mobbin.com/screens/ff81f1e9-25b1-46f9-8448-31fa40a77e4b): Quiet, slightly gray sidebar with secondary-gray icons beside white content.
  - [Linear](https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb): Gray sidebar, content on a lighter panel.
  - [Vercel](https://mobbin.com/screens/c54df5c8-f72c-406e-bb92-a9a6b116f0a5): Navigation on a quiet gray, cards on white.
  - [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a): Sidebar a step dimmer than the record.
- **Code:** `src/components/app-shell.tsx:63`, `src/components/app-shell.tsx:107-108`, `src/components/nav.tsx:101-110`, `src/app/globals.css:6`, `src/components/app-shell.tsx:108`, `src/app/globals.css:7-8,18-19`
- **Also found as:** SHELL-I15 (App shell, sidebar, top bar, global search and Home)
- **Verification:** partly. The inverted-hierarchy claim is overstated: every list and record sits in white bg-surface cards (ui.tsx:9), so the work is already on the brightest surface; only the gutters between cards are #f7f7f8. Stripe, the primary benchmark, keeps sidebar and content both white with a hairline (Stripe fb0b91ce, verified), so gray chrome is Linear's pattern, not Stripe's. zinc-50 #fafafa against white is about a 2% step and won't shift hierarchy by itself. The valid part, inactive nav icons in full foreground color at stroke 2 (nav.tsx:102-110), overlaps VISUAL-I02. The canvas point overlaps VISUAL-009. Linear fd1b4d88 verified.

### VISUAL-I09

**Shrink empty dropzones to one Attach files button and make the card the drop target**

Low · Design change · effort S · `Task page Attachments; property Documents rail` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The task page has no empty dropzone any more. The Photos and Files section renders only when files exist (tasks/[id]/view.tsx:126-135). Uploads go through the composer's photo button, and the composer gets a blue border while files are dragged over it (composer.tsx:189-198, 247-249). The property Documents card still shows the 95px dashed 'Click to upload or drag files here' box (attachments.tsx:192-224).
- **Why:** An empty dashed box is the second-largest element on the task page and draws the eye to nothing. Linear shows attachments as compact file rows and offers attach as a small action; dropping anywhere on the record works.
- **Change:** Apply this to property Documents only (Attachments with kind 'property'). With no files, show one 'Attach files' ghost button. Make the whole card the drop target, with the composer's blue-border cue while a file is dragged over. The task page needs nothing.
- **Desktop, tablet, phone:** Desktop and tablet as described. Phone: the button reads 'Add photo or file' and opens the native picker with the camera; file rows are 48px.
- **Reuse:** Attachments (src/components/attachments.tsx) and the ghost Button variant.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/f03367b0-cbbe-497c-bfc5-4479a5ed4fd1): An attachment is a compact file row with name and size, no dropzone.
  - [Linear](https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): Attach is a small icon action under the description.
- **Code:** `src/components/attachments.tsx:138-153`, `branch:src/components/attachments.tsx:192-224`, `branch:src/app/(app)/tasks/[id]/composer.tsx:189-198`
- **Verification:** confirmed. Reproduced on the task page (task--desktop-light.png) and the property Documents rail (p647--rentals--desktop-light.png): a dashed box with upload arrow and 'Click to upload or drag files here' (attachments.tsx:137-154). Linear f00cc4fb verified: the attach action is a small icon under the description. The drag-over styling already exists (dragOver state), so moving the drop target to the card is cheap.

### VISUAL-I12

**Set one row height: 40px on desktop lists, 48px on touch**

Low · Design change · effort M · `Every list: Tasks, Deals, Portfolio, Vendors, contractor jobs, Home tasks, property rails` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Measured on :3300 at 1280: Today and All task rows 49px (each carries a 28px date chip), Home task rows 49px, Deals 39px (57px when the address wraps), Portfolio 37-38px, Contractors 37px, contractor Jobs 37px. On touch, task rows use the approved two-line layout at 75px, and Contractors rows wrap to 57-77px at 375. That is still five desktop heights, and task rows are now further from the rest than before.
- **Why:** Mixed densities make the app feel assembled rather than designed, and the tallest rows sit on the longest list. Linear, Stripe and Vercel each hold one row height across every list.
- **Change:** Set a 40px --row-h for one-line desktop rows. In TaskRow that means a smaller date chip (h-7 with py-1.5 on the row) so task rows match the others. On touch, keep the approved two-line task rows (title, then property · status · date) sized to their content, about 64px; one-line touch lists use 48px.
- **Desktop, tablet, phone:** Desktop 40px; tablet and phone 48px because they are touch. Phone lists that become two-line rows (VISUAL-015) use 56px.
- **Reuse:** Td (src/components/ui.tsx:192), tasks/task-row.tsx, deals/deal-row.tsx and the property list; token in src/app/globals.css.
- **References:** 
  - [Linear](https://mobbin.com/screens/ef923b0e-9a40-4fdd-80f2-f3aafb4f36ce): One compact row height across every status group.
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Uniform compact transaction rows.
  - [Vercel](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54): Uniform two-line rows; a second line is planned, never a wrap.
- **Code:** `specs/rows.json`, `branch:src/app/(app)/tasks/task-row.tsx:73`, `eval on :3300: Tasks 49/75, Home 49, Deals 39/57, Portfolio 37-38, Contractors 37 (57-77 at 375), contractor Jobs 37`
- **Verification:** partly. Measurements reproduce: Tasks 47px, Deals 39px (57px when the address wraps), Portfolio 37-38px, Vendors 37-38px, Financials by-property 38px, Home CapEx 20-21px. But a 37 to 47px spread across separate pages is barely perceptible, so this is polish, not medium. The two spots that matter: Tasks rows are tall because the in-place title input adds padding (task-row.tsx:39), and Deals addresses wrap (address normalization, plus a column that's too narrow at 1280). Fix those directly before introducing a token.

### VISUAL-I15

**The Deals page title sits 8px lower than every other list page**

Low · Fix · effort S · `Deals list header` · One design system, fixed in the primitives

- **Today:** PageHeader aligns its row with items-end (ui.tsx:207), so a page without a subtitle drops its title to the button's baseline. Measured h1 top: Home, Tasks, Portfolio, Financials and Vendors at 80px; Deals at 88px; Settings at 134px under its tabs (specs/titles.json run; deals--desktop-light.png vs tasks--desktop-light.png). Moving between Deals and Tasks makes the title jump.
- **Why:** House rule: things that should line up, line up exactly. Linear keeps the same header geometry on every view so navigation feels like one surface.
- **Change:** PageHeader aligns items-start with the actions centered on the title line, so the title holds the same position with or without a subtitle. Settings' position is handled by VISUAL-040.
- **Desktop, tablet, phone:** Same rule at all sizes; on phone the action button stays on the title line.
- **Reuse:** PageHeader (src/components/ui.tsx:197-215).
- **References:** 
  - [Linear](https://mobbin.com/screens/fd1b4d88-f021-49a3-98af-4cd3a87e1d29): Header row and view tabs sit at the same position on every view.
  - [Linear](https://mobbin.com/screens/ef923b0e-9a40-4fdd-80f2-f3aafb4f36ce): Same header geometry on a project's issue view.
  - [Stripe](https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d): Title and actions share one line regardless of what sits beneath.
- **Code:** `src/components/ui.tsx:207`, `specs/titles.json`
- **Verification:** confirmed. Measured h1 top: Home, Tasks, Portfolio, Financials and Vendors at 80px, Deals at 88px (no subtitle; PageHeader uses items-end, ui.tsx:207), Settings at 134px.

### VISUAL-I16

**Card header bars are 45px in the main column and 52px in the rail**

Low · Fix · effort S · `Property page two-column layout (and any page mixing Card and SectionCard)` · One design system, fixed in the primitives

- **Today:** CardHeader is py-3 (ui.tsx:15) and SectionCard's header is min-h-[3.25rem] (ui.tsx:45). On the property page the Financials header is 45px with its title at 173px while the Details header beside it is 52px with its title at 177px, so the titles miss by 4px and the header rules by 7px (specs/h3.json run; p767--desktop-light.png).
- **Why:** Side-by-side cards whose titles and dividers miss by a few pixels read as unfinished, against the house rule that things which should line up do so exactly.
- **Change:** One header height token (48px) for CardHeader and SectionCard with the title vertically centered. If VISUAL-009 replaces cards with flat sections, the same rule applies to section headings: one fixed distance from heading to rule.
- **Desktop, tablet, phone:** Same at all sizes; on phone the columns stack so only the token matters.
- **Reuse:** CardHeader and SectionCard in src/components/ui.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): 'Timeline' and 'Details' headings start on one line across the main column and the rail.
- **Code:** `src/components/ui.tsx:15`, `src/components/ui.tsx:45`, `specs/h3.json`, `src/components/ui.tsx:14-16`, `src/components/ui.tsx:44`
- **Also found as:** PROPERTY-049 (Property detail page (future property hub))
- **Verification:** confirmed. Measured on 647 Prospect: Financials header 45px with title at 173px, Details 52px at 177px, and the rail's Tasks header 57px (the '+ Task' button grows it). That's three header heights, not two. Stripe ed14dee7 verified: Timeline and Details headings share a line.

### VISUAL-IV05

**Replace the lock emoji on lockbox codes with a line icon**

Low · Fix · effort S · `Property Units & access; Financials settings table` · One design system, fixed in the primitives

- **Today:** Lockbox codes render as a color '🔒' emoji before the code ('Front 🔒 6476', p647--rentals--desktop-light.png) from edit-units.tsx:202, and financials/settings/tables.tsx:141 uses the same emoji. It renders as a gold glossy lock, the only full-color glyph in the app.
- **Why:** House rules say no emojis in product copy and single-color line icons in the app. The emoji also renders differently on iOS, Android and Windows.
- **Change:** Use the lucide Lock icon at 14px, stroke 1.75, in muted text, with an aria-label 'Lockbox code'.
- **Desktop, tablet, phone:** Identical at every size.
- **Reuse:** lucide-react (already the approved icon set per the migration spec).
- **References:** 
  - [Mercury](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930): Sensitive numbers shown as plain labeled text with a single-color copy icon
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:202`, `src/app/(app)/financials/settings/tables.tsx:141`, `src/app/(app)/properties/[id]/edit-units.tsx:201-203`, `src/app/(app)/properties/[id]/edit-units.tsx:201-202`, `units-read eval: spans '🔒 7676' (x3)`, `src/app/(app)/properties/[id]/edit-units.tsx:189-191`, `src/app/(app)/financials/settings/tables.tsx:139-142 (title="pinned")`, `Local DB: the three 767 Prospect units have one distinct lockbox code`
- **Also found as:** PROPERTY-045 (Property detail page (future property hub)), PROPERTY-V07 (Property detail page (future property hub)), MOBILE-039 (Lens: phone and tablet experience on every route), FEEL-V05 (Lens: interaction quality, feedback, states, speed and accessibility), COPY-V07 (Lens: words on every screen), JOURNEYS-V07 (Lens: the core jobs, end to end), G2C-V03 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** verifier-found
