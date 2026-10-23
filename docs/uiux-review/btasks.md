# Branch: Today, All tasks, new task and the task page

Part of the [UI/UX review](README.md). 37 findings: 0 critical, 5 high, 22 medium, 10 low.

## How it should work

Today should feel like Things 3 run with Ramp's queue discipline: open the page and the day is already sorted, every row is calm text, and color appears only where something is late or waiting on you. Keep the approved Mine | Contractors split, but make the counts do the triage. The switch carries badges (Mine 25 late, Contractors 2 to review), the way Acctual labels its approval tabs (https://mobbin.com/screens/4b992650-0ce5-4fc7-9efb-8407b7ac70ac). Mine opens on Overdue with a Reschedule menu (Todoist, https://mobbin.com/screens/858c686b-66b3-4283-8f26-4a6f82b45b7b). Legacy undated items sit in a collapsed tail, not above the fold.

Rows follow Things 3 (https://mobbin.com/screens/51b7617b-3a79-46c7-91e8-035532e61050): title, the property as a gray sublabel, the date as plain text that turns red when late, and no placeholder chips. The quick picks stay one tap away. Completing, rescheduling, approving and sending back all answer with one toast that names the change and offers Undo (Todoist, https://mobbin.com/screens/75c4093b-73e7-4344-b2e7-54e90d94e58c). When a contractor is emailed, the toast says so.

Needs review becomes a real approval queue, like Mercury's reimbursement review (https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19). The row shows the photos as evidence, Approve is primary, and after Approve the next job in review opens, the way Linear steps through issues (https://mobbin.com/screens/178f8c31-237e-4c24-a79a-3ed93b74df03).

The task page keeps the approved side rail but leads with the verb. A round checkbox sits before the title, as in Things 3 (https://mobbin.com/screens/4b34a598-3d5f-4fba-91b1-d1fa51e61acc). Checklist items can be edited and dragged (https://mobbin.com/screens/18b05379-2af1-41ab-afef-0ca4870933c1). Comments can be edited. The composer docks to the bottom of the phone screen as a pill, like Linear Mobile (https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8). The rail ends with a Completed row, so the record closes the loop.

Repeats become presets inside the date popover, as Todoist does (https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c). The next copy always lands in the future, and its date shows in the completion toast. Capture happens in place: an inline Add task row in each section (https://mobbin.com/screens/c4a9db18-e58f-419e-a8f0-7daf3d7cbf8e). The full New task form reuses the rail's chips, so there is only one date picker in the product. A cleared Today earns line art and the next step (https://mobbin.com/screens/acb5f120-4a9f-44fb-a2ab-54ea7879be88).

<details><summary>What the reviewer covered</summary>

Branch build at http://localhost:3300 (commit 4652abb), session "staff" (Connor). Routes: /tasks (Today, Mine and Contractors, ?view=contractors), /tasks/all (Open, Done, status=all), /tasks/new (blank, Scheduled status, ?propertyId=), /tasks/[id] for a CSV-imported Done task (cmtg25yuf01zsjphs0xu5d2fl), the Device Check contractor job (cmvkik0ht0003jpg7nflnvoun, In progress, notes, 4-item checklist, lockbox, comment) and a long-title legacy-assigned task (cmtg25yxe02hajphsi0io36rx). States exercised: Unassigned 34, Overdue 25 with Move all to today (write blocked, so the optimistic move and the error toast), No date collapsed, every contractor group, row date popover (desktop) and sheet (phone) with Tomorrow picked, status menu, More menu, due popover, assignee picker, repeats popover, unit and property chips, Shared/Internal composer, Add item, typing in the composer on WebKit, keyboard Tab and the 1-5 date keys, focus rings. Viewports: desktop 1280, wide 1920, tablet 768, mobile 375, narrow 320. Themes: light and dark. Browsers: Chromium and WebKit (mobile, narrow). Not reachable because the branch database has no rows in these states and writes are blocked: Needs review rows, the review banner, Approve and Send back sheets, the Waiting section and Waiting reason line, Scheduled visit-date row, Unit-less lockbox warning, success toasts with Undo, real uploads, drag and drop, and the email-cap banner. Those were reviewed from the branch code (review-actions.tsx, review-banner.tsx, status-control.tsx, task-list-context.tsx, composer.tsx, lib/tasks/core.ts). Mobbin: 12 searches (Linear web and Mobile, Things 3, Todoist web and iOS, Basecamp, Mercury, Airwallex, Acctual, Deel, Attio, Gusto, Twenty, Cofounder).

</details>

## Findings

### BTASKS-004

**Unassigned holds 34 rows, mostly undated, and pushes Overdue below the fold**

High · Design change · effort S · `/tasks Today, Mine column` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** groupMine puts every undated unassigned task into Unassigned (list.ts:181-185), and the section always renders first and expanded. Today it holds 34 rows; 30 have no date ('Brendan Ehlenfield', 'What restaurants?', 'HG 1, 2, etc Operating Agree...'). Overdue 25 starts about 1,940px down on desktop and about 2,550pt down on a 375 phone. 'Move all to today' only moves Mine's Overdue, so the 4 red unassigned rows stay late.
- **Why:** The first job of Today is to show what is late and due in under a minute. Right now the first screen on every device is undated legacy notes, and the approved No date collapse is bypassed for anything without an owner.
- **Change:** Keep Unassigned on top but limit it to unassigned tasks that are due by today or were created in the last 7 days. Fold undated older ones into a collapsed 'Unassigned, no date 30' row at the bottom, beside No date. Include unassigned late rows in Overdue's count and in Move all to today, marked with a gray 'Unassigned' sublabel.
- **Desktop, tablet, phone:** Desktop 1280: Overdue starts within the first screen of the Mine column. Tablet 768 and phone 375: Overdue is the first section after at most a few unassigned rows; the collapsed undated tail stays last.
- **Reuse:** TaskSection collapsible (task-section.tsx); groupMine in src/lib/tasks/list.ts.
- **Challenges:** Plan section 3 'Defaults I filled in' item 1 puts Unassigned at the top of Mine. Question for Connor: may it show only unassigned items due by today or new this week, with undated ones collapsed at the bottom?
- **References:** 
  - [Things 3](https://mobbin.com/screens/51b7617b-3a79-46c7-91e8-035532e61050): Today shows only what is dated for today; everything else waits elsewhere.
  - [Todoist](https://mobbin.com/screens/858c686b-66b3-4283-8f26-4a6f82b45b7b): Overdue is the first section on Today.
  - [Front](https://mobbin.com/screens/3b64830f-1d1f-4818-ae2a-28c3f6ffdaaf): Unassigned is a tab of the shared inbox, not part of a person's Open list.
  - [Linear](https://mobbin.com/screens/a085c0e8-477c-4459-b2ee-25d5a4c0340a): My issues opens on Assigned only, so the personal list stays personal.
  - [Front](https://mobbin.com/screens/2447f03a-a38e-42f5-a6b9-ffc1d4bdd6b8): 'Unassigned 230' next to 'Oldest 6d 18h' gives the age cue for the summary row.
- **Code:** `branch: src/lib/tasks/list.ts:176-194`, `branch: src/app/(app)/tasks/today-view.tsx:59-80`, `branch src/app/(app)/tasks/today-view.tsx:59-64`, `asana-migration-plan.md, Defaults I filled in, #1`, `branch src/lib/tasks/list.ts:176-193 (dueByToday at 181, unassigned push at 183)`, `branch src/app/(app)/tasks/today-view.tsx:59-65`
- **Also found as:** G2B-I01 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- **Verification:** confirmed. I counted 34 Unassigned rows: 5 dated and 29 undated. The Overdue header sits about 1,945px down on desktop and 2,870px down on a 375 phone, deeper than the finding says. Move all to today only takes mine.overdue (today-view.tsx:71), so the 4 late unassigned rows stay put. The Asana import may shorten the list, but the rule still keeps any undated unassigned task at the top forever. conflicts_with names plan default 1 correctly.

### BTASKS-005

**Ticking a task done has no toast and no Undo; the row just disappears**

High · Design change · effort S · `Today, All and Home rows: the round Done checkbox` · Every save is safe, instant and undoable

- **Migration branch:** Found on the migration branch's new screens
- **Today:** setDone runs the optimistic patch and the server action without any onDone toast (task-list-context.tsx:94-96). The row strikes through and then vanishes on revalidation, because Today and All Open only list active tasks. To recover from a mis-tap you have to find the task under All > Done, which sorts oldest first (see BTASKS-010).
- **Why:** Reschedule already offers Undo; completing is more common and just as reversible. The FEEL bar is that reversible actions get a toast with Undo instead of a confirm. Completion is also a payoff moment that should say what happened.
- **Change:** After a tick, show a toast 'Done: Call plumber' with Undo, and keep the row visible but struck through for about 1.5s before it collapses. For a repeating task use 'Done. Next one due Nov 5'. Undo restores the previous status, not just To do.
- **Desktop, tablet, phone:** Same on every size. Desktop toast bottom-left; phone toast full width above any sticky bar, with copy shortened to 'Done' plus Undo when the title won't fit on one line.
- **Reuse:** useToast with action (src/components/toast.tsx); the run() helper in task-list-context.tsx already passes onDone.
- **References:** 
  - [Cofounder](https://mobbin.com/screens/2e3d1577-be39-4fc0-b56f-7ff69c760117): A toast names the task that was marked complete.
  - [Todoist](https://mobbin.com/screens/75c4093b-73e7-4344-b2e7-54e90d94e58c): The change toast offers Undo.
  - [Todoist](https://mobbin.com/screens/6f00ee53-76bf-447a-bdb2-7b4161d42d94): "Task completed" toast with Undo in the corner.
  - [Todoist](https://mobbin.com/flows/75508f3a-1e8a-4c94-bdaf-2584f4e80f55): Phone flow: tap the circle, the row leaves, Undo appears above the tab bar.
  - [Superhuman Mail](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5): 'Marked as Done. UNDO' appears the moment the item leaves the list.
  - [Things 3](https://mobbin.com/screens/724087de-2e95-47ec-926c-efbdab249a23): Checked to-dos stay in place, grayed with a filled check, until you leave the view. A mis-tap is visible and fixable, and the rows below don't jump.
  - [Attio](https://mobbin.com/screens/24d97071-f951-4c50-b21a-cabe794fe10e): Row checks instantly and a "Task completed" toast appears above the tab bar.
  - [Todoist](https://mobbin.com/screens/09f39b7b-c17a-4f87-97e5-4a1af75c3938): "Undo · Completed" card at the bottom right after checking a task off.
  - [Notion](https://mobbin.com/screens/96e2efe2-c304-4a6c-91cd-ba59175dbaf2): Compact dark pill toast with an Undo arrow, above the phone toolbar.
  - [Superlist](https://mobbin.com/screens/54506b4b-9282-4bc1-b79d-2c1a48adf5a9): Checked items stay in place, struck through, so you see what you just did.
  - [Linear Mobile](https://mobbin.com/screens/da5b1f34-e51d-45c9-90aa-ba08e5684afa): A short toast confirms the action while the list stays in view.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): When an item leaves the list, a toast names the change ("Notification snoozed") and offers Undo.
  - [Linear Mobile](https://mobbin.com/screens/a625482c-b708-4b6b-a9b2-1f4a4feb26f6): A status move confirms with a toast that names the new state ("Issue moved to Design").
  - [Coda](https://mobbin.com/screens/580abcac-fdb0-4c72-b6ea-b529d42bfa1e): "1 doc moved to Work." with Undo
  - [Proton](https://mobbin.com/screens/01ac09ed-f2b8-4d3e-a5ce-1e95d6f57eea): Dark pill toast "successfully moved" with Undo and close
  - [Quicken](https://mobbin.com/screens/e9042731-b020-4b97-b8b7-b5ad5a97db06): "Transaction created." with Undo bottom-left
- **Code:** `branch: src/app/(app)/tasks/task-list-context.tsx:51-63 and 94-96`, `branch: src/lib/tasks/queries.ts:36-46`, `src/app/(app)/tasks/task-checkbox.tsx:6-18`, `src/app/(app)/tasks/task-row.tsx:115`, `branch:src/app/(app)/tasks/task-list-context.tsx:94-96`, `branch:src/lib/tasks/list.ts:275-276`, `branch:src/app/(app)/tasks/[id]/status-control.tsx:41-46`, `branch:src/app/(app)/tasks/[id]/fields.tsx:86,125-129,94-98`, `src/lib/tasks/service.ts:31-36 (revalidates /tasks, / and the task page on every toggle)`, `src/app/(app)/tasks/task-list-context.tsx:46-63,94-96`, `src/app/(app)/tasks/task-row.tsx:100`, `src/app/(app)/tasks/[id]/status-control.tsx:45`, `src/app/(app)/tasks/[id]/use-run.ts:11-44`, `src/lib/tasks/service.ts:41-47`, `eval /tasks: after click aria-checked 'true'; after the blocked write rolled back to 'false' with an error toast`, `src/app/(app)/tasks/task-checkbox.tsx:13 (start(() => toggleTask(id)), no optimistic state)`, `src/lib/tasks/service.ts:78-89, :32 (revalidatePath('/tasks'))`, `src/app/(app)/tasks/task-row.tsx:115 (row only dims while pending)`, `branch-src/src/app/(app)/tasks/task-list-context.tsx:94-96`, `branch-src/src/app/(app)/tasks/list-actions.ts:73-85`, `branch-src/src/lib/tasks/queries.ts:36-46`, `src/app/(app)/deals/deal-row.tsx:35-42`, `src/app/(app)/tasks/task-checkbox.tsx:5-13`, `branch src/app/(app)/tasks/task-list-context.tsx:94-96`, `branch src/app/(app)/tasks/task-list-context.tsx:65-73`, `branch src/app/(app)/deals/deal-row.tsx:34-41 (same as main)`
- **Also found as:** TASKS-009 (Tasks list, new task and task detail), FEEL-008 (Lens: interaction quality, feedback, states, speed and accessibility), FEEL-V08 (Lens: interaction quality, feedback, states, speed and accessibility), JOURNEYS-029 (Lens: the core jobs, end to end)
- **Verification:** confirmed. setDone passes no onDone (task-list-context.tsx:94-96). The patch only flips 'checked', so the row strikes through and then drops out when the page revalidates. Recovering a mis-tick means All > Done, which lists 400 of 1,825 rows, oldest first. The Undo must ship together with the BTASKS-003 fix.

### BTASKS-007

**Every row carries a bordered date button, including 30+ gray 'Due date' placeholders**

High · Design change · effort M · `Today and All rows (TaskRow date chip)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** TaskRow always renders the DueDatePicker chip (task-row.tsx:146-155). Rows without a date show a bordered gray 'Due date' button, which repeats 30 times in Unassigned. On touch the chip is a 44px bordered box on its own second line, so each phone row is about 75pt tall, and the list reads as a column of buttons rather than tasks.
- **Why:** Things 3 and Todoist show dates as quiet text that turns red only when late, and show nothing when there is no date. The repeated placeholder is noise that says nothing, against 'Everything on screen gives the user value'. The row height halves how much of the day fits on a phone.
- **Change:** Render the date as plain text in the row (red when late, muted otherwise) with no border; show no text at all when there is no date. Keep the picker one interaction away. On desktop the text gets a hover outline, plus a ghost calendar icon on hover for undated rows. On touch the whole date area remains a 44px tap target that opens the sheet, and undated rows are dated from the row menu (BTASKS-025) or the task page.
- **Desktop, tablet, phone:** Desktop 1280: one-line rows, date text in a fixed right column, outline on hover. Tablet 768: two-line rows, date text at the right end of line 2. Phone 375: same as tablet; row height drops to about 56pt; undated rows show only title and property.
- **Reuse:** DueDatePicker (src/components/due-date-picker.tsx) with a new `variant='text'` prop; pickerChip stays for the rail.
- **Challenges:** D7 says every date chip has quick picks. They stay. Question for Connor: may the row date render as plain text that opens the picker, instead of a bordered chip?
- **References:** 
  - [Things 3](https://mobbin.com/screens/51b7617b-3a79-46c7-91e8-035532e61050): Rows are title plus gray sublabel; only deadlines show, as small red text.
  - [Todoist](https://mobbin.com/screens/7ff218cf-1ddd-47ee-9123-72535e5f9283): Overdue dates are red text under the title with no chip border.
  - [Attio](https://mobbin.com/screens/5dab796d-b81b-4ac4-aa3a-f382b1682cb4): Due dates read 'Due tomorrow' as colored text in a column.
- **Code:** `branch: src/app/(app)/tasks/task-row.tsx:146-155`, `branch: src/components/due-date-picker.tsx:49 and 71`
- **Verification:** confirmed. I saw 29 bordered 'Due date' placeholders in Unassigned on desktop, and two-line phone rows 75px tall. The approved plan section 6 mock already draws the row date as plain text ('767 Prospect . Mon (red)'), so plain text is closer to the approved design than the chip is. The conflicts_with question about D7 still applies.

### BTASKS-009

**New task mixes native fields with chips, skips the quick-pick date picker and buries Property**

High · Design change · effort M · `/tasks/new` · Create where you are

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Field order is Title, Description, then Assignee (a chip) beside Due date (a native mm/dd/yyyy input), then Status (a native select) beside Repeats (a chip), and Property last as a full-width select. A Scheduled status adds a second native date. There is no Unit, no checklist, no back link and no Cancel. When opened from a property, the subtitle repeats the address the Property select already shows. The form says 'Description' while the task page says 'Notes'.
- **Why:** D7 promises quick picks on every date, yet this is the one date field without them. Two field languages in one card read as unfinished. For a property company the property is the first piece of context and drives the Unit field and lockbox, so it shouldn't come last.
- **Change:** Rebuild the form from the rail's own controls in rail order: Title, then a chip row of Property, Unit, Assignee, Due (DueDatePicker with quick picks), Status and Repeats, then Notes (with 'Visible to Zack' once a contractor is picked), then Checklist. Add a BackLink, a 'Never mind' secondary, and 'Create and add another'. Drop the subtitle when the property is preselected.
- **Desktop, tablet, phone:** Desktop 1280: a 640px card with chips on one wrapping row. Tablet 768: same card, full width. Phone 375: title, then chips scrolling sideways as on the task page, then Notes; Create task pins to the bottom.
- **Reuse:** TaskFields chips (src/app/(app)/tasks/[id]/fields.tsx), DueDatePicker, AssigneePicker, RepeatPicker, SelectChip, NotesField copy, BackLink.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/7ae39ce1-3be5-478b-be01-abd019105b6c): An inline new to-do form with Assigned to, When done, Due on and Notes in one labeled column.
  - [Basecamp](https://mobbin.com/screens/56f50dc4-7b99-409c-9d84-4bd6795fb5f3): Save card, Save and add another, Never mind.
  - [Todoist](https://mobbin.com/screens/1b8a0f00-20b8-43ff-af38-88f0e3e25e80): Creation uses the same property chips as the detail view.
  - [Jobber](https://mobbin.com/screens/ccc080fe-4001-497f-bdc3-53185ca9f85f): New task groups Date, Time and Repeating in one Schedule block.
  - [Todoist](https://mobbin.com/screens/789afeff-0567-4387-85f6-ba6a55aeafef): Date and Repeat live in one picker and read back as one phrase.
- **Code:** `branch: src/app/(app)/tasks/new/new-task-fields.tsx:36-80`, `branch: src/app/(app)/tasks/new/page.tsx:22-62`, `branch: src/app/(app)/tasks/new/new-task-fields.tsx:36-67`
- **Also found as:** BPLAY-023 (Branch: playbooks, templates and repeats)
- **Verification:** confirmed. I confirmed each point on new--desktop-light.png and new--mobile-light.png: a native mm/dd/yyyy Due field and a native Status select beside the Assignee and Repeats chips, Property last, a subtitle that repeats the preselected address, no Unit, no back link and no Cancel, and the label 'Description' where the task page says 'Notes'.

### BTASKS-V02

**All is one flat 236-row list with no break between late, upcoming and undated**

High · Design change · effort S · `/tasks/all (Open)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Open renders 236 rows as a single list sorted soonest due first. It opens on Pieter's tasks from April 2025 and runs through the Aug 28 overdue rows into upcoming and undated ones with no section headers. Only the red date chip tells late from upcoming. Done renders the same way (400 of 1,825 rows).
- **Why:** All is where a partner goes to find or check work across both partners. With no breaks you can't see where late ends and upcoming begins, or how much has no date, without reading every chip.
- **Change:** Group Open into the sections Today already uses: Overdue, This week, Later and No date (collapsed), each a TaskSection with its count. Search and the filters keep the grouping. Done uses the completion-day groups proposed in BTASKS-010.
- **Desktop, tablet, phone:** Desktop 1280: section headers over one-line rows. Tablet 768 and phone 375: the same headers over two-line rows; each header sticks under the tabs and clips at the card's divider.
- **Reuse:** TaskSection (src/app/(app)/tasks/task-section.tsx); a groupByDue helper beside groupMine in src/lib/tasks/list.ts.
- **Challenges:** Plan section 6 says All has 'the same rows, plus filters and Done', and week 2 adds an Upcoming tab. Question for Connor: may All group its rows into Overdue, This week, Later and No date now?
- **References:** 
  - [Todoist](https://mobbin.com/screens/4159b14b-0ff2-4130-8844-616b858a7e78): Upcoming separates Overdue (with Reschedule) from day groups such as 'Feb 4 · Today · Wednesday'.
  - [Attio](https://mobbin.com/screens/16b2e7b2-da40-4dc2-a63b-139c3078c1d9): Today, This week, Upcoming and Completed groups with counts, sorted by due date.
  - [Linear](https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b): Quiet group header rows with a count and a + per group.
  - [Linear](https://mobbin.com/screens/c61980d9-a5a7-4ccf-aac8-b3ba125e299a): Collapsible groups "In Progress 5", "Todo 5", "Backlog 21" with counts
  - [Mercury](https://mobbin.com/screens/628c4fb3-1ede-432f-be42-0d6dfd29d9c9): Phone list grouped under date headers
- **Code:** `branch: src/app/(app)/tasks/all/all-list.tsx:6-14`, `branch: src/lib/tasks/queries.ts:78-96`, `src/app/(app)/tasks/page.tsx:98-108`, `branch:src/app/(app)/tasks/all/all-list.tsx:6-14`, `branch:src/lib/tasks/queries.ts:89`, `branch:src/app/(app)/tasks/today-view.tsx:59-101`, `src/app/(app)/page.tsx:57-96`, `src/app/(app)/tasks/today-view.tsx:56-102`, `src/app/(app)/page.tsx:54-72`, `src/app/(app)/tasks/my-tasks-list.tsx:12-31`, `src/app/(app)/tasks/all/all-list.tsx:6-14`, `eval /tasks section headers: 'Unassigned 34', 'Overdue 25', No date 43`
- **Also found as:** TASKS-008 (Tasks list, new task and task detail), DATA-014 (Lens: tables, numbers, money, charts and status)
- **Verification:** verifier-found

### BTASKS-001

**Contractor jobs with a legacy Asana name are stranded in Unassigned, invisible to the contractor and to their group**

Medium · Fix · effort M · `/tasks (Today, Mine > Unassigned) and /tasks/[id]` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: the leftovers now have a backfill (40-link-legacy.ts, matching by email and then confirmed exact name), and its dry run reports how many open tasks still carry only a legacy name, as the finding asked. It has not been run. Still open, as design calls for Connor: legacy-name rows still get a filled avatar with no muted 'Asana: name' sublabel, and the task page shows only the muted 'Assigned in Asana to' line with no one-tap 'Assign to X?' suggestion.
- **Today:** This copy of the database has not had the Asana load run on it yet. matchPeople (src/lib/asana/map.ts:212) already matches Asana assignees to Contacts by email and normalized name, and Connor confirms those matches (plan 5.5). assigneeWrite (map.ts:1060) then sets assigneeContactId on rows that are open in Asana, and rows closed in Asana are deleted under D25. So these jobs will not be left stranded on Oct 29. What stays true until the load runs, and afterwards for any name it can't match: legacy-name rows sit in Unassigned with a filled, staff-style avatar ('JA', 'F', 'Z', 'KG'), and the task page reads Unassigned with nothing offering to link the person.
- **Why:** Under D12 the contractor sees only jobs assigned to their Contact, so these jobs never reach the portal when invites go out on Thu Oct 29. The partners also undercount each contractor's load. The section is called Unassigned, yet it shows a person avatar on these rows.
- **Change:** In the CSV-row reconciliation, match assigneeName to a Contact by exact email, then by normalized full name (José and Jose), and set assigneeContactId. For names that don't match, show the row with a muted 'Asana: José Alvarez' sublabel and no avatar. On the task page, replace the legacy line with a one-tap suggestion in the Assignee row: 'Assign to Zack Reading?' with Assign and Not him. Before the invites, report how many open tasks still carry only a legacy name.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the suggestion sits in the rail or the chip row under Assignee. Phone 375: the suggestion is a single row above the notes card with the Assign button; the full Asana email drops to the contractor's name only.
- **Reuse:** AssigneePicker (src/components/assignee-picker.tsx) for the confirm. The Avatar outline variant for contractors. The reconciliation step in the Asana import (plan section 5.5).
- **References:** 
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): Assignment is an explicit person chip with 'Notify them about this assignment', never free text.
  - [Brex](https://mobbin.com/screens/089cee58-b6b1-4bea-b028-d413aef5b694): 'We matched your receipts to the following expenses': match automatically, then show the result for one look.
  - [Front](https://mobbin.com/screens/3258fa83-bf07-454c-aeb7-a0db0261fdd7): The assign menu puts the most likely person first, which is where the suggestion goes.
- **Code:** `branch: src/lib/tasks/list.ts:58-65 and 182-185 (kind 'name' counts as unassigned)`, `branch: src/app/(app)/tasks/[id]/view.tsx:120`, `eval on /tasks/all Assignee select: 'Zack Reading' and 'zack@outlawcarpentry.com' both listed`, `branch src/app/(app)/tasks/[id]/view.tsx:122`, `branch src/app/(app)/tasks/today-view.tsx:62`, `eval on :3300 /tasks/all select[name=Assignee] options (duplicate pairs listed above)`, `branch src/app/(app)/tasks/[id]/view.tsx:120; src/app/(app)/tasks/[id]/page.tsx:210`, `branch src/lib/tasks/list.ts:61-65 (kind 'name' assignee)`
- **Also found as:** G2B-I02 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- **Verification:** partly. I confirmed the five rows with a legacy name in Unassigned (José Alvarez, [email], [email] twice, and Kenneth Gonzalez) in shots/verify-BTASKS/today--desktop-light.aria.txt. The task page (t-legacy--desktop-light.png) shows Unassigned with 'Assigned in Asana to José Alvarez' underneath. The matching half of the recommendation repeats what the importer already does. The display half is still worth doing: no avatar, a muted 'Asana: José Alvarez' sublabel, and a one-tap 'Assign to Zack Reading?'.

### BTASKS-006

**The Mine | Contractors switch carries no counts, so Needs review is invisible on touch devices**

Medium · Design change · effort S · `/tasks on tablet 768 and phone 375 (Mine | Contractors switch)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The Mine | Contractors switch carries no counts and Mine is the default; I confirmed this at 375 and 768 (today-vp--mobile-light.png, today-vp--tablet-light.png). There are no Review jobs in this data, so the Needs review case comes from the code only. The late counts are Jacob 5 and José 4, not 2. Under D6b and D20 both partners also get an email when a contractor marks a job done, so review is not invisible overall. It is only missing from the phone's default Today view.
- **Why:** Approving contractor work is a core daily job, and D6b emails both partners precisely because it waits on them. On the device they carry on site, the queue can't be seen without guessing to switch.
- **Change:** Use the SegmentedControl count slot: 'Mine 25' (overdue count) and 'Contractors 2' where the number is jobs in Needs review. Show it in red only while something waits on review. When Needs review is non-empty and Mine has nothing overdue, open on Contractors.
- **Desktop, tablet, phone:** Tablet 768 and phone 375: counts sit inside the switch; at 320 the labels stay on one line ('Mine 25', 'Crew 2' is not needed, the current width fits). Desktop 1280: both columns are visible, so the section headers already show counts and the switch stays hidden.
- **Reuse:** SegmentedControl's existing `count` option (src/components/segmented-control.tsx:8-10, 62).
- **References:** 
  - [Acctual](https://mobbin.com/screens/4b992650-0ce5-4fc7-9efb-8407b7ac70ac): Approval queues are tabs with counts: Draft 1, Approve 2, Ready for payment 3.
  - [Todoist](https://mobbin.com/screens/b0aa6925-dc7a-4e60-bfc1-347e57d330b5): The phone Today shows the Overdue count up front.
- **Code:** `branch: src/app/(app)/tasks/today-view.tsx:16-19 and 48-55`
- **Verification:** partly. Adding counts is cheap and worth it. Opening on Contractors automatically is debatable, since the default view would change under the user.

### BTASKS-008

**The task page has no one-tap Done; finishing a task takes the status menu**

Medium · Design change · effort S · `/tasks/[id] header` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Accurate: the header has no checkbox, Done takes two taps through the 7-item status menu with no toast (status-control.tsx:45), and on a phone the status chip sits at the right end of the back-link row (t-legacy--mobile-light.png). Calling it high overstates it: this is one extra tap, not a blocked job.
- **Why:** Done is the most common action on a task page. Things 3 and Todoist put the round checkbox right beside the title, and the list rows already use one, so the page breaks a pattern the user just touched.
- **Change:** Put the same round TaskCheckbox before the title for staff tasks. Ticking it sets Done, toasts 'Done' with Undo, and leaves the status chip to show the new state. For a contractor job in Review, the banner's Approve is the primary action instead, and the checkbox is hidden. Move the status chip next to the title on phone, under the back link.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: checkbox, status chip and title on one line. Phone 375: back link on row 1, then checkbox plus status chip with the title wrapping beside them; More stays top-right.
- **Reuse:** TaskCheckbox (src/app/(app)/tasks/task-checkbox.tsx); useRun with done and undo (use-run.ts).
- **Challenges:** Plan section 6, Task page: the main column opens with 'status, title'. Question for Connor: add a round Done checkbox before them for staff tasks?
- **References:** 
  - [Things 3](https://mobbin.com/screens/4b34a598-3d5f-4fba-91b1-d1fa51e61acc): The to-do detail leads with a round checkbox before the title.
  - [Todoist](https://mobbin.com/screens/8fc740cb-9b14-4405-b9e9-f1caa932e23b): Task detail puts the complete circle beside the title, with properties in a rail.
- **Code:** `branch: src/app/(app)/tasks/[id]/view.tsx:67-98`, `branch: src/app/(app)/tasks/[id]/status-control.tsx:41-46`
- **Verification:** partly. The Things 3 and Todoist references fit, and conflicts_with names plan section 6 correctly.

### BTASKS-010

**The Done list sorts oldest first by due date and never shows when or by whom a task was finished**

Medium · Fix · effort S · `/tasks/all?status=done` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** allTasks orders every filter by dueDate ascending (queries.ts:89), so Done opens on 'Make keys' from Nov 22, 2024. Each row repeats a green 'Done' chip, a strikethrough and a green check, and shows the old due date in a disabled chip instead of the completion date.
- **Why:** Done is the record of what was done, and without list Undo (BTASKS-005) it is the only way to find a mis-ticked task. The newest completions should come first. Once D25 deletes the CSV history, it will still list post-cutover work oldest first.
- **Change:** For status=done, order by completedAt descending and group by completion day ('Today', 'Yesterday', 'Oct 21'). Replace the due chip with 'Done Oct 21 · Connor' (completedBy), and drop the redundant Done chip on Done rows. Keep due-date order for Open.
- **Desktop, tablet, phone:** Desktop 1280: day headers with one-line rows, completion meta in the date column. Tablet 768 and phone 375: two-line rows, completion meta on line 2; the completer's name drops to initials on phone.
- **Reuse:** TaskSection for day groups; completedAt and completedByUserId already written in core.ts setStatus.
- **References:** 
  - [Todoist](https://mobbin.com/screens/69de9e9a-3e5c-4c8e-a6b6-f77d94297780): The completed log is grouped by day, newest first, with who completed each item.
  - [Linear](https://mobbin.com/screens/815793b1-5c75-43ac-94c7-93380781e337): Display options include 'Order completed by recency'.
  - [Things 3](https://mobbin.com/screens/627a2d8f-f5bb-408e-a724-c46b9e40a769): Logbook groups by completion day (Today, Yesterday) and prints the completion date in the checkbox column.
  - [Jobber](https://mobbin.com/screens/b90508d1-dc0d-47d2-a61a-3c49a4119f55): 'Completed Last Week' group with 'Completed on: Jul 25, 2025' and 'Completed by Sam Lee' on each row.
  - [Attio](https://mobbin.com/screens/16b2e7b2-da40-4dc2-a63b-139c3078c1d9): A Completed group sits apart from open work.
- **Code:** `branch: src/lib/tasks/queries.ts:78-96`, `src/app/(app)/tasks/page.tsx:82,101`, `branch:src/lib/tasks/queries.ts:81,89`, `branch:src/app/(app)/tasks/task-row.tsx:146-155`, `src/app/(app)/tasks/page.tsx:101`, `branch src/lib/tasks/queries.ts:89`, `branch src/app/(app)/tasks/task-row.tsx:66-67,148-156`
- **Also found as:** TASKS-021 (Tasks list, new task and task detail), TASKS-V07 (Tasks list, new task and task detail)
- **Verification:** confirmed. allTasks orders every filter by dueDate ascending (queries.ts:89). Done opens on 'Make keys' from Nov 22, 2024, and each row shows a green check, a 'Done' chip, a strikethrough and a disabled date chip (all-done--desktop-light.png). The list is capped at 400 of 1,825 rows.

### BTASKS-013

**A one-character title or a server refusal sends New task to the error page**

Medium · Fix · effort S · `/tasks/new submit` · Every save is safe, instant and undoable

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The title input only has `required`, but createTask parses title with min(2) inside withLog (actions.ts:26 and 50-75). A title like 'x' passes the browser check, throws on the server and lands on the route's error boundary, losing the typed form. Rule errors such as 'Pick the visit date.' take the same path.
- **Why:** A form should never throw the user to an error page for a validation rule; they lose what they typed.
- **Change:** Return an ActionResult (withResult) and show the message under the field it belongs to, keeping the form values. Mirror the rule in the browser: minLength=2 on the title.
- **Desktop, tablet, phone:** Same on every size; the inline message stays on one line under the field.
- **Reuse:** withResult (src/lib/server-action.ts); the inline-error pattern used by other forms.
- **Code:** `branch: src/app/(app)/tasks/actions.ts:25-75`, `branch: src/app/(app)/tasks/new/page.tsx:32-35`, `src/app/(app)/tasks/new/page.tsx:31,71`, `src/app/(app)/tasks/actions.ts:21-23`, `branch:src/app/(app)/tasks/new/page.tsx:30,34,59`, `branch:src/app/(app)/tasks/actions.ts:26,50-74`, `branch:src/lib/server-action.ts:35-42`
- **Also found as:** TASKS-033 (Tasks list, new task and task detail)
- **Verification:** confirmed. createTask wraps its work in withLog, which rethrows (actions.ts:50-75). A one-character title passes `required` and the form posts (I saw the POST fire). Zod's min(2) then throws and the page lands on (app)/error.tsx, losing everything typed.

### BTASKS-014

**Approve and Send back differ in order, weight and form between Today and the task page**

Medium · Design change · effort S · `Needs review on Today and the review banner on /tasks/[id]` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** On Today the row shows [Send back] as a ghost button, then [Approve] as secondary (review-actions.tsx:30-35). The banner on the task page shows [Approve] as primary, then [Send back] as secondary (review-banner.tsx:41-48). The two Send back sheets are separate components with different copy: placeholder 'What still needs doing?' plus a task title line and a Cancel button on Today, versus a label 'What needs another look?' with no Cancel on the task page.
- **Why:** The same decision should look and read the same everywhere, or the muscle memory for Approve lands on Send back. The approved banner reads '[Approve] [Send back]'.
- **Change:** Extract one ReviewActions component with Approve first and Send back second on both surfaces: Approve secondary in the list and primary in the banner. Use one SendBackSheet titled 'Send back to Zack', with the label 'What still needs doing?', the job title as the sublabel, and the buttons 'Never mind' and 'Send back'.
- **Desktop, tablet, phone:** Desktop 1280: the sheet is a 384px centered dialog. Tablet 768: the same dialog. Phone 375: a bottom sheet with the keyboard up; the buttons pin above the keyboard; on a 320 row the avatar drops and both buttons stay.
- **Reuse:** Sheet (src/components/sheet.tsx); fold review-banner.tsx's SendBackForm into review-actions.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): Approve primary, Decline beside it, in one fixed order wherever review happens.
  - [Airwallex](https://mobbin.com/screens/89c96631-be20-4176-be78-d24175e013ed): Reject then Approve in a fixed footer of the request drawer.
  - [Mercury](https://mobbin.com/screens/8156ac94-1476-4ca2-801e-89444dd78545): One approve control set, Approve then Decline, in the same order wherever a reimbursement is reviewed.
  - [Aboard](https://mobbin.com/screens/d15cd548-a758-4743-8944-99c825340019): One fixed Reject and Approve pair at the foot of the review panel, with Approve as the only filled button.
- **Code:** `branch: src/app/(app)/tasks/review-actions.tsx:28-57`, `branch: src/app/(app)/tasks/[id]/review-banner.tsx:41-84`, `branch: src/app/(app)/tasks/review-actions.tsx:30-57`, `branch: docs/asana-migration-plan.md:379,404`, `branch-src/src/app/(app)/tasks/review-actions.tsx:30-57`, `branch-src/src/app/(app)/tasks/[id]/review-banner.tsx:42,54,75-76`, `task-management-migration-4c9ddf HEAD: src/app/(app)/tasks/[id]/review-banner.tsx:44-62`
- **Also found as:** G1A-IV01 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. Checked in the code only, because no job in this data is in Review. review-actions.tsx:30-35 renders ghost Send back before secondary Approve. review-banner.tsx:41-48 renders primary Approve before secondary Send back. The two sheets differ in copy, Cancel button and maxLength (2000 vs 5000).

### BTASKS-015

**Approve is final on the spot: no Undo, though contractor emails wait 10 minutes**

Medium · Design change · effort S · `Approve on Today and on the task page` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Approve on Today toasts 'Approved: <title>' with no action (task-list-context.tsx:97-99). The banner toasts 'Approved' with no action (review-banner.tsx:42). Approve sets Done, which triggers the approved email to the contractor (D19), and for a repeating job it spawns the next copy.
- **Why:** A one-click status change that emails someone outside the company should be reversible for a few seconds. The D19 bundling window already makes a quiet undo possible before anything is sent.
- **Change:** Toast 'Approved. Zack gets an email' with Undo. Undo restores Review, drops the queued email from the bundle, and removes an untouched repeat copy (see BTASKS-003). Use the same toast on both surfaces.
- **Desktop, tablet, phone:** Same on every size; phone copy shortens to 'Approved' plus Undo.
- **Reuse:** useToast action; the notification outbox bundling (plan section 5.4).
- **References:** 
  - [Todoist](https://mobbin.com/screens/75c4093b-73e7-4344-b2e7-54e90d94e58c): The confirmation toast carries Undo.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Dark toast 'Notification snoozed' with Undo on the right: the exact toast anatomy for 'Approved. Zack gets an email.'
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): After Approve, the toast names the change ('Reimbursement payment approved') while the panel's timeline updates in place.
  - [Quicken](https://mobbin.com/screens/e9042731-b020-4b97-b8b7-b5ad5a97db06): "Transaction created" toast with Undo.
  - [PlanetScale](https://mobbin.com/screens/031355e0-f2c0-42a9-8848-f62a580d19e3): Toast after a review, and an "approved this deploy request" line in the timeline.
- **Code:** `branch: src/app/(app)/tasks/task-list-context.tsx:97-99`, `branch: src/app/(app)/tasks/[id]/review-banner.tsx:42`, `branch: docs/asana-migration-plan.md:66,80,251-255`, `src/app/(app)/tasks/[id]/review-banner.tsx:42`, `src/app/(app)/tasks/task-list-context.tsx:97-99`, `src/lib/tasks/rules.ts:74-79`, `src/lib/tasks/core.ts:351`
- **Also found as:** G1A-013 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. This is the same toast-with-Undo pattern as BTASKS-005 and BTASKS-017, so build one helper for all three. Undo on a repeating job depends on the BTASKS-003 fix.

### BTASKS-016

**Needs review rows ask for Approve without showing any evidence**

Medium · New capability · effort M · `Today, Contractors > Needs review rows` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** A Needs review row shows the title, an avatar with a first name, the target date and the two buttons (today-view.tsx:107-110). The photo count that the task page banner computes ('4 photos') is not on the row, and there are no thumbnails. Approving from Today means approving unseen work, or opening each job.
- **Why:** Ramp-style review puts the evidence beside the decision. The partners will approve from the list, so the list should show what was done.
- **Change:** Add to each row a sublabel 'Marked done 2h ago · 4 photos' and a strip of up to three 32px thumbnails that open the lightbox. On desktop, clicking the row body opens the job with the review banner in view.
- **Desktop, tablet, phone:** Desktop 1280: thumbnails sit inline before the buttons. Tablet 768: thumbnails on line 2. Phone 375: the count only ('4 photos'), with no thumbnails, and tapping the row opens the job.
- **Reuse:** MediaGrid and Lightbox (src/components/media-grid.tsx, lightbox.tsx); the photo count logic in tasks/[id]/page.tsx:190-197 moved into the list query.
- **References:** 
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): Review shows the attachment and timeline next to Approve and Decline.
  - [Deel](https://mobbin.com/screens/b6d82ee0-8694-4f55-a1d5-9f0964c8b13c): Approve and deny inline on each pending row, with the item's details on the row.
  - [Mercury](https://mobbin.com/screens/8156ac94-1476-4ca2-801e-89444dd78545): Two-pane review: the document large on the left, the amount, timeline and Approve or Decline on the right.
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): After Approve the panel stays put, the timeline updates and a toast names the change.
  - [Superhuman Mail](https://mobbin.com/screens/ac146694-19c7-4bbd-81dc-409591cebd20): An open item with up and down arrows at the top left to move to the next one without returning to the list.
- **Code:** `branch: src/app/(app)/tasks/today-view.tsx:106-111`, `branch: src/app/(app)/tasks/[id]/page.tsx:190-197`, `task-management-migration-4c9ddf/src/app/(app)/tasks/today-view.tsx:105-111`, `task-management-migration-4c9ddf/src/app/(app)/tasks/review-actions.tsx:30-36`, `task-management-migration-4c9ddf/src/app/(app)/tasks/task-list-context.tsx:102-103`, `branch-src/src/app/(app)/tasks/today-view.tsx:105-111`, `branch-src/src/app/(app)/tasks/review-actions.tsx:30-36`
- **Also found as:** G1A-I04 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. Checked in the code. The photo count exists only on the task page (page.tsx:190-197), and the list query (LIST_SELECT) has no media.

### BTASKS-017

**Status changes from the menu are silent, while Cancel from the More menu toasts with Undo**

Medium · Design change · effort S · `/tasks/[id] status menu` · Every save is safe, instant and undoable

- **Migration branch:** Found on the migration branch's new screens
- **Today:** choose() runs setTaskStatus with only an optimistic `before` and no `done` or `undo` (status-control.tsx:41-46). Picking Done, Canceled, In progress or To do changes the chip silently. The More menu's 'Cancel task' does the same state change but toasts 'Task canceled' with Undo (header.tsx:72-84).
- **Why:** Two routes to the same change behave differently. Status changes on contractor jobs also email the contractor (D19), so they deserve a confirmation that can be undone.
- **Change:** Give every status pick the same toast pattern: 'Set to Done' with Undo, which restores the previous status including the Waiting reason or visit date. On a contractor job, add the effect: 'Set to Scheduled. Zack gets an email'.
- **Desktop, tablet, phone:** Same on every size; the phone toast drops the email clause when it won't fit one line.
- **Reuse:** useRun's done and undo options (src/app/(app)/tasks/[id]/use-run.ts) as already used by MoreMenu.
- **References:** 
  - [Todoist](https://mobbin.com/screens/8fc740cb-9b14-4405-b9e9-f1caa932e23b): Field changes on the detail view toast with Undo.
- **Code:** `branch: src/app/(app)/tasks/[id]/status-control.tsx:41-46`, `branch: src/app/(app)/tasks/[id]/header.tsx:72-84`
- **Verification:** confirmed. choose() passes only `before` (status-control.tsx:45). MoreMenu's Cancel task passes done and undo (header.tsx:76-79).

### BTASKS-018

**Rows vanish the instant they're moved, and keyboard focus drops to the page body**

Medium · Design change · effort M · `Today rows after a reschedule or tick` · Every save is safe, instant and undoable

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Picking Tomorrow on an Unassigned or Today row patches its date optimistically, groupMine then drops it, and it disappears at once with no motion. With the keyboard (Tab to the chip, Enter, then key 2), focus lands on <body> after the popover closes, so the next Tab starts from the top of the page.
- **Why:** Things 3 keeps a changed row in place for a beat so the eye can follow, then animates it out. Losing focus breaks keyboard triage of a 25-row Overdue list one row at a time.
- **Change:** Hold a moved or completed row for about 1s with its new state (struck through, or the new date in muted text), then collapse it with a short height spring (none under reduced motion). Move focus to the next row's link, or the previous one at the end of a section.
- **Desktop, tablet, phone:** Same behavior at every size; on phone the collapse also reflows the two-line rows below.
- **Reuse:** useOptimistic patch in task-list-context.tsx; the existing spring tokens (animate-*); TaskRow's row link as the focus target.
- **References:** 
  - [Things 3](https://mobbin.com/screens/5bc4a73d-af7d-4e63-aca2-27d13a2b1ed1): Edits happen in place in the list (When and Move bar) without the list jumping.
  - [Todoist](https://mobbin.com/screens/75c4093b-73e7-4344-b2e7-54e90d94e58c): After a reschedule the list settles and a toast states the move.
- **Code:** `branch: src/lib/tasks/list.ts:264-280`, `branch: src/app/(app)/tasks/task-list-context.tsx:78-81`
- **Verification:** confirmed. Reproduced. After picking Tomorrow on Mud Drywall, document.activeElement is BODY on both desktop and phone. The row leaves Unassigned during the optimistic update, so focus has nowhere to go back to.

### BTASKS-020

**The phone composer floats mid-screen on short tasks, and its edges miss the 16px gutter**

Medium · Design change · effort S · `/tasks/[id] on phone 375 and 320` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The composer is sticky to the bottom of the content (composer.tsx:191), not the viewport. On a short task (no activity) it sits around 545pt with empty gray page below it. Its inner padding is 6px, so the Send button and the 'Reply to Device | Internal' switch end 6pt from the screen edge while the cards above keep 16px.
- **Why:** A bar meant to sit at the bottom reads as broken when it hangs halfway down. Things that should line up don't: the right edges of Send and the cards differ by 10pt.
- **Change:** Give the page's main column min-height to the viewport on phones so the sticky composer always reaches the bottom edge, or use fixed positioning plus a matching bottom padding. Set the composer's inner padding to 16px left and right so the camera icon and Send line up with the cards.
- **Desktop, tablet, phone:** Phone 375 and 320: docked at the screen bottom with the safe area. Tablet 768 and desktop 1280: unchanged, an inline card after Activity.
- **Reuse:** Composer and useToastInset (already lifts toasts above it).
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): The Comment pill stays docked at the screen bottom regardless of content length.
- **Code:** `branch: src/app/(app)/tasks/[id]/composer.tsx:189-199 and 216`
- **Verification:** confirmed. Reproduced on t-legacy--mobile-light.png. The composer starts about 523px down with empty gray page below it. px-1.5 leaves Send 6px from the screen edge, while the cards above keep 16px.

### BTASKS-021

**Edits that email the contractor save silently, with no 'Saved' and no hint that Zack will hear about it**

Medium · Design change · effort S · `Task page notes, date and status edits on a contractor job` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Notes save on blur with no confirmation (notes.tsx:29-32); only the textarea is disabled while pending. 'Visible to Device' sits above the notes. A row reschedule on a contractor job toasts 'Moved to Mon Oct 26', the same as a staff task. Under D19, notes changes, target date changes and status changes all email the contractor (bundled over 10 minutes), and nothing on screen says so.
- **Why:** Close the loop means people see what their input set off. A partner tidying notes or a date may not realize it emails the contractor, and the email can't be taken back once sent.
- **Change:** After a notes save, show a quiet inline 'Saved' for 2s. On a contractor job, add the effect to the confirmations: 'Saved. Zack gets an update' and 'Moved to Mon Oct 26. Zack gets an email'. Keep it to one line; drop the second clause on phones if it won't fit.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: 'Saved' sits right-aligned on the 'Visible to Zack' line. Phone 375: the same line; toasts shorten to the first clause.
- **Reuse:** NotesField; movedMessage in src/lib/tasks/list.ts; useToast.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): 'Notify them about this assignment' makes the email consequence explicit.
  - [Linear](https://mobbin.com/screens/62cae494-a6e5-41be-b8bf-5a16df4f73ab): Edits confirm in a toast that names the result.
- **Code:** `branch: src/app/(app)/tasks/[id]/notes.tsx:29-53`, `branch: src/lib/tasks/list.ts:286-294`
- **Verification:** confirmed. NotesField saves on blur with no confirmation (notes.tsx:29-32), and the reschedule toast reads the same on contractor jobs (list.ts:286-294).

### BTASKS-023

**Comments can't be edited or deleted, even Shared ones that reach the contractor**

Medium · New capability · effort M · `/tasks/[id] activity` · One record layout for every record

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Comment cards show the author, time, body, files and an Internal tag, with no menu (activity.tsx:74-103). The service has no edit or delete path for comments.
- **Why:** A typo, a wrong address or an Internal note posted as Shared cannot be corrected. With D19's 10-minute bundling, a fast edit or delete could even stop the wrong text reaching the contractor.
- **Change:** Give each of your own comments a hover '…' menu on desktop (always visible on touch) with Edit, Make internal or Make shared, and Delete. Edited comments show '(edited)'. A delete within the bundle window removes the queued email; after it, the contractor sees 'Comment removed'.
- **Desktop, tablet, phone:** Desktop 1280: the menu shows on hover or focus. Tablet 768 and phone 375: an always-visible 44px '…' at the card's top right; Edit reuses the composer.
- **Reuse:** Menu (src/components/menu.tsx), the FilesList '…' pattern (files-list.tsx:67-81), ConfirmDialog for Delete.
- **References:** 
  - [Linear](https://mobbin.com/screens/1a4540b2-6c15-49ff-a07f-4fddb7490e38): A comment shows '(edited)' and its own actions menu.
- **Code:** `branch: src/app/(app)/tasks/[id]/activity.tsx:74-103`
- **Verification:** confirmed. The service has no edit or delete for comments (service.ts exports), and the activity cards have no menu.

### BTASKS-024

**Checklist items can only be added and ticked, never renamed, removed or reordered**

Medium · New capability · effort M · `/tasks/[id] checklist` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Rows are a checkbox plus static text (checklist.tsx:46-66). The service offers only setChecklistItem and addChecklistItem. A new item also appears only after the server round trip. Repeats copy the checklist forward (core.ts:396-398), so a typo is copied into every future copy.
- **Why:** Checklists drive contractor jobs (Uppers, Lowers, Hardware) and repeat forever. Fixing one wrong item currently means deleting the task.
- **Change:** Tap or click an item's text to edit it in place (Enter saves, Esc cancels). Clearing the text and pressing Enter removes it, with Undo in a toast. Add a drag handle on desktop hover and a Reorder mode on touch. Add new items optimistically.
- **Desktop, tablet, phone:** Desktop 1280: hover shows the drag handle and an x. Tablet 768 and phone 375: tap-to-edit (no permanent pencils), long-press to drag.
- **Reuse:** InlineAddressField-style in-place editing (src/components/inline-address-field.tsx), useOptimistic, useToast.
- **References:** 
  - [Things 3](https://mobbin.com/screens/18b05379-2af1-41ab-afef-0ca4870933c1): Checklist rows have drag handles and an inline delete while editing.
- **Code:** `branch: src/app/(app)/tasks/[id]/checklist.tsx:11-126`, `branch: src/lib/tasks/service.ts:119-126`
- **Verification:** confirmed. The service offers only setChecklistItem and addChecklistItem. Checklist items imported from Asana subtasks will need fixing too. Things 3 ref 18b05379 checked on Mobbin; it matches.

### BTASKS-025

**A row can't be handed to a contractor; reassigning means opening the task**

Medium · New capability · effort M · `Today and All rows` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** A row exposes only the Done checkbox and the date chip (task-row.tsx). To hand 'Repair Drywall' to Zack from Today, the user opens the task, opens Assignee, searches and picks, then goes back: about 5 interactions per job. There is no context menu, no right-click and no long-press.
- **Why:** Handing work to contractors is one of the four daily jobs. The bulk bar and shortcuts come after cutover; a per-row menu is the minimum that makes Today a place to act, not only to read.
- **Change:** Add a row menu: right-click and a hover '…' on desktop, and long-press plus a visible '…' on touch. It offers Assign to… (AssigneePicker), Reschedule (quick picks), Status, Copy link and Open. Assigning a contractor moves the row into that contractor's group with a toast: 'Assigned to Zack. He gets an email' with Undo.
- **Desktop, tablet, phone:** Desktop 1280: '…' appears on row hover at the right, plus right-click. Tablet 768: a 44px '…' at the row end. Phone 375: long-press opens a sheet with the same items; the '…' drops to save width.
- **Reuse:** Menu, AssigneePicker, DueDatePicker panel, Sheet; the rescheduleTasks and patch actions.
- **References:** 
  - [Todoist](https://mobbin.com/screens/52758ad6-7145-46d7-826b-2469b17f2ee0): The row context menu holds date icons, Move to, Complete recurring task, Copy link and Delete.
  - [Things 3](https://mobbin.com/screens/5bc4a73d-af7d-4e63-aca2-27d13a2b1ed1): Selected rows get When and Move actions without opening the to-do.
- **Code:** `branch: src/app/(app)/tasks/task-row.tsx:70-161`
- **Verification:** confirmed. Week 2 plans a bulk action bar (plan section 4), but no per-row menu is planned. A row exposes only the checkbox and the date chip.

### BTASKS-027

**Four rows of chrome take the top 38% of the phone screen before the first task**

Medium · Design change · effort S · `/tasks on phone 375 and tablet 768` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Found on the migration branch's new screens
- **Today:** On a 375x667 phone the first row starts about 257pt down. Above it are the 'Tasks' H1 with a large '+ New task' button, the 'Today | All' tabs, and the 'Mine | Contractors' switch, each on its own row with full spacing.
- **Why:** The phone is where the partners triage between properties. A phone app should be a deliberate subset, with content first.
- **Change:** On phones, shrink New task to a 44px '+' icon button beside the H1 (or a thumb-reach '+' at the bottom right until the D10 bottom bar lands). Tighten the spacing between the tabs and the switch to 8px, and make the switch full width under the tabs. Target the first row at about 170pt.
- **Desktop, tablet, phone:** Phone 375 and 320: icon '+', tighter stack. Tablet 768: keep the labeled button, tighten the gaps. Desktop 1280: unchanged.
- **Reuse:** PageHeader actions, LinkButton icon size, SegmentedControl full width.
- **Challenges:** D10 adds a labeled phone bottom bar after cutover. Question for Connor: may New task become a '+' icon on phones now, moving into the bottom bar later?
- **References:** 
  - [Things 3](https://mobbin.com/screens/51b7617b-3a79-46c7-91e8-035532e61050): The title sits directly above the list, with a floating '+' in thumb reach.
  - [Todoist](https://mobbin.com/screens/7ff218cf-1ddd-47ee-9123-72535e5f9283): Today starts with Overdue directly under a compact header.
- **Code:** `branch: src/app/(app)/tasks/tasks-header.tsx:5-26`
- **Verification:** confirmed. Measured: the first row starts about 302px down a 667px phone (45%), worse than the 38% stated.

### BTASKS-028

**On two-line rows the date chip slides left and right with each address**

Medium · Design change · effort S · `Today and All rows at tablet 768 and phone 375 (two-line rows)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Line 2 is property, then an avatar slot, then the date, left to right. The date's x position changes with the address length ('15 Oxford Ave.' versus '767 Prospect Avenue'). Rows with no property start the date at the indent. In Unassigned an empty 20px avatar slot is reserved even when nobody is named, leaving a visible gap ('court order date', 'side letter agreement').
- **Why:** Per-item status and dates belong in one fixed, skimmable spot, and things that should line up have to line up exactly. A ragged date column makes the late items harder to scan.
- **Change:** On two-line rows, pin the date to the right edge of line 2 (or line 1, beside the title) so it forms a column. Let the property take the remaining width and truncate. Render the avatar slot only when there is a person.
- **Desktop, tablet, phone:** Tablet 768 and phone 375: the date is right-aligned on line 2. At 320 it is still right-aligned, with the property truncating first. Desktop 1280 one-line rows are already column-aligned.
- **Reuse:** TaskRow layout classes (src/app/(app)/tasks/task-row.tsx:103-156).
- **References:** 
  - [Todoist](https://mobbin.com/screens/858c686b-66b3-4283-8f26-4a6f82b45b7b): Meta under the title, with the project pinned to the right edge of each row.
  - [Things 3](https://mobbin.com/screens/51b7617b-3a79-46c7-91e8-035532e61050): Deadline flags sit at a fixed right edge on every row.
- **Code:** `branch: src/app/(app)/tasks/task-row.tsx:121-131`
- **Verification:** confirmed. Visible on today-vp--tablet-light.png. The date moves with each address length, starts at the indent on rows with no property, and sits after an empty 20px avatar gap on 'court order date' and 'side letter agreement'.

### BTASKS-029

**One-line rows cut titles at about 190px while fixed columns hold empty space**

Medium · Design change · effort M · `Today at desktop 1280 and wide 1920` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** In each 563px column the row reserves a 144px property column, a 20px avatar slot and a 112px date column, even when they are blank ('Finish windows, door and ba...' has no property but still truncates). Contractor rows add a status chip, so titles read '428 normal upper run electric ...', 'install shower and surround (w...'. At 1920 the page stays capped at the same width, so the same titles are cut on a screen with 700px to spare.
- **Why:** The title is the information. Cutting it to make columns line up trades meaning for tidiness, and the house rules say to shorten words, not hide them.
- **Change:** Move the property to a gray sublabel under the title on desktop too (as Things 3 does), keeping one fixed right column for the date (plus the avatar in mixed lists). Show the status chip only when it isn't the column's default: drop 'To do' on contractor rows, where every row says it. From 1440px, widen the page cap so both columns grow.
- **Desktop, tablet, phone:** Desktop 1280: two-line compact rows (title, then property), with the date right-aligned. Wide 1920: wider columns, so titles show whole. Tablet 768 and phone 375: unchanged two-line rows.
- **Reuse:** TaskRow; the container query already in place.
- **Challenges:** The plan section 6 desktop mock shows one-line rows with the property beside the title. Question for Connor: may the property drop to a sublabel so titles stop truncating?
- **References:** 
  - [Things 3](https://mobbin.com/screens/51b7617b-3a79-46c7-91e8-035532e61050): Title on line 1, area as a gray sublabel on line 2.
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Titles take the flexible width; only the date sits in a fixed right column.
- **Code:** `branch: src/app/(app)/tasks/task-row.tsx:96-117 and 146`
- **Verification:** confirmed. Measured two 564px columns at both 1280 and 1920. Contractor titles truncate beside a 'To do' chip that every row repeats.

### BTASKS-030

**A finished task never says when it was finished or by whom**

Medium · Design change · effort S · `/tasks/[id] for Done and Canceled tasks` · One record layout for every record

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The imported Done task 'Get a new attorney for Kiavi' shows a struck-through title, a 'Done' chip, 'No activity yet.' and a rail ending at 'Created Nov 21, 2024'. The page query doesn't select completedAt or completedBy (tasks/[id]/page.tsx:29-87), even though setStatus records both.
- **Why:** Close the loop means a record of what was done. Months later the question is when it was finished and who did it, and the page can't answer.
- **Change:** Add a rail row after Created: 'Done Oct 21 · Pieter' (or 'Canceled Oct 21 · Connor', or 'Approved Oct 21 · Connor' for contractor jobs). Stop striking through the large page title; the chip and the rail carry the state.
- **Desktop, tablet, phone:** Desktop 1280: a rail row. Tablet 768 and phone 375: a muted line under the title ('Done Oct 21 by Pieter'), since Created is hidden below lg.
- **Reuse:** TaskFields Row (src/app/(app)/tasks/[id]/fields.tsx:176-182); fmtDay.
- **References:** 
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Activity and properties record who moved the issue and when.
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): The Details rail carries 'Source: Manually entered from Dashboard' and 'Last updated' as quiet facts.
  - [Linear](https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33): Activity starts with 'Alex Smith created the issue · just now', so every record has an origin.
- **Code:** `branch: src/app/(app)/tasks/[id]/page.tsx:29-87 and 199-200`, `branch: src/app/(app)/tasks/[id]/header.tsx:23`, `prisma/schema.prisma:228-240 (asanaId, autoKey, createdAt, completedAt)`, `src/app/(app)/tasks/[id]/task-detail.tsx:59 'Completed' / 'Mark complete'`, `branch-src/src/app/(app)/tasks/[id]/page.tsx:199-200`, `branch-src/src/app/(app)/tasks/[id]/fields.tsx:169-171`
- **Also found as:** COPY-I05 (Lens: words on every screen)
- **Verification:** confirmed. t-sample--desktop-light.png shows a struck-through title, a Done chip and 'Created Nov 21, 2024', with no completion row. page.tsx never selects completedAt.

### BTASKS-031

**A cleared Today ends on gray text instead of a payoff with the next step**

Medium · Design change · effort S · `Today empty columns` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The copy is as stated, but 'Nothing due today.' only shows when No date is empty too: mineEmpty counts noDate (today-view.tsx:44). With 43 undated tasks, a cleared day shows only the collapsed 'No date 43' row and no message at all, so the payoff moment never appears.
- **Why:** Clearing the day is the payoff moment the house rules call out. It should show what happened and what's next, with line spot art and a warm heading, not a generic line.
- **Change:** Mine empty: single-color line spot art, the heading 'You're clear for today, Connor.', and one next step with counts from data: 'Tomorrow: 3 tasks' (links to All filtered to tomorrow) or 'No date: 43' (expands it). Contractors empty: 'No jobs out with contractors.' with an 'Assign a job' link to New task with the contractor picker open.
- **Desktop, tablet, phone:** Desktop 1280: art 96px, centered in the column card. Tablet 768: same. Phone 375: art 64px; the heading stays on one line ('You're clear for today.' without the name when needed).
- **Reuse:** EmptyState (src/components/ui.tsx); the first name from the signed-in user.
- **References:** 
  - [Twenty](https://mobbin.com/screens/acb5f120-4a9f-44fb-a2ab-54ea7879be88): Line spot art, 'Mission accomplished' and a New task button.
  - [Gusto](https://mobbin.com/screens/164700e6-85d8-4614-96bc-104108294abb): 'All caught up', with what happens next in one line.
  - [Airbnb](https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32): Empty Today is one sentence over a single illustration.
  - [Mercury](https://mobbin.com/screens/1e034b7d-1cce-4fa7-967e-534708cebbdc): All clear said once, as a line under the greeting.
  - [Airbnb](https://mobbin.com/screens/8249f9ca-1fdc-4f97-870f-974d6811a36c): Empty Today with spot art, a plain heading and a next-step card
  - [Superhuman Mail](https://mobbin.com/screens/fbdb4339-367d-4571-8c9c-daf79b8c098c): An empty inbox becomes a full-bleed photograph. The reward is the image, not a check mark.
  - [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): Single-color line art with a plain heading and a concrete next step.
  - [Superhuman Mail](https://mobbin.com/screens/535b097f-547d-44dc-88c9-93d041053752): Full-bleed photograph with a small 'You've hit Inbox Zero!' line.
  - [Brex](https://mobbin.com/screens/b7d8dc8b-337d-4003-9f81-c52610f549c0): Empty Tasks: one heading and one line saying what happens next.
- **Code:** `branch: src/app/(app)/tasks/today-view.tsx:58, 105, 140-142`, `src/app/(app)/page.tsx:65-68`, `src/app/(app)/page.tsx:64-68`, `branch-src/src/app/(app)/page.tsx:62-65`, `src/app/(app)/page.tsx:67`, `branch-src/src/app/(app)/tasks/today-view.tsx:58`, `branch-src/src/app/(app)/tasks/today-view.tsx:105`, `branch-src/src/app/(app)/tasks/all/page.tsx:44-47`
- **Also found as:** SHELL-054 (App shell, sidebar, top bar, global search and Home), FEEL-I13 (Lens: interaction quality, feedback, states, speed and accessibility), TASKS-I13 (Tasks list, new task and task detail)
- **Verification:** partly. The recommendation stands. It also needs the empty test to ignore No date.

### BTASKS-033

**Review's red status chip shares red with overdue dates in the same row**

Medium · Design change · effort S · `All tab, task page and status menu` · One design system, fixed in the primitives

- **Migration branch:** Found on the migration branch's new screens
- **Today:** STATUS_TONE gives REVIEW red (status-badge.tsx:17), and DueDatePicker paints overdue dates red (due-date-picker.tsx:88). On All, a Review job with a passed target shows two different reds meaning two different things. In the status menu, Review reads as an error pill.
- **Why:** House rule: statuses keep fixed colors that no other mark in the same view reuses. Red is also the universal 'something's wrong' color, while Review just means waiting on you.
- **Change:** Keep red for late dates only. Give Review a tone no other mark uses in task views, such as orange or the primary blue outline that reads as 'your move', and recheck contrast in both themes.
- **Desktop, tablet, phone:** Color only; same at every size and theme.
- **Reuse:** Badge tones in src/components/ui.tsx; STATUS_TONE in src/components/status-badge.tsx.
- **Challenges:** Plan section 7 reuse check sets 'Review red'. The house rule says status colors aren't reused by other marks in the same view. Question for Connor: change Review's tone?
- **References:** 
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): 'Pending Review' uses a neutral tone; red is kept for errors.
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Each status has its own icon and color, distinct from the date color.
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): Red appears only on deadline flags ('today'); every other mark stays neutral.
  - [Linear](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1): Workflow states use a glyph family in neutral, yellow, blue and gray, so no state competes with a lateness red.
  - [Remote](https://mobbin.com/screens/61cd57c4-944b-4d75-a5ee-96a944a6a743): "Needs review" is its own tab and pending card, kept apart from red error states.
  - [Deel](https://mobbin.com/screens/b6d82ee0-8694-4f55-a1d5-9f0964c8b13c): "Pending your approval" is a neutral chip, with color kept for the approve and deny actions.
- **Code:** `branch: src/components/status-badge.tsx:6-20`, `branch: src/components/due-date-picker.tsx:88`, `src/app/(app)/tasks/task-row.tsx:235-239`, `branch: docs/asana-migration-plan.md:446`, `branch:src/components/status-badge.tsx:12-20`, `branch:src/app/(app)/tasks/today-view.tsx:109`, `branch:src/lib/tasks/list.ts:isOverdue/isTargetLate`
- **Also found as:** TASKS-023 (Tasks list, new task and task detail)
- **Verification:** confirmed. The status menu shows Review in red (job-menus--status--desktop-dark.png), the same red as overdue dates. conflicts_with names the plan's 'Review red' against the house rule correctly.

### BTASKS-V01

**Booking a visit stacks two 'Visit date' sheets and a confirm button**

Medium · Design change · effort S · `/tasks/[id] status menu > Scheduled (phone 375 shown; same flow at every size)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Picking Scheduled from the status chip opens a 'Visit date' sheet that holds only a date chip (prefilled with the Due date) and a 'Set to Scheduled' button. Changing the date opens a second sheet with the same title on top of the first, and it offers 'No date' even though Scheduled requires a date. Booking a new day on a phone takes five taps through two layers: the chip, Scheduled, the date chip, the day, then Set to Scheduled.
- **Why:** Booking a contractor visit is one of the most frequent status changes, and D6c ties the visit date to Scheduled. Two stacked sheets with the same title plus a confirm step read like a nested form, and an Esc or swipe can close the wrong layer.
- **Change:** When Scheduled is picked, open the date panel itself under the title 'Visit date': quick picks and the calendar, with no 'No date' row. Picking a date sets Scheduled with that date in one step and shows the toast 'Scheduled for Mon Oct 26' with Undo. Later changes to the visit date stay on the row and rail date chip as today.
- **Desktop, tablet, phone:** Desktop 1280: the panel opens as a popover anchored to the status chip. Tablet 768: the same centered dialog the date chips use. Phone 375: one bottom sheet with 44px quick picks and the calendar; nothing stacks.
- **Reuse:** DuePanel and MonthCalendar in src/components/due-date-picker.tsx with a prop that hides No date; useRun with done and undo (src/app/(app)/tasks/[id]/use-run.ts).
- **References:** 
  - [Todoist](https://mobbin.com/screens/11b9d667-53e6-4af4-abd8-d8c726a6b29a): One Date sheet holds the quick picks and the calendar, and a single tap sets the date.
- **Code:** `branch: src/app/(app)/tasks/[id]/status-control.tsx:89-100 and 163-180`
- **Verification:** verifier-found

### BTASKS-011

**Failure toasts are cut off mid-sentence and never say which row rolled back**

Low · Fix · effort S · `All task lists and the task page: failure toasts` · Every save is safe, instant and undoable

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Reproduced: a failed save shows 'Something went wrong saving that. Try a...' on a phone and doesn't say which task failed (date--after--mobile-light.png). userMessage turns zod errors into 'Invalid <path>: ...'. Failures are rare, though; it took the harness blocking the write to trigger one. That makes this polish, not medium.
- **Why:** The toast is the only feedback for every list edit. Cut-off guidance and an unnamed rollback leave the user guessing which of 25 moved rows failed.
- **Change:** Use a short, specific line with a Retry action: 'Couldn't move Mud Drywall' [Retry], or for bulk moves 'Couldn't move 25 tasks' [Retry]. Map zod errors to plain messages before they reach a toast. Keep the reload advice out of the toast; a second consecutive failure can swap to 'Still failing. Reload' [Reload].
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: up to 384px, one line. Phone 375: full width, one line; the task title truncates first, not the verb.
- **Reuse:** ToastInput.action (src/components/toast.tsx); the run() wrapper in task-list-context.tsx knows the task and the action.
- **References:** 
  - [Todoist](https://mobbin.com/screens/75c4093b-73e7-4344-b2e7-54e90d94e58c): Toast copy fits on one line and names the result.
- **Code:** `branch: src/lib/action-result.ts:18-36`, `branch: src/components/toast.tsx:92`
- **Verification:** partly. The fix is still right: a short line that names the task, with Retry.

### BTASKS-012

**Rescheduling a late task opens the calendar on the old month**

Low · Fix · effort S · `Date picker on an overdue row or field` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Confirmed: the picker on Mud Drywall opens on August 2026 on both desktop and phone. The quick picks (Today, Tomorrow, Monday, Next week) cover the usual forward moves, so the extra month clicks only cost anything for dates beyond next week.
- **Why:** A late task is always moved forward. Starting on the past month adds clicks to the most common reschedule and puts the stale date in the middle of the view.
- **Change:** When the value is before today, focus today's month and keep the old date marked with a red dot. Focus the stored month only when the date is today or later.
- **Desktop, tablet, phone:** Same on every size: desktop popover, tablet dialog, phone sheet.
- **Reuse:** MonthCalendar in src/components/due-date-picker.tsx.
- **References:** 
  - [Todoist](https://mobbin.com/screens/8fc740cb-9b14-4405-b9e9-f1caa932e23b): The date popover opens on the current month with today marked.
- **Code:** `branch: src/components/due-date-picker.tsx:189-194`
- **Verification:** partly. The fix is cheap and correct.

### BTASKS-019

**The Shared/Internal switch shows on staff-only tasks, and on jobs its first option reads as an action**

Low · Design change · effort S · `/tasks/[id] composer` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The labels are as stated: 'Shared | Internal' on staff tasks and 'Reply to Device | Internal' on jobs (composer.tsx:253-262). But the switch is not a no-op on staff tasks. Shared comments become visible to any contractor assigned later (the finding's own 'Zack can now see 3 comments' admits this), so Internal is the only way to keep a note private before an assignment. Hiding the switch would take that choice away.
- **Why:** A control whose two settings look identical is noise. The visibility switch should state who sees the message, which is the decision D15 asks for.
- **Change:** Show the switch only when a contractor is assigned, with the options 'Zack sees this' and 'Internal' (Lock icon). On staff-only tasks, hide it and post as Shared. If a contractor is later assigned, show a one-line note in the assign toast: 'Zack can now see 3 comments'.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the switch sits in the composer's tool row beside Send. Phone 375: the tool row appears only while writing, as today, and the switch stays one line at 320 ('Zack sees this' fits).
- **Reuse:** SegmentedControl; the composer's existing `contractorFirstName` prop.
- **Challenges:** D15 makes comments Shared by default. Question for Connor: may the switch hide on tasks with no contractor?
- **References:** 
  - [Basecamp](https://mobbin.com/screens/4304ed03-6265-4fac-94c8-9d2a8eba1b70): 'Who should see this?' names the audience: 'Our team only' or 'Allow the client to see this too'.
- **Code:** `branch: src/app/(app)/tasks/[id]/composer.tsx:157-161 and 253-262`
- **Verification:** partly. Keep the switch on every task and only rename the shared option to name the audience ('Zack sees this').

### BTASKS-036

**On Mondays, the 'Monday' and 'Next week' picks land on the same date**

Low · Fix · effort S · `Date quick picks (every date chip)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** mondayPick returns today plus 7 on a Monday (quick-dates.ts:52-56), and 'Next week' is always today plus 7 (quick-dates.ts:64). Every Monday the popover offers two rows that both resolve to the following Monday. On Fridays 'Tomorrow' is Saturday.
- **Why:** Two picks for one date waste a slot in a 5-row menu, and a weekend date is rarely what a property company means by tomorrow.
- **Change:** Define 'Next week' as the Monday after this week's Monday pick, or hide 'Monday' on Mondays. Consider 'Monday' instead of 'Tomorrow' on Fridays (Todoist shows 'This weekend' and 'Next week' separately).
- **Desktop, tablet, phone:** Same on every size.
- **Reuse:** quickPicks in src/lib/quick-dates.ts and its test file.
- **References:** 
  - [Todoist](https://mobbin.com/screens/11b9d667-53e6-4af4-abd8-d8c726a6b29a): Today, Tomorrow, This Weekend and Next Week always resolve to distinct days.
- **Code:** `branch: src/lib/quick-dates.ts:52-72`
- **Verification:** confirmed. mondayPick returns +7 on a Monday and Next week is always +7 (quick-dates.ts:52-64). The module note handles the Sunday clash but misses Monday. The Friday 'Tomorrow is Saturday' suggestion is optional; Todoist's sheet (11b9d667) offers Saturday as Tomorrow too.

### BTASKS-038

**Late dates switch between 'Yesterday', '2d late' and a bare date in the same column**

Low · Fix · effort S · `Date labels on every row` · Money, numbers and dates read one way

- **Migration branch:** Found on the migration branch's new screens
- **Today:** dueLabel returns 'yesterday' at 1 day, 'Nd late' from 2 to 6 days, then a plain date from 7 days (dates.ts:161-177). Jacob's column reads Oct 16, Yesterday, Yesterday, Yesterday, Yesterday, and José's reads Oct 16, Oct 16, 2d late, all in the same red.
- **Why:** Three formats for one state make the reader decode each row. A 7-day-late job looks less urgent than a 2-day-late one because it lost its 'late'.
- **Change:** For late dates use one relative form up to 4 weeks ('1d late', '7d late', '23d late'), then the date ('Aug 28'). Keep 'Today', weekday names for the coming week, and dates beyond that. Put the full date in the accessible name, as today.
- **Desktop, tablet, phone:** Same on every size; short forms fit at 320.
- **Reuse:** dueLabel in src/lib/dates.ts.
- **References:** 
  - [Things 3](https://mobbin.com/screens/4b34a598-3d5f-4fba-91b1-d1fa51e61acc): One relative form for deadlines ('14 days left').
- **Code:** `branch: src/lib/dates.ts:161-177`
- **Verification:** confirmed. This is a deliberate choice; the comment at dates.ts:155-160 explains it. Even so, one column mixes Oct 16, Yesterday and 2d late in the same red.

### BTASKS-039

**The status filter reads 'All | Open | Done' under an 'All' tab, with the default in the middle**

Low · Design change · effort S · `/tasks/all filters` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The All route's status switch lists All, Open, Done (filters.tsx:8-12), with Open selected by default in the middle, and the tab above it is also labeled 'All'. At 320 the title search shrinks to 'Filter by t'.
- **Why:** Two 'All' labels on one screen mean different things, and putting the default in the middle makes the scope harder to read at a glance.
- **Change:** Order the switch 'Open | Done | Everything', with Open first and default. Shorten the search placeholder to 'Search' so it reads at 320.
- **Desktop, tablet, phone:** Desktop 1280: one row. Tablet 768: one row. Phone 375 and 320: search and switch on row 1, pickers on row 2, no wrapping.
- **Reuse:** SegmentedControl; TaskFilters.
- **References:** 
  - [Linear](https://mobbin.com/screens/b230cf2f-37bf-4621-8aab-e50003d63813): Views use distinct names, so the tab and the filter never share a label.
- **Code:** `branch: src/app/(app)/tasks/filters.tsx:8-12 and 62-77`
- **Verification:** confirmed. At 320 the search box reads 'Filter by ti' (all--narrow-light.png).

### BTASKS-040

**A contractor job has a Done checkbox on All but not on Today**

Low · Design change · effort S · `All tab versus Today Contractors column` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Today renders contractor rows with checkbox={false} (today-view.tsx:109 and 121). AllList renders every row with the default checkbox (all-list.tsx:11), so the same job can be ticked Done from All, skipping Review, but not from Today.
- **Why:** The same row should behave the same on both lists. D6b routes contractor completions through Review, so a quiet checkbox that skips it is surprising.
- **Change:** Treat contractor jobs the same in both lists: no checkbox, with Done available from the status menu or the row menu (BTASKS-025). Or show the checkbox in both and toast 'Marked done without review' with Undo.
- **Desktop, tablet, phone:** Same on every size.
- **Reuse:** TaskRow `checkbox` prop driven by isContractorJob.
- **References:** 
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Every list renders an issue row identically.
- **Code:** `branch: src/app/(app)/tasks/all/all-list.tsx:11`, `branch: src/app/(app)/tasks/today-view.tsx:109 and 121`
- **Verification:** confirmed. Under D6c staff may move a job straight to Done, so this is an inconsistency, not a rule break.

### BTASKS-041

**The status menu offers Review on tasks no contractor will ever mark done**

Low · Design change · effort S · `/tasks/[id] status menu on staff-only tasks` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The menu always lists all seven statuses. But undated Review tasks don't disappear: groupMine puts them in No date (list.ts:189), and Today leaves out future-dated tasks of every status by design. The cost is only a meaningless menu option on staff tasks.
- **Why:** D6b gives Review a meaning only for contractor jobs. Offering it elsewhere creates tasks that fall out of every Today section.
- **Change:** Show Review in the menu only when a contractor is assigned, or when the task is already in Review.
- **Desktop, tablet, phone:** Same on every size.
- **Reuse:** StatusControl; STATUS_ORDER filtered by assignee kind.
- **Challenges:** D6c says staff can set any state. Question for Connor: hide Review on tasks with no contractor?
- **References:** 
  - [Linear](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1): The status menu lists only the workflow states valid for that team.
- **Code:** `branch: src/app/(app)/tasks/[id]/status-control.tsx:63-72`, `branch: src/lib/tasks/list.ts:186-191`
- **Verification:** partly. conflicts_with names D6c correctly.

### BTASKS-042

**Contractor group headers don't show how many jobs are late or link to the contractor**

Low · New capability · effort S · `Today Contractors column group headers` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Each group header is an avatar, a name and a count ('Jacob (Jake) hoak 6'), rendered as plain text (task-section.tsx:29-35). Five of Jacob's six jobs are late, which shows only as red row dates. The name doesn't link to /contractors/[id], where the phone and the portal access card live.
- **Why:** Following up with a contractor is the next step after spotting late jobs. The header is where that should start.
- **Change:** Header: 'Jacob Hoak  6 · 5 late', with the late count in red. Make the name a link to the contractor page. On touch, add a 44px phone icon that calls or texts.
- **Desktop, tablet, phone:** Desktop 1280: the late count is inline and the name is a link. Tablet 768: the same, plus a phone icon. Phone 375: the count shortens to '5 late' and the phone icon stays.
- **Reuse:** TaskSection title as a ReactNode; Link to /contractors/[id].
- **References:** 
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Group headers carry counts that summarize the group.
- **Code:** `branch: src/app/(app)/tasks/today-view.tsx:113-124`
- **Verification:** confirmed. The heading is plain text (task-section.tsx:54). The late count and the link are the useful parts; the phone icon is optional.

### BTASKS-044

**The phone date sheet runs past the screen, cutting off the last calendar week**

Low · Design change · effort S · `Date sheet on phone 375` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Found on the migration branch's new screens
- **Today:** On a 375x667 phone the sheet stacks five 44px quick picks and a six-row calendar with 44px cells. The last week (30, 31) falls below the fold, so picking a late-month date needs a scroll inside the sheet.
- **Why:** The quick picks cover most moves, but a reschedule to the end of the month shouldn't need scrolling in a modal.
- **Change:** On phone, show the quick picks as 44px rows with the hint on the right, then a compact calendar with 40px cells and 2px row gaps, so both fit within about 600pt. Add a 'Repeat' row at the bottom (BTASKS-022).
- **Desktop, tablet, phone:** Phone 375 and 320: compact calendar. Tablet 768: the centered dialog is unchanged. Desktop 1280: the popover is unchanged.
- **Reuse:** DuePanel and MonthCalendar in src/components/due-date-picker.tsx.
- **References:** 
  - [Todoist](https://mobbin.com/screens/11b9d667-53e6-4af4-abd8-d8c726a6b29a): Quick picks, a compact calendar and Time and Repeat rows fit in one sheet.
- **Code:** `branch: src/components/due-date-picker.tsx:147-171 and 218`
- **Verification:** confirmed. The week of the 30th and 31st is cut off at the bottom of the phone sheet (date--pop--mobile-light.png).
