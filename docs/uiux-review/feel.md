# Lens: interaction quality, feedback, states, speed and accessibility

Part of the [UI/UX review](README.md). 32 findings: 1 critical, 7 high, 16 medium, 8 low.

## How it should work

FEEL rests on one promise: every action answers within about 100 ms, says exactly what changed, and can be taken back. Six habits from the library deliver it, and the result has less chrome than today.

1. **Act, name the change, offer Undo.** Writes apply at once and roll back if they fail. A small dark toast names the exact change and carries Undo, the way Linear Mobile says "Issue moved to Design" (https://mobbin.com/screens/a625482c-b708-4b6b-a9b2-1f4a4feb26f6) and Superhuman says "Marked as Done. UNDO" (https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5). Z undoes the last action. When an edit ripples outward, the same toast shows the ripple, as Stripe previews the new balance before you commit (https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8). Confirm dialogs remain only for money and permanent deletes.

2. **Edit where you read.** On the property page, each fact edits on its own and saves with a toast for that field, as Mercury's settings (https://mobbin.com/screens/cc047c78-63c7-4640-a2ce-35f6cee4bba7) and Airbnb's calendar panel (https://mobbin.com/screens/bc83ce0c-a98c-4b24-95db-b1bc329d288d) work. New tasks open in a small dialog with a Create more switch, as in Attio (https://mobbin.com/screens/08df4ff2-a5d6-4200-b3b5-44e3ddc41f09).

3. **Never lose your place.** Records open in a drawer beside the list, as Mercury does (https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62). Full pages carry Linear's 2 / 5 stepper (https://mobbin.com/screens/62c94bcd-0559-4356-9d0e-bce71c021d88). Completing a task opens the next one, and Back lands on the row you left. Overdue tasks are rescheduled in bulk from a floating selection bar (https://mobbin.com/screens/3f36e39e-2b9e-4145-bee2-f43a3cf21f7b).

4. **The keyboard is a first-class input.** J and K move through rows, Enter opens, E completes, C creates, / searches and ? lists every key, as Superhuman's sheet does (https://mobbin.com/screens/3ae6bf95-6bbd-4232-b045-3160b748393c). Keys appear only where they apply: Esc and Return on dialog buttons, as in Attio, and the key beside each menu item, as in Linear (https://mobbin.com/screens/b4e6b70d-27e2-4853-8d0b-b44ab3d54967). Mouse users get a one-time tip like "Next time, hit / to search" (https://mobbin.com/screens/9ca8bf8c-42da-419c-a947-845037e5f17a).

5. **Waiting looks like the finished page.** Labels and controls render at once and only the values shimmer, as in Vercel (https://mobbin.com/screens/87d19b6c-7a3b-4ce7-985c-5c4d13641701) and Mercury (https://mobbin.com/screens/e5c4c1d0-bf25-45e9-a9b6-bda735a49703). Errors stay in place with Try again (https://mobbin.com/screens/61170c15-0349-45ef-a6b0-b6ec95b7d1f6). Long forms save themselves, as Stripe's "Draft saved" shows (https://mobbin.com/screens/e26d409c-55c7-407b-8d16-11c7666c0d7f), so a resident's 54-answer move-in report survives a reload.

6. **Finishing feels finished.** Clearing your queue ends on a property photo and the next item due, not a dashed box (https://mobbin.com/screens/fbdb4339-367d-4571-8c9c-daf79b8c098c). A sent report shows a dated "what happens next" timeline (https://mobbin.com/screens/8d02d16c-e063-4c06-a308-03b3b97340e9).

What disappears: card-level Edit and Save buttons on fact cards, most confirm dialogs, scattered gray status lines, nine-entry status corrections in deal timelines, and a 1,569-stop tab path through the task list.

<details><summary>What the reviewer covered</summary>

Server at http://localhost:3200 was up. Load times: I loaded all 30 routes once at desktop in Chromium with aria snapshots (to networkidle). That covers Home, Deals, a new deal, 3 deals, Portfolio, a new property, 4 properties, Tasks, a new task, 2 tasks, Vendors, 2 contractors, Financials, Rent roll, Financials settings, Settings (CapEx rules, Move-in form, Storage), Welcome, Rentals, Residents, Moving in, Login (signed out) and an in-app 404. Every route reached networkidle in 590 to 860 ms. Server TTFB was 1 to 55 ms. The slowest page is /tasks: 843 ms, 1.1 MB of HTML, 20,554 DOM nodes and 6,058 option elements. Financials settings is 197 KB and property pages are 65 to 98 KB.

Other viewports and browsers: Tasks at tablet, mobile and 320; property 767 at tablet, mobile and 320; WebKit at mobile and 320 for /tasks, property 767, /deals, /financials and a contractor; the move-in report and login at mobile.

Dark mode: a scripted text-contrast scan of Home, Tasks, Deals, property 767, Financials and Vendors in both themes, plus the loan editor and the error state in dark.

States I exercised:
- Writes: the helper aborts every write, which is how I saw the failure states. I also used a variant that holds each write for 1.5 to 3 s before aborting, to capture pending states. That covers a task toggle, a task description save, property Details edit and save, the Units editor's discard dialog, removing a CapEx rule, QuickBooks refresh, the Cash/Accrual basis toggle, New task with a triple click, Sign in with a bad password, an attachment upload failure, and empty submits of New task and the move-in report.
- Slow network: CDP throttling for nav clicks Home to Tasks and Home to Vendors, and for the Deals Pass filter.
- Keyboard: tab walks of Home (desktop and mobile) and Tasks; drawer focus and Esc; Esc in the dialog and the status multiselect; global search with Cmd+K, arrows, Enter, Esc and no results.
- Empty filter results on Tasks and Deals; Edit visibility on touch; Units editor overflow.

Mobbin: 15 searches.

Not reached:
- Success paths, because writes are blocked. Success toasts, the move-in thank-you screen and post-save revalidation were judged from code.
- Removing an attachment: the local data has no attachments. Judged from the code in components/attachments.tsx and lib/tasks/service.ts.
- Rentals carousel arrows: no listing has 2 or more photos.
- The contractor portal (not built yet), real-phone hydration timing, and screen-reader runs. Accessibility was judged from aria snapshots and code.

</details>

## Findings

### FEEL-001

**A typo in a money field silently wipes the stored value**

Critical · Fix · effort S · `Property page: Details, Loan and Insurance editors` · Fix wrong numbers and records first · quick win

- **Today:** The Value, Purchase price, Loan amount, Rate, Payment, Premium and Replacement cost fields are plain text inputs with no validation. I typed "abc" into Value and "-5" into Sq ft and clicked Save, and the form submitted. On the server, patchProperty runs each money field through amountToDecimal(). That returns null for anything it can't parse, and null is written to the column. Sq ft strips every non-digit, so "-5" becomes 5. A typo like "55o,000" erases the $550,000 value with no message.
- **Why:** Silent data loss on money is the worst kind of bug for a property company's system of record. Stripe and Ramp never write a value they couldn't parse: they block the save and point at the field.
- **Change:** In service.patchProperty, keep a blank field meaning "clear", but treat a non-blank value that parseAmount can't read as a validation error. Return it through withResult as { ok: false, field, error } instead of writing null. Do the same for sqft: reject negatives and non-numbers. In the editors, show the error under the field ("Enter an amount like 550,000"), keep the form open with the user's input, and focus the bad field.
- **Desktop, tablet, phone:** Same on every size. On a phone the error line sits under the full-width field, and the form keeps the user's input so nothing has to be retyped.
- **Reuse:** Extend lib/money.ts parseAmount (it already returns null for invalid input) and switch patchProperty from withLog to withResult (lib/server-action.ts), the pattern updatePropertyUnits already uses. Show errors with the planned Field wrapper (FEEL-022).
- **References:** 
  - [Vapi](https://mobbin.com/screens/34766f43-7ba1-44a3-9c42-a20826230325): Amount input with a $ prefix, red border and one-line error; the primary action stays disabled until the value is valid.
  - [Vercel](https://mobbin.com/screens/0a227055-0e20-4ef1-a4cf-08bd5e0d9c58): Invalid field turns red with an inline message while the other fields keep their values.
- **Code:** `src/lib/properties/service.ts:112 (MONEY_FIELDS -> amountToDecimal(s(k)) writes null on garbage)`, `src/lib/properties/service.ts:114 (sqft strips non-digits: -5 becomes 5)`, `src/lib/money.ts:16-29 (parseAmount returns null for unparseable input)`, `src/app/(app)/properties/[id]/edit-details.tsx:99-111`, `src/app/(app)/properties/[id]/edit-loan.tsx:97-99`, `src/app/(app)/properties/[id]/edit-insurance.tsx:94-95`
- **Verification:** confirmed. Reproduced at 320 and 1280: typed "55o,000" into Value, clicked Save, and the form POSTed (blocked) with no client check. service.ts:110-114 writes amountToDecimal() as null for anything parseAmount rejects and strips every non-digit from sqft. When patchProperty moves to withResult, also pass p.version: unlike updatePropertyUnits it has no conflict check (prisma.property.update by id only). References are fine.

### FEEL-005

**Submit buttons have no pending state, so double taps create duplicate tasks**

High · Fix · effort S · `New task, New deal, New property, deal Add note, Sign in` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. There is no useFormStatus or SubmitButton anywhere in src. On /tasks/new, 20 ms after clicking 'Create task' the button was still enabled with the label 'Create task'. Only one POST was blocked in this run, because the helper aborts the first request and that throws to the error boundary, so the duplicate count can't be reproduced here. createTask still has no dedupe. Deal 'Add', New deal, New property and /login are unchanged. The new contractor-facing auth forms (forgot password, reset, first password) use the same plain submit button with no pending state.
- **Today:** These forms post with <form action={serverAction}> and a plain Button. With writes held for 1.5 s, "Create task" stayed enabled with the same label. Three clicks sent three POSTs to /tasks/new. Deals and properties dedupe by address on the server; tasks and deal notes don't. Sign in also shows no change while it posts.
- **Why:** Nothing happens on tap, so people tap again, and on a slow connection that means duplicate tasks or notes. Stripe and Ramp disable the button and swap its label the instant you press it.
- **Change:** Add a SubmitButton built on useFormStatus. While pending it is disabled, keeps its width and shows a small spinner plus the verb ("Creating…", "Adding…", "Signing in…"). Use it in all five forms. On the server, have createTask skip an identical title, assignee and property created by the same user in the last 10 seconds.
- **Desktop, tablet, phone:** Same on every size. On a phone the full-width primary button keeps its height while pending, so the layout doesn't jump.
- **Reuse:** Extend Button in src/components/ui.tsx with a pending prop, then add SubmitButton next to it. This follows the useTransition label-swap pattern listed in docs/components.md under Pending action.
- **References:** 
  - [OpenAI Platform](https://mobbin.com/screens/5fe45e48-5dbc-4903-8ca4-ecfe5507ace9): Single primary Continue action; the form state is kept and the error is shown in place.
  - [Whop](https://mobbin.com/screens/80459def-95d4-4909-9e7b-8d47d7807147): Primary button switches to a disabled spinner state while work is in flight.
  - [Google](https://mobbin.com/screens/10b34a13-f0a2-43d5-997d-6bb733e63cc4): Primary action disabled until the form can be submitted.
- **Code:** `shoot-slow run on /tasks/new: blockedWrites = 3 x POST /tasks/new from three clicks`, `src/app/(app)/tasks/new/page.tsx:27,71`, `src/app/(app)/deals/[id]/page.tsx:100-105`, `src/app/(app)/deals/new/page.tsx:48`, `src/app/(app)/properties/new/page.tsx:33`, `src/app/login/page.tsx:54-59`, `src/app/(app)/tasks/new/page.tsx:30,59`, `src/app/(app)/tasks/actions.ts:50-75`, `src/app/(app)/deals/[id]/page.tsx:101-106`, `src/app/login/page.tsx:32-55`, `src/app/login/forgot/page.tsx:27-40`, `src/app/login/reset/page.tsx:63-65`, `src/app/(portal)/p/welcome/password/page.tsx:27-62`, `src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:133,185 (pending reference)`, `eval /tasks/new: after click [disabled=false, 'Create task']`, `Probe on /tasks/new: three clicks on Create task produced three blocked POST /tasks/new; button never disabled`, `src/app/(app)/tasks/new/page.tsx:71`, `src/app/(app)/deals/[id]/page.tsx:100-104`, `branch-src/src/app/(app)/tasks/new/page.tsx:59`, `branch-src/src/app/(app)/deals/[id]/page.tsx:100-104`, `branch-src/src/components/ui.tsx:79-92`
- **Also found as:** FEEL-IV06 (Lens: interaction quality, feedback, states, speed and accessibility), PORTFOLIO-011 (Portfolio list and new property)
- **Verification:** confirmed. Reproduced on /tasks/new: three clicks on Create task sent three POSTs. The button stayed enabled with the label "Create task", then the page fell into the error card. The server-side 10 second dedupe is optional once the button disables.

### FEEL-007

**Clicking a link gives no feedback until the next page has fully loaded**

High · New capability · effort M · `All signed-in navigation (sidebar, row links, tabs)` · Every save is safe, instant and undoable

- **Today:** There is no loading.tsx anywhere in src/app. On a throttled connection (800 ms latency), 400 ms after clicking Vendors in the sidebar the old page was still showing, Home was still highlighted and nothing else had changed. The new page swapped in at 1.5 s. Locally every route takes 0.6 to 0.85 s; in production every click carries network latency on top.
- **Why:** A click that seems ignored is the main reason an app feels slow. Stripe, Vercel and Linear react within one frame: the nav item highlights at once and a page-shaped skeleton appears.
- **Change:** 1) Add loading.tsx for (app)/deals, properties, properties/[id], tasks, tasks/[id], contractors and financials. Each is a skeleton built from the real Card, PageHeader and Table shells: gray bars where text goes, no spinner. 2) In SideNav, use useLinkStatus (Next 16) to give the clicked item the active fill immediately. 3) Wrap slow Home cards (CapEx forecast, My open tasks) in Suspense so they stream in one at a time.
- **Desktop, tablet, phone:** Each skeleton matches the layout at that width: table rows on desktop and tablet, stacked list rows on a phone. On a phone the bottom bar item highlights the moment it is tapped.
- **Reuse:** src/components/nav.tsx SideNav and the Card, Table and PageHeader primitives in src/components/ui.tsx. Add a Skeleton primitive to ui.tsx and a row in docs/components.md (it is listed under Known gaps as "Loading state").
- **References:** 
  - [Vercel](https://mobbin.com/screens/881d914d-6f0f-4564-bbe7-90894d0d35e3): Sidebar, search and Add New are live while only the project cards shimmer. The skeleton matches the final card layout.
  - [Vercel](https://mobbin.com/screens/87d19b6c-7a3b-4ce7-985c-5c4d13641701): The page title, filters and segment control render first, and only the chart and totals are placeholders.
  - [Mercury](https://mobbin.com/screens/e5c4c1d0-bf25-45e9-a9b6-bda735a49703): Settings labels render immediately while only the values shimmer. That is the model for HG's property Details, Loan and Insurance cards.
  - [Mercury](https://mobbin.com/screens/f0d19b48-c4fa-4fc2-9cdc-bf999b23836e): Phone list skeleton: the title, search and filter chips work at once, and the rows are two-line placeholders.
  - [Square](https://mobbin.com/screens/09371ef3-f0d0-4fc9-8ab1-607ab3d0e4ab): Page skeleton keeps the header, chart block and table columns in place, in quiet gray bars.
  - [Neon](https://mobbin.com/screens/9b5b1374-c015-495b-abcb-9cce659c741b): Table skeleton with the real title and column rhythm; no spinner.
  - [Vercel](https://mobbin.com/screens/a8d666ee-3303-4b28-9e1f-06b8dbd63cb6): One card still skeletal while the others have streamed in.
  - [Mercury](https://mobbin.com/screens/ad20eb69-7c68-4d3b-b0bb-7eb11c3e60e7): Small activity indicator while the content stays in place
  - [Mercury](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930): Account page with light skeleton rows in the transactions table while it loads
  - [Stripe](https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c): List frame and toolbar stay fixed while rows fill.
- **Code:** `find src/app -name loading.tsx returns nothing`, `src/components/nav.tsx:93-104`, `src/app/(app)/page.tsx:13`, `src/components/nav.tsx:95-105`, `src/app/(app)/properties/[id]/page.tsx:232`, `src/app/(app)/properties/page.tsx:105`
- **Also found as:** SHELL-033 (App shell, sidebar, top bar, global search and Home), PROPERTY-037 (Property detail page (future property hub)), PORTFOLIO-045 (Portfolio list and new property)
- **Verification:** confirmed. No loading.tsx anywhere under src/app. Every (app) route is dynamic (it reads cookies), so Link prefetch has no loading boundary to prefetch and each click waits for the full server render. useLinkStatus is documented for the installed Next 16.3.3 (node_modules/next/dist/docs/.../use-link-status.md). I couldn't throttle with the helper, so the timing comes from the reviewer and the code. Skeleton references are fine.

### FEEL-009

**Saves never confirm: no toast, so you can't tell an edit worked**

High · New capability · effort M · `Every save in the app` · Every save is safe, instant and undoable · big bet

- **Today:** The app has no toast (docs/components.md lists it under Known gaps). After a successful save, the property sections quietly flip back to view mode. Task fields just un-dim. Deal list rows flash green for 700 ms, which is the only confirmation anywhere. QuickBooks refresh prints a tiny gray line. There is no aria-live region, so screen readers hear nothing.
- **Why:** People keep checking whether an edit took. Linear and Stripe confirm quietly every time, and that small loop is much of what makes them feel trustworthy.
- **Change:** Add a Toast primitive: one region, newest on top, at most 3 visible, auto-dismissed after about 4 s and paused on hover. It holds a check or alert line icon, one line of text and an optional action (Undo, Retry, View). Text follows the copy rules: "Loan saved", "Due date moved to Friday. Undo", "Couldn't save. Retry". The region uses role=status, with role=alert for errors. Retire the deal-row green flash in favour of it, and keep inline field errors for validation.
- **Desktop, tablet, phone:** Desktop 1280: bottom right, 24 px from the edges, width fitted to the content. Tablet 768: bottom right. Phone 375: full width minus 16 px gutters, bottom centre above the planned bottom bar. Swipe to dismiss.
- **Reuse:** New in src/components/ (toast.tsx, plus a provider in AppShell) with a row in docs/components.md. React Aria's Toast is approved under the overlay decision.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/bc83ce0c-a98c-4b24-95db-b1bc329d288d): A setting saves on change and the toast names it: 'Advance notice updated'.
  - [Mercury](https://mobbin.com/screens/cc047c78-63c7-4640-a2ce-35f6cee4bba7): 'Entries start date updated': a quiet dark toast at the bottom center naming the field.
  - [Linear Mobile](https://mobbin.com/screens/a625482c-b708-4b6b-a9b2-1f4a4feb26f6): 'Issue moved to Design' names the exact new value, not just 'Saved'.
  - [Linear](https://mobbin.com/screens/c7223b87-8318-4848-8453-2ac4b1e1a0a9): "Cycles enabled" toast: small icon, bold title, one muted line, close X, bottom right.
  - [Stripe](https://mobbin.com/screens/fa14d771-ae36-4074-8532-06dbcfd8ff74): "2 messages marked as read" dark toast, bottom centre, with a check icon.
  - [Asana](https://mobbin.com/screens/36cb9092-004d-4cfa-abc7-930e4a7ff931): Toast with an Undo button for reversible actions.
- **Code:** `docs/components.md Known gaps: "Toast. No toast or saved confirmation; saves only show inline errors."`, `src/app/(app)/deals/deal-row.tsx:37-41,54 (the only success cue, a 700 ms flash)`, `src/app/(app)/properties/[id]/edit-details.tsx:93 (save then setEditing(false), no confirmation)`, `grep for aria-live / role=status in src: 0 matches`
- **Verification:** confirmed. Confirmed (docs/components.md Known gaps lists Toast). Scope it: toast on explicit saves (section Save, create, delete with Undo, sync) and on every failure, but not on each inline cell edit in a list. Linear toasts 'Profile updated' (seen via search, c7223b87 verified) but not issue-row property changes. This also settles the clash with FEEL-027: pick one success channel, not a header 'Saved' chip plus a toast.

### FEEL-010

**Filters and sorts don't respond until the server returns, and each one adds a history entry**

High · Fix · effort S · `Deals and Tasks filter bars, sort headers, Financials basis toggle` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. Deals is unchanged apart from the extracted SegmentedControl. The status tabs, status multiselect and sort headers still call router.push with no transition, optimistic selection or pending cue. The new /tasks/all filters (Open/Done/All, Assignee, Property) do the same: router.push per change, with replace only for the debounced search. The Today Mine | Contractors switch is the exception: it uses history.replaceState, so it's instant and adds no history.
- **Today:** Clicking "Pass" on /deals with throttling: after 300 ms "Active" was still selected and the table unchanged; the switch happened about 1.2 s later. router.push runs with no transition or pending cue. Each checkbox in the status multiselect pushes a new history entry: two picks took history from 2 to 4, so Back walks through every toggle. Sort headers also push.
- **Why:** A segmented control that ignores the click feels broken, and Back should leave the page rather than undo filters one at a time. Stripe's filters flip instantly and update the URL in place.
- **Change:** Wrap filter, sort and multiselect changes in startTransition with router.replace. Set the selected segment or checkbox optimistically, so the fill moves at once. While pending, fade the table body to 60% and show a 2 px progress line under the filter bar. Keep router.push only for real navigation.
- **Desktop, tablet, phone:** Same behaviour at all sizes. On a phone, where filters collapse into a Filters button, the sheet's choices apply optimistically and the list behind updates when the sheet closes.
- **Reuse:** src/app/(app)/deals/filters.tsx (the recommended SegmentedControl), deals/status-multiselect.tsx, tasks/filters.tsx, deals/sort-header.tsx, tasks/sort-header.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/2b2d5f4f-bdd9-4186-b383-e3b30140a551): Filter chips and status tabs with counts update the results in place, with Clear filters beside them.
  - [Linear](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab): The list reacts to filters immediately and states "1 issue hidden by filters · Clear Filters".
- **Code:** `src/app/(app)/deals/filters.tsx:25-33,66`, `src/app/(app)/deals/status-multiselect.tsx:23-29 (router.push per toggle)`, `src/app/(app)/deals/sort-header.tsx:40`, `src/app/(app)/tasks/sort-header.tsx:32`, `src/app/(app)/deals/filters.tsx:25-33`, `src/app/(app)/deals/status-multiselect.tsx:28`, `src/app/(app)/tasks/filters.tsx:36-46`, `src/app/(app)/tasks/today-view.tsx:35-42`, `src/components/segmented-control.tsx:47-63`, `src/app/(app)/tasks/filters.tsx:27-36`, `src/app/(app)/tasks/sort-header.tsx:27-33`, `branch:src/app/(app)/tasks/filters.tsx:36-55`, `src/app/(app)/deals/status-multiselect.tsx:23-29`
- **Also found as:** TASKS-020 (Tasks list, new task and task detail), DEALS-027 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. Reproduced: one status multiselect pick took history.length from 2 to 3 and set ?statuses=1+-+High via router.push. The checkboxes are controlled by checked={selected.includes(s)} from the URL, so a clicked box doesn't tick until the server round trip finishes. Tabs and sort headers also push. References are fine.

### FEEL-I12

**A resident's move-in report is lost on any reload**

High · New capability · effort S · `Public move-in report (/residents/moving-in)` · Every save is safe, instant and undoable

- **Today:** On a 375px phone the report has 54 inputs over about 5,600px: a Good, Fair, Poor or N/A choice plus a comment for every item. All answers live only in React state (tenant name, sections, comments, submitter). Nothing is saved on the device; the only storage calls in src/ are the theme and the deal column widths. A reload, a tab the phone discards while the resident switches to the camera, or a stray back swipe empties the form.
- **Why:** Stripe autosaves long editors and says so ('Draft saved', 'Draft saved 4 minutes ago'). A resident walking a unit room by room is exactly the person who leaves the tab mid-form, and losing 40 answers ends the report.
- **Change:** Save the draft to localStorage on every change, keyed by form version and wrapped in try/catch per the browser storage rule. Show a muted 'Draft saved on this phone' line beside Submit. On return, restore the answers and show one line above the form: 'We kept your answers from Tuesday. Start over'. Clear the draft after a successful submit.
- **Desktop, tablet, phone:** The same at every size. Both lines are short enough to stay on one line at 320px.
- **Reuse:** State in src/app/(marketing)/residents/moving-in/move-in-form.tsx; public site text styles (muted #767d8a).
- **References:** 
  - [Stripe](https://mobbin.com/screens/e26d409c-55c7-407b-8d16-11c7666c0d7f): A long editor autosaves, with 'Draft saved' in muted text beside the primary action.
  - [Stripe](https://mobbin.com/screens/fdd00a8f-d75f-4186-9e64-d52551ae4cf7): 'Draft saved 4 minutes ago' says when, so the person trusts it.
  - [Airbnb](https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394): Every setup step carries a 'Save & exit' pill at the top left, so a long form can be left and resumed.
  - [Substack](https://mobbin.com/screens/82775899-c1fd-4829-bd9d-6f4706660232): A small 'Saved' indicator in the editor header while writing.
  - [Vestiaire Collective](https://mobbin.com/screens/45b3e9e8-6823-4a13-87b1-c4c3000ce1ee): 'Your draft has been saved' with the draft resumable and '4 steps left'.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:40-51 (useState only)`, `Probe: form has 54 inputs, 5,568px tall at 375px`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:40-51`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:40-47`
- **Also found as:** PUBLIC-043 (Login and the public site), PUBLIC-V11 (Login and the public site)
- **Verification:** confirmed. Verified: 55 form fields (one is the honeypot) and 187 rating buttons. The page is 7,448px tall at 375. All state is in useState, and a reload after typing a tenant name came back empty. The real risk is worse than reloads. A failed submit after the whole form is filled also wipes everything (FEEL-V05). Fix that first. The draft save then covers reloads and tab discards. Wrap storage in try/catch per the browser-storage rule.

### FEEL-I14

**95 overdue tasks can only be rescheduled one row at a time**

High · New capability · effort M · `Tasks list (/tasks)` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Today > Mine > Overdue (25 tasks) has a 'Move all to today' button. It moves the whole section in one call with a single Undo toast (today-view.tsx:66-80, task-list-context.tsx:82-93). Nothing else selects rows. All has 92 red overdue rows out of 236 and no selection checkboxes. Unassigned (34) contains overdue rows with no bulk action. You can't move a set to any day but today, or bulk-reassign it.
- **Why:** Linear raises a floating 'N selected · Actions' bar on selection, and Things 3 swaps in a compact When, Move, Delete toolbar. Re-dating a pile is one action plus one Undo. With Asana ending Nov 1 and the import bringing stale dates, this is the first job after cutover.
- **Change:** Keep 'Move all to today'. Add row selection to the All tab and the Unassigned section, with the floating bar (Due with the settled quick picks, Assignee, Property, Done). rescheduleTasks already accepts up to 500 ids, and movedAllMessage plus Undo already make the toast.
- **Desktop, tablet, phone:** Desktop 1280: the bar floats 24px above the bottom edge. Tablet 768: long-press a row to start selecting, then tap to add rows; the bar stays at the bottom. Phone 375: same as tablet with the bar full width above the bottom nav, and labels shorten to icons plus 'Due' if they would wrap.
- **Reuse:** TaskRow, patchTask (add a batch variant in lib/tasks/service.ts), the settled due-date quick picks, React Aria selection on GridList (approved), toast from FEEL-009.
- **References:** 
  - [Linear](https://mobbin.com/screens/3f36e39e-2b9e-4145-bee2-f43a3cf21f7b): Floating '6 selected' bar at the bottom of the list with a clear × and Actions.
  - [Things 3](https://mobbin.com/screens/235f4304-13e7-4535-a7b3-351960034493): Selected rows tint blue and a compact bottom toolbar offers When, Move, Delete and More.
  - [Todoist](https://mobbin.com/screens/858c686b-66b3-4283-8f26-4a6f82b45b7b): The Overdue header has a 'Reschedule' action for the whole group.
  - [Todoist](https://mobbin.com/screens/b0aa6925-dc7a-4e60-bfc1-347e57d330b5): The same group Reschedule on phone.
- **Code:** `Probe on /tasks: 95 of 193 open rows have a due date before 2026-10-23; 0 selection checkboxes in tbody`, `src/app/(app)/tasks/task-row.tsx:108-112 (row starts with the Mark done circle; no selection)`, `branch-src/src/app/(app)/tasks/today-view.tsx:66-80`, `branch-src/src/app/(app)/tasks/task-list-context.tsx:82-93`, `branch-src/src/app/(app)/tasks/list-actions.ts:48-58`, `probe /tasks/all: 92 of 236 rows red overdue, 0 selection checkboxes`, `branch: src/app/(app)/tasks/today-view.tsx:66-80`, `branch: src/app/(app)/tasks/task-list-context.tsx:82-93`
- **Also found as:** BTASKS-032 (Branch: Today, All tasks, new task and the task page)
- **Verification:** confirmed. Verified: 95 of 193 open rows are past due, and there are 0 selection controls. The dates span 2025-04-19 to 2026-10-10, with 22 on 2026-08-28 (an import artifact). Every one of them reads 'yesterday' (FEEL-V01), which hides how stale the pile is. Fix that first. GridList selection isn't covered by the React Aria approval (popover, sheet, menu, date picker), so it needs Connor's OK. The bulk bar should offer Status from the seven settled statuses, not only 'Mark done'. Long-press to select on tablet conflicts with the row's inline text input and selects, so it depends on the row redesign in FEEL-V03. Linear 3f36e39e is plausible. Things 3 235f4304 wasn't spot-checked.

### FEEL-V02

**Clicking a due date opens nothing visible, and a stray key reschedules the task**

High · Design change · effort M · `Tasks list, Due column` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. The opacity-0 date input is gone. The due label is a visible React Aria button chip that opens a Popover on a mouse or a Sheet on touch: quick picks (Today, Tomorrow, Monday, Next week, No date, with the date each lands on, keys 1 to 5), then a month calendar. Live run on /tasks/all: clicking the chip focused the dialog section (no input[type=date] on the page), and ArrowUp changed nothing and sent no write. Pressing '2' committed once, which was the only POST, and closed the popover. A reschedule shows a toast with Undo (task-list-context.tsx:69-81). The task page's Due field uses the same component. Removal not upheld: The Due control itself is fixed, and I confirmed it. The task list and the task page both use DueDatePicker (a visible React Aria chip that opens a popover). Arrow keys only move focus inside the open calendar, which sent no POST. Esc closes the popover and returns focus to the chip. Pressing '2' or ArrowDown on the closed chip does nothing. The same failure is still there one row down on the task page's field rail. SelectChip (tasks/[id]/select-chip.tsx:52-57) lays an opacity-0 native <select> over the Property and Unit chips (fields.tsx:118-145). onChange saves at once, and save() is called without done or undo, so no toast and no Undo appear. Repro on /tasks/cmtg25yuf01zsjphs0xu5d2fl in both Chromium and WebKit: click the Property chip, press Esc, and focus stays on the invisible SELECT. Pressing '4' then fired 'POST /tasks/cmtg25yuf01zsjphs0xu5d2fl', which moves the task to 415 Crescent Ave. A stray keystroke rewrites a task field with no visible confirmation and nothing to undo, from the same invisible-native-overlay pattern. (The full-page 'Something went wrong' card in shots/skeptic-b4/task-keys--property-after-key--desktop-light.png comes from the harness blocking the POST.) Smaller gap: /tasks/new still uses native type=date inputs for Due and Visit date (new-task-fields.tsx:46,77) instead of the D7 control. Recommendation update: narrow the finding to the Property and Unit chips. Replace SelectChip with a React Aria Select or ComboBox popover on mouse (a Sheet or the native picker on touch is fine), commit once per pick, and show 'Property set to X. Undo' the way Due already does.
- **Today:** The Due cell lays an opacity-0 <input type=date> over the label. In Chromium, clicking 'yesterday' on a row focused the invisible input (activeElement INPUT, type date, opacity 0). No picker appeared; only a hover box and the × showed. Pressing ArrowUp then POSTed a new due date at once (blockedWrites: POST /tasks), with nothing on screen showing the change.
- **Why:** Due dates drive triage of 2,086 tasks. A click that shows nothing, plus keystrokes that write unseen, feels broken and risks silent reschedules. The settled decision calls for one Due date with quick picks and an Undo toast on reschedule, and the native overlay can provide neither.
- **Change:** Replace the overlay with a visible trigger, the due label itself, that opens a React Aria DatePicker popover. Quick picks first: 'Today', 'Tomorrow', 'Next week', 'No date'. Then a month calendar. A pick commits once, closes the popover and shows the Undo toast ('Due date moved to Fri, Oct 30. Undo'). Arrow keys move only inside the open calendar. Use the same control on the task page's due field.
- **Desktop, tablet, phone:** Desktop and tablet: a popover anchored to the cell, sized to its content. Phone: rows open the task page (FEEL-004), where the due field opens a bottom sheet with the same quick picks above the calendar.
- **Reuse:** React Aria DatePicker and Popover (approved); the Toast from FEEL-009; src/app/(app)/tasks/task-row.tsx:234-257 and the due field in tasks/[id]/task-detail.tsx.
- **References:** 
  - [Linear](https://mobbin.com/screens/17c8ce50-57d6-4a36-aeba-700bcb563fc6): Date menu with quick picks (Tomorrow, Next week, A month from now) above Custom, plus a type-a-date field.
  - [Linear](https://mobbin.com/screens/ebeec61e-927c-4d36-99fa-a1f5ab250222): Date popover anchored to the property it edits, with a typed date field above the calendar.
- **Code:** `due-click run: after clicking the Due cell, activeElement = INPUT, type date, value 2025-05-04, opacity 0; after ArrowUp, blockedWrites = POST /tasks`, `src/app/(app)/tasks/task-row.tsx:86-87,249-255`, `src/components/due-date-picker.tsx:43-105`, `src/app/(app)/tasks/task-row.tsx:146-155`, `src/app/(app)/tasks/[id]/fields.tsx:89-101`, `eval due-click: activeElement SECTION dialog 'Due date', dateInputs 0; after ArrowUp still 1 dialog, no POST; only POST after the quick-pick key`
- **Verification:** verifier-found

### FEEL-015

**Dialogs ignore Esc, don't move or trap focus, and don't lock scrolling**

Medium · Fix · effort M · `Confirm dialogs (Units discard, Listings discard, CapEx reset, Move-in form discard)` · One design system, fixed in the primitives

- **Today:** In the Units discard dialog, focus stayed on the Cancel button behind the overlay. Four Tabs moved focus to an input in the page behind it. Esc left the dialog open, and body scroll stayed unlocked. ConfirmDialog and the two inline copies in edit-units and edit-listings share these gaps. Discard is styled secondary rather than destructive.
- **Why:** The house rule is one Esc per layer. Keyboard and screen-reader users get lost behind the overlay. Stripe's modals open with focus inside, close on Esc and show the shortcut on the button.
- **Change:** Rebuild ConfirmDialog as a Dialog shell on React Aria Modal and Dialog: initial focus on the safe action, a focus trap, Esc closes, focus returns to the trigger, scroll locks. Delete the two inline copies. Layout: title, one consequence line, then actions right-aligned with the destructive one in red ("Discard changes"). Show "Esc" as a hint on Cancel on desktop.
- **Desktop, tablet, phone:** Desktop and tablet: a centred modal, max 400 px. Phone: a bottom sheet with full-width stacked buttons, the destructive one first and red, Cancel below.
- **Reuse:** src/components/confirm-dialog.tsx (grow it, per docs/components.md Known gaps "Dialog shell"). React Aria is approved.
- **References:** 
  - [Attio](https://mobbin.com/screens/18bdbbb9-3afa-4b8a-83ae-0bca4b19b66b): Create view dialog: focus lands in the only field, Cancel shows ESC and the primary button shows ↵.
  - [Attio](https://mobbin.com/screens/08df4ff2-a5d6-4200-b3b5-44e3ddc41f09): The Create Task dialog uses the same Cancel ESC / Save ↵ footer, so one Esc closes one layer and the key is printed on the button.
  - [Stripe](https://mobbin.com/screens/c16180c0-adea-4054-b67d-8bc187348fcb): Refund modal: Cancel shows an Esc hint and the primary shows a ⌘+↵ hint.
  - [Stripe](https://mobbin.com/screens/e0dde01e-57c0-45c2-b45d-7a60069dbdff): Small titled modal, one consequence sentence, Cancel plus a red verb button, close X.
  - [Obsidian](https://mobbin.com/screens/6cda007a-65ff-44dd-85b0-4ff729dc57dc): Phone version as a bottom sheet with a red Delete above Cancel.
  - [Stripe](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8): Modal with a clear title, focused fields, and Cancel plus a primary action bottom-right
  - [Stripe](https://mobbin.com/screens/d5400786-97c3-4029-a3e2-e21a9fa7735e): Modal with a close button, Cancel and a primary action
  - [Clerk](https://mobbin.com/screens/07214327-93f0-44bf-a61e-fcfd0515b288): 'Remove member from organization' states the consequence and that the person can be re-added.
  - [Whop](https://mobbin.com/screens/55f6ab14-1e42-437d-94b6-e0fa5c5e7de1): Filled red 'Remove user' beside a neutral Cancel, with a close button in the header.
- **Code:** `units-discard evals: on open activeElement = Cancel (behind the dialog); after 4 Tabs focus is outside the dialog; after Escape the dialog is still open; body overflow is unset`, `src/components/confirm-dialog.tsx:15-27`, `src/app/(app)/properties/[id]/edit-units.tsx:124-150`, `src/app/(app)/properties/[id]/edit-listings.tsx:176`, `src/app/(app)/properties/[id]/edit-units.tsx:124-152`, `src/app/(app)/properties/[id]/edit-listings.tsx:174-207`, `src/components/confirm-dialog.tsx:15-28`, `branch:src/components/confirm-dialog.tsx:15-28`, `branch:src/app/(app)/contractors/[id]/portal-access-card.tsx:166-215`, `branch:src/app/(app)/tasks/[id]/header.tsx:92`, `branch:src/app/(app)/tasks/[id]/files-list.tsx:87`, `branch:docs/components.md:31`, `branch:docs/components.md:152`, `branch: src/components/confirm-dialog.tsx:15-28`, `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:166-215`
- **Also found as:** PROPERTY-024 (Property detail page (future property hub)), ADMIN-032 (Contractors directory, contractor detail and Settings), BCONTRACT-012 (Branch: contractors directory, portal access, Home and emails)
- **Verification:** partly. Reproduced exactly. Focus stayed on Cancel behind the overlay, 4 Tabs landed on a page input, Escape left the dialog open, and body overflow stayed 'visible'. docs/components.md already lists it as a gap. I lowered it to medium because it's friction for keyboard users and doesn't block a job; it does break the explicit 'one Esc closes one layer' rule. Stripe c16180c0 was verified via search and shows the Esc and Cmd+Enter hints.

### FEEL-016

**Mobile drawer: focus isn't managed and hidden links stay in the tab order**

Medium · Fix · effort S · `App shell mobile drawer (below lg)` · A quiet shell with real search, navigation and sign-in

- **Today:** With the drawer closed at 375, Tab stops 4 to 13 land on 10 drawer controls positioned off-screen (Home through Sign out at x = -248). When it opens, focus stays on the hamburger. Tab then goes to the logo behind the overlay, not into the drawer. After Esc, focus drops to BODY. The aside has no dialog role.
- **Why:** VoiceOver and keyboard users meet 10 invisible items on every page, and an open drawer doesn't hold focus. The planned phone bottom bar will need the same overlay discipline for its sheets.
- **Change:** Make the closed aside inert below lg (the inert attribute plus aria-hidden). When open, render it as a React Aria Modal with role=dialog and aria-label "Navigation", focus the first link, trap focus, and on close return focus to the menu button. Keep the existing Esc handling and scroll lock.
- **Desktop, tablet, phone:** Desktop: unchanged rail. Tablet and phone: drawer as a modal sheet. When the D10 bottom bar ships, its More sheet uses the same Modal.
- **Reuse:** src/components/app-shell.tsx:36-49,94-113; React Aria Modal (approved).
- **References:** 
  - [Canva](https://mobbin.com/screens/959d177c-3c8b-4781-bda1-22177171611f): Phone sheet that takes focus and dims everything behind it; the page underneath isn't reachable.
- **Code:** `tabwalk mobile /: tabs 4-13 focus off-screen drawer items (box x -248, visible false)`, `drawer run evals: after opening, focus is on Open navigation; Tab goes to HG Capital OS behind the overlay; after Escape focus is on BODY`, `src/components/app-shell.tsx:94-113`, `src/components/app-shell.tsx:36-49,104-113`, `probe: {inert:false, ariaHidden:null, x:-256}`
- **Also found as:** SHELL-017 (App shell, sidebar, top bar, global search and Home), MOBILE-021 (Lens: phone and tablet experience on every route)
- **Verification:** partly. Reproduced at 375. Tab 4 lands on 'Close navigation' at x -37 and Tab 5 on 'Home' at x -248 while the drawer is closed. After opening, focus stays on 'Open navigation' and the next Tab goes to the 'HG Capital OS' logo behind the overlay. Medium: it only affects keyboard and screen-reader users on phones. The Canva reference can't show focus behaviour; cite React Aria Modal or an Apple HIG sheet instead.

### FEEL-022

**Validation is native browser bubbles and silent reverts**

Medium · Design change · effort M · `All forms (New task/deal/property, property editors, CapEx rules, move-in report)` · Create where you are

- **Migration branch:** Still applies on the migration branch. /tasks/new still relies on native validation. Submitting it empty gives the browser's 'Please fill out this field.' bubble: the form has no noValidate and the title no aria-invalid. The new Waiting reason and Scheduled visit date fields add two more native 'required' bubbles. createTask still parses z.string().min(2) inside withLog, which rethrows to the route's error boundary ('Something went wrong'). A one-character title on the task page still reverts silently through inlineEditCommit. The CapEx rules editor is unchanged.
- **Today:** An empty New task submit shows Chrome's orange "Please fill out this field." bubble, and the move-in report does the same. A one-character task title is silently reverted (task-row.tsx:129, task-detail.tsx:80); the server's zod min(2) then crashes the page for New task. CapEx InlineNumber silently restores the old number on bad input. There is no shared label, helper and error wrapper (a Known gap).
- **Why:** Browser bubbles look foreign next to Geist and vanish on scroll, and silent reverts make people wonder whether the input was ignored. Stripe and Vercel show a red one-line message under the field.
- **Change:** Build one Field component: label above, optional one-line help, a red one-line error below, with aria-invalid and aria-describedby wired. Validate on blur and again on submit, with noValidate on forms. Use plain messages: "Add a title", "Title needs at least 2 characters", "Enter a number of years up to 200".
- **Desktop, tablet, phone:** The same at every size. Errors stay one line at the field's normal width, shortened if needed, never wrapped.
- **Reuse:** New Field in src/components/ui.tsx (docs/components.md Known gaps: "Form field layout"), replacing the local L helpers in edit-details, edit-loan and edit-insurance.
- **References:** 
  - [Vercel](https://mobbin.com/screens/0a227055-0e20-4ef1-a4cf-08bd5e0d9c58): Red field plus a one-line message directly under it, the form otherwise unchanged.
  - [Vapi](https://mobbin.com/screens/34766f43-7ba1-44a3-9c42-a20826230325): Inline min-amount error with the submit disabled.
  - [Stripe](https://mobbin.com/screens/d36ef36b-d2e9-46ff-bac5-f1d715f30ec0): "Incorrect email or password." as an icon plus red line beneath the field.
  - [Stripe](https://mobbin.com/screens/0955ade7-92d2-4d33-a192-a69b03ff0215): Helper or error line sits directly under the field it belongs to.
  - [Mercury](https://mobbin.com/screens/ed547eec-2691-473e-9844-ed3dfe315326): The label turns red and a one-line reason sits under the field ('Phone number is too short.').
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): Outlined field with 'Your policy requires a memo.' directly beneath.
- **Code:** `src/app/(app)/tasks/task-row.tsx:126-130`, `src/app/(app)/settings/capex-rules-editor.tsx:113-121`, `src/app/(app)/tasks/actions.ts:22 (z.string().min(2))`, `src/app/(app)/tasks/new/page.tsx:30-35`, `src/app/(app)/tasks/new/new-task-fields.tsx:68-79`, `src/app/(app)/tasks/actions.ts:25-26,50-53`, `src/lib/server-action.ts:35-43`, `src/components/inline-address-field.tsx:49-54`, `src/app/(app)/templates/[id]/apply/apply-flow.tsx:160-162`, `eval /tasks/new empty submit: validationMessage 'Please fill out this field.', noValidate false, aria-invalid null`, `src/app/(app)/properties/new/page.tsx:13-16`, `src/app/(app)/tasks/new/page.tsx:31 Input required`, `branch-src/src/app/(app)/tasks/new/page.tsx:34`
- **Also found as:** PORTFOLIO-022 (Portfolio list and new property), COPY-I09 (Lens: words on every screen)
- **Verification:** confirmed. Reproduced Chrome's orange 'Please fill out this field.' bubble on New task (verify-FEEL/newtask--empty-submit--desktop-light.png). A one-character title passes 'required' and then fails zod min(2) inside withLog, which lands on the error card. CapEx InlineNumber silently restores the old value (capex-rules-editor.tsx:113-121).

### FEEL-023

**Money fields are raw text: no $, no commas, no number keyboard**

Medium · Design change · effort S · `Property Details, Loan and Insurance editors; deal prices` · Money, numbers and dates read one way

- **Today:** In edit mode Value shows "550000" and Purchase price "240000", with no $ prefix or grouping. There's no inputMode, so phones open the full keyboard (verified at 320: inputMode = ""). Rate % takes free text. In the read view the same values display as "$550,000".
- **Why:** Raw digits invite missing-zero errors on the numbers that matter most, and a full keyboard slows phone entry. Stripe's amount fields carry the currency prefix and format as you type.
- **Change:** Add a MoneyInput: a $ adornment inside the field, inputMode="decimal", grouping on blur (550,000) and raw digits while focused, right-aligned tabular figures in Geist Mono, "k" and "m" shorthand accepted (parseAmount already supports them). Add a PercentInput with a % suffix for rate fields.
- **Desktop, tablet, phone:** Desktop: 2-column grid. Tablet: 2 columns. Phone: 1 column, decimal keyboard, with full dates visible ("07/16/2025" is clipped in today's 2-column phone grid).
- **Reuse:** New MoneyInput in src/components/ui.tsx built on Input, using lib/money.ts parseAmount and lib/utils.ts fmtMoney.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ed53af21-56c6-479b-b49f-3c5ab4c875f3): Amount field with a currency prefix inside the input ('MYR 0.00') and two decimals shown while typing.
  - [Vapi](https://mobbin.com/screens/34766f43-7ba1-44a3-9c42-a20826230325): Amount input with a $ prefix inside the field.
  - [Stripe](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8): Amount input with a currency prefix and a currency selector, formatted as '2.00'
  - [Mercury](https://mobbin.com/flows/fa8230a8-23ff-4c52-b91f-568eae7b7bc1): Amount entry opens the numeric keypad with a large dollar figure and a Review button pinned above the keypad.
- **Code:** `prop-mobile-edit eval: value inputMode ""`, `src/app/(app)/properties/[id]/edit-details.tsx:99-101`, `src/app/(app)/properties/[id]/edit-loan.tsx:97-99`, `src/app/(app)/properties/[id]/edit-insurance.tsx:94-95`, `probe /deals/new: 'units|type=number|im=', 'theirPriceRaw|type=text|im='`, `grep inputMode: only src/app/(app)/settings/capex-rules-editor.tsx:106`
- **Also found as:** PROPERTY-033 (Property detail page (future property hub)), MOBILE-020 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. Reproduced at 320: Value reads 550000 and Purchase price 240000, inputMode is empty, and the purchase date is clipped to '07/16/20' in the two-column grid (verify-FEEL/details-edit--form--narrow-light.png).

### FEEL-024

**Unsaved work is lost on navigation, and Save scrolls out of reach**

Medium · New capability · effort M · `Move-in form editor, Units and Listings editors, public move-in report` · Every save is safe, instant and undoable

- **Today:** There is no beforeunload or route guard anywhere in src. The Move-in form editor puts Save and Cancel in the page header, always visible and always enabled (Cancel even when nothing changed). After scrolling past Kitchen into the later rooms, both are off-screen. The public move-in report is 7,448 px tall on a phone, and a back swipe or refresh discards every rating.
- **Why:** Losing a tenant's 15-minute inspection to a back swipe hurts the "close the loop" promise. Klaviyo, Shopify and Laravel Cloud show a floating "Unsaved changes" bar only while something is dirty.
- **Change:** For long editors, replace the header buttons with a floating bar that appears only when dirty: "Unsaved changes · Discard · Save", bottom centre. Add beforeunload while dirty, and confirm before in-app navigation. For the public move-in report, autosave a draft to localStorage every few seconds and on return show "We kept your answers from earlier. Start over".
- **Desktop, tablet, phone:** Desktop and tablet: a floating pill bar, bottom centre, sized to its content. Phone: a full-width bar above the safe area. On the public form it sits above the Submit button's position.
- **Reuse:** src/app/(app)/settings/move-in-form/move-in-form-editor.tsx dirty state, edit-units.tsx dirty, src/app/(marketing)/residents/moving-in/move-in-form.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/e26d409c-55c7-407b-8d16-11c7666c0d7f): A long editor autosaves, and the header says 'Draft saved' beside the primary action.
  - [Stripe](https://mobbin.com/screens/fdd00a8f-d75f-4186-9e64-d52551ae4cf7): 'Draft saved 4 minutes ago' in the header, plus Confirm ⌘ + ↵ on the dialog.
  - [Klaviyo](https://mobbin.com/screens/e06a4b15-a937-4f72-8096-9d4261b31972): Dark floating "Unsaved changes · Discard · Save" bar shown only when dirty.
  - [Laravel Cloud](https://mobbin.com/screens/bce31f98-3283-4c47-971c-8a0dda21ca4b): Same pattern with Reset and Save, bottom centre.
  - [Shopify](https://mobbin.com/screens/cbe5200e-30c4-4f3e-bd4e-62ff2f44341c): Contextual save bar replacing the header while edits are pending.
- **Code:** `grep beforeunload in src: 0 matches`, `movein mobile pageHeight 7448`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:153-168`
- **Verification:** confirmed. Grep for beforeunload in src finds nothing. The Move-in editor's Save is disabled until something changes; Cancel is enabled whenever no save is pending (move-in-form-editor.tsx:160-166). The localStorage draft for the public form is reasonable, but say in the UI that answers stay on this device. Klaviyo, Laravel and Shopify references fit.

### FEEL-025

**Edit modes behave differently from section to section**

Medium · Design change · effort S · `Property section editors and the Move-in form editor` · One design system, fixed in the primitives

- **Today:** Details, Loan, Insurance and Notes order the buttons Cancel, Save. Units and Listings use + Add, Save, Cancel. The Move-in form uses Save, Cancel. Units' Save is enabled with no changes; the Move-in form disables it until dirty. Cancel in Details throws edits away silently, while Units asks first with a 3-button dialog.
- **Why:** The same gesture should have the same result everywhere. Stripe's editors always place Cancel left of Save, and the primary waits for a change.
- **Change:** One rule for every editor. Actions sit right-aligned as Cancel then Save. Save is disabled until something changes. Cancel or Esc with no changes simply closes; with changes it asks once (FEEL-015). Add-row buttons move out of the header to the end of the list they add to ("+ Add unit" under the last unit).
- **Desktop, tablet, phone:** Desktop and tablet: actions in the card header. Phone: actions stay in the header with 44 px targets; long editors use the floating bar from FEEL-024.
- **Reuse:** SectionCard in src/components/ui.tsx: give it built-in dirty, onSave and onCancel props so every section inherits the rule; edit-units.tsx and edit-listings.tsx move onto it.
- **References:** 
  - [Clerk](https://mobbin.com/screens/bceecfc6-3efc-4ef5-a682-54f7ede1dae5): Edit form with one consistent Reset and Save pair that appears when changed.
- **Code:** `src/app/(app)/properties/[id]/edit-details.tsx:76-90`, `src/app/(app)/properties/[id]/edit-units.tsx:97-107`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:160-166`
- **Verification:** confirmed. Seen: Details shows Cancel then Save; Units shows + Add unit, Save, Cancel (screenshot); Move-in shows Save, Cancel. Overlaps FEEL-026 on Esc; merge the Esc rule there.

### FEEL-026

**Opening Edit leaves focus behind, and Esc doesn't cancel**

Medium · Fix · effort S · `Property section editors` · One design system, fixed in the primitives

- **Today:** After clicking Edit on Details (320) or Loan (desktop, dark), activeElement was BODY, and the next Tab landed on Cancel in the header rather than the first field. Esc inside the Details form did nothing; the editor stayed open.
- **Why:** Opening an editor should put the cursor where typing starts, and Esc should back out. Linear and Stripe both work that way.
- **Change:** On entering edit mode, focus the first field (or the field whose row was clicked). Esc anywhere in the form runs Cancel, with the dirty check from FEEL-025. Return focus to the Edit button when the editor closes.
- **Desktop, tablet, phone:** Desktop and tablet with a keyboard: as described. Phone: focusing the first field raises the keyboard, so focus only the field the user tapped, not the first one.
- **Reuse:** SectionCard in src/components/ui.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/c16180c0-adea-4054-b67d-8bc187348fcb): Focus starts in the amount field and Esc cancels, shown as a key hint.
- **Code:** `prop-mobile-edit eval: activeElement BODY after Edit`, `prop-details-edit eval: the form was still open after Escape`
- **Verification:** confirmed. Reproduced at 320 and 1280: after Edit, activeElement is BODY. Pressing Escape inside the Value field left the Details form open.

### FEEL-027

**While saving, rows and fields fade out as if disabled**

Medium · Design change · effort S · `Tasks rows, Deals rows, task page fields` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The task half is fixed (task-row.tsx and task-list-context.tsx were rebuilt). The Deals half is unchanged from main.
- **Today:** Task rows on /tasks and /tasks/all no longer fade: edits apply optimistically through useOptimistic, and failures roll back with a toast. Task page fields (/tasks/[id] rail and chips) are optimistic too. The Notes textarea still sets disabled while it saves, but its computed color stays rgb(24,24,27) in Chromium and WebKit, so it no longer looks like placeholder text. Deal rows on /deals still fade to opacity-60 while a field saves. No record shows a 'Saving…' or 'Saved' state: only a Due change confirms, with a toast and Undo.
- **Why:** Fading content reads as "broken" or "disabled", and it flickers on fast connections. Substack and Confluence keep the content at full strength and show a quiet "Saving…" then "Saved" marker.
- **Change:** Tasks are done. Drop the opacity-60 fade on deal rows (deal-row.tsx:54) and give them the same optimistic pattern as TaskListProvider. Optional: a muted 'Saved' on the task page header after Notes or Title saves, since those are the only task edits with no confirmation.
- **Desktop, tablet, phone:** Desktop and tablet: status text beside the record's back link or actions. Phone: the same text in the page header, one word.
- **Reuse:** src/app/(app)/tasks/task-row.tsx:115, deals/deal-row.tsx:54, tasks/[id]/task-detail.tsx quiet class (disabled:opacity-40).
- **References:** 
  - [Substack](https://mobbin.com/screens/b17b9c1c-d40d-4d18-93a9-aeb4b89ad5f0): Tiny green-dot "Saved" chip in the editor header; the content never dims.
  - [Confluence](https://mobbin.com/screens/82ddc5ce-4bcd-44b8-a35a-9e0e8b1182ee): Muted "Saved" text next to the page actions.
- **Code:** `src/app/(app)/tasks/task-row.tsx:115`, `src/app/(app)/tasks/[id]/task-detail.tsx:20,232`, `src/app/(app)/tasks/task-row.tsx:70-76 (no pending fade)`, `src/app/(app)/tasks/task-list-context.tsx:46-63 (useOptimistic, toast on failure)`, `src/app/(app)/tasks/[id]/fields.tsx:58-68 (optimistic field saves)`, `src/app/(app)/tasks/[id]/notes.tsx:48 (disabled={pending}, no disabled: style)`, `src/app/(app)/deals/deal-row.tsx:54 (pending ? opacity-60, identical to main)`, `eval /tasks/cmtg25yuf01zsjphs0xu5d2fl: disabled Notes color rgb(24,24,27), opacity 1 (Chromium and WebKit)`
- **Verification:** partly. The observation is correct (task-row.tsx:115 opacity-60, deal-row.tsx:54, and task-detail's quiet class uses disabled:opacity-40). The recommendation adds a second success channel on top of FEEL-009's toasts, which makes the app busier. Keep the part that drops the fade and applies values optimistically, and route failures to the FEEL-003 toast. Leave out the header 'Saving… / Saved' chip, or adopt it only if FEEL-009 drops success toasts for inline edits.

### FEEL-028

**Error messages show developer text**

Medium · Fix · effort S · `Upload errors, QuickBooks refresh, whole-blob editors` · Plain, consistent words

- **Today:** Seen on screen: "Couldn't upload lease.pdf: Failed to fetch" and "Failed to fetch" next to Refresh from QuickBooks. In code: "failed: <raw error>", "Connect a Blob store in Vercel (Storage tab) to turn on file uploads.", and zod paths like "Invalid units.0.label: …" from userMessage. CONFLICT_MESSAGE runs two sentences.
- **Why:** The house rules keep internal caveats out of the UI and give each message one plain line. Raw errors read as unfinished and give no next step.
- **Change:** Map errors to one-line, plain messages with an action. Network: "You're offline. Retry". Upload: "lease.pdf didn't upload. Retry". Conflict: "Pieter saved changes since you opened this. Reload", naming the person from the record when known. Validation: name the field in plain words ("Unit 1 needs a name"). Log the technical detail to the console or server only.
- **Desktop, tablet, phone:** One line at every width; on a phone, shorter wording ("Didn't upload. Retry").
- **Reuse:** src/lib/action-result.ts userMessage and CONFLICT_MESSAGE; src/components/attachments.tsx:67-73; financials/_components/refresh-button.tsx:25-34.
- **References:** 
  - [Mercury](https://mobbin.com/screens/61170c15-0349-45ef-a6b0-b6ec95b7d1f6): Plain error copy ('Security key registration failed') with one recovery verb, Try Again, and no codes.
  - [Revolut Business](https://mobbin.com/screens/b719158e-0a19-4b2e-8cc0-5217648ea20a): "Connection issue" plus Try again: two words of cause, one action.
  - [Mercury](https://mobbin.com/screens/85da4e09-98b5-4461-b34b-3653b5083e6f): Error names the problem in plain words under the field
- **Code:** `src/lib/action-result.ts:15-46`, `src/components/attachments.tsx:69-73`, `src/app/(app)/settings/actions.ts:27,104,109,147`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:44`, `src/app/(app)/settings/move-in-form/actions.ts:12-15`, `src/lib/action-result.ts:29-34`, `branch src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:44`, `branch src/app/(app)/settings/move-in-form/actions.ts:12-15`, `branch src/lib/action-result.ts:29-34`
- **Also found as:** COPY-051 (Lens: words on every screen), ADMIN-038 (Contractors directory, contractor detail and Settings)
- **Verification:** confirmed. Seen: 'Failed to fetch' beside Refresh from QuickBooks. attachments.tsx:69-73 can show 'Connect a Blob store in Vercel (Storage tab)…', an internal caveat the house rules keep out of the UI. CONFLICT_MESSAGE is two sentences.

### FEEL-030

**Uploads show no progress, and a failed file disappears with no retry**

Medium · Design change · effort M · `Task Attachments and property Documents` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Fixed for tasks. Still the old behavior for property Documents.
- **Today:** Task uploads (staff composer on /tasks/[id] and the portal job page) now go through the new MediaUploader. Each file gets a 56px thumbnail with a progress ring (the percentage is only in the aria-label). A failed file keeps its tile with a red ring, Retry and Remove, plus one red line naming the failure. Property Documents (/properties/[id]) still use the old Attachments component: a row reading 'Uploading…' with no progress, and a failed file vanishes with only a red line under the drop zone. Neither drop zone states file types or size limits.
- **Why:** Phone uploads of scanned leases and photos are slow. Without progress, people abandon them or upload twice. Whop and AirOps show per-file progress and keep failed files in the list with Retry.
- **Change:** Move property Documents onto useMediaUploader with allowed=['file'] (or give Attachments the same per-file state, Retry and Remove) so a failed lease.pdf stays on screen. Show the percentage as visible text on the tile or row, not only in the aria-label. Add one muted line, e.g. 'PDF, photos or Word, up to 25 MB', under both the Documents drop zone and the composer's Choose files.
- **Desktop, tablet, phone:** Desktop and tablet: drag-and-drop zone plus the list. Phone: the drop zone shrinks to an "Add file" button that opens the camera or files picker, with the same per-file rows.
- **Reuse:** src/components/attachments.tsx (busy state at lines 109-118).
- **References:** 
  - [Mercury](https://mobbin.com/screens/e22204ce-320f-4304-a506-5191e90e0f85): An uploaded receipt becomes a row with a green check, the file name and a delete icon, above the drop zone that stays for more files.
  - [Whop](https://mobbin.com/screens/80459def-95d4-4909-9e7b-8d47d7807147): Per-file "Uploading 76%" and an "Uploaded" check, with an overall bar.
  - [AirOps](https://mobbin.com/screens/3c80b45c-6d21-4bd7-9e60-41ab67ef25e5): Accepted file types under the dropzone, file row with size and a 100% bar.
  - [Lindy](https://mobbin.com/screens/7dcd57a7-d2e9-4742-bb0f-9e7b364c139b): "20MB maximum" stated in the dropzone; an uploading row with a spinner.
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): Each attachment is a row with its own status mark (green check when stored) and a delete icon, so a failed file would keep its row and say so.
  - [Cofounder](https://mobbin.com/screens/85873f56-4b44-4ad5-b418-488323decd6b): A tile per file with its own progress ("Uploading 25%", "Finalizing").
  - [Brex](https://mobbin.com/screens/ae20f58e-72f4-404d-881c-5f86d8e9735f): After an upload, a toast says "Receipt uploaded successfully", the thumbnail appears in place, and the section shows its new state (Not verified) with a plain explanation.
  - [Midday](https://mobbin.com/flows/047573ea-b866-45a3-8aea-30fabd70fad0): "Processing 1 receipt..." toast that turns into "Processing complete"
  - [Cake Equity](https://mobbin.com/screens/5e82b464-c5a7-4450-b722-ca28599369ed): "Document moved successfully" confirmation after a file action
- **Code:** `src/components/attachments.tsx:47-78,109-118,152-154`, `src/components/media-uploader.tsx:129-167 (onUploadProgress, failed status kept)`, `src/components/media-uploader.tsx:351-429 (tile with ProgressRing, Retry, Remove)`, `src/app/(app)/tasks/[id]/composer.tsx:98`, `src/components/attachments.tsx:181-190 (busy row 'Uploading…')`, `src/components/attachments.tsx:132-150 (failures become one setError line; the row is dropped)`, `src/app/(app)/properties/[id]/edit-documents.tsx:23-30 (still Attachments kind=property)`, `src/components/attachments.tsx:47-77`, `branch:src/components/media-uploader.tsx:335-347`, `branch:src/lib/attachments/media.ts:73-88`, `src/components/attachments.tsx:67-75,108-118`
- **Also found as:** TASKS-026 (Tasks list, new task and task detail), JOURNEYS-041 (Lens: the core jobs, end to end)
- **Verification:** partly. The observation matches the code (attachments.tsx:47-78, 109-118). The proposed helper copy is wrong: src/app/api/blob/[kind]/route.ts allows any file type up to 50 MB for task and property uploads, and only listing photos are limited to 25 MB of JPEG, PNG, WebP or AVIF. The line should read 'Any file up to 50 MB' (or 'Photos up to 25 MB' in the listing editor). @vercel/blob 2.8.0 supports onUploadProgress, so the progress bar is feasible.

### FEEL-036

**Filtered empty states are a dashed box with no way out**

Medium · Design change · effort S · `Tasks and Deals with no matching results` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Only the double frame on Tasks is fixed.
- **Today:** On /tasks/all?q=zzqq the empty result is no longer nested inside the list card: the double frame is gone. It is still a standalone dashed EmptyState box reading 'No tasks match.' with no mention of the filter and no Clear filters action. /deals?q=… is unchanged ('No deals match.' in the dashed box inside the card). Today shows a plain 'Nothing due today.' line.
- **Why:** An empty state should say why and offer the next step. Stripe's "No payments found. Try using different filters." and Linear's "1 issue hidden by filters · Clear filters" both resolve it in one click.
- **Change:** Replace the dashed box on /tasks/all (all/page.tsx:44-47) and /deals (deals/page.tsx:111) with one muted line that names the filter ('No open tasks match "zzqq"') and a Clear filters text button. Give EmptyState a variant for genuinely empty lists (line icon, one sentence, primary action), since every filter result still uses the dashed card.
- **Desktop, tablet, phone:** Same content at all sizes, centred in the list area. On a phone it sits under the Filters button.
- **Reuse:** EmptyState in src/components/ui.tsx: add a variant with an action and no dashed frame for use inside a card. tasks/page.tsx:180-183, deals/page.tsx:111.
- **References:** 
  - [Linear](https://mobbin.com/screens/9dab540b-f7d4-47d4-be77-5facc75f89fa): Below the filtered rows, one inline line reads '14 issues hidden by filters' with a Clear Filters button. No dashed box.
  - [Stripe](https://mobbin.com/screens/2b2d5f4f-bdd9-4186-b383-e3b30140a551): "No payments found / There aren't any results for that query. Try using different filters." with Clear filters in the filter bar.
  - [Linear](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab): "1 issue hidden by filters · Clear Filters ×" inline under the list.
  - [Linear](https://mobbin.com/screens/90b0ca17-b70a-425c-b28b-ce934231b2b9): Filtered empty state: one line 'No issues matching the filters' plus '16 issues hidden by filters · Clear filters'.
  - [Linear](https://mobbin.com/screens/1a4540b2-6c15-49ff-a07f-4fddb7490e38): "1 issue hidden by filters" with an inline Clear Filters action.
  - [Linear](https://mobbin.com/screens/d3ab0127-662f-4764-9c84-511cd7345e27): '16 issues hidden by filters · Clear Filters'
  - [Linear](https://mobbin.com/screens/c15e23d9-67b4-4a87-af34-117ae648c266): '14 issues hidden by filters · Clear Filters' sits under the filtered list.
- **Code:** `src/app/(app)/tasks/page.tsx:180-183`, `src/app/(app)/deals/page.tsx:111`, `src/components/ui.tsx:226-232`, `src/app/(app)/tasks/all/page.tsx:44-47`, `src/components/ui.tsx:249-255 (EmptyState dashed box)`, `branch src/app/(app)/tasks/all/page.tsx:44-47`, `branch src/components/ui.tsx:249-255`, `branch src/app/(app)/tasks/all/page.tsx:44-47, 62-66`, `branch src/app/(app)/deals/page.tsx:111`, `src/app/(app)/tasks/page.tsx:182`, `branch:src/app/(app)/tasks/all/page.tsx:44-47`
- **Also found as:** TASKS-040 (Tasks list, new task and task detail), COPY-033 (Lens: words on every screen), IA-I09 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. tasks/page.tsx:180-183 and deals/page.tsx:111 put the dashed EmptyState inside a Card, which makes a double frame. The Linear 'hidden by filters' reference fits.

### FEEL-040

**Owner names, full dates and full notes only show on hover**

Medium · Design change · effort M · `Tasks rows, Deals "Latest note" column` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Due dates on touch are solved by the DueDatePicker sheet. Owner names and deal notes are still hover-only.
- **Today:** Task rows on the branch no longer use Tooltip. The assignee is an initials avatar with a native title attribute, which only works with a mouse. The first name shows beside it only in Needs review rows, and only from 28rem. On touch, the code chooses to have a tap open the row, where the task page names the person. At 320 and 375 on /tasks/all, rows show 'CS' or 'PL' with no name. A due date is now reachable on touch: tapping the chip opens a sheet with the month calendar and the day highlighted. Deals' 'Latest note' still uses the mouse-only Tooltip, and Tooltip itself is unchanged.
- **Why:** The touch rule says anything a tooltip carries still needs a tap path. Initials alone don't identify a contractor.
- **Change:** Tasks: show the first name beside the avatar wherever the row has room (the oneLine desktop layout has a fixed column), and in the two-line phone meta line in place of initials. Deals: the original recommendation still fits (a tap path for Tooltip on coarse pointers, and a truncated note that expands on tap).
- **Desktop, tablet, phone:** Desktop: hover tooltip, unchanged. Tablet: first names visible, tap for the full date. Phone: the stacked row carries the first name and due label, so no tooltip is needed.
- **Reuse:** src/components/tooltip.tsx; tasks/task-row.tsx:190-200; deals/deal-row.tsx:127-136.
- **References:** 
  - [Attio](https://mobbin.com/screens/24d97071-f951-4c50-b21a-cabe794fe10e): Phone rows show the date and the linked record as visible chips rather than hover-only details.
- **Code:** `src/components/tooltip.tsx:36-41 (onMouseEnter only)`, `src/app/(app)/tasks/task-row.tsx:121-145 (title attribute, first name only with name prop at @min-[28rem])`, `src/components/tooltip.tsx:36-41 (onMouseEnter only, identical to main)`, `src/app/(app)/deals/deal-row.tsx:132`
- **Verification:** confirmed. tooltip.tsx:36-41 uses mouseenter only, and docs/components.md lists Tooltip on touch as a known gap. The owner column shows initials only (task-row.tsx:199).

### FEEL-044

**The status filter popover ignores Esc and is announced as the wrong control**

Medium · Fix · effort S · `Deals status multiselect` · One design system, fixed in the primitives

- **Today:** After opening "All statuses", Esc left the popover open; only an outside mousedown closes it. role="listbox" wraps <label><input type=checkbox>, an invalid combination that screen readers announce inconsistently. Focus isn't moved in or returned.
- **Why:** The house rule is one Esc per layer, and docs/components.md flags the missing shared popover hook as a known gap.
- **Change:** Rebuild it on a React Aria Popover with a CheckboxGroup (or a ListBox with selectionMode=multiple): Esc closes, focus goes to the first option, arrow keys move, and focus returns to the trigger. Use this as the shared popover for all filters and move it to src/components/.
- **Desktop, tablet, phone:** Desktop and tablet: an anchored popover sized to its content. Phone: these filters fold into the Filters sheet.
- **Reuse:** src/app/(app)/deals/status-multiselect.tsx; React Aria (approved).
- **References:** 
  - [Stripe](https://mobbin.com/screens/2b2d5f4f-bdd9-4186-b383-e3b30140a551): The Status filter chip shows its selected values in the chip ("Cancelled, Blocked").
- **Code:** `deals-ms run eval: [role=listbox] still present after Escape`, `src/app/(app)/deals/status-multiselect.tsx:14-21,55-88`, `src/app/(app)/deals/status-multiselect.tsx:14-21`
- **Also found as:** DEALS-028 (Deals pipeline, new deal and deal detail)
- **Verification:** confirmed. Reproduced: [role=listbox] is still present after Escape. It also has a fixed w-56 width, against the house rule that popovers size to their content.

### FEEL-045

**Removing a CapEx rule saves instantly with no undo**

Medium · Design change · effort S · `Settings > CapEx rules` · Every save is safe, instant and undoable

- **Today:** Each rule row's remove button calls persist() right away, so the rule is removed for all 11 properties' CapEx forecasts. The update is optimistic and reverts on error, but there's no undo. Only "Reset to defaults" asks for confirmation.
- **Why:** A mis-click silently changes the 5-year forecast on Home and every property page. An undo toast is the light, Linear-style safety net.
- **Change:** Keep the instant removal and show the toast "Removed Water heater rule. Undo" for 8 seconds. Undo calls persist with the previous rules (the editor already has them).
- **Desktop, tablet, phone:** Toast bottom right on desktop and tablet, above the bar on phone.
- **Reuse:** src/app/(app)/settings/capex-rules-editor.tsx:208-225,251-286 persist(); Toast (FEEL-009).
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): 'Notification snoozed' with an Undo action on the right of a dark toast above the tab bar.
  - [Superhuman Mail](https://mobbin.com/screens/23660193-1d87-4462-9b18-a9f0dc06ccf5): 'Draft discarded. UNDO': the removal is instant and reversible.
  - [Asana](https://mobbin.com/screens/36cb9092-004d-4cfa-abc7-930e4a7ff931): Undo in the toast instead of a confirm dialog.
  - [Cofounder](https://mobbin.com/screens/4aa868e0-047f-4bd1-9ee2-24ff7ad74bec): A small "Task restored" toast closes the loop after an undo.
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:251-286`
- **Verification:** confirmed. removeEq and removeB call persist() immediately (capex-rules-editor.tsx:251-286). Only Reset to defaults asks first.

### FEEL-I01

**Record pages can't step to the next item in the list you came from**

Medium · Design change · effort M · `Task page (/tasks/[id]); same gap on Deal and Property pages` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. The rebuilt task page header still has only BackLink '← Tasks' (view.tsx:74-76) and no previous or next. On /tasks/cmtg25z7r048gjphs2o7ldjxq at 768, pressing j left the URL unchanged with focus on BODY. The deal page is unchanged.
- **Today:** The task page has only a '← Tasks' back link above the card. The deal page has '← Deals' and the property page has '← Portfolio'. Working through a filtered list, such as Pieter's 95 overdue tasks or the 13 active deals, means going Back, finding the next row, opening it, and repeating. Pressing j or ArrowDown on the task page does nothing (the URL stays the same).
- **Why:** Linear puts '2 / 5' with up and down arrows in the issue header, and Mercury Books steps through transactions from the drawer header, so a triage pass is one key per record. HG's round trip costs a page load and a rescan of the list for every record, which breaks the roughly 100 ms list-navigation budget the library sets.
- **Change:** Add a quiet stepper at the right end of the back-link row: '2 / 13' in Geist Mono, then up and down chevrons, bound to K and J. The order comes from the list the person came from: the list link carries its query (filters and sort, for example ?from=tasks&status=open&sort=due), and the page resolves the previous and next ids with the same query the list uses. Prefetch both neighbors when idle so a step lands in about 100 ms. Esc returns to the list with that row highlighted (FEEL-I03). Hide the stepper when the page was opened directly, with no list context.
- **Desktop, tablet, phone:** Desktop 1280: counter and chevrons right-aligned on the back-link row. Tablet 768: same, with chevrons enlarged to 44px targets. Phone 375: drop the counter and keep the two chevrons beside Back. No swipe gesture, since it would fight the browser's back swipe.
- **Reuse:** BackLink (components/back-link.tsx) for the row; the existing tasks and deals page queries for neighbor lookup; lucide-react chevrons. New: a small RecordStepper in src/components, based on Linear's issue header.
- **References:** 
  - [Linear](https://mobbin.com/screens/62c94bcd-0559-4356-9d0e-bce71c021d88): '2 / 5' counter with up and down arrows at the top right of the issue page.
  - [Mercury](https://mobbin.com/screens/b5b9a184-bd88-48e7-ba5a-f3f151278cc2): The transaction drawer header has up and down arrows that step through the Books list while the list stays in view.
  - [Linear](https://mobbin.com/screens/7c88fd2a-866e-4db1-b3ac-38cb5cd2c043): Breadcrumb on the left, with "2 / 5" and up and down arrows on the right of the issue header.
  - [Todoist](https://mobbin.com/screens/7535ee8f-b02b-4e5d-8724-7b57de1409bb): Task view with up and down arrows to step through the list.
  - [Linear](https://mobbin.com/screens/d0f8ebba-34b7-469c-a708-1069e55a3e02): '2 / 5' with up and down arrows in the issue header.
  - [Linear](https://mobbin.com/screens/178f8c31-237e-4c24-a79a-3ed93b74df03): '2 / 5' with up and down arrows in the issue header.
  - [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a): "1 of 1 in Stage" with up and down arrows above the record.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): The list stays beside the open item, so the next one is one key away.
- **Code:** `src/app/(app)/tasks/[id]/page.tsx:51 (BackLink is the only navigation)`, `src/app/(app)/deals/[id]/page.tsx:47`, `branch-src/src/app/(app)/tasks/[id]/view.tsx:74-76`, `branch-src/src/app/(app)/tasks/today-view.tsx:28-42`, `probe: j on task page at 768, path unchanged, activeElement BODY`, `src/app/(app)/tasks/[id]/page.tsx:50-52`, `branch src/app/(app)/tasks/[id]/view.tsx:67-98`, `branch src/components/back-link.tsx:35-41`, `branch src/components/app-shell.tsx:43`, `branch: src/app/(app)/tasks/[id]/view.tsx:67-98`, `branch: src/components/app-shell.tsx`, `branch: src/app/(app)/tasks/[id]/view.tsx:74-76`, `src/app/(app)/tasks/[id]/page.tsx:51`, `branch-src/src/components/back-link.tsx:15-33`
- **Also found as:** TASKS-041 (Tasks list, new task and task detail), IA-046 (Lens: information architecture and global SaaS patterns), BTASKS-034 (Branch: Today, All tasks, new task and the task page), SHELL-I19 (App shell, sidebar, top bar, global search and Home)
- **Verification:** confirmed. Reproduced: j and ArrowDown on /tasks/cmtg25z7s048mjphsikewzpy1 leave the URL unchanged, and BackLink is the only navigation (tasks/[id]/page.tsx:51, deals/[id]/page.tsx:47). Both Mobbin references are real. Linear 62c94bcd shows '2 / 5' with up and down arrows, and Mercury b5b9a184 shows drawer arrows plus an expand icon. Limit the scope to tasks and deals. Under D10 the sidebar lists all 11 properties, so a stepper on property pages would duplicate it. Back currently lands focus on BODY, so the Esc and return-highlight part depends on FEEL-I03.

### FEEL-I03

**The task list is 1,569 tab stops with no row-level keyboard navigation**

Medium · New capability · effort M · `Tasks list (/tasks) and Deals list (/deals)` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Rows now have 3 tab stops instead of 8: the row link, the checkbox and the due chip. That is 717 tab stops for All's 236 open rows and 226 for Today's 80 rows. There is still no row-level navigation: j and ArrowDown on /tasks/all leave focus on BODY. Coming back from a task doesn't highlight the row you opened.
- **Why:** Superhuman and Linear treat a list as one widget: J and K move a highlighted row, Enter opens, X selects and E completes, and the list is a single tab stop. On HG, getting from row 3 to row 40 by keyboard, or with a screen reader, is impractical.
- **Change:** Same roving-row pattern, applied once in the shared TaskRow and list containers so it covers Today's sections and the All list. Deals is unchanged.
- **Desktop, tablet, phone:** Desktop and tablet with a keyboard. On touch nothing visible changes, because the highlight appears only after a key press. Phone is unaffected.
- **Reuse:** React Aria GridList/Table (approved); TaskRow and DealRow cells unchanged; BackLink history state.
- **References:** 
  - [Superhuman Mail](https://mobbin.com/screens/3ae6bf95-6bbd-4232-b045-3160b748393c): Shortcut sheet: J/K next and previous, Enter open, X select, E mark done.
  - [Superhuman Mail](https://mobbin.com/screens/0e821e22-026a-4641-a91b-ac63b0c9e4bc): Selected rows are highlighted as a block, with a one-time tip: 'you can hit X to select conversations'.
  - [Mercury](https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62): The row stays highlighted while its detail is open, so you never lose your place.
  - [Linear](https://mobbin.com/screens/5bc1daea-c0a9-4e20-8f0d-77163691df63): Number shortcuts shown in the status menu.
  - [Attio](https://mobbin.com/screens/559623c8-0b2f-4e9e-a144-dc330ee1c80b): ESC and ⌘↵ hints on buttons.
- **Code:** `Probe on /tasks: 1,569 focusable controls in tbody; first row = Mark done, text input, Details, Property select, Remove owner, Assignee select, Clear due date, Due date`, `src/app/(app)/tasks/task-row.tsx:108-143`, `branch-src/src/app/(app)/tasks/task-row.tsx:77-91,146-155`, `probe /tasks/all: 236 rows, 717 tab stops, j/ArrowDown -> BODY`, `probe /tasks: 80 rows, 226 tab stops`, `src/app/(app)/deals/deal-row.tsx:53-152`
- **Also found as:** DEALS-045 (Deals pipeline, new deal and deal detail)
- **Verification:** partly. Measured the same numbers: 1,569 focusable controls across 193 rows, 8 per row (Mark done, title input, Details, Property select, Remove owner, Assignee select, Clear due date, Due date). j, ArrowDown, / and c leave focus on BODY. After opening a task and pressing Back, focus is on BODY and no row is marked. Two corrections. First, React Aria approval covers popover, sheet, menu and date picker. GridList and Table are a new dependency surface that needs Connor's OK, so conflicts_with should name it. Second, Connor and Pieter both work with a mouse, so this is real friction against the Linear bar but doesn't block a core job. Medium, not high. On touch the row also has no visible way to open a task (FEEL-V03), and any roving-row redesign should solve both together.

### FEEL-049

**The back link is a button, so it can't open in a new tab**

Low · Fix · effort S · `Property, deal, task and contractor pages (← back)` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. BackLink still renders a <button> calling router.back() or router.push(fallback). On /contractors/[id], /deals/[id] and /tasks/[id] the back control is '<button …><span aria-hidden>←</span> Contractors</button>' (or Deals or Tasks): it can't be cmd-clicked or long-pressed, and screen readers announce a button.
- **Today:** BackLink renders a <button> that calls router.back() or pushes the fallback. Screen readers announce "button Portfolio". It can't be cmd-clicked, middle-clicked or long-pressed for a link preview.
- **Why:** Back is navigation, and navigation should be a link. Stripe's breadcrumbs are anchors.
- **Change:** Render a Link to the fallback href, and intercept a plain click to call router.back() when the referrer is in-app (keeping the restore-filters behaviour). Modified clicks fall through to the href.
- **Desktop, tablet, phone:** Same at all sizes; 44 px tap height on touch.
- **Reuse:** src/components/back-link.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/de9b8395-9d09-4450-9e76-344d8f068e4d): An 'Invoices >' breadcrumb link sits above the invoice title.
- **Code:** `src/components/back-link.tsx:18-25`, `prop767 aria snapshot: button "Portfolio"`, `src/components/back-link.tsx:35-42`, `eval /contractors/cmtg25y9x000djphsbqty81fr: back control outerHTML is a <button>`, `eval /tasks/cmtg25z6k0410jphs47h5apij: <button> '← Tasks'`, `src/components/back-link.tsx:8-24`, `src/components/back-link.tsx:18-24`, `branch src/components/back-link.tsx:35-42`, `branch src/app/(app)/deals/[id]/page.tsx (BackLink)`
- **Also found as:** DEALS-V05 (Deals pipeline, new deal and deal detail), JOURNEYS-V08 (Lens: the core jobs, end to end)
- **Verification:** confirmed. back-link.tsx:18-25 renders a button. The same component has a bigger logic bug, logged as FEEL-V01 (it almost never goes back); fix both together.

### FEEL-051

**The discard dialog offers three equal-weight buttons and a two-part sentence**

Low · Design change · effort S · `Units and Listings discard dialog` · Plain, consistent words

- **Today:** The dialog shows "Discard unsaved changes?" with the body "You have unsaved changes to units & access. Save them, or discard and exit." and three buttons: Keep editing, Discard (secondary style) and Save changes (primary).
- **Why:** Three choices slow a simple decision, the body repeats the title, and the destructive choice isn't marked. Stripe's confirmations offer two buttons and state the one consequence.
- **Change:** Title "Discard your changes?" with no body, or one line naming the count ("3 units have edits."). Two buttons: "Keep editing" (default focus) and a red "Discard". Saving stays in the editor itself.
- **Desktop, tablet, phone:** Desktop and tablet: a centred modal. Phone: a bottom sheet.
- **Reuse:** ConfirmDialog rebuilt on React Aria (FEEL-015); edit-units.tsx:124-150 and edit-listings.tsx:176.
- **References:** 
  - [Stripe](https://mobbin.com/screens/49670294-fe7b-4294-989a-cf7ba72ff1d1): Two-choice confirmation where the buttons say exactly what each does ("No, keep refund" / "Yes, cancel refund").
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:135-147`
- **Verification:** confirmed. Seen in verify-FEEL/units-discard--dialog--desktop-light.png. Overlaps FEEL-015 on the destructive styling; ship them together.

### FEEL-I02

**Marking a task complete leaves you on the finished task**

Low · Design change · effort S · `Task page (/tasks/[id])` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The 'Mark complete' button is gone. Status is now a chip menu with all seven statuses (status-control.tsx:41-73). Choosing Done flips the chip at once (optimistic) but shows no toast and no Undo, and the page stays on the finished task. Cancel task in the more menu already shows 'Task canceled' with Undo (header.tsx:72-83). With the write blocked, choosing Done replaced the whole page with 'Something went wrong' (see FEEL-IV04).
- **Why:** Superhuman opens the next item after every action and shows 'Marked as Done. UNDO', so clearing a queue is a run of single actions. HG's task page ends the run after every task, which is exactly when Connor and Pieter are triaging.
- **Change:** Make Done in the status menu (and Approve on the review banner) match Cancel task: a 'Done: <title>' toast with Undo, which puts the previous status back. When the page has list context (FEEL-I01), move on to the next task in that list.
- **Desktop, tablet, phone:** Same behavior at all sizes. On phone the toast sits above the bottom bar. The button stays where it is until the planned phone bottom bar exists.
- **Reuse:** CompleteButton and toggleTask (tasks/[id]/task-detail.tsx), RecordStepper from FEEL-I01, the toast from FEEL-009.
- **References:** 
  - [Superhuman Mail](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5): After an action the list moves on and the toast reads 'Marked as Done. UNDO'.
  - [Linear](https://mobbin.com/screens/62c94bcd-0559-4356-9d0e-bce71c021d88): The '2 / 5' list context that an advance-on-complete follows.
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:41-47 (onClick toggles in place, no navigation)`, `src/app/(app)/tasks/[id]/page.tsx:56`, `branch-src/src/app/(app)/tasks/[id]/status-control.tsx:41-46`, `branch-src/src/app/(app)/tasks/[id]/header.tsx:72-83`
- **Verification:** partly. The page does stay on the finished task (task-detail.tsx:41-47), but 'nothing confirms the change' is overstated. After the round trip the button turns into a green 'Completed'. The update isn't optimistic, though, and there's no Undo. The prior reviewer's own after-shot (inspire-FEEL/task-complete--after) shows the error boundary, because the read-only harness blocked the write. That behavior is its own bug (FEEL-V04). Auto-advance only works once FEEL-I01 and a toast exist, and it can surprise people, which is why Superhuman makes it a preference. Treat it as a follow-on to I01, not a separate change.

### FEEL-I05

**Controls never show their keys, so Enter and Esc behavior stays hidden**

Low · Design change · effort S · `Shared controls: section edit modes, dialogs, tooltips, the search field` · A quiet shell with real search, navigation and sign-in

- **Today:** Task title, InlineAddressField and the CapEx cells commit on Enter and revert on Esc with no hint. SectionCard edit mode (property Details, Loan, Insurance) has no Esc to cancel and no Cmd+Enter. Only implicit Enter submits the form. Hints there would advertise keys that don't exist yet.
- **Why:** Attio prints ESC on Cancel and ↵ on Save, Linear prints each menu item's key, and Vercel prints F in its Find field. The hint teaches the key at the moment it's useful, for a few pixels of muted text.
- **Change:** Add a Kbd primitive (11px Geist Mono, muted text, 1px border, no fill) and use it in four places only: Cancel shows Esc and Save shows ⌘↵ in SectionCard edit mode and in dialogs; Tooltip gets a shortcut prop ('Open ↵'); the search field shows a / keycap at its right edge that hides on focus; menu rows show their key right-aligned. Show keycaps only on fine-pointer devices.
- **Desktop, tablet, phone:** Desktop 1280: as described. Tablet 768 and phone 375 (touch): keycaps hidden through (pointer: coarse), so nothing is added on touch.
- **Reuse:** Tooltip (components/tooltip.tsx; add a shortcut prop), SectionCard actions slot, Button; new Kbd in components/ui.tsx with a row in docs/components.md.
- **References:** 
  - [Attio](https://mobbin.com/screens/08df4ff2-a5d6-4200-b3b5-44e3ddc41f09): Cancel ESC and Save ↵ on the dialog buttons; 'Quick actions ⌘K' and '/' printed in the sidebar.
  - [Linear](https://mobbin.com/screens/b4e6b70d-27e2-4853-8d0b-b44ab3d54967): Menu items carry their keys right-aligned and muted: Move to ⇧P, Rename ⇧R, Favorite ⌥F.
  - [Vercel](https://mobbin.com/screens/172f9834-0e6a-4fa8-abd4-6e91b02b5ef4): The sidebar Find field shows a single-key F hint at its right edge.
  - [Stripe](https://mobbin.com/screens/fdd00a8f-d75f-4186-9e64-d52551ae4cf7): The dialog primary button reads 'Confirm ⌘ + ↵'.
- **Code:** `src/app/(app)/tasks/task-row.tsx:140 (Tooltip label 'Details', no key)`, `src/components/global-search.tsx:44-50`
- **Verification:** partly. The finding says the Enter and Esc behavior exists but is hidden. In SectionCard edit mode it doesn't exist. With the Details form open on 767 Prospect, Escape in the Value field left the form open at desktop, tablet and phone, and there's no Cmd+Enter. Enter saves only through implicit form submission. Printing 'Esc' on Cancel would advertise a key that does nothing. The prerequisite is to wire Esc to cancel, which the house rule 'One Esc closes one layer' already asks for. Hints are fine once the keys work. Hiding keycaps on coarse pointers respects the touch rule. Attio's Cancel ESC and Save ↵ pattern shows up on several real Attio screens I pulled (93061fc7, 347766cb).

### FEEL-I06

**Deal notes can't be posted from the keyboard and appear only after the server replies**

Low · New capability · effort S · `Deal page, Activity timeline composer` · One record layout for every record

- **Today:** The composer is a two-row Textarea and an Add button in a plain form action. With a note typed, Cmd+Enter and Ctrl+Enter do nothing: no request is sent and the text stays. Add is enabled when the field is empty, and a new note shows up only after the round trip.
- **Why:** Mercury prints 'press Enter to send' under its comment field, Stripe binds ⌘↵ to confirm, and Linear's composer activates its send arrow only when there is text. Notes are the most frequent write on a deal, so posting one should feel like sending a message.
- **Change:** Cmd or Ctrl+Enter posts, and plain Enter keeps a newline. Keep Add disabled until there's text. On post, put the note at the top of the timeline at once with useOptimistic (muted until confirmed), clear the composer and keep focus in it for the next note. If the post fails, put the text back and show 'Couldn't post. Retry'. On pointer devices, add one muted helper line under the composer: '⌘↵ to post'.
- **Desktop, tablet, phone:** Desktop and tablet: as described. Phone 375: no helper line, Add stays the only submit, and the note still appears at once.
- **Reuse:** Textarea and Button (components/ui.tsx), the addNote action, React useOptimistic, Kbd from FEEL-I05.
- **References:** 
  - [Mercury](https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62): Helper line under the comment field: 'Mention a team member with @, press Enter to send'.
  - [Stripe](https://mobbin.com/screens/fdd00a8f-d75f-4186-9e64-d52551ae4cf7): The note dialog confirms with ⌘ + ↵, printed on the button.
  - [Linear](https://mobbin.com/screens/d0f8ebba-34b7-469c-a708-1069e55a3e02): The send arrow activates once the comment has text; empty, it stays muted.
  - [Stripe](https://mobbin.com/screens/966b2f85-123b-4302-b505-08eb9b5a9724): "Add note" on the timeline; notes sit alongside events.
- **Code:** `Probe: Meta+Enter and Control+Enter in textarea[name=body] sent no request; text remained`, `src/app/(app)/deals/[id]/page.tsx:100-105`
- **Also found as:** DEALS-061 (Deals pipeline, new deal and deal detail)
- **Verification:** partly. The observations hold. Meta+Enter and Control+Enter in textarea[name=body] sent nothing and the text stayed. Add is enabled when the field is empty, and the server silently drops an empty body (lib/deals/service.ts:144-145). Add also has no pending guard (FEEL-V06). The claim 'Notes are the most frequent write on a deal' isn't supported: 29 Livingston has 3 manual notes over two months, and one of them is '8/27 - this is a test note'. Low friction, low severity. The Linear d0f8ebba and Mercury aecbbd98 references are real.

### FEEL-I09

**Opening a task leaves the list, so checking five tasks costs ten page loads**

Low · Design change · effort L · `Tasks list (/tasks), desktop and tablet` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. A row is now a Link that does a full route change to /tasks/[id]. Today keeps its Mine | Contractors choice in the URL so Back restores the column, but nothing marks the row you opened, and focus lands on BODY.
- **Today:** The chevron opens /tasks/[id] as a route change. Locally it took 86 ms, and Back took 148 ms with one RSC refetch. Neither is slow. What's lost is your place: after Back, focus sits on BODY and nothing marks the row you opened.
- **Why:** Mercury opens a transaction in a right-hand drawer over the list, keeps the row highlighted and steps with arrows, so the list never reloads. For a quick look, such as reading a description or checking an attachment, that is the right weight and keeps you in place.
- **Change:** On desktop and tablet, clicking a row (or Enter from FEEL-I03) opens the task in a right drawer about 480px wide. The row stays highlighted. The drawer shows the same content as the task page (title, properties, description, attachments) with up and down stepping and an 'Open full page' icon. The URL becomes /tasks?task=<id>, so it can be shared and Back closes the drawer. Esc also closes it. The full task page (the settled task page with a side rail) stays for deep work and for phones.
- **Desktop, tablet, phone:** Desktop 1280: 480px drawer with the list visible behind it. Tablet 768: drawer at 85% width with a light scrim. Phone 375: no drawer; tap opens the full page.
- **Reuse:** The task page's own components (TitleField, AssigneeControl, DueDateControl, PropertyControl, DescriptionField, AttachmentsSection) in a React Aria Modal sheet (approved); RecordStepper from FEEL-I01.
- **References:** 
  - [Mercury](https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62): Transaction opens in a right drawer while the list and its highlighted row stay in place.
  - [Mercury](https://mobbin.com/screens/e22204ce-320f-4304-a506-5191e90e0f85): Reimbursement detail in a side panel beside the list, with status timeline and actions.
  - [Mercury](https://mobbin.com/screens/b5b9a184-bd88-48e7-ba5a-f3f151278cc2): Drawer header with up and down arrows and an expand icon to open the full page.
- **Code:** `src/app/(app)/tasks/task-row.tsx:143 (router.push to the task page)`, `branch-src/src/app/(app)/tasks/task-row.tsx:77-82`, `branch-src/src/app/(app)/tasks/today-view.tsx:21-42`
- **Verification:** partly. Opening a task really is a full route change, and Back does refetch /tasks?_rsc. Measured locally: 86 ms to open a task and 148 ms to go back, one RSC request each. 'Ten page loads' is technically true but quick. The real loss is position, since focus lands on BODY and no row is marked, and FEEL-I01 and FEEL-I03 fix that more cheaply. A drawer would be a second task surface beside the settled 'task page with a side rail' (Asana migration spec). That works against the simplicity bar, and conflicts_with should name the settled decision. Revisit after the settled task page ships. The Mercury references are real (aecbbd98 and b5b9a184 verified).

### FEEL-I10

**Editing a CapEx rule changes every forecast without saying by how much**

Low · New capability · effort S · `Settings, CapEx rules` · Every save is safe, instant and undoable

- **Today:** Rule edits save optimistically with no confirmation, and the forecast change isn't shown. Server-side errors show a red line under the header. A network failure replaces the whole Settings page with the error card. Removing a rule takes effect at once with no undo.
- **Why:** Stripe's balance adjustment shows Starting balance and New balance side by side as you type, so the consequence is visible before and after the commit. Rules that drive money should close the loop the same way, and the toast is already there to carry it.
- **Change:** After each rule change, show a toast that names the change and its effect on the portfolio: 'Water heater replace age set to 12 yrs. 5-year forecast $38,900 → $36,400. Undo'. Compute the new total with the same forecast function the Home card uses, or return it from the save action. Nothing new is added to the page.
- **Desktop, tablet, phone:** The same toast at every size. On phone, if the sentence would wrap, it shortens to 'Forecast $38,900 → $36,400. Undo'.
- **Reuse:** The capex-rules-editor optimistic save, the forecast logic behind portfolio-capex.tsx, fmtMoney, toast from FEEL-009.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ed53af21-56c6-479b-b49f-3c5ab4c875f3): Starting balance next to New balance, with the new figure filling in as the amount is entered.
  - [Stripe](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8): After typing 2.00 the New balance reads -MYR 2.00 in the primary color, showing the consequence before Apply.
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:205-220 (optimistic save), :311 (error line)`
- **Verification:** partly. Confirmed that rule edits save silently. Changing a cost and tabbing away showed no feedback. The error claim is wrong for the common failure, though. When the save request failed (blocked here, like a dropped connection), the whole Settings page was replaced by the 'Something went wrong' card (FEEL-V04). The red line at capex-rules-editor.tsx:311 shows only for server-side errors such as a version conflict. Removing a rule with × also applies to every forecast at once, with no confirm or undo. That is the stronger case for the Undo toast. Rules change a few times a year, so low. The Stripe balance-adjustment references are a loose analogy for a portfolio forecast delta.

### FEEL-I11

**Mis-picked statuses stay in the deal's timeline forever**

Low · New capability · effort M · `Deal page: Status control and Activity timeline` · Every save is safe, instant and undoable

- **Today:** 9 of 18 entries on 29 Livingston St are status changes. Most of the Aug 31 run appears next to '8/27 - this is a test note' and looks like feature testing. The clear real slip is Pieter's 1 - High → 2 - Medium → 1 - High on Sep 2. Two whitespace-only address changes add more noise.
- **Why:** Linear and Superhuman put Undo in the toast after every move, so a slip costs one click and leaves no trace. The timeline exists to show what happened to the deal, and here corrections outnumber events.
- **Change:** After a status change, show 'Moved to Pass · Undo' for about 8 seconds. Undo restores the old status and deletes the log entry it created. Separately, when the same person changes the same field again within 10 minutes, rewrite that entry instead of adding a new one (1 - High → 3 - Low followed by 3 - Low → 5 - TBD becomes 1 - High → 5 - TBD), and drop the entry when the value lands back where it started.
- **Desktop, tablet, phone:** The same at every size; the toast sits where the concept places it (bottom right on desktop, above the bottom bar on phone).
- **Reuse:** logDealChanges in src/lib/deals/log.ts (add an update-or-delete path for the latest entry), StatusControl in deals/[id]/deal-detail.tsx, toast from FEEL-009.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/a625482c-b708-4b6b-a9b2-1f4a4feb26f6): The toast names the move exactly: 'Issue moved to Design'.
  - [Superhuman Mail](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5): 'Marked as Done. UNDO': every state change is reversible from the toast.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): 'Notification snoozed' with Undo on the right of the toast.
- **Code:** `src/app/(app)/deals/[id]/deal-detail.tsx:39-60 (select saves on change)`, `src/lib/deals/log.ts:22-34 (append-only change entries)`
- **Verification:** partly. The counts check out: 18 entries, 9 of them status changes (StatusControl saves on change at deal-detail.tsx:39-60, and log.ts appends). Most of the Aug 31 run, though, sits beside the manual note '8/27 - this is a test note' on the day the timeline shipped, so it reads as Connor testing the control, not as routine corrections. The one clear real slip is Pieter's 1 - High → 2 - Medium → 1 - High on Sep 2. The timeline has a second noise source the finding misses. Two Aug 31 'Address:' entries only move a space and a comma, and the logger should skip changes that are equal after normalization. Undo on status change and coalescing the latest entry are both sound and low cost.
