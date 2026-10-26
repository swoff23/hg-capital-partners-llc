# Build plan: the six component specs

Connor approved the six specs on Oct 25: "Build it: all six component specs, with every recommendation, including the smaller asks." This plan turns them into one sequential phase 0, nine parallel packages and one merge phase. Connor's answers and the reconciliation notes come from `approval/approved.md`. Where a spec and this plan disagree, section 4 of this plan decides.

| Key | Goes in the repo as | Source in the scratchpad |
|---|---|---|
| Selectors | `docs/specs/selectors.md` | `selectors/selectors-spec.md` |
| Forms | `docs/specs/forms-editing.md` | `specs/forms-editing.md` |
| Activity | `docs/specs/activity-comments.md` | `specs/activity-comments.md` |
| Uploads | `docs/specs/uploads-photos.md` | `specs/uploads-photos.md` |
| Search | `docs/specs/search.md` | `specs/search.md` |
| Charts | `docs/specs/charts.md` | `specs/charts.md` |

**Base.** Main after the brand rollout and its close-out land tonight. The specs were read at `c2480a1`. The first visual-review fix pass is committed as `2d64a7e` on `claude/app-uiux-review-mobbin-e2e22f` and ships these, so nobody rebuilds them: the Sheet `footer` slot, the token `Checkbox` in `ui.tsx`, the Settings editors saving through `callAction`, tap-to-reveal delete on move-in items, the Documents "Add document" row, the Portfolio strip with Equity, Loan balance and LTV, red only for CapEx past its replacement age, and the date rule (Tomorrow, a weekday, then the date). Still uncommitted in that worktree (67 files) are a second pass (among them `ui.tsx`, `config.ts`, `deals/service.ts`, `due-date-picker.tsx`, `assignee-picker.tsx`, `task-row.tsx`, `job-actions.tsx`) and the NOI below-the-line fix (`quickbooks/*`, `properties/[id]/financials.tsx` and migration `20261025200000_noi_below_the_line_expense`). Both must be on main or set aside before phase 0 records its base. What the second pass adds is reused, not rebuilt: if they land, `DEAL_STAGE_LABEL` extends its `dealStatusLabel` map, the field trigger of `EntityPicker` and `DatePicker` is its `pickerField`, and "Add unit" and "Add item" rows are its `AddRow`. Every agent re-reads its files at the base commit before building.

**Branches.** Phase 0 commits on `build-base` from main and tags it `build-base-0`. Each package builds on `build-<key>` from that tag, and its repair goes on `build-<key>-r`. Phase 2 merges into `build-integration`, which lands on main.

## 0. Rules for every agent

- Work only in your own worktree and branch. Run `npm ci` once in it (its `postinstall` runs `prisma generate` against the base schema); never `npm install <package>`. Edit only the files section 3 gives your package. Everything else is read-only.
- Token utilities only. The close-out deletes the one-release aliases, so use `text-fg-1`, `text-fg-3`, `bg-fill-1`, `border-line`, `bg-act`, `text-on-act` and the type tokens (`text-body`, `text-meta`, `text-label`), never `text-foreground`, `text-muted`, `bg-background`, `border-border`, `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-sm` or `text-xs`.
- This is Next 16. Read the guide in `node_modules/next/dist/docs/` before using parallel or intercepting routes, `after()` or `viewport` (AGENTS.md).
- Services own writes. Env only through `src/lib/env.ts`. Dates through `lib/dates.ts`, money through `lib/money.ts`, addresses through `lib/normalize.ts` (README). No schema change and no new dependency outside phase 0. A need for either goes in the report.
- Reuse first (CLAUDE.md). Build on phase 0's primitives and contracts. Never fork a copy.
- Contracts are frozen. Their owner may add optional props, never rename, retype or remove one. The same holds for every export another package imports at `build-base-0` (actions, services, components, types): its name and signature stay through phase 1, and removals wait for phase 2's clean-up. A needed break goes in the report for phase 2.
- Ask before visual changes (CLAUDE.md). Build what a spec or this plan says. Anything visual that neither covers goes in the report as a question for Connor, not in the code.
- Only CH edits `src/app/globals.css`. Everyone else styles with Tailwind variants in their own files (`print:`, `aria-*:`, `pointer-coarse:`); a need for a global rule goes in the report.
- No em dashes in UI strings (lint). One-line copy, no filler, warm and plain (CLAUDE.md).
- Phase 1 never runs the device check, starts a server, runs a migration, writes to a database, installs Playwright browsers (the shared cache can drop another project's browsers) or pushes. The device check uses one fixed port (3100) and runs after the merge.
- Commit on your branch with a plain title, a body saying what changed and the references used, and the attribution line. Never edit or bypass `scripts/device-check-gate.mjs`. If the hook blocks the commit, leave the tree as it is and say so in the report: the orchestrator stages it (`git add -A`, never a commit) and saves `git diff --cached build-base-0` as `<key>.patch`, which phase 2 applies with `git apply --3way` in place of a merge. Nothing reaches main before phase 2's full device run, and that landing commit goes through the hook.
- Report: branch and commit (or patch), files changed, spec items built and left, hand-overs delivered, `docs/components.md` rows written out in the report (not in the file), device states added, routes for `tests/devices/routes.ts`, check results, and every file you changed that is on the task migration session's list (section 3).

## 1. Phase 0: one worktree, sequential

**Owner.** One agent in one worktree. It is the only phase that edits `prisma/`, `package.json`, `package-lock.json`, `src/components/ui.tsx`, `src/lib/config.ts`, `src/lib/normalize.ts`, the `(app)` and portal layouts and, until phase 2, `docs/components.md`. The device port is free while it runs, so it runs the full device check itself.

**Start conditions.**
- The brand rollout and close-out are on main, and so are the second fix pass and the NOI fix, or they are set aside. Record the base commit and which of them it holds.
- No other session is landing or migrating the shared local database. Ask the task migration session (`ListAgents`, then `SendMessage`) for any edits it has in flight or planned in the files on its list (section 3), and send it that list so it holds off on them until phase 2 step 6. Hold phase 0 until it answers.
- The local Postgres has the import loaded.
- The device check runs on the Playwright browsers already in the shared cache. If `npx playwright install` is unavoidable, check after it that ib-sandbox's browsers are still in the cache.
- Send Connor the shared-loan question (section 6) now, so a yes can ride in this migration.

### 1.1 Schema: one combined migration

Every schema ask the six specs approve, nullable or defaulted only. Create it with `npx prisma migrate dev --create-only --name component_specs_batch`; its folder must sort after every migration on the base (after `20261025200000_noi_below_the_line_expense` if that landed). Read the SQL, add the RLS line and a header comment (why, additive, no backfill in SQL, the enum note below, roll forward only), then apply locally and run `prisma generate`. If the production copy used for the Asana schema batch still exists, run `migrate deploy` against it first. How production gets it is phase 2 step 7.

| # | Change | Spec | Null or default | Notes |
|---|---|---|---|---|
| 1 | `Property.updatedByUserId`, FK to User, on delete set null | Forms, question 3 | Nullable | Written by every Property write in `lib/properties/service.ts`. Conflict lines name the person |
| 2 | `Deal.updatedByUserId`, FK to User, on delete set null | Forms, question 3 | Nullable | Written by `patchDeal` and `createDeal` |
| 3 | `DealNote.authorUserId`, FK to User, on delete set null | Activity, question 1 | Nullable | Old notes get it from the backfill script (after landing) |
| 4 | `DealNote.data` Json | Activity, question 1 | Default `'{}'` | A change entry: `{ field, from, to }`. A constant default, so the add is a catalog change |
| 5 | `DealNote.editedAt` | Activity, question 1 | Nullable | |
| 6 | `DealNote.deletedAt` | Activity, question 1 | Nullable | Soft delete |
| 7 | `TaskEventKind` gains `REPEAT` | Activity, question 1 | Enum value | Postgres can't use a value in the transaction that adds it (55P04), so no statement in this file may reference `REPEAT`; say so in the header, as `20261023000000_task_status_values` does |
| 8 | `PropertyAttachment.uploadedByUserId`, FK to User, on delete set null | Uploads, question 2a | Nullable | Rows from before show the date alone |
| 9 | `Property.photoUrl`, `Property.photoPathname` | Uploads, question 2b | Nullable | Public Blob |
| 10 | `TaskTemplate.finishPhotosRequired` Int | Uploads, question 2c | Nullable | Null or 0 means optional |
| 11 | New table `RecentView` and enum `RecentKind` | Search, question 3 | New table | `ALTER TABLE "RecentView" ENABLE ROW LEVEL SECURITY;` in the same migration, never `FORCE` (README). Unique on (userId, kind, recordId), index on (userId, viewedAt), FK to User on delete cascade |

Safe to deploy: every change adds; nothing drops, renames, retypes or tightens. Today's code runs on the new schema, so the migration can go first. One limit: once a `REPEAT` event exists, a build from before this batch can't read that task's events, so after landing the app rolls forward, never back past it.

The comment on `Deal.ourPrice` changes to "HG's target offer", Connor's answer. The column and the `ourPrice` sort key in URLs stay.

**Prisma schema edits**

```prisma
model User {
  // existing fields stay
  recentViews                 RecentView[]
  updatedProperties           Property[]           @relation("PropertyUpdatedBy")
  updatedDeals                Deal[]               @relation("DealUpdatedBy")
  dealNotes                   DealNote[]           @relation("DealNoteAuthor")
  uploadedPropertyAttachments PropertyAttachment[] @relation("PropertyAttachmentUploadedBy")
}

model Deal {
  ourPrice        Decimal? @db.Decimal(12, 2) // HG's target offer ("Target offer" in the UI)
  updatedByUser   User?    @relation("DealUpdatedBy", fields: [updatedByUserId], references: [id], onDelete: SetNull)
  updatedByUserId String?
}

model DealNote {
  author       User?     @relation("DealNoteAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)
  authorUserId String?
  data         Json      @default("{}") // a change entry: { field, from, to }
  editedAt     DateTime?
  deletedAt    DateTime?
}

model Property {
  photoUrl        String?
  photoPathname   String?
  updatedByUser   User?   @relation("PropertyUpdatedBy", fields: [updatedByUserId], references: [id], onDelete: SetNull)
  updatedByUserId String?
}

model PropertyAttachment {
  uploadedByUser   User?   @relation("PropertyAttachmentUploadedBy", fields: [uploadedByUserId], references: [id], onDelete: SetNull)
  uploadedByUserId String?
}

model TaskTemplate {
  finishPhotosRequired Int? // photos Mark done asks for; null or 0 is optional
}

enum TaskEventKind {
  // existing values stay
  REPEAT // repeats turned on, changed or off
}

enum RecentKind {
  PROPERTY
  DEAL
  TASK
  CONTACT
}

model RecentView {
  id       String     @id @default(cuid())
  user     User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId   String
  kind     RecentKind
  recordId String
  viewedAt DateTime   @default(now())

  @@unique([userId, kind, recordId])
  @@index([userId, viewedAt])
}
```

**Not in this migration, on purpose**

- Uploads 2d (W-9 and COI files and `coiExpiresOn` on Contact). Its own recommendation, which Connor approved, ties it to the admin spec. The selectors "Needs W-9" chip ships now on the existing `Contact.w9Url`.
- A link between 765 and 767 Prospect for the shared loan (charts, question 1). Connor approved the recommendation, but it needs a column no spec listed. It rides here only on his yes (section 6).
- The `Deal.status` default and the other step 11 items in `config.ts` and the refactor notes. They wait for Connor's per-item OK.
- `unaccent` and `pg_trgm` (search step 5, later).

### 1.2 Dependencies (phase 0 is the only package.json owner)

| Package | For | Rule |
|---|---|---|
| `heic-to` (libheif in WebAssembly) | Uploads, question 6a | Loaded with a dynamic import only when `createImageBitmap` can't read a HEIC file going to a listing or the property photo, which means a desktop browser. Never in the main bundle. libheif is LGPL-3.0, so it ships unmodified as its own lazy chunk and the commit says so. `heic2any` is the fallback, same license |
| `client-zip` | Uploads, question 6b, Download all | MIT, no dependencies, streams a `Response` from an async iterable inside a route handler |
| pdf.js | Not added | Uploads, question 6c is no |

Check each package's current version, license and upkeep before adding it. Install with npm in the repo's caret style and commit `package-lock.json`.

### 1.3 Moves and splits (no behavior change; importers updated)

Each move gives a file one phase 1 owner. Without it, two packages would edit one file, or one would break the other's imports. A move that only one package's files need is left to that package (1.9).

| From | To | Phase 1 owner |
|---|---|---|
| `tasks/[id]/files-list.tsx` | `components/files-list.tsx` | UP1 |
| `properties/[id]/record-ui.tsx` | `components/rail.tsx` | F1 |
| `tasks/[id]/use-run.ts` | `components/use-run.ts` | F1 |
| Body of `tasks/[id]/composer.tsx` | `components/composer.tsx`; a thin wrapper stays at the old path | AC |
| `FailedUploadsLine` from `p/jobs/[id]/_components/job-actions.tsx` | `components/media-uploader.tsx` as `UploadStatusLine` (uploads 2.3) | UP1 |
| `SourceLine`, `WarnMark`, `Notice` from `financials/_components/ui.tsx` | `components/source-line.tsx` | CH |
| `financials/_components/period.ts` and its test | `lib/quickbooks/period.ts` | CH |
| `DealStage`, `DealStageMark` from `deals/stage-select.tsx` | `components/deal-stage.tsx` | Frozen |
| `RowCell` from `properties/page.tsx`, `grandTotalRow` from the financials ui | `components/ui.tsx` (CH alone uses `grandTotalRow`, but `ui.tsx` is frozen after phase 0) | Frozen |
| `addDealNote` from `lib/deals/service.ts`, signature unchanged | `lib/deals/notes.ts` | AC |
| `diffDeal`, the change logging in `patchDeal` and `createDeal`'s "Deal created" line | `lib/deals/log.ts` as `recordDealChanges(dealId, actor, before, data)` and `recordDealCreated(deal, actor)`, which the service calls. `logDealChanges` and `logDealTaskEvent` stay | AC |
| `recordPropertyAttachment`, `deletePropertyAttachment` from `lib/properties/service.ts` | `lib/properties/documents.ts` | UP1 |
| `recordTaskAttachment`, `contractorUploadRefusal`, `recordPortalAttachment`, `deleteTaskAttachment` from `lib/tasks/service.ts` | `lib/tasks/attachments.ts` | UP1 |
| `recordJobUpload` from `lib/portal/jobs.ts` | `lib/portal/job-uploads.ts` | UP2 |
| `createDeal` from `deals/actions.ts` | `deals/new/actions.ts` | F2 |
| `addDealNote` from `deals/actions.ts` | `deals/[id]/note-actions.ts` | AC |
| `createProperty` from `properties/actions.ts` | `properties/new/actions.ts` | F2 |
| Attachment actions from `properties/actions.ts` | `properties/[id]/document-actions.ts` | UP1 |
| `createTask` from `tasks/actions.ts` | `tasks/new/actions.ts` | F2 |
| `recordTaskAttachment` from `tasks/actions.ts` | `tasks/upload-actions.ts` | UP1 |
| `recordJobUploadAction` from `p/jobs/[id]/actions.ts` | `p/jobs/[id]/upload-actions.ts` | UP2 |
| The Activity section of `deals/[id]/page.tsx` | `deals/[id]/deal-activity.tsx`, a server component that loads its own notes | AC |
| The Photos section of `tasks/[id]/view.tsx` | `tasks/[id]/task-media.tsx`, fed by `taskMedia()` in `lib/tasks/media.ts` | UP1 |
| The "Photos & videos" section of `p/jobs/[id]/page.tsx` | `p/jobs/[id]/_components/job-media.tsx` | UP2 |
| The header photo of `properties/[id]/page.tsx` | `properties/[id]/property-photo.tsx` | UP2 |
| The fact strip of `properties/[id]/page.tsx` | `properties/[id]/record-strip.tsx`, importing `FactStrip` from where it is today | CH |
| The Documents section of `properties/[id]/page.tsx` | `properties/[id]/documents-section.tsx`, a server component that loads attachments with their uploader | UP1 |
| The fact strip of `properties/page.tsx` | `properties/portfolio-strip.tsx`, importing `FactStrip` from where it is today | CH |
| The photo gallery in `properties/[id]/edit-listings.tsx` | `properties/[id]/listing-photos.tsx` | UP2 |
| The theme button and Sign out in `app-shell.tsx` | `components/account-menu.tsx` (`AccountMenu`, `AppearanceRow`) | S2 |

Paths without a prefix are under `src/app/(app)/`; `p/` is `src/app/(portal)/p/`; `components/` and `lib/` are under `src/`.

### 1.4 Shared primitives built in full

Small pieces that two or more packages call. Phase 0 builds them for real, so nobody builds against a guess.

| Piece | File | Spec | Used by |
|---|---|---|---|
| `Input` `size` (sm 32, md 36, 44 on touch), `prefix` and `suffix` slots | `ui.tsx` | Forms 2.1, selectors 3.7 | F1, F2, S2, SR |
| `Textarea` `autosize` (the `useAutosize` effect out of `inline-address-field.tsx`) | `ui.tsx` | Forms 2.1 | F1, F2, AC |
| `pickerChip` `row` (28px, 44 hit area on touch) and `sm` (32), `--fg-3` placeholder | `ui.tsx` | Selectors 3.12 | S1, S2, F1, F2, AC |
| `Spinner` (lucide `LoaderCircle`, after 200ms for at least 400ms; under reduced motion it shows without turning) and `Button` `pending` | `ui.tsx` | Forms 2.7, search 2.13 | All |
| `tagClass` | `ui.tsx` | Search 5, selectors 2 | S1, S2, SR |
| `CheckboxMark` (the fix pass's `Checkbox` stays for forms) | `ui.tsx` | Selectors 3.10 | S1, S2 |
| `FormField`, `FieldRow` (reading `fieldErrors`) | `ui.tsx` | Forms 2.2 | F1, F2, AC |
| `Section` `labelId`, so a section's contents can point at its heading | `ui.tsx` | Drop targets, the timeline, the chart group | UP1, AC, CH |
| `useModKey()`, "⌘" or "Ctrl" (the deferred platform Kbd helper) | `components/use-platform.ts` | Search 2.1, forms 2.9 | SR, S1, F1, F2, AC |
| `SearchInput` (`field` and `bare`, sm and md; Esc clears on a page and closes a layer) | `components/search-field.tsx` | Search 2.9 | S1, S2, SR, UP2 |
| Toast `key` and `detail` | `toast.tsx` | Forms 2.13 | All |
| `PopoverSurface` `motion` (`none` or `pop`) | `popover.tsx` | Selectors 2 | S1, SR |
| `pickContainer()`, read at press time | `use-coarse-pointer.ts` | Selectors 2 | S1, S2 |
| `Menu`: `selectionMode` and `selectedKeys` with the Check from `isSelected`, `current`, `MenuSection`, `shortcut`, `description`, a non-interactive header item. Typed with an interim no-op for S1 to finish: `numberKeys`, `sheetTitle`, `followUp` | `menu.tsx` | Selectors 3.5, activity 2.5 | S1, S2, F1, AC, UP1, UP2 |
| `Sheet`: a view stack with a back button beside the X, `size` md or lg, `fullHeight`, `dirty`, the keyboard inset, and `surface="public"` for its overlay root. Typed with an interim fallback for SR: `layout="palette"` | `sheet.tsx` | Forms 2.9, selectors 3.5, search 2.2, brand section 4 | All |
| `useKeyboardInset` (sets `--kb-inset` from `visualViewport`) and `viewport.interactiveWidget: "resizes-content"` exported from `(app)/layout.tsx` | `components/use-keyboard-inset.ts` | Forms 2.9, activity 2.7 | F1, F2, AC, UP2 |
| `Meter` (4px `--fill-1` track, `--chart-1` fill, square ends, progressbar with a label) | `components/meter.tsx` | Charts 2.3 | CH, F1, F2 |
| `DEAL_STAGE_LABEL` ("High", "Medium", "Low", "To schedule", "TBD", "Holding", "Closed", "Pass"; stored values unchanged; extends the fix pass's `dealStatusLabel` if it landed) and `DEAL_FIELD_LABEL` ("Asking price", "Target offer", "Stage" and the rest) | `lib/config.ts` | Selectors 3.5, integration decision 16, Connor's answer | All |
| `compareStreet` (street, then house number, so 15 comes before 118), with a test | `lib/normalize.ts` (README: addresses go through it) | Selectors 3.3 and 5 | S1, S2 |
| `parseNoteAuthor(body)`: the three pasted author forms ("(CS)", "  ·  Connor Swofford", "  ·  <label>") split off a note's text, with a test | `lib/deals/note-author.ts` | Activity 2.9, DEALS-044, DATA-I13 | S2 (Latest note), AC (record log, backfill) |
| `activityTime`, `fullStamp`, `historyDay` with tests | `lib/dates.ts` | Activity 2.4 | AC, UP1, UP2, F1, SR |

### 1.5 Contracts: final props, interim body, finished in phase 1

Larger pieces that another package must call before their owner finishes them. Phase 0 writes the exported names and prop types in full and an interim body that keeps today's behavior. The owner replaces the body in phase 1 without changing the props.

| File (under `src/`) | Exports and props | Interim body | Owner | Called by |
|---|---|---|---|---|
| `components/option-list.tsx` | `OptionList`: items or sections, pinned rows, one or many, counts, search from 10 options, empty line | `AssigneeList`'s body on tokens | S1 | S2 |
| `components/select.tsx` | `Select`: label, items or sections, value and onChange or defaultValue and name, placeholder, emptyLabel, size, leading mark, isRequired, isInvalid, errorMessage, isDisabled, `surface` | Native select on `fieldClass` | S1 | F1, F2, S2 |
| `components/combobox.tsx` | `Combobox`: items, value, onChange, `allowCustom` (the 'Add "…"' row), `multiple` | `Input` | S1 | F1, F2 |
| `components/entity-picker.tsx` | `AssigneePicker` (today's props plus `recent`, `meId`), `PropertyPicker`, `UnitPicker`, chip or field trigger, item builders for filter mode | Today's `AssigneePicker`; `Select` for the others | S1 | F2, S2 |
| `lib/picker-options.ts` | `propertyOptions()`: `{ id, label, address, photoUrl, units }[]` in `compareStreet` order, for every property picker and filter | Today's query from the task page, with `photoUrl` | S1 | AC (task page), F2 (New task, Apply), S2 (filters) |
| `components/status-menu.tsx` | `StatusMenu`: kind task or stage, value, onChange, hidden values, `followUp` | `Menu` with selection | S1 | S2, F1, F2 |
| `components/due-date-picker.tsx` | `DatePicker` (variant chip, row or field; `allowNone`; `label`; `withRepeat`; `surface`), `DateField`, `DatePanel`; `DueDatePicker` stays as an alias | Today's picker; a native date input for `field` | S1 | AC, F1, F2 |
| `components/switch.tsx` | `Switch`: label, isSelected, onChange | Checkbox with `role="switch"` | S1 | S2, F1, F2 |
| `components/segmented-control.tsx` | Adds `fullWidth` and a per-option `mark` | Today's control | S2 | AC, CH, F2 |
| `components/number-input.tsx` | `NumberInput`: kind money, percent, integer, year or decimal; `allowText`; suffix | `Input` with the slots and `parseAmount` on blur | F1 | S1, F2 |
| `components/form-sheet.tsx` | `FormSheet`: title, onSubmit, primary, `createMore`, dirty compare, the two-button discard question, form error line | `Sheet` with footer buttons | F1 | F2, AC, UP2 |
| `components/use-run.ts` | `useRun()` returns `pending`, `error`, `fieldErrors`, `conflict` beside today's `run` | Today's hook; the new fields undefined | F1 | S1 |
| `lib/action-result.ts` | `ActionResult` failures gain `fieldErrors?` and `conflict?` (forms 2.12); `ConflictError` (fields, by, at, theirs) | The types and a plain `Error` subclass; `withResult` maps it to today's message | F1 | F2, AC, UP1 |
| `components/use-draft.ts` | `useDraft(key, value, { maxAgeDays })` returns `{ restored, savedAt, clear }` | Returns nothing restored and stores nothing | F2 | F1 |
| `components/leave-guard.tsx` | `LeaveHold` gains `scope?: "all" \| "sign-out"`; several holds at once; `useLeaveGuard({ signOut })` for Sign out buttons | Today's single hold; `scope` treated as all | F2 | F1, UP1, S2 |
| `components/action-bar.tsx` | `ActionBar`: status, secondary, primary, error line | The job page's bar, extracted | F2 | UP2 |
| `components/address-combobox.tsx` | `AddressCombobox`: value, onChange, kind property or deal, duplicate line | `Input` | F2 | F1 |
| `components/composer.tsx` | `Composer`: draftKey, audience, visibility, uploader, onSend, pin, placeholders, sendLabel | Today's composer | AC | UP2 |
| `app/(app)/tasks/task-row.tsx` | `TaskRow` keeps today's props and adds `unread?` | Today's row | AC | S2 |
| `lib/tasks/read-state.ts` | `unreadTaskIds(userId, taskIds): Promise<Set<string>>`; `READ_STATE_SINCE`, the release time | An empty set | AC | S2 (through phase 0's wiring) |
| `lib/deals/log.ts` | `recordDealCreated`, `recordDealChanges` (1.3) | Today's text lines | AC | F1 |
| `components/upload-queue.tsx` | `UploadQueueProvider`, `useUploadQueue` (pending, waiting and failed per target), `useDropTarget(target, ref)`, `UploadTarget` | Pass-through provider, no-op hook | UP1 | AC, UP2 |
| `components/media-uploader.tsx` | `UploadKind` gains the property document, listing photo and property photo kinds (keys fixed here, matching the token route); `RecordMediaInput` gains `thumbPathname`, `posterPathname`, `queuedAt`; `useMediaUploader({ target })` beside today's options; `MediaUploadTray` `slots`; `UploadTile` `ready`; `UploadStatusLine` | Today's engine; new fields ignored | UP1 | AC, UP2 |
| `components/media-grid.tsx` | Adds `rows` (1 or 2), `variant="strip"`, `urlFor`, `groups` (At finish, Other photos) | Today's grid | UP1 | AC, UP2 |
| `components/lightbox.tsx` | Adds `urlFor`, `surface` (app, portal or public), a header override (public: street and rent), `menuItems` per item (listing actions, Set as property photo), `canEdit` | Today's viewer; new props ignored | UP1 | UP2 |
| `components/files-list.tsx` | Adds `byline` and `menu` flags | Today's list | UP1 | AC, UP2 |
| `lib/tasks/media.ts` | `taskMediaInclude`, `taskMedia()`, `orderMedia()`, `reviewPhotos()` | Today's order and today's count | UP1 | AC |
| `lib/property-types.ts` | `systemsDated(...)` returning `{ dated, total }` without placeholder rules; `projectedYear(item, rules)` | Today's count from `building-capex.tsx`; install year plus the replace age | CH | F1 |
| `app/(app)/properties/[id]/listing-photos.tsx` | `ListingPhotos`: value, onChange, max, onPendingChange; `ListingPhotoDraft`; `discardSessionUploads()` | Today's `PhotoGallery` | UP2 | F1 |
| `app/(app)/properties/[id]/property-photo.tsx` | `PropertyPhoto`: property (`id`, `address`, `photoUrl`), canEdit | Today's two `PhotoThumb`s, now showing `photoUrl` | UP2 | F1 |
| `app/(app)/properties/[id]/record-strip.tsx` | `PropertyFactStrip`: property, position | Today's strip | CH | F1 |
| `app/(app)/properties/portfolio-strip.tsx` | `PortfolioStrip`: properties | Today's strip | CH | S2 |
| `app/(app)/properties/[id]/documents-section.tsx` | `DocumentsSection`: propertyId | Today's section | UP1 | F1 |
| `app/(app)/deals/[id]/deal-activity.tsx` | `DealActivity`: dealId | Today's section | AC | F1 |
| `app/(app)/tasks/[id]/task-media.tsx` | `TaskMediaSection` | Today's section | UP1 | AC |
| `app/(portal)/p/jobs/[id]/_components/job-media.tsx` | `JobMediaSection` | Today's section | UP2 | AC |
| `components/account-menu.tsx` | `AccountMenu`, `AppearanceRow` | Today's theme button and Sign out | S2 | SR |
| `lib/list-memory.ts` | `LIST_COOKIES`, `readListHrefs()` | Plain hrefs | S2 | Phase 0's layout |

### 1.6 Mount points and data wiring

- `(app)/layout.tsx`: the `viewport` export, `LeaveGuard` around the shell, the `UploadQueueProvider` stub, the `modal` slot, and the list cookies read through `readListHrefs()` and passed to `AppShell`. Frozen afterwards.
- `(app)/@modal/default.tsx` returns null (Next 16 requires a default for every slot). F2 owns it afterwards.
- `app-shell.tsx` mounts `AccountMenu` and `AppearanceRow` and passes `listHrefs` to `SideNav`, which accepts it and falls back to plain hrefs. The `GlobalSearch` mount stays for SR to replace.
- `(portal)/p/layout.tsx`: `LeaveGuard` and the `UploadQueueProvider` stub. The job page's own `LeaveGuard` wrapper goes, so there's one context. Frozen afterwards.
- The four record pages (properties, deals, tasks and contractors `[id]`) call `recordView()` inside `after()`. The service is `lib/recent-views.ts`, built in full here: it upserts and keeps the newest 20 per person. SR owns it afterwards.
- `lib/tasks/list.ts` and `lib/tasks/queries.ts`: `ListTask` gains `unread` (from `unreadTaskIds`) and `repeat` (the rule, for the Repeats filter and the cadence subline); `todayTasks` and `allTasks` fill both, and `all-list.tsx` and `today-view.tsx` pass `unread` to `TaskRow`. S2 owns these files afterwards.
- `lib/portal/queries.ts`: the job list and job page select the property's `photoUrl`. AC owns it afterwards.
- The task page, New task and Apply playbook load properties through `propertyOptions()`; the property page passes `photoUrl` to `PropertyPhoto`.
- `tests/devices/devices.spec.ts` loads every file in `tests/devices/states/`, so each package adds its own state file without editing the spec.

### 1.7 Docs

- Copy the six specs into `docs/specs/` and add `docs/specs/README.md`: Connor's answers, and section 4 of this plan as the reconciliation that wins over spec text. Copy this plan as `docs/specs/build-plan.md`.
- Add `docs/components.md` rows for everything 1.4 builds and everything 1.3 moves. Contracts get their rows from their owners' reports in phase 2. CLAUDE.md asks for a row in the commit that adds a component; here each row lands on main in the same push as its component, which is what that rule protects.

### 1.8 Phase 0 is done when

- `npm run typecheck`, `npm run lint` and `npm test` pass, `db-rls.test.ts` included.
- The full device check has no new errors. The interim bodies keep today's behavior, so nothing on screen should change apart from what 1.4 adds and the property photo where one is set.
- A WebKit run at iPhone SE and iPad Mini opens a Sheet with a focused field: `--kb-inset` is set (0px with no keyboard) and the footer stays pinned. The real keyboard waits for Connor's device pass.
- The commit is tagged `build-base-0`, and the orchestrator has the file lists in section 3.

### 1.9 Kept out of phase 0, and why

- `FilterBar`, `FilterChip`, `FilterSheet` and `SortHeader`. Every page that mounts them belongs to S2, so S2 extracts them.
- The moves of `FactStrip` (to `components/fact-strip.tsx`) and `MoneyBars` (to `components/money-bars.tsx`). After phase 0's splits only CH's files import them, so CH moves them.
- `SearchTrigger` and `command-palette.tsx`. Only SR's `app-shell.tsx` mounts it.
- `LeaveGuard` on the public move-in page. F2 owns that page.
- The real internals of the contracts. Their owners build them in parallel.
- `globals.css` print rules, `MonthBars` and the period queries. Only charts needs them.

## 2. Phase 1: nine packages in parallel

Each package runs as the brand page slices did: a build agent, then a read-only reviewer against the spec and this plan, then a repair agent on `build-<key>-r`. File lists are in section 3. Every package reads anything, edits only its own files, and must not touch `prisma/`, `package.json`, `package-lock.json`, `src/components/ui.tsx`, `toast.tsx`, `use-keyboard-inset.ts`, `src/lib/config.ts`, `src/lib/normalize.ts`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/(portal)/p/layout.tsx`, `docs/`, `CLAUDE.md`, `eslint.config.mjs`, `playwright.config.ts` or `tests/devices/` (apart from its own `tests/devices/states/<key>.ts`). Every package is done when typecheck, lint and test pass (tests are `*.test.ts`; `npm test` runs nothing else), its new tests exist, `git diff --name-only build-base-0` lists only its own files, and its report is complete.

### S1. Selectors: pickers, menus and dates

- **Builds.** Selectors sections 2, 3.1 to 3.4, 3.5 (`Menu` internals: `numberKeys`, `sheetTitle`, the follow-up step; `StatusMenu`), 3.9 (`DatePicker` and `RepeatMenu`, with Repeat inside Due per question 7; no period control), 3.10 (`Switch`), 4.2 option A, 4.4 option A. Forms 2.4 and 2.5 fold in as section 4 says. `propertyOptions()`. The task page rows of the migration map: `fields.tsx` and `status-control.tsx`. Integration decision 7 (`meId`). `Select` and `DatePicker` put `data-surface="public"` on their overlay root when `surface` says so (the public move-in form).
- **Finishes contracts.** `OptionList`, `Select`, `Combobox`, `EntityPicker` with its wrappers, `propertyOptions()`, `StatusMenu`, `DatePicker`, `Switch`, and the S1 parts of `Menu`. Pickers opened inside a sheet on touch use the Sheet view stack, not a second sheet.
- **Tests.** `quick-dates.test.ts` (Monday hidden on a Monday, fixed keys), `repeat.test.ts` (monthly and quarterly intervals, presets read from a date, a stored rule outside the presets), `repeat-choice.test.ts`, a new `assignee-options.test.ts` (up to 3 recent, you first, legacy names merged into one person).
- **About 5 to 6 hours.**

### S2. Selectors: lists, filter bars and shell menus

- **Builds.** Selectors 3.5 (account menu, view menu), 3.6 (`SortHeader`), 3.7 (`FilterBar`, `FilterChip`, `FilterSheet`, the result line, remembered lists), 3.8 (`SegmentedControl` internals and `TopTabs` on `aria-current`, question 8), 4.1 option 1, 4.3 option A, question 10 (the Repeats filter). The migration map rows for the app shell's theme and `SideNav`, Home's `today-view.tsx`, `/tasks`, `/deals`, `/properties`, `/contractors`, Financials settings, the portal account menu and the public header's `current`. Search's list work: the shared matcher on `/tasks`, `/deals` and `/contractors` built from today's `searchTerms` and `everyTermMatches`, counts with the query applied, cap lines, the no-result lines, "4 of 52 contractors" and "Search accounts". Forms 3.3 A on the deals rows, forms 4.8 on the mapping table (conflict 35), activity's Latest note cell through `parseNoteAuthor`, and the deals list headers "Asking price" and "Target offer" from `DEAL_FIELD_LABEL` (checked to stay one line at their column widths). Both Sign out buttons (app and portal) use `useLeaveGuard({ signOut: true })`, so they ask while uploads run.
- **Tests.** A new `list-memory.test.ts` (cookie round trip, defaults, comma-joined facets), `list.test.ts` additions (the `/tasks` where-builder over title, property and assignee; Done sorted by newest completed; the Repeats filter), a new `mapping.test.ts` case for "Maps to" setting role and target together, `format.test.ts` for the sort phrases.
- **About 5 to 6 hours.**

### F1. Forms: records and the save pipeline

- **Builds.** Forms 2.0, 2.3 (`NumberInput`), 2.8 (`InlineField`, `rail.tsx`), 2.9 (`FormSheet` on phase 0's `Sheet`, with forms 2.11's two-button discard question built in), 2.12 (`fieldErrors`, `ConflictError`, plain schema messages, expected values on `patchDeal`, `updatedByUserId` writes on every Property and Deal write), 2.13 copy, 3.1 A, 3.2 A, 4.2 except New property, 4.3 except New deal and the list (the rail reads "Asking price", "Target offer" and "Add target offer"), 4.4 (title, notes, checklist rename and delete), 4.6 (New contractor sheet and its intercepting route, the contractor record, portal access: `createPortalAccount` saves the login email as the contact's email when it has none, and "Change login email" gets its service). The selectors rows for the property editors, the pass reason and the deal rail's Stage. Charts' hand-overs: the Loan rail drops Equity and LTV; Building CapEx and unit equipment show `systemsDated` and `projectedYear` with a 64px `Meter`; the checklist gets its `Meter` and "All done".
- **Finishes contracts.** `NumberInput`, `FormSheet`, `useRun`, `ActionResult` and `ConflictError`.
- **Tests.** `money.test.ts` (`parseAmount` for every kind), `action-result.test.ts` (zod issues to `fieldErrors`, `ConflictError` with and without a person), `inline-edit.test.ts` (minimum-length messages), a new `deals/service` case for stale expected values, `contacts.test.ts` (`createContact`, trades through `cleanTrades`), a new checklist test (rename, delete and its Undo restore).
- **About 6 to 7 hours.**

### F2. Forms: create sheets, drafts and long forms

- **Builds.** Forms 2.6 (`AddressCombobox`, phase 1 suggestions only), 2.10 (`ActionBar`), 2.11 (`LeaveGuard` titles, several holds at once and the `sign-out` scope, `useDraft`, `RefreshOnReturn` holding on dirty drafts), 2.14, 3.4 A, 3.5 A, 4.2 New property, 4.3 New deal (labels "Asking price" and "Target offer", reads `?address=` for search, the optional note saved as the first timeline note through `addDealNote`), 4.4 New task, 4.5, 4.7 (CapEx rules, move-in form editor), 4.9 (including `chooseOwnPassword` returning errors through `useActionState`), 4.11 with `LeaveGuard` on the public move-in page. Create sheets for task, deal and property with intercepting routes in the `@modal` slot; creates return `{ id }`, and `createTask`, the CapEx rules save and the move-in form save go through `withResult` and `callAction` (forms 2.12). The selectors rows for New task, Apply playbook, CapEx rules (with the two-line phone rows), the move-in editor's `Switch` and the public move-in form.
- **Finishes contracts.** `ActionBar`, `AddressCombobox`, `useDraft`, `LeaveGuard`.
- **Tests.** A new `use-draft` pure-part test (key, expiry after 7 days), `refresh-on-return.test.ts` (holds on a dirty draft), a new move-in steps test (Next checks only the current step, Required enforced), `template-items.test.ts` for the "39 tasks to create" count, a normalization case for "Saves as …".
- **About 5 to 6 hours.**

### AC. Activity and comments

- **Builds.** Activity 2.0 to 2.10, choices 3.1 B, 3.2 B, 3.3 A, 3.4 A, 3.5 A, 3.6 B, question 2 A (the job-page notice, with its data in `lib/portal/queries.ts` and a new `lib/portal/job-notice.ts`, never in UP2's `job-view.ts`), question 3 (leave "Connor removed a comment"), question 4 (keep the switch), question 5 (keep the buttons). Slices 1 to 7. Staff read state starts at `READ_STATE_SINCE`, a constant in `read-state.ts`, so no rows are seeded. `OutboxItem.eventId` rides in the existing JSON. `addDealNote` goes through `withResult` and `callAction`. The deal-note author backfill as `scripts/backfill-deal-note-authors.ts`, dry run by default, on `parseNoteAuthor`. Uploads' hand-overs: the strip in comment cards, "1 file removed", the composer's drop target and ready tiles, the batch line and its 2-minute merge, the Review card's photo row, `FilesList` rows in place of the job page's hand-rolled file links, and the job page header's `PhotoThumb` showing `photoUrl`. Selectors' hand-overs: the row date chip named with the task, the Repeats cadence subline, "Shared | Internal" on every task. Forms' Send back field rules. F1's checklist rename and delete events read as Activity lines.
- **Finishes contracts.** `Composer`, `DealActivity`, `TaskRow`, `read-state.ts`, `log.ts`.
- **Tests.** `activity.test.ts` (bursts, reversals inside 2 minutes, month grouping, decision pairs, batch lines, `lastWordBy`), `content.test.ts` (500 characters, "3 photos and 1 file", `#update` anchors), a new outbox drain test (a deleted event drops, an edited body is re-read), `core.test.ts` (edit, delete, restore, `clientId` dedupe, `statusEventId`, `REPEAT` events), a new deals log test (structured changes, no-op edits skipped), a new read-state test (rows before `READ_STATE_SINCE` read as seen).
- **About 6 to 7 hours. The longest package.**

### UP1. Uploads: the engine and evidence

- **Builds.** Uploads 2.1 including the phase 3 outbox, 2.2, 2.3, 2.4, 2.5, 2.6 (including the public surface and `menuItems`), the Review photo set in 2.7, 2.13 copy, choices 1 A, 2 A, 3 A (the strip), 6 A, questions 3 and 4 on the engine side: `prepare` for contractor photos, and the late-upload rule on `queuedAt` inside `contractorUploadRefusal`. Uploads phases 1 to 4 apart from the portal's Mark done and batch posts. The token route and `UPLOAD_RULES` for every target, the listing and property photo kinds included. Property Documents on the queue with "Connor · Oct 3", the ZIP route, the Storage page copy, forms' pending button and `withResult` on Storage. The removed-file event in its own delete path. The queue holds `LeaveGuard` with the `sign-out` scope only.
- **Finishes contracts.** `upload-queue.tsx`, `media-uploader.tsx`, `media-grid.tsx`, `lightbox.tsx`, `files-list.tsx`, `lib/tasks/media.ts`, `TaskMediaSection`, `DocumentsSection`.
- **Tests.** `media.test.ts` (dated names, " 2" suffixes, slugs), `limits.test.ts` (`UPLOAD_RULES` per target), a new `prepare` sizing test (2560 and 1024 math), a new outbox state test (Waiting, retries, Failed after 4), a new `media` order test (newest first, At finish set first, this visit only), a new late-upload rule test (`queuedAt` before Mark done), `access.test.ts` for the ZIP route (staff only).
- **About 6 to 7 hours.**

### UP2. Uploads: photos and the portal

- **Builds.** Uploads 2.7 (batch posts with Undo, soft-deleting the update and its files in `lib/portal/job-uploads.ts`; the payoff strip), 2.8, 2.9 (choice 4 A), 2.10, 2.12, choice 5 A with the requirement off by default, questions 3, 4 and 5 on the portal side (the `display` target, `queuedAt` sent with each file, "Add photo/video" hidden after the server's hour). Uploads phase 5 and the portal half of phase 4. The residents page drops its photo promise line (PUBLIC-035). Forms 4.10 (Mark done on the `FormSheet` footer and the keyboard inset; the bar becomes `ActionBar`). The portal My jobs row: activity's leading dot, the uploading subline, the property photo, search's "Search jobs" on the Done tab.
- **Finishes contracts.** `ListingPhotos`, `PropertyPhoto`, `JobMediaSection`.
- **Tests.** `job-view.test.ts` (`markDoneButton` with a required count and no Skip), a new listing photo set test (cover, move earlier and later, the 20 cap), a new Undo window test for contractor posts.
- **About 4 to 5 hours.**

### SR. Search and the command palette

- **Builds.** Search 2.1 to 2.10, 2.12 to 2.14, choices 1 A, 2 B, 3 A, 4 B, 5 A (choice 5 B waits for its own shell spec), steps 0 to 3, and the API side of step 4. `Sheet` `layout="palette"`, leaving every other layout of `sheet.tsx` as phase 0 built it (the reviewer diffs them). The app shell: `SearchTrigger` in a new `command-palette.tsx`, the skip link, focus on the h1 after a route change, closing the phone drawer before search opens. Rows show the property photo from `photoUrl`. Selectors 3.11 is superseded by this package (section 4).
- **Finishes contracts.** None; it deletes `GlobalSearch` once `SearchTrigger` replaces it.
- **Tests.** `search.test.ts` (`rankRows`), a new route test (Template rows excluded, a portal session gets 401), a new `commands.test.ts` (every href is a page under `src/app/(app)`), a new `recent-views` test (keeps the newest 20), `task-scope.test.ts` (the test `docs/asana-migration-plan.md` line 241 asks for).
- **About 4 to 5 hours.**

### CH. Charts and data visualization

- **Builds.** Every section of the charts spec: `MonthBars`, `FactStrip` extensions after moving it to `components/fact-strip.tsx`, `MoneyBars` after moving it to `components/money-bars.tsx`, `ForecastYearBars` and both CapEx cards, the period row with FINANCIALS-001 queries, `SourceLine` with `through` and `showBasis`, the rent roll grid and `MonthStepper`, the property Financials card, the Portfolio and record strips, the Needs you CapEx row, `financials/loading.tsx`, the print block in `globals.css`, the portal checklist `Meter`. D1 to D4 all A, questions 2 and 3 yes. Selectors' basis control and `showBasis` on Overview and rent roll. Selectors' Checkbox and 50% in the portal checklist. Builds on the NOI below-the-line fix if it is in the base.
- **Finishes contracts.** `PropertyFactStrip`, `PortfolioStrip`, the `property-types.ts` helpers.
- **Tests.** `months.test.ts` and `period.test.ts` (12-month window, MTD, `through` day), new pure tests in `queries` (padded months, expense by category, account and payee, the prior span), `property-types.test.ts` (overdue uses `<`, `overdueTotal`, `systemsDated` skips placeholders, `projectedYear`), `needs-you.test.ts` (the past due clause), a new `data-quality` test (`needsReview`, expected cash and accrual differences not flagged), a tick test (1, 2, 2.5 or 5 times a power of ten).
- **About 5 to 6 hours.**

## 3. File ownership

Every path has one owner in phase 1. "Frozen" means nobody edits it in phase 1. Each table's paths are relative to its heading. New files are marked (new). Files phase 0 creates or moves are listed under their phase 1 owner.

### src/components

| Owner | Files |
|---|---|
| S1 | `option-list.tsx`, `select.tsx`, `combobox.tsx`, `entity-picker.tsx`, `assignee-picker.tsx`, `status-menu.tsx`, `due-date-picker.tsx`, `repeat-menu.tsx` (new), `repeat-picker.tsx`, `switch.tsx`, `menu.tsx`, `popover.tsx`, `use-coarse-pointer.ts` |
| S2 | `filter-bar.tsx` (new), `sort-header.tsx` (new), `nav.tsx`, `account-menu.tsx`, `theme-toggle.tsx`, `segmented-control.tsx`, `public/header.tsx` |
| F1 | `inline-field.tsx` (new), `inline-address-field.tsx`, `rail.tsx`, `use-run.ts`, `number-input.tsx`, `form-sheet.tsx`, `use-inline-edit-keys.ts` |
| F2 | `action-bar.tsx`, `address-combobox.tsx`, `use-draft.ts`, `leave-guard.tsx`, `refresh-on-return.tsx` |
| AC | `activity-timeline.tsx`, `activity-time.tsx` (new), `comment-card.tsx` (new), `composer.tsx` |
| UP1 | `upload-queue.tsx`, `media-uploader.tsx`, `media-grid.tsx`, `lightbox.tsx`, `files-list.tsx`, `attachments.tsx` |
| UP2 | `photo-thumb.tsx` |
| SR | `command-palette.tsx` (new), `global-search.tsx`, `app-shell.tsx`, `search-field.tsx`, `sheet.tsx` |
| CH | `fact-strip.tsx` (moved in by CH), `money-bars.tsx` (moved in by CH), `source-line.tsx`, `meter.tsx`, `month-bars.tsx` (new) |
| Frozen | `ui.tsx`, `toast.tsx`, `use-keyboard-inset.ts`, `use-platform.ts`, `deal-stage.tsx`, `status-badge.tsx`, `avatar.tsx`, `back-link.tsx`, `code.tsx`, `confirm-dialog.tsx`, `money.tsx`, `monogram.tsx`, `spot-art.tsx`, `table-frame.tsx`, `tooltip.tsx`, `public/footer.tsx`, `public/ui.tsx`, `public/type.module.css` |

### src/lib

| Owner | Files |
|---|---|
| S1 | `quick-dates.ts` and test, `picker-options.ts`, `tasks/assignee-options.ts`, `tasks/repeat.ts` and test, `tasks/repeat-choice.ts` and test |
| S2 | `list-memory.ts` and test, `tasks/queries.ts`, `tasks/list.ts` and test, `quickbooks/mapping.ts` and test |
| F1 | `action-result.ts` and test, `server-action.ts`, `money.ts` and test, `inline-edit.ts` and test, `forms.ts`, `contacts.ts` and test, `properties/service.ts`, `properties/edits.ts`, `properties/numbers.ts`, `properties/unit-refs.ts` and their tests, `deals/service.ts`, `portal/accounts.ts`, `tasks/checklist.ts` (new) and test |
| F2 | `refresh-on-return.ts` and test, `app-config.ts`, `app-config-write.ts`, `capex-rules.ts`, `move-in-form.ts`, `move-in-form-types.ts`, `tasks/templates.ts`, `tasks/template-items.ts` and test |
| AC | `dates.ts` and test, `tasks/core.ts` and test, `tasks/service.ts`, `tasks/activity.ts` and test, `tasks/bulk.ts`, `tasks/lockbox.ts` and test, `tasks/read-state.ts` and test, `notifications/content.ts` and test, `notifications/outbox.ts`, `portal/queries.ts` and test, `portal/jobs.ts`, `portal/job-notice.ts` (new), `deals/log.ts`, `deals/notes.ts` |
| UP1 | `attachments/*` and tests, `attachments/prepare.ts` (new), `attachments/outbox.ts` (new), `tasks/attachments.ts`, `tasks/media.ts`, `properties/documents.ts` |
| UP2 | `properties/photo.ts` (new), `portal/job-view.ts` and test, `portal/job-uploads.ts` |
| SR | `search.ts` and test, `commands.ts` (new), `recent-views.ts`, `task-scope.ts` and test |
| CH | `quickbooks/*` except `mapping.ts`, `property-types.ts` and test, `properties/figures.ts` and test, `home/needs-you.ts` and test |
| Frozen | `config.ts`, `normalize.ts`, `deals/note-author.ts`, `env.ts`, `auth.ts`, `tasks/rules.ts`, `home/queries.ts`, `home/summary.ts`, the other `portal/*` files, `asana/*`, `email/*` and every other lib file not listed |

### src/app/(app)

| Owner | Files |
|---|---|
| S1 | `tasks/[id]/fields.tsx`, `tasks/[id]/select-chip.tsx`, `tasks/[id]/status-control.tsx`, `tasks/[id]/status-run.tsx` |
| S2 | `tasks/page.tsx`, `tasks/filters.tsx`, `tasks/all-list.tsx`, `tasks/task-section.tsx`, `tasks/tasks-header.tsx`, `tasks/today-view.tsx`, `tasks/all/page.tsx`; `deals/page.tsx`, `deals/filters.tsx`, `deals/status-multiselect.tsx`, `deals/sort-header.tsx`, `deals/deal-row.tsx`, `deals/columns.ts`, `deals/column-widths.tsx`, `deals/format.ts`, `deals/format.test.ts`; `properties/page.tsx`; `contractors/page.tsx`; `financials/settings/page.tsx`, `financials/settings/tables.tsx`, `financials/settings/controls.tsx`, `financials/settings/actions.ts` |
| F1 | `properties/actions.ts`, `properties/labeled-field.tsx`; `properties/[id]/page.tsx`, `properties/[id]/edit-details.tsx`, `properties/[id]/edit-loan.tsx`, `properties/[id]/edit-insurance.tsx`, `properties/[id]/edit-units.tsx`, `properties/[id]/edit-listings.tsx`, `properties/[id]/building-capex.tsx`, `properties/[id]/key-date.tsx`, `properties/[id]/fact-values.tsx`, `properties/[id]/use-section-save.ts`; `deals/actions.ts`, `deals/fields.ts`, `deals/price-input.tsx`, `deals/deal-fields.tsx`, `deals/[id]/page.tsx`, `deals/[id]/deal-detail.tsx`; `contractors/actions.ts`, `contractors/new/page.tsx` (new), `contractors/[id]/page.tsx`, `contractors/[id]/portal-access-card.tsx`; `@modal/(.)contractors/new/page.tsx` (new); `tasks/[id]/header.tsx`, `tasks/[id]/notes.tsx`, `tasks/[id]/checklist.tsx`, `tasks/[id]/checklist-actions.ts` (new) |
| F2 | `@modal/default.tsx`, `@modal/(.)tasks/new/page.tsx`, `@modal/(.)deals/new/page.tsx`, `@modal/(.)properties/new/page.tsx` (the three intercepts new); `tasks/new/page.tsx`, `tasks/new/new-task-fields.tsx`, `tasks/new/actions.ts`; `deals/new/page.tsx`, `deals/new/new-deal-form.tsx`, `deals/new/actions.ts`; `properties/new/page.tsx`, `properties/new/new-property-form.tsx`, `properties/new/actions.ts`; `templates/page.tsx`, `templates/actions.ts`, `templates/[id]/apply/page.tsx`, `templates/[id]/apply/apply-flow.tsx`; `settings/layout.tsx`, `settings/page.tsx`, `settings/actions.ts`, `settings/capex-rules-editor.tsx`, `settings/editor-controls.tsx`, `settings/move-in-form/page.tsx`, `settings/move-in-form/actions.ts`, `settings/move-in-form/move-in-form-editor.tsx` |
| AC | `tasks/[id]/page.tsx`, `tasks/[id]/view.tsx`, `tasks/[id]/activity.tsx`, `tasks/[id]/composer.tsx`, `tasks/[id]/review-banner.tsx`, `tasks/[id]/actions.ts`; `tasks/task-row.tsx`, `tasks/task-list-context.tsx`, `tasks/review-actions.tsx`, `tasks/list-actions.ts`, `tasks/send-back-sheet.tsx` (new), `tasks/actions.ts`; `deals/[id]/deal-activity.tsx`, `deals/[id]/note-actions.ts` |
| UP1 | `tasks/[id]/task-media.tsx`, `tasks/upload-actions.ts`; `properties/[id]/edit-documents.tsx`, `properties/[id]/documents-section.tsx`, `properties/[id]/document-actions.ts`; `settings/storage/page.tsx`, `settings/storage/migrate-button.tsx`, `settings/storage/actions.ts` |
| UP2 | `properties/[id]/property-photo.tsx`, `properties/[id]/listing-photos.tsx`, `properties/[id]/photo-actions.ts` (new) |
| CH | `financials/page.tsx`, `financials/layout.tsx`, `financials/loading.tsx` (new), `financials/rent-roll/page.tsx`, `financials/rent-roll/month-stepper.tsx` (new), `financials/_components/ui.tsx`, `financials/_components/labels.ts`, `financials/_components/refresh-button.tsx`; `properties/fact-strip.tsx` (moves out), `properties/portfolio-strip.tsx`, `properties/capex-ui.tsx`, `properties/[id]/record-strip.tsx`, `properties/[id]/capex-outlook.tsx`, `properties/[id]/financials.tsx`; `portfolio-capex.tsx`; `needs-you.tsx` |
| Frozen | `page.tsx` (Home), `error.tsx`, `not-found.tsx`, `deals/stage-select.tsx`, `properties/property-status.tsx`, `properties/[id]/property-tasks.tsx`, `contractors/contact-link.tsx`, `tasks/task-checkbox.tsx` |

### src/app elsewhere, and the repo root

Paths here are under `src/app/`, except those starting with `prisma/`, `scripts/`, `tests/`, `docs/`, and the root files `package.json`, `package-lock.json`, `next.config.ts`, `eslint.config.mjs`, `playwright.config.ts`, `CLAUDE.md` and `README.md`.

| Owner | Files |
|---|---|
| S2 | `(portal)/p/_components/account-menu.tsx` |
| F2 | `(marketing)/residents/moving-in/*` and its new step files, `login/**`, `(portal)/p/welcome/password/page.tsx`, `(portal)/p/actions.ts` |
| AC | `(portal)/p/jobs/[id]/page.tsx`, `(portal)/p/jobs/[id]/actions.ts`, `(portal)/p/jobs/[id]/_components/job-notice.tsx` (new), `api/cron/notifications/route.ts`, `scripts/backfill-deal-note-authors.ts` (new) |
| UP1 | `api/blob/[kind]/route.ts`, `api/files/[kind]/[id]/route.ts`, `api/files/zip/[kind]/[id]/route.ts` (new), `next.config.ts` (only if the PDF frame needs a header) |
| UP2 | `(marketing)/rentals/page.tsx`, `(marketing)/rentals/photo-carousel.tsx`, `(marketing)/residents/page.tsx`, `(portal)/p/page.tsx`, `(portal)/p/_components/my-jobs.tsx`, `(portal)/p/jobs/[id]/upload-actions.ts`, `(portal)/p/jobs/[id]/_components/job-actions.tsx`, `(portal)/p/jobs/[id]/_components/job-media.tsx` |
| SR | `api/search/route.ts`, `api/search/recent/route.ts` (new) |
| CH | `globals.css`, `(portal)/p/jobs/[id]/_components/job-details.tsx` |
| Each package | `tests/devices/states/<key>.ts` (new, its own) |
| Phase 0 only | `prisma/**`, `package.json`, `package-lock.json`, `(app)/layout.tsx`, `(portal)/p/layout.tsx`, `tests/devices/devices.spec.ts` |
| Phase 2 only | `tests/devices/routes.ts`, `tests/devices/known-issues.json` (only ever drops lines), `docs/components.md`, `docs/todo-for-connor.md` |
| Guidelines owner | `docs/brand-guidelines.md`, the Typography rule in `CLAUDE.md` |
| Frozen | `layout.tsx` (the root layout), `(marketing)/layout.tsx`, `(marketing)/error.tsx`, `(marketing)/welcome/page.tsx`, the other `(portal)` files, the other `api/` routes, `proxy.ts`, `eslint.config.mjs`, `playwright.config.ts`, `README.md`, the other `scripts/` |

### Where two specs need one file

The owner builds the other spec's ask from that spec's text. No package waits on another: each uses phase 0's primitives and contracts. Paths use the shorthand from 1.3.

| File | Owner | Builds for the other spec |
|---|---|---|
| `properties/[id]/edit-loan.tsx` | F1 | Charts question 3: the rail drops Equity and LTV |
| `properties/[id]/building-capex.tsx`, `edit-units.tsx` | F1 | Charts: `systemsDated` and `projectedYear` from `property-types.ts` (CH's contract), with a 64px `Meter` |
| `tasks/[id]/checklist.tsx` | F1 | Charts: `Meter` with label and "All done" |
| `properties/[id]/edit-listings.tsx` | F1 | Uploads 2.9: mounts `ListingPhotos`, shows "2 photos uploading" from `onPendingChange`, calls `discardSessionUploads()` on Discard; on the read rows the cover thumb opens the viewer on the set, "· N photos" drops and photos are named "Unit 2 photo 3" |
| `properties/[id]/page.tsx` | F1 | Mounts `PropertyPhoto` (UP2), `PropertyFactStrip` (CH), `DocumentsSection` (UP1); gives the Value fact `id="value"` for charts' "Add value" |
| `deals/[id]/page.tsx` | F1 | Mounts `DealActivity` (AC); the Stage row is `StatusMenu` per selectors |
| `deals/deal-row.tsx` | S2 | Forms 3.3 A (the row is the link, the stage is the only control, the flash and toast, a blank next action); activity's Latest note ("Oct 20 · seeing tomorrow") through `parseNoteAuthor`. It stops importing from F1's `deal-fields.tsx` |
| `properties/page.tsx` | S2 | Mounts `PortfolioStrip` (CH); Sold leaves the footer sums and the subtitle count (charts D4); the 48px photo from `photoUrl` (uploads) |
| `financials/settings/*` | S2 | Forms 4.8 (save on pick, Undo; conflict 35); search's "Search accounts"; charts' one-line copy fix on the reclass row |
| `contractors/page.tsx` | S2 | Search 2.11; forms 4.6: "New contractor" in the header, opening F1's sheet |
| `tasks/page.tsx`, `deals/page.tsx` | S2 | Search 2.11: one matcher, counts, cap lines, no-result lines; on `/deals`, Connor's answer: the headers read "Asking price" and "Target offer" |
| `lib/tasks/queries.ts`, `lib/tasks/list.ts` | S2 | Activity 3.5 A and selectors question 10: keeps phase 0's `unread` and `repeat` on every row |
| `components/nav.tsx` | S2 | Forms 2.11: `TopTabs` and sidebar links leave through `useLeaveGuard()` |
| `components/account-menu.tsx`, `p/_components/account-menu.tsx` | S2 | Uploads 2.1: Sign out asks while uploads run, through `useLeaveGuard({ signOut: true })` |
| `tasks/task-row.tsx` | AC | Selectors: the `row` date chip named with the task; question 10's cadence subline |
| `tasks/send-back-sheet.tsx` | AC | Forms 4.4: label, 2,000-character limit with a count from 1,800, helper |
| `tasks/[id]/page.tsx` | AC | Uploads 2.5 and 2.7: `orderMedia()` and `reviewPhotos()`; selectors: `propertyOptions()` and `meId` for `TaskFields` |
| `components/composer.tsx` | AC | Uploads 2.2 and 2.3: `useDropTarget` on the main column, ready tiles, the status line |
| `tasks/[id]/review-banner.tsx` | AC | Uploads 2.7: `reviewPhotos()` in `MediaGrid rows={1}` |
| `lib/tasks/activity.ts` | AC | Uploads 2.7: one line per batch, file lines merged within 2 minutes; forms 4.4: checklist rename and delete lines from F1's event `data` |
| `lib/portal/queries.ts` | AC | Uploads 2.5: `orderMedia()` for the job page; uploads 2.10: `photoUrl` stays selected |
| `p/jobs/[id]/page.tsx` | AC | Uploads 2.4 and 2.10: `FilesList` rows in updates, the header photo from `photoUrl` |
| `p/jobs/[id]/_components/job-actions.tsx` | UP2 | Activity 2.7: the shared `Composer` inline; forms 4.10: `FormSheet` footer, keyboard inset, `ActionBar` |
| `p/_components/my-jobs.tsx` | UP2 | Activity 3.5 A: the leading dot, "2 new" goes; search: "Search jobs" on Done |
| `lib/tasks/attachments.ts` | UP1 | Activity 2.3 rule 10: the `ATTACHMENT` event with `data.removed` |
| `deals/new/new-deal-form.tsx` | F2 | Search: `?address=` prefill; duplicates through `findDuplicateDeal` |
| `components/app-shell.tsx` | SR | Selectors: keeps the `AccountMenu` and `AppearanceRow` mounts phase 0 placed |
| `lib/tasks/checklist.ts` | F1 | Writes a `CHECKLIST` event with `data: { action: "renamed" \| "removed" \| "restored", from, to }` for AC's lines |

### The task migration session's files

These were built by the Asana migration session or sit in its plan (`docs/asana-migration-plan.md`), so it reviews every change to them before landing (phase 2 step 6), and phase 0 asks it about in-flight edits first. Each report lists the ones its package touched.

- `src/app/(app)/tasks/**`, `src/app/(app)/templates/**`, `src/lib/tasks/**`, `src/lib/task-scope.ts` and its test.
- `src/app/(portal)/**`, `src/lib/portal/**` (`accounts.ts` included), `src/app/(app)/contractors/[id]/portal-access-card.tsx`, `src/app/(app)/contractors/actions.ts`.
- `src/lib/notifications/**`, `src/app/api/cron/notifications/route.ts`.
- `src/lib/attachments/**`, `src/app/api/blob/[kind]/route.ts`, `src/app/api/files/**`.
- The task and portal components: `composer.tsx`, `activity-timeline.tsx`, `comment-card.tsx`, `activity-time.tsx`, `upload-queue.tsx`, `media-uploader.tsx`, `media-grid.tsx`, `lightbox.tsx`, `files-list.tsx`, `assignee-picker.tsx`, `entity-picker.tsx`, `due-date-picker.tsx`, `repeat-menu.tsx`, `status-menu.tsx`.
- The schema batch (rows 7 and 10 touch task tables).

### The merge gate

Before phase 2 merges, a script lists `git diff --name-only build-base-0...build-<key>-r` for each package (or the file list of its patch) and checks two things: no path appears in two lists, and every path is in that package's rows above. Any hit stops the merge for a decision.

## 4. Cross-spec conflicts, resolved

1. **Filter bars.** Selectors owns them: option 1 (chips on a wide desktop, a Filters button and sheet elsewhere), staged phone sheet, segments on their own row below `sm`, Open first. Search's choice 6 defers, so 6A's "All | Open | Done" order, the "All assignees" selects and status inside the phone sheet don't ship. Search keeps the matcher, the counts and the no-result copy, which S2 builds. Why: approved.md says so, and one bar per list keeps one shape.
2. **Select in forms.** Forms' `OptionPicker` isn't built. Forms uses selectors' pieces: `Select` for fixed lists (search appears at 10 options, not 8), `Combobox` for find-or-add and for trades (`multiple`), `EntityPicker` for people and buildings, `StatusMenu` for status and stage, the `leading` mark for the stage ring. `StatusMultiSelect` is deleted with the filter chips, not moved. Why: one picker family, and approved.md says forms consumes them.
3. **Empty choices.** Forms' `clearable` "None" row becomes selectors' named empty value ("Not set", "No reason", "No unit", "Doesn't repeat"). Required picks read "Choose a unit"; forms' error "Pick the unit." becomes "Choose a unit." Why: one verb and no "None" app-wide (selectors 2).
4. **Attachments in comments.** Uploads owns the queue, tiles, status line, strip and drop targets. Activity owns the composer's layout, audience, sending states and the comment card. The card's media slot is uploads' strip (choice 3 A), which replaces activity's two-row grid. Why: approved.md, and each spec names the other as owner of that half.
5. **Listing photos and listing fields.** Forms owns the listing `FormSheet` and its save; uploads owns `ListingPhotos` inside it. One Save applies fields and the photo set together. Deleting a whole listing uses forms' confirm ("Delete the listing for Unit 1? Its 8 photos go too."), not uploads' "listing removed · Undo" on Save. Why: forms replaces the staged whole-list editor with one sheet per listing, so there's no list-wide Save to hold an Undo, and the confirm still never drops photos without a question (G2C-006).
6. **Repeat inside Due.** Both specs fold it in (selectors question 7, forms G1C-010). S1 builds it once. The presets are selectors' list, each with its "Next: Fri, Nov 6" line. Forms adds the count fixes: `NumberInput` integer for Custom, "Enter how many weeks." for an empty count, every N months with a test. The empty choice reads "Doesn't repeat", not "Never". The menu, the rail line and the row subline all come from `describeRepeat`, updated to selectors' wording ("Every quarter on the 30th"). Why: one string per rule wherever it shows.
7. **Status follow-ups.** Waiting asks its reason and Scheduled its visit date as a step inside `StatusMenu` (selectors 3.5), not in forms' small `FormSheet`s on the task page or as fields under the chips in New task. The status commits only when the step is answered. Why: the menu owns the pick, and both designs only aimed to stop a second sheet.
8. **Esc inside a stepped layer.** A step that answers one pick (a status follow-up, Custom repeat, the phone calendar step) closes with the whole layer on Esc, with nothing changed (selectors). A picker pushed over a form inside a sheet (forms 2.9) goes back to the form on Esc. Why: the pushed picker stands in for the popover a mouse gets, and Esc closes that popover first. One Esc still closes one layer.
9. **Dates.** One date family in `due-date-picker.tsx` (S1). Forms' `DateField` behaviors merge in: typed segments with a mouse, the formatted date and a sheet on touch, Clear for record dates (`allowNone`), Eastern defaults. The heading steps to a month grid, then a 12-year grid. Why: both specs asked for the same jump; this order satisfies both.
10. **Switch motion.** The knob springs at `--dur-check` (selectors), not forms' `--dur-fast` slide. Why: brand section 7 gives state changes the check spring.
11. **Dimming.** Optimistic edits never dim (forms FEEL-027, and selectors' own optimistic rule). The 50% level covers disabled controls, a list loading and a row whose save isn't optimistic (the financials mapping row). Selectors' "Select saving in place dims" applies only there. Why: the two rules only collide where an edit is optimistic, and both specs say those show the new value at once.
12. **Shared | Internal.** The switch stays on every task (activity question 4), not only when a contractor is assigned (selectors' migration line). Why: Connor approved activity's recommendation; Internal is the only way to keep a note private before a contractor is assigned.
13. **Send back.** One sheet, `tasks/send-back-sheet.tsx`, built by AC with forms' field rules: "What still needs doing?", 2,000 characters with a count from 1,800, "Goes back to In progress with your note for Zack." Without a login the helper reads "Goes back to In progress. Zack has no login yet." Activity's title "Send back to Zack" stays. Why: activity defers field rules to forms, and the server already caps the note at 2,000.
14. **Deal stage words.** The UI drops the prefixes ("High", not "1 - High") and shows "Closed" for "CLOSED!" through `DEAL_STAGE_LABEL`. The word is "Stage" everywhere. Search's "print as stored", forms' "Moved to 2 - Medium" and activity's "changed the status to 1 - High" follow it. Why: selectors and integration decision 16 already agree; stored values don't change.
15. **Deal prices.** "Asking price" and "Target offer" (Connor's answer: our price is the target offer, not a max offer) in New deal (F2), the rail with "Add target offer" as its empty verb (F1), the list header (S2), activity's change sentences (AC) and the toasts, all from `DEAL_FIELD_LABEL`. The `ourPrice` column and sort key don't change.
16. **Deals list rows.** Forms 3.3 A plus selectors: a `StatusMenu` with a mouse, display only on touch, and the row opens the deal. Forms' "the chip keeps a 44px hit area" on a tablet drops. Why: selectors' call 6, kept as written.
17. **Global search.** The search spec replaces selectors 3.11 in full: the palette, its group order (Properties, Tasks, Deals, Contractors), "Search or jump to" in the palette, Esc closing the palette. Why: selectors called 3.11 fixes only and left the palette to its own spec, which this is.
18. **Search fields.** One `SearchInput` serves selectors' `Input sm` with an icon and clear button, `OptionList`'s search row and the palette's phone field. Why: two specs named the same control.
19. **Period control.** Charts' period row ships as FINANCIALS-001: "Last month | Year to date", "Cash | Accrual", the phone chip and its sheet. Selectors' period view menu (This month, Last 12 months, Custom range) isn't built. Why: selectors said its control ships with FINANCIALS-001, and charts designed that work against the data (no 12 months until Jan 2027).
20. **CapEx year picks.** Charts' rule (the pick filters, nothing dims, the pick keeps its edge) covers selectors' "other years stay full strength". CH builds it.
21. **Progress bars.** Charts' `Meter` replaces the 2px `--act` bar everywhere, the public move-in step bar included (forms 2.14). The public surface already reads the dark theme's `--chart-1` (`#d7d0c3`), so no token value changes (section 5, item 9).
22. **New property's status.** Forms drops Status from the create sheet (PORTFOLIO-044). Selectors' "required, Choose a status" row doesn't apply. Why: forms owns the create field set, and a missing status shows as the rail's verb.
23. **Equipment and building system types.** A `Select` over the CapEx rule types (selectors), not forms' find-or-add. Why: a type with no rule drops out of the forecast, the failure PROPERTY-022 fixes.
24. **"(you)", not "(me)".** Your own row reads "(you)" in pickers and filters. Integration decision 7's "First (me)" chip becomes "First (you)". Why: selectors retires "(me)"; one word app-wide.
25. **CapEx rule delete on touch.** Tap to reveal (selectors call 4, forms, and the fix pass ships it), not integration decision 13's row ⋯ menu.
26. **Move-in editor buttons.** Forms 3.4 A: Discard and Save in the `ActionBar`, the primary enabled. Integration decision 12's "reason under a disabled Save" retires.
27. **Portal Updates.** Activity 3.4 A (avatars, the New divider, delivery lines) and uploads' "1 of 2" photo count ship, over integration decision 14's omissions. Why: those omissions were about the rollout preview; these specs came later and are approved.
28. **Rent roll wording.** "Rent billed" on accrual and "Rent received" on cash (integration decision 10), over charts' "earned". Why: it matches what the fix pass shipped, and accrual rent is billed.
29. **"N mo".** Charts' "Bought Aug 2026" replaces it, so integration decision 11's rule about it retires.
30. **Keyboard inset.** One hook for forms and activity. `interactiveWidget: "resizes-content"` goes in `(app)/layout.tsx` only (activity), not the root layout (forms). Why: at the root it would lift the portal's fixed bar over its composer and resize the public site.
31. **Spinner.** One `Spinner` (search) inside `Button` `pending` (forms), `LoaderCircle` both ways. Under reduced motion it shows and holds still (forms 2.7, search 2.13).
32. **Composer drafts and `useDraft`.** The composer keeps its own `{ v: 2, text, visibility }` draft (activity); `useDraft` serves editors and create sheets (forms). Why: the composer also tracks a pending send and its `clientId`.
33. **Leave holds.** A dirty sheet, editor or draft holds every exit (forms 2.11). Uploads hold only Sign out (uploads 2.1), since the queue outlives the page; back links, tabs, the sidebar and search never ask about uploads. `LeaveGuard` takes both holds at once. Why: both specs are right about their own case, and a single hold slot would let one silently replace the other.
34. **Review buttons.** One order everywhere: Send back, then Approve. The banner uses secondary then primary; Today's Needs review rows use ghost then secondary (activity 2.8), over forms 4.4's "secondary then primary in both places". Why: activity owns the review surfaces, and a primary in every row of a list is louder than the one decision on a task page.
35. **Class mapping.** One "Maps to" `Select` per class with selectors' sections (Properties with short addresses and photos, Entities, then Overhead and Ignore) and "Unmapped" as the named empty value, words from `ROLE_LABELS`. Forms 4.8's save on pick, the row-only change and the toast "Prospect mapped to 767 Prospect Ave · Undo" ship. Below `md` the row's `Select` opens its own titled sheet; forms' separate row sheet isn't built. Why: forms' row sheet held three controls; with one picker per row, the picker's phone sheet is that sheet, and a second layer would break one Esc per layer.
36. **Uploads under a Save.** While photos upload, the listing sheet's Save and Mark done keep their labels, wait, and show the count as one line beside them ("2 photos uploading"), as forms 4.2 and the fix pass's Mark done do, not as a "Finishing 2 uploads…" label (uploads 2.9). Why: forms 2.7 retires label swaps and brand section 7 keeps a button's label while it loads.

## 5. Brand guideline amendments

For the guidelines owner to write into `docs/brand-guidelines.md` before phase 1 branches. It's a docs-only commit on `build-base` after phase 0's last commit, so it can be drafted while phase 0 runs. None adds a color token or changes a token's value.

**Section 3, type, dates and figures**
1. Day headings add "Yesterday" and past weekdays ("Tue"), the past side of the one formatter (activity).
2. Dates inside history sentences are absolute ("Oct 30"), never Today or Tomorrow (activity).
3. Codes typed into fields use Geist Mono at `text-body` (forms).
4. "(optional)" follows a label in `text-meta` 400 `--fg-3`; no asterisks (forms).
5. Stored names for camera files: "Photo 2026-10-25 at 2.14 PM", with " 2" for a second in the same minute. The formatter still governs labels on screen (uploads).
6. In search results only, the typed words in a title are weight 600 as emphasis, never as state (search 4B).

**Section 4, color**
7. `--chart-1`'s job widens to any measured amount: every `Meter`, checklist progress included, fills `--chart-1` on a `--fill-1` track; `--act` stays with controls (charts 7).
8. Expense stops borrowing `--chart-ref`, which keeps prior period or budget. Comparisons are words in `--fg-3` ("Up $310") with the basis said once in the source line, no arrows and no green or red. Negatives hang below the baseline in the series color, or show no bar and a true minus; never outlined, never red (charts 8 to 10).
9. The public move-in step meter reads the dark `--chart-1` (`#d7d0c3`) that the public surface already has; no new value (conflict 21).
10. A picked month or year is a `--fill-1` band with a 1px inset `--line-control` edge and its label in `--fg-1`. Nothing dims to show a pick; CapEx picks filter (charts 4).
11. Photo tiles get a 1px inset `--line-control` edge on hover with a mouse, a new job for that token. Marked invented (uploads 2.5).
12. The photo-mark colors appear in two new places: the "+N" overflow tile and the viewer's labeled Download button. The viewer's file card uses a 40px type glyph (uploads).

**Section 5, shape, space and density**
13. Row chip: `pickerChip` `row` is 28px in list rows with a 44px hit area on touch, an exception to the 32px `sm` control (selectors 1).
14. Option rows: 32px with a mouse and 44 on touch; with a second line, 44 and 56; the same in a popover and a sheet (selectors 2).
15. Panels: the larger of the trigger and the widest row, at most 320 wide; at most 320 tall with a mouse and 60dvh in a touch popover (selectors 3). Exception: the command palette is a fixed 640px wide, its top at 20vh, and on a tablet it hangs 16px under the bar (search).
16. The phone's full-screen layer: `--raised`, no radius, no scrim, no shadow (search).
17. Search sizes: input row 48 (56 on touch), footer 36, list at most `min(60vh, 480px)`, a 100px status column and an 80px date or price column (search).
18. Filter chips truncate at 160px; the remove X is a 24px button shown with a mouse only. Idle chips use the Tag's solid edge with a Plus, never a dashed edge, so dashes stay with chart references (selectors 4 and 10).
19. `Input` `sm`: 32 with a mouse, 44 on touch, for filter bars (selectors 5).
20. Segments on touch carry a 2px `::after` above and below, so a 40px segment is a 44px target (selectors 6).
21. Touch calendar cells are 1/7 of the grid wide and 44px tall (selectors 7).
22. Charts: monthly flows are columns, one series at a time; comparisons across properties are tables; no stacked bars, donuts or rainbow series; a balance over time is a 2px line. Plots are 160 tall on the Overview (128 below `sm`) and 120 on the property page (96). Columns are 60% of their slot, at most 24px. Meters and ranked bars are 4px. Baseline 1px `--line-strong`, gridlines 1px `--line`, labels `text-meta` `--fg-3`, compact dollars on ticks only. Square ends on every mark. The running month is a hollow column with "MTD", never dashed or faded. Breakdown figures keep the dotted `--line-strong` underline (charts 1 to 6, 12).
23. The unread dot gets a second position: in a row's leading gutter, centered 8px before the first column. On the timeline rail it marks the New divider (activity).
24. While a file is dragged, every drop target takes the field focus look 8px outside its content at `rounded-lg`, and the one under the pointer shows a "Drop to add…" label at the Float level (uploads).

**Section 7, motion**
25. Motion per member: lists open at `--dur-0`; date and repeat panels pop at `--dur-base`; phone sheets rise at `--dur-sheet`; a step inside a layer swaps at `--dur-0`; the `Switch` knob and `Checkbox` check spring at `--dur-check`; `PopoverSurface` takes a `motion` prop (selectors 9, conflict 10).
26. One dim level, 50%, for disabled controls, lists loading and row saves that aren't optimistic. Optimistic edits never dim (selectors 8, conflict 11).
27. One spinner glyph, `LoaderCircle`: after 200ms, at least 400ms; under reduced motion it shows without turning (forms 7, search, conflict 31).
28. Marks move, lists swap: chart columns spring to new heights over `--dur-base` on a metric switch; lists and tables swap at `--dur-0` (charts 11).
29. A downward swipe closes the photo viewer on touch, with no screenshot to cite (uploads).

**Section 9, components**
30. Sheets: the footer and its primary ride above the on-screen keyboard on phones and in the tablet dialog. A picker opened inside a sheet on touch replaces the sheet's body with a back arrow beside the X, never a second sheet (forms 4 and 10, conflict 8).
31. `ActionBar` on app pages: the job page bar's recipe, shown only while it has a job, hidden while the on-screen keyboard is up (forms 5 and 13).
32. The calendar heading steps to a month grid, then a 12-year grid (forms 6, conflict 9).
33. Prefix and suffix text inside a field in `text-body` `--fg-3`. "Saves as $425,000" in the helper line while typing a number (forms 2 and 11).
34. Form groups use `Section as="h3"` (forms 9).
35. A save conflict shows on the one open field: a neutral `--fg-2` line with "Keep Pieter's" and "Save mine" (forms 12).
36. The public move-in report's step line, "Kitchen · 3 of 7", over the progress meter (forms 8).
37. Tablet pickers and value menus open as anchored popovers with touch rows; phones get a titled sheet (selectors 4.2 A).
38. Tapping a comment card opens its menu on touch (activity 3.2 B, marked new).
39. New tiles: "Add photo" inside the empty property photo tile; a HEIC tile (`FileImage` over "HEIC") for photos with no preview; a "waiting for signal" tile with `WifiOff`, marked invented (uploads).
40. Exceptions kept: the Review banner stays a `Card`; Needs review buttons keep their own line on phones (activity).
41. Tabs: route tabs sit in a labeled nav, set `aria-current="page"` and style from it. The Tabs line here and the Typography rule in `CLAUDE.md` change with it (selectors question 8, approved).

## 6. Deferred

**Waiting on Connor**
- Address suggestions, forms phase 2. Connor picks Google Places, Mapbox or Smarty, accepts its terms and supplies the key, which goes through `src/lib/env.ts`. On his to-do list. Phase 1 ships suggestions from HG's own properties and deals.
- The Zillow profile URL (brand decision 15). The no-link line stays.
- **One question to send now: the 765 and 767 shared loan.** Connor approved the recommendation (the balance on one record, LTV against both values, "Shared with 767 Prospect Ave"). Building it needs a nullable `Property.loanSharedWithId` that no spec listed, plus his split of the duplicated value, sq ft and replacement cost (PORTFOLIO-V01). A config constant naming the two buildings isn't an option (README: don't hard-code what another business would set differently). If he says yes before phase 0 starts, the column rides in this migration and CH builds the line. Otherwise LTV stays per record and this waits.
- Data runs after landing, each with a dry-run report first: the deal-note author backfill (AC's script) on the production project `ywdjaygwkqyrmbdnvaai`, and the list pairing the 11 closed deals with their properties (search IA-I13).
- Real-device checks only Connor can do: the keyboard on an iPhone SE and iPhone 17 (composer, one-field sheets, sheet footers), the first tap raising the keyboard in the palette on an iPhone and an iPad, long-press drag on listing photos in iOS Safari, the PDF frame in Safari.
- Removing the Settings Storage tab once it reads all private (uploads, at review).

**Later work the specs name**
- Uploads phase 6: W-9 and COI slots and their schema, with the admin spec.
- No editor sets `TaskTemplate.finishPhotosRequired` yet, so every job stays optional until a playbook editor exists or Connor asks for one field.
- Selectors question 9 (split Stage and Priority) and question 11 (Snooze for Holding), Phase 4.
- Search step 5: deeper fields, `unaccent` and `pg_trgm`, the typo fallback, folding closed deals into their property, G-then keys, a `/search` page, record actions. Search choice 5 B goes to its own shell spec.
- Charts: the prior-year reference and Year to date comparisons (from Jan 2027), "12 months" in the period row (Jan 2027), budget against actual (needs rehab budgets), closed-books marks, the Statement tab, LLC grouping and DSCR, the line drill (DATA-I04).
- Activity slice 8: property and contractor logs, with the property hub (D10).
- Forms: a "Record a refinance" sheet if five loan commits get old; the one-time login link (G1A-001) is the migration plan's.
- Uploads: multi-select, a viewer thumbnail strip, attach on `/tasks/new`, resident photo intake, document categories, pdf.js, the away panel (choice 1 B).
- The contractor invoices plan (`docs/contractor-invoices-plan.md` on main) builds after the Nov 1 cutover and touches the portal, `lib/attachments` and `lib/tasks/core.ts`; it starts from this build's landed versions.

**Picked up from the integration step's deferred list.** These specs now build the property photo, a Button loading prop, a Tag look, `Input` and `Select` `sm`, the shared rail row, a platform Kbd helper, deals saves through `callAction`, and the whole-row table link (`RowCell`). Still deferred: the Needs you deep links to record sections, the portal next-job query, the QuickBooks `companyName` call, the public listing page, and new phone layouts for the deal page.

## 7. Phase 2: merge, check, review, repair, land

1. **Merge (45 to 60 minutes).** Create `build-integration` from `build-base-0`. Run the merge gate (section 3). Merge the nine `-r` branches (or apply their patches), running typecheck after each so a contract break shows where it came from. Then lint and test.
2. **Wiring and clean-up (1.5 to 2 hours, one agent).** Link what couldn't exist before the merge: "New contractor" in `lib/commands.ts`, "Set as property photo" in the viewer's `menuItems` (UP1's viewer calling UP2's action), the strip's "Add value" to `#value`. Remove interim code paths and any re-export left at an old path (`properties/fact-strip.tsx`, the financials `_components`). Delete what the specs retire: the native `Select` and `selectTouchHeight`, `SelectChip` (`tasks/[id]/select-chip.tsx`), `StageSelect`, `StatusMultiSelect`, `StatusChecklist` and `filterRowClass`, `deals/sort-header.tsx`, RepeatPicker's form, `ComboField`, `LabeledField`, `SectionCard` and `useSectionSave`, `PriceInput`, `quietField`, `inlineFieldClass` and `noSpinnerClass`, `attachments.tsx`, the `MediaUploader` wrapper and `DefaultTriggers`, the composer's `ReadyTile`, `PhotoGallery`, the two hand-drawn icons (VISUAL-032), `GlobalSearch`, the header's theme button, `IncomeExpenseBars`, `HeadBar`, `Strip`, `Kpi`, `DqStat`, `PartialLabel`, `grandTotalCell`, `updateTimeLabel`, `fmtAgo`, `CONFLICT_MESSAGE`. If `FilesList`'s Rename fits on F1's `InlineField` with no visual change, move it there, so inline editing has one implementation. Add the reported routes to `tests/devices/routes.ts`. Write every reported row into `docs/components.md`, the one owner of that file. Typecheck, lint, test.
3. **Device check (1 to 1.5 hours with fixes).** The full run. New errors get fixed, never added to `known-issues.json`; fixed entries are dropped. Charts' month slots under 44px on phones are an accepted warning, not a known issue.
4. **Screenshot and dark-mode review (1 to 1.5 hours).** Read-only reviewers in parallel, one per area, over `device-report/` in light, then a dark pass of every page. By hand at 375 and 320, in WebKit and Chromium: every dialog, menu, sheet, popover and step the sweep can't open, the intercepted create sheets opened by soft navigation included. The WebKit spikes the specs ask for run here: the PDF frame, long-press drag, the palette's keyboard trick in emulation.
5. **Repair (2 to 3 hours, then 30 minutes of checks).** Repair agents in parallel by area under the same ownership table, on follow-on branches merged back into `build-integration`. Then typecheck, lint, test and a full device check again.
6. **The task migration session's review (1 to 2 hours, waiting on that session).** Send it the diffs of every path on its list (section 3) and the migration. Wait for its OK, apply its fixes, re-run the checks.
7. **Landing (1 to 1.5 hours).** Check that no other session is landing and say which files land. Commit, merge `origin/main` into the branch, check main's new commits for overlap and say what overlapped. Typecheck, lint, test and the full device check. Before pushing, confirm how production migrates: prebuild runs `prisma migrate deploy` only on a production build with a direct or session `DATABASE_URL`, and skips it on the Supabase transaction pooler (port 6543). If production is on the pooler, the batch has to reach the production database before the code that reads it, through the README runbook and with Connor's go-ahead; it's additive, so today's code runs on it. Then `git push origin HEAD:main`. Check `/api/health` for the new commit and that the migration is applied. Run the backfill's dry run, show Connor the report and apply it on his OK. Add the deferred items to `docs/todo-for-connor.md`.
8. **Connor's device pass (his time, after landing).** The real-device checks in section 6.

## 8. Reuse check for what this plan adds

The specs carry the reuse checks and references for everything they design. This plan adds only plumbing so nine packages can build in parallel, and no UI of its own.

- **Reused:** the fix pass's `dealStatusLabel`, `pickerField` and `AddRow` (if they land); `LeaveGuard` and `useHoldLeave`; `TaskReadState` for staff unread; `logDealChanges` for the change log; the sidebar cookie pattern (`lib/sidebar.ts`) for remembered lists; `normalize.ts` for street order.
- **Extended:** `ListTask` (`unread`, `repeat`); `LeaveHold` (`scope`, several holds); the props listed in 1.5 for `Lightbox`, `MediaUploadTray`, `useMediaUploader`, `MediaGrid`, `Select`, `DatePicker` and `Sheet`; `property-types.ts` (`systemsDated`, `projectedYear`).
- **New, each traced to the spec item it serves:** `lib/tasks/read-state.ts` (activity 3.5 A), `lib/deals/note-author.ts` (activity 2.9, DEALS-044), `lib/picker-options.ts` (selectors 3.3), `lib/tasks/checklist.ts` (forms 4.4, BTASKS-024), `lib/portal/job-notice.ts` (activity question 2), `lib/list-memory.ts` (selectors 3.7), `lib/recent-views.ts` (search 2.10).

## 9. Wall-clock

| Step | Wall-clock |
|---|---|
| Before phase 0: the rollout, the second fix pass and the NOI fix land, base recorded, the task migration session asked, the shared-loan question sent | 15 to 30 minutes, plus that session's answer |
| Phase 0 | 6 to 8 hours |
| Guidelines amendments, drafted alongside phase 0 | 1 to 1.5 hours |
| Phase 1 builds (AC, F1 and UP1 run longest) | 6 to 7 hours |
| Phase 1 reviews and repairs | 1.5 to 2 hours |
| Phase 2, steps 1 to 7 | 8 to 11 hours |
| Total | About 22 to 28 hours, with phase 1 a good overnight run |
