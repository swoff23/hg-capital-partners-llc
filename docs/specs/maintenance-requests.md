# Resident maintenance requests

> **Partly superseded (Nov 22, 2026):** what sends, the layout, subject words, previews, From names and the morning emails now follow [emails-redesign.md](emails-redesign.md). Where the two disagree, that spec wins.

Residents report repairs from their phone through a link of their own. Each request becomes a task in Needs you, with their words, photos or video, whether we can come in when they're not home and whether there are pets. They follow it on a three-step page (Received, Scheduled, Done) and hear about changes by email, but never see your comments. The goal is to move repair requests out of the group chats and into tracked tasks. It was planned with Connor on Nov 21, 2026, against `bd4ab1e`. He said "build it" the same day, paused it for computer memory, then said "build it" again; it was built on Nov 21. Section 10 lists where the build differs from this plan. The drawings are in [maintenance-requests/](maintenance-requests/).

## 1. Summary

**What's wrong today**

- **Repairs arrive as texts.** Each household has a group chat with Connor and Pieter. A leak, its photos and "when are you coming?" all land there, and none of it is on a task unless someone retypes it.
- **The Residents page promises nothing.** Its Request maintenance tile reads "Soon" (`src/app/(marketing)/residents/page.tsx`), and the roadmap held this item for Connor to say how residents should reach HG Capital (docs/roadmap.md, docs/todo-for-connor.md).

**What changes**

- Every current tenant gets **their own link**. It opens on their unit, already knowing who they are, with no address to type and no password.
- **Report a problem** is one screen: what's wrong, more detail if they want, photos or video, and "Can we fix it if you're not home?" A Yes asks about pets.
- The request **becomes a task** in Needs you, due the day it arrives, and **you both get an email** about it.
- The resident follows it on **three steps**: Received, Scheduled (with the day), Done. They get an email when it's scheduled, when the day changes, when it's done, and when you close it. Your comments, files and contractor notes never reach them.
- They can **add photos or a note** while it's open, and **cancel their own** while it's still Received.
- You **close** a request you won't do with Canceled, as today, plus an optional note they see.
- Emergencies stay in the group chat: the form says **"Emergency? Text us in our group chat."**

## 2. Decisions

| # | Question | Decision | Drawing |
|---|---|---|---|
| 1 | What a request becomes | **A, a task.** One record; it lands in Needs you like the move-in report, and the resident's page reads only its status and date (Connor: "Yes, a task (A)"). Not a Requests inbox you accept into a task (B) | [01](maintenance-requests/01-request-or-task.svg) |
| 2 | How residents get to the form | **A, their own link.** It knows the person and the unit; it stops working after move-out; the Residents page emails it again to the address on file (Connor: "Yes, own link (A)"). Not one public form (B) or a sign-in (C) | [02](maintenance-requests/02-how-they-get-in.svg) |
| 3 | The form's layout | **A, one screen** (Connor: "one screen ... you can go with A all on one screen"). Not three steps (B) or a type picker first (C) | [03](maintenance-requests/03-the-form.svg) |
| 3b | How "Can we let ourselves in?" reads | **A, each choice says what it means**, Yes first: "Yes, let yourselves in / Fastest. You'll see the day." and "No, set a time with me / Can take longer to fix." A Yes asks "Any pets inside?" with an optional "What pets?" line. Neither is picked for them (Connor: "Yes, A"; he asked for the nudge toward Yes and the pets question). **Reworded by Connor after the build:** "Can we fix it if you're not home?", "Yes, you can come in! / The fastest option. We'll let the contractor in" and "No, please coordinate when I'm home / This may take longer due to scheduling", with no line after a No | [04](maintenance-requests/04-letting-us-in.svg), [14](maintenance-requests/14-let-us-in-copy.svg) |
| 4 | Emergencies | **One line under the address: "Emergency? Text us in our group chat."** No office number, no urgent switch, no gas card (Connor: "We don't need anything about emergencies ... they'll text us in our group chat"; then "I like A, but I would probably make it like emergency question mark, text us in our group chat") | [05](maintenance-requests/05-emergencies.svg) |
| 5 | How residents hear about changes | **Email only.** No texts and no new service (Connor: "we're not doing any text as part of this, email only") | [06](maintenance-requests/06-updates.svg) |
| 6 | The request page | **A, three steps**: Received, Scheduled, Done, with a date beside each, and what they sent below. The sent screen shows their photo, "Thanks, Dana!" and "We'll email you when it's scheduled." (Connor: "I like A with the 3 steps") | [07](maintenance-requests/07-request-page.svg) |
| 7 | Closing a request you won't do | **A.** Canceled on a resident's task asks for an optional note they see in place of Done; a resident can cancel their own while it's still Received. Sending many at once is fine (Connor: "keep this MVP ... It's okay if they submit a lot of stuff at once"; then "Yes, A"). Not set reasons (B) | [08](maintenance-requests/08-closing.svg) |
| 8 | Adding more after sending | **B, on the request page only**: "Add photos or a note" while it's open. Emails end "Questions? Text us in our group chat." and take no replies (Connor: "Yes, page only (B)"). Not email replies (A) or nothing (C) | [09](maintenance-requests/09-adding-more.svg) |
| 9 | How you two hear about a new request | **A, an email to both of you**, the task email you already get, for each new request and each addition (Connor: "Yes, both (A)"). Not Needs you only (B) or one owner (C) | [10](maintenance-requests/10-how-you-hear.svg) |
| 10 | How each resident gets their link | **A.** Email link and Copy link in each tenant's sheet on the lease page, plus one "Email request links" send from the Tenants list for launch day (Connor: "Yes, A"). Not one at a time only (B) or automatic (C) | [11](maintenance-requests/11-sending-links.svg) |
| 11 | A repair that still arrives by text | **B, reply with their link** ("Can you send it through your link so we can track it?"). Nothing to build: Copy link covers it (Connor: "Yes, reply (B)"). Logging it for them (A) can come later | [12](maintenance-requests/12-texts-still-come-in.svg) |
| 12 | How a request looks on your task page | **A, the task's own places plus two Details rows**, Pets and Requested by ("Dana · sees status") (Connor: "Yes, A"). Not a "From Dana" card (B) or text in Notes (C) | [13](maintenance-requests/13-on-your-task.svg) |

Approving a drawing approves the copy and the small behaviors drawn in it. Everything in sections 3 to 5 that a drawing shows is decided as drawn.

**Defaults no question settled** (Connor can overrule any of them):

- **Status emails go to the person who sent it.** Anyone else on the lease sees it on their own page but gets no email.
- **A household sees its own lease's requests only**, never a past tenant's. The unit's history stays on your side.
- **The link works until the lease's move-out day passes.** After that it opens a short page: "This ticket has been closed. Questions? Text us in our group chat." A link sent before move-in works from the day it's sent.
- **Reopening a closed or done request sends nothing.** Their page goes back to Received.
- **A resident canceling their own** puts a line in your task email ("Dana canceled the request") and shows "Dana canceled it" in Activity. No email to the resident; the page already says Closed.
- **Bulk Canceled from the Tasks list asks for no note.** Those residents see the blank-note line, "Questions? Text us in our group chat."
- **Their pets answer is filled in on their next request.** Letting us in never is (permission stays with one job, tenants.md section 8).
- **Limits:** What's wrong up to 50 characters (it becomes the title and leads every email subject; a count shows from 35, and the rest goes in Tell us more), Tell us more up to 2,000; photos and videos only (no documents), up to 10 per send, at today's sizes (25 MB a photo, 500 MB a video, `UPLOAD_RULES`); 20 requests a day per link.
- **Send waits for two answers**: What's wrong, and the let-us-in choice (plus Pets after a Yes). Everything else is optional.

## 3. The resident's screens

All resident pages are built for a 375 phone and checked at 320. Tablet and laptop show the same single column, centered, about 480 wide; nothing drops. They use the public site's shell (`src/app/(marketing)/layout.tsx`), not the staff app's, and every page carries the 16px side gutter.

### 3.1 Their home: `/r/<token>`

Drawing: [02, option A](maintenance-requests/02-how-they-get-in.svg).

- "Hi Dana", the address and unit, then **Report a problem** as the primary button.
- **Open** and **Done** lists of their household's requests, each row the request's words and its step with the day ("Scheduled · Tue, Nov 25", "Done · Oct 30"). A closed one sits under Done reading "Closed · Nov 22". A row opens the request page.
- No list yet: just the button. No empty-state paragraph.
- Saving it to the home screen works because the token stays in the path (section 6).

### 3.2 Report a problem: `/r/<token>/new`

Drawings: [03 A](maintenance-requests/03-the-form.svg), [04 A](maintenance-requests/04-letting-us-in.svg), [05 A](maintenance-requests/05-emergencies.svg).

Top to bottom:

1. **Report a problem**, the address and unit.
2. "Emergency? Text us in our group chat." Plain text, one line.
3. **What's wrong?** One line. Placeholder "Kitchen sink leaks".
4. **Tell us more (optional).** A text box.
5. **Photos or video.** Tiles with a + tile; the + opens the phone's own picker (camera or library). A video tile shows its length. Each tile has its remove.
6. **Can we fix it if you're not home?** Two rows, Yes first, as drawn in 04 A, in Connor's words (decision 3b).
7. After a Yes, **Any pets inside?** No / Yes. After Yes, **What pets? (optional)**, one line, placeholder "Cat, don't let her out".
8. **Send request.** Pinned above the keyboard on phones; at the end of the form on tablet and laptop.

Uploads go up while they type, on the app's upload queue, so Send doesn't wait on a 200 MB video. Leaving the page with typing or uploads in progress asks first (the app's leave guard).

### 3.3 After Send

Drawing: [07, After Send](maintenance-requests/07-request-page.svg).

Their first photo (or `SpotArt` `request-sent` when they sent none), **"Thanks, Dana!"**, "We have your request for "Kitchen sink leaks." We'll email you when it's scheduled." and **See your request**. A copy goes to their email (section 5).

### 3.4 The request: `/r/<token>/<requestId>`

Drawing: [07 A](maintenance-requests/07-request-page.svg).

- "‹ My requests", their words as the title (never your edited title), the address and unit.
- Three steps with a date on each reached step and the scheduled day on Scheduled:

| Your task's status | Their page shows |
|---|---|
| Open, Waiting, In progress | Received |
| Scheduled | Scheduled, with the day (`scheduledFor`) |
| Review | Still Scheduled, until you mark it Done |
| Done | Done, with the day |
| Canceled | Closed, with your note in place of Done (blank: "Questions? Text us in our group chat.") |

- **Additional comments** (Connor renamed it from "What you sent"): their words, their photos and videos (theirs only, opening in the app's lightbox), and "You can come in · Pets: a cat" or "Coordinate when I'm home".
- **Add photos or a note** under Additional comments while it's open (section 3.5).
- **Cancel this request**, a text link at the bottom, only while it shows Received (section 3.6).

### 3.5 Adding more

Drawing: [09 B](maintenance-requests/09-adding-more.svg).

**Add photos or a note** opens a bottom sheet on phones and a dialog on tablet and laptop (`FormSheet`): a note box and the same photo picker, then **Add**. It posts to the task (section 4.1) and shows under Additional comments with its date. Only while the request is open; once Done or Closed the button is gone.

### 3.6 Canceling their own

Drawing: [08 A](maintenance-requests/08-closing.svg).

**Cancel this request**, then one confirm (`ConfirmDialog`: "Cancel this request?", **Keep it** / **Cancel request**). The task goes to Canceled with "Dana canceled it" in Activity, and their page shows Closed with no note line.

### 3.7 Lost link: the Residents page

Drawing: [02 A](maintenance-requests/02-how-they-get-in.svg) ("Lost it? The Residents page emails it to the address we have on file").

The Residents page's **Request maintenance** tile drops "Soon" and links to `/residents/maintenance`: one email field and **Email me my link**. Whatever is typed, the answer is the same: "If that email is on file, your link is on its way." A match on a current tenant emails their live link (minting one if they have none). Per-IP and daily caps as on the move-in form.

## 4. Your side

### 4.1 The task

Drawing: [13 A](maintenance-requests/13-on-your-task.svg).

What the form fills in, through `createTask`:

| Form | Task |
|---|---|
| What's wrong? | Title |
| Tell us more | Notes |
| Photos and video | Photos and videos, Shared, so the contractor on the job sees them |
| Address and unit | Property and Unit |
| Yes, you can come in | Permission to enter on (`entryPermittedAt`) |
| No, please coordinate when I'm home | Permission to enter off (Tenant only) |
| Arrival | Due today, unassigned, Open, like the move-in report |

Details gets two rows, after Permission to enter:

- **Pets**: "Yes, a cat" (or "Yes"), only after a Yes.
- **Requested by**: "Dana · sees status". Dana opens the lease page.

Below 1024 they join the chips under the title, as Details does today. Activity opens with "Dana (resident) sent this request". An addition is an Activity line, "Dana (resident) added a note and 2 photos", unread for you, with its photos Shared to the contractor. Edit the title and notes freely: the resident's page keeps the words they sent.

### 4.2 Closing with a note

Drawing: [08 A](maintenance-requests/08-closing.svg).

Picking Canceled on a task that came from a resident opens **Close Dana's request?** with **Note for Dana (optional)** (placeholder "Same as your other request."), **Keep open** and **Close request**. Centered on laptop and tablet, a bottom sheet on phones. Other tasks cancel as today. The note is saved with the request and shows on their page; reopening clears nothing, and a later Canceled asks again.

### 4.3 Your emails

Drawing: [10 A](maintenance-requests/10-how-you-hear.svg).

Both partners get the task email they get for contractor updates: **New request: Kitchen sink leaks**, Dana and the unit, their words, photo thumbnails, the let-us-in and pets answers, and **Open the task**. An addition or a resident's cancel is a line in the same email, bundled as today.

### 4.4 Sending links: the tenant sheet

Drawing: [11 A](maintenance-requests/11-sending-links.svg).

A tenant's sheet on the lease page gets a **Maintenance request link** part: **Email link** (only with an email on file), **Copy link**, and "Emailed Nov 21 · used Nov 22" on the right. Its ⋯ holds **Turn off link** and **Send a new link** (the old one stops). Only tenants on a current lease have it.

### 4.5 Launch day: the Tenants list

Drawing: [11 A](maintenance-requests/11-sending-links.svg).

An **Email request links** button on the Tenants list opens a confirm: "51 tenants get their own link. 9 have no email. Copy theirs from their lease page." **Not now** / **Email 51**. It covers current tenants with an email and skips anyone already emailed one. The button stays for later use; once everyone has one, the confirm says so and offers nothing to send.

### 4.6 The contractor's job page

Drawing: [04](maintenance-requests/04-letting-us-in.svg) (footer). Beside Access on the job page (`src/app/(portal)/p/jobs/[id]/_components/job-details.tsx`): "Pets inside. Keep doors shut." with the resident's note when there is one. Only on a job whose resident said Yes to pets.

## 5. Emails to residents

All in the resident layout (`lib/residents/email-layout.ts`; Connor picked [15 B](maintenance-requests/15-email-structure.svg) after the build): the contractor job email's frame, with "What's new" and a headline, their three steps under it (Closed ends the row), one line, the full-width button, then **Your request** as labeled rows (Entry, Pets after a Yes, Comments), and "Questions? Text us in our group chat." at the foot. Replies aren't read; the foot says where to go instead.

| When | Subject | Body |
|---|---|---|
| You send their link | Your maintenance request link | Headline "Hi Dana, here's your maintenance request link", then "From now on, send repairs for 56 Tamarack St · Upper here. You'll see when each one is scheduled and done." and "Save it to your home screen." **Report a problem**. No steps or request rows |
| They send a request | Your request: Kitchen sink leaks | Headline "Thanks, Dana. We got your request", Received the current step, then "We'll email you when it's scheduled." **See your request** |
| It's scheduled | Scheduled for Wed, Nov 25: Kitchen sink leaks | Headline "Scheduled for Wed, Nov 25", Scheduled the current step, then "We'll let the contractor in, since you said that's okay." or "We'll coordinate a time when you're home." **See your request** |
| The day changes | Moved to Fri, Nov 27: Kitchen sink leaks | Headline "Moved to Fri, Nov 27", the same line |
| It's done | Done: Kitchen sink leaks | Headline "Done", all three steps reached. **See your request** |
| You close it | Closed: Kitchen sink leaks | Headline "Closed", the row ending at Closed, and your note as its line when you wrote one |

They go through the notification outbox so a quick change and its undo send nothing, and two changes minutes apart send one email.

## 6. Data and security

- **New `ResidentLink`**: `tokenHash` (unique), `tenantId`, `leaseId`, `emailedAt`, `lastUsedAt`, `revokedAt`, `createdAt`. Tokens from `newToken()`, stored as `hashToken()` (`src/lib/portal/tokens.ts`), as job links are. One live link per tenant per lease.
- **New `ResidentRequest`**, one per task (`taskId` unique): `leaseId`, `tenantId`, `whatsWrong`, `details`, `letUsIn`, `pets`, `petsNote`, `closedNote`, `createdAt`. It keeps the resident's own words for their page and the answers the task has no field for.
- **Extended**: `EventSource` gains `RESIDENT`; the actor principal gains `{ kind: "resident"; tenantId; label }` beside staff, contractor, system and asana (`src/lib/tasks/core.ts`); `TaskAttachment` gains `uploadedByTenantId` (set null on delete, at most one uploader); `NotificationOutbox` gains `recipientTenantId`, with the CHECK still allowing exactly one recipient. Resident uploads are Shared with no `audienceContactId`, which `visibleFile` (`src/lib/portal/queries.ts`) already shows to any contractor on the job.
- **Routes**: `/r/[token]`, `/r/[token]/new`, `/r/[token]/[requestId]`, outside the proxy's matcher like the public site. The token stays in the path so a home-screen save keeps working. The pages send `Referrer-Policy: no-referrer` and `noindex`. Every page and action resolves the token to a live link on a current lease before doing anything, and a request id must belong to that lease.
- **Uploads**: a new `resident-request-upload` kind (`src/lib/attachments/upload-kinds.ts`) whose token route checks the resident link owns the task, images and video only.
- **RLS** on both new tables (README, Rules of the road).
- **The public writes** (submit, add, cancel, email me my link) join the auth-guard test's list of unauthenticated actions with their caps (`src/lib/auth-guard.test.ts`).
- **Device check**: `/r/[token]` needs a sample in `tests/devices/routes.ts`. Tokens are hashed, so the device run mints a link for the first current tenant at setup and passes it in.

## 7. Reuse check

| | What | From |
|---|---|---|
| Reused | A public submission that becomes a task: `createTask`, due today, unassigned, rate limits, a copy to the submitter | `src/app/(marketing)/residents/moving-in/actions.ts` |
| Reused | Token minting and hashing | `src/lib/portal/tokens.ts`, `src/lib/portal/job-links.ts` |
| Reused | Photo and video picking, the upload queue, thumbnails and posters, sizes | `src/components/media-uploader.tsx` `useMediaUploader`, docs/specs/uploads-photos.md, `src/lib/attachments/content-types.ts` |
| Reused | Permission to enter and its lockbox rule | `Task.entryPermittedAt`, docs/specs/tenants.md section 8 |
| Reused | Partner task emails, bundling and undo-drop | `src/lib/notifications/outbox.ts`, `content.ts`, `enqueue` in `src/lib/tasks/core.ts` |
| Reused | The contractor job email's parts (letterhead, label, button, fact rows) | `src/lib/email/render.ts` (exported for `lib/residents/email-layout.ts`), `src/lib/email/send.ts` |
| Reused | Dialogs, sheets and menus | `ConfirmDialog`, `FormSheet`, `Menu` (docs/components.md) |
| Reused | Sent screen pattern | the move-in thank-you, the Mark done payoff, `SpotArt` (docs/components.md, Sent screen) |
| Reused | The step marker and its hairline | `ActivityTimeline`'s marker column (`src/components/activity-timeline.tsx`) |
| Extended | Task Details rail: Pets and Requested by rows | `src/app/(app)/tasks/[id]/fields.tsx` |
| Extended | Canceled on a resident's task asks for a note | `src/app/(app)/tasks/[id]/status-control.tsx` |
| Extended | Tenant sheet: Maintenance request link part | `src/app/(app)/tenants/[id]/tenant-sheet.tsx` |
| Extended | Tenants list: Email request links | `src/app/(app)/tenants/(list)` |
| Extended | Job page: the Pets line beside Access | `src/app/(portal)/p/jobs/[id]/_components/job-details.tsx` |
| Extended | Residents page tile now links | `src/app/(marketing)/residents/page.tsx` |
| Extended | Outbox, attachments, event source, actor principal | section 6 |
| New | `ResidentLink` and `ResidentRequest` tables | section 6 |
| New | The `/r` pages: home, form, request, ended link | section 3 |
| New | `/residents/maintenance`: Email me my link | section 3.7 |
| New | A radio group for the let-us-in rows, from shadcn's aria registry (`npx shadcn@4.23.0 add`, the way docs/components.md says), with a row in docs/components.md | registry item |

References behind the new screens: Thumbtack's request with a photo ([Mobbin](https://mobbin.com/flows/43d0a42f-d39c-4f9b-a907-b23bf78ebd4e)), Jobber's request ([Mobbin](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7), also cited in docs/uiux-review/journeys.md), IKEA's order tracker for the three steps ([Mobbin](https://mobbin.com/screens/423d9b74-1ffb-486f-b8ea-ca5c2ddc4481)), and Forest's damage report for the one-screen form ([Mobbin](https://mobbin.com/flows/583931fc-466d-4805-a858-7b5d04b4882b)).

## 8. Build

Four steps, each landing on its own:

1. **Links.** The migration, `ResidentLink`, the tenant sheet's Maintenance request link, the Tenants list's launch send, the link email, `/residents/maintenance` and the ended-link page.
2. **The resident's pages.** Home, the form with uploads, the sent screen, the request page, adding more and canceling their own. Submitting creates the task.
3. **Your side.** The Details rows, Activity lines, the close dialog with its note, your new-request emails and the job page's Pets line.
4. **Their emails.** The request copy and the scheduled, moved, done and closed emails through the outbox.

Then `npm run check` and the device check in light and dark, with every new sheet, dialog and state opened at 375 and 320.

About 8 to 12 hours of agent time across the four steps.

**Needs from Connor:** On launch day, press **Email request links** and tell each group chat that repairs go through the link from now on.

## 9. Not in this round

- **Texts** of any kind (Connor, question 5).
- **Logging a request for a resident** (question 11, A). Later, if someone won't switch.
- **Replies by email** from residents (question 8, A).
- **Types or trades** on the form (question 3, C).
- **An urgent switch** or an emergency card (question 4).
- **Sending links automatically** to new tenants (question 10, C).
- **Close reasons** (question 7, B).

## 10. As built (Nov 21)

What the build does differently from sections 3 to 8, and why. Nothing here changes what a resident or a partner sees in a drawing.

- **Resident emails come from a watcher, not the outbox.** `lib/residents/updates.ts` runs inside the per-minute `/api/cron/notifications`. It compares each request's step and day with the last email (`ResidentRequest.notifiedStep`, `notifiedDay`) once the task has been quiet for three minutes, the task emails' bundling window. A change put back meanwhile sends nothing, and two changes a minute apart send one. It needs no hook in the task code (the contractor scheduled-day branch rewrites those paths), so `NotificationOutbox` has no tenant recipient.
- **No resident principal or event source.** A resident's writes use a system principal labeled "Dana Lee (resident)". The CREATED line carries `data.request`, which Activity reads as "sent this request". Their updates carry `data.resident` (and `data.first` on the photos sent with the request), which is how their page finds only what the household sent.
- **Uploads wait in `ResidentUpload` until Send.** A resident picks photos before the request exists, so files go to `residents/<linkId>/(orig|thumb|poster)/` through a new `resident-upload` kind, are checked with `head()` by the record step, and attach to the task on Send. The task's file rows point at them where they are; the file route doesn't need a task folder.
- **The resident's link is their upload queue's owner** (`resident:<token>`, `queue-owner.ts residentScope`). The token route and the record step read the link back from it, so the upload engine needed no change.
- **Their files open through `/api/files/resident/<id>?r=<token>` and `/api/files/resident-upload/<id>?r=<token>`**: the household's own files only.
- **Canceled asks for the note in the status menu's own follow-up** (`status-control.tsx CloseRequestForm`), the way Waiting asks its reason: a popover with a mouse, a sheet on a phone. The drawing showed a centered dialog; this is the app's existing way to ask a question on a status pick.
- **Send a new link emails the new link** when there's an email on file (the label says Send). Without one it only makes it, and the toast says to copy it.
- **The first stock shadcn file:** `components/ui/radio-group.tsx`, recorded in the snapshot, with a row in docs/components.md.
- **The home reads the app's way:** "118 Congress St. · 2nd Floor" (`tenants/status.ts homeLabel`).
- **Device check:** `tests/devices/setup.ts` keeps a fixture link (`devicecheckresidentlink`) live under the run's own secret, and an open request on its lease.

After a code review on Nov 21:

- **In progress and Review stay Scheduled** when the job has a day (`lib/residents/steps.ts stepOf`), so a contractor's Start never sends the resident back to Received. Without a day they read Received.
- **A resident can cancel only while it's Open or Waiting** (`residentMayCancel`): a job a contractor started or finished is staff's to close. A cancel that loses a race says "We've started on it, so text us in our group chat to cancel." and never shows staff names.
- **The link lasts through the move-out day** and ends the day after (`linkLeaseEnded`).
- **Turn off link sticks.** Update emails use only a live link (with none, the button reads "Get your link" and opens the Residents page), and the tenant sheet shows "Off" instead of making a new one. Copy link, Email link, Send a new link and the resident's own Email me my link still make one.
- **The watcher** looks at every changed request, keeps a 10-second budget inside the cron's minute, spaces sends 600 ms apart for Resend, sends an idempotency key, records a refused address instead of retrying it forever, remembers the last day it emailed (Scheduled again on that day sends nothing), and clears the last close when a request reopens.
- **60 uploads a day per link**, checked by the token route and the record step, so a leaked link can't fill the store. An upload is attached to one request only.
- **The launch-day send is spaced the same way**, and the Tenants list allows it two minutes.
- **Email me my link answers before it sends**, so its timing never says whether an address is on file.
- **The new-request form and each request's Add use their own upload queue keys.**
- **The partners' New request line carries the resident's words and answers** ("sent this request with 2 photos: "…" · Can come in · Pets: a cat").

**Not proven yet:** a real photo or video upload from a phone (the local check used the shared Blob store's settings, so no test files were uploaded), and real emails through Resend (local runs print them). Both work the same way as the contractor's job page and the move-in copy.
