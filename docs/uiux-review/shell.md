# App shell, sidebar, top bar, global search and Home

Part of the [UI/UX review](README.md). 40 findings: 0 critical, 7 high, 21 medium, 12 low.

## How it should work

The shell does two jobs: show each partner what needs them, and reach any record in two keystrokes. Chrome recedes so the work leads.

Sidebar. Full height on the page's own gray with no stroke, so the white cards are the brightest thing on screen (Linear https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb). The current page gets a neutral fill, because blue means act (Vercel https://mobbin.com/screens/c54df5c8-f72c-406e-bb92-a9a6b116f0a5). At the top: the HG mark, Search with its ⌘K chip, and a New menu that offers the current property or deal first. Then Home, Tasks with a count of what is due for you (Mercury https://mobbin.com/screens/f460f92e-4dab-437c-8c52-d0a1cc108e27), Properties listing the 11 addresses (D10), Deals, Financials and Contractors, plus a Favorites group once someone stars a record (Attio https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a). The avatar opens Settings, Appearance, Hide amounts and Sign out (Vercel https://mobbin.com/screens/a8d666ee-3303-4b28-9e1f-06b8dbd63cb6).

Search follows Mercury (https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2): scope chips, results grouped by type, "See all 14 tasks" at the end of a group (https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6), key hints in the footer, and "New task" when nothing matches. On phones it is a full-screen sheet with the field near the thumb (Linear Mobile https://mobbin.com/screens/652dac8a-d883-4034-8811-0956e4c0ef38).

Home is Today. Airbnb made Today the host's home (https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32), and HG should too, instead of keeping a Home list and a Today tab that show the same rows. Top to bottom: the date and a greeting that answers in one sentence (Jobber https://mobbin.com/screens/020cee8e-7bb3-4e9a-a26d-0de6f61b06bb); one pinned card, only when something blocks, starting with a stale QuickBooks sync; a gray strip of today's visits and closings (Things 3 https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd); the approved Mine | Contractors columns, with a dot and a name on rows someone else changed; and a collapsed Done today (Mercury https://mobbin.com/screens/ec7b66ef-59c2-495b-9872-7f17f40c5c52). A Today | Upcoming switch holds the horizon: this week by day, then renewals, maturities and registrations by month, each with Make task (Things 3 https://mobbin.com/screens/70d652ee-3a68-47b6-a66e-2c8e9194255c). Opening a row shows "3 of 12" so triage keeps its place. The count cards and the CapEx matrix leave Home.

Phones get the labeled bottom bar (Airbnb https://mobbin.com/screens/8249f9ca-1fdc-4f97-870f-974d6811a36c), the blocker card docked above it, two-line rows with the property under each title, and the page title moving into the bar on scroll.

The calm still reads as HG: when Today is clear, one real property photo and the next step.

<details><summary>What the reviewer covered</summary>

Production build at http://localhost:3200, signed in as Connor. I captured Home (/) in Chromium at desktop 1280, tablet 768, mobile 375, wide 1920 and narrow 320, plus dark mode at desktop and mobile and WebKit at mobile (drawer). I saw the shell on /tasks, /contractors, /deals/cmtg25yd8002cjphs49ovlvob, /properties/cmtg25y4p0006jphsv3frndk6, /financials, /financials/settings, /settings and /settings/move-in-form, and checked document titles, h1s and the active nav state on each.

404 checks: /does-not-exist signed in (desktop and mobile) and the in-app not-found at /properties/nope123.

Sidebar states:
- collapsed rail (the default with no cookie)
- hover-expanded overlay
- pinned
- keyboard Tab order, which hits an invisible pin button and a clipped Sign out
- mobile drawer open, Esc and Tab order, in Chromium and WebKit
- avatar block (it's a static span)

Global search: 'prospect', 'plumb', 'mariner', 'cristiano', 'congress', 'oxford', 'lease', '72 mariner', 'zzqxv' and a single character, through the UI and against /api/search directly. I measured latency (about 200ms, including the 180ms debounce) and tried ArrowDown, Enter and Esc (none work). I also looked at the dropdown height, the 201px dropdown on mobile and dark mode.

Home: every card and link (stats, View all to /tasks?assignee=me, task rows). For CapEx I tried hover tooltips on desktop, tap on mobile, year selection and the sideways table scroll. Sidebar nav timing measured locally (48 to 176ms).

Not reached:
- The error.tsx boundary. I couldn't trigger an error without writes, so I reviewed the code.
- A 1024px touch viewport (iPad landscape). The helper has no preset, so the rail-on-touch finding is from code.
- Clicking the theme toggle itself. Dark mode came from the theme parameter.
- Production latency (Vercel to Supabase). Local only.

Mobbin: 18 searches. Ramp isn't on Mobbin, so I used Stripe, Mercury, Linear, Attio, Vercel, Todoist, Graphite, Airbnb, ClickUp, HubSpot, Square, Plain, Coinbase, Height, N26, Stripe Dashboard iOS and others, citing only screens that came back.

</details>

## Findings

### SHELL-001

**Make global search work from the keyboard (arrows, Enter, Esc) with combobox semantics**

High · Fix · effort M · `Shell: global search (every signed-in page)` · A quiet shell with real search, navigation and sign-in

- **Today:** Typing 'prospect' shows results, but ArrowDown leaves focus in the input, Enter does nothing (URL stayed '/'), and Esc leaves the dropdown open (probe returned 'dropdown still open'). The input is a plain textbox and results are plain buttons, with no listbox or option roles, no aria-expanded and no active descendant. Only a mouse click opens a result.
- **Why:** The job is to jump to any record in two keystrokes. Today it takes typing plus a mouse trip. Every benchmark palette (Linear, Mercury, Vapi) moves with arrows and opens with Enter. Screen readers get no announcement that results exist. 'One Esc closes one layer' is a house rule.
- **Change:** Rebuild GlobalSearch on React Aria ComboBox (approved in D9). Use combobox, listbox and option roles. The first result is highlighted automatically (bg-background fill). Up and down move, Enter opens the highlighted result, and Esc closes the list first, then clears the text on a second press. Tab leaves and closes.
- **Desktop, tablet, phone:** Same on desktop 1280 and tablet 768 (hardware keyboards on iPad too). On phone 375 the same list semantics live inside the full-screen sheet from SHELL-005, without key hints.
- **Reuse:** Extend src/components/global-search.tsx and build the shared popover hook listed under Known gaps in docs/components.md, using React Aria ComboBox.
- **References:** 
  - [Mercury](https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2): Highlighted row moves with the arrows, and the footer prints the keys: Navigate, Open page, Open in new tab.
  - [Vapi](https://mobbin.com/screens/593d7acd-2e16-4365-bcd6-02ce52f48f3b): Highlighted row plus footer hints for arrows to navigate and Enter to select
  - [Magnific](https://mobbin.com/screens/e22e26e2-f813-4f1e-beda-43c9ecf26419): First row pre-selected; Navigate, Select and ESC Close hints
  - [Mercury](https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6): Footer hints: ↑↓ Navigate, ↵ Open page, ⌘↵ Open in new tab.
  - [Mercury](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445): Zero results never show a blank: 'No results found' plus a next action, and the footer prints the keys (arrows to navigate, Enter to open, Cmd+Enter for a new tab).
  - [Linear](https://mobbin.com/screens/d0b98680-66e2-47d4-9dc4-28bc9450c27f): Plain no-match line that repeats the query: 'No results found for "designnn"'.
  - [Mercury](https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62): Header search reads 'Search for anything' with a ⌘K keycap printed at its right edge.
  - [Superhuman Mail](https://mobbin.com/screens/85dc5994-9360-428d-9092-7425e070ed7f): The command palette lists actions with each one's shortcut key on the right, and the placeholder teaches by example ('Type "go to done"').
  - [Attio](https://mobbin.com/screens/08df4ff2-a5d6-4200-b3b5-44e3ddc41f09): The sidebar shows 'Quick actions ⌘K' and a separate search icon with '/' printed beside it.
  - [Base44](https://mobbin.com/screens/675ecfd2-b7fc-4e8d-9078-3eeeaddda7c7): ⌘K hint in the field, results grouped with a type subtitle, highlighted active row.
  - [Stripe](https://mobbin.com/screens/17178206-699c-49d5-9d3e-ee98d79f8b7d): The first match is highlighted as you type, ready for Enter.
  - [Stripe](https://mobbin.com/screens/3a15e105-2b7d-4857-9fb6-478731427ebb): Results grouped by record type, the same grouping HG's dropdown already uses.
  - [Magnific](https://mobbin.com/screens/14ceb943-f04a-460f-b4f5-2ea6a2d91234): Command menu footer with Navigate / Select / ESC Close key hints
  - [Mercury](https://mobbin.com/flows/1d51be38-aff7-4a34-835d-8c50f89f4fd5): Search with scope chips and a Navigate / Open page / Open in new tab footer
- **Code:** `src/components/global-search.tsx:38-66`, `src/components/global-search.tsx:36-67`, `src/components/global-search.tsx:38-68`, `src/components/global-search.tsx:29-35`, `src/components/global-search.tsx:38-47`, `search run evals: after Meta+k activeElement = BODY; after ArrowDown and Enter the path is still /; after Escape the dropdown is still present`, `src/components/global-search.tsx:15-26,48-66`, `Probe: after ArrowDown and Enter, path /tasks with focus on INPUT; after Escape the 15 result buttons are still rendered`, `src/components/global-search.tsx:37-70`, `src/components/global-search.tsx:38-48 (no onKeyDown; renders only when results.length > 0)`
- **Also found as:** SHELL-V05 (App shell, sidebar, top bar, global search and Home), IA-012 (Lens: information architecture and global SaaS patterns), IA-IV02 (Lens: information architecture and global SaaS patterns), FEEL-014 (Lens: interaction quality, feedback, states, speed and accessibility), FEEL-V07 (Lens: interaction quality, feedback, states, speed and accessibility), JOURNEYS-021 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Reproduced on desktop: after typing 'prospect', ArrowDown leaves focus in the INPUT, Enter keeps the URL at '/', and Esc leaves the dropdown open. The input has no role and no aria-expanded, and its only name is the placeholder. Evidence: verify-SHELL/search--prospect--desktop-light.png and search--after-esc--desktop-light.png. Build it once with SHELL-002, which uses the same ComboBox (D9 approves React Aria). The Vapi and Magnific refs fit the keyboard pattern.

### SHELL-002

**Add a ⌘K command palette with Recent, Go to and grouped results**

High · New capability · effort M · `Shell: global search` · A quiet shell with real search, navigation and sign-in · big bet

- **Today:** There are no keyboard shortcuts anywhere in src (a grep for metaKey, ctrlKey and key handlers finds none). Reaching search takes a click or two Tabs from page load. An empty field shows nothing, so there are no recents and no navigation targets. Results are a flat list with an uppercase type prefix.
- **Why:** Stripe, Mercury ('Search or jump to ⌘K') and Linear make ⌘K the main way around the app. With 675 deals, 2,086 tasks and 11 properties, jumping beats browsing. The palette also lets the visible header shrink to a single button.
- **Change:** ⌘K and '/' open a centered 640px palette.
- Empty state: Recent (the last five records opened, stored per browser), Go to (Home, Tasks, Properties, Deals, Financials, Contractors) and Create (New task, New deal).
- While typing: sections for Properties, Deals, Tasks and Contractors, up to five rows each, plus a 'Show all results' row.
- Footer hints: arrows, Enter, Esc.
- The header or sidebar search becomes a button reading 'Search' with a ⌘K chip that opens the same palette.
- **Desktop, tablet, phone:** Desktop 1280: centered dialog 20% from the top. Tablet 768: opened from the search button, same dialog at 90% width. Phone 375: full-screen sheet (SHELL-005) without key hints.
- **Reuse:** New src/components/command-palette.tsx on React Aria Dialog and ComboBox, reusing /api/search and lib/normalize shortAddress. Add a docs/components.md row.
- **References:** 
  - [Mercury](https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2): Palette opens on suggested destinations before typing, with scope chips across the top.
  - [Mercury](https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6): Results grouped under a type header, led by a jump to the full filtered page.
  - [Linear](https://mobbin.com/screens/1e783aca-8b8e-4ae5-994d-284a8ddae491): ⌘K as the primary way to act
  - [Mercury](https://mobbin.com/screens/dbbf7fd1-24e8-4494-9c0c-27007652c7e5): 'Search or jump to' field with a ⌘K chip in the top bar
  - [Gumloop](https://mobbin.com/screens/97f3400e-39b6-469b-b208-addb2d51e850): Results grouped by type headers, matched text bold, 'Open' hint on the active row
  - [Vapi](https://mobbin.com/screens/593d7acd-2e16-4365-bcd6-02ce52f48f3b): Actions, Recent and All pages sections in one palette with a result count
  - [Superhuman Mail](https://mobbin.com/screens/85dc5994-9360-428d-9092-7425e070ed7f): Every command row prints its shortcut key on the right, so the palette teaches the keyboard.
  - [Superhuman Mail](https://mobbin.com/screens/04a88f21-128b-416e-98c6-97e1db3b10af): Opening the palette shows Recent Opens beside the command list, so the last records are one key away.
  - [Todoist](https://mobbin.com/screens/4121eb20-aa88-4eef-9cc2-dfa7c4ccb4fa): Recent searches, Recently viewed, and Navigation with G-then shortcuts.
  - [Supabase](https://mobbin.com/screens/9b4725f5-e038-4fc7-98ad-64a59f74b4d7): Shortcuts and Actions groups with key badges.
- **Code:** `src/components/global-search.tsx:8-70`, `src/components/app-shell.tsx:86-88`, `Probe: Meta+k and '/' leave document.activeElement on BODY`, `asana-migration-plan.md section 4 (week 2: Cmd+K and shortcuts)`
- **Also found as:** IA-029 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. There are no metaKey or ctrlKey handlers in src, search is Tab stop 2, and an empty field shows nothing. This finding overlaps SHELL-037 (the ⌘K chip) and SHELL-027 (where the trigger lives). Its five rows per type conflicts with SHELL-011's four, so pick one. Spot-check: Stripe and Mercury web both put a Search field in a top bar over a full-height sidebar (https://mobbin.com/screens/e8ddbdc5-bc89-454f-9ebb-846905b83df4, https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1).

### SHELL-003

**Rebuild Home as one 'Needs you' list in sections instead of counts plus a CapEx matrix**

High · Design change · effort L · `Home (/)` · Home and Today become one work queue · big bet

- **Today:** Everything stated is true at desktop: three count cards, the CapEx card filling the screen, 'My open tasks' at y≈685, and 12 tasks each 50 to 55 days overdue. On phone 375, 'My open tasks' starts at about y=676, just below the first screen rather than two screens down. 'The strip from SHELL-018' should read SHELL-024.
- **Why:** Home's job is to show in five seconds what needs attention. Stripe's overview leads with lists that need action (Failed payments, with a count). Graphite and Assembly group an inbox by why it needs you. Airbnb's Today tab leads with required actions. Counts and a five-year planning table answer different questions.
- **Change:** Build D10's 'what needs me' as one column of sections. Each section has a heading and count and appears only when non-empty:
1. Overdue (mine)
2. Due this week (mine)
3. Review: contractor work waiting on you, once the Review status ships
4. Coming up: loan maturity, insurance renewal and rental registration within 60 days, deal next actions due, CapEx due this year
5. Waiting on contractors

Each row has a checkbox where it can be completed, the title, the property's short address and one muted date. Keep the greeting as the H1 and replace the subtitle with one data sentence: 'Hi Connor, 6 things are due this week.' Portfolio vitals collapse into the strip from SHELL-018.
- **Desktop, tablet, phone:** Desktop 1280: Needs you takes 2/3 and Coming up 1/3. Tablet 768: one column, Coming up after Due this week. Phone 375: one column; each section shows five rows and a 'Show all 74' link; property address drops to a second line.
- **Reuse:** Card, Badge, EmptyState and TaskCheckbox (extended to 44px per the migration spec), lib/dates for labels, plus the Property and Deal fields at prisma/schema.prisma:64-65,129,139,143.
- **References:** 
  - [Mercury](https://mobbin.com/screens/1e034b7d-1cce-4fa7-967e-534708cebbdc): Greeting followed by one sentence that answers whether anything needs you.
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): Today list: fixed events in a gray block, then to-dos with a gray parent sublabel and a deadline flag.
  - [Jobber](https://mobbin.com/screens/020cee8e-7bb3-4e9a-a26d-0de6f61b06bb): Home as work: date, greeting, a To do list and today's appointments before any performance numbers.
  - [Stripe](https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888): Overview widget listing failed payments with status badges and '3 of 3 results'
  - [Graphite](https://mobbin.com/screens/e9927e90-8176-45d3-95ed-6c9a44c3bbe1): Inbox in collapsible sections (Needs your review, Returned to you, Waiting) with counts
  - [Airbnb](https://mobbin.com/screens/fc6b314f-c9b0-4ce8-bdc2-a68c51017c08): Today page led by one required action card
  - [Assembly](https://mobbin.com/screens/f77c7f8c-610d-4a08-8264-9ea2aaaf5f3f): 'Awaiting your approval' and 'Approvals I've requested' as separate sections
- **Code:** `src/app/(app)/page.tsx:46-97`
- **Verification:** partly. The direction is D10 and is right. But the approved Today view (spec section 6, built Oct 27) already has Mine with Overdue ('Move all to today'), Today and Waiting, plus Contractors with Needs review. Sections 1, 2, 3 and 5 as written would make Home a second copy of Today. Home's unique value is section 4: loan maturity, insurance renewal, rental registration, deal next actions and CapEx. Pair that with a one-line task summary that links to Today, which section 6 item 8 already approves. I verified the Stripe ref https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888 (Failed payments widget with '3 of 3 results').

### SHELL-004

**Default to a labeled sidebar with an explicit collapse toggle; drop hover-to-expand**

High · Design change · effort M · `Shell: sidebar (desktop)` · A quiet shell with real search, navigation and sign-in

- **Today:** With no cookie, the sidebar is a 64px rail of seven unlabeled icons (trend line for Deals, wrench for Vendors, sliders for Settings). Labels appear only on mouse hover, when the rail grows to 240px as an overlay with shadow-2xl that covers page content (the Tasks heading disappears under it). Pinning uses a thumbtack in an otherwise empty 28px row that stays invisible until hover. Keyboard focus never expands the rail: focusing Home leaves it at 64px. At 1024px and up on touch (iPad landscape), the rail depends on hover.
- **Why:** Stripe, Linear, Attio, Vercel and Mercury all default to a labeled sidebar and collapse it with a standard panel toggle. An overlay that opens whenever the pointer drifts left feels jumpy. House rule: 'Touch has no hover.'
- **Change:** At 1280 and up, default to a 224px labeled sidebar that pushes content. Remove onMouseEnter and onMouseLeave. Put a panel-left toggle in the sidebar header beside the HG name. Collapsed mode is a 56px rail that shows a tooltip on hover or focus, remembered in the existing cookie. From 1024 to 1279, default to the rail, and the toggle pushes rather than overlays.
- **Desktop, tablet, phone:** Desktop 1280: expanded and pushing. iPad landscape 1024: rail, tap the toggle to expand. Tablet 768 and phone 375: no sidebar; the bottom bar from SHELL-006 takes over.
- **Reuse:** src/components/app-shell.tsx, the lib/sidebar.ts cookie, components/tooltip.tsx (add a focus path) and the lucide-react PanelLeft icon.
- **References:** 
  - [Attio](https://mobbin.com/screens/d540b3e0-e79c-4e09-afb2-c6b19d117ebe): Labeled sidebar with a panel toggle next to the workspace name
  - [Linear](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab): Always-labeled sidebar with workspace, search and compose in its header
  - [Vercel](https://mobbin.com/screens/2017378e-39db-43ce-b33b-3b193543472f): Labeled sidebar that pushes content, user row at the bottom
  - [Stripe](https://mobbin.com/screens/7299bfea-a115-4d6c-b14e-715e37e81d86): Labeled sidebar always visible, with Home, Balances, Transactions and a Products group.
  - [Attio](https://mobbin.com/screens/2f854791-b0f6-475a-97c3-65e65d5f7581): Labeled sidebar with grouped sections (Favorites, Records), the shape D10's property list needs.
  - [Mercury](https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6): Labeled sidebar with the current page in a neutral fill.
  - [Stripe](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13): Labeled, always-visible sidebar with grouped sections.
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): Labeled sidebar that also lists records beneath their object.
  - [Mercury](https://mobbin.com/screens/2789fe71-1ccd-4834-b61e-83f3d79b475e): Calm, labeled finance sidebar with a Bookmarks group.
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Labeled sidebar with grouped sections.
  - [Vercel](https://mobbin.com/screens/b313e291-3869-43a6-9125-d98cf9f3ccb8): Labeled sidebar, one icon weight.
  - [Vercel](https://mobbin.com/screens/172f9834-0e6a-4fa8-abd4-6e91b02b5ef4): A stable labeled sidebar that never moves over the content; navigation stays in the background.
  - [Mercury](https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62): The sidebar holds still while a drawer opens on the opposite side, so only the thing you asked for moves.
- **Code:** `src/components/app-shell.tsx:104-159`, `src/components/app-shell.tsx:104-143`, `src/components/app-shell.tsx:105-113`, `src/components/app-shell.tsx:111`, `src/components/app-shell.tsx:104-112 (onMouseEnter sets hovered immediately)`, `src/components/tooltip.tsx:13 (Tooltip delay 250 ms)`
- **Also found as:** SHELL-V06 (App shell, sidebar, top bar, global search and Home), IA-006 (Lens: information architecture and global SaaS patterns), VISUAL-047 (Lens: visual design system across every screen), FEEL-I15 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Reproduced: the hover overlay is 240px with a shadow and covers the Tasks heading (a hover on the h1 timed out because the overlay sits on top of it). The pin is focusable at opacity 0, and focusing Home leaves the aside at 64px. Evidence: verify-SHELL/sidebar--hover--desktop-light.png and rail--tab5--desktop-light.png. D10's property list needs a labeled sidebar anyway. In my spot-check, Linear, Stripe and Mercury web all use always-labeled full-height sidebars.

### SHELL-006

**Replace the hamburger drawer with D10's labeled bottom bar: Home, Tasks, Properties, Deals, More**

High · Design change · effort M · `Shell: phone and tablet navigation` · The phone is a chosen subset, and touch has no hover · big bet

- **Migration branch:** Still applies on the migration branch. /tasks at 375 and 768: navigation is still a 32x32 'Open navigation' hamburger opening a drawer with seven links (Home, Deals, Portfolio, Financials, Tasks, Contractors, Settings), Appearance and Sign out, behind a scrim. There is no bottom bar.
- **Today:** Below 1024px (every phone and iPad portrait), navigation is a 32px hamburger. It opens a 256px drawer under the header holding seven links, Appearance and Sign out. Every destination takes two taps, and nothing on screen shows which section you're in.
- **Why:** D10 already approved a labeled phone bottom bar. Airbnb's host app, N26 and Stripe's iOS app all keep four or five labeled destinations one tap away and push the rest into a Menu or More tab.
- **Change:** A labeled bar with five tabs: Home, Tasks, Properties, Deals, More.
- More opens a plain list: Financials, Contractors, Settings, Appearance, Sign out.
- Tasks carries the muted count from SHELL-032.
- Each tab is a 22px line icon over an 11px label; the active tab uses the primary color with no pill. The bar is 56px plus the safe-area inset.
- Delete the drawer, the scrim and both hamburger and close buttons.
- **Desktop, tablet, phone:** Phone 375 and 320: five tabs at about 64px each; 'Properties' fits at 11px. Tablet 768 portrait: same bar (touch layout). Desktop 1280: sidebar only.
- **Reuse:** New src/components/bottom-bar.tsx fed from the LINKS array in components/nav.tsx, plus Badge. Add a docs/components.md row.
- **References:** 
  - [Jobber](https://mobbin.com/screens/3872fb82-2e8f-41fe-b587-e1063401f155): Five labeled tabs ending in More, with one create button floating above the bar.
  - [Airbnb](https://mobbin.com/screens/8249f9ca-1fdc-4f97-870f-974d6811a36c): Labeled bar with Today first and an unread dot only on Menu
  - [Airbnb](https://mobbin.com/screens/ec965d5f-a216-49db-b44b-7ee988a9d7d7): Menu tab as a grouped list holding everything that isn't a tab
  - [N26](https://mobbin.com/screens/c4c4ed50-dda0-4bb5-94fe-25fbdb685a45): Five labeled tabs with a clear active state
  - [Linear Mobile](https://mobbin.com/screens/2d1fdc3c-3758-46bb-88e1-5cfd39ce4148): Alternative to More: the last slot of the floating bar shows the section you last picked and expands into the full section list, with search as a separate round button.
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): Search sits on its own button at the left of the bar, tabs in the middle and a context action on the right, so search never takes a tab slot.
  - [IHG Hotels & Rewards](https://mobbin.com/screens/e47b6c30-3099-43c7-a5fa-3669b10edf01): Five labeled tabs with More as the fifth.
  - [Angi](https://mobbin.com/screens/4ea190d7-5a91-424e-ac6c-b5609ef2a510): Home, Projects, Pros, Inbox and More, with a large title and In progress | Done.
  - [Mercury](https://mobbin.com/screens/82e8f14d-9bf6-4956-bb4d-8d9306d167d3): Calm finance home with a persistent bottom bar.
  - [Stripe Dashboard](https://mobbin.com/screens/e345975a-5113-4ffd-8b71-1abc1481379e): Five labeled tabs with the active one in the primary color; labels never drop.
  - [Stripe Dashboard](https://mobbin.com/screens/fba86a00-cfc6-43b3-af79-052679faa58e): Five labeled tabs (Home, Payments, Balances, Customers, Search), calm and monochrome with one accent
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): Field-service bar: Home, Schedule, Timesheet, Search, More; 'More' holds the rest
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): Host bar Today, Calendar, Listings, Messages, Menu, with a red dot only where action is needed
- **Code:** `src/components/app-shell.tsx:64-82,94-102,161-185`, `branch src/components/app-shell.tsx:68-70,95-101,121`, `src/components/app-shell.tsx:63-81`, `src/components/app-shell.tsx:160-181`, `probe: drawer control heights '28,0,36,36,36,36,36,36,36,32,16'`, `head meta: only 'width=device-width, initial-scale=1'`, `src/components/app-shell.tsx:63-113,163-193`, `src/components/nav.tsx:7-79`, `branch src/components/app-shell.tsx:194`, `branch src/app/layout.tsx (unchanged)`
- **Also found as:** IA-011 (Lens: information architecture and global SaaS patterns), MOBILE-006 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. This builds on D10 correctly. One minor point: the page H1 does show the section; only the chrome doesn't. The spec doesn't fix the tab set, so Home, Tasks, Properties, Deals, More is a proposal for Connor to pick. The Tasks tab should land on Today (D31). Evidence: verify-SHELL/mob--drawer--mobile-light.png.

### SHELL-I01

**Make Home the Today view instead of a second list of the same tasks**

High · Design change · effort M · `Home (/) and Tasks > Today` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Home is unchanged in shape: greeting with 'What needs attention', three stat tiles (13 active deals, 11 properties, 236 open tasks), the 5-year CapEx card, then a 12-row 'My open tasks' card whose header link reads 'Today' and goes to /tasks. Today (/tasks) is built with Mine | Contractors and shows the same overdue rows (Mine > Overdue 25 for Connor). Home and Today now use the same date label (dueLabel via DueDatePicker, 'Aug 28' in red on both), so the two lists agree, but they are still two lists of the same work.
- **Today:** Home's 12-row My open tasks card and the cutover Today view show the same open tasks, and the cutover Home card links straight to Today. The '52d ago' on Home versus 'yesterday' on Tasks comes from dueLabel's rule that maps any overdue date to 'yesterday'. The cutover build already replaces that rule, so it is not drift between two lists.
- **Why:** Two screens answering what needs me split attention and drift apart. Airbnb rebuilt its host app so Today is the home tab, and Ramp merges tasks into the home list. One place to triage is the calmest structure for two partners.
- **Change:** Route / renders the approved Today (Mine | Contractors, D31) under the greeting, and Tasks keeps All with its filters. Home adds only what Today lacks: the blocker card, the fixed-events strip, Upcoming and Done today. The Home nav item is Today's entry point; the Today tab under Tasks redirects to /.
- **Desktop, tablet, phone:** Desktop 1280: greeting, then the two D31 columns side by side. Tablet 768: the Mine | Contractors switch from the spec. Phone 375: same switch with two-line rows; the Home tab in the bottom bar opens it. Nothing drops.
- **Reuse:** today-view.tsx, TaskListProvider, TaskSection and SegmentedControl from the cutover build; PageHeader.
- **Challenges:** D31 places Today under Tasks as its own view, and D10 plans Home as a separate what-needs-me page; this merges them into one route. It also replaces SHELL-003's separate Home sections.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32): Today is the host's home page, with a Today | Upcoming switch.
  - [Airbnb](https://mobbin.com/screens/8249f9ca-1fdc-4f97-870f-974d6811a36c): Today is the first tab of the phone app.
  - [Mercury](https://mobbin.com/screens/1e034b7d-1cce-4fa7-967e-534708cebbdc): Home leads with whether any tasks need your action.
  - [Mercury](https://mobbin.com/screens/a17be959-5966-495f-a230-65fcdcc333cf): Home is a greeting, one row of action pills (Send, Transfer, Upload bill), then queue cards that carry counts (Outstanding, Overdue, Due soon) with a View link; charts sit below the work.
  - [Mercury](https://mobbin.com/screens/d3e836dd-8e36-46d6-ae65-72cd10aced61): The empty Home says it in one line: 'You don't have any tasks requiring your action.' Use the same one-line empty state for HG's Today.
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): Inbox as the home of work: a list of items that need you, each with its reason and age, plus an Undo toast after clearing one.
  - [Deel](https://mobbin.com/screens/6bd4989c-7a50-413e-be7e-e955b2394a29): 'For you today' is one list of to-dos with counts and a Review button.
  - [Remote](https://mobbin.com/screens/58e6b83b-831e-41ff-9422-a33c928b8b60): 'Things to do' with All, New and Overdue as the start page.
  - [Linear](https://mobbin.com/flows/b72025a8-0e51-4cf9-ae26-b78aa008bdea): One personal queue (My issues) instead of a dashboard.
- **Code:** `src/app/(app)/page.tsx:46-95`, `branch: src/app/(app)/page.tsx (card links Today at /tasks)`, `branch: src/app/(app)/tasks/today-view.tsx:60-107`, `asana-migration-plan.md:434 (Home's card linking to Today)`, `branch-src/src/app/(app)/page.tsx:43-72 (stats, CapEx, My open tasks card, 'Today' link to /tasks)`, `branch-src/src/app/(app)/tasks/today-view.tsx:56-126`, `src/app/(app)/page.tsx:46-56`, `asana-migration-plan.md section 6 item 8 ('Home's card linking to Today')`
- **Also found as:** IA-005 (Lens: information architecture and global SaaS patterns)
- **Verification:** partly. The duplication is real. The cutover Home card links Today at /tasks (task-management-migration page.tsx:57-58), and today-view.tsx renders Unassigned, Overdue with Move all to today, Today, Waiting, No date and Needs review. The drift evidence is misattributed, though. Tasks says 'yesterday' because dueLabel deliberately maps every overdue date to 'yesterday' (src/lib/dates.ts:116-124). The plan already lists that as a known bug, and the cutover replaces it with '3d late' on Oct 24. Two lists did not cause it. The recommendation is a sound simplification and conflicts_with correctly names D10 and D31. Gaps: it never says where the CapEx forecast card and the three count cards go once / becomes Today, and stacking I02, I03, I04 and I08 on top grows Home back. The Ramp claim has no Mobbin citation. Airbnb d6c816b7 checked on Mobbin: a Today | Upcoming switch under one pinned card.

### SHELL-IV02

**Rank open tasks and active deals first in search, and drop placeholder rows**

High · Fix · effort S · `Global search` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. The /api/search route is identical: no status filter, no template exclusion, no orderBy. 'insurance' returns the placeholder 'Store [Tenant] insurance' first, then 'TBD: Remove builder's risk insurance policy', 'add all insurance details' and others. Connor's open 'Store [philo] insurance' is not among the six. 'prospect' lists three Pass deals (337, 894 and 754 Prospect) among its six deal rows.
- **Today:** /api/search queries tasks and deals with no status filter, no template exclusion and no orderBy (src/app/api/search/route.ts:11-36). Searching 'insurance' returns 'Store [Tenant] insurance' (a placeholder row with no date or property), then two tasks whose pages read 'Completed'. The open, overdue 'Store [philo] insurance' assigned to Connor is not among the six. Searching 'prospect' lists three Pass deals among its six deal rows.
- **Why:** Search is the fastest way to a record. When the six slots go to finished or placeholder rows, the open work you're looking for is hidden, and there is no See all to recover it (SHELL-I10).
- **Change:** Spread excludeTemplateTasks into the task query. Order tasks open first, then by due date, then by most recently updated, and show a muted 'Done' on closed ones. Order deals with ACTIVE_DEAL_STATUSES first and Pass last. Properties stay first.
- **Desktop, tablet, phone:** Data only; the same at every width.
- **Reuse:** excludeTemplateTasks (src/lib/task-scope.ts), ACTIVE_DEAL_STATUSES (src/lib/config.ts), StatusBadge from the cutover build.
- **Code:** `src/app/api/search/route.ts:11-36`, `branch-src/src/app/api/search/route.ts:10-37`, `src/app/api/search/route.ts:11-15,41-42`
- **Also found as:** SHELL-009 (App shell, sidebar, top bar, global search and Home)
- **Verification:** verifier-found

### SHELL-007

**Show signed-in people a 404 inside the app shell, not the public site's**

Medium · Fix · effort S · `404 (/does-not-exist, signed in)` · A quiet shell with real search, navigation and sign-in

- **Today:** Signed in as Connor, /does-not-exist renders the public marketing 404: near-black page, public header with 'Rentals', 'Residents' and 'HG Login' links, and 'Back to the front page'. The sidebar, search and account are gone, and the console logs a 404 resource error. The file comment says it uses the public shell because it can't know whether the visitor is signed in.
- **Why:** A mistyped or stale link drops Connor out of the product into the marketing site and offers him a login he doesn't need. Coinbase and Height keep their shell around a not-found state.
- **Change:** Make src/app/not-found.tsx async (supported per node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md) and call getCurrentUser().
- Signed in: render the app version inside AppShell with simple line spot art, 'Page not found', the line 'Check the link, or search for what you need.', a Search button and 'Go to Home'.
- Signed out: keep the public version.
- **Desktop, tablet, phone:** Centered in the content area at all sizes. On phone 375 the two buttons stack full width.
- **Reuse:** AppShell, (app)/not-found.tsx, Button and LinkButton.
- **References:** 
  - [Sentry](https://mobbin.com/screens/e3120b61-b562-40b8-abed-11d257f5b937): Not-found state rendered inside the full app shell; sidebar and record header stay, the body says what to try.
  - [Coinbase](https://mobbin.com/screens/7484e648-c0ba-4ffa-888c-30c36d53ab32): Page not found inside the signed-in shell, line art and one button
  - [Height](https://mobbin.com/screens/bd98fbd3-903c-4b52-9a17-fd3ce92fc0ad): 'This object doesn't exist' with the sidebar still present
- **Code:** `src/app/not-found.tsx:5-26`, `src/app/not-found.tsx:5-25`
- **Also found as:** IA-041 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. Reproduced while signed in: the public 404 renders with Rentals, Residents and HG Login, and there is no app shell. Next's not-found.md:139 documents an async not-found. Evidence: verify-SHELL/404--desktop-light.png.

### SHELL-008

**Exclude template tasks from search, mark done tasks, and filter inactive contractors**

Medium · Fix · effort S · `Shell: search results` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /api/search is unchanged on the branch: no template exclusion, no status filter or order, no Done mark. Contacts are not filtered by active and are typed 'Vendor'. Probes return 'Store [Tenant] signed lease' and 'Upload signed [Tenant] lease to Baselane' for 'lease', which look like playbook placeholder rows, and 'Vendor: Device Check Contractor'.
- **Today:** This is true today, since route.ts has no template or status filter. But the approved migration spec already requires the taskScope helper (template exclusion) in /api/search, enforced by a test. Its activeTask helper replaces every literal status OPEN (spec section 5, landing Day 2, Sat Oct 24). The template part is scheduled work, not a new decision.
- **Why:** Search results should be things you can act on. Placeholder titles look like junk data, and a done task posing as open sends you to the wrong record.
- **Change:** In the task query, apply excludeTemplateTasks and order open before done (then by updatedAt). Show a gray 'Done' Badge on closed tasks. Filter contacts to active: true, or show an 'Inactive' Badge and sort those last.
- **Desktop, tablet, phone:** No layout change. On phone the Badge sits on the context line.
- **Reuse:** excludeTemplateTasks in src/lib/task-scope.ts; Badge in components/ui.tsx.
- **Code:** `src/app/api/search/route.ts:21-36`, `src/lib/task-scope.ts:9-11`, `branch src/app/api/search/route.ts:32-36,43-48`, `probe on :3300 /api/search?q=lease and ?q=Device`, `branch src/lib/task-scope.ts:9-11,28-40`, `src/app/api/search/route.ts:32`, `src/lib/task-scope.ts:9`, `branch:src/app/api/search/route.ts:32-36`, `branch:src/lib/task-scope.ts:9-11`
- **Also found as:** IA-I02 (Lens: information architecture and global SaaS patterns)
- **Verification:** partly. 'lease' returns 'Store [Tenant] signed lease' twice plus 'End lease in Baselane for [tenant]'. The new parts of this finding are the Done badge and ordering, and the Contact.active filter.

### SHELL-010

**Show a 'No matches' line and keep results steady while searching**

Medium · Fix · effort S · `Shell: search` · A quiet shell with real search, navigation and sign-in

- **Today:** Typing 'zzqxv' shows nothing under the field. The same nothing appears while a query is still fetching, and a single character does nothing at all. You can't tell 'no results' from 'still loading' from 'too short'.
- **Why:** Silence reads as broken. Plain's search tells you what can be searched, and Square's dropdown always ends with an 'All results' row.
- **Change:** - Two or more characters with zero hits: one muted row, 'No matches for “zzqxv”'.
- While a newer query is fetching: keep the previous results at 60% opacity.
- One character: show nothing.
- Empty palette: the Recent list from SHELL-002.
- **Desktop, tablet, phone:** Same row on desktop, tablet and the phone sheet.
- **Reuse:** src/components/global-search.tsx; the muted text style used in EmptyState.
- **References:** 
  - [Mercury](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445): No results found line in the same panel, with a useful fallback action under it.
  - [Plain](https://mobbin.com/flows/cd3de78d-7abb-4e26-abd5-3b62de929970): Empty search state that says what can be searched; grouped results after typing
  - [Square](https://mobbin.com/flows/5dfebd75-0cdd-4e01-b273-c811bd3d5414): Dropdown always shows an 'All results for' row with a Press ENTER hint
  - [Stripe](https://mobbin.com/screens/2b2d5f4f-bdd9-4186-b383-e3b30140a551): Zero-result copy names the query outcome instead of showing nothing
- **Code:** `src/components/global-search.tsx:48`
- **Also found as:** COPY-035 (Lens: words on every screen)
- **Verification:** confirmed. In the code, the dropdown renders only when results.length > 0 (global-search.tsx:48), so zero hits, loading and too-short all look the same. The Plain and Square flow refs fit.

### SHELL-011

**Cap the results dropdown height so rows below the screen are reachable**

Medium · Fix · effort S · `Shell: search` · A quiet shell with real search, navigation and sign-in

- **Today:** Fifteen results for 'prospect' make a 542px dropdown (bottom at y=591 of 800). The API allows 24 results (6 per type), about 860px. The dropdown is absolutely positioned inside the fixed header, so scrolling the page never brings the lower rows into view.
- **Why:** Results past the viewport can't be clicked at all. On a 667px phone this happens with 15 results.
- **Change:** Set max-height to min(60vh, 480px) with overflow-y auto. Show at most four rows per type, each type ending in a 'Show all 6 deals' row. Keep the highlighted row scrolled into view.
- **Desktop, tablet, phone:** Desktop and tablet as above. Phone: the full-screen sheet scrolls naturally (SHELL-005).
- **Reuse:** src/components/global-search.tsx.
- **Code:** `src/components/global-search.tsx:48-49`, `src/app/api/search/route.ts:14,19,30,35`
- **Verification:** confirmed. 'st' returns 21 rows. The dropdown's bottom sits at 807px in an 800px viewport and doesn't move when the page scrolls (verify-SHELL/search-st--st--desktop-light.png). Settle the per-type cap together with SHELL-002 (four vs five).

### SHELL-012

**Render search results as real links so ⌘-click and middle-click open new tabs**

Medium · Fix · effort S · `Shell: search results` · A quiet shell with real search, navigation and sign-in

- **Today:** Each result is a <button> that calls router.push and clears the query. You can't ⌘-click or middle-click a result into a new tab, there's no URL preview on hover, and opening one result wipes the query, so you can't come back to compare.
- **Why:** Working through several properties or deals side by side is routine. Web apps like Stripe and Linear keep results as links.
- **Change:** Render each option as a Next Link (React Aria ListBox items support href). Clear the query only on a plain Enter or click. Modified clicks leave the dropdown open.
- **Desktop, tablet, phone:** Desktop and tablet only; phones have no modified clicks.
- **Reuse:** src/components/global-search.tsx with next/link.
- **References:** 
  - [Mercury](https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2): Footer hint for opening a result in a new tab: results behave as links.
  - [Mercury](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445): Footer hints: arrows to Navigate, Enter to Open page, Cmd+Enter to Open in new tab.
- **Code:** `src/components/global-search.tsx:51-61`, `src/components/global-search.tsx:51-64`
- **Also found as:** IA-I05 (Lens: information architecture and global SaaS patterns)
- **Verification:** partly. The observation is right: results are buttons that call router.push and clear the query. For two partners, though, this is polish, and React Aria ListBox items with href give it for free during the SHELL-001 rebuild.

### SHELL-013

**Compute Home's greeting and 'today' in Eastern time, not the server's clock**

Medium · Fix · effort S · `Home (/)` · Fix wrong numbers and records first

- **Today:** This is true in code (page.tsx:115-118, dates.ts:64-66). But the approved spec already lists '"today" is computed in UTC' as a known gap, and schedules todayYmdEastern() for every server-side Today and Overdue comparison on Day 2 (Sat Oct 24). The only piece not covered is the greeting's getHours().
- **Why:** Wrong copy at the moment Connor checks the app at night, and false overdue flags undermine the list.
- **Change:** Add one helper in lib/dates, eastern(now), that returns the America/New_York hour and Ymd via Intl.DateTimeFormat with timeZone. Use it for the greeting and every 'today' comparison on Home. This is the same helper as the 'Eastern today' item on Day 2 of the migration plan.
- **Desktop, tablet, phone:** No visual change.
- **Reuse:** todayYmd, isPastDay and relativeDays in src/lib/dates.ts, extended with a timeZone parameter.
- **References:** 
  - [Mercury](https://mobbin.com/screens/d575358b-679b-4d52-aa98-5026970291b3): Home greets with 'Welcome, Sam', which sidesteps the clock and timezone problem entirely.
- **Code:** `src/app/(app)/page.tsx:46,84-89,115-118`, `src/lib/dates.ts:13-16,63-66`, `src/app/(app)/page.tsx:115-118`, `branch: src/app/(app)/page.tsx:91-93`, `vercel.json (no TZ)`, `src/lib/dates.ts:14-15`, `src/lib/dates.ts:14-16,64-67`, `src/app/(app)/page.tsx:46, 115-117`, `src/lib/dates.ts:14-16, 63-66`, `src/app/(app)/page.tsx:13 dynamic = 'force-dynamic'`, `src/app/(app)/page.tsx:115-118 greeting() uses new Date().getHours()`, `src/lib/dates.ts:14-16 ('UTC on Vercel')`, `vercel.json (deployed on Vercel)`, `src/app/(app)/page.tsx:46,115-118`, `src/lib/dates.ts:14-16 ("UTC on Vercel")`, `branch: src/app/(app)/page.tsx:43`, `branch: src/app/(app)/page.tsx:91-94`
- **Also found as:** SHELL-IV01 (App shell, sidebar, top bar, global search and Home), VISUAL-057 (Lens: visual design system across every screen), IA-042 (Lens: information architecture and global SaaS patterns), FEEL-041 (Lens: interaction quality, feedback, states, speed and accessibility), FEEL-V09 (Lens: interaction quality, feedback, states, speed and accessibility), COPY-I16 (Lens: words on every screen), JOURNEYS-043 (Lens: the core jobs, end to end), BCONTRACT-018 (Branch: contractors directory, portal access, Home and emails)
- **Verification:** partly. Keep only the greeting part. Everything else is scheduled.

### SHELL-016

**Remove the invisible pin and Sign out focus stops from the collapsed rail**

Medium · Fix · effort S · `Shell: sidebar keyboard order` · A quiet shell with real search, navigation and sign-in

- **Today:** Tab order on Home: wordmark, search, theme toggle, then 'Pin sidebar open' at opacity 0 (only pointer-events-none), then the nav. In the collapsed rail, 'Sign out' sits in a container 0px wide but is still tabbable (probe: parent width 0, tabIndex 0). Focus lands on controls you can't see.
- **Why:** Keyboard users lose track of focus twice per pass. WCAG 2.4.7 requires visible focus.
- **Change:** When collapsed, render the pin button and the name and Sign out block with the hidden attribute (or inert), or drop them with the SHELL-004 and SHELL-028 changes. Give every shell control a visible focus ring (ring-2 ring-primary/40).
- **Desktop, tablet, phone:** Desktop rail only. Tablet and phone unaffected.
- **Reuse:** src/components/app-shell.tsx.
- **References:** 
  - [Hootsuite](https://mobbin.com/screens/155a6fa5-52e6-466e-b3b3-6333eb747dd6): A collapsed icon rail whose bottom avatar opens a panel with Profile and Sign out: account actions are reached deliberately, never hidden in a clipped column.
- **Code:** `src/components/app-shell.tsx:134-144,168-182`, `src/components/app-shell.tsx:104-113`, `src/components/app-shell.tsx:166-181`
- **Also found as:** G2D-V01 (Staff sign-in lifecycle: sign out, a 30-day expiry mid-edit, changing a password, and passkeys)
- **Verification:** confirmed. Reproduced in the collapsed rail: Tab 4 lands on 'Pin sidebar open' at opacity 0. Tab 12 lands on 'Sign out', whose parent is 0px wide, and the focus is invisible (verify-SHELL/rail--tab12--desktop-light.png).

### SHELL-018

**Give every page its own tab title**

Medium · Fix · effort S · `Shell: browser tab titles` · A quiet shell with real search, navigation and sign-in

- **Today:** document.title is 'HG Capital OS' on /, /contractors, a deal, a property, /financials, /settings and the 404. Nothing under src/app/(app) exports metadata or generateMetadata.
- **Why:** With a deal, a property and a task open in three tabs, all three read the same, and browser history becomes a list of identical entries. Stripe and Linear name tabs after the record.
- **Change:** Root layout: metadata.title = { template: '%s · HG Capital', default: 'HG Capital' }. Add generateMetadata on detail pages ('767 Prospect Ave · HG Capital', 'Fix kitchen faucet · HG Capital') and static titles on list pages ('Tasks · HG Capital'). The 404 is 'Page not found · HG Capital'.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** src/app/layout.tsx metadata; shortAddress for property and deal titles.
- **References:** 
  - [Attio](https://mobbin.com/screens/734f2294-adaa-4abe-93b2-fcc6b0ff62d7): The export is named by object and view ('Companies, All Companies'), so the file says what it holds.
  - [Wise](https://mobbin.com/screens/3b7399b8-5690-4e88-b0c3-a2758ecb1568): The statement names itself ('SGD statement') with its period, the standard for a document that leaves.
- **Code:** `src/app/layout.tsx:9-12`, `src/app/layout.tsx:9`, `src/app/(app)/properties/page.tsx:1-8`, `src/app/(app)/properties/new/page.tsx:1-8`, `src/app/(app)/properties/[id]/page.tsx:39-58`, `src/app/layout.tsx:9-10`, `src/app/(app)/tasks/[id]/page.tsx:28`, `branch src/app/layout.tsx:9-12`, `branch src/app/(portal)/p/layout.tsx:4-7`, `branch src/app/(app)/tasks/[id]/page.tsx:25`, `Probe: document.title on all five routes equals 'HG Capital OS'`, `Probe on :3300: document.title 'HG Capital OS' on /settings, /settings/move-in-form, /settings/storage, /contractors, /contractors/cmtg25y9x000djphsbqty81fr, /tasks, /tasks/cmtg25yuf01zsjphs0xu5d2fl`, `branch src/app/(portal)/p/layout.tsx:5`, `branch src/app/(portal)/p/jobs/[id]/page.tsx:19`, `src/app/(app)/properties/[id]/page.tsx`, `src/app/(app)/tasks/page.tsx`, `src/app/layout.tsx:10`, `Shoot output: title 'HG Capital OS' on every route`, `probe: document.title on /properties/cmtg25y4p0006jphsv3frndk6 = 'HG Capital OS'; same on /tasks`, `grep 'export const metadata|generateMetadata' in src/app: only layout.tsx, login and (marketing) pages`, `load results for 24 app routes: title = "HG Capital OS" on every one`, `COPY/tasks.json ('title': 'HG Capital OS', same in every app route json)`, `src/app/layout.tsx:10 title: "HG Capital OS"`, `grep: no metadata or generateMetadata under src/app/(app)`, `Helper output for /tasks/cmtg25z7s048mjphsikewzpy1 and /properties/cmtg25y4p0006jphsv3frndk6: "title": "HG Capital OS"`, `src/app/layout.tsx:9-12 (the only title for signed-in pages)`, `grep: metadata is exported only by src/app/(marketing)/*/page.tsx and src/app/login/page.tsx; no page under src/app/(app) sets one`, `shoot.mjs output: title 'HG Capital OS' on /deals/cmtg25yd8002cjphs49ovlvob, /properties/cmtg25y4p0006jphsv3frndk6, /tasks/cmtg25z7s048mjphsikewzpy1 (main) and /tasks/cmvkij6p3909102ded572dc86 (branch)`, `branch grep: generateMetadata or metadata only in src/app/layout.tsx, (portal) and (marketing) pages`, `branch grep: metadata only in src/app/layout.tsx:10, login, (portal) and (marketing) pages`, `branch: src/app/layout.tsx:10`
- **Also found as:** SHELL-V07 (App shell, sidebar, top bar, global search and Home), PORTFOLIO-033 (Portfolio list and new property), PROPERTY-043 (Property detail page (future property hub)), DEALS-060 (Deals pipeline, new deal and deal detail), TASKS-042 (Tasks list, new task and task detail), ADMIN-047 (Contractors directory, contractor detail and Settings), VISUAL-V05 (Lens: visual design system across every screen), VISUAL-IV06 (Lens: visual design system across every screen), IA-013 (Lens: information architecture and global SaaS patterns), MOBILE-V03 (Lens: phone and tablet experience on every route), FEEL-020 (Lens: interaction quality, feedback, states, speed and accessibility), COPY-008 (Lens: words on every screen), COPY-IV05 (Lens: words on every screen), G1E-I01 (What leaves the app: printouts, PDFs and the Google listing), G2B-I18 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap), BTASKS-043 (Branch: Today, All tasks, new task and the task page)
- **Verification:** confirmed. The title is 'HG Capital OS' on /, /tasks, a property, a deal, /contractors, /properties and both 404s. No (app) route exports metadata.

### SHELL-023

**Move the 5-year CapEx forecast off Home; keep one 'CapEx due this year' row**

Medium · Design change · effort S · `Home (/)` · Home and Today become one work queue

- **Today:** The CapEx card is the largest block on Home. The property page has the same bar chart, but its table is per asset (Location, Asset, Age, Due, Cost), not the property-by-year matrix, so it is not 'the same chart and table' (verify-SHELL/404--property--desktop-light.png).
- **Why:** Five-year planning is a review job, not a daily one. Stripe keeps reports in Reporting and leaves Home for Today and the overview.
- **Change:** Move PortfolioCapexForecastCard to the top of Properties, or to a Financials tab. In Home's Coming up section, show one row while anything is due this year: 'CapEx due this year · $32,000 across 4 properties'. It links to the forecast.
- **Desktop, tablet, phone:** The row works the same everywhere. The full card keeps its current behavior on its new page (see SHELL-025 and SHELL-026 for touch).
- **Reuse:** PortfolioCapexForecastCard as is (app/(app)/portfolio-capex.tsx); the dueNowTotal and dueNowCount it already computes.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Home keeps Today and a compact overview; detailed reports live elsewhere
  - [Mercury](https://mobbin.com/screens/77963885-5965-4f86-81f8-32dbffe67dc9): Home sections are short summaries with View all into the full page
  - [Copilot](https://mobbin.com/screens/4e13cc80-a9e1-48b0-8882-c8857758acc5): Forward-looking obligations shown beside the figures they affect.
  - [Copilot Money](https://mobbin.com/screens/8edbc5d1-5e4d-4b8a-b916-c19f9558b6d4): Planning charts on the overview; dated upcoming items in a 'Next two weeks' list.
  - [Mercury](https://mobbin.com/flows/40884fc4-8db7-4c0a-afe6-8946f2c1e36e): Home leads with balance and actions; deeper analysis sits behind links
  - [Jobber](https://mobbin.com/screens/e4979820-6f4e-4695-a160-4c243602d36c): The field-team home opens with a greeting and today's visit card first. Planning sits further down.
  - [Stripe Dashboard](https://mobbin.com/screens/fba86a00-cfc6-43b3-af79-052679faa58e): The phone home leads with a compact 'Today' strip before longer reports.
- **Code:** `src/app/(app)/page.tsx:55`, `src/app/(app)/page.tsx:54-55`, `branch src/app/(app)/page.tsx:51-52`, `probe at 375: '5-year CapEx forecast@253', 'My open tasks@689'`, `src/app/(app)/page.tsx:48-92`, `probe at 375 on :3300: capex@253, My open tasks@689`, `branch src/app/(app)/page.tsx:51-72`
- **Also found as:** PORTFOLIO-029 (Portfolio list and new property), IA-022 (Lens: information architecture and global SaaS patterns), JOURNEYS-037 (Lens: the core jobs, end to end), MOBILE-V04 (Lens: phone and tablet experience on every route)
- **Verification:** partly. This overlaps SHELL-003, which already puts 'CapEx due this year' in Coming up. Merge the two so the decision is made once.

### SHELL-024

**Replace the three count cards with one strip of figures you act on**

Medium · Design change · effort S · `Home (/)` · Home and Today become one work queue

- **Today:** The three cards, the team-wide 193, the label wrap at 320 and the slab '1' are all confirmed (verify-SHELL/home--narrow-light.png). But Connor has 74 open tasks, of which 50 are overdue (the Tasks page shows 50 'yesterday' rows of 74), so 'Overdue 74' is wrong. If SHELL-003 ships, these cells repeat the section-header counts on the same page, which breaks the copy rule on restating counts.
- **Why:** Big tiles for numbers that never change are decoration. Stripe's iOS Today strip puts three live figures in one bordered row, and Jobber's overview counts by status.
- **Change:** One bordered strip split by hairlines, each cell linking to a filtered view: 'Overdue 74', 'Due this week 6', 'Active deals 13', and 'In review 0' once Review ships. Figures 24px semibold, labels 12px muted on one line. Drop 'Properties'.
- **Desktop, tablet, phone:** Desktop and tablet: four cells in one row. Phone 375: 2x2 grid in the same frame. At 320 the labels shorten to 'Overdue', 'This week', 'Deals', 'Review' so none wrap.
- **Reuse:** Card (one instance), Kpi styling from app/(app)/financials/_components/ui.tsx.
- **References:** 
  - [Jobber](https://mobbin.com/screens/020cee8e-7bb3-4e9a-a26d-0de6f61b06bb): Workflow strip: each stage has a count, a state word and sub-states such as Requires invoicing.
  - [Mercury](https://mobbin.com/screens/bd9f86e7-9ef2-4745-91b8-10d3fdad2ced): Three tiles that pair a count with its dollar total: Total outstanding, Overdue, Due in next 7 days.
  - [Stripe Dashboard](https://mobbin.com/screens/e345975a-5113-4ffd-8b71-1abc1481379e): 'Today' strip: three figures in one bordered row
  - [Jobber](https://mobbin.com/screens/a6fb2d6f-b990-48c4-91c0-9a4dac929ea4): Overview counts by status (New, Overdue, Unscheduled) that link into the list
  - [Linear](https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb): The only count is the Inbox badge in the sidebar.
  - [Stripe](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13): Counts sit on status filters (All 6, Failed 3), not in standalone cards.
  - [Mercury](https://mobbin.com/flows/1d51be38-aff7-4a34-835d-8c50f89f4fd5): Home Bill Pay card: Outstanding / Overdue / Due soon counts
  - [Stripe](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3): Home leads with today's figures and what's available now
  - [Mercury](https://mobbin.com/flows/fd8c08f3-1587-47b6-931c-2b1eb563592a): Move money hub lists queues as full-width rows with a line icon, a name and a count sublabel (Needs approval, 0 payments; Scheduled, 1 payment), which say what each number means and tap cleanly.
  - [Stripe Dashboard](https://mobbin.com/screens/fba86a00-cfc6-43b3-af79-052679faa58e): 'Today' strip: Gross volume, Payments, Customers in one card
- **Code:** `src/app/(app)/page.tsx:48-52,102-113`, `src/app/(app)/page.tsx:48-52`, `src/app/(app)/page.tsx:46-52`
- **Also found as:** IA-021 (Lens: information architecture and global SaaS patterns), JOURNEYS-036 (Lens: the core jobs, end to end), DATA-046 (Lens: tables, numbers, money, charts and status), MOBILE-041 (Lens: phone and tablet experience on every route)
- **Verification:** partly. If SHELL-003 ships, dropping the cards entirely is simpler than restyling them, as on Stripe's Home.

### SHELL-025

**On touch, show each CapEx cell's breakdown in a bottom sheet**

Medium · Design change · effort S · `CapEx forecast card (Home today, Properties later)` · The phone is a chosen subset, and touch has no hover

- **Today:** Cell breakdowns open only on mouseenter. On a phone, a tap triggers it: the 336px tooltip covers the bar chart and stays until you tap somewhere else. It's pointer-events-none, so tapping it does nothing. The cells use cursor-help, which touch can't show.
- **Why:** House rule: 'anything a tooltip carries still needs a tap on touch'. A sticky overlay over the chart is broken behavior, not a tap path.
- **Change:** Keep hover on desktop (150ms delay). On touch, tapping a cell opens a bottom sheet:
- title: '767 Prospect Avenue · 2026'
- rows: asset · unit with the cost right-aligned
- a total row
- an 'Open property' button

It closes with drag-down, the close button or Esc.
- **Desktop, tablet, phone:** Desktop 1280: hover popover. Tablet 768 and phone 375: bottom sheet, 60% height max.
- **Reuse:** components/tooltip.tsx (Known gap: tap path); React Aria Popover and Modal sheet.
- **References:** 
  - [Stripe Dashboard](https://mobbin.com/screens/8113ccdd-0eac-4bb5-9731-55cf00a433a1): Bottom sheet that opens with label and value rows, then sections.
  - [Stripe Dashboard](https://mobbin.com/screens/51b576a6-2ec6-4a8d-ae2f-0695dc005336): Sheet list ends with View all and the total count.
  - [Freenow](https://mobbin.com/screens/6c1a03c6-2ab8-4bc6-8cbf-cda73388e522): Breakdown sheet: close button, total, line items with right-aligned amounts
  - [Urban Company](https://mobbin.com/screens/a8b7cb27-b0fd-4420-9cdb-4467fb51ace5): Summary bottom sheet with line items and a total row
- **Code:** `src/app/(app)/portfolio-capex.tsx:45-67,208-213,292-299`
- **Verification:** confirmed. Reproduced at 375: tapping a cell opens the 336px panel over the chart, and it closes only when you tap elsewhere (verify-SHELL/mtap--tap-cell--mobile-light.png). The card uses its own fixed tooltip, not components/tooltip.tsx. The fix is a chance to consolidate onto the shared Tooltip with a tap path, per 'Don't add another copy'.

### SHELL-027

**Run the sidebar full height with the HG mark on top, and align search with the content**

Medium · Design change · effort M · `Shell: layout frame` · A quiet shell with real search, navigation and sign-in

- **Today:** A full-width 56px header holds the 'HG Capital OS' wordmark at x=16 and a 448px search at x=118. The sidebar starts below it. Page content starts at x=96 with the rail, x=264 pinned, and x=416 at 1920. The wordmark, search and page content never share a left edge. The header's right side holds only the theme toggle.
- **Why:** House rule: 'Things that should line up, line up exactly.' Linear, Attio and Vercel give the sidebar the full height, with the workspace name and search on top; content then starts at one consistent edge.
- **Change:** Sidebar from top to bottom:
- HG mark, 'HG Capital' and the collapse toggle
- Search (⌘K) and New
- the nav
- avatar row at the bottom

Remove the desktop header. Each page's PageHeader row becomes the top of the content, inset 32px from the sidebar.
- **Desktop, tablet, phone:** Desktop 1280: as above. Tablet 768 and phone 375: a 48px top bar with the page title on the left and a search icon and avatar on the right, plus the bottom bar (SHELL-006).
- **Reuse:** src/components/app-shell.tsx, PageHeader in components/ui.tsx, and the icon from SHELL-019.
- **References:** 
  - [Linear](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab): Workspace name, search and compose at the top of a full-height sidebar
  - [Attio](https://mobbin.com/screens/d540b3e0-e79c-4e09-afb2-c6b19d117ebe): Workspace, Quick actions ⌘K and search in the sidebar header; content has its own title row
  - [Vercel](https://mobbin.com/screens/2017378e-39db-43ce-b33b-3b193543472f): 'Find…' field with a shortcut key inside the sidebar
- **Code:** `src/components/app-shell.tsx:63-92,187-195`
- **Verification:** confirmed. Measured: wordmark at x=16, search at x=118, content at x=96 (rail) and x=416 (1920). Stripe and Mercury web keep a top bar but align its search with the content edge over a full-height sidebar (https://mobbin.com/screens/e8ddbdc5-bc89-454f-9ebb-846905b83df4, https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1). That is a lighter option than removing the header, and Connor should see both.

### SHELL-030

**List the 11 properties under Properties in the sidebar (D10), with a muted count of open items**

Medium · New capability · effort M · `Shell: sidebar` · A quiet shell with real search, navigation and sign-in

- **Today:** The list itself is settled in D10. A property is two clicks from the shell (Portfolio, then the row) or one search away, not three steps. Per-row overdue counts would put a number on most of the 11 rows today (50 of Connor's tasks alone are overdue), which adds clutter against the simplicity bar. Ship the plain list first.
- **Why:** Each property is the hub that daily work hangs off. Mercury bookmarks accounts in the sidebar, and Linear and Attio keep favorites one click away.
- **Change:** Under Properties, a collapsible group of short addresses ('767 Prospect', '58 Mariner'), sorted by address. Each row has a right-aligned muted count of overdue tasks, shown only when above zero. A count, not a dot, so it doesn't collide with the house rule that a dot means new. The current property is highlighted. Past 12 properties, the group ends with 'All properties'. The group hides in the collapsed rail.
- **Desktop, tablet, phone:** Desktop 1280: in the sidebar. Tablet and phone: the Properties tab shows the same list as its landing page.
- **Reuse:** SideNav in components/nav.tsx, shortAddress, and the Prisma task count by property.
- **References:** 
  - [Mercury](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2): Bookmarks section listing individual accounts in the sidebar
  - [Linear](https://mobbin.com/screens/51c2bd60-f22d-4879-8c28-c5800ac1f4b6): Favorites group with individual projects
  - [Attio](https://mobbin.com/screens/f6750bef-6bce-435c-8460-3c55f32f1254): Favorites and Records groups as collapsible sidebar sections
- **Code:** `src/components/nav.tsx:81-124`
- **Verification:** partly. Mercury web lists bookmarked accounts in the sidebar (https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1), which supports the plain list.

### SHELL-032

**Show a muted count on Tasks for items due or overdue for you**

Medium · New capability · effort S · `Shell: sidebar` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. No nav item carries a count. Tasks in the sidebar and the phone drawer is a bare link. Home's Mine data shows Connor with overdue work back to Aug 28 and 34 unassigned.
- **Today:** No nav item carries a count. With 74 open tasks assigned to Connor and every one on Home overdue, the shell gives no signal on any other page.
- **Why:** Todoist, Mercury and Attio show a small count on Today or Tasks. It's the lightest possible 'needs you' cue and works on every page.
- **Change:** A right-aligned muted number on the Tasks item: overdue plus due today plus In review, for the signed-in user, capped at '99+'. Neutral gray, not red, because status colors are reserved for Badge.
- **Desktop, tablet, phone:** Desktop: in the sidebar row. Collapsed rail: a small number at the icon's bottom right. Phone and tablet: a count on the Tasks tab in the bottom bar.
- **Reuse:** SideNav in components/nav.tsx; the count query the Tasks page already runs (tasks/page.tsx:111).
- **References:** 
  - [Mercury](https://mobbin.com/screens/f460f92e-4dab-437c-8c52-d0a1cc108e27): Tasks item in the sidebar carries a plain muted count of items needing action.
  - [Linear](https://mobbin.com/screens/0729ffee-bd71-4cde-8baf-0706ae712d26): Badge style is a deliberate choice: Count or Dot.
  - [Todoist](https://mobbin.com/screens/e80e5692-9bdd-41ac-81df-25e8dd7e104a): 'Today 4' count on the sidebar item
  - [Mercury](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2): 'Tasks 1' muted count in the sidebar
- **Code:** `src/components/nav.tsx:91-122`, `branch src/components/nav.tsx:91-121`, `branch src/lib/task-scope.ts:62-66`
- **Verification:** confirmed. Mercury web shows a muted 'Tasks 1' count (https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1). Caveat: the count would read about 50 today, so it only earns its place once the backlog is cleared.

### SHELL-043

**Shorten the error message to one line and drop the 'changes are safe' promise**

Medium · Fix · effort S · `Error boundary (every signed-in page)` · Every save is safe, instant and undoable

- **Today:** The current copy and its two-line wrap are confirmed. But per the file's own comment, this boundary also catches failed server actions, so the proposed 'This page didn't load' would be wrong for those.
- **Why:** Copy rules: one line, no promises we can't back up.
- **Change:** Heading: 'Something went wrong'. One line: 'This page didn't load. Try again, or reload if it keeps happening.' Keep the Try again and Reload buttons and the digest reference in mono.
- **Desktop, tablet, phone:** Wraps naturally on phone. Buttons stay in one row.
- **Reuse:** src/app/(app)/error.tsx.
- **Code:** `src/app/(app)/error.tsx:28-31`, `src/app/(app)/error.tsx:25-41`
- **Also found as:** COPY-054 (Lens: words on every screen)
- **Verification:** partly. Use one neutral line instead, such as 'That didn't work. Try again, or reload if it keeps happening.'

### SHELL-048

**Amend the type rule to Geist with tabular figures for money, keeping Geist Mono for IDs**

Medium · Design change · effort S · `Shell-wide figures` · Money, numbers and dates read one way

- **Today:** The house rule says Geist Mono for figures. In practice font-mono appears in 4 places and tabular-nums in 61; Home's figures are Geist with tabular-nums, whose serifed tabular 1 reads like a typewriter at 24px ('11', '193').
- **Why:** Stripe and Mercury set money in their proportional sans with tabular alignment, not monospace. Mono at headline sizes looks technical rather than premium. The codebase already behaves this way, so the rule and the code disagree.
- **Change:** Rewrite the rule: Geist with tabular-nums (and ss or cv alternates for a plain 1, where Geist offers one) for amounts and counts; Geist Mono only for IDs, digests and codes. Apply it in Kpi and the Home strip.
- **Desktop, tablet, phone:** All sizes.
- **Reuse:** CLAUDE.md Personality section; Kpi in financials/_components/ui.tsx.
- **Challenges:** House rule (CLAUDE.md Personality): 'Geist for text and Geist Mono for figures'
- **References:** 
  - [Stripe](https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888): Amounts in the UI sans with aligned figures
  - [Mercury](https://mobbin.com/screens/d7aa120c-c488-4f38-bf61-78460910320d): Balance '$1,992.04' in sans with superscript cents, no mono
  - [Vercel](https://mobbin.com/screens/b313e291-3869-43a6-9125-d98cf9f3ccb8): Geist Mono only for the branch name; everything else Geist Sans.
  - [Mercury](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2): Balance set in the sans with smaller cents.
  - [Stripe](https://mobbin.com/screens/f8db8469-2830-4c6b-98ca-53bf4c1e3caf): IDs and fingerprints in mono; amounts and labels in the sans
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Customer ID in mono in the Details rail; money in the sans
- **Code:** `src/app/(app)/page.tsx:107`, `Computed style of the Home KPI: Geist, tabular-nums`
- **Also found as:** VISUAL-017 (Lens: visual design system across every screen), DATA-027 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. conflicts_with is named correctly. tabular-nums appears 61 times and font-mono 4. The slab '1' is visible on Home's 11 and 193. Stripe 673e89af shows amounts in its sans. Whether Geist ships a plain-1 alternate is unverified, but the rule-versus-code mismatch stands either way.

### SHELL-052

**Add G-then-letter navigation shortcuts and a '?' shortcuts sheet**

Medium · New capability · effort S · `Shell: keyboard` · A quiet shell with real search, navigation and sign-in

- **Today:** There are no shortcuts beyond what the browser provides.
- **Why:** Attio lists 'Go to tasks page: G then T'. Stripe puts Keyboard shortcuts in its help menu. For two daily users these save real time and add no chrome.
- **Change:** Shortcuts: G H Home, G T Tasks, G P Properties, G D Deals, G F Financials, G C Contractors; C for New task; ⌘K search; '?' opens a shortcuts sheet, also listed in the account menu. Disabled while typing in a field.
- **Desktop, tablet, phone:** Desktop and tablet with a keyboard; not shown on phone.
- **Reuse:** A new hook in src/lib or components next to the command palette (SHELL-002).
- **References:** 
  - [Mercury](https://mobbin.com/screens/2f9852a0-c8d6-48b3-95c5-43c044bac813): Searchable shortcuts sheet grouped by area, every command with keycaps.
  - [Attio](https://mobbin.com/screens/fa567c5a-616d-4991-88fc-e2a047b5fcfd): Keyboard shortcuts panel with 'G then T' style navigation
  - [Stripe](https://mobbin.com/screens/4c519c10-e838-4c74-9d04-9af674338446): Keyboard shortcuts entry in the help menu
  - [Superhuman Mail](https://mobbin.com/screens/68b22cd4-b6ef-48ee-a6a9-592e1c460570): When a command runs from the palette, a small note shows its key for next time ('G then E'), teaching shortcuts without a tutorial.
  - [Superhuman Mail](https://mobbin.com/screens/3ae6bf95-6bbd-4232-b045-3160b748393c): The shortcut list opens as a side panel grouped by Actions, Navigation and Conversations, and stays open while you work instead of blocking the page.
  - [Linear](https://mobbin.com/flows/239089b5-97e5-4698-af22-ae79d337538c): Searchable shortcuts panel with G-then navigation.
  - [Stripe](https://mobbin.com/screens/0bc4fa17-a5de-4af7-a8f6-3fd5f45a1a7e): 'N' key badge on the 'Create pricing table' button.
  - [Linear](https://mobbin.com/screens/287d9435-e8b9-497f-a632-9bdbd827414c): 'Create your first issue by pressing c' and 'Learn the keyboard commands by pressing ?'.
  - [Linear](https://mobbin.com/screens/14daab5b-7872-456a-8c5a-94f3d9d03a48): Two-key navigation printed in the menu: Settings 'G then S', Switch workspace 'O then W'.
  - [Superhuman Mail](https://mobbin.com/screens/9ca8bf8c-42da-419c-a947-845037e5f17a): One-time tip after a mouse search: 'Next time, hit / to search instantly!'.
- **Code:** `src/components/app-shell.tsx:36-49`, `grep: only keydown listener is src/components/app-shell.tsx:42`, `src/components/app-shell.tsx:36-48 (only key handler: Escape for the drawer)`, `src/components/global-search.tsx:37-50 (no key binding)`
- **Also found as:** IA-035 (Lens: information architecture and global SaaS patterns), FEEL-I04 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Linear's menu shows 'G then S' and 'G then W' hints (https://mobbin.com/screens/e8fe60b4-6db4-4485-99b8-3395d69ea7db), and Mercury web has a shortcuts popover (https://mobbin.com/screens/f3cc6753-dc1c-49ec-babb-99599b85f605).

### SHELL-I02

**Pin one needs-action card above Home's list, starting with a stale QuickBooks sync**

Medium · New capability · effort S · `Home and sidebar` · Home and Today become one work queue

- **Today:** Home, the sidebar and the Financials nav item show nothing about QuickBooks health. Financials > Overview does show 'synced 51d ago' and a reconciliation warning in its source line, and only an EXPIRED connection is limited to Financials > Settings.
- **Why:** A read-only P&L mirror is only trusted when it is fresh. Airbnb pins the single blocking item above Today, Vercel pins Action Required in its sidebar, and Stripe stamps every card with its update time. Silent staleness is the worst failure for a mirror.
- **Change:** One card slot at the top of Home that shows at most one item, by priority: QuickBooks expired or not synced in 48 hours ("QuickBooks hasn't synced since Sep 2." with a Refresh button), QuickBooks reconnect due within 30 days ("Reconnect QuickBooks before Dec 12"), then the email-cap notice from the cutover defaults. Line icon, one sentence, one button. No card when nothing blocks. The Financials nav item gets a dot while it shows.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: full-width card above the lists, one line. Phone 375: docks above the bottom bar as Airbnb does, one line, tap opens the fix. Nothing drops.
- **Reuse:** Card, LinkButton, SourceBadge data in financials/_components/ui.tsx, the refresh action in financials/_components/refresh-button.tsx.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32): One pinned card (Confirm a few key details, Required to publish) above Today.
  - [Airbnb](https://mobbin.com/screens/8249f9ca-1fdc-4f97-870f-974d6811a36c): On phones the same card docks just above the tab bar.
  - [Vercel](https://mobbin.com/screens/c54df5c8-f72c-406e-bb92-a9a6b116f0a5): Action Required card with one button, shown only when something needs it.
  - [Stripe](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b): Every home card carries an Updated time as its trust signal.
  - [Vercel](https://mobbin.com/screens/abbadfbe-0db6-453b-b9bc-ccb7ce2d60ed): A single 'Action Required' card appears in the sidebar footer only while something blocks, with one button to fix it, and is visible from every page.
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): One pinned card names the only blocker ('Confirm a few key details · Required to publish') instead of a banner stack.
  - [Deel](https://mobbin.com/screens/6bd4989c-7a50-413e-be7e-e955b2394a29): Overdue and pending items as rows with one action each.
  - [Mercury](https://mobbin.com/screens/e1b077a6-331f-4632-a1c9-1c205607fa8f): '1 receipt needs attention' banner that appears only when needed.
- **Code:** `src/app/(app)/financials/settings/page.tsx:76-92`, `prisma/schema.prisma:365-369`, `src/app/(app)/financials/settings/page.tsx:88-95`
- **Also found as:** IA-031 (Lens: information architecture and global SaaS patterns)
- **Verification:** partly. Financials > Overview already shows 'QuickBooks Cash basis · synced 51d ago' and an amber 'last sync didn't reconcile' banner (verify-SHELL/fin--desktop-light.png, financials/_components/ui.tsx:109). Only EXPIRED status is limited to Settings (settings/page.tsx:77). The 51-day gap reflects the local DB's Sep 2 snapshot, and production freshness is unknown, so 'seven weeks stale' overstates the urgency. Drop the dot on the Financials nav item: the house rule reserves a dot for new or unread. Airbnb d6c816b7 checked on Mobbin (one pinned 'Required to publish' card). My Vercel search did not return c54df5c8; the URL looks real.

### SHELL-I06

**On phones, show each Home task's property as a gray second line instead of hiding it**

Medium · Design change · effort S · `Home task rows at phone width` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Half done: the two-line phone row exists in task-row.tsx but Home doesn't use it.
- **Today:** Today and All rows (shared TaskRow) already put the property as a gray second line under the title on phones ('Mud Drywall' over '767 Prospect Avenue'). Home's card still uses MyTasksList, which hides the property below 640px: at 375 the rows read 'pest issue (Nick)  Aug 28', 'Upload signed [428] lease to Bas…  Aug 28' with no address, though the desktop row shows '647 Prospect Ave.'.
- **Why:** Things 3 puts the parent project as a gray sublabel under each title so context survives on a phone, and the cutover spec already asks for two-line rows on Today. HG task titles often leave out the address.
- **Change:** Render Home's card with the shared TaskRow (title, then the gray property line on phones, date chip on the first line) instead of MyTasksList. Moot if SHELL-I01 folds Home into Today.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: unchanged single line with the property in a right column. Phone 375: two lines; nothing drops.
- **Reuse:** my-tasks-list.tsx and task-row.tsx in the cutover build; shortAddress.
- **References:** 
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): Gray parent sublabel under each to-do title.
  - [Linear Mobile](https://mobbin.com/screens/652dac8a-d883-4034-8811-0956e4c0ef38): Context line in small gray type sits with every row.
  - [Linear Mobile](https://mobbin.com/screens/f688fc71-2060-49c2-be67-bc6ab5e53bee): Inbox rows with a title and a muted context line with time
  - [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9): Rows grouped under day headers instead of colouring each row
- **Code:** `src/app/(app)/page.tsx:79`, `branch: src/app/(app)/tasks/my-tasks-list.tsx:22`, `branch-src/src/app/(app)/tasks/my-tasks-list.tsx:21-25 (property link 'hidden … sm:block')`, `branch-src/src/app/(app)/tasks/task-row.tsx:103-117 (place line on phones)`, `src/app/(app)/page.tsx:70-92`, `branch src/app/(app)/tasks/my-tasks-list.tsx:17-28`, `branch src/app/(app)/page.tsx:67-69`
- **Also found as:** MOBILE-029 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. Confirmed at 375: no row shows its property (verify-SHELL/home--scrolled--mobile-light.png), because of page.tsx:79's 'hidden sm:block'. The cutover my-tasks-list.tsx:22 keeps the same class, while the cutover task-row.tsx already has a two-line phone layout, so the fix is to reuse TaskRow on Home. Things 3 gray-sublabel rows checked on Mobbin.

### SHELL-I09

**Mark rows someone else changed since you last looked with a dot and who did it**

Medium · New capability · effort M · `Home rows and Tasks nav` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Staff screens have no change signal: no dot, badge or 'new' line on Home, Today, All or the nav. TaskReadState is used only for contractors. The portal upserts it when a contractor opens a job and uses it to find updates newer than lastSeenAt. Nothing on the staff side writes or reads it.
- **Today:** Today's shell has no in-app change signal. The cutover schema already has TaskReadState (per user and per contact, with lastSeenAt), and the plan lists an in-app 'new from contractors' list and unread badges for week 2 after cutover. The new table this finding asks for already exists.
- **Why:** Linear marks unread items with a blue dot and a one-line who-did-what, and Ramp folds notifications into the home list instead of a separate bell. HG's house rule already reserves a dot for new or unread.
- **Change:** No bell. A 6px blue dot at the row's leading edge plus a muted line ("Zack added 3 photos · 2h") when the latest event on that task was by someone else after your last view of it. Opening the task clears it. Tracked per person, so one partner's reading never clears the other's.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: dot plus the actor line under the title. Phone 375: dot, and the second line reads "767 Prospect · Zack added 3 photos".
- **Reuse:** TaskEvent and activity-timeline.tsx from the cutover build; needs a per-user last-viewed record (new table).
- **References:** 
  - [Linear](https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb): Unread dots on rows and a live count beside Inbox.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Row line names who commented, with an unread dot.
  - [Jobber](https://mobbin.com/screens/26563ea4-1b26-4a35-8c59-f9e8aab7de5c): Each event says who did what on which job.
- **Code:** `src/components/app-shell.tsx:63-92`, `asana-migration-plan.md D6b, D20 (contractor updates email both partners)`, `branch-src/src/lib/portal/jobs.ts:60-71 (contractor read state upsert)`, `branch-src/src/lib/portal/queries.ts:131-135 (contractor 'new since last seen' join)`, `grep of branch-src/src/app/(app), src/components, src/lib/tasks for readState/lastSeen/unread: no staff use`
- **Verification:** partly. The no-bell, dot-on-the-row design fits the house rule that a dot means new or unread. Present it as the design of the already planned feature, not a new capability. Linear 18c6955a checked on Mobbin (unread dots with a count beside Inbox).

### SHELL-I10

**End each search group with See all N that opens the filtered list**

Medium · New capability · effort S · `Global search` · A quiet shell with real search, navigation and sign-in

- **Today:** /api/search returns at most 6 rows per type and no total. Typing "insurance" shows six task rows and nothing more, while /tasks?q=insurance lists 9 open ones. There is no path from the dropdown to the full set.
- **Why:** Mercury's palette leads with View results on the Transactions page and offers Search all transactions for the query. With 2,086 tasks and 675 deals, six rows is a preview, not an answer.
- **Change:** Return a count per type. When it exceeds the rows shown, end that group with "See all 14 tasks" linking /tasks?q=… (or /deals?q=…). Arrow keys and Enter treat it like any other row.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: last row of the group. Phone 375: same row in the full-screen sheet, 44px tall.
- **Reuse:** GlobalSearch; the q filters already in tasks/page.tsx and deals/page.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6): View results on the Transactions page, plus Search all transactions for the query.
  - [Mercury](https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2): Result rows and the footer share one keyboard model.
- **Code:** `src/app/api/search/route.ts:14-35`, `src/app/(app)/tasks/page.tsx:85`, `src/app/(app)/deals/page.tsx:60`, `src/app/api/search/route.ts:14`, `src/app/api/search/route.ts:35`
- **Also found as:** IA-I04 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. Confirmed: at most 6 rows per type and no count (route.ts:10-37). It's worse than stated. The six 'insurance' tasks include a '[Tenant]' placeholder and two Completed tasks, and the open 'Store [philo] insurance' isn't among them (SHELL-V02). 'Arrow keys and Enter treat it like any other row' assumes a keyboard model that doesn't exist (SHELL-V05). The phone 'full-screen sheet' doesn't exist either (SHELL-V04). Mercury 980f79d4 checked on Mobbin: 'View results on the Transactions Page' and 'Search all transactions for "Google"'.

### SHELL-031

**Add one New button in the shell for Task, Deal and Contractor**

Low · New capability · effort S · `Shell: global create` · Create where you are

- **Migration branch:** Still applies on the migration branch. The shell has no New button. Creating a task still goes through /tasks/new, from the Tasks header '+ New task' or the property card's '+ Task'. Deal pages have no task entry. The property card also gained 'Apply playbook'.
- **Today:** Property pages already have a '+ Task' button that pre-fills the property (properties/[id]/page.tsx:170). Deal pages and the shell have none, and both paths leave the page for /tasks/new.
- **Why:** Stripe has a + in its top bar, Linear a compose icon in the sidebar header, Attio Quick actions and Mercury a 'Move Money' button. Capture should happen wherever you are.
- **Change:** A 'New' button under Search in the sidebar header opens a menu: Task, Deal, Contractor. The 'C' key opens New task. When you're on a property or deal page, the new task pre-fills that record.
- **Desktop, tablet, phone:** Desktop: the sidebar header. Tablet and phone: a + in the top bar beside search, opening the same menu as a sheet.
- **Reuse:** The existing new-task form under app/(app)/tasks, React Aria Menu, and Button.
- **References:** 
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): One add button in the same bottom-right thumb spot on every phone screen.
  - [Linear Mobile](https://mobbin.com/screens/37137a91-09bd-4d3d-af38-e993f9841d2d): Create menu lists the record types, opened from the screen you are on.
  - [Linear](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab): Compose icon beside search in the sidebar header
  - [Mercury](https://mobbin.com/screens/dbbf7fd1-24e8-4494-9c0c-27007652c7e5): Primary create menu in the top bar next to search
  - [Stripe](https://mobbin.com/screens/1e21365d-55d1-479d-b79a-b006622d050b): + create button at the top right of the dashboard
- **Code:** `src/components/app-shell.tsx:63-92`, `branch src/components/app-shell.tsx:62-92`, `branch src/app/(app)/tasks/tasks-header.tsx:11`, `branch src/app/(app)/properties/[id]/page.tsx:183-188`
- **Verification:** partly. Stripe's + create in the top bar is visible at https://mobbin.com/screens/e8ddbdc5-bc89-454f-9ebb-846905b83df4. The 'C' shortcut overlaps SHELL-052.

### SHELL-035

**Cancel stale search requests so older results can't overwrite newer ones**

Low · Fix · effort S · `Shell: search` · A quiet shell with real search, navigation and sign-in

- **Today:** Each keystroke schedules a fetch after 180ms with no AbortController. A slow response for 'pro' that lands after the one for 'prospect' replaces the newer results.
- **Why:** Results can flip back to an earlier query on slow networks.
- **Change:** Abort the previous fetch in the effect cleanup, or tag each response with its query and ignore any that no longer match the input.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** src/components/global-search.tsx:15-26.
- **Code:** `src/components/global-search.tsx:15-26`
- **Verification:** confirmed. The effect cleanup only clears the timeout, with no abort and no stale-query check.

### SHELL-037

**Shorten the search placeholder to 'Search' and show the ⌘K chip**

Low · Fix · effort S · `Shell: search field` · A quiet shell with real search, navigation and sign-in

- **Today:** The truncation is confirmed: 'Search addresses, vend' at 375 and 'Search addresse' at 320. The ⌘K chip duplicates SHELL-002, and the 'vendors' wording duplicates SHELL-036. The only standalone change is shortening the placeholder.
- **Why:** Copy rules: one line and no restating. Mercury and Vercel use a short 'Search…' or 'Find…' plus a shortcut chip.
- **Change:** Placeholder: 'Search'. On desktop, a right-aligned '⌘K' chip in the field or button. On phone the field becomes an icon (SHELL-005).
- **Desktop, tablet, phone:** Desktop and tablet: 'Search' plus ⌘K. Phone: icon only.
- **Reuse:** src/components/global-search.tsx.
- **References:** 
  - [Vercel](https://mobbin.com/screens/a8d666ee-3303-4b28-9e1f-06b8dbd63cb6): Sidebar Find field labeled in one word with its key hint.
  - [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a): Quick actions with a ⌘K chip and a search icon with a slash hint.
- **Code:** `src/components/global-search.tsx:45`
- **Verification:** partly. Fold this into SHELL-002 and SHELL-036.

### SHELL-041

**Use the house palette hex values on the root 404**

Low · Fix · effort S · `404 (public)` · One design system, fixed in the primitives

- **Today:** The root 404 uses the same bg-[#080b12] and text-[#f2f4f7] as (marketing)/layout.tsx:12 and login/page.tsx:18, so there is no seam between the 404 and other public pages. The drift from the documented #08090b and #e8eaee is site-wide; only the welcome hero and the button text use #08090b.
- **Why:** Two near-identical blacks across public pages show as a seam when navigating, and the house rule pins exact values.
- **Change:** Swap to #08090b and #e8eaee. Better, pull them from a shared public token so pages can't drift.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** src/app/not-found.tsx; the 'Public site kit' item under Known gaps.
- **Code:** `src/app/not-found.tsx:8`
- **Verification:** partly. Move this to the public-site unit as one shared token change.

### SHELL-042

**Make the in-app 'Not found' state name the record and offer one way back**

Low · Design change · effort S · `In-app not found (/properties/nope123)` · A quiet shell with real search, navigation and sign-in

- **Today:** A missing record shows a small card titled 'Not found', the line 'That record doesn't exist, or the link is out of date.', and a row of four links (Home, Deals, Portfolio, Tasks), missing Financials and Vendors.
- **Why:** Four equal links aren't a next step. Height and Coinbase show one clear state with one button.
- **Change:** No card. Centered line spot art, a heading per section ('This property isn't here'), one line ('It may have been removed or the link is old.'), a primary 'Back to Properties' and a secondary Search button.
- **Desktop, tablet, phone:** Centered on all sizes; buttons stack on phone.
- **Reuse:** src/app/(app)/not-found.tsx (it can read the segment through a small client child using usePathname), Button and LinkButton.
- **References:** 
  - [Sentry](https://mobbin.com/screens/e3120b61-b562-40b8-abed-11d257f5b937): Names what could not be found and offers concrete next steps in one short block.
  - [Height](https://mobbin.com/screens/bd98fbd3-903c-4b52-9a17-fd3ce92fc0ad): 'This object doesn't exist' with one action
  - [Coinbase](https://mobbin.com/screens/7484e648-c0ba-4ffa-888c-30c36d53ab32): Spot art, one line and one return button
  - [Asana](https://mobbin.com/screens/36cb9092-004d-4cfa-abc7-930e4a7ff931): "Looks like project \"Product Demo - A\" was deleted." with a single primary action.
  - [Shopify](https://mobbin.com/screens/d72b2baa-d912-49d2-9583-5c260fdadd56): Names the object ('No inventory found'), gives one line of why and one button.
- **Code:** `src/app/(app)/not-found.tsx:6-23`, `src/app/(app)/not-found.tsx:5-23`, `src/app/(app)/not-found.tsx:10-19`, `branch-src/src/app/(app)/not-found.tsx:5-24`, `branch-src/src/app/(portal)/p/jobs/[id]/not-found.tsx`, `probe: /tasks/nope123 and /contractors/nope123 title 'HG Capital OS'`
- **Also found as:** FEEL-052 (Lens: interaction quality, feedback, states, speed and accessibility), COPY-I17 (Lens: words on every screen)
- **Verification:** confirmed. Reproduced at /properties/nope123: a small card and four links, with Financials and Vendors missing (verify-SHELL/404--record--desktop-light.png).

### SHELL-051

**Mark the current nav link and tab with aria-current='page'**

Low · Fix · effort S · `Shell: SideNav and TopTabs` · A quiet shell with real search, navigation and sign-in

- **Today:** SideNav and TopTabs show the active item only by color (bg-accent, or a border plus primary text). Neither sets aria-current, so screen readers hear seven identical links.
- **Why:** House rule: expose state through attributes and style from them. aria-current='page' is the right attribute for route links.
- **Change:** Set aria-current='page' on the active Link in both components, and move the active styles to an aria-[current=page]: variant.
- **Desktop, tablet, phone:** All sizes.
- **Reuse:** src/components/nav.tsx:93-104,132-143.
- **Code:** `src/components/nav.tsx:93-104,132-143`, `src/components/nav.tsx:93-104`, `src/components/nav.tsx:132-142`, `src/components/nav.tsx:126-150`, `grep aria-pressed|aria-selected|aria-current in src: only portfolio-capex.tsx, capex-outlook.tsx, task-checkbox.tsx, app-shell.tsx`, `src/components/nav.tsx:95-104,134-145`, `src/app/(app)/deals/filters.tsx:64-77`
- **Also found as:** SHELL-V08 (App shell, sidebar, top bar, global search and Home), FINANCIALS-065 (Financials, rent roll and financial settings), FEEL-046 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. The page has 0 elements with aria-current.

### SHELL-055

**Show the total on Home's task list and link it to the real filter**

Low · Fix · effort S · `Home (/) task card` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Home's card header is 'My open tasks' with a 'Today' link to /tasks, as section 6 item 8 approved. It still shows 12 rows (myOpenTasks(user.id, 12)) with no total anywhere, so you can't tell 12 from 74.
- **Why:** You can't tell there are 62 more. Linking to the legacy param keeps dead code alive.
- **Change:** The link part is done. Remaining: count the user's active, non-template tasks next to the 12-row query and show it in the header ('My open tasks · 74'). Change the link text to 'View all 74' pointing at /tasks (Today), or at /tasks/all?owner=u:<id> for the full list.
- **Desktop, tablet, phone:** Same on all sizes.
- **Reuse:** src/app/(app)/page.tsx:57-63; the count query at tasks/page.tsx:111.
- **Code:** `src/app/(app)/page.tsx:20-22,59-62`, `src/app/(app)/tasks/page.tsx:24,71`, `branch src/app/(app)/page.tsx:21,55-60`, `branch src/lib/tasks/queries.ts:49-57`
- **Verification:** partly. Keep only the total.

### SHELL-I04

**Put Upcoming behind a Today | Upcoming switch, grouped by day then month**

Low · Design change · effort M · `Home` · Home and Today become one work queue

- **Today:** Key dates are not only in the Details rail. Editing loan maturity, insurance renewal, tax due or rental registration creates an auto reminder task 21 to 60 days ahead (src/lib/properties/service.ts:121-152, Task.autoKey), so these dates already reach task lists by due date. An Upcoming tasks view is already planned for week 2.
- **Why:** Airbnb separates Today and Upcoming with a two-option switch so the default stays short. Things 3's Upcoming shows the next days one by one, then collapses later dates into months, so a February maturity is visible without padding this week.
- **Change:** A segmented control under the greeting: Today | Upcoming. Upcoming shows the next 7 days as day groups (Fri 24, Mon 27) with dated tasks and fixed events, then month groups listing dated obligations one line each ("Dec 12 · Reconnect QuickBooks", "Jan 15 · Insurance renews · 118 Congress"). Months with nothing are skipped.
- **Desktop, tablet, phone:** Desktop 1280: Today | Upcoming left-aligned under the greeting; Upcoming is one column at reading width. Tablet 768 and phone 375: one three-way control, Mine | Contractors | Upcoming, so two switches never stack; phone shows the next three months with Show later.
- **Reuse:** SegmentedControl and TaskSection from the cutover build; fmtDay; Property date fields.
- **Challenges:** Refines SHELL-003, which stacks Coming up under the other sections. On tablet and phone it adds Upcoming as a third option to D31's Mine | Contractors switch.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32): Today | Upcoming pill switch on the host home.
  - [Things 3](https://mobbin.com/screens/590f4dd6-1a6d-45a3-91c3-3508a762b041): Upcoming grouped by day with a large day numeral.
  - [Things 3](https://mobbin.com/screens/70d652ee-3a68-47b6-a66e-2c8e9194255c): Later dates collapse into month groups with compact dated lines.
- **Code:** `prisma/schema.prisma:129-143`, `src/app/(app)/page.tsx:19-23 (take: 12)`
- **Verification:** partly. An Upcoming tab under Tasks is already planned for week 2 after cutover (asana-migration-plan.md section 4, 'Upcoming / By property / Waiting tabs'), and conflicts_with doesn't name it. On phone, a three-way Mine | Contractors | Upcoming control mixes who with when on one switch, which is confusing. Things 3 590f4dd6 checked on Mobbin (day groups).

### SHELL-I07

**Put the date in a small line above the greeting**

Low · Design change · effort S · `Home header` · Home and Today become one work queue

- **Today:** Home's header is "Good morning, Connor" over "What needs attention". No date appears anywhere on Home, so "today" and "56d ago" have no anchor on screen.
- **Why:** Jobber opens both its web and phone home with the weekday and date above the greeting. It anchors every relative label on the page at no cost in chrome.
- **Change:** A muted 13px line above the H1: "Thursday, October 23", computed in Eastern time. The subtitle becomes the one-sentence answer from SHELL-003 instead of restating the page's purpose.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: full weekday and month. Phone 375: same. At 320: "Thu, Oct 23".
- **Reuse:** PageHeader with an eyebrow prop; todayYmdEastern from the cutover build.
- **References:** 
  - [Jobber](https://mobbin.com/screens/020cee8e-7bb3-4e9a-a26d-0de6f61b06bb): Date eyebrow over the greeting on web.
  - [Jobber](https://mobbin.com/screens/3872fb82-2e8f-41fe-b587-e1063401f155): Same date eyebrow on the phone home.
- **Code:** `src/app/(app)/page.tsx:46`
- **Verification:** confirmed. Confirmed: no date anywhere on Home. Compute it on the same Eastern clock as the greeting, which is itself wrong in production (SHELL-V01). Jobber references not spot-checked; the URLs look real.

### SHELL-I08

**End Home with a collapsed Done today group that names who finished what**

Low · New capability · effort S · `Home` · Home and Today become one work queue

- **Today:** Home queries only open tasks (page.tsx:20), so finished work leaves no trace there. The cutover build already stores who finished (Task.completedByUserId and completedByContactId), and under D6b and D20 both partners get an email when a contractor marks a job done. The loop is partly closed outside Home.
- **Why:** CLAUDE.md asks every surface to close the loop. Mercury keeps a dimmed Completed tasks list under what is left, Things 3 leaves checked rows in place dimmed, and Jobber groups completed visits under their own count.
- **Change:** Last on Home: "Done today (5)", collapsed by default. Expanded, one dimmed line per task: title, who finished it ("Pieter", "Zack, approved by you") and the time. Resets at midnight Eastern. Nothing renders on a day with none.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one line per row. Phone 375: two lines, title then who and time.
- **Reuse:** TaskSection (collapsible) and avatar.tsx from the cutover build; TaskEvent STATUS events for who; Task.completedAt.
- **References:** 
  - [Mercury](https://mobbin.com/screens/ec7b66ef-59c2-495b-9872-7f17f40c5c52): Completed tasks listed dimmed with checks below the open steps.
  - [Things 3](https://mobbin.com/screens/724087de-2e95-47ec-926c-efbdab249a23): Checked items stay visible and dimmed instead of vanishing.
  - [Jobber](https://mobbin.com/screens/4180c32c-84d6-4126-876a-d4f2894bd47d): Completed visits grouped with a count and struck through.
- **Code:** `src/app/(app)/page.tsx:19`, `prisma/schema.prisma:240`
- **Verification:** partly. A collapsed group is light enough to stay within the simplicity bar. Read who finished from the completedBy fields, not by parsing TaskEvent. Priority is lower than stated because contractor completions already reach both partners by email.

### SHELL-I11

**Let search narrow to one record type**

Low · Design change · effort S · `Global search` · A quiet shell with real search, navigation and sign-in

- **Today:** Every query mixes properties, deals, contractors and tasks in one list with an uppercase type column. For a common word such as "insurance" tasks fill the list, and there is no way to ask for contractors or properties only.
- **Why:** Mercury's search has a row of scope chips (All, Pages, Transactions, Accounts, Recipients), and Linear Mobile scopes from a small menu. Scope matters most where one record type outnumbers the rest by hundreds.
- **Change:** Scope options under the input: All, Properties, Deals, Tasks, Contractors. Tab cycles them; the selected fill alone marks the pick. A scoped query returns up to 20 rows.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: chip row under the input. Phone 375: a single "All" menu button beside the results heading, as Linear Mobile does, so no row of five chips has to fit at 320.
- **Reuse:** SegmentedControl and menu.tsx from the cutover build; GlobalSearch; /api/search with a type parameter.
- **References:** 
  - [Mercury](https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2): Scope chips across the top of the search panel.
  - [Linear Mobile](https://mobbin.com/screens/ce539bef-e6ae-4c4e-9656-840a33df6ec2): Phone scope menu: All, Issues, Projects, Documents.
- **Code:** `src/components/global-search.tsx:51-67`
- **Verification:** confirmed. Mercury's scope chips checked on Mobbin (980f79d4, All / Pages / Transactions / Accounts row). Lower value than I10 and V02 once results are ranked and every group has See all. Build it into the ⌘K palette planned for week 2, not into today's header dropdown.

### SHELL-I14

**Make the New menu offer the record you are on first**

Low · New capability · effort S · `Shell New menu` · Create where you are

- **Today:** tasks/new already accepts propertyId and dealId, but only the property page passes one. The Tasks page's New task opens blank, and deal and contractor pages have no prefilled path, so SHELL-031's shell New button would open blank forms everywhere.
- **Why:** Linear Mobile's create menu opens from the record you are on and offers the objects that belong there. Creating in context is the fastest capture.
- **Change:** The New menu reads the current route. On a property its first item is "Task at 767 Prospect"; on a deal, "Task for 123 Main St"; on a contractor, "Job for Zack". The general items follow. The shortcut opens the first item.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: menu from the sidebar New button. Phone 375: same items in a sheet from the fixed create button.
- **Reuse:** tasks/new searchParams (propertyId, dealId); menu.tsx and sheet.tsx from the cutover build.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/37137a91-09bd-4d3d-af38-e993f9841d2d): Create menu on a project offers that project's objects first.
- **Code:** `src/app/(app)/tasks/new/page.tsx:9`, `src/app/(app)/properties/[id]/page.tsx:170`, `src/app/(app)/tasks/page.tsx:154`
- **Verification:** confirmed. Confirmed: only properties/[id]/page.tsx:170 passes propertyId, and no caller passes dealId even though tasks/new reads it (tasks/new/page.tsx:9-16). This depends on SHELL-031's New button existing.
