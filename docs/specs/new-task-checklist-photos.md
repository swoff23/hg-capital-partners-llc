# New task: checklist and photos

Planned with Connor on Nov 22, 2026, one question at a time (Q1 and Q2 below). Mockups live in [new-task-checklist-photos/](new-task-checklist-photos/). He said "build it" the same day; section 8 lists where the build differs from this plan.

## 1. Summary

**Why.** New task takes a title, notes and the chip row (Assignee, Due, Status, Property). A checklist only appears when Missing info's Make task fills one in, and you can't edit it. Photos can only go on once the task exists, through the comment box. So a task for a contractor goes out thin, and the rest follows as comments. The contractor's job email already carries the notes, the checklist and HG Capital's photos ([contractor-job-emails.md](contractor-job-emails.md) section 1), so what's on the task when it's made is what reaches them first.

**What changes.**

- New task gets two sections between Notes and the chip row, shown on every new task: **Checklist** with **Add item**, and **Photos and files** with a **+** tile (Q1).
- Photos, videos and files start uploading the moment they're picked. **Create task never waits on them**: files still going when you press it land on the task as they finish (Q1 drawing).
- What you add here is **Shared**: the contractor on the job sees it, including one assigned later (Q2).
- The checklist and photos are kept with the form's draft, cleared by Discard and by Create more.

One small migration: the table that holds a new task's files until Create (section 5).

## 2. Decisions

| # | Decision | Drawing |
|---|---|---|
| Q1 | **B, both sections always show.** Under Notes: Checklist (an Add item row) and Photos and files (a + tile), then the chip row. Connor picked B over my A (two buttons that open each section), accepting that on an iPhone SE the chip row sits under the keyboard while you type. Once filled: unticked items, Add item under them, photo tiles with a remove X and the + at the end of the row. Enter adds the next item; a pasted list becomes one item per line | [01](new-task-checklist-photos/01-placement.svg) |
| Q2 | **A, Shared, no switch.** Everything on New task is the job as the contractor gets it. With nobody assigned yet, whoever gets the job later sees the photos too, like a resident's request photos. Something private, such as a quote with prices, goes in an internal note on the task once it's made. Not B (the comment box's Shared or Internal switch on the section) | [02](new-task-checklist-photos/02-who-sees-photos.svg) |

## 3. How it behaves

### 3.1 The form

Top to bottom: the context Tag (as today), Title, Notes, **Checklist**, **Photos and files**, the chip row, Permission to enter (as today). The sheet and the `/tasks/new` page get the same sections.

**Checklist.** The heading, then the items, then Add item.

- Each item is the task page's row: a round box (not tickable here, since nothing has happened yet), the words, and a ⋯ menu with **Delete item**. With a mouse the ⋯ shows on hover; on touch it stays, as on the task page. Click or tap the words to change them; Enter saves, Esc puts them back.
- **Add item** is the task page's row: Enter adds the item and keeps focus there for the next one. A blur adds what's typed. Esc empties it.
- **Pasting several lines** into Add item makes one item per line, blank lines dropped.
- Up to 300 characters an item (`CHECKLIST_ITEM_MAX`, today's "Shorten the item to 300 characters.") and 100 items ("A checklist holds up to 100 items.").

**Photos and files.** The heading, then a row of tiles ending in the **+** tile.

- **+** opens the picker. It takes what the comment box takes: photos, videos and files (PDFs, quotes), at today's sizes (`UPLOAD_RULES`). On a phone the system picker offers the camera, the library or a file.
- **With a mouse,** dropping files anywhere on the sheet adds them, and pasting an image into any field adds it (the comment box's paste).
- A tile is today's `UploadTile`: progress while it goes up, a red tile with Retry when it fails, and the remove X on every tile. Removing one before Create deletes it for good; nothing is left anywhere.
- The row wraps to more rows as tiles are added (it's a tray, not a row of controls). Up to 50 files; the 51st gets a refused tile, "Add up to 50 here. Add more on the task."

### 3.2 Create task

- Create sends the title, notes, chips and checklist as today, plus which uploads are this form's.
- **Files already up** become the task's files in the same save. **Files still going** keep going after the sheet closes, on the app's upload queue as every upload does now, and join the task as each finishes. A file that fails after that keeps its Retry in the queue, which opens the new task.
- The files are **Shared** with no contractor of their own (`audienceContactId` null), so any contractor on the job sees them, today's or a later one (Q2). This differs from a comment's file, which stays with the contractor it was sent to.
- They add no Activity line of their own. They show in the task's Photos and files, and the job email carries them as it carries HG Capital's photos today. The email waits 3 quiet minutes before it goes (`BUNDLE_QUIET_MS`), so photos that finish in that time are in it.
- The toast stays "Task created · Open".

### 3.3 Drafts, leaving and Create more

- Adding an item or a file makes the form dirty, so X, Cancel and Esc ask first, as they do for typed words.
- **Leave the new task?** keeps the draft as today. The draft holds the checklist and the form's files, and opening New task again brings the tiles back. Files still going keep going while you're away.
- **Discard changes** and **Clear** on the draft line delete the form's files.
- **Create more** clears the checklist and the files for the next task.
- Files on a draft that is never sent are deleted once the draft has expired (`DRAFT_MAX_AGE_DAYS`, 7), by the every-minute run.

### 3.4 Make task (Missing info)

Its items lead the checklist, as today: the words can't be changed or deleted here, and the line "Each ticks itself once it's filled in." sits under them. Your own items go below them through Add item, and work like any other item. Today the Make task list is read-only with nothing to add.

### 3.5 Sizes

| | Laptop 1280 | Tablet 768 | Phone 375 |
|---|---|---|---|
| Sheet | The 672px dialog, growing as items and tiles are added, then scrolling; Create task stays at the bottom | The same dialog with the touch layout: 44px rows and tiles | The bottom sheet, full height. The chip row sits under the keyboard on an iPhone SE while you type (Q1) |
| Checklist | ⋯ on hover | ⋯ always shown | ⋯ always shown |
| Photos | Drop on the sheet, paste, or + | + | + opens the camera, the library or a file |

At 320 nothing drops: the headings are two short words, and the tile row wraps.

## 4. Defaults I picked (not drawn; say if any is wrong)

- **Repeats copy the checklist, not the photos,** as they do today (`createNextRepeat` in `src/lib/tasks/core.ts`). A repeating task's photos stay on the first one.
- **No reordering** of items here or on the task page; they keep the order they were added in.
- **Items can't be ticked on New task.** The box is there so the list looks the way it will on the task.
- **The Checklist and Photos headings carry no count.** The task page's "Checklist 2/5" starts once the task exists.

## 5. Reuse check

| | What | Where |
|---|---|---|
| Reused | Form, sheet, footer, Create more, drafts, leave guard | `src/components/create-form.tsx`, `form-sheet.tsx`, `use-draft.ts` |
| Reused | Picking, checks, thumbnails and posters, tiles, Retry, the queue that outlives the page, the IndexedDB outbox | `src/components/media-uploader.tsx` (`useMediaUploader`, `MediaUploadTray`, `UploadTile`), `upload-queue.tsx`, `src/lib/attachments/outbox.ts`, [uploads-photos.md](uploads-photos.md) |
| Reused | Paste into a field adds the file | the composer's `onPaste` (`src/components/composer.tsx`) |
| Reused | Files held until the thing they belong to exists, then attached by the save | the resident request form's `ResidentUpload` and `attachUploads` (`src/lib/residents/requests.ts`, [maintenance-requests.md](maintenance-requests.md) section 10) |
| Reused | Checklist written in the create save | `createTask` already takes `checklist` (`src/lib/tasks/core.ts`), today fed by Make task only |
| Reused | Limits and messages | `CHECKLIST_ITEM_MAX`, `checklistItemText` (`src/lib/tasks/limits.ts`, `limits-schema.ts`) |
| Reused | The every-minute run | `src/app/api/cron/notifications/route.ts`, beside `sweepDiscardedDrafts` |
| Extended | The task page's checklist row and Add item, split out so New task can hold items in the form while the task page keeps its saves. Add item learns the pasted list. Both pages use the one copy | `src/app/(app)/tasks/[id]/checklist.tsx` |
| Extended | A drop zone over the whole sheet, the composer's drop handling with its own target | `ComposerDropZone` (`src/components/composer.tsx`) |
| Extended | `newTaskSchema` and the `createTask` action take the checklist (JSON of strings) and the form's id | `src/lib/tasks/new-task-schema.ts`, `src/app/(app)/tasks/new/actions.ts` |
| New | A `new-task-upload` kind (staff only, the signed-in person's own form) | `src/lib/attachments/upload-kinds.ts`, `/api/blob/[kind]` |
| New | `NewTaskUpload`: a form's files until Create (like `ResidentUpload`), keyed by the person and a form id the browser makes per new task; and a record of which task a form made, so a file that finishes after Create attaches to it. RLS on both, per README | `prisma/schema.prisma`, one migration |
| New | Sweep of files on drafts past 7 days | `src/lib/tasks/service.ts` |

References behind the two sections: Bonsai's task form with Files and Subtasks sections ([Mobbin](https://mobbin.com/screens/198fee93-c149-4525-86f4-615da0629953)), Jira's create form with its Attachment drop area ([web](https://mobbin.com/screens/c7c3eef7-ece0-4080-92a6-396c2a2c026b), [iOS, uploading in the form](https://mobbin.com/screens/5ba7c350-17f9-4829-a2ce-4855c77b61ca)), ClickUp's Checklists and Attachments sections ([Mobbin](https://mobbin.com/screens/5949a09c-acf0-4a7d-b71c-2df75718836c)), and Linear's new issue, where Enter in a list adds the next item ([Mobbin](https://mobbin.com/screens/0c122770-6675-407e-bed2-cba3a6cfaaa8)).

## 6. Build order

1. **Files before the task exists.** The kind, `NewTaskUpload` and the form record, the record step, Create attaching what's up, late files attaching as they land, removal, the 7-day sweep, the migration with RLS. Unit and Postgres tests beside the resident ones.
2. **Checklist.** Split the task page's row and Add item; the New task section; the pasted list; the checklist in the draft and in `createTask`; Make task's items ahead of yours.
3. **Photos and files.** The section on `useMediaUploader` with the new target, drop on the sheet, paste, the tiles in the draft, Discard and Clear deleting them, Create more clearing them.
4. **Check.** `npm run check`; `npm run test:devices` in light and dark; open New task at 320, 375, 768, 1280x800 and 1920 with items, tiles, a failed tile, the 51st file, Make task, a restored draft, and a late file finishing after Create.

## 7. Not in this

- **Internal photos on New task** (Q2). They go in an internal note on the task.
- **Saved checklists** to pick from (a turnover list, say). Playbooks (`TaskTemplate`) already make whole sets of tasks; a saved list for one task is a later idea if retyping gets old.
- **Ticking, assigning or dating items** on New task.
- **Claude's tasks** (`docs/specs/tasks-from-claude.md`) keep their own way of adding a checklist and files.

## 8. As built (Nov 22)

- **The files hang from the task's "created" line.** A staff file on no line is a comment box draft to the app (`lib/tasks/media.ts` `isDraftUpload`), hidden from the task's grid and its zip. On the created line they show in Photos and files, the zip, the contractor's job page and the job email as posted files, and Activity adds no line for them.
- **Two tables, not one.** `NewTaskUpload` holds a form's files; `NewTaskForm` records the task a form made and its created line, so a file that finishes after Create attaches as it's recorded. Create and the record step both take the form's lock (`lib/tasks/new-task-files.ts`), so a file landing at the same moment is attached by one of them. Tested on Postgres in `new-task-files.pg.test.ts`.
- **The add tile is the stock tray's,** a solid `--muted` square with the photo-plus icon, not the drawing's dashed +. The tray never draws dashed slots (`MediaUploadTray`), so the drawing's tile was a sketch of it. Its name is "Add photos, videos or files" (`addLabel`, new).
- **The task page's Add item takes a pasted list too,** one item per line in one save (`addChecklistItems`), since both pages now share the rows and Add item (`app/(app)/tasks/checklist-rows.tsx`).
- **Create more and Clear differ only in what happens to the files.** After Create more they're the task's and stay; Clear and Discard drop the ones still going and delete the held ones (`CreateForm` `onDiscard`, new).
- **Not proven yet:** a real upload. No local env has a Blob token, so the local run stopped at the token route (the tile waits with "No signal", as every upload surface does locally). The record and attach rules are covered on Postgres; the first real photo on New task in production is the proof, the same as the resident form's.

