# Lens: information architecture and global SaaS patterns

Part of the [UI/UX review](README.md). 31 findings: 0 critical, 6 high, 17 medium, 8 low.

## How it should work

HG's information architecture should feel like Mercury with Linear's keyboard: a short labeled sidebar, one search box that knows the business, and records that carry their own actions.

Navigation. A pinned sidebar holds Home, Tasks, Deals, Properties (the 11 addresses beneath it, per D10), Contractors and Financials, with Find and New at the top. That follows Vercel's sidebar Find field (https://mobbin.com/screens/abbadfbe-0db6-453b-b9bc-ccb7ce2d60ed) and Mercury's quiet sidebar (https://mobbin.com/screens/f964f8c4-c630-406a-b599-585edf376533). Settings drills into its own grouped list from the account menu, like Mercury's (https://mobbin.com/screens/0bba63f7-93ad-4385-872c-0d97249f019a). Each property has one display name used everywhere. On phone and tablet the labeled bar keeps four destinations, search gets its own button, and the last slot expands into the full section list (Shopify https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a, Linear Mobile https://mobbin.com/screens/2d1fdc3c-3758-46bb-88e1-5cfd39ce4148). A property's title doubles as a switcher among the 11 (Shopify https://mobbin.com/screens/ff016813-d7d7-4e02-b27d-4170390b6225).

Search becomes the fastest way to any fact. It forgives Street versus St, word order and accents, never shows playbook templates, and indexes what partners look up: lender, servicer, carrier, policy and loan numbers, entity, unit labels, document names and notes. Scope chips narrow it, every group ends in "See all", rows are real links, and an unknown address offers "Add as a deal". All of this comes from Mercury's palette (https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6, https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445). Cmd+K opens on recent records and prints each command's key, as Superhuman does (https://mobbin.com/screens/85dc5994-9360-428d-9092-7425e070ed7f).

Records carry their actions. Each record type defines one action list. The header's overflow menu, a row's right-click and Cmd+K all read from it, like Linear's record menu (https://mobbin.com/screens/b4e6b70d-27e2-4853-8d0b-b44ab3d54967) and Jobber's More Actions (https://mobbin.com/screens/1e4846b8-cb8a-40eb-9491-54c8db93960f). The list includes Remind me, so a parked deal comes back to Home on a date without becoming a task (Linear https://mobbin.com/screens/b67521b4-2e36-473d-ab67-81b33a6bbbe7).

Home stays the one queue. Contractor updates, reviews and reminders land there. Clearing an item is personal, so one partner's triage never hides work from the other (Front https://mobbin.com/screens/a25fd5f3-a74a-4abc-b5f5-11b38cb684fa).

Lists stay honest and creation stays in place. A remembered filter always says what it hides, as Linear does (https://mobbin.com/screens/c15e23d9-67b4-4a87-af34-117ae648c266), and the create sheet has Save and add another for a walkthrough punch list (Basecamp https://mobbin.com/screens/18714ac3-b916-4e7b-a05c-08dc67872aff). A Hide figures switch masks money and codes when the phone is passed to someone else (Mercury https://mobbin.com/screens/dbf9eb63-dcfe-4876-965a-e8a6d8702092).

Left out on purpose: saved views, favorites, a notification bell, a global audit log and a catch-all More tab.

<details><summary>What the reviewer covered</summary>

Live production build at http://localhost:3200 (up the whole session), signed in as Connor, Chromium only (WebKit not run). Routes exercised at desktop 1280 and mobile 375, with the accessibility tree captured for each: /, /deals, /deals/cmtg25yd8002cjphs49ovlvob, /deals/cmtg25yds004djphspig5encw, /deals/new, /properties, /properties/cmtg25y4p0006jphsv3frndk6 (also tablet 768, narrow 320 and scrolled), /properties/new, /tasks, /tasks?property=..., /tasks?status=all&q=..., /tasks/cmtg25z7s048mjphsikewzpy1, /tasks/new, /contractors, /contractors/cmtg25y9x000djphsbqty81fr plus both Steves and both Davids, /financials, /financials/rent-roll, /financials/settings, /settings, /settings/move-in-form, /settings/storage, an unknown URL (/nope-404) and a missing record (/deals/doesnotexist). Home was also captured at tablet 768 and in dark mode at desktop and mobile. /properties was captured at wide 1920. I fetched all 11 property pages to compare unit counts against the Portfolio table. Shell states exercised: sidebar hover-expand, avatar click (no menu opens), the mobile drawer open plus Esc, Cmd+K and '/' (neither does anything; focus stays on BODY), global search for 767, zack, plumb, closing and zzqx, ArrowDown and Escape inside the search dropdown, BackLink behavior coming from a filtered list and from Home, sidebar navigation resetting list filters, and /api/search probes. Not reached: the contractor portal (not built yet), sign-in and sign-out redirect flows, WebKit rendering, and the property editor dialogs (other units cover those). Every write was blocked by the helper. Mobbin: 19 searches across web and iOS (Linear, Stripe, Attio, Mercury, Vercel, Todoist, Zillow Rentals, Jobber, Deel, Remote, Copilot Money, IHG, Angi, Zendesk, Salesforce and others). Ramp returned no screens, so no Ramp citations. Screenshots are in IA/.

Mobbin returned this notice with every search:
---

**Your Mobbin AI usage is high this month**

Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect. [View usage and plan options](https://mobbin.com/settings/billing-and-usage)

</details>

## Findings

### IA-002

**Back link drops the list's filters and can go somewhere its label doesn't name**

High · Fix · effort S · `Every detail page (deal, property, task, contractor)` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Probes were run on :3300 in Chromium. The /tasks/new back-to-form case couldn't be clicked through because writes are blocked; it's inferred from the code and the Next docs.
- **Today:** The original probe now passes. Opening /deals?status=all&q=prospect, then a deal, then '← Deals' returns to /deals?status=all&q=prospect, because BackLink calls back() whenever the document has moved on from its first URL (back-link.tsx:13-19). The label still doesn't follow the destination. From 118 Congress St., opening a task and clicking '← Tasks' lands on /properties/cmtg25y4k0002jphsxww4tv6k. A new form, from code: createTask's redirect is a push in a Server Action (tasks/actions.ts:73, and Next's redirect docs say push is the default there). So after '+ Task' on a property, '← Tasks' on the new task goes back to the /tasks/new form. A detail page loaded directly falls back to the bare section root ('/deals').
- **Why:** Triaging 675 deals or 193 open tasks becomes a loop of re-applying filters after every record. Stripe and Linear always return you to the exact list and scroll position.
- **Change:** Keep the branch's back() logic, but make the label name the real destination. Record the previous in-app path in sessionStorage on client navigation, and label from it ('← 118 Congress St.' or '← Tasks'). On a direct load, fall back to the remembered list URL rather than the bare root. Redirect after create with RedirectType.replace so Back skips the form.
- **Desktop, tablet, phone:** Same behavior everywhere. On phone it is the top-left back chevron in the title bar.
- **Reuse:** Extend src/components/back-link.tsx; it later becomes the breadcrumb parent link (IA-018).
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): The 'Customers >' parent link sits above the title and leads back to the list.
- **Code:** `src/components/back-link.tsx:12-14`, `Probe: /deals?status=all&q=prospect, open a deal, click '← Deals', land on /deals`, `docs/components.md (Navigation and tabs: Back to the list)`, `branch: src/components/back-link.tsx:5-41`, `branch: src/app/(app)/tasks/actions.ts:73`, `branch: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:29-31`, `backlink run: start /deals?status=Pass, referrer ""; after a deal click the path is /deals/cmtg25ypw01d2jphsspcqfkfb with referrer ""; after '← Deals' the path is /deals (filter lost)`, `src/components/back-link.tsx:12-15`, `docs/components.md:75`, `src/components/back-link.tsx:15-20 (cameFromApp via performance navigation entry)`, `eval backlink-deals: start /deals?status=Pass, referrer ''; after back: /deals?status=Pass`, `eval backlink-tasks: after back: /tasks/all?status=done`, `probe: referrer http://localhost:3200/deals → '/' → task /tasks/cmtg25ysv01qkjphson9qulmp → click '← Tasks' → location.pathname '/'`, `src/components/back-link.tsx:11-15`, `src/components/back-link.tsx:15-42`, `src/app/(app)/tasks/[id]/view.tsx:75`, `src/app/(app)/contractors/[id]/page.tsx:54`, `src/app/(portal)/p/jobs/[id]/page.tsx:46`, `probe: / → click 'Upload signed [428] lease to Baselane' → /tasks/cmtg25z4l03owjphs40manisq → click '← Tasks' → location.pathname '/'`
- **Also found as:** FEEL-V01 (Lens: interaction quality, feedback, states, speed and accessibility), COPY-V02 (Lens: words on every screen)
- **Verification:** confirmed. Reproduced: /deals?status=all&q=prospect, open a deal, click the back link, land on /deals with filters gone (document.referrer was empty). Because client navigation never updates document.referrer, any session opened from a bookmark or new tab loses filters on every back link, which is the common case for a signed-in user. Stripe ref is plausible.

### IA-003

**Creating a duplicate address silently throws away what was typed**

High · Fix · effort S · `New deal and New property` · Every save is safe, instant and undoable · quick win

- **Today:** If the address already exists, createDeal and createProperty redirect to the existing record with ?dup=1. Nothing in the app reads 'dup'. createDeal returns before saving anything, so the prices, units, listing URL and next action that were just typed are lost, and the user lands on an older record (often a Pass) with no explanation.
- **Why:** There are 675 deals and two partners entering them, so re-entering a known address is likely. Silent data loss on a create flow is the opposite of the 'close the loop' house rule.
- **Change:** Check the address while it's typed, using normalizeAddress. Show one line under the field: 'Already in Deals: 29 Livingston St · Pass · Mar 2025. Open it', and hold Create until the user picks. If a submit still hits a duplicate, the existing record shows a notice ('This address was already in Deals. Nothing new was saved.') and puts the entered values into the note composer so nothing is lost.
- **Desktop, tablet, phone:** The inline line fits one row at 375 by shortening to 'Already in Deals · Open'; the notice spans full width.
- **Reuse:** normalizeAddress in src/lib/normalize.ts; Field helper-line pattern; the quick-create sheet in IA-009.
- **References:** 
  - [Dub](https://mobbin.com/screens/a4d79497-fb92-4c42-aeed-92f98a2791e8): The New link dialog marks a problem field in place with an inline warning icon and keeps a 'Draft saved' indicator. Nothing typed is lost, which is the fix for a duplicate address.
  - [folk](https://mobbin.com/screens/75065e3c-d49c-43fc-8705-fc5d622b140c): Names the possible duplicate and lets the user decide.
  - [QuickBooks](https://mobbin.com/screens/bf326062-a861-4e39-8a56-86f073649866): Adding an employee whose name matches an existing one stops on a plain explanation, with Back and 'Continue to add employee'.
  - [Jira](https://mobbin.com/screens/8e7fd3bc-da9d-4052-946c-de493a2506dc): "Similar work items" checked live under the Summary field before create.
  - [Docusign](https://mobbin.com/screens/912f6381-6322-4c9a-9a0b-d5947eea1d97): "Report title already exists." inline under the field; Save stays disabled.
- **Code:** `src/app/(app)/deals/actions.ts:33`, `src/app/(app)/properties/actions.ts:27`, `src/lib/deals/service.ts:56-57`, `grep: no reader of 'dup' anywhere in src/`, `src/app/(app)/deals/actions.ts:28-36`, `src/app/(app)/deals/[id]/page.tsx:30-40`, `src/app/(app)/deals/actions.ts:28-35`, `src/lib/deals/service.ts:52-57`, `src/app/(app)/deals/actions.ts:33 (redirect to ?dup=1)`, `src/lib/deals/service.ts:52-57 (returns before writing any typed fields)`, `src/app/(app)/properties/[id]/page.tsx:40-42`
- **Also found as:** DEALS-003 (Deals pipeline, new deal and deal detail), DEALS-IV02 (Deals pipeline, new deal and deal detail), JOURNEYS-003 (Lens: the core jobs, end to end), PORTFOLIO-010 (Portfolio list and new property)
- **Verification:** confirmed. Code confirms: createDeal returns before saving when findDuplicateDeal matches, the action redirects to ?dup=1, and nothing under src/ reads 'dup'. Couldn't submit the form (writes are blocked), so the redirect itself is verified from code only.

### IA-004

**Four different due-date vocabularies; the Tasks list calls an 18-month-old task 'yesterday'**

High · Fix · effort S · `Home, Tasks, property tasks card, contractor jobs` · Money, numbers and dates read one way

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The branch uses 'Nd late' rather than 'Overdue 55d'. Either works as long as every surface uses the same one.
- **Today:** Task rows on Today, All and Home now share dueLabel: 'Yesterday', '2d late', then the date in red, a weekday within the week, and 'Today'. The overdue-as-yesterday bug is gone. Three vocabularies remain. The property Tasks card uses fmtDay with the year always and no overdue color ('Aug 28, 2026' in gray for a task two months late). The contractor page's Jobs list does the same and shows today's job as 'Oct 23, 2026'; it also reads dueDate, where D7 says Target. The portal shows 'Target Mon, Oct 26' (job-view.ts:55-68).
- **Why:** Overdue is the most important signal in a task tool. 'Yesterday' on dozens of stale rows hides how far behind work is. Stripe uses one date format everywhere.
- **Change:** Switch the property Tasks card and the contractor Jobs list to dueLabel with the overdue color, ideally by rendering them with TaskRow. On the contractor page, use the Target (targetOf) for contractor jobs. The portal's neutral 'Target' wording is approved (D7), so leave it as is.
- **Desktop, tablet, phone:** Same label at all sizes. On phone it sits on the row's second line.
- **Reuse:** src/lib/dates.ts (dueLabel, relativeDays) collapsed into one function.
- **References:** 
  - [Things 3](https://mobbin.com/screens/aed0da9d-712a-4253-a8da-f08b9b2f9d9a): One deadline format in lists: a small flag with '4d left', and 'today' in red on the day.
  - [Things 3](https://mobbin.com/screens/e8da8594-ca98-443a-b6b4-6e3cd939c80c): Detail view pairs the full date with a countdown ('Thu, Mar 30 · 14 days left'): one rule for lists, one for detail.
  - [Attio](https://mobbin.com/screens/c45cd1e7-9589-42fd-8408-b8a6fe179a4b): Late item shows '6 days ago' in red within a dated task list
  - [ClickUp](https://mobbin.com/screens/ecb1790e-e9b8-494c-8022-224b41476d34): 'Overdue' is a named state, separate from Today
  - [Mercury](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1): Bill Pay separates 'Overdue' and 'Due soon' as labeled states
  - [Linear](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1): One date chip style across every list
  - [Todoist](https://mobbin.com/screens/e3664e12-9fd4-4240-aca2-522f44003b9e): The Overdue group lists each task's actual date in red, not a relative word.
- **Code:** `src/lib/dates.ts:105-125`, `branch: src/lib/dates.ts:154-177`, `branch: src/app/(app)/properties/[id]/page.tsx:215-217`, `branch: src/app/(app)/contractors/[id]/page.tsx:152-154`, `branch: src/lib/portal/job-view.ts:55-68`, `src/lib/dates.ts:104-114`, `branch src/app/(app)/page.tsx (MyTasksList in My open tasks)`, `branch src/app/(app)/properties/[id]/page.tsx:215-217`, `branch src/app/(app)/contractors/[id]/page.tsx:152-154`, `branch src/app/(app)/properties/[id]/edit-loan.tsx:55`, `branch src/app/(app)/properties/[id]/edit-insurance.tsx:56`, `src/app/(app)/page.tsx:84-90`, `src/app/(app)/properties/[id]/page.tsx:197-199`, `src/app/(app)/contractors/[id]/page.tsx:109-111`, `src/app/(app)/tasks/my-tasks-list.tsx:27`, `src/app/(app)/tasks/task-row.tsx:146-155`, `src/app/(app)/properties/[id]/page.tsx:85-89,215-217`, `src/app/(app)/contractors/[id]/page.tsx:152-154`, `src/app/(app)/page.tsx:84-90 (relativeDays)`, `src/lib/dates.ts:120-125 (dueLabel: overdue → "yesterday")`, `branch src/lib/dates.ts:161-177`, `branch src/components/due-date-picker.tsx:71,88`, `branch src/app/(app)/tasks/my-tasks-list.tsx:27`, `branch src/app/(app)/properties/[id]/page.tsx:216`, `src/lib/dates.ts:120-134`, `asana-migration-plan.md lines 41 and 472`, `branch-src/src/components/due-date-picker.tsx:71,88`, `branch-src/src/app/(app)/tasks/my-tasks-list.tsx:27`, `branch-src/src/app/(app)/properties/[id]/page.tsx:215-217`, `branch-src/src/app/(app)/contractors/[id]/page.tsx:152-154`
- **Also found as:** COPY-003 (Lens: words on every screen), DATA-015 (Lens: tables, numbers, money, charts and status), JOURNEYS-035 (Lens: the core jobs, end to end), MOBILE-IV03 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. Seen: every overdue row on /tasks reads 'yesterday' in red (a task due 2025-04-19 included), while Home shows '55d ago' for the same 'Create model to predict capex' task, the property card shows 'Aug 28, 2026' and the contractor page 'Aug 31, 2026'. dates.test.ts locks in 'yesterday' for any overdue date, so the test has to change too. The real date shows only in a hover tooltip, which touch can't reach.

### IA-009

**Create in place with a sheet prefilled from the current page**

High · Design change · effort M · `New task, New deal, New property` · Create where you are · big bet

- **Migration branch:** Still applies on the migration branch. '+ New task' and the property card's '+ Task' still go to the full /tasks/new page (properties/[id]/page.tsx:187-189). createTask then pushes to /tasks/[id] (tasks/actions.ts:73), whose '← Tasks' now runs router.back() and returns to the form (see IA-002). The form gained the shared AssigneePicker, Status and Repeats, but Due is still a native date input with no quick picks (new-task-fields.tsx:44-47).
- **Today:** '+ New task' and the property card's '+ Task' go to the full /tasks/new page. Create then redirects to /tasks/[id], whose back link says Tasks and goes to /tasks, not the property. Adding three tasks to 767 Prospect from its own page takes about 15 actions and six page loads.
- **Why:** Capturing work fast is the core of replacing Asana. Stripe and Linear create in a modal or side sheet and leave you where you were.
- **Change:** A New button in the sidebar and in page headers, plus the C key, opens a sheet. Fields: Title, Property (prefilled from the current page), Assignee, Due quick picks, and a 'Create another' toggle. Saving keeps you on the page and shows a toast ('Task added · Open · Undo'). The same sheet pattern covers New deal (address with the duplicate check from IA-003) and New property. The full /new pages stay for deep links only.
- **Desktop, tablet, phone:** Desktop: 420px right-side sheet. Tablet: centered dialog. Phone: bottom sheet with Title first and the other fields as chips; Create another drops on phone.
- **Reuse:** React Aria Dialog and Sheet (D9); the spec's toast region with Undo; the existing createTask action.
- **References:** 
  - [Stripe](https://mobbin.com/screens/d5400786-97c3-4029-a3e2-e21a9fa7735e): Create customer as a modal over the list, with a Cmd+Enter submit hint.
  - [Stripe](https://mobbin.com/screens/7676a87e-268f-48a6-8089-ec50fd27c3d9): Create location as a right-side sheet that keeps page context.
  - [Linear](https://mobbin.com/flows/7f061cb3-54c7-48de-a070-6c6cde5f443f): C creates a new issue from anywhere.
  - [Linear](https://mobbin.com/flows/3528703d-a543-414c-8f6e-ccf2442bff2f): Composer over the list with property chips, Create more and a post-create toast
  - [Linear](https://mobbin.com/flows/b49200b2-cfac-4c16-aae9-55aecdb91d09): Status / Priority / Assignee chips under the title; Create stays in context
  - [Attio](https://mobbin.com/screens/dc9d6419-9111-428c-9c98-a1d2b382f344): Phone Create Task sheet: title, date chip, record chip, assignee chip
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): One floating + expands into labeled create actions (Request, Task, Expense, Invoice, Quote, Job, Client) from any screen.
  - [Mercury](https://mobbin.com/screens/ee50b360-f122-40cf-8e96-61567d032bc0): The Move Money button stays in the top bar on every page, beside search, so the main create action is never more than one click away.
  - [Supabase](https://mobbin.com/screens/9b4725f5-e038-4fc7-98ad-64a59f74b4d7): Command menu with Create actions and key hints (N for New project)
  - [Mistral AI](https://mobbin.com/screens/8450c1c7-7c10-40a3-9af3-c9c234ac4b53): Command menu grouped with "New Agent", "New Batch" above navigation
  - [Revolut Business](https://mobbin.com/flows/f110bf47-6f6a-4021-a015-87eb06b73dc3): A single "+ New" menu (Request reimbursement, Upload receipt) reachable from the page header
  - [Stripe Dashboard](https://mobbin.com/screens/fcaa5b1e-cf08-46e0-a083-8d0e8fecbb8a): Create flow in a sheet with a pinned primary action
  - [Linear Mobile](https://mobbin.com/screens/4d807c4c-b0a5-4e87-86bd-154fb51d3f32): Chip row for status, assignee, project and date instead of form selects
  - [Dub](https://mobbin.com/screens/a4d79497-fb92-4c42-aeed-92f98a2791e8): A create dialog over the list with a 'Create link ↵' primary button and a draft-saved state.
  - [Attio](https://mobbin.com/screens/559623c8-0b2f-4e9e-a144-dc330ee1c80b): Cancel (ESC) and Add (⌘↵) in a compact modal.
  - [Cofounder](https://mobbin.com/screens/8d5e768c-9eed-4fcc-8a10-b1976840961f): A four-field create-opportunity dialog.
  - [Stripe](https://mobbin.com/screens/cffea421-b951-4ba7-8ddd-571a990d3ed1): Toast after create, with View.
  - [Stripe](https://mobbin.com/screens/f0721d55-7d3c-4827-ba9e-e6bcbdfe9c2d): Add a product side panel over the list; Cancel and primary in a docked footer.
  - [Zillow](https://mobbin.com/flows/45f9651a-dd33-4d39-9e78-88f40c08373b): Add property modal from the Properties list, landing back on the list with the new row.
  - [Google](https://mobbin.com/screens/10b34a13-f0a2-43d5-997d-6bb733e63cc4): Phone sheet with Cancel, title and a Done that stays disabled until valid.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:170`, `src/app/(app)/tasks/actions.ts:37`, `branch: src/app/(app)/tasks/new/page.tsx:22-64`, `branch: src/app/(app)/tasks/new/new-task-fields.tsx:36-47`, `branch: src/app/(app)/tasks/actions.ts:50-75`, `branch: src/app/(app)/properties/[id]/page.tsx:183-190`, `src/app/(app)/tasks/actions.ts:37 (redirect to the task)`, `src/app/(app)/deals/actions.ts:34`, `branch src/app/(app)/tasks/actions.ts:73`, `branch src/app/(app)/deals/actions.ts:33-34`, `branch src/app/(app)/tasks/new/page.tsx:30-60`, `src/components/app-shell.tsx:63-92 (header holds only logo, search, theme)`, `grep: no global keydown/metaKey handler in src/`, `branch src/app/(app)/tasks/new/page.tsx:28-61`, `src/app/(app)/deals/page.tsx:94-101`, `src/app/(app)/deals/new/page.tsx`, `src/app/(app)/properties/new/page.tsx:6-39`
- **Also found as:** JOURNEYS-014 (Lens: the core jobs, end to end), JOURNEYS-013 (Lens: the core jobs, end to end), MOBILE-033 (Lens: phone and tablet experience on every route), DEALS-037 (Deals pipeline, new deal and deal detail), PORTFOLIO-008 (Portfolio list and new property)
- **Verification:** confirmed. Confirmed '+ Task' goes to /tasks/new?propertyId=... and createTask redirects to /tasks/[id]. Small nuance: when the session has a same-origin referrer, the task page's back link calls router.back() and lands on the /tasks/new form rather than /tasks. Either way it never returns to the property. Creation couldn't be run end to end because writes are blocked.

### IA-010

**Group search results and give every row enough context to choose**

High · Design change · effort M · `Global search` · A quiet shell with real search, navigation and sign-in

- **Today:** Results are a flat list with an uppercase type column. Deals show the raw status ('767 West Avenue … · 6 - Holding', '· CLOSED!'). Tasks show only the title, so 'Coordinate closing time' appears three times with no hint of which property, and done tasks look like open ones. Each type is capped at 6 with no 'see all'. Task search ignores property and assignee, so 'zack' finds only titles that contain Zack. On phone the dropdown is 360px and titles truncate to about 14 characters.
- **Why:** Search is the fastest way into a record. Identical rows force guessing. Stripe groups results by object and shows status and amount on each row.
- **Change:** Grouped sections with headers (Properties, Deals, Tasks, Contractors). Two-line rows: tasks show '767 Prospect · Overdue 3d · Waiting'; deals show a stage chip and price; contractors show trade and phone. Done tasks are muted with a Done chip. A 'Show all results for closing' row opens /search, grouped like Stripe with 'View 12 results' per group. Tasks also match on property address and assignee name.
- **Desktop, tablet, phone:** Desktop and tablet: 560px panel (or the Cmd+K palette, IA-029). Phone: full-screen search sheet (IA-020) with two-line rows, never a 360px dropdown.
- **Reuse:** /api/search route (add fields and context), Badge tones for stage and status, the dueLabel from IA-004.
- **References:** 
  - [Stripe](https://mobbin.com/screens/52cb922e-1017-4096-aa61-201cd6b58ef9): Dropdown grouped by object with status badges, dates and a 'Show all results' row.
  - [Stripe](https://mobbin.com/screens/3a15e105-2b7d-4857-9fb6-478731427ebb): Full results page grouped by type with 'View N results' per group.
  - [Mercury](https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6): A quiet group header (Transactions) replaces a per-row type column.
  - [Linear Mobile](https://mobbin.com/screens/652dac8a-d883-4034-8811-0956e4c0ef38): Small gray eyebrow over each title carries the context line.
  - [HubSpot](https://mobbin.com/flows/d1ec2d0e-9a05-49db-9dcf-c5a63ba36eb1): Grouped sections, bold matched text, secondary descriptions, 'See more results' row
  - [Square](https://mobbin.com/flows/5dfebd75-0cdd-4e01-b273-c811bd3d5414): Initials avatar, name, then a muted email and stat line
  - [Stripe](https://mobbin.com/screens/c65fcddb-aea7-459f-bc87-94eec98a4661): Matched substring emphasized inside each option
  - [Stripe](https://mobbin.com/screens/9a241073-d70a-41ef-937e-2c3db273fb34): Results grouped by object type with counts.
  - [Cash App](https://mobbin.com/screens/1ad2786b-532a-480c-971c-bffccce99865): Address search results as two-line rows (street, then city), so lookalike results are told apart without opening them.
  - [Mintlify](https://mobbin.com/screens/7c7ad31f-9dfe-4be7-83d7-6002fe31d4d0): Grouped palette results with the title over a muted context line.
  - [Mercury](https://mobbin.com/flows/40884fc4-8db7-4c0a-afe6-8946f2c1e36e): Result rows carry amount and date, and "Search all transactions for 'Google'" opens the filtered list
  - [Base44](https://mobbin.com/screens/675ecfd2-b7fc-4e8d-9078-3eeeaddda7c7): Grouped command results with a muted context sublabel
- **Code:** `src/app/api/search/route.ts:10-50`, `src/components/global-search.tsx:48-66`, `src/components/global-search.tsx:62-63`, `src/app/api/search/route.ts:21-36`, `src/components/global-search.tsx:62`, `src/app/api/search/route.ts:41-49`, `src/components/global-search.tsx:45`, `branch: src/components/nav.tsx:62`, `branch-src/src/app/api/search/route.ts:41-49`, `branch-src/src/components/global-search.tsx:45`, `branch-src/src/components/nav.tsx:60-66`, `src/app/api/search/route.ts:32-35`, `src/app/api/search/route.ts:52`, `branch:src/app/api/search/route.ts:32-46`, `src/app/api/search/route.ts:10-51 (selects id/name only; tasks not scoped by status)`, `branch: src/app/api/search/route.ts:21-52`
- **Also found as:** SHELL-020 (App shell, sidebar, top bar, global search and Home), VISUAL-055 (Lens: visual design system across every screen), SHELL-V03 (App shell, sidebar, top bar, global search and Home), IA-IV01 (Lens: information architecture and global SaaS patterns), JOURNEYS-009 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Reproduced: 'closing' returns six flat TASK rows, three each of 'Coordinate closing time' and 'Figure out closing costs'. The one I opened is Completed but looks identical to open rows. 'zack' matches titles only. The API caps each type at 6 and builds deal labels from the raw status. Stripe grouped-search refs are plausible.

### IA-I01

**Search only finds exact substrings of one field: 'Street' misses 'St.', and word order and accents break it**

High · Fix · effort M · `Global search (every signed-in page, /api/search)` · A quiet shell with real search, navigation and sign-in

- **Today:** '647 Prospect Avenue' returns only the closed deal, not the owned property stored as '647 Prospect Ave. Buffalo, NY 14213'; '118 Congress Street' does the same. 'congress roof' and '118 roof' return nothing, although seven roof tasks are linked to 118 Congress St. 'mariner framing' finds one task but 'framing mariner' finds none. 'José' returns nothing while the contact is 'Jose Alvarez' and the Tasks list shows 'José Alvarez (external)'. At 320px a failed search shows no dropdown at all. The API runs one case-insensitive contains on the whole query per field.
- **Why:** Finding a building is the most common lookup and the core phone job. Superhuman's published palette rule is that search forgives the way people actually type. A box that needs the stored spelling teaches partners to stop using it.
- **Change:** Split the query into words, run each through the existing normalizeAddress (Avenue to ave, Street to st, strips punctuation) and fold accents, then require every word to match somewhere across the record's title, its linked property address and its assignee or contractor name. Example: 'congress roof' returns 'Tyler - quote for roof' with '118 Congress St.' as its sublabel. Keep it fast by storing a normalized searchText column per record, or use Postgres unaccent with pg_trgm.
- **Desktop, tablet, phone:** No visual change. The same results reach the desktop dropdown, the tablet dropdown and the phone search sheet (IA-020).
- **Reuse:** Extend src/app/api/search/route.ts; reuse normalizeAddress and addressKey from src/lib/normalize.ts; GlobalSearch unchanged.
- **References:** 
  - [Superhuman Mail](https://mobbin.com/screens/68b22cd4-b6ef-48ee-a6a9-592e1c460570): The palette resolves plain words ('go to done') to the right command, which is the forgiving matching HG's search lacks.
- **Code:** `src/app/api/search/route.ts:12`, `src/app/api/search/route.ts:17`, `src/app/api/search/route.ts:33`, `src/lib/normalize.ts:1`, `src/app/api/search/route.ts:11-36`
- **Also found as:** SHELL-V01 (App shell, sidebar, top bar, global search and Home)
- **Verification:** confirmed. Reproduced against /api/search: '647 Prospect Avenue' and '118 Congress Street' return only the CLOSED! deal. 'congress roof', '118 roof', 'framing mariner' and 'José' return nothing. 'Jose' finds the contact. route.ts runs one contains per field. One detail is misattributed: the missing no-match dropdown is not a 320px problem. It happens at every width (global-search.tsx:48, desktop shot search--elmwood--desktop-light.png) and is I10's subject. The Tasks and Deals ?q= filters use the same single-field contains (tasks/page.tsx:87, deals/page.tsx:60), so they need the same matcher or I04's 'See all' counts will disagree with the dropdown. The Superhuman reference is weak because it matches palette commands, not records. Mercury 02863cc8 supports the point better. Also, at 375 the dropdown is only as wide as the input and labels cut to '647 Prospect …' (search--647--mobile-light.png). That belongs to IA-020.

### IA-014

**Finish the D11 names everywhere, not only in the nav**

Medium · Fix · effort S · `Nav, search, list and detail pages` · Plain, consistent words

- **Today:** 'Vendors' appears in the nav, the page title, the subtitle ('29 contractors & service providers'), the back link, the search type label ('VENDOR'), the search placeholder ('vendors') and the empty state ('No tasks matched to this vendor'). 'Portfolio' is used for the nav and title while Home says 'Properties'. The task page labels the property row 'Project' while New task says 'Property'. Tasks lists say 'Owner' and 'All owners' while the task page says 'Assignee'.
- **Why:** D11 settled on Contractors, Assignee and Property. Mixed names make people wonder whether 'Project' and 'Property' are different things.
- **Change:** Contractors in the nav, title, back link, search group and placeholder ('Search'). Properties for the nav and index title. 'Property' on the task page. 'Assignee' for the Tasks column and filter. Drop the Vendors subtitle; the count chip says enough.
- **Desktop, tablet, phone:** Shorter labels also stop the phone search placeholder truncating.
- **Reuse:** SideNav LINKS, /api/search type labels, PageHeader props.
- **Code:** `src/components/nav.tsx:61-66`, `src/app/(app)/contractors/page.tsx:24`, `src/app/api/search/route.ts:44`, `src/components/global-search.tsx:45`, `src/app/(app)/tasks/[id]/page.tsx:77`, `src/app/(app)/tasks/page.tsx:191`
- **Verification:** confirmed. Verified: 'Vendors' title, subtitle '29 contractors & service providers', '← Vendors' back link, 'VENDOR' search label, 'No tasks matched to this vendor', 'Project' on the task page and 'Owner' on Tasks. Spec section 6 item 8 already schedules 'Contractors in the nav'. This finding correctly extends it to every surface.

### IA-015

**Reorder the sidebar by daily use and move Settings out of it**

Medium · Design change · effort S · `Desktop sidebar` · A quiet shell with real search, navigation and sign-in

- **Today:** The current order is Home, Deals, Portfolio, Financials, Tasks, Vendors, Settings. Tasks, the Asana replacement with 2,086 rows, is fifth. Settings, used a few times a year, sits at the same level as daily work.
- **Why:** Stripe orders its sidebar by how often each page is used and keeps admin pages out of the main list.
- **Change:** Home, Tasks, Deals, Properties (with the property list, IA-016), Contractors, Financials. Settings moves into the account menu (IA-019).
- **Desktop, tablet, phone:** The bottom bar (IA-011) uses the first four plus More, in the same order.
- **Reuse:** LINKS in src/components/nav.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13): Daily pages first (Home, Balances, Transactions, Customers); product groups below; Developers at the foot.
  - [Jobber](https://mobbin.com/screens/a96589e2-e854-4524-b3b9-58d4000f2562): Field-service order: Create, Home, Schedule, Clients, Jobs, then money.
  - [Stripe](https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888): Core objects first, product groups below, Developers pinned at the bottom
  - [Mercury](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2): Home, then Tasks with a count, then the money objects
  - [Stripe](https://mobbin.com/screens/61d8519b-582c-4749-a1df-1ff712e3a810): Settings reached from a gear in the top bar, not the main nav
  - [Linear](https://mobbin.com/screens/f3134ca3-b7e5-47ab-a283-92ce2db403db): Settings as its own mode with 'Back to app'
- **Code:** `src/components/nav.tsx:6-87`, `src/components/nav.tsx:7-79`, `branch src/components/nav.tsx:7-79`, `branch src/app/(app)/properties/page.tsx:37`, `src/components/nav.tsx:67-78`, `branch src/components/nav.tsx:67-78`
- **Also found as:** SHELL-029 (App shell, sidebar, top bar, global search and Home), ADMIN-051 (Contractors directory, contractor detail and Settings)
- **Verification:** confirmed. The Stripe screens I pulled (e.g. https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d) keep Settings as a gear in the top bar, not in the sidebar list, which supports moving it out. Depends on IA-019 existing first.

### IA-017

**Drop the global top bar; move search and New into the sidebar and give each page its own header**

Medium · Design change · effort M · `App shell, desktop` · A quiet shell with real search, navigation and sign-in

- **Today:** The fixed 56px header spans the full width above the sidebar and holds the wordmark, search and theme toggle. Its search starts at x=118 while page content starts at x=96 at 1280. Stripe itself keeps a top bar, but only over the content column.
- **Why:** It costs 56px on every screen and doesn't line up with the content. Linear, Attio and Vercel put the workspace name and search in the sidebar and give each page a header with its breadcrumb and actions.
- **Change:** The sidebar top holds 'HG Capital', a search trigger showing Cmd+K, and a New button. Each page renders a sticky header row (breadcrumb, title, actions, tabs) that clips at a divider. The theme control moves to the account menu.
- **Desktop, tablet, phone:** Desktop 1280: as described. Tablet and phone: a top bar with page title, search icon and '+' (IA-020).
- **Reuse:** AppShell; PageHeader gains breadcrumb and tabs slots (IA-039).
- **References:** 
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): 'Quick actions Cmd+K' at the top of the sidebar; the page header holds breadcrumb and actions.
  - [Vercel](https://mobbin.com/screens/5bb75d66-7572-4f2e-a229-ebc54627343b): 'Find… F' search inside the sidebar.
  - [Linear](https://mobbin.com/screens/d0f8ebba-34b7-469c-a708-1069e55a3e02): Each page owns a thin header with breadcrumb, star and actions.
- **Code:** `src/components/app-shell.tsx:63-92`
- **Verification:** partly. The misalignment is real, but the benchmark cuts the other way: Stripe (https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d) keeps a slim top bar with search, and puts the workspace name at the top of a full-height sidebar. Present two options: Stripe-style (sidebar runs full height with 'HG Capital' at top, top bar spans only the content column, search aligned to the content edge) or Linear/Attio-style (search in the sidebar). The Stripe option is less churn and matches the stated bar.

### IA-018

**Replace the small back link with a breadcrumb header that shows hierarchy**

Medium · Design change · effort S · `Deal, property, task and contractor detail pages` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The task page with side rail is approved (D31). This change touches only the back-link line above it.
- **Today:** The task page header is rebuilt (/tasks/[id]). A 12px '← Tasks' link sits above a row with a status chip and menu, a title that wraps, and a '…' menu (Copy link, Cancel task, Delete). The property appears only in the rail ('Property: 118 Congress St.'), not in the header, and there's no record-type label. Deal and property pages are unchanged: a small '← Deals' or '← Portfolio' link, an address input and no H1.
- **Why:** You can't tell where you are or how records relate (property, then task). Stripe and Linear put the parent path right above or beside the title.
- **Change:** Keep the branch's status, title and '…' row. Replace only the '← Tasks' line with a breadcrumb whose parent is the property when the task has one ('118 Congress St. / handyman- add plywood…'), otherwise the remembered list. Give the deal and property pages the same header.
- **Desktop, tablet, phone:** Desktop: full breadcrumb. Tablet: parent plus current. Phone: back chevron and parent name in the top bar only.
- **Reuse:** BackLink becomes the parent crumb; PageHeader.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): 'Customers >' crumb, title, and Create payment, Create invoice and '…' actions.
  - [Linear](https://mobbin.com/screens/d0f8ebba-34b7-469c-a708-1069e55a3e02): Team > issue breadcrumb in the header.
  - [Attio](https://mobbin.com/screens/5569b5fd-07ed-41fd-a7ec-dd8991e73994): Breadcrumb (Companies / sweetgreen) above the record title, with a star beside it.
  - [Stripe](https://mobbin.com/screens/6965a119-621d-44e6-9187-3fd0c9e81080): 'Product catalogue / Features' breadcrumb above the title with a status badge
  - [Attio](https://mobbin.com/screens/f6750bef-6bce-435c-8460-3c55f32f1254): 'Companies > sweetgreen' breadcrumb in the content header
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): 'Companies › sweetgreen' breadcrumb in the top bar
- **Code:** `src/app/(app)/tasks/[id]/page.tsx:50-56`, `branch: src/app/(app)/tasks/[id]/view.tsx:67-98`, `branch: src/app/(app)/tasks/[id]/header.tsx:32-110`, `src/components/back-link.tsx:18-25`
- **Also found as:** SHELL-053 (App shell, sidebar, top bar, global search and Home), PROPERTY-051 (Property detail page (future property hub))
- **Verification:** confirmed. Verified: 12px muted back button, max-w-2xl (672px) column on task and deal, no record-type label, and the task's property sits in a 'PROJECT' row below the title. Overlaps IA-039, which should merge into this. Stripe's payment page (https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b) adds a small record-type label ('PAYMENT') above the title, worth including.

### IA-019

**Turn the avatar into an account menu with Settings, Theme (System, Light, Dark) and Sign out**

Medium · Design change · effort S · `App shell, account area` · A quiet shell with real search, navigation and sign-in

- **Today:** The sidebar foot shows initials, the name and a raw 'Sign out' text button. Clicking the avatar does nothing. The theme toggle appears in the header on desktop and in an 'Appearance' row in the mobile drawer. It only switches between light and dark, so once used, the app never follows the system theme again.
- **Why:** Account and preferences belong in one predictable place, as in Vercel and Linear. A two-state toggle with no System option permanently overrides the OS.
- **Change:** The avatar opens a React Aria Menu: name and email, Settings, Theme (System | Light | Dark segmented), Keyboard shortcuts, Sign out.
- **Desktop, tablet, phone:** Desktop: popover from the sidebar foot. Tablet and phone: the same items as rows on the More tab.
- **Reuse:** ThemeToggle logic (add a 'system' value), the initials helper, React Aria Menu (D9).
- **References:** 
  - [Vercel](https://mobbin.com/screens/5bb75d66-7572-4f2e-a229-ebc54627343b): Account menu with name, email, settings, a System, Light, Dark theme control, help and log out.
  - [Linear](https://mobbin.com/flows/e0451091-e059-45c7-848d-1c5f796585a3): Help menu that opens keyboard shortcuts and settings.
  - [Vercel](https://mobbin.com/screens/a8d666ee-3303-4b28-9e1f-06b8dbd63cb6): Avatar menu: name and email, inline three-way theme switch, Log Out last.
  - [Mercury](https://mobbin.com/screens/1409f3cf-aafe-4e2f-9045-b4bdb2c48484): Account menu with Appearance showing System default and Log out at the end.
  - [Stripe](https://mobbin.com/screens/8d391011-f2a9-406b-8a8b-7f43d01ca5e1): Avatar menu: Settings, Profile, Sign out, with name and role
  - [Mercury](https://mobbin.com/screens/d7aa120c-c488-4f38-bf61-78460910320d): Account menu with an Appearance submenu: System default, Dark mode, Light mode
  - [Vercel](https://mobbin.com/screens/c54df5c8-f72c-406e-bb92-a9a6b116f0a5): User row with a menu button at the sidebar bottom
  - [Linear](https://mobbin.com/screens/14daab5b-7872-456a-8c5a-94f3d9d03a48): Clicking the workspace name at the top of the sidebar opens one compact menu with Settings and Log out last.
  - [Hootsuite](https://mobbin.com/screens/155a6fa5-52e6-466e-b3b3-6333eb747dd6): The avatar at the foot of an icon rail opens an account panel with the user's name and Sign out last, so the rail itself never has to expand.
  - [Linear](https://mobbin.com/screens/59e38375-a880-466b-8f29-b6e59358c61a): Interface theme defaults to System preference, then Light and Dark.
- **Code:** `src/components/app-shell.tsx:160-181`, `src/components/theme-toggle.tsx:8-9`, `src/components/app-shell.tsx:163-184`, `src/components/app-shell.tsx:103-112, 166-181`, `src/components/theme-toggle.tsx:4-14`, `src/components/app-shell.tsx:89-91`, `src/components/app-shell.tsx:83-91`, `src/components/app-shell.tsx:163-183`, `src/components/theme-toggle.tsx`
- **Also found as:** SHELL-028 (App shell, sidebar, top bar, global search and Home), G2D-IV02 (Staff sign-in lifecycle: sign out, a 30-day expiry mid-edit, changing a password, and passkeys), SHELL-039 (App shell, sidebar, top bar, global search and Home), VISUAL-046 (Lens: visual design system across every screen)
- **Verification:** confirmed. Verified: the avatar is a plain span, Sign out is a text button, and ThemeToggle writes only 'light' or 'dark' to localStorage, so once used the system preference is never followed again. At 768 the theme control isn't in the header at all.

### IA-020

**Phone shows the page's large title; search opens a full-screen sheet with recent records**

Medium · Design change · effort M · `Phone top bar and search` · The phone is a chosen subset, and touch has no hover

- **Today:** On phone the top bar shows the hamburger, the 'HG Capital OS' wordmark and a squeezed search box with a truncated placeholder ('Search addresses, vend'). It never shows which page you're on; the page H1 repeats below. Search results drop into a 360px panel.
- **Why:** On iOS the title bar tells you where you are. A cramped inline search box is hard to use with one thumb.
- **Change:** An iOS-style large title ('Tasks') that compacts on scroll. On the right, a search icon and a '+' (on Home, Tasks, Deals and Properties). Search opens a full-screen sheet showing recent records and recent searches, then grouped results (IA-010). No wordmark on phone.
- **Desktop, tablet, phone:** Phone 375 and 320: as described. Tablet 768: the same bar with a wider search sheet. Desktop: not used.
- **Reuse:** GlobalSearch logic, the IA-010 result rows, React Aria Modal for the sheet.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/e9b4ccc3-e76f-4594-acc4-1a43828e8e39): Full-screen Search opens on 'Recently viewed' records, with the field docked above the keyboard and a clear X beside it.
  - [Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a): Search is reached from its own button in the bottom bar, not a squeezed field in a top bar; the page keeps its large title.
  - [Mercury](https://mobbin.com/screens/ad20eb69-7c68-4d3b-b0bb-7eb11c3e60e7): Large 'Transactions' title, search field and Views chip on iOS.
  - [Alta](https://mobbin.com/screens/e85984e3-f4f6-4494-b835-535a9dd377a3): Full-screen search opening on Recently viewed and Recent.
  - [Rodeo](https://mobbin.com/screens/0a55dd26-b430-4f86-9397-6128c308b4f8): Recent searches shown as addresses.
- **Verification:** confirmed. Seen at 375: hamburger, wordmark and a search field truncated to 'Search addresses, vend', with no page title in the bar. The 360px dropdown claim is from the original evidence; I didn't re-measure it.

### IA-024

**Cut the Storage tab; it's a one-time migration with internal caveats on screen**

Medium · Design change · effort S · `Settings, Storage` · A quiet shell with real search, navigation and sign-in

- **Today:** /settings/storage shows internal copy (private blobs, /api/files, the missing Blob token) and a one-time Move button. Its counts are totals from attachmentCounts(), not what's left to migrate, so the UI can't show whether the migration is done.
- **Why:** 'Internal caveats stay out of the UI.' A finished migration shouldn't be a permanent Settings section.
- **Change:** Remove the tab and route. Run the migration once as a script from scripts/, and log its result in the deploy notes.
- **Desktop, tablet, phone:** Removes one tab at every size.
- **Reuse:** migrateAttachments logic in src/lib/attachments/migrate.ts reused by the script.
- **References:** 
  - [Stripe](https://mobbin.com/screens/fc7b35c9-f823-4f28-bb16-d981a05cb530): Every settings tab is a user job with one-line helpers, no infrastructure detail
  - [Supabase](https://mobbin.com/screens/46a6d698-2165-4a1f-9034-f82ce981b14c): Each settings section is a heading plus one plain line of what it controls; rows pair a title, a one-line description and the control
  - [Grok](https://mobbin.com/screens/86c318d2-e6f1-40ca-9ebe-05cf6babf630): Data controls: one line per item with a single Manage action
- **Code:** `src/app/(app)/settings/layout.tsx:19`, `src/app/(app)/settings/storage/page.tsx:15-40`, `src/app/(app)/settings/storage/page.tsx:16-37`, `src/app/(app)/settings/storage/page.tsx:22-38`, `branch src/app/(app)/settings/storage/page.tsx:22-38`
- **Also found as:** COPY-014 (Lens: words on every screen), ADMIN-042 (Contractors directory, contractor detail and Settings)
- **Verification:** partly. Right to pull internal caveats and a one-time job out of Settings. But 'finished' isn't established: the counts are totals, not files left to move, so the page can't tell whether the run happened. The production doc migration was listed as a pending manual step after the Sep 2 refactor. Confirm the production run before removing the route.

### IA-030

**Make Home the inbox for contractor updates; no bell icon**

Medium · New capability · effort M · `Home (inbox)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Home (/) shows stats, the CapEx forecast and 'My open tasks' (TaskRows), with nothing from contractors. Contractor updates still arrive only by email (D20). Today's Contractors column puts 'Needs review' on top but has no 'new' rows or unread dots. The TaskReadState table has a userId column (schema.prisma:448-460), but only the portal writes to it (portal/jobs.ts:62).
- **Today:** There is no in-app notification surface. Contractor updates reach staff only by email (D20). Week 2 plans a 'new from contractors' list and unread badges, with no location set.
- **Why:** A bell plus a separate inbox page is two more surfaces for two people. Linear's inbox is one sidebar item with a count.
- **Change:** 'New from contractors' is the top group of Home's Contractors column. Rows read like 'Zack added 4 photos · Cabinet install · 767 Prospect · 12m', with an unread dot in the row's top-right per the house rule, cleared when opened. One badge on Home in the sidebar and bottom bar. Email stays as is.
- **Desktop, tablet, phone:** Desktop: the group sits in the Contractors column. Tablet and phone: the first group under the Contractors switch, and the badge shows on the Home tab.
- **Reuse:** The spec's unread table; Badge; the toast with Undo for 'Mark all read'.
- **References:** 
  - [Front](https://mobbin.com/screens/a25fd5f3-a74a-4abc-b5f5-11b38cb684fa): Each person's Open, Later and Done are separate from the shared status: 'Archive in my inbox' clears it for you while the record still reads 'Open in Product Insights'.
  - [Front](https://mobbin.com/screens/ce8b928a-9af1-4e99-b128-bb2b6b34b073): Snoozing explains its reach in one line (it won't snooze in other people's inboxes), which is the rule HG needs so one partner's triage never hides an update from the other.
  - [Linear](https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb): Inbox with an unread count in the sidebar and unread dots on rows.
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): Opening an item clears it; an Undo toast covers mistakes.
- **Code:** `asana-migration-plan.md D20 and section 4 week 2`, `branch: src/app/(app)/page.tsx:20-70`, `branch: src/app/(app)/tasks/today-view.tsx:104-125`, `branch: prisma/schema.prisma:448-460`, `branch: src/lib/portal/jobs.ts:62`
- **Verification:** confirmed. Consistent with D20 (email only on contractor updates) and the house rule that a top-right dot means unread. Belongs to the IA-005 Home.

### IA-033

**Add 'Add to portfolio' when a deal closes, linking the deal and the property**

Medium · New capability · effort M · `Deal page to new property` · Create where you are

- **Today:** A CLOSED! status and Deal.convertedPropertyId exist, and the deal page shows 'Converted →' when the link is set. No UI ever sets it: /properties/new takes only Address, Status and Entity, with no deal.
- **Why:** The pipeline-to-portfolio handoff is HG's core lifecycle. Today it means retyping the address and losing the deal's history. CRMs convert in one step and keep the trail.
- **Change:** When a deal's stage becomes Closed, the header shows a primary 'Add to portfolio' button. It opens a sheet prefilled with address, units, price and purchase date, creates the property, sets convertedPropertyId and logs 'Added to portfolio' on both timelines. The property rail shows 'From deal'.
- **Desktop, tablet, phone:** Desktop and tablet: header button plus sheet. Phone: a sticky bottom button on closed deals.
- **Reuse:** createProperty action, the quick-create sheet (IA-009), the existing sourceDeal relation.
- **References:** 
  - [Jobber](https://mobbin.com/screens/ec252fff-64da-4154-bfed-ccfc579fb2b7): The record's primary header button is the next lifecycle step ('Convert to Job') beside Edit and More Actions, with the status chip above the title.
  - [Zendesk](https://mobbin.com/flows/d7229e31-7f4a-4fa2-a801-5a9fae143798): A Convert button on the lead header creates the contact and logs 'converted from a lead'.
  - [Salesforce](https://mobbin.com/flows/f5ad6653-96e5-48d3-a92f-e021f949e1a5): The final stage triggers a convert dialog prefilled from the lead.
  - [Attio](https://mobbin.com/screens/559623c8-0b2f-4e9e-a144-dc330ee1c80b): Add a record to a list with prefilled fields.
  - [Quicken](https://mobbin.com/screens/b4b6c9e6-5bec-4f9f-9a9b-9655215334bc): Create a property record from an address.
  - [Jobber](https://mobbin.com/screens/1e4846b8-cb8a-40eb-9491-54c8db93960f): More Actions puts Convert to Job and Create Similar Quote first, then Mark as Approved or Archived, then Download PDF.
  - [Linear](https://mobbin.com/flows/8f7ac78d-938d-44b2-a43e-b746bc6beda4): Create a linked record from another record with its content prefilled
  - [Stripe](https://mobbin.com/screens/ced08fbe-5237-45aa-95b4-d23785e59e4e): Create subscription starts from an existing customer and carries its details forward.
- **Code:** `prisma/schema.prisma:70`, `src/app/(app)/deals/[id]/page.tsx:51-58`, `src/app/(app)/properties/new/page.tsx:5-38`, `src/app/(app)/properties/[id]/page.tsx:218-222`, `prisma/schema.prisma:69-70`, `src/app/(app)/properties/[id]/page.tsx:217-224`, `src/app/(app)/properties/new/page.tsx:13-33`, `grep: no writes to convertedProperty or sourceDeal in src/`, `src/app/(app)/deals/[id]/page.tsx:37`, `src/app/(app)/deals/[id]/page.tsx:51-55`, `src/lib/properties/service.ts:62-72`
- **Also found as:** DEALS-036 (Deals pipeline, new deal and deal detail), JOURNEYS-030 (Lens: the core jobs, end to end), PORTFOLIO-023 (Portfolio list and new property)
- **Verification:** confirmed. Verified: convertedPropertyId is read on the deal page ('Converted →') but no code in src/ ever sets it, and /properties/new has no deal input. Zendesk and Salesforce refs fit.

### IA-034

**One shared activity timeline on every record; no global audit log**

Medium · New capability · effort M · `Task, property, contractor and deal pages` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** A shared ActivityTimeline/ActivityItem now exists in components/ and is used by the deal page and the task page. The task page's Activity covers comments, status and field changes, with a composer that has a Shared/Internal switch. Property and contractor pages still have no history. The task composer sits below the timeline, not at the top.
- **Why:** 'Close the loop' needs a record of what was done. For two partners, per-record history covers it; a global audit page would be chrome.
- **Change:** Reuse components/activity-timeline.tsx for the property page (rolling up its tasks' events, units, documents and listing changes) and the contractor page (their job updates from TaskEvent where actorContactId is set). The task and deal pages are done.
- **Desktop, tablet, phone:** Desktop: main-column section or tab. Tablet: same. Phone: a tab or section with entries on two lines.
- **Reuse:** The deal timeline in src/app/(app)/deals/[id]/page.tsx:92-133, extracted per spec section 7.
- **References:** 
  - [Stripe](https://mobbin.com/screens/daed2848-67bf-4bad-acbd-233af93bb070): Timeline with 'Add note' at the top of a payment.
  - [Stripe](https://mobbin.com/screens/731c4495-3c95-42b2-9502-5a1b60ab96eb): 'Recent activity' at the foot of a customer record.
  - [Attio](https://mobbin.com/screens/3f58982f-fb3f-46de-a123-70350ebfa604): Activity tab grouping changes by week with 'Show all changes'.
  - [Stripe](https://mobbin.com/screens/fb0b91ce-234b-44d5-9f8b-18864cc63941): Recent activity at the end of the customer record with '+ Add note'
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): 'changed Stage and 7 other attributes', expandable into a per-field before and after
  - [Wise](https://mobbin.com/flows/b51c3670-4335-4d6e-9d06-0576684d443d): An Updates / Details toggle; Updates is a vertical timeline of timestamped steps in plain you/we sentences, with the last step bold.
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): The reimbursement drawer lists Submitted and Approved, each with date and person, above the current Payment Pending step.
  - [Attio](https://mobbin.com/flows/ed18fe27-a14a-4331-9d02-c5dceb2c60b9): "Alex Smith changed Domains and 1 other attribute" with "Show all changes"
  - [Toggl Track](https://mobbin.com/screens/2deef352-1f6b-4757-a4c9-dcce106b0e6a): Audit log rows with From to To values per field
- **Code:** `src/app/(app)/deals/[id]/page.tsx:92-133`, `branch: src/components/activity-timeline.tsx:1-40`, `branch: src/app/(app)/tasks/[id]/view.tsx:138-145`, `branch: src/app/(app)/deals/[id]/page.tsx:107-128`, `src/app/(app)/properties/[id]/edit-details.tsx:134-195`, `docs/property-page-plan.md:139-147`, `src/lib/deals/service.ts:93-140 (diff and log exist for deals only)`, `src/lib/properties/service.ts:116-118,170-196 (no logging)`
- **Also found as:** PROPERTY-027 (Property detail page (future property hub)), JOURNEYS-026 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Aligned with the spec (deal timeline moves to components/activity-timeline.tsx) and D10's Activity tab. The task page I opened (a completed task) shows no history at all.

### IA-037

**One floating bulk action bar shared by Tasks and Deals**

Medium · New capability · effort M · `Tasks and Deals lists` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. No list supports multi-select. The branch adds one section-level bulk action: Overdue's 'Move all to today' on Today, which runs through lib/tasks/bulk.ts in one transaction with an Undo toast. All and Deals have no selection.
- **Today:** No list supports multi-select. Deals has 428 Pass and 17 TBD rows to tidy, and Tasks has dozens of overdue rows to reschedule. The spec puts a bulk bar on Tasks in week 2.
- **Why:** Building it once for both lists keeps one pattern. YNAB's bar shows the selection count and three verbs, then gets out of the way.
- **Change:** Checkbox column on hover, plus Shift-click for ranges. A floating bar: '3 selected · Reschedule · Assign · Mark done · More' on Tasks, '3 selected · Change stage · Pass · More' on Deals. Esc clears the selection. An Undo toast follows every bulk change.
- **Desktop, tablet, phone:** Desktop and tablet: bar centered above the bottom edge. Phone: dropped; edit one row at a time.
- **Reuse:** Table and Td, the spec's toast with Undo, the reschedule popover from the spec.
- **References:** 
  - [Linear](https://mobbin.com/screens/3f36e39e-2b9e-4145-bee2-f43a3cf21f7b): Selecting rows raises a small floating bar at the bottom ('6 selected', clear X, Actions) over the grouped list.
  - [YNAB](https://mobbin.com/screens/13e2610f-4a0c-4a66-8c5c-e07d1615eb61): Floating bar: '3 Transactions · Approve · Reject · Categorize · More'.
  - [Wrangle](https://mobbin.com/screens/b9d8a719-226b-4c7c-9268-45b0f1fa875e): Selected-count bar with a few verbs and a destructive action on the right.
  - [Linear](https://mobbin.com/screens/c61980d9-a5a7-4ccf-aac8-b3ba125e299a): "6 selected · Actions" floating bar over the list.
  - [Things 3](https://mobbin.com/screens/4f8e0995-45d2-48de-a0b2-8e04435558b7): Phone selection mode with a When, Move and Delete bar at the bottom.
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Floating "6 selected · Actions" bar.
  - [Calendly](https://mobbin.com/screens/9b1906d3-3035-4a74-a7ff-c72606a8bde5): Bottom action bar showing a selected count.
- **Code:** `asana-migration-plan.md section 4 (week 2: bulk action bar)`, `branch: src/app/(app)/tasks/today-view.tsx:66-79`, `branch: src/lib/tasks/bulk.ts:1-30`, `branch: src/app/(app)/tasks/task-list-context.tsx:50-62`, `branch: docs/asana-migration-plan.md:146-152`, `branch:src/app/(app)/tasks/today-view.tsx:66-80`, `branch: docs/asana-migration-plan.md:149`
- **Also found as:** TASKS-031 (Tasks list, new task and task detail), DEALS-046 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. Extends the spec's week 2 Tasks bulk bar to Deals with one pattern. YNAB and Wrangle refs fit. Phone drop is right.

### IA-038

**Add 'View as Zack' to preview the portal exactly as a contractor sees it**

Medium · New capability · effort M · `Contractor page` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. /contractors/[id] has the new Portal access card (Create login, Reset password, Text login details, Sign out everywhere, Remove access), but no way to preview the portal as that contractor. A search of the branch finds nothing for 'view as' or impersonation.
- **Today:** Every contractor is invited on Oct 29 (D22). Privacy depends on D12, D15, D16 and D21 rules, and the spec relies on a one-off 'will see' report. Nothing in the app lets staff see a contractor's actual view.
- **Why:** The top portal risk is a contractor seeing something private. A live preview lets Connor check any job's visibility in seconds, at any time.
- **Change:** On the contractor page, a 'View as Zack' button opens the portal read-only in the same tab. A slim banner says 'Viewing as Zack Reading · Exit'. Writes are disabled and lockbox views aren't logged in preview.
- **Desktop, tablet, phone:** Desktop and tablet: the banner above the portal layout. Phone: the same banner, one line.
- **Reuse:** The portal pages (spec section 6) rendered with a read-only flag; Badge for the banner.
- **References:** 
  - [Jobber](https://mobbin.com/screens/1e4846b8-cb8a-40eb-9491-54c8db93960f): 'Preview as Client' sits in the record's More Actions menu, so staff check what the outside party sees from the record itself.
  - [Base44](https://mobbin.com/screens/74ff85dd-dbad-4f03-8248-294e40499dff): 'You're acting as [user]' banner with Exit mode.
  - [Docusign](https://mobbin.com/screens/d0fdd43b-9099-4c3f-bc7a-98ead34cd181): 'Viewing as' picker above a recipient preview.
- **Code:** `asana-migration-plan.md D12, D15-D17, D21, D22 and section 10 risks`, `branch: src/app/(app)/contractors/[id]/page.tsx:103-120`, `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx`
- **Verification:** confirmed. Good use of a live preview against the portal privacy risk ahead of the Oct 29 invites. Make sure the preview never writes lockbox-view logs, as stated.

### IA-I03

**Search the facts partners look up: lender, servicer, carrier, policy and loan numbers, entity, units, documents and notes**

Medium · New capability · effort M · `Global search / Cmd+K` · A quiet shell with real search, navigation and sign-in

- **Today:** The gaps are real: 'Conventus', 'Fay Servicing' and 'HG Buffalo Holding 1' return only tasks, and deal notes ('seeing tomorrow') and task descriptions are never searched. But lockbox codes and unit labels are poor search targets: people search the address to get the code, not the code to get the building. Adding document and attachment filenames makes this L, not M.
- **Why:** Owners mostly search for a fact about a building: who services 118 Congress, which loans sit with Conventus, where Zack's W-9 is. Mercury's search spans Transactions, Accounts, Recipients and Statements, and Linear's covers Issues, Projects and Documents, so one box answers any question about the business. This is the phone's property-lookup job.
- **Change:** Index Property lender, loanServicer, insuranceCarrier, insurancePolicyNo, loanNumber, llcOwner and unit labels; property and task attachment filenames; deal notes; task descriptions; contractor phone and email. Each result keeps its record as the title and adds the matched field as one gray sublabel: '58 Mariner Street' over 'Lender · Conventus', 'W-9.pdf' over 'Zack Reading'. Selecting a fact opens the record at that section (property Units, Documents tab). Rank title matches above fact matches.
- **Desktop, tablet, phone:** Desktop and tablet: one row per result, the matched fact after the title when it fits. Phone: two-line rows (record, then matched fact), so the answer reads without opening anything. Nothing drops.
- **Reuse:** Extend /api/search and the result row in GlobalSearch (or the IA-029 palette); builds on IA-010's grouped rows.
- **References:** 
  - [Mercury](https://mobbin.com/screens/980f79d4-de4f-4b00-ad68-86ebf9b272b6): One search reaches every kind of record (scopes for Accounts, Recipients, Statements) and groups the matches under a type heading.
  - [Linear](https://mobbin.com/screens/dba91946-d147-4b2f-ad92-4195eae017fc): Search covers issues, projects and documents from one field.
  - [Mercury](https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2): Search scopes span every record type, including Recipients and Statements.
  - [HubSpot](https://mobbin.com/flows/d1ec2d0e-9a05-49db-9dcf-c5a63ba36eb1): Search spans many object types with chips to narrow (Contacts, Companies, Deals, More)
  - [Stripe](https://mobbin.com/screens/3a15e105-2b7d-4857-9fb6-478731427ebb): Full Search results page: one section per object with "View N results"
  - [Stripe](https://mobbin.com/screens/791bb3bb-cbda-414c-930c-e17f0dfd0c4f): Suggested filters (is:, status:) shown in the empty search dropdown
  - [Mesh](https://mobbin.com/screens/5495362f-42ff-48e4-9fcd-2cf0aebb4393): Search results label which field matched
  - [Mercury](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445): An explicit 'No results found' state that offers a next action.
- **Code:** `src/app/api/search/route.ts:10-37`, `prisma/schema.prisma:98-150`, `branch src/app/api/search/route.ts (unchanged from main)`, `branch src/components/global-search.tsx:45`, `src/app/api/search/route.ts:21-30`, `Probe on :3300: /api/search?q=5835243 -> {"results":[]}; ?q=Fuller -> type Vendor`, `branch src/app/api/search/route.ts:21-30`, `branch prisma/schema.prisma:203`, `src/app/api/search/route.ts:32-36`
- **Also found as:** SHELL-034 (App shell, sidebar, top bar, global search and Home), JOURNEYS-022 (Lens: the core jobs, end to end), ADMIN-052 (Contractors directory, contractor detail and Settings), G1B-I13 (After a tenant submits: the move-in report on the staff side)
- **Verification:** partly. High overstates it for an 11-property portfolio whose loan and insurance facts are one click away on the property page. Index these first: lender, servicer, carrier, policy and loan numbers, llcOwner, deal notes and task descriptions. Leave lockbox codes out, which also keeps door codes out of a search index. Linear dba91946 verified on Mobbin (All, Issues, Projects, Documents). Mercury 980f79d4 not spot-checked.

### IA-I08

**Define each record's actions once and show them in the header menu, on right-click and in Cmd+K**

Medium · Design change · effort M · `Record pages (task, deal, property, contractor), list rows, Cmd+K` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The task page now has a '...' menu: Copy link, Cancel task (with Undo), a divider, then Delete in red behind a confirm dialog (tasks/[id]/header.tsx:32-110). Deals still have no menu and can't be deleted or canceled; deals/actions.ts exports only createDeal, patchDeal and addDealNote. Property and contractor pages have no menu either, and there are no right-click menus or Cmd+K commands anywhere.
- **Why:** Linear and Jobber give every record one menu grouped by intent, and Linear exposes the same commands in Cmd+K and on right-click, so an action is learned once. Without one list, each new button lands wherever it fits and the palette (IA-029) has nothing to call.
- **Change:** Reuse the task page's MoreMenu (components/menu.tsx) on deals first: Copy link and Pass, then Delete after the divider. Add the property menu next (Add task, Copy address, Copy link). Hold off on a shared registry and Cmd+K until a third record type needs them.
- **Desktop, tablet, phone:** Desktop: header overflow plus right-click on rows. Tablet: the overflow opens a popover; no right-click. Phone: the overflow opens a sheet; rows get no hidden long-press menu, since gestures only duplicate visible controls.
- **Reuse:** React Aria Menu (D9); Button ghost icon variant; the actions slot in IA-039's header anatomy; the IA-029 palette.
- **References:** 
  - [Linear](https://mobbin.com/screens/b4e6b70d-27e2-4853-8d0b-b44ab3d54967): One record menu: Move to, Duplicate, Rename, Favorite, Copy, Remind me, Version history, then Delete last, each with its shortcut.
  - [Jobber](https://mobbin.com/screens/1e4846b8-cb8a-40eb-9491-54c8db93960f): More Actions grouped by intent: convert, send as, mark as, then preview and print.
- **Code:** `branch:src/app/(app)/tasks/[id]/header.tsx:32-110`, `branch:src/app/(app)/deals/actions.ts:28-46`
- **Verification:** partly. Effort is L, not M, for a registry across four record types plus right-click and palette wiring. Start with one header overflow per record: Copy link, then a divider, then the destructive item in red (Cancel task, Delete deal), as in Stripe's row menu (Mobbin Stripe 56d83ca8: Edit product, Archive product, Delete product in red). Add row right-click when the palette lands. Jobber and Linear references not spot-checked.

### IA-I10

**When an address isn't found, offer 'Add 12 Elmwood Terrace as a deal'**

Medium · New capability · effort S · `Global search, no-match state` · A quiet shell with real search, navigation and sign-in

- **Today:** Confirmed that a no-match query shows nothing at every width (global-search.tsx:48) and that Enter does nothing. The proposed catch-all 'Create task' row is the part that doesn't hold up (see note).
- **Why:** Mercury's palette turns a dead end into an action ('No results found · Command this instead'). For HG the usual reason an address isn't found is that it's a new lead, and searching before creating is the cheapest duplicate guard (IA-003).
- **Change:** When nothing matches, show 'No matches for "12 Elmwood Terrace"' and one action row under it. Address-shaped queries (a number and a street word) get 'Add 12 Elmwood Terrace as a deal', which opens the deal sheet (IA-009) prefilled. Other queries get 'Create task "congress roof"'. Enter runs the row.
- **Desktop, tablet, phone:** Desktop and tablet: one row under the no-match line. Phone: the same row in the full-screen search sheet (IA-020), 44px tall.
- **Reuse:** GlobalSearch or the IA-029 palette; the deal create sheet from IA-009; normalizeAddress to detect an address shape.
- **References:** 
  - [Mercury](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445): 'No results found' followed by 'Command this instead' with a button that acts on the typed text.
  - [Linear](https://mobbin.com/screens/90b0ca17-b70a-425c-b28b-ce934231b2b9): 'No issues matching the filters' plus '16 issues hidden by filters · Clear Filters': the empty state explains itself and offers the next step.
  - [Attio](https://mobbin.com/screens/1fe247ff-420d-4334-a0f0-9efe664e666c): A 'Find or add a person...' field where search and create are one action.
- **Code:** `src/components/global-search.tsx:48`, `src/components/global-search.tsx:51`, `branch-src/src/components/global-search.tsx:48`, `src/app/(app)/deals/page.tsx:109-112`
- **Also found as:** SHELL-I12 (App shell, sidebar, top bar, global search and Home), DEALS-I06 (Deals pipeline, new deal and deal detail)
- **Verification:** partly. Keep the no-match line and the 'Add … as a deal' row for address-shaped queries. Drop the generic 'Create task "congress roof"' fallback: most no-match queries today are search failures (I01), so offering to create a task turns a miss into a duplicate task. Mercury 02863cc8 verified ('No results found', 'Command this instead').

### IA-I11

**Add 'Save and add another' to task creation for walkthrough punch lists**

Medium · Design change · effort S · `New task (/tasks/new, the future create sheet)` · Create where you are

- **Migration branch:** Still applies on the migration branch. /tasks/new is still a full page with one 'Create task' button (tasks/new/page.tsx:59), and createTask still redirects to the new task's page (tasks/actions.ts:73). The property Tasks card now has 'Apply playbook' next to '+ Task' (properties/[id]/page.tsx:183-188). That covers template batches but not one-off punch-list items.
- **Today:** /tasks/new?propertyId=... is a full page with one 'Create task' button, and creating redirects to the new task's page. Logging six items after a walkthrough of 767 Prospect means six rounds of form, task page, back and + Task.
- **Why:** Basecamp's add form offers 'Save card', 'Save and add another' and 'Never mind', and Linear's create modal has a Create more toggle that keeps the project. Batches of related tasks at one property are the normal case after a showing, turnover or inspection.
- **Change:** In the task create sheet (IA-009) add a secondary 'Save and add another'. It saves, keeps Property, Assignee and Due, clears Title and Description, puts focus back in Title and lists what was added under the form ('Added: Patch hallway drywall'). 'Create task' still opens the new task.
- **Desktop, tablet, phone:** Desktop and tablet: Create task (primary) and Save and add another (secondary) side by side in the sheet footer. Phone: pinned footer with both buttons stacked; the added list collapses to a count ('3 added').
- **Reuse:** Button primary and secondary variants; the IA-009 create sheet; the existing tasks.createTask service.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/18714ac3-b916-4e7b-a05c-08dc67872aff): Footer reads 'Save card', 'Save and add another', 'Never mind'.
  - [Linear](https://mobbin.com/screens/60fb29a7-f5c7-4df0-a7bc-6290d3f0ec93): Create modal opened in context with project chips prefilled and a Create more toggle beside the primary button.
  - [Linear Mobile](https://mobbin.com/screens/be8b3b59-8285-4c7e-835c-b561f683c565): Create sheet with title focused and property chips docked above the keyboard; send button top right.
  - [Things 3](https://mobbin.com/screens/d6e7f013-e95c-4203-b98f-dfe27bac343d): New To-Do appears inline at the top of the list, so the next item is typed in place.
  - [Brex](https://mobbin.com/screens/1ac728ae-b9bd-4824-85c9-f95ecf0e1a10): A short toast confirms the save and the list stays put.
- **Code:** `src/app/(app)/tasks/actions.ts:37`, `branch:src/app/(app)/tasks/new/page.tsx:59`, `branch:src/app/(app)/tasks/actions.ts:50-73`, `branch:src/app/(app)/properties/[id]/page.tsx:183-188`, `src/app/(app)/tasks/actions.ts:31-37`, `src/app/(app)/properties/[id]/page.tsx:170`, `branch:src/app/(app)/tasks/actions.ts:73`, `branch:src/components/sheet.tsx`
- **Also found as:** MOBILE-I07 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. createTask redirects to the new task (tasks/actions.ts:37), and the form has one 'Create task' button (tasks/new/page.tsx:71). Linear's 'Create more' toggle beside 'Create issue' shows on Mobbin (ffa2e456). Basecamp 18714ac3 not spot-checked. This depends on the IA-009 create sheet landing first.

### IA-I14

**Give each property one display name and use it everywhere**

Medium · Design change · effort S · `Everywhere a property is named (Home CapEx, task Property picker, Tasks list, search, sidebar)` · Plain, consistent words

- **Migration branch:** Still applies on the migration branch. The same mix shows up on the branch. Today and All rows show '767 Prospect Avenue', '415 Crescent Ave.', '23 Sherwood St' and '58 Mariner Street'. The task page Property picker lists '118 Congress St.', '23 Sherwood St', '428 Normal Avenue' and '647 Prospect Ave.'. The portal job page shows '118 Congress St. Buffalo, NY 14213'. normalize.ts is unchanged from main, and property titles are still single-line inputs.
- **Today:** The naming mix is confirmed on Home CapEx, the pickers, search and the Portfolio list ('118 Congress St. Buffalo, NY 14213' next to '23 Sherwood St, Buffalo, NY 14213'). But title truncation is not a phone issue. The property title is an input that clips at every width: 299px wide at 1280 and 1920, so the ZIP of '58 Mariner Street, Buffalo, NY' is cut even at 1920 (see IA-V03).
- **Why:** Mercury gives every account one short name ('Checking ••2502') that appears identically in the sidebar, lists and search, which is what makes a dense UI scannable. With D10 putting the 11 properties in the sidebar, mixed suffixes and punctuation will sit stacked in one column.
- **Change:** Add a displayName per property, defaulting to shortAddress after normalization ('767 Prospect', '118 Congress', '23 Sherwood'), editable in the property's details. Use it in the sidebar, page title, breadcrumb, task sublabels, pickers, search rows and the browser tab; show the full mailing address only in the property's details and on the public site.
- **Desktop, tablet, phone:** Same name at every size; phone titles stop truncating because the short name fits at 375 and 320.
- **Reuse:** shortAddress and normalizeAddress in src/lib/normalize.ts; the IA-016 sidebar rows.
- **References:** 
  - [Mercury](https://mobbin.com/screens/f964f8c4-c630-406a-b599-585edf376533): Accounts carry one short name ('Checking ••2502', 'Savings ••5679') used the same way in the sidebar and the page.
- **Code:** `src/lib/normalize.ts:16`
- **Verification:** partly. A derived name (normalized suffix plus shortAddress, one helper) used everywhere gets most of the value without a new editable column. Add displayName only if derived names fail somewhere. Mercury f964f8c4 not spot-checked.

### IA-016

**Spec the D10 property rows: short address only, grouped by lifecycle, no counts or color**

Low · Design change · effort S · `Desktop sidebar (D10 property list)` · A quiet shell with real search, navigation and sign-in

- **Today:** No property list exists yet. Full addresses run to 'Buffalo, NY 14213', and the header on the property page already truncates ('767 Prospect Avenue, Buffalo').
- **Why:** Without a rule, the list will collect status dots and task counts and turn noisy. 'Every color has a job.'
- **Change:** Under Properties, a collapsible group of 11 rows using shortAddress ('767 Prospect'), sorted by street. Once IA-026 lands, group them under two quiet labels, 'Rehabbing' and 'Stabilized'. No counts and no status colors; the active row uses the selected fill. Past 15 properties, show the first 8 and 'All properties'.
- **Desktop, tablet, phone:** Desktop only. The phone Properties tab shows the same grouping as a list.
- **Reuse:** shortAddress in src/lib/normalize.ts; SideNav active styling.
- **References:** 
  - [Copilot Money](https://mobbin.com/screens/8edbc5d1-5e4d-4b8a-b916-c19f9558b6d4): Accounts listed in the sidebar under quiet type groups.
  - [Attio](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5): Favorites and Records groups beneath the main nav.
- **Code:** `asana-migration-plan.md D10`
- **Verification:** partly. Sound guidance for a D10 build that hasn't started, but nothing is broken today, so medium overstates it. The truncation evidence is real: the 767 Prospect header input clips to '767 Prospect Avenue, Buffalo,'.

### IA-036

**Sidebar links return each list to its last filters; no saved-views feature**

Low · New capability · effort S · `Deals, Tasks, Properties and Contractors lists` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. Probe on :3300: from /tasks/all?status=all&owner=none, clicking Deals and then Tasks in the sidebar lands on /tasks (Today) with the filters gone. The Today Mine | Contractors pick (?view=contractors) is also lost on return. nav.tsx changed only the 'Vendors' label to 'Contractors'.
- **Today:** Filters live only in the URL. Test: from /tasks?status=all&owner=none I clicked Deals, then Tasks in the sidebar, and landed on plain /tasks with the filters gone.
- **Why:** Two partners don't need named saved views, but they shouldn't rebuild a filter after every detour. Mercury pairs saved state with a visible Reset.
- **Change:** Store each list's last query string per browser. The sidebar and bottom-bar links restore it, and a 'Reset' chip appears in the filter row whenever it differs from the default.
- **Desktop, tablet, phone:** Same everywhere. On phone, Reset sits at the end of the chip row.
- **Reuse:** The sessionStorage helper from IA-002, extended to localStorage; existing URL-driven filters.
- **References:** 
  - [Mercury](https://mobbin.com/screens/2789fe71-1ccd-4834-b61e-83f3d79b475e): Persistent filter chips with Reset and Saved views.
  - [Contractbook](https://mobbin.com/screens/93115f27-5920-40c7-9197-6ba0cca45a51): Filter chips with 'Clear all' next to the list.
- **Code:** `Probe: /tasks?status=all&owner=none, then Deals, then Tasks, lands on /tasks`, `src/components/nav.tsx:93-100`, `branch: src/components/nav.tsx:62`, `branch: src/app/(app)/tasks/page.tsx:10-20`
- **Verification:** partly. Reproduced by design: sidebar links are static hrefs and nothing persists filters. The painful case is the return from a record (IA-002). Restoring filters from the sidebar can surprise people ('why is my list filtered?'), so it needs the Reset chip and is lower value.

### IA-039

**One page-header anatomy: breadcrumb, title, meta, actions, then tabs**

Low · Design change · effort S · `Settings, Financials, record pages` · One record layout for every record

- **Today:** Settings renders TopTabs above a PageHeader titled 'Settings' on every tab (layout.tsx renders tabs before children). Financials renders its H1 and subtitle above its tabs. Detail pages hand-roll headers.
- **Why:** The same element in a different order on every page reads as unfinished. Stripe always uses title, then tabs.
- **Change:** Extend PageHeader with breadcrumb, meta and tabs slots, and use it on Financials, the property hub, the deal page and contractor pages. Tabs always sit under the title.
- **Desktop, tablet, phone:** Desktop and tablet: actions right-aligned on the title row. Phone: actions move to the top bar '+' and '…'.
- **Reuse:** PageHeader in src/components/ui.tsx; TopTabs.
- **References:** 
  - [Stripe](https://mobbin.com/screens/0bc4fa17-a5de-4af7-a8f6-3fd5f45a1a7e): 'Product catalogue' title with the action on the right and tabs underneath.
- **Code:** `src/app/(app)/settings/layout.tsx:13-21`, `src/app/(app)/settings/capex-rules-editor.tsx:302-303`, `src/app/(app)/financials/layout.tsx:9-21`
- **Verification:** partly. Largely duplicates IA-017 (each page owns its header) and IA-018 (breadcrumb, title, status, actions). Merge into IA-018 and keep only the distinct fix: Settings tabs sit above a repeated 'Settings' H1.

### IA-045

**Add a skip-to-content link and focus the page heading on navigation**

Low · Fix · effort S · `App shell` · A quiet shell with real search, navigation and sign-in

- **Today:** There is no skip link. Keyboard users tab through the search, the theme toggle and seven nav links before reaching content on every page, and focus stays put after client navigation.
- **Why:** Keyboard flow is part of the crisp feel, and screen readers need to know where they landed.
- **Change:** Add a visually hidden 'Skip to content' link targeting main. After each route change, move focus to the page H1.
- **Desktop, tablet, phone:** No visual change.
- **Reuse:** AppShell main element.
- **Code:** `Probe: no a[href='#main'] on the page; one main element`, `src/components/app-shell.tsx:186-197`, `src/components/app-shell.tsx:62-92,193`, `tabwalk / desktop: tabs 1-12 are shell controls; the first main item is tab 13`
- **Also found as:** SHELL-V02 (App shell, sidebar, top bar, global search and Home), FEEL-047 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Also: the collapsed sidebar's pin button is opacity-0 and pointer-events-none but still in the tab order, so it's an invisible focus stop. Record pages have no H1 to move focus to (see IA-V04), so this depends on that fix.

### IA-I06

**On phone and tablet, make the property title a switcher for the 11 properties**

Low · Design change · effort S · `Property page (/properties/[id]) on phone and tablet` · The phone is a chosen subset, and touch has no hover

- **Today:** Confirmed that the drawer lists sections only (property-767--drawer--mobile-light.png). But the title this finding wants to turn into a switcher is an inline-edit input for the address (PropertyAddressField, edit-details.tsx:33), so a chevron there collides with tap-to-edit. Below 1024px the D10 sidebar is this same drawer, so once D10 lists the properties a switch takes two taps either way.
- **Why:** On a site day partners hop between buildings. Shopify iOS makes the page title a menu ('Orders' opens Orders, Draft orders, Abandoned checkouts) and Vercel's breadcrumb carries a project switcher, so moving sideways never means going back up.
- **Change:** Below 1024px, add a chevron to the property title; tapping opens a list of the 11 short addresses grouped as in IA-016 with the current one checked. Picking one switches property and keeps the same tab (CapEx stays CapEx). Desktop keeps a plain title because the sidebar already lists the properties.
- **Desktop, tablet, phone:** Desktop 1280: no change; the sidebar list does this job. Tablet 768: popover under the title. Phone 375: bottom sheet with 44px rows. Nothing drops.
- **Reuse:** React Aria Menu, Popover and sheet behavior (D9); shortAddress; the D10 sidebar's property list data.
- **References:** 
  - [Shopify](https://mobbin.com/screens/ff016813-d7d7-4e02-b27d-4170390b6225): The page title opens a menu of sibling views; the list below stays in place.
  - [Vercel](https://mobbin.com/screens/93c1e7c5-c8ab-4e73-84f2-f8be4cc3da73): The breadcrumb's project name carries a switcher, so you change project without leaving the current tab.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:81`
- **Verification:** partly. The part worth keeping is 'switching keeps the current tab'. Fold it into the D10 drawer and bottom-bar design rather than adding a second property switcher. Shopify ff016813 and Vercel 93c1e7c5 not spot-checked.

### IA-I12

**Add a Hide figures switch for showing the app to someone else**

Low · New capability · effort M · `Account menu and every page with figures` · A quiet shell with real search, navigation and sign-in

- **Today:** True that figures and lockbox codes show in the clear. The 'why' overstates the need: Brandon co-owns 58 Mariner, so hiding its figures from him is moot. Contractors need the lockbox code and are about to get their own scoped portal pages. Nothing suggests partners screen-share the app with lenders.
- **Why:** Mercury hides every balance behind one control ($•• in place of amounts) and masks account numbers until revealed, which makes showing the dashboard safe. HG needs it at walkthroughs (58 Mariner is co-owned with Brandon) and on lender calls.
- **Change:** Add 'Hide figures' to the account menu (IA-019) and to Cmd+K with one key. When on, money renders as '$•••' and lockbox and account numbers as '••••', remembered on that device. No top-bar icon; the masked figures are the signal. Implement as one attribute on <html> that styles a shared figure class used by fmtMoney output and Kpi, applied before paint like the theme.
- **Desktop, tablet, phone:** Same behavior at every size. On phone the toggle lives in the account sheet with the sublabel 'Masks amounts and codes on this device'.
- **Reuse:** fmtMoney and Kpi output; the IA-019 account menu; the THEME_SCRIPT pattern for applying state before paint.
- **References:** 
  - [Mercury](https://mobbin.com/screens/dbf9eb63-dcfe-4876-965a-e8a6d8702092): With figures hidden, every balance on Home reads '$••' while the layout stays the same.
  - [Mercury](https://mobbin.com/screens/3fc26968-c892-4440-ba03-2cc7707f1f70): Account numbers show masked with an eye to reveal on demand.
  - [Mercury](https://mobbin.com/screens/1409f3cf-aafe-4e2f-9045-b4bdb2c48484): The toggle sits next to the account controls.
- **Code:** `src/lib/utils.ts:8`, `docs/components.md (Duplicates: money formatting)`
- **Also found as:** SHELL-I18 (App shell, sidebar, top bar, global search and Home)
- **Verification:** partly. Low-priority capability; defer it until the contractor portal ships. The Mercury pattern is real: the Mercury screen returned in my search shows masked '$••' balances.

### IA-I13

**Search returns a closed deal and its property as two records for one building**

Low · Fix · effort S · `Global search results` · A quiet shell with real search, navigation and sign-in

- **Today:** Confirmed that the duplicate building results exist ('Mariner' and '647' each return the property and its CLOSED! deal). But Deal.convertedPropertyId is empty on all 11 CLOSED! deals: none of their pages renders the existing 'Converted →' link (deals/[id]/page.tsx:51). So the proposed condition never fires, and hiding closed deals would strand their purchase history because no property page links back to its deal.
- **Why:** One building should be one result, as each Stripe record is one entity. Two near-identical rows make partners guess which one holds the current facts.
- **Change:** Leave CLOSED deals out of search when convertedPropertyId is set or their addressKey matches an owned property. The property's activity links back to its deal (IA-033, IA-034), and closed deals stay reachable through 'See all deals' (IA-I04).
- **Desktop, tablet, phone:** No visual change at any size.
- **Reuse:** Deal.convertedPropertyId; addressKey in src/lib/normalize.ts.
- **Code:** `prisma/schema.prisma:69-70`, `src/app/api/search/route.ts:41`
- **Verification:** partly. Fix the data first (IA-V04), then show the property row with the closed deal behind it, rather than dropping the deal from search.

### IA-V07

**Merge free-text assignees that duplicate real people**

Low · Fix · effort S · `Task Assignee picker and Tasks Owner filter` · Fix wrong numbers and records first

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The task Assignee picker now offers only Unassigned, Team and Contractors (lib/tasks/assignee-options.ts), so 'Connor Swofford (external)' is gone. A leftover free-text name shows as 'Assigned in Asana to {name}' above the notes (tasks/[id]/view.tsx:120). The All tab's Assignee filter now has an 'External' group of 9 legacy names: three raw emails ([email], [email], [email]), 'José Alvarez' next to contractor 'Jose Alvarez', and near-duplicates of contractor records ('Brandon Zarbo', 'Kenneth Gonzalez', 'Jacob hoak' for 'Jacob (Jake) hoak', 'John OConnell' for 'Jon Oconnel') (filters.tsx:107-115, lib/tasks/queries.ts:100-115). Separately, 'Jacob (Jake) hoak' renders as 'J(' in avatars on Today and the property Tasks card (lib/utils.ts initials).
- **Why:** Filtering by owner silently misses tasks split between the user and the free-text copy, and the contractor portal will map assignees to logins. Duplicates there become two accounts or orphaned jobs.
- **Change:** Map these 9 names to contractor ids in the migration's assignee step. Only Brandon Kmiotek has no contractor match. That empties the External group and puts the contractors' done jobs back on their pages. Also strip parentheses in initials().
- **Desktop, tablet, phone:** Data fix; the pickers simply get shorter at every size.
- **Reuse:** The migration's contractor mapping (asana-migration-plan.md notes contractors are free-text names); externalOwners query in src/app/(app)/tasks/page.tsx:117-123.
- **Code:** `src/app/(app)/tasks/page.tsx:117-123`, `branch:src/app/(app)/tasks/filters.tsx:107-115`, `branch:src/lib/tasks/queries.ts:100-115`, `branch:src/lib/tasks/assignee-options.ts`, `branch:src/lib/utils.ts:49-59`
- **Verification:** verifier-found
