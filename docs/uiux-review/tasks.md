# Tasks list, new task and task detail

Part of the [UI/UX review](README.md). 30 findings: 0 critical, 4 high, 15 medium, 11 low.

## How it should work

Tasks becomes the quiet queue HG runs on after Asana: one row, one composer and one record page, each borrowed from the product that does it best.

One row everywhere. Today, All, Home and the property hub use the same row, so a task never changes shape between pages. The checkbox slot holds Linear's status glyphs, one per approved status, tinted with its Badge tone (https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1). The property sits under the title in gray, as Things 3 shows the project (https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd), and checklist progress reads 3/14 in Geist Mono. One date sits at the right edge. A planned day that slips rolls into Today quietly; red is kept for real deadlines, shown as a Things 3 flag such as 58d left.

Views stay calm. Today keeps the approved Mine | Contractors columns. All groups by status with counts, and sorting, grouping and filters fold into one Display button that shows how many are applied, as in Todoist (https://mobbin.com/screens/a8b34ad5-5892-42c4-b5fe-665fa98a3e89).

Capture is one line. The composer reads "Call plumber 767 fri @zack" and turns each part into a highlighted token and a chip, like Todoist (https://mobbin.com/screens/da093dfa-c36e-4ced-99be-c71e2f1e6710). It inherits the property or view it was opened from, like Linear (https://mobbin.com/screens/60fb29a7-f5c7-4df0-a7bc-6290d3f0ec93), and says who will hear about it, "Zack gets an email with the notes and address," after Basecamp (https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c). Repeat lives at the foot of the date popover (https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c).

The task page follows Linear's issue page (https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): title, notes, a checklist with headings for punch lists as in Things 3 (https://mobbin.com/screens/18b05379-2af1-41ab-afef-0ca4870933c1), photos, then one timeline. On a phone the address and Directions sit under the title, as on Jobber's jobs (https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42). When a contractor can read the notes, one line says so, the way Basecamp labels client-visible pages (https://mobbin.com/screens/5bbb02bd-8055-4150-853d-3f33cf9144e8).

Review shows the work before the button. Approve and Send back open the photos large beside the job's timeline, as Mercury reviews a reimbursement (https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19). Missing photos or open checklist items are flagged first, as Brex flags a missing receipt (https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c).

Done closes the loop. Finished work keeps its day and who did it, like the Things 3 Logbook (https://mobbin.com/screens/627a2d8f-f5bb-408e-a724-c46b9e40a769). A cleared Today ends on one HG property photo and the next item, the way Superhuman marks Inbox Zero (https://mobbin.com/screens/535b097f-547d-44dc-88c9-93d041053752).

<details><summary>What the reviewer covered</summary>

Port 3200 was up and signed in. Routes I exercised: /tasks with the default Open view, ?status=done, ?status=all&sort=owner, ?property=767 Prospect, and a search with no results (?q=zzzz). /tasks/new blank, with ?propertyId=767 Prospect and with ?dealId=29 Livingston, plus an empty submit (native validation) and a filled submit (write blocked). /tasks/[id] for six tasks: cmtg25z7s048mjphsikewzpy1, cmtg25z7r048gjphs2o7ldjxq, the longest title cmtg25z15033sjphs2wqn1xgb, the external assignee cmtg25z0g02zsjphsayxnyw1y, cmtg25yzx02wmjphswsl6zgq5, and one completed task. Viewports: desktop 1280, tablet 768 (touch), mobile 375 (touch) and narrow 320 (touch). Dark mode on the list at desktop and mobile and on the task page at desktop and tablet. WebKit on the desktop list and the phone task page. Interactions: checkbox completion (the write was blocked, so I saw the failure path), hover on the due cell (tooltip) and the title, a title tap on tablet, Tab focus, a simulated drag-and-drop of a HEIC and a MOV onto attachments (both blocked, so I saw the error path), and DOM probes (column widths, control counts, computed font sizes, scroll box heights). I read every file in src/app/(app)/tasks/, plus src/lib/tasks/service.ts, src/lib/dates.ts, components/ui.tsx, attachments.tsx, tooltip.tsx, error.tsx, globals.css, docs/components.md and sections 3, 4, 6 and 7 of the migration spec. Mobbin: 16 searches (web and iOS) covering Linear, Todoist, Things 3, Asana, Attio, Stripe, Qatalog, ClickUp, Airtasker, Cofounder, Jira Cloud, Deel, Remote and Structured. Ramp is not on Mobbin, so Stripe, Deel and Remote stand in for finance-grade list patterns. Not reached: native date and select popups (the OS draws them, so screenshots miss them), successful save states (all writes are blocked), a task that already has attachments, and a deal-linked task page. I couldn't find either without database access, which was denied, so the deal and attachment findings come from the code.

</details>

## Findings

### TASKS-006

**Choosing a team member permanently erases a contractor assignee, and you can't pick them again**

High · Fix · effort S · `/tasks/[id] Assignee, and /tasks row owner picker` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. Partly fixed in 9f74ea1: the legacy link script would attach the email-valued names ([email], [email]) to Zack's and Idrius's Contacts, so those 6 open tasks would stop reading Unassigned, but it hasn't been run. The claimed stale-screen check is G2B-013's fix and doesn't touch this. Still open: Brandon Kmiotek, John OConnell and [email] have no Contact, so the picker can't choose them. Any pick still erases the name-only assignee, because isAssignee counts a legacy name as nobody. Creating those Contacts is a data job for Connor, and letting the picker keep a name-only person is his design call. The migration session's position: replacing a name-only holder is an ordinary reassignment once the screen showed that name, and only Brandon Kmiotek's open job is affected until Connor adds him as a contact. The approved contact-backed picker replaced the native selects. AssigneePicker always lists Unassigned, then Team, then Contractors as real Contacts (31 on the branch, each with trade and a 'Has login' tag), and patchTask takes {contactId}. Rows no longer have an assignee picker at all. On Mud Drywall (/tasks/cmtg25z0g02zsjphsayxnyw1y) the chip reads Unassigned, a muted line says 'Assigned in Asana to José Alvarez', and Jose Alvarez can be picked from Contractors. Picking someone still clears the legacy free-text name, but the ASSIGNED event keeps it in from.name. Legacy names still appear under an 'External' filter group and as initials in Today's Unassigned section; that is tracked in TASKS-013. Removal not upheld: A close variant is still on the branch. Assignees whose legacy name has no matching Contact still can't be picked, and any change erases them. On the open task 'Finish plumbing Start November 9' (/tasks/cmvkij6p3270dc125e57d8be5, imported Oct 2), the chip reads Unassigned and a muted line says 'Assigned in Asana to Brandon Kmiotek'. Searching the picker for 'Brandon' finds only Brandon Zarbo (shot: skeptic-b11/t006-brandon--picker-search--desktop-light.png). Brandon is one of the D13 people who get job access. Picking anyone sets assigneeName to null (branch core.ts:496), and after that nothing can put Brandon back. In the DB, Brandon Kmiotek (28 tasks), John OConnell (10) and [email] (11) have no Contact at all. A second problem: tasks whose legacy value is an exact Contact email ([email] is Zack Reading, [email] is Idrius Falleta) still show Unassigned, so the picker marks Unassigned as selected, as the original finding observed. That covers 6 open tasks. The contact-backed picker itself works for everyone who is a Contact.
- **Today:** Task page: the empty-value option is labeled "<current assignee> (external)" on every assigned task, including team-assigned ones, so there is never a visible Unassigned option. Choosing it unassigns. Row picker on a contractor task (Mud Drywall): Unassigned, "José Alvarez (external)" disabled, then the team. The native picker marks Unassigned as selected because the value is empty. Picking anyone clears assigneeName (service.ts:118) and nothing can put the contractor back.
- **Why:** One mis-tap loses the record of which contractor owns the job. With 29 contractors moving into the portal, assignment has to survive a reassignment.
- **Change:** List contractors as real options in both pickers, using the distinct assigneeName values the owner filter already queries (page.tsx:114-119) under a Contractors heading, with value "n:<name>". Let patchTask accept assigneeName. Always include "Unassigned". This is a stopgap for the approved contact-backed picker.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** The owners query in tasks/page.tsx, plus service.ts patchTask extended with assigneeName.
- **References:** 
  - [Linear](https://mobbin.com/screens/af9cc8d7-aea7-4a3a-9021-5edc74d80ad8): Every person appears once in one menu with sections, so picking a teammate never makes another person unpickable.
  - [Clerk](https://mobbin.com/screens/14b67806-5df8-48cf-9628-9f39195c5424): Identity cell with name over email beside an avatar; use it for contractor rows in the assignee menu.
  - [Slack](https://mobbin.com/screens/653fd646-3333-4cd4-a783-3af15d9277b0): A searchable assignee list where every person stays selectable.
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:140`, `src/app/(app)/tasks/task-row.tsx:218-223`, `src/lib/tasks/service.ts:115-119`, `branch:src/components/assignee-picker.tsx:171-221`, `branch:src/app/(app)/tasks/[id]/actions.ts:19,29`, `branch:src/app/(app)/tasks/[id]/view.tsx:120`, `branch:src/lib/tasks/core.ts:489-503`
- **Verification:** partly. The bug is wider than the contractor case. On Pieter's own task (cmtg25z7s048mjphsikewzpy1), the Assignee options are "Pieter Louw (external)" (value empty), Connor, Pieter. task-detail.tsx:140 labels the empty option with whoever is assigned, so on every assigned task "Unassigned" is disguised as a fake external copy of the assignee. The fix should always render a plain "Unassigned" option and list real contractors. The Slack picker reference is a weak match.

### TASKS-011

**The task page is three stacked cards with a bordered table nested inside the first**

High · Design change · effort M · `/tasks/[id]` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** /tasks/[id] now has the approved side rail. From lg it is a sticky 288px framed card with compact label and value rows (Assignee, Due, Property, Unit, Repeats, Lockbox, Created); below lg it becomes a chip row. Mark complete became the status chip menu beside the title. The nested bordered dl is gone. The main column is still framed, though: notes, checklist and files share one bordered shadow-sm Card with dividers and semibold 'Checklist' and 'Files'/'Photos' headings. The files list inside that card is its own bordered box, so frames nest, and the composer is another card. A plain task therefore shows three framed surfaces: the main card, the composer and the rail.
- **Why:** Card inside card plus a header per section is the generic-template look the bar rules out. It spends a third of the viewport on chrome, and the page reads as a form rather than a record. Linear and Asana put content in an unframed main column and properties in a compact rail.
- **Change:** Remove the Card around notes, checklist and files (view.tsx:118). Separate those sections with spacing and one hairline before Activity, and make 'Checklist' and 'Photos'/'Files' 12px muted labels. That leaves the rail and the composer as the only framed surfaces. The rail itself is approved and stays.
- **Desktop, tablet, phone:** Desktop 1280: main column about 680px plus a 280px rail. Tablet 768: the rail becomes the approved chip row under the title. Phone 375: one column with chips scrolling sideways. Nothing drops.
- **Reuse:** The approved Task page with side rail (spec D31, section 6). Card is used only for the rail group, if at all.
- **References:** 
  - [Linear](https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): No cards in the main column: title, description, sub-issues 0/4 and Activity flow on the page, with the properties rail at right and 2 / 5 stepping in the header.
  - [Todoist](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c): Task opened as a modal with the same split: title, sub-tasks and comments left, Project, Assignee and Date rail right.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Unframed title, description and activity, with a compact properties rail on the right.
  - [Asana](https://mobbin.com/screens/95628ff8-7999-4c30-9820-5924b8fd9c59): Label and value property rows with no nested borders, and the description inline below.
- **Code:** `src/app/(app)/tasks/[id]/page.tsx:54-103`, `branch:src/app/(app)/tasks/[id]/view.tsx:100-146`, `branch:src/app/(app)/tasks/[id]/fields.tsx:73-79,176-181`
- **Verification:** confirmed. Confirmed: three cards, a bordered dl nested in card 1, and a header holding only Mark complete (verify-TASKS/detail1--desktop-light.png). It also breaks on phone. The 96px uppercase label column plus 16px values truncates the rail to "José Alvarez (" and "767 Prospect Aven" (mud--scrolled--mobile-dark.png). This is direction for the approved Oct 28 rail build, not a new layout.

### TASKS-012

**New task is a full page with a six-field form; replace it with a quick composer**

High · New capability · effort L · `/tasks/new` · Create where you are

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** '+ New task' (still a typed '+', tasks-header.tsx:11-13) still opens a full page at /tasks/new with a card form. It holds Title *, Description (a 4-row textarea with a resize handle), Assignee (now the chip picker, contractors included), Due date (native mm/dd/yyyy), Status (native select), Repeats (chip), Property (native select whose empty option is 'None') and Create task. The separate external-assignee field is gone. The form now mixes chip pickers with native inputs, still has no Cancel or back link, and its subtitle restates the context ('For deal 29 Livingston Street, Buffalo,  NY 14213', with a double space).
- **Why:** Asana-style capture has to take seconds: a task usually comes up while you're doing something else. Linear, Attio and Todoist all create in a small composer over the current screen, with property chips, and let you make several in a row.
- **Change:** Still replace the page with the composer. The parts now exist: AssigneePicker, DueDatePicker with quick picks, SelectChip for Property and RepeatPicker as the chip row, with 'Add notes' in place of Description. If the composer has to wait, at least swap the native date and property fields for DueDatePicker and SelectChip so the form matches the task page, add Cancel, and use the lucide Plus icon on the button.
- **Desktop, tablet, phone:** Desktop and tablet: a centered dialog about 560px wide. Phone: a bottom sheet sitting above the keyboard, with the chip row scrolling sideways and the submit button at the right. Notes stay collapsed on phone until tapped.
- **Reuse:** React Aria Dialog and Popover (D9) as the Dialog shell from Known gaps, chips sharing the approved due-date popover and assignee picker, and createTask in tasks/actions.ts.
- **References:** 
  - [Linear](https://mobbin.com/screens/60fb29a7-f5c7-4df0-a7bc-6290d3f0ec93): New issue dialog: title, description, property chips, Create more and Create issue.
  - [Attio](https://mobbin.com/screens/f2c03bd6-d24e-4e77-8460-f358be03af3a): One-line task composer with Today and Assigned to You chips, Create more, Save ↵ and Cancel Esc.
  - [Todoist](https://mobbin.com/screens/8bca895b-61a1-4602-9afc-94580cca3b00): Phone quick-add sheet above the keyboard with a scrolling chip row.
  - [Todoist](https://mobbin.com/screens/c4a9db18-e58f-419e-a8f0-7daf3d7cbf8e): Inline Add task in Today, prefilled with Today, and the toast 'Task added to Inbox · Open'.
  - [Things 3](https://mobbin.com/screens/b5752737-a240-4ed9-9b08-5a59a90e912b): A new to-do opens inline in place with the keyboard.
  - [Attio](https://mobbin.com/screens/08df4ff2-a5d6-4200-b3b5-44e3ddc41f09): Create Task dialog: title, date chip, 'Assigned to You', linked record, Create more switch, Cancel ESC and Save ↵.
  - [Linear](https://mobbin.com/screens/ffa2e456-85c7-4005-b361-de79dc6b6dc7): New issue dialog with property chips in one row and a 'Create more' switch beside Create issue.
  - [Linear Mobile](https://mobbin.com/screens/f8e3aa03-00f2-4985-a6ae-1055ae0f4144): After creating: 'Project update created' with a 'View update' link in the toast.
- **Code:** `src/app/(app)/tasks/new/page.tsx:19-76`, `src/app/(app)/tasks/page.tsx:154-156`, `branch:src/app/(app)/tasks/new/page.tsx:22-64`, `branch:src/app/(app)/tasks/new/new-task-fields.tsx:36-79`, `branch:src/app/(app)/tasks/tasks-header.tsx:11-13`, `branch: src/app/(app)/tasks/tasks-header.tsx:8-15`, `branch: src/app/(app)/tasks/task-section.tsx:11-61`, `src/app/(app)/tasks/new/page.tsx:19-79`, `src/app/(app)/tasks/actions.ts:32-38 (redirect to the new task)`, `src/app/(app)/properties/[id]/page.tsx:170 (property link to /tasks/new?propertyId=)`, `branch-src/src/app/(app)/tasks/new/page.tsx:22-62`, `branch-src/src/app/(app)/tasks/new/new-task-fields.tsx:36-67`, `branch-src/src/app/(app)/properties/[id]/page.tsx:183-189`
- **Also found as:** BTASKS-026 (Branch: Today, All tasks, new task and the task page), FEEL-I08 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Confirmed: full page, two assignee fields, native mm/dd/yyyy, no Cancel, and the subtitle repeats the Property select (verify-TASKS/new--desktop-light.png). On phone the two-column grid truncates "Connor Swoffor" and Create task falls below the fold at 375x667. The composer should share the approved due popover and assignee picker so nothing is built twice. Effort L is fair.

### TASKS-I01

**Use one task row everywhere so a task reads the same on every page**

High · Design change · effort M · `Tasks list, Home 'My open tasks' card, property page Tasks card` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Shared row exists (task-row.tsx); two callers still bypass it.
- **Today:** Today and All now share one TaskRow (checkbox, title, gray property line, status chip, avatar, red-when-late date chip). Avatars are unified, and Home's card uses the same dueLabel chip, so 'Aug 28' reads red on Home and Today alike. Two surfaces still diverge. Home's MyTasksList has no checkbox and hides the property on phones. The property Tasks card has its own row with no checkbox and a gray 'Aug 28, 2026' for overdue work.
- **Why:** Things 3 and Todoist use one to-do row in Today, inside projects and in the Logbook, so a task never changes shape. Three date formats for one task make people doubt the data, and a property page that hides lateness undercuts the property hub that D10 is building.
- **Change:** Finish the consolidation. Home's card swaps MyTasksList for TaskRow. The property Tasks card swaps its hand-built li (page.tsx:196-219) for TaskRow with the place hidden, inside a TaskListProvider, so it gains the checkbox and the red late date. Stop using fmtDay for task dates there.
- **Desktop, tablet, phone:** Desktop 1280: one line. Tablet 768: one line with the property under the title. Phone 375: two lines (title; property and date), avatar at right. Nothing else drops.
- **Reuse:** Extend src/app/(app)/tasks/task-row.tsx and TaskCheckbox into a shared component in src/components/ with a docs/components.md row; replace the lists in src/app/(app)/page.tsx and src/app/(app)/properties/[id]/page.tsx.
- **References:** 
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): Today rows: title, gray project sublabel, deadline flag at right.
  - [Things 3](https://mobbin.com/screens/ff5ef47a-ab1f-4138-812c-f0169388180c): The identical row inside a project, under headings.
  - [Todoist](https://mobbin.com/screens/858c686b-66b3-4283-8f26-4a6f82b45b7b): Same row in Today with the project path at the right edge and red past dates.
- **Code:** `src/app/(app)/tasks/task-row.tsx:244`, `src/app/(app)/page.tsx:88`, `src/app/(app)/properties/[id]/page.tsx:198`, `branch-src/src/app/(app)/tasks/task-row.tsx:28-162`, `branch-src/src/app/(app)/tasks/my-tasks-list.tsx:12-31`, `branch-src/src/app/(app)/properties/[id]/page.tsx:196-219`
- **Verification:** confirmed. Reproduced on the live app. /tasks shows 'yesterday' in red for 'Create model to predict capex' (due Aug 28, 56 days late), Home shows '56d ago' in red (relativeDays, page.tsx:88), and 767 Prospect's card shows gray 'Aug 28, 2026' (fmtDay with year always, properties/[id]/page.tsx:198). Only /tasks has a checkbox. Avatars differ: hashed amber/cyan circles on /tasks, square blue tiles on the property card; the approved spec's reuse table already says 'Avatars use neutral colors so they don't collide', so the hashed palette also breaks a settled plan. One caveat: the /tasks 'yesterday' is not a format choice but wrong data (dueLabel turns every past date into 'yesterday'); I filed that as its own fix, TASKS-V01, since it should ship now, before any shared row. Things 3 refs check out: ff5ef47a is the 'Throw party for Eve' project with headings.

### TASKS-014

**Deal tasks lose their deal on the task page and show "No project"**

Medium · Fix · effort S · `/tasks/[id] for deal tasks, /tasks/new?dealId` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. The task page query still loads neither dealId nor the deal, so a deal task shows Property 'No property' and nothing links back to the deal. The deal page doesn't list tasks either. In lists, a deal task with no property shows the deal's short address in the property slot with no 'Deal' marker, so it reads as a property. /tasks/new?dealId=cmtg25yd8002cjphs49ovlvob still names the deal only in the subtitle ('For deal 29 Livingston Street, Buffalo,  NY 14213') and hides the Property field.
- **Today:** The task page query doesn't load dealId or the deal, so a deal task shows Project "No project" and nothing links back to the deal. The list does show "deal · <address>". New task for a deal names the deal only in the subtitle ("For deal 29 Livingston Street, Buffalo, NY 14213") and hides the Property field.
- **Why:** Once you open a deal task, there's no way back to its deal, and "No project" suggests the task isn't attached to anything.
- **Change:** Include the deal in the [id] query and show a read-only rail row "Deal" with the short address linking to /deals/[id]. The list meta reads "Deal · 29 Livingston". In the composer, show the deal as a set chip that can be removed.
- **Desktop, tablet, phone:** Desktop: a rail row. Tablet and phone: a chip in the chip row. Nothing drops.
- **Reuse:** shortAddress and the rail row component from the approved task page.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/a96b8326-76e3-4c24-822c-9617062a24fc): 'Sub-issue of HBT-1: ...' sits as a link under the title, so the related record is always one tap away; a deal task should read 'For deal 123 Main St' the same way.
- **Code:** `src/app/(app)/tasks/[id]/page.tsx:32-41,77-79`, `src/app/(app)/tasks/task-row.tsx:108-112`, `branch:src/app/(app)/tasks/[id]/page.tsx:29-87`, `branch:src/lib/tasks/list.ts:76`, `branch:src/app/(app)/tasks/new/page.tsx:26,46`
- **Verification:** confirmed. Confirmed in code: the [id] query includes only assignee and attachments ([id]/page.tsx:32-37), so a deal task shows "No project" with no link back to its deal. The row label uses lowercase "deal · " (task-row.tsx:111).

### TASKS-015

**The task title shrinks from 24px to 16px on every phone and iPad**

Medium · Fix · effort S · `/tasks/[id] title on touch devices` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. On /tasks/[id] the title textarea computes to 24px at 1280 but 16px at 768 and 375, in both Chromium and WebKit. The coarse-pointer rule is unchanged (font-size: max(16px, 1em) on input, select and textarea) and overrides the title's text-xl sm:text-2xl. The same rule raises the notes textarea from 14px to 16px, so on phone and iPad the 16px semibold title is the same size as the notes under it and barely reads as a heading.
- **Today:** The computed title size is 24px on desktop and 16px on touch, in both Chromium and WebKit. The globals.css rule for coarse pointers sets input, select and textarea to font-size: max(16px, 1em), and 1em is the parent's 16px, so the rule overrides text-2xl. On phone, "Mud Drywall" renders at body size.
- **Why:** The anti-zoom rule is right for small fields, but it flattens the page's main heading on the devices contractors and partners use most, so the hierarchy disappears.
- **Change:** Scope the rule to fields smaller than 16px. Either exclude display fields (input:not([data-display]), textarea:not([data-display])) and mark the title with data-display, or apply 16px only to the text-xs and text-sm field classes. Check by hand afterwards: CSS isn't linted.
- **Desktop, tablet, phone:** After the fix: 24px title at every size. Phone could use 22px if three-line titles feel heavy.
- **Reuse:** app/globals.css, lines 54-60.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/326f83a9-cdf3-46c7-b610-334f9dfdfe26): Issue title keeps its large size on a phone and wraps; nothing shrinks to body size.
- **Code:** `src/app/globals.css:54-60`, `branch:src/app/globals.css:103-112`, `branch:src/app/(app)/tasks/[id]/header.tsx:23`
- **Verification:** confirmed. Measured: the title is 24px on desktop and 16px on Chromium mobile, WebKit mobile and WebKit tablet. On phone the 16px date and select values look as big as the heading (verify-TASKS/detail1--mobile-light.png). The globals.css:54-60 rule causes it. The scoped fix is right.

### TASKS-019

**Every row renders full native pickers: 775 form controls and 10,000 DOM nodes for 193 rows**

Medium · Design change · effort M · `/tasks list (performance)` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Rows no longer render native pickers. Each row has a checkbox and one date chip, and the chip's popover mounts only when opened. Assignee and property can't be edited from a row, and the owner and address sorts are gone. Open (236 rows) is now 6,826 DOM nodes and 486 controls, about 29 nodes and 2 controls per row, down from about 53 and 4 on main. The HTML is still heavy: 945 KB for Open and 1.8 MB for Done (400 rows), loading in about 0.9 to 1.1 s locally.
- **Why:** Speed is part of feeling Linear-grade. Rendering pickers nobody has opened costs load time and memory on phones, and makes keyboard navigation slow.
- **Change:** The per-row picker problem is solved. What's left is volume: page or window the All list (TASKS-035) so Done and All stop sending 400 rows. Moving between rows with arrow keys (one tab stop per row) can be a follow-up.
- **Desktop, tablet, phone:** No visual change. On phone the shared picker opens as a sheet.
- **Reuse:** React Aria Popover, Menu and DatePicker (D9) plus the approved quick-pick date popover.
- **References:** 
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): Rows render plain text, a status glyph and small chips; pickers only mount when a chip is opened, which is how 200 rows stay light.
  - [Qatalog](https://mobbin.com/screens/829183c2-60d9-44e5-9ae2-f1cdac7e14dd): The row shows a plain "None" chip; a searchable assignee popover opens only when clicked.
- **Code:** `src/app/(app)/tasks/task-row.tsx:164-181,212-229,249-255`, `src/app/(app)/tasks/page.tsx:92-102,146`, `branch:src/app/(app)/tasks/task-row.tsx:84-155`, `branch:src/components/due-date-picker.tsx:81-104`, `branch:src/app/(app)/tasks/all/page.tsx:12`
- **Verification:** partly. Counts reproduced exactly: 777 inputs and selects and 10,259 nodes for 193 rows. The quoted load times did not reproduce: Done reached network idle in 1.1s, and the server answered Done in 0.13s and owner sort in 0.18s locally. The stronger evidence is page weight. The Open HTML is 1.1 MB and Done or All is 2.2 MB, because every row ships 12 property options and the assignee list. That matters on cellular.

### TASKS-024

**Hover-only × buttons sit right next to each value and clear it with no undo**

Medium · Design change · effort S · `/tasks rows (address, owner, due cells)` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The hover × buttons and the hover '+' are gone. Each row has one date chip whose picker includes 'No date', and every change toasts 'Moved to …' or 'Date removed' with Undo. Assignee and property can't be changed from a row. But an empty date now shows a bordered 'Due date' chip at rest on every undated row: the 43 rows in Today's No date group, rows in Unassigned, and the whole tail of /tasks/all.
- **Why:** Touch has no hover, and a destructive control right next to the value it destroys invites mistakes. Todoist and Qatalog put "No date" and "None" inside the picker instead.
- **Change:** Show nothing for an empty date on a resting row. On desktop, show a muted 'Due date' chip only on row hover or focus. On touch, leave setting the date to the task page (the row opens it). Keep the chip in the task page rail.
- **Desktop, tablet, phone:** Desktop: click the value to open a popover. Tablet and phone: row edits happen on the task page or through the approved quick-pick sheet.
- **Reuse:** The shared picker from TASKS-019 and the approved due-date popover.
- **References:** 
  - [Todoist](https://mobbin.com/screens/6c83da1c-f6be-4326-b0d7-2ddcfa14ae5b): "No Date" is a row inside the date popover, not a separate × on the list.
- **Code:** `src/app/(app)/tasks/task-row.tsx:47-61,63-83,161-163,209-211,246-248`, `branch:src/app/(app)/tasks/task-row.tsx:146-155`, `branch:src/components/due-date-picker.tsx:71`, `branch:src/app/(app)/tasks/task-list-context.tsx:69-81`
- **Verification:** confirmed. Seen: hovering a due cell shows the × about 4px from the value (verify-TASKS/open-metrics--hover-due--desktop-light.png). Owner and property cells have the same ×. Todoist's "No Date" row inside the popover (https://mobbin.com/screens/6c83da1c-f6be-4326-b0d7-2ddcfa14ae5b) came back in my own search and matches the note.

### TASKS-025

**Description is a fixed 4-row text box where links aren't clickable**

Medium · Design change · effort M · `/tasks/[id] Description` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Notes are now a textarea with no visible label that grows with its text, has no resize handle, saves on blur and shows 'Add notes' when empty. On phone it no longer scrolls inside itself. It is always in edit mode, though. In /tasks/cmtg25z15033sjphs2wqn1xgb the Gmail thread URL and [email] are plain text, and the page has no anchors for them. Esc doesn't revert an edit.
- **Why:** Notes are where the useful context lives: links to the email thread, the contractor's phone number, lockbox details. Asana and Linear show notes as formatted text with working links and switch to editing only when you click.
- **Change:** Add a read mode that renders URLs, emails and phone numbers as links (tel: on phone). Clicking or tapping text that isn't a link switches to the growing textarea. Blur saves and Esc reverts.
- **Desktop, tablet, phone:** Same on all sizes. On phone, links open the Mail app, the phone dialer or Safari.
- **Reuse:** InlineAddressField, generalized to multi-line (Duplicates). A small linkify helper goes in lib/.
- **References:** 
  - [Linear](https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): Description is frameless text that grows with its content, directly under the title.
  - [Todoist](https://mobbin.com/screens/9ef543a6-88c7-4b9d-887c-52d0e17d254e): Description editor with a small selection toolbar (bold, lists, Link) so pasted links work.
  - [Asana](https://mobbin.com/screens/6eb09ac5-bb18-4732-982d-44a5154434c7): Phone task description with a tappable email link.
  - [Linear](https://mobbin.com/screens/7c88fd2a-866e-4db1-b3ac-38cb5cd2c043): The description shows as plain text under the title, with no box until you edit.
  - [Linear](https://mobbin.com/screens/f4cd410f-b1b4-49fe-a247-80071f69ba1e): A long description with headings and lists shown at full height beside the properties rail.
  - [Linear](https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33): The description reads as flowing text at full height above the activity, with no box around it
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:210-235`, `branch:src/app/(app)/tasks/[id]/notes.tsx:12-54`, `src/app/(app)/tasks/[id]/task-detail.tsx:228-232`, `branch src/app/(app)/tasks/[id]/notes.tsx:22-27,51`, `eval: textarea clientHeight == scrollHeight, resize none, overflow hidden`, `Eval: textarea clientHeight 104 vs scrollHeight 546 at 320; 96 vs 228 at 1280`, `src/app/(app)/tasks/[id]/task-detail.tsx:224-233`, `branch: src/app/(app)/tasks/[id]/notes.tsx:22-52`, `Eval: textarea clientHeight 558 = scrollHeight 558 at 320 (Chromium); 454 = 454 at 375 (WebKit)`
- **Also found as:** TASKS-IV05 (Tasks list, new task and task detail), G1C-V01 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** confirmed. Reproduced on the 767 task. The textarea scrolls (114px of content in a 96px box), the Gmail URL is plain text, and the email address sits below the fold (verify-TASKS/long--detail--desktop-light.png). Tap-to-edit fits the house touch rule.

### TASKS-028

**The green "Completed" button reopens the task when clicked, and doesn't say when it was done**

Medium · Design change · effort S · `/tasks/[id] for a completed task` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The green Completed toggle is gone. A done task (/tasks/cmtg25yuf01zsjphs0xu5d2fl) shows a green 'Done' status chip with a menu beside a struck-through title, and you reopen it by choosing To do from that menu. Still missing: no 'Completed Oct 20 by Connor' line (completedAt isn't loaded), no Undo toast on reopen, and the struck-through title can still be edited.
- **Why:** A button labelled with a state that silently does the opposite is a trap. The house rule asks for a record of what was done. Linear and Asana show the state plus a history line, and reopening is an explicit choice.
- **Change:** Load completedAt and who completed it in [id]/page.tsx. For Done, show a muted 'Completed Oct 20 by Connor' under the title, and 'Canceled …' for Canceled. Pass done/undo to run() in StatusControl.choose so reopening toasts with Undo.
- **Desktop, tablet, phone:** Desktop: status in the rail. Tablet and phone: the status chip comes first in the chip row, and the completion line sits under the title.
- **Reuse:** The approved status control and Badge tones (D6), plus fmtDay with completedAt.
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): After approval the timeline shows 'Approved Oct 29th at 2:27pm by ...' and the state label changes; completion should read the same way.
  - [Things 3](https://mobbin.com/screens/627a2d8f-f5bb-408e-a724-c46b9e40a769): Completed items carry their completion day.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Status in the rail, with activity lines like "moved from Todo to In Progress".
  - [Asana](https://mobbin.com/screens/a2e9f031-ef5d-4569-bb61-ab9a1f97804a): A "Completed" chip in the toolbar, with other actions kept in the ⋯ menu.
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:41-61`, `branch:src/app/(app)/tasks/[id]/status-control.tsx:41-73`, `branch:src/app/(app)/tasks/[id]/page.tsx:29-87`, `branch:src/app/(app)/tasks/[id]/header.tsx:15-29`
- **Verification:** confirmed. Confirmed in code: CompleteButton labels the done state "Completed" and calls toggleTask on click (task-detail.tsx:41-61). The title stays editable with strikethrough, and completedAt is never shown. This folds into the approved status control.

### TASKS-034

**After creating a task you're sent to its page instead of staying where you were**

Medium · Design change · effort S · `/tasks/new after submit` · Create where you are

- **Migration branch:** Still applies on the migration branch. createTask still redirects to the new task's page. In a server action that redirect pushes a history entry, and the task page's '← Tasks' BackLink calls router.back() whenever the previous entry is in the app, so it returns to the empty New task form.
- **Today:** createTask always redirects to the new task (actions.ts:37). Because the redirect pushes a history entry, the task page's "← Tasks" link goes back to the empty New task form, not the property or list the user started from.
- **Why:** Adding three tasks after a walkthrough means three round trips. Linear and Attio keep you in place and confirm with a toast that has a link.
- **Change:** From the composer (TASKS-012), stay on the current page, show the toast "Task created" with View, and highlight the new row for about 1.5 seconds. With Create more on, clear the title and keep the chips.
- **Desktop, tablet, phone:** Same at every size. On phone the sheet closes and the toast sits above the bottom bar.
- **Reuse:** The approved Toast, and revalidateTask already refreshes the property page.
- **References:** 
  - [Linear](https://mobbin.com/screens/7d2d62c7-8fb9-40d8-bd36-f1a8ff0a860c): New issue dialog with a 'Create more' toggle and 'Save as draft'; you stay on the list you were on.
  - [Basecamp](https://mobbin.com/screens/56f50dc4-7b99-409c-9d84-4bd6795fb5f3): Buttons say 'Save card', 'Save and add another', 'Never mind'.
  - [Linear](https://mobbin.com/screens/1a4540b2-6c15-49ff-a07f-4fddb7490e38): An "Issue created" toast with View issue, while the list stays put.
  - [Unify](https://mobbin.com/screens/e3665eba-a081-441a-9ecd-f81059751e10): "Task successfully created" with a View task link over the tasks table.
- **Code:** `src/app/(app)/tasks/actions.ts:32-39`, `branch:src/app/(app)/tasks/actions.ts:73`, `branch:src/components/back-link.tsx:15-33`
- **Verification:** partly. The composer half duplicates TASKS-012. The finding misses a bug that can be fixed now. redirect() in a Server Action pushes a history entry (node_modules/next/dist/docs/.../redirect.md:31), and BackLink calls router.back() when the referrer is in-app (back-link.tsx:11-15). So "← Tasks" on a freshly created task returns to a blank New task form. Fix: redirect(url, RedirectType.replace). I couldn't run a real create because writes are blocked, so this comes from code and docs. Linear Mobile's "Project update created · View update" toast (https://mobbin.com/screens/f8e3aa03-00f2-4985-a6ae-1055ae0f4144) supports the toast part.

### TASKS-I02

**New task from a property-filtered list should start with that property**

Medium · Fix · effort S · `Tasks list filtered to one property` · Create where you are

- **Migration branch:** Still applies on the migration branch. /tasks?property=cmtg25y4p0006jphsv3frndk6 now redirects to /tasks/all?property=…, which titles the card '767 Prospect Avenue'. Its '+ New task' still links to plain /tasks/new, so the new task starts with Property 'None'.
- **Today:** On /tasks?property=cmtg25y4p0006jphsv3frndk6 (767 Prospect Avenue) the '+ New task' button links to plain /tasks/new (read from the live page), so the new task's Property starts at 'None'. The property page's own '+ Task' does pass propertyId.
- **Why:** Linear opens New issue with the project and milestone already set when you create from inside that view, so the view you're in is the context. Re-picking the property you are looking at wastes a step and files tasks under no property; 56 open tasks already have none.
- **Change:** Pass the active property filter (and a single-person owner filter as the assignee) into New task, shown as prefilled, removable chips in the composer.
- **Desktop, tablet, phone:** Same at all sizes; on phone the prefilled property chip leads the composer's chip row.
- **Reuse:** src/app/(app)/tasks/page.tsx LinkButton; src/app/(app)/tasks/new/page.tsx already reads propertyId.
- **References:** 
  - [Linear](https://mobbin.com/screens/60fb29a7-f5c7-4df0-a7bc-6290d3f0ec93): New issue opened from a milestone view arrives with the project and milestone chips filled in.
- **Code:** `src/app/(app)/tasks/page.tsx:154`, `src/app/(app)/properties/[id]/page.tsx:170`, `branch-src/src/app/(app)/tasks/tasks-header.tsx:11`, `branch-src/src/app/(app)/tasks/page.tsx:11-20 (redirect to All)`
- **Verification:** confirmed. Live page with ?property=767 Prospect: the '+ New task' href is '/tasks/new' (page.tsx:154). /tasks/new already honors ?propertyId (new/page.tsx:57), so the fix is passing the filter through. The chip part depends on a composer that isn't in this list (TASKS-012 is referenced but not here); the one-line href fix stands on its own. My DB count: 56 open tasks have no property.

### TASKS-I03

**Keep red for real deadlines: a slipped planned day rolls into Today quietly**

Medium · Design change · effort M · `Tasks list and the approved Today view` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The approved Overdue group and Move all are built. The planned-day versus deadline split is not.
- **Today:** The 'everything reads yesterday' bug is gone. dueLabel now says 'yesterday', then '2d late' up to six days, then the date ('Aug 28'), red when overdue. Today groups slipped work into Overdue with 'Move all to today'. The core problem remains: any slipped planned day turns red, and there's still no separate deadline. Connor's Mine shows Overdue 25, Unassigned 34 is mostly red, and contractor rows read 'Yesterday' in red. Key-date reminders still embed the deadline in the title with Due set 21 to 60 days earlier.
- **Why:** Things 3 separates When (the day you plan to do it) from Deadline (a flag that reads '4d left' and turns red on the day); a missed When simply rolls into Today without red. Todoist added a separate Deadline beside the date for the same reason. When half the rows are red, red stops meaning anything, and a loan maturing in two months looks as urgent as a stale note.
- **Change:** Keep one Due as the planned day (D7), but when it passes the task moves into Today with a muted 'from Mon' note instead of red. Add an optional Deadline shown as a right-aligned flag ('58d left'), red only within 3 days and after. Key-date reminders set it automatically and drop the date from their titles. The approved Overdue group with 'Move all to today' then holds only tasks whose Deadline has passed.
- **Desktop, tablet, phone:** Desktop and tablet: the flag sits in the date column after the due day. Phone: the flag replaces the due day on the second line when present. Nothing drops.
- **Reuse:** lib/dates.ts fmtDay and isPastDay; the approved quick-pick date popover (D7, D9); the week-2 'Deadline field' in the Asana migration spec; src/lib/properties/service.ts REMINDERS.
- **Challenges:** D7 (one Due date; Today shows Overdue with 'Move all to today'). The spec already plans a Deadline field for week 2; this brings it forward for key dates and changes what counts as overdue.
- **References:** 
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): Deadline flag '4d left' in gray and 'today' in red; the planned day itself never turns red.
  - [Things 3](https://mobbin.com/screens/56745161-59bd-421d-93ac-e74fa5f7f1b8): When date and Deadline ('Thu, Mar 30 14 days left') as two separate rows.
  - [Todoist](https://mobbin.com/screens/7db71f5d-a9af-405f-9e27-d1acd920fbb6): Deadline picker separate from the date, with '3 days after date' style quick picks.
- **Code:** `src/lib/properties/service.ts:130-135`, `src/lib/properties/service.ts:152`, `Local DB (read-only): 95 of 193 open, non-template tasks have dueDate before today`, `branch-src/src/lib/dates.ts:161-177`, `branch-src/src/app/(app)/tasks/today-view.tsx:66-80`, `branch-src/src/lib/properties/service.ts:131-134`
- **Verification:** partly. The red flood is real, but the finding leans on a case I can't reproduce and challenges D7 (correctly named). There are 0 key-date reminder tasks (autoKey) in the local DB, so the 'loan maturing in two months looks as urgent' row was inferred from code (properties/service.ts REMINDERS), not seen. A reminder going red after its 60-day lead date passes is arguably right, since that's when the refi work should start. Most of the flood comes from stale August import dates plus the dueLabel bug (TASKS-V01), and D7's 'Move all to today' at import clears most of it without a second date. The Deadline field is already planned for week 2. References are real (Things ff5ef47a shows the When date and '14 days left' deadline rows).

### TASKS-I06

**Offer to turn a pasted punch list into a checklist with headings**

Medium · New capability · effort M · `Task page notes` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Clipping is fixed (notes.tsx:22-27 auto-grow). The conversion offer still applies and is easier now that the Checklist component exists.
- **Today:** The notes textarea now grows to fit, so the '765 punch list' shows all of it: LOWER and UPPER headings, the code, phone numbers and 7 work items. Checklists also shipped. But the list is still untickable text, and directly beneath it sits an empty 'Checklist' with only '+ Add item'. Nothing offers to convert.
- **Why:** Things 3 puts a checklist inside a to-do and lets a project carry headings; Linear shows sub-issue progress (0/4) on the issue. A punch list a contractor works through is a checklist, and HG's notes already are one.
- **Change:** When notes hold 3 or more short lines, show one line under them: 'Turn 14 lines into a checklist'. All-caps lines (UPPER, LOWER) become checklist headings, the rest become items, and the original notes stay in the timeline. Run the same conversion in the open-task importer.
- **Desktop, tablet, phone:** Desktop and tablet identical; on phone checklist rows are 44px with the tick on the left.
- **Reuse:** Approved TaskChecklistItem model and checklist UI (spec 5.2); a heading flag on an item.
- **References:** 
  - [Things 3](https://mobbin.com/screens/18b05379-2af1-41ab-afef-0ca4870933c1): Checklist inside an expanded to-do, items reorderable.
  - [Things 3](https://mobbin.com/screens/ff5ef47a-ab1f-4138-812c-f0169388180c): Headings ('Location and guest lists', 'Food and games') group items.
  - [Linear](https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): 'Sub-issues 0/4' block under the description.
- **Code:** `Local DB (read-only): 11 open tasks have notes of 3 or more lines`, `branch-src/src/app/(app)/tasks/[id]/notes.tsx:22-27`, `branch-src/src/app/(app)/tasks/[id]/view.tsx:118-125`
- **Verification:** confirmed. Seen: the 14-item punch list under UPPER, LOWER and BASEMENT sits in a 4-row textarea that shows about four lines. By my count 14 open tasks have notes of 3 or more lines (the finding says 11; it depends on how blank lines are counted). Linear f00cc4fb is real ('Sub-issues 0/4'). Checklist headings need a heading flag the spec's TaskChecklistItem doesn't have yet, so M is fair. Prefer the opt-in 'Turn 14 lines into a checklist' over silent conversion in the importer: free-text notes can misparse.

### TASKS-I08

**Put the property address and Directions under the title on phones**

Medium · Design change · effort S · `Task page on phone and tablet` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. fields.tsx:117-131 renders SelectChip only.
- **Today:** The 'Project' select became a Property chip with a map-pin icon: in the sticky rail on desktop, and in a sideways-scrolling chip row under the title on tablet and phone ('Zack Reading · Today · 415 Crescent Ave.', with the property chip cut at 375). The chip only opens a picker to change the property. There's still no link to the property page, no street-address line and no Directions.
- **Why:** Jobber's job screen puts the address under the title with a Directions button, because someone reading a job on a phone is usually on the way there. The approved contractor job page already has the address with Directions and Copy; staff on site need the same.
- **Change:** On tablet and phone, add the street address as one line under the title, linking to the property, with a Directions button that opens Maps. Keep the Property chip in the chip row for changing it. On desktop, show the rail's Property value as a link to the property, with the picker on its chevron.
- **Desktop, tablet, phone:** Desktop 1280: rail link only, no Directions. Tablet 768: line under the title plus Directions. Phone 375: same line, Directions as a full-width secondary button.
- **Reuse:** The approved portal job page address block (spec section 6, Job page); shortAddress in lib/normalize.ts.
- **References:** 
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): Task with the address and a Directions button under the title, then one primary next-step button.
  - [Jobber](https://mobbin.com/screens/31d2f003-1b0b-41b4-9e38-a51b2c78353a): Status chip above the title, address, Directions, next-step buttons and a ⋯.
  - [Jobber](https://mobbin.com/screens/c45b60a9-acac-4ecc-b6ed-0539637d2e39): Web job page with a property address block and map pin beside the details.
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:188`, `src/app/(app)/tasks/[id]/page.tsx:77`, `branch-src/src/app/(app)/tasks/[id]/fields.tsx:117-131`
- **Verification:** partly. The real gap is at every size: the task page has no link to its property. 'Project' is only a select (task-detail.tsx:188), so getting from a task to its house means going through Portfolio. Fix that first, everywhere. A full-width Directions button for two partners who own 11 Buffalo houses is chrome they rarely need. It belongs on the contractor job page, which the spec already has. On staff phones, an address line that links to the property, with Maps as a secondary tap, is enough. Jobber refs not spot-checked.

### TASKS-I14

**Show what was done at a property in the last 30 days below its open tasks**

Medium · Design change · effort S · `Tasks list scoped to a property (future property hub Tasks tab)` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. allTasks orders by dueDate asc for every status (queries.ts:86-91).
- **Today:** /tasks/all?property=767&status=Done (the Done tab) no longer says 'yesterday'. It lists every closed task oldest due date first ('Closing' Apr 8, 2025, 'Project overview breakdown for Jessica' Apr 11, 2025…), each with a green 'Done' chip, the assignee's avatar and the old due date. There's no completion date and no completer, and every row repeats '767 Prospect Avenue' under a card already titled 767 Prospect Avenue. Recent work is at the bottom of a long list.
- **Why:** Jobber's client page lists upcoming work, then 'Completed Last Week' with 'Completed on' and 'Completed by Sam Lee'; Things 3's Logbook groups by completion day. On a property hub, recent work answers 'what happened here?' without a second view.
- **Change:** On the property-scoped list (and later the hub's Tasks tab), add the collapsed 'Done in the last 30 days (6)' group under the open groups, newest completion first. Rows show the completion day in muted Geist Mono and who completed it, instead of the due date and assignee. Drop the repeated property name on rows when the list is scoped to one property.
- **Desktop, tablet, phone:** All sizes; on phone the completion day moves to the second line.
- **Reuse:** Shared TaskRow (TASKS-I01); completedAt plus the spec's completedBy fields.
- **References:** 
  - [Jobber](https://mobbin.com/screens/b90508d1-dc0d-47d2-a61a-3c49a4119f55): 'Completed Last Week' group with completion date and who completed it.
  - [Things 3](https://mobbin.com/screens/627a2d8f-f5bb-408e-a724-c46b9e40a769): Logbook grouped by completion day with the date in the left slot.
- **Code:** `src/app/(app)/tasks/page.tsx:80`, `branch-src/src/lib/tasks/queries.ts:78-96`, `branch-src/src/app/(app)/tasks/all/page.tsx:49-60`
- **Verification:** partly. The observation holds, and it's worse than stated: Done sorts by due date ascending, so the property's oldest work (a 2024 'Closing') comes first and every row reads 'yesterday'. That sort bug is filed separately as TASKS-V07 because it's a fix. The proposed 'Done in the last 30 days' group overlaps the approved hub's Activity tab (D10), and D25 deletes the ~1,900 old completed tasks, so the history this group would show starts thin. Worth doing only if Activity doesn't already answer 'what happened here?'. The Things 3 Logbook ref is plausible but wasn't spot-checked.

### TASKS-I17

**Contractor assignees show as raw email addresses**

Medium · Fix · effort S · `Task page and list rows with an external assignee` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. list.ts:63-64 maps unmatched text to kind 'name', and groupMine (list.ts:182-185) files kind 'name' under Unassigned.
- **Today:** Still on the branch, in a new form. Tasks whose legacy assignee text is '[email]' or '[email]' read as Unassigned. Today puts them in Mine > Unassigned with a 'Z' or 'F' avatar named by the raw email, while Zack Reading and Idrius Falleta each have their own group in the Contractors column (Zack Reading 8). The task page shows Assignee 'Unassigned' plus 'Assigned in Asana to [email]'. The same split happens for the legacy name 'José Alvarez' ('Mud Drywall' in Unassigned) versus the contractor group 'Jose Alvarez 4'.
- **Why:** Clerk's people tables lead with the name and put the email beneath; an email in place of a name reads as broken data and truncates to nothing on a phone. These tasks also won't reach Zack's portal (D4, D12) unless they're linked to his Contact.
- **Change:** Backfill before cutover: match legacy assigneeName values that are an email, or an exact full name, to one active Contact and set assigneeContactId. These jobs then move into that contractor's Contractors group with their name and outlined avatar, and contractors get emailed and see them in the portal. The Asana importer already matches people to Contacts by email (src/lib/asana/map.ts:264-272); run the same match on the CSV rows already in the DB.
- **Desktop, tablet, phone:** Desktop and tablet: name in rows, company in the picker's second line. Phone: name only.
- **Reuse:** Contact table; spec's assigneeContactId; initials() in lib/utils.ts.
- **References:** 
  - [Clerk](https://mobbin.com/screens/14b67806-5df8-48cf-9628-9f39195c5424): Identity cell: name over email beside an avatar.
- **Code:** `Local DB (read-only): Task.assigneeName 'zack@outlawcarpentry.com' (4 open) and 'fallettaidrius@gmail.com' (1 open) match Contact.email`, `branch-src/src/lib/tasks/list.ts:58-65`, `branch-src/src/lib/tasks/list.ts:176-194`, `branch-src/src/app/(app)/tasks/[id]/view.tsx:120`, `branch-src/src/lib/asana/map.ts:264-272`
- **Verification:** confirmed. Seen at 375 (dark): Assignee reads 'zack@outlawc...' with a 'Z' avatar. In the DB, 4 open tasks have '[email]' and 1 has '[email]', and both emails match Contacts (Zack Reading, Outlaw Carpentry; Idrius Falleta). The same raw emails also appear in the /tasks owner filter's 'External' group alongside '[email]' and inconsistent casing ('Jacob hoak').

### TASKS-I18

**Assignee menu calls a partner 'external', lists them twice and has no Unassigned**

Medium · Fix · effort S · `Task page Assignee menu` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The task page menu now meets the recommendation. The same duplication shows up in the list filter.
- **Today:** The task page's Assignee picker is fixed. It is a React Aria list that starts with Unassigned, then a Team group (Connor Swofford, Pieter Louw), then Contractors with their trade and a 'Has login' tag. Each person appears once. A legacy CSV free-text assignee shows as 'Assigned in Asana to X' above the notes, and the chip reads Unassigned. The duplicate-people problem has moved to the All tab's Assignee filter. Its 'External' optgroup lists 9 legacy free-text names, and most of them repeat contractors already listed under Contractors: Brandon Zarbo and Kenneth Gonzalez appear in both groups, 'José Alvarez' sits beside 'Jose Alvarez', 'Jacob hoak' beside 'Jacob (Jake) hoak', and three raw emails appear ([email], [email], [email]). Partners are no longer called external.
- **Why:** Linear's assignment menu starts with the empty choice ('No lead'), then people in a labeled group, then invite; each person appears once. A duplicate with the wrong label makes the menu untrustworthy.
- **Change:** The task page needs no further change. In the All tab filter, fold each legacy name or email that matches a Contact (by normalized name or email) into that contractor's option, so filtering by Zack also returns his CSV rows. Show only unmatched names, in a group called 'Other', and drop that group once the import reconciles them.
- **Desktop, tablet, phone:** Desktop popover, tablet popover, phone bottom sheet; same order everywhere.
- **Reuse:** Approved assignee picker that includes contractors; React Aria menu (D9).
- **References:** 
  - [Linear](https://mobbin.com/screens/af9cc8d7-aea7-4a3a-9021-5edc74d80ad8): 'No lead' first with a check, then 'Users from the project team', then 'Invite and add'.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Single assignee field in the properties panel
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:140`, `branch src/components/assignee-picker.tsx:171,182,198`, `branch src/app/(app)/tasks/[id]/view.tsx:120`, `branch src/app/(app)/tasks/filters.tsx:107-115`, `branch src/lib/tasks/queries.ts:99-116`, `eval on :3300 /tasks/all: External optgroup = Brandon Kmiotek, Brandon Zarbo, fallettaidrius@gmail.com, Jacob hoak, jdanderson285@gmail.com, John OConnell, José Alvarez, Kenneth Gonzalez, zack@outlawcarpentry.com`, `branch src/components/assignee-picker.tsx:171-220`, `branch src/app/(app)/tasks/all/page.tsx:33`, `Probe on :3300 /tasks/all optgroups: Team [Connor Swofford (me), Pieter Louw], Contractors [31], External [Brandon Kmiotek, Brandon Zarbo, fallettaidrius@gmail.com, Jacob hoak, jdanderson285@gmail.com, John OConnell, José Alvarez, Kenneth Gonzalez, zack@outlawcarpentry.com]`
- **Also found as:** COPY-040 (Lens: words on every screen)
- **Verification:** confirmed. Reproduced on the 765 punch list: the options are 'Pieter Louw (external)' (value ''), 'Connor Swofford', 'Pieter Louw' (selected), with no Unassigned (task-detail.tsx:140). It's also a data trap: picking the mislabeled 'Pieter Louw (external)' sends assigneeUserId null and unassigns Pieter. The list row's own select (task-row.tsx) does start with Unassigned, so the two pickers disagree.

### TASKS-V06

**Use the settled names: Assignee and Property, not Owner, Address and Project**

Medium · Fix · effort S · `Tasks list, New task, task page` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Mostly fixed. The list has no column headers. The filter reads 'All assignees' with Team and Contractors groups. The task page rail labels 'Assignee' and 'Property', with 'No property' as the empty choice, and the notes field is labeled 'Notes' with no 'Description' heading. Two leftovers remain on New task: the notes field is still labeled 'Description', and the property select's empty option reads 'None'.
- **Why:** D11 settled 'Assignee' and 'Property'. Calling a house a 'Project' or an 'Address' on different pages makes people wonder whether they're different fields.
- **Change:** On New task, rename 'Description' to 'Notes' and the empty property option 'None' to 'No property'.
- **Desktop, tablet, phone:** Same labels at all sizes. On phone the column headers drop anyway (TASKS-V02).
- **Reuse:** Copy-only edits in page.tsx, filters.tsx, task-detail.tsx and [id]/page.tsx.
- **Code:** `src/app/(app)/tasks/page.tsx:190-191`, `src/app/(app)/tasks/[id]/task-detail.tsx:194`, `src/app/(app)/tasks/[id]/page.tsx:77`, `src/app/(app)/tasks/[id]/page.tsx:86`, `branch src/app/(app)/tasks/new/page.tsx:37,50`, `branch src/app/(app)/tasks/filters.tsx:87`, `branch src/app/(app)/tasks/[id]/fields.tsx:81,117-125`, `branch src/app/(app)/tasks/[id]/notes.tsx:44`, `src/app/(app)/tasks/[id]/task-detail.tsx:189,194`, `src/app/(app)/tasks/page.tsx:191`, `src/app/(app)/tasks/filters.tsx:79,91`, `branch:src/app/(app)/tasks/filters.tsx:87-115`, `branch:src/app/(app)/tasks/new/page.tsx:37,50`, `branch:src/app/(app)/tasks/[id]/fields.tsx:81,117-124`, `src/app/(app)/tasks/[id]/task-detail.tsx:188-193`, `src/app/(app)/tasks/new/page.tsx:56`, `src/app/(app)/tasks/page.tsx:189`, `branch:src/app/(app)/tasks/[id]/fields.tsx:117-130`, `branch:src/app/(app)/tasks/new/page.tsx:48-50`, `src/app/(app)/tasks/[id]/task-detail.tsx:188`, `src/app/(app)/tasks/page.tsx:190`
- **Also found as:** TASKS-013 (Tasks list, new task and task detail), IA-IV05 (Lens: information architecture and global SaaS patterns), MOBILE-I13 (Lens: phone and tablet experience on every route)
- **Verification:** verifier-found

### TASKS-030

**Search only matches titles, so you can't find a task by address, contractor or notes**

Low · New capability · effort S · `/tasks search` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. /tasks/all search still matches titles only, and its placeholder still says 'Filter by title…'. Global search also matches task titles only, and its query doesn't exclude Template rows. Notes, property and deal addresses, and contractor names can't be searched.
- **Today:** List search and global search match titles only. Tasks can already be found by property and contractor through the Property and owner filters. Text in notes is the part that can't be searched.
- **Why:** People remember a task by the house or the person ("the Zack job at 767"). Stripe and Jira search every visible field.
- **Change:** Match title, description, property address, deal address, assigneeName and user name (case-insensitive OR). Change the placeholder to "Search tasks", and bold the matched words in titles.
- **Desktop, tablet, phone:** Same at every size. On phone, search is the first control in the sticky bar.
- **Reuse:** TaskFilters, plus the Prisma where in tasks/page.tsx.
- **References:** 
  - [Jira Cloud](https://mobbin.com/screens/b037f71c-bf63-4d7d-9315-0eae630add1e): "Search work items" above the filter chips, searching across fields.
- **Code:** `src/app/(app)/tasks/page.tsx:85`, `src/app/(app)/tasks/filters.tsx:49-54`, `branch:src/lib/tasks/queries.ts:84`, `branch:src/app/(app)/tasks/filters.tsx:62-69`, `branch:src/app/api/search/route.ts:32-36`
- **Verification:** partly. Search matches titles only (page.tsx:85, and the global search route is title-only too). But the Property and owner filters already find tasks by house and contractor, so the only real gap is notes text. Low.

### TASKS-039

**The header counts never change with filters, and the property view repeats its own name**

Low · Design change · effort S · `/tasks page header` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The '193 open · 74 assigned to you' subtitle is gone, and Today shows a count on each section. On /tasks/all?property=cmtg25y4k0002jphsxww4tv6k the list still gets a card header reading '118 Congress St.', every row repeats '118 Congress St.' in its property slot, and the property select above says it too, so the address appears three times. All shows no result count except the 400-cap notice.
- **Why:** A number that doesn't match what's on screen is noise, and the copy rules say not to restate what the layout already shows.
- **Change:** Remove the scoped CardHeader (all/page.tsx:50-56). When a property filter is set, hide the property text on each row. Show a result count at the end of the filter row ('22 tasks').
- **Desktop, tablet, phone:** Desktop and tablet: counts in the segments. Phone: the count sits in the Filter sheet title, and segments show labels only.
- **Reuse:** PageHeader without a subtitle, and the SegmentedControl extraction.
- **References:** 
  - [Stripe](https://mobbin.com/screens/5aba8f78-028a-4ad6-81f1-6ca698a41451): Status tiles carry their counts (All 6, Succeeded 1), and the title has no subtitle.
- **Code:** `src/app/(app)/tasks/page.tsx:150-178`, `branch:src/app/(app)/tasks/all/page.tsx:36-66`, `branch:src/app/(app)/tasks/tasks-header.tsx:5-27`
- **Verification:** confirmed. Seen: "193 open · 74 assigned to you" on Done, on empty search results and in the 767 view, plus the repeated "767 Prospect Avenue" card header. Stripe status tiles with counts came back in my own search (https://mobbin.com/screens/f576b06e-b290-4864-a0be-2d753324fd1d).

### TASKS-045

**No swipe gestures on phone for the two most common actions, complete and reschedule**

Low · New capability · effort M · `/tasks and Today rows on phone` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. /tasks and /tasks/all at 375 and 320: phone rows are now two-line rows and the whole row is a link, but there are no row gestures. There are no touch or pointer handlers in tasks/ or components/. Completing takes the 44px checkbox, and rescheduling takes the date chip, which opens the approved touch Sheet.
- **Today:** No row gestures exist. On phone the rows currently show no titles at all, and swipe-right on a web row competes with Safari's back-swipe.
- **Why:** Phone task apps put the most common actions under the thumb without adding visible chrome. A swipe adds no clutter, and the approved quick-pick sheet already exists to receive it.
- **Change:** On touch only: swipe right on a row to complete it (green reveal, Undo toast), and swipe left to open the approved reschedule sheet (Today, Tomorrow, Next week, Pick date). Keep the gestures as shortcuts with the tap targets still there, and turn the motion off with reduced motion.
- **Desktop, tablet, phone:** Phone and tablet only. Desktop has no swipe and keeps hover and keyboard.
- **Reuse:** The approved reschedule sheet and Undo toast, plus React Aria's usePress and useMove for the gesture.
- **References:** 
  - [Things 3](https://mobbin.com/screens/6675a19f-4911-443c-b127-62965cd36d9a): The When sheet a reschedule swipe should open.
  - [Linear Mobile](https://mobbin.com/screens/c25eeb30-eb9c-421f-87b0-a0f14dfa259d): Visible action bar (Unread, Snooze, Delete) that duplicates gestures so nothing is swipe-only.
  - [Structured](https://mobbin.com/screens/dc6bace8-91e7-4ebc-8f7e-49c2e7ab38bf): Swipe right to mark complete and swipe up to reschedule, listed as gesture shortcuts.
- **Code:** `branch: docs/asana-migration-plan.md:27`, `branch src/app/(app)/tasks/task-row.tsx:70-160`, `branch src/components/due-date-picker.tsx:96-102`
- **Verification:** partly. Confirmed there are no gestures. Phone rows don't show titles at all today (TASKS-002), so gestures belong after the approved phone rows. Swipe-right on a web row also competes with Safari's edge back-swipe, so start the gesture away from the edge or use swipe-left only. The Structured reference is a native app.

### TASKS-I07

**Parse property, person and date out of the title as you type**

Low · New capability · effort L · `New task composer` · Create where you are

- **Migration branch:** Still applies on the migration branch. New task is still a stacked form: Title, Description, Assignee, a native mm/dd/yyyy Due date input, Status, Repeats and a Property select, with no parsing. Titles still carry the structure: 'Repair Drywall and Install Kitchen cabinets (Start July 13)', '58 Mariner Cabinet and trim install (Start Oct 22)', 'Finish Electric Start Nov 9', 'Melvin? Coordinate upper carriage house cleanout…'.
- **Today:** New task is a six-field form where date, person and property each need their own control. People type that structure into titles anyway: 10 open titles carry a start date in parentheses ('Repair Drywall and Install Kitchen cabinets (Start July 13)', '767 prospect Prime Paint (Mr. G's) (Start TBD)'), others name the assignee ('Melvin? Coordinate ...'), and 5 unlinked tasks name a property ('review 15 Oxford plumbing' shows a dash for Address).
- **Why:** Todoist's quick add recognizes dates, projects, labels and people as you type, highlights each token in the title and mirrors it as a removable chip, so one line captures what HG's form needs six fields for. Enter it once.
- **Change:** In the composer (TASKS-012), parse property numbers and street names ('767', 'Oxford'), names after '@', and dates ('fri', 'nov 3', 'start jul 13' as the Scheduled date). Highlight each token and mirror it as a chip; Backspace on a chip returns it to plain text. The same matcher suggests a property on existing unlinked tasks: 'Link 15 Oxford Ave.?'
- **Desktop, tablet, phone:** Desktop and tablet in the dialog; on phone the chip row docks above the keyboard and scrolls sideways.
- **Reuse:** Composer from TASKS-012; property and people lists already loaded in src/app/(app)/tasks/new/page.tsx; lib/dates.ts.
- **References:** 
  - [Todoist](https://mobbin.com/screens/a21695ab-7ffc-4c8f-a9d8-f58a2f3b82d8): '14 Feb' highlighted in the title and mirrored as a date chip.
  - [Todoist](https://mobbin.com/screens/da093dfa-c36e-4ced-99be-c71e2f1e6710): Several tokens (date, deadline, priority, label) each become a chip with an x.
  - [Todoist](https://mobbin.com/screens/1b8a0f00-20b8-43ff-af38-88f0e3e25e80): #project and /section tokens set the destination shown in the footer.
- **Code:** `Local DB (read-only): 10 open titles contain '(Start ...'; 5 unlinked open tasks name a property`, `branch-src/src/app/(app)/tasks/new/page.tsx:30-59`, `branch-src/src/app/(app)/tasks/new/new-task-fields.tsx:44-47`
- **Verification:** partly. Counts check out: 10 open titles contain '(Start'. The New task form has six controls including the free-text external assignee. But for two partners, 11 properties and 29 contractors, the approved chip pickers already cover capture. Title parsing adds L effort and misfires ('767' could just as easily be a dollar amount in a title). The cheap, valuable piece is suggesting a property on unlinked tasks ('Link 15 Oxford Ave.?'). That could stand alone at S effort. The finding also depends on a composer (TASKS-012) that isn't in this list.

### TASKS-I10

**When you assign a contractor, say who gets an email**

Low · Design change · effort S · `New task composer and task page Assignee` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The assignee picker lists Team and Contractors (name over trade) and says nothing about email. After assignment, the activity reads 'Pieter assigned Zack Reading · 1:17 PM' with no line saying an email went out, though the branch queues and sends task emails through NotificationOutbox. The New task form's Assignee is silent too.
- **Today:** Picking an assignee is a bare select on both New task and the task page; nothing says anyone will be told. Under D19 a contractor is emailed when assigned, and under D20 partners hear only when a contractor updates.
- **Why:** Basecamp states the consequence on the assignment itself ('Notify them about this assignment') and offers a When done, notify field, so the person assigning knows who will hear. HG's rules are automatic, which makes them invisible unless the screen says them.
- **Change:** When a contractor is picked, show one muted line under the field: 'Zack gets an email with the notes and address.' Staff assignees show nothing (D20). The timeline logs the send: 'Emailed Zack · 9:42am'. No checkbox, since D19 already decides it.
- **Desktop, tablet, phone:** Same line at all sizes; if it would wrap at 320, shorten to 'Zack gets an email.'
- **Reuse:** Approved assignee picker; NotificationOutbox rows feed the 'Emailed' timeline event (spec 5.4).
- **References:** 
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): Assigned to with 'Notify them about this assignment' and a When done notify field.
  - [Basecamp](https://mobbin.com/screens/56f50dc4-7b99-409c-9d84-4bd6795fb5f3): The notify line sits directly under Assign card in the add form.
- **Code:** `branch-src/src/components/assignee-picker.tsx`, `branch-src/src/lib/notifications/outbox.ts:13-30`
- **Verification:** partly. True that nothing says who is told, but nobody is emailed today; D19's emails aren't built. As a design input for the build it's sound and adds one conditional line. A stronger reference than the cited pair: Basecamp cf079850, 'What happens next? We'll send Jane a single email...', next to the save button. Logging 'Emailed Zack 9:42am' in the timeline closes the loop. Keep the line conditional (contractor only) as proposed.

### TASKS-I12

**One create button in the thumb spot on phones**

Low · Design change · effort S · `Tasks list and property Tasks tab on phone and tablet` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The problem is worse than on main, since the button now scrolls away. tasks-header.tsx:8-15.
- **Today:** Today was rebuilt without the inner scroll box. At 375 the whole page scrolls (4857px tall), so '+ New task', still a big blue button top right in the header, scrolls out of view after the first screen as well as out of thumb reach. There's no bottom bar yet, and the property Tasks card's '+ Task' is a small header button too.
- **Why:** Things 3 keeps one add button in the same bottom-right spot on every screen and creates in the current context; Jobber and Brex do the same with a floating create action above the tab bar. On a phone the common job is quick capture on site.
- **Change:** On tablet and phone, replace the header button with one round + pinned bottom right above the planned bottom bar (D10). It opens the composer sheet prefilled from the screen: a property tab sets the property, the Contractors column sets a contractor. Desktop keeps the header button.
- **Desktop, tablet, phone:** Desktop 1280: header button stays. Tablet 768 and phone 375: 56px floating button 16px from the edge, above the bottom bar, hidden while the keyboard is open.
- **Reuse:** Button primary from src/components/ui.tsx; composer sheet from TASKS-012.
- **References:** 
  - [Things 3](https://mobbin.com/screens/90c38f00-297f-4e9d-97d0-4961fbcc61c3): Blue + in the same bottom-right spot; tapping inserts a New To-Do in place.
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): Floating + above the tab bar on a job screen.
  - [Brex](https://mobbin.com/screens/e65a9422-cea1-4681-879d-3e449eb7e4af): Floating 'Add receipts' action above the two-tab bar on Tasks.
- **Code:** `src/app/(app)/tasks/page.tsx:150-157`, `branch-src/src/app/(app)/tasks/tasks-header.tsx:8-15`
- **Verification:** partly. The 'scrolls away' claim is mostly wrong: the list scrolls inside a 70vh box (Table maxHeight), so at 375 the page is only 755px tall and the header button stays nearly in view. The thumb-reach point stands. A floating + adds a layer over a list that will soon also have the D10 bottom bar. Consider a create action in that bar instead, which is less chrome than a FAB.

### TASKS-I15

**Show checklist progress as 3/14 after the title**

Low · Design change · effort S · `Tasks list rows` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Checklists shipped on the task page, but list rows still show only title, property, status, avatar and date. ListTask carries no checklist counts, so a 14-item job and a one-step errand look the same on Today and All.
- **Today:** Rows show only the title, owner and due date. Once checklists ship, a 14-item punch list and a one-step errand will look identical in the list.
- **Why:** Linear shows sub-issue progress '0/4' beside the title and Todoist shows '0/3' under it, so progress is visible without opening the record and without adding color.
- **Change:** After the title, show checklist progress as '3/14' in muted Geist Mono, only when a checklist exists. No bar, no color.
- **Desktop, tablet, phone:** Desktop and tablet inline after the title; phone on the second line after the property.
- **Reuse:** Shared TaskRow; font-mono token from src/app/layout.tsx.
- **References:** 
  - [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022): '0/4' progress beside an issue title in the list.
  - [Todoist](https://mobbin.com/screens/858c686b-66b3-4283-8f26-4a6f82b45b7b): '0/3' under a task title next to its date.
- **Code:** `branch-src/src/lib/tasks/list.ts:22-39 (ListTask has no checklist fields)`, `branch-src/src/app/(app)/tasks/[id]/checklist.tsx`
- **Verification:** confirmed. A quiet '3/14' in Geist Mono with no color fits the bar. Linear f00cc4fb shows the same '0/4' treatment. It depends on checklists shipping.

### TASKS-I19

**Turn 'Pieter to confirm' tasks into the Review step instead of checklist items**

Low · Design change · effort S · `Tasks list and the open-task importer` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The All tab (Open by default) still opens with 'Pieter to confirm 15 Oxford Punchlist', 'Pieter to confirm 118 Congress Upper dishwasher install', 'review 15 Oxford plumbing', 'Pieter to confirm Zach knocked everything out at 118 Congress', 'review 15 Oxford finish trim/shoe', 'Pieter to confirm sink works' and 'Pieter to confirm done'. Each is avatar PL with a red date from Apr 19, 2025 to Jun 4, 2025, and none has a property. The branch adds the Review status and a Needs review flow with Approve and Send back. Even so, the Asana importer still turns every subtask into a checklist item ('subtask, now a checklist item'), and nothing maps '<partner> to confirm' to Review.
- **Today:** Of 17 matching open titles, 8 are 'Pieter to confirm ...' (3 read only 'Pieter to confirm') and fit Review. 7 are 'review estimated cost to actual' budget steps and 2 are other confirmations. The 'Pieter to confirm' rows lead the default list with no property.
- **Why:** Ramp shows status and who acts next on every item, and Brex's timeline reads 'Pending review from ...'. These rows are the approved Review step (D6b), typed as text because Asana had no such state. Importing them as checklist items would duplicate Review.
- **Change:** In the open-task import, map an Asana subtask titled '<partner> to confirm ...' or 'review ...' to its parent's Review state with that partner as reviewer, instead of a checklist item. On the row, Review shows 'Pieter reviews' as the sublabel, so the title stays the job.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** Spec importer (5.5), TaskStatus REVIEW, TaskEvent STATUS.
- **Challenges:** Asana migration spec 5.5: 'Subtasks become checklist items.'
- **References:** 
  - [Brex](https://mobbin.com/screens/ecf850cc-08cc-46ef-b321-8248107afc9e): Status timeline names who acts next ('Pending review from ...').
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): 'Pending Review' state with Approve beside it.
- **Code:** `Local DB (read-only): 17 open titles contain 'to confirm', start with 'review', or similar`, `branch src/lib/asana/map.ts:964,1180`, `branch src/app/(app)/tasks/list-actions.ts:95`
- **Verification:** partly. The 17 count holds, but the mapping rule is too broad. Seven of the 17 are 'review estimated cost to actual' (a budget reconciliation step, not a review of someone's work), and '[428] confirm national fuel...' is tenant setup. Only the 8 'Pieter to confirm ...' rows fit D6b's Review. The local data has no parent field, so whether these were Asana subtasks of contractor jobs can't be checked here. The importer should map only '<partner> to confirm' rows whose parent is a contractor job. conflicts_with correctly names spec 5.5.

### TASKS-V02

**Row controls never say which task they act on**

Low · Fix · effort S · `/tasks rows (screen readers)` · Plain, consistent words

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The link and checkbox naming is fixed (task-row.tsx:77-90, task-checkbox.tsx:29). Only the date chip naming and the duplicate title remain.
- **Today:** /tasks/all aria tree: each row is now a link named by the title, a checkbox named by the title and one date button. The per-row property and assignee comboboxes are gone. All 236 date buttons are still named only 'Due date: Apr 19, 2025' and so on, without the task. The title is also announced twice, once as the sr-only link text and again as the visible paragraph.
- **Why:** VoiceOver users hear "Mark done, button" 193 times with no way to tell which task gets completed. That is risky next to a one-tap complete.
- **Change:** Name the chip after its task, e.g. aria-label 'Due date for Mud Drywall: Aug 28' (pass the title into DueDatePicker's label from task-row.tsx:151). Mark the visible title paragraph aria-hidden, since the row link already carries it (task-row.tsx:100).
- **Desktop, tablet, phone:** Not visible; the same at every size.
- **Reuse:** Add a label prop to TaskCheckbox in tasks/task-checkbox.tsx, which Today and the property task lists reuse.
- **Code:** `src/app/(app)/tasks/task-checkbox.tsx:10`, `src/app/(app)/tasks/task-row.tsx:123-145`, `branch src/app/(app)/tasks/task-row.tsx:77-100`, `branch src/app/(app)/tasks/task-row.tsx:147-154`, `branch src/components/due-date-picker.tsx:84`
- **Verification:** verifier-found

### TASKS-V03

**Overdue dates use a heavier weight to show state**

Low · Fix · effort S · `/tasks rows, Due column` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. The date chip uses pickerChip, which is font-medium for every date (ui.tsx:146). Overdue only adds red (due-date-picker.tsx:88), and computed font-weight is 500 on overdue chips like the others. One leftover: the calendar's today cell uses font-semibold plus primary color (due-date-picker.tsx:222), a smaller instance of weight carrying state. Removal not upheld: The row chip is fixed: pickerChip is font-medium for every date and overdue only adds red. A close variant remains in the same due-date control. With the picker open, the selected cell (Oct 16) and the today cell (Oct 23) compute to font-weight 600 and every other day to 400 (due-date-picker.tsx:221-222). So weight still carries date state, which breaks the 'never for state' house rule. The exact class from the original finding, overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted", also survives at properties/[id]/edit-loan.tsx:52 and edit-insurance.tsx:53. That one is latent: no property in the current data is past its maturity or renewal date. Narrowed fix: remove font-semibold from the selected and today calendar cells and let the fill and primary color carry them. Remove font-medium from those two overdue lines.
- **Today:** Overdue due cells get font-medium as well as red. Upcoming dates are regular weight, so the weight changes with the task's state.
- **Why:** House rule: use weight for hierarchy, never for state. Red already marks overdue, and the extra weight makes the whole column look bold when 95 rows are late.
- **Change:** Drop font-medium from the overdue class so red alone marks overdue. Keep regular weight for every date and set the column in tabular figures (see TASKS-001).
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** The class list in tasks/task-row.tsx.
- **References:** 
  - [Things 3](https://mobbin.com/screens/1507d4a6-adb5-46ee-9bc0-bc00b5a845bd): Red 'today' deadline flag uses the same weight as the neutral '4d left' flag; only color and the flag mark state.
- **Code:** `src/app/(app)/tasks/task-row.tsx:236-239`, `branch src/components/due-date-picker.tsx:85-90`, `branch src/components/ui.tsx:140-152`
- **Verification:** verifier-found

### TASKS-V05

**The only way back from a task is a 48x16 text link on phone**

Low · Design change · effort S · `/tasks/[id] back link on phone and tablet` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. /tasks/cmtg25yuf01zsjphs0xu5d2fl at 375 (and 768): '← Tasks' is still 12px text with no padding, measured at 48x16. It sits top-left on the same row as the Status chip and the 44px More button, so it is the only small target in that header.
- **Today:** "← Tasks" is 12px muted text with no padding. It measures 48x16 at 375. Apart from the hamburger it is the only way out of the task page, and it sits right above the Mark complete button.
- **Why:** A 16px-tall target is hard to hit with a thumb and sits next to a state-changing button. Linear Mobile puts a 44px back control at the top left of every detail screen.
- **Change:** Keep the label and size on desktop. On touch, give BackLink a 44px hit area through padding with a negative margin, so the layout doesn't move, and swap the text arrow for a lucide ChevronLeft. When the approved phone bottom bar ships, the same control sits in the top bar.
- **Desktop, tablet, phone:** Desktop 1280: unchanged 12px link. Tablet 768 and phone 375: the same label with a 44px-tall hit area and a chevron icon. Nothing visible grows except the padding.
- **Reuse:** components/back-link.tsx BackLink (used across the app), extended in place.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/f8e3aa03-00f2-4985-a6ae-1055ae0f4144): A round 44px back button at the top left of a detail screen, with chips for properties below.
  - [Linear Mobile](https://mobbin.com/screens/f03367b0-cbbe-497c-bfc5-4479a5ed4fd1): The issue detail keeps the back control large and separate from the actions.
- **Code:** `src/components/back-link.tsx:19-25`, `branch src/components/back-link.tsx:35-41`, `branch src/app/(app)/tasks/[id]/view.tsx:74-76`
- **Verification:** verifier-found
