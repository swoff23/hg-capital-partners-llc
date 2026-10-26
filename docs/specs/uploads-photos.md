# Uploads, photos and files

Spec for Connor's approval. Oct 25, 2026. Nothing here is built. Building starts only on an explicit "build it" in chat.

Sources: the component inventory for this group, `docs/uiux-review/*.md` (G1D, FEEL, COPY, MOBILE, VISUAL, PROPERTY, JOURNEYS, ADMIN, BPORTAL, G1A, BTASKS, G2C, PUBLIC, IA, TASKS), two Mobbin research passes plus a review pass that opened 25 of the cited screens to check them, `docs/brand-guidelines.md` sections 2, 3, 5, 6 and 9, `docs/components.md`, and the Activity spec written alongside this one. Anything the brand guidelines don't cover is marked **new**; anything with no reference behind it is marked **invented**.

## 1. Summary

**What's wrong today**

- **Four ways to upload, each with its own rules.** Tasks and the portal share `useMediaUploader`. Property documents use the older `Attachments`. Listing photos have their own `PhotoGallery`. Contractor W-9s and COIs can't be uploaded at all.
- **Work gets lost.** Leaving a page cancels whatever is still uploading. The staff task page and the listing editor don't even ask. iOS Safari never asks on a reload or a closed tab. A file dropped outside the two small drop boxes opens in the tab and throws the draft away (G1D-008).
- **Photos are heavy and badly named.** No app upload gets a thumbnail or a video poster, so grids pull 25 MB originals into 88px tiles (G1D-004). Every iPhone capture is "image.jpg" (G1D-009). HEIC breaks outside Safari. Public listing photos keep their GPS (G1D-027).
- **Evidence is hard to review.** Media comes oldest first, so the finish photos hide behind "Show all" (G1D-012). Every photo shows twice (BPORTAL-014). The Review banner is a bare count (G1A-007). Documents open in a raw browser tab, which leaves the app on a phone (G1D-003).
- **Property documents are the roughest corner.** One-click permanent Remove that swallows errors (G1D-V01), no type or size check (G1D-035), no progress, failures that vanish (FEEL-030), a dashed box, hand-drawn icons and setup text on screen (COPY-052).
- **The listing editor** shows three overlapping buttons on every tile on touch (G2C-V02), implies the cover by position (G1D-017), takes no drops, and leaves discarded uploads public forever (G1D-026).

**What replaces it**

1. **One upload queue** in the app and portal layouts that every surface feeds. Leaving a page no longer cancels anything. A later step keeps the queue on the device, so it survives a reload, a closed tab and a weak signal.
2. **Photos are prepared before they go up:** turned upright, given a thumbnail or a video poster, named by date when the camera's name is generic, and stripped of location before anything goes public.
3. **Drop or paste anywhere on a record.** No dashed boxes. One button in the section header, and a drop state that lights up where the file will land.
4. **One way to look at evidence:** the photo grid newest first with the finish set on top, document rows that say who added them and when, and one viewer for photos and videos (and documents at a desk), with zoom and links that open straight to a file.
5. **A listing photo manager** built around a big cover, drag to reorder and one ⋯ per photo.
6. **Mark done with proof slots**, one post per batch, and a payoff that shows what HG received.

**Build order**

| Phase | What ships | Needs from Connor |
|---|---|---|
| 1. Fixes | Window drop guard, thumbnails and posters, dated names, property document checks and a confirm before delete, cleanup of discarded listing uploads, the Review photo count (this visit, videos named), copy and token fixes | Nothing: these are logic, data and wrong-copy bugs |
| 2. One queue | The queue in the layouts, drop and paste targets, the shared document rows, property Documents on the queue | Choice 1 |
| 3. Survives the phone | The on-device outbox, the waiting state, resume, the late-upload rule | Questions 3 and 4 |
| 4. Evidence | Grid order and overflow, Activity strips, viewer upgrades, the photo row for the Review card, Mark done slots, batch posts with Undo, Download all | Choices 2, 3, 5 and 6; questions 2, 5 and 6 |
| 5. Listing and property photos | Photo manager, the property photo, public carousel and full-screen tour | Choice 4; questions 2 and 6 |
| 6. Documents with owners | W-9 and COI slots | Question 2 |

**Touches other specs.** Forms owns the listing editor's move to its own editor (PROPERTY-040) and the publish gate (G2C-I01). Activity owns the timeline rows that show the batch line and strip, and the Review card above Approve (its own choice between a corrected banner and a proof card); this spec supplies that card's photo row and which photos go in it. Choice 3 here replaces the two-row grid in the Activity spec's comment card table. Search and Home place the 32px property photo in their rows. The admin work owns COI and W-9 status (ADMIN-029). This spec owns the media pieces; the others place them.

**Not in this round:** multi-select on photos and files (two partners are covered by Download all and per-item Delete), a thumbnail strip or details panel in the viewer, attach on `/tasks/new`, resident photo intake, document categories (PROPERTY-028) and tying a document to the section it proves (G1D-023). Each is noted where it would land.

## 2. The components

Rules every piece follows: tokens from the brand guidelines only; lucide icons at 16px with a mouse and 20px on touch, 14px inside a chip or badge (section 6); icon-only buttons are square, and `rounded-full` never goes on a button (sections 5 and 9; the Retry pill is the one photo exception section 9 names); borders 1px (section 5); 44px targets on touch; spacing on the 4px scale; hover cues only under `@media (hover: hover)`; motion from section 7, with reduced motion turning every change into a fade of 120ms or less; one Esc closes one layer.

### 2.1 Upload queue (the engine)

- **Files.** New `src/components/upload-queue.tsx` (`UploadQueueProvider`, `useUploadQueue`), mounted in `src/app/(app)/layout.tsx` (inside `AppShell`) and `src/app/(portal)/p/layout.tsx`. Extends `src/components/media-uploader.tsx`: `useMediaUploader(target)` keeps today's API (`uploads`, `pending`, `failed`, `notice`, `failedLine`, `takePhoto`, `chooseFiles`, `addFiles`, `retry`, `remove`, `inputs`) and reads the queue. New `src/lib/attachments/prepare.ts`. Phase 3 adds `src/lib/attachments/outbox.ts`.
- **Job.** Check, prepare, queue and upload every file for every surface, keep going when the page that started it is gone, and report pending, waiting and failed counts back to whoever is showing them.

**Targets.** Each surface registers one target. The queue is keyed by it.

```ts
type UploadTarget = {
  key: string;                    // "task:<id>", "portal-task:<id>", "property-doc:<id>", "listing:<id>", "property-photo:<id>", "contractor-doc:<id>:w9"
  label: string;                  // "56 Tamarack St": for toasts and aria labels
  uploadKind: UploadKind;         // the /api/blob/[kind] token route
  access: "private" | "public";   // listing and property photos are public
  allowed: readonly FileKind[];   // from UPLOAD_RULES
  maxFiles?: number;              // a listing: 20 minus what it holds
  prepare: "original" | "display"; // display = a 2560px JPEG with no metadata
  record: (file: RecordMediaInput) => Promise<RecordMediaResult>;
  onRecorded?: (ids: string[]) => void; // while the page is mounted
  whenAway: "hold" | "post";      // staff drafts wait; contractor photos post
};
```

**Behavior**

- **Checks before any bytes move**, as today (`checkMediaFile`, `UPLOAD_RULES`), now for every target. Property documents take documents and photos: PDF, DOCX, XLSX, CSV and TXT up to 50 MB, photos up to 25 MB (G1D-035). Listing and property photos take photos only, up to 25 MB, and the listing's 20-photo cap counts down before anything uploads. The token route and the record step apply the same table, so the server stops trusting the browser's size and type.
- **Prepare** (`prepare.ts`, new). One file at a time, through `createImageBitmap`, which applies the camera's orientation.
  - Every photo the browser can decode gets a JPEG thumbnail at 1024px on the long edge (the size `schema.prisma` already documents), and every video gets a poster frame from a hidden video element. `RecordMediaInput` gains `thumbPathname` and `posterPathname`, which both record actions already accept (G1D-004, G1D-015).
  - `display` targets re-encode the photo itself to JPEG at 2560px and 0.85 quality. That drops GPS and every other tag (G1D-027) and turns HEIC into JPEG wherever the browser can decode it, as every iPhone can (G1D-010). Desktop browsers that can't decode HEIC are question 6.
  - Contractor photos get `display` too if question 3 is a yes. Staff uploads and documents keep their originals.
- **Names.** A generic camera name ("image.jpg", "video.mov", "photo (3).jpg") is stored as "Photo 2026-10-25 at 2.14 PM.jpg" or "Video 2026-10-25 at 2.14 PM.mov", in Eastern time. The year is in it because a stored name never updates (a name reading "Oct 25" is ambiguous a year later), the time takes a period because Windows refuses a colon in a saved file name, and names sort by date. Photos in one batch that share a minute get " 2", " 3" in pick order ("Photo 2026-10-25 at 2.14 PM 2.jpg"), so every tile, viewer header and delete confirm names a different file. This is the date-first form Dropbox's camera uploads use ([screen](https://mobbin.com/screens/07897a07-e74b-45fb-8591-7dfd0fc08831)) and macOS gives screenshots (seen in [Google Drive](https://mobbin.com/screens/b81fb867-21fc-4969-8a71-cd0cd53c7a53)). **New:** a naming rule; the brand's date formatter governs dates shown as labels, not stored file names. The blob path uses a slug of the name (`photo-2026-10-25-214pm-2.jpg`). Real names ("Lease 2026.pdf", "IMG_6117.png") stay as they are (G1D-009).
- **Upload**, as today: three at a time, multipart above 8 MB, one multipart file at a time, and a failed record step retries without re-sending the bytes.
- **Batches.** Files picked, dropped or pasted together are one batch. One batch makes one activity line and one confirmation (G1D-I03).
- **Leaving the page.** The provider owns the uploads, so the back link, the nav and search no longer cancel them. Once the page is gone, a staff target holds its files as drafts in the composer, where they already wait today, and a contractor target posts them as their own update, as it does today on unmount. How you hear about them is choice 1.
- **Reloads and closed tabs.** Phase 2 keeps `useLeaveWarning` (browsers that honor it ask; iOS Safari doesn't). Phase 3's outbox resumes instead.
- **Sign out** while anything is going up asks first, through the existing `LeaveGuard` sheet: "3 photos are still uploading", with "Leave anyway" and "Keep uploading".

**Phase 3: the on-device outbox** (`outbox.ts`, new)

- Every file goes into IndexedDB before any bytes move: the file, its target key, its batch, `queuedAt`, its progress, and for multipart the upload id and the parts already sent.
- The next app or portal page that opens reads the outbox and carries on. The job page shows the same tiles back in place.
- Multipart moves to `createMultipartUpload`, `uploadPart` and `completeMultipartUpload` (exported by the `@vercel/blob` 2.8 client), so a 300 MB video resumes at its last 8 MB part. A resumed upload asks the token route for a fresh token.
- **Weak signal.** A request that fails while `navigator.onLine` is false, or times out, moves the file to Waiting, not Failed. It retries on the `online` event, on coming back to the tab, and after 2, 5, 15 and 60 seconds. A file turns red only when the server refuses it, or after 4 failed tries while online. Nothing is dropped on its own.
- The page asks for `navigator.storage.persist()`. Safari can clear a site's storage after 7 days without a visit, so the outbox is a safety net for hours, not an archive.
- iOS pauses a backgrounded tab, so uploads stop while a contractor is in the Camera app and pick up when they come back. A web page can't upload with the tab closed (no Background Sync in Safari), so "survives" means it resumes on the next open.

- **Sizes.** An engine: the same at 1280, 768, 375 and 320.
- **Tokens.** None of its own.
- **References.** Google Drive keeps the page usable while a corner panel uploads ([screen](https://mobbin.com/screens/59045016-c719-4504-aebd-95bf195eaeaa)); Grain shows the upload as a row in the real list ([screen](https://mobbin.com/screens/1d469543-b7ed-44a7-ae57-211f440e0875)); WhatsApp puts the album in the thread before the network finishes ([screen](https://mobbin.com/screens/d5ff7e9c-035f-4f5a-85bf-8e6b11174a97)); Instagram's upload keeps going while you move around ([screen](https://mobbin.com/screens/87195638-f604-48bc-b5fb-3a1691ec6895)); Beli lets you leave while it finishes ([screen](https://mobbin.com/screens/8a668418-796a-48a8-83b9-710d32e09bd3)); Apple HIG, [let people keep working while content loads](https://developer.apple.com/design/human-interface-guidelines/loading). Avoided: "Don't close this tab" in Fabric ([screen](https://mobbin.com/screens/65f32a6c-5850-46b5-9eae-cb1a76eb938e)) and Supabase ([screen](https://mobbin.com/screens/db5924ed-04c5-4ea2-a20c-bd81cf0917bc)).

### 2.2 Drop and paste

- **Files.** New, in `upload-queue.tsx`: `WindowDropGuard` (mounted with the provider), `useDropTarget(target, ref)` and `DropLabel`.
- **Job.** Let a file dropped or pasted anywhere on a record land in the right place, and never let a stray drop open the file in the tab.

**Anatomy**

- **At rest:** nothing. No dashed box anywhere (brand section 9, Empty).
- **While a file is dragged into the window,** every target on the page takes the drop state: the field focus look from brand section 9 (a 1px `--act` edge plus a 1px inset `--act` ring), `rounded-lg`, drawn 8px outside the target's content so nothing shifts. A Section takes it around its content, under the heading rule. **New:** the field focus look on a section.
- **The target under the pointer** also shows the drop label at its center, at the Float level: `--raised`, the `--line-float` edge, `shadow-float`, `rounded-lg`, 8px by 12px padding, a 16px lucide `Upload` in `--fg-3` and `text-label` `--fg-1`. **New.**

```
Desktop 1280, property record, a file dragged over the rail
+--------------------------------------+  +---------------------------+
| Units                                |  | Documents 4    [Add files]|
| ...                                  |  |-------------------------- |
|                                      |  | +-----------------------+ |
|                                      |  | | [doc] Lease 2026.pdf  | |
|                                      |  | |  +-----------------+  | |
|                                      |  | |  | ^ Drop to add to |  | |
|                                      |  | |  |   Documents      |  | |
|                                      |  | |  +-----------------+  | |
|                                      |  | +-----------------------+ |
+--------------------------------------+  +---------------------------+
```

| Target | Drop label |
|---|---|
| Task page main column | Drop to add to this reply (Shared), or Drop to add to this note (Internal), following the composer's switch |
| Property Documents | Drop to add to Documents |
| Listing photos, while editing | Drop to add photos |
| Contractor job page | Drop to add to this job |

**Behavior**

- The guard cancels the browser's default for `dragover` and `drop` everywhere, and sets `dropEffect` to `none` outside a target, so the cursor says no and the draft survives (G1D-008).
- Drag state counts `dragenter` and `dragleave` on the window, not on each child, so it never flickers (G1D-024).
- A drop runs the target's checks (2.1). Tiles or rows appear at once, and you can keep adding while others upload.
- On the task page the whole main column is one target that feeds the composer's tray, so nothing posts without Send. The composer box keeps its own edge cue.
- **Paste.** Cmd or Ctrl+V with files, outside a text field, goes to the page's default target: the composer on a task, Documents on a property (the listing photos while that editor is open), the update tray on a job. Paste inside the composer works as today.
- **Keyboard.** Drag has no keyboard path. Every target keeps a visible button (the section header's "Add files", the composer's attach icon, the listing's Add tile), as Apple HIG asks ([drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop)).

**Sizes**

- **1280:** every accepting target lights up at once; the label shows only on the one under the pointer. On a property: the rail's Documents, and the listing photos while that editor is open.
- **768 (touch):** iPadOS can drag photos and files in from Split View, so the same drop state shows. The visible path is the 44px header button.
- **375 and 320:** no drag and drop. Paste from the iOS edit menu still works in the composer.
- **Drops on phone:** the drop state and the label.
- **Motion.** The edge appears at `--dur-fast`; the label pops in at `--dur-base` (scale 0.97 to 1). Reduced motion: a fade.
- **Tokens.** `--act`, `--raised`, `--line-float`, `shadow-float`, `--fg-1`, `--fg-3`, `text-label`, `rounded-lg`.
- **References.** Savee turns the window into one target with one line of copy ([screen](https://mobbin.com/screens/8494c1b0-237f-4a3e-b9bc-ba38289b0d3e)); Linear's reply box carries only a paperclip ([screen](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270)); Zillow leads with one button and treats drag as secondary ([screen](https://mobbin.com/screens/3613dc65-9e3a-4c20-b3e7-4dac3c341a8d)); Apple HIG, [highlight valid destinations](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop).

### 2.3 Upload tiles and the status line

- **Files.** Extends `src/components/media-uploader.tsx` (`MediaUploadTray`, `UploadTile`, `ProgressRing`). `FailedUploadsLine` moves out of `job-actions.tsx` into it as `UploadStatusLine`. The composer's `ReadyTile` folds into `UploadTile` as a `ready` state.
- **Job.** Show each file in flight where it will land, with its progress, its Retry and its Remove.

**States**

| State | Tile | Accessible name ends with |
|---|---|---|
| Queued, preparing | The local preview with the 24px ring at 0 on a 50% `--photo-scrim`, as today | waiting |
| Uploading | The ring fills | uploading, 40% |
| Saving | The ring full | saving |
| Waiting for signal (phase 3, **new**; the per-tile mark is invented) | The preview under the same 50% `--photo-scrim`, a 20px lucide `WifiOff` in `--on-photo`, no ring | waiting for signal |
| Failed | The 2px inset `--danger` ring in place of the photo edge. Grid: the `RetryPill`. Row: the whole tile retries, now with `RotateCcw` to match the pill | couldn't upload: no connection |
| Refused by the check | `TriangleAlert` on a 60% `--photo-scrim`, as today. Remove only | couldn't upload: over the 25 MB limit |
| Ready (composer) | The thumbnail (`?v=thumb`), not the original | ready to send |

- **Documents on a tile** show their type: a 20px `FileText` or `FileSpreadsheet` in `--fg-3` over "PDF" in `text-micro` `--fg-3`. Today it's a blank square, and the name is only in the title tooltip touch can't see.
- **Remove** stays a 20px `--act` badge, now with a 14px `--on-act` X (section 6's size inside a badge; today 12px), and square: `rounded-sm` in place of today's circle, since an icon-only button is square and `rounded-full` never goes on a button (brand sections 5 and 9). Turo puts a square X on each listing photo ([screen](https://mobbin.com/screens/6d630675-f5a5-4c41-83fe-962a8c61174e)). Today's 2px `ring-surface` halo becomes a 1px ring (brand section 5: every border is 1px) in the tile's ground (`--surface` on a Shared reply, `--fill-1` on an Internal note), so it no longer shows a white ring on the Internal ground. The hit area is 44px on touch and 32px with a mouse (today about 28px).
- **Removing a ready file** takes the tile out with the toast "Photo removed · Undo". The file is deleted when the toast ends. Today it's deleted at once with no undo (G1D-V01).
- **The status line** (`UploadStatusLine`): one line of `text-meta` that truncates, under the tray or under the bar's buttons. The composer gets it too (today: a red line with no Retry).

| Situation | Line |
|---|---|
| Files can be retried | "2 photos didn't upload · Retry" in `--danger`, Retry underlined, 44px on touch (today's line) |
| Nothing can be retried | "1 photo didn't upload: over the 25 MB limit" in `--danger` |
| No signal (phase 3) | "No signal · 5 photos waiting" in `--fg-3`; "No signal · 5 waiting" below 360px |

- **Layouts**, as today: `row` is 56px tiles in a wrapping row (the composer); `grid` is squares at least 88px wide (the job page and the Mark done sheet). The grid's phone gap goes from 6px to 8px, the brand's 4px scale.
- **Keyboard.** Tab reaches Retry and Remove; both names carry the file's name.
- **Touch.** Nothing waits on hover: every state shows on the tile.
- **Sizes.** Row tiles are 56px at every size. Grid at 1280: squares of about 98px in the 448px Mark done sheet (16px padding, four across); at 768 the same sheet, centered; at 375 about 127px in two columns beside Send on the job page (109px in three columns in the sheet); at 320 about 100px (91px in the sheet).
- **Drops on phone:** nothing. Per-file percent and size are in each tile's name only, as today.
- **Tokens.** `--photo-scrim`, `--on-photo`, `--danger`, `--pill-bg`, `--pill-fg`, `--act`, `--on-act`, `--fill-1`, `--fg-3`, `text-meta`, `text-micro`, `rounded-lg`, the photo edge.
- **References.** HBO Max keeps the failed item in place with Retry (brand section 9, [screen](https://mobbin.com/screens/2c6b51a6-80b2-40f0-8513-83e693c55da3)); Quo keeps failed items in the thread ([screen](https://mobbin.com/screens/aa17f20e-29cc-4bc7-90b8-968cc829294c)); Alan puts "tap to retry" under the item ([screen](https://mobbin.com/screens/87f86008-4e1b-4f02-822a-92f5050638d3)); Whop keeps a refused file in the list with its reason ([screen](https://mobbin.com/screens/03fc821c-eec1-4278-bf97-8f8ac202d34c)); Google Photos marks pending tiles in the grid ([screen](https://mobbin.com/screens/76e5e5f4-d870-4c22-a1ad-1cf7c5c341d6)).

### 2.4 Document rows (FilesList)

- **Files.** Moves `src/app/(app)/tasks/[id]/files-list.tsx` to `src/components/files-list.tsx` and extends it. Used by the task page, Activity, the contractor job page (in place of its hand-rolled links), property Documents and the contractor record.
- **Job.** List a record's documents and links with what they are, who added them and when; open them in the viewer; rename and delete them (staff).

**Anatomy**

- Type icon, 16px, `--fg-3`: `FileText` for PDF, DOCX and TXT; `FileSpreadsheet` for XLSX and CSV; `FileImage` for a photo kept as a document (a photo of an insurance card); `ExternalLink` for a link.
- Name in `text-body` `--fg-1`, truncating. A 14px `Lock` for Internal, as today.
- **New:** a byline, "Connor · Oct 3", in `text-meta` `--fg-3`, dated by the brand's one formatter.
- Size in `text-meta`, tabular, right-aligned, as today.
- The ⋯ ghost icon button, shown on hover or focus with a mouse and always on touch, as today. Its Menu: Open, Download, Rename (staff), Delete (staff, destructive). The portal gets Open and Download. On touch the ⋯ stays at rest because the row's own tap already opens the file, so the menu needs its own target; that is the file-list pattern on phones, where Dropbox ([screen](https://mobbin.com/screens/07897a07-e74b-45fb-8591-7dfd0fc08831)) and Google Drive ([screen](https://mobbin.com/screens/a6b02083-1ab2-438c-998b-5a833c4f1a25)) show a ⋯ on every row. It is a menu, not an edit pencil, so CLAUDE.md's touch rule (tap the thing to act on it) still holds for the row.
- **In flight (new):** the ring in the icon slot (a surface tone: an `--fg-1` arc over a `--line` track), "Uploading 40%" in the byline slot, and a ghost icon X ("Cancel upload of Lease 2026.pdf") in the ⋯ slot.
- **Failed:** the reason in `--danger` in the byline slot ("No connection"), then a ghost sm "Retry" and the X. Refused: the reason ("Over the 50 MB limit", "This type can't be added") and the X only.

```
Desktop, one line (task page column)
[doc] Lease 2026.pdf                       Connor · Oct 3    1.2 MB  [...]
[xls] Rent roll Sep.xlsx           [lock]  Pieter · Sep 30    48 KB  [...]
 (o)  Insurance policy.pdf                 Uploading 40%             [ x ]
[doc] Survey.pdf                           No connection   [Retry]   [ x ]

Two lines (the 320px rail on a desktop)
[doc] Lease 2026.pdf                                   [...]
      PDF · Connor · Oct 3 · 1.2 MB

Two lines (phones, 375 and 320: the size drops)
[doc] Lease 2026.pdf                                   [...]
      PDF · Connor · Oct 3
[doc] Survey.pdf                                       [ x ]
      No connection · Retry          <- Retry underlined, 44px area
```

**Behavior**

- With a mouse, a row opens the viewer on the documents sequence (2.6). On touch, under choice 6's recommendation, a row opens the file directly as today (a PDF in the system viewer, other types download), since the viewer could only show a card with an Open button there; a `?file=` link to a document still lands on that card. A link opens its outside URL in a new tab, as today.
- **Rename** turns the name into an `Input` in place: Enter saves, Esc reverts (`useInlineEditKeys`). The extension stays.
- **Delete** asks in `ConfirmDialog`, as the task rows already do: "Delete this file?", "“Lease 2026.pdf” goes for good.", Keep it, Delete file.
- With two or more failed rows, the status line (2.3) sits under the list.
- In Activity rows the byline is off (the comment already names who and when), and the menu is off, as today.

**Sizes**

- **1280:** one line when the list is at least 28rem wide (a container query), 40px rows. The byline sits in a fixed 7rem column and the size in a 4rem right-aligned column, so sizes line up. In the 320px property rail rows take two lines.
- **768 (touch):** one line at 48px on the task page; the ⋯ always shows.
- **375 and 320:** two lines, 60px rows (brand section 5). Below 480px the size drops rather than wrap: "PDF · Connor · Oct 3". A failed row keeps the name and the X on line one and puts "No connection · Retry" on line two, Retry underlined with a 44px area as in the status line, so no button squeezes the name. At 320 the name has about 200px beside the icon and the 44px X.
- **Drops on phone:** the size.
- **Keyboard.** Tab to a row, Enter opens it. Tab to ⋯; arrow keys and typeahead in the menu; Esc closes the menu only.
- **Tokens.** `--fg-1`, `--fg-3`, `--danger`, `--line`, `--fill-1` (hover; `--fill-2` inside an Internal card), `text-body`, `text-meta`, `rounded-md`.
- **References.** Xero's files table with size, uploaded and uploaded-by columns and a row ⋯ ([screen](https://mobbin.com/screens/0676d784-6a6c-4fd4-a47e-6527a4eb6ff0)); Remote writes provenance as words ([screen](https://mobbin.com/screens/75bad66f-7b71-45c8-a2f7-bf314a5c06ed)); Mistral AI's two-line rows ([screen](https://mobbin.com/screens/1bb83b09-fca3-44d1-a2d5-27b2c5f0591f)); Dropbox's phone rows with size and time under the name and a ⋯ at rest ([screen](https://mobbin.com/screens/07897a07-e74b-45fb-8591-7dfd0fc08831)); Zoom's in-flight file row with size, percent and cancel ([screen](https://mobbin.com/screens/42268236-8e19-4709-8369-88695d6ab52a)).

### 2.5 Photo grid (MediaGrid)

- **Files.** Extends `src/components/media-grid.tsx`. The order changes in `src/app/(app)/tasks/[id]/page.tsx` and `src/lib/portal/queries.ts`.
- **Job.** Show a record's photos and videos so the newest proof is first, and open the viewer.

**Changes**

- **Newest first** (G1D-012).
- **The finish set leads.** On the task and job pages, the photos sent with the latest Mark done sit first under "At finish", then "Other photos", each label in `text-meta` 500 `--fg-2`. With no Mark done set there are no labels (G1D-034).
- **Overflow** is choice 2 (recommended: a "+N" tile).
- **Hover, with a mouse (invented):** the tile's photo edge steps up to a 1px inset `--line-control` at `--dur-fast`. No reference shows a hover on photo tiles, and it gives `--line-control` a job section 4 doesn't list (it identifies controls; a tile that opens the viewer is one). Cut it if you'd rather keep today's pointer-only cue.
- **The Internal lock chip** grows from 16px with a 10px icon to 20px, `rounded-sm`, on `--photo-scrim` with a 14px `Lock` in `--on-photo`, 4px in from the top left: section 6 puts icons inside a chip at 14px, and 10px is under that.
- **Thumbnails** for every new upload (2.1), so tiles stop loading originals.
- **An early load failure** shows `ImageOff`, not the browser's broken glyph: the tile checks `complete && naturalWidth === 0` after hydration, as `PhotoCarousel` does (G1D-I04).
- **A photo with no preview** (HEIC outside Safari with no thumbnail) shows a `--fill-1` tile with a 20px `FileImage` over "HEIC" in `text-micro` `--fg-3`, instead of `ImageOff`, which reads as broken. **New.**
- **URLs** come from a `urlFor(item, variant)` prop in place of the hard-wired `taskFileUrl`, so property files and public listing photos can use the grid and the viewer (G1D-001).
- **The strip variant** for Activity and the payoff (choice 3): photos in the 48x36 `PhotoThumb` box, 8px apart, as many as fit, then "+2" in `text-meta` `--fg-3`. Four thumbs and the count measure about 240px, so a strip shows four at 375 and up and three inside a comment card at 320 (the card's content is 232px there: 256px minus its 12px padding). A tap opens the viewer at that set.
- **The one-row mode** (`rows={1}`) for the Review card: the grid's tiles, one row only (6 from `sm`, 3 on a phone), the last carrying choice 2's "+N". The Activity spec's proof card uses it.
- **Names** add who: "Open photo by Zack, Oct 25, 2:14 PM" (the label uses the brand's date formatter, not the stored name). The video length chip stays as it is.

**The task page Section** (`view.tsx`) is titled for what it holds: "Photos and files 14", "Photos 12" or "Files 3" (TASKS-011). Its header ⋯ holds "Download all" for staff: the server streams one ZIP named "56 Tamarack St Fix porch light.zip", the toast reads "Preparing 14 files…", then the browser downloads it (G1D-031, question 6). The portal's Section has no ⋯.

**Sizes**

- **1280 and 768:** 6 columns of 88px, 8px gaps, two rows (12 tiles).
- **375:** 3 fluid columns of about 109px, two rows (6 tiles). **320:** about 91px. The gap goes from today's 6px to 8px, on the brand's 4px scale.
- **Drops on phone:** 6 tiles before the overflow instead of 12; the hover edge is mouse only.
- **Keyboard.** Each tile is a button, in newest-first order; Enter opens the viewer at it.
- **Tokens.** `--fill-1`, `--photo-stage` (video ground, from `globals.css`), `--photo-scrim`, `--on-photo`, `--line-control`, `--fg-2`, `--fg-3`, `text-meta`, `text-micro`, `rounded-lg`, `rounded-sm` (chips), the photo edge.
- **References.** Walmart's photo row whose last tile reads "+113 images" over the photo ([screen](https://mobbin.com/screens/5b2421d5-caad-4863-9579-02e127506528)); GetYourGuide's all-photos grid ([screen](https://mobbin.com/screens/7f7ccd6e-d0f8-4bb0-bf0a-a9ab3405a941)); Check labels evidence photos by what they show (from G1D-034, [screen](https://mobbin.com/screens/713a6f8e-2a44-416f-96ec-4ac14a45beae)).

### 2.6 Viewer (Lightbox)

- **Files.** Extends `src/components/lightbox.tsx`.
- **Job.** One full-screen viewer for photos, videos and documents: step through, zoom, play, download, and for staff rename and delete.

**Anatomy** (on the fixed `--photo-stage`, the same in both themes)

- **Header**, as today but on the brand's type tokens: the name in `text-body` `--on-photo`, over a byline in `text-meta` at `--on-photo`/70: "Connor · Oct 3, 2:14 PM", plus "· Internal" with a 14px `Lock` for an Internal file (G1D-016, **new** in the viewer). Then Download, ⋯ and Close as square `rounded-md` stage buttons, 36px with a mouse and 44px on touch (the brand's control sizes). Today they are 44px circles, which brand sections 5 and 9 rule out for buttons. Their hover fill stays `--on-photo` at 10%. The counter leaves the header.
- **⋯ Menu:** Open in new tab (mouse), Share (touch, where the system share sheet exists), Rename (staff), Set as property photo (staff, phase 5, a photo on a task tied to a property), Delete (staff, destructive). On a listing photo: Make cover, Move earlier, Move later, Remove (2.9). Contractors get Download and no ⋯, as today.
- **Counter:** "3 / 11" moves to the brand's counter spot: `--on-photo` on `--photo-scrim`, the pill shape, `text-micro`, tabular, 12px in from the bottom right (brand section 6). Its polite live announcement stays.
- **Chevrons** at the sides with a mouse, as today, but on 44px square `rounded-md` `--photo-scrim` grounds in place of today's discs.
- **Zoom bar (new):** photos only, with a mouse: "−  100%  +" on `--photo-scrim`, `rounded-md`, centered 12px above the bottom edge; 32px buttons, the readout in `text-micro` tabular `--on-photo`. Google Drive and Mercury float theirs at the bottom of the image; Asana puts it in the header.
- **Documents (new):** PDFs follow choice 6. DOCX, XLSX, CSV and TXT show a file card, as Salesforce does on its dark viewer ([screen](https://mobbin.com/screens/3e638e9d-7a1b-49ea-aded-b1f2a4e6f434)) and Evernote does in one line and one button ([screen](https://mobbin.com/screens/cd400126-4b54-407f-8238-0989944c3cd8)): a 40px type icon in `--on-photo` at 1.5 stroke (**new** size: twice the touch icon, since section 6 has no size for a glyph standing alone on the stage), the name in `text-body`, "XLSX · 48 KB · Connor · Oct 3" in `text-meta`, and a 44px labeled Download button in the photo-mark colors (`--pill-bg`, `--pill-fg`) with the carousel arrows' `rounded-md` shape, since section 9 allows no pill buttons beyond Retry. **New:** a labeled button in the photo-mark colors.
- **A photo the browser can't draw** (HEIC outside Safari, no thumbnail): "Can't preview this photo here." on one line in `text-body` `--on-photo`/70, with the same Download button under it (fixes the wrap in G1D-IV04).

**Behavior**

- **Two sequences, one viewer.** A grid opens its photos and videos; a document row opens the documents.
- **Links to a file.** Opening an item pushes `?file=<id>`, so the browser's Back closes the viewer and a pasted link opens straight to that file, on the task, job and property pages (G1D-003).
- **Zoom (photos).** The wheel or a trackpad pinch zooms around the pointer, up to 400%. Double-click toggles between fit and 200%. Drag pans while zoomed. Keys: + and − step, 0 resets. Arrow keys step only at fit.
- **Touch.** Pinch zooms and a double tap toggles, the iOS gestures Apple lists for zooming ([HIG gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)). One finger pans while zoomed: the stage's `touch-pan-y` goes and the viewer handles pointer events itself. At fit, a horizontal swipe steps and the photo follows the finger. A downward swipe at fit closes, as the iOS Photos app does (**new** here: a gesture with no screenshot to cite; Close and Back still close). A swipe that starts on a video doesn't step, as today.
- **Preload** the next and previous photo, thumbnail first.
- **Esc,** one layer per press: an open menu or confirm first, then the viewer. Zoom is a view state, not a layer, so Esc never spends a press on it; 0 or a double-click resets zoom.
- **Delete** asks in `ConfirmDialog` stacked on the viewer, in place of today's Sheet, so delete confirms one way everywhere: "Delete this photo?", "“Photo 2026-10-25 at 2.14 PM” goes for good.", Keep it, Delete photo. A refusal shows in the body in `text-meta` `--danger`.
- **Video download** asks the file route for a link that saves as a download, so it no longer opens a tab.
- **Public:** opened from /rentals, its overlay root carries `data-surface="public"` (brand section 4).

**Sizes**

- **1280:** a full-window overlay; chevrons; the zoom bar; the counter bottom right; a PDF frame centered, up to 960px wide.
- **768 (touch):** full screen; no chevrons or zoom bar; pinch, swipe and swipe down; the counter.
- **375:** the same; the byline drops the time ("Connor · Oct 3"). The name gets about 195px beside three 44px buttons (Download, ⋯, Close).
- **320:** the same; the name truncates at about 140px beside the three buttons (about 190px for a contractor, who has no ⋯). The header never wraps; the name and byline truncate.
- **Drops on phone:** chevrons, the zoom bar, the time in the byline, and Open in new tab (Share takes its place).
- **Tokens.** `--photo-stage`, `--photo-scrim`, `--on-photo`, `--pill-bg`, `--pill-fg`, `--danger`, `--raised` (menus), `text-body`, `text-meta`, `text-micro`, `rounded-md`, `rounded-full` (the counter only), `--dur-base` for the swipe spring back.
- **References.** Asana's viewer with name and date, zoom, Download and side chevrons ([screen](https://mobbin.com/screens/b27c383f-0712-4c39-bbb7-cb281bd101ce)); Google Drive's header actions and floating zoom bar ([screen](https://mobbin.com/screens/b81fb867-21fc-4969-8a71-cd0cd53c7a53)); Plane's small floating bar ([screen](https://mobbin.com/screens/3102e577-b22c-49f0-a806-1ed8692aa812)); Mercury's in-app receipt with a floating zoom and Download bar ([screen](https://mobbin.com/screens/60364c06-7c88-4ac9-a5e2-cf1041ab4e84)); Meetup's counter, Download and uploader byline ([screen](https://mobbin.com/screens/997acca9-cac3-4bd6-87aa-bd5335638586)); Salesforce ([screen](https://mobbin.com/screens/3e638e9d-7a1b-49ea-aded-b1f2a4e6f434)) and Evernote ([screen](https://mobbin.com/screens/cd400126-4b54-407f-8238-0989944c3cd8)) for the can't-preview card.

### 2.7 Review photos, the batch line and the payoff

- **Files.** Extends `src/app/(app)/tasks/[id]/review-banner.tsx` and its count in `page.tsx`, `src/lib/tasks/activity.ts` (the batch line), and `src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx` (batch posts, Undo, the payoff).
- **Job.** Put the proof where the decision is made, and show a contractor what HG received.

**Review card.** The Activity spec owns its layout, button order and copy (its choice between a corrected one-line banner and a proof card, recommending the proof card). This spec supplies two things:

- **Which photos.** This visit's uploads by the contractor (since the job last went to In progress), as the Activity spec defines it, with the Mark done sheet's photos first. Videos count as videos ("3 photos and 1 video"), and photos from earlier visits don't count (G1A-007, G1D-034). Phase 1 fixes today's count to this set.
- **The row.** The grid's one-row mode (2.5): 6 tiles from `sm`, 3 on a phone, the last carrying "+N" and opening the viewer at the whole set.

The Needs review rows on Today (BTASKS-016) can reuse the strip variant; the tasks spec places it.

**The batch line.** Activity and job updates show one line per batch, "Zack added 4 photos" ("3 files", "3 photos and 1 video", in the Activity spec's counting style), with the strip under it (G1D-I03). Consecutive file lines from one person within 2 minutes merge, which also tidies imported history.

**Contractor batches.** A batch picked while the composer is empty posts once every file in it has recorded, as one update. Files that failed stay on the tray with Retry and post as their own small update when they land, so one bad photo never holds up the rest. The toast reads "3 photos posted · Undo" for 5 seconds; Undo removes that update and its files (contractors only ever soft-delete; question 5).

**The payoff** (Mark done sent): `SpotArt` job-done (the property photo once phase 5 lands), "Thanks, Zack!", then the strip of what HG received, then "Sent to Connor and Pieter. You'll get an email if anything else is needed." and "Back to my jobs", as today. The strip opens nothing here, so the payoff stays one layer and one Esc closes it.

- **Sizes.** The strip shows four thumbs and the count at every size in the payoff (its content is 288px at 320, the sheet's 16px padding in from each edge) and in Activity lines; three inside a comment card at 320 (2.5). Nothing else drops.
- **Tokens.** As 2.5, plus `--toast-*` for the toast and `text-title` for the payoff heading.
- **References.** foodpanda shows the drop-off photo on the Delivered screen, proof shown to whoever checks ([screen](https://mobbin.com/screens/7ffc3768-f384-4883-8b25-039404c50c61)); Turo's thank-you says who got the photos and what's next ([screen](https://mobbin.com/screens/fb28d67a-0e73-43bd-9c70-3c11ead80da2)); Tripadvisor shows what made it before submit ([screen](https://mobbin.com/screens/8527e573-5ec2-44df-a35d-699941dd96d3)); Airbnb confirms a batch with one count ([flow](https://mobbin.com/flows/11086575-f2e6-4943-8d94-476fb86aa6b1)).

### 2.8 Mark done proof slots (portal)

- **Files.** Extends `MediaUploadTray` with a `slots` prop, the Mark done sheet in `job-actions.tsx`, and `markDoneButton` in `src/lib/portal/job-view.ts`. A template field holds the count (question 2).
- **Job.** Get the finish photos at the moment the work is done, and require them where the template says they matter (G1D-I19). This is choice 5's recommended option.

**Anatomy**

- **Heading line:** "Photos of the finished work" in `text-body` 500 `--fg-1`, with "1 of 2" right-aligned in `text-meta` `--fg-3` when the template asks for photos. A job without a requirement keeps today's question, "Add photos of the finished work?".
- **Slots:** the grid tray's sizing (auto-fill, at least 88px). Empty slots fill up to the required count (one on an optional job): `--fill-1` squares, `rounded-lg`, the photo edge, a 20px lucide `Camera` in `--fg-3`. Solid, never dashed. Once the count is met, one trailing add tile remains.
- **Filled slots** are upload tiles (2.3): progress, ring, Retry.
- The optional note, then the pinned buttons: secondary "Add photos" (`ImagePlus`, the picker) and primary "Mark done".
- **Disabled primary** carries one line under it: "Add 1 more photo" in `--fg-3`. "Finishing 2 uploads…" and the failed line keep their places, as `markDoneButton` in `job-view.ts` has them today.

```
Phone 375, a template that asks for 2
+-----------------------------------+
| Mark done                         |
| Photos of the finished work 1 of 2|
| [photo ] [ cam  ]                 |
| [ Add a note (optional)         ] |
| [  Add photos  ] [  Mark done   ] |
|          Add 1 more photo         |
+-----------------------------------+
```

**Behavior**

- An empty slot opens the rear camera directly (a third hidden input: `accept="image/*"`, `capture="environment"`), because finish photos are taken now. The shot drops into that slot and starts uploading; the next empty slot is the obvious next tap.
- "Add photos" keeps opening the picker, which on a phone offers Take Photo and the library, for shots already taken in the Camera app. That keeps the job page's deliberate picker, and meets G1D-005's camera-first ask inside the slots.
- Only uploaded photos count. A failed photo keeps its slot with Retry, and Mark done waits for it.
- "Skip" goes: with no photos on an optional job the primary reads "Mark done".
- These photos form the "At finish" set (2.5) and lead the Review card's photo row (2.7).
- One Esc closes the sheet; it stays put while sending, as today. (`Sheet` has no swipe to close today, and adding one is a Sheet change for every caller, so it isn't part of this spec.)

- **Sizes.** **1280:** the centered sheet at 28rem; with a mouse a slot opens the file picker, since `capture` means nothing there. **768:** the centered sheet at touch sizes. **375:** three slots of about 109px; both 48px buttons fit side by side. **320:** about 91px slots; each button about 138px, both labels fit.
- **Drops on phone:** nothing. The count, the slots and the reason line all stay.
- **Tokens.** `--fill-1`, `--fg-1`, `--fg-3`, `--act`, `--on-act`, `text-body`, `text-meta`, `rounded-lg`, the photo edge, `rounded-xl` sheet corners.
- **References.** Airbnb holds Next until the count is met ([screen](https://mobbin.com/screens/fcda60ea-e958-46fc-8db9-09ec2db05879)); Hinge makes the slot the add control ([screen](https://mobbin.com/screens/1071e227-8002-4399-b3f0-c0e8ea0adcfb)); eBay ([screen](https://mobbin.com/screens/49d04cd2-e517-4e26-9ab6-0d9f1c047327)) and alias ([screen](https://mobbin.com/screens/4f52c1f4-b905-4ce5-9648-35da46cebe48)) fill numbered slots one shot at a time; Lime makes the proof photo the finishing step ([screen](https://mobbin.com/screens/9ed22b0d-f65d-48ec-9a28-6bf47a910b1b)); Jobber counts photos as a field ([screen](https://mobbin.com/screens/1b3a7d01-7591-4250-a3dc-2eac5fa91d00)); Turo's soft gate for optional sets ([screen](https://mobbin.com/screens/c2193257-8293-4784-a4e7-f64646f104e6)).

### 2.9 Listing photo manager

- **Files.** New `src/app/(app)/properties/[id]/listing-photos.tsx`, feature-only, replacing `PhotoGallery` in `edit-listings.tsx`. Built on React Aria's `GridList` with `useDragAndDrop` (in `react-aria-components` 1.21.1, already installed). It drops into whichever listing editor the forms spec lands (PROPERTY-040).
- **Job.** Add, remove, order and pick the cover of a rental listing's public photos (G1D-017).

**Anatomy**

- **Header:** "Photos" in `text-meta` 500 `--fg-2` (a field label, since it sits inside the listing form), with "8 of 20" in `--fg-3`: the server's cap, shown.
- **Helper,** one line of `text-meta` `--fg-3`: "The first photo is the cover on the site. Drag to reorder." Touch drops the second sentence unless the long-press drag spike below passes. With fewer than five photos (brand section 6, Listing set) it counts instead: "Listings need 5 photos · 2 to go". The gate itself is G2C-I01's.
- **Grid:** 4 columns, 8px gaps, 4:3 `PhotoThumb` tiles, `rounded-lg`, the photo edge. The cover spans 2 by 2. On a phone the cover runs full width over 2 columns, as Airbnb's phone editor does. How the cover is marked is choice 4.
- **Add tile,** last: `--fill-1`, the photo edge, a 20px `ImagePlus` over "Add photos" in `text-label` `--fg-2`. It's the only add control here, so the header carries no button. With no photos it takes the cover slot. At 20 photos it goes.
- **One ⋯ per photo, at rest, at every size:** 32px `rounded-md` on `--pill-bg` with a `--pill-fg` icon (16px with a mouse, 20px on touch), 8px in from the top right, with a 44px hit area on touch: the public carousel arrows' shape and colors, today's precedent for a control on a photo. Its Menu: Make cover, Move earlier, Move later, Open, then Remove (destructive). One button replaces today's three (G2C-V02). It shows at rest rather than on hover because every reference does: Airbnb on the web and on iPhone, and eBay on iPhone, keep a ⋯ on each photo all the time. Since it is never a hover cue, CLAUDE.md's touch rule (don't make a hover cue permanent on touch) doesn't come into it, and a desk and a phone see the same control.
- **Uploading** tiles are local previews with the ring; **failed** ones keep their picture inside the `--danger` ring with the Retry pill (2.3).

**Behavior**

- **Drag with a mouse** starts after 4px. The tile lifts with `shadow-float` and follows the pointer; the others reflow on a `--dur-base` spring; the landing slot is a `--fill-1` tile with a 1px inset `--act` edge (no dashed outline). Dropping into the cover slot makes that photo the cover.
- **Keyboard:** arrow keys move focus; Enter opens the viewer; the drag handle (React Aria's keyboard drag) moves a tile with the arrow keys and Enter drops it, Esc cancels. A live region says "Photo 3 moved to position 1, now the cover".
- **Touch:** a tap on the photo opens the viewer at it; the ⋯ holds the actions, the same as with a mouse. A long press starts a drag where React Aria supports it (a spike confirms it doesn't fight page scroll in iOS Safari, as Airbnb's phone editor manages). If it fails, Move earlier and Move later in the ⋯ are the path, and Behance's Reorder list is the fallback.
- **Staged until Save,** as the editor already is. Remove takes the tile out with "Photo removed · Undo". Save applies order, cover and removals together, then confirms "Saved · 8 photos on the site" (or "Saved · Hidden from the site").
- **Discard or Cancel** deletes the blobs uploaded in that session (G1D-026).
- **Removing a whole listing** shows "Unit 2 listing removed · Undo" and applies on Save (G2C-006).
- **Save** stays off while uploads run, reading "Finishing 2 uploads…" (the existing `finishingLabel`).
- **Uploads** go through the queue as a `display` target: upright, JPEG, no GPS, HEIC converted where the browser can decode it (G1D-010, G1D-027). The long HEIC advice and "upload failed" go (FEEL-028).
- **Read rows:** the cover thumb opens the viewer on the set, and "· N photos" drops, since the viewer's counter carries it (G1D-033). Each photo's name is distinct: "Unit 2 photo 3" (G1D-032).

```
Desktop 1280 (about 620px column; tiles about 150px, cover about 308px)
Photos  8 of 20
The first photo is the cover on the site. Drag to reorder.
+-----------------------+  +---------+ +---------+
|                    [.]|  |    2 [.]| |    3 [.]|  <- [.] = the ⋯, at rest
|       cover (1)       |  +---------+ +---------+
|                       |  +---------+ +---------+
|                       |  |    4 [.]| |    5 [.]|
+-----------------------+  +---------+ +---------+
+---------+ +---------+ +---------+ +---------+
|    6 [.]| |    7 [.]| |    8 [.]| |   Add   |
+---------+ +---------+ +---------+ +---------+

Tablet 768: the same grid at about 170px tiles; the ⋯ at 44px hit area; tap opens the viewer.

Phone 375 (cover full width, 343x257; then 2 columns of about 167x126; at 320, 288x216 and 140x105)
Photos  8 of 20
The first photo is the cover on the site.
+-------------------------------+
|                            [.]|
|           cover (1)           |
|                               |
+-------------------------------+
[     2      [.]] [     3     [.]]
[     4      [.]] [     5     [.]]
[     6      [.]] [     7     [.]]
[     8      [.]] [    Add       ]
```

- **Drops on phone:** the drag sentence in the helper (unless the spike passes), and two of the four columns. Two columns rather than three keep each ⋯'s 44px area clear of its neighbor's, the overlap today's three buttons have.
- **Tokens.** `--fill-1`, `--fg-2`, `--fg-3`, `--pill-bg`, `--pill-fg`, `--act`, `--danger`, `shadow-float`, `text-meta`, `text-label`, `rounded-lg`, `rounded-md`, the photo edge, `--dur-base`.
- **References.** Airbnb: "Drag to reorder", a large cover and a ⋯ per photo ([screen](https://mobbin.com/screens/9201ab20-ceb1-441a-8241-2846d5c67a33)), the menu with Move backward, Move forward and Make cover photo ([screen](https://mobbin.com/screens/0c23f780-db8d-4672-a485-1538c60e55ba)), a drag in progress ([screen](https://mobbin.com/screens/d1508219-51d8-4a2c-9d42-d94ef24e68a8)), the phone layout with a ⋯ on every photo at rest and "Drag to reorder" ([screen](https://mobbin.com/screens/0701edf9-3ec2-4c5a-8b92-50c341d40d98)); Zillow's 4-column 4:3 grid ([screen](https://mobbin.com/screens/d615b7af-3c4c-4327-97a3-d1215eaf4ce6)); eBay puts the cap in the count, "Photos (2/24)", with a ⋯ on each photo ([screen](https://mobbin.com/screens/be147d07-6b03-4126-9a4c-daefb27e7cd5)); Behance's Reorder list as the phone fallback ([screen](https://mobbin.com/screens/4756e1b1-0d0b-48e6-9303-541669b92562)).

### 2.10 Property photo

- **Files.** Extends `src/components/photo-thumb.tsx` (an `addLabel` for the empty tile), the record header in `src/app/(app)/properties/[id]/page.tsx`, the viewer's ⋯, and a new server action. Needs a photo field on `Property` (question 2).
- **Job.** Set each building's front photo once, from an upload or a photo already taken there, and show it everywhere `PhotoThumb` stands in for it today (brand section 6: a launch prerequisite; VISUAL-I04).

**Anatomy and behavior**

- **Record header (staff):** the tile becomes a button. With no photo it's today's fallback tile plus "Add photo" in `text-label` `--fg-2` under the House, at 96 and full. **New:** a label inside the fallback. On a phone the full-width 16:9 tile then carries an action instead of standing empty.
- A tap opens a Menu: "Upload photo", "Choose from photos taken here" (only when task photos exist at this property), and "Remove photo" once one is set. With a single item the tap goes straight to the file picker.
- "Choose from photos taken here" opens a Sheet, "Photos taken at 56 Tamarack St", with a `MediaGrid` of task photos at this property, newest first. A tap sets it (G1D-I07).
- **The viewer's ⋯** offers "Set as property photo" on any photo from a task tied to a property (G1D-I17).
- **Processing:** the `display` path (2.1): upright, 2560px JPEG, no metadata, on public Blob, served through `next/image`.
- **Confirmation:** "Property photo set · Undo".
- **Where it shows:** Portfolio rows (48), the record header (96, full on a phone), the contractor job page (96, full on a phone), My jobs rows (48) and the Mark done payoff. The search and Home specs place it at 32.
- **The portal** never edits it.

- **Sizes.** 1280 and 768: the 96x72 tile beside the address. 375 and 320: the full-width 16:9 tile above it. Nothing drops.
- **Keyboard.** The tile is a button with the name "Add front photo of 56 Tamarack St" (or "Change front photo"); the menu takes arrows and Esc.
- **Tokens.** `--fill-1`, `--fg-2`, `--fg-3`, `text-label`, `rounded-lg`, the photo edge, the 200ms photo fade.
- **References.** Brand principle 1 and the Zillow header it cites ([screen](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd)); the Zillow no-photo tile ([screen](https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430)).

### 2.11 Document slots (W-9 and COI)

- **Files.** New `src/components/document-slot.tsx`, used in the contractor record's Detail rows (`src/app/(app)/contractors/[id]/page.tsx`). Needs file and expiry fields on `Contact` (question 2).
- **Job.** Hold a required document in the row that asks for it, so a missing one reads as missing and a present one opens in place.

**Anatomy**

- The Detail row's label, as today ("W-9", "Insurance (COI)"; "(COI)" drops on phones).
- **Missing:** a secondary sm "Upload" and, beside it, "PDF or photo" in `text-meta` `--fg-3`.
- **Present:** a chip in the `pickerChip` look (`--surface`, a `--line-strong` edge, `rounded-md`, `text-meta` 500) with the type icon and the name, opening the viewer; its ⋯ holds Replace and Remove. An imported Drive link shows "Drive" with `ExternalLink` and opens in a new tab until it's replaced.
- **COI expiry:** "Expires Mar 1" in `text-meta` `--fg-3`; once past, "Expired Mar 1" in `--danger` (late, brand section 4). The date is picked with `DueDatePicker`'s calendar, without its quick picks (a new prop).
- Upload goes through the queue (`contractor-doc` target).

- **Sizes.** 1280 and 768: label column 112px, the chip and expiry on one line. 375 and 320: label column 96px, leaving 192px at 320; the chip takes line one and truncates its name, and "Expires Mar 1" moves to line two under it, so the row reads at 60px and nothing squeezes the name to a few letters. Missing: "Upload" (44px) and "PDF or photo" fit on one line at 320 (about 175px).
- **Not here:** the table's missing and expired states, the assignee picker's warning (JOURNEYS-I15) and "Needs W-9" (ADMIN-I09) belong to the admin spec and read these fields. Contractors uploading their own in the portal (ADMIN-I10) comes later.
- **Tokens.** `--surface`, `--line-strong`, `--fg-3`, `--danger`, `text-meta`, `rounded-md`.
- **References.** Stripe's required slot with one button and one line, "Upload receipt" beside "Must be a PDF or image" ([screen](https://mobbin.com/screens/520b3bf5-56f5-42f1-8582-dabe93c8621b)) and the same slot filled as a chip ([screen](https://mobbin.com/screens/bd97c102-f0eb-48c3-951f-030e3f7959fd)); Mercury's attachment row with its type (from G1D-I02, [screen](https://mobbin.com/screens/ede3cc07-012f-4e55-a5c7-7cbe8b7f5907)).

### 2.12 Public listing photos

- **Files.** Extends `src/app/(marketing)/rentals/photo-carousel.tsx`; the viewer in its public form.
- **Job.** Show a listing's photos fast, and let a renter see them full screen (G1D-021).

**Changes**

- `next/image` with `sizes` for the 3, 2 and 1 column grid, in place of full-size originals (PUBLIC-029). Public Blob is already allowed in `next.config.ts`.
- Prefetch the next photo when the strip settles, or when an arrow gets hover or focus (G1D-028).
- When a swipe settles, announce "Photo 2 of 5" politely; the visible counter stays `aria-hidden` (PUBLIC-030).
- A tap or click on a photo opens the viewer full screen at that photo, on the public surface: the street and rent ("56 Tamarack St · $1,450/mo") in the header, the counter, no byline, no Download, no ⋯. When the listing page exists (PUBLIC-011, the public spec), its "Text us about this home" goes under the photo, where GetYourGuide puts "Check availability".
- Metadata is stripped at upload (2.9), so new photos carry no GPS.

- **Sizes.** As brand section 10: 3, 2 and 1 columns at 1280, 768 and 375. Arrows with a mouse only; touch swipes.
- **Tokens.** `--pill-bg`, `--photo-scrim`, `--on-photo`, `rounded-lg`, the photo fade.
- **References.** Airbnb's swipeable photo with counter (brand, [screen](https://mobbin.com/screens/8a6b4476-52d7-4c85-965b-2a870b388eb3)); KOBU (brand, [section](https://mobbin.com/sites/sections/4226456d-e845-483a-ad1b-305a93fe7d36)); GetYourGuide's full-screen photo tour with its counter, side arrows and "Check availability" under the photo, the next step G1D-021 asks for ([screen](https://mobbin.com/screens/a002c1c4-730a-4cfc-8ce9-fae8960a2ed0)).

### 2.13 Copy

Every line is one line at its component's normal width, with no em dashes. Items are split by semicolons; a toast's action is in brackets.

| Where | Copy |
|---|---|
| Drop labels | Drop to add to this reply; Drop to add to this note; Drop to add to Documents; Drop to add photos; Drop to add to this job |
| Section header button | Add files |
| Empty Documents | Add a lease, a policy or a loan statement. |
| Stored names for camera files | Photo 2026-10-25 at 2.14 PM; Photo 2026-10-25 at 2.14 PM 2; Video 2026-10-25 at 2.14 PM |
| Status line | 2 photos didn't upload · Retry; 1 photo didn't upload: over the 25 MB limit; No signal · 5 photos waiting (No signal · 5 waiting under 360px) |
| Document row | Uploading 40%; No connection; Over the 50 MB limit; This type can't be added |
| My jobs row subline | Uploading 3 photos; 2 photos didn't upload |
| Toasts | 3 photos posted [Undo]; 3 files ready to send [View]; 2 photos didn't upload [Retry]; Photo removed [Undo]; Unit 2 listing removed [Undo]; Saved · 8 photos on the site; Saved · Hidden from the site; Property photo set [Undo]; Preparing 14 files… |
| Activity | Zack added 4 photos; Zack added 3 photos and 1 video |
| Viewer | Can't preview this photo here.; XLSX · 48 KB · Connor · Oct 3; Download; Open |
| Delete confirm | Delete this photo?; “Photo 2026-10-25 at 2.14 PM” goes for good.; Keep it; Delete photo |
| Listing photos | The first photo is the cover on the site. Drag to reorder.; Listings need 5 photos · 2 to go; Finishing 2 uploads… |
| Mark done | Photos of the finished work; 1 of 2; Add 1 more photo |
| Property photo | Add photo; Upload photo; Choose from photos taken here; Remove photo; Set as property photo |
| Document slot | Upload; PDF or photo; Expires Mar 1; Expired Mar 1 |
| Sign out hold | 3 photos are still uploading; Leave anyway; Keep uploading |

Goes: "Click to upload or drag files here" (MOBILE-022), "Connect a Blob store in Vercel (Storage tab) to turn on file uploads." (COPY-052; a development-only state, so a code comment and the README), the iPhone Settings advice for HEIC (G1D-010), "upload failed", "Skip", "This photo can't be shown here. Download it to view." (G1D-IV04), and the residents tile's "Send photos of the issue straight to our team." until intake exists (PUBLIC-035).

## 3. Design choices

Six real choices. Each option shows desktop 1280, tablet 768 and phone 375, with 320 noted where it differs.

### Choice 1: Hearing about uploads after you leave the page

**Option A: In place, plus one toast (recommended)**

Nothing floats. Uploads keep going where they'll land. When a batch lands while you're elsewhere, one toast says so. A contractor's My jobs row carries the state while it's going up.

```
Desktop 1280 (you left the task for Tasks while 3 files went up)
+---------+--------------------------------------------------+
| sidebar | Tasks                                            |
|         | ( ) Fix porch light       56 Tamarack St  Oct 26 |
|         | ( ) Gutter clean          767 Prospect    Oct 27 |
|         |                                                  |
| +------------------------------+                           |
| | 3 files ready to send   View |   <- toast, bottom-left   |
| +------------------------------+                           |
+---------+--------------------------------------------------+

Tablet 768: the same toast, bottom-left, 44px View.

Phone 375 (portal, My jobs)
+-------------------------------+
| [img] Fix porch light         |
|       Uploading 3 photos · 56 |   <- subline truncates at 320
| [img] Gutter clean            |
|       In progress · Oct 27    |
|                               |
| +---------------------------+ |
| | 3 photos posted      Undo | |   <- once the batch lands
| +---------------------------+ |
+-------------------------------+
```

**Option B: An away panel**

A Float panel (`--raised`, `rounded-lg`, `shadow-float`) appears bottom-right once you leave a page with uploads going, and expands upward into a list, as Google Drive's upload panel does ([screen](https://mobbin.com/screens/59045016-c719-4504-aebd-95bf195eaeaa)). On a phone it's a one-line bar in the toast slot that opens a Sheet.

```
Desktop 1280
+---------+--------------------------------------------------+
| sidebar | Tasks ...                                        |
|         |                 +------------------------------+ |
|         |                 | [ph] Photo 2026-10-25 a… 40% | |
|         |                 | [ph] Photo 2026-10-25 … Retry| |
|         |                 | (o) Uploading 3 photos to  v | |
| [toasts]|                 +------------------------------+ |
+---------+--------------------------------------------------+

Tablet 768: the same panel bottom-right, 44px rows.

Phone 375
+-------------------------------+
| My jobs ...                   |
| +---------------------------+ |
| | (o) Uploading 3 photos  > | |   <- taps open a Sheet
| +---------------------------+ |
+-------------------------------+
```

**Recommendation: A.** It's the lightest form that works. B is a proven pattern (Google Drive), but it adds a second floating layer in a second corner: toasts already own the bottom-left on a desk and the bottom edge on a phone, so the two would stack or collide there, and section 9 has no slot for it. The tiles where files land stay the one record. Staff send a few files per reply, and contractors leave a job for My jobs, where the row already says what's going on. B is the upgrade if partners start bulk uploads and want to watch them across pages; the queue supports both, so it can come later without rework.

### Choice 2: More photos than two rows

**Option A: A "+N" tile that opens the viewer (recommended)**

The last visible tile shows its photo under `--photo-scrim` with "+9" in `text-label` `--on-photo` (**new**: the counter's colors on a whole tile), as Walmart's photo row ends in "+113 images" ([screen](https://mobbin.com/screens/5b2421d5-caad-4863-9579-02e127506528)). A tap opens the viewer at that photo, with the whole set. The tile's name says "Open all 20 photos".

```
Desktop 1280 and tablet 768 (20 photos: 11 shown, the 12th carries +9)
Photos and files 20                                      [...]
-------------------------------------------------------------
[  ][  ][  ][  ][  ][  ]
[  ][  ][  ][  ][  ][+9]

Phone 375 (3 by 2 of about 109px; 91px at 320)
[    ][    ][    ]
[    ][    ][+15 ]
```

**Option B: "Show all", with "Show fewer" (today, finished)**

```
Desktop 1280 and tablet 768
[  ][  ][  ][  ][  ][  ]
[  ][  ][  ][  ][  ][  ]
Show all 20                  <- text-meta (today text-xs); expands in place; "Show fewer" at the end

Phone 375
[    ][    ][    ]
[    ][    ][    ]
Show all 20
```

**Recommendation: A.** One tile replaces a line of text, the page stays the same height so Activity doesn't jump, and twenty photos are better looked at in the viewer anyway (G1D-013). Pick B if partners want to compare many photos side by side on the page.

### Choice 3: A comment's photos in Activity and job updates

**Option A: A compact strip (recommended)**

```
Desktop 1280 and tablet 768
Activity
-------------------------------------------------------------
 o  Zack  2h ago
    Porch light swapped. New fixture is LED.
    [48x36] [48x36] [48x36] [48x36] +2
 .  Zack marked this done

Phone 375 (a system line's strip is 240px and fits at 320; inside a comment card at 320
the content is 232px, so the strip shows three and "+3")
 o  Zack  2h ago
    Porch light swapped. New fixture
    is LED.
    [48x36][48x36][48x36][48x36] +2
```

**Option B: A link only**

```
All sizes
 o  Zack  2h ago
    Porch light swapped. New fixture is LED.
    6 photos                    <- underlined; opens the viewer at this set
```

**Option C: Today's full grid in both places**

```
All sizes
 o  Zack  2h ago
    Porch light swapped. New fixture is LED.
    [  ][  ][  ][  ][  ][  ]    <- the same photos as the section above
```

**Recommendation: A.** You still see which photos came with which words, at about a third of the height, and nothing shows twice at full size (BPORTAL-014). It's the same strip the payoff and the Needs review rows use. B is lightest but loses the glance a contractor relies on at the building. Picking A replaces the "6 tiles of 88px, two rows, then Show all" media row in the Activity spec's comment card table; this spec owns the pick, the Activity spec places it.

### Choice 4: Marking the listing cover

**Option A: Size and place mark it, the helper line names it (recommended)**

```
Desktop 1280 and tablet 768
Photos  8 of 20
The first photo is the cover on the site. Drag to reorder.
+-----------------------+  [  2 .] [  3 .]
|       cover (1)    [.]|  [  4 .] [  5 .]
+-----------------------+
[  6 .] [  7 .] [  8 .] [ Add ]

Phone 375 and 320
The first photo is the cover on the site.
+-------------------------------+
|           cover (1)        [.]|
+-------------------------------+
[     2     .] [     3     .]
```

**Option B: A "Cover" pill on the photo, as the references do**

```
All sizes (the same grid as A, plus)
+-----------------------+
| (Cover)            [.]|   <- 24px --pill-bg pill, text-micro, 12px in
|       cover (1)       |
+-----------------------+
```

**Recommendation: A, with the research flagged.** Every reference names the cover on the photo itself: Airbnb's "Cover Photo" tag on a larger first tile ([screen](https://mobbin.com/screens/0701edf9-3ec2-4c5a-8b92-50c341d40d98)), Turo's "Guests see this photo first" strip ([screen](https://mobbin.com/screens/6d630675-f5a5-4c41-83fe-962a8c61174e)) and eBay's "Main" chip ([screen](https://mobbin.com/screens/be147d07-6b03-4126-9a4c-daefb27e7cd5)). Section 6 keeps the on-photo pill for states that need attention ("Vacant Nov 1"), not roles, so B needs one added line there. A keeps the pattern the references share (first, larger, named in words) and moves the word to the helper line right above the grid; the tile's accessible name says "Cover photo". If you'd rather match the references exactly, B is the pick and section 6 gains "and the listing cover".

### Choice 5: Finish photos at Mark done

**Option A: Proof slots (recommended)**

```
Desktop 1280 (the centered 28rem sheet; slots open the file picker)
+------------------------------------------+
| Mark done                                |
| Photos of the finished work       1 of 2 |
| [photo] [ cam ]                          |
| [ Add a note (optional)                ] |
| [  Add photos  ]      [   Mark done   ]  |
|              Add 1 more photo            |
+------------------------------------------+

Tablet 768: the same sheet at touch sizes; slots open the camera.

Phone 375 (an optional job: one slot)
+-------------------------------+
| Add photos of the finished    |
| work?                         |
| [ cam  ]                      |
| [ Add a note (optional)     ] |
| [ Add photos ] [ Mark done  ] |
+-------------------------------+
```

**Option B: Relabel only**

```
All sizes
| Add photos of the finished work? |
| (the tray, once photos exist)    |
| [ Add photos ] [ Mark done ]     |   <- "Skip" becomes "Mark done"
```

**Recommendation: A, with the requirement off by default.** Every job starts optional, which keeps the optional "Add photos of the finished work?" that `docs/asana-migration-plan.md` set for the portal; partners turn the count on per template where proof matters (G1D-I19). A camera-direct slot cuts a step at the moment the work is finished, and "Add photos" stays for shots already taken. B fixes the misleading "Skip" and nothing else.

### Choice 6: PDFs in the viewer

**Option A: The browser's viewer on desktop, a file card on touch (recommended)**

```
Desktop 1280
+--------------------------------------------------------------+
| Lease 2026.pdf                             [dl] [...] [ x ]  |
| Connor · Oct 3                                               |
|  [<]  +--------------------------------------------+  [>]    |
|       |  the browser's PDF viewer: pages, zoom,    |         |
|       |  find, print                               |         |
|       +--------------------------------------------+         |
|                                                   ( 2 / 5 )  |
+--------------------------------------------------------------+

Tablet 768 and phone 375 (reached from a ?file= link; a row on touch opens the file directly)
+-------------------------------+
| Lease 2026.pdf  [dl][...][ x ]|
| Connor · Oct 3                |
|            [ PDF ]            |
|        Lease 2026.pdf         |
| PDF · 1.2 MB · Connor · Oct 3 |
|           [ Open ]            |
|                     ( 2 / 5 ) |
+-------------------------------+
```

**Option B: pdf.js at every size**

```
Desktop 1280: pages drawn on the stage, "Page 1 of 4", zoom bar.

Tablet 768 and phone 375
+-------------------------------+
| Lease 2026.pdf  [dl][...][ x ]|
| +---------------------------+ |
| | page 1                    | |
| +---------------------------+ |
| +---------------------------+ |
| | page 2                    | |
|          Page 1 of 4          |
+-------------------------------+
```

**Recommendation: A.** It needs no new dependency: the file route serves PDFs inline with `default-src 'none'` and no `sandbox`, and nothing sets `X-Frame-Options` or `frame-ancestors` (checked in `headers.ts` and `next.config.ts`), so a same-origin frame on the stage gives partners at their desks pages, zoom and find for free (a short spike confirms it in Chrome and Safari). On touch, iOS Safari has drawn only a framed PDF's first page and Android Chrome draws none (the spike rechecks iOS), so a row opens the system viewer in one tap, as today. B renders pages in the app, as Dropbox ([screen](https://mobbin.com/screens/1828e29b-63ab-4d85-b3c0-734c22226cd8)) and Mercury ([screen](https://mobbin.com/screens/60364c06-7c88-4ac9-a5e2-cf1041ab4e84)) do, and brings PDF thumbnails (G1D-018) with it; at about 1 MB, loaded only when a PDF opens, it's the later step if phones need in-app reading.

## 4. Migration map

Every inventory instance, grouped by page.

### Task page (`/tasks/[id]`)

| Instance | Becomes | What changes for you |
|---|---|---|
| Composer attach controls and `ReadyTile` (`composer.tsx:75`, `:285`, `:323`) | The same tools row. The main column is a drop and paste target that feeds it (2.2). Ready files are `UploadTile`'s ready state, on thumbnails (2.3). The attach icon's title tooltip becomes `Tooltip` with a mouse | Dropping a file anywhere attaches it instead of opening it. Leaving mid-upload no longer cancels; the files wait in your reply. Removing one can be undone |
| `MediaUploadTray` row and `UploadTile` (`media-uploader.tsx:409`, `:435`, `:532`) | Typed document tiles, the `RotateCcw` retry, a square Remove with a 1px ring that matches the ground, the status line with Retry (2.3) | A document tile says what it is. "2 files didn't upload · Retry" retries them all |
| `MediaGrid` in the Photos section (`view.tsx:137`) | "Photos and files N", newest first, the At finish set first, choice 2's overflow, the hover edge, thumbnails, a 14px lock in a 20px chip, 8px phone gaps, Download all (2.5) | Finish photos come first, tiles load fast, the heading names what's there |
| `MediaGrid` in Activity rows (`activity.tsx:91`, `:110`) | Choice 3's strip under one line per batch (2.7) | "Zack added 4 photos" once, and each photo at full size once |
| `FilesList` for documents (`files-list.tsx:27`, `view.tsx:147`) | The shared `FilesList`: type icons, who and when, Rename, opens in the viewer (2.4) | You see who added a file and when, and PDFs open in place |
| `FilesList` in Activity rows (`activity.tsx:92`, `:111`) | The same rows with no byline or menu; the `--fill-2` hover inside Internal cards stays | Typed icons; nothing else moves |
| `Lightbox` (`lightbox.tsx:39`) | Zoom, pinch, swipe down, documents at a desk, `?file=` links, the counter in the brand corner, Internal in the byline, square stage buttons and chevrons, ConfirmDialog for delete (2.6). The portal's viewer gets the same, with Download only | You can zoom into damage, link a partner to one photo, and read a PDF at your desk without leaving the app |
| Review banner photo count (`review-banner.tsx:41`, `page.tsx:200`) | The Activity spec's Review card, holding this spec's one-row grid of this visit's photos, Mark done photos first (2.7). Phase 1 fixes today's count to that set, with videos named | The proof sits above Approve |
| Needs review rows on Today (`tasks/review-actions.tsx`) | The tasks spec places the same strip (BTASKS-016) | Later |
| No leave guard on this page | Not needed: the queue outlives the page (2.1) | The back link and the nav no longer cancel uploads |
| `/tasks/new` has no attach | Not in this round; the forms spec decides. A `task:<id>` target works once the task exists | None now |

### Contractor job page (`/p/jobs/[id]`)

| Instance | Becomes | What changes for the contractor |
|---|---|---|
| Grid tray, `RetryPill`, `FailedUploadsLine` (`job-actions.tsx:215`, `:278`, `:329`) | The same tiles; the shared status line; the waiting state in phase 3 (2.3) | With no signal, photos wait instead of failing |
| Bottom bar and Mark done sheet (`job-actions.tsx:54`, `:231`, `:264`, `:361`) | The bar stays. Mark done gets proof slots (choice 5, 2.8); "Skip" goes; batch posts get Undo; the payoff shows the strip (2.7) | One tap per finish shot, an Undo after posting, and the payoff shows what HG got |
| "Add photo/video" on in Review (BPORTAL-010) | Stays on for the server's hour, then hides (question 4) | No refusal an hour later |
| "Photos & videos" Section and update grids (`page.tsx:98`, `:143`) | "Photos and files N", as on the task page: the grid newest first with the At finish set, then the documents HG shared on the job as `FilesList` rows (today they show only inside their update). Updates show the strip (choice 3) and compact file rows | Each photo once at full size, and every document HG shared in one place |
| Hand-rolled file links (`page.tsx:144`) | `FilesList` rows with Open and Download (2.4). On a phone a row opens the file directly, as today | Documents show their type and size; at a computer they open in place |
| `PhotoThumb` full and 96 (`page.tsx:68`, `:73`) | The property photo once set (2.10) | The building's photo at the top of the job |
| `LeaveGuard` on "My jobs" and "Back to my jobs" | Upload holds retire in phase 2; the guard stays for Sign out | The "Keep uploading?" sheet goes, and leaving never cancels |

### My jobs (`/p`)

| Instance | Becomes | What changes for the contractor |
|---|---|---|
| `PhotoThumb` 48 in rows (`my-jobs.tsx:129`) | The property photo (2.10). The thumb stays `aria-hidden`, since the row's link already names the place. The subline leads with "Uploading 3 photos" or "2 photos didn't upload" while the job has uploads (2.1) | Uploads still going show on the job's row |

### Property record (`/properties/[id]`)

| Instance | Becomes | What changes for you |
|---|---|---|
| `Attachments` property Documents (`attachments.tsx:82`, `edit-documents.tsx`) | `Section` "Documents N" with "Add files", `FilesList`, a queue target and a drop target; delete through `ConfirmDialog` (2.2, 2.4). Phase 1 adds the checks and the confirm on the existing list | No dashed box; progress, Retry, type checks, a confirm before delete, and who and when on each file |
| `Attachments` task path (`attachments.tsx:109`) | Deleted with the component; its `docs/components.md` row goes | None |
| `PhotoGallery` listing editor (`edit-listings.tsx:430`) | `listing-photos.tsx` (choice 4, 2.9). Phase 1 adds cleanup on Discard, metadata stripping and an Undo for removing a listing | A big cover, drag to reorder, a tap on touch instead of three buttons, drops that work, HEIC converted, GPS gone |
| Listing read rows (`edit-listings.tsx:232`) | The cover thumb opens the viewer; "· N photos" drops (2.9) | See a listing's photos without editing |
| `PhotoThumb` full and 96 in the header (`page.tsx:127`) | Add, choose or replace the property photo (2.10) | The empty phone block becomes "Add photo" |

### Portfolio (`/properties`)

| Instance | Becomes | What changes for you |
|---|---|---|
| `PhotoThumb` 48 in rows (`page.tsx:129`) | The property photo once set (2.10) | Rows show the buildings |

### Search and Home

| Instance | Becomes | What changes for you |
|---|---|---|
| Property photo source, missing (`schema.prisma` Property; `global-search.tsx:145`; Home and Needs you rows) | A photo field and its three setters (2.10). The search and Home specs place the 32px photo in their rows | One place to set the front photo, and it shows everywhere |

### Contractors

| Instance | Becomes | What changes for you |
|---|---|---|
| W-9 and COI links in the table (`contractors/page.tsx:62`) | Unchanged here; the admin spec's statuses read the new slots (ADMIN-029) | Later |
| W-9 and Insurance rows on the record (`contractors/[id]/page.tsx:172`, `DocLink :66`) | `DocumentSlot` (2.11) | Upload, replace and see the COI's expiry on the record |

### Settings

| Instance | Becomes | What changes for you |
|---|---|---|
| Storage (`settings/storage/page.tsx`, `migrate-button.tsx`) | One status line ("3 property documents are still public" with the move button, or "All documents are private") and no caveat paragraphs, which move to code comments. Once it reads all private, cut the tab (IA-024); your OK at review | Plain words, and the tab goes once the job is done |

### Public site

| Instance | Becomes | What changes for renters |
|---|---|---|
| `PhotoCarousel` (`rentals/photo-carousel.tsx:19`) | Sized images, prefetch, a spoken photo number, tap for full screen (2.12) | Photos load fast and open full screen |
| Hero photo slot (`welcome/page.tsx`) | Unchanged until a real exterior exists (brand section 10); the `display` path prepares it | None now |
| Resident photo intake (`residents/page.tsx:32`, `moving-in/actions.ts:17`) | Not built in this round. The tile's promise line goes now (PUBLIC-035). Intake later reuses the queue on the public surface | The site stops promising what it can't do |

### Shared pieces

| Instance | Becomes | What changes |
|---|---|---|
| `useMediaUploader` engine (`media-uploader.tsx:117`, `media.ts`, `content-types.ts`, `api/blob/[kind]/route.ts`) | A view onto the queue, with targets, prepare, dated names and, in phase 3, the outbox (2.1). The token route applies `UPLOAD_RULES` to property and listing uploads | Faster tiles, real names, uploads that outlive the page |
| `MediaUploader` wrapper and `DefaultTriggers` (`media-uploader.tsx:383`, `:368`) | Deleted; section headers use plain `Button`s. The `docs/components.md` row is rewritten | None |
| `PhotoThumb` and `RetryPill` (`photo-thumb.tsx:40`, `:112`) | `addLabel` for the staff empty tile (2.10); the photo-mark colors reused for the viewer's Download button (2.6). The unused `size={32}` gets its callers from the search and Home specs; `failed` and `onRetry` stay for the listing manager's failed tiles (2.9) | None beyond 2.10 |
| File delivery (`api/files/[kind]/[id]/route.ts`, `headers.ts`) | A saving link for videos; `?v=thumb` for property files; PDFs framed in the desktop viewer (choice 6) | Videos save instead of opening a tab; PDFs open in place |
| Upload leave guards (`useLeaveWarning`, `LeaveGuard`) | `useLeaveWarning` stays for browsers that honor it; `LeaveGuard` holds Sign out only (2.1) | Leaving never cancels; signing out asks first |

## 5. Reuse check

**Reused as is**

`Section`, `Button`, `Menu` and `MenuItem`, `ConfirmDialog`, `Sheet`, `Tooltip`, `useToast` with Undo and `useToastInset`, `LeaveGuard`, `useLeaveWarning`, `RetryPill`, `PhotoThumb`'s sizes, `SpotArt` job-done, `Avatar`, `TextLink`, `Input` with `useInlineEditKeys`, `useCoarsePointer`, `pickerChip`, `Money` (public viewer header), `fmtDateTime`, `fmtDay`, `formatBytes`, `fmtDuration`, `finishingLabel`, `UPLOAD_RULES`, `checkMediaFile`, `uploadNotice`, the `/api/blob/[kind]` and `/api/files/[kind]/[id]` routes, the `@vercel/blob` client, and `react-aria-components` (`Modal`, `GridList`, `useDragAndDrop`).

**Extended**

| Piece | File | Extension |
|---|---|---|
| `useMediaUploader` | `components/media-uploader.tsx` | Reads the queue; targets; thumbnails and posters; dated names; waiting state |
| `MediaUploadTray`, `UploadTile`, `ProgressRing` | `components/media-uploader.tsx` | Typed document tiles, a ready state, `slots`, a surface tone for the ring, a square Remove with a 1px ring in the ground, `RotateCcw`, 8px phone gaps |
| `FailedUploadsLine` to `UploadStatusLine` | from `job-actions.tsx` into `components/media-uploader.tsx` | Shared by the composer, the job page and document lists; the waiting line |
| `FilesList` | moved to `components/files-list.tsx` | Type icons, byline, in-flight and failed rows, Rename, opens the viewer |
| `MediaGrid` | `components/media-grid.tsx` | `urlFor`, groups, the overflow tile, hover edge, the strip variant, the one-row mode, the 20px lock chip, the early-failure check |
| `Lightbox` | `components/lightbox.tsx` | `urlFor`, zoom, touch gestures, preload, documents, `?file=` links, counter spot, ⋯ menu, square stage buttons, ConfirmDialog, public surface |
| `PhotoThumb` | `components/photo-thumb.tsx` | `addLabel` |
| `DueDatePicker` | `components/due-date-picker.tsx` | A calendar-only mode for expiry dates |
| `ReviewBanner` | `tasks/[id]/review-banner.tsx` | The strip of the Mark done set |
| Activity lines | `lib/tasks/activity.ts` | One line per batch |
| `markDoneButton` | `lib/portal/job-view.ts` | No "Skip"; the required count |
| `PhotoCarousel` | `(marketing)/rentals/photo-carousel.tsx` | `next/image`, prefetch, announcement, opens the viewer |
| Property Documents | `properties/[id]/edit-documents.tsx` | Rewritten on the queue, `Section` and `FilesList` |
| Media helpers | `lib/attachments/media.ts` | The dated stored name and its batch suffix (2.1), after [Dropbox](https://mobbin.com/screens/07897a07-e74b-45fb-8591-7dfd0fc08831) and macOS screenshot names |
| Schema | `prisma/schema.prisma` | Question 2 |

**New** (each general-purpose one gets a row in `docs/components.md` in the same commit)

| Piece | File | References |
|---|---|---|
| `UploadQueueProvider`, `useUploadQueue` | `components/upload-queue.tsx` | [Google Drive](https://mobbin.com/screens/59045016-c719-4504-aebd-95bf195eaeaa), [Grain](https://mobbin.com/screens/1d469543-b7ed-44a7-ae57-211f440e0875), [Instagram](https://mobbin.com/screens/87195638-f604-48bc-b5fb-3a1691ec6895), [Apple HIG loading](https://developer.apple.com/design/human-interface-guidelines/loading) |
| `WindowDropGuard`, `useDropTarget`, `DropLabel` | `components/upload-queue.tsx` | [Savee](https://mobbin.com/screens/8494c1b0-237f-4a3e-b9bc-ba38289b0d3e), [Apple HIG drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop) |
| Prepare step | `lib/attachments/prepare.ts` | G1D-004, G1D-009, G1D-010, G1D-027; [eBay](https://mobbin.com/screens/be147d07-6b03-4126-9a4c-daefb27e7cd5) processes while you keep going |
| Outbox (phase 3) and the waiting tile | `lib/attachments/outbox.ts` | [WhatsApp](https://mobbin.com/screens/d5ff7e9c-035f-4f5a-85bf-8e6b11174a97) (the album sits in the thread with its ring before the network finishes), [Google Photos](https://mobbin.com/screens/76e5e5f4-d870-4c22-a1ad-1cf7c5c341d6) (pending tiles in the grid), [Telegram](https://mobbin.com/screens/a8d272e2-66cd-46d0-8761-f85b0dac21e0) (names the connection state in words, "Updating…", for the No signal line). The waiting tile's `WifiOff` mark is **invented**: no screen shows a per-tile offline state |
| Listing photo manager (feature-only) | `properties/[id]/listing-photos.tsx` | [Airbnb](https://mobbin.com/screens/9201ab20-ceb1-441a-8241-2846d5c67a33), [Airbnb phone](https://mobbin.com/screens/0701edf9-3ec2-4c5a-8b92-50c341d40d98), [Airbnb menu](https://mobbin.com/screens/0c23f780-db8d-4672-a485-1538c60e55ba), [eBay](https://mobbin.com/screens/be147d07-6b03-4126-9a4c-daefb27e7cd5), [Zillow](https://mobbin.com/screens/d615b7af-3c4c-4327-97a3-d1215eaf4ce6), [Turo](https://mobbin.com/screens/6d630675-f5a5-4c41-83fe-962a8c61174e) |
| `DocumentSlot` | `components/document-slot.tsx` | [Stripe](https://mobbin.com/screens/520b3bf5-56f5-42f1-8582-dabe93c8621b), [Stripe filled](https://mobbin.com/screens/bd97c102-f0eb-48c3-951f-030e3f7959fd) |
| Viewer zoom bar | in `components/lightbox.tsx` | [Asana](https://mobbin.com/screens/b27c383f-0712-4c39-bbb7-cb281bd101ce), [Google Drive](https://mobbin.com/screens/b81fb867-21fc-4969-8a71-cd0cd53c7a53), [Plane](https://mobbin.com/screens/3102e577-b22c-49f0-a806-1ed8692aa812) |
| Viewer file card and its labeled Download button | in `components/lightbox.tsx` | [Salesforce](https://mobbin.com/screens/3e638e9d-7a1b-49ea-aded-b1f2a4e6f434), [Evernote](https://mobbin.com/screens/cd400126-4b54-407f-8238-0989944c3cd8) |
| "+N" overflow tile | in `components/media-grid.tsx` | [Walmart](https://mobbin.com/screens/5b2421d5-caad-4863-9579-02e127506528) |
| Tile hover edge (`--line-control`) | in `components/media-grid.tsx` | **Invented**: no reference shows a hover on photo tiles, and it adds a job to `--line-control`; optional (2.5) |
| Download all (ZIP route) | `app/api/files/zip/[kind]/[id]/route.ts` | [Google Drive](https://mobbin.com/screens/fcb56b4a-69ad-46f7-8d0e-15d3fd190a94) |

**Deleted:** `components/attachments.tsx`, the `MediaUploader` wrapper and `DefaultTriggers`, `PhotoGallery`, the composer's `ReadyTile`, the portal's hand-rolled file links, and the two hand-drawn icons (VISUAL-032).

**`docs/components.md` rows:** new rows for the upload queue, drop targets and `DocumentSlot`; `FilesList` moves from feature-only to a row; the rows for `MediaUploader`, `MediaGrid`, `Lightbox` and `PhotoThumb` are rewritten; the `Attachments` row goes.

**Checks before handoff:** `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`. The sweep only sees default states, so every sheet, menu and viewer state touched gets opened at 375 and 320 by hand, and the offline paths (airplane mode, a reload mid-upload, back online) get a hand run in WebKit at 375 and 320 before phase 3 hands off.

## 6. Open questions for Connor

Only what blocks building.

1. **The six choices in section 3.** Take the recommendations (1A, 2A, 3A, 4A, 5A, 6A), or name a different pick. Each blocks its own phase.
2. **One schema batch.** (a) `PropertyAttachment.uploadedByUserId`, for "Connor · Oct 3" on property documents; until then they show the date alone. (b) `Property.photoUrl` and `photoPathname`, for the property photo. (c) A nullable `TaskTemplate.finishPhotosRequired` count, for choice 5. (d) W-9 and COI file links plus `coiExpiresOn` on `Contact`, for the slots. Recommended: approve (a) to (c) now, and (d) with the admin spec. Blocks phases 4, 5 and 6.
3. **Downscale contractor photos to 2560px JPEG before upload, without keeping the original?** About 4 times smaller on cellular, with GPS stripped. Staff uploads and documents keep their originals. Recommended: yes. Blocks phase 3's prepare step on the portal.
4. **Late photos after Mark done.** A file queued before Mark done still records with it after the job moves to Review (a server rule on `queuedAt`), and "Add photo/video" stays on in Review only for the server's hour, then hides. Recommended: yes to both. Blocks phase 3.
5. **Undo for contractor posts.** "3 photos posted · Undo" removes that update and its files within 5 seconds, as a soft delete that the 10-minute email bundle drops. Contractors get no other delete. Recommended: yes. Blocks phase 4's batch posts.
6. **New dependencies.** (a) A HEIC decoder, loaded only when a desktop browser can't read an iPhone photo going to a listing or the property photo; without it, those photos are refused with one line. (b) A streaming ZIP library for Download all. (c) pdf.js, only if choice 6 is B. Recommended: yes to (a) and (b), no to (c). Blocks Download all in phase 4 and HEIC in phase 5.
