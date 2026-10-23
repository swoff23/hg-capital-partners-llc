# Branch: playbooks, templates and repeats

Part of the [UI/UX review](README.md). 31 findings: 0 critical, 4 high, 18 medium, 9 low.

## How it should work

Playbooks and repeats should feel like Things 3 and Todoist dates: one calm sentence that says what will happen, not a form to fill. Starting a move-in is three answers, where (property and unit), who (tenant) and when (the move-in date), and everything else is a preview you can trust.

Entry points sit where the work starts. The property's Tasks card gets an "Apply playbook" menu listing Move-in, Move-out, Refi and New property; each unit header in Units and access gets "Start move-in" and "Start move-out"; New task becomes a split button, like Asana's Add task (https://mobbin.com/screens/dc76c110-4b6c-47d5-985e-42c705be272d). Under D10 the same menu moves into the property hub's Tasks tab.

The apply page follows Otter's picker (https://mobbin.com/screens/90a6525b-4ef0-4906-815d-7a87d24a86e8): setup on the left, a live preview on the right and the primary action pinned; on a phone it stacks with a sticky bar, "Create 10 tasks · first due Mon, Nov 2", reusing the job page's bottom bar. Preview rows are read-only lines grouped under headings like a Things 3 project (https://mobbin.com/screens/ff5ef47a-ab1f-4138-812c-f0169388180c). Each shows the title with filled values as quiet chips, an avatar, and a date relative to the anchor ("Move-in day", "2 days before", as in Asana's builder https://mobbin.com/flows/6258849f-2a5f-448d-ae65-a3f97b6bdf52); tap a title to edit it. Unfilled values are amber chips, never red borders. Asana's Use template flow (https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833) ends on the thing it made, so ours ends on a payoff: "Move-in for Dana is set up at 118 Congress St., Rear", the first three due dates, and Open checklist. The run then lives on the property as a group with "3 of 10 done".

Repeats become a preset menu built from the due date, as in Todoist (https://mobbin.com/screens/80ba3eca-3103-46ee-b086-4d133ee83282): Every week on Friday, Every month on the 23rd, Every quarter on the 23rd, Every year on Oct 23, Custom. Below it goes Things 3's sentence and next-date preview (https://mobbin.com/screens/02300565-277c-46b2-8c25-3f32f25aece9). Rows show a small repeat glyph beside the date (Basecamp https://mobbin.com/screens/1dad63f6-c7c3-4c09-9eaf-9602ad61ec38). Finishing one toasts "Done. Next one due Mon, Nov 23" with Undo. A Recurring view, like Xero's Repeating tab (https://mobbin.com/screens/a0e1dbdc-815a-4108-8050-1af8e5df25ec), lists every series so nothing recurring is forgotten.

<details><summary>What the reviewer covered</summary>

Branch build at http://localhost:3300 (commit 4652abb), staff session (Connor). Routes: /templates (desktop 1280, tablet 768, mobile 375, narrow 320, light; desktop and mobile dark; ?property= variant), /templates/[id] (404: no page exists), /templates/[id]/apply for all four playbooks (NEW TENANT at desktop, tablet, mobile, narrow, dark desktop and mobile, WebKit mobile and narrow; NEW PROPERTY desktop and mobile full page; NEW MOVE OUT and NEW REFI desktop), with ?property= preselect, token filling, a hand-edited title, the Due date sheet and Assignee picker on WebKit phone, and Create pressed (POST blocked, which surfaced the error boundary). Template item JSON (titles, notes, assignees, anchor labels, offsets) read from the apply page payload. /tasks/new Repeats: every mode (Never, days, weeks, monthly, quarterly, yearly), empty and over-max numbers, Save, hidden field value; Chromium desktop plus WebKit narrow and tablet (sheet and centered dialog geometry measured). /tasks/[id] Repeats chip and editor at desktop, tablet, mobile; Save pressed (blocked). Apply playbook entry on /properties/[id] (desktop, mobile) and the post-apply landing /tasks/all?property= (desktop, mobile). Code read: templates page, apply page and flow, templates actions and service, template-items, repeat, repeat-choice, repeat-picker, core.ts status and repeat logic, task-list-context, list-actions, review-banner, fields.tsx, new task page and fields, activity.ts, asana map/import for template creation, nav.tsx, components.md. Repeat date math checked with a copy of nextOccurrence (scratchpad/review/bplay-tools/drift.mjs). Portal session not opened: code search shows no repeat or playbook surface in the portal. Could not reach (writes blocked, and no repeating task exists in the branch DB): a live repeating task in lists, completing one and the next copy appearing, repeat activity lines, the real post-create redirect, and the empty playbook state; those are judged from code.

</details>

## Findings

### BPLAY-002

**Every playbook creates undated tasks because the anchor date never shows**

High · Fix · effort M · `/templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens. Still open at 9f74ea1: the importer still writes no dueOffsetDays, the anchor picker still shows only when an item has an offset, and it still defaults to today, so every imported playbook creates undated tasks. The offsets are content for Connor, and the always-visible empty anchor, anchor quick picks and dated-count button are design calls for him too.
- **Today:** Each imported playbook has an anchor label ("Move-in date", "Closing date", "Move-out date") but no item has dueOffsetDays (the importer never sets it, map.ts:1550-1561). The flow only renders the anchor picker when some item has an offset (apply-flow.tsx:58, 107-114), so it never appears. Every row reads "Due date" (empty), and all 10 to 39 tasks are created with no date. When the anchor does show, it defaults to today. On 118 Congress St. the earlier refi tasks (Update SREO, Set up new loan autopayment, Create property management agreement) already sit undated. The Due date quick picks are relative to today, not the move-in.
- **Why:** Today puts undated work in a collapsed "No date" section (today-view.tsx:96), so a move-in applied today disappears from the daily view. That defeats "start a move-in in one step and never forget" for the Nov 1 to 15 move-in, refi or closing the plan was built for.
- **Change:** Always show the playbook's anchor as the second field ("Move-in date"), required, empty by default. Until the template editor ships, give every item without an offset the anchor date, and let each row show its date relative to the anchor ("Move-in day", "2 days before"). Add anchor quick picks to the row's date sheet: Move-in day, Day before, Week before, Week after. Count dated tasks in the button: "Create 10 tasks · first due Mon, Nov 2".
- **Desktop, tablet, phone:** 1280: property, unit and anchor in one row above the preview. 768: two columns. 375: stacked, anchor right under property; row dates show as relative chips ("Day before").
- **Reuse:** DueDatePicker (components/due-date-picker.tsx) with an extra quick-picks prop; quick-dates.ts addDaysYmd; template-items.ts dueFromOffset.
- **References:** 
  - [Asana](https://mobbin.com/flows/6258849f-2a5f-448d-ae65-a3f97b6bdf52): Template builder stores due dates relative to the project start ("8 days before").
  - [Asana](https://mobbin.com/screens/f486a09c-4506-4720-8124-a052e5109115): Template content with default tasks, assignees and due dates.
  - [Things 3](https://mobbin.com/screens/ff5ef47a-ab1f-4138-812c-f0169388180c): A project carries one date and a deadline that its to-dos hang off.
  - [Gusto](https://mobbin.com/screens/ce2bd511-d228-4ff7-b917-b368de982d97): Template rows carry their offset as plain text ('Virtual office tour · Due day 1 · Manager'), so a relative date reads without a control.
  - [Basecamp](https://mobbin.com/screens/7dff0143-4d11-4c0f-bc61-506ea1af5a7c): One note on the template form says due dates become relative to the project's start date: the anchor model in one line.
  - [ClickUp](https://mobbin.com/screens/d5de7e6e-e347-4bb9-81ee-78a073db68c1): 'Remap dates' when applying a template
- **Code:** `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:46,58,107-114`, `branch: src/lib/asana/map.ts:139-145,1550-1563`, `branch: src/app/(app)/tasks/today-view.tsx:96`, `branch: src/lib/asana/map.ts:940-948`, `branch: src/lib/asana/map.ts:1553-1561`, `branch: src/lib/asana/map.ts:140`, `DB (read-only): 0 of 68 template rows have a due date`, `task-management-migration-4c9ddf: src/app/(app)/templates/[id]/apply/apply-flow.tsx:58`, `task-management-migration-4c9ddf: src/app/(app)/templates/[id]/apply/apply-flow.tsx:107`, `task-management-migration-4c9ddf: src/lib/tasks/list.ts:181-189`, `hg_capital_asana DB: TaskTemplate NEW TENANT and NEW MOVE OUT have anchorLabel set and no item dueOffsetDays`, `branch-src/src/app/(app)/templates/[id]/apply/apply-flow.tsx:58,107`, `hg_capital_review DB: TaskTemplate NEW TENANT and NEW MOVE OUT items have no dueOffsetDays`
- **Also found as:** G1C-005 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), JOURNEYS-IV01 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Reproduced on NEW TENANT with 118 Congress St.: no Move-in date field renders, and every row shows an empty Due date chip (shots/verify-BPLAY/apply-tenant--desktop-light.png). The importer never writes dueOffsetDays (map.ts:1550-1561), so usesAnchor is always false (apply-flow.tsx:58). The anchor defaults to today (line 46). Playbook rows default to Connor or Pieter, so on Today they land in No date, which starts closed (task-section.tsx:28). Small correction: the playbooks hold 5 to 39 tasks, not 10 to 39 (NEW MOVE OUT has 5). The earlier task-templates-plan.md had the anchor field always shown; the branch hides it. Citations check out: Asana flow 6258849f shows "8 days before" relative dates.

### BPLAY-007

**The review step is a wall of 10 to 39 bordered text inputs**

High · Design change · effort M · `/templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Every task row is a checkbox plus a full-width text input for the title, with assignee and date chips below (apply-flow.tsx:142-187). NEW PROPERTY renders 39 inputs on a 4,175px page. On a phone the single-line inputs cut titles off ("Give [Tenant] keys (only after they confi"). Notes and checklists aren't shown at all, only a "N checklist items" count, so the filled group-text message can't be checked before creating.
- **Why:** It reads as a data-entry form, not a preview. The calm, scannable list the rest of the task area has is lost, and on a phone you can't read the very titles you're approving.
- **Change:** Show read-only rows: checkbox, then the title as text (wrapping to two lines) with filled values as quiet chips, then a sublabel with avatar, relative date and "Notes · 3 checklist items". Tap or click a title to edit it in place. A row disclosure previews notes with values filled.
- **Desktop, tablet, phone:** 1280: one-line rows with assignee and date in fixed right columns, like TaskRow. 768: two-line rows. 375: two-line rows; title wraps to two lines; chips on the second line; notes preview in a sheet.
- **Reuse:** TaskRow layout and the @container two-line rule; the generalized inline title edit from the spec's reuse table (InlineAddressField); AssigneePicker and DueDatePicker as chips.
- **Challenges:** Section 6 item 5 approved the Apply playbook flow as described (review: untick, rename, reassign, redate). This keeps those abilities but swaps always-on inputs for read-only rows with tap-to-edit. Approve?
- **References:** 
  - [Things 3](https://mobbin.com/screens/ff5ef47a-ab1f-4138-812c-f0169388180c): Project to-dos are plain rows under headings, edited by tapping.
  - [Asana](https://mobbin.com/screens/f486a09c-4506-4720-8124-a052e5109115): Template content as a calm list with assignee and due date columns.
  - [Otter AI](https://mobbin.com/screens/90a6525b-4ef0-4906-815d-7a87d24a86e8): Template preview rendered as content, not inputs, beside the picker.
  - [Gusto](https://mobbin.com/screens/ce2bd511-d228-4ff7-b917-b368de982d97): Checklist template steps are read-only rows (title, 'Due day 1', role) with a ⋮ menu, not a stack of inputs.
  - [Asana](https://mobbin.com/flows/6258849f-2a5f-448d-ae65-a3f97b6bdf52): Template steps listed with assignee and relative due date as plain text cells
  - [WRITER](https://mobbin.com/screens/90363e8d-d9ab-466d-8953-abd6a2c11920): Filled variables highlighted inside the text
- **Code:** `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:142-187`, `docs/task-templates-plan.md:270-279`
- **Also found as:** G1C-024 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Seen: NEW PROPERTY is 4,175px with 39 title inputs. At 320 in WebKit, titles are cut inside single-line inputs ("Upload signed [Tenant] leas", "[tenant] confirm national fu") and the Due chip is clipped at the card edge (shots/verify-BPLAY/apply-tenant-touch--bottom--narrow-light-webkit.png). Notes are never previewed. conflicts_with correctly raises section 6 item 5.

### BPLAY-010

**Fill-in fields are raw Asana placeholders: duplicate, lowercase, and hidden**

High · Fix · effort S · `/templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: Tenant and tenant name are now one field, labels are sentence case, email and number fields get type=email and type=tel, and the hint uses the field label. Still open: "Property address" is still an editable input repeating the property, notes-only values (Tenant email, Tenant number) still block Create and their notes still aren't shown, and the hint copy and "Tenant name" / "Tenant phone" labels aren't the recommended wording. These are design and copy calls for Connor.
- **Today:** NEW TENANT asks for five values labeled "Tenant", "tenant name", "tenant email", "tenant number" and "property address". [Tenant] and [tenant name] are the same person typed twice. Three of the five appear only in the notes of "Get [Tenant] on Baselane", which the review never shows, yet each blocks Create (hint "Fill in [tenant name] first"). "property address" is an editable input that repeats the property. Fields are plain text, with no email or phone type.
- **Why:** Five fields where two would do, labels in Asana's casing, and blocking rules tied to text you can't see make a one-step start feel like paperwork.
- **Change:** Treat tenant and tenant name as one value. Use sentence-case labels "Tenant name", "Tenant email" and "Tenant phone", with type=email and type=tel. Show the address as read-only text filled from the property. Require only values used in titles; values used only in notes are optional, with a one-line sublabel "Used in 1 task". Hint copy in plain words: "Add the tenant's name to create these".
- **Desktop, tablet, phone:** 1280 and 768: two columns. 375: one column, email and phone keyboards on touch.
- **Reuse:** template-items.ts extractTokens and isAddressToken (add an alias map); Input from ui.tsx.
- **References:** 
  - [User Interviews](https://mobbin.com/screens/b48be8c0-1405-42a5-96a7-d0f6c632a3da): Template variables split into required and optional, each with an example.
  - [Attio](https://mobbin.com/screens/0e692f45-c4c5-4833-8ac0-c7edba65a1ff): Template variables come from the record (name, email, phone) rather than retyped.
  - [WRITER](https://mobbin.com/screens/90363e8d-d9ab-466d-8953-abd6a2c11920): Variables appear as named chips in the text and are filled from one form beside it
- **Code:** `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:55-57,67-68,116-129`, `branch: src/lib/tasks/template-items.ts:56-81`, `shoot.mjs eval after each fill: 'Fill in [tenant name] first | invalid=0', then '[tenant email]', then '[tenant number]'`, `task-management-migration-4c9ddf/src/lib/tasks/template-items.ts:51-71`, `task-management-migration-4c9ddf/src/app/(app)/templates/[id]/apply/apply-flow.tsx:55-68,116-128`, `shoot.mjs eval after fill: 'hint=Fill in [tenant name] first | invalid=0 | disabled=true'`, `4652abb:src/lib/tasks/template-items.ts:51-71`, `4652abb:src/app/(app)/templates/[id]/apply/apply-flow.tsx:55-57,116-128`, `task-management-migration-4c9ddf: src/app/(app)/templates/[id]/apply/apply-flow.tsx:123`, `branch-src/src/app/(app)/templates/[id]/apply/apply-flow.tsx:115-129`, `docs/task-templates-plan.md:263`, `DB (read-only): 13 template rows have notes; tokens found: [tenant], [property address], [tenant name], [tenant email], [tenant number]`
- **Also found as:** G1C-IV02 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), JOURNEYS-IV06 (Lens: the core jobs, end to end), G1C-003 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Seen: labels read Tenant, tenant name, tenant email, tenant number and property address (eval of label spans). No title uses the last four, yet the open-token check scans notes and checklists (apply-flow.tsx:67), so the tenant name, email and number block Create. property address is an editable input prefilled from the property. NEW MOVE OUT's lone field is labeled lowercase "tenant" too. One caution for the recommendation: if a notes-only value is left optional and blank, the created task keeps the literal [tenant email] text in its notes.

### BPLAY-016

**From a property, applying a playbook takes two page loads and skips the unit**

High · Design change · effort S · `/properties/[id] Tasks card and Units and access` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** "Apply playbook" (properties/[id]/page.tsx:183-185) opens /templates?property=, then a row opens the apply page. The Units and access section lists each unit with its lockbox code, but offers no way to start a move-in or move-out for that unit.
- **Why:** The property and often the unit are already known, so the list page is a wasted step and the unit has to be found again.
- **Change:** Make "Apply playbook" a menu listing Move-in, Move-out, Refi and New property that goes straight to apply with the property set. Add "Start move-in" and "Start move-out" to each unit header's ⋯ menu with property and unit set.
- **Desktop, tablet, phone:** 1280 and 768: menu under the button. 375: the same Menu as a sheet with 44px rows; unit actions in each unit header's ⋯.
- **Reuse:** components/menu.tsx; LinkButton.
- **Challenges:** D10 moves the property page into a hub with tabs after cutover; these actions should then live in the hub's Tasks tab. Build them on today's card now?
- **References:** 
  - [Things 3](https://mobbin.com/screens/30ef7449-b9a5-4533-a265-3bf753c9a231): Record-level ⋯ menu holds the start actions (When, Repeat, Duplicate).
  - [Asana](https://mobbin.com/screens/dc76c110-4b6c-47d5-985e-42c705be272d): Create menu on the list you're already in.
  - [Linear](https://mobbin.com/screens/65487ca3-9cf4-4287-b0cc-2c3e8c6f7f35): The template is picked inside the normal new-issue composer and named in its breadcrumb, so applying a template is not a separate page.
  - [Basecamp](https://mobbin.com/screens/4304ed03-6265-4fac-94c8-9d2a8eba1b70): 'Use a to-do list template…' sits inside the New list form where the work starts.
  - [Bonsai](https://mobbin.com/screens/7c03e48c-6b29-41fe-96ba-02cd91b51357): Template plus target and one create button in a small dialog
  - [ClickUp](https://mobbin.com/screens/d5de7e6e-e347-4bb9-81ee-78a073db68c1): Apply-template dialog with location, import options and date remapping
  - [Jira Cloud](https://mobbin.com/flows/bdb96790-4f6d-4138-8c8e-e2fd09cd0e55): Phone: select template sheet, then a short create sheet
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Use template, fill roles, land in the project
- **Code:** `branch: src/app/(app)/properties/[id]/page.tsx:179-188`, `docs/task-templates-plan.md:255-296`
- **Also found as:** G1C-006 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Verified: Apply playbook links to /templates?property= and needs a second page to pick a playbook. Units and access lists Rear, 2nd Floor and Front with no actions. One nuance for the recommendation: unit headers have no menu today, so the per-unit actions mean adding a new menu, not extending one. conflicts_with correctly raises D10.

### BPLAY-003

**Finishing an overdue repeat creates a copy that is already overdue**

Medium · Fix · effort S · `Repeat engine (all repeating tasks)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens. Still open at 9f74ea1: the next copy is still nextOccurrence(rule, previous due) with no catch-up past today, and there are no On schedule or After done modes. This waits on Connor's call to change spec 5.2.
- **Today:** Only a copy finished more than one full interval after its due date (for example a monthly task due Jul 5 finished Oct 23) produces a next copy that is already overdue. This is the behavior spec 5.2 prescribes, so the fix changes an approved rule.
- **Why:** The new copy lands straight in Overdue. "Move all to today" then resets it to today, which also shifts the series' day. The list fills with stale red rows, the opposite of a calm Today.
- **Change:** Advance the next date until it is after today (Eastern), keeping the pinned day. Later, offer Things 3's two modes in the editor: "On schedule" (default, catch up to the next future date) and "After done" (interval counted from completion).
- **Desktop, tablet, phone:** Logic only. The editor's mode switch is a SegmentedControl at every width.
- **Reuse:** repeat.ts nextOccurrence, dates.ts todayYmdEastern; SegmentedControl for the mode.
- **References:** 
  - [Things 3](https://mobbin.com/screens/29d00270-766c-4d94-b0ad-239d8e40e89d): After Completion mode: the next copy comes a set time after you finish.
  - [Things 3](https://mobbin.com/screens/02300565-277c-46b2-8c25-3f32f25aece9): Regularly mode with the next date shown.
  - [Charma](https://mobbin.com/screens/103461c7-6232-45b7-b2f1-f5bef1186e6b): States 'This item will next recur on Fri, October 27' so the next date is always explicit
  - [Mercury](https://mobbin.com/screens/af150af2-c997-47f6-9d44-aa1069872d4f): Upcoming dates listed under the rule
  - [Todoist](https://mobbin.com/screens/52758ad6-7145-46d7-826b-2469b17f2ee0): 'Complete recurring task' is its own action, and the next date is computed for the user.
- **Code:** `branch: src/lib/tasks/core.ts:374`, `branch: src/lib/tasks/repeat.ts:38-55`, `bplay-tools/drift.mjs`, `branch: src/lib/tasks/core.ts:371`, `DB (read-only): 'Check if any taxes are due' open copies due 2026-10-10 and 2027-01-27`, `branch: src/lib/tasks/core.ts:372-378`, `branch: docs/asana-migration-plan.md:251-254`, `branch: src/lib/tasks/core.ts:372-401`
- **Also found as:** G1C-008 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), BTASKS-002 (Branch: Today, All tasks, new task and the task page)
- **Verification:** partly. The math is right: from = the finished copy's dueDate (core.ts:375), stepped once (repeat.ts:38-55). But this only bites when a copy is finished more than one interval late. A monthly task finished five days late still gets a future date. It is also what the spec prescribes: section 5.2 says "the next due date computed from the previous due date". So conflicts_with should name spec 5.2 rather than be empty. The Things 3 citations (29d00270, 02300565) came back from my own Mobbin search and match.

### BPLAY-004

**No unit picker when applying a move-in or move-out**

Medium · New capability · effort M · `/templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Playbook rows default to staff (all five NEW MOVE OUT rows are Pieter or Connor), so a unit-less contractor job only happens if someone reassigns a row in review. The unit can be set afterward on each task's Unit chip, one task at a time.
- **Why:** A move-in or move-out is about one unit. Under D21 a contractor job with no unit on a multi-unit property shows no lockbox code, so the cleaning or turnover job arrives unusable. Rows also can't say which unit, so two move-ins at one property read the same.
- **Change:** Add a Unit field after Property: required when the property has more than one unit, hidden when it has none. Apply it to every created task. Fill [Unit] tokens from it, and name the run with it ("Move-in · Rear").
- **Desktop, tablet, phone:** 1280: Property, Unit and anchor date in one row. 768: two columns. 375: stacked; the unit is a chip that opens a sheet.
- **Reuse:** SelectChip with property.units, as on the task page (tasks/[id]/fields.tsx:132-145).
- **References:** 
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Using a template asks for the few values that set every task (roles) before creating.
  - [Jobber](https://mobbin.com/screens/ccc080fe-4001-497f-bdc3-53185ca9f85f): A job is tied to one service address before scheduling.
  - [ClickUp](https://mobbin.com/screens/d5de7e6e-e347-4bb9-81ee-78a073db68c1): Asks where the template should be created before applying
  - [Bonsai](https://mobbin.com/screens/7c03e48c-6b29-41fe-96ba-02cd91b51357): Target record picked inside the apply dialog
- **Code:** `branch: src/app/(app)/templates/actions.ts:11-23`, `branch: src/lib/tasks/templates.ts:57-67`, `DB (read-only): 428 Normal Avenue units: Floor 1 / Lower, Floor 2 / Upper, each with lockboxCode and utility accounts`
- **Also found as:** G1C-021 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. Confirmed: the flow and schema carry no unit (apply-flow.tsx:95-106, templates/actions.ts:11-22). 118 Congress St. has Rear, 2nd Floor and Front with lockbox codes. The lockbox consequence is overstated, though. Every NEW MOVE OUT row defaults to Pieter or Connor (verified: 3 Pieter, 2 Connor), so no contractor job, and no missing lockbox, arises unless a row is reassigned in review. The unit can also be set afterward per task through the task page's Unit chip (fields.tsx:132-145). Still a real gap for move-ins and move-outs at multi-unit buildings.

### BPLAY-005

**A repeating task looks like any other task everywhere**

Medium · Design change · effort S · `Today, All, property Tasks card, task page (phone), portal job page` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** TaskRow shows no repeat mark (task-row.tsx:28-161), and the list data has no repeatRule. The portal shows nothing about repeats (no match in src/lib/portal or the portal routes). On the task page at 375 the Repeat chip is the fourth chip in a sideways row, off screen until you scroll it (fields.tsx:146-158).
- **Why:** You can't tell from a list which work recurs, so you can't trust that ticking it schedules the next one. A contractor can't tell their monthly lawn visit from a one-off. Recurring work stays invisible, the exact Asana pain the migration was meant to fix.
- **Change:** Add a 12px Repeat glyph right after the date chip in TaskRow, with an aria-label and desktop title ("Repeats every month on the 5th"); on touch the task page names it. On the task header at phone width, put a short "Monthly" sublabel beside the due chip. On the portal job page, add one line under Target: "Every month".
- **Desktop, tablet, phone:** 1280: glyph inside the fixed date column so rows still line up. 768 and 375: glyph after the date on the second line. Nothing drops; the glyph is 12px.
- **Reuse:** TaskRow date slot; lucide Repeat icon already used by RepeatPicker; describeRepeat for the label.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/1dad63f6-c7c3-4c09-9eaf-9602ad61ec38): To-do rows show a small repeat icon right beside the date.
  - [Grok](https://mobbin.com/screens/db52035c-10a7-4fc7-b055-1473b2e175aa): Rows carry the cadence ("28th of the month") with a repeat glyph.
  - [Emergent](https://mobbin.com/screens/8ff17900-8340-41a4-a90d-3510fe14bc94): A quiet "Recurring · Weekly on Monday" chip on the row.
  - [Todoist](https://mobbin.com/screens/52758ad6-7145-46d7-826b-2469b17f2ee0): The task row shows the time with a small repeat glyph right after it in the same meta line.
  - [Mercury](https://mobbin.com/screens/74fb1222-9a02-416c-b7fd-bb736482ac39): Scheduled list puts 'Recurring' as a muted sublabel under the date; the drawer adds a small 'Monthly' pill by the name.
  - [Insight Timer](https://mobbin.com/screens/71782ac6-9f21-4620-8cc7-e1d53c6f57c0): Phone row subline 'Every week on Thu' with a repeat glyph
  - [Reminders](https://mobbin.com/screens/e767ee02-c8a7-4502-868a-809f0235e28b): Row meta reads 'Yesterday, 10:00 PM ⟲ Weekdays': repeat glyph and rule beside the date, overdue date in red.
  - [Insight Timer](https://mobbin.com/screens/b77b3351-19ba-441e-9e3e-01ef10cda678): Each item carries '⟲ Every month on the 16th' as one muted line.
- **Code:** `branch: src/app/(app)/tasks/task-row.tsx:146-155`, `branch: src/app/(app)/tasks/[id]/fields.tsx:146-158`, `branch: src/components/repeat-picker.tsx:48-55`, `grep: Repeat appears only in tasks/actions.ts, tasks/new/new-task-fields.tsx, tasks/[id]/fields.tsx, tasks/[id]/page.tsx and components/repeat-picker.tsx`, `task-management-migration-4c9ddf/src/app/(app)/tasks/task-row.tsx:1-12`, `task-management-migration-4c9ddf/src/app/(app)/properties/[id]/page.tsx:192-219`, `grep 4652abb:src for 'Repeat\b|repeatRule': only the six files listed`, `4652abb:src/app/(app)/tasks/task-row.tsx`, `4652abb:src/app/(app)/properties/[id]/page.tsx:192-219`
- **Also found as:** G1C-017 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), G1C-V05 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. Accurate: TaskRow and ListTask carry no repeat data, the portal has no repeat code, and at 375 the Repeats chip starts at x=387, off screen (measured on the sample task, shots/verify-BPLAY/task--mobile-light.png). High is overstated: no task repeats yet, and the two partners who set repeats are the ones reading the lists. A row glyph is still standard (Things, Todoist), so it's worth doing at medium.

### BPLAY-006

**Applying a playbook ends on a filtered list with no confirmation**

Medium · Design change · effort M · `/templates/[id]/apply (after Create)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** After Create, the redirect to /tasks/all?property=<id> shows the new undated tasks right after the property's dated tasks and above older undated ones, in reverse playbook order (createdAt desc), with no toast or highlight. On 118 Congress St. they would sit next to seven open look-alike refi tasks.
- **Why:** House rule: payoff moments show what happened and what's next, and close the loop. After creating ten tasks you can't see which ten, who has them, or when the first is due, and on 118 Congress St. they mix with older undated refi tasks.
- **Change:** End on a payoff state. Use line spot art and the heading "Move-in for Dana is set up", then one line "10 tasks at 118 Congress St., Rear. First due Mon, Nov 2.", then the created tasks grouped by assignee. Offer two buttons: "Open the checklist" (the run group, see BPLAY-017) and "Back to 118 Congress St.". Until the group exists, a toast "Created 10 tasks for 118 Congress St." plus highlighted new rows will do.
- **Desktop, tablet, phone:** 1280: centered card, max 32rem. 768: same. 375: full width, buttons stacked; the per-assignee list collapses to counts ("Connor 8, Pieter 2").
- **Reuse:** Sent screen pattern (move-in-form thank-you, portal Mark done payoff, docs/components.md:74), promoted to components/ on this third use; toast.tsx.
- **References:** 
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Using a template lands on the created project with a "Created Project Kickoff" toast.
  - [Plane](https://mobbin.com/flows/0b62c3be-7465-4466-b8f5-e89f0abab599): Creating from a template shows progress, then opens the result.
  - [Superhuman Mail](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5): 'Marked as Done · Undo' toast; the list stays put.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Phone toast with Undo above the tab bar after an action, no navigation.
  - [Todoist](https://mobbin.com/screens/ee247a6f-a32b-4138-9bb7-be687ea9a1e2): Toast names the exact change ('Date updated to 20 Feb') with Undo; HG's version: '10 tasks added to 58 Mariner · View · Undo'.
  - [Insight Timer](https://mobbin.com/screens/71782ac6-9f21-4620-8cc7-e1d53c6f57c0): 'Activity added · View' toast after creating
  - [Todoist](https://mobbin.com/screens/09f39b7b-c17a-4f87-97e5-4a1af75c3938): Undo toast placed above the bottom bar on phone
  - [Linear](https://mobbin.com/screens/1a4540b2-6c15-49ff-a07f-4fddb7490e38): 'Issue created' toast naming the new issue with a 'View issue' link, over the page you were on.
  - [Gusto](https://mobbin.com/flows/9af21f74-3a74-4d67-b032-a9016f36cf81): A setup timeline: completed steps carry their date, the current one shows Pending action, later ones show By [date], and Continue is on the active step.
  - [Wise](https://mobbin.com/flows/b51c3670-4335-4d6e-9d06-0576684d443d): The Updates timeline checks past steps with timestamps and bolds the current one.
  - [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): The submitted screen restates exactly what was created, with a summary and the next action.
- **Code:** `branch: src/app/(app)/templates/actions.ts:31`, `branch: src/lib/tasks/queries.ts:89`, `docs/task-templates-plan.md:183`, `docs/task-templates-plan.md:424`, `branch: src/app/(app)/templates/actions.ts:26-32`, `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:86`, `branch: src/lib/tasks/templates.ts:33-68`, `branch: src/app/(app)/properties/[id]/page.tsx:183-185`, `task-management-migration-4c9ddf/src/app/(app)/templates/actions.ts:25-31`, `4652abb:src/app/(app)/templates/actions.ts:25-32`, `task-management-migration-4c9ddf: src/app/(app)/templates/actions.ts:31`, `task-management-migration-4c9ddf: src/app/(app)/templates/[id]/apply/apply-flow.tsx:86`, `task-management-migration-4c9ddf: src/app/(app)/templates/[id]/apply/apply-flow.tsx:194-196`, `branch-src/src/app/(app)/templates/actions.ts:31`, `branch-src/src/app/(app)/templates/[id]/apply/apply-flow.tsx:86`
- **Also found as:** G1C-007 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), G1C-IV03 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), JOURNEYS-I09 (Lens: the core jobs, end to end)
- **Verification:** partly. No toast or payoff is confirmed (templates/actions.ts:31). The sort claim is wrong: allTasks orders by dueDate asc with nulls last, then createdAt desc (queries.ts:89). Brand-new undated tasks therefore sit directly under the dated ones and above every older undated task, but in reverse playbook order. Also, task-templates-plan.md lists a decision confirmed with Connor: "No new grouped task-list UI. Apply redirects to /tasks?property=<id>". The full payoff screen that replaces the redirect should name that in conflicts_with. The fallback (toast plus highlighted rows) doesn't conflict.

### BPLAY-011

**Unfilled values show as red errors before anything was tried**

Medium · Design change · effort S · `/templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** With a property preselected, every title holding a token gets aria-invalid and a red border on first paint (apply-flow.tsx:160-162). At 320 the whole list is red-outlined, and a red hint sits beside a disabled button though nothing was submitted.
- **Why:** House rule: every color has a job, and red here means error. An untouched form shouldn't look broken, and the eye can't find the one real problem among ten red rows.
- **Change:** Render unfilled values as amber token chips inside read-only titles (BPLAY-007). Show red only after Create is pressed with a gap, and scroll to the first one.
- **Desktop, tablet, phone:** Same at all widths. At 375 the amber chips still fit inside the two-line titles.
- **Reuse:** Badge tone amber is taken by Waiting, so use a neutral dashed chip; keep amber for status per the Badge rule.
- **References:** 
  - [Pipedrive](https://mobbin.com/screens/0085fc85-ccd5-434d-85db-b7c0f4163649): Fields inserted into a template show as neutral placeholders, not errors.
  - [Todoist](https://mobbin.com/screens/a21695ab-7ffc-4c8f-a9d8-f58a2f3b82d8): Recognized words ('14 Feb') are tinted inside the title as you type.
  - [Todoist](https://mobbin.com/screens/49e0c5ec-e1fe-4dd0-97b1-57c969da5122): Several tokens tinted in place and mirrored as removable chips below.
- **Code:** `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:160-162,193`, `task-management-migration-4c9ddf/src/app/(app)/templates/[id]/apply/apply-flow.tsx:74,156-163,193-197`, `shoot.mjs eval: 'hint=Fill in [Tenant] first | invalid=10 | disabled=true'`, `4652abb:src/app/(app)/templates/[id]/apply/apply-flow.tsx:68,156-163,192-197`
- **Also found as:** G1C-I07 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Seen on first paint with a property preselected: 10 of 10 title inputs have aria-invalid=true and red borders, and a red hint sits beside the disabled button before any attempt (shots/verify-BPLAY/apply-tenant--desktop-light.png). The recommendation contradicts itself: it says amber chips, then its reuse line says amber belongs to Waiting and to use a neutral dashed chip. Build the neutral chip. The earlier plan's amber "unfilled" Badge would collide with the Waiting tone.

### BPLAY-012

**Create sits 4,000px down and is disabled with no reason**

Medium · Design change · effort S · `/templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The only primary action is at the end of the list (apply-flow.tsx:192-197): 1,600px down for NEW TENANT and 4,175px for NEW PROPERTY. Before a property is picked the button is disabled and the hint is suppressed (hint requires propertyId, line 68), so nothing says why.
- **Why:** You fill the top of the page, then scroll the whole list to find out whether you can create. A disabled button with no reason is a dead end.
- **Change:** Pin a bottom bar with the count and the action ("Create 10 tasks"). When it's disabled, show one line beside it: "Pick a property" or "Add the tenant's name". On desktop the bar sits at the bottom of the preview column.
- **Desktop, tablet, phone:** 1280: sticky footer inside the content column. 768 and 375: full-width bottom bar with safe-area padding; the toast is lifted above it.
- **Reuse:** The portal job page bottom bar (app/(portal)/p/jobs/[id]/_components/job-actions.tsx) and useToastInset.
- **References:** 
  - [Otter AI](https://mobbin.com/screens/90a6525b-4ef0-4906-815d-7a87d24a86e8): Use Template stays pinned while the preview scrolls.
  - [Jobber](https://mobbin.com/screens/ccc080fe-4001-497f-bdc3-53185ca9f85f): Save pinned at the bottom of a long mobile form.
  - [MyFitnessPal](https://mobbin.com/screens/49d7ede0-87e3-4cff-8ab3-77bb56f014a5): 'ADD (2)' pinned under a long checklist of exercises.
  - [Beli](https://mobbin.com/screens/356d749e-c4fe-44d2-bab1-0bbb7fe4c2a6): 'Share 1 restaurant' pinned at the bottom, with the count in the label.
- **Code:** `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:68,192-197`, `shoot.mjs eval on /templates/cmvkij6qh0002jp3a1ckan2cm/apply at mobile: '4487px; dated=0; anchor=false'`, `task-management-migration-4c9ddf/src/app/(app)/templates/[id]/apply/apply-flow.tsx:192-197`, `shoot.mjs eval: mobile 'height=4487 btnTop=4427'; tablet 'height=1722 btnTop=1654 parentPos=static'`, `4652abb:src/app/(app)/templates/[id]/apply/apply-flow.tsx:192-197`
- **Also found as:** G1C-V07 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Verified: NEW PROPERTY is 4,175px at 1280 and 4,487px at 375. With no property, the button reads "Create 39 tasks", is disabled, and no hint renders (eval: hint []), because the hint needs propertyId (apply-flow.tsx:68). Reaching /templates directly (not from a property) is exactly that state.

### BPLAY-013

**Playbooks are named in Asana caps: NEW TENANT, NEW MOVE OUT**

Medium · Fix · effort S · `/templates and /templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The names are the Asana section names Connor and Pieter already use, uppercased on purpose by the earlier templates plan's seed step, so renaming them is Connor's call rather than a bug fix.
- **Why:** All caps shouts in a calm UI, "NEW TENANT" doesn't match the word people use (move-in), and the page title is the playbook's name.
- **Change:** Rename at import and in the data: "Move-in", "Move-out", "Refi", "New property". Use verbs where it starts something: the menu item "Start move-in", the page title "Start a move-in".
- **Desktop, tablet, phone:** Same everywhere; shorter names also fit menu rows at 320.
- **Reuse:** map.ts template naming; one data fix on TaskTemplate.name.
- **References:** 
  - [Linear](https://mobbin.com/screens/07f217af-0d64-4456-a622-44e6f7e741ab): Templates listed in plain title case with who made them.
  - [Linear](https://mobbin.com/screens/5aba4717-0d9b-4960-b021-1cc7a26dd570): Team settings rows 'Templates' and 'Recurring issues' in sentence case, each with one sublabel and a count.
  - [7shifts](https://mobbin.com/screens/eb10fd24-b9f3-4d93-b3bf-025f7a996ff9): A task list template titled 'Soft Opening' in normal case, with 'One-time · Due Apr 6' under it.
- **Code:** `branch: src/lib/asana/map.ts:1541-1542`, `task-management-migration-4c9ddf/src/lib/asana/map.ts:112`, `task-management-migration-4c9ddf/src/lib/asana/import.ts:281-283`, `4652abb:src/lib/asana/map.ts:112`, `4652abb:src/lib/asana/import.ts:278-290`, `branch: src/lib/asana/map.ts:112`, `docs/task-templates-plan.md:302-310`
- **Also found as:** G1C-IV01 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), G1C-041 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. The caps names are real (shots/verify-BPLAY/templates--desktop-light.png). But they are Connor's own Asana section names, and the earlier task-templates-plan.md deliberately uppercased them in its seed step. Renaming changes what the partners call their playbooks, so this is a copy or design decision for Connor, not a wrong-copy fix. Medium overstates a stylistic issue with four rows.

### BPLAY-015

**Playbooks have one way in and no home in the nav**

Medium · Design change · effort S · `Navigation, /tasks header, /tasks/new` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The only link to /templates is the property page's Tasks card (properties/[id]/page.tsx:183). Nothing in nav.tsx matches /templates, so no item is lit on the playbook pages. The Tasks header offers only "+ New task" (tasks-header.tsx:11-13), and New task has no playbook option.
- **Why:** When a move-in comes up, the natural start is Tasks or New task. People lose their place when no nav item is lit.
- **Change:** Treat playbooks as part of Tasks: light the Tasks item on /templates (or move the route to /tasks/playbooks). Turn "+ New task" into a split button whose menu has "Start a playbook…" listing the four. Keep the Today | All TopTabs as they are.
- **Desktop, tablet, phone:** 1280 and 768: split button in the page header. 375: the same menu from the create button in the header; rows are 44px.
- **Reuse:** components/menu.tsx Menu and MenuTrigger; Button; nav.tsx active-match.
- **References:** 
  - [Asana](https://mobbin.com/screens/dc76c110-4b6c-47d5-985e-42c705be272d): "Add task" with a caret for other ways to add.
  - [Linear](https://mobbin.com/screens/6bd32918-97a5-45ec-bd95-efe367207a22): Templates are picked from inside the create flow.
  - [Basecamp](https://mobbin.com/screens/79e251fd-549c-4144-94a2-8be364f91ac1): "Use a to-do list template..." sits right in the new-list form.
  - [Linear](https://mobbin.com/screens/4eb70285-08a0-4648-94fe-7cc07f602a7f): Templates and Recurring issues are rows in settings, each with a one-line sublabel and a count, not sidebar items.
  - [Jobber](https://mobbin.com/screens/eab818f1-9ca2-4823-bdda-e5ad3f7ad451): Job Forms live under Settings > Team organization and get attached to jobs where the work happens.
  - [Basecamp](https://mobbin.com/screens/4304ed03-6265-4fac-94c8-9d2a8eba1b70): Templates are reached from the New list form, not from navigation.
  - [Linear](https://mobbin.com/screens/1ebdc50b-e8e5-4b80-8857-4814c7e2b95f): Templates live under workspace settings, not in the main nav
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Template gallery opened on demand, separate from daily navigation
- **Code:** `branch: src/components/nav.tsx:7-80`, `branch: src/app/(app)/tasks/tasks-header.tsx:8-15`, `docs/task-templates-plan.md:302-310`, `branch: src/components/nav.tsx:7-70`, `branch: src/app/(app)/properties/[id]/page.tsx:183-185`
- **Also found as:** G1C-027 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Seen: no sidebar item is lit on /templates or the apply page. The only link to /templates is the property card (grep finds one hit, properties/[id]/page.tsx:183). The Tasks header has only + New task. Notably, task-templates-plan.md specified both a nav item and an "Apply template" button in the Tasks header, and the branch dropped them.

### BPLAY-017

**An applied playbook has no home: no group, no progress, no source**

Medium · New capability · effort L · `Property Tasks card, task rows, task page rail` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Tasks remember only taskTemplateId (schema Task.taskTemplateId); there's no record of one application (property, unit, tenant, anchor). The task page never mentions which playbook a task came from. The property card and lists show the ten tasks loose among everything else.
- **Why:** "Where are we on Dana's move-in?" can't be answered without opening ten tasks. Two move-ins at one property intermix, and the loop never closes because there's nothing that finishes.
- **Change:** Store a light run (template, property, unit, anchor date, label such as "Move-in · Dana · Rear"). Show it as a group on the property's Tasks card with "3 of 10 done" and the next due task. Give rows a sublabel "Move-in · Rear" and the rail a line "From Move-in, Nov 2". When all are done, the group collapses with a done date.
- **Desktop, tablet, phone:** 1280: group header with progress and next due on the card. 768: same. 375: header with progress count only; rows below.
- **Reuse:** Card and CardHeader; TaskRow's place sublabel; Badge for the count.
- **Challenges:** D10's property hub with tabs is where the group would live long term; this proposes a stored run, which the spec doesn't have.
- **References:** 
  - [Things 3](https://mobbin.com/screens/ff5ef47a-ab1f-4138-812c-f0169388180c): A project groups its to-dos under headings with a date and deadline.
  - [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58): Today rows carry their project's name as a gray sublabel.
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Applying a template creates a container you can return to.
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): Project name as a gray sublabel under each to-do in Today.
  - [Linear Mobile](https://mobbin.com/screens/a96b8326-76e3-4c24-822c-9617062a24fc): 'Sub-issue of HBT-1' link under the title.
  - [Linear](https://mobbin.com/screens/344cad59-d4a8-421a-9c2f-14b3c977e82d): Milestones in the side rail: name, '70% of 5', target date, one line each. A run on the property can read 'New tenant · Lillian · 3 of 10 · Nov 5'.
  - [Gusto](https://mobbin.com/screens/afd1032f-ef50-460f-88fb-c1e6970ab079): Setup timeline: done steps 'Completed on Nov 10', the current step with one button, later steps 'By Nov 20'.
  - [Vanta](https://mobbin.com/screens/d6c8a960-3253-4ca4-b4aa-06e902fa0e4e): Collapsible groups with '4 of 4 complete'
  - [Aboard](https://mobbin.com/screens/4f90f332-e4d8-4201-b341-da664b1fdfe8): Onboarding record with 'Tasks 0 of 3 done'
  - [Todoist](https://mobbin.com/screens/af8c6a67-d043-4b1a-87a9-4be810698244): Sections with counts inside one project list
- **Code:** `branch: prisma/schema.prisma:278-279`, `branch: src/lib/tasks/templates.ts:54-73`, `docs/task-templates-plan.md:30`, `docs/task-templates-plan.md:92`, `branch-src/src/lib/tasks/templates.ts:33-82`, `branch-src/src/app/(app)/templates/actions.ts:25-33`, `branch-src/src/app/(app)/properties/[id]/page.tsx:183-185`, `docs/task-templates-plan.md:28-30`, `branch: src/lib/tasks/templates.ts:54-76`, `branch: src/app/(app)/properties/[id]/page.tsx:180-200`
- **Also found as:** TASKS-I16 (Tasks list, new task and task detail), G1C-023 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. Accurate: only taskTemplateId is stored, and no app UI reads it (grep finds taskTemplate only in the two templates pages). But task-templates-plan.md records a decision confirmed with Connor: "No new grouped task-list UI". A stored run shown as a group directly reverses that. conflicts_with should cite that decision, not only D10.

### BPLAY-019

**Repeats never says when the next one will appear**

Medium · Design change · effort S · `Repeats editor and rail chip` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The panel shows only the mode and a number. "Quarterly" and "Yearly" show nothing at all (new-task--repeat-quarterly). Nothing says the next copy appears when this one is done, or on what date.
- **Why:** "Quarterly" from what? Without the next date you can't check the rule is right, which matters most for quarterly and yearly work like filters, inspections and insurance.
- **Change:** Under the choice, one line: "Next: Mon, Jan 23. A new copy appears when this one is done." In the rail at 1280, the Repeats row reads "Every quarter on the 23rd" with "Next Jan 23" muted beneath.
- **Desktop, tablet, phone:** 1280: sublabel under the rail chip. 768 and 375: the sentence shows in the sheet only; the chip keeps the short rule.
- **Reuse:** repeat.ts nextOccurrence and describeRepeat; fmtShortDay.
- **References:** 
  - [Things 3](https://mobbin.com/screens/02300565-277c-46b2-8c25-3f32f25aece9): "You'll get a new copy regularly..." with Next: Thu, Mar 16.
  - [Linear](https://mobbin.com/screens/1d72292a-e877-4055-88d7-5c6a977466f0): Saved schedule read back as one sentence with Edit.
- **Code:** `branch: src/components/repeat-picker.tsx:116-118`
- **Verification:** confirmed. Verified in repeat-picker.tsx:116-118: only days, weeks and monthly render a number field, so Quarterly and Yearly show only the select and buttons. No next date or explanation appears anywhere. describeRepeat gives "Quarterly" and "Yearly" with no anchor (repeat.ts:73-76).

### BPLAY-020

**Quarterly and yearly repeats slide to the 28th and stay there**

Medium · Fix · effort S · `Repeat engine (quarterly and yearly)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: quarterly now saves dayOfMonth from the due date's day, so Aug 31 goes Nov 30, Feb 28, May 31, Aug 31, and the chip reads "Quarterly on the 31st". Still open: yearly is deliberately left unpinned, so Feb 29 still slides to Feb 28 for good (Connor's call), and quarterly rules saved before this commit only get the pin when re-saved.
- **Today:** ruleFromChoice saves quarterly and yearly without dayOfMonth (repeat-choice.ts:49-51), so each copy steps from the previous copy's clamped day (repeat.ts:51). Quarterly from Aug 31 goes Nov 30, Feb 28, May 28, Aug 28. Yearly from Feb 29 stays on Feb 28 for good.
- **Why:** End-of-month work (quarterly reconciliations, insurance renewals) drifts earlier every cycle with no visible change to the rule.
- **Change:** When saving quarterly, pin dayOfMonth from the due date; for yearly, pin month and day. Describe it as "Every quarter on the 31st" so the pin is visible.
- **Desktop, tablet, phone:** Logic only.
- **Reuse:** repeat-choice.ts ruleFromChoice; repeatRuleSchema already allows dayOfMonth for quarterly.
- **References:** 
  - [Jobber](https://mobbin.com/screens/e43cb3b3-a612-4f96-a283-d1139b7e6c5f): Day-of-month grid ends in a 'Last Day' cell, the honest answer for 29th to 31st.
  - [Mercury](https://mobbin.com/screens/10c550ab-f499-4dbf-8bc2-d007a42c9e00): 'Pay monthly on the 28th.' with the next dates listed shows the pinned day holding month to month.
  - [Copilot Money](https://mobbin.com/screens/2d1548a9-50b4-4491-9464-bc0f52e9ad92): Recurrence rule options include 'End of the month'
  - [Posh](https://mobbin.com/screens/1f1ae6d5-c6a6-4df1-88b1-dfecb66fcfb6): Monthly rule pinned to 'the 28th day' with a summary sentence
- **Code:** `branch: src/lib/tasks/repeat-choice.ts:49-51`, `branch: src/lib/tasks/repeat.ts:46-53`, `bplay-tools/drift.mjs`, `branch: src/lib/tasks/repeat.test.ts:22`, `branch: src/lib/tasks/repeat.test.ts:30`
- **Also found as:** G1C-015 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Verified: ruleFromChoice drops dayOfMonth for quarterly and yearly (repeat-choice.ts:49-51), even though the schema allows it and choiceFromRule reads it back. nextOccurrence then clamps from the last copy's day (repeat.ts:51). Aug 31 goes to Nov 30, Feb 28, May 28. Monthly already pins its day, so this is an inconsistency, not a design choice.

### BPLAY-021

**Rescheduling one weekly copy moves the whole series' weekday**

Medium · Fix · effort S · `Repeat engine (weekly)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens. Still open at 9f74ea1: weekly rules still store no weekday and step 7 days from the last copy's (possibly moved) due date, so moving one copy still moves the whole series. Pinning a weekday changes approved spec 5.2, so it is Connor's decision.
- **Today:** Weekly series follow the last copy's due date by design (spec 5.2, and Asana parity), so moving one copy moves the cadence. Pinning a weekday would change an approved rule.
- **Why:** Rescheduling is most of HG's task activity (419 of 762 recent Asana events). Every reschedule silently rewrites a weekly cadence.
- **Change:** Store the weekday for weekly rules (and set it from the due date when saving). Compute the next copy from the pinned weekday, not the moved date. Show it in the chip: "Every week on Monday".
- **Desktop, tablet, phone:** Logic only; the chip text is short enough for 320.
- **Reuse:** repeat.ts repeatRuleSchema (add byWeekday), describeRepeat.
- **References:** 
  - [Things 3](https://mobbin.com/screens/383f064f-0aa6-4062-91b8-95d000458810): Weekly repeats are pinned to a weekday (On Thursday).
  - [Linear](https://mobbin.com/screens/ef9e1029-1437-4774-a7cf-ca3d2a657f83): "Every 2 weeks on Friday" pins the day.
  - [Things 3](https://mobbin.com/screens/02300565-277c-46b2-8c25-3f32f25aece9): In Regularly mode the rule (Every week On Thursday) and the Next date are separate rows, so moving one copy doesn't rewrite the rule.
  - [Amie](https://mobbin.com/screens/1c7e609d-71a1-4cb9-b179-043d6b2f4d55): Repeat rule stores weekdays, not just an interval
  - [Skiff](https://mobbin.com/screens/57b4fabe-1140-4dca-bdd3-eac72c999761): 'Repeats on' weekday chips in a custom rule
  - [Todoist](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c): Preset 'Every week on Friday' anchors to a weekday
- **Code:** `branch: src/lib/tasks/repeat.ts:42-45`, `branch: src/lib/tasks/core.ts:374`, `bplay-tools/drift.mjs`, `branch: src/lib/tasks/repeat.ts:10-15`, `branch: src/lib/tasks/repeat.ts:41-45`, `branch: docs/asana-migration-plan.md:31`
- **Also found as:** G1C-009 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. The mechanics are right: weekly rules store only an interval and step from the moved due date (repeat.ts:44-45, core.ts:375), and Move all to today sets overdue dates to today. But stepping from the previous due date is what spec 5.2 prescribes, and Asana's plain weekly repeat behaves the same way. This is a design change that needs a conflicts_with naming spec 5.2, not a bug fix. I couldn't verify the "419 of 762" Asana event figure. Things 3 383f064f checks out on Mobbin.

### BPLAY-024

**Finishing or approving a repeat says nothing about the next one**

Medium · Design change · effort S · `Today, All, task page status control, Review banner` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The list's Done toast duplicates BPLAY-001's recommendation. What's unique here is the Review banner line saying Approve sets up the next visit.
- **Why:** House rule: close the loop. Ticking recurring work should confirm it's handled and when it comes back. If Approve isn't pressed, the next visit silently never appears.
- **Change:** After Done on a repeating task: toast "Done. Next one due Mon, Nov 23" with Open and Undo. On a repeating job in Review, the banner adds one line: "Approving sets up the next visit for Nov 23".
- **Desktop, tablet, phone:** Toast bottom-left at 1280, full width on 768 and 375; the banner line drops on 320 if it would wrap, leaving the toast.
- **Reuse:** toast.tsx, review-banner.tsx, describeRepeat.
- **References:** 
  - [Todoist](https://mobbin.com/screens/5da9fa23-d62c-41ed-ba7c-64c51ae03eb1): Toast names the new date with Undo.
  - [Todoist](https://mobbin.com/screens/09f39b7b-c17a-4f87-97e5-4a1af75c3938): Completion toast with Undo above the phone tab bar
  - [Todoist](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c): Toast names the new date: 'Rescheduled to 20 Feb · Undo'
  - [Insight Timer](https://mobbin.com/screens/71782ac6-9f21-4620-8cc7-e1d53c6f57c0): Toast with a View action
  - [Todoist](https://mobbin.com/screens/6f00ee53-76bf-447a-bdb2-7b4161d42d94): 'Task completed · Next occurrence: 20 Feb 17:00' with Undo.
- **Code:** `branch: src/app/(app)/tasks/task-list-context.tsx:94-96`, `branch: src/app/(app)/tasks/[id]/review-banner.tsx:42`, `branch: src/lib/tasks/core.ts:296-297,354-355`, `branch: src/lib/tasks/core.ts:290-294`, `DB (read-only): 'Rental registration' appears 8 times, 'Store insurance from Jessica' 5 times`, `branch: src/lib/tasks/service.ts:63-68`, `branch: src/app/(app)/tasks/[id]/actions.ts:54-63`, `branch: src/lib/tasks/activity.ts:166-172`, `task-management-migration-4c9ddf/src/app/(app)/tasks/list-actions.ts:63-73`, `task-management-migration-4c9ddf/src/app/(app)/tasks/task-list-context.tsx:94-100`, `task-management-migration-4c9ddf/src/lib/tasks/core.ts:390,403-436`, `4652abb:src/lib/tasks/service.ts:62-68`, `4652abb:src/app/(app)/tasks/list-actions.ts:68-85`, `4652abb:src/app/(app)/tasks/task-list-context.tsx:94-96`, `4652abb:src/lib/tasks/core.ts:354-355`, `git log 4652abb..HEAD: 4cf099d 'Reopening a finished task takes back its copy when nobody has touched it'`
- **Also found as:** G1C-018 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), G1C-V04 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. Facts verified (no toast on setDone, task-list-context.tsx:94-96; the banner says "Approved", review-banner.tsx:42). But the Done toast with the next date and Undo is already part of BPLAY-001's recommendation. The only new piece is the Review banner line about the next visit, which is low.

### BPLAY-025

**No place to see or audit all recurring work**

Medium · New capability · effort M · `/tasks/all (filters) or a Recurring view` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** No list, filter or count shows which tasks repeat (filters.tsx has none). D27 has Connor hand over his list of recurring tasks on Monday, but each must be created or opened one at a time to set Repeats, with nowhere to check the set afterward.
- **Why:** "Never forget recurring work" needs a place where the whole set is visible: what repeats, how often, when next, who. Today a series that was stopped or never set up is invisible.
- **Change:** Add a Repeats filter on All, or a Recurring view, listing one row per series: title, property, cadence, next due, assignee. Put "+ Add recurring task" at the top so the Monday list goes in quickly.
- **Desktop, tablet, phone:** 1280: table-like rows with cadence and next-due columns. 768: two-line rows. 375: title over "Monthly · next Nov 23 · 118 Congress"; assignee avatar only.
- **Reuse:** TaskRow and the All filters (SegmentedControl or a filter select).
- **Challenges:** Week-2 adds Upcoming, By property and Waiting tabs on Tasks. A Recurring view would be another tab, or a filter on All. Which?
- **References:** 
  - [Xero](https://mobbin.com/screens/a0e1dbdc-815a-4108-8050-1af8e5df25ec): A Repeating tab lists every series with cadence and next date.
  - [Copilot Money](https://mobbin.com/screens/2d1548a9-50b4-4491-9464-bc0f52e9ad92): Recurrings list with cadence and next date per row.
  - [Linear](https://mobbin.com/screens/4eb70285-08a0-4648-94fe-7cc07f602a7f): Recurring issues get their own place in team settings with a count.
  - [Wise](https://mobbin.com/screens/34ad8a8d-3ae6-40d9-be35-513da43400ca): Scheduled transfers list: two-line rows 'Weekly | Next: Sat, Mar 22', the shape for Connor's Monday list on a phone.
  - [Rocket Money](https://mobbin.com/screens/117a0083-80d1-40ea-96a2-6e4e451ee582): Upcoming recurring items with 'in 18 days'
- **Code:** `branch: src/app/(app)/tasks/filters.tsx`, `branch: src/app/(app)/tasks/all/page.tsx:21-42`, `DB (read-only): repeated titles query: Rental registration 8, Store insurance from Jessica 5, Check if any taxes are due 6, Connect property tax 4`, `branch: docs/asana-migration-plan.md:88`, `branch: src/lib/asana/report.ts`, `branch: scripts/asana/_import-lib.ts:282`
- **Also found as:** G1C-020 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Verified: filters.tsx and ListTask have no repeat field, and nothing lists repeating series. D27's Monday hand-off makes an audit view useful right away. conflicts_with correctly asks tab versus filter.

### BPLAY-026

**No "skip this one"; canceling a copy silently ends the series**

Medium · New capability · effort S · `Task page status control (repeating task)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Only Done creates the next copy (core.ts:354). Setting a repeating task to Canceled closes it with no next copy and no notice, so the series ends.
- **Why:** Skipping one gutter cleaning (it rained, the tenant is away) is normal. Today it ends the cadence without telling anyone, the quietest way to forget recurring work.
- **Change:** On repeating tasks, add "Skip this one" to the status menu: Canceled plus the next copy, with toast "Skipped. Next one due Dec 23". When Canceled is chosen, ask in the same menu step: "Stop repeating too?" (Keep repeating / Stop).
- **Desktop, tablet, phone:** Menu items on 1280; Sheet rows on 768 and 375.
- **Reuse:** status-control.tsx menu, components/menu.tsx, core.ts createNextRepeat.
- **References:** 
  - [Things 3](https://mobbin.com/screens/02300565-277c-46b2-8c25-3f32f25aece9): Repeat settings separate the schedule from when it ends.
  - [Todoist](https://mobbin.com/screens/52758ad6-7145-46d7-826b-2469b17f2ee0): Row menu has 'Complete recurring task ›' with its own submenu, so ending a series is a named choice, not a side effect.
  - [Mercury](https://mobbin.com/screens/93755406-78bf-406e-8228-9de56970dda9): Cancel recurring payment restates the rule ('Pay monthly on the 28th') and the next three dates before 'Cancel Payments'.
  - [Time2book](https://mobbin.com/screens/abe10842-59b3-4e58-a738-88c4e45f8283): 'Cancel only this class' vs 'Cancel all future classes' with the rule shown
  - [Discord](https://mobbin.com/screens/d48fbeb4-d86d-45bc-b11d-3104f25b7324): Cancel this event vs all events in this series
  - [Motion](https://mobbin.com/screens/1eb73c81-c835-4437-a444-d53e11c78a05): This event / All events radio choice
- **Code:** `branch: src/lib/tasks/core.ts:312-330,354`, `branch: src/lib/tasks/core.ts:350`, `branch: src/app/(app)/tasks/[id]/header.tsx:61-88`, `branch: src/lib/tasks/core.ts:354`, `branch: src/components/repeat-picker.tsx:104-127`
- **Also found as:** G1C-014 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Verified: only a move into DONE calls createNextRepeat (core.ts:354). CANCELED closes the copy with no next one and no notice, ending the series quietly.

### BPLAY-027

**A 39-task playbook has no sections and no untick-all**

Medium · Design change · effort S · `/templates/[id]/apply (NEW PROPERTY)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Headings would need a new grouping field that the imported data doesn't have. Untick all and flagging duplicate titles are the parts that can ship now.
- **Why:** Trimming a playbook to fit this property means 39 decisions with no structure; the renovation block alone is 10 rows to untick for a turnkey buy.
- **Change:** Group rows under headings (Utilities, Admin, Renovation) with a heading-level checkbox and count ("Renovation 0 of 10"), plus "Untick all" in the Tasks header. Flag exact duplicate titles for the template editor.
- **Desktop, tablet, phone:** 1280 and 768: headings with a toggle on the right. 375: headings collapse by default except the first; toggle stays visible.
- **Reuse:** TaskSection collapsible headings (tasks/task-section.tsx).
- **References:** 
  - [Things 3](https://mobbin.com/screens/ff5ef47a-ab1f-4138-812c-f0169388180c): Headings split a long project into scannable groups.
  - [Asana](https://mobbin.com/screens/f486a09c-4506-4720-8124-a052e5109115): Template content organized in sections.
  - [Gusto](https://mobbin.com/screens/030224c2-2326-4e00-938c-d6d90b7a087d): Sections named by timing ('Before Day 1', 'On Day 1', 'After Day 1') with 'Add a task' per section; for HG: Before move-in, Move-in day, After move-in.
  - [Things 3](https://mobbin.com/screens/e8da8594-ca98-443a-b6b4-6e3cd939c80c): Plain headings split one project's steps without nesting.
  - [Asana](https://mobbin.com/flows/6258849f-2a5f-448d-ae65-a3f97b6bdf52): Template builder with 'Add section'
  - [Vanta](https://mobbin.com/screens/d6c8a960-3253-4ca4-b4aa-06e902fa0e4e): Grouped steps with counts and collapse
- **Code:** `DB (read-only): NEW PROPERTY [Address] 40 rows listed with assignees`
- **Also found as:** G1C-025 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. Verified: 39 flat rows, "Upload photos of before" appears twice, and "Before purchasing, check https://property.spatialest.com/..." sits in a post-closing list (eval of titles). But TemplateItem has no section field, and the Asana section is the playbook itself, so headings like Utilities and Renovation need new template data or the week-2 editor. Effort S fits only Untick all and the duplicate flag. Ten taps to drop a renovation block is friction, but low.

### BPLAY-035

**Reassigning a playbook task to a contractor doesn't say they'll see its notes**

Medium · Design change · effort S · `/templates/[id]/apply (review rows)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Each row's AssigneePicker includes contractors. Playbook notes carry internal material (the lockbox spreadsheet link, deposit and Baselane steps, city contact details), and D16 makes notes always visible to the assigned contractor. Nothing in the row signals that.
- **Why:** The plan's own risk table names "contractors see something private". The review is the last moment to catch it.
- **Change:** When a row's assignee is a contractor, add a one-line sublabel: "Zack will see the notes", with a link to preview them.
- **Desktop, tablet, phone:** Sublabel under the row at every width; at 320 it shortens to "Zack sees notes".
- **Reuse:** AssigneePicker value; muted sublabel style from TaskRow.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/5b1faed8-9661-4bc6-9613-ca9e7ad67c1c): "The client can see this" label on anything shared outside the team.
  - [Basecamp](https://mobbin.com/screens/4304ed03-6265-4fac-94c8-9d2a8eba1b70): 'Who should see this?' with 'Our team only, private to us' or 'Allow the client to see this too' at creation.
  - [Basecamp](https://mobbin.com/screens/7dff0143-4d11-4c0f-bc61-506ea1af5a7c): 'Remember client visibility' is a decision made when a template is created.
- **Code:** `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:165-171`, `task-management-migration-4c9ddf/src/app/(app)/templates/[id]/apply/apply-flow.tsx:146-186`, `task-management-migration-4c9ddf/src/app/(app)/tasks/[id]/notes.tsx:36-40`, `task-management-migration-4c9ddf/src/lib/tasks/templates.ts:52-66`, `4652abb:src/app/(app)/templates/[id]/apply/apply-flow.tsx:142-186`, `4652abb:src/app/(app)/tasks/[id]/notes.tsx:36-40`, `psql: NEW TENANT item 'Get [Tenant] on Baselane' notes '[tenant name] [tenant email] [tenant number]'`
- **Also found as:** G1C-I13 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. D16 confirms notes are always visible to the assigned contractor. The row's AssigneePicker lists contractors, and nothing in the row warns that the notes travel with the job. All observed playbook defaults are staff, so this matters only on reassignment, hence low.

### BPLAY-V01

**Applying a playbook again silently duplicates tasks already open**

Medium · Design change · effort S · `/templates/[id]/apply` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The apply flow never checks the property's open tasks. On 118 Congress St., 7 of NEW REFI's 9 titles are already open (Update SREO, Set up new loan autopayment, Create property management agreement, Transfer rent collection account, Transfer LOFL national grid, Transfer LOFL national fuel, Transfer payment for national fuel). The review still shows all 9 ticked, and Create would add 7 duplicates. The service creates every kept row without comparison (templates.ts:54-76).
- **Why:** Move-ins and refis that were already in flight in Asana are imported as open tasks at cutover. The first time someone applies the same playbook in the app (the Nov 1 to 15 window D28 was built for), every overlapping task doubles, and Today fills with look-alike rows nobody trusts.
- **Change:** On the review step, compare each row's filled title with the property's open tasks (case-insensitive). Untick matches by default and give them a muted sublabel "Already open" that links to the existing task. Above the list, one line: "7 of these are already open on 118 Congress St." The count in the Create button reflects only the new rows.
- **Desktop, tablet, phone:** 1280 and 768: the notice sits in the Tasks card header, with the sublabel under each matched title. 375: the notice wraps under the card title, and the sublabel stays on one line as "Already open".
- **Reuse:** allTasks or a small query for open titles on the property, run on the apply page server side. The muted sublabel style from TaskRow's place line. The existing include checkbox state.
- **References:** 
  - [Calendly](https://mobbin.com/screens/13df76e6-5cfa-426a-bb79-c65a8117153e): Import step asks what to do with duplicates, with Skip duplicates as an option.
  - [QuickBooks](https://mobbin.com/screens/bf326062-a861-4e39-8a56-86f073649866): Warns before creating a record that matches an existing one.
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Template Usage tab shows prior uses with dates
- **Code:** `branch: src/lib/tasks/templates.ts:33-76`, `branch: src/app/(app)/templates/[id]/apply/apply-flow.tsx:64-68,142-189`
- **Also found as:** G1C-022 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** verifier-found

### BPLAY-014

**The playbook list shows a name and a count, nothing to choose by**

Low · Design change · effort S · `/templates` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The playbook rows show only name and count. /templates/<id> has no page, so a signed-in partner who trims the URL lands on the public site's 404. The Asana import description isn't rendered anywhere today.
- **Why:** With four playbooks it's guessable, but "NEW PROPERTY, 39 tasks" says nothing about when to use it, and there's no record of where each was last applied.
- **Change:** Give each row a one-line description ("Lease signed to keys handed over") and a quiet "Last used Oct 3 at 767 Prospect" from Task.taskTemplateId. Drop the import caveat from description (or leave it null). Make the row the preview: the apply page already lists the tasks, so no separate detail page is needed; redirect /templates/[id] to apply.
- **Desktop, tablet, phone:** 1280 and 768: name and description left, last-used and count right. 375: name over description; last-used drops.
- **Reuse:** Card row list as today; a muted sublabel like TaskRow's place line.
- **References:** 
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Template page with Description and a Usage tab listing projects made from it.
  - [Linear](https://mobbin.com/screens/5dc80e3d-4d52-4b74-8d53-e268cf33cdb8): Each template carries a one-line "use this when" description.
  - [Linear](https://mobbin.com/screens/4eb70285-08a0-4648-94fe-7cc07f602a7f): Templates and Recurring issues rows: name, one-line description, count on the right.
  - [Wise](https://mobbin.com/screens/3c28c813-cfc5-4fef-97bf-d65935f39bdd): Hub rows carry one line of state such as '1 unpaid' or what the row does.
- **Code:** `branch: src/app/(app)/templates/page.tsx:40-56`, `branch: src/lib/asana/import.ts:283`, `task-management-migration-4c9ddf/src/app/(app)/templates/page.tsx:21,47-51`, `4652abb:src/app/(app)/templates/page.tsx:48-51`, `psql: TaskTemplate.anchorLabel = Move-in date / Closing date / Move-out date`
- **Also found as:** G1C-I06 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. The list really is name, count and chevron (templates/page.tsx:40-56), and /templates/<id> returns 404. That 404 is the public marketing page ("PAGE NOT FOUND ... Back to the front page" with the Rentals nav), because no route exists there and only the root not-found catches it. The import description is never selected or shown today, so that part is preventive. With four playbooks, the "last used" line is the part that adds value. Medium is high for this.

### BPLAY-028

**Turning repeats on or off is silent: no toast, no activity line**

Low · Fix · effort S · `/tasks/[id] Repeats` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Due changes toast "Due date set to ..." with Undo (fields.tsx:94-99). Repeats saves with no message (fields.tsx:156), and updateTask records no event for repeatRule (core.ts:486), so Activity never shows who set or stopped a repeat.
- **Why:** Close the loop: two partners share these tasks, and a stopped series with no record is how recurring work gets lost.
- **Change:** Toast "Repeats every month on the 5th" or "Stopped repeating" with Undo. Add a REPEAT event: "Connor set this to repeat every month on the 5th" and "Pieter stopped this repeating".
- **Desktop, tablet, phone:** Same everywhere.
- **Reuse:** useRun done and undo options; activity.ts eventLine.
- **Code:** `branch: src/app/(app)/tasks/[id]/fields.tsx:94-99,146-158`, `branch: src/lib/tasks/core.ts:486`
- **Verification:** confirmed. Verified: the Due save passes done and undo (fields.tsx:94-99) while the Repeats save passes neither (fields.tsx:156). patchTask writes repeatRule with no event (core.ts:486).

### BPLAY-029

**Repeats panel doesn't fill or align with its sheet**

Low · Design change · effort S · `Repeats sheet (phone) and dialog (tablet)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The panel is fixed at md:w-64 with p-3 (repeat-picker.tsx:96). In the 318px tablet dialog the select spans 237 to 469px, leaving 74px empty on the right against 12px on the left, with Save short of the close button's edge. On a phone the content is inset 12px while the sheet title sits at 16px (sheet.tsx:94).
- **Why:** House rules: things that should line up, line up exactly, and popovers size to their content without dead space.
- **Change:** Inside Sheet, make the panel w-full with px-4 to match the header; keep md:w-64 only inside the Popover.
- **Desktop, tablet, phone:** 375 and 768: full-width content aligned to the title. 1280: unchanged popover.
- **Reuse:** Sheet and Popover as they are.
- **References:** 
  - [Todoist](https://mobbin.com/screens/80ba3eca-3103-46ee-b086-4d133ee83282): Repeat options in a sheet aligned to its title and edges.
- **Code:** `branch: src/components/repeat-picker.tsx:96`, `branch: src/components/sheet.tsx:94`
- **Verification:** confirmed. Verified: the tablet dialog spans 224-544 while the select ends at 469, leaving about 74px of dead space on the right against 13px on the left (shots/BPLAY/new-task-touch--sheet-monthly--tablet-light-webkit.png). On a phone the panel insets 12px while the sheet title sits at 16px (shots/verify-BPLAY/task--repeat-open--mobile-light.png; repeat-picker.tsx:96 p-3 versus sheet.tsx pl-4).

### BPLAY-030

**An empty number saves as "Every day" without a word**

Low · Fix · effort S · `Repeats editor (Custom numbers)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Clearing "Every [ ] days" and pressing Save stores interval 1 (repeat-choice.ts:28-29, 40); the chip reads "Every day". Over the max (400 weeks) only the browser's native bubble stops Save.
- **Why:** A silent change to a different cadence than the one being typed.
- **Change:** Disable Save while the number is empty or out of range and show one line under it: "Enter 1 to 52".
- **Desktop, tablet, phone:** Same everywhere; on touch the numeric keypad stays.
- **Reuse:** Input with aria-invalid, as elsewhere.
- **Code:** `branch: src/lib/tasks/repeat-choice.ts:28-40`
- **Verification:** confirmed. Verified: an empty input gives valueAsNumber NaN, and clamp falls back to 1 (repeat-choice.ts:28-29,40). An empty day field on Monthly likewise saves day 1. Typing over the max is stopped only by the native bubble (max=52 weeks, 365 days).

### BPLAY-031

**Next copy drops the deal link and can't point back to the last one**

Low · Fix · effort S · `Repeat engine and task Activity` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** createNextRepeat copies title, notes, property, unit, assignee and series but not dealId (core.ts:380-394). The new copy's first activity line reads "Created as the next repeat" with no link to the previous copy (activity.ts:130), while the old copy links forward.
- **Why:** A repeating deal task falls off the deal's log after one cycle, and you can't walk back through a series' history from the newest copy.
- **Change:** Carry dealId to the next copy. Link "Created as the next repeat" to the previous copy (data.repeatOf is already stored).
- **Desktop, tablet, phone:** Same everywhere.
- **Reuse:** activity.ts eventLine href, as REPEAT_CREATED does.
- **References:** 
  - [Copilot](https://mobbin.com/screens/b8ee0b14-088d-407e-88ee-627b31d1bd7e): A recurring item lists its past occurrences right under the rule.
- **Code:** `branch: src/lib/tasks/core.ts:380-401`, `branch: src/lib/tasks/activity.ts:128-131,166-172`, `branch: src/lib/tasks/core.ts:376-391`, `branch: src/lib/tasks/core.ts:250-262`, `DB (read-only): 0 tasks have a dealId today`, `branch: src/lib/tasks/core.ts:379-395`, `branch: src/lib/tasks/core.ts:257`, `branch: src/lib/tasks/core.ts:351-353`, `task-management-migration-4c9ddf/src/lib/tasks/activity.ts:129-130,177-183`, `task-management-migration-4c9ddf/src/lib/tasks/core.ts:403-430`, `4652abb:src/lib/tasks/activity.ts:129-130,166-173`, `4652abb:src/lib/tasks/core.ts:372-403`
- **Also found as:** G1C-V03 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24)), G1C-I11 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Verified: createNextRepeat omits dealId (core.ts:380-394), and the CREATED line with repeatOf has no href while REPEAT_CREATED links forward (activity.ts:130,166-172).

### BPLAY-032

**Setting Repeats on a finished task does nothing, silently**

Low · Design change · effort S · `/tasks/[id] (Done or Canceled task)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** On a Done task the Repeats chip is fully editable. Saving a rule stores it, but no next copy is made because the Done transition already happened.
- **Why:** The natural moment to say "this should recur" is right after finishing it. The rule saves, nothing happens, and the work isn't scheduled.
- **Change:** On a closed task, saving a repeat creates the next copy right away, with toast "Next one due Nov 23". Or show the chip disabled with "Reopen to repeat". Prefer the first.
- **Desktop, tablet, phone:** Same everywhere.
- **Reuse:** core.ts createNextRepeat; toast.
- **References:** 
  - [Things 3](https://mobbin.com/screens/29d00270-766c-4d94-b0ad-239d8e40e89d): After Completion mode creates the next copy from when the last one was done.
- **Code:** `branch: src/lib/tasks/core.ts:486`
- **Verification:** confirmed. Verified on the sample Done task: the Repeats chip is enabled and opens its sheet (shots/verify-BPLAY/task--repeat-open--mobile-light.png). patchTask only stores the rule, and no copy is made.

### BPLAY-034

**Playbook tasks can't carry a repeat, so a closing can't seed upkeep**

Low · New capability · effort M · `Playbook items (template data and apply flow)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** No current playbook item is recurring work. The NEW PROPERTY rows named are one-time setups, so this is a template-editor idea rather than an observed gap.
- **Why:** Closing on a property is when its recurring upkeep starts (filters quarterly, plowing contract yearly). Seeding it there is the most reliable way never to forget it.
- **Change:** Let an item hold a RepeatRule, shown in the review row as the repeat glyph and phrase; the created task keeps it. Edit it in the template editor (week 2).
- **Desktop, tablet, phone:** Glyph on the review row at all widths; the phrase drops at 375.
- **Reuse:** RepeatRule, RepeatPicker in the editor, BPLAY-005's row glyph.
- **References:** 
  - [Jobber](https://mobbin.com/screens/be53c898-e1ac-43fa-bcb5-2b257c70e901): A new job sets its repeating schedule when it's created.
- **Code:** `branch: src/lib/tasks/template-items.ts:12-23`
- **Verification:** partly. TemplateItem indeed has no repeat (template-items.ts:12-23). But the cited items are one-time setups ("Set up plowing service", "Set up landscaping service"), and none of the four playbooks contains recurring work today. This is a reasonable idea for the week-2 template editor, not a gap anyone hits now.

### BPLAY-036

**The closing playbook can't start from the deal that's closing**

Low · New capability · effort M · `Deal page (closing) to playbook` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** NEW PROPERTY anchors on "Closing date" but applies only to an existing Property (apply page property select). Deal pages have no task section and no playbook entry; /tasks/new accepts dealId but no link passes one.
- **Why:** Closing work (utilities, insurance, autopays) starts while the deal is under contract, before a Property record exists. Today it waits until conversion.
- **Change:** On a deal that reaches Under contract, offer "Start closing playbook" with the closing date prefilled, linking the tasks to the deal and carrying them to the property when it's created.
- **Desktop, tablet, phone:** 1280: action in the deal header. 768 and 375: in the deal's ⋯ menu.
- **Reuse:** Task.dealId, Menu, the apply flow with a deal target.
- **References:** 
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Templates start from wherever the work begins, then fill in roles.
  - [ClickUp](https://mobbin.com/screens/d5de7e6e-e347-4bb9-81ee-78a073db68c1): Template applied to a chosen location
  - [Bonsai](https://mobbin.com/screens/7c03e48c-6b29-41fe-96ba-02cd91b51357): Template applied to whichever record you pick
- **Code:** `branch: src/app/(app)/templates/[id]/apply/page.tsx:27-29`, `branch: src/app/(app)/tasks/new/page.tsx:12-16`, `docs/task-templates-plan.md:420`, `branch: docs/asana-migration-plan.md:89`
- **Also found as:** G1C-028 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Verified: apply needs an existing Property, and nothing links to /tasks/new with a dealId (grep finds only the header and property links). Carrying deal tasks over to the property at conversion is closer to L than M effort.

### BPLAY-V02

**Playbook task titles carry raw Asana casing into every new task**

Low · Fix · effort S · `Playbook template data (every created task)` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Template items keep Asana titles as typed (map.ts:1554, cleanTitle). The review and every created task read "review estimated cost to actual", "create Property Management Agreement", "[tenant] confirm national fuel and national grid set up", "Send connor [Tenant] credit report & paystubs" and "Setup [Tenant] group text". NEW PROPERTY's "Set up loan autopayment (first payment due X)" has an unbracketed X, which never prompts for a value.
- **Why:** Each apply stamps the same sloppy titles onto 5 to 39 new tasks, so the list looks unfinished, the opposite of plain and credible. A placeholder outside brackets slips through the fill-in check.
- **Change:** Do a one-time data pass on TaskTemplate.items: capitalize the first letter, write "Connor" and "Set up" (as a verb), and turn the bare X into [First payment date] so the flow asks for it. Apply the same first-letter rule in the importer for future refreshes.
- **Desktop, tablet, phone:** No layout change. Titles read the same at every width.
- **Reuse:** map.ts template mapping (cleanTitle); template-items.ts token handling already covers the new [First payment date] token.
- **Code:** `branch: src/lib/asana/map.ts:1550-1561`
- **Verification:** verifier-found
