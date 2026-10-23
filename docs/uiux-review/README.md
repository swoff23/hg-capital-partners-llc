# HG Capital OS UI/UX review

October 2026. A screen-by-screen teardown of the whole app, benchmarked against researched best-in-class SaaS products and backed by Mobbin references. It's input for planning, not a spec: design changes still need Connor's call, and the settled decisions in [the Asana migration plan](../asana-migration-plan.md) stand unless a finding says it challenges one.

The interactive version, with filters and the evidence screenshots, is `uiux-review/index.html` at the repo root. It is gitignored, like the device report, because the screenshots show real tenant, loan and P&L figures. Here, contractor phone numbers and emails are replaced with [phone] and [email].

### The short version

HG works, and a lot of it is good: the CapEx model, the approved task and portal designs, the house rules. Next to Linear, Stripe, Mercury and Things 3, though, it reads as pages built one at a time. Three root causes explain most of the 1,076 findings:

- **No single source for numbers and words.** Money, dates, unit counts and addresses are formatted in different places, and a few are wrong.
- **No shared way to save.** A failed save replaces the page and loses what was typed. A good save says nothing, and nothing can be undone.
- **No shared layout.** There are three record layouts, a frame that competes with the work (a hover rail, a gray canvas of stacked shadowed cards, uppercase labels over columns of dashes), and desktop tables squeezed onto phones.

### Fixed first

The five critical bugs are fixed and live on production (4b9b14f, 3390e7d):

- PORTFOLIO-V01: 765 and 767 Prospect share one SREO line, so portfolio totals count it twice.
- PORTFOLIO-001: the Portfolio table and the property pages disagree on unit counts for 5 of 11 properties.
- FEEL-001: a typo in a money field ("55o,000") saves the value as empty.
- DEALS-001: Esc saves a deal edit instead of discarding it, and the property address heading does the same.
- PUBLIC-001: a failed move-in submission wipes the resident's whole report.

Another 64 high-severity fixes need no design call. The roadmap's Fix now list routes each one to main or to the migration branch.

### Five moves that change how it feels

1. **Home becomes the work queue.** A short "Needs you" strip sits above the approved Mine | Contractors columns. The counts and the CapEx matrix move to Properties (SHELL-003, SHELL-I01).
2. **One record layout, built first as the D10 property hub.** It has an identity header with the key figure and next step, tabs with counts, one Activity timeline, a facts rail and tap-to-edit fields (PROPERTY-011, VISUAL-027, PROPERTY-016). Deals, tasks and contractors reuse it.
3. **Every save is instant and undoable.** Writes apply at once, roll back on failure and end in a toast that names the change and offers Undo (FEEL-009, BTASKS-005).
4. **A quiet shell.** A labeled sidebar, ⌘K for search and commands, create sheets that open where you are, and D10's labeled bottom bar on phones (SHELL-002, IA-009, SHELL-006).
5. **One flat, calm system, fixed in the primitives.** Sections sit flat on white, color means state only, figures are typeset, list rows open records instead of acting as inputs, and every Financials figure opens the QuickBooks lines behind it (VISUAL-009, VISUAL-015, DEALS-008, DATA-I04).

### Decisions

Connor's answers on Oct 23:

- **Fonts and colors:** he deferred to the research and released the old visual rules. New brand guidelines are being drafted (`docs/brand-guidelines.md`), with a preview, before anything in the app changes. That decides how money is set, the dark-mode button blue and status shown by shape first.
- **Failed photos on Mark done:** option A. Mark done stays disabled until each failed photo is retried or removed. Live in 0ab449b.
- **Unit count:** it follows the unit records; add or remove a unit to change it. 767 Prospect has two units, and its third record was removed with its details kept in the property notes.

Still open: whether Home hosts Today, merging D10's Home and the Tasks Today view into one screen. Everything else waiting on Connor is in `docs/todo-for-connor.md`.

### The migration branch

Task, contractor and portal findings were re-checked on the Asana migration branch, which is now on main. Of those, 89 are already resolved there, including fixes in dd00a9e, 4cf099d, 0148abf, 9f74ea1 and c805e38 that were checked against the code. 208 still apply on the branch, often with a note on what was partly fixed, and 113 changed shape with the rebuild. A fresh review of the branch's new screens added 125 more. All of them are marked "Branch" in the list.

## In numbers

| | |
|---|---|
| Distinct findings | 1076 (1813 raw, 721 duplicates folded in) |
| Critical / high / medium / low | 0 / 160 / 481 / 435 |
| Fixes (no design call needed) / design changes / new capabilities | 360 / 471 / 245 |
| Mobbin references | 1574 |
| Areas and lenses reviewed | 28 |

## Themes

| Theme | What it means | Findings | Critical | High |
|---|---|---|---|---|
| **Fix wrong numbers and records first** | Several screens show data that is wrong or contradicts itself: unit counts that differ between Portfolio and the property page, one SREO line counted twice, forecasts that silently drop undated items, jobs matched to the wrong contractor by first name, inputs that save $8 for '8k' or erase stored account numbers, and clocks running on UTC. Stripe and Mercury earn trust by never showing a figure they can't back up, and a calmer layout around a wrong number only makes it more convincing. Most of these are small fixes plus one canonical address format, and they come before any redesign. | 31 | 0 | 10 |
| **Every save is safe, instant and undoable** | One failed save swaps the whole page for an error card and throws away what was typed, files delete in one tap, double taps create duplicates, ticking a task gives no feedback or Undo, and two people editing the same record overwrite each other. Linear, Superhuman and Vercel's guidelines treat speed and safety as one design: optimistic writes with rollback, Undo toasts instead of confirms, pending states, drafts that survive a reload and conflict notices that name who changed what. Fix it once in shared helpers and primitives rather than editor by editor. | 54 | 0 | 16 |
| **Home and Today become one work queue** | Home leads with inventory counts and a 5-year CapEx matrix while the tasks that need you sit below the fold, and the branch's Today, repeats and playbooks still produce undated runs, late copies, a 34-row Unassigned pile and completions that say nothing about what comes next. Things 3, Ramp and Linear open on what needs you now, who acts next and a one-tap finish with Undo. Make the queue the center of the app, with clear handoffs between the two partners, and repeats and playbooks that schedule themselves and report back. | 125 | 0 | 16 |
| **One record layout for every record** | Properties, deals, tasks and contractors use three different detail layouts, with titles that are clipped text inputs and no heading, stacked uppercase labels over columns of dashes, key dates and the loan balance hidden, and notes buried among system changes. Stripe, Attio and Linear repeat one anatomy: an identity header with the key figure, status and actions, tabs with counts, one timeline in the main column and a facts rail where empty fields read as verbs. Build it first as the D10 property hub, then reuse it for deals, tasks and contractors. | 60 | 0 | 10 |
| **Lists answer first and stay calm at 675 rows** | The deals list is a sheet of live inputs that scrolls sideways at 1280 and stops at 300 rows, and other lists scroll inside 70vh boxes, can't be bulk-edited and dead-end on empty filters. Attio, Stripe and Shopify keep large lists calm with read-only rows that open the record, grouped stages or a board, footer totals, filters that save as views and a floating bulk bar. The deals pipeline is where to prove the pattern before applying it to Portfolio and Contractors. | 54 | 0 | 8 |
| **A quiet shell with real search, navigation and sign-in** | The frame gets in the way: an unlabeled icon rail that flies open on hover, search that ignores the keyboard and matches only exact substrings, back links that lose filters, every tab titled 'HG Capital OS', no account menu, and sign-in that forgets the link you came from. Linear, Superhuman and Vercel let the chrome recede and put labeled navigation, one Cmd-K box and an account menu in fixed places. Settling the frame once improves every page and sets up the D10 sidebar and merged Settings. | 76 | 0 | 9 |
| **The phone is a chosen subset, and touch has no hover** | Phones and iPads get squeezed desktop tables, filter rows that wrap to three lines, Edit and photo controls that only appear on hover, 20 to 38px targets, clipped prices and a hamburger drawer. Linear Mobile, Shopify and Stripe's iOS app pick the few jobs people do away from a desk, reflow lists into two-line rows, and use sheets with pinned buttons and a labeled bottom bar. Build that subset on purpose, as D10 already plans, and fix touch rules in the primitives rather than page by page. | 71 | 0 | 16 |
| **Create where you are** | Every New is a separate full page that loses the context you came from, sends you somewhere else afterwards, validates with browser bubbles and can't carry on to the next item. Linear, Todoist and Attio create in a sheet prefilled from the current page, parse what you type and offer Save and add another. One create sheet pattern, opened from the shell, lists and records, covers tasks, deals, properties and the deal-to-property conversion. | 30 | 0 | 3 |
| **Money, numbers and dates read one way** | Money columns are left-aligned, negatives mix hyphens and minus signs, the same price reads '425k' on one page and '$425,000' on another, and due dates use four vocabularies, including an overdue label that read 'yesterday' for 18-month-old tasks. Mercury, Stripe and Vercel typeset numbers: right-aligned tabular figures, a true minus, one decimal policy per context and one date formatter. A shared formatter plus a few table rules fixes most of these at once. | 21 | 0 | 3 |
| **The QuickBooks mirror is honest about what it covers** | Financials never states its period, labels a 51-day-old sync with a brand chip, adds income and expense together in its cleanup total, ships a basis toggle that changes nothing, shows confident $0 figures where nothing is booked and fills tiles with bookkeeping caveats. Mercury and Stripe lead with a few headline numbers, a period control, a plain freshness line and a drill-down to the lines behind every figure. Fix the trust bugs first, then rebuild Overview, Rent and the QuickBooks settings around the decisions an owner makes. | 111 | 0 | 27 |
| **One design system, fixed in the primitives** | Status renders five different ways, red and green each do several jobs, avatars use hashed rainbow colors, emoji stand in for icons, dark mode fails contrast, dialogs ignore Esc and the gray canvas stacks shadowed cards inside cards. Vercel's Geist and Linear give every token one job and keep surfaces flat and neutral, so the few colored marks are found first. Fix these in tokens and shared components so every page inherits the calm, and let the gold accent and real property photos keep it from looking generic. | 90 | 0 | 7 |
| **Plain, consistent words** | The app still says Vendors, Project and Owner after the agreed renames, deal statuses mix priority with spreadsheet sort numbers, screen readers hear variable names like theirPriceRaw, and internal caveats, footnotes and env var names sit on screen. Monzo, Basecamp and Stripe use one short, specific name per thing and explain only what helps a decision. A one-page glossary and a single sweep of labels and empty states removes most of these. | 53 | 0 | 3 |
| **Rentals, residents and the public site run one lifecycle** | Listings go public without rent or photos, units appear twice with no tenancy record, the move-in report is a 7,400px form that loses answers on reload and lands as a text dump inside a task, and the public site has no property photography. Zillow Rental Manager, Airbnb and Thumbtack tie listing, tenancy and resident intake to one unit and end every resident flow by saying what happens next. Model the tenancy, gate what goes public, and turn the move-in report into a dated record on the unit. | 146 | 0 | 21 |
| **Contractor jobs and media close the loop** | Contractors are about to sign in, but the portal shows them a red Review chip, Mark done can skip photos that failed to upload, partners approve without seeing proof, emails don't name the job or accept replies, and files open raw or delete with no Undo. Jobber, Basecamp and Gusto label what each side can see, show the evidence before approval and end each job on a payoff with the next step. Ship the portal with one media system and explicit visibility, and let every job report back to the partners. | 154 | 0 | 11 |

## Fix first

Critical findings, then high-severity fixes that need no design approval.

- [ADMIN-002](admin.md#admin-002) **High**, S: '+ Add system' saved a blank 'New system' rule that now shows on every property (Contractors directory, contractor detail and Settings)
- [ADMIN-004](admin.md#admin-004) **High**, S: Phone numbers and emails aren't tappable (Contractors directory, contractor detail and Settings)
- [ADMIN-006](admin.md#admin-006) **High**, S: Leaving the Move-in form tab throws away unsaved edits without asking (Contractors directory, contractor detail and Settings)
- [BPLAY-010](bplay.md#bplay-010) **High**, S: Fill-in fields are raw Asana placeholders: duplicate, lowercase, and hidden (Branch: playbooks, templates and repeats)
- [BPORTAL-013](bportal.md#bportal-013) **High**, S: Sign-in forms have no pending state, and a failed submit shows a white framework page (Branch: contractor portal and contractor sign-in)
- [COPY-004](copy.md#copy-004) **High**, S: Finish the approved rename from 'Vendors' to 'Contractors' (Lens: words on every screen)
- [COPY-010](copy.md#copy-010) **High**, S: The partial-sync banner says 'mid-update' about a 51-day-old sync (Lens: words on every screen)
- [COPY-V04](copy.md#copy-v04) **High**, S: The 'Unattributed' figure is called 'real cost' but contains all of the period's income (Lens: words on every screen)
- [DATA-005](data.md#data-005) **High**, S: Typing "8k" as a building system cost saves $8 (Lens: tables, numbers, money, charts and status)
- [DATA-006](data.md#data-006) **High**, S: The banner says figures are off "to the cent" when NOI is $2,916 off (Lens: tables, numbers, money, charts and status)
- [DATA-007](data.md#data-007) **High**, S: Sandbox QuickBooks data is shown as real P&L with no label (Lens: tables, numbers, money, charts and status)
- [DATA-010](data.md#data-010) **High**, S: Rent roll shows only "Portfolio $0", no rows and no empty state (Lens: tables, numbers, money, charts and status)
- [DATA-011](data.md#data-011) **High**, S: "By property" lists no properties although two are mapped (Lens: tables, numbers, money, charts and status)
- [DATA-012](data.md#data-012) **High**, S: A mapped property with no synced lines shows Income $0, Opex $0, NOI $0 (Lens: tables, numbers, money, charts and status)
- [DATA-IV02](data.md#data-iv02) **High**, S: 'Unclassified $12,065' adds income and expense together (Lens: tables, numbers, money, charts and status)
- [DATA-IV04](data.md#data-iv04) **High**, S: Latest note is blank on 674 of 675 deals because imported notes are filtered out (Lens: tables, numbers, money, charts and status)
- [DATA-V01](data.md#data-v01) **High**, S: The CapEx forecast silently leaves out 22 undated items, 7 of them HVAC (Lens: tables, numbers, money, charts and status)
- [DEALS-006](deals.md#deals-006) **High**, S: The status filter popover opens off the left edge on phones (Deals pipeline, new deal and deal detail)
- [DEALS-IV01](deals.md#deals-iv01) **High**, S: Stop clipping the last digit of prices on touch screens (Deals pipeline, new deal and deal detail)
- [FEEL-005](feel.md#feel-005) **High**, S: Submit buttons have no pending state, so double taps create duplicate tasks (Lens: interaction quality, feedback, states, speed and accessibility)
- [FEEL-010](feel.md#feel-010) **High**, S: Filters and sorts don't respond until the server returns, and each one adds a history entry (Lens: interaction quality, feedback, states, speed and accessibility)
- [FINANCIALS-002](financials.md#financials-002) **High**, S: Stop hiding the months label once history reaches 12 months (Financials, rent roll and financial settings)
- [FINANCIALS-004](financials.md#financials-004) **High**, S: Match the data-quality figures to the basis the page is showing (Financials, rent roll and financial settings)
- [FINANCIALS-005](financials.md#financials-005) **High**, S: Rename 'Cash flow after debt': it only subtracts interest (Financials, rent roll and financial settings)
- [FINANCIALS-I10](financials.md#financials-i10) **High**, S: Show money in and money out apart in a property's recent transactions (Financials, rent roll and financial settings)
- [G1A-008](g1a.md#g1a-008) **High**, S: 14 of 29 contractors have no email, so they can't get a login on Oct 29 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- [G1E-001](g1e.md#g1e-001) **High**, S: Printouts stop silently at the scroll box: /tasks prints about 14 of 193 open tasks (What leaves the app: printouts, PDFs and the Google listing)
- [G1E-003](g1e.md#g1e-003) **High**, S: The fixed app header prints on every page and covers the first lines of each page (What leaves the app: printouts, PDFs and the Google listing)
- [G2A-004](g2a.md#g2a-004) **High**, S: Choosing "Ignore" on a class changes nothing: ignored money still counts everywhere (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- [G2A-005](g2a.md#g2a-005) **High**, S: The OAuth return is silent: success, cancel and failure all look the same (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- [G2A-011](g2a.md#g2a-011) **High**, S: The two "Unattributed" figures will disagree as soon as any class is unmapped (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- [G2A-V01](g2a.md#g2a-v01) **High**, S: The Settings Basis toggle changes nothing anywhere (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- [G2B-002](g2b.md#g2b-002) **High**, S: Pin the version when Edit opens, and start the draft from the latest data (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- [G2B-003](g2b.md#g2b-003) **High**, S: Send only the fields that changed from the Details, Loan, Insurance and Notes forms (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- [G2B-005](g2b.md#g2b-005) **High**, S: Refresh a page when its tab comes back into view (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- [G2B-I03](g2b.md#g2b-i03) **High**, S: Say who will actually see a reply, and say so when the contractor has no login (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- [G2B-I13](g2b.md#g2b-i13) **High**, S: Keep tabs left open through a deploy working (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- [G2C-001](g2c.md#g2c-001) **High**, S: Give each unit a stable id before the task Unit field ships on Oct 28 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- [G2C-IV02](g2c.md#g2c-iv02) **High**, S: Give a submitted move-in report a due date and an owner so it doesn't sink (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- [G2C-V01](g2c.md#g2c-v01) **High**, S: Show each card's Edit link on touch tablets, not only below 640px (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- [IA-002](ia.md#ia-002) **High**, S: Back link drops the list's filters and can go somewhere its label doesn't name (Lens: information architecture and global SaaS patterns)
- [IA-003](ia.md#ia-003) **High**, S: Creating a duplicate address silently throws away what was typed (Lens: information architecture and global SaaS patterns)
- [IA-004](ia.md#ia-004) **High**, S: Four different due-date vocabularies; the Tasks list calls an 18-month-old task 'yesterday' (Lens: information architecture and global SaaS patterns)
- [JOURNEYS-006](journeys.md#journeys-006) **High**, S: Empty loan maturity and insurance renewal dates are hidden, so the gap is invisible on every property (Lens: the core jobs, end to end)
- [PROPERTY-002](property.md#property-002) **High**, S: The current loan balance is stored for every property but never shown, so equity and LTV are invisible (Property detail page (future property hub))
- [PROPERTY-IV01](property.md#property-iv01) **High**, S: Show the full address as the page title instead of clipping it at about 20 characters (Property detail page (future property hub))
- [PROPERTY-V01](property.md#property-v01) **High**, S: National Grid 'LOFL' stores account numbers but edits as a status select, so one touch erases them (Property detail page (future property hub))
- [PUBLIC-003](public.md#public-003) **High**, S: Move-in report never records which unit it covers (Login and the public site)
- [PUBLIC-007](public.md#public-007) **High**, S: The 'Additional comments' box renders as a small inline box beside its label (Login and the public site)
- [PUBLIC-016](public.md#public-016) **High**, S: Sign-in fields have no labels and the page has no heading (Login and the public site)
- [SHELL-IV02](shell.md#shell-iv02) **High**, S: Rank open tasks and active deals first in search, and drop placeholder rows (App shell, sidebar, top bar, global search and Home)
- [TASKS-006](tasks.md#tasks-006) **High**, S: Choosing a team member permanently erases a contractor assignee, and you can't pick them again (Tasks list, new task and task detail)
- [BPLAY-002](bplay.md#bplay-002) **High**, M: Every playbook creates undated tasks because the anchor date never shows (Branch: playbooks, templates and repeats)
- [BPORTAL-004](bportal.md#bportal-004) **High**, M: Leaving the job page mid-upload silently cancels every photo (Branch: contractor portal and contractor sign-in)
- [COPY-017](copy.md#copy-017) **High**, M: Addresses are formatted a dozen different ways (Lens: words on every screen)
- [DATA-IV01](data.md#data-iv01) **High**, M: Legacy Asana assignee names leave contractor job history empty (Lens: tables, numbers, money, charts and status)
- [DEALS-V01](deals.md#deals-v01) **High**, M: Catch duplicates by street number and name, and flag the ones already in the pipeline (Deals pipeline, new deal and deal detail)
- [G1A-I01](g1a.md#g1a-i01) **High**, M: A dropped connection on the job page throws away the page and Zack's note (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- [G1D-V01](g1d.md#g1d-v01) **High**, M: Remove permanently deletes a file in one tap, with no confirm and no Undo (Photos, videos and documents: viewing and capturing, not just the upload box)
- [G2B-V01](g2b.md#g2b-v01) **High**, M: Keep the page and the draft when a save can't reach the server (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- [IA-I01](ia.md#ia-i01) **High**, M: Search only finds exact substrings of one field: 'Street' misses 'St.', and word order and accents break it (Lens: information architecture and global SaaS patterns)
- [PROPERTY-007](property.md#property-007) **High**, M: Ten stored property fields have no UI, so the tax-due reminder can never be created (Property detail page (future property hub))
- [PROPERTY-022](property.md#property-022) **High**, M: Free-text install years ('Old', 'Newer', 'x') silently drop equipment out of status and the forecast (Property detail page (future property hub))
- [SHELL-001](shell.md#shell-001) **High**, M: Make global search work from the keyboard (arrows, Enter, Esc) with combobox semantics (App shell, sidebar, top bar, global search and Home)

## Quick wins

- [DATA-IV02](data.md#data-iv02) **High**, S: 'Unclassified $12,065' adds income and expense together (Lens: tables, numbers, money, charts and status)
- [DATA-V01](data.md#data-v01) **High**, S: The CapEx forecast silently leaves out 22 undated items, 7 of them HVAC (Lens: tables, numbers, money, charts and status)
- [DEALS-IV01](deals.md#deals-iv01) **High**, S: Stop clipping the last digit of prices on touch screens (Deals pipeline, new deal and deal detail)
- [G1A-008](g1a.md#g1a-008) **High**, S: 14 of 29 contractors have no email, so they can't get a login on Oct 29 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- [G2A-004](g2a.md#g2a-004) **High**, S: Choosing "Ignore" on a class changes nothing: ignored money still counts everywhere (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- [G2C-V01](g2c.md#g2c-v01) **High**, S: Show each card's Edit link on touch tablets, not only below 640px (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- [IA-003](ia.md#ia-003) **High**, S: Creating a duplicate address silently throws away what was typed (Lens: information architecture and global SaaS patterns)
- [PROPERTY-002](property.md#property-002) **High**, S: The current loan balance is stored for every property but never shown, so equity and LTV are invisible (Property detail page (future property hub))
- [PROPERTY-IV01](property.md#property-iv01) **High**, S: Show the full address as the page title instead of clipping it at about 20 characters (Property detail page (future property hub))
- [PROPERTY-V01](property.md#property-v01) **High**, S: National Grid 'LOFL' stores account numbers but edits as a status select, so one touch erases them (Property detail page (future property hub))
- [VISUAL-I05](visual.md#visual-i05) **High**, S: Replace the default Vercel triangle favicon with an HG mark (Lens: visual design system across every screen)
- [DATA-IV01](data.md#data-iv01) **High**, M: Legacy Asana assignee names leave contractor job history empty (Lens: tables, numbers, money, charts and status)
- [G1D-V01](g1d.md#g1d-v01) **High**, M: Remove permanently deletes a file in one tap, with no confirm and no Undo (Photos, videos and documents: viewing and capturing, not just the upload box)
- [G2B-V01](g2b.md#g2b-v01) **High**, M: Keep the page and the draft when a save can't reach the server (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)

## Big bets

- [FEEL-009](feel.md#feel-009) **High**, M: Saves never confirm: no toast, so you can't tell an edit worked (Lens: interaction quality, feedback, states, speed and accessibility)
- [IA-009](ia.md#ia-009) **High**, M: Create in place with a sheet prefilled from the current page (Lens: information architecture and global SaaS patterns)
- [SHELL-002](shell.md#shell-002) **High**, M: Add a ⌘K command palette with Recent, Go to and grouped results (App shell, sidebar, top bar, global search and Home)
- [SHELL-006](shell.md#shell-006) **High**, M: Replace the hamburger drawer with D10's labeled bottom bar: Home, Tasks, Properties, Deals, More (App shell, sidebar, top bar, global search and Home)
- [DATA-I04](data.md#data-i04) **High**, L: No Financials figure opens the QuickBooks lines behind it (Lens: tables, numbers, money, charts and status)
- [DEALS-008](deals.md#deals-008) **High**, L: Turn the deals table from a sheet of inputs into read-only rows that open the deal (Deals pipeline, new deal and deal detail)
- [PROPERTY-011](property.md#property-011) **High**, L: Split the 12-card scroll into the D10 tabs and define what each tab holds (Property detail page (future property hub))
- [PROPERTY-016](property.md#property-016) **High**, L: Replace whole-card edit modes with tap-to-edit per field (Property detail page (future property hub))
- [SHELL-003](shell.md#shell-003) **High**, L: Rebuild Home as one 'Needs you' list in sections instead of counts plus a CapEx matrix (App shell, sidebar, top bar, global search and Home)
- [VISUAL-009](visual.md#visual-009) **High**, L: Replace the gray canvas and shadowed card stack with flat sections on white (Lens: visual design system across every screen)
- [VISUAL-015](visual.md#visual-015) **High**, L: Tables shrink onto phones instead of becoming list rows (Lens: visual design system across every screen)
- [VISUAL-027](visual.md#visual-027) **Medium**, M: Four record types, three detail layouts; use one DetailLayout (Lens: visual design system across every screen)

## Who sets the bar

The products designers treat as the bar are not the flashiest ones. They are calm, dense and fast, and they are honest about the state of things. Eight research passes (consensus, fintech, work tools, records, dev tools, proptech, mobile, and a critic pass) kept turning up the same habits on screen:

- **Navigation and chrome stay in the background.** Linear dimmed its sidebar so the content leads ([Linear refresh](https://linear.app/now/behind-the-latest-design-refresh)), and it cut each theme from 98 hand-set variables to 3 inputs ([Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)).
- **Color is rare, and every use means something.** Things 3 is almost entirely neutral, and red appears only for deadlines ([design study](https://blakecrosley.com/blog/design-study-things)). Stripe builds its status colors so they are easy to read ([Stripe color](https://stripe.com/blog/accessible-color-systems)).
- **Numbers are typeset, not just printed.** That means tabular figures, the same number of decimals throughout one view, smaller cents and right-aligned money ([Vercel guidelines](https://vercel.com/design/guidelines)).
- **Every record page uses the same layout.** The key figure and status sit at the top, what changes goes in the main column, and fixed facts go in a side rail ([Stripe record layout](https://support.stripe.com/questions/updates-to-the-customer-detail-page)).
- **Speed is designed, not left to chance.** Common actions respond in about 100ms, saves show up immediately and can be undone, and loading indicators never flicker ([a16z on Superhuman](https://a16z.com/game-design-not-gamification-for-great-products)).
- **The phone app is a deliberate subset of the desktop app**, not a shrunken copy of it ([Stripe Dashboard iOS](https://brianlovin.com/app-dissection/stripe-dashboard-ios)).
- **Finishing something feels finished.** You get a clear next step and a real image, not a generic check mark ([Superhuman Inbox Zero](https://help.superhuman.com/hc/en-us/articles/46005833597709-Achieve-Inbox-Zero)).

### Who sets the bar

Nine products serve as north stars for the whole app:

- **Linear** for calm, keyboard-first lists and records.
- **Stripe** for tables, money and record pages.
- **Mercury** for finance screens that feel quiet ([breakdown](https://www.925studios.co/blog/mercury-design-breakdown)).
- **Vercel's Geist system** ([Geist](https://vercel.com/geist/colors)). HG already uses its font.
- **Attio** for saved views and pipelines ([Design at Attio](https://verifiedinsider.substack.com/p/design-at-attio)).
- **Things 3** for tasks.
- **Airbnb Hosting**, the closest owner-side property product.
- **Superhuman** for speed and inbox flow.
- **Ramp** for putting work queues ahead of charts ([Ramp](https://ramp.com/blog/simpler-more-efficient-expenses)).

Twenty specialists cover particular areas:

- Jobber for the contractor side.
- Zillow Rental Manager for the property hub.
- Flighty ([Apple Design Awards 2023](https://www.apple.com/newsroom/2023/06/apple-announces-winners-of-the-2023-apple-design-awards)) and Copilot Money for plan versus actual.
- Gusto ([principles](https://docs.gusto.com/app-integrations/docs/gusto-experience-principles)) and Wise for confirm and sent screens.
- Monzo ([writing principles](https://monzo.com/tone-of-voice/)) and Basecamp for product writing.

**A note on Ramp.** Ramp's own posts document its approach well, but I checked web and iOS and Mobbin has no Ramp screens. The review takes Ramp's principles and uses Mercury and Brex screens to show them.

### How this should shape HG

1. **Home becomes a work queue.** It shows what needs you and who acts next. Charts move one level down.
2. **One record layout for everything.** The property page sets it: a header with the key figure and status, tabs with counts, a facts rail and a single timeline of events and notes. Deals, tasks and contractors reuse it.
3. **Deals stay calm at 675 rows** through saved views, stage counts and column totals rather than a longer table.
4. **One way to show money.** Figures use Geist Mono, and budget versus actual follows Flighty and Copilot.
5. **Every zinc color token gets one job**, following Geist.
6. **The phone app covers five jobs:** Home, Tasks, property lookup, capturing photos and receipts, and approvals. Lists reflow into two-line rows.
7. **Sent and done screens use HG's own property photos and line art**, then name the next step.

### Disagreements I settled

- **Attio on phones.** I spot-checked Attio's phone app. It shows record lists as a grid you scroll sideways ([Mobbin](https://mobbin.com/screens/3bddd043-5937-4c5e-855b-d4c9c98ddfa4)), so HG's phone lists should follow Shopify and Linear Mobile instead.
- **Left out of the library:** Notion, Monarch and Raycast, because Airtable, Copilot and Superhuman do their useful parts better.
- **Not used as models:** Asana, Monday, ClickUp and the property-management suites. Reviewers praise those suites for being easy to learn, not for their craft.

### One caution

Critics note that the Linear look is now everywhere ([LogRocket](https://blog.logrocket.com/ux-design/linear-design/)). Mercury stays distinct through its own typeface and photography. HG's equivalents are the gold accent and real property photos, so the calm should still read as HG.

### North stars

| Product | Why |
|---|---|
| **Linear** | The benchmark for calm density, and its team documents every choice: sidebar dimmed so content leads, 98 theme variables replaced by 3 inputs in LCH, warmer grays, and the same header and view-control layout on every view (2024 redesign and March 2026 refresh). On Mobbin: lists grouped under status headers with counts and a per-group add, a floating N selected bar, one Display popover for grouping and ordering, a properties rail where empty fields read as verbs, 2 / 5 record stepping, undo toasts on mobile and a floating tab bar that expands into the full section list. Native Swift and Kotlin mobile apps skip glass refraction to protect legibility. Borrow its structure, not its look, which critics say has become commoditized. |
| **Stripe Dashboard** | The reference for trustworthy money UI. Its documented record layout puts changing activity in the main column, static facts in a right rail, top actions in the header and canceled items in view by default. Lists open with status count tiles that filter, dashed add-filter chips, Edit columns and a lone dash for empty cells. Record pages lead with the amount and a status badge, then a timeline with notes, @mentions and Esc / Cmd-Enter hints, then a breakdown block ending on a bold net row. Color is built in a perceptual space with contrast rules in the scale. The iOS app is a deliberate subset with period pills and a gray prior-period line. Its head of design ties craft to growth. |
| **Mercury** | The calmest dense money UI in the set. Near-monochrome, with green only for inflows and red or yellow only for failures, superscript cents, and a summary strip (Net change, Money in, Money out) above every list. Rows open in a right drawer with previous and next stepping, the Books P&L puts months in columns with a sticky Total, and Cmd-K search has scoped tabs and visible key hints. Home greets by first name, then shows action pills and module cards (Outstanding, Overdue, Due soon). Web tabs and phone rows use the same queue names, and the sent screen says when money lands. Its job posts set restraint as the brief, and its own typeface and photography keep that restraint from looking generic. |
| **Vercel (dashboard, Geist, Web Interface Guidelines)** | HG already ships Geist, and Vercel publishes the most concrete public rulebook for crisp UI. Geist gives each gray range a job (fills, borders, secondary and primary text), separates Label and Copy type roles, names a tabular-number style, and splits materials into Surface and Floating. The Web Interface Guidelines spell out feel: optimistic updates with undo, spinners delayed 150 to 300ms and held 300 to 500ms, skeletons matching the final layout, 0 or 2 currency decimals, 16px inputs on iOS and 44px touch targets. The dashboard shows status as a dot plus a word in a fixed column, and its February 2026 navigation added a hideable sidebar and a one-handed bottom bar on phones. |
| **Attio** | Records, lists and pipelines with Linear-grade restraint; its design lead lists restraint as the first principle. Saved views switch from the page title, every column and every kanban stage gets a footer calculation, stages keep one color dot from board to record, and View settings hides stages such as Lost. Deal cards show value, date, owner, last activity and time in stage in fixed spots. Record pages have an identity header, chips row, tabs with counts and a details rail, dialog buttons show Esc and Enter, a floating bar appears on selection, and cells expose edit history. Spot-check on 2026-10-22: the iOS home and record detail are good, but iOS list views render as a sideways-scrolling grid (https://mobbin.com/screens/3bddd043-5937-4c5e-855b-d4c9c98ddfa4), so phone lists should follow Shopify and Linear Mobile. |
| **Things 3** | Two Apple Design Awards (2009, 2017) and still the reference for a calm task UI. About 95% neutral, with color only for deadline red and the today marker. It separates When (the day you plan to do it) from Deadline (a small flag that reads 4d left and turns red on the day), lists today's calendar events above today's to-dos, and shows the parent project as a gray sublabel under each task. A tapped row expands in place while the list dims, one add button lives in the same spot on every screen, swipes speed up rescheduling and selection, and selection swaps in a compact bottom toolbar. |
| **Airbnb (Hosting)** | The most polished owner-side property product, built by a consumer design team. The 2025 rebuild made Today the hub with a Today / Upcoming switch and five destinations, with everything else in a grouped Menu. Listings are real-photo cards with one status pill in a fixed corner. One pinned card names the only blocking task. The listing editor uses section cards that summarize their content, and calendar edits happen in a side panel with a toast naming the exact change. Empty states are one sentence. Its design language lists motion as communication, and its photography-first approach matches HG's public site. |
| **Superhuman** | Speed is the product, built on a 100ms response target and game-design principles from its founder. Its published command-palette rules (available everywhere, central, forgiving with fuzzy matching and aliases, each command showing its shortcut) are the template for HG's Cmd-K. After an action it opens the next item, split inbox tabs carry plain counts, every quick action shows an undo toast, and reaching Inbox Zero is rewarded with a full-bleed photograph. Caution from its own iPhone gestures: chained swipes can't be discovered, so HG's gestures must duplicate visible controls. |
| **Ramp** | Named by the owner, and its own posts describe specific design moves rather than reputation. The employee home merges tasks and notifications into one focused list, and bulk receipt drops auto-match to transactions. Approvals use an inbox-style review with policy violations and missing items front and center, two verbs (approve or send back), and every item showing its status and who acts next so nothing stalls. AI suggests memos from calendar events, and clearing the list unlocks a small inbox-zero easter egg. Ramp reports expenses done in about 15 seconds through prefill. Its design engineers own Core Web Vitals, focus states and reduced motion, and its design team lists fighting for simplicity as a value. A principles-only north star until screens exist to benchmark. |

### Specialists

| Product | Why |
|---|---|
| **Jobber** | The closest analog to HG's contractor portal. The web home opens with a lifecycle strip (Requests, Quotes, Jobs, Invoices), each with a count, a state word and sub-states such as Requires invoicing. Records put a status chip above the title, a details panel beside it, and the next lifecycle step as the primary button. Internal notes are labeled as visible only to the team. The crew app home shows a greeting, a map of today's visits and swipeable visit cards with a live timer and a Late state. A 2024 update restored workflow colors after users missed them. Reviewers flag slow photo loading. |
| **Zillow Rental Manager and Zillow listings** | A domain twin for the property hub, at consumer polish. The property header shows a photo, the address as title, one status pill and tabs (Overview, Listing, Applications, Leases, Payments, Maintenance), with a Next steps rail. The leads table has a Next step column, lease cards show who has signed as an inline stepper, and Private to you lock labels mark internal content. Public listing pages pair a photo mosaic, large beds, baths and square feet, fact tiles that show a placeholder for a missing value, and a CTA card naming the earliest tour time. |
| **Shopify admin (Polaris)** | The most rigorous documented index-table system: Polaris says to paginate past 50 rows and show row actions only on hover or selection. A hideable KPI strip with sparklines sits above the table, and one popover handles sort, group-by and column visibility. Status badges keep fixed tones in fixed columns. On iOS, rows reflow to two lines (name and amount, then status chips), the page title doubles as the view switcher, the bottom bar splits into search, tabs and a context action, and money-affecting edits wait behind a Review changes pill. |
| **Copilot Money** | A 2024 Apple Design Award finalist built on Swift Charts with local data for speed. Budget vs actual rows show spent, a slim bar and the budget, turning red only when over. Category detail pairs one big figure with 12 monthly bars and a budget line. Recurring items read as an editable sentence with an expected next date, and home cards each answer one question (Next two weeks, To review). Take the structure only: its emoji category icons and gradient header break HG's rules. |
| **Flighty** | The 2023 Apple Design Award winner for Interaction and the best reference for live status and plan vs actual. Scheduled and estimated times sit in aligned columns with the actual in green or red, slipped times are struck through with the new time beneath, each row has one plain status line in a fixed color, and lists split into items for you vs major issues anywhere. This maps directly to CapEx budget vs spent, rehab schedule vs actual and rent paid on time vs late. |
| **Resend** | Extreme restraint: black, white and gray with one strong primary button per screen. Record pages open with an icon tile, a small type eyebrow and the name, then a strip of uppercase labels with values. Delivery shows as a horizontal Sent, Delivered, Opened timeline with plain explanations per step. Onboarding is a vertical stepper whose later steps stay dimmed, and the check-your-email screen is a model payoff over monochrome photography. Row menus end with the destructive item in red. |
| **Wise** | Closes the loop on anything in motion. A vertical status timeline shows done steps with checks and timestamps, the current step in bold and future steps in gray, under an Updates / Details toggle. Copy is plain you/we sentences, costs show before the commit, and setup splits into Steps to complete vs Completed. Its brand is loud while the data layer stays plain, the same split HG wants between the gold public site and the zinc app. |
| **Gusto** | Money-moving confirmations and payoff screens done right. The final button restates the exact amount and action above a one-row summary. The submitted screen pairs single-color line art with a warm heading, a summary, a per-recipient table with estimated arrival dates and two concrete next steps. Its published experience principles (no dead ends, prevent errors, enter data once, do the heavy lifting) give HG a review checklist. |
| **Brex** | A disciplined phone scope: two tabs, Wallet and Tasks with a badge count. Task rows end in their own verb button, filter chips are named after the problem (Missing documentation), a floating add-receipts action stays put, and each change confirms with a toast. Expense records show a vertical status timeline with the future step drawn hollow, and small completeness icons flag what a row is missing. The 2023 mobile redesign focused on contrast, readability and shared components. |
| **Todoist** | The best one-line capture. Quick Add parses dates, recurrence, priority, labels and project as you type, highlights each recognized token in place and mirrors it as a removable chip. The placeholder teaches by example, a single dismissible tip introduces natural language, and the date picker lists named shortcuts with the weekday they resolve to. On phones, quick add docks above the keyboard with a scrolling chip row. |
| **Basecamp** | Plain-spoken writing and client-safe collaboration. Everything starts private to the team and anything an outside party sees is labeled. To-dos carry a When done, notify field and a Notify them about this assignment box checked by default. Buttons say exactly what they do (Save and add another, Never mind), and empty columns say what will happen when the first card arrives. This is the model for contractor portal visibility and for hearing back when a job closes. |
| **Airtable** | Table mechanics done thoroughly. The summary bar sums numbers by default, subtotals per group with a grand total, and narrows to a selected range. Filters read as sentences with condition groups, the active filter button names its field, and the filtered column gets a light tint. It also has a frozen first column with field-type icons and an expanded record with stepping arrows. Counter-lesson: its left-label record redesign drew complaints about lost label and value hierarchy. |
| **Sentry** | Its 2025 navigation and Issue Views made huge filtered lists manageable. Starred views sit in the sidebar with live counts, filters are removable tokens inside the search field with a Save / Save as split button, rows carry trend and age columns, and multi-select popovers have Reset, Cancel and Apply. Borrow the views and filtering, not its tactile raised-button skin, which conflicts with HG's flat inputs. |
| **Dub** | A small open-source Next.js and Tailwind team, the same stack as HG, working at Stripe-level polish. KPI cards double as tabs for one chart with an underline as the only state mark, and a money / count toggle switches the figures. Filters are sentence chips cleared with Esc, and primary buttons show their key. The create modal has a Draft saved indicator and puts rare options in footer chips. Tables end with a Viewing 1 to N of N footer. |
| **Clerk** | A clean console for managing people. Identity cells stack name over email beside an avatar, a Columns menu picks visible fields, and a quiet note says when data last updated. Row menus put neutral actions first, then a divider and red destructive actions. Record subpages have a back link, a title with a count, an Actions dropdown and sub-tabs, and access roles change through an inline select in the row. This is the template for the contractor directory and portal access. |
| **Supabase** | A disciplined light and dark dashboard. The project home is a facts grid (line icon, uppercase label, value) where empty values are plain statements. Settings and usage pages explain on the left and act on the right. Selecting rows swaps the toolbar to bulk actions with the count inside the destructive button, and quick edits open in a side sheet with Save Cmd-Enter. After feedback split on its 2025 navigation change, sidebar behavior became a user preference. |
| **Monzo** | Writing and restraint as policy. Its public writing principles are part of every hire's onboarding. Its design team treats attention as a budget: most screens should be fast and plain, a few moments get delight, and big money moves get deliberate friction. On phones, a record is a stack of action rows, each with a one-line sublabel saying what it will do, which works on touch with no hover. |
| **Thumbtack** | The cleanest outside-facing intake in the home-services domain. It asks one question per screen with percent progress in the header, a lock-icon card above sensitive fields naming who sees them, and Skip in the primary slot for optional steps. Homeowner projects split into To-do, In progress and Finished with a Top priority flag. Its Thumbprint design system is public. This is the model for the resident move-in form and maintenance requests. |
| **Front** | A shared inbox that keeps each person's Open, Later and Done apart from shared state. Its redesign moved waiting items out of Archived so they stay visible, added snooze in the record header, and gives conversations team-only comments with a helper line naming who can see them. For a two-partner company, one partner's triage should never change what the other sees. |
| **Cal.com** | Plain, legible lists in both themes. Status tabs (Upcoming, Unconfirmed, Past, Canceled) sit over date-group headers, row actions are labeled buttons, and filters are Field is Value chips with Save as segment. The public booking page is a quiet three-panel card (context, calendar, time slots) that stacks on phones. It is the model for showings on the public site and the contractor job list. |

### Best references by area

| Area | Products | What to take |
|---|---|---|
| App shell, sidebar, top bar, global search and Home | Mercury, Things 3, Airbnb, Linear, Jobber, Ramp (not on Mobbin) | Home answers what needs me before it shows any chart. Open with a first-name greeting and one line on what happens next (Mercury, Airbnb), then a muted strip of today's fixed events (inspections, move-ins, closings) above today's tasks (Things 3 Today). Follow with queue cards that carry counts and money: Mercury's Outstanding, Overdue, Due soon, or Jobber's lifecycle strip with sub-states. Pin one card for the single blocker (Airbnb's required-to-publish card, Vercel's Action Required). Every item says who acts next, and charts move one level down (Ramp). Add a Today / Upcoming switch instead of more widgets. The sidebar sits a step dimmer than the page, stays short and customizable (Linear), and shows a Tasks count and pinned properties (Mercury Bookmarks). |
| Portfolio list and new property | Airbnb, Shopify, Attio, Copilot, Zillow | Two views of one set. Cards: a real property photo, one status pill in a fixed top-left spot, and a two-line caption (name, then neighborhood or type), from Airbnb's Your listings. Table: a hideable KPI strip above (occupancy, rent billed, collected, open work orders) as in Shopify, then the index table with per-column footers for count, sum and average (Attio), saved views from the title, and status in one fixed column. Group by owning entity with a value per group (Copilot's accounts pane). On phones, rows reflow to two lines with the figure right-aligned (Shopify iOS); do not copy Attio's sideways-scrolling phone grid. |
| Property detail page (future property hub) | Stripe, Attio, Zillow, Linear, Resend, Airbnb | One record anatomy for the hub. Header: photo or icon tile, address as title, one status pill, the key figure, two primary actions and an overflow (Stripe, Zillow). Under it, a strip of four facts as small labels with values (Resend), then tabs with counts (Overview, Units, CapEx, Loans, Insurance, Documents) as in Attio and Zillow. The main column holds what changes: one timeline that merges system events with notes, @mentions and Esc / Cmd-Enter hints (Stripe). A right rail holds static facts, provenance (synced from QuickBooks vs entered by hand) and empty fields as verbs such as Add lender (Linear). A Next steps rail lists the two or three things to do on this property (Zillow). 2 / 5 arrows step through the filtered list (Linear), and the listing editor uses section cards that summarize their content (Airbnb). |
| Deals pipeline, new deal and deal detail | Attio, Linear, Sentry, Stripe, Shopify, Airtable | 675 deals stay calm through views, not a longer table. Saved views (Active, Under contract, Passed) switch from the page title and appear in the sidebar with live counts (Attio, Sentry). Stage count tiles above the list double as filters (Stripe). The board uses stage dots, counts and a per-stage footer sum of asking price or projected profit, with Lost and Paused hidden in View settings (Attio). Cards keep value, key date, owner, last activity and time in stage in fixed spots. The list groups by stage with counts and a + per group, and selection raises a floating N selected bar for bulk stage moves (Linear). Filters are removable sentence chips that save as views (Airtable, Sentry), and a days-in-stage column surfaces stale deals without opening them. On phones, the title doubles as the view switcher (Shopify). |
| Tasks list, new task and task detail | Things 3, Linear, Todoist, Jobber, Basecamp, Brex | Two dates for two jobs: When (the planned day) and Deadline (a flag that reads 4d left and turns red on the day), from Things 3. The property and unit sit as a gray sublabel under each title. Capture is one line that parses date, assignee and property, highlighting tokens and mirroring them as chips (Todoist). Lists group by status with counts and a floating bulk bar, and detail is a properties rail plus an activity log (Linear). Rows end in their own verb, such as Add photos or Mark complete (Brex). Contractor jobs show status, the address with Directions, and one primary button named for the next step, with notes and camera side by side (Jobber). Anything a contractor sees is labeled, and each task has a When done, notify field (Basecamp). Approvals follow Ramp's inbox-style review: problems first, then Approve or Send back with a note. |
| Financials, rent roll and financial settings | Mercury, Stripe, Copilot, Dub, Airtable, Ramp (not on Mobbin) | The P&L mirror follows Mercury Books: months as columns, a sticky Total column, collapsible account groups with subtotal rows, month chips and a small revenue, expense and net chart above. Every money list opens with a summary strip (Net change, Money in, Money out) that respects filters. Cards show the comparison to the previous period and an Updated time stamp, because sync time is the trust signal for a QuickBooks mirror (Stripe). Budget vs actual rows show actual, a slim bar and budget, turning red only when over (Copilot). KPI cards (Income, Expenses, NOI) double as tabs for one chart, with an underline as the only state mark (Dub). The rent roll gets per-group subtotals and selection sums (Airtable). Expected rent reads as a sentence with an expected date so late rent shows against it (Copilot). Categories prefill from vendor history and suggested matches confirm with one tap (Ramp). |
| Contractors directory, contractor detail and Settings | Clerk, Supabase, Basecamp, Gusto, Jobber | The contractor directory is a people table: initials avatar, name over phone or email, trade and status in fixed columns, a Columns menu and a quiet freshness note (Clerk). Row menus list neutral actions first and the red destructive group last, and portal access changes through an inline role select (Clerk). Contractor records get a back link, a title with a count and sub-tabs (Overview, Jobs, Payments, Documents for COI and W-9). Visibility is explicit wherever partners and contractors meet: private by default and labeled when shared (Basecamp), with internal notes marked team-only (Jobber). Settings use two columns, what it is and why on the left and controls on the right (Supabase). Contractor payments confirm with the exact figure and end on a payoff with arrival dates (Gusto). |
| Login and the public site | Zillow, Airbnb, Thumbtack, Cal.com, Resend, Typeform | Rental pages follow Zillow: one large photo plus four smaller ones with See all N photos, rent beside large beds, baths and square feet in Geist Mono, fact tiles that show a placeholder for missing values instead of hiding them, and a sticky CTA card (a bottom bar on phones) naming the earliest showing slot. Showings use Cal.com's three-panel booking card that stacks to one column. The move-in form asks one question per screen with percent progress, a lock card saying who sees sensitive fields, and Skip for optional steps (Thumbtack, Typeform), while short internal forms stay on one page. Long setup gets Save & exit and pinned Back and Next (Airbnb). Login and sent screens follow Resend: one property photo or line icon, one line naming the address used, one next-step button. The gold brand lives on the public site and plain data in the app (the Wise split). |
| Lens: visual design system across every screen | Vercel, Linear, Stripe, Mercury, Things 3, Airbnb | Give every zinc step one job, Geist style: 100 to 300 for fills (default, hover, active), 400 to 600 for borders, 900 for secondary text, 1000 for primary text, and delete ad-hoc grays. Split type into Label (one line: menus, cells, buttons) and Copy (paragraphs), with money in tabular Geist Mono. Elevation follows function: Surface for on-page cards, Floating for menus and dialogs (Geist materials). Generate light and dark from a few inputs in a perceptual color space (Linear's LCH), and build status tones with contrast rules in the scale (Stripe). Keep surfaces about 95% neutral (Things 3). Then add a signature so restraint does not look generic: Mercury has its own typeface and photography; HG has the gold accent and real property photos, used the way Airbnb leads with photography. |
| Lens: information architecture and global SaaS patterns | Linear, Superhuman, Mercury, Front, Shopify, Vercel | One Cmd-K palette holds every command and record, scoped by type (All, Properties, Deals, Tasks, Contractors, Documents), with key hints in the footer and a useful no-results fallback (Mercury). It opens on Recent and Favorites, forgives aliases and shows each command's shortcut (Superhuman), and every new button gets its palette command at design time. The inbox splits into tabs with counts and keeps personal Open, Later and Done apart from the shared record, so one partner's triage never hides work from the other (Front). Snooze and remind-me live in every item's menu (Linear). Navigation stays at about five destinations; overflow goes to a title switcher (Shopify) or an expandable bar (Linear Mobile), never a junk-drawer More. Search can also sit in the sidebar as a Find field with a shortcut (Vercel). |
| Lens: phone and tablet experience on every route | Linear Mobile, Mercury, Stripe Dashboard, Shopify, Jobber, Brex | Phones get a chosen subset: Home, Tasks, property lookup, capture (photos, receipts) and approvals, while configuration and bulk edits stay on desktop (Stripe Dashboard, Brex's two tabs). Navigation is a floating bar of four tabs plus a separate search button that expands to the full list (Linear Mobile, Shopify). One create button sits in the same thumb spot everywhere and creates in context (Things 3, Jobber). Create and filter run in sheets with chips docked above the keyboard and the primary button pinned (Linear Mobile, Mercury). Rows reflow to two lines with status chips in a fixed spot (Shopify). Records show a vertical status timeline (Brex). Swipes are shortcuts for visible controls, never the only way. Queue names and chips match desktop (Mercury). |
| Lens: interaction quality, feedback, states, speed and accessibility | Linear, Superhuman, Vercel, Things 3, Airbnb, Mercury | Adopt Vercel's timing rules: optimistic updates for likely-success writes (complete task, move stage) with rollback, spinners shown only after 150 to 300ms and held 300 to 500ms, skeletons that match the final layout, and button labels kept while loading. Reversible actions get a toast with Undo instead of a confirm dialog (Linear Mobile, Superhuman); confirm only when money or deletion is at stake, and restate it (Gusto). After acting on an item, open the next one (Superhuman). Quick edits happen in place: a row lifts into a card while the list dims (Things 3), or a side panel edits grid data and a toast names the exact change (Airbnb). Frequent actions such as the command menu get no animation (Rauno Freiberg). Springs mark change, with reduced-motion variants. Treat about 100ms as the budget for list navigation. |
| Lens: tables, numbers, money, charts and status | Stripe, Mercury, Attio, Airtable, Shopify, Flighty | Money: right-aligned tabular figures, smaller cents, muted currency, a sign plus green only for money in, struck-through amounts for failed items, a lone dash for empty values, and 0 or 2 decimals per context without mixing (Mercury, Stripe, Vercel). Status: one fixed tone per state as a dot or badge plus one word, in the same column on every row (Vercel, Shopify). Lists: summary strip or count tiles on top, footer calculations below (Attio, Airtable), filters as removable sentence chips. Plan vs actual: aligned columns with the actual in green or red, and slipped dates struck through with the new date beneath (Flighty). Charts: current period over a gray prior period with a delta, range pills, and scrub-to-read values instead of axis clutter (Stripe Dashboard). Polaris rules: paginate past 50 rows, row actions on hover or selection. |
| Lens: words on every screen | Monzo, Basecamp, Wise, Gusto, Stripe, Brex | Write a one-page HG writing guide with real examples, as Monzo does for every hire. Buttons name the action and its object (Save card, Save and add another, Never mind) per Basecamp, and confirm buttons restate the stakes with the exact amount and property (Gusto). Status copy uses you/we sentences that say where something is (Wise). Use dates instead of urgency, such as respond by a named date (Stripe). Toggles and action rows explain their effect in a one-line sublabel instead of a tooltip, which works on touch (Monzo). Empty states say what happens next (Brex, Basecamp). Follow Vercel's rules: specific labels, numerals for counts, an ellipsis on items that open a further step. |
| Lens: the core jobs, end to end | Mercury, Gusto, Wise, Airbnb, Jobber, Resend | Map each end-to-end job (log a maintenance request, run a move-in, close a deal, pay a contractor) against these flows. Start from a hub with action pills and named queues (Mercury's Move money). Multi-step work runs in sheets or a stepper where future steps stay dimmed until the current one is done (Resend, Airbnb's Save & exit wizard). The commit restates the exact stakes (Gusto). The sent screen says what happened, when to expect the result, shows the new record with its status, and offers Done or make another (Mercury, Gusto). Afterwards the record keeps a timeline people can check (Wise). Lifecycle conversions are the record's primary button, so Jobber's Convert to Job becomes HG's convert deal to property, and data entered once flows forward (Gusto principles). Ramp's 15-second expense is the time budget for the most common phone job. |

## North star

HG should read as Linear's structure with Mercury's restraint, signed with HG's own gold monogram and real property photos. Today it reads as pages built one at a time. Home is a gray canvas of shadowed cards with monospaced counts and a 5-year CapEx matrix where "what needs me" belongs. The property page opens on a clipped address over stacked uppercase labels. On the branch, Today rows each carry a bordered date button, including 30 gray "Due date" placeholders. The order of work is: fix the numbers, then fix the primitives, then rebuild the pages on twelve patterns.

## Principles

1. **Answer first.** Every screen opens with its answer: Home with what needs you, a list with its totals, a record with its key figure and next step. Ramp puts the review queue ahead of charts ([Ramp](https://ramp.com/blog/simpler-more-efficient-expenses)), and Mercury opens every list on Net change, Money in and Money out ([Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79)).
2. **Only show numbers you can defend.** Each figure gets one computation, one formatter, a stated period and a source, and a gap reads as a sentence instead of a confident $0. Stripe shows the starting and new balance before you commit an adjustment ([Stripe](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8)). The trust-the-numbers findings ship before any redesign.
3. **Color is state.** Surfaces stay about 95% neutral. Red means late or failed, amber means a partner has to decide, green means done or money in, and blue means act. Things 3 keeps red for the deadline flag alone ([Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58)).
4. **Chrome recedes.** The sidebar sits one step dimmer than the work, its labels stay visible, and nothing flies open on hover. Linear dimmed its sidebar so the content leads ([Linear](https://linear.app/now/behind-the-latest-design-refresh)).
5. **Act now, undo after.** Writes apply at once and roll back if they fail. Each one ends in a toast that names the change and offers Undo. Confirms are kept for money and permanent deletes. Superhuman's "Marked as Done. UNDO" is the model ([Superhuman](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5)).
6. **One anatomy, learned once.** Properties, deals, tasks and contractors share one header, one rail, one timeline and one row. Stripe's customer page is the template ([Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786)).
7. **The phone is a chosen subset.** It covers five jobs with two-line rows, sheets with pinned buttons and nothing behind hover, as Shopify's iOS orders list does ([Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a)).

## Information architecture

This builds on D10 (properties in the sidebar, the seven-tab property hub, merged Settings, Contractors, a labeled phone bar) and on the branch's Today, task page and portal. It makes one merge that needs Connor's yes. D10 makes Home "what needs me" and the migration spec adds a Today view, so there would be two pages answering the same question with the same rows. **Home hosts Today**: a short Needs-you strip above the approved Mine | Contractors columns. Tasks keeps All. Airbnb made Today the host's home for the same reason ([Airbnb](https://mobbin.com/screens/3a9a1f0c-c768-45b8-b3e0-f4d0d02698ad)).

The desktop top bar goes. Find and New move to the top of the sidebar, as in Vercel's sidebar Find field ([Vercel](https://mobbin.com/screens/7bf7d3d2-b022-477c-9290-f5b665fc26be)), and each page header carries its own actions.

```
DESKTOP AND LAPTOP (1024 and up)
Sidebar 240px, labeled, on --canvas          Route               Opens on
[ hides it, nothing expands on hover
---------------------------------------      ------------------  ------------------------------------------
[HG] HG Capital
Find                          ⌘K             overlay             Recent records, scope chips, commands
New                           C              overlay sheet       Task first, prefilled from the current page
Home                                         /                   Needs you strip, Mine | Contractors,
                                                                 Done today (collapsed), Today | Upcoming
Tasks                         12             /tasks              All: Overdue, This week, Later, No date
                                             /tasks/[id]         task page with side rail (branch)
Properties                    +              /properties         figures strip, table, Next 90 days, CapEx plan
  118 Congress St                            /properties/[id]    Overview  Tasks  Units  Documents
  647 Prospect Ave                                               Financials  CapEx  Activity
  ...all 11, short address only              unit sheet          tenancy, turnover strip, listing
Deals                                        /deals              Board (live stages) | List (all, by stage)
                                             /deals/[id]         record page; side panel from the list
Financials                                   /financials         Overview  Statement  Rent
Contractors                                  /contractors        people table with portal status
                                             /contractors/[id]   open jobs; rail with Portal access
---------------------------------------
[CS] Connor   menu: Settings, Appearance,    /settings           Account · Portfolio · Connections · Activity
              Hide amounts, Shortcuts,
              Sign out

PHONE AND TABLET PORTRAIT (under 1024)
Top bar: title, Search, New        Bottom bar: Home  Tasks  Properties  Deals  More
More holds exactly Financials, Contractors, Settings

CONTRACTOR PORTAL "HG Jobs" (app tokens, phone first)
/login  >  /p/welcome/password (one field)  >  /p My jobs  >  /p/jobs/[id] one scroll + bottom bar

PUBLIC SITE (near-black and gold)
/welcome   /rentals   /rentals/[street] (new)   /residents: Emergency, Maintenance, Move-in report, Moving out   /login
```

- **Moves.** QuickBooks settings go from /financials/settings to Settings, Connections (D10). The 5-year CapEx forecast leaves Home for the Properties index and the CapEx tab. The theme toggle and Sign out go into the account menu. The playbook library goes to Settings, Portfolio, next to Repeating tasks, and runs from the property's New task menu and each unit row. Contractor access lives on the contractor record.
- **Merges.** Units & access and Rentals become one Units tab with a unit sheet, and a listing becomes the vacant unit's state. Building CapEx, the forecast and unit equipment become the CapEx tab. The Notes blob, the deal history and the change logs become one Activity timeline per record. Deal status splits into Stage and Priority. The rent roll becomes Rent, expected against collected.
- **Goes.** The Home count cards and CapEx matrix, the hover rail, the "HG Capital OS" wordmark and tab titles (each tab is titled after its page or record), /settings/storage, the create pages (they become sheets and keep their URLs), column resizing, the Deals status multiselect and card-level Edit modes.
- **Left out on purpose.** A notification bell, because Home is the inbox. A global audit log, because each record has Activity and Settings has Activity. Favorites, because the 11 properties are already in the sidebar. User-made saved views: fixed view segments plus remembered filters are enough for two partners.

## Visual system

**Type.** All type is Geist, with tabular figures for every number.

| Role | Desktop | Touch | Weight | Used for |
|---|---|---|---|---|
| Title | 24/32 | 28/34, collapsing to 17/22 in the top bar | 600, -0.01em | One h1 per page; record titles wrap, never clip |
| Section | 16/24 | 17/24 | 600 | Section heading over a hairline |
| Body | 14/20 | 16/22 | 400 | Row titles, cells, inputs, paragraphs (65ch max) |
| Label | 14/20 | 16/22 | 500 | Buttons, nav, tabs, segments; same weight selected or not |
| Meta | 13/18 | 14/20 | 400 | Sublabels, sentence-case table headers, timestamps |
| Micro | 12/16 | 12/16 | 500 | Badges and keycaps only; nothing smaller anywhere |
| Figure L | 28/36 | 28/36 | 600 | A record's key figure, KPI strips |
| Figure M | 20/28 | 20/28 | 600 | Summary strip figures |

**Neutrals.** Tailwind zinc, one job per step.

| Job | Token | Light | Dark |
|---|---|---|---|
| Chrome (sidebar, phone bars) | `--canvas` | #fafafa | #09090b |
| Work surface, cards | `--surface` | #ffffff | #111113 |
| Menus, dialogs, toasts | `--raised` | #ffffff | #18181b |
| Hover fill | `--fill-1` | #f4f4f5 | #1c1c1f |
| Selected fill (current nav item, segment track) | `--fill-2` | #e4e4e7 | #27272a |
| Hairlines, row dividers | `--border` | #e4e4e7 | #27272a |
| Control strokes, check rings | `--border-strong` | #d4d4d8 | #3f3f46 |
| Meta, placeholders, idle icons | `--text-3` | #71717a (4.8:1) | #8b8b94 (5.6:1) |
| Labels, secondary values | `--text-2` | #52525b (7.7:1) | #a1a1aa (7.4:1) |
| Primary text | `--text-1` | #18181b (17.7:1) | #f4f4f5 (17.2:1) |

**Accent and status.** Every color has one job.

| Job | Light | Dark | Where |
|---|---|---|---|
| Act | fill #1d4ed8 (white text 6.7:1), hover #1e40af | fill #2563eb (white text 5.2:1), links and focus #60a5fa | Primary button, link, focus ring, checked control, unread dot |
| Late, failed, destructive | #b91c1c on #fef2f2 | #f87171 on red-950/40 | Overdue date, failed upload, Delete |
| Needs a decision | #b45309 on #fffbeb | #fbbf24 on amber-950/40 | Review, stale sync, missing key fact |
| Done, paid, money in | #15803d on #f0fdf4 | #4ade80 on green-950/40 | Done, Paid, inflows |
| Everything else | `--text-2` on `--fill-1` | same tokens | Neutral chips, stages, tags |

The purple badge and the blue status badge are retired, so blue only ever means act. The current page in the sidebar and the selected tab get a neutral fill, not blue. Gold (#c8a765) appears in the app in exactly two places: the HG monogram (sidebar, favicon, portal header, emails) and the single accent fill in payoff line art. The public site keeps its palette as real tokens: `--pub-bg` #08090b, `--pub-text` #e8eaee (16.5:1), `--pub-muted` #767d8a (4.8:1, the floor for any public text) and `--pub-gold` #c8a765 (8.7:1). Both themes come from these steps rather than hand-picked hex, and `color-scheme` is set so native menus follow the theme.

**Shape and space.**
- **Radius.** These are today's values, now named as tokens: 6px for badges, chips, keycaps and checkboxes; 8px for buttons, inputs, menus, popovers and toasts; 12px for cards, dialogs, sheets and photo tiles; fully round for avatars and status dots.
- **Spacing.** On a 4px base: 4, 8, 12, 16, 24, 32, 48, 64. Page gutters are 32 on desktop, 24 on tablet and 16 on phone. Sections sit 32 apart (24 on touch). Rows are 40px on desktop and 48px on touch across the whole app. Controls are 32 to 36px with a mouse and at least 44px on touch, as the branch's `TOUCH_HEIGHT` already sets. Lists use the full width, and record pages cap at 1200px with a 320px rail. Content anchors to the sidebar rather than centering at 1920.
- **Elevation.** Page sections are flat: a 16px heading over a hairline, with no card. Cards survive only as Home and Overview modules (border plus `shadow-sm`). Floating layers (menus, popovers, toasts, the palette) use `--raised`, a border and `0 8px 24px -4px rgb(9 9 11 / .12)`. Overlays (dialogs, sheets, drawers) use `0 24px 64px -12px rgb(9 9 11 / .25)` over a scrim of `rgb(9 9 11 / .4)`, or `rgb(0 0 0 / .6)` in dark mode.
- **Motion.** The branch's tokens stay: fade 150ms, pop 160ms, sheet 260ms on `cubic-bezier(0.32, 0.72, 0, 1)`, toast 220ms. Spinners appear only after 200ms and stay at least 400ms. Skeletons match the finished layout, with labels drawn at once and only values shimmering. ⌘K and menus open without animation. Reduced motion falls back to opacity only.

**Money, figures and dates.**
- Every figure is set in Geist Sans with `tabular-nums`. Geist Mono is kept for codes people read character by character: lockbox, account, policy, loan and unit numbers, and keycaps. Money and count columns are right-aligned, with headers aligned to their columns.
- Totals, KPIs and lists show whole dollars. A single transaction line shows cents in `--text-3`, as Mercury does ([Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79)). One price format holds in every context ($425,000); "$425k" appears only on chart axes.
- Money out and losses take a true minus (U+2212) in neutral ink. Money in is green with no sign, on transaction lines only. A failed amount is struck through. Red is kept for late, short or failed.
- An empty cell is a lone dash. An empty field in a rail reads as a verb (Add lender). A missing feed reads as a sentence ("No QuickBooks lines yet"), never $0.
- Each figure block states its period and source: "Jan to Sep 2026 · QuickBooks, updated 6h ago".
- Dates come from one formatter on Eastern time: Today, Tomorrow, a weekday within six days ("Fri"), then "Oct 30", with the year only when it isn't this year. An overdue item shows its real date in red ("Aug 28"), never "yesterday". Deadlines read "4d left". Months read "May" or "May 2025".
- Addresses come from one short form ("767 Prospect Ave"), with the full mailing address only in address blocks.

**Icons and imagery.** Icons are lucide-react, which is already installed: 16px at 1.5 stroke on desktop and 20px at 1.75 on touch, in `--text-3` and `--text-1` when active. No emoji and no typed glyphs (+, ↗, ✕, ‹ ›) stand in for icons. The status rings below are the one drawn family. Each property's identity is its photo: 48px in its header, 32px in Portfolio rows and search, and a line-icon tile on `--fill-1` until it has a photo. Payoff art is zinc line drawings of Buffalo houses with one gold fill.

## Signature patterns

1. **Page header.** A breadcrumb (on records only; a real link that keeps the list's filters), the h1, one muted meta line, then actions on the right: one primary, any secondaries and a ⋯ menu. TopTabs with counts sit under it. The geometry is the same on every page, so side-by-side headers line up. Reference: [Stripe customer header](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786). Reuse: `PageHeader`, `BackLink`, `TopTabs`.
2. **List page.** Header, then a summary strip (three or four figures, or count tiles that filter, recomputed for the current filter). Then one control row that never wraps: view segments with counts, search, Filters and Display. Then rows, and a footer that counts and sums. The page scrolls instead of a 70vh box, and long lists end in "Viewing 1 to 100 of 675 · Show more". References: [Stripe count tiles and dashed chips](https://mobbin.com/screens/140880ca-003b-4498-8932-c09c223ed9de), [Mercury summary strip](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79), [Attio count footer](https://mobbin.com/screens/028c38c9-6dc8-4507-8e0e-d175085895a9). Reuse: `Table` without `maxHeight`, and the branch `SegmentedControl`.
3. **Row.** Each record type has one row, used everywhere it appears. On desktop, left to right: status glyph, title, a gray sublabel (property or unit), fixed columns, the figure right-aligned and the date at the far edge. The whole row is the link. Row actions show on hover or selection, with a ⋯ reachable by keyboard and touch. Selecting rows raises a floating bar ("3 selected · Reschedule · Assign"), as Mercury does ([Mercury](https://mobbin.com/screens/abf7e9b2-0f1f-42f0-83a5-1801dcf0147e)). Reference for sublabels: [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58).
4. **Record page.**
   - Identity header: photo or tile, an h1 that wraps, one status mark, a muted subline, the next lifecycle step as the primary button, a ⋯ menu and a "3 of 11" stepper.
   - Under the header: a strip of four facts, then tabs with counts.
   - The main column holds what changes: Next steps, Coming up, lists, then Activity.
   - A 320px rail holds the static facts as label-left rows, with empty fields as verbs and codes that copy with one tap.
   - Each fact edits in place. There are no card-wide Edit modes.

   References: [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786), [Zillow's photo, pill, tabs and Next steps](https://mobbin.com/screens/5cd12c32-2216-45f0-bf87-6ccd06b0476e), [Linear's "Add lead" rail](https://mobbin.com/screens/f63a07dd-3c9b-4e11-bdc1-5d2e92cda790), [Jobber's Convert to Quote](https://mobbin.com/screens/31d2f003-1b0b-41b4-9e38-a51b2c78353a). Reuse: `SectionCard` becomes a view-only Section; `InlineAddressField` generalizes into `InlineField`.
5. **Activity timeline.** One per record. Each event is a line icon, one sentence about a person ("Pieter moved this to Offer") and a muted date. A burst of system edits collapses to "Connor changed 4 fields · Show", and notes carry more weight than events. The composer takes @mentions and prints Esc and ⌘↵. Imported Asana history sits behind one divider. References: [Stripe Recent activity with Add note](https://mobbin.com/screens/fb0b91ce-234b-44d5-9f8b-18864cc63941), [Mercury drawer timeline](https://mobbin.com/screens/a8faa54a-ce13-4a31-b93e-e047ca62dae3). Reuse: the branch `activity-timeline.tsx`.
6. **Filters and views.** Each list has fixed view segments with counts (Deals: Active, Under contract, Snoozed, Passed, All). Any other filter is a removable sentence chip ("Asking under $300k", "Town is Tonawanda") added from a dashed "+ Filter". The list remembers each partner's last filters, and the sidebar link returns to them. A filtered-empty list says "4 tasks hidden by filters · Clear filters". References: [Stripe filter popover](https://mobbin.com/screens/5aba8f78-028a-4ad6-81f1-6ca698a41451), [Linear Mobile](https://mobbin.com/screens/52093bab-28c9-4aa7-805a-3fb4b3daffdc).
7. **Side panel and sheet.** On desktop, a 480px right panel opens a record from its list, steps with ↑ and ↓, and opens the next item after a decision. On phone, a bottom sheet has a title, its content and the primary button pinned above the safe area. Both are built on React Aria, and Esc closes one layer. References: [Mercury drawer](https://mobbin.com/screens/a8faa54a-ce13-4a31-b93e-e047ca62dae3), [Linear Mobile sheet](https://mobbin.com/screens/be8b3b59-8285-4c7e-835c-b561f683c565). Reuse: the branch `sheet.tsx` and `popover.tsx`.
8. **Dialog.** Used for create forms and consequential confirms. The title names the object and the body is one sentence of consequence. Cancel and the primary sit bottom right with their keys ("Cancel Esc", "Create task ⌘↵"). Create dialogs get a Create more switch, money edits show before and after, and destructive buttons name what goes. References: [Attio](https://mobbin.com/screens/a578c81d-a58c-4c06-ae14-81b6e8ec8bbe), [Vercel's Remove Connection](https://mobbin.com/screens/7bf7d3d2-b022-477c-9290-f5b665fc26be), [Stripe's before and after](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8). Reuse: grow `ConfirmDialog` into `Dialog`.
9. **Toast with Undo.** A dark pill, bottom-left on desktop and full width above the bar on phone. One line names the change and its ripple: "Moved to Fri, Oct 30 · Zack gets an email", or "Done · Next one Nov 23". Undo stays 5 seconds and pauses on hover or focus. Emails and the next repeat wait until the toast closes, and a failure names what rolled back. References: [Superhuman](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5), [Mercury](https://mobbin.com/screens/abf7e9b2-0f1f-42f0-83a5-1801dcf0147e). Reuse: the branch `toast.tsx`.
10. **Status mark.** One shape family: a ring that fills as work advances.
    - Tasks: To do is an empty ring, Scheduled a ring with a clock, In progress a half ring, Waiting a pause, Review a three-quarter ring in amber, Done a green check, Canceled a slash.
    - Deal stages and the property lifecycle reuse the same ring.
    - Tinted badges are kept for states that need attention or are done.
    - Positions are fixed: the glyph slot on rows, above the title on phone records. A blue dot in the top-right corner means new and nothing else.

    References: [Linear Mobile](https://mobbin.com/screens/0b396f0b-077e-41e9-896b-704c4fab59ee), [Jobber](https://mobbin.com/screens/31d2f003-1b0b-41b4-9e38-a51b2c78353a). Reuse: `Badge` and the branch `status-badge.tsx`.
11. **Empty and payoff states.** An empty section gets one sentence saying what happens next and one action, with no dashed box. A payoff (sent, done, all clear, approved) gets an HG property photo or gold-accent line art, a warm heading, what happens next with a date, the next item and "Create another". References: [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c), [Airbnb Today](https://mobbin.com/screens/3a9a1f0c-c768-45b8-b3e0-f4d0d02698ad).
12. **Command palette.** ⌘K opens on Recent records and Go to. Scope chips (All, Properties, Deals, Tasks, Contractors, Documents) narrow it, and grouped results carry a context line (property, status, figure) and end in "See all 14 tasks". Results are links, so ⌘-click opens a tab, and commands print their keys. Search forgives St for Street and word order. With no match it offers "Add 12 Elmwood Ter as a deal". References: [Mercury palette](https://mobbin.com/screens/7208bab8-186f-4b88-a668-31afbddc1ef2), [Mercury no-results fallback](https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445), [Mercury shortcut sheet](https://mobbin.com/screens/2f9852a0-c8d6-48b3-95c5-43c044bac813).

## Phone and tablet

**The jobs.** The phone covers five: see what needs me, work Today, look up a property while standing in it, capture photos and punch-list items, and approve contractor work. Configuration (QuickBooks mapping, CapEx rules, the move-in form editor) stays readable on a phone but is changed on a computer, which the page says in one line.

**Shell.** A large title collapses into the top bar, which also holds Search and New. Under it sits the approved labeled bottom bar: Home, Tasks, Properties, Deals, More. Airbnb pins its one blocker card directly above the bar ([Airbnb](https://mobbin.com/screens/8249f9ca-1fdc-4f97-870f-974d6811a36c)), and HG does the same for a stale sync. Search opens full screen with scope counts ([Shopify](https://mobbin.com/screens/83a79099-6b71-454f-817e-a701eb23811e)). There is no hamburger, every target is 44px, and toasts sit above the bar.

**Lists.** Rows reflow to two lines. Line one is the title with the figure right-aligned; line two is the property, the date and a status word ([Shopify](https://mobbin.com/screens/ae89a0e6-84c6-4c57-820c-86066c76949a)). The page scrolls. Filters open in one sheet that ends in "Show 12 results" and leaves chips behind. On Home, Mine | Contractors becomes a segmented switch with counts ("Mine 25 late"). Task rows start with a check circle, so a walk-through costs one tap per item.

**Records and capture.**
- **Records.** The status mark sits above a title that wraps, the next step is the one full-width button, and the rarer actions live in a ⋯ sheet with the destructive one last ([Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42)). Tabs become a scrolling row.
- **Properties.** A property opens on Access (Directions and a copyable lockbox code), then Next steps, open tasks and Add photos.
- **Editing.** Tapping a fact opens a sheet with Save pinned.
- **Capture.** Create opens as a sheet with chips docked above the keyboard and stays open for the next punch-list item ([Linear Mobile](https://mobbin.com/screens/be8b3b59-8285-4c7e-835c-b561f683c565)). Photos start with the camera.

**Tablet.** At 768 in portrait, tablets get the phone patterns with a 24px gutter: bottom bar, two-line rows and sheets. From 1024 in landscape they get the labeled sidebar, and Tasks and Deals split into list and detail side by side.

**What stays on the desk.** The CapEx matrix, the Statement grid, QuickBooks mapping, bulk selection, the deals board and column footers stay on desktop. On phone, the summary strip carries the totals.

**Contractor portal (HG Jobs).** The portal uses the app tokens, with the HG monogram, "HG Jobs" and an avatar menu in the header. It is built on the approved one-scroll job page with its bottom bar.
- **My jobs.** It opens with an answer: "Hi Zack. 2 open jobs. Next: Cabinet install, Mon". A sent-back job pins above the list with Connor's reason.
- **Job cards.** A 16px title, the street and unit, one status word in a fixed corner (neutral while the job waits on HG, never red) and the new dot top right.
- **Job page, top to bottom:**
  - a state card whenever the next move isn't Zack's ("Sent for review Tue 3:40 PM. You'll get an email when it's approved")
  - the address with a full-width Directions button
  - the lockbox code in 28px Geist Mono with Copy
  - round checklist checks, then photos with a camera tile
  - updates with a "New" divider
  - a composer that says "Connor and Pieter get this by email"
- **Bottom bar.** One next-step button per status: Pick a day, Start job or Mark done.
- **Mark done.** The sheet summarizes photos, checklist and note, and blocks finishing while uploads have failed. The payoff shows the property photo, what happens next and Next job. A dead zone shows "Didn't send. Retry" and keeps the draft.
- **On a computer.** The portal centers a 640px column with the bar contained in it.

## Calls for Connor

Each of these overrides a settled decision or house rule, so none ships without a yes.

1. **Home hosts Today.** This merges two settled decisions (D10's Home and the Tasks Today view) into one screen. It does not drop either one.
2. **Figures in Geist Sans with tabular numbers, Geist Mono for codes.** This changes the house rule of Geist Mono for figures. Monospaced KPI counts read as code on today's Home, and Stripe, Mercury and Vercel's own Geist guidance all set money in sans with tabular figures.
3. **Dark primary fill is blue-600 (#2563eb), not blue-500.** This changes the house rule, because white on blue-500 is 3.68:1 and fails contrast. Blue-400 carries dark-mode links and focus.
4. **Task status tones reworked.** This changes the approved §7 tone map. Status becomes shape first, with color only on Review (amber) and Done (green), so red belongs to overdue alone and blue to act alone. Review drops red, Scheduled drops blue and In progress drops purple.
5. **My jobs as one date-grouped list.** This would change the settled portal decision (By date | By property). With 2 to 8 open jobs per contractor, the street under each title already answers "by property". Recommendation: keep the approved switch for the Oct 29 invites and revisit it after two weeks of real use (the roadmap asks the same).


## Roadmap

> Since this roadmap was written, the migration branch landed more of its Fix now items (dd00a9e, 4cf099d, 0148abf, 9f74ea1 and c805e38, each verified against the code). Resolved ids no longer link here. See "Already resolved on the migration branch" in Method, and each remaining finding's Migration branch line for what is left.

1,813 raw findings (1,092 after merging duplicates) reduce to fourteen themes and a few root causes: no shared formatter, no shared save helper, three record layouts, and a frame that competes with the work. So the order is right numbers and safe saves, then the cutover, then the primitives, then D10 on top of them.

### Fix now

Routing rule: anything on tasks, contractors, the portal, login or job emails goes on the migration branch, because the branch rebuilt those screens. Property, deals, Financials, Settings and the public site go on main. Shared helpers land on the branch first and main adopts them after the merge, so only one branch lands at a time. Ids in parentheses are duplicates closed by the same change.

**Migration branch, before the Oct 29 invites**
- DATA-IV01 ([ADMIN-017](data.md#data-iv01), [IA-043](data.md#data-iv01)): the branch now matches jobs on the contractor record; backfill legacy Asana assignee names so each contractor gets their history back.
- G2B-IV01: staff replies to one contractor never reach the next contractor on the job.
- [G2B-I03](g2b.md#g2b-i03): say who will see a reply, including when the contractor has no login.
- BPORTAL-002, [BPORTAL-004](bportal.md#bportal-004), [BPORTAL-003](bportal.md#bportal-003): Mark done can't skip failed photos; uploads survive leaving the page; held photos post and email.
- [G1A-008](g1a.md#g1a-008): fill the 14 missing contractor emails.
- [BTASKS-001](btasks.md#btasks-001): link legacy Asana assignee names so their jobs leave Unassigned.
- [TASKS-006](tasks.md#tasks-006), [G2B-013](g2b.md#g2b-013): picking a partner never erases a contractor; reassigning checks the current assignee.
- [G2C-001](g2c.md#g2c-001): stable unit ids before the Unit field ships Oct 28.
- [BPLAY-002](bplay.md#bplay-002) (JOURNEYS-IV01, [G1C-005](bplay.md#bplay-002)): due offsets so playbook anchor dates schedule the steps.
- [BTASKS-002](bplay.md#bplay-003) ([BPLAY-003](bplay.md#bplay-003), [G1C-008](bplay.md#bplay-003)), [BPLAY-020](bplay.md#bplay-020), [BPLAY-021](bplay.md#bplay-021), BPLAY-022: repeats keep their day, never spawn overdue, and need a due date.
- [G1C-003](bplay.md#bplay-010), BPLAY-009, [BPLAY-010](bplay.md#bplay-010), [G1C-047](g1c.md#g1c-047): one field per placeholder, filled in titles and notes, no brackets left.
- G1A-I03, [BCONTRACT-007](bcontract.md#bcontract-007), BCONTRACT-008, BCONTRACT-V03: emails say approved or scheduled and name the unit.
- [BCONTRACT-004](bcontract.md#bcontract-004), [BCONTRACT-027](bcontract.md#bcontract-027): no green Active on an unused login or inactive contact.
- [BPORTAL-009](bportal.md#bportal-009) ([BCONTRACT-023](bportal.md#bportal-009), BTASKS-037): greet by the name people go by; initials skip punctuation.
- [BPORTAL-023](bportal.md#bportal-023), G1A-V05: set or hide Call HG; add the email viewport meta.
- PUBLIC-004, PUBLIC-V04, [BPORTAL-013](bportal.md#bportal-013): login shows pending, keeps the email, never shows a framework error page.
- G2D-IV01 (PUBLIC-005, FEEL-018, G1E-I02): staff deep links return to the record after sign-in.
- [ADMIN-004](admin.md#admin-004), [ADMIN-022](admin.md#admin-022), [ADMIN-023](admin.md#admin-023): tappable phone and email, W-9 reads On file, trades and names cleaned.
- [COPY-004](copy.md#copy-004) ([BTASKS-V03](copy.md#copy-004), [BCONTRACT-024](copy.md#copy-004)), TASKS-010: finish the Contractors rename; task titles wrap.
- G2C-IV02, MOBILE-V02 (G2C-V06): move-in reports get an owner and due date; overdue reads red on the property Tasks card.

**Main (the first six lines are critical: land them by Sun Oct 25, before the Oct 27 production load; the rest go between branch landings)**
- PORTFOLIO-V01 (PROPERTY-I14, [PORTFOLIO-V02](portfolio.md#portfolio-v02)): split the shared 765/767 Prospect line so totals stop double-counting.
- PORTFOLIO-001 (IA-001, DATA-002, PROPERTY-V04, [G2C-018](g2c.md#g2c-018)): one unit count, house meters excluded.
- FEEL-001 ([DATA-005](data.md#data-005)): money inputs parse '8k' and never blank a stored value.
- [PROPERTY-V01](property.md#property-v01) (PROPERTY-IV02): the unit editor stops erasing LOFL account numbers.
- DEALS-001: Esc reverts a deal edit.
- [G2B-002](g2b.md#g2b-002), [G2B-003](g2b.md#g2b-003), [G2B-011](g2b.md#g2b-011): property editors pin the version at Edit and send only changed fields.
- [PROPERTY-002](property.md#property-002) (G1E-IV02), [PROPERTY-007](property.md#property-007): show the loan balance; give the ten stored fields a UI.
- [DATA-V01](data.md#data-v01) ([COPY-V05](property.md#property-022), [PROPERTY-022](property.md#property-022), [DATA-036](property.md#property-022)), [ADMIN-002](admin.md#admin-002), [ADMIN-016](admin.md#admin-016): the forecast names what it left out; delete the blank and duplicate CapEx rules.
- [PROPERTY-001](g1d.md#g1d-v01), [G2C-006](g2c.md#g2c-006): Documents and listing photos confirm before deleting.
- PROPERTY-IV01 ([PROPERTY-036](visual.md#visual-i14)), [G2C-V01](g2c.md#g2c-v01) ([PROPERTY-004](g2c.md#g2c-v01)): full address as the h1; Edit visible on touch tablets.
- DEALS-IV01, [DEALS-006](deals.md#deals-006): prices whole on touch; the status popover stays on screen.
- [IA-003](ia.md#ia-003) ([DEALS-003](ia.md#ia-003), [PORTFOLIO-010](ia.md#ia-003), [DEALS-007](deals.md#deals-007)): duplicates and bad input keep what was typed.
- DATA-IV04, DEALS-IV03, [DEALS-004](data.md#data-041): Latest note includes imports; closed deals link to properties; the list passes 300.
- [PORTFOLIO-047](copy.md#copy-017) ([DEALS-025](copy.md#copy-017), [DEALS-V02](deals.md#deals-v02), [DEALS-040](deals.md#deals-040)): one canonical address format, URLs rejected.
- DATA-IV02, [G2A-004](g2a.md#g2a-004), G2A-IV04, DATA-IV03: Unclassified stops mixing signs; Ignore excludes; the dead Basis toggle goes; data quality matches the basis.
- [DATA-007](data.md#data-007), [FINANCIALS-005](financials.md#financials-005), [COPY-V04](copy.md#copy-v04), G2A-IV06: label sandbox data, rename Cash flow after debt, state gaps in dollars.
- [G2A-001](g2a.md#g2a-001), G2A-IV01, [G2A-006](g2a.md#g2a-006), [G2A-I02](g2a.md#g2a-i02): newest months survive the cap; connect errors show a reason; expired or stale sync never reads green.
- [DATA-012](data.md#data-012), [DATA-V07](data.md#data-011), [DATA-I03](data.md#data-i03), [FINANCIALS-002](financials.md#financials-002): no confident $0, every property in By property, 58 Mariner at 50%, one period label.
- PUBLIC-001, [PUBLIC-002](g2c.md#g2c-i01), PUBLIC-IV01, [G1B-012](g1b.md#g1b-012): failed submits keep the report; /rentals hides incomplete listings; ask the unit; skipped items read Not rated.
- [ADMIN-001](g2b.md#g2b-v01), [ADMIN-006](admin.md#admin-006), [FINANCIALS-017](admin.md#admin-i13): Settings saves fail inline, unsaved edits ask first, Disconnect confirms.
- [G2B-005](g2b.md#g2b-005), [G2B-I13](g2b.md#g2b-i13), [G1E-003](g1e.md#g1e-003), [G1E-007](g1e.md#g1e-007): refresh on focus, survive deploys, print cleanly, fix the vercel.app 500s.

**Main, right after the merge (shared code)**
- FEEL-IV04 ([DEALS-002](g2b.md#g2b-v01), [TASKS-004](g2b.md#g2b-v01), [G2B-V01](g2b.md#g2b-v01)): adopt the branch's callAction in every editor.
- [FEEL-005](feel.md#feel-005): pending, single-submit buttons on every form.
- SHELL-IV01, [FINANCIALS-069](financials.md#financials-069), [BCONTRACT-028](bcontract.md#bcontract-028): one Buffalo-time clock.
- [DATA-025](financials.md#financials-037), [FINANCIALS-024](financials.md#financials-024), [VISUAL-019](deals.md#deals-031): one formatter for negatives, months and deal prices.
- [IA-I01](ia.md#ia-i01), SHELL-IV02, [SHELL-V05](shell.md#shell-001): search matches words, ranks open work, drops templates, works from the keyboard.
- [SHELL-V07](shell.md#shell-018) ([G1E-I01](shell.md#shell-018), [BTASKS-043](shell.md#shell-018)): every page gets a title.

### Quick wins

Ranked by impact per hour. All but the last are in Fix now; do them first.
1. PORTFOLIO-V01: portfolio totals stop double-counting.
2. DATA-IV01: legacy jobs come back to the right contractor before Oct 29.
3. PUBLIC-001: residents never lose a finished report.
4. FEEL-001: a typo can't wipe a stored value.
5. DEALS-001: Esc means cancel.
6. [PROPERTY-V01](property.md#property-v01): utility account numbers survive an edit.
7. [G2B-V01](g2b.md#g2b-v01): a failed save keeps the page and the draft.
8. [G1D-V01](g1d.md#g1d-v01): every file delete confirms or undoes.
9. [IA-003](ia.md#ia-003): duplicate creates keep what was typed.
10. DATA-IV02: the Unclassified figure stops adding income to expense.
11. [G2A-004](g2a.md#g2a-004): Ignore on a class excludes it.
12. PORTFOLIO-001: one unit count everywhere.
13. [DATA-V01](data.md#data-v01): the forecast says what it left out.
14. [PROPERTY-002](property.md#property-002): loan balance visible, so equity and LTV can follow.
15. [G1A-008](g1a.md#g1a-008): every contractor has an email before invites.
16. G2D-IV01: links survive sign-in.
17. PROPERTY-IV01: the address is the heading.
18. [G2C-V01](g2c.md#g2c-v01): Edit works on an iPad.
19. DEALS-IV01: prices stop clipping on touch.
20. [VISUAL-I05](visual.md#visual-i05): an HG favicon (needs the gold decision below).

Design quick wins worth approving the same week: [BTASKS-005](btasks.md#btasks-005) (Undo toast on tick), [G2B-I01](btasks.md#btasks-004) (fold Unassigned to one row), [VISUAL-010](visual.md#visual-010) (right-align money), [FINANCIALS-033](financials.md#financials-033) (one freshness line), [PROPERTY-V09](property.md#property-029) (five tasks plus All 29).

### Phases

**Phase 1. A safe cutover (now to Nov 1).** Goal: nothing either partner or a contractor sees on day one is wrong, lost or leaked. Themes: trust-the-numbers, safe-instant-undoable, and the launch half of contractor-loop. Key ids: the Fix now lists, plus [G2D-002](g2d.md#g2d-002) (server sessions), ADMIN-IV01 by Oct 27, [G2C-001](g2c.md#g2c-001) by Oct 28, and [G1A-V02](g1a.md#g1a-v02) and [BCONTRACT-011](bcontract.md#bcontract-011) by Oct 29. Unblocks: the invites and the Nov 1 archive on data people trust.

**Phase 2. The queue and the feel (week 2, Nov 2 to 8).** Goal: Today runs the day, and every action answers at once with Undo. Themes: one-work-queue, numbers-typeset, plain-words, and the primitive half of one-design-system. Key ids: [BTASKS-005](btasks.md#btasks-005), [G2B-I01](btasks.md#btasks-004), [G2B-004](g2b.md#g2b-004), [BTASKS-V02](btasks.md#btasks-v02), [IA-037](ia.md#ia-037), [FEEL-009](feel.md#feel-009), [FEEL-007](feel.md#feel-007), [SHELL-002](shell.md#shell-002) (Cmd-K navigation), [DATA-013](visual.md#visual-010), [VISUAL-011](visual.md#visual-011) (one StatusPill), [VISUAL-I01](visual.md#visual-i01), [VISUAL-007](visual.md#visual-007), [MOBILE-019](mobile.md#mobile-019) (44px in primitives), [COPY-I01](copy.md#copy-i01) (glossary). This runs beside the spec's own week-2 list. Unblocks: D10 is built on fixed tokens and primitives instead of fixing every page twice.

**Phase 3. D10 structure (weeks 3 to 5, Nov 9 to 29).** Goal: one quiet frame and one record anatomy. Themes: quiet-shell, one-record-anatomy, phone-and-touch, create-in-place, and flat surfaces. Week 3: [VISUAL-027](visual.md#visual-027) (DetailLayout), [VISUAL-009](visual.md#visual-009), [SHELL-V06](shell.md#shell-004) (labeled sidebar), [SHELL-030](shell.md#shell-030), [SHELL-028](ia.md#ia-019). Week 4: [PROPERTY-011](property.md#property-011) hub with [PROPERTY-012](property.md#property-012), [PROPERTY-013](property.md#property-013), [PROPERTY-016](property.md#property-016), [G2C-003](property.md#property-018), [PROPERTY-019](property.md#property-019), [IA-009](ia.md#ia-009). Week 5: [SHELL-I01](shell.md#shell-i01) (Home as Today), [SHELL-006](shell.md#shell-006) with [MOBILE-034](mobile.md#mobile-034), [VISUAL-015](visual.md#visual-015), [ADMIN-009](admin.md#admin-009) with [FINANCIALS-045](admin.md#admin-009), [ADMIN-015](bcontract.md#bcontract-011), [ADMIN-029](admin.md#admin-029), [PUBLIC-I08](public.md#public-i08). Unblocks: deals, tasks and contractors adopt the anatomy, and tenancy gets a Units tab to live in.

**Phase 4. Records at scale (December).** Goal: carry the anatomy into deals, money and rentals. Themes: lists-at-scale, honest-financials, rental-lifecycle, and the second half of contractor-loop. Key ids: [DEALS-008](deals.md#deals-008), [DEALS-009](deals.md#deals-009), [DEALS-013](deals.md#deals-013), [DEALS-014](deals.md#deals-014), [DEALS-I05](deals.md#deals-i05), [DEALS-011](deals.md#deals-011), [IA-033](ia.md#ia-033); [FINANCIALS-001](financials.md#financials-001), [FINANCIALS-009](financials.md#financials-009), [DATA-I04](data.md#data-i04), [FINANCIALS-I01](financials.md#financials-i01), [FINANCIALS-008](financials.md#financials-008), [G2A-021](g2a.md#g2a-021); [G2C-002](g2c.md#g2c-002), [G2C-004](g2c.md#g2c-004), [G2C-005](g2c.md#g2c-005), [G1B-006](g1b.md#g1b-006), [PUBLIC-012](public.md#public-012), [G1E-I03](g2c.md#g2c-i01); [G1D-001](g1d.md#g1d-001), [G1D-003](g1d.md#g1d-003), [G1A-007](g1a.md#g1a-007). Unblocks: a generated SREO ([G1E-I07](portfolio.md#portfolio-030)) and the January 1099 list ([G1E-I10](g1e.md#g1e-i10)).

### Decisions for Connor

**Visual system**
- May money and KPIs use Geist with tabular numerals, keeping Mono for IDs, codes and lockbox digits ([SHELL-048](shell.md#shell-048), [VISUAL-017](shell.md#shell-048), [DATA-027](shell.md#shell-048))? Yes. That retires [FINANCIALS-062](financials.md#financials-062).
- May sections go flat on white with hairlines, the sidebar lose its stroke and sit one gray step down, and shadows stay on floating layers ([VISUAL-009](visual.md#visual-009), [VISUAL-I08](visual.md#visual-i08), [SHELL-I15](visual.md#visual-i08))? Yes.
- May dark-mode filled buttons use blue-600, links and focus on blue-400 ([VISUAL-006](visual.md#visual-006))? Yes; it fixes a contrast failure.
- May red mean overdue and failure only: Review leaves red, statuses get shape glyphs, negative money goes neutral with a true minus, stages use dots outside Badge, and '2 new' leaves Scheduled's blue ([VISUAL-I01](visual.md#visual-i01), [BTASKS-033](btasks.md#btasks-033), [G2A-I13](g2a.md#g2a-i13), [DEALS-022](deals.md#deals-022), [BPORTAL-V02](bportal.md#bportal-v02))? Yes.
- May gold appear in the app only in the favicon, brand tile and one accent in payoff art ([VISUAL-I05](visual.md#visual-i05), [VISUAL-I11](visual.md#visual-i11))? Yes.
- May real photos serve as small identity thumbnails, picked from photos already in the app ([VISUAL-I04](visual.md#visual-i04), [G1D-I17](g1d.md#g1d-i17))? Yes.
- May lists scroll with the page under a sticky header, route tabs use aria-current, and phone filters collapse into a Filters sheet ([VISUAL-V02](visual.md#visual-v02), [ADMIN-V01](admin.md#admin-v01), [MOBILE-009](mobile.md#mobile-009))? Yes; amend docs/components.md and the one-switch rule.
- May public pages print light ([G1E-024](g1e.md#g1e-024))? Yes.

**Home and Today**
- May Home become the Today view plus a pinned needs-action card ([SHELL-I01](shell.md#shell-i01))? Yes. Until D10, Home's card shows Needs review and matches Today ([BCONTRACT-015](bcontract.md#bcontract-015)).
- Today | Upcoming on Home ([SHELL-I04](shell.md#shell-i04))? No. Upcoming stays the week-2 Tasks tab, so phones keep a two-option switch.
- May the 5-year CapEx forecast move to Properties ([SHELL-023](shell.md#shell-023))? Yes, with one 'CapEx due this year' row on Home.
- In Mine, may Unassigned fold to today's and this week's items, resident reports get a group, and handoffs land in 'New for you' ([BTASKS-004](btasks.md#btasks-004), [G1B-007](g1b.md#g1b-007), [G2B-004](g2b.md#g2b-004))? Yes.
- May the 7am summary's handoff section ship Oct 27 ([G2B-010](g2b.md#g2b-010))? Yes, handoffs only.
- Phone bar: is the fifth tab More? Yes, holding only Contractors, Financials and Settings.

**Tasks, playbooks and repeats**
- Deadline before cutover ([TASKS-I03](tasks.md#tasks-i03))? No; week 2, as planned.
- 'Pieter to confirm' as Review ([TASKS-I19](tasks.md#tasks-i19))? No. Assign them to Pieter, drop the phrase ([G2B-026](g2b.md#g2b-026)), and hide Review on staff-only tasks ([BTASKS-041](btasks.md#btasks-041)).
- May Repeat fold into the Due picker with next dates shown ([G1C-010](g1c.md#g1c-010))? Yes.
- Plain-text row dates, a round Done checkbox, the property as a gray sublabel, Shared/Internal only with a contractor, Created by in Activity, a + for New task on phones ([BTASKS-007](btasks.md#btasks-007), [BTASKS-008](btasks.md#btasks-008), [BTASKS-029](btasks.md#btasks-029), [BTASKS-019](btasks.md#btasks-019), [G1C-046](g1c.md#g1c-046), [BTASKS-027](btasks.md#btasks-027))? Yes.
- May All group by Overdue, This week, Later and No date now ([BTASKS-V02](btasks.md#btasks-v02))? Yes.
- A minimal bulk bar before cutover, with quick picks beside Move all to today ([IA-037](ia.md#ia-037), [FEEL-I14](feel.md#feel-i14))? Yes, reschedule and Done only.
- Cmd-K create and the header New with D10 ([IA-009](ia.md#ia-009))? Yes; Cmd-K navigation stays in week 2.
- Tablet: bar in portrait, labeled rail in landscape, list beside the task once the side panel exists ([MOBILE-034](mobile.md#mobile-034), [MOBILE-044](mobile.md#mobile-044))? Yes.
- Read-only Apply rows, Apply from today's property Tasks card, playbooks in Settings, a Repeats filter on All ([BPLAY-007](bplay.md#bplay-007), [BPLAY-016](bplay.md#bplay-016), [BPLAY-015](bplay.md#bplay-015), [BPLAY-025](bplay.md#bplay-025))? Yes.
- Grouped runs, Save as playbook, closing playbook from the deal ([BPLAY-017](bplay.md#bplay-017), [G1C-I05](g1c.md#g1c-i05), [BPLAY-036](bplay.md#bplay-036))? Yes, in Phases 3 and 4.
- Mask lockbox codes in imported comments for contractors ([G1C-012](g1c.md#g1c-012))? Yes, before Oct 29.

**Properties, deals and money**
- Tap-to-edit per field ([PROPERTY-016](property.md#property-016))? Yes, in the hub.
- Stable unit ids before Oct 28 ([G2C-001](g2c.md#g2c-001))? Yes, required.
- Split Stage and Priority ([DEALS-013](deals.md#deals-013))? Yes.
- Write classes back to QuickBooks ([FINANCIALS-I16](financials.md#financials-i16))? No; link each line out instead ([G2A-I26](financials.md#financials-021)).

**Contractor portal**
- One-time link instead of a starting password ([G1A-001](g1a.md#g1a-001))? Keep D14 for Oct 29; switch in week 2. One password field with Show now ([BPORTAL-008](bportal.md#bportal-008)).
- Invite only contractors with open jobs ([G1A-V02](g1a.md#g1a-v02))? Yes.
- My jobs as one list ([G1A-015](g1a.md#g1a-015))? No; revisit D31 after two weeks of use.
- Email on cancel, no partner email on Start job, the app's look in sign-in and emails, bundling across jobs ([G1A-002](g1a.md#g1a-002), [G1A-031](g1a.md#g1a-031), [G1A-004](g1a.md#g1a-004), [G1A-033](g1a.md#g1a-033), [BCONTRACT-017](bcontract.md#bcontract-017))? Yes.
- Which shared address receives replies ([BCONTRACT-002](bcontract.md#bcontract-002))? One jobs inbox both partners read.
- 'Sent to HG' instead of red Review, a Send back banner, uploads open in Review, checklist in Mark done, visit date instead of Target, a shared Waiting reason, no bar on a computer, a changed-since notice ([BPORTAL-006](bportal.md#bportal-006), [BPORTAL-007](bportal.md#bportal-007), [BPORTAL-010](bportal.md#bportal-010), [BPORTAL-017](bportal.md#bportal-017), [BPORTAL-031](bportal.md#bportal-031), [BPORTAL-024](bportal.md#bportal-024), [BPORTAL-021](bportal.md#bportal-021), [G1A-I09](g1a.md#g1a-i09))? Yes.
- Photos inside the Review banner ([G1A-007](g1a.md#g1a-007))? Yes.
- Zack picks his visit day ([G1A-I06](g1a.md#g1a-i06))? Not yet.
- Portal access card above Contact with a chip, password in a sheet, Copy message primary on computers, a portal column before Oct 29 ([BCONTRACT-009](bcontract.md#bcontract-009), [BCONTRACT-016](bcontract.md#bcontract-016), [BCONTRACT-V05](bcontract.md#bcontract-v05), [BCONTRACT-011](bcontract.md#bcontract-011))? Yes.
- 8 MB upload parts ([BPORTAL-004](bportal.md#bportal-004))? Yes, now. Thumbnails at upload ([G1D-004](g1d.md#g1d-004))? Week 2. Required finish photos ([G1D-I19](g1d.md#g1d-i19))? Yes, with templates.
- One media system everywhere ([G1D-001](g1d.md#g1d-001))? Yes, Phase 4.
- Payment fields on jobs ([JOURNEYS-I11](journeys.md#journeys-i11))? No; show QuickBooks payments on the contractor ([JOURNEYS-I10](admin.md#admin-031)).
- Keep a slim copy of completed tasks as job history (ADMIN-IV01)? Yes; decide before Oct 27.

**Residents, public site and sessions**
- Reports staff-only, one email to both partners, a copy to the resident ([G1B-005](g1b.md#g1b-005), [G1B-010](g1b.md#g1b-010), [PUBLIC-046](public.md#public-046))? Yes.
- Resident photos and insurance uploads ([PUBLIC-044](public.md#public-044), [G1D-I02](g1d.md#g1d-i02))? Yes, capped, with the move-in rebuild.
- 'Sign in', in the footer on phones, at readable contrast ([COPY-062](copy.md#copy-062), [PUBLIC-021](public.md#public-021), [PUBLIC-V08](public.md#public-v08))? Yes.
- Show Connor and Pieter to renters ([PUBLIC-I04](public.md#public-i04))? Yes, first names and initials.
- Server sessions before Oct 29, then rolling 30 days, self-serve password change and reset, security emails ([G2D-002](g2d.md#g2d-002), [G2D-003](g2d.md#g2d-003), [G2D-004](g2d.md#g2d-004), [G2D-010](g2d.md#g2d-010), [G2D-016](g2d.md#g2d-016))? Sessions now; the rest in week 2.
- Overdue past a week: date or day count (VISUAL-IV02)? The date, as built.

### What not to do

- No favorites, saved-view dialogs, scope chips or a global audit log (SHELL-I13, DEALS-I08, IA-I15, ADMIN-I11, ADMIN-I12). For two people, Recent in search, sidebar links that keep filters ([IA-036](ia.md#ia-036)) and one timeline per record do the job.
- No deal board yet (DEALS-066). Grouped stages with totals ([DEALS-014](deals.md#deals-014)) first; [DEALS-I01](deals.md#deals-i01) only if that fails.
- No second modes for rare jobs: fill-in grids, selection sums, conflict buttons in Activity (PORTFOLIO-I02, PORTFOLIO-I08, FINANCIALS-I13, G1C-I04).
- No duplicate navigation: property steppers, deal prev and next, open-next after triage (PROPERTY-I11, DEALS-064, DEALS-I18). The sidebar and side panel cover it.
- No signals that mislead: 'Seen by Connor', a sublabel on a toggle that does nothing, an expiry warning that fires too late, an events strip without stored times (G1A-I07, ADMIN-I15, ADMIN-I16, SHELL-I03).
- No ledgers HG keeps elsewhere: deposits and subsidy amounts live in Baselane, books in QuickBooks (G1B-022, G2C-030).
- No new states for what Canceled already does (G1B-I11, G1B-028, G1B-I03), and no extra Mine groups or personal hide dates (G2B-024, G2B-I07).
- No listing features that compete with Zillow as the leasing system of record (G1E-I04, G1E-I06, G1E-I12, PUBLIC-I14).
- No web camera rebuild or before-and-after slider (G1D-I11, G1D-I18).
- Skip the invite queue, Start job undo, greeting summaries, history picker, rehab health posts and staff lockbox masking (G1A-042, BPORTAL-038, BPORTAL-028, G2A-023, PROPERTY-I16, PROPERTY-046).

## Already resolved

Fixed since the review ran, on main or on the Asana migration branch (now on main). Each was verified against the code before it left the list.

- SHELL-014 (App shell, sidebar, top bar, global search and Home), fixed: Use one due-date vocabulary on Home and Tasks. Home's My open tasks rows now render DueDatePicker (my-tasks-list.tsx:27), the same chip as Today and All, so both surfaces use dueLabel: 'Yesterday', 'Nd late' within a week, then the date ('Aug 28', or with the year if not this year), red when overdue. relativeDays is no longer used on Home. The property Tasks card still uses fmtDay (tracked in PROPERTY-006 and MOBILE-V02).
- PROPERTY-010 (Property detail page (future property hub)), fixed: The property task query hard-codes status OPEN, so most tasks will vanish after the seven-status migration. The property task query now spreads activeTask and excludeTemplateTasks (page.tsx:53), so Scheduled, In progress, Waiting and Review tasks stay listed. A test fails on any literal status: "OPEN" filter (task-scope.test.ts:48). Rows show a StatusBadge for contractor jobs and any status other than To do, in a fixed spot between the title and the avatar (page.tsx:206-208), e.g. 'In progress' on Cabinet install and 'To do' on contractor jobs at 767 Prospect.
- TASKS-001 (Tasks list, new task and task detail), fixed: Every overdue task says "yesterday", including ones 18 months late. dueLabel now returns 'yesterday', then 'Nd late' up to a week, then the real date: 'Aug 28' this year, 'Apr 19, 2025' for earlier years (dates.ts:161-178). DueDatePicker capitalizes it and colors it red when overdue. /tasks/all shows 'Apr 19, 2025', 'May 2, 2025' and 'Aug 28' in red, right-aligned in a fixed w-28 column on desktop. Home and Today use the same chip. Small gaps against the approved Today mock: weekdays render long ('Friday', not 'Fri'), and the chip isn't set in tabular figures.
- TASKS-002 (Tasks list, new task and task detail), fixed: On phones the Task column collapses to 0px, so no titles show. The table is gone. TaskRow renders two-line rows below lg or in lists narrower than 34rem: the title, then property, status, avatar and date chip. At 320 the title is 222px wide ('Pieter to confirm 15 Oxford Punc…' with 'PL' and a red 'Apr 19, 2025'), and at 375 it is 277px. Today (/tasks) uses the same row at 375. No sideways scroll.
- TASKS-003 (Tasks list, new task and task detail), fixed: Touch users can't open a task: tapping the title starts editing it, and the open button is invisible. The whole row is now a link to /tasks/[id] (an absolute-inset Link covering the row: 286x74 at 320, 718x74 at 768, 1150x48 at 1280), with a hover background on desktop. The title is a plain <p> (0 inputs per row), and the hover-only chevron is gone. The checkbox and date chip sit above the link with pointer-events-auto. Title editing moved to the task page header ('Task title' textbox).
- TASKS-005 (Tasks list, new task and task detail), fixed: New task saves the default team assignee and the typed contractor, so the contractor is hidden. /tasks/new now has one AssigneePicker with Team and Contractors groups, posting a single hidden 'assignee' value (u:<id> or c:<contactId>) (new-task-fields.tsx:36-43). The separate external-name field is gone. On the server, createTask stores assigneeName only when no assignee was picked (actions.ts:54,64-65), so a contractor can't be hidden behind a default staff assignee.
- TASKS-007 (Tasks list, new task and task detail), fixed: "Remove" on an attachment deletes the file from storage at once, with no confirm or undo. On the task page there is no bare Remove link any more. To delete a document you open a ⋯ menu, choose Delete, then confirm in 'Delete this file? "…" goes for good.' (Keep it / Delete). Photos and videos are deleted from the lightbox through the same confirm. This uses a confirm rather than the Undo toast the finding suggested, and the service still hard-deletes the row and the blob (service.ts:394-405). The old components/attachments.tsx with the bare 'Remove' (line 175) is now used only for property documents (properties/[id]/edit-documents.tsx:3), which is outside this finding.
- TASKS-016 (Tasks list, new task and task detail), fixed: Drop the Address column: it is mostly dashes and squeezes the titles. The table and its Address column are gone from Today and All. On wide desktop each row is one line: title and status chip, then fixed slots for the property (muted 12px, w-36, blank when there is none), a 20px neutral avatar and a right-aligned date chip. On tablet and phone the property, avatar and date drop to a second line. How deal tasks are labeled is still open in TASKS-014.
- TASKS-018 (Tasks list, new task and task detail), fixed: The list scrolls inside a fixed-height box instead of with the page. The All list is now an ordinary Card in the page flow (all/page.tsx:49-60). The page itself scrolls (11,833px tall at 1280x800 for 236 rows), and no inner 70vh box traps the wheel. Two secondary asks were not done: rows are 49px rather than 40px, so about 11 fit at 1280x800, and the filter row doesn't stick under the app bar.
- TASKS-027 (Tasks list, new task and task detail), fixed: Attachments are a filename list under a 96px dashed upload box. The 96px dashed upload box is gone. MediaGrid shows photos and videos as square thumbnails: 3 columns on phone, 6 columns of 88px from sm up, videos with a play mark and their length, and a tap opens the Lightbox (media-grid.tsx:11-74). Documents are a compact list. The section appears only when there are files (view.tsx:126-135). You add files with the composer's photo button or by dragging or pasting onto the composer (composer.tsx:175-201). Two caveats: I couldn't check the grid on screen because no task in the branch DB has photos, and there is no full-page drop overlay (drops land only on the composer).
- TASKS-029 (Tasks list, new task and task detail), fixed: The task page due date is a plain mm/dd/yyyy field that doesn't show it's overdue. In the rail, Due is now a compact chip, red when overdue ('Apr 19, 2025' on /tasks/cmtg25z7s048mjphsikewzpy1). It opens the approved popover: Today Fri, Tomorrow Sat, Monday Oct 26, Next week Fri Oct 30 and No date (keys 1 to 5), then a month calendar. On touch it opens as a Sheet. A change toasts 'Due date set to …' with Undo. The only gap is that there is no muted 'Overdue' word; red alone marks it.
- TASKS-032 (Tasks list, new task and task detail), fixed: The task page has no ⋯ menu: no delete, duplicate or copy link. The title row now has a ⋯ 'More actions' menu. It holds Copy link (toasts 'Link copied'), Cancel task on active tasks (with Undo), and Delete in red after a separator. Delete asks first: 'Delete this task?' with Keep it / Delete (header.tsx:33-110). Duplicate isn't there.
- TASKS-036 (Tasks list, new task and task detail), fixed: The open checkbox shows a faint tick, so it already looks half done. An open task now shows an empty 18px ring with a transparent tick. On hover the ring and tick turn green; Tailwind v4 applies hover only on devices that can hover, so touch never sees it. Done fills green with a white tick. The button is 44x44, and negative margins keep the drawn circle at 18px so the row stays compact (task-checkbox.tsx:24-49).
- TASKS-037 (Tasks list, new task and task detail), superseded: Column headers and values are 4 to 7px out of line. The table and its column headers are gone. Today and All now use the approved phone-usable rows (spec §4), so there are no headers to line up with. In the one-line desktop layout each value sits in a fixed slot (property w-36, date w-28 right-aligned, task-row.tsx:112,146), so values line up from row to row.
- TASKS-038 (Tasks list, new task and task detail), fixed: Uppercase headers on every column, each with a hidden three-click sort. The uppercase headers and their hidden three-click sorts are gone, and tasks/sort-header.tsx no longer exists on the branch. All always sorts by due date and has no sort control. The Done view's sort order is tracked in TASKS-021.
- TASKS-044 (Tasks list, new task and task detail), fixed: Filter controls have no accessible names. On /tasks/all the aria tree now shows searchbox 'Filter by title', a group 'Status' whose buttons expose [pressed] ('Open' pressed), combobox 'Assignee' and combobox 'Property'. The labels are in filters.tsx:67, 71, 84 and 121. aria-pressed comes from the shared SegmentedControl (segmented-control.tsx:51), styled from the attribute at line 55.
- TASKS-V01 (Tasks list, new task and task detail), fixed: Clicking a due date focuses a hidden field, and one arrow key reschedules the task. The hidden date input is gone. On /tasks, clicking a row's date chip opens the React Aria quick-pick popover with a calendar (a Sheet on touch). Focus lands on the dialog, not an input. Pressing ArrowUp sent no write (blockedWrites empty) and the dialog stayed open. A value is saved only on an explicit pick, and only when it differs (due-date-picker.tsx:73-76). The task page rail uses the same picker (fields.tsx:89-101).
- TASKS-IV01 (Tasks list, new task and task detail), fixed: Every overdue task reads 'yesterday', whether 13 or 552 days late. Fixed in branch src/lib/dates.ts:161-177, with cases in src/lib/dates.test.ts:68-71,95. It uses 'Nd late' where the finding suggested a weekday, but either way a 500-day-late task no longer reads like a 1-day-late one.
- TASKS-IV02 (Tasks list, new task and task detail), fixed: On phones the task list has no titles: the Task column collapses to 14px. Fixed by branch src/app/(app)/tasks/task-row.tsx (two-line row, container queries) and all/all-list.tsx (ul, not Table).
- TASKS-IV03 (Tasks list, new task and task detail), fixed: Tapping a task edits its title instead of opening it; the open control is invisible on touch. Fixed in branch src/app/(app)/tasks/task-row.tsx:77-81 (absolute inset-0 Link) and :95 (pointer-events-none content).
- TASKS-IV04 (Tasks list, new task and task detail), fixed: A contractor typed into New task is hidden behind the default assignee. Fixed in branch src/app/(app)/tasks/new/new-task-fields.tsx:40-43 and src/app/(app)/tasks/actions.ts:43-48,65.
- TASKS-V09 (Tasks list, new task and task detail), fixed: Let the task list scroll with the page instead of inside a 70vh box. Fixed in branch src/app/(app)/tasks/all/page.tsx:52-62 and all/all-list.tsx (no Table wrapper).
- PUBLIC-015 (Login and the public site), fixed: Add 'Forgot password?' now; contractor invites go out Oct 29. /login shows 'Forgot password?' (when PORTAL_ENABLED, which is on at :3300) linking to /login/forgot. That page has one Email field and 'Email me a link', then 'Check your email' with 'If that email has a login, a link is on its way.' and 'Back to sign in'. The response is the same whether or not the account exists (actions.ts:78-82), per D14. Differences from the original recommendation: the link sits under the Sign in button rather than on a Password label row (there are no labels, see PUBLIC-016), and the sent screen doesn't echo the address. Per the spec's defaults, item 2, only contractor accounts get an email.
- PUBLIC-020 (Login and the public site), superseded: Offer contractors an emailed sign-in code instead of texted passwords. The approved D14 contractor sign-in is built on the branch: email and password on the shared /login, a starting password from the Portal access card with 'Text login details', a forced first-password screen at /p/welcome/password, and a 'Forgot password?' email link. An emailed sign-in code would change D14. If it's still wanted, it is a question for Connor: 'Add an email-me-a-code option for contractors alongside D14's passwords, after cutover?'
- VISUAL-001 (Lens: visual design system across every screen), fixed: Task titles vanish on phone because the Task column renders 0px wide. The table-fixed Tasks table is gone. Rows are two-line on phones and tablets (title, then property, status, avatar and date chip) in task-row.tsx:93-157. Measured title widths are 277px at 375 and 222px at 320, with no sideways scroll.
- VISUAL-042 (Lens: visual design system across every screen), fixed: Row hover turns each cell into a bordered input. Hovering a row on /tasks gives a full-row fill (hover:bg-background on the li, task-row.tsx:73). Nothing outlines on hover, and the title opens the task through the row link (task-row.tsx:77-82). Fields change through the date chip here and through the task page rail.
- VISUAL-IV01 (Lens: visual design system across every screen), fixed: Task titles are invisible on phones: the Task column collapses to 0px. Replaced by the approved two-line rows (task-row.tsx:18-27, 70-161). The table-fixed column widths no longer exist.
- VISUAL-IV02 (Lens: visual design system across every screen), fixed: Every overdue task reads 'yesterday', however late it is. Fixed in a different form than recommended. Past a week it shows the calendar date in red instead of '56d overdue', a deliberate choice explained in the dueLabel comment. If Connor prefers day counts, it's a one-line change in dueLabel.
- IA-007 (Lens: information architecture and global SaaS patterns), fixed: One rule for opening a record: the primary cell opens it, on every list. Task rows no longer have a title input or a hover-only chevron. Each row has a full-cover Link to /tasks/[id], and only the checkbox and the due chip sit above it. Renaming happens on the task page's title. The property card and the contractor Jobs list also link their titles, which matches Deals, Properties and Contractors.
- IA-V01 (Lens: information architecture and global SaaS patterns), fixed: Task titles collapse to zero width on phone, so the Tasks list shows no task names. The table was replaced by the two-line TaskRow the recommendation asked for: title on line one, then property, avatar and due chip, with the whole row opening the task. Title width is 222px at 320, and nothing scrolls sideways on /tasks/all at 375 or 320.
- MOBILE-001 (Lens: phone and tablet experience on every route), fixed: Tasks list shows no task titles on phones. Today and All render two-line li rows (TaskRow), not a table. Line 1 has the checkbox and title, line 2 the property, status, avatar and a red due chip. At 320, /tasks/all rows are 75px and show full truncated titles ("Pieter to confirm 15 Oxford Punc…").
- MOBILE-002 (Lens: phone and tablet experience on every route), fixed: Touch users have no visible way to open a task from the list. The whole row is a Link overlay to /tasks/[id], the title is plain text, and there's no hover-only chevron. In WebKit at 768 touch, tapping the second row on /tasks/all navigated to /tasks/cmtg25z6g040ajphs2xgfqx80. Titles truncate with an ellipsis. Rename moved to the task page title.
- MOBILE-IV01 (Lens: phone and tablet experience on every route), fixed: Tasks list shows no task titles on phones. The approved two-line TaskRow replaced the table outright, which is the long-term version of this recommendation (task-row.tsx:18-27, 93-157).
- MOBILE-IV02 (Lens: phone and tablet experience on every route), fixed: On touch, nothing in a Tasks row opens the task. Each row on Today and All is now a full-row Link to /tasks/[id] (task-row.tsx:77-82). The title and meta are pointer-events-none, and only the 44px checkbox and the due chip sit above the link. At 768, tapping row 3 opened /tasks/cmtg25z7r048gjphs2o7ldjxq. At 375 and 320, elementFromPoint at the title returns the row's A. Lists no longer edit titles inline; title editing moved to the task page (header.tsx:15-29).
- MOBILE-IV06 (Lens: phone and tablet experience on every route), fixed: Assignee picker lists the assignee twice and has no Unassigned choice. The task page's assignee field is now AssigneePicker. It lists 'Unassigned' first, then Team (Connor, Pieter), then Contractors with their trade, with search. Each person appears once (assignee-picker.tsx:171-200). A legacy free-text assignee shows as read-only 'Assigned in Asana to X' (view.tsx:120).
- FEEL-004 (Lens: interaction quality, feedback, states, speed and accessibility), fixed: On a phone the task list shows no task titles. Rows are two lines on phones and tablets: title, then property · status · due chip, and the whole row opens the task. That matches the approved Today and All phone layout. Verified at 375 and 320.
- FEEL-012 (Lens: interaction quality, feedback, states, speed and accessibility), fixed: On touch you can't open a task from the list. Rows are real links to /tasks/[id], so cmd-click and middle-click work too. On touch, a tap on the title hits the link (elementFromPoint returns the <a>), and no input takes focus. Titles are edited on the task page.
- FEEL-IV01 (Lens: interaction quality, feedback, states, speed and accessibility), fixed: Every overdue task reads 'yesterday', even ones from 2025. dueLabel now says 'yesterday' only for one day, '3d late' through six days, then the real date, with the year when it differs (dates.ts:154-177). The tests were updated (dates.test.ts:68-71). On All, 'Pieter to confirm 15 Oxford Punchlist' reads 'Apr 19, 2025' in red, and Home shows 'Aug 28' in red through the same chip. The property Tasks card still shows gray dates; that leftover is tracked under MOBILE-IV03.
- FEEL-IV02 (Lens: interaction quality, feedback, states, speed and accessibility), fixed: On phones the task list shows no task titles. The fixed-column table is gone. Rows are two lines (title, then property, avatar and due chip) below a 34rem container. Measured title width is 277px at 375 and 222px at 320, with no sideways scroll. The settled Today view is built.
- FEEL-IV03 (Lens: interaction quality, feedback, states, speed and accessibility), fixed: On touch there is no visible way to open a task from the list. Same fix as MOBILE-IV02. The whole row is a link on every pointer type (task-row.tsx:77-82), the title isn't an input any more, and the checkbox has a 44px hit area (task-checkbox.tsx:33). At 768, tapping a row opened the task.
- DATA-001 (Lens: tables, numbers, money, charts and status), fixed: Every overdue task says "yesterday", including one due Apr 19, 2025. dueLabel now returns 'yesterday', then 'Nd late' for up to 6 days, then the calendar date with the year only when it differs ('Apr 19, 2025'). Tests cover these cases. On /tasks/all the oldest rows read 'Apr 19, 2025', 'May 2, 2025' and so on in red. Today's contractor rows show 'Yesterday', '2d late' and 'Oct 16' correctly.
- DATA-003 (Lens: tables, numbers, money, charts and status), fixed: Task titles are invisible on phones because the Task column is 0px wide. The fixed-width table this finding described is gone. TaskRow (an @container list with two-line rows on phones) replaced it, which goes further than the short-term fix. Titles show at 375 and 320.
- DATA-047 (Lens: tables, numbers, money, charts and status), fixed: The task page's due date is a bare "04/19/2025" input with no overdue cue. The rail's Due row is now the React Aria DueDatePicker chip. On the overdue task /tasks/cmtg25z7s048mjphsikewzpy1 ('Pieter to confirm 15 Oxford Punchlist') it reads 'Apr 19, 2025' in red. It opens quick picks (Today, Tomorrow, Monday, Next week, No date), each with the date it lands on, plus a calendar: a popover with a mouse and a sheet on touch. Changes toast with Undo. The optional muted '18 months overdue' hint isn't there; the red date carries the cue.
- DATA-V03 (Lens: tables, numbers, money, charts and status), fixed: On touch there's no visible way to open a task from the list. Each row now has a full-size Link to /tasks/[id] (absolute inset-0) under its content, which is pointer-events-none. Only the checkbox and date chip sit above it. At 768 and 375 touch, elementFromPoint on the first title returns that <a href='/tasks/cmtg25z7s048mjphsikewzpy1'>. /tasks/all has 236 task links. Renaming moved to the task page title, and the hidden Details chevron is gone.
- DATA-V05 (Lens: tables, numbers, money, charts and status), fixed: One field, three names: "Project", "Address" and "All properties". The task page rail row reads 'Property' with 'No property'. The list has no column headers, the All filter reads 'All properties', and New task labels the select 'Property'. No 'Project' string is left in the task screens. A minor gap: New task's empty option says 'None' rather than 'No property'.
- COPY-001 (Lens: words on every screen), fixed: Overdue tasks all read 'yesterday', even when 18 months late. dueLabel was rewritten in branch src/lib/dates.ts:155-177: yesterday for -1, 'Nd late' under a week, then the calendar date with the year when it isn't this year. DueDatePicker turns it red when overdue (src/components/due-date-picker.tsx:71, 85-90). The test now asserts this (dates.test.ts:67-80). It differs slightly from the recommendation ('3d late' rather than a date under a week), but an 18-month-old task no longer reads 'yesterday'.
- COPY-006 (Lens: words on every screen), fixed: Task fields have two or three names each. Fixed by the approved D11 names: tasks/[id]/fields.tsx:81, 117-124; filters.tsx:84-88, 90, 99, 121-124. One leftover is a third 'External' optgroup of legacy Asana names in the All filter (filters.tsx:107-115), tracked under COPY-040.
- COPY-V01 (Lens: words on every screen), fixed: Task titles are invisible on phone: the Task column computes to 0px. The table is gone. TaskRow renders two lines on phones and tablets: the title, then property, status and due chip. One line with fixed property, person and date columns only appears in a list at least 34rem wide from lg up. At 375 and 320 on /tasks and /tasks/all every title shows in full or truncates with an ellipsis, and nothing scrolls sideways.
- COPY-I06 (Lens: words on every screen), fixed: Replace 'Or external assignee (contractor name)' and its 'e.g. Zack Reading' placeholder with one Assignee picker. New task has one Assignee field: the searchable AssigneePicker with Unassigned, Team and Contractors, defaulting to the signed-in user (new-task-fields.tsx:36-43). The free-text 'Or external assignee' field and its 'e.g. Zack Reading' placeholder are gone. A legacy assigneeName shows read-only as 'Assigned in Asana to X' on the task page (view.tsx:120).
- COPY-IV02 (Lens: words on every screen), fixed: The task page's unassign option reads '{assignee} (external)'. assignee-picker.tsx:171-177 always renders 'Unassigned' first. A legacy free-text name shows as the muted line 'Assigned in Asana to {name}' only when no user or contact is linked (view.tsx:120, page.tsx:210). The branch uses 'Unassigned', not 'No assignee', which matches the Today section and the filters.
- COPY-IV03 (Lens: words on every screen), fixed: New task hides a typed contractor name behind your own assignment. The form posts a single 'assignee' value, u:<id> or c:<id> (new-task-fields.tsx:39-43). createTask saves assigneeName only when no assignee was picked (tasks/actions.ts:44-49 and :65), and core.ts:261 nulls assigneeName whenever a user or contact is set. A contractor is now picked as a linked contact, not typed in.
- JOURNEYS-005 (Lens: the core jobs, end to end), fixed: Typing a contractor name in New task assigns the task to both you and the contractor. New task now has the spec's single AssigneePicker: Unassigned, then Team, then Contractors with trade and 'Has login'. It posts one 'assignee' value (u:/c:/blank), and the free-text contractor field is gone. The server stores assigneeName only when no assignee is picked.
- JOURNEYS-045 (Lens: the core jobs, end to end), fixed: The contractor page shows an internal caveat: "matched by name/email · 0 shown". The Jobs card header is now "Jobs" with a count (8 for Zack Reading), and the empty state reads "No jobs assigned yet." Jobs match on assigneeContactId, not name or email. No "Assign a task" shortcut yet (optional).
- JOURNEYS-046 (Lens: the core jobs, end to end), fixed: The contractor field's placeholder uses a real contractor's name ("e.g. Zack Reading"). The free-text external assignee field and its "e.g. Zack Reading" placeholder are gone from /tasks/new. The Assignee picker's search reads "Search" with aria-label "Search people"; the probe found no placeholders on the form.
- JOURNEYS-V02 (Lens: the core jobs, end to end), fixed: On a staff-assigned task, the Assignee menu lists the assignee twice, once as "(external)", and has no Unassigned option. The task page now uses AssigneePicker. It lists Unassigned, Team (Connor, Pieter) and Contractors with trades, each once, with a check on the current pick. No "(external)" duplicate. A legacy free-text name shows as a separate "Assigned in Asana to …" line.
- JOURNEYS-V06 (Lens: the core jobs, end to end), fixed: The task page calls the property "Project" ("No project"), while New task and D11 call it "Property". The task rail and the phone chip row label it "Property". The empty option and placeholder read "No property", and the SelectChip label is "Property". The chip shows "No property" at 375.
- G1A-V01 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve), fixed: Return to the job after sign-in instead of dropping on My jobs. Fixed in 4cf099d (on top of dd00a9e): contractors return to the job after sign-in (next= through login and first password). Verified in the diff.
- G1B-019 (After a tenant submits: the move-in report on the staff side), fixed: In Safari an empty Due date shows today's date, so an undated report looks due today. On the task page, Due is now a DueDatePicker chip (fields.tsx:89-100) and never a native input. Unset, it shows a muted "Due date" and opens the D7 quick picks (due-date-picker.tsx:71,82-95). In WebKit at 1280 and 320, the undated task /tasks/cmtg25yrk01igjphsj6kiis5p has 0 date inputs and the chip reads "Due date". /tasks/new still uses the native input; see G1C-013.
- G1B-IV01 (After a tenant submits: the move-in report on the staff side), fixed: Label the Assignee menu's empty choice 'Unassigned', not '<name> (external)'. assignee-picker.tsx:171-177 and view.tsx:120. Handing a claimed report back is now an explicit 'Unassigned' pick.
- G1C-001 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), fixed: Undo or reopen, then complete again, creates a second next copy of a repeating task. Fixed in 4cf099d (on top of dd00a9e): finishing again reuses the existing copy instead of creating a second one. Verified in the diff.
- G1C-042 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), fixed: Show checklist progress as '2 of 4' in the checklist heading. The checklist heading reads 'Checklist' with a muted count ('0/4') and a thin progress bar on /tasks/[id]. The portal job page shows the same count. Rows on Today and All stay clean. Seen on /tasks/cmvkik0ht0003jpg7nflnvoun.
- G1D-002 (Photos, videos and documents: viewing and capturing, not just the upload box), fixed: Imported link attachments and contractor-removed files will show as normal files that 404 or mislead. LINK attachments map to their linkUrl with an ExternalLink icon and open in a new tab. They never get an /api/files href: asFile returns href: a.linkUrl for kind LINK. Soft-deleted rows are filtered out of the staff page and the portal queries, so they never show as live files. Not built: the link's domain on the row and the staff 'Show removed' toggle, both nice-to-haves now.
- G2B-001 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap), fixed: Send the intended status from the checkbox, not a flip of whatever the server has. Fixed on the migration branch in dd00a9e (on top of 4652abb): core.setStatus locks the row with FOR NO KEY UPDATE and takes an expected status; on a mismatch it writes nothing and TaskChangedError names who moved it. The list checkbox (list-actions.ts:63-68), Approve and Send back (review-banner.tsx:42,54), the status menu, Waiting and Scheduled (status-control.tsx:46,84,97) and Cancel with Undo (header.tsx:78-80) all send the status they showed. Verified by reading the diff.
- G2B-V02 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap), fixed: Label the task page's empty assignee option 'Unassigned', not the assignee's name plus '(external)'. The task page's Assignee is now the shared AssigneePicker chip. Its first option reads 'Unassigned' (dashed circle), followed by Team and Contractors groups, with a check on the current pick. A legacy free-text assignee is no longer offered as an option. It shows as a muted line above Notes ('Assigned in Asana to X', view.tsx:120). Checked on /tasks/cmtg25yuf01zsjphs0xu5d2fl at 1280 with the picker open.
- G2B-V03 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap), fixed: Show the real overdue date instead of 'yesterday' on every late task. dueLabel now returns 'yesterday' only for -1 day, 'Nd late' from 2 to 6 days, and after that the calendar date (year only when it differs). The chip shows the date in red when overdue. /tasks/all at 375 and 320 shows 'Aug 28', 'Aug 30', 'Sep 2' in red with nothing clipped. Today shows 'Yesterday', '2d late' and 'Oct 16'.
- G2B-V04 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap), fixed: Give the task title a column on phones; today it is 0px wide. The tasks table is gone. TaskRow is a two-line row below lg or 34rem: the title on line one; property, avatar and due chip on line two. The whole row is a link to the task. On /tasks/all?owner=none the title measures 222px at 320 and the row reads in full at 375. The page has no sideways scroll.
- BTASKS-003 (Branch: Today, All tasks, new task and the task page), fixed: Unticking a repeating task leaves its spawned copy behind, so a mis-tap duplicates the series. Fixed in 4cf099d (on top of dd00a9e): reopening a repeating task takes back its untouched next copy; finishing again reuses a touched one. Verified in the diff.
- BPLAY-001 (Branch: playbooks, templates and repeats), fixed: Unticking a finished repeat keeps its next copy; re-ticking makes another. Fixed in 4cf099d (on top of dd00a9e): createNextRepeat reuses the copy a finish already made, and reopening takes back an untouched copy with its REPEAT_CREATED line (core.ts, repeat.ts isUntouchedCopy). Verified in the diff.
- BPLAY-008 (Branch: playbooks, templates and repeats), fixed: A dropped connection on Create wipes the whole review. Fixed in 4cf099d (on top of dd00a9e): apply-flow calls through callAction, so a dropped connection returns an error instead of replacing the page. Verified in the diff.
- BPORTAL-001 (Branch: contractor portal and contractor sign-in), fixed: A dropped connection crashes the job page and wipes what the contractor typed. Fixed in 4cf099d (on top of dd00a9e): callAction (src/lib/action-result.ts) turns a dropped connection into "No connection. Try again when you have signal." on Send, Start job, Mark done and the checklist, and typed text is kept. Verified in the diff.
- BPORTAL-005 (Branch: contractor portal and contractor sign-in), fixed: An 'Open job' link from an email lands on My jobs after sign-in, not on the job. Fixed in 4cf099d (on top of dd00a9e): the proxy hands /p pages their path, and sign-in and the first-password step return there through a strict same-origin validator (src/lib/portal/next-path.ts). Verified in the diff.
- BCONTRACT-001 (Branch: contractors directory, portal access, Home and emails), fixed: The 'scheduled' email never says when the visit is. Fixed in 4cf099d (on top of dd00a9e): the Scheduled email reads "scheduled it for Thu, Oct 29", also when assigning an already Scheduled job (notifications/content.ts). Verified in the diff.
- BCONTRACT-003 (Branch: contractors directory, portal access, Home and emails), fixed: A dropped connection on any access action wipes the page, and Create login can lose the only copy of the password. Fixed in 0148abf (on top of 4cf099d): every Portal access card action runs through thenRefresh, which revalidates the contractor page in a finally block, so after a lost Create login response the retry gets "already has a login" back with a fresh card showing Reset password instead of Create. Offline is handled by callAction (4cf099d). Verified in the diff.
- BPORTAL-002 (Branch: contractor portal and contractor sign-in), fixed: Mark done reads 'Skip' and goes ahead when photos failed to upload. Fixed on main in 0ab449b (Connor deferred the choice; option A): Mark done stays disabled while any photo tile has failed, the tray leads with the count ("2 photos didn't upload: no connection"), and each tile has Retry or Remove. Leaving mid-upload also asks first.
- G2B-IV01 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap), fixed: Keep staff replies to one contractor away from the next contractor on the job. Fixed in 9f74ea1: Shared staff and system comments, status lines and files now record the contractor assigned at the time, set in setStatus, addComment and recordAttachment. The portal timeline, the new-update counts, the gallery and the file route all show a staff row only to that contractor, or to anyone when no contractor was assigned. Imported Asana rows stay visible. Rows written before the migration have no audience (no backfill), so staff replies already on a job still show to the next contractor. The assign-toast copy (I04) is a separate finding. The migration session expects no such rows in production (CSV tasks were never linked to contacts, and main had no app-created tasks or attachments as of Oct 22), so no backfill is planned. Production wasn't queried to confirm.
- BTASKS-037 (Branch: Today, All tasks, new task and the task page), fixed: Initials break on punctuation and email addresses ('J(' for Jacob (Jake) Hoak, 'F' for an email). Fixed in 9f74ea1: initials() now strips non-letters, drops anything in parentheses and reads a name containing '@' as an email's local part, so 'Jacob (Jake) hoak' gives 'JH'. Tests were added. It takes the first two words rather than the first and last, so a three-word name like 'Mary Ann Smith' gives 'MA'. '[email]' still gives 'F' because its local part is one word.
- G1A-V05 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve), fixed: Add a viewport meta to the email template so phones lay it out at screen width. Fixed in 9f74ea1: the one email template now has a <head> with a utf-8 charset meta and a width=device-width viewport meta, and render.test.ts checks for them. The G1A-032 color-scheme metas aren't in the block (that's a separate finding). Nothing in git shows the manual check in iOS Mail, Gmail iOS or Outlook iOS was run.
- G2D-IV01 (Staff sign-in lifecycle: sign out, a 30-day expiry mid-edit, changing a password, and passkeys), fixed: After sign-in, open the page the link asked for instead of Home. Fixed in 9f74ea1: the proxy now overwrites x-hg-app-path on every staff section request, requireUser redirects to /login?next=<path and query>, and login() sends staff to that path after checking it with staffReturnPath. That check only accepts Home or the seven (app) sections, never /p, and rejects '//', backslashes, control characters and dot segments.
- BPLAY-022 (Branch: playbooks, templates and repeats), fixed: New task's Repeats ignores the Due date and allows no date at all. Fixed in 9f74ea1: New task's Repeats now takes its day from the Due date (or today when there is none). Choosing a repeat with no Due fills Due with the first occurrence, and changing Due moves a day that came from it, so Due Nov 15 gives Monthly on the 15th. The server also dates an undated repeating task on create and patch. The suggested "First one due" line in the panel was not added; the filled Due field shows the date instead.
- BPLAY-009 (Branch: playbooks, templates and repeats), fixed: Editing a title by hand freezes its [Tenant] and blocks Create. Fixed in 9f74ea1: titleOf now runs applyTokens over the hand-edited title as well, so filling Tenant after editing a title clears its [Tenant]. That clears the red border, the hint and the disabled Create, which all read from titleOf.
- BCONTRACT-008 (Branch: contractors directory, portal access, Home and emails), fixed: Approve reads 'Connor moved it to Done', and staff setting In progress reads 'Connor started the job'. Fixed in 9f74ea1: Approve reads 'Connor approved it', and 'started the job' is written only for a contractor's own Start, so a partner's move reads 'Connor moved it to In progress' in both the email and the portal Updates. The extra payoff copy ('Thanks, Zack.') and a 'See job' button were not added (the button is still 'Open job'), and that copy is left to Connor.
- BCONTRACT-V03 (Branch: contractors directory, portal access, Home and emails), fixed: Job emails never name the unit. Fixed in 9f74ea1: the outbox now selects the task's unitLabel, and the job line names the unit the way My jobs does, so 'Bathroom tile' with unit 2 emails as 'Bathroom tile, 415 Crescent Ave · 2'. Two small gaps: a bare number reads '· 2' rather than 'Unit 2', and the suffix is still added when the title already names the unit.
- TASKS-010 (Tasks list, new task and task detail), fixed: Long titles are cut off on the task page because the title is a one-line input. Fixed in 9f74ea1: where field-sizing:content is supported, the title textarea no longer gets an inline px height, so it re-fits when the width changes. Where it isn't supported, the JS fallback now re-measures through a ResizeObserver whenever the width changes, covering a rotated phone or a narrower window. I read the code but didn't re-run the resize test. The 24px size is still tracked in TASKS-015.
- G2C-V06 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent), fixed: Mark overdue dates red in the property Tasks card, as /tasks already does. Fixed in 9f74ea1: the rebuilt card colors late dates red using isTargetLate, which excludes Review and Waiting, and drops the current year, so 767 Prospect's Mud Drywall reads a red 'Aug 28' as on Today. One small difference: the card uses isTargetLate for staff tasks too, so a staff task in Scheduled is judged by its visit date. For every other status that is the same as isOverdue.
- PORTFOLIO-V01 (Portfolio list and new property), fixed: 765 and 767 Prospect both carry one combined SREO line, so the totals double-count it. Fixed on main and live on production (4b9b14f, 3390e7d; the data migration confirmed in the live database). The combined 765/767 SREO line is split evenly (Connor's call): $120,000 purchase, $275,000 value and $146,445 loan each. The importer splits combined lines the same way.
- PORTFOLIO-001 (Portfolio list and new property), fixed: Units column disagrees with the property page on 5 of 11 properties. Fixed on main and live on production (4b9b14f, 3390e7d; the data migration confirmed in the live database). Portfolio, its total and the property header read one count, and house-meter rows never count. Since Oct 23 the count follows the unit records (add or remove a unit to change it), and 767 Prospect's third record was removed (Connor: two units).
- FEEL-001 (Lens: interaction quality, feedback, states, speed and accessibility), fixed: A typo in a money field silently wipes the stored value. Fixed on main and live on production (4b9b14f, 3390e7d; the data migration confirmed in the live database). A typed number that doesn't read is refused with the field named and nothing is written; blank still clears. Listing rent and sq ft too, and loan rates keep three decimals.
- DEALS-001 (Deals pipeline, new deal and deal detail), fixed: Esc saves the edit instead of reverting it. Fixed on main and live on production (4b9b14f, 3390e7d; the data migration confirmed in the live database). useInlineEditKeys skips the save after Esc on the address and task title (InlineAddressField), the deal fields and the CapEx rules editor.
- PUBLIC-001 (Login and the public site), fixed: A failed move-in submit wipes the whole report and shows 'That page didn't load'. Fixed on main and live on production (4b9b14f, 3390e7d; the data migration confirmed in the live database). The move-in submit goes through callAction: a dropped connection shows the offline message and every answer stays.

## Areas

| Area | Findings | Critical | High |
|---|---|---|---|
| [App shell, sidebar, top bar, global search and Home](shell.md) | 40 | 0 | 7 |
| [Portfolio list and new property](portfolio.md) | 34 | 0 | 2 |
| [Property detail page (future property hub)](property.md) | 45 | 0 | 12 |
| [Deals pipeline, new deal and deal detail](deals.md) | 61 | 0 | 9 |
| [Tasks list, new task and task detail](tasks.md) | 30 | 0 | 4 |
| [Financials, rent roll and financial settings](financials.md) | 66 | 0 | 9 |
| [Contractors directory, contractor detail and Settings](admin.md) | 48 | 0 | 6 |
| [Login and the public site](public.md) | 54 | 0 | 9 |
| [Lens: visual design system across every screen](visual.md) | 59 | 0 | 10 |
| [Lens: information architecture and global SaaS patterns](ia.md) | 31 | 0 | 6 |
| [Lens: phone and tablet experience on every route](mobile.md) | 26 | 0 | 6 |
| [Lens: interaction quality, feedback, states, speed and accessibility](feel.md) | 31 | 0 | 7 |
| [Lens: tables, numbers, money, charts and status](data.md) | 27 | 0 | 12 |
| [Lens: words on every screen](copy.md) | 40 | 0 | 10 |
| [Lens: the core jobs, end to end](journeys.md) | 15 | 0 | 2 |
| [Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve](g1a.md) | 35 | 0 | 4 |
| [After a tenant submits: the move-in report on the staff side](g1b.md) | 32 | 0 | 4 |
| [Repeats, playbooks and imported Asana history (D27, D28, D17, D24)](g1c.md) | 34 | 0 | 1 |
| [Photos, videos and documents: viewing and capturing, not just the upload box](g1d.md) | 49 | 0 | 4 |
| [What leaves the app: printouts, PDFs and the Google listing](g1e.md) | 38 | 0 | 2 |
| [QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views](g2a.md) | 40 | 0 | 5 |
| [Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap](g2b.md) | 37 | 0 | 7 |
| [A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent](g2c.md) | 51 | 0 | 9 |
| [Staff sign-in lifecycle: sign out, a 30-day expiry mid-edit, changing a password, and passkeys](g2d.md) | 28 | 0 | 0 |
| [Branch: Today, All tasks, new task and the task page](btasks.md) | 37 | 0 | 5 |
| [Branch: playbooks, templates and repeats](bplay.md) | 31 | 0 | 4 |
| [Branch: contractor portal and contractor sign-in](bportal.md) | 33 | 0 | 3 |
| [Branch: contractors directory, portal access, Home and emails](bcontract.md) | 24 | 0 | 1 |

## Method

### How the review was run

Overnight on Oct 22 to 23, 2026, about 150 agents ran in four multi-agent workflows. Every finding was checked by a second agent that hadn't written it.

1. **Benchmark research.** Seven research angles (design-community consensus, finance software, work tools, CRMs and record tools, crisp dashboards, property and field-service software, phone-first business apps), a critic pass and a curator settled which products set the bar, citing 106 sources. Each product was checked on Mobbin. Ramp has no Mobbin screens, so its principles come from its own posts and Mercury and Brex screens show them.
2. **Teardown of main.** A production build of `main` at ea137a3 ran locally with the real local data, signed in as Connor through a session cookie. Every non-GET request was blocked, so nothing was written. Fifteen reviewers covered eight areas (shell and Home, Portfolio, the property page, Deals, Tasks, Financials, Contractors and Settings, the public site and login) and seven lenses (visual system, information architecture, phone and tablet, feedback and speed, tables and money, words, end-to-end jobs). They used Chromium and WebKit at 1280, 768, 375 and 320 wide, in light and dark, and opened dialogs, menus, edit modes and validation states. A skeptic re-tested every reviewer's findings, confirming, correcting or refuting each one. Two completeness rounds added nine more areas: the contractor loop before the invites, the move-in report on the staff side, repeats and playbooks, photos and documents, what leaves the app (print, PDFs, the Google listing), QuickBooks go-live, many hands on one record, a unit changing tenants, and the staff sign-in lifecycle.
3. **Inspiration pass.** For each area, an agent studied how the researched products solve the same jobs on Mobbin. It upgraded weak references and added "steal this" findings, each checked against today's app and then verified.
4. **Migration-branch pass.** Branch 4652abb ran from its own export with a copy of the branch database, with staff and contractor sessions from the branch's own device-check setup. Re-checkers went through the 403 task, contractor and portal findings, and a skeptic had to uphold every "fixed" or "superseded" before a finding was dropped. Four reviewers walked the branch's new screens. Later fixes in dd00a9e, 4cf099d and 0148abf were verified by reading the diffs. Five independent verifiers then checked the 9f74ea1 batch against each finding: 16 fixed, 25 partly fixed and 13 still open. Two follow-ups in c805e38 were verified in the diff.
5. **Synthesis.** An editor merged 721 duplicates into 1,092 distinct findings and grouped them into 14 themes. Branch fixes since then leave 1,076. A design lead and a product lead wrote the North star and the Roadmap, and I corrected a few figures and one inconsistency between them.

### Numbers

- 4,866 screenshots captured, 1,538 of them cited as evidence. They stay local because they show real tenant, loan and P&L figures.
- 1,580 distinct Mobbin references across 937 findings. Mercury, Stripe, Linear, Attio, Airbnb, Jobber, Zillow, Linear Mobile and Things 3 are cited most.
- 63 findings were refuted during verification. They're listed below with the reason.

### Limits

- Timing comes from a local production build, so production latency between Vercel and Supabase wasn't measured.
- Because writes were blocked, post-save and save-error states were read from the code rather than seen.
- Mobbin's catalog sets what could be shown: Ramp isn't there, and some apps only have their phone or their web screens.
- The branch was reviewed at 4652abb, plus the five commits verified since (through c805e38). Anything that has landed after that isn't reflected.
- This is input for planning. Design changes still go through Connor, and the settled decisions stand unless a finding says it challenges one.
