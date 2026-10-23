# Photos, videos and documents: viewing and capturing, not just the upload box

Part of the [UI/UX review](README.md). 49 findings: 0 critical, 4 high, 16 medium, 29 low.

## How it should work

Photos and documents are HG's evidence: proof a job was done, what a unit looked like before a tenant moved in, which policy covers a roof. The area becomes one media system that captures fast, files itself and opens in one viewer.

Capture. On a phone the camera is the first choice, as in Mercury's receipt sheet (https://mobbin.com/screens/4577487c-9cf2-4a2c-9672-c75f3ba39f38), and it stays open for several shots with a Done count, like Brex's camera (https://mobbin.com/screens/fd01b9e0-474a-44d5-a88f-62b18f3a8548). A partner walking a unit can shoot first and file second. Brex's scan screen suggests the matching record and takes a one-line memo before Keep (https://mobbin.com/screens/590f0b25-00c8-47b4-8a81-51bcdf73d3e1). Residents can add room photos to the move-in report, the way Thumbtack asks for optional photos with Skip (https://mobbin.com/screens/bada6ed2-d3d3-4209-b332-354d4e16c6db).

Filing. Every photo knows its property, its unit and when it was taken. That lets a property's Photos view switch between By date and By unit, with Before and After sets, like Airbnb's photo tour by room (https://mobbin.com/screens/4d64e5e5-5b71-4229-9ae9-950d0f18e4b8). A photo posted on a task also shows on the property, the way Jobber links one note's files to every related record (https://mobbin.com/screens/bea1674a-245c-4f23-bedb-f1fafdee9a5f). The task timeline shows a batch of uploads as one line, as Attio does (https://mobbin.com/screens/070de66a-5dcc-4049-ae06-b0ff0babcdd4). Each document carries a type and its key date, as in Gusto's documents table (https://mobbin.com/screens/2a4319d4-c9f9-40df-84ee-3a9023c180bd). Documents can also arrive by forwarded email, the option Mercury prints under its attachment box (https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62). Contractor W-9s and insurance certificates become slots that read Missing or show an end date (Brex, https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f).

One viewer. Every tile and every document opens the same dark viewer. Documents render on the left, with the facts and the next action on the right, as in Mercury's reimbursement view (https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13). Photos take a one-line caption, as in Zillow's Edit photo (https://mobbin.com/screens/a15d3207-198c-45b9-8137-fef606ff29df). The ⋯ menu holds the actions that move work forward: New task from photo (Linear, https://mobbin.com/screens/8cc34f38-7000-4e12-90ba-a1d0eec67136), Use as property photo, Share link and Download.

Listings reuse what exists. The listing editor offers the property's own photos before it asks for an upload, like Shopify's Select image (https://mobbin.com/screens/8f381745-7963-4ed2-b53e-a7f17eb75e1d). It orders them with Airbnb's per-photo menu, which includes Make cover photo (https://mobbin.com/screens/0c23f780-db8d-4672-a485-1538c60e55ba), and shows the public card before Save, as Zillow does (https://mobbin.com/screens/3837dc2a-b729-462a-b435-5d58923e6355).

None of this adds chrome. Each record gets one header action, one grid and one viewer, and the dashed upload boxes go away.

<details><summary>What the reviewer covered</summary>

Server on :3200 was up. Read-only DB check (default_transaction_read_only) confirmed nothing to look at locally: 0 TaskAttachment, 0 PropertyAttachment and 0 ListingPhoto rows, and 3 listings, all AVAILABLE. Aria on /rentals shows 'No photo yet' on all three cards. Routes exercised: /tasks/cmtg25z7s048mjphsikewzpy1 Attachments in Chromium at desktop 1280 and mobile 375 (light), and at tablet 768 and narrow 320 (dark). /properties/cmtg25y4p0006jphsv3frndk6: Documents card at 1280 in Chromium and 375 in WebKit, plus section offsets measured at 375. Rentals editor opened (Edit) in WebKit at 375 and 1280. File-input attributes were read by eval: task input accept='' multiple, no capture; listing input accept='image/*' multiple, no capture; '+ Add photo' at 10px in a 112x80 tile. /rentals signed out at 1280 and 375 with aria. /api/files signed out (401 'Unauthorized' plain page, screenshotted) and signed in with bad ids (404 'Not found'). A mock media grid was injected (local only) into the task Attachments card at 4, 12 and 40 items, plus a 40-row filename list, at 1280 and 375. Page height: list-40 2,199px at 1280 and 2,180px at 375; grid capped at two rows 973px and 1,056px. Code traced per type (JPG, HEIC, PDF, MOV, DOCX) through attachments.tsx, api/files route and lib/http.ts on main, and through the hardened routes, content-types, headers, schema, importer and component on branch f59e6ad. Spec sections 2, 4, 5.3, 6, 7 and 10 were read. Could not reach: any real photo, video or PDF (none exist and uploading is out of bounds); the contractor job page, Mark done sheet and Review banner (not built, so judged from the spec and branch code); real-iPhone HEIC transcoding and HEVC playback (reasoned from code and browser support, to confirm on the spec's day-4 iPhone test). Not reported because f59e6ad already fixes them: main's missing Range support for video, no-store caching, inline DOCX and the stored-XSS headers. About 17 Mobbin searches (screens and flows; web and iOS).

</details>

## Findings

### G1D-001

**Build one media system (grid, viewer, upload queue) and use it on all five surfaces**

High · Design change · effort L · `/tasks/[id] Attachments, /properties/[id] Documents and Rentals editor, /rentals cards, planned contractor job page` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The task and job surfaces are unified. Three surfaces still to migrate.
- **Today:** The task page and the portal job page now share one media system: MediaGrid (tiles), Lightbox (viewer) and useMediaUploader/MediaUploadTray (queue), each with a row in docs/components.md. Property Documents still use the old Attachments list (edit-documents.tsx), the Rentals editor still has its own PhotoGallery, and /rentals keeps PhotoCarousel. That makes four implementations instead of three. The new trio is tied to task files through taskFileUrl.
- **Why:** From Nov 1, photos and videos are the proof of work: imported Asana photos, contractor Mark done photos, and Review before Approve. Ramp feels crisp because a receipt behaves the same wherever it appears. Five copies will drift in gestures, Esc handling, errors and touch parity, and every fix has to land five times.
- **Change:** After cutover, give MediaGrid, Lightbox and useMediaUploader a URL and upload-kind adapter in place of the hard-wired taskFileUrl and taskUploadPath. Then move property Documents, the Rentals editor and /rentals onto them, and retire PhotoGallery and the Attachments file list.
- **Desktop, tablet, phone:** Desktop 1280: 6 tiles per row in the 640px card; viewer as a dark overlay with a 320px details panel. Tablet 768 (touch): 6 per row; full-screen viewer with swipe, details in a bottom sheet. Phone 375: 4 per row with 4px gaps (about 75px tiles); full-screen viewer, and the details panel shrinks to a one-line header (first name and date).
- **Reuse:** Extend components/attachments.tsx (private Blob upload, /api/files delivery) and the listings concurrency loop into components/media/. Build dialog, focus and Esc on React Aria Components (approved, D9). Replace PhotoGallery (edit-listings.tsx) and PhotoCarousel (rentals/photo-carousel.tsx) internals.
- **Challenges:** Spec §7 reuse table scopes 'Avatar, media grid, lightbox' to the task work only; this widens the same component to property Documents, listing photos and /rentals.
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): One viewer for evidence: the file fills the left, the record's amount, status timeline and single action sit in a right panel, with zoom, open and download in a small floating bar.
  - [Supabase](https://mobbin.com/screens/5aca9059-1063-4917-90b5-218110f85887): File preview panel (type and size, Added on, Download and Get URL, Delete set apart) plus a toast that names the count after a multi-file upload.
  - [Airbnb](https://mobbin.com/screens/f9bb1773-52bd-4158-82fb-4340ed6aa13e): Photos live inside the record page as a plain row of tiles; adding them confirms with a toast that says '3 photos added'.
  - [Trello](https://mobbin.com/screens/d1bcc3f0-5555-4b15-bb1d-7bb9f7d125e5): One lightbox for every attachment type, with name, 'Added <date> • size', Open in new tab, Download, Delete
  - [Airtable](https://mobbin.com/screens/98a165c7-3734-438d-8e60-e1ee748a4e2d): Attachment viewer with filename header, type and size, Delete and Download, and a details panel
  - [Twenty](https://mobbin.com/screens/31ceb745-43b0-432a-9387-1bb0eda2866b): A record's Files tab as quiet rows with type icon, date and a row menu; no dropzone
  - [Google Photos](https://mobbin.com/screens/95c9046d-63a6-4662-a8c6-5c9e6b6d276d): Phone viewer anatomy: date as the title, bottom action bar
- **Code:** `src/components/attachments.tsx:80-106`, `src/app/(app)/properties/[id]/edit-listings.tsx:392-534`, `src/app/(marketing)/rentals/photo-carousel.tsx:10-60`, `docs/components.md:54,93,133-148`, `branch: docs/asana-migration-plan.md:456`, `branch: src/components/media-grid.tsx`, `branch: src/components/lightbox.tsx`, `branch: src/components/media-uploader.tsx`, `branch: src/app/(app)/properties/[id]/edit-listings.tsx:393`, `branch: docs/components.md:32,58-59,100,106`
- **Verification:** partly. Direction is right and matches the Reuse first rule: build the spec's planned media grid and lightbox as a general component, not a task-only one. Widening the scope extends spec §7 rather than conflicting with it. The count is overstated, and the recommendation works as an umbrella over 003, 006, 013, 017 and 021, so rank it as the architecture decision those depend on. Keep the public PhotoCarousel as a thin public-palette skin over the shared pieces instead of forcing one component through two palettes. The Trello reference d1bcc3f0 is verified: a PDF in the lightbox with 'Added Sep 3, 2025, 11:03 AM • 13.46 KB' and Open in new tab, Download, Delete.

### G1D-003

**Open every file in an in-app viewer instead of the browser's raw tab**

High · Design change · effort M · `/tasks/[id] Attachments and /properties/[id] Documents (every file click)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The image and video viewer is built. Documents, deep links and zoom are left.
- **Today:** Photos and videos on /tasks/[id] and /p/jobs/[id] open in an in-app Lightbox: a black full-screen stage with '3 / 11', arrows, arrow keys, swipe, Download, Delete (staff, confirmed in a Sheet) and an uploader-and-time byline. Videos play inline. Documents and links still open raw in a new browser tab (FilesList), and property Documents still link out through Attachments. There's no ?file= deep link, so browser Back leaves the page instead of closing the viewer. There's no Copy link and no zoom. DOCX, XLSX, CSV and TXT now download (Content-Disposition attachment) instead of opening a blank tab.
- **Why:** Reviewing four Mark done photos means four new tabs, and comparing two photos is impossible. On a phone every tab is a dead end. Ramp and Stripe keep the receipt or evidence inside the record you're looking at.
- **Change:** Extend the Lightbox to documents: an embedded PDF on desktop, and a file card with Download for DOCX, XLSX, CSV and TXT. Route FilesList rows through it. Add ?file=<id> so Back closes the viewer, add Copy link, and add pinch, double-tap and wheel zoom.
- **Desktop, tablet, phone:** Desktop 1280: centered overlay with a 320px right panel (uploader, date, task or property, visibility, actions). Tablet 768: full screen with swipe; an info button opens details as a bottom sheet. Phone 375: full screen; top bar with close, date and ⋯; bottom bar with Share and Delete; swipe down closes. The details panel drops on phone.
- **Reuse:** New components/media/media-viewer.tsx on React Aria Dialog and Modal (D9). /api/files stays the byte source. Undo toast from the planned shell toast (components.md Known gaps).
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): Invoice PDF rendered inside the app with +, -, Reset, open in new tab and download in one floating bar; the record stays beside it instead of the browser's raw tab.
  - [Trello](https://mobbin.com/screens/d1bcc3f0-5555-4b15-bb1d-7bb9f7d125e5): PDF in the lightbox with 'Added Sep 3, 2025, 11:03 AM • 13.46 KB' and Open in new tab, Download, Delete
  - [Meetup](https://mobbin.com/screens/997acca9-cac3-4bd6-87aa-bd5335638586): '1/10' counter, Download, and the uploader with date in a side panel
  - [Google Photos](https://mobbin.com/screens/95c9046d-63a6-4662-a8c6-5c9e6b6d276d): Phone viewer with date and time as the title and Share, Edit, Add to, Delete along the bottom
  - [QuickBooks](https://mobbin.com/screens/27b05331-bdf8-4445-94e1-c183aa41d43d): Receipt viewer with zoom controls and 'Added 2:28 PM 05/03/2026 by Alex Smith'
  - [Mercury](https://mobbin.com/screens/14e48418-5045-4984-b03e-0b295335cbbb): The receipt opens in a sheet over the transaction list with the file row and a View action.
- **Code:** `src/components/attachments.tsx:87-95`, `src/app/api/files/[kind]/[id]/route.ts:43`, `src/lib/http.ts:10`, `branch:  (f59e6ad) src/lib/attachments/headers.ts:25-30`, `branch: src/components/lightbox.tsx:84-171`, `branch: src/app/(app)/tasks/[id]/files-list.tsx:56-60`, `branch: src/lib/attachments/headers.ts:25-29`, `src/components/attachments.tsx:89`, `src/app/(app)/contractors/[id]/page.tsx:56`, `src/app/(app)/contractors/[id]/page.tsx:65`, `src/app/(app)/contractors/page.tsx:55-57`, `branch:src/components/media-grid.tsx:34-73`, `branch:src/app/(app)/tasks/[id]/files-list.tsx:56-58`, `branch:src/app/(app)/contractors/[id]/page.tsx:78`, `branch:src/components/attachments.tsx:160-163`
- **Also found as:** MOBILE-I11 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. Verified in code and the app. Every row is a target=_blank link (attachments.tsx:87-95). Main serves every type with Content-Disposition inline (http.ts:10 default, route.ts:43). Signed out, /api/files shows a bare monospace 'Unauthorized' (shots/verify-G1D/files401--desktop-light.png); signed in, a bad id shows 'Not found'. The spec already plans a lightbox for tasks (plan line 456), so this finding defines that viewer and extends it to property documents. Google Photos 95c9046d is verified (date as title; Share, Edit, Add to, Delete bar). Its phone viewer is light, so a dark viewer is a choice, not something the reference requires. Fold G1D-019's keyboard and focus contract and G1D-030's Share and Download into this finding's acceptance criteria.

### G1D-I03

**Show a batch of uploads as one activity line with one row of thumbnails**

High · Design change · effort S · `Staff task page, Activity (migration branch /tasks/[id])` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Task cmtg25yws02dmjphsnig7k6l1 shows 'Photos 8' as a grid, then in Activity eight separate lines from 'Pieter added IMG_6117.png · 10:55 AM' to 'Pieter added IMG_6119.jpeg · 10:55 AM', each with its own 88px tile. Only DUE events fold into 'Due moved 4×'.
- **Today:** Pieter uploaded 8 photos at 10:55. Activity shows 8 separate lines, 'Pieter added IMG_6117.png · 10:55 AM' and so on, each with its own 88px tile. That's about 1,000px of timeline repeating the 8 photos already shown in the Photos section higher on the same page. activity.ts writes one line per file, while due-date changes already collapse into 'Due moved 4×'.
- **Why:** Attio folds 'changed Stage and 7 other attributes' into one line with Show all changes, and Airbnb confirms '3 photos added' once. The timeline should say what happened. Photos belong in the grid, and a contractor posting 10 finish photos shouldn't push the conversation off screen.
- **Change:** Collapse consecutive ATTACHMENT events by the same person within 10 minutes into one line: 'Pieter added 8 photos · 10:55 AM'. Under it, show one row of up to 6 thumbnails, with the last tile reading +2 and opening the viewer at that batch. Mixed batches read 'added 6 photos and 2 files'. Reuse the run-collapse rule behind 'Due moved 4×'.
- **Desktop, tablet, phone:** Desktop and tablet: one row of six 56px tiles. Phone 375: four tiles, the last reading +N. Filenames drop from the line because the viewer header carries them.
- **Reuse:** The run-collapse in src/lib/tasks/activity.ts (Due moved), and MediaGrid with a max-tiles prop.
- **References:** 
  - [Attio](https://mobbin.com/screens/070de66a-5dcc-4049-ae06-b0ff0babcdd4): 'Alex Smith changed Stage and 7 other attributes' as one activity line with Show all changes.
  - [Airbnb](https://mobbin.com/screens/f9bb1773-52bd-4158-82fb-4340ed6aa13e): One confirmation for a batch: '3 photos added'.
  - [Jobber](https://mobbin.com/screens/bea1674a-245c-4f23-bedb-f1fafdee9a5f): One note carries its files beneath it instead of one entry per file.
- **Code:** `task-management-migration-4c9ddf/src/lib/tasks/activity.ts:154-157 (one line per ATTACHMENT) and :203 (Due moved collapse)`, `4652abb:src/lib/tasks/activity.ts:154-157,185-215`
- **Verification:** confirmed. Reproduced on /tasks/cmtg25yws02dmjphsnig7k6l1 (:3300). There are 8 lines like 'Pieter added IMG_6117.png · 10:55 AM', each with its own 88px tile, below the same 8 photos in the Photos section. They take 964px at 1280 and 1097px at 375. activity.ts:154-157 writes one line per ATTACHMENT, and only DUE runs fold. A related defect the batch row also fixes: activity.tsx:120 gives each line its own MediaGrid, so a photo opened from Activity shows a one-photo viewer with no '1 / 8' and no arrows (verified). The 10-minute window matches D20's email bundling. I confirmed the Attio 070de66a reference on Mobbin ('changed Stage and 7 other attributes' with Show all changes).

### G1D-V01

**Remove permanently deletes a file in one tap, with no confirm and no Undo**

High · Fix · effort M · `/tasks/[id] Attachments and /properties/[id] Documents` · Every save is safe, instant and undoable · quick win

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** On /tasks/[id], Delete for task files now sits in the row's ⋯ menu (revealed on hover with a mouse) and asks first in a ConfirmDialog ('goes for good'). Photos and videos are deleted from the viewer through a confirm Sheet. It is still a hard delete that removes the blobs, with no Undo. On /properties/[id] Documents, the one-tap 'Remove' text button is unchanged and still hard-deletes with no confirm.
- **Why:** Stripe, Linear and Asana make destructive actions on records recoverable, and Asana shows an Undo toast the moment something is deleted. Losing a signed lease or a contractor's proof photo with no way back is the opposite of a calm, trustworthy tool, and it gets likelier once contractors and 2,086 imported tasks' files are in play.
- **Change:** Property Documents is now the urgent part: put Remove behind a ⋯ menu with the confirm, reusing FilesList's pattern. Then move both to soft delete with the Undo toast. TaskAttachment.deletedAt already exists on the branch but staff delete ignores it; PropertyAttachment still needs the column.
- **Desktop, tablet, phone:** Desktop 1280: toast bottom left; Remove in the row ⋯ menu and the viewer menu. Tablet 768: same toast, bottom center; ⋯ always visible because touch has no hover. Phone 375: toast above the bottom bar; Remove only in the viewer's bottom bar or ⋯ menu, never as an inline 16px text button.
- **Reuse:** The Undo toast the spec already ships for reschedule (Known gaps lists Toast); ConfirmDialog as the stopgap; deletedAt on f59e6ad TaskAttachment.
- **References:** 
  - [Asana](https://mobbin.com/screens/36cb9092-004d-4cfa-abc7-930e4a7ff931): Deleting shows a toast with Undo and leaves a Restore path
  - [Google Drive](https://mobbin.com/screens/302465b0-585b-4fab-8a24-a133959c8ecc): Bin keeps files for 30 days; the toast after a restore offers Undo
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): A 'Notification deleted' toast in the bottom right with an Undo button. Remove the document from the list at once, keep it recoverable while the toast is up, and purge the blob afterwards.
  - [Proton](https://mobbin.com/screens/01ac09ed-f2b8-4d3e-a5ce-1e95d6f57eea): Compact dark toast with the file name and Undo
  - [Superhuman Mail](https://mobbin.com/screens/23660193-1d87-4462-9b18-a9f0dc06ccf5): 'Draft discarded. UNDO': the removal happens at once and Undo is one click away, with no confirm dialog.
  - [Linear Mobile](https://mobbin.com/screens/da5b1f34-e51d-45c9-90aa-ba08e5684afa): 'Issue deleted' toast over the list; the row is simply gone.
  - [Canva](https://mobbin.com/screens/959d177c-3c8b-4781-bda1-22177171611f): Phone bottom sheet: "Trash design?" naming the item, saying it can be restored for 30 days, red Move to Trash.
  - [Stripe](https://mobbin.com/screens/bc49dbdf-52fd-495c-9ab3-86664ab98783): When a delete truly can't be undone: a titled modal stating the consequence and a red Delete.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Bottom toast "Notification snoozed" with Undo on the right: the reversible action happens at once and Undo is one tap.
  - [Jobber](https://mobbin.com/screens/4df60bf7-1e07-4da7-be4e-43625b9f6e1e): Note menu with the neutral action first and Delete last, in red with a trash icon.
  - [Airbnb](https://mobbin.com/flows/99ae5c0a-c4e8-4bac-98d5-f00587611ead): Photo action sheet: Move backward, Move forward and Make cover photo grouped together, with Delete in its own card below.
  - [Airbnb](https://mobbin.com/screens/8d239705-3784-4839-b6f3-6d39161ce479): "1 photo removed" confirmation toast after a removal in the listing editor
- **Code:** `src/components/attachments.tsx:97-103`, `src/lib/tasks/service.ts:180-190`, `src/lib/properties/service.ts:186-196`, `branch:  (f59e6ad) src/lib/tasks/service.ts:357-368`, `branch:src/app/(app)/tasks/[id]/files-list.tsx:67-118 (⋯ menu, ConfirmDialog)`, `branch:src/components/lightbox.tsx:113-124,159-214 (Delete, confirm Sheet)`, `branch:src/lib/tasks/service.ts:393-405 (hard delete plus blob del)`, `branch:src/components/attachments.tsx:170-176 (property one-tap Remove)`, `branch:src/lib/properties/service.ts:186-196 (property hard delete)`, `branch:prisma/schema.prisma:336-370 (TaskAttachment.deletedAt, contractors only)`, `src/app/(app)/properties/actions.ts:63-68`, `src/components/attachments.tsx:97-103 (one-click Remove, pending ignored at line 41)`, `src/lib/tasks/service.ts:180-190 (del(att.url) then hard-delete the row)`, `src/app/(app)/tasks/[id]/files-list.tsx:55-118`, `src/components/lightbox.tsx:113-120,159-209`, `src/components/attachments.tsx:157-178`, `src/app/(app)/properties/[id]/edit-documents.tsx:23`, `src/components/attachments.tsx:95-103 (Remove calls onDelete directly)`, `src/lib/properties/service.ts:186-196 (del(blob) then row delete)`, `branch: src/components/attachments.tsx:170-175`, `branch: src/app/(app)/tasks/[id]/files-list.tsx:86-118`, `branch: src/components/lightbox.tsx:159-205`, `branch: src/lib/tasks/service.ts:393-405`
- **Also found as:** PROPERTY-001 (Property detail page (future property hub)), FEEL-006 (Lens: interaction quality, feedback, states, speed and accessibility), JOURNEYS-001 (Lens: the core jobs, end to end)
- **Verification:** verifier-found

### G1D-004

**Make thumbnails and a JPEG display copy at upload, not in week 2**

Medium · New capability · effort M · `Uploads on /tasks/[id], the job page and the Rentals editor` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The uploader sends only the original to tasks/<id>/orig and records no thumbnail or poster. The record actions already accept thumbPathname and posterPathname, but nothing fills them. So for every new upload, MediaGrid loads the full original into an 88px tile (up to 25 MB per photo on the job page), and the Lightbox loads the original too. A HEIC from a Mac shows the ImageOff tile in Chrome, and the viewer says 'This photo can't be shown here. Download it to view.'
- **Today:** No grid exists today on main or f59e6ad. Files render as a filename list (attachments.tsx:80-106; f59e6ad attachments.tsx:153-179), so no originals are drawn yet. Imported media get 1024px thumbs from sips at import (plan line 280). The gap is the planned grid's first week, for new uploads only. headers.ts:25-29 does open image/heic inline, which Chrome can't render. Phone uploads through accept='image/*' usually arrive as JPEG, which is what the spec's day-4 iPhone test checks (plan line 283), so HEIC mostly comes from Mac uploads.
- **Why:** Review volume peaks in the first week after cutover, with contractors and Connor on cellular. A grid of originals is slow on LTE and blank for HEIC in Chrome. Polished apps never show an original until you zoom in.
- **Change:** In useUploadQueue, before each image upload, decode with createImageBitmap (Safari decodes HEIC natively). Draw to canvas and upload two derivatives next to the original: a 480px thumb to the existing tasks/<id>/thumb path, and a 2048px JPEG at quality 0.82 to a new display path. For video, seek a hidden <video> to 1s, capture the frame and upload it to tasks/<id>/poster. When the browser can't decode a file (HEIC from Chrome on Windows), upload the original, flag it for a server-side conversion job, and show a neutral 'HEIC' file tile until the JPEG lands. The grid uses thumbs, the viewer uses the display copy, and only Download and zoom past 100% fetch the original. Listing photos get a 480px admin thumb and a 1600px public copy.
- **Desktop, tablet, phone:** Phone 375: tiles load 480px thumbs (enough for 75px at 3x). Tablet 768 and desktop 1280: the viewer loads the 2048px copy; zooming past 100% swaps in the original.
- **Reuse:** f59e6ad already has PREVIEW_RULE (content-types.ts), ?v=thumb and ?v=poster delivery (route.ts) and record-time verification of thumb and poster (tasks/service.ts:237-252). Only the browser step is missing.
- **Challenges:** Spec §4 'After cutover (week 2): browser-side thumbnails for new uploads' and §5.3 'New uploads lazy-load originals until week 2'. Research favors doing it before Nov 1.
- **References:** 
  - [GoPro Quik](https://mobbin.com/screens/85e34bcd-4e95-4f31-b7db-d374b1dbd17f): Media grid of small derivatives with duration badges; the original loads only on open
  - [Grailed](https://mobbin.com/screens/bd1f7d69-9877-48e4-adc5-1ee669c842bd): Previews appear instantly from the device while '0 of 6 uploaded' runs
- **Code:** `branch: docs/asana-migration-plan.md:153,280`, `branch:  (f59e6ad) src/components/attachments.tsx:116-121`, `branch:  (f59e6ad) src/lib/attachments/content-types.ts:7-8`, `branch:  (f59e6ad) src/lib/attachments/headers.ts:25-30`, `src/app/(app)/properties/[id]/edit-listings.tsx:220,476`, `branch: src/components/media-uploader.tsx:141,156`, `branch: src/app/(app)/tasks/actions.ts:120-121`, `branch: src/components/media-grid.tsx:82,106-111`, `branch: src/components/lightbox.tsx:222-255`
- **Verification:** partly. The conflict with spec §4 and §5.3 is named properly. Generating derivatives in the browser before Nov 1 is reasonable for images. Capturing a video poster on iOS by seeking a hidden video is unreliable, so effort is closer to L than M. The listing admin thumbnail part duplicates G1D-025. The GoPro Quik and Grailed references weren't spot-checked; the four other references I checked were all real.

### G1D-005

**Lead with 'Take photo' on phones and keep 'Add files' second**

Medium · New capability · effort M · `Phone capture on /tasks/[id], the job page bottom bar and the Rentals editor` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The two-input design exists in useMediaUploader (camera input plus picker input). The portal chose the picker on purpose.
- **Today:** The staff composer on /tasks/[id] leads with a touch-only camera button ('Take photo or video', capture=environment, hidden for a mouse), then the text box. 'Add photos, videos or files' opens the picker, which accepts documents too. Desktop gets the picker plus drop and paste. On /p/jobs/[id], the bar's 'Add photo/video' and the Mark done sheet's 'Add photos' open the picker without capture. A code comment says this is deliberate: on iOS the picker offers Take Photo and the library together, so shots from the Camera app can go too.
- **Why:** Contractors shoot one-handed on site. Jobber and WhatsApp keep the camera one tap away. The spec's job page bar says 'Add photo/video' but doesn't say which inputs sit behind it, and the earlier MOBILE-022 copy fix doesn't change the tap count.
- **Change:** The staff side matches the recommendation. On the portal, keep the approved 'Add photo/video' picker, but check on the day-4 iPhone test that the extra sheet tap is fine and that the image accept list returns JPEG. Add a separate capture button only if that test shows the extra tap slows people down.
- **Desktop, tablet, phone:** Phone 375: 'Take photo' is the primary button in the job page bottom bar and a compact button in the task page media header, with 'Add files' as an icon button beside it. Tablet 768: both as small buttons in the media header. Desktop 1280: 'Add files' only, as a secondary button in the card header; the dashed box is removed in favor of drop anywhere (G1D-029).
- **Reuse:** Input wiring in components/attachments.tsx; Button primitive; lucide Camera and Paperclip.
- **References:** 
  - [Mercury](https://mobbin.com/screens/4577487c-9cf2-4a2c-9672-c75f3ba39f38): Receipt sheet lists Take Photos first, then Choose Photos From Library, then Upload Files, each as a full-width row with its icon.
  - [Airbnb](https://mobbin.com/screens/fcda60ea-e958-46fc-8db9-09ec2db05879): Host photo step offers 'Add photos' and 'Take new photos' as two equal rows with plain icons.
  - [Jobber](https://mobbin.com/screens/3bd617fc-464a-4f6d-891f-4b65f962b2cb): On the crew record, 'Add Note' sits beside a camera button, so the camera is one tap from the record.
  - [Notion](https://mobbin.com/screens/2f99a08e-bb58-450d-87d3-b4c7a4073e82): Insert Media sheet: Photo library, Take photo or video, Choose Files
  - [WhatsApp](https://mobbin.com/flows/6db18885-4af2-45f5-b2ca-b8acaa024a84): Camera button always in the composer bar; one tap to the shutter
  - [Lime](https://mobbin.com/screens/a79e71e9-c9ce-4c2d-95f5-d33ce4bd5378): Report form with the taken photo next to a camera tile for the next one
  - [alias](https://mobbin.com/screens/66ab2225-82c3-444a-ab91-cd707046e242): Capture loop with a tray of shots taken so far and Done
- **Code:** `src/components/attachments.tsx:120-165`, `src/app/(app)/properties/[id]/edit-listings.tsx:512-529`, `branch: docs/asana-migration-plan.md:423`, `branch: src/components/media-uploader.tsx:252-256`, `branch: src/app/(app)/tasks/[id]/composer.tsx:217-219,250-252`, `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:174-177,231-237`
- **Verification:** partly. Measured on main: the task input is accept='' multiple with no capture, opened from a 638x96 box named 'Click to upload or drag files here'. The Rentals input is accept='image/*' multiple, no capture, behind a 112x80 tile with 10px text (WebKit, all three sizes). A two-input camera and files split is a good fit for the contractor job bar. The Notion reference 2f99a08e is verified, but it shows an Insert Media sheet (Photo library, Take photo or video, Scan, Choose Files), which is the extra tap this finding wants to remove. WhatsApp is the stronger reference for camera one tap away. Drop the Rentals editor from scope: listing photos are curated shots picked from the library.

### G1D-008

**Dropping a file outside the small box, or anywhere on the Rentals editor, opens the file and loses unsaved edits**

Medium · Fix · effort S · `/properties/[id] Rentals editor and /tasks/[id] (desktop drag and drop)` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** On /tasks/[id], the staff composer is now a drop target with a primary-border cue and also takes pasted files. Property Documents keep the Attachments drop box. There's still no document-level guard against dropped files, so a file dropped on the notes, the Photos grid or the rail makes the browser open it in place of the page. The Rentals editor's PhotoGallery still has no drop handling, and there's no beforeunload guard anywhere.
- **Why:** Dragging a set of listing photos from Finder is the natural desktop move, and today it discards edits without warning. It is the kind of small betrayal Stripe-grade tools never allow.
- **Change:** While a media surface is mounted, preventDefault document dragover and drop. Route drops anywhere on the task page to the composer's addFiles, with the same overlay cue. Add drop to the listing photo grid and a beforeunload guard while the Rentals editor is dirty.
- **Desktop, tablet, phone:** Desktop and laptop only; tablet 768 and phone 375 touch input is unaffected.
- **Reuse:** The drop handlers in components/attachments.tsx, moved into useUploadQueue so every surface gets them.
- **References:** 
  - [Shopify](https://mobbin.com/screens/b8000273-8f80-45b6-a7d2-965b16e5b032): A contextual 'Unsaved changes' bar with Discard and Save appears in the top bar as soon as the record is edited, so an accidental navigation or drop can't silently lose edits.
  - [Mercury](https://mobbin.com/screens/b315af47-c926-4be0-8e5f-182a270d2430): Attachments area in the transaction panel takes drag and drop or click
  - [Zillow](https://mobbin.com/screens/d615b7af-3c4c-4327-97a3-d1215eaf4ce6): Listing photo grid where dragging in and reordering are first-class
- **Code:** `src/components/attachments.tsx:127-136`, `src/app/(app)/properties/[id]/edit-listings.tsx:470-531`, `branch: src/app/(app)/tasks/[id]/composer.tsx:175-188,233-238`, `branch: src/app/(app)/properties/[id]/edit-listings.tsx:393`
- **Verification:** confirmed. grep finds dragover and drop handling only inside the Attachments dropzone (attachments.tsx:127-136). No page has a document-level guard, PhotoGallery has no drop handling, and nothing in src uses beforeunload. Dropping files on the Rentals editor would navigate the tab and lose unsaved listing edits. The Mercury reference b315af47 is verified, but it shows a compact 'Drag and drop here or click to upload' row inside the transaction panel, not a full-card overlay.

### G1D-010

**Convert HEIC listing photos instead of telling people to change their iPhone camera settings**

Medium · Fix · effort S · `/properties/[id] Rentals editor, photo upload errors` · Contractor jobs and media close the loop

- **Today:** Confirmed: the token allows only JPEG, PNG, WebP and AVIF (api/blob route.ts:42), and the message asks the user to change iPhone camera settings (edit-listings.tsx:417-421). Failures are joined with '; ' in 10px red text (edit-listings.tsx:531). The common source is iPhone photos AirDropped or exported to a Mac, which stay HEIC. Picking from the library in iPhone Safari with accept='image/*' usually hands over JPEG.
- **Why:** It asks Connor to change a phone setting to work around the app. Airbnb and Zillow accept whatever the phone makes, and one long red line for several failures doesn't say which tile failed.
- **Change:** Decode HEIC in the browser where possible (Safari's createImageBitmap) and upload the JPEG. Elsewhere, upload the original to a private staging path, convert it server-side, then publish the JPEG. If a file truly can't be used, give that tile a danger outline with one line beneath ('Couldn't use this photo') and Remove, at the 12px caption size. Drop the paragraph.
- **Desktop, tablet, phone:** Same at every size; the per-tile message replaces the paragraph under the grid on desktop, tablet and phone.
- **Reuse:** Derivative pipeline from G1D-004; Badge danger tone for the tile outline.
- **References:** 
  - [Grailed](https://mobbin.com/screens/bd1f7d69-9877-48e4-adc5-1ee669c842bd): Status lives on each photo tile, not in a paragraph under the grid
  - [Tinder](https://mobbin.com/screens/44e28fc0-84f2-41ed-9222-28d32089d063): Per-tile upload state in a photo grid
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:414-430,531`, `src/app/api/blob/[kind]/route.ts:37-44`
- **Verification:** partly. Converting instead of asking Connor to change a phone setting is right, and per-tile errors beat the joined red paragraph. Effort is M, not S. sharp's prebuilt binaries can't decode HEIC, so server-side conversion needs libheif or a WASM decoder, and Chrome on a Mac can't decode HEIC with createImageBitmap. This is closer to a capability than a fix.

### G1D-011

**Replace the bare 'Unauthorized' and 'Not found' pages with a sign-in redirect and an in-app state**

Medium · Fix · effort S · `/api/files/[kind]/[id] (opened from any file link)` · Contractor jobs and media close the loop

- **Today:** Signed out, /api/files/task/<id> renders a white page with the single word 'Unauthorized' in monospace (status 401, screenshot). Signed in, a bad id returns 'Not found', and a missing blob returns 'File is missing from storage' (route.ts:31-38). File links open in a new tab, so a session that expired in another tab produces a dead page with no way to sign in.
- **Why:** It is the least finished screen in the app and the one people hit when something has already gone wrong.
- **Change:** When the request accepts text/html, redirect 401 to /login?next=<file url> and render 404 inside the app shell ('This file was removed' with one link back to its task or property). Inside the viewer, a failed fetch shows a tile-sized state with Retry instead of opening anything.
- **Desktop, tablet, phone:** Same at every size; the in-shell 404 follows the app's not-found layout.
- **Reuse:** In-app not-found page (SHELL-042 names the record); the login next parameter (PUBLIC-005).
- **References:** 
  - [Asana](https://mobbin.com/screens/36cb9092-004d-4cfa-abc7-930e4a7ff931): A missing item is named in plain words, with one way back (Restore) and an Undo toast
- **Code:** `src/app/api/files/[kind]/[id]/route.ts:31-38`
- **Verification:** confirmed. Reproduced. Signed out, /api/files/task/x returns 401 with a white page reading 'Unauthorized' in monospace (shots/verify-G1D/files401--desktop-light.png). Signed in, a bad id returns 404 'Not found'. The source lines are route.ts:32, 35 and 39. The Asana reference 36cb9092 is verified ('Looks like project ... was deleted' with Restore and an Undo toast).

### G1D-012

**Show media newest first, grouped by day**

Medium · Design change · effort S · `/tasks/[id] Attachments and /properties/[id] Documents` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Media are still oldest first: the task page Photos grid, the portal job's photos, and property Documents all sort by createdAt ascending. The new MediaGrid makes it worse. It shows only the first 6 tiles on a phone and 12 from sm up, and folds the rest behind 'Show all N', so the newest photos (a contractor's latest) are the ones hidden.
- **Why:** The newest photos are the ones Review and Connor's next decision need. Every photo app and every evidence tool leads with the latest.
- **Change:** Sort the top Photos grid and the portal job grid newest first, so the two-row cap hides the oldest. Activity can stay oldest first, since it already shows each event's photos in place. Day or month headers in the grid are optional once the order is right.
- **Desktop, tablet, phone:** Headers at 12px muted on all sizes. On phone 375, groups older than 30 days collapse to month. Tablet and desktop show day groups for 90 days.
- **Reuse:** MediaGrid group-by; date formatting helpers in src/lib.
- **References:** 
  - [Attio](https://mobbin.com/screens/070de66a-5dcc-4049-ae06-b0ff0babcdd4): Activity grouped under quiet period headers ('This week', 'June') with bundled lines; the same header style suits media day groups.
  - [GoPro Quik](https://mobbin.com/screens/85e34bcd-4e95-4f31-b7db-d374b1dbd17f): Media grouped under date headers, newest first, with duration badges
  - [corner](https://mobbin.com/screens/b084c6a7-0399-4d47-bb01-e86fd67bb933): Grid grouped by month with a year switcher for long histories
  - [Fabric](https://mobbin.com/screens/75fb29e7-991b-462d-b0f7-ba0bdcaafa04): Mixed photos and PDFs on a timeline grouped by date
- **Code:** `src/app/(app)/tasks/[id]/page.tsx:36`, `src/app/(app)/properties/[id]/page.tsx:50`, `branch: src/app/(app)/tasks/[id]/page.tsx:49-51`, `branch: src/lib/portal/queries.ts:252-256`, `branch: src/app/(app)/properties/[id]/page.tsx:57`, `branch: src/components/media-grid.tsx:39-71`
- **Verification:** confirmed. Both queries order by createdAt asc (tasks/[id]/page.tsx:36, properties/[id]/page.tsx:50). Newest first is a clear improvement after the import. Show day headers only when a set spans more than one day; a 4-photo task needs no header. This conflicts with G1D-034's At start and At finish groups, so pick one grouping per surface: stage on jobs, date on property rollups. The mocks cited are the reviewer's own.

### G1D-013

**Cap the media grid at two rows with a +N tile, and list documents as rows under it**

Medium · Design change · effort M · `/tasks/[id] media section (and the job page)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Built: square tiles capped at two rows, with documents and links listed as rows under the grid (FilesList). Desktop has six 88px columns. It differs from the recommendation in three ways. The phone grid has 3 fluid columns, so a 4-photo Mark done set leaves one tile alone on row 2. Overflow is a 'Show all N' text button that expands in place, not a '+N' last tile. Document rows show name and size only, with no 'First name · Oct 3'.
- **Why:** Density is what makes Stripe and Ramp feel calm: the record stays scannable however much evidence piles up, and the full set is one tap away.
- **Change:** Set PHONE_COLS to 4 in MediaGrid. Replace the 'Show all' link with a '+N' last tile that opens the Lightbox on the full set. Add uploader and date to FilesList rows. This changes the grid's look, so it needs Connor's OK.
- **Desktop, tablet, phone:** Desktop 1280: 6 per row, cap 12. Tablet 768: 6 per row, cap 12. Phone 375: 4 per row, cap 8; document rows show name and 'First name · Oct 3' on two lines and drop the size. 320: still 4 per row (about 62px tiles, above the 44px target).
- **Reuse:** MediaGrid; document rows like the Twenty files tab rather than the Table primitive.
- **References:** 
  - [Shopify](https://mobbin.com/screens/48c37e3f-79c0-4071-9b2f-8ead77c17335): Phone record shows 'Media (3)' with View all and a single row of tiles; the cap-plus-link pattern at phone width.
  - [Linear Mobile](https://mobbin.com/screens/7937bb59-93a8-47c2-a769-85e799a6a2e3): Images above, then documents as plain rows (icon, name, size, chevron) beneath them in the same record.
  - [Attio](https://mobbin.com/screens/bdfaa54f-2b12-49fe-a6bd-3c3f01289812): Files tab rows: type icon, name, date right-aligned, Upload file as the one header action.
  - [Twenty](https://mobbin.com/screens/31ceb745-43b0-432a-9387-1bb0eda2866b): Files as compact rows with type icon, name and date
  - [Dropbox](https://mobbin.com/screens/1828e29b-63ab-4d85-b3c0-734c22226cd8): PDFs shown by first-page thumbnail with 'PDF • 13.46 KB'
  - [GetYourGuide](https://mobbin.com/screens/a002c1c4-730a-4cfc-8ce9-fae8960a2ed0): Viewer with '24 / 32' and a grid button to see the whole set
- **Code:** `branch: src/components/media-grid.tsx:11-14,45-71`, `branch: src/app/(app)/tasks/[id]/view.tsx:126-135`, `branch: src/app/(app)/tasks/[id]/files-list.tsx:56-66`
- **Verification:** confirmed. Rows measure about 37px each. I injected the component's own row markup at 375 in WebKit (shots/verify-G1D/task-rows--rows--mobile-light-webkit.png) because the local DB has no attachments. A two-row cap with a +N tile and documents as quiet rows is the calm, dense pattern the bar asks for. This is the concrete grid spec behind G1D-001; keep both but treat 013 as 001's layout detail.

### G1D-014

**Show who added each file and when; f59e6ad stores it but the component drops it**

Medium · Fix · effort S · `/tasks/[id] and /properties/[id] media (tiles, rows, viewer header)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The Lightbox header now shows who added the item and when, built from uploadedByUser or uploadedByContact and createdAt. It uses the full name and always the year ('Connor Swofford · Oct 3, 2026, 2:14 PM'). Tiles stay clean. Document and link rows (FilesList) show no uploader or date. No EXIF takenAt is read at upload, and PropertyAttachment still has no uploader.
- **Why:** Evidence needs provenance. 'First name, Oct 3, 2:14 PM' is what tells you a photo is from this visit and not the last one, and it closes the loop on who did the work.
- **Change:** Use first names and drop the current year in the Lightbox byline. Add 'First name · Oct 3' to FilesList rows. Read EXIF DateTimeOriginal in useMediaUploader as takenAt. Add uploadedByUserId to PropertyAttachment when Documents move to the shared components.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: full name and time in the viewer header and details panel. Phone 375: first name and date only in the top bar.
- **Reuse:** The planned Avatar (spec §7); MediaViewer header.
- **References:** 
  - [Supabase](https://mobbin.com/screens/5aca9059-1063-4917-90b5-218110f85887): Preview panel lists type and size, Added on and Last modified as label-over-value pairs.
  - [Gusto](https://mobbin.com/screens/2a4319d4-c9f9-40df-84ee-3a9023c180bd): Each document shows its state with a date ('Uploaded Dec 15, 2025') in a fixed column.
  - [QuickBooks](https://mobbin.com/screens/27b05331-bdf8-4445-94e1-c183aa41d43d): 'Added 2:28 PM 05/03/2026 by Alex Smith' under the receipt
  - [Remote](https://mobbin.com/screens/75bad66f-7b71-45c8-a2f7-bf314a5c06ed): Uploaded-by column ('Uploaded by you', 'Provided by the company') next to date
  - [Paired](https://mobbin.com/screens/9f07be5a-ba13-4fd1-b37f-c1fb23d5442a): Small 'Added by you' chip on each photo
- **Code:** `branch:  (f59e6ad) prisma/schema.prisma:336-366`, `branch:  (f59e6ad) src/app/(app)/tasks/[id]/task-detail.tsx:251`, `branch:  (f59e6ad) src/lib/asana/map.ts:1420`, `prisma/schema.prisma:267-279`, `branch: src/app/(app)/tasks/[id]/page.tsx:118,125-136`, `branch: src/components/lightbox.tsx:82,98`, `branch: src/app/(app)/tasks/[id]/files-list.tsx:12-20`
- **Verification:** confirmed. Verified on f59e6ad. The schema has uploadedByUserId, uploadedByContactId, width, height and durationSec (schema.prisma:336-366), and task-detail.tsx:251 drops everything but id, filename and size. Main's PropertyAttachment has no uploader column (schema.prisma:267-279). One ref fix: map.ts:1420 is the event's createdAt; the attachment's own createdAt is set at map.ts:1443.

### G1D-015

**Give videos a poster, a duration badge and a clear fallback when the browser can't play HEVC**

Medium · Design change · effort M · `Video tiles and playback in the viewer (/tasks/[id], job page)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Video tiles show the poster, or a dark tile when there's none, with a Play mark and the length ('0:42'). The length is read in the browser at upload. The Lightbox plays <video controls playsInline preload=metadata poster> through /api/files, which redirects to the signed URL. Posters exist only for imported videos, so every new upload shows as a dark tile. The video has no onError handling, so HEVC that Chrome or Android can't decode leaves a blank black player with no message or Download prompt. A paused video isn't re-signed after the 10-minute URL expires.
- **Why:** A black box with a dead player is the most confusing failure. Pieter on a Windows laptop would assume the upload is broken and ask the contractor to send it again.
- **Change:** Make the poster frame at upload (see G1D-004). In the Lightbox Stage, handle the video's error event, or a stall with no first frame after a few seconds: show the poster, one line ('This browser can't play this video') and Download. On a 403, reload the src once to re-sign.
- **Desktop, tablet, phone:** Desktop 1280: centered at up to 80vh with native controls; details panel stays. Tablet 768 and phone 375: full-screen native player inline (playsinline), swipe down to close; the fallback line sits above the bottom bar.
- **Reuse:** MediaViewer; f59e6ad signed video redirect; poster path and verification already on f59e6ad.
- **References:** 
  - [Slack](https://mobbin.com/screens/6e7fd31f-da38-4f7f-ad65-6261dd3489f8): Video modal with play, '0:07 / 0:42', Download and a chosen thumbnail
  - [GoPro Quik](https://mobbin.com/screens/85e34bcd-4e95-4f31-b7db-d374b1dbd17f): Video tiles carry a camera icon and duration so they read as video before you tap
- **Code:** `branch: docs/asana-migration-plan.md:42,280,513`, `branch:  (f59e6ad) src/lib/attachments/headers.ts:23`, `src/app/api/files/[kind]/[id]/route.ts:41-47`, `branch: src/components/media-grid.tsx:78-118`, `branch: src/components/media-uploader.tsx:272-302`, `branch: src/components/lightbox.tsx:222-236`, `branch: src/lib/attachments/headers.ts:23`
- **Verification:** confirmed. Main has no Range support and streams video through the route (route.ts:41-47). f59e6ad uses a 10-minute signed redirect (headers.ts:23). The spec names 'poster plus download' as the fallback for phones that aren't Apple (plan line 513) without defining how it reads, and this finding fills that in. The Slack and GoPro references were not spot-checked.

### G1D-016

**Mark Internal files and new contractor photos on the tile**

Medium · Design change · effort S · `Media tiles on /tasks/[id] and the viewer` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly built: there is a lock on the tile and the row, but no viewer label, no way to change visibility and no new marker.
- **Today:** On /tasks/[id], Internal photos and videos now get a 16px lock chip in the tile's top-left corner and ', internal' in the tile's accessible name. Internal documents and links get a lock icon in their row. Three parts are still missing: (1) the viewer header shows only the filename and 'Name · date', never 'Internal'; (2) nothing changes visibility after posting (the viewer offers only Download and Delete, and the file row's ⋯ menu only Delete); (3) nothing marks files that are new since your last visit, because TaskReadState is read only for contractors. The branch DB has no task media, so this is checked from the code, not a screenshot.
- **Why:** Close the loop: before uploading a quote or a lease, staff need to know whether the contractor will see it. In Review, the new photos need to stand out from 40 imported ones.
- **Change:** Keep the top-left lock: it doesn't clash with the top-right new dot. Add 'Internal' to the viewer byline ('Internal · Connor · Oct 23'). Add 'Share with Zack' or 'Make internal' to the viewer and to the file row's ⋯ menu, beside Delete. Add the staff new-dot when the week-2 unread work lands (spec §4, 'unread badges').
- **Desktop, tablet, phone:** Same marks at every size; 10px lock on 75px phone tiles, 12px on desktop tiles.
- **Reuse:** House rule 'A dot in a card's top-right corner means new or unread'; lucide Lock; Visibility enum and unread table on f59e6ad.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/a3bbf77c-5e71-4338-9d8a-1aff75dacbee): A vertical edge label 'This document will be private to our team' marks visibility without adding a control.
  - [Jobber](https://mobbin.com/screens/a0b4e24f-d840-4163-b198-5b0a6fbfab83): 'Internal notes will only be seen by your team' sits as one helper line above the note and its file drop.
  - [Mercury](https://mobbin.com/screens/92357ab7-f761-476f-b69f-7b7ec86c6e2b): 'Internal note (optional)' with 'Not visible to the recipient' beneath it; plain visibility copy for HG's Internal switch.
  - [Basecamp](https://mobbin.com/screens/8b41cc3e-29d5-465b-8339-125836eef39a): Persistent 'The client can see this. Change' marker on shared items
  - [Paired](https://mobbin.com/screens/9f07be5a-ba13-4fd1-b37f-c1fb23d5442a): Small chip on the photo itself carries who-can-see or who-added context
- **Code:** `branch:  (f59e6ad) prisma/schema.prisma:349`, `branch:  (f59e6ad) src/app/api/files/[kind]/[id]/route.ts:92-99`, `branch: docs/asana-migration-plan.md:142`, `branch:src/components/media-grid.tsx:88,119-123 (lock chip, aria ', internal')`, `branch:src/app/(app)/tasks/[id]/files-list.tsx:64 (row lock), 75-79 (menu has Delete only)`, `branch:src/components/lightbox.tsx:93-127 (header: filename, byline, Download, Delete, Close; no visibility)`, `branch:src/lib/portal/queries.ts:131-135 and src/lib/portal/jobs.ts:62-65 (TaskReadState used for contractors only)`
- **Verification:** confirmed. A quiet lock on Internal tiles answers the question that matters before uploading a quote or lease. One evidence ref is wrong: plan line 142 is the cutover runbook; the unread table is plan line 146. The schema default is INTERNAL (f59e6ad schema.prisma:349), while the spec's composer is 'Shared by default' (plan line 401). Settle that default first so the unmarked state is the common one.

### G1D-017

**Rebuild the listing photo editor around a large cover and drag to reorder**

Medium · Design change · effort M · `/properties/[id] Rentals editor, listing photos` · Rentals, residents and the public site run one lifecycle

- **Today:** Edit mode shows 112x80 thumbnails (edit-listings.tsx:474), a 9px 'Cover' chip (:506) and a '+ Add photo' tile measured at 10px text in WebKit (:517). Reordering is ‹ › buttons. Photos appear only after their upload finishes. While a batch runs, the add tile reads 'Uploading…' and is disabled, so you can't queue more. At 375 the strip sits between the unit selects and the Zillow field and reads as a minor field.
- **Why:** Listing photos sell the unit. Airbnb, Turo and Zillow make the cover big and the ordering direct, so you see what renters see first. Tiny thumbnails make that judgment impossible.
- **Change:** A Photos section in the listing editor. The cover is a wide 4:3 tile labeled 'Shown first on the site'; the rest follow in a 4-column grid with a count in the header ('8 photos'). Drag to reorder on desktop and long-press drag on touch. Tapping a tile opens it in the viewer, where Make cover and Remove live, so there is no permanent per-tile chrome; desktop also shows ⋯ on hover. Picked files appear immediately as local previews with a progress ring, and you can keep adding while others upload.
- **Desktop, tablet, phone:** Desktop 1280: cover spans 2x2 in a 4-column grid. Tablet 768: same, with long-press drag. Phone 375: cover full width, 3-column grid below, long-press drag; the header count drops.
- **Reuse:** MediaGrid with canReorder and canSetCover; useUploadQueue; replaces PhotoGallery. Fixes the reach issue in PROPERTY-005 and MOBILE-016 by moving actions into the viewer.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/0c23f780-db8d-4672-a485-1538c60e55ba): Large cover tile, then a two-column grid; each tile's ⋯ menu offers Edit, Move backward, Move forward, Make cover photo and Delete, which is the keyboard and touch alternative to drag.
  - [Airbnb](https://mobbin.com/screens/0701edf9-3ec2-4c5a-8b92-50c341d40d98): Phone version: 'Cover photo' label on the first tile and 'Drag to reorder' as the only instruction.
  - [Airbnb](https://mobbin.com/screens/d1508219-51d8-4a2c-9d42-d94ef24e68a8): Large 'Cover Photo' tile, a ⋯ menu on photos, drag to reorder
  - [Turo](https://mobbin.com/screens/fe3e6532-c123-4c04-b3f5-1a0c4d410fa5): 'Guests see this photo first' label on the first tile and 'Drag to reorder'
  - [Zillow](https://mobbin.com/screens/d615b7af-3c4c-4327-97a3-d1215eaf4ce6): Rental listing photos with 'Drag and drop to reorder' and an Add tile
  - [Grailed](https://mobbin.com/screens/bd1f7d69-9877-48e4-adc5-1ee669c842bd): Local previews and 'Cover Photo' label while uploads run
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:432-531`
- **Verification:** confirmed. Measured in WebKit at 1280, 768 and 375. The add tile is 112x80 with 10px text, the Cover chip is 9px, and the busy state disables adding (edit-listings.tsx:503-519). Photos appear only after upload finishes (onAdd after upload). The ✕, ‹ and › controls are opacity-0 until hover, so they're invisible on touch. The Airbnb reference d1508219 is verified: a large 'Cover Photo' tile, ⋯ on each tile, and drag in progress. Its sibling screen 9201ab20 shows 'Choose at least 5 photos / Drag to reorder'.

### G1D-021

**Open /rentals photos full screen as a photo tour with rent and the next step**

Medium · Design change · effort M · `/rentals (public) listing photos` · Rentals, residents and the public site run one lifecycle

- **Today:** Each card shows one 4:3 object-cover photo with hover-only arrows (photo-carousel.tsx:30-50). Tapping the photo does nothing, portrait phone shots are center-cropped, and there is no way to see a photo larger. Locally all three listings show 'No photo yet' (rentals aria).
- **Why:** Renters decide on photos. KAYAK and GetYourGuide let you see every photo large, with the price and the next step still in reach.
- **Change:** Tapping or clicking the photo opens the shared viewer in the public palette (#08090b ground, #e8eaee text): '3 / 8', swipe and arrows, object-contain so portrait shots aren't cropped, a grid button for all photos, and a slim footer with '$1,250/mo · 2 bd · 1 ba' and the listing's next step ('View on Zillow' today, an inquiry later per PUBLIC-011). The gold accent goes on that one action only. Esc or swipe down closes.
- **Desktop, tablet, phone:** Desktop 1280: centered photo up to 80vh with edge arrows and the footer below. Tablet 768: full screen with swipe. Phone 375: full screen; footer shows rent and the action, and drops beds and baths.
- **Reuse:** MediaViewer with public tokens; PhotoCarousel becomes the card's inline preview only.
- **References:** 
  - [Zillow](https://mobbin.com/screens/3837dc2a-b729-462a-b435-5d58923e6355): One large photo plus four smaller with 'See all 9 photos', rent beside beds, baths and square feet.
  - [Zillow](https://mobbin.com/screens/1679f762-5a64-416d-a018-4f70313fbd6b): See all opens a vertical photo scroll with price, address and 'Request a tour' pinned on the right.
  - [Airbnb](https://mobbin.com/screens/53d912ff-a3dc-472b-b525-379c327a89e8): Phone: full-width photo with a counter, then a sticky bottom bar with the price and the one action.
  - [KAYAK](https://mobbin.com/screens/23c5bca4-4388-462e-aa07-5cf8bb57d1ac): '20/54 photos' with the price and 'View deal' kept in the viewer header
  - [GetYourGuide](https://mobbin.com/screens/a002c1c4-730a-4cfc-8ce9-fae8960a2ed0): '24 / 32' viewer with a grid button and 'Check availability' below the photo
  - [Turo](https://mobbin.com/screens/423ee5a0-c146-4516-99f3-8ef619c249fa): '1 of 6' modal photo viewer over the listing
- **Code:** `src/app/(marketing)/rentals/photo-carousel.tsx:30-50`, `src/app/(marketing)/rentals/page.tsx:99-106`
- **Verification:** confirmed. Confirmed in code. The arrows are opacity-0 until group hover, the img has no click handler, and object-cover crops portrait shots (photo-carousel.tsx:30-50). Locally all three cards show 'No photo yet' (shots/verify-G1D/rentals--cards--mobile-light.png). A photo tour with rent and one gold next step fits the public palette rules.

### G1D-022

**Roll every task photo for a property into a Photos view on its Documents tab**

Medium · New capability · effort M · `/properties/[id] Documents tab (D10 hub)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The D10 property hub isn't built yet (spec: after cutover). On /properties/[id], the Documents card still holds only uploaded documents (edit-documents.tsx is unchanged from main) and sits near the bottom: the dropzone is at y=3691 at 375. Task photos stay only on their own task, in the Photos section of /tasks/[id].
- **Today:** Photos live only on the task they were posted to. 767 Prospect has 29 open tasks in its Tasks card, and after the import its rehab photos will be spread across them. The property's Documents card holds only uploaded documents (edit-documents.tsx) and sits at y=3524 of 3836 at 375.
- **Why:** Questions like 'what did the bathroom look like before drywall' or 'send the insurer every roof photo' need a property-level feed. CompanyCam's whole product is this view.
- **Change:** On the D10 Documents tab, add a segmented control 'Documents | Photos'. Photos is a date-grouped grid of every photo and video from that property's tasks, newest first. Each tile's viewer details link to its task. Add a unit filter only when the property has more than one unit. No new tab and no new upload path.
- **Desktop, tablet, phone:** Desktop 1280: 8 tiles per row at tab width. Tablet 768: 6 per row. Phone 375: 4 per row with sticky month headers.
- **Reuse:** MediaGrid; SegmentedControl (to be extracted from deals/filters.tsx per components.md); D10 Documents tab.
- **Challenges:** D10 property hub tabs (Overview, Tasks, Units, Documents, Financials, CapEx, Activity): adds a Photos segment inside Documents instead of a new tab.
- **References:** 
  - [Jobber](https://mobbin.com/screens/bea1674a-245c-4f23-bedb-f1fafdee9a5f): 'Link note to related' with Requests, Quotes, Jobs and Invoices checked: a file added once shows on every related record, as task photos should on the property.
  - [Airbnb](https://mobbin.com/screens/4d64e5e5-5b71-4229-9ae9-950d0f18e4b8): Photo tour grid on the listing editor: one cover tile and a count per group.
  - [GoPro Quik](https://mobbin.com/screens/85e34bcd-4e95-4f31-b7db-d374b1dbd17f): One media library grouped by date with video badges
  - [corner](https://mobbin.com/screens/b084c6a7-0399-4d47-bb01-e86fd67bb933): Long photo history grouped by month with a year strip
  - [Fabric](https://mobbin.com/screens/75fb29e7-991b-462d-b0f7-ba0bdcaafa04): Timeline grouped by date mixing photos and documents
- **Code:** `src/app/(app)/properties/[id]/edit-documents.tsx:6-33`, `branch:src/app/(app)/properties/[id]/edit-documents.tsx:23-30 (property attachments only)`, `branch:src/app/(app)/tasks/[id]/view.tsx:126-134 (photos live on the task)`
- **Verification:** confirmed. Measured: Documents sits at y=3524 of 3836 at 375 in WebKit, and the Tasks card holds about 29 open tasks. A Photos segment inside the D10 Documents tab adds no new tab, and the conflict note names D10 properly.

### G1D-I04

**Failed photo tiles show the browser's broken-image glyph instead of the fallback icon**

Medium · Fix · effort S · `MediaGrid on the staff task page and the contractor job page` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. On the same task, all 16 images on desktop (14 of 16 on phone, some still lazy) have complete && naturalWidth 0, and none shows the ImageOff fallback. The screenshot shows the browser's broken-image glyph in every Photos and Activity tile. The viewer does fall back to the ImageOff message.
- **Today:** MediaGrid tiles never reach the ImageOff fallback (16 broken, 0 fallback icons). The viewer already handles it: opening any of these photos shows the ImageOff icon and 'This photo can't be shown here. Download it to view.' at 1280 and 375. Only Tile (media-grid.tsx:96-104) needs the fix.
- **Why:** A gray square with a stray browser glyph looks broken. G1D-002 expects imported and removed files to 404, so this state will show up in production.
- **Change:** In Tile, check through a ref on mount whether `img.complete && img.naturalWidth === 0` and set broken if so, or render the img only after mount. Apply the same check to the viewer's Stage in lightbox.tsx, so a failed original falls back to the thumbnail and then to the message.
- **Desktop, tablet, phone:** The same at every width.
- **Reuse:** MediaGrid Tile and Lightbox Stage.
- **Code:** `eval on /tasks/cmtg25yws02dmjphsnig7k6l1 (:3300): {tiles: 16, broken: 16, fallbackIcons: 0}`, `task-management-migration-4c9ddf/src/components/media-grid.tsx:96-104`, `shoot.mjs eval: 'imgs=16 broken=16 imageOff=0'`, `4652abb:src/components/media-grid.tsx:94-110`
- **Verification:** partly. The grid part is reproduced: 16 img elements with complete=true, naturalWidth 0 and 0 lucide-image-off icons. All tiles show the browser glyph in Photos and Activity at 1280 and 375. The mount-time `complete && naturalWidth === 0` check in Tile is the right S fix. Drop the Lightbox half of the recommendation. The viewer already shows its fallback, because the Stage mounts client-side after open.

### G1D-I16

**Preview the listing as renters will see it before saving**

Medium · Design change · effort S · `Property page, Rentals editor` · Rentals, residents and the public site run one lifecycle

- **Today:** The editor offers '+ Add listing', Save and Cancel (confirmed), and /rentals shows 767 Prospect as 'No photo yet', 'Price on request', 'Details on request'. Locally all three Available listings (767 Prospect, 647 Prospect, 933 Lafayette) have no photo, rent, beds, baths or sqft, so the issue is listings going public empty.
- **Why:** Zillow Rental Manager ends a listing edit on 'Listing preview', the real public page with Back and Publish. Seeing the crop and the missing fields before publishing catches a listing that goes live without rent.
- **Change:** Add 'Preview' next to Save. It opens a sheet showing the exact /rentals card in the public palette at phone width, using the current unsaved values, with a desktop or phone toggle. If a field will print as 'on request', one line under the card says so ('Rent and beds are missing').
- **Desktop, tablet, phone:** Desktop: a 420px side sheet showing the phone-width card, with the toggle. Tablet: a centered sheet. Phone: a full-screen sheet with Close; the toggle drops because the card is already phone width.
- **Reuse:** The /rentals card component rendered with editor state; Sheet.
- **References:** 
  - [Zillow](https://mobbin.com/screens/3837dc2a-b729-462a-b435-5d58923e6355): 'Listing preview' renders the public page with Back and Publish before anything goes live.
  - [Airbnb](https://mobbin.com/screens/2e723699-3115-4cf5-8f89-7ad3a61509df): Floating 'View' pill over the listing editor.
  - [Zillow](https://mobbin.com/screens/8fbdae21-bbea-45ce-a44c-c564dc08de1c): 'Preview listing' on the review step before Pay & publish.
- **Also found as:** G2C-I19 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** partly. The underlying problem is real and public-facing. But a preview only reveals it after the fact, and the desktop/phone toggle adds chrome. Lead with the readiness line inside the editor ('Rent, beds and photos missing'). It needs no sheet and catches the issue before Save. Keep Preview optional, without the device toggle. Related: the Beds/Baths placeholders make the editor look filled in (G1D-V02). The Zillow listing-preview reference is plausible. I checked this on local data only; production listings may hold photos that the import didn't bring over.

### G1D-I19

**Let a task template require finish photos, and drop Skip when it does**

Medium · New capability · effort M · `Contractor Mark done sheet; task templates; staff Review rows` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. In the portal, job cmvkik0ht0003jpg7nflnvoun's Mark done sheet asks 'Add photos of the finished work?' and offers 'Add photos' (outline) and 'Skip' (primary blue). One tap marks it done with no proof. TaskTemplate still has no photos option.
- **Today:** With no photos added, the Mark done sheet's primary blue button reads 'Skip' (job-actions.tsx:133), so a turnover or rehab job can be marked done with no proof in one tap. A template has no way to say photos are needed.
- **Why:** Brex marks a required receipt 'Missing' with one line of policy and offers a 'Missing documentation' filter. Thumbtack's Skip suits optional steps, but required ones shouldn't offer it.
- **Change:** Add 'Finish photos required' to a template's options. On those jobs, Mark done shows a required slot ('Add at least 2 photos of the finished work'). The primary button reads 'Mark done' and stays disabled until the photos are up, and there's no Skip. On staff task lists, a job in Review without photos shows a small 'No photos' chip after its title.
- **Desktop, tablet, phone:** Phone: the required slot is a row of camera tiles above the note, with the buttons pinned. Tablet and desktop: the same, in the centered sheet.
- **Reuse:** Sheet, MediaUploadTray, TaskTemplate fields, Badge.
- **Challenges:** Asana migration spec §6 job page: Mark done asks 'Add photos of the finished work?' as optional for every job. This keeps that default and makes photos required only on templates that opt in.
- **References:** 
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): 'Receipts: Missing' with 'Your policy requires a receipt.'
  - [Brex](https://mobbin.com/screens/47dfde64-0ad0-41c6-978c-c56480db69de): 'Missing documentation' filter chip; each row ends in its own Add button.
  - [Thumbtack](https://mobbin.com/screens/bada6ed2-d3d3-4209-b332-354d4e16c6db): Skip as the primary button is right only when the step is optional.
- **Code:** `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:133`, `4652abb:src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:133`, `4652abb:prisma/schema.prisma:465-479`
- **Verification:** partly. Observation verified: at 375, with no photos or note, the Mark done sheet's primary blue button reads 'Skip' (job-actions.tsx:133), and tapping it marks the job done. The template opt-in respects spec §6 and names the conflict correctly. Drop the 'No photos' chip on staff task lists, which adds list clutter. The Review banner is where photos get checked: it already prints '· 4 photos' and could read '· no photos' when there are none. The Brex references are plausible.

### G1D-009

**iPhone camera captures all save as 'image.jpg'**

Low · Fix · effort S · `/tasks/[id] Attachments and the job page (phone captures)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Both the stored filename and the blob path come from file.name. safeUploadName keeps 'image.jpg' as it is, so iPhone captures show as 'image.jpg' in the Lightbox header, the upload tray labels and the download name. The React-key part is fixed: queue items get generated keys (m1, m2, …), so two captures no longer collide.
- **Today:** Photos taken through a web file input on iPhone arrive with a generic name ('image.jpg'). Both main and f59e6ad store file.name as the filename (attachments.tsx:63 on main; f59e6ad attachments.tsx:122). On main, in-progress rows are keyed and cleared by name (attachments.tsx:50-51, 77, 109-110). Two captures in a row therefore share a React key, and the second row disappears when the first finishes. f59e6ad fixes the key but not the name.
- **Why:** Twelve 'image.jpg' files are useless in Download, in the history and in the viewer header, and on main the progress bug hides an upload still in flight.
- **Change:** When the browser's name is generic (image.jpg, image.jpeg, capturedvideo.mov), name the file from context: '<street> <Mon D> <h.mm a>.jpg', for example '767 Prospect Oct 22 2.14 PM.jpg', with ' 2' for a second shot in the same minute. Keep real names like IMG_4821.HEIC. Key queue items by a generated id, never by name.
- **Desktop, tablet, phone:** Names appear only in the viewer header, document rows and Download; tiles never print filenames at any size.
- **Reuse:** filenameForType in f59e6ad src/lib/attachments/content-types.ts is where the rename belongs.
- **References:** 
  - [Google Photos](https://mobbin.com/screens/1657c18f-7053-494d-9393-5d962eda7b4d): A photo is titled by its date and time, not its file name
  - [Zoho CRM](https://mobbin.com/screens/012db99a-8734-4cdd-a09b-dbd3fb67c076): Uploaded capture gets a dated name ('Video Recording 28-03-2026 16:04') and 'Uploaded by'
- **Code:** `src/components/attachments.tsx:50-51,63,77,109-110`, `branch:  (f59e6ad) src/components/attachments.tsx:122,130`, `branch: src/components/media-uploader.tsx:141,156,190`, `branch: src/lib/attachments/paths.ts:53-67`
- **Verification:** partly. The bug is accurate. On main, busy rows are keyed by name and cleared by name when each batch ends (attachments.tsx:50-51, 77, 109-111), and a camera capture is a one-file batch. Two captures in a row therefore share a React key, and the second row disappears when the first batch finishes. f59e6ad fixes the key (line 129). Severity is low: once tiles replace the filename list, names only surface in downloads and the viewer header.

### G1D-018

**Give PDFs a first-page thumbnail and preview them inside the viewer**

Low · Design change · effort M · `/properties/[id] Documents and task files (PDF)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. On /tasks/[id], task documents are now in a separate FilesList. Every file uses the same FileText icon, and tapping one opens /api/files/task/<id> in a new tab. The Lightbox accepts only IMAGE and VIDEO. Property Documents on /properties/[id] still use the same generic FileIcon and open in a new tab. There are no PDF thumbnails anywhere.
- **Today:** Observation is accurate (one generic FileIcon for every type, attachments.tsx:86 and 172-186), but most of the user-facing pain, a new tab for each PDF, is the same problem G1D-003 already fixes.
- **Why:** Telling the 2026 policy from the 2025 one shouldn't take a new tab each. Ramp-class tools show the document beside its details.
- **Change:** At upload, render page 1 to a 320px PNG with pdf.js, loaded only on upload, and store it as the thumb. Document rows show it at 32x40. On desktop the viewer embeds the PDF from /api/files in an iframe filling the media area; the details panel shows name, 'First name · Oct 3', size and Download. On phones, tapping a PDF opens it full screen in the system viewer (new tab, Quick Look on iOS), because embedded PDFs on iPhone are unreliable.
- **Desktop, tablet, phone:** Desktop 1280: embedded preview with a 320px details panel. Tablet 768: embedded full-screen preview with a top bar (close, name, ⋯). Phone 375: system viewer, with the thumbnail and name in the row.
- **Reuse:** MediaViewer; f59e6ad PDF headers; upload derivative step from G1D-004.
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): PDF rendered as a page in the viewer with zoom and Reset, beside the record's facts.
  - [Supabase](https://mobbin.com/screens/56d69f0f-9dac-4c34-9d70-00d5e36020e2): Selecting a file in the list shows its preview in a side panel with Download and Delete.
  - [Trello](https://mobbin.com/screens/d1bcc3f0-5555-4b15-bb1d-7bb9f7d125e5): PDF previewed in the lightbox with date, size and actions
  - [Revolut Business](https://mobbin.com/screens/8fba2393-1721-4a2c-af4e-fa2f978f7779): Receipt PDF previewed in a panel beside its record, file row with date
  - [Dropbox](https://mobbin.com/screens/1828e29b-63ab-4d85-b3c0-734c22226cd8): First-page thumbnails in the grid, preview panel with Download and Open
  - [inDrive](https://mobbin.com/screens/e7ce7ac5-22ca-4d50-9bcf-8aaddf7da919): Phone PDF preview with Download, Share and Mail in a bottom bar
- **Code:** `src/components/attachments.tsx:86,172-186`, `branch:  (f59e6ad) src/lib/attachments/headers.ts:43-50`, `branch:src/app/(app)/tasks/[id]/files-list.tsx:53-63 (one FileText icon, target=_blank)`, `branch:src/components/lightbox.tsx:12-14 (MediaItem kind is IMAGE or VIDEO only)`, `branch:src/components/attachments.tsx:157-166 (property docs: generic FileIcon, new tab)`
- **Verification:** partly. The in-viewer PDF preview on desktop is already part of G1D-003 ('PDFs embed on desktop'). What's left here is first-page thumbnails through pdf.js at upload. That's a heavy dependency for a modest gain over a type icon, a good name and 'First name · Oct 3'. Treat it as polish after the viewer ships.

### G1D-019

**Define the viewer's keyboard, focus and touch contract before it's built**

Low · Design change · effort S · `MediaViewer (all surfaces)` · Contractor jobs and media close the loop

- **Today:** There is no viewer yet, and today's overlays ignore Esc and don't trap focus: ConfirmDialog (components.md Known gaps) and the inline Rentals discard dialog (edit-listings.tsx:168-203). The viewer will open over other layers: the Review banner, the job page bottom bar, the Rentals editor with unsaved changes.
- **Why:** The house rules require one Esc per layer and touch parity. A viewer that eats the second Esc or traps keyboard users breaks both.
- **Change:** Make these part of the component spec. Dialog named '<file name>, 3 of 12'. Focus moves to the media on open and returns to the tile on close. Esc resets zoom first, then closes the viewer, never the layer beneath. ← and → move, Home and End jump. A polite live region announces the counter. Tiles are buttons named 'Photo, First name, Oct 3'. Touch: swipe left and right, swipe down to close, pinch and double-tap zoom. Arrows and close are 44px. Reduced motion swaps slides for a fade. Browser Back closes the viewer through the URL parameter.
- **Desktop, tablet, phone:** Desktop 1280: keyboard and wheel zoom, arrows on the media edges. Tablet 768 and phone 375: gestures plus 44px close and ⋯ in the top bar; edge arrows hidden on touch.
- **Reuse:** React Aria Dialog and Modal (D9) handle focus, Esc and scroll lock; the same rules fix the ConfirmDialog gap.
- **References:** 
  - [Zillow](https://mobbin.com/screens/a15d3207-198c-45b9-8137-fef606ff29df): Edit photo dialog steps with prev and next arrows on the image itself and keeps Delete as a separate red button.
  - [Airbnb](https://mobbin.com/screens/53d912ff-a3dc-472b-b525-379c327a89e8): '1 / 27' counter pill on the photo, the position cue the viewer contract should announce.
  - [Turo](https://mobbin.com/screens/423ee5a0-c146-4516-99f3-8ef619c249fa): Viewer with '1 of 6', back, share and close in a top bar and edge arrows
  - [GetYourGuide](https://mobbin.com/screens/a002c1c4-730a-4cfc-8ce9-fae8960a2ed0): Counter, close, grid button and edge arrows, nothing else
  - [Google Photos](https://mobbin.com/screens/27eb5b5f-e283-4f5b-8560-07b4da5d1ba7): Phone viewer with next-photo chevron in the title and one bottom bar
- **Code:** `docs/components.md:30,137`, `src/app/(app)/properties/[id]/edit-listings.tsx:168-203`
- **Verification:** partly. The observation is confirmed. The inline Rentals discard dialog (edit-listings.tsx:168-203) has no Esc handling and no focus trap, and components.md:29 and 137 record the same gap for ConfirmDialog. As a standalone finding it's a checklist for a component that doesn't exist yet, and React Aria Dialog (D9) covers focus, Esc and scroll lock for free. Fold it into G1D-003 as acceptance criteria rather than ranking it separately.

### G1D-023

**Attach a document to the section it proves: policy on Insurance, note on Loan, lease on the unit**

Low · New capability · effort M · `/properties/[id] Insurance, Loan and unit sections` · Contractor jobs and media close the loop

- **Today:** Confirmed that PropertyAttachment has only propertyId (schema.prisma:267-279). Insurance on 767 Prospect shows Carrier, Policy # and Premium as dashes (shots/verify-G1D/p767--rentals--desktop-light.png). The empty fields are a data gap a linked PDF wouldn't fill.
- **Why:** Ramp attaches the receipt to the transaction, not to a folder. 'Show me the policy' should be one tap from the policy's own card.
- **Change:** Add an optional subject to PropertyAttachment (insurance, loan, or a unit id). The Insurance, Loan and unit sheets each show their files as rows ('Policy 2026.pdf · Oct 3'), with a small 'Add file' when there are none. The Documents tab still lists everything, with a quiet label naming what each file belongs to.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one file row inside the card or sheet. Phone 375: the same row; the label under the name drops.
- **Reuse:** Attachments upload plumbing; the categories in PROPERTY-028.
- **References:** 
  - [Mercury](https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62): Attachments sit inside the transaction drawer they prove, between GL code and notes, with an email-in fallback line.
  - [Navan](https://mobbin.com/screens/a8b61ff1-277c-4822-b4f1-0703e10ce2b0): The receipt sits inside the transaction it proves, with 'Upload receipt' and 'View receipt'
  - [Mercury](https://mobbin.com/screens/b315af47-c926-4be0-8e5f-182a270d2430): Attachments section inside the transaction's own panel
- **Code:** `prisma/schema.prisma:267-279`
- **Verification:** partly. Linking a policy or note PDF to the card it proves is Ramp-like and worthwhile, and the Mercury reference b315af47 is verified. Drop the empty 'Add file' affordance on Insurance, Loan and every unit sheet: that scatters upload chrome across the page against the simplicity bar. Tag documents on upload (the PROPERTY-028 categories) and show the linked row in the card only when one exists. Severity is low because it adds a capability and doesn't fix friction.

### G1D-024

**Fix the dropzone's Space-key scroll and drag-highlight flicker**

Low · Fix · effort S · `/tasks/[id] Attachments and /properties/[id] Documents dropzone` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Fixed on the task page; the property page still has the problem.
- **Today:** /tasks/[id] no longer has the dashed dropzone. Files come in through the composer, whose drop handler checks relatedTarget so the highlight doesn't flicker, and whose buttons are React Aria buttons. The property Documents dropzone on /properties/[id] is unchanged: a div with role=button and tabIndex=0 whose Space handler clicks without preventDefault, a dragleave that resets on every child, and the accessible name 'Click to upload or drag files here'. It measures 339x96 at 1280 and 309x96 at 375.
- **Why:** Small, but a keyboard user pressing Space gets a scroll jump and a file picker at once.
- **Change:** Apply the fix only to the property Documents dropzone in components/attachments.tsx, or replace it with the composer's MediaUploader pattern (a real button plus a relatedTarget-guarded drop).
- **Desktop, tablet, phone:** Behavior fix; no layout change at any size.
- **Reuse:** Button primitive in components/ui.tsx.
- **Code:** `src/components/attachments.tsx:120-155`, `branch:src/app/(app)/tasks/[id]/composer.tsx:175-187 (drop with relatedTarget guard)`, `branch:src/components/attachments.tsx:193-200 (role=button div, Space not prevented)`, `branch:src/components/attachments.tsx:204 (onDragLeave flicker), 226 (name)`
- **Verification:** confirmed. The code matches. A div with role=button and tabIndex=0 handles Space without preventDefault (attachments.tsx:120-126). dragleave fires on child boundaries (line 131). The accessible name is 'Click to upload or drag files here' on every device.

### G1D-025

**Stop loading full-size listing originals into 56px admin thumbnails**

Low · Fix · effort S · `/properties/[id] Rentals (read view and editor)` · Rentals, residents and the public site run one lifecycle

- **Today:** The Rentals read view draws photos[0].url, the original public Blob file (up to the 25 MB upload cap, api/blob route.ts:37-44), into a 56x40 img (edit-listings.tsx:220). The editor draws every original into 112x80 tiles (edit-listings.tsx:476). next.config.ts has no images config, so next/image can't resize Blob URLs either.
- **Why:** A property page with three listings of eight photos each could pull hundreds of MB in the editor; the public side of this is PUBLIC-029.
- **Change:** Store a 480px thumb at upload (G1D-004) and use it for admin tiles. Alternatively, add the Blob host to images.remotePatterns and use next/image with sizes.
- **Desktop, tablet, phone:** Same thumbs at every size; phone benefits most on cellular.
- **Reuse:** Derivative pipeline from G1D-004.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:218-223,476`, `next.config.ts:1-10`
- **Verification:** confirmed. Confirmed: next.config.ts has no images config, the listing token allows 25 MB (api/blob route.ts:41), and the read row and editor draw originals (edit-listings.tsx:220, 476). This overlaps the listing half of G1D-004; keep one.

### G1D-026

**Discarded listing photo uploads stay in public storage forever**

Low · Fix · effort S · `/properties/[id] Rentals editor (Cancel or Discard)` · Rentals, residents and the public site run one lifecycle

- **Today:** Listing photos upload to public Blob the moment they're picked (edit-listings.tsx:450-451), before Save. Cancel and Discard only restore state (edit-listings.tsx:99-104). Cleanup of removed photos runs only on save (src/lib/properties/service.ts:282-318), so discarded uploads stay at public URLs with no row pointing at them.
- **Why:** Unpublished photos of a unit remain publicly reachable, and storage grows with every abandoned edit.
- **Change:** Upload to a private staging path and copy to public on Save. Or keep a list of blobs uploaded in this edit session and delete them on discard, plus a weekly sweep of public listing blobs that no ListingPhoto row references.
- **Desktop, tablet, phone:** Server behavior; no UI change.
- **Reuse:** del() cleanup already in properties/service.ts.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:99-104,450-456`, `src/lib/properties/service.ts:282-318`
- **Verification:** confirmed. Confirmed. Uploads happen on pick (edit-listings.tsx:450-456), discard() only resets state (lines 99-104), and save-time cleanup only diffs against photos already in the DB (service.ts:282-295). A photo uploaded and then removed before Save is also orphaned. URLs carry a random suffix, so exposure is low; this is mostly storage hygiene.

### G1D-027

**Strip photo metadata from public listing photos**

Low · Fix · effort S · `/rentals (public) listing photos` · Rentals, residents and the public site run one lifecycle

- **Today:** Listing originals are published as uploaded (edit-listings.tsx:450-456; rentals/page.tsx:26-44). GPS in a photo of a publicly listed rental reveals the address the card already prints, and iPhone Safari file uploads generally drop location, so the exposure is device model and capture time.
- **Why:** Public pages should publish only what HG chose to show.
- **Change:** Serve only the 1600px public copy from G1D-004, which is redrawn through canvas and so carries no EXIF. Keep originals private.
- **Desktop, tablet, phone:** No UI change.
- **Reuse:** Derivative pipeline from G1D-004.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:450-456`, `src/app/(marketing)/rentals/page.tsx:26-44`
- **Verification:** partly. Not standalone work. The 1600px public copy from G1D-004 strips EXIF as a by-product, so track it as an acceptance check there.

### G1D-028

**Fetch the next listing photo before the tap**

Low · Fix · effort S · `/rentals (public) card carousel` · Rentals, residents and the public site run one lifecycle

- **Today:** PhotoCarousel renders one <img> and swaps its src on each arrow press (photo-carousel.tsx:30). The next photo only starts downloading on the tap, and with full-size originals (PUBLIC-029) the arrow seems to do nothing for a moment on cellular.
- **Why:** A lagging arrow reads as broken and invites double taps that skip photos.
- **Change:** Render the slides as a horizontal scroll-snap strip with loading='lazy' and decoding='async' on each image. That also gives swipe for free (MOBILE-026) and loads the neighbor early. Alternatively, preload index ± 1 after the first interaction.
- **Desktop, tablet, phone:** Desktop 1280: arrows scroll the strip. Tablet 768 and phone 375: native swipe on the strip.
- **Reuse:** PhotoCarousel.
- **Code:** `src/app/(marketing)/rentals/photo-carousel.tsx:22-31`
- **Verification:** confirmed. One img with a swapped src (photo-carousel.tsx:30). A scroll-snap strip also gives swipe for free. Overlaps MOBILE-026 and PUBLIC-029 from other units.

### G1D-029

**Let people paste a file or drop it anywhere on the record, and remove the dashed box**

Low · New capability · effort S · `/tasks/[id], job page and /properties/[id] media sections (desktop)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** On /tasks/[id] the dashed box is gone. Pasting files into the comment box adds them, and dropping files on the composer card adds them with a primary-border cue. Both are narrower than recommended: Cmd+V works only while the comment box has focus, and the drop target is only the composer card, not the whole record, with no overlay naming the task. /properties/[id] Documents still shows the 96px dashed box on every property.
- **Why:** Linear and Slack treat paste and drop as the default way in, so the page needs no permanent upload chrome.
- **Change:** Task page: widen the drop target to the main column with an overlay 'Drop to add to <title>', which feeds the composer's uploader. Accept Cmd+V on the page when no other field has focus. Property Documents: replace the dashed box with an 'Add files' header button, as originally recommended.
- **Desktop, tablet, phone:** Desktop 1280 only; tablet 768 and phone 375 use 'Take photo' and 'Add files' (G1D-005).
- **Reuse:** useUploadQueue; the overlay reuses the drag state already in attachments.tsx.
- **References:** 
  - [Linear](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270): Image added straight into the issue activity, no upload box on the page
  - [Mercury](https://mobbin.com/screens/b315af47-c926-4be0-8e5f-182a270d2430): Drag and drop accepted on the attachments area of the record panel
- **Code:** `src/components/attachments.tsx:120-155`, `branch:src/app/(app)/tasks/[id]/composer.tsx:233-238 (paste only in the textarea)`, `branch:src/app/(app)/tasks/[id]/composer.tsx:175-199 (drop only on the composer card)`, `branch:src/components/attachments.tsx:192-227 (property dashed box)`
- **Verification:** partly. Paste support is a cheap win (no onPaste anywhere in src, confirmed). Its own Mercury reference b315af47 contradicts removing the drop target: Mercury keeps a persistent one-line 'Drag and drop here or click to upload' row in the record panel. Recommend shrinking the 96px box to a one-line drop row (or the header 'Add files' button once files exist) plus paste. Removing every visible target leaves desktop users with nothing to discover.

### G1D-031

**Download a task's or property's photos in one ZIP**

Low · New capability · effort M · `/tasks/[id] media section and the property Photos view` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. There is no bulk download on the branch. The /tasks/[id] Photos section header shows only 'Photos' and a count. The Lightbox has a Download button for one item at a time. No zip dependency or route exists.
- **Today:** There is no way to export media. After the import a single task can hold dozens of photos, and insurance claims or lender draws need all of them.
- **Why:** Downloading 40 photos one tab at a time is the kind of chore the app should remove.
- **Change:** In the media section's ⋯ menu, 'Download all (40)' streams a ZIP of the originals named '<street> <task title>.zip'. The property Photos view (G1D-022) gets the same, with an optional date range. Staff only; zip on the server from Blob streams.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: menu item. Phone 375: same item; the ZIP goes to Files.
- **Reuse:** /api/files access checks; Blob get streams.
- **References:** 
  - [Gusto](https://mobbin.com/screens/3ef59578-0ac3-4f5e-9dae-90db552e3af5): 'Bulk downloads' is a plain entry in the Documents section nav, not a button on every list.
  - [Salesforce](https://mobbin.com/screens/d022baa6-1c3d-4f2c-ac81-c42c88ad0429): File actions (Download, Share, Public Link) kept in one row menu
  - [Dropbox](https://mobbin.com/screens/1828e29b-63ab-4d85-b3c0-734c22226cd8): Download as a toolbar action over a selection
- **Code:** `src/components/attachments.tsx:80-106`, `branch:src/app/(app)/tasks/[id]/view.tsx:127-131 (section header)`, `branch:src/components/lightbox.tsx:110-112 (single Download)`, `branch:src/app/(app)/tasks/[id]/header.tsx:68-89 (task ⋯ menu items)`
- **Verification:** confirmed. No export path exists. A single menu item that streams a ZIP adds no chrome and serves insurance claims and lender draws. Server-side zipping of large videos needs a streaming zip to stay within function limits.

### G1D-032

**Give each listing photo and its controls a distinct accessible name**

Low · Fix · effort S · `/properties/[id] Rentals editor, photo controls` · Rentals, residents and the public site run one lifecycle

- **Today:** Every listing photo is <img alt=''> with buttons named 'Remove photo', 'Move left' and 'Move right' (edit-listings.tsx:476-503). A screen reader hears eight identical 'Remove photo' buttons with no way to tell them apart.
- **Why:** Removing the wrong photo from a public listing is easy when every control has the same name.
- **Change:** Name each tile 'Photo 3 of 8' ('Cover photo' for the first) and its actions 'Remove photo 3' and 'Move photo 3 earlier'. Announce reorders through a live region ('Photo 3 is now 2 of 8').
- **Desktop, tablet, phone:** Not visual; applies at every size.
- **Reuse:** MediaGrid tile naming (G1D-019).
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:474-509`
- **Verification:** confirmed. Confirmed. Every tile is alt='', and the buttons are 'Remove photo', 'Move left' and 'Move right' (edit-listings.tsx:476-503). The public carousel image is also alt=''; see G1D-V03.

### G1D-033

**Make the listing thumbnail open its photos, and drop the separate photo count**

Low · Design change · effort S · `/properties/[id] Rentals read view` · Rentals, residents and the public site run one lifecycle

- **Today:** Confirmed: an empty gray 56x40 box with no icon for 767 Prospect '1st Front / Lower Front' (shots/verify-G1D/p767--rentals--desktop-light.png), no click handler, and the count shows only for two or more photos (edit-listings.tsx:218-230). The count isn't restated anywhere else on the row.
- **Why:** The thumbnail looks like the way in to the photos but isn't, and the count restates what the viewer shows.
- **Change:** Tapping the thumbnail opens the viewer on that listing's photos. With no photos, the box shows a camera icon and opens the listing editor at Photos. Remove the 'N photos' label; the viewer's counter carries it.
- **Desktop, tablet, phone:** Same row at every size; 44px hit area around the thumbnail on touch.
- **Reuse:** MediaViewer; ReadListings row.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/6f427963-aedd-424a-955f-df4b1c15d32c): The Photo tour card shows a small stack of photos with a '5 photos' count; tapping the card opens the photos, so no separate count line is needed.
  - [Navan](https://mobbin.com/screens/52f2cbbf-7a65-4c51-9143-5ab1f3fa4b4c): The attached image itself is the way into the larger view, plus a 'View receipt' link
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:218-230`
- **Verification:** partly. Making the thumbnail open the photos and giving the empty box a camera icon are both good. Removing the 'N photos' label loses information: the viewer's counter shows only after opening, and the count tells you at a glance whether a listing is ready to publish. Put the count as a small '+7' chip on the thumbnail instead.

### G1D-034

**Label photos posted at Start job and at Mark done as 'At start' and 'At finish'**

Low · New capability · effort M · `/tasks/[id] media and the Review viewer` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** On the branch, photos sent with Mark done go on the contractor's comment, which is posted just before the 'marked this done' status line. So on /tasks/[id] the activity shows them in Zack's comment card right above that line, which gives implicit stage context. Start job takes no photos. The Photos grid at the top and the viewer are still ungrouped. The Review banner's 'N photos' counts every photo the contractor ever posted on the job, not the Mark done set, and doesn't open them.
- **Why:** Before and after is the most common evidence pair in rehab work, and the data to show it already exists.
- **Change:** Label the Mark done comment card 'With Mark done', and label that set 'At finish' in the Photos grid. Make the Review banner's count cover only that set and open the viewer at its first photo. Drop 'At start' unless Start job gains a photo step.
- **Desktop, tablet, phone:** Group labels at 12px muted at every size; on phone 375 the groups stack.
- **Reuse:** MediaGrid group-by on eventId; TaskEvent types on f59e6ad.
- **References:** 
  - [Check](https://mobbin.com/screens/713a6f8e-2a44-416f-96ec-4ac14a45beae): Evidence photos labeled by what they show ('BACK, Scratch') in a strip
  - [ClassDojo](https://mobbin.com/screens/8767e826-c7af-478c-a797-8a02b71f4006): Submission labeled by the activity it answers, reviewed in place
- **Code:** `branch:  (f59e6ad) prisma/schema.prisma:340-341`, `branch: docs/asana-migration-plan.md:415-423`, `branch:src/lib/portal/jobs.ts:131-139 (Mark done posts a comment with the attachments, then sets REVIEW)`, `branch:src/app/(app)/tasks/[id]/page.tsx:150-151,166-170 (media grouped by event in activity)`, `branch:src/app/(app)/tasks/[id]/page.tsx:195 (review photo count = all contractor media)`, `branch:src/app/(app)/tasks/[id]/review-banner.tsx:37-38`, `branch:src/app/(app)/tasks/[id]/view.tsx:126-134 (ungrouped Photos grid)`
- **Verification:** partly. Before and after is the right evidence pair, and eventId exists on f59e6ad. This competes with G1D-012's day headers and G1D-007's Review grouping, and two grouping schemes in one media section is clutter. Recommend stage groups (At start, At finish) on task and job pages and date groups only on the property Photos rollup (G1D-022).

### G1D-035

**Give property documents the same type and size checks task files got**

Low · Fix · effort S · `/properties/[id] Documents uploads` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. /properties/[id] Documents still upload through the property-upload token, which sets a 50 MB cap and no allowedContentTypes. They still go one at a time, and the server records the size and type the browser reports. UPLOAD_RULES and the queue of 3 apply only to task files.
- **Today:** On f59e6ad, task files get a type allowlist, a size check before any bytes move, and server-verified type and size (content-types.ts, limits.ts, tasks/service.ts). Property documents 'upload as they always have' (comment in f59e6ad attachments.tsx): any type, one at a time (:148), with size and type taken from the browser (main attachments.tsx:60-66). The property-upload token sets no allowedContentTypes (route.ts:36).
- **Why:** One media system needs one set of rules. Today a 300 MB file or an unsupported type on a property fails only after a long upload, with a raw message.
- **Change:** Run property documents through the same UPLOAD_RULES (PDF, DOCX, XLSX, CSV, TXT, images) and the same queue with concurrency 3. Reject unsupported types before upload with one line on that tile.
- **Desktop, tablet, phone:** Same at every size; the per-tile message on phone 375 truncates the name, not the message.
- **Reuse:** f59e6ad src/lib/attachments/content-types.ts and limits.ts; useUploadQueue.
- **Code:** `branch:  (f59e6ad) src/components/attachments.tsx:100-114,148`, `src/components/attachments.tsx:55-66`, `src/app/api/blob/[kind]/route.ts:36`, `branch:src/app/api/blob/[kind]/route.ts:77-83 (property-upload: maximumSizeInBytes only)`, `branch:src/components/attachments.tsx:92-106 (property: browser-reported size and type)`, `branch:src/components/attachments.tsx:147-148 (property workers = 1)`, `branch:src/components/attachments.tsx:108-122 (UPLOAD_RULES only for task kind)`
- **Verification:** confirmed. Confirmed. On main the property-upload token has no allowedContentTypes (api/blob route.ts:35). On f59e6ad property documents still upload one at a time with browser-reported type and size (attachments.tsx:92-106, 148).

### G1D-I02

**Collect the renter's insurance policy on the move-in page, not by email**

Low · New capability · effort M · `Public move-in page, Renter's insurance step` · Rentals, residents and the public site run one lifecycle

- **Today:** The insurance step is static text in the timeline above the form ('...any provider works. Email us a copy of your policy.'). It gives no address there; the only mailto is in the page footer. The app has no tenant, lease or unit-document model, so nothing could track a renter's policy even if it were uploaded.
- **Why:** Stripe and Mercury place the required document slot exactly where it's asked for, with a type label and a one-line reason, so the proof arrives attached to the right record.
- **Change:** Inside that step, replace the email sentence with one upload row: 'Upload your policy' (PDF or photo) and an optional 'Policy ends' date. On submit the file goes to the unit's documents as 'Renter's insurance · Ends Aug 1, 2027'. Keep 'or email it to us' as a quiet text link fallback.
- **Desktop, tablet, phone:** Desktop: the row sits inside the step card with the button right-aligned. Tablet: the same. Phone: a full-width button under the text, and the date field drops to its own line.
- **Reuse:** useMediaUploader with allowed file and image; document row anatomy from G1D-013; Badge for the end date.
- **Challenges:** Same code decision as G1D-I01 (residents/moving-in/actions.ts:15, 'No file uploads, no auth').
- **References:** 
  - [Stripe](https://mobbin.com/screens/7f45e993-3db8-47f7-84bc-99c5e55c781a): 'Attach your receipt' with a Required chip and one line on why, placed inside the step that needs it.
  - [Mercury](https://mobbin.com/screens/ede3cc07-012f-4e55-a5c7-7cbe8b7f5907): Attachment row shows the file name with its type ('Receipt') as a sublabel and an Upload action.
  - [Mercury](https://mobbin.com/screens/57ae12ab-0e8b-4cc1-b97e-2542adeeb8c5): Document type chosen at upload, with per-file progress.
- **Code:** `task-management-migration-4c9ddf/src/app/(marketing)/residents/moving-in/page.tsx:52`
- **Verification:** partly. The copy is confirmed in page.tsx:52 and the aria. The recommendation underestimates the work. There's no tenant, lease or unit-document model: the Prisma models have PropertyAttachment per property, units are JSON on Property, and no model has a renter's insurance date. Filing to 'the unit's documents' and catching lapses would need a new model, so effort is L, not M. It also depends on I01's unauthenticated upload path. A cheap fix today is to put the email address in that sentence as a mailto link. If I01 ships, add one optional 'Policy' file to the same form rather than a second upload surface inside the static timeline.

### G1D-I05

**Add 'New task from photo' to the viewer**

Low · New capability · effort M · `Viewer (Lightbox) on the task page; later the property Photos view` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The viewer header has only Download, Delete, Close and Next. /tasks/new is still a page with no photo or attachment field (no photo, attach or upload in tasks/new/*.tsx).
- **Today:** The viewer offers only Download, Delete and Close (lightbox.tsx:110-127). New task is a page (/tasks/new), not a sheet, and it can't take a photo at all, so even a manual 'new task with this photo' isn't possible today.
- **Why:** Linear turns a comment or image into a new issue with the source quoted, and Linear Mobile starts an issue from an image with the property chips above the keyboard. Data entered once should carry forward (Gusto's principles).
- **Change:** Put 'New task from photo' in the viewer's ⋯ menu, which the concept already plans. It opens the normal New task sheet with the photo attached, Property and Unit copied from the source task, focus in an empty title, and a quiet 'From: unit 3 list of issues' link. The source task's activity gains 'Connor made a task from a photo'.
- **Desktop, tablet, phone:** Desktop: a ⋯ menu item that opens the sheet on the right. Tablet: a centered sheet. Phone: a bottom sheet with chips docked above the keyboard.
- **Reuse:** Lightbox, Menu and MenuItem (src/components/menu.tsx), the existing New task sheet, and a new TaskAttachment row pointing at the same blob.
- **References:** 
  - [Linear](https://mobbin.com/screens/8cc34f38-7000-4e12-90ba-a1d0eec67136): New issue created from a comment on an image, with the quote prefilled and the property chips ready.
  - [Linear Mobile](https://mobbin.com/screens/08ac70a0-6f38-4071-9ddc-7a7792d02583): Phone: an image becomes a new issue, with status, priority and assignee chips docked above the keyboard.
- **Code:** `task-management-migration-4c9ddf/src/components/lightbox.tsx:110-127`, `4652abb:src/components/lightbox.tsx:110-127`
- **Verification:** partly. The viewer actions are confirmed as Download, Delete and Close. New task is a full page, not a sheet. It has no photo input (0 file inputs on /tasks/new), so a photo can't be carried into a new task until that page accepts photos. Property prefill already exists through /tasks/new?propertyId=, so retyping is one field. Value is occasional. Across this list, the viewer would gain New task from photo, Share link, Use as property photo and Compare with, plus Send back (G1D-007) and a caption line. Cap the ⋯ menu at two or three items or the viewer gets busy. The Linear references are plausible.

### G1D-I06

**Let a Send back note carry the photo it's about**

Low · New capability · effort M · `Task page Review banner and viewer (migration branch)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. SendBackForm is still one textarea ('What needs another look?') with a Send back button, and it can't reference a photo. On the branch head it also keeps an unsent note as a draft (initial prop), with still no photo. The branch DB has no task in Review, so this was checked in code only.
- **Today:** SendBackForm is one textarea (review-banner.tsx:63-80) and can't reference a photo. This is verified in code only; no sample task was in Review to open.
- **Why:** Linear lets you comment on an image directly, so the note and its evidence stay together. A contractor reading on a phone at the site needs to see which spot, not work it out.
- **Change:** When Send back starts from the viewer (G1D-007), the sheet shows that photo as a 56px thumbnail above the note and posts it with the comment. On the contractor's job page the update reads 'Connor sent this back' with the thumbnail and note. When Send back starts from the banner, the sheet adds 'Attach a photo', which lists the Mark done photos to pick from.
- **Desktop, tablet, phone:** Desktop: thumbnail left of the textarea in the sheet. Tablet: the same. Phone: thumbnail above the textarea, with the Send back button pinned at the bottom.
- **Reuse:** ReviewBanner's SendBackForm, Sheet and a MediaGrid tile; comments already accept attachmentIds (postJobUpdateAction).
- **References:** 
  - [Linear](https://mobbin.com/screens/874d65bf-1c4d-47c8-9a01-5cb67e38084f): A comment anchored on the image itself ('no longer use this one below').
  - [Linear](https://mobbin.com/screens/a50cebb4-6a5f-4e82-bef4-9c44d8cc8b6b): Composer opens on the image, so the note is about that picture.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/tasks/[id]/review-banner.tsx:63-80`, `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/page.tsx (UpdateItem renders attachments under a comment)`, `4652abb:src/app/(app)/tasks/[id]/review-banner.tsx:63-85`, `psql: Task status REVIEW count 0`
- **Verification:** partly. Confirmed in code: SendBackForm is a single textarea, 'What needs another look?', and the note becomes the contractor-visible comment. I couldn't reach a live Review task in the sample data, and the portal isn't live, so sending back is rare today. The viewer half depends on G1D-007 adding Send back to the viewer, which adds to the viewer crowding noted on I05. The banner half ('Attach a photo' picking from the Mark done photos) is the useful part and needs no viewer change. The Linear references are plausible.

### G1D-I07

**Let the listing editor pick from photos already taken at the property**

Low · New capability · effort M · `Property page, Rentals editor ('+ Add photo')` · Rentals, residents and the public site run one lifecycle

- **Today:** '+ Add photo' is a device file input (edit-listings.tsx:517-521). The task evidence is overstated: 3 'Upload photos of after' are open, not 4, and 'Upload all before photos into GDrive' is Done. Listing photos appear to come from photographer packages, not turnover tasks.
- **Why:** Shopify's Select image opens the store's existing files, filterable by where they're used, with an upload zone in the same dialog, so nothing gets uploaded twice. HG's media system will already hold every unit's after photos.
- **Change:** '+ Add photo' opens one picker: 'Upload from device' at the top, then this property's photos newest first, filterable by unit, with checkboxes and a counted 'Add 6 photos' button. Picking makes the public 2048px copy with location data stripped (G1D-027) and leaves the original where it is.
- **Desktop, tablet, phone:** Desktop: a 720px dialog with 5 tiles per row. Tablet: the same dialog with 4 per row. Phone: a full-height sheet with 3 per row, the Add button pinned at the bottom and unit chips scrolling sideways.
- **Reuse:** MediaGrid tiles with a selectable variant, Sheet, filter chips; ListingPhoto rows.
- **References:** 
  - [Shopify](https://mobbin.com/screens/8f381745-7963-4ed2-b53e-a7f17eb75e1d): Select image dialog: existing files with 'Used in' and type filters, plus Add image and drag-and-drop in the same place.
  - [Shopify](https://mobbin.com/screens/150c862e-fb22-463f-a334-9468f88630e3): Phone: the same picker as a sheet, with checkboxes and Save top right.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/properties/[id]/edit-listings.tsx:517-521`, `Local DB task titles: 'Upload photos of after' (4 open), 'upload ALL after photos and break it down by unit', 'Upload all before photos into GDrive'`
- **Verification:** partly. The device-only '+ Add photo' is confirmed on 767 Prospect's Rentals editor (desktop and phone, WebKit). The premise that after photos from turnover tasks feed listings isn't supported by the data. The task list shows listing photos come from a photographer: 'photographer' (x2), 'photos for listing', 'Which photo package?' and 'Email East State and 360 Views for photo packages'. The unit filter would also be empty today (see I08). Worth revisiting once a property Photos view exists. The Shopify references are plausible.

### G1D-I08

**Group a property's photos by unit, with Before and After sets**

Low · New capability · effort M · `Property hub Photos view (Documents tab)` · Contractor jobs and media close the loop

- **Today:** The property page has no photo view (confirmed). But 'a photo's unit comes from its task's Unit' would put almost everything under Building: only 1 of 1,606 property tasks has a unit set. Before and after photos are separate tasks ('Take photos of before', 'Upload photos of after'), not labeled sets.
- **Why:** Airbnb's photo tour groups photos by room, with a cover tile and count per group, and the guest view reads as rooms rather than a pile. For a rehab the real questions are 'what did unit 3 look like before' and 'show me the after'.
- **Change:** In the property Photos view (G1D-022), add a 'By date | By unit' segmented control. By unit shows one cover tile per unit plus 'Building', each with a count ('Unit 3 · 42 photos'). Inside a unit, Before and After sets (from G1D-034's At start and At finish labels) come first, then everything else by day. A photo's unit comes from its task's Unit, and untagged photos fall under Building. 'Break it down by unit' becomes a view instead of a task.
- **Desktop, tablet, phone:** Desktop: 4 cover tiles per row. Tablet: 3. Phone: 2 per row; inside a unit, Before and After are each one row of 4 tiles with +N.
- **Reuse:** The segmented control (the same 'By date | By property' switch as the contractor portal's My jobs), MediaGrid, G1D-034 labels.
- **Challenges:** G1D-012 groups media by day only. This adds a second view and leaves day grouping as the default.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/4d64e5e5-5b71-4229-9ae9-950d0f18e4b8): Photo tour: one cover tile per room with a photo count beneath.
  - [Airbnb](https://mobbin.com/screens/fbf3a86a-e0f9-4c49-88ec-d4b99d527720): Phone: a room strip at the top, then each room's photos under its heading.
- **Code:** `Local DB task titles: 'Upload photos of before', 'Upload photos of after', 'upload ALL after photos and break it down by unit'`
- **Verification:** partly. Grouping by unit is right in principle, and I confirmed the Airbnb fbf3a86a photo tour reference on Mobbin. But the unit source fails on today's data. A By unit view only has value once capture tags a unit, for example a unit chip in the composer or on Mark done. Until then, 'By date' with the task title as each group's label answers 'what did it look like before' without a second segmented control.

### G1D-I09

**Share a set of photos with an adjuster or appraiser through a view-only link**

Low · New capability · effort M · `Viewer and photo selection on the task page and property Photos` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Download in the viewer is still the only export. MediaGrid and Lightbox have no multi-select and no share action, and nothing in src or prisma models a share link.
- **Today:** Single-file Download is the only export (confirmed). The evidence of need is one open task, 'Send photos of roof to Jason/Insurance'. The David Hay task is about an appraisal, not photos. MediaGrid has no multi-select, so 'select photos' is new as well.
- **Why:** Supabase offers Get URL next to Download on every stored file, and Linear's image toolbar copies a link. A link is lighter than a ZIP (G1D-031) for someone who only needs to look.
- **Change:** Select photos, or open one, and choose 'Share link…' in the ⋯ menu. A small sheet reads 'Anyone with the link can view 6 photos until Oct 30' and has a Copy link button and an expiry (7 days by default, or 30). The link opens a plain gallery page with the property address and nothing else (no rent, notes or names), served from the 2048px copies with location data stripped. The task's activity logs 'Connor shared 6 photos · until Oct 30' with Stop sharing.
- **Desktop, tablet, phone:** Desktop: a 400px sheet. Tablet: the same. Phone: a bottom sheet where Copy link hands off to the iOS share sheet.
- **Reuse:** Sheet, Menu, toast ('Link copied'); the public gallery reuses the /rentals photo viewer (G1D-021).
- **References:** 
  - [Supabase](https://mobbin.com/screens/5aca9059-1063-4917-90b5-218110f85887): Get URL sits beside Download in the file panel; sharing is one action, not an export.
  - [Linear](https://mobbin.com/screens/3195591a-7852-4f0f-b87a-347badc540b0): Image toolbar groups expand, download, copy and link actions.
- **Code:** `Local DB task titles: 'Send photos of roof to Jason/Insurance', 'Ping David Hay about appraisal (after finish plumbing)'`, `4652abb:src/components/lightbox.tsx:110-127`, `grep 4652abb:src/components/media-grid.tsx for select or share: none`
- **Verification:** partly. An unauthenticated, expiring gallery of photos from inside tenants' homes needs signed expiring tokens, a revoke path and a new public route. With multi-select also new, effort is L, not M. The Supabase reference is a developer storage console, a weak analog for sharing with an insurance adjuster. Downloading and emailing a few photos covers the occasional case.

### G1D-I10

**Give each photo a one-line caption, written at capture or in the viewer**

Low · New capability · effort M · `Upload tray, viewer and listing photo editor` · Contractor jobs and media close the loop

- **Today:** MediaItem has no caption, and the viewer heading is the filename ('IMG_6117.png'), confirmed at 1280 and 375. But TaskAttachment already stores eventId, 'the comment it was posted with' (schema.prisma), so photos posted with a comment have text the viewer could show today.
- **Why:** Brex asks for a memo on the capture review screen, and Zillow's Edit photo dialog is a caption box beside the photo with arrows to the next one. A caption such as 'Water heater label, unit 3' makes a photo findable and replaces a meaningless filename in the viewer header.
- **Change:** In the viewer, add a one-line 'Add a caption' field under the photo: tap to edit, Enter saves, Esc cancels. Finished tiles in the upload tray take a caption on tap. When a caption exists, the viewer header shows it instead of the filename. Listing photo captions become the public alt text.
- **Desktop, tablet, phone:** Desktop: the caption line sits centered under the photo, max 60ch. Tablet: the same. Phone: the caption sits above the bottom action bar, and editing docks the field above the keyboard.
- **Reuse:** The tap-to-edit inline field pattern from the house rules, Lightbox and MediaUploadTray.
- **References:** 
  - [Brex](https://mobbin.com/screens/590f0b25-00c8-47b4-8a81-51bcdf73d3e1): Capture review: 'Enter a memo' sits above Retake and Keep.
  - [Zillow](https://mobbin.com/screens/a15d3207-198c-45b9-8137-fef606ff29df): Edit photo: a Caption box beside the image with prev and next arrows.
- **Code:** `task-management-migration-4c9ddf/src/components/lightbox.tsx:12-27 (MediaItem has no caption)`, `task-management-migration-4c9ddf/src/app/(app)/properties/[id]/edit-listings.tsx:7 (EditablePhoto = { url, pathname })`
- **Verification:** partly. A lighter fix covers most of it. In the viewer header, show the text of the comment the photo was posted with in place of the filename, and show 'Photo' rather than 'IMG_6117.png' when there's none. Keep an explicit caption only for listing photos, where it becomes public alt text. A caption field on every photo adds a step that a two-person team and contractors rarely fill. The Brex and Zillow references are plausible.

### G1D-I12

**Capture first, file second: a phone 'Photo' action that suggests where it goes**

Low · New capability · effort L · `Staff phone shell: the create button (future labeled bottom bar, D10)` · Create where you are

- **Today:** The uploader needs a taskId (media-uploader.tsx:43-53), confirmed. /tasks/new is a page with no photo input (0 file inputs at 375), and the approved D10 layout names no create button.
- **Why:** Brex's scan screen opens the camera from anywhere, then shows the expense it matched, with 'Select manually' if that's wrong. Linear Mobile starts an issue from an image. Ramp's 15-second expense is the time budget for the most common phone job.
- **Change:** Add 'Photo' to the phone create button's menu. It opens the camera, then a review sheet with the photo, a caption line, and 'Add to' prefilled with a best guess: an open task at the property you last opened, else one of today's tasks, else 'New task at 767 Prospect'. The sheet ends with Retake and Keep. Location is used only if allowed, and only to rank properties by distance.
- **Desktop, tablet, phone:** Phone: camera plus review sheet. Tablet: the same through the create button. Desktop: the create menu shows 'Upload photo' with the same Add to picker and no camera.
- **Reuse:** The create button (D10 phone bar), Sheet, the task picker combobox, useMediaUploader.
- **Challenges:** D10 labeled phone bottom bar: this adds no tab. It lives in the single create button.
- **References:** 
  - [Brex](https://mobbin.com/screens/590f0b25-00c8-47b4-8a81-51bcdf73d3e1): After the shot: the matched record on top with 'Select manually', a memo field, Retake and Keep.
  - [Linear Mobile](https://mobbin.com/screens/08ac70a0-6f38-4071-9ddc-7a7792d02583): An image becomes the start of a new issue, with its fields as chips.
  - [Mercury](https://mobbin.com/screens/4577487c-9cf2-4a2c-9672-c75f3ba39f38): 'Receipts will be automatically matched to the correct card transaction': capture first, matching after.
- **Code:** `task-management-migration-4c9ddf/src/components/media-uploader.tsx:43-53 (taskId required)`
- **Verification:** partly. D10 approves a labeled phone bottom bar but defines no create button, so this would add one; conflicts_with should say so rather than assume one. The best-guess 'Add to' (last-opened property, today's tasks, location ranking) adds logic and a location prompt for a two-person team. A simpler first step is to let New task take photos, which it can't today, so a photo can start a task. 'Add to an existing task' can come later.

### G1D-I13

**Give each property an email address that files attachments into its documents**

Low · New capability · effort L · `Property Documents` · Contractor jobs and media close the loop

- **Today:** Documents is only the dashed upload box, and PropertyAttachment has 0 rows in both local DBs (confirmed). The zero points to documents living in Google Drive ('Get the files for all properties and store them in GDrive', 'upload leases into GDrive'), not to upload being too slow.
- **Why:** Mercury prints 'or email receipts to [email]' under its attachment box, and Attio files email attachments onto the record they concern. Forwarding is the 5-second path from an inbox.
- **Change:** Show one quiet line under the property's documents: 'Forward to [email]' with a Copy button (the address must be on the production DNS zone). Attachments from Connor's or Pieter's address file automatically, named by the email subject and marked 'Emailed by Connor · Oct 3'. Anything from another sender waits in a short review list.
- **Desktop, tablet, phone:** Desktop: the line sits under the list, with Copy on the right. Tablet: the same. Phone: the address truncates in the middle and Copy stays visible.
- **Reuse:** Document rows (G1D-013), the Copy button pattern; new: an inbound email webhook.
- **References:** 
  - [Mercury](https://mobbin.com/screens/aecbbd98-e6f9-4624-8ed4-a173e287cb62): 'or email receipts to [email]' as one line under the attachment box.
  - [Attio](https://mobbin.com/screens/feab3de9-e5a0-48cc-861b-4f0a87289fea): Email attachments appear on the record they belong to, as chips under each email.
- **Code:** `Local DB: select count(*) from "PropertyAttachment" = 0`
- **Verification:** partly. Auto-filing by sender address needs SPF/DKIM verification. Otherwise anyone who spoofs Connor's From address can file into a property's private documents. It also needs inbound mail set up on the production zone, so effort L stands. The Mercury aecbbd98 reference wasn't returned to me, but the same 'or email receipts to ...' pattern is real on Mercury 7eb57749 and a1c0eca6. Given that documents live in Drive, the higher-value question is whether the Documents card should link each property's Drive folder at all. Calibrated to low.

### G1D-I17

**Set a property's photo from any photo in the viewer**

Low · New capability · effort S · `Property header and portfolio card; viewer ⋯ menu` · Contractor jobs and media close the loop

- **Today:** There's no photo on the property header or on /properties (0 img elements in main), and no field for one (confirmed).
- **Why:** Airbnb makes the cover a menu choice on any photo ('Make cover photo') and labels it 'Cover photo' in place, with no separate upload flow. The library's record anatomy puts a photo or icon tile in the header.
- **Change:** In the viewer's ⋯ menu, add 'Use as property photo'. The property header tile and the portfolio card use its 2048px copy, cropped to fit. Until a photo is set, the header shows the line-icon tile rather than an empty box. In the viewer, the chosen photo carries a small 'Property photo' label.
- **Desktop, tablet, phone:** Desktop: a 64px identity tile beside the address, with full-bleed portfolio cards. Tablet: the same. Phone: a 48px tile beside the address, and portfolio rows show a 40px thumbnail.
- **Reuse:** The Lightbox menu, a new Property field (cover attachment id), the portfolio card.
- **Challenges:** property-page-plan.md §4 planned a separately uploaded hero photo. This sources it from photos already in the app instead.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/0c23f780-db8d-4672-a485-1538c60e55ba): Per-photo ⋯ menu with 'Make cover photo'.
  - [Airbnb](https://mobbin.com/screens/0701edf9-3ec2-4c5a-8b92-50c341d40d98): 'Cover photo' label sits on the chosen tile.
- **Code:** `task-management-migration-4c9ddf/docs/property-page-plan.md:143-144 (planned hero photo)`, `grep of prisma/schema.prisma and src/app/(app)/properties: no hero or cover photo field`
- **Verification:** partly. conflicts_with should also name the Imagery house rule ('single-color line icons in the app'); property-page-plan §4 has already argued for an exception. Task photos are mostly interiors of work in progress, so the natural source is a listing photo or one exterior shot; offer 'Use as property photo' on listing photos too. For 11 properties the partners know by address, this is identity polish, not a gap. I confirmed the Airbnb 0701edf9 'Cover photo' reference on Mobbin.

### G1D-I20

**Attach a data-plate photo to each equipment row**

Low · New capability · effort M · `Property page, Units & access, Equipment table` · Contractor jobs and media close the loop

- **Today:** On 767 Prospect the equipment rows read Oven 'Newer' and HVAC 'Old', both with Status 'Unknown' (confirmed). The forecast gap comes from Year being free text. A label photo helps only if someone reads it and types the year.
- **Why:** A photo of the data plate is how an age and model get settled, and it's exactly the capture job a partner does walking a unit. Shopify keeps media inside the record next to the fields it explains, and Jobber puts an image tile with a count right in its form.
- **Change:** Give each equipment row a 32px photo tile in its first column: a camera icon when empty (labeled 'Add label photo' for screen readers), the thumbnail when set. Tapping opens the camera or the viewer. In edit mode, after a label photo is captured, the Year field shows that photo beside it.
- **Desktop, tablet, phone:** Desktop: the tile is the first column of the Equipment table. Tablet: the same, with a 44px touch target. Phone: rows become two-line cards with the tile on the left, and Comments drops.
- **Reuse:** MediaGrid tile, useMediaUploader with a property-scoped kind, Lightbox.
- **References:** 
  - [Shopify](https://mobbin.com/screens/21b032ff-ad77-4a4b-b97d-3d793ce279bd): Media tile and '+' sit inside the record form, next to the fields it documents.
  - [Jobber](https://mobbin.com/screens/4e1a7edb-f8d9-4612-8cf6-94899c4f5046): An inline image tile in a form row, with a count.
- **Code:** `task-management-migration-4c9ddf/src/app/(app)/properties/[id]/edit-units.tsx:237-267`
- **Verification:** partly. An empty camera icon in every row of every unit's equipment table is the same chrome the house rule rejects with 'no edit pencil beside every field'. conflicts_with should name it. Put 'Add label photo' in the row's edit mode and show a thumbnail only once one is set. The more direct fix for the CapEx gap is making Year accept only a 4-digit year and flagging the existing text values. That's a data fix, probably in the property unit's scope. The Shopify and Jobber references are weak analogs for equipment data plates.

### G1D-I21

**Date photos by when they were taken, not when they were uploaded**

Low · New capability · effort S · `MediaGrid day headers, viewer byline, property Photos` · Contractor jobs and media close the loop

- **Today:** The byline shows upload time, and no EXIF handling exists anywhere in src (confirmed). The 8 sample photos are PNGs, which carry no EXIF capture date. HEIC needs an ISOBMFF parser and video creation time needs an MP4 atom parser, so this isn't 'a small parser'.
- **Why:** Mercury keeps 'Date of expense' separate from the submitted and approved times on the record. Evidence needs the moment it happened, and day headers are only honest if they use capture time.
- **Change:** At upload, read DateTimeOriginal from the JPEG or HEIC EXIF in the browser (a small parser, not a full library), and the creation time from video metadata where present. Store it as takenAt, and group and sort by it, falling back to upload time. The viewer byline reads 'Taken Oct 3, 2:14 PM · added by Zack Oct 16'.
- **Desktop, tablet, phone:** The same at every size; on phone the byline shortens to 'Oct 3 · Zack'.
- **Reuse:** readMediaMeta in media-uploader.tsx and a new TaskAttachment column.
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): 'Date of expense' sits apart from the Submitted and Approved timeline: when it happened vs when it was filed.
- **Code:** `task-management-migration-4c9ddf/src/components/media-uploader.tsx:273-300`
- **Verification:** partly. Effort is M, not S: a schema column, a JPEG and HEIC EXIF read, and MP4 metadata. Day grouping (G1D-012) isn't built, so the harm is future. A separate problem exists today: at 375 the viewer byline truncates the date ('Pieter Louw · Oct 16, 20…'). The short 'Oct 16 · Pieter' form on phone is worth doing on its own. The Mercury 'Date of expense' reference is plausible.

### G1D-IV04

**Keep the viewer's can't-preview notice to one line**

Low · Fix · effort S · `Viewer (Lightbox) on the task page, phone` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. 'This photo can't be shown here. Download it to view.' wraps to two lines beside the icon at 375 (text box 359x40, 20px line height) and at 320 (304x40).
- **Today:** At 375, the notice shown when a photo can't load, 'This photo can't be shown here. Download it to view.' (lightbox.tsx:241), wraps to two lines beside its icon.
- **Why:** House copy rule: notices don't wrap at the component's normal width; shorten the words, not the font. This state will be common for imported files that 404 and for HEIC in Chrome.
- **Change:** Shorten it to 'Preview unavailable. Download to view.', which fits on one line at 375 and 320 next to the icon.
- **Desktop, tablet, phone:** Desktop and tablet: one line, centered on the stage. Phone 375 and 320: one line. Nothing drops.
- **Reuse:** Lightbox Stage fallback in src/components/lightbox.tsx (migration branch).
- **Code:** `task-management-migration-4c9ddf/src/components/lightbox.tsx:241`, `4652abb:src/components/lightbox.tsx:241`
- **Verification:** verifier-found

### G1D-V04

**Shorten '+ Add listing' to '+ Listing' so the editor header doesn't wrap at 320**

Low · Fix · effort S · `/properties/[id] Rentals editor header at 320` · The phone is a chosen subset, and touch has no hover

- **Today:** In edit mode at 320 (WebKit, dark), the header row 'Rentals [+ Add listing] [Save] [Cancel]' wraps the first button onto two lines, and the 'Rentals' heading butts against it with no gap (edit-listings.tsx:123-131). The Tasks card on the same page already uses the shorter '+ Task' (page.tsx:171).
- **Why:** House rule: rows of controls never wrap at any width from 320 to 1920. Shorten the label first. The same page already has the short form, so this also makes the two cards consistent.
- **Change:** Label the button '+ Listing', matching '+ Task', and keep a gap between title and actions.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: same row, shorter label. Phone 375 and 320: one line with all three buttons.
- **Reuse:** Button primitive; the '+ Task' label pattern from the property Tasks card.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:123-131`, `src/app/(app)/properties/[id]/page.tsx:171`
- **Verification:** verifier-found
