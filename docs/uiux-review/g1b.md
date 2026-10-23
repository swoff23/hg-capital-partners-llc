# After a tenant submits: the move-in report on the staff side

Part of the [UI/UX review](README.md). 32 findings: 0 critical, 4 high, 9 medium, 19 low.

## How it should work

The move-in report becomes a small review record that the two partners settle together. After review it is the baseline the unit keeps for move-out.

Arrival. The report reads like a Jobber client request (https://mobbin.com/screens/19ac56a2-4e6f-4c99-aa80-02c6eed8d5b3): a status chip above a short title ("Unit 2, 767 Prospect"), a resident card, and the answers shown read-only. The rail shows the source and the submitted time, the way Stripe shows Source (https://mobbin.com/screens/7af4eefa-754f-4c2f-a689-c790b1eb4cad). On Today the report gets its own group with a one-line banner, the way Things 3 announces new to-dos (https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6). The header says who acts next ("Waiting on Connor or Pieter") until one of them taps I'll take it. Brex names the pending reviewer the same way (https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c).

Review. Fair and Poor items come first. Next is a quiet Noted group for Good items the resident commented on, then the rooms, collapsed. Each flagged item gets one of two verbs, Repair or Keep as is, taken from Mercury's Approve and Decline panel (https://mobbin.com/screens/8156ac94-1476-4ca2-801e-89444dd78545) and Ramp's two-verb inbox. Repair opens a prefilled task sheet like Front's task from a conversation, with a footer naming who can see the task (https://mobbin.com/screens/6e5084d3-5bc3-4d61-b039-a85bc6e076d8). Keep as is records the condition as pre-existing. When an item matches the unit's equipment, it shows the equipment's age and its CapEx line, so an 18-year-old refrigerator reads as a replacement. Mark reviewed unlocks once every flagged item has a decision. It ends on an Undo toast and a status trail like Mercury's (https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13).

Record. One timeline, as in Stripe (https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2), merges system events with partner notes. A line from Front says who can see the notes (https://mobbin.com/screens/ff31846b-58e8-40fa-9437-b5ce12b29316). Repair tasks hang off the report like Linear sub-issues, with a "1 of 3 fixed" count (https://mobbin.com/screens/7c88fd2a-866e-4db1-b3ac-38cb5cd2c043). Each task can email Jordan when the work is done, as Basecamp's When done field does (https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c).

Upstream. Each unit sends the form with the property and unit filled in, and can send one reminder, following Mercury's Copy link (https://mobbin.com/screens/470d0b78-169a-43d0-b1b3-394f8eda528d). A partner can ask for a photo of a flagged item through a secure link for that one item, the way Mercury requests details (https://mobbin.com/screens/c4ad1f84-d858-47bb-8db6-7fd111378848). Junk submissions are dismissed with Undo instead of becoming done tasks.

Sizes. On a phone the record follows Linear Mobile (https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): the title wraps, chips sit in one row, flagged items expand in place to show the two verbs, and the timeline comes last. Tablet keeps one column and turns the rail into chips. Color is reserved for Fair and Poor.

<details><summary>What the reviewer covered</summary>

Server on :3200 was up. Exercised: GET /api/search?q=move-in and ?q=inspection, signed in. Neither returned a 'Move-in inspection for' task, only legacy Asana tasks ('Upper Tenant move-in', 'Philo move-in'), so no submission exists locally. /residents/moving-in signed out at desktop and mobile (Chromium): filled tenant, 767 Prospect, name and email, then clicked Submit. The POST was blocked and the page fell to 'That page didn't load' (PUBLIC-001). /tasks?owner=none at desktop and mobile, with an eval: 32 open unassigned tasks, 30 of them undated, so a new undated report sorts to row 3. /tasks default (Open, all owners) at desktop, with an eval: the first undated row is index 113, so a new report lands at row 114 of 193. / (Home) at desktop and mobile shows My open tasks only, plus the 193 count. /properties/767 Prospect Tasks card at desktop, with an eval: 29 open tasks, the first undated at row 22, inside a 420px inner scroll. /tasks/[id] on an unassigned, undated 767 Prospect task (cmtg25yzs02vqjphsw1ch1mj7) with a report injected locally and never saved. I built it the way actions.ts does: tenant, date and property lines, 5 room headings, 46 rated items with Oven Fair, Shower/Tub Poor and Bedroom Windows Fair carrying comments, additional comments, and 'Submitted by'. Captured at 1280, 768 and 375 in light, at 1280 and 768 in dark (scrolled to the Poor line), and in WebKit at 375 and 320. The textarea is 96px tall over 1,456px of content, the Poor line is line 39 of 64, and the scrollbar is 0px wide. Print media at 816x1056 plus a Chromium PDF, using a copy of print-probe.mjs at review/g1b/print-probe-g1b.mjs: 1 page, the shell prints, only 3 lines of the report appear, and the app has 0 print rules. WebKit at desktop and mobile on the plain undated task shows an empty Due date rendered as today's date. /settings/move-in-form at desktop, aria only, to confirm there is no responses view. Mobbin: 16 searches (web and iOS screens plus 1 flow search); Ramp, SafetyCulture, Stessa, Baselane and TurboTenant didn't come back, so I cited the closest apps returned (Mercury, Airwallex, Expensify, Brex, Zillow, Turo, Yuka, Bevel). Not reachable: a real submission (writes are blocked by design), any email (none exists), the Today view, the task side rail and the contractor portal (not built yet), and a real iPhone (WebKit stands in for Safari only). One slip: I made a single read-only zoom call on the user's Browser pane by mistake. It captured a screenshot only; there was no navigation or input.

</details>

## Findings

### G1B-001

**Nobody is told a move-in report arrived; put new resident reports at the top of Home for both partners**

High · Design change · effort M · `Home (/) and the move-in submission path` · Home and Today become one work queue

- **Today:** True today: an unassigned, undated move-in task never reaches Home and sits at row 114 of 194 in /tasks and among the undated rows at the bottom of the property card. But the approved Today view (shipping Oct 27) already puts unassigned tasks, explicitly including move-in submissions, at the top of both partners' Mine column, so the gap is days long, not structural; the structural gap is that Unassigned is crowded with 32 stale rows (G1B-007).
- **Why:** Linear routes new inbound items to an Inbox both owners read; Ramp and Xero have an 'awaiting review' queue. Here a report saying 'Smoke Alarm: Poor' or a leaking tub can sit unseen for weeks, and the move-in record a deposit decision rests on is never acknowledged while the resident can still be asked about it.
- **Change:** Until Today ships, add a 'From residents' block at the top of Home, shown to both partners whenever an unreviewed report exists and absent otherwise. One row per report: 'Move-in report · 767 Prospect, Unit 2' with the subline 'Jordan E. · 3 need attention · Today', plus the blue unread dot in the row's top-right until either partner opens it. The row opens the report. Mark reviewed (G1B-009) removes it. After cutover the same rows become the first group of Today's Mine column (G1B-007).
- **Desktop, tablet, phone:** Desktop 1280: full-width list above My open tasks, one line per report with the count right-aligned. Tablet 768: same rows on two lines. Phone 375: two-line rows, with property and unit on line one and '3 need attention · Today' on line two; the dot stays and nothing drops.
- **Reuse:** Extend the Home task list markup in src/app/(app)/page.tsx (Card with divide-y rows). The unread dot follows the CLAUDE.md top-right rule; Badge red only when an item is Poor.
- **References:** 
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): A 'You have 1 new to-do' banner with OK sits above Today's list and is dismissed once seen; this is the model for a new resident report arriving at the top of Home.
  - [Mercury](https://mobbin.com/screens/bd9f86e7-9ef2-4745-91b8-10d3fdad2ced): The Bill Pay Inbox tab carries a count, and the selected item opens in a right drawer with one primary Review button.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Inbox rows with an unread dot that open the item beside the list
  - [Linear Mobile](https://mobbin.com/screens/58a6ef8a-408a-4ce7-90d5-08033f7c5a47): Two-line phone inbox rows with a blue unread dot
  - [Xero](https://mobbin.com/screens/e4a6f6e1-5668-4e73-98ae-2ab3bb4f7274): 'Awaiting approval 1' as its own group with an inline action
- **Code:** `src/app/(app)/page.tsx:20`, `src/app/(marketing)/residents/moving-in/actions.ts:108-114`, `src/app/(app)/tasks/page.tsx:101`, `src/app/(app)/properties/[id]/page.tsx:46-47,178`
- **Verification:** partly. Reproduced every number: Home queries assigneeUserId = me only (page.tsx:20); /tasks has 193 open with 80 undated, first undated at row 114; /tasks?owner=none has 32 rows (2 dated Dec 1, 30 undated) so a report would be row 3; 767 Prospect's card has 29 open tasks, the 8 undated at rows 22-29, in a 420px box with 37px rows. Severity is overstated: the report is not lost, only unsurfaced, the local DB has never received a single move-in submission (/tasks?q=move-in&status=all returns only three legacy Asana tasks), and Today (Mine with Unassigned on top per migration default #1) ships Tue Oct 27 per the plan's schedule, four days from now. A Home block built 'until Today ships' would live for days. Fold this into G1B-007 (the durable version: a 'From residents' group in Today) and skip the Home stopgap. References: Linear beb9d6b3 verified on Mobbin (inbox list with unread dots and the item open beside it).

### G1B-003

**The 3 items that need action are buried among 46 'Good' lines; lead with what needs attention**

High · Design change · effort M · `Move-in report view (today the /tasks/[id] Description)` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. No move-in task exists in the branch database. Judged from the notes code and the unchanged submission formatter.
- **Today:** The Notes textarea on /tasks/[id] now grows to fit its text (notes.tsx:22-27), so all 64 lines of a report show instead of a 4-line window. It is still plain text: Fair and Poor lines look exactly like Good lines, room headings carry no weight, and the additional comments come last (moving-in/actions.ts:78-105). The page just gets very long, with the checklist, photos and Activity pushed far below.
- **Why:** Ramp, Expensify and lab-results apps show the exceptions and sum up the rest in one line. Connor's job is 'what needs fixing', and today he has to read 46 lines to find 3.
- **Change:** Render the report in this order:
1. A one-line summary: '3 need attention · 43 good'.
2. The resident's additional comments.
3. A 'Needs attention' list with one row per Fair or Poor item. Line one is 'Bathroom (Upstairs) · Shower/Tub' with a Poor or Fair badge; line two is the resident's comment.
4. Rooms as collapsed rows ('Kitchen · 14 good, 1 fair') that expand to every item.

Poor uses the red Badge tone and Fair uses amber; no other mark on the page uses those colors.
- **Desktop, tablet, phone:** Desktop 1280: summary and Needs attention in the main column, rooms below, rail on the right (G1B-006). Tablet 768: one column with rail chips. Phone 375: same order with rooms collapsed by default and two-line item rows; nothing drops.
- **Reuse:** Badge (amber, red); the divide-y rows used on Home; flat disclosure rows instead of the card-in-card unit accordions.
- **References:** 
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): Only the sections with a problem carry a red 'Missing' label at the right. Clean sections carry nothing, so the eye goes straight to the exceptions.
  - [Mercury](https://mobbin.com/screens/bd9f86e7-9ef2-4745-91b8-10d3fdad2ced): Three summary cards (Total outstanding, Overdue, Due in next 7 days) sit above the list. Take this for the '3 need attention · 43 good · 2 not rated' strip.
  - [Yuka](https://mobbin.com/screens/3e160990-7c3e-4f13-bf1b-25ca9f60b2c7): Flagged items first with colored dots, then '8 others ingredients · Risk-free' collapsed
  - [Bevel](https://mobbin.com/screens/cdc8b158-6bc1-44d1-8c35-7cc3440998e1): Lab report summary names the out-of-range values and sums up the rest as 'all within reference ranges'
  - [Expensify](https://mobbin.com/screens/3eeed405-32d1-4bc4-bb42-04d44b5286a5): Warning markers on only the lines that need attention
  - [Zillow](https://mobbin.com/screens/8743e2d5-d864-47c4-b7ec-43bd57df810d): Collapsible sections with a status chip per section
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): A red Missing flag sits on each section heading that needs attention, so problems show at the section level before the details.
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): The drawer leads with the amount and the status, then the timeline, then the fixed facts.
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Timeline entries are one line with 'View details' rather than the full payload.
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:228`, `src/app/(marketing)/residents/moving-in/actions.ts:86-103`, `branch: src/app/(app)/tasks/[id]/notes.tsx:22-27`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:78-105`, `src/app/(marketing)/residents/moving-in/actions.ts:84-114`, `branch-src/src/app/(marketing)/residents/moving-in/actions.ts:84-114`, `branch-src/src/app/(marketing)/residents/moving-in/actions.ts:113 systemPrincipal("Move-in form")`, `branch src/app/(marketing)/residents/moving-in/actions.ts:84-114`
- **Also found as:** JOURNEYS-I06 (Lens: the core jobs, end to end), G2C-I09 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** partly. Reproduced with the same injected 64-line report: textarea rows=4, clientHeight 96 / scrollHeight 1456 at 1280 (104 / 1846 on phone), only Tenant, Inspection date and Property visible at all sizes in Chromium and WebKit. One claim is wrong: the first problem is not line 39. 'Oven: Fair (Back left burner does not light)' is line 12, about 250px into the box; 'Shower/Tub: Poor' at line 39 is only the first Poor. The room-heading-out-of-view point holds (Bathroom heading at line 31, 8 lines above). Also note the report in every screenshot is synthetic (client-side injection into an existing task); no real submission exists. The recommendation itself is the right core change and stays inside existing primitives (Badge amber and red tones exist in ui.tsx:111-112).

### G1B-006

**Make the report a dated record tied to property, unit and resident, with a small review task pointing to it**

High · New capability · effort L · `New record: Move-in report (property and unit)` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. The branch schema has no MoveInReport model, and the form still only creates a Task (moving-in/actions.ts:107-114). The property page still lists active tasks only (properties/[id]/page.tsx:52-56), so a report drops off once it's marked done. New on the branch: Task.unitLabel (schema.prisma:263), which the record's unit field can reuse.
- **Today:** The only artifact is a Task: a title, a 64-line text description, propertyId and createdAt (schema.prisma:208-246). It has no unit; units are a JSON array without IDs (property-types.ts:19-24). There is no resident or lease model, no inspection-date or reviewed field, and the form's question labels exist only as text. Once the task is completed it drops out of every open list and off the property page, which shows OPEN tasks only (properties/[id]/page.tsx:46).
- **Why:** To settle a deposit you pull up 'Unit 2's move-in report' at move-out and compare. Stripe, Typeform and Tally keep each submission as a record with its own page, timestamp and source; a task is only the reminder to look at it.
- **Change:** Add one table, MoveInReport, with these fields:
- id; kind (move_in now, move_out later)
- propertyId; unit (the same unit reference the planned Task unit field uses)
- residentName, residentEmail
- inspectionDate, submittedAt
- answers: JSON with room and item labels copied at submit time, so editing the form in Settings never rewrites old reports
- additionalComments
- reviewedAt, reviewedBy
- supersedesId

The public action writes this row and creates one staff-only review task linked to it (G1B-024 title). Staff can re-point property or unit, with an activity entry; the resident's original choice is kept. The record page uses the G1B-003 layout. Its rail shows Resident, Property and unit, Inspected, Submitted, Source 'Move-in form', and Reviewed.
- **Desktop, tablet, phone:** Desktop 1280: main column plus a 280px rail. Tablet 768: the rail becomes a chip row under the title, per the approved task page. Phone 375: one column, with resident and submitted time in the meta line and the rest under Details at the bottom.
- **Reuse:** The approved page-with-rail layout for the task page (D31), Badge, BackLink; Property relation like PropertyAttachment.
- **References:** 
  - [Jobber](https://mobbin.com/screens/19ac56a2-4e6f-4c99-aa80-02c6eed8d5b3): A client-submitted request becomes its own record: a status chip above a short title, a client card with phone and email, the Requested date, the form answers as read-only question and answer pairs, and a Notes rail.
  - [Typeform](https://mobbin.com/screens/ff36a25d-3112-4aa7-92fc-91a091dafd5c): Each response is its own record with a timestamp header, prev/next and answers by question
  - [Tally](https://mobbin.com/screens/822df481-456b-4b79-a1cc-9f1b3d53cb04): Submissions stored as rows led by 'Submitted at'
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): Record header plus a Details rail with Source and Last updated
  - [Zillow](https://mobbin.com/screens/37f91800-8290-49f4-a022-5a6e2806659f): The property condition report is filed on the rental beside the lease
  - [Wise](https://mobbin.com/flows/b51c3670-4335-4d6e-9d06-0576684d443d): The Details tab of a finished transfer ends in Get PDF receipt, so the record can always be kept.
  - [Gusto](https://mobbin.com/screens/f97bf816-0c98-4b01-9ce3-fb1455e2c1b4): The documents table shows the name over a source sublabel and a status with its date.
  - [Jobber](https://mobbin.com/screens/2786f3f3-f53b-4845-8b5f-8bbb8cc054cb): Signing ends with 'Send your client a copy'; the signed record becomes a document both sides keep.
  - [Jobber](https://mobbin.com/screens/90de695b-5410-4843-a1ab-630f5ea06a3d): The final record shows Sent on and Approved on dates and a Download PDF, which is the fixed, dated form the move-in report needs.
  - [Mercury](https://mobbin.com/screens/ed84df94-2b05-4afc-b05f-49213b391967): Attachments on a record carry a type (Receipt, Bill, Other), so the filed PDF can be typed Move-in report in Documents.
  - [Lemonade Insurance](https://mobbin.com/screens/4fb854cb-31da-4289-8725-808f5a7ddf7f): A plain receipt PDF in a sheet with a download action, which is the tenant's copy.
  - [Typeform](https://mobbin.com/screens/71dbe2c0-580a-4814-a068-2e13cb4a5559): Form responses become a read-only report with Print.
  - [HubSpot](https://mobbin.com/flows/421ac9e9-a8fe-415d-acd2-b1aa258f1df9): Copy link and Download PDF beside a document preview.
- **Code:** `prisma/schema.prisma:208-246`, `src/lib/property-types.ts:19-24`, `src/app/(marketing)/residents/moving-in/actions.ts:77-115`, `src/app/(app)/properties/[id]/page.tsx:46`, `branch: prisma/schema.prisma:243-263`, `branch: src/app/(app)/properties/[id]/page.tsx:52-56`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `branch-src/src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `G1E/print-movein-light.pdf`, `src/app/(marketing)/residents/moving-in/actions.ts:79-110`, `branch:src/app/(marketing)/residents/moving-in/actions.ts:79-113 (description text, systemPrincipal)`, `Spec D16 (notes always visible to the assigned contractor, move-in tasks included)`
- **Also found as:** JOURNEYS-I07 (Lens: the core jobs, end to end), G1E-006 (What leaves the app: printouts, PDFs and the Google listing)
- **Verification:** confirmed. Schema confirmed (Task at schema.prisma:208-246 has no unit, source, reviewed or resident fields; units are label-only JSON in property-types.ts:19-24; property page loads OPEN tasks only, page.tsx:45-46). This is the foundation most other findings depend on (003, 004, 009, 011, 012, 013, 015, 017, 029), so high is fair with a real move-in due Nov 1-15 (D28). Gap: the public form never asks which unit (see G1B-V01), so the 'unit' field and 'the resident's original choice is kept' have no source until the form changes; the migration's Task.unitLabel (plan line 227) is the unit reference to reuse. Typeform ff36a25d and Stripe ebf7e9fe verified on Mobbin. Zillow 37f91800 is real but is the renter-side 'Your rental > Documents' page; Zillow's landlord lease menu with 'Create a property condition report' (https://mobbin.com/screens/e668a0c3-6dbe-44aa-9a9f-d5bacb907ac4) is a closer reference for filing the report on the tenancy.

### G1B-007

**Default #1 would open both partners' Mine column with 32 old unassigned tasks; give resident reports their own group**

High · Design change · effort S · `Today (planned), Mine column Unassigned section` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Default #1 is now built. The Mine column on /tasks (Today) opens with "Unassigned 34" (today--desktop-light.png). It collects every active task with no user or contractor that is undated or due by today, including legacy free-text names (list.ts:176-184; today-view.tsx:59-60). The top rows are overdue legacy jobs ("Mud Drywall" Aug 28, "Get 428 Upper A/C ON!" Aug 30), followed by undated Asana leftovers ("1-2 more plumbers", "2 more cleaners"). A move-in report would be one undated row among about 29.
- **Today:** /tasks?owner=none shows 32 open unassigned tasks today, 30 with no due date. Many are Asana leftovers that read like contacts: 'Myles Turnbull', 'Scott Anderson', 'Top Notch Sewer'. Migration default #1 puts unassigned tasks, 'e.g. move-in form submissions', in an Unassigned section at the top of both partners' Mine column. A new report would be one undated row among 33 there (row 3 in today's sort, behind two Dec 1 loan tasks).
- **Why:** Linear keeps new inbound items in their own queue, apart from the backlog, and Xero shows 'Awaiting approval' as its own group. Mixing a fresh resident report into 32 stale rows rebuilds the burying problem at the top of the new screen.
- **Change:** Refine default #1:
- A 'From residents' group comes first in Mine. It holds only unreviewed resident submissions and hides when empty.
- The Unassigned section keeps staff-created tasks only.
- Before cutover, triage the 32 legacy unassigned tasks (assign, date or delete them) so Unassigned starts near zero.
- **Desktop, tablet, phone:** Desktop: the groups stack in the Mine column. Tablet and phone: the same groups in the Mine tab with two-line rows; 'From residents' never collapses.
- **Reuse:** Today groups from the migration spec; rows from G1B-001.
- **Challenges:** Migration spec default #1 (unassigned tasks, e.g. move-in submissions, shown in an Unassigned section at the top of Mine)
- **References:** 
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): Today is split into groups, each with a gray project sublabel under the title. A new item gets announced above the groups instead of being mixed into them.
  - [Front](https://mobbin.com/screens/e8511de2-eaee-486f-8071-4d184bb24274): The sidebar separates Open, Assigned to me, Later and Done with counts. Inbound work keeps its own lane.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Inbox for new items, kept separate from issue lists
  - [Xero](https://mobbin.com/screens/e4a6f6e1-5668-4e73-98ae-2ab3bb4f7274): Drafts, Awaiting approval and Awaiting payment as separate counted groups
  - [Apple Maps](https://mobbin.com/screens/21918293-e48b-48ac-ba9c-eb79fa478271): Submitted reports grouped by In review and Reviewed
- **Code:** `src/app/(app)/tasks/filters.tsx:80`, `branch: docs/asana-migration-plan.md:96 (default #1)`, `branch: src/lib/tasks/list.ts:176-184`, `branch: src/app/(app)/tasks/today-view.tsx:59-60`
- **Verification:** confirmed. Reproduced: /tasks?owner=none returns 32 open rows, 2 dated (Dec 1) and 30 undated, including contact-like Asana leftovers 'Myles Turnbull', 'Scott Anderson', 'Top Notch Sewer', 'Robert Pollock', 'Buffalo Exterminators'. Migration default #1 (plan line 96) puts these in an Unassigned section at the top of both partners' Mine, so a report would be one row among 33. conflicts_with correctly names default #1, which is still listed under 'Defaults I filled in (confirm or correct)', so this is a timely refinement. Caveat: the production load on Oct 27 re-imports open Asana tasks, so the legacy count will change; triage after the load. This should absorb G1B-001. Linear beb9d6b3 verified.

### G1B-002

**The tenant's report is an editable box that saves on blur, so one stray edit rewrites the record with no history**

Medium · Fix · effort S · `/tasks/[id] Description on a move-in task` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. There is no move-in task in the branch database to screenshot: searching "Move-in" returns only Asana tasks. Judged from code.
- **Today:** The move-in report still goes into the task's notes (moving-in/actions.ts:107-114). On /tasks/[id] that is now an auto-growing Notes textarea that saves on blur (notes.tsx:29-32,42-52). The branch adds NOTES events, so the timeline says "Connor edited the notes" (core.ts:445-450; activity.ts:152-153), but the event stores no before-text, so a stray edit still can't be seen or undone. Under D16 the same notes show to an assigned contractor, labeled "Visible to Zack" (notes.tsx:36-41).
- **Why:** A move-in report is evidence. Stripe never lets you edit what a customer submitted; you add a note beside it in the Timeline. In a deposit dispute HG has to show exactly what the resident reported, untouched.
- **Change:** The same split still fits: store the submission apart and render it read-only. Smallest step on the branch: have patchTask store { from } in the NOTES event's data (core.ts:446-450) so the original text can be recovered from Activity.
- **Desktop, tablet, phone:** Same at all sizes: a read-only block above an empty notes field. On phone the block uses the exceptions-first layout from G1B-003.
- **Reuse:** patchTask in src/lib/tasks/service.ts stays as is for notes; the read-only renderer is shared with G1B-003.
- **References:** 
  - [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a): Each edit becomes an Activity entry ('changed Stage and 7 other attributes') that expands into old and new values per field, with Hide all changes.
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): Payment record is fixed; staff add notes in the Timeline with 'Add note'
  - [Stripe](https://mobbin.com/screens/966b2f85-123b-4302-b505-08eb9b5a9724): Notes have their own edit and delete menu, separate from the record
  - [Snowflake](https://mobbin.com/screens/87a5cccb-7753-4fa7-9055-5dc353f26380): Versions kept with who and when instead of overwriting
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:210-235`, `src/app/(marketing)/residents/moving-in/actions.ts:77-112`, `prisma/schema.prisma:208-246`, `branch: src/app/(app)/tasks/[id]/notes.tsx:22-52`, `branch: src/lib/tasks/core.ts:445-450`, `branch: src/lib/tasks/activity.ts:152-153`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:107-114`
- **Verification:** partly. Confirmed in code: the whole report is written to Task.description (actions.ts:78-110) and DescriptionField is a plain textarea that commits on blur (task-detail.tsx:210-235); the Task model has no history today. Two calibrations: (1) the approved schema batch adds TaskEvent with a NOTES kind, actor and data JSON (migration plan line 228, task page lands Oct 28), so edits will at least be logged with who and when; (2) the accidental-edit risk is real but low-probability, so high is too strong. The bigger problem is that this finding and G1B-006 propose two different storage designs (Task.source + sourcePayload here, a MoveInReport table there). Pick one: build G1B-006's record directly and skip the interim Task.sourcePayload columns. Stripe ebf7e9fe verified on Mobbin (fixed payment record, Timeline with Add note).

### G1B-004

**Printing the report gives one page of app chrome and the first three lines**

Medium · Fix · effort M · `/tasks/[id] printed or saved as PDF` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. I opened /tasks/cmtg25z15033sjphs2wqn1xgb on :3300 in print media: 0 print rules, and the side rail, the header and the composer all still render. There is no @media print or print: variant anywhere in the branch's src, and no Download PDF.
- **Today:** Printing the task page prints the app header, sidebar control, Mark complete, a 4-line slice of the report and the upload zone on one page; no print styles exist in the app.
- **Why:** Deposit deductions and any small-claims defense rest on this report. Airbnb puts 'Print details' and 'Get a PDF' on a reservation, and Typeform has Print on a report. A printout that drops the ratings is worse than none.
- **Change:** Give the report a 'Download PDF' action, and make Cmd-P produce the same thing. The PDF contains:
- the line 'HG Capital Partners' and the title 'Move-in report · 767 Prospect Avenue, Unit 2'
- the resident, the inspected date and the submitted date
- the Needs attention list
- every room with every item and rating, then the additional comments
- once reviewed, the footer 'Reviewed by Connor Swofford on Oct 21, 2026'

Add app-wide @media print rules that hide the shell, sidebar, buttons and upload zones.
- **Desktop, tablet, phone:** Print doesn't depend on width. On phone, Download PDF sits in the record's ⋯ menu and opens the share sheet.
- **Reuse:** New print rules in src/app/globals.css; the G1B-003 renderer with every room expanded.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d2f35ffc-4877-4293-a439-5f6f5e873303): 'Print details' and 'Get a PDF' as rows on the reservation record
  - [Typeform](https://mobbin.com/screens/55137280-259a-4085-b2df-e0c29fcbff74): Report view with a Print button and a clean, chrome-free layout
- **Code:** `G1B/print-task-report.pdf`, `g1b/print-probe-g1b.mjs (printRules 0, header and aside visible)`, `src/app/globals.css (no @media print)`, `recheck/print-probe-b05.mjs (printRules 0, aside, header and composer visible)`
- **Verification:** partly. Reproduced with my own probe at 816x1056 print media: 1-page PDF, header and aside visible, textarea still 96px of 1456px, 0 print rules; grep finds no @media print or print: utilities anywhere in src. Calibration: printing a move-in report is an occasional action (a few per year, at deposit time), and most of the data loss disappears once G1B-003 renders the report as page content instead of a scroll box, so medium, not high. The kind is mixed: app-wide print rules that hide the shell are a fix, but a new 'Download PDF' action and a branded PDF layout are design work that needs Connor's approval.

### G1B-005

**Under D16, assigning the move-in task to a contractor shows him the tenant's name, email and comments; keep reports staff-only**

Medium · Design change · effort M · `Move-in task under the contractor portal (D16)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The branch builds D16 as written. The portal's getJob returns task.description as the job notes (portal/queries.ts:235,266), and a move-in task's description holds the tenant name, every rating and "Submitted by: name <email>" (moving-in/actions.ts:79-105). The staff Notes field labels this "Visible to {contractor}" (notes.tsx:36-41), and the assignee picker offers contractors on every task, move-in included (tasks/[id]/page.tsx:90-91).
- **Today:** Under the approved D16, assigning a move-in task to a contractor would show them the resident's name, email and full room-by-room report, because all of it is stored in task notes. Connor chose D16 knowingly; the exposure goes away if the report lives in its own record.
- **Why:** A contractor needs 'Tub caulk, upstairs bathroom, Unit 2', not the resident's email or their notes on every room. GitLab marks confidential issues in the header, and Front states who can view a task before you create it; HG's app has no staff-only marker at all.
- **Change:** Exclude resident submissions from D16. The report and its review task are staff-only and carry a gray 'Staff only' label in the header meta line. The review task's assignee picker lists staff only. Work reaches contractors only through repair tasks created from items (G1B-008), which carry the item, the resident's comment, the property and unit, and a staff-only link back to the report.
- **Desktop, tablet, phone:** The label sits in the header meta line at all sizes; on phone it is the first chip.
- **Reuse:** Badge gray. The TaskAccess grant in migration spec 5.x skips tasks whose source is move-in-form.
- **Challenges:** D16 (task notes always visible to the assigned contractor, including move-in tasks)
- **References:** 
  - [Basecamp](https://mobbin.com/screens/56f50dc4-7b99-409c-9d84-4bd6795fb5f3): A tab on the side of the page reads 'This card table is private to our team'. Use it as the always-visible Staff only marker on the report.
  - [Front](https://mobbin.com/screens/6e5084d3-5bc3-4d61-b039-a85bc6e076d8): The task created from a conversation ends with a line saying who will be able to view it. Each repair task should say what the contractor sees (the item and the unit, nothing about the resident).
  - [GitLab](https://mobbin.com/screens/a85369f7-9454-4d4f-a4ca-8a7736db5aee): 'Confidential' chip next to status, internal-note checkbox and a Confidentiality rail field
  - [Turo](https://mobbin.com/screens/f795a7e6-b6bb-4a76-a349-49a130b59068): Plain note on who can see sensitive personal details
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:105-112`, `branch: docs/asana-migration-plan.md:77 (D16)`, `branch: src/lib/portal/queries.ts:229-275`, `branch: src/app/(app)/tasks/[id]/notes.tsx:36-41`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:79-114`, `branch: docs/asana-migration-plan.md:77`
- **Verification:** partly. Observation confirmed: the title carries the tenant's full name, the description ends with 'Submitted by: name <email>' (actions.ts:105-109), and D16 (plan line 77) explicitly says notes are visible to the assigned contractor 'including imported and move-in tasks'. conflicts_with correctly names D16. Calibrate to medium: Connor chose this deliberately, the contractor already sees the property and usually meets the resident, and nobody has been assigned a move-in task yet. The recommendation adds more than it needs (a gray 'Staff only' chip in the header plus a special staff-only assignee picker, against D8's single shared list). Simpler path that respects D16: once G1B-006 moves the submission into its own record, the review task's notes hold only a link, so D16 exposes nothing; repairs go out as their own tasks (G1B-008). GitLab and Front references are plausible; not spot-checked.

### G1B-008

**Turn Fair and Poor items into repair tasks in one step**

Medium · New capability · effort M · `Move-in report, Needs attention list` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. Nothing on the branch turns a report line into a task. New task (/tasks/new) is still a separate page with a native date input, and createTask has no link back to a source report (core.ts:240-280).
- **Today:** Acting on 'Oven: Fair (Back left burner does not light)' today takes several steps: read it in the textarea, open New task (a separate page), retype the problem, re-pick the property, and come back. Nothing links the repair to the report.
- **Why:** Asana and Confluence let you pick which proposed items to create from a source, and Front's New task keeps the original conversation attached. That is the jump from record to action Connor needs, and it keeps contractor work free of resident details (G1B-005).
- **Change:** Each Needs attention row gets a checkbox, checked by default for Poor items. 'Create 3 tasks' opens a sheet of proposed tasks:
- editable titles, such as 'Fix back left burner, Oven, Unit 2'
- property and unit prefilled
- assignee, plus Due quick picks

Create links each task to the report, and the task shows 'From move-in report, Oct 20'. A toast reads '3 repair tasks created at 767 Prospect' with Undo. The report rows then show each linked task and its status.
- **Desktop, tablet, phone:** Desktop and tablet: side sheet from the right. Phone: bottom sheet, one task per row, with a sticky Create button.
- **Reuse:** Sheet and Toast (planned, React Aria per D9); createTask in src/lib/tasks/service.ts with a new reportId link; D7 quick picks.
- **References:** 
  - [Front](https://mobbin.com/screens/6e5084d3-5bc3-4d61-b039-a85bc6e076d8): New task from a conversation quotes the original, prefills the title and body, offers Assignee and Tags chips, and ends with a visibility line and Cancel or Create.
  - [Linear](https://mobbin.com/screens/1ea32209-1221-46de-b4ad-875a8f1b5777): An inline sub-issue composer inside the parent record, with property chips (status, priority, assignee) and Create. The repair task is made without leaving the report.
  - [Asana](https://mobbin.com/screens/2a7382b4-b01d-43ae-88b2-fe8e45bc1625): 'Choose which tasks to keep', with checkboxes and 'Add task'
  - [Confluence](https://mobbin.com/screens/3ba4cd2f-6143-4eed-8c54-557e876e45dd): Side panel of proposed work items from a page, with 'Create all'
- **Code:** `src/lib/tasks/service.ts:56-75`, `branch: src/lib/tasks/core.ts:240-280`
- **Verification:** partly. Observation holds: /tasks/new reads only propertyId and dealId from the query (tasks/new/page.tsx:9), so a repair means retyping the problem, and nothing links it back to the report. The recommendation is heavier than the job: a report has about three flagged items, so a checkbox per row plus a bulk sheet of proposed tasks with editable titles, assignee and due pickers adds a whole new surface. Simpler and closer to the bar: a quiet 'Create task' action on each Needs attention row that opens the existing New task page prefilled (title, property, unit, the resident's comment) and stores the report link; the row then shows the linked task's status. That reuses /tasks/new with two more query params instead of a new Sheet. References plausible; not spot-checked.

### G1B-009

**Replace 'Mark complete' with 'Mark reviewed' that records who and when and keeps the report on the unit**

Medium · New capability · effort S · `Move-in report header` · Rentals, residents and the public site run one lifecycle

- **Today:** Completing the task hides it from every open list and the property page. Who completed it is not stored today, but the approved migration adds completedByUserId and status events with the actor on Oct 28.
- **Why:** Mercury and Airwallex show 'Submitted', then 'Pending review', then who approved it, all on the record. New York's 2019 deposit rules (General Obligations Law 7-108) expect an agreed written record of condition at move-in and an itemized statement within 14 days of move-out. A dated 'Reviewed by Connor' is the minimum acknowledgement; confirm the details with HG's attorney.
- **Change:** The header status reads 'To review' or 'Reviewed'. The primary button 'Mark reviewed':
- sets reviewedAt and reviewedBy
- closes the review task and removes the Home and Today row
- shows the toast 'Reviewed. 3 repair tasks open' with Undo

The report stays on the unit and in Responses. The meta line and the PDF show 'Reviewed by Connor · Oct 21'.
- **Desktop, tablet, phone:** Desktop and tablet: button at the top right of the header. Phone: a sticky bottom bar holding Mark reviewed and Create tasks.
- **Reuse:** Button primary; Badge gray for To review and green for Reviewed; Toast (planned).
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): After Approve, the panel shows a vertical trail (Submitted, with date and person, then Approved, with date and person, then the pending next step) and a toast naming the action.
  - [Mercury](https://mobbin.com/screens/8156ac94-1476-4ca2-801e-89444dd78545): A Pending Review chip in the header, with Approve as the primary button beside Decline and More.
  - [Mercury](https://mobbin.com/screens/cbeea523-ac61-492f-b65f-2d715ab9be54): 'Submitted Oct 28 at 6:11pm', then 'Pending Review', with Approve and Decline on the record
  - [Airwallex](https://mobbin.com/screens/a21ef4c4-38e3-475e-b8b0-2618f40df869): Report activity: who submitted, when, current step
  - [ClickUp](https://mobbin.com/flows/19a9f545-daa2-4792-b300-6c5ecd048c90): Pending becomes Approved in the header, with Reopen
  - [Miro](https://mobbin.com/flows/f7a593a4-2783-4a90-8049-55021a9ad282): Approve, then a toast, then an empty 'No requests to review' state
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:41-65`, `src/app/(app)/properties/[id]/page.tsx:46`
- **Verification:** partly. True today: CompleteButton is the only action (task-detail.tsx:41-62), toggleTask records no actor, and the property page shows OPEN tasks only, so a completed report drops out of sight. But 'nothing records which partner looked at it' is fixed by the approved schema (Task.completedByUserId and STATUS TaskEvents with actor, plan lines 227-228, shipping Oct 28). What remains unique here is the label ('Mark reviewed' on the report) and that the report must stay findable after review, which G1B-006 and G1B-013 already cover. Keep this as a small copy and state change on the G1B-006 record rather than a separate feature. The NY GOL 7-108 reference is broadly right (2019 HSTPA: condition agreement at move-in, itemized statement within 14 days of move-out), and the finding properly defers to counsel.

### G1B-010

**Email both partners once when a resident report arrives**

Medium · New capability · effort S · `Email (new): resident report received` · Rentals, residents and the public site run one lifecycle

- **Today:** No email is sent, and the repo has no mail library. D20 limits staff email to contractor updates, and D30 budgets Resend at 100 a day.
- **Why:** Residents are outside the app, like contractors, and their submissions cross the same outside-to-staff line D20 is drawn around. One email per report is a handful a month. Linear lets you subscribe to 'added to the triage queue', and one-button emails keep it calm.
- **Change:** Extend D20 so a resident submission sends one plain email to both partners through the same outbox.
- Subject: 'Move-in report: 767 Prospect, Unit 2'
- Body: 'Jordan E. submitted a move-in report. 3 items need attention: Shower/Tub (Poor), Oven (Fair), Bedroom windows (Fair).'
- One button: 'Open report'

The resident's email address stays out of the email.
- **Desktop, tablet, phone:** Single-column email; the button is full width on phone.
- **Reuse:** NotificationOutbox and Resend from migration spec 5.4; the approved plain email template (smaller screen 7).
- **Challenges:** D20 (staff emails only when a contractor updates their job)
- **References:** 
  - [Shopify](https://mobbin.com/screens/af0cafb5-f905-4e8f-9728-b76de3810e6b): Plain transactional email with one primary button and a short summary
  - [Linear](https://mobbin.com/screens/980af8d9-c125-4164-90ed-727692cd6946): Notification for 'An issue is added to the triage queue'
  - [Hotjar](https://mobbin.com/screens/f9a70dd3-b0af-4a79-9ebd-8aa15305465b): Email for new survey and feedback responses
- **Code:** `package.json (no mail dependency)`, `branch: docs/asana-migration-plan.md:81 (D20), :91 (D30)`
- **Verification:** confirmed. No mail dependency in package.json and no mail code in src. D20 limits staff email to contractor updates and D30 budgets Resend at 100 a day; conflicts_with names D20 correctly. The case holds: residents are outside the app like contractors, reports are rare (zero so far), and one plain email per report costs nothing against the budget. Keeping the resident's email out of the message is a good touch. Together with G1B-007 this is enough; G1B-001 and G1B-014 add further surfaces for the same alert and should be dropped or folded in. References plausible; not spot-checked.

### G1B-012

**Items the resident skipped vanish from the record; list them as Not rated**

Medium · Fix · effort S · `Move-in report content` · Rentals, residents and the public site run one lifecycle

- **Today:** The form sends only rated items (move-in-form.tsx:95-97 filters out empty ratings), and the action prints only what it receives (actions.ts:96-99). A skipped Dishwasher simply isn't in the report, so the record can't tell 'skipped' from 'not on the form' or 'removed later in Settings'.
- **Why:** At move-out, 'never rated' and 'not asked' lead to different deposit outcomes. Brex marks required pieces as 'Missing' instead of hiding them.
- **Change:** Store every item on the form at submit time, with a null rating when skipped. Under the summary, show 'Not rated (2): Dishwasher, Patio/Deck'. Room rows count them too: 'Kitchen · 13 good, 1 fair, 1 not rated'.
- **Desktop, tablet, phone:** Same line at all sizes; on phone it wraps to two lines at most.
- **Reuse:** Same renderer as G1B-003.
- **References:** 
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): Required pieces marked 'Missing' instead of omitted
  - [Zillow](https://mobbin.com/screens/8743e2d5-d864-47c4-b7ec-43bd57df810d): Sections flagged Incomplete where answers are missing
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:95-97`, `src/app/(marketing)/residents/moving-in/actions.ts:96-99`
- **Verification:** confirmed. Confirmed: ratings are toggle buttons with no required rule, the client drops unrated items (move-in-form.tsx:95-97), and the action prints only what it receives (actions.ts:94-97). Since the form already offers N/A, there is a simpler alternative worth weighing against storing nulls: require one rating per item on the form, so every report is complete and 'skipped' can't happen. Either works; storing every item with labels at submit time is still needed for G1B-006.

### G1B-013

**Keep each report on its unit in the property hub, with On file or Missing per unit**

Medium · Design change · effort M · `Property hub (D10): Units tab, Documents, Activity` · Rentals, residents and the public site run one lifecycle

- **Today:** The report has no home on the property page, and it can't be placed on a unit today because the form doesn't collect one and the app has no occupancy data.
- **Why:** Zillow files the property condition report under the rental's Documents, next to the lease. At move-out the question is 'where is Unit 2's move-in report', and the answer should live on Unit 2.
- **Change:** In the D10 Units tab:
- The unit sheet gets a 'Move-in report' row, such as 'Oct 20, 2026 · Jordan E. · 3 need attention', which opens the record.
- The Units table shows 'On file' or a muted 'Missing' per unit.

Documents lists the generated PDF. Activity logs 'Move-in report received from Jordan E.' and 'Reviewed by Connor'.
- **Desktop, tablet, phone:** Desktop and tablet: a row in the unit sheet and a column in the Units table. Phone: unit rows show 'Report on file' as a subline, and 'Missing' only when the unit has a current resident.
- **Reuse:** Units table and unit sheet (PROPERTY-018), Documents tab (PROPERTY-028), Activity tab (PROPERTY-027).
- **References:** 
  - [Zillow](https://mobbin.com/screens/37f91800-8290-49f4-a022-5a6e2806659f): 'Add a property condition report' under the rental's Documents, beside the lease
  - [Check](https://mobbin.com/screens/713a6f8e-2a44-416f-96ec-4ac14a45beae): Known damages kept on the vehicle, with a count of reports
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Record activity logs what changed, who did it and when
- **Code:** `src/app/(app)/properties/[id]/page.tsx:42-56`
- **Verification:** partly. The property page does show a 'Units & access' card with Utilities and Equipment accordions per unit (767 Prospect has 'Upper / Upper Front', '1st Front / Lower Front', '1st Rear / Apt #3') and no place for a condition report. Two parts can't be built as written: the public form never asks for the unit (G1B-V01), so a report can't be filed on a unit yet, and there is no resident or occupancy data, so 'Missing only when the unit has a current resident' has nothing to compute from. Keep the unit row ('Move-in report · Oct 20, 2026 · Jordan E.') and drop the per-unit Missing column until occupancy exists. Zillow 37f91800 is the renter-side Documents page; the landlord-side lease menu e668a0c3 is a better fit.

### G1B-025

**Use one name for the report: 'Move-in report'**

Medium · Fix · effort S · `Public page, sent screen, task title, Settings` · Plain, consistent words

- **Migration branch:** Still applies on the migration branch. Page metadata says 'condition report' (moving-in/page.tsx:9). The heading and sent screen say 'Move-in report' (page.tsx:63,106; move-in-form.tsx:114). The task title says 'Move-in inspection' (actions.ts:109). The Settings subtitle reads 'Rooms and items tenants rate on the move-in inspection' (settings/move-in-form/move-in-form-editor.tsx:157).
- **Today:** The page metadata says 'condition report' (page.tsx:9). The page heading and sent screen say 'Move-in report' (page.tsx:63,106; move-in-form.tsx:114). The task says 'Move-in inspection', and the Settings subtitle says 'move-in inspection'.
- **Why:** Searching 'move-in report' finds nothing, because the task is titled 'Move-in inspection for...'. One concept should have one name.
- **Change:** Use 'Move-in report' everywhere, and 'Move-out report' for its pair. Settings subtitle: 'Rooms and items residents rate on the move-in report'.
- **Desktop, tablet, phone:** Copy only.
- **Reuse:** n/a
- **References:** 
  - [Zillow](https://mobbin.com/screens/37f91800-8290-49f4-a022-5a6e2806659f): One consistent term, 'property condition report', on the rental
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:9,63,106`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:114`, `src/app/(marketing)/residents/moving-in/actions.ts:109`, `branch: src/app/(marketing)/residents/moving-in/page.tsx:9,63,106`, `branch: src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:157`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:109`, `src/app/(marketing)/residents/page.tsx:29`, `src/app/(marketing)/residents/moving-in/page.tsx:9`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:138,147`
- **Also found as:** COPY-I13 (Lens: words on every screen)
- **Verification:** confirmed. Confirmed four names: metadata 'the condition report' (page.tsx:9), section and sent screen 'Move-in report' (page.tsx:63, move-in-form.tsx:114), task 'Move-in inspection for...' (actions.ts:109), Settings subtitle 'Rooms and items tenants rate on the move-in inspection' (move-in-form-editor.tsx:157); the form also says 'Date of inspection' and 'Complete the inspection below'. /api/search?q=Move-in%20report returns no results. The Zillow reference is thin for a copy fix but harmless.

### G1B-011

**Show when the report was submitted and that it came from the move-in form**

Low · Fix · effort S · `/tasks/[id] for a move-in task` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The form now writes as systemPrincipal("Move-in form") (moving-in/actions.ts:113), so the first Activity line on /tasks/[id] reads "Move-in form created this task" with its time (core.ts:272; activity.ts:129-130). The rail's Created row shows only the date, because it reads the createdBy User relation, which is empty here (tasks/[id]/page.tsx:199-200). That row is also hidden below lg (fields.tsx:169-171). There is no Source row and no submission time.
- **Why:** For a deposit file the submitted timestamp is the fact; the typed date is a claim. Stripe shows Source and Last updated on every payment, and Bonsai puts Submission Date first on a response.
- **Change:** When createdBy is empty, fill the rail's Created row from the CREATED event's actorLabel: "Move-in form · Oct 20, 6:42 pm". The meta-line advice stands.
- **Desktop, tablet, phone:** Desktop: rail rows. Tablet: chips. Phone: the meta line under the title.
- **Reuse:** The approved task page rail; formatters in src/lib/dates.
- **References:** 
  - [Stripe](https://mobbin.com/screens/7af4eefa-754f-4c2f-a689-c790b1eb4cad): The Details rail has a Source row ('Manually entered from Dashboard') and Last updated. HG can write 'Source: Move-in form' and the submitted time.
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): 'Source: Manually entered from Dashboard' and 'Last updated' in the Details rail
  - [Bonsai](https://mobbin.com/screens/8d7add19-5c75-4ef3-8dde-ee3b0f644127): Submission Date as the first field of a form response
  - [Airwallex](https://mobbin.com/screens/a21ef4c4-38e3-475e-b8b0-2618f40df869): Submitted time with timezone in the report activity
- **Code:** `src/app/(app)/tasks/[id]/page.tsx:63-80`, `src/app/(marketing)/residents/moving-in/actions.ts:80`, `branch: src/app/(app)/tasks/[id]/page.tsx:199-200`, `branch: src/app/(app)/tasks/[id]/fields.tsx:169-171`, `branch: src/lib/tasks/core.ts:272`, `branch: src/lib/tasks/activity.ts:129-130`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:113`
- **Verification:** partly. Confirmed: the task page shows only Assignee, Due date and Project (tasks/[id]/page.tsx:62-80) and never renders createdAt; the inspection date is whatever the resident typed (actions.ts:80). But this overlaps G1B-006, whose record rail already lists Submitted and Source, and the approved task rail already includes 'Created by' (plan line 403). As a standalone interim fix on today's task page it is low: the timestamp is stored, just hidden. A strong reference exists for the Source row: Lightfield's task panel shows 'Source' with the inbound item it came from (https://mobbin.com/screens/c1322cfa-763a-4f21-8b49-0062d3c40ed1).

### G1B-014

**Pin an unreviewed report above the property's task list instead of row 22 of 30**

Low · Design change · effort S · `/properties/[id] Tasks card` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. The Tasks card on /properties/cmtg25y4p0006jphsv3frndk6 (767 Prospect) has 32 active rows in the 420px scroll box (page.tsx:195): 13 dated, then 19 undated (eval of row dates). The new sort (page.tsx:86-88) would put a fresh undated report at row 14, still below the roughly 11 rows in view. Unassigned rows still show no initials chip, and there is no pinned line.
- **Today:** The card sorts by due date only (page.tsx:46-47), so an undated report lands among the 8 undated tasks at rows 22 to 30 of 767 Prospect's list. That is inside a 420px scroll box showing about 11 rows. Unassigned rows show no initials chip, so the report looks like nobody's task.
- **Why:** The property page is where Connor goes when he thinks of 767 Prospect, and a new resident report is the most time-sensitive item on it. Linear and Airbnb put the unread item first, with a dot.
- **Change:** When an unreviewed report exists, show one line above the task rows: 'Move-in report from Jordan E. · 3 need attention', with the blue unread dot at the right. The line opens the report and disappears once it is reviewed. In the D10 hub it moves into Overview's needs-attention list.
- **Desktop, tablet, phone:** One line at desktop and tablet; two lines on phone; nothing drops.
- **Reuse:** Row markup from G1B-001; the Tasks card header area.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/58a6ef8a-408a-4ce7-90d5-08033f7c5a47): Unread item marked with a dot and kept at the top
  - [Airbnb](https://mobbin.com/screens/6207c6d6-411f-4a6d-8564-2b9053bfd57b): Item needing action ('Change requested') surfaced in the list with a red marker
- **Code:** `src/app/(app)/properties/[id]/page.tsx:46-47,178`, `branch: src/app/(app)/properties/[id]/page.tsx:86-88,192-210`
- **Verification:** partly. Data reproduced: the card orders by dueDate only (page.tsx:45-47) with no tiebreaker, so undated rows (now rows 22-29) come back in arbitrary order, inside a 420px scroll box of 37px rows; unassigned rows show no initials chip. But this is the fourth surface proposed for the same alert (Home 001, Today 007, email 010, and this pin), against the brief's simplicity bar, and D10's Overview needs-attention list replaces this card after cutover. Low.

### G1B-016

**Add a Responses view beside the move-in form editor**

Low · New capability · effort M · `/settings/move-in-form` · Rentals, residents and the public site run one lifecycle

- **Today:** Settings > Move-in form is only an editor: 'Rooms and items tenants rate on the move-in inspection', Save and Cancel, then rooms with items. No list of submitted reports exists anywhere; finding one means searching task titles.
- **Why:** Typeform and Tally put Responses next to the form, with Submitted at and a count. Staff should be able to answer 'which reports came in this month, and which aren't reviewed' in one place.
- **Change:** Add a 'Form | Responses' segmented control to the page. Responses lists one row per report, newest first, and each row opens the record. Columns:
- Submitted
- Property and unit
- Resident
- Needs attention (count)
- Status (To review or Reviewed)

Add no filters until there are more than 20 reports.
- **Desktop, tablet, phone:** Desktop: 5 columns, counts right-aligned. Tablet: Resident moves to a subline. Phone: two-line rows, '767 Prospect, Unit 2 · To review' over 'Jordan E. · Oct 20 · 3 need attention'.
- **Reuse:** SegmentedControl (extract from deals/filters.tsx), Table and Th, Badge.
- **References:** 
  - [Jobber](https://mobbin.com/screens/a6fb2d6f-b990-48c4-91c0-9a4dac929ea4): The Requests list shows a status overview with counts, the client name over the contact details, the property, the Requested date and a status chip in a fixed column.
  - [Typeform](https://mobbin.com/screens/ff36a25d-3112-4aa7-92fc-91a091dafd5c): Responses tab beside the form, with a row list and response detail
  - [Tally](https://mobbin.com/screens/822df481-456b-4b79-a1cc-9f1b3d53cb04): Submissions tab with Submitted at and a count
- **Verification:** partly. Settings > Move-in form is editor-only (aria: subtitle, Save, Cancel, rooms with Required toggles). But submitted records don't belong in Settings, and a Form | Responses control inside a Settings sub-tab nests three levels of navigation. With near-zero volume, the unit row (G1B-013) and a 'From residents' group (G1B-007) cover 'which reports came in and which aren't reviewed'. If a list is ever needed, it belongs on the property hub or Tasks, not Settings. Typeform ff36a25d verified, but Typeform's form is the product; here the form is configuration.

### G1B-017

**A resubmitted report becomes a second task; keep it as a new version of the same report**

Low · Fix · effort M · `Move-in submission handling` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. Every successful submit still calls createTask (moving-in/actions.ts:107-114), with up to 5 per IP per hour allowed (line 16). There is no lookup of an earlier report for the same property and email.
- **Today:** Every successful submit calls createTask (actions.ts:108-115), and up to 5 submissions per IP per hour are allowed (line 16). After PUBLIC-001's failed-submit screen a resident is likely to refill and resend, which produces two near-identical tasks with no link between them.
- **Why:** Two diverging copies of the evidence is a deposit-dispute problem. Snowflake and Plane keep versions with timestamps and a compare.
- **Change:** If a report for the same property and resident email exists within 14 days, save the new submission as a version (supersedesId) and don't create a second review task. Show 'Version 2 · Oct 21, 7:10 pm' with a 'Compare with version 1' link.
- **Desktop, tablet, phone:** The version line sits in the meta line at all sizes.
- **Reuse:** The G1B-006 record; the compare view from G1B-015.
- **References:** 
  - [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a): A grouped change entry that expands into per-field old and new values. A resubmission can show as 'Jordan resubmitted: 2 items changed' with the diff.
  - [Snowflake](https://mobbin.com/screens/87a5cccb-7753-4fa7-9055-5dc353f26380): Version history with timestamps, authors and compare
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:16-18,108-115`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:16-18,107-114`
- **Verification:** partly. Code confirmed: every valid submit calls createTask, with up to 5 per IP per hour (actions.ts:16, 107-114). But the duplicate scenario is speculative (zero submissions so far; the submit button disables while pending), and full versioning with supersedesId plus a compare view is heavy for it. Simpler: when a report for the same property and resident email arrives within 14 days, attach it to the existing record and review task instead of creating a second task. Kind is capability, not fix.

### G1B-018

**Flag safety items rated Fair or Poor (smoke alarm, heat, front door) as urgent**

Low · New capability · effort S · `Move-in report, Needs attention` · Rentals, residents and the public site run one lifecycle

- **Today:** The default form includes Smoke Alarm, Furnace/Heater and Front Door under Other Areas (move-in-form-types.ts:63-70). A 'Smoke Alarm: Poor' line is formatted exactly like 'Yard: Poor' and sits at the end of the dump.
- **Why:** These are life-safety and habitability items with tight repair expectations. Expensify and Brex mark policy-critical lines with a warning, and Bevel lists out-of-range values first.
- **Change:** In the form editor, mark items as Safety, on by default for Smoke Alarm, Furnace/Heater and Front Door. A Fair or Poor safety item:
- sorts first in Needs attention
- gets Due today on its proposed repair task
- is named in the Home row and the email: 'Smoke alarm needs attention'
- **Desktop, tablet, phone:** Same ordering at all sizes.
- **Reuse:** The move-in form editor (one checkbox per item); Badge red.
- **References:** 
  - [Brex](https://mobbin.com/screens/979ac405-adb3-4133-87cf-2a3abc3d79f1): A warning banner plus red chips name exactly which fields failed (Date, Amount, Merchant). A safety item should name itself just as plainly.
  - [Expensify](https://mobbin.com/screens/3eeed405-32d1-4bc4-bb42-04d44b5286a5): Warning markers on lines that break policy
  - [Bevel](https://mobbin.com/screens/cdc8b158-6bc1-44d1-8c35-7cc3440998e1): Out-of-range values called out first
- **Code:** `src/lib/move-in-form-types.ts:63-70`, `src/app/(marketing)/residents/moving-in/actions.ts:96-99`
- **Verification:** partly. Smoke Alarm, Furnace/Heater and Front Door are in the default Other Areas section (move-in-form-types.ts:67) and print like any other line. But Needs attention (G1B-003) will usually hold about three items, so sorting within it adds little, and a new per-item 'Safety' checkbox in the form editor adds settings clutter. If kept, hard-code the safety rule for those three keys (sort first, same-day due on the repair) with no editor UI. Low.

### G1B-021

**Tell the resident what happens to their items once a partner reviews the report**

Low · New capability · effort M · `Resident follow-up after review` · Rentals, residents and the public site run one lifecycle

- **Today:** The sent screen says 'We've received it and will follow up if anything needs attention' (move-in-form.tsx:111-118). Nothing in the app ever goes back to the resident, and completing the task changes nothing they can see.
- **Why:** CLAUDE.md asks the app to close the loop and show people their input mattered. Bumble's report timeline goes from Submitted to We've got it to Reviewed, and Apple Maps lists a user's reports as In review and Reviewed.
- **Change:** When a partner marks the report reviewed, offer one email to the resident, checked by default and editable before sending. It is generated from the repair tasks just created: 'Hi Jordan, we've reviewed your move-in report for Unit 2. We're scheduling: the back left burner, the tub caulk and the window screen. We'll text you to set a time.'
- **Desktop, tablet, phone:** On phone the toggle and preview sit in the Mark reviewed sheet.
- **Reuse:** The outbox from G1B-010; the Mark reviewed action from G1B-009.
- **References:** 
  - [Wise](https://mobbin.com/screens/66acdebc-f0ff-4007-b200-2e78fbad954a): The Updates tab lists dated you/we sentences with the current step in bold. This is the voice for 'We reviewed your report. We are fixing 2 items.'
  - [Stripe](https://mobbin.com/screens/58854f66-453d-428d-ba88-7cf85d6b1ec4): Receipt history logs 'Sent to [email]' with a timestamp and offers View receipt or Send receipt. Log the resident email on the report the same way.
  - [Bumble](https://mobbin.com/screens/09426d05-9e3c-4a74-b206-da7d04e07ba4): Report timeline: submitted, we've got it, reviewed
  - [Apple Maps](https://mobbin.com/screens/21918293-e48b-48ac-ba9c-eb79fa478271): A user's reports shown as In review and Reviewed
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:111-118`
- **Verification:** partly. The sent screen copy is as quoted (move-in-form.tsx:114-117) and nothing ever goes back to the resident. But the proposal adds a default-on outbound email to a third party, auto-composed from tasks, that promises 'We'll text you to set a time', which nothing in the app backs up (copy rule: no promises we can't back up). The lighter version is G1B-027's email link: the partner writes one personal reply when there is something to say. Low.

### G1B-023

**Tick 'Move-in report received' in the unit's move-in playbook automatically**

Low · New capability · effort M · `Move-in playbook (D28) and the report` · Rentals, residents and the public site run one lifecycle

- **Today:** Move-ins are also tracked as tasks: search for 'move-in' returns 'Upper Tenant move-in' and 'Philo move-in'. D28 ships 'Apply playbook' for move-ins before cutover, but nothing connects a resident's report to that playbook.
- **Why:** Closing the loop means the checklist knows the report came in. Turo's check-in steps complete themselves as the guest finishes them.
- **Change:** The move-in playbook includes the checklist item 'Move-in report received'. When a report arrives for that property and unit, the item checks itself, shows 'Received Oct 20', and links to the report.
- **Desktop, tablet, phone:** The checklist item behaves the same at all sizes.
- **Reuse:** TaskTemplate and playbooks (D28); checklist items from the task page spec.
- **References:** 
  - [Mercury](https://mobbin.com/screens/2a7de612-6f88-42d7-bce5-1d8fe2219314): The application timeline (Apply, submitted Jun 4; Request for info, awaiting; In review; Account ready) ticks steps forward on its own as events arrive.
  - [Turo](https://mobbin.com/screens/f496facd-5f9c-400b-ad8a-87bfb0659fa7): Check-in steps listed and completed as each is done
- **Code:** `GET /api/search?q=move-in (returns legacy move-in tasks, no report)`, `branch: docs/asana-migration-plan.md:89 (D28)`
- **Verification:** confirmed. Search for 'move-in' returns 'Upper Tenant move-in', 'Philo move-in' and 'Lease agreement for Melvin (Oct move-in...)'; D28 ships a bare Apply playbook before cutover with nothing linking a report to it. Low is right. It depends on G1B-006 and on the form collecting a unit (G1B-V01) to match the report to the playbook.

### G1B-024

**Shorten 'Move-in inspection for Jordan Ellis at 767 Prospect Avenue, Buffalo, NY 14213'**

Low · Fix · effort S · `Move-in task title (lists, task page, search)` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The unit part still depends on G1B-V01, because the form has no unit.
- **Today:** The title is still 'Move-in inspection for {name} at {full address}' (moving-in/actions.ts:109). On /tasks/[id] it now wraps instead of clipping (header.tsx:14-29), so it reads in full over 2 to 3 lines at 320. It still repeats the property's address column and truncates in Today, All and property card rows.
- **Why:** The copy rules say not to restate what the layout already shows. Linear titles name the thing, and the property is already a field.
- **Change:** Title the task 'Review move-in report · Unit 2', or 'Review move-in report' when there is no unit. The property shows in its own column, and 'Jordan E.' goes in the subline or meta line. Keep the resident's full name searchable through the record (search indexes residentName), not through the title.
- **Desktop, tablet, phone:** Fits on one line at 1280 and 768; at most two lines on phone.
- **Reuse:** shortAddress for the property column.
- **References:** 
  - [Jobber](https://mobbin.com/screens/19ac56a2-4e6f-4c99-aa80-02c6eed8d5b3): The title stays short ('Dashboard design review'). The client name, phone and email live in a card beside it, not in the title.
  - [Linear Mobile](https://mobbin.com/screens/c25eeb30-eb9c-421f-87b0-a0f14dfa259d): Short title, with context carried in chips under it
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:109`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:109`, `branch: src/app/(app)/tasks/[id]/header.tsx:14-29`
- **Verification:** partly. Clipping reproduced (title input 638px of 853px at 1280, 309 of 574 on phone, 254 of 576 at 320 WebKit). Two problems with the fix: 'Unit 2' has no data source because the form never asks for a unit (G1B-V01), and dropping the property from the title hurts the places that show only the title: Home's task rows hide the property below sm (page.tsx:79, 'hidden ... sm:block') and global search results show the label alone. Better interim title: 'Move-in report from Jordan Ellis' (property stays in its column). The clipping itself is mostly the title being a single-line input (see G1B-V02).

### G1B-026

**Format the inspection date; it prints as '2026-10-20'**

Low · Fix · effort S · `Move-in report header` · Money, numbers and dates read one way

- **Today:** 'Inspection date: 2026-10-20' is the raw YYYY-MM-DD string (actions.ts:80). The schema accepts any 20-character string (line 37).
- **Why:** Every other date in the app reads like 'Oct 20', and ISO dates read as system output. An unchecked date also weakens the record.
- **Change:** Show 'Inspected Oct 20, 2026' in the meta line; the year stays because this is a record. Reject inspection dates more than 30 days from the submission date with a field error on the form.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** Formatters in src/lib/dates.
- **References:** 
  - [Bonsai](https://mobbin.com/screens/8d7add19-5c75-4ef3-8dde-ee3b0f644127): 'Feb 8, 2024 - 7:15 PM' style dates on a submission
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:37,80`, `src/app/(marketing)/residents/moving-in/actions.ts:39`, `src/app/(marketing)/residents/moving-in/actions.ts:80`, `src/lib/utils.ts:21`
- **Also found as:** G1B-IV02 (After a tenant submits: the move-in report on the staff side)
- **Verification:** confirmed. Confirmed 'Inspection date: 2026-10-20' raw (actions.ts:80) and z.string().max(20) with no date validation (line 37). Low and a fix.

### G1B-027

**Make the resident's email actionable**

Low · New capability · effort S · `Move-in report rail` · Rentals, residents and the public site run one lifecycle

- **Today:** The only contact is 'Submitted by: Jordan Ellis <jordan.ellis@example.com>' as plain text on the last line of the textarea, under 46 rating lines.
- **Why:** Following up on a Poor item starts with contacting the resident. Airbnb keeps the guest one click from a message, and Zillow's lease shows tenant email and phone as fields.
- **Change:** Add a 'Resident' block to the rail: the name, then the email as a mailto link. Copy appears on hover on desktop and on tap on touch. On phone, 'Email Jordan' sits in the ⋯ menu.
- **Desktop, tablet, phone:** Desktop and tablet: rail block or chip. Phone: the ⋯ menu action plus the name in the meta line.
- **Reuse:** The tappable contact pattern from ADMIN-004.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/6207c6d6-411f-4a6d-8564-2b9053bfd57b): Guest conversation next to the reservation details
  - [Zillow](https://mobbin.com/screens/f09b2e07-a038-44e0-a914-800d6ca15ec8): Tenant email and phone as labeled fields on the lease
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:105`
- **Verification:** confirmed. Confirmed: the only contact is the plain-text last line of the description (actions.ts:105). A better landlord-side reference than the lease screen: Zillow Rentals' tenant block with email, 'Copy email' and phone on the property overview (https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb). Airbnb 6207c6d6 verified real (guest-side messages with reservation details beside).

### G1B-I02

**Say who acts next on a new report and let a partner claim it in one tap**

Low · Design change · effort S · `Move-in report header` · Rentals, residents and the public site run one lifecycle

- **Today:** On main the report shows a dashed '?' and 'Unassigned' in a native select (confirmed in report-injected--desc--desktop-light.png and task-detail.tsx:124-146). Claiming works today: you pick your own name, and the Assignee row then shows who has it. So 'nothing tells Pieter' holds only while the report is unassigned. On the migration branch, undated unassigned tasks, move-in submissions included, sit in an Unassigned section at the top of both partners' Today (lib/tasks/list.ts groupMine). The branch's rail AssigneePicker replaces the select.
- **Why:** Ramp and Brex make every pending item say who acts next. Brex reads 'Pending review from [name] (admin) or 10 others'. Front keeps the assignee in the record header and logs 'Assigned to Alex Smith'. An unassigned dropdown reads as nobody's job.
- **Change:** Replace the Assignee row on the report with one header line, 'Waiting on Connor or Pieter', and a small 'I'll take it' button. Tapping it sets the reviewer, changes the line to 'Pieter is reviewing' and adds the change to the timeline. The other partner can take it over from the ⋯ menu.
- **Desktop, tablet, phone:** Desktop and tablet: the line sits under the meta line in the header. Phone: the same line sits under the wrapped title, and the button is 44px tall. Nothing drops.
- **Reuse:** patchTask with assigneeUserId (src/app/(app)/tasks/actions.ts:42) and Button sm from src/components/ui.tsx. No new component.
- **References:** 
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): The status reads 'Flagged for review on Dec 19', then 'Pending review from [name] (admin) or 10 others'.
  - [Front](https://mobbin.com/screens/3258fa83-bf07-454c-aeb7-a0db0261fdd7): An Assign control in the record header with teammates and Unassigned, plus a status line saying who has it.
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `src/app/(app)/tasks/[id]/task-detail.tsx:110-140`
- **Verification:** partly. The Brex and Front references are plausible, but the recommendation forks the settled task page. D31 puts Assignee in the side rail, so swapping it for a bespoke header line on one task type adds a second pattern. Settled default #1 already shows unassigned move-in submissions to both partners. What remains is a one-tap claim: add an 'Assign to me' row at the top of the branch's AssigneePicker (src/components/assignee-picker.tsx lists Unassigned, Team and Contractors, with no self shortcut), or add a hover and tap action on Unassigned rows in Today. That is an S change that touches no layout.

### G1B-I04

**Show each repair task's live status on the report with a 'fixed' count**

Low · New capability · effort M · `Move-in report, Needs attention list` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. Task on the branch adds unitLabel, events, checklist, access and read states, but no source or parent link. A repair task still can't point back to a report.
- **Today:** True: Task has no parent or source link on main (prisma/schema.prisma:208-246), and none on the migration branch either (it adds unitLabel, events, checklist and read state, but no source). So a repair task created from a report can't point back to it, and the report can't show repair status.
- **Why:** The house rule is to close the loop. Linear's parent issue lists its sub-issues with a '0/4' progress count and each child's status, so you see progress without opening anything.
- **Change:** Under each Repair item, show its task inline: the status word, the assignee's initials and the due date ('Scheduled · Oct 27 · MP'). The section header reads 'Needs attention · 1 of 3 fixed' and then 'All 3 fixed'. Selecting a row opens the task. The report's Home row stays until everything is fixed or kept as is.
- **Desktop, tablet, phone:** Desktop and tablet: one muted line under each item. Phone: the status word and date only, with initials dropped. The count sits in the section header at every size.
- **Reuse:** Add a nullable sourceReportId to Task (prisma/schema.prisma:208-246). Status words follow the seven settled statuses with their Badge tones.
- **References:** 
  - [Linear](https://mobbin.com/screens/7c88fd2a-866e-4db1-b3ac-38cb5cd2c043): The parent issue shows Sub-issues 0/4 with a progress ring and each child's status circle.
  - [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): On a phone, sub-issues collapse to a card with a count.
- **Code:** `prisma/schema.prisma:208-246`, `branch-src/prisma/schema.prisma model Task`
- **Verification:** partly. The Linear sub-issues reference 7c88fd2a is real and shows 'Sub-issues 0/4' (verified). The part worth keeping is a source link, so a repair task opens its report and the report lists its repair tasks with status. Drop 'The report's Home row stays until everything is fixed or kept as is': each repair task already shows on Today, so the same work would appear twice on the screen meant for 'what needs me'. Drop the 'or kept as is' wording, since it depends on I03, which I refuted. Medium overstates a nice-to-have on a record people rarely reopen after review.

### G1B-I05

**Let a partner turn a sentence in the resident's comments into a flagged item**

Low · New capability · effort M · `Move-in report, resident comments` · Rentals, residents and the public site run one lifecycle

- **Today:** The structural claim holds: additional comments are appended as one free-text block after all the rating lines (actions.ts:103-105). The 'Small stain on the living room carpet' example is fabricated sample text that the reviewer injected client-side. No real move-in report exists in the local DB.
- **Why:** Residents put real issues in free text. Front's New task from a conversation and Linear's new issue both quote the source ('@x said:'), so the words become a tracked item without retyping.
- **Change:** G1B-003 already places the comments near the top. Add a 'Flag an item' action to that block. It opens a sheet with the quoted sentence prefilled, a room picker and the label 'From comments'. The result joins Needs attention and gets Repair or Keep as is like any other item.
- **Desktop, tablet, phone:** Desktop 1280: selecting text in the block shows a small Flag button, and there is also a Flag an item link under the block. Tablet and phone, which have no hover and unreliable text selection: only the link, which opens a bottom sheet with Save pinned.
- **Reuse:** The task sheet from G1B-008, with Select and Textarea from src/components/ui.tsx.
- **References:** 
  - [Front](https://mobbin.com/screens/6e5084d3-5bc3-4d61-b039-a85bc6e076d8): New task quotes the original conversation in a card above the title and body.
  - [Linear](https://mobbin.com/screens/ffa2e456-85c7-4005-b361-de79dc6b6dc7): New issue opens with an '@person said:' block quote of the source text.
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:103-105`, `g1b/inject.js`
- **Verification:** partly. The Front and Linear references show 'new task from quoted text', which supports the simple version: a 'Create task' link under the comments block that opens the G1B-008 task sheet with the sentence quoted in the notes. Drop the desktop text-selection 'Flag' button, the room picker and the 'From comments' label, plus the step where the result 'joins Needs attention and gets Repair or Keep as is'. That last step depends on I03, which I refuted. Each of these adds chrome for a rare case. Note that the carpet-stain sentence comes from the reviewer's injected sample (g1b/inject.js), not a real submission.

### G1B-I06

**Keep Good items that carry a comment in a quiet Noted group**

Low · Design change · effort S · `Move-in report, below Needs attention` · Rentals, residents and the public site run one lifecycle

- **Today:** Confirmed in code: the 'Comment (optional)' input renders under every item regardless of rating (move-in-form.tsx:313-317), and actions.ts:96 prints it as 'Floor: Good (scuff by the door)' inside each room's lines. Today nothing is hidden, because the whole report is one plain-text block. The risk exists only once G1B-003's exceptions-first view ships.
- **Why:** A scuff noted at move-in is exactly what decides a deposit deduction at move-out. Brex separates a soft amber state ('Not verified') from a red one ('Missing'), so reviewers see both without treating them the same.
- **Change:** After Needs attention, add 'Noted · 4', listing each Good item that has a comment as room, item and the resident's words in muted text, with no colored badge and no buttons. These items count as pre-existing automatically, and they appear in the move-out Compare.
- **Desktop, tablet, phone:** Desktop and tablet: one row per item under the Needs attention list. Phone: collapsed to a 'Noted · 4' row that expands in place.
- **Reuse:** The same row component as Needs attention, without the actions.
- **References:** 
  - [Brex](https://mobbin.com/screens/979ac405-adb3-4133-87cf-2a3abc3d79f1): An amber 'Not verified' state sits apart from the red errors, a middle level between fine and failing.
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): Labels appear only on sections that need them. Clean sections stay plain.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:313-317`, `src/app/(marketing)/residents/moving-in/actions.ts:96`
- **Verification:** partly. Correct and useful as a rule for G1B-003, not as a separate group. Simplest form: any item with a resident comment counts as an exception and appears in the same list as Fair and Poor, with Good shown as muted text and no badge. That avoids a second 'Noted' section. 'These items count as pre-existing automatically' assumes the I03 decision model, which I refuted. The first Brex reference (979ac405) shows an amber middle state, while the recommendation asks for no color, so it backs the idea only loosely. Medium is high for a refinement to a view that isn't built yet.

### G1B-I07

**Show a flagged appliance's age and CapEx line beside it**

Low · New capability · effort M · `Move-in report, flagged appliance rows` · Rentals, residents and the public site run one lifecycle

- **Today:** The CapEx row is as stated (verified on prop767--units--desktop-light.png: Upper / Upper Front, Refrigerator, 18 yrs, Due soon, $1,000). But the report has no unit, because the form never asks for one. The CapEx forecast is computed from unit equipment install years (capexForecast in src/lib/property-types.ts) and has no line records to link a task to. Move-in labels only loosely match EQUIPMENT_TYPES: 'Stove' and 'Oven', 'Furnace/Heater' against Furnace, Boiler or HVAC, 'Air Conditioner' against HVAC.
- **Why:** A Poor refrigerator that is 18 years old and already budgeted calls for replacement, not repair. Showing that on the report saves a trip to the property page and a wasted repair call. Gusto's principle is to enter data once and let it flow forward, and Attio shows linked list entries in the record's side panel.
- **Change:** When a flagged item matches equipment on the report's unit, add one muted line under it: '18 yrs old · In 2026 CapEx · $1,000'. Repair's sheet then offers 'Replace' as the first title word and links the task to the CapEx line. This depends on the unit question in G1B-V01.
- **Desktop, tablet, phone:** Desktop and tablet: one muted line under the item. Phone: shortened to '18 yrs · CapEx 2026'. Nothing else drops.
- **Reuse:** parseUnits and the CapEx rules behind src/app/(app)/properties/[id]/capex-outlook.tsx, plus fmtMoney from src/lib/utils.ts. EQUIPMENT_TYPES is in src/lib/config.ts:72-91.
- **References:** 
  - [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a): The record's Details rail shows the linked Sales list entry with its own stage and value, so related facts appear without leaving the page.
  - [Stripe](https://mobbin.com/screens/7af4eefa-754f-4c2f-a689-c790b1eb4cad): The Details rail pairs the record with linked facts (risk, source, customer) as label and value rows.
- **Code:** `src/lib/move-in-form-types.ts:27-28`, `src/lib/config.ts:72-91`
- **Verification:** partly. The Attio and Stripe references show related facts in a details rail. They are generic support and don't show this pattern specifically; Stripe 7af4eefa is real (it came back in my search). 'Links the task to the CapEx line' has no target to link to, so drop it. The lighter, honest version: when the report has a unit, show one muted line under a flagged appliance ('18 yrs old') taken from that unit's equipment, and leave the CapEx budgeting on the property page. Replacing equipment should update its install year, which belongs to the property page flow.

### G1B-I08

**Email the resident when a repair from their report is done**

Low · New capability · effort M · `Repair task sheet opened from the report` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. The resident's email still exists only in the description's 'Submitted by' line. The branch outbox delivers only to staff users and to contractors with an active login (deliveryFor), so nothing can email a resident.
- **Today:** Confirmed: the resident's email exists only in the 'Submitted by: Name <email>' line (actions.ts:105), and main has no email library (no resend, nodemailer, postmark or sendgrid in package.json). The migration branch adds a Resend outbox, but by D19 and D20 it only emails across the staff and contractor line.
- **Why:** Closing the loop is a house rule, and hearing that a repair is done is what makes residents feel the report mattered. Basecamp to-dos carry a 'When done, notify' field so the right person hears about it without anyone remembering to tell them.
- **Change:** Add a checkbox to the Repair sheet, 'When done, email Jordan', checked by default. The address stays on the report and never on the task, so a contractor never sees it. When the task moves to Done, Jordan gets one line, 'The back left burner in Unit 2 is fixed. Reply if anything is still off.', and the report's timeline logs 'Emailed Jordan: oven fixed'.
- **Desktop, tablet, phone:** All sizes: one checkbox row in the sheet with a 44px tap target. Phone: the row sits above the pinned Create button.
- **Reuse:** The G1B-008 task sheet, plus the email path that G1B-010 introduces (no email library exists in package.json today).
- **References:** 
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): The to-do form has 'Assigned to' with 'Notify them about this assignment' checked, and a 'When done' field naming who hears about it.
  - [Basecamp](https://mobbin.com/screens/91996f45-2582-4102-ab05-f3071f303a74): 'When I post this, notify...' states plainly who will be told before you commit.
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:105`, `branch-src/src/app/(marketing)/residents/moving-in/actions.ts:105`, `branch-src/src/lib/notifications/content.ts:55-62 deliveryFor`
- **Verification:** partly. This conflicts with settled decisions it doesn't name. D19 and D20 ('email only crosses the staff/contractor line'; 'Nothing you or Pieter do to tasks without a contractor sends email') and the D30 Resend free-plan budget define who gets email; residents aren't in that model. A default-on auto-email also sends app-composed copy ('The back left burner in Unit 2 is fixed') to an outside person on any status flip, including a mistaken Done. HG already reaches residents by text: the form's own rate-limit message says 'or text us instead' (actions.ts:19). The Basecamp reference a0f9dab1 is real (verified), but its 'When done' field notifies teammates, not outside customers. The safer version: when a repair from a report reaches Done, show a 'Let Jordan know' action that opens a prefilled sms: or mailto: draft the partner sends. No automation, and nothing new to settle.

### G1B-I12

**Confirm Mark reviewed with a toast that names the report and offers Undo**

Low · Design change · effort S · `Move-in report, Mark reviewed` · Rentals, residents and the public site run one lifecycle

- **Today:** On main, Mark complete flips to a green 'Completed' with no message, and main has no Toast (docs/components.md:66). On the migration branch the Toast primitive and Undo already exist.
- **Why:** Mercury confirms an approval with a toast that names the action and updates the record's trail, and Linear pairs removals with Undo. Marking a report reviewed removes it from both partners' Home, so it should be reversible right there.
- **Change:** After Mark reviewed, show the toast 'Unit 2 report reviewed · Undo' for 6 seconds at the bottom center. The header chip becomes Reviewed with 'by Connor, Oct 21' beside it. Use a short spring that respects reduced motion.
- **Desktop, tablet, phone:** Desktop and tablet: the toast sits at the bottom center of the content area. Phone: it sits above the sticky action bar, with an Undo tap target of at least 44px.
- **Reuse:** A new Toast primitive in src/components/ (a Known gap), shared with the FEEL findings.
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): A 'Reimbursement payment approved' toast while the panel's trail gains an Approved step with name and date.
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): A toast with Undo after an action that removes an item from the inbox.
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:41-62`, `docs/components.md:66`
- **Verification:** partly. This duplicates work already in flight. The branch has src/components/toast.tsx with Undo, used for Cancel task, reschedules, Approve and Send back. A Done toast with Undo is already with Connor as BTASKS-005 (review/branch/in-progress.md). The proposed header chip 'Reviewed by Connor, Oct 21' brings in vocabulary that collides with the settled 'Review' status, which means a contractor marked the job done and it awaits approval (D6b). A report reviewed by a partner should simply go to Done. Both references are real (Linear 14cbb61d verified).

### G1B-I14

**Color only Fair and Poor; leave Good as plain text**

Low · Design change · effort S · `Move-in report, ratings` · One design system, fixed in the primitives

- **Today:** Today the ratings are plain words inside the description textarea (report-injected--desc--desktop-light.png). No badges exist yet; the finding pre-empts G1B-003's design.
- **Why:** Things 3 keeps its lists neutral and spends red only on deadlines. Brex shows a red label only on the section that needs it. HG's house rules give every color a job and keep each status tone unique within a view.
- **Change:** Show Good as muted text with no badge, Fair as an amber Badge and Poor as a red Badge. N/A and Not rated are muted text. The report's status chip uses blue for To review and green for Reviewed, so it never reuses amber or red. Dark mode uses the Badge dark tones.
- **Desktop, tablet, phone:** The same at every size. On a phone, rows in collapsed rooms show only the Fair and Poor badges, and the room summary line carries the counts.
- **Reuse:** The Badge tones in src/components/ui.tsx (gray, blue, green, amber, red).
- **References:** 
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): A neutral list where only deadline flags turn red.
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): Red 'Missing' appears only on the sections at fault. The rest stay uncolored.
- **Verification:** partly. The core is right: leave Good uncolored so the few Fair and Poor items stand out. Two parts clash with settled rules and need a conflicts_with entry. First, the 'To review' (blue) and 'Reviewed' (green) chip invents statuses outside the seven settled ones (D6): blue is Scheduled's tone, and 'Review' already means a contractor marked it done. The report should use the normal task statuses. Second, the house rule says statuses keep fixed Badge tones that no other mark in the same view reuses. Fair in amber and Poor in red reuse Waiting's amber and Review's red, so Connor has to approve that reuse or pick a neutral treatment: plain words, with grouping and the count carrying the emphasis. The Things 3 and Brex references support 'spend color only where it matters'.

### G1B-V03

**Undated tasks on the property card have no tiebreak order, so a new report lands at a random spot**

Low · Fix · effort S · `/properties/[id] Tasks card` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The property page now sorts its tasks in JS with byDateThenStatus: date, then status rank, then createdAt desc, then id (properties/[id]/page.tsx:86-88; list.ts:132-148). That is the same comparator Today uses (compareByDue), so the order is stable and the undated tail is newest first. Removal not upheld: The property card itself is fixed: properties/[id]/page.tsx:86-88 sorts with byDateThenStatus (Target, then status rank, then createdAt desc, then id), so its order is now fixed from load to load. One correction to the re-check: the card sorts by Target, the visit date while a task is Scheduled. That matches compareByTarget, not compareByDue. The other half of the original finding (the same tasks list in a different order in two places) is still there with real data. allTasks (lib/tasks/queries.ts:89) still orders by dueDate and createdAt only. It has no status rank and no id tiebreak, and it sorts by Due instead of Target. I compared each of the 11 properties' Tasks card with /tasks/all?property=<id>. On 23 Sherwood St (/properties/cmtg25y4t000cjphs8eview1h), three undated To do tasks from Pieter appear in different orders. The card shows 'Complete capital improvement form, Flooring, Countertops'. All shows 'Flooring, Countertops, Complete capital improvement form', and two reloads gave the same result. They appear to share a createdAt, so the card breaks the tie by id while All leaves it to Postgres. The two lists will also disagree when tasks share a date but differ in status, or when a Scheduled task's visit date differs from its Due date. Updated recommendation: sort allTasks with the same comparator (at least add id, and ideally status rank and Target), so the property card and All agree. Data: skeptic-b5-tools/order-all.json. Shots: skeptic-b5/b5sk-sherwood--card--desktop-light.png and b5sk-sherwood--all--desktop-light.png in the same folder.
- **Today:** The property page orders tasks by dueDate only (properties/[id]/page.tsx:45-47), so the 8 undated rows on 767 Prospect (rows 22-29) come back in whatever order the database returns. /tasks breaks ties with createdAt desc (tasks/page.tsx:101), so the same tasks appear in a different order in the two places, and a fresh resident report can sit anywhere in the undated tail.
- **Why:** Lists that show the same records should order them the same way, and the newest undated item, usually the one that just arrived, should be the first undated row.
- **Change:** Add { createdAt: 'desc' } as the second orderBy on the property page's task include, matching /tasks.
- **Desktop, tablet, phone:** No layout change at any size.
- **Reuse:** Same orderBy as src/app/(app)/tasks/page.tsx:101.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:45-47`, `src/app/(app)/tasks/page.tsx:101`, `branch: src/app/(app)/properties/[id]/page.tsx:86-88`, `branch: src/lib/tasks/list.ts:132-153`
- **Verification:** verifier-found
