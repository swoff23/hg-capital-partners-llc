# Bulk edit on the Tasks list

Planned with Connor on Nov 16, 2026, one question at a time (Q1 to Q9). He took every recommendation except Q1, where he chose clicking rows straight into a bar of edits over a Select button, and said "build it" the same day. On Nov 20, after trying the first build, he moved picking to Asana's way, with no boxes at all (Q10 to Q12, all three recommendations taken). He said "build it" on the rework the same day, and it's built (section 10).

## 1. Summary

**Why.** Every change on the Tasks list is one task at a time today. Handing a building's jobs to one contractor, pushing a week of work to Monday or tidying up after the Asana import means opening each task. Only Home's "Move all to today" changes several at once.

**What changes.**

- On the Tasks page (`/tasks`), rows are picked the way Asana picks them, with no boxes: Cmd-click (Ctrl-click on Windows) adds or removes a row, Shift-click adds every row between, and a plain click still opens the task. On a phone or tablet a long-press starts picking, and then a tap picks.
- A picked row sits on the `--select` fill with a 2px ink notch at its left edge.
- Once a row is picked, a bar docks at the bottom with every edit: Status, Assignee, Due date, Property and Delete. On a phone they're icons.
- While picking, each building's or person's heading ends with Select or Deselect, and Select all sits beside New task.
- Each edit uses the task page's own picker and rules, applies to every picked task at once, and toasts with Undo. Delete asks first and can't be undone.
- The picks stay after an edit, so a second change reaches the same tasks, and clear when a filter, the view or the search changes.
- Hovering a task's Done circle shows a faint green check, as in Asana, everywhere the circle shows.
- Contractors get one email per job, as today.

![Picking rows and the bar at laptop, tablet and phone](bulk-edit/01-pick-and-bar.svg)

![What each button opens, and the toasts after](bulk-edit/02-edits-and-toasts.svg)

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Rows are picked straight from the list, and a bar at the bottom holds every edit (ClickUp's and Asana's pattern). No Select step first. Connor's call over the recommended Select button, which is how the Missing info page works |
| D2 | (Nov 20, Q10; replaces the hover box) No pick boxes. With a mouse, Cmd-click (Ctrl-click) adds or removes a row, Shift-click adds every row between it and the last one picked, and a plain click opens the task. Cmd-click no longer opens a new tab on this list; middle-click, or right-click then Open in new tab, still does. On touch a long-press starts picking, then a tap picks |
| D3 | The bar holds Status, Assignee, Due date, Property and Delete. Unit and Repeat stay on the task page |
| D4 | Labeled buttons from tablet width up; icons only on a phone, with the count as Clear |
| D5 | Each change saves at once and toasts with Undo, which puts every task back to its own old value. Delete asks first and has no Undo |
| D6 | The picks stay after an edit and clear when a filter, the Open \| Done \| All view or the search changes |
| D7 | (Nov 20, Q12; replaces the header and group boxes) While anything is picked, each group heading ends with Select or Deselect for that group, and Select all picks every row on screen, as in Photos' select mode. Only rows on screen are ever picked |
| D8 | One email per job when a contractor is handed several, as today |
| D9 | Only the Tasks page. Home's Today and the property page's task list keep one-at-a-time edits |
| D10 | (Nov 20, Q11) Hovering a Done circle with a mouse, or focusing it with the keyboard, shows a faint check: the ring and check in `--ok` on the `--ok-tint` fill, as in Asana. Nothing changes on touch. It applies everywhere the circle shows, Home's Today included |
| D11 | (Nov 20) A picked row is the `--select` fill, the color docs/brand-guidelines.md sets aside for bulk-selected rows, with a 2px by 16px `--primary` notch at the row's left edge on the title's line, the sidebar's current-item mark. Brand principle 6: a selection never rests on a pale fill alone |

## 3. Calls made in this spec, for Connor to check before "build it"

1. **A picked row's unread dot gives way to the notch.** Both sit in the row's left margin. The dot comes back when the row is unpicked, and the task still opens at its New divider.
2. **On touch, a tap picks while you're picking.** A tap anywhere on a row picks or unpicks it, its date chip and person included, as in Gmail and Todoist. The Done circles stay and the rows read as today otherwise. With a mouse, a plain click on a row always opens it.
3. **Select all sits in the page header, beside New task,** not on a line above the list as the Q12 sketch had it. A line that appears above the list when picking starts would push every row down under the pointer or finger. On a phone it reads "Select all", with no count. Once every row on screen is picked it reads "Deselect all". Below 360px wide the title, Select all and New task don't fit on one line, so New task steps aside while you're picking, as select modes on a phone do, and comes back when the picks clear.
4. **A keyboard can pick too.** With a row's link focused, `x` picks or unpicks it (Gmail and Linear), and Shift-x picks the range from the last one. Select, Deselect and Select all are buttons in the Tab order. A picked row's link tells a screen reader it's selected, and the count is announced as it changes.
5. **The contractor email line is "Zack gets 3 emails",** shorter than "Zack gets an email for each", so the toast keeps one line.
6. **Assign reads "Assigned 3 tasks to Zack",** matching the single-task toast ("Assigned to Zack"), instead of "Gave".
7. **Labels show from 800px of bar width,** not 640. The labeled row needs about 705px with a mouse and more with touch's larger type; at 640 to 704 it overflowed in testing. So an iPad held upright (720px of bar) gets the icons, and an iPad held sideways and every laptop get the labels.
8. **Big batches stay one transaction.** 400 tasks to Done took 1 to 2 seconds on the local copy, well under the 10-second line, with a 60-second limit.
9. **Already there counts as done.** Setting 3 tasks to Waiting when one already is Waiting changes that one's reason only, and the toast still says 3.

## 4. How it works

### Picking

**With a mouse.**

- Cmd-click (Ctrl-click) on a row picks it, or unpicks it if it's picked. That's how picking starts.
- Shift-click on a row picks every row between it and the last row picked or unpicked, in list order, across groups. With nothing picked yet, it picks just that row, as Finder does.
- A plain click opens the task, picking or not. The Done circle, the date chip and the person work as today.
- Hovering the Done circle shows its faint check (D10).

**On touch (phones and tablets).**

- A long-press on a row picks it and starts picking. React Aria's `useLongPress` sets the threshold, cancels on scroll, cancels the click that ends the press and holds off the context menu. The row link gets `-webkit-touch-callout: none` and `select-none` on touch, so iOS doesn't open a link preview or start selecting text.
- While picking, a tap anywhere on a row picks or unpicks it. The date chip and the person are inert until the picks clear.

**With a keyboard.** `x` on a focused row picks or unpicks it; Shift-x picks the range (call 4).

**Many at once.** While anything is picked, each group heading (a building, a person, "No property", "Unassigned") ends with **Select** for its rows on screen, or **Deselect** once all of them are picked, and **Select all 42** sits beside New task in the page header ("Select all" on a phone; "Deselect all" once everything on screen is picked). The flat Due sort has no headings, so it has Select all alone. "Show more" loads more rows without clearing the picks; rows it loads start unpicked.

**The picked look.** The `--select` fill across the row's hover area and a 2px by 16px `--primary` notch at its left edge, on the title's line (D11). A hovered picked row keeps the fill. The unread dot gives way to the notch (call 1).

**When picks clear.** Clear on the bar, the × beside the count on a phone, or Esc. Changing the Open | Done | All view, a filter or the search also clears them. Sorting and "Show more" don't. A picked task that leaves the list (set to Done in Open, moved to another building while filtered to one) drops out of the count; at zero the bar goes away. One Esc closes one layer: an open picker, menu, sheet or the Delete dialog first, then the picks.

### The bar

`ActionBar` with `placement="app"` and its `actions` slot: docked to the content column with the page column's width, the toast lifted above it, and a spacer after Show more so the last row never hides under it. It stays up under a tablet's on-screen keyboard, so a picker's search keeps its anchor (`hideWithKeyboard={false}`).

- **From 800px of bar width:** "3 selected", then Status, Assignee, Due date, Property and Delete as small secondary buttons with an icon and a label (Delete's in `--destructive`), and Clear at the end.
- **Below 800px:** an × with the count (Clear, named "Clear 3 selected" for screen readers), then the five as 44px icon buttons 2px apart, named for what they do. At 320 they end exactly on the 16px gutter and the count keeps two digits whole (measured: "12" in a 58px button).
- **Icons:** `CircleDashed` (Status, as `entity-picker.tsx` uses it), `UserRound`, `CalendarDays`, `Building2`, `Trash2` and `X`, all lucide.
- The count is in a polite live region that's there before the first pick, so "1 selected" is announced, and "Selection cleared" when the picks clear.
- Delete has the danger look, the first step of a destructive action.

Each button opens its picker through `PickerLayer` (or `StatusMenu`'s own menu): a popover anchored to the button and opening upward with a mouse, a titled sheet on a touch phone ("Status · 3 tasks").

### The edits

Every edit goes through the task services one task at a time inside one transaction, so each task gets its own timeline line, its own email and its own repeat copy, exactly as if it had been changed by hand. Each task runs in its own savepoint, so a refusal for one task rolls back only that task.

**Status.** `StatusMenu` with its number keys. When every picked task has the same status it carries the check; mixed, nothing does. Review is offered only when every picked task has a contractor or is already in Review (the task page's rule). Waiting asks "What's it waiting on?" once, Scheduled asks for the "Visit date" once, through `followUp`, and the answer applies to every task; Back or Esc changes nothing. Done on a task in Review is an approval, as it is one at a time. A repeating task set to Done makes its next copy. Each task is sent with the status its row showed, so one someone else moved since is skipped.

**Assignee.** The task page's people list (the same `peopleRows` the row's Assignee cell uses): the team, contractors and Unassigned. Each task is sent with the assignee its row showed, so one someone reassigned since is skipped. A contractor handed jobs gets one email per job, and one taken off open jobs gets "You're off this job" for each, as today.

**Due date.** `DatePanel` with No date, its `mixed` flag set when the picked tasks' dates differ so nothing reads as current. A contractor's job moves its target (the visit date while Scheduled, otherwise the due date) and a staff task its due date, the rule each row's date chip uses. Closed tasks are skipped, as "Move all to today" skips them. Clearing the date on a Scheduled job skips that job instead of failing the batch.

**Property.** The property list with No property. A task keeps its unit when the new building has a unit by that name, and loses it otherwise: `unitAfterMove` in `lib/picker-options-shape.ts`, which the task page's Property field now uses too.

**Delete.** `ConfirmDialog`: "Delete 3 tasks?", "They go for good, with their notes, checklists, activity and files." (the task page's own wording), Cancel and a destructive "Delete 3 tasks". It stays open, busy, while it runs. Each task goes through `deleteTask`, files and all; one that fails is counted and the rest still go. The picks clear with the rows.

### After a change

- The rows change at once (`useOptimistic`), then the server saves. A failure puts every row back and toasts why.
- One toast says what happened, with Undo (except Delete). When some were skipped the news counts what changed ("Moved 2 of 3 tasks to Fri Nov 20") and the reason follows after " · " ("1 is closed"), the clause a narrow toast cuts first. A rule's refusal gives its own words there instead, with the next step ("Archived. Pick someone else.").
- **Undo** puts each changed task back to its own old value, sent expecting the value the bulk change set, so a task someone changed since is left alone. Undo says nothing when everything went back, and "Put back 2 tasks. 1 changed since." when something didn't.
  - Status: back to the old status with its waiting reason and visit date. A task this change finished goes back the way the Done toast's Undo does, which takes back an untouched repeat copy. An approval goes back the way Approve's Undo does.
  - Dates: back unless the date was changed since or the task closed since (`undoDatesEach`).
  - Assignee and property: back to the old assignee, or the old property and unit.
- **Emails and Undo.** Job emails wait a few minutes and drop a change that's put back before they go, so an Undo means the contractor hears nothing. That includes a job moved from one contractor to another and back (Jose to Zack, Undo): `offItems` in `lib/notifications/content.ts` drops Jose's "took you off" with the "assigned you" that gave it back. This also fixes the same case for one task at a time.

## 5. Code

### Reuse check

**Reused as is:** `ActionBar` docking, `PickerLayer`, `OptionList`, `StatusMenu`'s menu, `DatePanel`, `assigneeRows` and `propertyRows`, `ConfirmDialog`, `useToast` (`detail`, `phoneMessage`, `action`), `restoreTaskDates`, `core.setStatus`, `core.patchTask`, `core.undoApproval`, `deleteTask`, `withResult` and `ActionResult`, `GENERIC_ERROR`, React Aria's `useLongPress`, and the job email outbox.

**Extended:**

- `ActionBar`: an `actions` slot, a row of the caller's own in place of `status`, `secondary` and `primary`.
- `StatusMenu`: `trigger` (a button of the caller's, opening upward), `title` (the phone sheet's) and a task `value` of null for mixed statuses.
- `DatePanel`: `mixed`.
- `TaskCheckbox`: the faint check on hover and keyboard focus (D10).
- `TaskRow`: the picked look and notch, Cmd-click, Shift-click and `x`, long-press, and the tap-to-pick layer on touch while picking. Without a picks provider (Home) it renders and behaves as before.
- `TaskSection`: an optional `pick` that ends the heading with Select or Deselect.
- `TasksHeader`: its actions are `TasksHeaderActions` (`select-all.tsx`): Select all beside New task while picking, New task stepping aside below 360px.
- `TaskListProvider`: `runEdit` (the list's optimistic runner, for the bar) and `listAssigneeOf`.
- `applyPatch` (`lib/tasks/list.ts`): `place` and `many` patches.
- `offItems` (`lib/notifications/content.ts`): the take-off-and-give-back pair (section 4), dropped only when the job is as the contractor knew it. `notifyOff` writes that snapshot on the "took you off" line (`job`, from `jobKey`); a line queued before has none and sends as before.
- `core.contractorGetsEmail`: exported, for the bar's email count.
- `unitAfterMove` (`lib/picker-options-shape.ts`): the task page's keep-the-unit rule, shared with the bulk move.

**New:**

- `lib/tasks/bulk-core.ts`: the bulk status, assignee, property and date changes and their Undo, on the caller's transaction, one savepoint per task, a rule refusal counted as a skip with its reason. Every task it holds is locked up front in id order, with the repeat copy a closed one would take back on reopening, so its locks never cross another writer's. `moveTaskDates` ("Move all to today") is unchanged.
- `lib/tasks/picks.ts`: the picks as pure state (ranges, Select and Deselect, scope), tested.
- `lib/tasks/bulk-copy.ts`: the toast lines, pure and tested.
- `app/(app)/tasks/task-picks.tsx`: holds the picks in React, clears them for good on a new scope, and handles Esc.
- `app/(app)/tasks/bulk-bar.tsx`: the bar's composition for this page.

The first build's `pick-box.tsx` and `CheckboxMark`'s `mixed` go (D2, D7).

Nothing is invented. Picking with Cmd-click and Shift-click is Asana's and Finder's; the Select words on section headings are Photos'; `x` is Gmail's and Linear's; long-press to start on a phone is Gmail's and Todoist's; the bar of edits is ClickUp's and Asana's.

### Tests and the device check

- `bulk-copy.test.ts`: every toast line, singular and plural, under 90 characters at 400 tasks with every skip its edit can make, and its phone line within 30 characters.
- `list.test.ts`: the bulk patch.
- `content.test.ts`: the take-off-and-give-back case.
- `bulk.pg.test.ts` (on a local scratch copy): a status change across a repeating task, a task in Review and a stale row, then its Undo; Waiting's reason; an Undo that leaves a task moved since; an assign with a stale row and the email count, then its Undo; a property move keeping and dropping units, then its Undo; a deleted task; and 400 tasks timed.
- `picks.test.ts`: ranges both ways, Shift on a picked row, no anchor, Select and Deselect, and a new scope that stays clear when you go back.
- `npm run typecheck`, `npm run lint`, `npm test`, then `npm run test:devices` and `npm run test:devices:dark`.
- By hand at 320, 375, 768, 1280 and 1920: Cmd-click and Shift-click with a mouse, long-press in WebKit (no link preview, no text selection), tap-to-pick, the bar's fit, each picker as a popover and as a sheet, the Delete dialog, the toast above the bar, the faint check, and Esc closing one layer at a time.

## 6. Copy

All one line, under 90 characters, no em dashes. "1 task" and "3 tasks" throughout. The news fits beside Undo in a laptop toast (about 40 characters); under 375px it shortens to about 30 ("Moved 2 of 3 to Fri Nov 20").

| Where | Words |
|---|---|
| Bar | "3 selected" ("3" on a phone), Status, Assignee, Due date, Property, Delete, Clear |
| Page header while picking | "Select all 42" ("Select all" on a phone), "Deselect all" |
| Group headings while picking | "Select", "Deselect" |
| Screen reader names | "Select all at 767 Prospect Avenue", "Deselect all for Zack", "Clear 3 selected", a picked row's "Mud Drywall, selected"; each row's hint "Press X to select" ("Long-press to select" on touch); the count "3 selected", then "Selection cleared" |
| Picker titles | "Status · 3 tasks", "Assignee · 3 tasks", "Due date · 3 tasks", "Property · 3 tasks" |
| Status steps | "What's it waiting on?" with "Set 3 to Waiting"; "Visit date" |
| Status toast | "3 tasks set to Waiting"; with a skip "2 of 3 tasks set to Waiting" · "1 changed since" |
| Assignee toast | "Assigned 3 tasks to Zack" · "Zack gets 3 emails" (only when job emails went); "Assigned 3 tasks to you"; "Unassigned 3 tasks" |
| Due date toast | "Moved 3 tasks to Fri Nov 20"; "Date removed from 3 tasks" (the single toast's "Date removed") |
| Property toast | "Moved 3 tasks to 118 Congress St."; "Property removed from 3 tasks" (the task page's "Property removed") |
| Skips, after " · " | "1 is closed", "1 changed since", "1 needs a visit date", "1 was deleted", "1 couldn't change"; several join with commas ("2 are closed, 1 changed since") |
| Nothing changed | "Nothing changed" · "3 changed since" |
| Undo, when some couldn't go back | "Put back 2 of 3 tasks" · "1 changed since"; "Couldn't put it back" or "Couldn't put them back" |
| Delete | "Delete 3 tasks?", "They go for good, with their notes, checklists, activity and files." ("It goes for good, with its notes, checklist, activity and files." for one), "Delete 3 tasks"; then "Deleted 3 tasks", or "Deleted 2 of 3 tasks" · "Try the other one again" |
| Failure | "Couldn't save. Try again or reload the page." (`GENERIC_ERROR`) |

## 7. Build order

The server side, the bar, the toasts and long-press are built (section 10). The rework:

1. Picking without boxes: Cmd-click, Shift-click and `x` in `TaskRow`, the picked look and notch, Select and Deselect on the headings, Select all in the header; drop `pick-box.tsx` and `CheckboxMark` `mixed`.
2. The Done circle's faint check.
3. The bar's 720px switch and the Delete wording.
4. The review's confirmed findings.
5. Docs: rows in [docs/components.md](../components.md) for each extended component, and section 10 brought up to date.

## 8. References

- Connor's Asana screenshot (Nov 20): five tasks picked without boxes, a bar of edits, faint checks in the circles. [Asana's list on Mobbin](https://mobbin.com/screens/e9d9ffd6-5b60-48a0-a5dd-daf889336ea5) shows the circles.
- [ClickUp, tasks picked with the bar of edits](https://mobbin.com/screens/e9639493-e0a6-46c9-93d1-d3189cbdc3c7): the bar's pattern (D1).
- [Todoist on iPhone, picking with an icon bar](https://mobbin.com/screens/37b98570-ce82-4a2a-85fa-fec229b639d5): icons on a phone (D4) and long-press.
- Apple Photos' select mode: Select on each section's heading, and Select All at the top (D7). Mobbin doesn't carry Apple's own apps.
- Gmail and Linear: `x` picks the focused row (call 4).
- [React Aria `useLongPress`](https://react-spectrum.adobe.com/react-aria/useLongPress.html): long-press on touch.
- docs/brand-guidelines.md: `--select` for bulk-selected rows, principle 6, the sidebar's notch, `--ok` and `--ok-tint`.

## 9. Not in this

- Bulk edit on Home's Today and the property page (D9).
- One combined email for several jobs, and a switch to reassign without emailing (D8). A quiet reassign, if wanted, belongs in both pickers at once.
- Picking tasks that aren't on screen ("Select all 230 that match") (D7).
- Unit and Repeat in the bar (D3).
- Cmd-A to pick everything (it would take over selecting text).

## 10. What the build changed

Built on Nov 20 after Connor's "build it" on the rework, nothing committed yet:

- **Picking:** Cmd-click, Shift-click, `x` and Shift-x, long-press and tap-to-pick, the `--select` fill with its notch, Select and Deselect on the headings, and Select all beside New task, all checked in the browser at 320, 375, 768, 1024 and 1280. The first build's pick boxes (`pick-box.tsx`, `CheckboxMark` `mixed`) are gone. With them goes a bug they had: the Done circle's 44px tap area covered the margin box, so a click meant to pick could mark a task done.
- **The Done circle:** the faint green check on hover and keyboard focus.
- **Server:** `bulk-core.ts` with per-task savepoints, its wrappers in `bulk.ts`, and the server actions. A 400-task status change took 1 to 2 seconds locally. `react-aria` was already pinned on main, so the old call to add it was moot.
- **First review:** a five-part review of the first build, with three skeptics per finding, held up 30 of 36 findings. Fixed:
  - A move to a task's own building cleared its unit.
  - Undo of an assign left tasks that had imported names.
  - Waiting and Scheduled overwrote a reason or date set since, and so did their Undo.
  - Repeat copies were locked out of order.
  - The first email fix dropped a needed "assigned you".
  - A doubled period in one toast.
  - Bare "couldn't change" toasts.
  - Picks came back on returning to an earlier filter.
  - Group headings split during a save.
  - The bar covered Show more and faded while the list loaded.
  - The bar hid under a tablet keyboard and its picker lost its anchor.
  - Labels overflowed, and the phone's count was squeezed out.
  - Esc during a busy Delete cleared everything.
  - Pickers reopened by themselves.
  - Plus the missing tests.
  
  Two findings were about the margin box, which no longer exists.
- **Second review** (six parts on the rework, 31 of 35 findings held up, about 18 distinct, none high). Fixed:
  - Picks of rows that left the list are dropped, so they come back unpicked.
  - Select all sits right beside New task, at its height, so nothing moves below 360px.
  - Screen readers hear "Press X to select" on a laptop and "Long-press to select" on touch, and each row names its `x` shortcut.
  - Holding `x` picks once.
  - Cmd-Enter and Shift-Enter on a focused row open a new tab or window again.
  - A bulk date's Undo leaves dates changed since.
  - An assign's Undo leaves a task someone unassigned since, imported name and all.
  - Skip reasons moved to the toast's second clause so the news isn't cut.
  - Singular Delete and Undo wording.
  - The bar's count is announced from the first pick.
  - Delete has the danger look and a confirm button the size of Cancel.
  - The bar lines up with the list on wide screens.
  - Three-digit counts fit at 320.
  - Undo after a change that emptied the list shows the rows again.
  - Docs, and the brand guidelines' notch rule.
- **Drafts from Claude** (Nov 20, [tasks-from-claude.md](tasks-from-claude.md)): a draft row is never picked. Bulk edit, its Undo and bulk delete pass a draft over as if it were gone, and a delete that reaches nothing reads "Nothing changed".
- **Delete** says "They go for good, with their notes, checklists, activity and files.", the task page's own wording.
