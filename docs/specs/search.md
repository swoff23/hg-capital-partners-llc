# Search and the command palette

Spec for Connor's approval, drafted 2026-10-25 and revised the same day after a check against the code, the guidelines and the cited Mobbin screens (section 7 lists what changed). Sources: the search inventory, the findings in `docs/uiux-review/` and two Mobbin research passes. Nothing here gets built until Connor says "build it" in chat.

Visual rules come from `docs/brand-guidelines.md` (sections 2, 3, 5, 6, 7 and 9). Anything those sections don't cover is marked **new**. Copy follows CLAUDE.md: one line, no filler, no em dashes. Pixel widths for copy were measured in Geist on the running app (14px desktop, 16px touch), not estimated.

## 1. Summary

**What's wrong today**

- Search is a hand-built dropdown under the header field (`src/components/global-search.tsx`). No key opens it. It shows nothing until 2 characters return rows, so the empty, loading, no-match, error and signed-out states are all blank.
- Results are one flat list with a type word. Task rows show only a title, so three "Coordinate closing time" rows look the same and Done tasks look open. Deal rows print the raw stage. Playbook Template rows come back as live tasks.
- 24 rows can run past an 800px laptop screen and can't scroll. On a phone the labels cut to a few characters, the lower rows sit under the keyboard, rows are 38px, and a tap on the page may not close the list on iOS.
- The filters on /tasks, /deals and /contractors each match words differently from global search. Their no-result lines name no filter and offer no way back.

**What replaces it**

- One search body, `SearchPanel`, in three containers: a ⌘K palette on a computer, the same palette anchored under the bar on a tablet, and a full-screen layer on a phone. The header field becomes a field-look trigger in the same slot, so nothing in the layout moves.
- Empty, it offers Recent records, Create and Go to. Typing shows grouped rows with the context to choose: photo tile, status, place, date, stage, price, trade.
- Every row is a real link. Every state says what is happening in one line.
- `/api/search` returns groups with totals, ranks live records first and drops Template rows. The list filters adopt the same matcher, so a "See all" count agrees with the page it opens.
- The pure fixes (Template rows, failed requests, aborting, links, the iOS outside tap, the height cap, the skip link) ship first, in today's component, before any design call.

## 2. The components

### 2.1 SearchTrigger

**New**, in `src/components/command-palette.tsx`. It replaces the `GlobalSearch` input in `src/components/app-shell.tsx` and keeps its slot (`min-w-0 max-w-md flex-1`, after the lockup).

- A React Aria `Button` drawn with `fieldClass` from `ui.tsx`: `--surface`, 1px `--line-control`, `rounded-md`. 36px with a mouse, 44px on touch.
- Leading lucide `Search` at `chromeIconClass` in `--fg-3`, with the 32px left padding section 9 allows when a search icon leads.
- The word "Search" in `text-body` `--fg-3`. That is the whole label (SHELL-037, COPY-035). It is 52px at 16px, so it shows in full at 320.
- Trailing `Kbd` "⌘K" ("Ctrl K" off a Mac), 8px in from the right edge. `Kbd` already hides under `pointer: coarse`. The "/" key works too but isn't printed (FEEL-I05 asked for a "/" keycap; one chip is enough).
- `aria-label="Search"`, `aria-haspopup="dialog"`, `aria-keyshortcuts="Meta+K Control+K /"`.
- No hover style, since fields have none in section 9.
- On touch, the press handler first focuses a hidden proxy input so iOS raises the keyboard inside the tap, then the panel's input takes focus as it mounts and the keyboard stays up. This is a known web workaround, not a documented API, so it needs a check on a real iPhone and iPad before it ships.
- With the phone drawer open, a tap on Search closes the drawer, then opens search.

| Size | Trigger |
|---|---|
| 1280 | Up to 448px wide, 36px, ⌘K chip |
| 768 (touch) | Up to 448px, 44px, 16px text, no chip |
| 375 | About 257px (the bar's 343px less the menu button, the tile and two 12px gaps), 44px |
| 320 | About 202px, 44px. "Search" shows in full |

### 2.2 CommandPalette (the container)

**New** `CommandPalette` in `src/components/command-palette.tsx`, mounted once by `AppShell` with the trigger and the shortcuts. It renders `SearchPanel` inside `Sheet` with a new `layout="palette"` prop (extends `src/components/sheet.tsx`, which already switches at md like the table below). Focus trap, scroll lock, Esc and focus return then stay in the one modal primitive the app already uses.

| Width and pointer | Container | Position and size | Level |
|---|---|---|---|
| Fine pointer, md and up (laptop 1280) | Floating panel | `min(640px, 100vw - 48px)` wide, top at 20vh, centered | Float: `--raised`, 1px `--line-float`, `shadow-float`, `rounded-lg`, no scrim |
| Coarse pointer, md and up (tablet 768, iPad landscape) | Floating panel | Same width, top 16px under the bar (`--app-bar-h`). Height capped by `window.visualViewport`, so the software keyboard never covers the last row | Float, no scrim |
| Below md (phone 375 and 320) | Full screen | `inset-0`, `100dvh`, top padding `env(safe-area-inset-top)`, no radius | `--raised`, no scrim or shadow, since nothing shows behind it |

- Opens and closes at `--dur-0` at every size. Section 7 sets 0ms for the command palette, so the phone gets no sheet slide either.
- The title "Search" is for screen readers only (`hideTitle`, which `Sheet` already has).
- An outside press closes it through React Aria. That replaces the document `mousedown` listener, so a tap on the page closes it on iOS too.
- Opening a result, Esc, Cancel (phone) and an outside press all close it. Closing clears the query.
- One layer at a time. ⌘K and "/" do nothing while a Sheet, ConfirmDialog, Lightbox or the phone drawer is open.
- **New:** the 640px width, the 20vh top and the anchored tablet position. Section 5 puts the command palette at the Float level but sets no size.
- **New:** the phone's full-screen layer. Section 5's Float level casts a shadow and section 9's phone Sheet has `rounded-xl` top corners over a scrim; a full-screen layer needs neither. Proposed for the guidelines as its own line.
- **Exception, for Connor:** CLAUDE.md says menus and popovers size to their content. The palette keeps one fixed width because its content changes on every keystroke, and a width that tracked it would jump while typing. Every palette in the references has a fixed width (Mercury, Superhuman, Magnific, Linear).

### 2.3 SearchPanel (the body every container shares)

**New**, in the same file. It is built on React Aria `Autocomplete` with `ListBox`, `ListBoxSection` and `Header`, which is the build `AssigneePicker` already uses (`src/components/assignee-picker.tsx`). The input keeps focus and the list gets virtual focus, so the arrows and Enter work without moving focus.

From top to bottom:

1. **Input row.** 48px with a mouse, 56px on touch (**new** heights).
   - Leading `Search` icon (16 at 1.5 stroke, 20 at 1.75 on touch, `--fg-3`), centered on the rows' 32px leading-slot column, so the icon, every photo tile and every mark share one vertical line. The typed text starts on the rows' title edge.
   - Input in `text-body`, placeholder "Search or jump to" in `--fg-3`. Borderless inside the panel, the look AssigneePicker's search row already has. A `--line` rule under the row.
   - A clear button (lucide `X`, 44px hit area on touch, `aria-label="Clear search"`) once there is text. WebKit's own cancel button is hidden, as AssigneePicker already does.
   - It is a React Aria `TextField`, not `SearchField`, so Esc reaches the modal and closes it instead of clearing the text.
   - `type="search"`, `enterKeyHint="search"`, `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`, `autoComplete="off"`. 16px text on touch, the iOS zoom guard.
   - **Phone:** the row holds a bordered `SearchInput` (2.9) at 44px, then "Cancel" as a ghost sm button (72px wide on touch), 8px apart, on the 16px gutters. The field is about 208px at 320 and 263px at 375; at 320 that leaves 126px of typing room beside the clear button. The placeholder is "Search", because "Search or jump to" (130px) doesn't fit beside Cancel at 320.
2. **Scope band**, only after "See all" (Choice 2, recommended B). 36px (44 touch). Lucide `ArrowLeft` and "All results" in `text-meta` 500 `--fg-2`, the `BackLink` look, with the total at the right in `--fg-3`: "40 tasks".
3. **List region.** It scrolls.
   - Max height `min(60vh, 480px)` with a mouse (**new**, the SHELL-011 number). On a tablet the visual viewport bounds it. On a phone it fills the screen under the input row.
   - Group headers: `text-meta` 500 `--fg-3`, sentence case, 28px, AssigneePicker's `headerClass`. Each sticks to the top of the list on `--raised` and clips at the input row's rule.
   - Rows (2.4). The highlight is `--fill-2` on `rounded-sm`, the menu and listbox rule inside a raised layer. With a mouse, panel padding 4px plus row padding 8px puts the slot 12px from the panel edge. On the phone, list padding 8px plus row padding 8px puts the slot on the 16px gutter, so the field's search icon and the slot share a center at x 32.
   - A group with more than 4 matches ends in a "See all 40 tasks" row: 40px (48 touch), `text-body` `--fg-2`, no mark, its text on the title edge.
4. **Footer.** Fine pointer, md and up only. 36px (**new**), a `--line` rule above, `text-meta` `--fg-3` with `Kbd`: "↑↓ Move", "↵ Open", "⌘↵ New tab", "Esc Close", 16px apart. Mercury, Devin and Magnific print the same four.

A visually hidden `aria-live="polite"` line reads "12 results", "No matches for elmwood" or the error line once each request settles. Today screen readers hear nothing.

### 2.4 SearchRow

**New**, in the same file. One anatomy for every type: a 32px leading slot, a 12px gap, the title, then the meta, then two fixed columns at the right edge.

- **One line** when the panel is 480px or wider, measured with a container query on the panel, not the viewport: 40px with a mouse and 48px on touch (section 5 density). The meta follows the title with an 8px gap; the title truncates first, then the meta.
  - **Status column**, 100px (104 touch), left-aligned. Section 9 asks every status to read as glyph plus one word in a fixed column, so the word sits here, not after the title: the task status, the deal stage, or the contractor's Inactive tag. It fits the longest word, "4 - To Schedule" (92px at 13px).
  - **Edge column**, 80px (88 touch), right-aligned and tabular: a task's date or a deal's asking price. A task's assignee avatar sits just before it, as section 5's one-line task rows set.
- **Two lines below 480px**, 60px, the section 5 phone row. The status word leads the subline in the mark's tone (section 9).
- Title in `text-body` `--fg-1`. Meta in `text-meta` `--fg-3`.

| Type | Leading slot | Title | Meta (one line) | Status column | Edge column | Below 480: line 2 |
|---|---|---|---|---|---|---|
| Property | `PhotoThumb` 32, decorative (`alt=""`). The House tile for now: no property photo field exists yet (the uploads spec adds it) | `shortAddress(address) \|\| address`, the Portfolio name (IA-I14) | Unit count (`propertyUnitCount`) and owner: "4 units · HG Buffalo Holding 1 LLC" | Empty | Empty | "4 units". The owner drops |
| Task | `StatusMark`, 14px (16 touch), centered in the slot | Title. Canceled is struck through in `--fg-3` | The property's or deal's short address | Status word in `STATUS_TONE` | Assignee `Avatar` 20 (an outline square for a contractor), then the date from `dayLabel`, plain text. Overdue (`isOverdue` in `lib/tasks/list.ts`) is the real date in `--danger`. Undated leaves the column empty: the task list's "Due date" chip is a button and can't sit inside a link | Line 1 keeps the date at the right. Line 2 is "Review · 767 Prospect Ave" with the avatar at the right (section 5 task rows) |
| Deal | `DealStageMark` | Short address | Empty | Stage name in the `DealStage` tone (`--fg-2`, Closed `--ok`) | Asking price (`theirPrice`) as `Money`, `text-meta` `--fg-2` | Line 1 keeps the price at the right. Line 2 is the stage |
| Contractor | `Avatar` 24 with `outline` (the contractor square) | Full name | Trade and company: "Plumbing · Ortiz Plumbing" (`cleanTrades`) | An "Inactive" Tag when the contact isn't active | Empty | Trade only; the company drops. The Tag stays at the right |
| Go to | The page's lucide icon from `nav.tsx` (16, 20 touch, `--fg-3`) | Page name | Parent section when it's a tab: "Financials" | Empty | Empty | The parent section |
| Create | Lucide `Plus` | "New task", "Apply playbook", "New deal", "New property" | The record it applies to, when there is one: "767 Prospect Ave" | Empty | Its key, once SHELL-052 ships | The record. A one-line 48px row when there is none |
| Add as a deal | Lucide `Plus` | 'Add "12 Elmwood Ter" as a deal', with the words as typed | Empty | Empty | Empty | One line, 48px (216px at 16px, fits at 320) |

- **Deal stage names** print as stored ("2 - Medium", "CLOSED!"), the same as the deals list's `DealStage`. Renaming them belongs to the deals spec.
- **Contractor phone.** IA-010 asked for trade and phone. The row shows trade and company, since a phone number can't be a tap target inside a row that is already a link, and the contractor page has the tel: link one tap away.
- **Matched field** (phase 5). When a hit came from a field the row doesn't show, the meta names it: "Lender · M&T Bank", "Policy 88-1203", with the code in `text-code` `--fg-2`. Never the `Code` copy button, since that would put a button inside a link. Mesh and Stripe Dashboard iOS show the matched field this way.
- **Matched words** in the title: Choice 4.
- **Links.** Every row is a `ListBoxItem` with `href`, which React Aria renders as an `<a>` (checked in `react-aria-components` 1.21.1). Hovering shows the URL, and ⌘-click and middle-click open a new tab (SHELL-012). A `RouterProvider`, the pattern in `src/components/public/header.tsx`, sends plain clicks and Enter through `router.push`, by way of `useLeaveGuard()` so a held page still asks first.

### 2.5 Empty query: Recent, Create, Go to

The order is Recent, then Create, then Go to.

**Recent**
- The last 5 records this person opened anywhere in the app (properties, deals, tasks, contractors), newest first, as SearchRows.
- On an iPhone SE (375 by 667) about three of the five show above the keyboard (an estimate from Safari's chrome and keyboard heights; check on the device). The first drag in the list drops the keyboard and shows the rest.
- Kept on the server (RecentView, 2.10), so Connor's laptop and phone share one list.
- Recent records, not recent searches. MOBILE-008 asked for recent searches, but a record opens in one tap where a past search needs a second. Linear Mobile, Todoist and Notion show recently viewed records.
- Opening a record puts it on top next time, which closes the loop on what you just did.
- With no recents, one line in `text-meta` `--fg-3`: "Search by address, name or task." Apple HIG asks the empty field to say what's searchable. At 14px it is 212px wide, so it fits at 320.
- Fetched when the palette opens, then held in memory for the session and refreshed after each navigation, so a reopen is instant. On the first open only, 5 static `--fill-1` skeleton rows hold its place.

**Create**
- New task (`/tasks/new`), New deal (`/deals/new`), New property (`/properties/new`). There is no New contractor route, so SHELL-031's third item waits for the forms spec.
- On a property page the list leads with "New task" and "Apply playbook", each with the address as meta: `/tasks/new?propertyId=` and `/templates?property=`, the link the property page's own Apply playbook button uses. On a deal page it leads with "New task" for the deal (`/tasks/new?dealId=`). All three params already work.
- The palette reads the page from the path (`usePathname`), not from Recent, so a /tasks visit never labels a row with the last record you opened. The address comes from the matching Recent row, which `recordView` wrote when the page loaded. If that row isn't there yet, the meta reads "This property" or "This deal".
- These rows don't replace a global New button in the shell (SHELL-031, IA-009), which belongs to the forms spec.

**Go to**
- Home, Deals, Portfolio, Financials, Rent roll · Financials, Settings · Financials, Tasks, Contractors, Playbooks, Settings, Move-in form · Settings, Storage · Settings.
- Names match the sidebar and the tabs. Playbooks has no other link outside a property page's Apply playbook.
- The list lives in `src/lib/commands.ts` (**new**), with a test that every href is a page under `src/app/(app)`.

**One character** filters Recent, Create and Go to on the client by word start. The server still waits for 2.

### 2.6 States

| State | What shows | Copy |
|---|---|---|
| Open, empty query | Recent, Create, Go to | Header words only |
| First open, Recent loading | Create and Go to at once, 5 static skeleton rows for Recent (no shimmer, section 7) | None |
| One character, nothing local matches | One line in `--fg-3` | "Keep typing to search records." |
| Typing, first request, nothing on screen yet | 3 static skeleton rows shaped like the finished row | None |
| Typing, rows on screen | The rows stay until new ones arrive, with no flash to empty. After 200ms the leading icon becomes a `Spinner` and stays at least 400ms (section 7), so the clear button never moves | None |
| Results | Groups in a fixed order: Properties, Tasks, Deals, Contractors. 4 rows each, then "See all N" | "See all 40 tasks" |
| A command's label starts with the query | Up to 3 Go to or Create rows lead the list ("rent" puts Rent roll first) | None |
| No match | One line in `text-body` `--fg-3` in the list | 'No matches for "elmwood".' |
| No match, address-shaped query (a house number, then a word) and no property or deal matched | The line, then one Create row that opens New deal with the address filled in | 'Add "12 Elmwood Ter" as a deal' |
| No match in a scope, hits elsewhere | The line, then one row back to what did match | 'No tasks match "elmwood".' then "See 3 deals" |
| Request failed or offline | The old rows clear. Recent, Create and Go to stay, since they don't need the server | "Search didn't load." with a Retry button (secondary, sm) |
| Signed out (401) | The old rows clear | "You're signed out." with a Sign in button (primary, sm) to `/login?next=` the current path |
| A late response for an older query | Cancelled by an AbortController, never shown | None |

- **Group order.** Properties lead because there are 11 and each is the building itself; Tasks follow as the daily work (2,086 of them); then Deals and Contractors. Today's order is Property, Deal, Contractor, Task.
- **4 rows per group** answers SHELL-002 (5) against SHELL-011 (4): at 4, the first two groups and a "See all" fit in the 480px list.
- There is no generic "Create task" fallback on a miss, per the IA-I10 verification.
- `/deals/new` reads `?address=` for the Add row (a small extension of `new-deal-form.tsx`).
- `Spinner` is **new** (2.13). It closes part of the "Loading state" gap in `docs/components.md`.

### 2.7 Keyboard

| Key | Where | Does |
|---|---|---|
| ⌘K, Ctrl+K | Anywhere in the staff app, inside a field too | Opens the palette. Pressed while open, closes it |
| / | When focus isn't in a text field, select or contenteditable | Opens the palette |
| ↑ ↓ | In the palette | Move the highlight and wrap. With a mouse, the first row is highlighted as results arrive |
| Enter | In the palette | Opens the highlighted row in this tab |
| ⌘Enter, Ctrl+Enter | In the palette | Opens it in a new tab (check in the build) |
| Esc | In the palette | Closes it. One Esc, one layer |
| Backspace on an empty input | Narrowed to one type | Back to All results |
| Tab, Shift+Tab | In the palette | Move between the input, the clear button and the scope band. Focus stays inside |

- One `keydown` listener on `document`, owned by `CommandPalette`. It ignores keys during IME composition and while another modal layer is open.
- G-then-letter navigation, C for New task and a "?" shortcuts sheet come later (SHELL-052). Command rows then print their keys, as Superhuman's do.

### 2.8 Touch

- No hover anywhere. A row fills `--fill-2` only while pressed (`data-pressed`). `Kbd` and the footer are hidden.
- Nothing is highlighted until an arrow key moves the highlight, so the keyboard's Search key has no row to open: it blurs the input and drops the keyboard, and every row is then in view. On an iPad with a hardware keyboard, the arrows and Enter still work.
- Targets: rows 48 (one line) or 60 (two lines), "See all" 48, Cancel 44, clear 44.
- The first drag in the list blurs the input too, as native lists do.
- The list's bottom padding follows `visualViewport`, so the last row clears the keyboard.
- **Known gap:** Android Back leaves the page, the same as every Sheet today, and the palette adds no history entry. Material 3 closes a search view on system Back; matching it means a history entry for every Sheet, which belongs to its own change.

### 2.9 SearchInput (the field for filter bars)

**New** `SearchInput` in `src/components/search-field.tsx`, on React Aria `SearchField`. It replaces three hand-rolled copies: the deals filter field, the tasks filter field and AssigneePicker's search row.

- Leading lucide `Search` (`chromeIconClass`, `--fg-3`) with 32px of left padding (36 on touch, as the deals field has today). A clear button once there is text. The native WebKit cancel button is hidden, as AssigneePicker already does.
- **Esc.** On a page (filter bars) Esc clears the text; a field isn't a layer. Inside a layer (`bare`, AssigneePicker's popover or sheet) Esc closes the layer in one press, as the palette does. Today AssigneePicker's first Esc only clears the text.
- `variant="field"`: the `fieldClass` look. `size="sm"` is 32px and `"md"` 36px with a mouse; both are at least 44px on touch.
- `variant="bare"`: borderless, for a row inside a popover (AssigneePicker).
- `type="search"` and `enterKeyHint="search"`.
- **Names.** The accessible name starts with the visible words (WCAG 2.5.3, label in name): placeholder "Search tasks", `aria-label="Search tasks"`. That fixes the deals field, which shows "Find a deal" but is named "Filter by address".
- Placeholders: "Search tasks" (96px at 16px), "Search deals" (95px), "Search contractors" (139px), "Search accounts" (123px). AssigneePicker keeps "Search". Each names its list, so it never reads like the header's "Search" on the same screen.
- **Fit at 320.** "Search deals" fits beside the deals Filters button (111px of room). "Search tasks" doesn't fit in today's /tasks phone row, which leaves the field 101px and 53px of text room beside the status switch. Choice 6 settles it.

### 2.10 Data: /api/search, the matcher and Recent

**Request**
- `GET /api/search?q=&type=&limit=`. No `type` means All. `limit` is 4 in All and 20 in one type.
- `GET /api/search/recent` (**new**) for Recent.
- Both are staff only through `getCurrentUser` and answer 401 otherwise, so portal sessions never reach them. A test covers the portal case.

**Response**

```ts
type SearchResponse = {
  groups: {
    type: "property" | "task" | "deal" | "contractor";
    total: number; // every match, for "See all 40 tasks"
    rows: SearchRow[];
  }[];
};

type SearchRow = { id: string; href: string; title: string } & (
  | { type: "property"; units: number | null; owner: string | null }
  | { type: "task"; status: TaskStatus; due: Ymd | null; overdue: boolean; place: string | null;
      assignee: { name: string; contractor: boolean } | null }
  | { type: "deal"; stage: string; asking: string | null }
  | { type: "contractor"; trade: string | null; company: string | null; active: boolean }
); // phase 5 adds matched?: { label: string; value: string; code: boolean }
   // the property photo field (uploads spec) adds photo: string | null
```

**Matching.** `lib/search.ts` keeps its rules: every word must match some field in any order, accents fold on the query side, street words match both ways, 6 words at most, 2 characters at least.

**What comes back**
- Tasks spread `excludeTemplateTasks` from `src/lib/task-scope.ts` (the plan calls it `taskScope`), with the test `docs/asana-migration-plan.md:241` asks for. Template rows never appear.
- Contractors: all of them, inactive ones ranked last and marked with a Tag.
- Deals: every stage. In All, a CLOSED! deal whose `convertedPropertyId` points at a property already in the Properties group folds into that property: the deal row drops there and stays in the Deals scope. Today `convertedPropertyId` is empty on all 11 closed deals, so a backfill list goes to Connor first (IA-I13).

**Ranking** (**new** `rankRows` in `lib/search.ts`, tested)
1. Live before finished. Active tasks, then Done, then Canceled (`STATUS_ORDER`). Active contractors before inactive. Deals in `ACTIVE_DEAL_STATUSES` before the rest.
2. Then match quality on the title: exact, then starts with the query, then a word starts with a query word, then contains, then matched another field.
3. Then most recently updated.

Candidates are up to 40 per type ordered by `updatedAt` (tasks: up to 30 active and 10 closed, two queries), ranked in JS, then cut to the limit. The total comes from `count()` with the same `where`. A ranked SQL query is worth it only if that pool proves too small.

**Requests.** 180ms debounce on the client. An `AbortController` cancels the previous request. The previous rows stay until the new response lands.

**Searched later** (phase 5, IA-I03): lender, loan servicer, insurance carrier and policy number, loan number, LLC owner, unit labels (the `label` in the units JSON only), listings (their title, landing on the property), contractor phone (`phoneE164` digits) and email, task descriptions, deal notes, document filenames and playbooks. Lockbox codes are never searchable: unit search reads `label`, never `lockboxCode`.
- Accents stored in the data ("José") need Postgres `unaccent` or a folded column (**new**, a migration). AssigneePicker already ignores accents on the client; after this the server agrees with it.
- A typo fallback ('No exact matches for "Tamarak". Close matches:', as Klarna does) needs `pg_trgm` (**new**, a migration).

**RecentView** (**new** table, needs Connor's OK)

```prisma
enum RecentKind { PROPERTY DEAL TASK CONTACT }

model RecentView {
  id       String     @id @default(cuid())
  user     User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId   String
  kind     RecentKind
  recordId String
  viewedAt DateTime   @default(now())

  @@unique([userId, kind, recordId])
  @@index([userId, viewedAt])
}
```

- RLS on, per the README's rules of the road.
- One service writes it: `recordView(userId, kind, id)` in `src/lib/recent-views.ts` (**new**). The four record pages call it inside Next's `after()` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`), so no page waits on it. It upserts `viewedAt` and keeps the newest 20 per person.
- `/api/search/recent` reads it and skips records deleted since, and Template tasks.
- It stays apart from `TaskReadState`, which means unread, not recent, and covers tasks only.
- Why the server: a per-browser list would split between Connor's laptop and his phone.

### 2.11 Filtered lists: one matcher, counts, no-result states

- **One matcher.** /tasks `q` matches the title, the property and deal address and the assignee, through `searchTerms` and `everyTermMatches` with the same fields as `/api/search`. /deals `q` runs the address through `searchTerms`, so "Prospect Avenue" finds "Prospect Ave". /contractors does the same on name, company and trades. "See all 40 tasks" then opens a page showing those 40.
- **/deals counts.** While `q` is set, the segment counts come from the same `where` with the query applied, so they change as you type (DEALS-012). The view stays as picked.
- **/contractors count.** With `q` set the subtitle reads "4 of 52 contractors", so the number never changes without a reason.
- **Cap lines.** /deals reads "Showing first 300 of 675. Search or filter to see the rest.", with the live total (today it points at "the address filter", which the new field no longer names). /tasks keeps "Showing first 400 of N. Narrow the filters to see the rest."
- **No-result states.** `EmptyState`: one sentence, then one secondary sm action. Linear's "16 issues hidden by filters" with Clear filters and Stripe's Clear filters are the pattern.

| Page | Query set | Filters only | Nothing at all |
|---|---|---|---|
| /tasks | 'No tasks match "roof".' with Clear filters | "No tasks match these filters." with Clear filters | Today's line stays |
| /deals | 'No Active deals match "prospect".' with "Show 18 in All" (switches to the All view). If no stage has one: 'No deals match "prospect".' with Clear search | Same pattern with Clear filters | Today's line stays |
| /contractors | 'No contractors match "luis".' with Clear search | None | "No contractors yet." |
| /financials/settings accounts | 'No accounts match "util".' with Clear search | None | None |

### 2.12 Sizes at a glance

| | 1280 (mouse) | 768 (touch) | 375 | 320 |
|---|---|---|---|---|
| Trigger | 448px max, 36px, ⌘K chip | 448px max, 44px, no chip | About 257px, 44px | About 202px, 44px |
| Container | Float panel, 640px, top at 20vh | Float panel, 640px, 16px under the bar, bounded by the visual viewport | Full screen | Full screen |
| Input row | 48px, borderless | 56px, borderless | 56px: field about 263px plus Cancel | 56px: field about 208px plus Cancel |
| Rows | One line, 40px, status and edge columns | One line, 48px | Two lines, 60px | Two lines, 60px; a title gets about 175 to 190px beside the date |
| Footer hints | Yes | No | No | No |
| Group cap | 4, then See all | 4 | 4 | 4 |
| Recent above the keyboard | All 5 | All 5 | About 3 at 375 by 667 | About 2 at 320 by 568 |

**What drops on the phone:** the footer and every `Kbd`, the ⌘↵ new-tab hint, the property owner, the contractor's company, and any secondary clause that would wrap. Status, place, date, stage, price and the assignee stay.

### 2.13 Tokens

| Part | Tokens and classes |
|---|---|
| Palette surface | `--raised`, 1px `--line-float` (`--line` light, `--line-strong` dark), `shadow-float`, `rounded-lg` |
| Phone layer (**new**) | `--raised`, no radius, no scrim, no shadow |
| Icons | `chromeIconClass`: 16px at 1.5 with a mouse, 20px at 1.75 on touch, `--fg-3` |
| Input and placeholder | `text-body` `--fg-1`, placeholder `--fg-3`, `--line` rule under the row |
| Group header | `text-meta` 500 `--fg-3`, sentence case |
| Row | Title `text-body` `--fg-1`, meta `text-meta` `--fg-3`, highlight `--fill-2` `rounded-sm` |
| Task status | `StatusMark` and the word in `STATUS_TONE`, in the status column. Canceled title struck through in `--fg-3` |
| Deal stage | `DealStageMark` tones: `--fg-2`, Closed `--ok`, Pass the slashed ring |
| Overdue date | `--danger` |
| Price | `Money`, tabular, `text-meta` `--fg-2` |
| Codes (phase 5) | `text-code` `--fg-2` |
| Inactive | The Tag look: no fill, `--line-strong` edge, `--fg-2`, `text-micro`, 22px. A neutral chip inside a listbox row takes this look (section 9) |
| Keycaps | `Kbd` |
| Spinner (**new**) | Lucide `LoaderCircle` at icon size in `--fg-3`, shown after 200ms for at least 400ms (section 7). Under reduced motion it holds still |
| Skeleton | Static `--fill-1`, no shimmer |
| Motion | `--dur-0` to open and close |

### 2.14 References

Re-opened on 2026-10-25 through Mobbin search and confirmed to show what's claimed are marked ✓. The rest come from the first research passes and weren't re-opened.

- **Palette:** ✓ [Mercury palette](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445) (scope chips, "No results found" with an action, footer "Navigate", "Open page", "Open in new tab"), ✓ [Airtable](https://mobbin.com/screens/99cfd691-0aed-451d-8138-7beff8915c7a) (a field-look "Search… ⌘K" trigger in the top bar), ✓ [Mercury home](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1) (field-look "Search for anything" trigger over the content column), ✓ [Magnific](https://mobbin.com/screens/e22e26e2-f813-4f1e-beda-43c9ecf26419) (Recents and Quick actions in one palette, keys on commands, footer hints with "Open in new tab"), ✓ [Mistral AI](https://mobbin.com/screens/8450c1c7-7c10-40a3-9af3-c9c234ac4b53) (Create rows above a "Go to" navigation group), ✓ [Devin](https://mobbin.com/screens/e37a4e69-9a61-4f36-803d-edbd89c1229d) (rows that carry their location, "Settings > Review"), ✓ [Superhuman](https://mobbin.com/screens/85dc5994-9360-428d-9092-7425e070ed7f) (command rows print their keys), [Mercury flow](https://mobbin.com/flows/1d51be38-aff7-4a34-835d-8c50f89f4fd5), [Hex](https://mobbin.com/screens/9b8b928c-3fd7-48f1-82a9-97140d853f9f), [Linear onboarding](https://mobbin.com/screens/1e783aca-8b8e-4ae5-994d-284a8ddae491) (⌘K as the main way to act), [Linear shortcuts](https://mobbin.com/flows/239089b5-97e5-4698-af22-ae79d337538c) (⌘K and "/"), [Attio](https://mobbin.com/screens/fa567c5a-616d-4991-88fc-e2a047b5fcfd), [Attio record picker](https://mobbin.com/screens/3d3a3b51-40bb-4201-b526-e69acf4540ba), [Vapi](https://mobbin.com/screens/593d7acd-2e16-4365-bcd6-02ce52f48f3b), [Remote](https://mobbin.com/screens/2c863fcf-aab8-4a14-a85d-c6839d1b40f8), [Better Stack](https://mobbin.com/screens/612a14fd-8951-4043-ae81-836d97b21d92) ("/" chip).
- **Recent:** [Todoist](https://mobbin.com/screens/4121eb20-aa88-4eef-9cc2-dfa7c4ccb4fa), [Notion](https://mobbin.com/screens/b1273bdd-d65d-44be-a422-ffc0f601bacd), [Height](https://mobbin.com/screens/093bf6f5-7485-445c-9f52-5115ef06001d), [Linear Mobile](https://mobbin.com/screens/e9b4ccc3-e76f-4594-acc4-1a43828e8e39), [Citizen](https://mobbin.com/screens/302f59a7-5927-4f12-862c-fa21cf1bf68d), ✓ [Rodeo iOS](https://mobbin.com/screens/98911313-9499-41ac-9a9b-fb2ed93f32cd) (recent items as two-line rows with thumbnails).
- **Rows:** ✓ [Stripe grouped dropdown](https://mobbin.com/screens/52cb922e-1017-4096-aa61-201cd6b58ef9) (type headers, status badges and dates at the right, "Show all results for"), [Airbnb iOS two-line rows](https://mobbin.com/screens/e419a24e-88d9-4d59-966a-aa39e3f04d78), [Mesh](https://mobbin.com/screens/ae10cfe7-db64-4960-8217-c7cdd19ff3e5) and [Stripe Dashboard iOS](https://mobbin.com/screens/2ab0bd2c-69ba-4757-b393-8faaadb7f189) (the matched field under a row).
- **Phone layer:** ✓ [Whatnot iOS](https://mobbin.com/screens/04990389-27ab-46d9-a522-0f2961ba0996) and ✓ [Monzo iOS](https://mobbin.com/screens/a352fbe2-deb9-4fd9-a3b3-f9bccd07d438) (field with a clear button, Cancel beside it, the keyboard's Search key), ✓ [Neo Financial iOS](https://mobbin.com/screens/f2f00bc6-fc04-4579-a85b-aa3433a878c0) ("Search bills" names its list), [Mercury iOS](https://mobbin.com/screens/9fbf4e7d-5678-4aa5-8620-f0566d08f0a3), [Mercury iOS typing](https://mobbin.com/screens/095ff631-3218-4b60-a7f5-a74d710540d9), [Mercury iOS skeletons](https://mobbin.com/screens/f0d19b48-c4fa-4fc2-9cdc-bf999b23836e), [Airbnb iOS](https://mobbin.com/screens/5cd0573d-5a2b-4b6d-a1ff-27945084c8ad), [Neuecast](https://mobbin.com/screens/b84de9dc-821c-4f38-8be5-94854b2b2f40) (a quiet spinner under the field), [Apple HIG search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields), [Material 3 search](https://m3.material.io/components/search/guidelines).
- **States:** ✓ [folk](https://mobbin.com/screens/88bfa6c2-d2a2-4b42-9f86-0d8bf29a02fd) (the miss names the query and offers Create "alex"; scope counts point to the other type), ✓ [Canny](https://mobbin.com/screens/983517a9-4e00-4d4f-91e9-a52927f7b5a8) (a miss offers "create a new entry instead"), ✓ [Linear](https://mobbin.com/screens/d0b98680-66e2-47d4-9dc4-28bc9450c27f) ('No results found for "designnn"'), [Whop](https://mobbin.com/screens/ad2d9bda-bf8a-43b1-9e33-d0c7cc733b9f) (a miss in one scope points to the others), [Klarna](https://mobbin.com/screens/29b53ce2-dd12-4a4f-96fc-cf7054af006d) (typo fallback, later).
- **Filtered lists:** ✓ [Linear](https://mobbin.com/screens/d3ab0127-662f-4764-9c84-511cd7345e27) ("16 issues hidden by filters" with Clear Filters), [Linear](https://mobbin.com/screens/c15e23d9-67b4-4a87-af34-117ae648c266), [Stripe](https://mobbin.com/screens/2b2d5f4f-bdd9-4186-b383-e3b30140a551) (Clear filters in the filter row), [Mercury transactions](https://mobbin.com/flows/40884fc4-8db7-4c0a-afe6-8946f2c1e36e) ("Search all transactions" lands on the list under a filter).
- **Dropped:** [Revolut Business](https://mobbin.com/screens/2ac099a6-40ee-4766-9362-8bfd6fb19cf9) for the create row on a miss (not found again; folk and Canny show it), the Linear filters screen `90b0ca17` (the confirmed one is `d3ab0127`), and the Mercury trigger `dbf9eb63` for "Search or jump to" (Mercury's bar reads "Search for anything" today; Airtable shows the chip).

## 3. Design choices

Six real choices. 1 to 4 need a pick before the palette step, 6 before the list step. 5 doesn't block this spec.

Legend for the previews: `⌕` search icon, `▣` property photo tile (the House tile today), `○ ◔ ● ◑` status and stage rings, `Z` a 20px avatar. Previews are monospace, so they truncate sooner than real Geist does.

### Choice 1. The desktop container

**A. ⌘K palette from a field-look trigger (recommended).**

Laptop 1280, typed "prospect":

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⌕  prospect                                                           ✕  │  48
├──────────────────────────────────────────────────────────────────────────┤
│ Properties                                                               │  28
│  ▣  767 Prospect Ave  4 units · HG Buffalo Holding 1 LLC                 │  40 each
│  ▣  647 Prospect Ave  2 units · HG Capital Partners LLC                  │
│ Tasks                                                                    │
│  ◔  Fix porch light  767 Prospect Ave             Review     Z    Oct 30 │
│  ○  Coordinate closing time  99 Prospect Ave      To do      C     Today │
│  ○  Coordinate closing time  647 Prospect Ave     To do      C     Nov 4 │
│  ●  Replace smoke detectors  767 Prospect Ave     Done       L    Sep 12 │
│     See all 40 tasks                                                     │
│ Deals                                                                    │
│  ◑  99 Prospect Ave                               2 - Medium    $425,000 │
├──────────────────────────────────────────────────────────────────────────┤
│ [↑↓] Move   [↵] Open   [⌘↵] New tab   [Esc] Close                        │  36, mouse only
└──────────────────────────────────────────────────────────────────────────┘
```

Laptop 1280, empty, on a property page:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⌕  Search or jump to                                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ Recent                                                                   │
│  ◔  Fix porch light  767 Prospect Ave             Review     Z    Oct 30 │
│  ▣  767 Prospect Ave  4 units · HG Buffalo Holding 1 LLC                 │
│  ◑  99 Prospect Ave                               2 - Medium    $425,000 │
│  ...                                                                     │
│ Create                                                                   │
│  +  New task  767 Prospect Ave                                           │
│  +  Apply playbook  767 Prospect Ave                                     │
│  +  New deal                                                             │
│  +  New property                                                         │
│ Go to                                                                    │
│  ⌂  Home                                                                 │
│  ▤  Rent roll  Financials                                                │
│  ...                                                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ [↑↓] Move   [↵] Open   [⌘↵] New tab   [Esc] Close                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Tablet 768, touch layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡] [HG] HG Capital   [ ⌕ Search                         ]           │  52 bar
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│      ┌────────────────────────────────────────────────────────┐      │  16px under the bar
│      │ ⌕  prospect                                         ✕  │      │  56
│      ├────────────────────────────────────────────────────────┤      │
│      │ Properties                                             │      │
│      │  ▣  767 Prospect Ave  4 units · HG Buffalo Holding 1 L…│      │  48 each
│      │ Tasks                                                  │      │
│      │  ◔  Fix porch light  767 Pros…  Review     Z    Oct 30 │      │
│      │     See all 40 tasks                                   │      │
│      └────────────────────────────────────────────────────────┘      │
│  ░░░░░░░░░░░░░░░░░░░░░░ software keyboard ░░░░░░░░░░░░░░░░░░░░░░░    │
└──────────────────────────────────────────────────────────────────────┘
```

Phone 375 and 320:

```
┌────────────────────────────────────┐
│ [⌕ prospect           ✕]  Cancel   │  56
├────────────────────────────────────┤
│ Properties                         │  28
│ ▣  767 Prospect Ave                │  60 each
│    4 units                         │
│ ▣  647 Prospect Ave                │
│    2 units                         │
│ Tasks                              │
│ ◔  Fix porch light          Oct 30 │
│    Review · 767 Prospect Ave     Z │
│ ○  Coordinate closing time   Today │
│    To do · 99 Prospect Ave       C │
│    See all 40 tasks                │  48
└────────────────────────────────────┘

┌───────────────────────────────┐
│ [⌕ prospect     ✕]  Cancel    │
├───────────────────────────────┤
│ Tasks                         │
│ ◔  Fix porch light     Oct 30 │
│    Review · 767 Prospe…     Z │
│ ○  Coordinate closin…   Today │
│    To do · 99 Prospect…     C │
└───────────────────────────────┘
```

- Desktop: one place to find, jump and create. 640px leaves room for the place, the status column, the assignee and the date, which task rows lack today. It fixes the 800px overflow on its own.
- Tablet: anchored under the bar, so the keyboard never covers the input. Same rows at 48px.
- Phone: the same body full screen, which fixes unreadable labels, rows under the keyboard, 38px rows and the iOS outside tap in one build. In real Geist at 320, "Coordinate closing time" (173px) fits beside "Today".
- Matches the Asana cutover plan (week 2, ⌘K and shortcuts) and the guidelines, which already list the command palette at the Float level and at `--dur-0`.
- Cost: the biggest build here, a commands list to keep current, and one extra layer for mouse users. The field-look trigger keeps that layer from feeling like a step.

**B. Inline dropdown under the header field.**

Laptop 1280:

```
[HG] HG Capital  [ ⌕ prospect                         ✕ ]
                 ┌──────────────────────────────────────┐
                 │ Properties                           │
                 │  ▣  767 Prospect Ave  4 units        │
                 │ Tasks                                │
                 │  ◔  Fix porch light  Review   Oct 30 │
                 │  ○  Coordinate clos…  To do    Today │
                 │     See all 40 tasks                 │
                 │ Deals                                │
                 │  ◑  99 Prospect Ave  2 - Med…        │
                 └──────────────────────────────────────┘
```

Tablet 768:

```
┌────────────────────────────────────────────────────────────────────┐
│ [≡] [HG] HG Capital   [ ⌕ prospect                      ✕ ]        │
├────────────────────────────────────────────────────────────────────┤
│                       ┌────────────────────────────────────┐       │
│                       │ Properties                         │       │
│                       │  ▣  767 Prospect Ave  4 units      │       │
│                       │ Tasks                              │       │
│                       │  ◔  Fix porch light  Review Oct 30 │       │
│  ░░░░░░░░░░░░░░░░░░░░░░░ software keyboard ░░░░░░░░░░░░░░░░░░░     │
└────────────────────────────────────────────────────────────────────┘
```

Phone 375:

```
┌────────────────────────────────────┐
│ [≡] [HG]  [ ⌕ prospect        ✕ ]  │
├────────────────────────────────────┤
│   opens the same full-screen       │
│   layer as option A, so the        │
│   phone needs it either way        │
└────────────────────────────────────┘
```

- Desktop: the smallest change. Today's component moves onto React Aria `ComboBox` and `PopoverSurface` with the height cap and link rows. But at 448px the status column, avatar and date leave the title and place about 160px, so the place drops off task rows, and Go to and Create don't sit well in a panel hanging off a field.
- Tablet: the panel hangs under the bar, and with the keyboard up only 3 or 4 rows show.
- Phone: it still needs the full-screen layer, so this is two layouts to keep. A later ⌘K palette would mean building search twice.
- References: ✓ [Stripe](https://mobbin.com/screens/52cb922e-1017-4096-aa61-201cd6b58ef9), [GitHub](https://mobbin.com/screens/7b69b36d-15c3-43c2-9a67-fe19ddbe98ad), [Shopify](https://mobbin.com/screens/ff3011d8-d1eb-4891-b255-b12a07922d19).

A dedicated `/search` results page (✓ [Stripe](https://mobbin.com/screens/3a15e105-2b7d-4857-9fb6-478731427ebb), ✓ [Linear](https://mobbin.com/screens/dba91946-d147-4b2f-ad92-4195eae017fc)) isn't an option for now. It earns its place once documents, notes and property facts are searchable (phase 5), and it would sit behind either option.

**Recommendation: A.** One body serves every size, it is the only option with a place for Go to and Create, and B's phone needs A's full-screen layer anyway.

### Choice 2. How you narrow to one type

**A. A scope row under the input, with per-type totals** (SHELL-I11).

Laptop 1280 and tablet 768:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⌕  prospect                                                           ✕  │
├──────────────────────────────────────────────────────────────────────────┤
│ [ All | Properties 2 | Tasks 40 | Deals 19 | Contractors 0 ]             │  44 touch, SegmentedControl sm
│ Properties                                                               │
│  ▣  767 Prospect Ave  4 units · HG Buffalo Holding 1 LLC                 │
│ Tasks                                                                    │
│  ◔  Fix porch light  767 Prospect Ave             Review     Z    Oct 30 │
│  ...                                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

Phone 375 and 320, where five segments can't fit:

```
┌────────────────────────────────────┐
│ [⌕ prospect           ✕]  Cancel   │
├────────────────────────────────────┤
│ [All ▾]                            │
│ Properties                         │
│ ▣  767 Prospect Ave                │
│    4 units                         │
└────────────────────────────────────┘
```

- Visible from the start, one click per type, and the totals show where the hits are.
- Costs a 44px row and five more Tab stops. The phone needs a second control, a menu button, as [Linear Mobile](https://mobbin.com/screens/ce539bef-e6ae-4c4e-9656-840a33df6ec2) does, since CLAUDE.md doesn't let a control row wrap or squeeze. The totals repeat the "See all 40" count, which the copy rules ask us not to do.
- References: ✓ [Mercury palette](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445) (chips that scroll sideways), ✓ [Linear search page](https://mobbin.com/screens/dba91946-d147-4b2f-ad92-4195eae017fc) (All, Issues, Projects, Documents), ✓ [folk](https://mobbin.com/screens/88bfa6c2-d2a2-4b42-9f86-0d8bf29a02fd) (People 1, Companies 0), [Zoom](https://mobbin.com/screens/0fb8d124-739c-4436-a2a0-c9a8fbfd1c9c), [Whop](https://mobbin.com/screens/ad2d9bda-bf8a-43b1-9e33-d0c7cc733b9f).

**B. "See all N" narrows the list in place (recommended).**

Laptop 1280 and tablet 768, after "See all 40 tasks":

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⌕  prospect                                                           ✕  │
├──────────────────────────────────────────────────────────────────────────┤
│ ← All results                                                   40 tasks │  36 (44 touch)
│  ◔  Fix porch light  767 Prospect Ave             Review     Z    Oct 30 │
│  ○  Coordinate closing time  99 Prospect Ave      To do      C     Today │
│  ...  up to 20, scrolling                                                │
│     Open in Tasks                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Phone 375 and 320:

```
┌────────────────────────────────────┐
│ [⌕ prospect           ✕]  Cancel   │
├────────────────────────────────────┤
│ ← All results             40 tasks │
│ ◔  Fix porch light          Oct 30 │
│    Review · 767 Prospect Ave     Z │
│ ...                                │
│    Open in Tasks                   │
└────────────────────────────────────┘
```

- All results shows groups only. "See all 40 tasks" swaps the list for up to 20 tasks, under a band with "All results" on the left and the total on the right. "All results" or Backspace on an empty input goes back. Esc still closes the palette.
- "Open in Tasks" opens `/tasks?q=prospect` (`/deals?q=` with the All view, `/contractors?q=`), once the list filters share the matcher (build step 4). Mercury's "Search all transactions" lands the same way.
- One model at every size, no extra control, and each count shows once.
- Less visible than A until the first "See all". The band reuses the `BackLink` look. The pattern is ✓ [Stripe](https://mobbin.com/screens/52cb922e-1017-4096-aa61-201cd6b58ef9)'s grouped dropdown, whose "Show all results" leads to a page with a "View N results" link per group (✓ [Stripe results page](https://mobbin.com/screens/3a15e105-2b7d-4857-9fb6-478731427ebb)), and [LinkedIn](https://mobbin.com/screens/0af69829-c83d-4fcd-a42b-6038cdb6b57c)'s per-group Show all.

**Recommendation: B, against the lean of the research.** Chips are the more common pattern in the references (Mercury, Linear's search page, folk), and SHELL-I11's verification asked for them in the palette. B still wins here: HG has four types and four rows per group, so every group is already on screen; at 320 chips need a second control; and the chip totals repeat each "See all" count. If Connor prefers A, the scope row is a contained addition on top of B's band.

### Choice 3. The phone top bar

**A. Keep the field-look trigger in the bar's middle (recommended).**

```
┌────────────────────────────────────┐
│ [≡] [HG]  [ ⌕ Search             ] │  52, --canvas
└────────────────────────────────────┘
```

- Section 3 holds as written: "the 52px phone top bar's middle holds search". Only the placeholder changes, so "Search" shows in full at 320. A tap opens the full-screen layer.
- The bar still shows no page title, so MOBILE-007 stays partly open.
- Desktop and tablet: unchanged.
- References: ✓ [Mercury home](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1) (the same field-look trigger on the web), [Mercury iOS](https://mobbin.com/screens/9fbf4e7d-5678-4aa5-8620-f0566d08f0a3), [Airbnb iOS](https://mobbin.com/screens/5cd0573d-5a2b-4b6d-a1ff-27945084c8ad).

**B. Page title in the bar, with a search icon and "+" (IA-020).**

```
┌────────────────────────────────────┐
│ [≡]  Tasks                [⌕]  [+] │  52, title 17/22 600
└────────────────────────────────────┘
```

- The bar says where you are, as iOS does. The guidelines already allow it: if search becomes an icon, the bar shows the page title at 17/22, 600 once the h1 scrolls under it.
- It needs the title-collapse work, and "+" is the global New (SHELL-031), which belongs to the forms spec.
- Desktop and tablet: unchanged. The tablet could adopt it later.
- References: [N26](https://mobbin.com/screens/c4c4ed50-dda0-4bb5-94fe-25fbdb685a45), [Mercury iOS large title](https://mobbin.com/screens/ad20eb69-7c68-4d3b-b0bb-7eb11c3e60e7).

**C. A Search tab in a bottom tab bar.**

```
┌────────────────────────────────────┐
│ [≡] [HG]  Tasks                    │
├────────────────────────────────────┤
│   (page)                           │
├────────────────────────────────────┤
│  Home  Tasks  Deals  Search  More  │  49 + safe area
└────────────────────────────────────┘
```

- Search is always in thumb reach, and a real `/search?q=` route lets Back return to the results.
- Section 9 says a bottom tab bar is not part of this rollout. It changes every page's chrome and the device-check baselines, and it sits against iOS Safari's own bottom bar.
- Desktop and tablet: no change, or the tablet gets the bar too, which is another call.
- References: [Stripe Dashboard iOS](https://mobbin.com/screens/1bbd2264-d144-4b19-a4dc-b466f97c251f), [Jobber](https://mobbin.com/screens/ca646634-c05a-4c02-a02c-24495ab96393).

**Recommendation: A.** It is the only option inside the current guidelines, and the layer behind it is the same for B and C, so it can move later without rework. A field docked above the keyboard (Linear Mobile, iOS 26) was ruled out: a web page has to track `visualViewport` on every frame and it jitters in iOS Safari.

### Choice 4. Marking the typed words in a title

The same at every size.

```
A  767 Prospect Ave         nothing marked
B  767 Prospect Ave         "767 Pro" at weight 600, the rest at 400
C  767 Prospect Ave         "767 Pro" underlined
   ───────
```

- **A.** No new rule. Rows still explain themselves through the place and the matched-field meta.
- **B (recommended).** The common scan aid: ✓ [Grok](https://mobbin.com/screens/b9bb6f18-1cd9-48ee-af83-b70d1ce1147f) ("Logo **Revamps**"), ✓ [Revolut](https://mobbin.com/screens/10d7f011-6421-436d-8fa9-b0748494d390) (the matched word bold in titles and snippets), [HubSpot](https://mobbin.com/flows/d1ec2d0e-9a05-49db-9dcf-c5a63ba36eb1), [Linear search](https://mobbin.com/screens/a2f96ae5-202c-4747-a959-d33d7e5c0f72). **New** to the guidelines: weight here marks emphasis inside a title, not a state, and it never touches toggles. Title only, never the meta. One helper, so it's one line to drop.
- **C.** [Mercury iOS](https://mobbin.com/screens/095ff631-3218-4b60-a7f5-a74d710540d9) underlines. In this app an underline means a link (TextLink), and every row is already a link, so it reads as a second link.
- A highlight fill, as ✓ [Stripe](https://mobbin.com/screens/52cb922e-1017-4096-aa61-201cd6b58ef9) and [Hex](https://mobbin.com/screens/9b8b928c-3fd7-48f1-82a9-97140d853f9f) use, is out: it would be a color with no state job.

**Recommendation: B.**

### Choice 5. Where the desktop trigger lives (doesn't block this spec)

The trigger works in any slot. This is SHELL-027 and IA-017, a shell layout call.

```
A  keep today's header
[HG] HG Capital  [ ⌕ Search            ⌘K ]                  ◐
──────┬──────────────────────────────────────────────────────
 rail │    Tasks  (content gutter at x 96)

B  Stripe style: the sidebar runs full height, the bar spans only the content
[HG] HG Ca… │ [ ⌕ Search            ⌘K ]                     ◐
 rail       ├──────────────────────────────────────────────
            │ Tasks  (search and h1 share the gutter)

C  Linear and Attio style: search at the top of the sidebar, no header
[HG] HG Capital │ Tasks
[ ⌕ Search  ⌘K ]│
 Home           │
 Deals          │
```

- A: no layout move. The field's left edge (about x 139) still misses the content gutter (x 96).
- B: the search and the h1 share an edge, the lighter of the two fixes ([Stripe](https://mobbin.com/screens/e8ddbdc5-bc89-454f-9ebb-846905b83df4), ✓ [Mercury](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1)).
- C: drops the 56px header ([Linear](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab), [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5), [Vercel](https://mobbin.com/screens/1950d5ad-a87a-43ed-96aa-2eacb59e2586)).
- Tablet and phone: unchanged in all three; the bar keeps its trigger.

**Recommendation: A for this build, then B in its own shell spec.**

### Choice 6. The /tasks filter bar (blocks step 4)

Today /tasks is 36px with a mouse and 48 on touch, the deals bar 32 and 44 (VISUAL-036). On a phone /tasks is two rows (MOBILE-009), and at 320 its search field is 101px wide beside the status switch, 53px of room for "Search tasks" (96px).

**A. Match the deals bar at every size (recommended).**

```
1280   [⌕ Search tasks      ]        [ All | Open | Done ] [All assignees ▾] [All properties ▾]   32
768    [⌕ Search tasks      ]  [ All | Open | Done ] [All assignees ▾] [All properties ▾]         44
375    [⌕ Search tasks                ] [⚙ Filters 1]                                             44
320    [⌕ Search tasks       ] [⚙ Filters 1]
```

- The status switch moves to `SegmentedControl` sm, which `docs/components.md` already names for filter bars; `md` is for a page's main switch. Both bars are then 32px with a mouse and 44 on touch.
- Below sm, the deals pattern: search plus a Filters button with a count Badge, opening a Sheet with Show (All, Open, Done), Assignee and Property, and a pinned Done. At 320 the field is about 159px, room for "Search tasks".
- Cost: on a phone, Open and Done move one tap away. The list says which view it shows through the count Badge and the cap line.
- Reuses `DealFilters`' Sheet layout and `filterRowClass` (`deals/status-multiselect.tsx`), which move to `components/` on this second use.

**B. Keep today's layout and shorten the phone placeholder.**

```
375    [⌕ Search tasks    ] [ All | Open | Done ]       48
       [All assignees ▾ ] [All properties ▾ ]
320    [⌕ Search ] [ All | Open | Done ]
       [All assign… ▾] [All proper… ▾]
```

- Below 360 the placeholder is "Search" (52px in 53px of room) with `aria-label="Search tasks"`. Status stays one tap away.
- The bars keep different heights, and at 320 the page shows two fields that both read "Search" (the header trigger and this one).

**Recommendation: A.** It answers VISUAL-036 and MOBILE-009 with a layout the app already ships, and "Search tasks" reads in full at 320. The tasks list spec can still move Status back out if Connor wants it one tap closer.

## 4. Migration map

"Needs OK" marks a visual change that waits for Connor. "Fix" is a data, logic or accessibility bug fixed directly. "Done" is already on main.

### Every staff page: the shell header

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| GlobalSearch input (`global-search.tsx`, `app-shell.tsx:98-100`) | `SearchTrigger` in the same slot, opening `CommandPalette` | ⌘K and "/" open search from anywhere. The field reads "Search" with a ⌘K chip. One click opens the palette with the cursor in it | Needs OK (Choices 1 and 5) |
| Results dropdown and rows | `SearchPanel` and `SearchRow` | Grouped rows with the photo tile, status, place, date, stage and price. Done and Canceled look finished. Ranked live first. Links open in new tabs | Needs OK (Choices 1, 2, 4) |
| Empty, loading, too-short, no-match, error, signed-out states | The states table (2.6), plus a live region | Every state says one line. A miss on an address offers 'Add "12 Elmwood Ter" as a deal'. Signed out offers Sign in | Needs OK |
| Recent records (not built) | Recent in the empty palette, from RecentView | The last 5 records opened, on laptop and phone alike | Needs OK, plus the schema |
| Command palette (not built) | Create and Go to in `CommandPalette`, from `src/lib/commands.ts` | New task, Apply playbook, New deal and New property from anywhere. Playbooks, Rent roll, Move-in form and Storage are one search away | Needs OK |
| Phone search at 375 and 320 | The full-screen layout of the same palette | Readable rows, Cancel, the Search key and a drag drop the keyboard, 44px and up targets, a tap outside always closes | Needs OK (Choice 3) |
| Outside close on `mousedown` | React Aria's outside press | Fixes the iOS tap that leaves the list open. Can ship in today's component first (`pointerdown`) | Fix |
| No max height, `overflow-hidden` | `min(60vh, 480px)` and scrolling | Every row can be reached on an 800px laptop. Can ship in today's component first | Fix |
| Rows are buttons calling `router.push` | Links (`ListBoxItem href`) | ⌘-click, middle-click and the hover URL work. Can ship first as `Link` rows | Fix |
| `type="text"`, no `enterKeyHint` | `type="search"`, `enterKeyHint="search"` | The phone's return key reads Search | Fix |
| Failed or 401 response keeps the old rows (G2D-006) | Rows clear, then the error or signed-out line | No stale results under new text | Fix (the copy lands with the palette) |
| Old requests never aborted (SHELL-035) | `AbortController` | Fewer wasted requests | Fix |
| Search and seven nav links come before the content in tab order (IA-045) | A "Skip to content" link, visible only on keyboard focus, and focus on the h1 after a route change | Keyboard and screen reader users reach the page in one Tab | Fix (no visual change) |

### /api/search and the matcher

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| Task query with no Template filter (`route.ts:36-47`) | `...excludeTemplateTasks` plus the test from `asana-migration-plan.md:241` | Playbook Template rows stop showing up as live tasks | Fix, first |
| No `orderBy` | `rankRows`: live first, then match quality, then most recent | The open task comes before the done one with the same title | Fix |
| Status, due date, place not returned | The grouped response (2.10) | Feeds the rows | Fix |
| Contacts not filtered by `active` | Inactive ranked last with a Tag | Old contractors still findable, clearly marked | Fix (the Tag lands with the palette) |
| No totals | `total` per group | "See all 40 tasks" | Fix |
| Closed deal and its property both return (IA-I13) | Backfill `convertedPropertyId` (list reviewed by Connor), then fold | One row per building in All | Data fix first, then Fix |
| Stored accents, deeper fields, typo fallback | Phase 5 (2.10) | "José", lender, policy and loan numbers, units, listings, notes, filenames | Later, migrations |

### /tasks

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| `set()` writing `/tasks/all?…` | Already builds `/tasks?…` (`filters.tsx:45`, landed in 2a07648) | No redirect per keystroke | Done |
| `Input type="search"`, "Filter by title…" | `SearchInput`, "Search tasks", leading icon, clear button | Matches the deals field. Reads in full at 320 with Choice 6A (today "Filter by t") | Needs OK (Choice 6) |
| Status `SegmentedControl` md, 36 and 48px; two rows on a phone (VISUAL-036, MOBILE-009) | Choice 6 | One bar height across lists; one row on a phone | Needs OK (Choice 6) |
| `q` on the title only (`queries.ts:73`) | `searchTerms` over title, property and deal address and assignee | The same words find the same tasks here and in the palette | Fix |
| "No tasks match." | 'No tasks match "roof".' with Clear filters | Says why, offers the way back | Needs OK |
| WebKit's own cancel button | Hidden; `SearchInput` draws one clear button | One clear control in every browser | Fix |
| No result count, only the cap line (TASKS-039, partly) | The cap line stays; a count belongs to the tasks list spec | None here | None |
| Scoped property header repeating the select (TASKS-039) | Stays for now | No change. Belongs to the tasks list spec | None |

### /deals

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| Hand-built field with icon, "Find a deal" vs `aria-label` "Filter by address" | `SearchInput` sm, "Search deals", matching name | Same look, a clear button, the right name for screen readers | Fix (name), Needs OK (placeholder) |
| One `contains` on the address (`page.tsx:64`) | `searchTerms` | "Prospect Avenue" finds "Prospect Ave", any word order | Fix |
| Segment counts ignore the query (`page.tsx:91`) | Counts with the query applied | "Active 1 · All 19" tells you where the hits are | Fix |
| "No deals match." | 'No Active deals match "prospect".' with "Show 18 in All" | One tap to the hits in other stages | Needs OK |
| "Showing first 300. Use the address filter to narrow." | "Showing first 300 of 675. Search or filter to see the rest." | Names the control that's on screen | Fix (wrong copy) |
| Sort on phones (MOBILE-I02), filter chips for asking, units and town (DEALS-I07) | Not in this spec | None | Deals list spec, later |

### /contractors

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| `?q` read with no field on screen | `SearchInput` md, "Search contractors", above the table (ADMIN-024) | The directory can be searched without editing the URL | Needs OK |
| Silent subtitle count | "4 of 52 contractors" while filtered | The count says why it changed | Fix |
| "No contractors." for a miss | 'No contractors match "luis".' with Clear search | Doesn't read as an empty directory | Needs OK |
| One `contains` OR | `searchTerms` | Same matching as the palette | Fix |
| Trade filter | Later, after the trades cleanup (ADMIN-023) | None yet | Later |

### Task and playbook pickers (/tasks/[id], /tasks/new, /templates/[id]/apply)

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| AssigneePicker's search row on legacy aliases (`text-sm`, `text-muted`, `border-border`, `h-4 w-4`) | `SearchInput` bare, on `text-body`, `text-meta`, `--fg-3`, `--line`, `chromeIconClass` | 16px text on touch as everywhere else; otherwise the same | Fix (applies approved guidelines) |
| Esc with text in AssigneePicker clears the text and leaves the popover open | One Esc closes the popover or sheet | One Esc, one layer | Fix |

### /financials/settings

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| About 90 account rows, no search (FINANCIALS-050) | `SearchInput` md, "Search accounts", over `AccountCategoryTable`, filtering on the client | Type "util" to reach one account. Grouping stays with the financials spec | Needs OK |

### Create forms (/tasks/new, /deals/new)

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| No match-while-typing (G2B-I10, DEALS-038) | The forms spec owns the line under the field. For deals it should reuse `findDuplicateDeal` (`lib/deals/service.ts:39`), which already matches on `streetKey` and `sameStreetAddress`; for tasks, `/api/search?type=task&limit=1` | A possible duplicate shows before submit | Forms spec |
| `/deals/new` ignores `?address=` | Reads it into the address field | 'Add "12 Elmwood Ter" as a deal' lands prefilled | Fix |
| Entity find-or-add combobox (PORTFOLIO-021) | The forms spec can reuse `SearchRow`'s anatomy and `SearchInput` bare | None here | Forms spec |

### Lists with no search field (/properties, /templates, Home)

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| Portfolio (11), Playbooks, Home | No in-page search. Go to Playbooks in the palette | Playbooks one search away; nothing else changes | None |

### Outside the staff shell (portal /p, public site, /login)

| Instance | Becomes | What changes for the user | Kind |
|---|---|---|---|
| No staff search, by design | Stays. `/api/search` stays staff only, with a test that a portal session gets 401. The palette mounts only in `AppShell` | None | Fix (test) |
| Portal Done tab with up to 500 jobs | Proposal: a "Search jobs" `SearchInput` over the Done list, filtering the contractor's own jobs by address on the client, as Mercury filters Transactions in place ([Mercury iOS](https://mobbin.com/screens/a7432ddf-83b9-4ca1-b451-1704f18afe41)) | A contractor finds a past job by address | Needs OK, can ship on its own |
| Public /rentals | No filter at its size | None | None |

### Not in this spec

- Stepping to the next record in the list you came from (FEEL-I01) belongs to the record pages.
- Record actions in the palette (IA-I08) wait for a registry, per its verification.

### docs/components.md

| Instance | Becomes | Kind |
|---|---|---|
| "Search with a results dropdown" row (line 49) | Rows for `CommandPalette`, `SearchTrigger`, `SearchPanel` and `SearchRow`, and `SearchInput`, in the same commit | Docs |
| "Old popovers" gap and the outside-click duplicate | Removed once `GlobalSearch` is gone | Docs |
| "Loading state" gap | `Spinner` row; the skeleton rule noted | Docs |
| Filter-bar field sizes (the "Text field" duplicate, line 171) | Points at `SearchInput` sizes | Docs |
| `DealStage` row note | `DealStage` and `DealStageMark` move to `src/components/deal-stage.tsx` on this first use outside `/deals` | Docs |
| Checklist popover row ("Deals only; move before a second use") | `filterRowClass` and the Filters sheet layout move to `components/` if Choice 6A is picked | Docs |

### Order of work

0. **Fixes now, in today's component, no design call:** Template exclusion and its test, the portal 401 test, live-first ordering, clearing rows on failure and 401, `AbortController`, link rows, the height cap, `pointerdown` for the outside close, `type="search"` and `enterKeyHint`, the live region, the deals `aria-label` and cap line, the skip link (IA-045).
1. **The grouped API:** response shape, totals, row context, `rankRows`. Today's dropdown can read it flattened until step 2.
2. **The palette at every size**, after Choices 1 to 4 are picked: `SearchTrigger`, `CommandPalette` with `Sheet layout="palette"`, `SearchPanel`, `SearchRow`, Create and Go to, ⌘K and "/", `Spinner`. Phone and desktop ship together, since the trigger replaces the field at every width at once.
3. **Recent**, after the schema OK: `RecentView`, `recordView`, `/api/search/recent`.
4. **One matcher in the lists**, after Choice 6: `SearchInput`, the shared matcher on /tasks, /deals and /contractors, the counts and no-result states, "Open in Tasks", the accounts field, the /tasks bar.
5. **Later:** deeper fields (IA-I03), stored-accent folding, the typo fallback, the deal and property fold after the backfill, G-then keys and the "?" sheet (SHELL-052), record actions in the palette (IA-I08), a `/search` page, the portal job search if approved.

Each UI step runs `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`. The sweep only loads default states, so step 2 adds scripted states to `tests/devices` (**new**): open the palette empty, type "pro", type "zzzz", at every device and width, in WebKit and Chromium. Step 4 adds the /tasks Filters sheet open at 375 and 320. The 401 and failure lines get unit tests. Opening on a real iPhone checks that the keyboard rises on the first tap and how many Recent rows show above it.

## 5. Reuse check

**Reused as is**
- React Aria `Autocomplete`, `ListBox`, `ListBoxItem` (with `href`), `ListBoxSection`, `Header`, `TextField`, `SearchField`: the AssigneePicker build.
- `RouterProvider` for client-side links, the pattern in `src/components/public/header.tsx`.
- `useLeaveGuard` (`src/components/leave-guard.tsx`), so a held page still asks before a result opens.
- `Kbd`, `fieldClass`, `chromeIconClass`, `EmptyState`, `Button` (`ui.tsx`).
- `PhotoThumb` 32 (the fallback tile until property photos exist), `StatusMark`, `STATUS_TONE`, `STATUS_LABEL`, `Avatar` with `outline`, `Money`.
- `shortAddress`, `sameStreetAddress` (`lib/normalize.ts`), `propertyUnitCount` (`lib/property-types.ts`), `cleanTrades` (`lib/contacts.ts`), `dayLabel` (`lib/dates.ts`), `isOverdue` and `assigneeName` (`lib/tasks/list.ts`), `findDuplicateDeal` (`lib/deals/service.ts`, for the forms spec).
- `searchTerms`, `everyTermMatches`, `foldAccents` (`lib/search.ts`).
- `excludeTemplateTasks`, `STATUS_ORDER`, `ACTIVE_STATUSES` (`lib/task-scope.ts`), `ACTIVE_DEAL_STATUSES` (`lib/config.ts`).
- `useCoarsePointer`, `usePathname`, the existing `/tasks/new?propertyId=` and `?dealId=` params, `/templates?property=`, `/login?next=`.
- `BackLink`'s look for the scope band, AssigneePicker's `headerClass` for group headers.
- `Sheet` with `hideTitle`, and `DealFilters`' Filters sheet layout for /tasks (Choice 6A).

**Extended**
- `Sheet` gets `layout="palette"`: full screen below md, a Float panel from md (centered with a mouse, anchored under the bar on touch).
- `/api/search`: groups, totals, row context, ranking, the Template filter, `type` and `limit`.
- `lib/search.ts`: `rankRows`.
- `DealStage` and `DealStageMark` move from `app/(app)/deals/stage-select.tsx` to `src/components/deal-stage.tsx` on this first use outside `/deals`. `StageSelect` stays in deals.
- The Tag look moves into `ui.tsx` as `tagClass` on this third use (it's inlined in `status-multiselect.tsx` and `assignee-picker.tsx` today).
- `TaskFilters`, `DealFilters` and the contractors page adopt `SearchInput` and the shared matcher. `AssigneePicker` adopts `SearchInput` bare and the guideline tokens.
- `new-deal-form.tsx` reads `?address=`.
- `tests/devices` gains scripted states.

**New**, each with a `docs/components.md` row in the same commit
- `src/components/command-palette.tsx`: `CommandPalette`, `SearchTrigger`, `SearchPanel`, `SearchRow`, and the ⌘K and "/" listener. Traces to Mercury, Magnific, Mistral, Devin, Superhuman, Linear and Stripe (2.14) and the guidelines' Float level and `--dur-0`.
- `src/components/search-field.tsx`: `SearchInput`. Traces to the deals field (leading icon), Apple HIG's search field with a clear button, and Neo Financial's list-named placeholder.
- `src/lib/commands.ts`: Go to and Create. Traces to Mistral's Create rows over a Go to group and Devin's located rows.
- `Spinner` in `ui.tsx`. Traces to section 7's spinner timing and [Neuecast](https://mobbin.com/screens/b84de9dc-821c-4f38-8be5-94854b2b2f40).
- `RecentView` table, `src/lib/recent-views.ts` and `/api/search/recent`. Traces to Linear Mobile, Citizen, Todoist, Notion and Rodeo's recently viewed.
- **New sizes and rules**, proposed for the guidelines: palette 640px wide at 20vh, a fixed width as an exception to "size to content"; tablet anchored 16px under the bar; the phone's full-screen layer (no radius, scrim or shadow); input row 48 / 56px; footer 36px; list max `min(60vh, 480px)`; the row's 100px status and 80px edge columns; matched words at 600 (if Choice 4B).
- Later: `unaccent` and `pg_trgm` migrations (phase 5).

## 6. Open questions for Connor

Only what blocks building.

1. **Choices 1 to 4.** Recommended: 1A (the ⌘K palette), 2B ("See all" narrows in place, though chips are more common in the references), 3A (keep the field-look trigger in the phone bar), 4B (typed words at 600). These block step 2.
2. **The palette's fixed 640px width and the phone's full-screen layer**, two exceptions to current rules (popovers size to content; sheets have top corners and a scrim). Recommended: yes to both. These block step 2.
3. **The RecentView table.** A new table with RLS, written when a record page loads, so Recent follows you between laptop and phone. Recommended: yes. This blocks step 3 only.
4. **Choice 6, the /tasks filter bar.** Recommended: 6A (the deals bar at every size, Filters sheet on phones). This blocks step 4.
5. **The "Needs OK" rows in section 4** outside the palette: the new placeholders and clear buttons on the /tasks and /deals fields, the search field on /contractors, the accounts search on Financials settings, the no-result lines, and the portal's "Search jobs" on the Done tab. Recommended: yes to all, portal included. These block step 4 only.

## 7. What changed in this revision

- The /tasks URL fix is already on main (2a07648), so it left step 0.
- Status words and deal stages moved into a fixed column on one-line rows, as section 9 asks; undated tasks leave the date column empty.
- The response no longer promises a property photo: no such field exists yet.
- Phone sizes are measured: Cancel 72px, the field about 208px at 320, about three Recent rows above an iPhone SE keyboard (not five).
- "Search tasks" doesn't fit today's /tasks phone row, so Choice 6 settles the bar, along with VISUAL-036 and MOBILE-009.
- Mobbin links were re-checked. Linear's search page uses scope chips and Stripe marks matches with a fill, so Choices 2 and 4 now cite what the screens show; three unconfirmed links were replaced.
- Added: Apply playbook as a Create row, the IA-045 skip link, the deals cap line, one Esc in AssigneePicker, the Android Back gap, and the findings this spec doesn't own.
