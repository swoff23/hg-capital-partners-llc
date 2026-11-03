# Performance and loading screens

Spec for Connor's approval, drafted 2026-10-27 against production main (`d538ec9`). Connor asked for pages that "load instantly", with skeletons while the rest loads, "or whatever is the SaaS norm when switching from page to page". He picked loading screens for every section. Nothing here gets built until Connor says "build it" in chat.

Sources: a pass on the live site, a server data pass, and a client pass on a local production build with a desktop and a phone profile (section 2 says how each number was taken). Next.js behavior comes from the docs that ship with Next 16.3.3 in `node_modules/next/dist/docs/`, cited by file name. Visual rules come from `docs/brand-guidelines.md` sections 5, 7 and 9. Reuse follows `docs/components.md`.

## 1. Summary

**What's wrong today**

- A click shows nothing until the next page has been rendered and sent. The old page, the URL and the sidebar all stay put. On the live site that wait was 0.2 to 0.43 s on a fast desktop. In the local phone model it is 0.21 to 0.43 s, and up to 0.6 s the first time a route opens. That still screen is what "clicks sometimes don't register" looks like.
- Only Financials Overview has a loading screen, and its click shows the next frame in 15 ms on desktop and 22 ms on the phone model. Every other route waits.
- On a phone, a freshly opened page is visible at 0.39 to 0.53 s, but its buttons only start working at 1.02 to 1.22 s. Taps in that gap do nothing.
- In production every database call costs about 5 round trips (pgbouncer mode wraps each one in BEGIN, DEALLOCATE ALL, the query and COMMIT), and pages run 7 to 19 of them in a row.
- Every staff page downloads 1.44 to 2.08 MB of JavaScript (427 to 626 KB compressed). The biggest single file is zod, a validation library meant for the server (370 KB, 85 KB compressed), which the command palette pulls into every staff page.
- The task list renders 400 rows at once: 966 KB of HTML and 6,857 DOM nodes. Going Back to it takes 53 to 96 ms on desktop and about 158 ms on the phone model, all of it rendering.

**What changes**

1. Every section and record page gets a loading screen in the Financials Overview style. A tap moves the sidebar mark and draws the next page's title, tabs and frame at once, and the content fills in.
2. The server makes one round trip per query, runs independent queries together and stops repeating lookups. That roughly halves server time per page and per edit.
3. Less JavaScript: zod stays on the server, the upload engine and edit sheets load when first used, and the task list shows 100 rows with a way to see more.
4. A budget per route, reported by the device check, so it stays fast.

## 2. Baseline

### How it was measured

- **Live site** (earlier pass, fast desktop connection): server time 0.1 to 0.6 s per page; a click shows nothing for 0.2 to 0.43 s; `/tasks` ships about 1.7 MB of decoded JavaScript in 24 files, 892 KB of decoded HTML and about 6,300 DOM nodes for 192 rows.
- **Local production build** of `d538ec9`: `next build` into `.next-devices`, `next start` on port 3175, signed in the way `tests/devices/setup.ts` does. The database is `hg_capital_uiux` with the real import (2,104 tasks, 273 active; 676 deals; 11 properties).
- **Production database model:** a TCP proxy adds 1 ms each way in front of Postgres and the URL carries `pgbouncer=true&connection_limit=5`, as `src/lib/db-url.ts` sets for production. One round trip is about 2.7 ms, the top of production's 1 to 3 ms.
- **Desktop profile:** Chromium at 1280x800, no throttling.
- **Phone profile:** Chromium at 375x667, 2x, touch, 4x CPU slowdown, 9 Mbps down and 1.5 Mbps up (Chrome DevTools Protocol), plus a second TCP proxy that adds 50 ms each way in front of the web server, so every request, the page itself included, pays a 100 ms round trip. That is decent 4G; a weak signal in a basement is slower.
- **Server time:** time to first byte per route from the server pass, production model, median of 5 runs.
- **Click:** from a link click to the next page's `h1` on screen, polled every frame, median of 2 rounds through 13 hops in this order: `/tasks`, `/properties`, a property, Back, `/deals`, a deal, Back, `/contractors`, `/financials`, Rent roll, Home, `/tasks`, a task, Back. Each page sat for 1.5 s after loading, so its prefetches were done. Without a loading screen the URL, the sidebar and the page all change in that same frame, so this is also how long the old page sits frozen.
- **Cold load:** a fresh browser profile per run, 1 warm-up and 3 measured runs, median. First paint from Paint Timing. JavaScript and HTML sizes from Resource Timing up to the load event, decoded and compressed.
- **Taps work:** the time from opening the page until React has attached to the first button or link in `<main>`.
- **Not modelled:** Vercel cold starts, TLS setup, Vercel's slower CPU and a real radio. Live numbers run higher.

### Per route

Server is production-model time to first byte in ms, with SQL statements over Prisma operations and the number of queries that run one after another. Clicks are in ms. Phone cold is first paint over load event, in ms. JS and HTML are decoded KB with compressed KB in brackets.

| Route | Server | SQL / ops, in a row | Click, desktop | Click, phone | Phone cold | JS | HTML | DOM nodes |
|---|---|---|---|---|---|---|---|---|
| Home `/` | 103 | 10 / 7, 7 | 102 | 316 | 428 / 1,094 | 1,661 (500) | 413 (24) | 2,756 |
| `/tasks` | 183 | 15 / 11, 11 | 150 | 396 | 544 / 1,144 | 1,676 (506) | 966 (39) | 6,857 |
| `/tasks/[id]` | 99; 138 with 162 events | 17 / 12, 11 to 14 | 97 | 308 | 408 / 1,176 | 1,909 (590) | 78 (14) | 277 |
| `/properties` | 51 | 4 SQL | 67 | 307 | 356 / 987 | 1,497 (446) | 190 (18) | 829 |
| `/properties/[id]` | 123 | 17 / 12, 12 to 14 | 133 | 430 | 428 / 1,196 | 2,076 (626) | 187 (19) | 1,211 |
| `/deals` | 63; 180 for all | 5 SQL, 2 to 4 | 59 | 250 | 360 / 998 | 1,498 (447) | 139 (14); 1.8 MB for all | 969 |
| `/deals/[id]` | 55 | | 80 | 255 | 360 / 1,057 | 1,799 (548) | 63 (11) | 288 |
| `/contractors` | 45 | 2 to 4 in a row | 59 | 228 | 356 / 992 | 1,479 (441) | 156 (16) | 716 |
| `/contractors/[id]` | 67 | | not measured | not measured | 372 / 1,050 | 1,739 (525) | 62 (12) | 294 |
| `/financials` (has a loading screen) | 27 first byte, 108 done | 16 / 16, 9 | 15 frame, 323 content | 22 frame, 329 content | 340 / 979 | 1,481 (441) | 119 (21) | 606 |
| `/financials/rent-roll` | 54 | | 59 | 212 | 344 / 985 | 1,454 (431) | 43 (9) | 171 |
| `/financials/settings` | 134 | 23 / 22, 9 | not measured | not measured | not measured | | | |
| `/settings` | 53 | | not measured | not measured | 360 / 1,026 | 1,546 (460) | 157 (13) | 880 |
| `/templates` | 37 | | not measured | not measured | 328 / 968 | 1,443 (427) | 37 (8) | 152 |
| Portal `/p` | 72 | 7 SQL, 6 | not measured | not measured | 356 / 803 | 980 (307) | 28 (7) | 105 |
| Portal `/p/jobs/[id]` | 199 | 27 / 19, about 19 | not measured | not measured | 492 / 974 | 1,077 (345) | 199 (20) | 1,508 |

### Back, edits, taps and prefetch

| Moment | Desktop | Phone model | Note |
|---|---|---|---|
| Back to `/properties` | 17 | 31 | No request; served from the router's memory |
| Back to `/deals` | 19 | 29 | Same |
| Back to `/tasks` | 53 to 96 | 157 to 211 | No request; all of it is rendering 6,857 nodes |
| Tick a checklist item on `/tasks/[id]` | 106 to 145 round trip | not measured | The tick shows at once (`useOptimistic` in `checklist.tsx`); behind it, 31 SQL in 18 operations and a 112 KB response, because the whole page re-renders |
| Taps work after opening `/` | 183 | 1,155 | Phone first paint is at 420 |
| Taps work after opening `/tasks` | 241 | 1,206 | Phone first paint is at 528 |
| Taps work after opening `/tasks/[id]` | 169 | 1,166 | Phone first paint is at 388 |
| Taps work after opening `/properties/[id]` | 186 | 1,221 | Phone first paint is at 424 |
| Taps work after opening `/p/jobs/[id]` | 259 | 1,020 | Phone first paint is at 488 |
| Prefetch requests per page load | 14 to 39 | 14 to 30 | Together they cost 1 database query today |

### Where the JavaScript goes

Mapped by loading each route in a fresh profile and matching the files to `.next-devices/static/chunks`. Sizes are raw over compressed KB.

- **Shared by every staff route:** 21 files, 1,442 / 426.
  - zod: 370 / 85, the largest file, larger than React itself. The path is `app-shell.tsx`, `command-palette.tsx`, `lib/search-results.ts`, `lib/tasks/list.ts`, `lib/tasks/repeat.ts`, which parses repeat rules with zod. Task rows reach it again through `due-date-picker.tsx`.
  - React DOM: 224 / 70.
  - The upload engine: 153 / 45, loaded by `UploadQueueProvider` in the app layout on every page, whether or not anything is uploaded.
  - React Aria: four files, 243 / 79.
- **On top, per route:** Home and `/tasks` add 219 to 234 / 74 to 79 (a React Aria file of 165 / 53 for the date and repeat pickers). `/tasks/[id]` adds 467 / 163 and `/properties/[id]` adds 634 / 199, mostly edit sheets and pickers that only open on a tap.
- **Portal:** no zod. `/p` is 980 / 307 in all, `/p/jobs/[id]` is 1,077 / 345.
- The 3 MB HEIC converter (`heic-to`) loads with no page; it's already fetched on demand.

## 3. Targets

### What a person should feel

| Moment | Target | Today, worst measured |
|---|---|---|
| Tap a link that was prefetched: the sidebar mark moves and the next page's frame (title, tabs, skeleton) shows | Within 100 ms on desktop and phone | 150 desktop, 430 phone; 0.43 s live |
| Tap a link before its prefetch has landed | The tapped item shows it's working within 100 ms | Nothing until the page arrives |
| The content is in | Within 0.5 s on desktop and 1 s on a phone on 4G | 0.33 s desktop, 0.43 s phone locally; more live |
| Back and Forward | Under 50 ms on desktop and 100 ms on a phone, with no request | 96 desktop and 211 phone, both on `/tasks` |
| A tick, a status change or a comment | Shows at once (most already do); the server confirms within 300 ms | 106 to 145 ms locally, plus a full page re-render |
| Open the app on a phone | First paint within 1 s, taps work within 1 s | First paint 0.33 to 0.54 s; taps 1.02 to 1.22 s |
| Any tap or keypress (Interaction to Next Paint) | 200 ms or less | Not measured in production yet (Question 6) |

The 100 ms figure is the point where a response still feels like the direct result of the tap ([RAIL](https://web.dev/articles/rail)). 200 ms is the "good" line for [Interaction to Next Paint](https://web.dev/articles/inp).

### Budget per route

| Budget | Limit | Today, worst | Over today |
|---|---|---|---|
| JavaScript shared by every staff page | 300 KB compressed | 426 | All staff pages |
| JavaScript on a staff page's first load | 400 KB compressed, 1.3 MB decoded | 626 and 2,076 (`/properties/[id]`) | Every staff route |
| JavaScript on a portal page | 300 KB compressed | 345 (`/p/jobs/[id]`) | The job page |
| HTML at a page's default view | 300 KB decoded | 966 (`/tasks`), 413 (Home), 1.8 MB (`/deals` with all) | `/tasks`, Home, `/deals` all |
| DOM nodes at a page's default view | 2,000 | 6,857 (`/tasks`), 2,756 (Home) | `/tasks`, Home |
| Server work for a page | 6 queries in a row, 100 ms in the production model | 11 to 19 in a row; 183 (`/tasks`), 199 (`/p/jobs/[id]`) | `/tasks`, task, property and job pages |
| Server work for a small edit | 10 SQL, no full-page re-render | 31 SQL and a full re-render | Every inline edit |

Fix 1 alone doesn't move these numbers; it changes when the person sees something. Fixes 2 to 9 bring each route under its budget.

## 4. Loading screens

### 4.1 How Next 16 does it

- A `loading.tsx` wraps its folder's page in a Suspense boundary. For a dynamic route, its loading screen is prefetched while the link is on screen, so the click switches at once and the content streams in (`03-file-conventions/loading.md`; `01-getting-started/04-linking-and-navigating.md`, "Dynamic routes without loading.tsx").
- Without one, a dynamic route isn't prefetched at all, and the click waits on the server (`02-guides/prefetching.md`, the static and dynamic table). Every page here is dynamic.
- A loading screen covers everything below its folder. `tasks/loading.tsx` would also show for a task page, with the list's shape. So each list page moves into its own route group, as Financials Overview already sits in `financials/(overview)/`. The URLs don't change.
- A layout above the loading screen that reads cookies or the database holds the screen back until it finishes (`loading.md`, "Good to know"). `financials/layout.tsx` and `settings/layout.tsx` both call `requireUser()` for nothing: every page under them checks the session itself, and a layout isn't a security boundary, as their own comments say. They drop it, so their prefetches stop costing a query.
- The `(app)` and `(portal)` layouts don't re-run on a click (partial rendering), so they never hold a screen back.
- On a full page load, the skeleton streams first and the content follows, so first paint no longer waits for the data (`loading.md`, "Streaming").
- How long a prefetched loading screen stays usable: `05-config/01-next-config-js/staleTimes.md` says loading boundaries are reusable for the static period (5 minutes), while the table in `prefetching.md` files them under the dynamic one (0 s, refetched). The build settles it by clicking a link a minute after its prefetch. Either way the click shows the frame; the difference is one small request.

### 4.2 The pattern

Copy `financials/(overview)/loading.tsx` (brand section 7: "Skeletons match the finished layout, draw labels at once and hold values in static `--fill-1`. No shimmer.").

- **Same shape.** The skeleton uses the page's own containers, grid, gaps and responsive classes, so nothing moves when the content lands, and whatever the page hides at a width, the skeleton hides too. Desktop, tablet and phone follow from the page.
- **Draws at once, in its real style:** page titles, the New button (a live link), back links (live), the tabs (already in the section layouts), section headings every record has, field labels, column headers and fact labels.
- **Static `--fill-1` blocks:** anything from data. Names, addresses, figures, dates, counts, status marks, avatars, photos and row contents, each at the height of the text it stands in for and a plausible width. Square corners on text blocks; photo and avatar blocks keep their own radius.
- **The filter row** draws its real frame: the search field with its placeholder, the view control with its labels and the view from the URL, and the facet buttons with their names, inert and with no counts (Question 1). `FilterBar`'s own container query decides one row or the Filters button, so it matches at every width.
- **No motion.** The skeleton appears in the click's frame (`--dur-0`) and the content replaces it without a fade. Nothing loops, so reduced motion needs nothing extra.
- **Accessibility.** The skeleton's root has `aria-busy="true"` and every block is `aria-hidden`, as on the Overview today.

**Reuse check**

- **Reused:** the Overview's loading file as the template, `FactStrip` over blocks, `MonthBarsSkeleton`, `PageHeader`, `BackLink`, `Section`, `Table` and `Th`, `LinkButton`, the route-group move the Overview already made, and `TopTabs` in the section layouts.
- **Extended:** `SkeletonRows` (private today in `components/command-palette.tsx`) and the Overview's `block` class move into a new `components/skeleton.tsx` as `Block`, `SkeletonRows` and `TaskRowSkeleton`, with a row in `docs/components.md` that closes the "Loading state" known gap. `FilterBar` gains a `placeholder` mode that draws its frame inert. `SortHeader` gets drawn as a plain `Th` in skeletons.
- **New:** 18 `loading.tsx` files and 8 route-group moves (section 4.3). The pending cue in 4.6. No new dependency.

### 4.3 Every route

"Moves" means the page file moves into the group named; its imports of files beside it go up one level, and those files stay where they are.

| Route | File | Draws at once | `--fill-1` blocks |
|---|---|---|---|
| Home `/` | `(app)/(home)/loading.tsx`; `page.tsx` moves | Nothing: the greeting carries the person's name | Greeting at title height, the summary line, 6 task rows |
| `/tasks` | `(app)/tasks/(list)/loading.tsx`; `page.tsx` moves | "Tasks", New task, the filter row | 12 task rows: check circle, title, place, avatar, date chip |
| `/tasks/[id]` | `(app)/tasks/[id]/loading.tsx` | Back "Tasks"; from lg the "Details" rail with Assignee, Due, Property and Created; "Activity" | Status mark, title, field values (chips below lg), 3 lines of notes, 3 activity rows, the composer's frame |
| `/properties` | `(app)/properties/(list)/loading.tsx`; `page.tsx` moves | "Portfolio", New property, the filter row, the column headers with the page's own hiding classes | 8 rows: photo tile, address, figures |
| `/properties/[id]` | `(app)/properties/[id]/loading.tsx` | Back "Portfolio"; Value, Loan balance, Equity, LTV; "5-year CapEx forecast", "Building CapEx", "Units & access"; rail "Details", "Loan", "Insurance" | Photo, status, address at title height, subline, the four figures, card contents, rail rows |
| `/deals` | `(app)/deals/(list)/loading.tsx`; `page.tsx` moves | "Deals", New deal, the filter row, the column headers | 10 rows |
| `/deals/[id]` | `(app)/deals/[id]/loading.tsx` | Back "Deals", "Details", "Next action" | Address, stage, figures, notes |
| `/contractors` | `(app)/contractors/(list)/loading.tsx`; `page.tsx` moves | "Contractors", New contractor, the filter row, Name, Company, Trades, Phone, Docs | 8 rows |
| `/contractors/[id]` | `(app)/contractors/[id]/loading.tsx` | Back "Contractors", W-9 | Name, company, trades, contact rows, job rows |
| `/financials` | exists, unchanged | | |
| `/financials/rent-roll` | `(app)/financials/rent-roll/loading.tsx` | Property, the 12 month labels (from `trailingMonths`, as the Overview does), the total column | 8 rows of figures |
| `/financials/settings` | `(app)/financials/settings/loading.tsx` | Its section headings | Rows |
| `/settings` (CapEx rules) | `(app)/settings/(capex)/loading.tsx`; `page.tsx` moves | Its own action row's height | Rule rows |
| `/settings/move-in-form`, `/settings/storage` | a `loading.tsx` in each folder | Their headings | Rows |
| `/templates` | `(app)/templates/(list)/loading.tsx`; `page.tsx` moves | "Playbooks" | Rows |
| `/templates/[id]/apply` | `(app)/templates/[id]/apply/loading.tsx` | Its headings and field labels | Values |
| Portal `/p` | `(portal)/p/(jobs)/loading.tsx`; `page.tsx` moves | The bar's monogram and "HG Jobs" | Account button, greeting, 4 job rows (photo, title, address, date) |
| Portal `/p/jobs/[id]` | `(portal)/p/jobs/[id]/loading.tsx` | Back "My jobs", "Notes", "Updates" | Call button, title, address, notes, photo tiles, update rows |

Left out on purpose:

- The create pages (`/tasks/new` and the rest) open as sheets from every link (`@modal`), and the full pages show only on a reload. Measure the sheet open again after the server fixes.
- `/tasks/all` only redirects. `/p/welcome/password` renders in 36 ms with no data worth a skeleton.
- The Financials card on a property renders only once QuickBooks is connected, so the skeleton leaves it out. Once production is connected, it moves into its own Suspense boundary with a card frame (fix 7).

Each heading in the "Draws at once" column renders on every record today. The build checks that again, and anything that turns out conditional becomes a block.

### 4.4 Previews

`####` is a static `--fill-1` block, `( )` is a check circle, `(#)` is an avatar block, `[ ]` is a control's frame. Words are drawn at once.

**Task list at 1280 (desktop)**

```
+-------------+---------------------------------------------------------------------+
| HG          | Tasks                                                 [+ New task]  |
|             |                                                                     |
| Home        | [Search tasks       ] [Open | Done | All] [Assignee] [Property]     |
| >Tasks      |                                                      [Repeats]      |
| Portfolio   | ( ) ##########################     ##########    (#)    ######      |
| Deals       | ------------------------------------------------------------------- |
| Contractors | ( ) ##################             ########      (#)    ######      |
| Financials  | ------------------------------------------------------------------- |
| Playbooks   | ( ) ############################   ############  (#)    #####       |
|             | ------------------------------------------------------------------- |
|             |                                                                     |
+-------------+---------------------------------------------------------------------+
```

- **1280:** the sidebar's mark is already on Tasks. Rows take the one-line layout with fixed columns, as `TaskRow` does on a list wider than 50rem. The bar is one row when it fits (`wide="56rem"`); the preview wraps it only for width.
- **768 (tablet, touch):** the bar draws search, views and the Filters button. Rows take the two-line layout (title and date, then place and avatar) at touch height, 44px controls.
- **375 (phone):** title and New task on one line, then the bar as the page draws it at that width, then two-line rows. About 9 rows fill the screen; the rest are below the fold.

**Task page at 1280**

```
+-------------------------------------------------------------------------------+
| < Tasks                                                                       |
| [###] ##########################################               [...]          |
|                                                                               |
|   ########################################         Details                    |
|   ##################################               Assignee   ########        |
|   ######################                           Due        ######          |
|                                                    Property   ##########      |
| Activity                                           Created    #######         |
|   (#) ######   ##############################                                 |
|   (#) ######   ########################                                       |
|   (#) ######   ##################################                             |
| [ composer frame                              ]                               |
+-------------------------------------------------------------------------------+
```

- **1280:** the 20rem Details rail on the right, sticky as on the page. The title block is one line. The more-menu slot keeps its 32px.
- **768 (tablet):** no rail; the fields are a row of chip blocks under the title, at touch height. Below them notes, then Activity, then the composer frame.
- **375 (phone):** Back, status and the menu on one row, a two-line title block under them, then the chip blocks. The page is the screen's height, so the composer frame sits on the bottom edge as it does on a short task, and nothing jumps when the real composer lands.

**Property page at 1280**

```
+-------------------------------------------------------------------------------+
| < Portfolio                                                                   |
| +--------+  ########                                                          |
| | ###### |  ##############################   (address, title height)          |
| +--------+  ##################                                                |
|                                                                               |
| Value            Loan balance       Equity           LTV                      |
| ########         ########           ######           ####                     |
|                                                                               |
| +---------------------------------------+    Details                          |
| | 5-year CapEx forecast                 |    ######     ##########            |
| | ##################################    |    ######     ######                |
| +---------------------------------------+    Loan                             |
| Building CapEx                               ######     ##########            |
|   ##########################                 Insurance                        |
| Units & access                               ######     ########              |
|   ########################                                                    |
+-------------------------------------------------------------------------------+
```

- **1280:** photo block at 96x72 beside the address, the four facts in one strip, then the two columns (main and a 20rem rail).
- **768 (tablet):** one column, since the two-column grid starts at lg. The photo stays 96x72 beside the address (from sm). The rail's sections follow the main column.
- **375 (phone):** the photo block runs full width at 16:9 on top, as the page shows it, then status, address and subline. The fact strip takes its phone layout. Then the main column, then the rail.

### 4.5 References

From Mobbin, searched 2026-10-27 with the Mobbin tools:

- [Heidi, task list loading](https://mobbin.com/screens/22d1383e-b310-45f3-9268-c36b65a58803): title, filter row and column headers drawn, rows as blocks. The closest match to `/tasks`.
- [Unify, list loading](https://mobbin.com/screens/be3c7516-09ef-469f-a861-f08395a61f38): search, Add filter and column headers drawn over row blocks.
- [Neon, table loading](https://mobbin.com/screens/9b5b1374-c015-495b-abcb-9cce659c741b): the page title and table drawn, flat blocks.
- [Mercury, home loading](https://mobbin.com/screens/bb15ae0e-0445-4c13-ba4f-3ccb1a930fb5): headings and column headers drawn, flat blocks under them. Already a reference for the Overview's skeleton.
- [Square, flat skeleton](https://mobbin.com/screens/09371ef3-f0d0-4fc9-8ab1-607ab3d0e4ab): no shimmer. Already cited by the Overview.
- [Fabric, record page loading](https://mobbin.com/screens/46846b8b-226e-4952-a05a-97f5b7bb11a1): a two-column record held in blocks.
- [Wise on iPhone](https://mobbin.com/screens/23814fae-967d-4436-958b-1528dbd1626a): search field and filter chips drawn, rows as blocks.
- [Instagram on iPhone](https://mobbin.com/screens/08f3f7be-088d-4977-8867-50c10465950c): the screen's title drawn, rows as blocks.
- What we don't do: [PayPal's shimmer](https://mobbin.com/screens/f3387df1-0599-429d-afaa-84785db6c103) (brand section 7), and a centered wait message that hides the page's shape, as in [ClickUp](https://mobbin.com/screens/72a6151c-251d-4e82-b7a5-d4e78b21eca6) and [Workable](https://mobbin.com/screens/416e10ce-531f-449d-9c3d-62a2f2bbb60d).

The SaaS names Connor's north star points at:

- **Linear** shows no loading state on its lists in Mobbin ([example](https://mobbin.com/screens/fd1b4d88-f021-49a3-98af-4cd3a87e1d29)): it keeps the workspace on the device and syncs it, so most clicks never wait on a server. That's the feel to aim at. Copying it would take a sync engine, so the route here is prefetched skeletons plus a faster server.
- **Stripe:** the Mobbin captures found show loaded dashboards only ([example](https://mobbin.com/screens/fb030c6b-f6dd-4715-9f6f-45f0e354411f)), so no Stripe loading pattern is cited.
- **Vercel's [Web Interface Guidelines](https://vercel.com/design/guidelines):** skeletons mirror the final layout, update optimistically when success is likely, and wait briefly before showing any spinner (already brand section 7).

### 4.6 Taps before the prefetch lands

On a phone that has just opened the app, a row's prefetch may not be back when it's tapped. Next's `useLinkStatus` reports that one link as pending, and stays quiet for prefetched links (`03-api-reference/04-functions/use-link-status.md`). Proposed (Question 2): a pending sidebar item or tab takes its current look at once (the `--act` notch, `--fill-2`), and a pending row takes its `--fill-1` hover fill. No spinner. This is **new**: nothing uses `useLinkStatus` today. The pattern is the one the Next docs give for slow networks.

## 5. The fixes, ranked

Ranked by what a person feels per hour of work. Gains come from the measurements in section 2, scaled to production where noted. "Prod model" gains shrink by about half at a 1.5 ms round trip instead of 2.7.

| # | Fix | Measured cause | Expected gain | Effort | Risk |
|---|---|---|---|---|---|
| 1 | Loading screens for every route (section 4), and `requireUser` out of the Financials and Settings layouts | No `loading.tsx`, so dynamic routes aren't prefetched and every click waits | Click to frame from 59 to 150 ms (desktop) and 212 to 430 ms (phone) down to about 15 to 25 ms, as Financials measures today. Phone first paint on a cold open no longer waits for the data | 2 days with the device check at 375 and 320 | A skeleton that doesn't match makes the page jump when content lands. The group moves touch imports. Every prefetch now carries a small skeleton |
| 2 | zod off the client: `lib/tasks/repeat.ts` validates with `zod/mini` or a small hand check, and `lib/search-results.ts` stops importing `lib/tasks/list.ts` for one helper | The command palette pulls zod into every staff page | 85 KB compressed and 370 KB of script less on every staff page, about a fifth of the shared JavaScript. On the phone model, roughly 80 ms less download plus the parse time | 2 hours | Low; the repeat tests cover parsing |
| 3 | Prisma on `@prisma/adapter-pg` against the transaction pooler, without `pgbouncer=true` | Each operation is 4 statements (BEGIN, DEALLOCATE ALL, the query, COMMIT) sent one by one: 14.6 ms per operation against 3.2 ms in the prod model | Prod model time to first byte: Home 103 to 47, `/tasks` 183 to 99, `/tasks/[id]` 99 to 46, `/properties/[id]` 123 to 57, `/financials/settings` 134 to 48, `/p/jobs/[id]` 199 to 113. About 20 to 95 ms per page and per edit in production | 1 day with checks | Medium. Confirm Supavisor port 6543 with node-postgres, interactive `$transaction`, raw queries, Decimal and Json. Preview shares the production database |
| 4 | Task list shows 100 rows and Show more (Question 3) | 400 rows: 966 KB HTML, 6,857 nodes, 75 ms of server render with about 2 ms of database time | HTML to about 250 KB, nodes to about 1,800, Back to `/tasks` to about a quarter of 53 to 211 ms, phone first paint about 100 ms sooner | Half a day to 1 day | Low. Filters and counts already run on the server |
| 5 | The upload engine and the edit sheets load on first use (`next/dynamic`, `02-guides/lazy-loading.md`) | `UploadQueueProvider` loads the engine (45 KB compressed) on every page; task and property pages load every edit sheet and picker up front (163 and 199 KB compressed on top of the shared files) | With fix 2: shared JavaScript from 426 to about 296 KB, and the two record pages from 590 and 626 KB toward 400. Phone taps working sooner, toward 1 s | 1 day | Medium. The queue resumes uploads left in IndexedDB at load, so it loads the engine at once when the outbox isn't empty. A sheet's first open pays one small download |
| 6 | Fewer queries in a row: start detail-page child queries with the main row, run `/tasks`'s name lookups together, fold the unread check into the list query, start `requireUser` alongside the reads (and await it before returning) | 7 to 14 queries in a row on staff pages, about 19 on the job page | 35 to 100 ms per page in the prod model today; 15 to 40 ms after fix 3 | 1 to 3 days | Medium. An access check must still run before anything is returned |
| 7 | Stream the slow parts: the property's Financials card and Documents section in their own Suspense boundaries | The property page waits on them; Documents starts 38 ms in | The rest of the property page shows without them; about 40 ms sooner | Half a day | Low |
| 8 | Lighter edits: skip the page's `after()` writes when the render comes from an action, and narrow `revalidatePath` to what changed | A tick re-renders the whole page: 31 SQL in 18 operations, 112 KB back, and RecentView and TaskReadState written again | About half the server work per edit (18 to roughly 9 operations), so the server confirms sooner | Half a day for the `after()` guard; 1 to 2 days to narrow revalidation | Low for the guard. Narrowing needs care so other open pages still update |
| 9 | `React.cache()` for `getCurrentUser`, `getConnection` and a `getPropertyById`, and narrower selects (no `passwordHash`, no QuickBooks tokens on display pages) | The same rows read 2 or 3 times per request; full rows where a few columns do | 1 to 3 operations per page; secrets stop being read on every request | 2 to 3 hours | Low |
| 10 | Keep a visited page for 30 seconds (`staleTimes.dynamic: 30`, Question 4) | `staleTimes.dynamic` defaults to 0, so a page you left 5 seconds ago is fetched again | Revisiting within 30 s needs no request: from 59 to 430 ms down to render time | 1 line and a test | Someone else's change can take up to 30 s to show on a page you revisit. Your own edits clear it (`revalidatePath`) |
| 11 | Deals "all": the latest note per deal in one query (DISTINCT ON or LATERAL), sort by stage in SQL so the 300 cap applies, list columns only | 676 deals and all 1,054 notes loaded to show one note on 300 rows | 180 to about 60 ms, 1.8 MB of HTML to under 300 KB | Half a day | Low |
| 12 | Pool of 8 to 10 after fix 3, and the data-quality sums and filter counts merged into fewer queries | 5 connections; an 11-operation `Promise.all` runs in 4 waves | 10 to 30 ms on `/tasks/[id]`, `/financials` and `/financials/settings` | Half a day | Low |
| 13 | Budgets in the device check: record JavaScript, HTML and DOM size per route against section 3, report-only at first | Nothing watches size today | Keeps every route inside its budget as features land | Half a day | None; warnings only |
| 14 | Real-user timing in production (Question 6) | Every number here is from a model | Real phone and desktop numbers, and the Interaction to Next Paint figure section 3 asks for | Half a day | Low |
| 15 | Indexes, only when the data needs them | All 8 candidate queries run in 0.07 to 0.91 ms locally; planning costs more than running | None today. Look up production's TaskEvent and Task counts read-only first; if TaskEvent is in the tens of thousands, add TaskEvent(actorUserId, createdAt) and maybe Task(assigneeUserId) | 1 migration when needed | Low |
| 16 | Later: Cache Components and Partial Prefetching (`02-guides/instant-navigation.md`) | Today each visible row prefetches its own URL (14 to 39 requests per page) | One shared shell per route instead of one prefetch per row, and a build-time check that every click is instant | 1 to 2 weeks | High: it changes how every page fetches data. Revisit after 1 to 15 |

Grouped by kind:

- **Routing and caching:** 1, 10 and 16, plus the pending cue in 4.6. Prefetch is already on for every `Link`, and no link turns it off.
- **Server data:** 3, 6, 7, 8, 9, 11, 12 and 15.
- **Client weight:** 2, 4 and 5. The first two are small and remove about 130 KB compressed from every staff page.
- **Keeping it fast:** 13 and 14.

Suggested order: 1 with 2 (the felt change plus the cheapest weight cut), then 3, 4, 9 and the `after()` guard from 8, then 5, 6, 7 and 11, then the rest.

## 6. Decisions

**Connor's calls**

1. **The filter row in a skeleton.** A: draw the real bar inert, with its labels and the view from the URL, no counts. B: keep its height empty, as the Overview's control row does today. Recommended: **A**. Every list reference above draws its toolbar, and the page looks finished sooner.
2. **A tap before the prefetch lands (4.6).** A: the tapped sidebar item or tab takes its current look and a tapped row its hover fill, with no spinner. B: a 2px `--act` line under the top bar after 200 ms. C: nothing. Recommended: **A**. It answers the tap where the finger is, and it never shows for prefetched links.
3. **Task list length.** A: 100 rows and a Show more button that adds 100 at a time. B: keep 400 and render only the rows on screen (virtualized). C: keep 400 as today. Recommended: **A**. It's the smallest change that brings `/tasks` under budget, and the filters already narrow the list. Mobbin turned up no strong Show more example in a first search ([Klaviyo's Prev and Next](https://mobbin.com/screens/211575d4-7ff1-4971-b12d-4e69315a8a5f) is the nearest), so the control gets its own research and options once picked.
4. **Keep a visited page for 30 seconds (fix 10).** Recommended: **yes**. Revisiting is the most common click after Back, and your own edits still show at once.
5. **Edits.** Ticks and status changes already show at once. Recommended: keep that, make the server's half lighter (fix 8), and leave comments as they are (they already show while sending).
6. **Real-user timing (fix 14).** A: Next's `useReportWebVitals` posting to our own small route that writes to the Vercel logs. B: Vercel Speed Insights, a new vendor script. Recommended: **A**. No new vendor, and it's enough to see phone numbers.

**Engineering only** (no call needed): the adapter switch, the query order and parallel queries, `cache()`, zod off the client, lazy upload engine and sheets, the section layouts' `requireUser`, the pool size, the deals query, indexes, and the budget check.

Nothing here gets built until Connor says build it.
