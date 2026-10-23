# Repeats, playbooks and imported Asana history (D27, D28, D17, D24)

Part of the [UI/UX review](README.md). 34 findings: 0 critical, 1 high, 8 medium, 25 low.

## How it should work

Repeats, playbooks and imported history are three ways time shows up on a task. Each gets quiet chrome inside screens HG already has, and none adds a sidebar item.

Repeats live in the Due control. Things 3 sets the model (https://mobbin.com/screens/02300565-277c-46b2-8c25-3f32f25aece9): After done or On schedule, each explained in one sentence, a visible Next date and an Ends row for seasonal chores. On schedule is an addition to D27 for jobs that must happen even when a copy is left open. Month-based rules take a count, so every 6 months works, and Custom ends in a live summary like Jobber's 'Monthly on the 3rd Friday' (https://mobbin.com/screens/d5504349-93cc-48bb-9a22-1ea53c328c06). Mercury's review card (https://mobbin.com/screens/10c550ab-f499-4dbf-8bc2-d007a42c9e00) previews the next dates. In lists a repeat is a glyph after the date, as in Todoist (https://mobbin.com/screens/52758ad6-7145-46d7-826b-2469b17f2ee0). The property's Tasks tab lists its repeating chores with frequency and next date, like Stripe's subscriptions on a customer (https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786). Finishing one says where the next copy went, as Todoist's toast does (https://mobbin.com/screens/6f00ee53-76bf-447a-bdb2-7b4161d42d94).

Playbooks start from the property's one New task button. The sheet asks only for what the steps need and previews them as read-only rows grouped by timing, like Gusto's Before day 1 and On day 1 checklist (https://mobbin.com/screens/030224c2-2326-4e00-938c-d6d90b7a087d). [Tenant] is a tinted blank that fills as you type, the way Todoist tints parsed words (https://mobbin.com/screens/49e0c5ec-e1fe-4dd0-97b1-57c969da5122), and steps a contractor will see say so. A run sits on the property as one row with progress, like Linear's milestones (https://mobbin.com/screens/344cad59-d4a8-421a-9c2f-14b3c977e82d), and later steps fold away as Things 3 hides later items (https://mobbin.com/screens/32aaaf2f-9ad2-42c4-86fa-747852952730). New playbooks come from finished work through Basecamp's Make a template (https://mobbin.com/screens/7dff0143-4d11-4c0f-bc61-506ea1af5a7c), with dates counted from the anchor. The library sits in Settings beside Repeating tasks, as Linear keeps Templates and Recurring issues together (https://mobbin.com/screens/4eb70285-08a0-4648-94fe-7cc07f602a7f).

Imported history reads like a conversation. Comments carry the content. A burst of field edits becomes one line with Show all changes, as in Attio (https://mobbin.com/screens/070de66a-5dcc-4049-ae06-b0ff0babcdd4), and a flip reads as one sentence, like Linear's 'moved to Done, then back to In Progress' (https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338). Until Nov 1, Asana sync conflicts gather in one review list with the last sync time, after Linear's import status (https://mobbin.com/screens/13eef89b-e17e-4ee7-bde4-8d3afa7455d4) and Mercury's review queue (https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19). Each reads in addresses and dates and can be settled in one click.

<details><summary>What the reviewer covered</summary>

Live app on :3200 (production build, signed in as Connor), Chromium unless noted. Opened 68 playbook template rows through the search API ('NEW TENANT', 'MOVE OUT', '[Tenant]', 'Tenant', '[Address]', 'refi'). 'NEW TENANT' and 'MOVE OUT' return only real tasks, '[Tenant]' returns the template rows, and '[Address]' returns nothing. Screens captured: template row 'Setup [Tenant] group text' (/tasks/cmtg25yrl01imjphsje3rvjhl) at desktop 1280 and mobile 375 in light, plus a scrolled state and the ARIA tree. 'Get [Tenant] on Baselane' (/tasks/cmtg25yrk01igjphsj6kiis5p) at desktop and 320 in dark; I clicked Mark complete and the POST was blocked, which shows it is a live action. 'Before purchasing, check…' (/tasks/cmtg25yrw01kmjphsd7rgl5gm) in WebKit at tablet 768 and mobile 375; there an undated field renders today's date. /tasks/new?propertyId=428 Normal at desktop, tablet and mobile. 428 Normal property page at desktop and mobile, including its Tasks card full of hand-applied '[428]' steps. /tasks?q=[428] at desktop. All shots are in G1C/. I also ran read-only SQL against the local hg_capital_dev database (default_transaction_read_only on) to count template rows per playbook, find tokens in their notes, list 201 hand-applied bracketed titles and spot repeated chores. Code read: migration spec sections 3, 4, 5.2, 5.5, 6 and 7, docs/task-templates-plan.md, and on the branch src/lib/tasks/repeat.ts with its tests, core.ts (setStatus, createNextRepeat), service.ts, src/lib/asana/map.ts, the fixture snapshot.ts and prisma/schema.prisma (TaskEvent, TaskChecklistItem, TaskTemplate). In the current build: task-scope.ts, config.ts, tasks/service.ts patchTask, tasks/new and task-detail. Not reachable: the Repeats field, the Apply playbook flow, the task timeline and the checklist don't exist yet on :3200, and the branch has only core and import code with no UI and nothing running. Those designs come from code, fixtures and research. Mobbin: 15 searches (web and ios) covering recurrence pickers, recurring lists, template apply flows, task activity timelines, toasts and series cancel dialogs.

</details>

## Findings

### G1C-010

**Put Repeat inside the Due picker, with presets read from the chosen date and a preview of the next dates**

High · Design change · effort M · `Repeats field: task page rail and New task` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Plan §6 lists Repeats as its own rail row and its own screen ('Repeats field'), so moving it inside Due changes an approved design: question for Connor.
- **Today:** The branch ships Repeats as its own chip: a rail row on /tasks/[id] (fields.tsx:146-158) and a field on /tasks/new (new-task-fields.tsx:60-66). Its popover holds a 'How often' select (Never, Every N days, Every N weeks, Monthly, Quarterly, Yearly), a number field and Cancel/Save (repeat-picker.tsx:95-127). Nothing is preset from the due date and there's no preview of the next dates. On /tasks/new, the Due field beside it is still a native date input.
- **Why:** A repeat is defined by its date: 'monthly on the 5th' comes from the 5th. A separate control makes people set the date twice and allows a repeat with no date (see G1C-016). Todoist, Mercury and the phone pickers all put repeat beside the date.
- **Change:** Keep the separate Repeats chip that was approved, but replace the select with presets read from the due date: Every week on Thu, Every month on the 5th, Every 3 months on the 5th, Every year on Nov 5, Custom. Add the muted line 'Next: Dec 5, Jan 5, Feb 5'. On New task, use DueDatePicker so the presets have a date to read.
- **Desktop, tablet, phone:** Desktop 1280: popover anchored to Due, sized to content (about 300px). Tablet 768: the same popover with 44px rows. Phone 375: bottom sheet. Presets are 44px radio rows with the derived hint muted on the right; Custom opens a second sheet and the 'Next' preview stays. At 320 the hints wrap under the label.
- **Reuse:** React Aria popover, sheet and date picker (D9); the quick-pick reschedule popover from spec smaller screen 3; describeRepeat in repeat.ts.
- **Challenges:** Spec section 6 Task page rail lists Repeats as its own row, and smaller screen 6 'Repeats field' (D31). Recommend folding the control into Due and keeping only a read line in the rail.
- **References:** 
  - [Todoist](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c): Repeat presets derived from the selected date, inside the date picker
  - [Linear](https://mobbin.com/screens/ef9e1029-1437-4774-a7cf-ca3d2a657f83): Custom cadence as an inline sentence: Every 2 weeks on Friday
  - [Mercury](https://mobbin.com/screens/af150af2-c997-47f6-9d44-aa1069872d4f): Repeat select under the date with the next three dates previewed
  - [Me+](https://mobbin.com/screens/35bc0e9c-aeca-4482-b8f8-8a78dcf2afd5): Phone repeat sheet with derived hints 'Weekly (Monday)', 'Monthly (On 16th)'
  - [Uber Eats](https://mobbin.com/screens/a06d95ad-51b5-48b9-8edb-5543bf250621): Frequency sheet labels read from the first date
  - [bunq](https://mobbin.com/screens/e382afe1-3865-4803-93b4-ee84bd0c379c): Quarterly and Yearly presets plus a separate Custom row
  - [Todoist](https://mobbin.com/screens/6c83da1c-f6be-4326-b0d7-2ddcfa14ae5b): Date popover: quick picks with weekdays, month grid, Repeat at the bottom.
  - [Todoist](https://mobbin.com/screens/11b9d667-53e6-4af4-abd8-d8c726a6b29a): On phone, Repeat is a row at the bottom of the date sheet.
  - [Todoist](https://mobbin.com/screens/80ba3eca-3103-46ee-b086-4d133ee83282): Presets built from the date: Every week on Thu, Every month on the 12th, Custom.
  - [Linear](https://mobbin.com/screens/754d9f92-fccb-4b14-b53e-190d460e0118): Cadence chosen from a plain list (Every week, Every 2 weeks...).
- **Code:** `branch: docs/asana-migration-plan.md:403`, `branch: src/lib/tasks/repeat.ts:10-15`, `branch: src/components/repeat-picker.tsx:95-127`, `branch: src/app/(app)/tasks/[id]/fields.tsx:146-158`, `branch: src/app/(app)/tasks/new/new-task-fields.tsx:44-66`, `branch: docs/asana-migration-plan.md:403,432`, `src/app/(app)/tasks/[id]/page.tsx:63-77`, `branch-src/src/app/(app)/tasks/[id]/fields.tsx:81-171`, `branch: src/components/repeat-picker.tsx:67-129`, `branch: src/lib/tasks/repeat-choice.ts:19-26`
- **Also found as:** TASKS-I11 (Tasks list, new task and task detail), BTASKS-022 (Branch: Today, All tasks, new task and the task page), BPLAY-018 (Branch: playbooks, templates and repeats)
- **Verification:** confirmed. I saw /tasks/new: a bare date input beside Assignee. Folding Repeat into the Due control removes a rail row and the repeat-without-a-date case. conflicts_with names the spec rail and D31 correctly. A Mobbin spot check backs it. Todoist https://mobbin.com/screens/80ba3eca-3103-46ee-b086-4d133ee83282 offers presets read from the chosen date (Every week on Thu, Every month on the 12th, Every year on Feb 12, Custom) inside the date sheet. Mercury https://mobbin.com/screens/af150af2-c997-47f6-9d44-aa1069872d4f puts Repeat under 'Start on' and lists the next dates.

### G1C-004

**Require the tenant's name and never leave brackets in created titles**

Medium · Design change · effort S · `Apply playbook sheet (planned): Tenant name field` · Home and Today become one work queue

- **Today:** 201 non-template titles carry brackets, and 54 of them read a literal [Tenant] or [tenant]. All 54 are DONE rows from duplicating tasks in Asana by hand. Most of the others kept the brackets around a typed value ('[philo]', '[428]', '[lillian]'), which is how people edited duplicated Asana titles. That isn't evidence of a skipped form field. Only 8 bracketed tasks are open.
- **Why:** The data shows people skip the token or stuff the address into it when nothing stops them. The address got typed in because there was no property field.
- **Change:** When any step uses the tenant token, Tenant name is required and 'Add 10 tasks' stays disabled until it's filled. On an attempt, one line appears under the field: 'Add the tenant's name'. Substitute without brackets and keep the casing as typed. Optional email and phone, when blank, drop their line from the note instead of leaving a token. The address always comes from the property.
- **Desktop, tablet, phone:** Same at all sizes. On phone the field is first in the sheet with autofocus and the keyboard opens immediately.
- **Reuse:** Input and Field layout in src/components/ui.tsx; the form-field helper wrapper listed under Known gaps in docs/components.md.
- **References:** 
  - [WRITER](https://mobbin.com/screens/90363e8d-d9ab-466d-8953-abd6a2c11920): Required variables marked with an asterisk before the agent can run
  - [Bonsai](https://mobbin.com/screens/7c03e48c-6b29-41fe-96ba-02cd91b51357): Applying a template asks only for the essentials before one create button
- **Code:** `docs/task-templates-plan.md:279`, `DB (read-only): 201 non-template titles contain brackets; token values: Tenant 52, tenant 2, philo 18, Abbey 11, 428 10, ZeChen 767 Prospect 7`
- **Verification:** partly. Requiring the name and dropping the brackets is right. It is a validation detail of the G1C-006 sheet and G1C-003's fields, and with those fields visible people are unlikely to skip it, so medium. The references are plausible.

### G1C-011

**Define how two years of imported Asana events collapse, so comments stay readable**

Medium · Design change · effort M · `Task page activity for imported tasks (planned), 1280 and 375` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The branch database has no imported events on the sample tasks ('No activity yet'), so this was judged from code.
- **Today:** The branch's Activity folds back-to-back DUE events into 'Due moved N× · now Thu, Oct 30' (activity.ts:180-216): rule 1, minus the from date. The page shows the latest 15 entries and folds the rest behind 'Show N earlier updates' (activity.tsx:39-43), counting entries rather than runs of system lines between comments. Days get separators. Not done: every NOTES event renders 'X edited the notes' (activity.ts:152-153). Complete-then-reopen shows as two status lines. Asana section moves read 'moved this to {section}', with no 'No property' mapping for Untitled or Unfiled (activity.ts:112-121).
- **Why:** Without explicit rules an old task opens on a wall of 'changed the due date' lines and buries the two comments that matter. The deal timeline already shows this problem (JOURNEYS-027).
- **Change:** Keep the rules already built. Add: hide NOTES events with no diff; 'Marked done, then reopened'; Untitled or Unfiled shown as 'No property'; and the from date on the due run ('Due moved 4 times · Mar 2 to Oct 26').
- **Desktop, tablet, phone:** Same rules at every size. Desktop and tablet: system lines are single 13px muted rows with an expand chevron. Phone: system lines truncate to one line without wrapping; comments are full width with a 32px avatar.
- **Reuse:** components/activity-timeline.tsx, the deal timeline extracted per spec section 7.
- **References:** 
  - [Attio](https://mobbin.com/screens/070de66a-5dcc-4049-ae06-b0ff0babcdd4): 'Alex Smith changed Stage and 7 other attributes' as one line with 'Show all changes'.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Expanded state lists each field as from → to under the one line, then 'Hide all changes'.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): A reversal reads as one sentence: 'moved to Done, then back to In Progress'.
  - [Asana](https://mobbin.com/screens/944b765d-9d31-48fa-bff2-031b6b15c419): 'Show 8 previous updates' folds system stories between comments
  - [Asana](https://mobbin.com/screens/85d7a375-807a-4efa-a54d-b6b3b326a8f2): Phone: 'Show previous updates' with system lines in small muted type
  - [Linear](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270): System events as one muted line, comments as cards
  - [Deputy](https://mobbin.com/screens/fd1a02ca-3bc4-47eb-bd05-a63926f531a3): Expanded change rows show field, old value and new value
- **Code:** `branch: src/lib/asana/map.ts:605-616`, `branch: src/lib/asana/map.ts:722`, `branch: src/lib/asana/__fixtures__/snapshot.ts:327-335`, `branch: docs/asana-migration-plan.md:402`, `branch: src/lib/tasks/activity.ts:112-121,152-153,180-216`, `branch: src/app/(app)/tasks/[id]/activity.tsx:39-43`
- **Verification:** partly. The rules are sensible, and the Asana and Linear references fit. What's left is a small rules list for the activity-timeline component, so medium.

### G1C-012

**Mask lockbox codes in imported comments for contractors, and flag them for staff**

Medium · Design change · effort S · `Imported comments and notes on contractor jobs (task page and portal job page)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. maskLockbox and findLockboxMentions are used only by the import report (asana/report.ts:123-135; map.ts:1464,1585). The portal's getJob returns notes and updates unmasked (portal/queries.ts:229-275). The staff task page has no 'Has a lockbox code' line under a comment.
- **Today:** The only lockbox text cited is synthetic fixture data (snapshot.ts:320); the real count isn't known until the dry run. The importer already lists every match per task in the import report, with digits masked, for Connor's Monday review (map.ts:1462-1464). D17 rests on contractors having already seen these comments in Asana.
- **Why:** The lockbox card was designed to control exactly this exposure. A two-year-old comment shouldn't quietly undo it.
- **Change:** For contractor viewers, mask digit runs matching LOCKBOX_PATTERNS in imported comments and notes ('Lock box code is ••••'). On an open job, add a link to the lockbox card. Staff see the full text plus one muted line under that comment: 'Has a lockbox code · Make internal'. The import report remains the Monday checklist.
- **Desktop, tablet, phone:** Same at all sizes. On phone the masked code is a tappable chip that scrolls to the lockbox card; the staff flag sits under the comment and never wraps.
- **Reuse:** LOCKBOX_PATTERNS and maskLockbox in src/lib/asana/map.ts (already written for the report); the Shared/Internal visibility on TaskEvent.
- **Challenges:** D17 (all imported comments visible to the assigned contractor) and D21 (codes shown only on open jobs, hidden once done, every view logged). Recommend masking the digits rather than hiding the comment.
- **References:** 
  - [Front](https://mobbin.com/screens/70704201-4645-4520-b6e4-3b8cb29f755d): A quiet label on a message that says who can see it
  - [Base44](https://mobbin.com/screens/138fb000-3515-45e6-afa8-8bca1c231ae2): Small inline label beside the author instead of a banner
- **Code:** `branch: src/lib/asana/__fixtures__/snapshot.ts:320`, `branch: src/lib/asana/map.ts:509-530`, `branch: docs/asana-migration-plan.md:78-82`, `branch: src/lib/asana/map.ts:508-530`, `branch: src/lib/asana/report.ts:123-135`, `branch: src/lib/portal/queries.ts:229-275`
- **Verification:** partly. Masking codes for contractor viewers is a cheap extra safeguard, and conflicts_with names D17 and D21 properly. Medium, because the dry-run report already works as a control. The patterns can catch house numbers ('lockbox at 767 Prospect'), so mask only digit runs right after a code or lockbox word. The Front and Base44 references are weak; they are generic labels.

### G1C-013

**On iPhone and iPad, an undated task shows today's date in its Due field**

Medium · Fix · effort S · `/tasks/[id] Due date on iPhone and iPad Safari (WebKit)` · Fix wrong numbers and records first

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Fixed on the task page, which now uses the DueDatePicker chip (see G1B-019). But in WebKit, /tasks/new still has a native Due date input that paints '10 / 23 / 2026' at 1280 and 375 while its value is '' (eval). It's now in muted gray, so it reads as a default of today. Native date inputs also remain in New task's Visit date (new-task-fields.tsx:77), the property edit forms (edit-details.tsx:100,102,124; edit-insurance.tsx:96; edit-loan.tsx:100-101; edit-listings.tsx:342) and the public move-in form (move-in-form.tsx:150).
- **Why:** Every undated task looks due today on the devices the partners carry on site, and imported history is mostly undated.
- **Change:** On /tasks/new, use DueDatePicker for Due and Visit date (new-task-fields.tsx:46,77) and post through hidden inputs, as Assignee and Repeats already do. For the property and move-in forms, where quick picks don't fit (purchase or inspection dates), use a React Aria DateField or DatePicker, which shows empty mm/dd/yyyy segments the same way in every engine.
- **Desktop, tablet, phone:** Desktop: button opens a popover. Tablet: the same popover with 44px rows. Phone: a bottom sheet. 'No date' stays muted gray at every size.
- **Reuse:** The reschedule popover with quick picks (spec smaller screen 3, React Aria date picker per D9).
- **References:** 
  - [Todoist](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c): 'No Date' is an explicit choice in the picker, not a blank field
- **Code:** `Eval on WebKit 375: input[type=date] value '' while the screenshot shows 10/22/2026`, `src/app/(app)/tasks/[id]/task-detail.tsx:161-165`, `branch: src/app/(app)/tasks/new/new-task-fields.tsx:46,77`, `branch: src/app/(app)/tasks/[id]/fields.tsx:89-100`
- **Verification:** partly. The bug is real on Mac Safari, so keep it at medium. The fix it proposes (a 'No date' button that opens the D7 quick-pick popover built with D9 React Aria) is already the approved direction and is the same control as G1C-010. Evidence: verify-G1C/tpl-spatialest-wk--desktop-light-webkit.png. The device check's assumption that WebKit stands in for iPhone misled this finding.

### G1C-032

**Turn Asana @mentions into names; plain text carries them as profile links**

Medium · Fix · effort S · `Imported comments with @mentions` · Home and Today become one work queue

- **Today:** map.ts keeps each comment's HTML only in data and uses the plain text as the body (map.ts:667-675). It has no handling for mentions, and the fixture has none to test. In Asana's plain-text story field a mention comes through as the person's profile link, not '@Pieter'.
- **Why:** 'https://app.asana.com/0/profile/… can you call the plumber' is noise where a name was the point.
- **Change:** At import, read data-asana-gid user anchors from html_text, map them through people to names, store '@Pieter Louw' in the body, and render it as a name chip. Add a fixture comment with a mention and a test.
- **Desktop, tablet, phone:** Name chip wraps inline at all sizes.
- **Reuse:** matchPeople and who() in src/lib/asana/map.ts.
- **References:** 
  - [Asana](https://mobbin.com/screens/d0231fb5-6f10-485a-91d3-3e4042487e4c): Mention rendered as a chip at the start of the comment
- **Code:** `branch: src/lib/asana/map.ts:667-675`
- **Verification:** confirmed. Confirmed in the code: the comment body is the story's plain text, and html_text is kept only in data (map.ts:667-675). There's no mention handling, and the fixture has no mention to test it. Comments are the core of imported history, so names matter. The Asana reference is plausible.

### G1C-034

**Show imported subtasks as an indented checklist with their notes and context, not flattened**

Medium · Design change · effort M · `Task page checklist for imported subtasks` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The context part is done. Depth and meta are not.
- **Today:** Comments that came from subtasks now show a context line, 'On checklist item: <title>'. The importer still flattens subtasks with no depth. The /tasks/[id] checklist renders a flat list of title rows: the page selects only id, title and done, so the stored assigneeLabel and dueDate are never shown. There's no note glyph or expand.
- **Why:** The checklist loses its shape, and a subtask's note ('Bag the debris; the dumpster is gone.') ends up far from the item it explains.
- **Change:** Keep the context line, and link it to the item. Store depth (0 or 1) in the import and indent one level. Select assigneeLabel and dueDate, and show them as muted meta on the right of the row ('Ivy · Oct 26'). Subtask notes can stay in the timeline, since the context line now ties them to the item.
- **Desktop, tablet, phone:** Desktop and tablet: meta right-aligned on the row. Phone: meta moves under the title in 13px muted text; indentation is 16px.
- **Reuse:** TaskChecklistItem; TaskCheckbox (44px hit area per spec section 7).
- **References:** 
  - [Linear](https://mobbin.com/screens/d0f8ebba-34b7-469c-a708-1069e55a3e02): Sub-items with assignee and meta on the right
  - [Linear Mobile](https://mobbin.com/screens/4d807c4c-b0a5-4e87-86bd-154fb51d3f32): Phone checklist directly under the notes
- **Code:** `branch: src/lib/asana/map.ts:1293-1310`, `branch: src/lib/asana/map.ts:1366`, `branch: src/lib/asana/__fixtures__/snapshot.ts:322-331`, `branch: src/app/(app)/tasks/[id]/activity.tsx:97`, `branch: src/app/(app)/tasks/[id]/page.tsx:48`, `branch: src/app/(app)/tasks/[id]/checklist.tsx:46-63`, `branch: src/lib/asana/map.ts:1292-1310`
- **Verification:** confirmed. Confirmed in the code: descendants() flattens the subtask tree with no depth (map.ts:1293-1310), and subtask notes become comments on the parent marked fromChecklistItem (map.ts:1360-1366). I checked Linear https://mobbin.com/screens/d0f8ebba-34b7-469c-a708-1069e55a3e02: sub-issues with meta on the right and a 0/4 count. One level of indent is the right limit.

### G1C-I01

**Let monthly, quarterly and yearly repeats take a count, so every 6 months can be set**

Medium · Fix · effort S · `Repeats editor on the task page and New task (src/components/repeat-picker.tsx)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Unchanged at 4652abb. On task cmtg25z7s048mjphsikewzpy1, the Repeats chip opens a popover on desktop and a sheet on phone. The How often select lists Never, Every N days, Every N weeks, Monthly, Quarterly and Yearly. Monthly shows only 'On day [19] of the month'; Quarterly and Yearly show no field. Switching mode resets every to 1 (repeat-picker.tsx:108). ruleFromChoice already stores any interval for monthly, quarterly and yearly (repeat-choice.ts:39-52).
- **Today:** On the migration branch (:3300), the Repeats editor offers Never, Every N days, Every N weeks, Monthly, Quarterly and Yearly. Only days and weeks get a number field. Monthly asks only 'On day N of the month', and Quarterly and Yearly ask nothing; switching mode resets the count to 1. The stored rule already accepts any interval and describeRepeat prints 'Every 2 years', so the gap is only in the editor. Seen on task cmtg25z7s048mjphsikewzpy1 at desktop (popover) and phone (sheet).
- **Why:** Twice a year is one of the most common property cadences: detector batteries, furnace and A/C service, gutters, exterior walks. The closest settings today are Every 26 weeks, which drifts a day or two off each year, or Quarterly, which doubles the work. Connor's Monday recurring list (D27) will hit this on day one.
- **Change:** Give the month-based modes the same count field Jobber shows above its day choice, so the rule reads 'Every [6] months on the [15th]', and include 'Every 6 months' among the presets from G1C-010. Respect the caps from G1C-039 (for example 1 to 24 months, 1 to 10 years).
- **Desktop, tablet, phone:** Desktop popover and tablet or phone sheet: one inline number inside the sentence, 16px input on touch. Nothing drops on phone.
- **Reuse:** Extend RepeatPanel in src/components/repeat-picker.tsx and ruleFromChoice in src/lib/tasks/repeat-choice.ts; no schema change.
- **References:** 
  - [Jobber](https://mobbin.com/screens/d5504349-93cc-48bb-9a22-1ea53c328c06): 'Every [1] month(s)' number field sits above the day choice, with a summary line under it.
  - [Things 3](https://mobbin.com/screens/29d00270-766c-4d94-b0ad-239d8e40e89d): One control pairs a count with day, week, month or year.
- **Code:** `task-management-migration-4c9ddf/src/components/repeat-picker.tsx:104-118`, `task-management-migration-4c9ddf/src/lib/tasks/repeat-choice.ts:19-26`, `task-management-migration-4c9ddf/src/lib/tasks/repeat.ts:10-16,64-77`, `4652abb:src/components/repeat-picker.tsx:104-118`, `4652abb:src/lib/tasks/repeat-choice.ts:19-26,39-52`, `shoot.mjs eval: Yearly mode -> 'no fields'`
- **Verification:** confirmed. Reproduced on :3300 for task cmtg25z7s048mjphsikewzpy1. The select offers Never, Every N days, Every N weeks, Monthly, Quarterly and Yearly. Monthly shows only 'On day 19 of the month' in both the desktop popover and the phone sheet (verify-G1C/task-repeat--monthly--desktop-light.png and --mobile-light.png; repeat-picker.tsx:104-118). Both references check out: Jobber d5504349 has 'Every [1] month(s)' with a summary line ('Monthly on the 3rd Friday'), and Things 3 29d00270 pairs a count with day, week, month or year. Two corrections. First, kind should be design or capability, not fix: this changes the form, not buggy data. Second, D27 approved exactly 'every N days or weeks, monthly on a day, quarterly, or yearly', so this is an extension of D27 and conflicts_with should name it. A Things-style count plus unit would also remove the literal 'N' in the option labels ('Every N days'). Todoist's preset menu (54032487: 'Every month on the 20th', 'Every year on February 20th', 'Custom...') is a lighter alternative worth showing Connor.

### G1C-I03

**Write conflict lines with addresses, dates and Done, not record IDs and raw values**

Medium · Fix · effort S · `Task page Activity, Internal sync-conflict lines` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. describeConflict still runs at import and stores the sentence as the event body (map.ts:460-480). Place values print propertyId or the bucket, strings print quoted, and booleans go through JSON.stringify. activity.ts:175 still adds 'Asana sync conflict:' in front. ActivityNames already carries a properties map (activity.ts:28-32), so eventLine can name the address. The branch DB has no CONFLICT events, so this was checked in code only.
- **Today:** describeConflict (src/lib/asana/map.ts:461-480) writes the sentence at import time and stores it as the event body. A property conflict prints the property's database ID ('Asana changed the property to cmtg25y4k0002jphsxww4tv6k; the app had changed it to ..., which was kept.'), dates print as quoted ISO strings ('"2026-10-30"'), and a status conflict prints true or false. activity.ts:175 then adds 'Asana sync conflict:' in front, so each line says Asana twice.
- **Why:** Connor reviews these daily for the dual-run week, and a line he can't read without the database isn't reviewable. House copy rules: plain and specific, and internals stay out of the UI.
- **Change:** Store the field and both values in the event's data and build the sentence in eventLine with the names map the page already passes and fmtShortDay. Examples: 'Asana moved this to 118 Congress St. The app kept 58 Mariner Street.' / 'Asana set the due date to Thu, Oct 30. The app kept Mon, Nov 2.' / 'Asana marked this done. The app kept it open.' Drop the prefix and keep the Internal lock. Keep describeConflict for the console report.
- **Desktop, tablet, phone:** One muted activity line at every width; wraps as text on phone.
- **Reuse:** eventLine and ActivityNames in src/lib/tasks/activity.ts, fmtShortDay, the names map built in tasks/[id]/page.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/83e191aa-091f-4354-91bb-45787672895d): A rule card states exactly what will change in plain words ('will rename Google Workspace as Google Workspace US') before Discard and Save.
- **Code:** `task-management-migration-4c9ddf/src/lib/asana/map.ts:123-126,461-480`, `task-management-migration-4c9ddf/src/lib/tasks/activity.ts:174-175`, `task-management-migration-4c9ddf/src/lib/asana/import.ts:151-155`, `4652abb:src/lib/asana/map.ts:460-480`, `4652abb:src/lib/tasks/activity.ts:28-32,174-175`, `4652abb:src/lib/asana/import.ts:152-157`
- **Verification:** confirmed. Confirmed in code (map.ts:461-480, activity.ts:175), and it's worse than described. show() only handles objects that have 'name' or 'bucket'. An assignee value of {userId} or {contactId} (AssigneeValue, map.ts:316) therefore prints raw JSON such as {"contactId":"cm..."}. Part of the recommendation is already done: import.ts:156 stores field, app, asana and base in the event's data. Only eventLine needs to build the sentence from data with the names map and fmtShortDay, which makes this a solid S. The events stay in task history after cutover, so this matters beyond the dual-run week. I couldn't reproduce Mercury 83e191aa; it's plausible but a weak fit, since a fix like this doesn't need one.

### G1C-002

**Playbook template rows open as live tasks that one tap can complete or move**

Low · Fix · effort S · `/tasks/[id] for the 68 playbook template rows (e.g. 'Setup [Tenant] group text')` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. On :3300, /api/search?q=[Tenant] returns 6 Template rows (for example 'Get [Tenant] on Baselane'), because the task query has no excludeTemplateTasks (api/search/route.ts:32-36). /tasks/cmtg25yrk01igjphsj6kiis5p opens as a live task with a status chip, Due, Property, Repeats, checklist and composer. patchTask and setStatus have no bucket check (core.ts:299-450). The branch's Apply flow reads TaskTemplate rows (templates/[id]), so these rows feed nothing.
- **Today:** The 68 Template rows are hidden from /tasks and Home (excludeTemplateTasks), but they leak through the header search: src/app/api/search/route.ts:32 has no bucket filter. Typing '[Tenant]' lists template rows, and they open as ordinary editable tasks. The Apply flow is built from the Asana snapshot's playbook sections (src/lib/asana/map.ts:1538-1563), not from these app rows. The load deletes these rows by their Asana section as 'playbook placeholder' (map.ts:1163) whatever their bucket is, so a stray edit can't reach the playbooks or survive cutover.
- **Why:** Until the Oct 27 load, these rows are the only copy of the playbooks in the app. One stray tap silently edits the source the Apply flow will be built from.
- **Change:** Server: refuse status, property and due changes on bucket Template rows in patchTask and the status actions. Page: when bucket is Template, render read-only, with one muted line under the title, 'Step in the New tenant playbook', and no Mark complete or pickers. Remove the guard after the D25 delete clears these rows.
- **Desktop, tablet, phone:** Same one-line notice at 1280, 768 and 375, under the title. On phone it replaces the field card entirely.
- **Reuse:** src/lib/tasks/service.ts patchTask; TEMPLATE_BUCKET in src/lib/config.ts; src/app/(app)/tasks/[id]/task-detail.tsx.
- **Code:** `src/lib/tasks/service.ts:120-123`, `Shot run: Mark complete on /tasks/cmtg25yrk01igjphsj6kiis5p produced blockedWrites POST /tasks/cmtg25yrk01igjphsj6kiis5p`, `DB (read-only): Template rows per playbook: Move out 6 (1 done), New property 40 (1 done), Refi 12 (3 done), New tenant 10`, `branch: src/app/api/search/route.ts:32-36`, `branch: src/lib/task-scope.ts:9-10`, `branch: docs/asana-migration-plan.md:239`
- **Verification:** partly. The fix is one line: spread excludeTemplateTasks into the task query in src/app/api/search/route.ts. The approved spec already requires this (taskScope in /api/search with a test, asana-migration-plan.md:239). Building a server guard and a read-only template page for rows the Oct 27 load deletes is work with a four-day life. Evidence: verify-G1C/tasks-q-tenant--global-search--desktop-light.png. In that shot, the header search for '[Tenant]' lists 5 template rows next to 1 done task, and nothing tells them apart.

### G1C-019

**Show a repeating chore's track record: 6 done, last Oct 5 by Zack**

Low · New capability · effort M · `Task page rail and activity for a repeating task` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The activity half is partly built. The track record isn't started.
- **Today:** Activity now renders REPEAT_CREATED as 'Next repeat created, due Thu, Dec 5', linked to the new copy. CREATED with repeatOf renders 'Created as the next repeat' with no link back to the previous copy. The rail shows only the rule chip: no count, no last-done date or person, no list of past copies.
- **Why:** Property maintenance is mostly repeat work; its history is the record that matters for insurance, inspections and contractor follow-up.
- **Change:** Link the CREATED repeatOf line to the previous copy ('Repeats from Oct 5'). Under the Repeats chip, add '6 done · last Oct 5 by Zack' from tasks sharing the repeatSeriesId, opening a popover of past copies. The REPEAT_CREATED line can stay as it is.
- **Desktop, tablet, phone:** Desktop and tablet: popover from the rail line. Phone: the line sits in the chips row's sheet and the list opens as a sheet.
- **Reuse:** repeatSeriesId index on Task; activity-timeline component.
- **References:** 
  - [Copilot](https://mobbin.com/screens/b8ee0b14-088d-407e-88ee-627b31d1bd7e): A recurring item shows a dot per past occurrence with a dashed next one, 'Expected around Sep 3rd', then the list of past instances.
  - [Jobber](https://mobbin.com/screens/c45b60a9-acac-4ecc-b6ed-0539637d2e39): The job page lists its Visits with date and who did each one.
  - [Discord](https://mobbin.com/screens/d48fbeb4-d86d-45bc-b11d-3104f25b7324): 'Events in series' list inside the event
  - [Asana](https://mobbin.com/flows/3dbc8556-acc2-4691-b49d-fec048232833): Usage tab lists everything created from the same source
- **Code:** `branch: src/lib/tasks/core.ts:396-397`, `branch: src/lib/tasks/activity.ts:129-130`, `branch: src/lib/tasks/activity.ts:166-172`, `branch: src/app/(app)/tasks/[id]/fields.tsx:146-158`
- **Verification:** partly. The events are described accurately. But D24 imports open tasks only and D25 deletes the roughly 1,900 completed ones, so every series' track record starts empty at cutover and grows by one per cycle. Rendering REPEAT_CREATED and repeatOf CREATED events as linked lines in the activity gives most of the value with no extra chrome. The rail line can wait until series have some history. Low.

### G1C-026

**Keep playbook steps that were ticked in Asana; the importer drops five of them**

Low · Fix · effort S · `Asana import: playbook sections to templates` · Home and Today become one work queue

- **Today:** At least two of the five done steps look retired, not ticked by mistake. In Move out, the done 'Paint [tenant] unit' sits beside the open 'Clean & Paint [tenant] unit'. In Refi, the done 'Transfer payment for national electric' sits beside the open 'Transfer payment for national grid', and National Grid is the electric utility. The importer already returns the skipped titles in TemplatePlan.skippedCompleted for the dry run.
- **Why:** The playbooks would silently lose real steps like the dumpster and utility transfers.
- **Change:** Include completed steps in the template by default. List them in the dry run as 'Included although ticked in Asana' so Connor can drop any on Monday.
- **Desktop, tablet, phone:** Import logic and report only.
- **Reuse:** buildPlan playbook block in src/lib/asana/map.ts; report output.
- **Code:** `branch: src/lib/asana/map.ts:1546-1549`, `DB (read-only): Template rows with status DONE: 1 Move out, 1 New property, 3 Refi`
- **Verification:** partly. Including ticked steps by default would put superseded duplicates into the playbooks. Keep the default and make sure the dry run prints skippedCompleted, so Connor can add back 'Coordinate dumpster' and the water-bill step. Low.

### G1C-029

**Mark imported history with one 'Imported from Asana' divider, not a badge on every line**

Low · Design change · effort S · `Task page activity for imported tasks` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The /tasks/[id] page doesn't select TaskEvent.source, and TaskActivity renders no divider or marker for imported history. Imported events would read like app events under day headings. The only Asana mark is the legacy line 'Assigned in Asana to <name>' over the notes, shown when no real assignee is set.
- **Today:** TaskEvent carries source 'asana' (schema TaskEvent.source), and the brief asks to mark 'From Asana'. A per-event badge would repeat on hundreds of lines.
- **Why:** Repeated badges are chrome that says nothing new after the first one.
- **Change:** One divider between the last imported event and the first app event: 'Imported from Asana · Oct 27'. Nothing on individual lines. Comments keep their original Asana dates.
- **Desktop, tablet, phone:** Full-width hairline with centered 12px muted label at every size.
- **Reuse:** activity-timeline component.
- **References:** 
  - [Asana](https://mobbin.com/screens/85d7a375-807a-4efa-a54d-b6b3b326a8f2): One quiet line separates older updates instead of marking each
  - [Linear](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270): System context stays one muted line
- **Code:** `branch: prisma/schema.prisma:399-421`, `branch: src/app/(app)/tasks/[id]/page.tsx:71-85`, `branch: src/app/(app)/tasks/[id]/activity.tsx:62-70`, `branch: src/app/(app)/tasks/[id]/view.tsx:120`
- **Verification:** partly. One divider is better than a badge on every line. But the Asana delta keeps importing stories after the Oct 27 load while people also act in the app until cutover, so imported and app events interleave for about a week and a single divider can't separate them. Put the divider at the load time, and during the overlap say 'from Asana' only in an event's meta line. The Asana reference is weak. Low.

### G1C-030

**Render rewritten '/tasks/<id>' links as task chips with the title**

Low · Fix · effort S · `Imported notes and comments: links to other tasks` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. rewriteAsanaTaskLinks still writes a bare '/tasks/<id>' path. Staff comments render the body as plain whitespace-pre-wrap text, and so do portal updates. Notes are a textarea. So a rewritten link shows as unclickable text like '/tasks/cm…' everywhere it appears.
- **Today:** rewriteAsanaTaskLinks swaps Asana task URLs for the bare path '/tasks/<id>' inside plain text (map.ts:503). The fixture note 'Same supplier as <task url>/f. Old quote: <task url>' becomes 'Same supplier as /tasks/cm…'. A path with no host isn't linkified by a URL matcher and reads as code.
- **Why:** The link that mattered in Asana becomes an unreadable ID in the app.
- **Change:** Render /tasks/<id> in notes and comments as an inline chip with the task's current title and a status dot ('Bathroom tile, unit 2'). Use the same chip when people paste an app task URL.
- **Desktop, tablet, phone:** Chip wraps inline like text at all sizes; on phone it is a 32px-tall tap target.
- **Reuse:** New TaskChip in src/components/; Badge tones for the status dot.
- **References:** 
  - [Asana](https://mobbin.com/screens/d0231fb5-6f10-485a-91d3-3e4042487e4c): References inside a comment render as chips
  - [Meetup](https://mobbin.com/screens/5294c46f-28ec-43bb-bcaa-32a46e8958d6): URLs in comments are live links
- **Code:** `branch: src/lib/asana/map.ts:493-506`, `branch: src/lib/asana/__fixtures__/snapshot.ts:296-297`, `branch: src/app/(app)/tasks/[id]/activity.tsx:98`, `branch: src/app/(portal)/p/jobs/[id]/page.tsx:159`, `branch: src/app/(app)/tasks/[id]/notes.tsx:42-52`
- **Verification:** partly. The observation is accurate: rewriteAsanaTaskLinks emits a bare '/tasks/<id>' (map.ts:503). But it only affects the roughly 135 imported open tasks, and notes aren't linkified at all yet (TASKS-025). The cheap fix is to render the path as a link labeled with the task's title. A chip with a status dot is extra. Low.

### G1C-031

**Show Asana links to non-imported tasks as archived, since they die on Nov 1**

Low · Fix · effort S · `Imported notes and comments: links to Asana tasks that weren't imported` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Links to Asana tasks that weren't imported stay as full app.asana.com URLs. They render as plain, unlinked text in comments and notes, so they're neither clickable now nor marked as archived for after Nov 1.
- **Today:** Links to tasks that weren't imported (completed, JMPL, Pieter) stay as app.asana.com URLs (map.ts:493-506 counts them as unresolved). Asana access ends around Nov 1 (D1).
- **Why:** After cutover these links look live and lead to a login wall.
- **Change:** Render unresolved Asana links as a muted chip 'Asana task (archived)', showing the original title when the snapshot has it. The chip doesn't navigate; its tooltip, or a tap on phone, says 'In the Asana backup'. Keep the URL in data for archive lookups.
- **Desktop, tablet, phone:** Same chip at all sizes; tap shows the line on touch.
- **Reuse:** TaskChip from G1C-030 with a muted variant.
- **References:** 
  - [Asana](https://mobbin.com/screens/d0231fb5-6f10-485a-91d3-3e4042487e4c): Inline chips for references in comments
- **Code:** `branch: src/lib/asana/map.ts:493-506`, `branch: src/app/(app)/tasks/[id]/activity.tsx:98`
- **Verification:** partly. The observation is accurate. But the links work as long as the Asana account lives, and the D24 archive can't be browsed from the app, so a chip that doesn't navigate and says 'In the Asana backup' helps no one act. Leave a normal link until Asana ends, then show a plain 'Asana task (archived)' label. Low.

### G1C-033

**Keep bullets, bold and links from Asana by converting the HTML to a small Markdown subset**

Low · Design change · effort M · `Imported notes and comments: formatting` · Home and Today become one work queue

- **Today:** Plain text keeps line breaks and indentation. I saw the Baselane note render as three indented lines at 320 and 1280, and the rental registration contact block keeps its lines. What's lost is bullet glyphs, bold and clickable links.
- **Why:** Checklists written as bullets in Asana become run-on paragraphs, which matters most on phone.
- **Change:** At import, convert the HTML to a small Markdown subset (paragraphs, bullets, numbered lists, bold, links, mentions) and render only that subset on the task page and portal. Never render raw HTML. Use the same subset for new notes so imported and new text look the same.
- **Desktop, tablet, phone:** Same rendering everywhere; 16px body on phone with 8px list spacing.
- **Reuse:** Notes renderer shared by the task page and portal job page.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/4d807c4c-b0a5-4e87-86bd-154fb51d3f32): Bullets and headings render cleanly in a phone issue
  - [Superlist](https://mobbin.com/screens/5162be7d-6c1c-4dfa-8c24-1b0367845ffb): Simple bullets and links in task notes
- **Code:** `branch: src/lib/asana/map.ts:674`, `branch: docs/asana-migration-plan.md:325`
- **Verification:** partly. Converting HTML to a small subset at import is fine. Extending it to new notes would add a rich-text editor to the task page. Clickable links are already TASKS-025. Low.

### G1C-035

**Show where a playbook step sits: 'New tenant · Lillian · step 3 of 10'**

Low · Design change · effort S · `Task page for a step created from a playbook` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. A step made by Apply playbook looks like any other task on /tasks/[id]. The page doesn't select taskTemplate, and there's no context link above the title. The CREATED event carries no template data, so the first activity line reads 'Connor created this task'.
- **Today:** A created step's page would look like any other task, with no link back to its run or its place in the sequence.
- **Why:** Context avoids hunting for the next step and makes the run's progress visible from any step.
- **Change:** Above the title, a muted context link 'New tenant · Lillian · step 3 of 10' that opens the group on the property. The first activity line reads 'Added from the New tenant playbook by Connor'.
- **Desktop, tablet, phone:** One line at 1280 and 768. On phone it truncates to 'New tenant · 3 of 10'.
- **Reuse:** Breadcrumb header (SHELL-053 / IA-018); run record from G1C-023.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/4d807c4c-b0a5-4e87-86bd-154fb51d3f32): Parent project shown as a chip near the title
- **Code:** `branch: src/app/(app)/tasks/[id]/page.tsx:29-87`, `branch: src/lib/tasks/core.ts:272`, `branch: src/lib/tasks/activity.ts:130`
- **Verification:** confirmed. Depends on the run record from G1C-023. Fine as low polish.

### G1C-036

**Attribute imported authors plainly: neutral initials, a Contractor label, 'Former Asana user'**

Low · Design change · effort S · `Imported activity authors without an app login` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly addressed in a different form (outlined avatar).
- **Today:** Comment authors now get neutral stone initials. Contractors get an outlined (ringed) avatar instead of a 'Contractor' label. The comment header shows the full actorLabel, while system lines use first names. The importer's who() is unchanged: an event with no author is labeled 'Asana', so it reads 'Asana set the due date…', and '(former user)' passes through as the name.
- **Why:** 'Asana' reads like a person, '(former user)' reads like a bug, and hashed avatar colors would clash with status colors (TASKS-022).
- **Change:** Keep the neutral and outlined avatars. Add sr-only 'contractor' text, since the ring is visual only. Map '(former user)' to 'Former Asana user', and drop the subject on lines with no author ('Due moved…'). Use first names in comment headers to match the lines.
- **Desktop, tablet, phone:** Same at all sizes; on phone the label stays on the name line and the time moves under it.
- **Reuse:** Avatar (new, neutral per spec section 7).
- **References:** 
  - [Base44](https://mobbin.com/screens/138fb000-3515-45e6-afa8-8bca1c231ae2): Small role label beside the commenter's name
- **Code:** `branch: src/lib/asana/map.ts:307-314`, `branch: src/lib/asana/__fixtures__/snapshot.ts:66-69`, `branch: src/components/avatar.tsx:14,36-38`, `branch: src/app/(app)/tasks/[id]/activity.tsx:87-88`, `branch: src/app/(app)/tasks/[id]/page.tsx:178`, `branch: src/lib/tasks/activity.ts:79-81`
- **Verification:** confirmed. Confirmed in the code: who() falls back to the label 'Asana' (map.ts:307-314). Neutral initials match the spec's Avatar row.

### G1C-037

**Tell both sides when Approve creates the next copy of a repeating job**

Low · Design change · effort S · `Review banner and contractor email for a repeating contractor job` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The Review banner reads '<Name> marked this done · N photos' with Approve and Send back, and says nothing about a repeat. When Approve creates the next copy, the contractor's email is an ASSIGNED item: subject 'Connor assigned you <title>', line 'Connor assigned you this job'. Neither carries the new due date. It also goes out as a separate email from the 'approved' status email on the finished job.
- **Today:** For contractor jobs, the next copy is created on Approve (asana-migration-plan.md:251). The contractor's email says only 'assigned you "<title>"' (core.ts:400), with no date, possibly a month before the work.
- **Why:** Partners don't know Approve schedules more work, and contractors get an undated assignment.
- **Change:** The Review banner on a repeating job reads 'Zack marked this done · Approving schedules the next one for Dec 5'. The contractor email subject reads 'New job: Smoke detector check · due Dec 5'.
- **Desktop, tablet, phone:** Banner text fits one line at 1280. On phone it wraps to two lines above the Approve and Send back buttons, which stay 44px.
- **Reuse:** Review banner (spec smaller screen 4); notify() summary in core.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/3383ccdd-1fe6-4969-9882-c55e95fd8dd3): Confirmation restates the rule and the next dates
- **Code:** `branch: src/lib/tasks/core.ts:398-401`, `branch: docs/asana-migration-plan.md:251`, `branch: src/app/(app)/tasks/[id]/review-banner.tsx:33-48`, `branch: src/lib/tasks/core.ts:402-405`, `branch: src/lib/notifications/content.ts:90-91,138-145`
- **Verification:** confirmed. Confirmed in the code: the next copy's contractor notification reads 'assigned you "<title>"' with no date (core.ts:398-400), and it fires on Approve. The banner line should stay on one line at 1280.

### G1C-038

**Write every rule as a full sentence with its day: 'Every year on Nov 5'**

Low · Fix · effort S · `Repeat rule wording (describeRepeat)` · Home and Today become one work queue

- **Today:** describeRepeat returns 'Yearly' without a date (repeat.ts:75-76) even though yearly honors dayOfMonth; returns 'Monthly' with no day when unpinned; produces 'Every 2 quarters'; and dayOfMonth 31 reads 'Monthly on the 31st' although February lands on the 28th.
- **Why:** The rule line is the only explanation of the cadence, so it must be exact.
- **Change:** Use 'Every year on Nov 5', 'Every month on the 5th', 'Every 6 months on the 5th' (no 'quarters' above 1), 'Every month on the last day' for 31, and 'Every 2 weeks on Thu'. Sentence case, never 'Every 1'.
- **Desktop, tablet, phone:** Copy only; phone rows show the short form 'Monthly' beside the glyph only in tooltips and sheets.
- **Reuse:** describeRepeat in src/lib/tasks/repeat.ts and its test.
- **References:** 
  - [Linear](https://mobbin.com/screens/1d72292a-e877-4055-88d7-5c6a977466f0): Saved schedule collapses to one sentence, 'Every week on Friday between 2PM - 3PM', with Edit.
  - [Jobber](https://mobbin.com/screens/d5504349-93cc-48bb-9a22-1ea53c328c06): A live 'Summary: Monthly on the 3rd Friday' line under the repeat controls.
  - [Mercury](https://mobbin.com/screens/10c550ab-f499-4dbf-8bc2-d007a42c9e00): 'Pay monthly on the 28th.' as the rule sentence
  - [Uber Eats](https://mobbin.com/screens/a06d95ad-51b5-48b9-8edb-5543bf250621): 'Weekly on Wednesday', 'Monthly on first Wednesday'
- **Code:** `branch: src/lib/tasks/repeat.ts:62-78`
- **Verification:** confirmed. Confirmed in repeat.ts:62-78: describeRepeat returns 'Yearly' with no date, 'Every 2 quarters', and 'Monthly on the 31st' even though February lands on the 28th. Mercury af150af2 confirms the rule sentence ('Monthly on the 28th'). Pairs with G1C-015.

### G1C-039

**Cap the repeat interval per frequency; 'every 365 years' is valid today**

Low · Fix · effort S · `Repeat rule validation` · Home and Today become one work queue

- **Today:** interval allows 1 to 365 for every frequency (repeat.ts:12), so every 365 months or every 365 years passes validation.
- **Why:** An impossible rule is a typo nobody notices until the task never comes back.
- **Change:** Allow days 1 to 365, weeks 1 to 52, months 1 to 24, quarterly 1 (use months for more) and years 1 to 10. The Custom stepper enforces the same limits.
- **Desktop, tablet, phone:** Stepper is 44px on touch; limits are the same everywhere.
- **Reuse:** repeatRuleSchema refine in src/lib/tasks/repeat.ts.
- **References:** 
  - [Linear](https://mobbin.com/screens/754d9f92-fccb-4b14-b53e-190d460e0118): Schedule choices are a short capped list (Every week to Every 8 weeks) instead of an open number.
  - [Skiff](https://mobbin.com/screens/57b4fabe-1140-4dca-bdd3-eac72c999761): 'Repeat every [n] [unit]' custom rule
- **Code:** `branch: src/lib/tasks/repeat.ts:12`
- **Verification:** partly. True (repeat.ts:12). But the only way to enter an interval will be the planned Custom picker, so cap it there and in the schema as part of G1C-010 rather than as a separate item.

### G1C-040

**Clean the playbook steps before they become templates**

Low · Fix · effort S · `Playbook step text (68 template rows)` · Home and Today become one work queue

- **Today:** 'Set up national fuel' and 'Set up LofL National Fuel' aren't duplicates: the LofL step is National Fuel's landlord program, and its note links the landlord-program application. Confirmed: 'Upload photos of before' appears twice in New property, and the URL title, the email-address title, the lowercase starts, the 'X' placeholder and the 'TBD:' prefix are as described.
- **Why:** Every apply copies these flaws into live tasks, as the 201 hand-applied rows show.
- **Change:** In Monday's dry run: dedupe, capitalize the first letter, move URLs and emails into notes, turn 'X' into a note or a token, and drop 'TBD:'. Show the edits as before and after for one approval.
- **Desktop, tablet, phone:** Report only.
- **Reuse:** Template plan in scripts/asana/20-load.ts output.
- **Code:** `DB (read-only): template row titles listed per section`
- **Verification:** partly. One before-and-after cleanup list for Monday is right. Low.

### G1C-043

**Show files that didn't come over, and external links, as honest tiles**

Low · Fix · effort S · `Imported attachments: missing files and external links` · Home and Today become one work queue

- **Today:** Files Asana lists but that fail to download are reported as missing (fixture 'IMG_0499.JPG'). Dropbox, Drive, Box files and Asana video messages become LINK attachments (fixture 'Plans.pdf' on Dropbox, 'Walkthrough video message' on Vimeo).
- **Why:** A comment that says 'see photo' with nothing under it reads as a bug, and a link tile that looks like a thumbnail breaks expectations.
- **Change:** Missing: a muted tile 'IMG_0499.JPG · Not saved from Asana' in place. Links: a tile with the host name ('Dropbox', 'Vimeo') and an external-link glyph that opens a new tab, never a broken thumbnail.
- **Desktop, tablet, phone:** Media grid: 4 per row at 1280, 3 at 768, 2 at 375; same tile height everywhere.
- **Reuse:** Media grid (new per spec section 7); TaskAttachment kind LINK.
- **Code:** `branch: src/lib/asana/__fixtures__/snapshot.ts:309-313`
- **Verification:** confirmed. The fixture covers both cases (snapshot.ts:309-313). No reference, which is acceptable for a fix.

### G1C-044

**Carry over Asana's pinned and edited flags**

Low · Design change · effort S · `Imported comments: pinned and edited` · Home and Today become one work queue

- **Today:** map.ts stores is_pinned and is_edited in each comment's data (map.ts:674), but nothing plans to show them.
- **Why:** A pinned comment in Asana was usually the instructions. Losing the pin hides it in two years of history.
- **Change:** Pinned imported comments show once at the top of the activity under a muted 'Pinned' label. Edited comments show 'edited' muted after the time.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** activity-timeline component.
- **References:** 
  - [Front](https://mobbin.com/screens/70704201-4645-4520-b6e4-3b8cb29f755d): 'Pinned by you' label above a message
- **Code:** `branch: src/lib/asana/map.ts:674`
- **Verification:** confirmed. Confirmed: is_pinned and is_edited are stored in each imported comment's data (map.ts:674). Pinned comments are rare, so low.

### G1C-045

**Group two years of history by month and show the year only when it differs**

Low · Design change · effort S · `Task activity dates for long imported histories` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. No imported history is in the branch DB, so this is from the code.
- **Today:** Activity dates show the year only when it differs ('Thu, Oct 30' this year, with ', 2025' otherwise). Entries sit under day headings ('Today', 'Yesterday', 'Mon, Oct 20'). Only the latest 15 show, and the rest fold behind 'Show N earlier updates'. There are no month separators, so expanding two years of imported history gives one heading per day.
- **Why:** Long histories need landmarks, and repeated years are noise.
- **Change:** Keep the fold and the year rule. When expanded, group entries older than about 30 days under muted month headings ('March 2025') instead of one heading per day.
- **Desktop, tablet, phone:** Separators are full width at all sizes; times drop on phone.
- **Reuse:** fmtDate and relativeDays in src/lib/utils.ts and src/lib/dates.ts.
- **References:** 
  - [Attio](https://mobbin.com/screens/070de66a-5dcc-4049-ae06-b0ff0babcdd4): Activity groups under a year label, then 'This week' and 'June' headers with collapse chevrons.
  - [Deputy](https://mobbin.com/screens/fd1a02ca-3bc4-47eb-bd05-a63926f531a3): History grouped under day headings
- **Code:** `branch: src/lib/asana/__fixtures__/snapshot.ts:191-195`, `branch: src/lib/tasks/activity.ts:43-64`, `branch: src/lib/tasks/activity.ts:228-238`, `branch: src/app/(app)/tasks/[id]/activity.tsx:32,51-70`
- **Verification:** confirmed. Fine. Month separators only matter for the longest imported histories. The Deputy reference is plausible.

### G1C-046

**Move 'Created by' from the rail to the first line of activity**

Low · Design change · effort S · `Task page rail: Created by` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. conflicts_with: the approved task page rail lists 'Created by' (asana-migration-plan.md:403).
- **Today:** The rail keeps a 'Created' row on desktop only (hidden below lg) with '<First name> · <date>', for example 'Feb 10, 2025', or 'Oct 23' when no staff creator is recorded. Activity now opens with '<Name> created this task'. So on desktop the same fact shows twice; on tablet and phone it's only in activity.
- **Why:** The rail should hold fields you change. Who created a task is history and reads better as the first event.
- **Change:** Drop the desktop rail row, since the first activity line carries it. Ask Connor first, because 'Created by' is in the approved rail (plan line 403).
- **Desktop, tablet, phone:** Same everywhere; this removes one row from the phone chips sheet.
- **Reuse:** activity-timeline component.
- **Challenges:** Spec section 6 Task page rail (Created by row, D31)
- **References:** 
  - [Linear](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270): 'Alex Smith created the issue' as the first activity line
  - [Asana](https://mobbin.com/screens/4b448c3a-ea3c-441c-8af6-abde7ad992dd): 'created this task' opens the activity
- **Code:** `branch: docs/asana-migration-plan.md:403`, `branch: src/lib/asana/map.ts:1500`, `branch: src/app/(app)/tasks/[id]/fields.tsx:169-171`, `branch: src/lib/tasks/activity.ts:129-130`
- **Verification:** confirmed. conflicts_with names the spec rail. Linear https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33 shows 'Alex Smith created the issue' as the first activity line, which matches the recommendation.

### G1C-047

**Rename the 8 open tasks that still carry bracket placeholders before cutover**

Low · Fix · effort S · `Open hand-applied playbook tasks at cutover` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Partly fixed in 9f74ea1: the Asana load report now has an "Open tasks with [brackets] in the title, to rename" section that lists every open bracketed title with its task id and section. Still open: there are no inline rename fields, and the 8 renames themselves are a data task for Connor in the load review. /tasks/all on the branch lists the same 8 open bracketed titles. Five are '[428]' at 428 Normal Avenue: Upload signed [428] lease, Give [428] keys, Transfer [428] security deposit, [428] confirm national fuel…, Store [428] insurance. The others are 'Store [lillian] insurance' (428 Normal, Sep 8), 'Store [philo] insurance' (647 Prospect, Sep 1) and 'Store [daphne] insurance' (725 Linwood, now due Wednesday). The importer's dry-run report has no step for renaming them.
- **Today:** Six open bracketed tasks are on 428 Normal: five reading '[428]' plus 'Store [lillian] insurance'. Four are due Aug 28, one Sep 2 and one Sep 8, so they aren't all due Aug 28. The other two are 'Store [daphne] insurance' at 725 Linwood and 'Store [philo] insurance' at 647 Prospect.
- **Why:** The new Today starts with these at the top of Overdue, reading like broken data.
- **Change:** In the Oct 27 load review, list the open bracketed titles with inline rename fields so Connor fixes them in one pass. The Asana update path would otherwise keep them as they are.
- **Desktop, tablet, phone:** Report only.
- **Reuse:** Reconciliation list in scripts/asana/20-load.ts.
- **Code:** `DB (read-only): 8 open non-template tasks have '[' in the title`, `branch: src/lib/asana/report.ts`
- **Verification:** partly. A rename pass during the load review is right. Low.

### G1C-I05

**Make new playbooks from finished work with 'Save as playbook'**

Low · New capability · effort M · `Property page Tasks (playbook runs) and the playbook library` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. /templates is still a read-only list that links to /templates/[id]/apply, with no create, edit or Save as playbook. In the branch DB, anchorLabel is set on all four playbooks ('Move-in date', 'Closing date', 'Move-out date'), but none of the 63 items has dueOffsetDays, so a saved run still has no dates to turn into offsets.
- **Today:** It's true there's no way to create or edit a playbook: only /templates and /templates/[id]/apply exist. But D28 already schedules the editor for the week after cutover. The four imported playbooks need editing that Save as playbook can't do: all-caps names, no due offsets and duplicate tokens. The claim that this 'fills in due offsets' is overstated. Every step of New tenant (10) and New property (39) is undated (all 'Due date: none', no anchor field), so tasks made from them have no dates to turn into offsets.
- **Why:** A blank editor makes Connor retype steps he just finished. Basecamp makes a template from a real project in one short form, so a template starts from something that worked, and one note says dates become relative to the start date. That also fills in due offsets (G1C-005) without a separate offset editor.
- **Change:** On a playbook run (G1C-023) or a selection of a property's tasks, add 'Save as playbook…' to the overflow menu. One sheet: Name, an optional one-line purpose, 'Dates count from' with the anchor label and date, checkboxes 'Keep assignees' and 'Keep checklists', and one line: 'Names you typed become blanks, and dates become days from the move-in date.' The later editor then only needs rename, reorder and remove.
- **Desktop, tablet, phone:** Desktop and tablet: right sheet about 480px wide. Phone: full-height sheet with a pinned Save. Multi-select is desktop only; on phone it is offered on a run.
- **Reuse:** Sheet (src/components/sheet.tsx), DueDatePicker, TaskTemplate and src/lib/tasks/template-items.ts.
- **Challenges:** D28 (template editor the week after cutover): makes Save as playbook the main way to create one, which shrinks the planned editor to rename, reorder and remove.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/7dff0143-4d11-4c0f-bc61-506ea1af5a7c): 'Make a template from this project': name, optional description, Include people, and a note that due dates become relative to the start date.
  - [Basecamp](https://mobbin.com/screens/3b2a5bb5-682c-4b05-8419-2b38db63d82a): 'Save as a project template' lives in the record's own menu.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/templates/page.tsx:14-64`, `task-management-migration-4c9ddf/src/lib/tasks/template-items.ts:4-23`, `task-management-migration-4c9ddf/prisma/schema.prisma:465-478`, `4652abb:src/app/(app)/templates/page.tsx:14-62`, `4652abb:prisma/schema.prisma:465-479`, `psql: TaskTemplate items with dueOffsetDays = 0 for all four`
- **Verification:** partly. Basecamp 3b2a5bb5 ('Save as a project template' in the project menu) is confirmed. I couldn't reproduce 7dff0143, but Basecamp 99f61041 matches the described form, including 'Due dates and events will be relative to the project's start date'. The idea is sound, but it depends on a run record (G1C-023) and multi-select, neither of which exists yet. It should follow the D28 editor, not replace it.

### G1C-I08

**Don't ask for what the property already fills: drop the 'property address' box**

Low · Design change · effort S · `Apply playbook review (/templates/[id]/apply)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The fifth token field, 'property address', is still an editable box prefilled with '58 Mariner Street'. It takes a full grid row on desktop and about 90px on phone.
- **Today:** The New tenant sheet shows five token inputs. The last, 'property address', is an editable box prefilled with '58 Mariner Street' and the placeholder 'Fills from the property'. It takes a full row on desktop and roughly 90px on phone.
- **Why:** Every field on screen should help a decision, and data entered once should flow forward. Mercury's review card states known facts as text and keeps controls only for open choices.
- **Change:** Hide tokens that fill themselves (isAddressToken) from the inputs. The property choice already names the address and the step previews show it filled; anyone who wants other wording edits that step.
- **Desktop, tablet, phone:** Removes one row on desktop and tablet and one full field on phone; nothing else changes.
- **Reuse:** isAddressToken in src/lib/tasks/template-items.ts.
- **References:** 
  - [Mercury](https://mobbin.com/screens/10c550ab-f499-4dbf-8bc2-d007a42c9e00): The review card shows known details as plain text; only the open choices are controls.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/templates/[id]/apply/apply-flow.tsx:115-127`, `4652abb:src/app/(app)/templates/[id]/apply/apply-flow.tsx:116-129`
- **Verification:** confirmed. Seen: 'property address' is an editable field prefilled with '58 Mariner Street', with the placeholder 'Fills from the property' (apply-tenant--desktop-light.aria.txt:55-58; mobile shot). Hiding isAddressToken fields is safe because the property select already fills the value. I couldn't reproduce Mercury 10c550ab.

### G1C-I09

**Fold a run's later steps on the property: the next few, then 'Show 31 later steps'**

Low · Design change · effort M · `Property page Tasks (D10 Tasks tab)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The 58 Mariner Tasks card lists 24 active tasks in a 420px scroll box (page.tsx:196), sorted by target date, with no grouping by playbook run. New property's 39 steps all show 'Due date: none' and no anchor field, so they would land undated at the end of the list.
- **Today:** Applying New property does create 39 tasks, but none has a due date: all 39 rows say 'Due date: none' and the playbook has no anchor date. They'd land undated at the end of the property card's 420px internal scroll box, after the dated work, not spread 'weeks out'. Today the card already holds 24 active tasks at 58 Mariner and 20 at 118 Congress, so a date-based fold has nothing to fold by.
- **Why:** A 39-row dump buries the two or three things due now and makes a calm property look on fire. Things 3 shows a project's near items and folds the rest behind 'Hide later items'.
- **Change:** Inside a run's group (G1C-023), show the done count, the next 3 open steps by date and a muted 'Show 31 later steps' row. Overdue steps and steps due in the next 7 days always show. Today and All stay unchanged.
- **Desktop, tablet, phone:** Same at every width; on phone the fold row is a 44px tap target and the group header keeps its progress.
- **Reuse:** The property task list in src/app/(app)/properties/[id]/page.tsx and the G1C-023 group header; the fold row is new, modeled on Things 3.
- **References:** 
  - [Things 3](https://mobbin.com/screens/32aaaf2f-9ad2-42c4-86fa-747852952730): A project shows its near to-dos, then 'Hide later items'.
  - [Things 3](https://mobbin.com/screens/f16197bf-3c84-4272-8f80-fa8c7c03a2aa): Later items sit under an Upcoming heading with a day chip each, below what's current.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/properties/[id]/page.tsx:52-55,86-88,192-200`, `shoot.mjs eval on /templates/cmvkij6qh0002jp3a1ckan2cm/apply: dues=39, all 'Due date: none'`, `4652abb:src/app/(app)/properties/[id]/page.tsx:52-55,86-88,192-219`
- **Verification:** partly. The fold idea needs dates and a run group first, and neither exists today. Revisit after G1C-005 and G1C-023. The 4,487px phone height for New property is confirmed by eval. The Things 3 references are plausible but not reproduced.

### G1C-I10

**List a property's repeating chores in one block with rule and next date**

Low · Design change · effort M · `Property page Tasks (D10 Tasks tab)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The property Tasks card rows show title, status badge, avatar and date, with no repeat rule and no Repeats block. The branch DB has 0 tasks with a repeatRule, so this was checked in code only.
- **Today:** A repeating task exists only as its current open copy. The property's Tasks card shows title, assignee and date with no rule, so learning what recurs at 58 Mariner (filters, detector checks, renewals) means opening each task.
- **Why:** What recurs at a property is core knowledge, especially when handing a building to a new contractor. Stripe's customer page answers what bills on a schedule in one small table with Frequency and Next invoice.
- **Change:** In the property's Tasks tab, a 'Repeats' block above the list: one row per series, 'Furnace filter · Every 3 months · Next Jan 5 · Zack'. Tapping opens the current copy. Hidden when the property has none.
- **Desktop, tablet, phone:** Desktop and tablet: one-line rows with aligned columns. Phone: two lines (title, then 'Every 3 months · Jan 5'); the assignee drops.
- **Reuse:** repeatSeriesId, parseRepeatRule and describeRepeat in src/lib/tasks/repeat.ts; property task rows.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Customer page Subscriptions table: product, frequency, next invoice in one compact block.
  - [Wise](https://mobbin.com/screens/34ad8a8d-3ae6-40d9-be35-513da43400ca): Two-line rows 'Weekly | Next: Sat, Mar 22' for phones.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/properties/[id]/page.tsx:192-215`, `4652abb:src/app/(app)/properties/[id]/page.tsx:192-219`, `psql: Task where repeatRule is not null = 0`
- **Verification:** partly. The observation is true: rows show title, sometimes a status badge, an avatar and a date, with no rule. But a 'Repeats' block above a list that already contains each series' current open copy shows the same task twice on one card. That's busier, not simpler. A repeat glyph plus the rule on the existing row does most of the job (G1C-V05). If a block is wanted, repeating series should move into it rather than appear twice. No task carries a repeat rule yet; Connor's D27 list arrives Monday. Stripe 1a4a and Wise refs not reproduced.

### G1C-I12

**One 'New task' button on the property, with playbooks in its menu**

Low · Design change · effort S · `Property page Tasks card header` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The card header still has two equal outline buttons, 'Apply playbook' and '+ Task'. On phone (375) they fill the header row beside 'Tasks'. Apply playbook goes to /templates?property=, which preselects 58 Mariner on the apply page.
- **Today:** The two equal outline buttons ('Apply playbook', '+ Task') are confirmed, and on phone they fill the header row. The apply page does not ask for the property again: ?property= preselects it, and the aria tree shows '58 Mariner Street [selected]'. The extra cost is one list-page hop, not re-entering the property.
- **Why:** Two buttons for one job, adding work to this property. Linear starts every issue in one composer and names the chosen template in its header; Basecamp offers 'Use a to-do list template…' inside New list.
- **Change:** One 'New task' split button. Its chevron menu lists the playbooks by name (New tenant, Move out, Refi, New property); picking one opens the apply sheet (G1C-006) with the property already set. Use the same control on the Tasks page.
- **Desktop, tablet, phone:** Desktop and tablet: split button in the card header. Phone: one 'New' button that opens a sheet with Task first, then the playbooks.
- **Reuse:** Button and the React Aria menu primitives in src/components, Sheet; builds on G1C-027.
- **References:** 
  - [Linear](https://mobbin.com/screens/65487ca3-9cf4-4287-b0cc-2c3e8c6f7f35): The template is picked within the normal new-issue composer and named in its breadcrumb.
  - [Basecamp](https://mobbin.com/screens/4304ed03-6265-4fac-94c8-9d2a8eba1b70): 'Use a to-do list template…' is a link inside the New list form.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/properties/[id]/page.tsx:180-190`, `4652abb:src/app/(app)/properties/[id]/page.tsx:180-190`
- **Verification:** partly. The phone part of the recommendation, one 'New' button that opens a sheet with Task and the playbooks, turns the most common action (adding one task) into two taps. Keep '+ Task' as one tap at every width and put the playbooks behind an attached chevron, as a split button. Mercury's 'Create invoice' split button (0f93b4de, seen) is a closer reference than Linear's composer.

### G1C-I15

**Add an 'Ends' row to repeats for seasonal chores**

Low · New capability · effort S · `Repeats editor` · Home and Today become one work queue

- **Today:** A repeat rule has frequency, interval and day of month only, and the editor has no end. A series runs until someone remembers to turn it off.
- **Why:** Buffalo work is seasonal: lawn visits April to October, snow December to March. Without an end, someone has to stop each series by hand or Zack gets a December mowing job. Things 3 and Mercury both show an Ends row that reads Never by default.
- **Change:** One row under the rule: 'Ends: Never' (default) or 'On [date]'. No copies are created past the end, and the last copy's done toast says 'Done · That was the last one'. Leave out 'After N times'.
- **Desktop, tablet, phone:** One row in the popover or sheet; the date opens the existing DueDatePicker; 16px on touch.
- **Reuse:** DueDatePicker; repeatRuleSchema in src/lib/tasks/repeat.ts gains an optional until date.
- **References:** 
  - [Things 3](https://mobbin.com/screens/02300565-277c-46b2-8c25-3f32f25aece9): 'Ends: Never' row in the repeat editor.
  - [Mercury](https://mobbin.com/screens/af150af2-c997-47f6-9d44-aa1069872d4f): Ends: On a date, After N payments, or Never, above a preview of the next dates.
- **Code:** `task-management-migration-4c9ddf/src/lib/tasks/repeat.ts:10-16`, `task-management-migration-4c9ddf/src/components/repeat-picker.tsx:93-128`
- **Verification:** confirmed. The rule schema has no end (repeat.ts:10-15), and the editor has no Ends row. Things 3 02300565 shows 'Ends: Never' (verified). Buffalo lawn and snow seasons make this a real need. With Never as the default, it adds one row to the popover.

### G1C-V02

**A repeating task finished in both the app and Asana gets two open next copies**

Low · Fix · effort S · `Asana delta during the Oct 27 to Nov 1 overlap (src/lib/asana/map.ts)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The importer is unchanged since f59e6ad. mergeFields still sets status 'close' only when Asana newly completed the task. repeatOnClose is set only when the status is 'close'. The copy-join pass still skips originals the app already finished, so Asana's own next copy would be imported as a standalone open task next to the app's copy.
- **Today:** mergeFields sets status 'close' only when the app's copy is still open (map.ts:443-447). Suppose a partner completes a repeating task in the app: createNextRepeat makes copy A. Later the contractor completes the same task in Asana, and Asana makes its own next copy as a new task. For the original, repeatOnClose is false (map.ts:1498), so the pass that joins copies to a series skips it (map.ts:1510-1535). Asana's copy is imported as a standalone open task next to copy A.
- **Why:** This produces duplicate open chores in the first week on the new system, which is exactly the week contractors still work in Asana.
- **Change:** In the copy-join pass, also consider originals that are already DONE in the app and have a repeat rule. When an Asana copy with the same title and section arrives after the app's completion, join it to the series and cancel the app's own copy if nobody has touched it. Otherwise skip importing Asana's copy and list it in the dry run.
- **Desktop, tablet, phone:** Import logic only; identical at every size.
- **Reuse:** The repeat copy-join block in buildPlan (src/lib/asana/map.ts) and joinSeries in src/lib/asana/import.ts; add a case to src/lib/asana/map.test.ts.
- **Code:** `branch: src/lib/asana/map.ts:443-447`, `branch: src/lib/asana/map.ts:1498`, `branch: src/lib/asana/map.ts:1510-1535`, `branch: src/lib/asana/import.ts:83-91`, `branch: src/lib/asana/map.ts:443-446`, `branch: src/lib/asana/map.ts:1512-1535`
- **Verification:** verifier-found
