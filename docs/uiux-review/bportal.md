# Branch: contractor portal and contractor sign-in

Part of the [UI/UX review](README.md). 33 findings: 0 critical, 3 high, 19 medium, 11 low.

## How it should work

The portal should feel like a well-briefed foreman's clipboard. One page tells Zack where to be, how to get in and what done looks like, and it confirms that every tap landed. It builds on the approved one-scroll job page, the bottom bar and Open | Done, and makes three things first-class: state, signal and proof.

My jobs opens with its answer, the way Jobber's home does: 'Hi Zack', then '2 open jobs. Next: Cabinet install, Mon' (https://mobbin.com/screens/c3fc8f9e-52c4-465b-a55c-b7ac5eeec9a8). Cards are small versions of Airbnb's trip card. Each has a 16px title, the street and unit, one status chip in a fixed corner, and the 'new' pill top right (https://mobbin.com/screens/bd35553c-9732-4fa3-b7c8-50c5a00eee73). A job waiting on HG never wears red.

When the next move isn't Zack's, the job page leads with a state card. Either the job was sent back with Connor's note, or it says 'Sent for review Tue 3:40 PM. You'll get an email when it's approved' (Mercury, https://mobbin.com/screens/ec7b66ef-59c2-495b-9872-7f17f40c5c52, and Shopee, https://mobbin.com/screens/e4f6212f-3a05-49bc-894d-4ff79d441ae9).

Getting in is one block: a two-line address, a full-width Directions button and the lockbox code right under it (Jobber, https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42; Airbnb, https://mobbin.com/screens/5f789af0-a9ed-4c5e-aca3-ae5026d47ba6). The checklist reuses the staff round checks and progress bar (Things 3, https://mobbin.com/screens/18b05379-2af1-41ab-afef-0ca4870933c1). Updates mark what's new with a divider (Telegram, https://mobbin.com/screens/6324eae4-b36d-474a-bb1f-929343ae7b33) and end in the staff composer shell: camera, autosizing text, inline Send and a saved draft (Linear Mobile, https://mobbin.com/screens/2cb5e160-24a8-4b37-8ed3-980642a88a5d).

Nothing a contractor does is ever lost:
- A dead zone turns into an inline 'Didn't send. Retry' (OpenPhone, https://mobbin.com/screens/fd44cd6d-3bf9-4be7-bae2-f6e4b25cb27d), never a crash page.
- Photos post as soon as they finish uploading, and a pill shows them going up (Roku, https://mobbin.com/screens/a0850ac5-0fa4-45cf-b7e6-e93cf86b8cbf).

Mark done becomes a short summary of the photos, the checklist count, the note and who it goes to (DoorDash Dasher, https://mobbin.com/screens/ad3159d1-75e2-4cd3-a495-6a645d158838). It ends on the property photo, what happens next and 'Next job' (Noom, https://mobbin.com/screens/d4bdf747-080e-4d76-ba77-77ef317d1fb7).

Sign-in stays short. The email is kept after an error, and the password field has an eye toggle (Shopify, https://mobbin.com/screens/50eb7f20-161a-4a0e-9c7f-a8e24f282ccd). The first-password page is one field with rules that tick as you type (Rocket Money, https://mobbin.com/screens/c0ba7943-75bb-4fa4-842e-f1f92193a2c0). Contractor links bring people back to the job they tapped.

<details><summary>What the reviewer covered</summary>

Branch claude/task-management-migration-4c9ddf (4652abb) at http://localhost:3300, code read from branch-src. Screenshots in shots/BPORTAL.

Phone first, in WebKit at mobile 375 and narrow 320, light theme:
- /login, plus ?error=bad, ?error=locked and ?notice=reset.
- /login/forgot, its ?sent=1 state, and a blocked submit.
- /login/reset with no token and with a bad token.
- /p/welcome/password (session portal-welcome), plus ?error=short, mismatch and wrong-current.
- /p (session portal): Open and Done tabs, By date and By property, the empty Done state, ?saved=1, and the account menu.
- /p/jobs/cmvkik0ht0003jpg7nflnvoun: default view and full page; the Mark done sheet empty, with a note, and submitted (blocked); a checklist tick (blocked); a composer Send (blocked); two injected photos that failed to upload, in the composer and in the Mark done sheet.
- /p/jobs/<bad id>: the not-found page.

Tablet 768, desktop 1280 and wide 1920 in Chromium: /p and the job page, the Mark done sheet, and the Copy and Lockbox toasts. Dark theme in WebKit at 375: /p and the job page.

Redirects:
- Signed out, /p, /p/jobs/[id] and /p/welcome/password all go to /login.
- A welcome session on /p, the job page or /login stays on the password page.
- A portal session on /tasks goes to /p, and on / it gets the public home page.
- A staff session on /p goes to /.

I cross-checked real contractor names in the staff /contractors directory.

What I couldn't reach (the sample contractor has only one job, which is In progress, and writes are blocked), so these were reviewed from code only:
- The Start job, Scheduled, Waiting, Review, sent-back, Done and Canceled states.
- The 'N new' badge.
- The media grid and lightbox with real photos.
- The Mark done payoff screen.
- A live reset-token flow.
- A real iOS keyboard against the fixed bar.
- Clipboard success: headless WebKit denied it, so the 'Couldn't copy' toasts in the shots come from the harness, not a bug.

I used 18 Mobbin searches (iOS and web) and cite only screens they returned.

</details>

## Findings

### BPORTAL-004

**Leaving the job page mid-upload silently cancels every photo**

High · Fix · effort M · `/p/jobs/[id] uploads` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Partly fixed at 9f74ea1: the beforeunload guard on a reload or closed tab exists, but it landed earlier in 4cf099d. 9f74ea1 only moved it into a reusable useLeaveWarning hook, with no change in behaviour for uploads still going up. Still open: BackLink and in-app back still unmount the uploader and abort every upload without a prompt, there is no 'Uploading 2 of 5' pill on To do or Scheduled jobs, and the uploader isn't lifted into the portal layout. The BackLink sheet and the pill are design calls for Connor.
- **Today:** Leaving the job page (BackLink in the top header, or browser back) unmounts the uploader and aborts every in-flight upload with no prompt and no message afterwards. While uploads run, the tray scrolls into view and, on an In progress job, the bar's Mark done reads 'Finishing N uploads…'. On a To do or Scheduled job the bar shows no upload state.
- **Why:** Contractors pick a batch of photos and move on. Video uploads take minutes on LTE. Silent loss defeats the photo-first design.
- **Change:** While uploads are pending:
- The bar's left button becomes a progress pill, 'Uploading 2 of 5'.
- BackLink opens a Sheet: '2 photos are still uploading. Leave anyway?', with 'Keep uploading' as the primary.
- A beforeunload handler guards closing the tab.
Next, lift the uploader into the portal layout so moving within /p keeps uploading, with a slim 'Uploading 2 photos' bar at the top.
- **Desktop, tablet, phone:** Phone and tablet: the pill replaces 'Add photo/video' in the bar. Desktop: the same pill in the header action area. Nothing drops.
- **Reuse:** src/components/media-uploader.tsx (expose pending at layout level), src/components/back-link.tsx (add a guard prop), src/components/sheet.tsx for the confirm.
- **References:** 
  - [Roku](https://mobbin.com/screens/a0850ac5-0fa4-45cf-b7e6-e93cf86b8cbf): 'You may leave this screen. Photos will continue uploading.'
  - [Bumble](https://mobbin.com/screens/24f3346d-24c7-4993-93fa-513aa79ffeef): A top banner, 'Uploading photo 2/2', with a progress bar that stays visible.
  - [Yubo](https://mobbin.com/screens/1f89a696-759c-436d-bd2b-8f4b90580d0e): An 'Uploading photos 1/1' strip above the content.
  - [Proton](https://mobbin.com/screens/12f6528d-e78a-4540-9087-784c0baa9172): Persistent upload panel with All, Active, Completed, Failed and per-file rows
  - [Instagram](https://mobbin.com/screens/87195638-f604-48bc-b5fb-3a1691ec6895): Small persistent 'uploading' pill with progress, visible while you move on
  - [PandaDoc](https://mobbin.com/screens/6e7783c1-2ce2-4ba2-832d-bab89ec45f67): 'Keep this window open' with per-file percentages during a bulk upload
- **Code:** `branch: src/components/media-uploader.tsx:229-239`, `branch: src/app/(portal)/p/jobs/[id]/page.tsx:46`, `src/components/attachments.tsx:53-75`, `node_modules/@vercel/blob/dist/client.d.ts:26,63`, `branch:  (f59e6ad) src/lib/attachments/content-types.ts:34`, `branch:  (f59e6ad) src/components/attachments.tsx:120`, `branch: docs/asana-migration-plan.md:28,260,512`, `branch: src/components/media-uploader.tsx:88,141-149,229-239`, `branch: src/lib/attachments/content-types.ts:34`, `branch: src/lib/portal/job-view.ts:246-248`, `grep: no beforeunload, wakeLock, indexedDB or document-level dragover under branch-src/src`
- **Also found as:** G1D-006 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** partly. The core is confirmed: the unmount cleanup in media-uploader.tsx:229-239 aborts every in-flight upload, and there is no beforeunload guard or leave prompt. Some details are wrong. BackLink is in the sticky header at the top, not near the bar. On an In progress job the bar's main button reads 'Finishing N uploads…' while files go up (job-actions.tsx:189-190). The tray also scrolls into view when uploads start (job-actions.tsx:86-93). Silent loss on leaving still deserves high.

### BPORTAL-008

**First sign-in asks for three masked passwords and wipes them on every error**

High · Design change · effort M · `/p/welcome/password (first sign-in)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The welcome page asks for Starting password, New password and New password again, all masked and with no reveal. The browser enforces the 10-character minimum before submitting. Mismatch, simple, email, same and wrong-current errors redirect with ?error= and clear all three fields.
- **Why:** This is the contractor's first two minutes with HG, on a phone, maybe with work gloves just off. Typing three 10-plus character passwords blind and losing them on each mistake is the likeliest place for the Oct 29 invite to stall.
- **Change:** Use one 'New password' field with an eye toggle. Under it, a live rule list ('10 or more characters', 'Not your email') that ticks as they type. No confirm field; the reveal replaces it. Skip 'Starting password' when the session is under 15 minutes old, since sign-in just verified it, and ask for it only on an older session. Validate on the client before submitting, so a mistake never clears the form. Apply the same field to /login/reset.
- **Desktop, tablet, phone:** Phone 375 and 320: one field plus 2 rule lines fit above the fold with the button. Tablet and desktop: the same 320px-wide column.
- **Reuse:** The checkNewPassword rules in src/lib/portal/credentials.ts run client-side too (the file is pure). Extend authInputClass in src/app/login/_components/auth-frame.tsx with a reveal button slot.
- **Challenges:** Approved small screen 1 (shared sign-in with a first-password page): this removes two of its three fields. Question for Connor.
- **References:** 
  - [Rocket Money](https://mobbin.com/screens/c0ba7943-75bb-4fa4-842e-f1f92193a2c0): One password field with an eye and a live checklist of rules.
  - [Origin](https://mobbin.com/screens/095f3830-331d-454f-89fd-e94566be0641): Create your password: one field, a reveal, and rules that tick inline.
  - [Binance](https://mobbin.com/screens/8b0dc4dd-5651-42f0-883e-90f5aa20c9c3): A single field with clear and reveal buttons, rules below, no confirm field.
  - [Vrbo](https://mobbin.com/screens/0f2d5cd2-5f94-427d-b8e9-7b5a0ee651d6): "Create a password": one field with an eye toggle and one button.
  - [Cal.com](https://mobbin.com/screens/fd16d9ca-0d86-4d60-9434-7ffbb6a8a0b4): Password rules listed under the field with green checks as each is met, plus an eye toggle.
  - [Mercury](https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7): Labeled fields, a reveal button and one primary action in a compact card.
- **Code:** `branch: src/app/(portal)/p/welcome/password/page.tsx:24-63`, `branch: src/app/(portal)/p/actions.ts:16-27`, `branch: src/lib/portal/credentials.ts:32-48`, `branch: src/lib/portal/accounts.ts:263-276`, `src/app/(portal)/p/welcome/password/page.tsx:24-63`, `src/app/(portal)/p/actions.ts:16-28`, `src/lib/portal/accounts.ts:258-269 (current password checked, failure counted)`, `src/app/login/page.tsx`, `branch: docs/asana-migration-plan.md:75`, `branch: docs/asana-migration-plan.md:185`, `branch: docs/asana-migration-plan.md:474`, `branch src/app/(portal)/p/welcome/password/page.tsx:15-66`, `branch src/app/(portal)/p/actions.ts:16-19`
- **Also found as:** G1A-003 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve), PUBLIC-I12 (Login and the public site)
- **Verification:** partly. Confirmed on :3300: the page asks for three masked fields (verify-BPORTAL/welcome--mobile-light-webkit.png), and errors redirect with ?error=, which empties the form (p/actions.ts:16-27). One correction: both new-password inputs carry minLength=10, so the browser blocks the 10-character rule before submitting. Only mismatch, 'too simple', 'your email', 'same' and a wrong starting password cost a round trip. Re-entering the starting password seconds after sign-in is the clearest waste. The conflict with approved small screen 1 is named correctly.

### BPORTAL-013

**Sign-in forms have no pending state, and a failed submit shows a white framework page**

High · Fix · effort S · `/login, /login/forgot, /login/reset, /p/welcome/password` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: Sign in, Email me a link and both Save password buttons now use AuthSubmit (disabled, with 'Signing in…', 'Sending…' and 'Saving…'), and failures on /login, /login/forgot, /login/reset and /p/welcome/password now show AuthCrash inside the sign-in frame instead of Next's white page. Still open: the Sign out button on /p/welcome/password is still a plain button with no pending state, which is a small code fix. The migration session holds the Sign out pending label as a copy question for Connor, recommending to leave it.
- **Today:** Sign in, Email me a link, Save password and Sign out are plain form buttons with no pending state. On a slow connection a tap does nothing visible, which invites a second tap. A submit that fails, as on the forgot page in the shot, lands on Next's default white 'This page couldn't load' with black buttons, outside the dark sign-in frame. There is no error.tsx under app/login.
- **Why:** Sign-in is the first impression for every contractor on Oct 29, often on LTE. A dead button and an off-brand crash page read as broken.
- **Change:** Add a small AuthSubmit button that uses useFormStatus: disabled, with labels 'Signing in…', 'Sending…' and 'Saving…'. Add src/app/login/error.tsx rendered inside AuthFrame: 'Couldn't reach HG. Check your signal and try again.' with a Try again button.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** authButtonClass and AuthFrame in src/app/login/_components/auth-frame.tsx.
- **References:** 
  - [Oura](https://mobbin.com/screens/9dbf6e35-9643-449f-9d0f-c89cc6248a49): 'Can't load chat. Wait a moment and try again.' in the product's own look.
  - [Stripe](https://mobbin.com/screens/986ec6f2-e1fd-44a0-b8a2-bdd48a4f0089): Primary button dims with an inline spinner while verifying.
- **Code:** `branch: src/app/login/page.tsx:52-54`, `branch: src/app/login/forgot/page.tsx:38-40`, `branch: src/app/(portal)/p/welcome/password/page.tsx:60-69`, `src/app/login/page.tsx:54-59`, `src/lib/login-throttle.ts:33-36`, `branch src/app/login/page.tsx:52-54`, `branch src/app/login/actions.ts:35-46`, `branch src/app/login/forgot/page.tsx:38-40`, `src/app/login/page.tsx:36-60`, `branch src/app/login/page.tsx:32-55`, `branch src/app/login/forgot/page.tsx:27-41`
- **Also found as:** PUBLIC-018 (Login and the public site)
- **Verification:** confirmed. Confirmed. The plain submit buttons have no useFormStatus pending state, and the forgot-page submit with the network down lands on the white framework page (shots/BPORTAL/forgot-submit--after). It shares a root cause with BPORTAL-001 (no error boundary outside (app) and (marketing)) but covers a different surface. One root error.tsx plus an AuthFrame-styled login boundary covers both.

### BPORTAL-003

**Photos held for 'Send' are never posted, and the partners never get an email about them**

Medium · Fix · effort M · `/p/jobs/[id] composer and Mark done sheet` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: photos still held when the contractor moves to another page in the app now post as their own update, except ones a Mark done is still sending. The browser asks before a reload or a closed tab while photos are held, but iOS Safari never asks. addComment now refuses a files-only post whose files another post already took. Still open: photos are still held while the composer has text, the 'N uploads ready to send' state is still there, closing the Mark done sheet still posts nothing, and on iOS a reload or closed tab still loses the notification. Whether photos post as soon as they upload, and whether closing the sheet posts them, is Connor's call.
- **Today:** Photos picked while the composer has text, or added in the Mark done sheet and then closed without finishing, are recorded as Shared with no event or email. The composer labels them 'N uploads ready to send' next to an enabled Send. They are lost to notification only when the contractor leaves without sending, and they still appear in the job gallery after the next refresh.
- **Why:** The partners' only signal from the field is the email (D20). A photo that is visible but never announced means a job sits unreviewed.
- **Change:** Post photos the moment they finish uploading, always as their own update ('You added 3 photos'). Any composer text goes as a separate comment when they tap Send. In the Mark done sheet keep holding photos, but post them right away if the sheet closes without finishing. Remove the 'ready to send' state from the portal.
- **Desktop, tablet, phone:** Behavior only; the same at every size.
- **Reuse:** jobs.postJobUpdate already posts files on their own. Call it from onRecorded unconditionally in job-actions.tsx.
- **References:** 
  - [Roku](https://mobbin.com/screens/a0850ac5-0fa4-45cf-b7e6-e93cf86b8cbf): 'Adding 2 photos to … stream': photos post as they upload, with no separate send step.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:71-79,154-158,198-205`, `branch: src/lib/portal/jobs.ts:158-161`, `branch: src/lib/tasks/core.ts:614-617`, `branch: src/lib/portal/queries.ts:251-256 (the gallery lists Shared media whether or not it has an event)`
- **Verification:** partly. The code path is right. recordJobUpload passes standalone:false (jobs.ts:158-161), so core.recordAttachment skips addEvent and notify (core.ts:614-618), and visibleFile has no eventId filter (queries.ts:65-71). The UI does warn, though: '{n} uploads ready to send' sits beside an enabled Send. Loss happens only when the contractor leaves without tapping Send, so this is medium, not high. A related oddity: any revalidation, such as a checklist tick, refreshes the server page, and the held photos then show in 'Photos & videos' while the composer still calls them 'ready to send'. Posting on upload, or flushing held ids on pagehide, fixes both.

### BPORTAL-006

**A finished job shows the contractor a red 'Review' chip and a disabled button**

Medium · Design change · effort S · `/p cards and /p/jobs/[id] after Mark done (Review)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** After Mark done, the job carries a red 'Review' badge on My jobs and on the job page, because STATUS_TONE gives REVIEW red. The bar's right half becomes a disabled gray button, 'Waiting for review' ('Waiting for HG to review' from sm up). Red is the staff tone for 'needs your attention', and to a contractor it reads as a problem. The disabled button is a status dressed as a control, and it doesn't say when or by whom.
- **Why:** This is the moment the contractor needs to know it landed. It should feel settled and say who has it.
- **Change:** Give the portal its own label for Review, 'Sent for review', in a calm tone that no other portal status uses, never red. Replace the disabled button with a status card under the title: 'Sent to Connor and Pieter · Tue 3:40 PM. You'll get an email when it's approved.' The bar keeps 'Add photo/video' at full width.
- **Desktop, tablet, phone:** Phone: the card sits under the title and the bar is one full-width button. Tablet the same. Desktop: the card under the title, with no bar if BPORTAL-021 lands.
- **Reuse:** Add a portal label map in src/lib/portal/job-view.ts beside STATUS_LABEL. Use the Badge tones in src/components/ui.tsx through src/components/status-badge.tsx (add a status prop override), and Card from ui.tsx.
- **Challenges:** §7 Reuse check sets Review to red for every view. A contractor-facing label and tone would differ from staff. Question for Connor.
- **References:** 
  - [Mercury](https://mobbin.com/screens/ec7b66ef-59c2-495b-9872-7f17f40c5c52): 'Your application is in review': submitted, in review, ready, with an expected time.
  - [Shopee](https://mobbin.com/screens/e4f6212f-3a05-49bc-894d-4ff79d441ae9): 'Request under Review': who is reviewing and when you'll hear back.
  - [Alan](https://mobbin.com/screens/15596e53-2aa9-4f99-b357-589fb8c0e1dc): 'In review: Our team is reviewing your documents', in a calm tone.
- **Code:** `branch: src/components/status-badge.tsx:12-20`, `branch: src/lib/task-scope.ts:47-55`, `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:178-183`
- **Verification:** partly. The observation is accurate. STATUS_TONE.REVIEW is red (status-badge.tsx:12-20), and the bar shows a disabled 'Waiting for review' or 'Waiting for HG to review' button (job-actions.tsx:178-183). Red for Review is the spec's approved §7 tone, and the finding names that conflict properly. Medium fits better than high: it's the contractor's settled moment, not a broken flow.

### BPORTAL-007

**A sent-back job shows no sign at the top that it came back, or why**

Medium · New capability · effort M · `/p/jobs/[id] after Send back` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** On the job page, a send-back shows only as 'Connor sent it back' and the note at the end of Updates, with nothing near the title. The contractor also gets the D19 email carrying the note, and the My jobs card shows 'In progress' with an 'N new' pill that clears when the job opens.
- **Why:** A send-back is the most important message HG sends a contractor. Burying it means a second wasted trip.
- **Change:** When the latest status event is a send-back, show a banner under the title: 'Connor sent this back · Tue', the quoted note, and a 'Reply' link that focuses the composer. Clear it when they mark done again. On the My jobs card, replace the Target line with 'Sent back · Tue'.
- **Desktop, tablet, phone:** Phone: a full-width banner under the title, with the note clamped to 3 lines and 'More' expanding it. Tablet and desktop: the same, with the note in full.
- **Reuse:** Mirror src/app/(app)/tasks/[id]/review-banner.tsx (the staff Review banner) as a portal banner, with data from queries.ts jobUpdates (statusFrom REVIEW to IN_PROGRESS plus the next comment).
- **Challenges:** §6 Job page order (status and title, then address and the rest) gains a banner slot. It mirrors the approved staff Review banner. Question for Connor.
- **References:** 
  - [Shopee](https://mobbin.com/screens/e4f6212f-3a05-49bc-894d-4ff79d441ae9): A status banner leads the record and says what happens next.
  - [Jomo](https://mobbin.com/screens/0082fe5c-6917-4a9a-8e8c-425ad15911a5): A rejected proof photo comes back as a top banner with the reason and 'try again'.
  - [Vestiaire Collective](https://mobbin.com/screens/984bf280-8384-4125-8136-360fc80eddf2): The current step is a card with the explanation and a contact action.
  - [Flighty](https://mobbin.com/screens/09e08a95-1063-4e78-baeb-a68dddb6136a): A change notice leads the record ('Departure changed to 10:15 AM') above the details: where the Send back note belongs on the job page.
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): The reason something needs another pass sits right at the item in one plain line.
  - [Uxcel](https://mobbin.com/screens/582e2462-9b04-4c81-a55a-9ab090368971): A review-state banner at the top of the item explains its state and what comes next.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/page.tsx:65-71,89-107`, `branch: src/lib/portal/job-view.ts:159-172`, `branch: src/lib/tasks/core.ts:334-341`, `branch: docs/asana-migration-plan.md:66,205`
- **Also found as:** G1A-024 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. The job page is as described: the send-back shows as a status line plus a comment at the end of Updates (core.ts:334-341; job-view.ts:164). Per D19, though, a send-back also emails the contractor the note with an 'Open job' button, so the note isn't buried everywhere. The banner is still a good mirror of the staff review banner. Medium, not high.

### BPORTAL-009

**The greeting uses the first word of company names: 'Hi Dust', 'Hi Fox', 'Thanks, Fox!'**

Medium · Fix · effort S · `/p greeting, Mark done payoff, texted login` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: firstName now uses a one-word nickname in parentheses, so 'Jacob (Jake) hoak' greets as 'Jake' in the My jobs heading, the Mark done payoff and the login text. Still open: contacts named after a company still come out as 'Hi Dust', 'Hi Fox' and 'Thanks, Fox!'. There's no First name field on PortalAccount and no company fallback ('Your jobs', 'Thanks!'), which is a data and design decision for Connor.
- **Today:** firstName() takes the first whitespace-separated word of Contact.fullName. It feeds the My jobs h1, the payoff heading and the starting-password text. Real contractor contacts on the branch include 'Dust 2 Sparkles', 'Fox Pest', 'Jacob (Jake) hoak' and 'Nick'. Those come out as 'Hi Dust', 'Hi Fox', 'Thanks, Fox!', and 'Hi Jacob' for someone who goes by Jake.
- **Why:** The first word the contractor reads from HG is their name, wrong. CLAUDE.md asks for warm, real names from the record.
- **Change:** Add a 'First name' field (what we call them) to PortalAccount. Prefill it from the contact when it looks like a person, and let staff edit it on the Portal access card. When it's empty, as for a company, the greeting becomes 'Your jobs', the payoff 'Thanks!' and the text 'Hi, it's Connor.'
- **Desktop, tablet, phone:** Copy only.
- **Reuse:** src/lib/portal/job-view.ts firstName and src/lib/names.ts firstName. Add the field to the Portal access card on src/app/(app)/contractors/[id].
- **References:** 
  - [Clerk](https://mobbin.com/screens/4449c0bd-4fe5-4bb8-915d-7b85cedb7f60): Personal information keeps First name and Last name as separate fields from the email identity.
- **Code:** `branch: src/app/(portal)/p/page.tsx:32`, `branch: src/lib/portal/job-view.ts:182-184`, `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:263-265`, `branch: src/lib/portal/login-text.ts:19-23`, `task-management-migration-4c9ddf/src/lib/portal/session.ts:75`, `task-management-migration-4c9ddf/src/app/(portal)/p/page.tsx:32`, `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:264`, `branch-src/src/lib/portal/job-view.ts:182-184`, `branch-src/src/app/(portal)/p/page.tsx:32`, `hg_capital_review DB: Contact fullName values listed above`, `emails/index.txt (case s-company)`, `branch: src/lib/names.ts:2-4`
- **Also found as:** G1A-I11 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve), BCONTRACT-023 (Branch: contractors directory, portal access, Home and emails)
- **Verification:** partly. Confirmed: job-view.ts firstName splits on whitespace and feeds 'Hi …' (p/page.tsx:32) and 'Thanks, …!' (job-actions.tsx:264). The welcome page splits the same way (welcome/password/page.tsx:14). The text message uses names.ts firstName, which also splits at '('. Contractor contacts on the branch include 'Dust 2 Sparkles' and 'Fox Pest', and D22 invites every contractor. It's a wrong-copy bug, but medium rather than high: wrong but harmless, and fixable with one field.

### BPORTAL-010

**'Add photo/video' stays on in Review, but the server refuses after an hour with 'This job is closed'**

Medium · Fix · effort S · `/p/jobs/[id] in Review` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** In Review the bar keeps 'Add photo/video' enabled; the code comment reads 'Photos can still go up while HG reviews'. acceptsContractorUpload, however, takes a contractor upload on a Review job only within 60 minutes of their Mark done. After that the tile fails with 'couldn't upload: This job is closed.', while the chip still shows the job as open and text updates still send. On a job staff set to Review, uploads are refused from the start.
- **Why:** Remembering one more photo that evening is normal. The UI invites it and then fails with a message that is wrong: the job isn't closed.
- **Change:** Pick one rule. Either (a) accept contractor uploads for the whole Review state, or (b) hide Add photo/video once the window closes and show 'Need to add something? Write an update.' Either way, never say 'closed' for a job in review.
- **Desktop, tablet, phone:** Behavior and copy only.
- **Reuse:** src/lib/attachments/access.ts acceptsContractorUpload and the bar in job-actions.tsx.
- **Challenges:** §5.3 Files: 'Uploads still finishing after a contractor taps Mark done are accepted for 60 minutes'. Option (a) widens that rule.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:173-177`, `branch: src/lib/attachments/access.ts:46-57`, `branch: src/lib/tasks/service.ts:349-360`
- **Verification:** confirmed. Confirmed in code. REVIEW counts as active, so the bar keeps 'Add photo/video'. contractorUploadRefusal (service.ts:349-360), however, accepts Review uploads only within 60 minutes of this contractor's own Mark done (access.ts:52-57), and it runs at token mint too. After the hour, or on a job staff moved to Review, the upload fails with 'This job is closed.' while text updates still post.

### BPORTAL-011

**Opening a job clears 'N new' but the page doesn't show which updates are new**

Medium · New capability · effort S · `/p/jobs/[id] Updates` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The card's 'N new' pill counts unseen Shared updates. The job page calls noteJobViewed while it renders, which marks everything seen, and then draws no marker. Updates run oldest first below notes, checklist and photos, so the new message from Connor is several screens down and looks like the rest.
- **Why:** 'Close the loop' runs both ways. The contractor should land on what changed.
- **Change:** Read lastSeenAt before marking the job seen. Draw a 'New' divider above the first unseen update. When any exist, show a pill under the title, '2 new updates', that scrolls to the divider.
- **Desktop, tablet, phone:** Phone: the pill sits under the title, 44px tall. Tablet and desktop: the same. The divider spans the column.
- **Reuse:** src/lib/portal/jobs.ts noteJobViewed and markJobSeen; queries.ts newUpdateCounts already has the cutoff logic.
- **References:** 
  - [Telegram](https://mobbin.com/screens/6324eae4-b36d-474a-bb1f-929343ae7b33): An 'Unread Messages' divider above the first new message.
  - [Skip](https://mobbin.com/screens/b33c64dc-1ca4-4573-abe7-10187f8c2279): A thin 'New' rule between read and unread.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/page.tsx:34,89-98`, `branch: src/lib/portal/jobs.ts:44-71`, `branch: src/lib/portal/queries.ts:125-138`
- **Verification:** confirmed. Confirmed: noteJobViewed marks everything seen in after() (jobs.ts:44-57), and UpdateItem draws no unread marker (page.tsx:89-98). newUpdateCounts already has the cutoff logic to reuse. The Telegram and Skip refs fit the pattern.

### BPORTAL-012

**A wrong password empties the form, and the password field has no reveal**

Medium · Fix · effort S · `/login (as a contractor)` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: a wrong password now comes back inline with the email kept and the password field focused, with no email in the URL. Still open: there is no show-password toggle on the login, reset or first-password fields, which the other session left for Connor as a design decision.
- **Today:** A failed sign-in redirects to /login?error=bad and the form comes back empty. The contractor retypes their email on every attempt. There is no eye toggle on the password field, so a texted starting password like 'k7mq-4vxp-2hzt' is typed blind on a phone. The same applies on the reset page.
- **Why:** The starting password is typed off a text message on a phone. Retyping the email each time and guessing at hidden characters is where onboarding fails.
- **Change:** Move login to useActionState so the error renders inline with the email kept. Keep the email in form state, never in the URL. Focus the password field after an error, and add an eye toggle to every password field on login, reset and welcome.
- **Desktop, tablet, phone:** Same at all sizes. The eye button is a 44px target inside the field's right edge.
- **Reuse:** src/app/login/page.tsx, src/app/login/actions.ts, and authInputClass in src/app/login/_components/auth-frame.tsx.
- **References:** 
  - [Shopify](https://mobbin.com/screens/50eb7f20-161a-4a0e-9c7f-a8e24f282ccd): Email kept with 'Change email', inline 'Incorrect password', eye toggle.
  - [ChatGPT](https://mobbin.com/screens/cb356d6b-8b8b-43fc-b11f-18d56a5f61d6): Email kept with Edit, an inline error under the password, and a reveal.
  - [Amazon](https://mobbin.com/screens/27cf26f2-4e2e-41ab-9915-90f1468ff417): The problem shows above the form while the email stays filled in.
  - [Mercury](https://mobbin.com/screens/85da4e09-98b5-4461-b34b-3653b5083e6f): The error appears inline under the email field ('Hm. We couldn't find an account with that email.'), and the typed email and password both stay in place.
  - [Stripe](https://mobbin.com/screens/3b6dce28-bc66-445e-b715-17d460a310ff): 'Incorrect email or password.' under the password field with the email kept.
  - [Mercury](https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7): An eye button inside the password field, with 'Forgot password?' under it.
  - [Cal.com](https://mobbin.com/screens/fd16d9ca-0d86-4d60-9434-7ffbb6a8a0b4): An eye toggle on the password field, with live rule checks underneath.
  - [Stripe](https://mobbin.com/screens/d36ef36b-d2e9-46ff-bac5-f1d715f30ec0): An eye toggle in the field, Forgot on the label row, the error inline and the email kept.
- **Code:** `branch: src/app/login/actions.ts:42-46`, `branch: src/app/login/page.tsx:24-55`, `src/app/login/page.tsx:28-34`, `src/app/login/actions.ts:27-37`, `probe on :3300: /login?error=locked -> 'Too many failed attempts. Try again in 15 minutes.', email=""`, `branch src/app/login/page.tsx:19,24-30`, `branch src/app/login/actions.ts:38-46`, `branch src/app/login/_components/auth-frame.tsx:54-62`, `src/app/login/actions.ts:33-37`, `src/app/login/page.tsx:36-53`, `branch src/app/login/actions.ts:42-45`, `branch src/app/login/page.tsx:22-27`, `src/app/login/page.tsx:46-54`, `src/lib/login-throttle.ts:33-35`, `branch src/app/login/page.tsx:42-50`, `branch src/app/login/actions.ts:49-62`, `branch src/app/login/reset/page.tsx:44,55`, `branch src/app/(portal)/p/welcome/password/page.tsx:32,42,52`, `branch: src/app/login/page.tsx:43-63`, `branch: src/app/login/_components/auth-frame.tsx:44-45`
- **Also found as:** PUBLIC-017 (Login and the public site), PUBLIC-I11 (Login and the public site), G1A-040 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. Confirmed in code: fail() redirects to /login?error=bad (login/actions.ts:42-46), and the inputs have no defaultValue (login/page.tsx:33-51), so the email is retyped. No password field has a reveal. The starting password format 'k7mq-4vxp-2hzt' (tokens.ts:40-51) is exactly what people mistype blind.

### BPORTAL-014

**Every posted photo appears twice on the job page**

Medium · Design change · effort S · `/p/jobs/[id] Photos & videos and Updates` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The 'Photos & videos (N)' grid near the top lists every Shared photo and video on the job. Each update that posted files then renders its own full 3-column MediaGrid in Updates. A contractor who sends 6 photos sees them in the gallery and again further down the same scroll.
- **Why:** It doubles the scroll on the one page that has to stay short, and it makes the gallery feel unreliable ('did it post twice?').
- **Change:** Keep the top grid as the job's gallery. In Updates, show a file post as one line, 'You added 3 photos', with one row of up to 4 thumbnails at 48px plus a '+N' tile. Each opens the Lightbox at that photo.
- **Desktop, tablet, phone:** Phone: the 4-thumb strip fits 375 and 320. Tablet and desktop: the same strip. The gallery keeps 3 or 6 columns.
- **Reuse:** src/components/media-grid.tsx (add a compact strip variant) and src/components/lightbox.tsx.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/2cb5e160-24a8-4b37-8ed3-980642a88a5d): Activity rows are one compact line each; content lives once on the record.
  - [Linear Mobile](https://mobbin.com/screens/f03367b0-cbbe-497c-bfc5-4479a5ed4fd1): Files sit as rows on the issue; activity refers to them, it doesn't repeat them.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/page.tsx:83-87,128-131`, `branch: src/lib/portal/queries.ts:251-256,303-319`
- **Verification:** confirmed. Confirmed in code. The page gallery lists every visible IMAGE or VIDEO on the job (queries.ts:251-256; page.tsx:83-87), and each update renders its own MediaGrid of the same files (page.tsx:128-131; queries.ts:303-319). The sample job has no media, so I couldn't screenshot it, but every posted photo renders twice by construction.

### BPORTAL-015

**Portal composer is a bare textarea plus a second blue button, not the staff composer**

Medium · Design change · effort M · `/p/jobs/[id] composer` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The update box is a 2-row textarea with a small Send button on its own row below it, pale blue while disabled. With 'Mark done' in the bar, two filled blue buttons are on screen at once. The composer has no camera or attach control, doesn't autosize and saves no draft. The staff task composer for the same files has a camera icon, an autosizing field, inline Send on phone and a localStorage draft per task.
- **Why:** Two primaries compete for the thumb. Losing a half-written note when the phone locks is a common field failure.
- **Change:** Reuse the staff Composer shell without the Shared/Internal switch: one bordered box, a camera icon on the left, autosizing text, and Send as a quiet icon button inside the right edge that turns primary once there's text. Save drafts per job. The bar's 'Add photo/video' stays the main capture path.
- **Desktop, tablet, phone:** Phone: one row (camera, text, send) that grows to 6 lines. Tablet the same. Desktop: in the Updates rail if BPORTAL-021 lands.
- **Reuse:** src/app/(app)/tasks/[id]/composer.tsx (draft helpers at lines 29-40, layout at 207-262). Extract it to src/components/ and add a docs/components.md row, since it now serves both surfaces.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/2cb5e160-24a8-4b37-8ed3-980642a88a5d): A docked '+ Comment' pill with a camera button beside it.
  - [Alan](https://mobbin.com/screens/87f86008-4e1b-4f02-822a-92f5050638d3): An attach icon and the message field on one row.
  - [Jobber](https://mobbin.com/screens/3bd617fc-464a-4f6d-891f-4b65f962b2cb): Notes: 'Add Note' with a camera button side by side.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:138-164`, `branch: src/app/(app)/tasks/[id]/composer.tsx:29-40,207-262`
- **Verification:** confirmed. Confirmed. A 2-row textarea sits with Send on its own row, pale blue while disabled (verify-BPORTAL/job--mobile-light-webkit.png). There is no draft persistence, while the staff composer has readDraft and writeDraft (composer.tsx:29-40). The two filled blue buttons appear together only once the contractor scrolls to the composer.

### BPORTAL-016

**Checklist uses native squares that turn bright white in dark mode, unlike the staff checks**

Medium · Fix · effort S · `/p/jobs/[id] Checklist` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The job checklist uses native input checkboxes. In dark mode WebKit draws them as bright white filled squares, because the dark theme sets no color-scheme, so native controls stay light. The staff task page draws the same checklist with round 18px green checks and a thin progress bar.
- **Why:** Bright white blocks on a dark page look broken. The checklist is the core of the on-site job.
- **Change:** Reuse the staff checklist row: a round check in a 44px target, green when done, strike-through, and the progress bar under 'Checklist 2/4'. Add color-scheme: light on :root and color-scheme: dark on :root[data-theme=dark] so native controls, scrollbars and pickers follow the theme app-wide.
- **Desktop, tablet, phone:** The same rows at every size, 44px tall on touch.
- **Reuse:** src/app/(app)/tasks/[id]/checklist.tsx rows 30-62 (extract a ChecklistRow) and src/app/globals.css.
- **References:** 
  - [Things 3](https://mobbin.com/screens/18b05379-2af1-41ab-afef-0ca4870933c1): A round-check checklist in a calm, single-color style.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/_components/job-details.tsx:92-98`, `branch: src/app/globals.css:6-26`
- **Verification:** confirmed. Reproduced in dark mode on WebKit: the checkboxes render as bright white filled squares (verify-BPORTAL/jobdark--checklist--mobile-dark-webkit.png). The computed color-scheme on :root is 'normal' with data-theme=dark, and globals.css has no color-scheme rule. The staff checklist uses round 18px green checks and a progress bar (tasks/[id]/checklist.tsx:30-62).

### BPORTAL-017

**The Mark done sheet doesn't show checklist progress or who the job goes to**

Medium · New capability · effort M · `/p/jobs/[id] Mark done sheet` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The sheet shows 'Add photos of the finished work?', a note field, 'Add photos' and the primary button, and nothing else. On the sample job the checklist is 0/4 and Mark done goes ahead with no hint. The sheet never says where the job goes; that appears only after sending.
- **Why:** Most send-backs will be 'you didn't do X on the list'. A glance at what's left prevents one.
- **Change:** Add a three-line summary above the buttons:
- 'Checklist 2 of 4': tap to expand and tick the rest in place.
- '3 photos', with thumbnails.
- 'Goes to Connor and Pieter for review'.
Don't block on unticked items; just show them.
- **Desktop, tablet, phone:** Phone: the bottom sheet grows to about 60% height, and the checklist expands inside it with the sheet scrolling. Tablet and desktop: the centered dialog, the same content.
- **Reuse:** The ChecklistRow from BPORTAL-016, MediaUploadTray, and Sheet from src/components/sheet.tsx.
- **Challenges:** §6 Job page: Mark done asks only 'Add photos of the finished work?'. This adds a summary to that sheet. Question for Connor.
- **References:** 
  - [DoorDash Dasher](https://mobbin.com/screens/ad3159d1-75e2-4cd3-a495-6a645d158838): 'Dash summary' lists what was done before Done, plus when the payout comes.
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): 'Complete Task' sits with the job's instructions and schedule in view.
  - [Jobber](https://mobbin.com/screens/31b78019-ddde-46db-abd9-cefe611bd8a7): 'Close job with incomplete visits?' sheet names what's unfinished before closing: the pattern for '2 checklist items aren't ticked'.
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): A 'Missing' marker with a one-line reason at the item itself, so the gap is fixed in place rather than discovered later.
  - [Manus](https://mobbin.com/screens/98127e4b-694d-4bb3-b679-94bf101931a4): Bottom sheet with Camera, Image and a strip of recent photos.
  - [Notion](https://mobbin.com/screens/2f99a08e-bb58-450d-87d3-b4c7a4073e82): Insert media sheet: Photo library or Take photo or video.
  - [Jobber](https://mobbin.com/screens/4e1a7edb-f8d9-4612-8cf6-94899c4f5046): 'Share images of the work to be done' with an inline image tile and a '1/10' count, the camera tile in place of a yes/no question.
  - [Thumbtack](https://mobbin.com/screens/bada6ed2-d3d3-4209-b332-354d4e16c6db): Optional photo step marked 'optional' with Skip as the primary button, for when photos truly are optional.
  - [Lime](https://mobbin.com/screens/a79e71e9-c9ce-4c2d-95f5-d33ce4bd5378): Photo already taken next to a camera tile, then Submit, with no question
  - [Grab Driver](https://mobbin.com/screens/7012c9ae-8441-4879-bda1-c054163d7925): Required photo shown as an 'Upload Photo' tile beside the instruction
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:209-242`, `branch: docs/asana-migration-plan.md:278,423`, `branch: docs/asana-migration-plan.md:423`, `branch: docs/asana-migration-plan.md:263`, `branch:src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:133 (label: 'Skip' when nothing is attached)`, `branch:src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:209-241 (sheet: question, tray, note, Add photos, primary)`, `branch:src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:189-190 ('Finishing N upload' wait)`
- **Also found as:** G1A-022 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve), G1D-020 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** partly. The sheet does omit checklist progress: it showed 'Add photos of the finished work?', a note field, Add photos and Skip on a 0/4 job. The full recommendation makes the approved one-question sheet busier, though. An expandable checklist inside the sheet repeats the page behind it, and 'Goes to Connor and Pieter' repeats the payoff line. One muted line, '2 of 4 checklist items open', above the buttons gets most of the value. The §6 conflict is named correctly.

### BPORTAL-018

**The sent screen ends on a generic icon and a single 'Back to my jobs'**

Medium · Design change · effort M · `/p/jobs/[id] Mark done payoff (sent state)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** From the code (the write is blocked in review), the payoff is a blue Send icon in a pale circle with a pop animation, 'Thanks, Zack!', 'Sent to Connor and Pieter. You'll get an email if anything else is needed.' and one 'Back to my jobs' button. It doesn't repeat what was sent or when to expect a decision, and it offers no next job.
- **Why:** CLAUDE.md payoff rule: line spot art or a property photo, a warm heading and the concrete next step, not a generic icon. This is the moment that should feel finished.
- **Change:** Lead with the property's photo, or HG line spot art (a door and key) when there is none. Then 'Thanks, Zack!' and 'Your note and 4 photos went to Connor and Pieter.', then 'They usually review within a day. You'll get an email.' The primary is 'Next job: Bathroom tile, Fri' when another open job exists; otherwise 'Back to my jobs'.
- **Desktop, tablet, phone:** Phone: full-height sheet content, photo 160px tall. Tablet and desktop: the dialog with a 4:3 photo. The second line drops on 320 if it would wrap.
- **Reuse:** The Payoff in job-actions.tsx; property photos from the property record (portal-safe field select in src/lib/portal/queries.ts); LinkButton.
- **References:** 
  - [Noom](https://mobbin.com/screens/d4bdf747-080e-4d76-ba77-77ef317d1fb7): 'Capture Complete!' with a 'What Happens Next?' box.
  - [DoorDash Dasher](https://mobbin.com/screens/ad3159d1-75e2-4cd3-a495-6a645d158838): The summary of what you did, then the date of what comes next.
  - [Mercury](https://mobbin.com/screens/ec7b66ef-59c2-495b-9872-7f17f40c5c52): An in-review state with expected timing.
  - [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): Payoff for a contractor payment: single-color line art, a plain heading, a one-row summary and two next steps ('See pay history', 'Create another payment').
  - [Mercury](https://mobbin.com/screens/8af02439-bec3-46d7-8a2b-5907337678bf): 'Your invoice is scheduled' with when the other side hears about it, then 'Send Another Invoice' and 'Return To Dashboard'.
  - [Deepstash](https://mobbin.com/screens/4ca7cfa2-d2d2-447d-b535-f8778e117130): "Nice work" with the next items listed and one Continue.
  - [Quizlet](https://mobbin.com/screens/20636ebc-0eec-4627-9917-7a9c1dd91f74): Heading, one line of what's next, a primary and a secondary action.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:251-273`, `branch: docs/asana-migration-plan.md:423`
- **Also found as:** G1A-023 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. Right that the payoff leads with a generic Send icon in a tinted circle (job-actions.tsx:259-262), which breaks the CLAUDE.md payoff rule. Two problems with the fix. The body line 'Sent to Connor and Pieter. You'll get an email if anything else is needed.' is the approved §6 confirm copy, so changing it should be named in conflicts_with, and it isn't. 'They usually review within a day' is a promise HG can't back, which the house copy rules forbid. Keep the approved copy, swap the icon for line spot art or the property photo, and add 'Next job' when one exists.

### BPORTAL-019

**Upload failures show camera filenames and the browser's raw 'Load failed'**

Medium · Fix · effort S · `/p/jobs/[id] upload tray` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Failed tiles get a red ring and a retry glyph, with the line 'Couldn't add IMG_0412.jpg and 1 more: Load failed'. The camera filename means nothing to the contractor, and 'Load failed' is WebKit's raw fetch error. There's no 'Retry all', and nothing retries when signal comes back.
- **Why:** The contractor needs to know whether to try again, not which IMG number failed.
- **Change:** Say '2 photos didn't upload. Tap a photo to retry.' and add a 'Retry all' text button. Map network errors to 'No connection' and server refusals to their own line. Auto-retry failed tiles on the 'online' event.
- **Desktop, tablet, phone:** One line at 320; drop 'Tap a photo to retry.' on 320 if needed.
- **Reuse:** uploadNotice and shownReason in src/lib/attachments/media.ts; MediaUploadTray in src/components/media-uploader.tsx.
- **References:** 
  - [OpenPhone](https://mobbin.com/screens/fd44cd6d-3bf9-4be7-bae2-f6e4b25cb27d): 'Failed to send' plus 'Retry sending', in plain words.
  - [Alan](https://mobbin.com/screens/87f86008-4e1b-4f02-822a-92f5050638d3): 'error, tap to retry' right on the failed item.
- **Code:** `branch: src/components/media-uploader.tsx:161-163,246,346`
- **Verification:** confirmed. Reproduced: the tray read 'Couldn't add IMG_0412.jpg and 1 more: Load failed' (verify-BPORTAL/upload--sheet-failed--mobile-light-webkit.png). uploadNotice and shownReason (media.ts:73-88) pass WebKit's raw fetch error through. Each tile retries alone, with no Retry all and no retry when the connection comes back. The uploader is shared with the staff composer, so the copy change helps both.

### BPORTAL-022

**Job cards repeat their group heading and use 12-14px text on phones**

Medium · Design change · effort S · `/p My jobs cards` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** In By date, each card repeats its group's date as 'Target …'. In By property, each card repeats the street from the group heading. Titles are 14px and meta lines 12px on phones. Done cards are dateless only in By property; in By date they sit under the finished-day heading.
- **Why:** Copy rule: don't restate what the layout shows. Small gray text in sunlight works against 'find today's job' at a glance.
- **Change:** By date: drop the date line from cards. By property: cards show the unit only, plus the date. Use a 16px title and 14px meta on touch. Done cards show 'Approved Oct 20' where Target was. In By property, the group heading uses the short street in foreground weight.
- **Desktop, tablet, phone:** Phone: two-line cards (title, then unit and date) with the status chip right. Tablet: the same. Desktop: the same centered, as the spec says.
- **Reuse:** JobCardLink in src/app/(portal)/p/_components/my-jobs.tsx, and addressLine and targetLabel in src/lib/portal/job-view.ts.
- **References:** 
  - [Jobber](https://mobbin.com/screens/c3fc8f9e-52c4-465b-a55c-b7ac5eeec9a8): Visit card: client, time, street and job in large type, with no repeated context.
  - [Airbnb](https://mobbin.com/screens/bd35553c-9732-4fa3-b7c8-50c5a00eee73): Trip card: a large title, the address as a muted two-line block, one action.
- **Code:** `branch: src/app/(portal)/p/_components/my-jobs.tsx:88-90,112-135`
- **Verification:** partly. Confirmed: the 'Mon, Oct 26' heading is repeated as 'Target Mon, Oct 26' on the card, By property repeats the street, and the measured sizes are title 14px and meta 12px on mobile WebKit (verify-BPORTAL/myjobs2--byprop--mobile-light-webkit.png). Two corrections. Done cards in By date sit under their finished-day heading, so only By property loses the date. And §6 lists Target date as part of the card, so dropping it in By date should be named as a conflict.

### BPORTAL-023

**The 'Call HG' button never shows: the office number is an empty constant**

Medium · Fix · effort S · `/p/jobs/[id] header` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Still open at 9f74ea1: OFFICE_PHONE_E164 is still an empty string in code, so the 'Call HG' button never shows. The only change is that officeTelHref now reuses telHref. Connor needs to supply the number (or choose a per-job 'Call Connor' row), and moving the number into app config is still a code fix.
- **Today:** The job page header renders a phone button only when OFFICE_PHONE_E164 is set, and in code it is an empty string. Contractors have no way to call anyone from the portal; the only channel is a written update.
- **Why:** On site, a 20-second call beats a typed update. D22 invites every contractor on Oct 29.
- **Change:** Set the number before the Oct 29 invites and move it into app config so it isn't a code change. Better: a per-job 'Call Connor' or 'Text Connor' row, using the partner who assigned the job.
- **Desktop, tablet, phone:** Phone: a 44px phone icon in the header, or a contact row under Updates. Desktop: the same row in the rail.
- **Reuse:** src/lib/portal/office.ts and src/lib/app-config.ts.
- **References:** 
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): A phone icon fixed in the job's top bar.
  - [DoorDash](https://mobbin.com/screens/6bafb51e-691c-4e72-a743-58e2570b15d1): A 'Your Dasher' row with call and message buttons.
  - [Airbnb](https://mobbin.com/screens/bb3a9535-0ef0-4dc6-b2de-bbf5113ebc15): The trip page lists "Message your host" as a plain row.
  - [DoorDash Dasher](https://mobbin.com/screens/5cb6f086-abb8-4751-874a-e2901cb238e3): Call and message icons beside the person on the active job.
- **Code:** `branch: src/lib/portal/office.ts:6-12`, `branch: src/app/(portal)/p/jobs/[id]/page.tsx:47-55`, `branch: docs/asana-migration-plan.md:69,412-421`
- **Also found as:** G1A-026 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. Confirmed: OFFICE_PHONE_E164 is '' (office.ts:6), so the header's Call button never renders (page.tsx:47-55). Neither the spec nor app-config mentions it, so it's an unfinished pre-invite setting.

### BPORTAL-024

**A Waiting job shows an amber 'Waiting' chip with no reason, next to 'Start job'**

Medium · Design change · effort S · `/p and /p/jobs/[id] for a Waiting job` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** A job in Waiting shows the amber 'Waiting' chip. The portal query doesn't select waitingOn and filters out Waiting events, so no reason appears anywhere. nextStep maps WAITING to 'start', so the bar still offers 'Start job'. The contractor can't tell what it's waiting on, or whether to go.
- **Why:** A status the contractor can't act on or understand creates calls and wasted trips.
- **Change:** Ask Connor which way. (a) Show the reason under the chip when it concerns them ('Waiting on parts · Thu'). (b) Show Waiting jobs to contractors as their underlying state (Scheduled or To do), and keep Waiting staff-only.
- **Desktop, tablet, phone:** Copy and status only.
- **Reuse:** The portal status map from BPORTAL-006 in src/lib/portal/job-view.ts, and getJob's field selection in src/lib/portal/queries.ts.
- **Challenges:** §5.1: Waiting stays internal in the portal timeline. D6: Waiting carries a reason. Question for Connor.
- **References:** 
  - [Vestiaire Collective](https://mobbin.com/screens/984bf280-8384-4125-8136-360fc80eddf2): 'Waiting for seller to ship', with what it's waiting on and by when.
- **Code:** `branch: src/lib/portal/job-view.ts:150-156,231-237`, `branch: src/lib/portal/queries.ts:229-246`
- **Verification:** confirmed. Confirmed: getJob doesn't select waitingOn (queries.ts:229-246), Waiting events are excluded from the portal timeline (job-view.ts:156), and nextStep maps WAITING to 'start' (job-view.ts:231-237). An In progress job that staff park as Waiting shows the contractor 'Start job' again. The question for Connor is framed properly.

### BPORTAL-025

**Tapping a job card on a slow connection gives no feedback**

Medium · Fix · effort S · `/p to /p/jobs/[id] navigation` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** There is no loading.tsx under /p or /p/jobs/[id]. The job page is fully dynamic: a session check, four queries and the lockbox log. On LTE, a tapped card leaves My jobs on screen with no pressed state or progress until the server render returns. Cards have a hover border but no active state.
- **Why:** Without feedback, contractors tap again or think the app froze.
- **Change:** Add p/jobs/[id]/loading.tsx with a skeleton that matches the layout: the chip, title, address line, two buttons and the lockbox card. Give cards an active state on press (a background shift and slight scale, respecting reduced motion).
- **Desktop, tablet, phone:** The skeleton mirrors each size's layout.
- **Reuse:** Card styles in src/app/(portal)/p/_components/my-jobs.tsx. Any staff skeletons, if present; otherwise new, per the refs.
- **References:** 
  - [AllTrails](https://mobbin.com/screens/a6a7bb97-d19a-410e-94cc-9473cbeeb39b): A detail skeleton that matches the final blocks.
  - [YouTube](https://mobbin.com/screens/03993244-10ef-4567-861b-092fa81694e9): Title, chips and body placeholders in place before data arrives.
- **Code:** `No loading.tsx exists under src/app (find over branch-src/src/app)`, `branch: src/app/(portal)/p/_components/my-jobs.tsx:117-120`
- **Verification:** confirmed. Confirmed: there's no loading.tsx anywhere under src/app. The job route is fully dynamic, and the cards have hover styles but no pressed state (my-jobs.tsx:117-120). Without a loading boundary, a tap on LTE leaves My jobs frozen until the RSC payload returns.

### BPORTAL-029

**The empty states look like a drop zone and don't say what happens next**

Medium · Design change · effort S · `/p empty states (Open and Done)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Empty Open and Done tabs use the app-wide EmptyState primitive (dashed border) with a single line, and the By date | By property switch stays visible with nothing to group.
- **Why:** A new contractor's first visit may well be empty. It should tell them how work arrives.
- **Change:** Open: line spot art, 'No open jobs', then 'When Connor or Pieter assign you one, it shows up here and you get an email.' Done: 'Jobs you finish show up here.' Hide the grouping switch when the list is empty, and drop the dashed border.
- **Desktop, tablet, phone:** Phone: art at 96px. Tablet and desktop: the same, centered.
- **Reuse:** EmptyState in src/components/ui.tsx (add an art and description variant).
- **References:** 
  - [Brex](https://mobbin.com/screens/b7d8dc8b-337d-4003-9f81-c52610f549c0): 'You have no tasks at this time. When you have tasks that require attention, we'll notify you here.'
  - [Airbnb](https://mobbin.com/screens/3a9a1f0c-c768-45b8-b3e0-f4d0d02698ad): Host Today empty state: spot art and one plain line, no dashed box.
  - [Jobber](https://mobbin.com/screens/3872fb82-2e8f-41fe-b587-e1063401f155): Crew home says 'No visits scheduled today' inside the spot where the visit card would be.
  - [Jobber](https://mobbin.com/screens/ef0eebc0-f2bc-47e0-ba05-5e593e6e0b5e): "Today's appointments haven't started yet": a plain state inside the list.
- **Code:** `branch: src/app/(portal)/p/_components/my-jobs.tsx:82-83`, `branch: src/app/(portal)/p/page.tsx:33`
- **Also found as:** G1A-018 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. Confirmed that Done shows 'No finished jobs yet.' in a dashed box with the grouping switch still visible (verify-BPORTAL/myjobs--done--mobile-light-webkit.png). The dashed box is the shared EmptyState primitive (ui.tsx:249-255) used across the app, so it isn't a portal choice. CLAUDE.md reserves spot art for payoff moments, so the art should be dropped. Worth keeping: the Open line about how jobs arrive, and hiding the grouping switch when the list is empty.

### BPORTAL-034

**'This job isn't available' gives no reason and drops the portal header**

Medium · Fix · effort S · `/p/jobs/[id] not found` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** A job the contractor can't open (reassigned, closed before cutover, or never theirs) shows a bold 14px 'This job isn't available' and a blue 'Back to my jobs' on a blank page. There's no portal header and no reason.
- **Why:** It is usually reached from an email. One line of why, plus who to ask, stops a phone call.
- **Change:** Keep the portal header. Add one line under the heading: 'It may have been reassigned or closed. Questions? Call Connor.'
- **Desktop, tablet, phone:** The same at all sizes.
- **Reuse:** src/app/(portal)/p/jobs/[id]/not-found.tsx and the header from p/page.tsx (extract a PortalHeader).
- **References:** 
  - [NordVPN](https://mobbin.com/screens/dfa9ee24-160c-445b-b605-623b2f588d2b): The dead-end page says why and what to do next.
  - [Cal.com](https://mobbin.com/screens/ae2c874a-98e8-4b13-ad9c-9f474a308037): A canceled booking still opens to a calm page that says it's canceled, shows what it was and gives a way back ('Back to bookings').
  - [Flighty](https://mobbin.com/screens/8f5e2b0f-33db-4817-82e1-b1ec7c0d2bed): Canceled state keeps context visible and offers the next step in the banner line.
  - [Whop](https://mobbin.com/screens/307b3bb3-0556-4754-a57f-9d3b24116e20): An access state says why and gives one action, inside the product's own shell.
  - [Fresha](https://mobbin.com/screens/fba90558-d255-4d0e-aa0f-7d9e7a5b22ea): A canceled booking keeps a readable page with a clear Cancelled marker.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/not-found.tsx:15-21`, `branch: src/app/not-found.tsx:1-25`, `branch: docs/asana-migration-plan.md:212-215`
- **Also found as:** G1A-025 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. Reproduced with a staff-only task id: the page returns 404 and shows only 'This job isn't available' and 'Back to my jobs', with no portal header and no reason (not-found.tsx:15-21).

### BPORTAL-020

**The address is one gray line, Copy weighs as much as Directions, and Android gets Apple Maps**

Low · Design change · effort S · `/p/jobs/[id] address and lockbox` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The address is one muted line ('118 Congress St. Buffalo, NY 14213 · Rear'), followed by equal-weight Directions and Copy address buttons. Directions always links to maps.apple.com. What that link does on Android wasn't verified here.
- **Why:** Getting to the door is step one of the job. The street and unit are the most-read facts on the page and should not be muted gray.
- **Change:** Split the address into two lines: street and unit in foreground weight ('118 Congress St. · Rear'), with 'Buffalo, NY 14213' muted beneath. Make 'Directions' one full-width button: Apple Maps on iOS, a Google Maps link elsewhere. Copy becomes a small icon button at the end of the address row. Keep the lockbox card right under it, so getting in reads as one block.
- **Desktop, tablet, phone:** Phone: Directions full width, 44px. Tablet: the same within the column. Desktop: Directions auto-width beside the address. Nothing drops.
- **Reuse:** AddressActions and LockboxCard in job-details.tsx, LinkButton and Button from src/components/ui.tsx, and shortAddress in src/lib/normalize.ts for the street line.
- **References:** 
  - [Jobber](https://mobbin.com/screens/31d2f003-1b0b-41b4-9e38-a51b2c78353a): Two-line address, then one full-width Directions.
  - [Airbnb](https://mobbin.com/screens/5f789af0-a9ed-4c5e-aca3-ae5026d47ba6): 'Getting there': a two-line address, then Copy address and Get directions as rows.
  - [Jobber](https://mobbin.com/screens/536351e7-656d-444e-867d-38eb7f48e146): Address with a directions icon on the right of the job header.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/page.tsx:69-71`, `branch: src/app/(portal)/p/jobs/[id]/_components/job-details.tsx:23-41`, `branch: docs/asana-migration-plan.md:416`
- **Also found as:** G1A-021 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. Confirmed: the address is one muted 14px line, and Directions and Copy address are equal-weight buttons (verify-BPORTAL/job--mobile-light-webkit.png; job-details.tsx:23-41). Directions always opens maps.apple.com. I couldn't verify what an Android phone does with that link, and the code's own comment accepts 'other phones get the web map'. The address restyle is polish, so low.

### BPORTAL-021

**On a computer the job page is a phone layout with a stretched bottom bar**

Low · Design change · effort M · `/p/jobs/[id] at desktop 1280 and 1920` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** At 1280 and 1920 the job page is a 672px centered column. The full-width fixed bar holds two buttons aligned to that column, and the header holds only '← My jobs'. The layout is tidy, just phone-shaped.
- **Why:** Some contractors and the realtor (D13) will use a computer. The phone pattern reads unfinished on desktop, and CLAUDE.md wants each size designed.
- **Change:** From lg (1024px) up:
- Move 'Add photo/video' and the next step into the page header beside the title, primary on the right.
- Drop the fixed bar.
- Put Updates and the composer in a right rail, like Jobber's Notes rail.
Tablet and phone keep the approved bottom bar.
- **Desktop, tablet, phone:** Desktop: two columns (details left, Updates rail right) with header actions. Tablet 768: the approved single column with the bar. Phone: unchanged.
- **Reuse:** PageHeader from src/components/ui.tsx, and the staff task page's rail layout in src/app/(app)/tasks/[id]/view.tsx.
- **Challenges:** D31 Job page: one scroll with a bottom bar. Desktop behavior wasn't specified; this keeps the bar for phone and tablet only. Question for Connor.
- **References:** 
  - [Jobber](https://mobbin.com/screens/e3c5c8d6-cc5d-4f31-90db-abc27fc8a7b6): Web request page: actions top right, Notes and attachments in a right rail.
  - [Jobber](https://mobbin.com/screens/6dc1095d-d55e-4a6b-a271-a53130088fa2): An overview column with a persistent Notes rail.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:169-195`
- **Verification:** partly. At 1280 the job page is the phone column centered at 672px. The fixed bar's buttons align exactly with the column and the header back link aligns with the content (shots/BPORTAL/job-lg--desktop-light.png), so it reads tidy rather than stretched. A two-column rail for a rarely used desktop contractor view is a big change to the approved D31 layout for little gain. At most, move the bar's two actions into the header from lg up.

### BPORTAL-026

**Forgot and expired screens end in a quiet gray link, with no resend and no email shown**

Low · Design change · effort S · `/login/forgot (sent) and /login/reset (expired)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** 'Check your email' shows only 'If that email has a login, a link is on its way.' in a gold box. It doesn't repeat the address, offers no Send again, and its only action is a small gray 'Back to sign in'. The reset page shows 'This link has expired' with a red box, 'Reset links work once, for 30 minutes.', even for a missing or garbled token. Its next step is a small gray 'Get a new link' text link.
- **Why:** A contractor who mistyped the email, or whose link expired at the job site, needs one obvious next step.
- **Change:** Sent: 'If zack@example.com has a login, we sent a link. It works for 30 minutes.' The address comes from form state, not the URL. Add 'Send again' (enabled after 30s) and 'Use a different email'. Expired: keep the title, put the email field and a primary 'Email me a new link' right on the page, and drop the red box.
- **Desktop, tablet, phone:** The 320px column at every size; everything fits on one 375 screen.
- **Reuse:** AuthFrame, AuthNotice, authButtonClass and authLinkClass in src/app/login/_components/auth-frame.tsx; requestPasswordReset.
- **References:** 
  - [Nextdoor](https://mobbin.com/screens/9a7c9249-f970-4381-a092-a57079fa2993): Echoes the address, with 'Resend email' after a countdown.
  - [Slack](https://mobbin.com/screens/88b4a62c-1cad-4db2-bae0-95dcc76e7bba): Email echoed, 're-enter email address', Open Gmail and Open Outlook.
  - [Podia](https://mobbin.com/screens/200cca5a-3725-4ad6-93bd-b69d82be9f5b): The expired-link notice sits on the request form, with the email and a primary send button.
  - [Linear Mobile](https://mobbin.com/screens/6ac75dec-5c85-4c3d-ad9e-717601c1fc9d): 'Check your email' echoes the exact address in the sentence and keeps 'Back to login' as the only other path.
- **Code:** `branch: src/app/login/forgot/page.tsx:20-48`, `branch: src/app/login/reset/page.tsx:22-33`, `branch: src/app/login/forgot/page.tsx:20-26`, `src/app/login/forgot/page.tsx:19-26`, `src/app/login/actions.ts:78-82`
- **Also found as:** G1A-036 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. Accurate: the sent state is one gold notice plus a gray 'Back to sign in', and an expired, missing or garbled token all show 'This link has expired' with a red box and a small 'Get a new link' link (forgot/page.tsx:20-48; reset/page.tsx:22-33). It's a secondary path off the main flow, so low rather than medium.

### BPORTAL-030

**The account menu holds only Sign out: no name, email, password change or contact**

Low · New capability · effort S · `/p account menu` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Tapping the 'DC' avatar opens a menu with one item, 'Sign out'. It doesn't show who is signed in, and there's no way to change the password while signed in (only Forgot password from the sign-in page) and no way to reach HG.
- **Why:** Shared phones and crew devices are common. Showing the signed-in identity and a password change are the basics of an account menu.
- **Change:** Menu header with name and email, then 'Change password' (the reset flow while signed in), 'Call HG' (once BPORTAL-023 sets a number), and Sign out last.
- **Desktop, tablet, phone:** Phone: the popover sizes to its content under the avatar. Tablet and desktop: the same.
- **Reuse:** AccountMenu in src/app/(portal)/p/_components/account-menu.tsx, and Menu and MenuItem in src/components/menu.tsx.
- **References:** 
  - [Grok](https://mobbin.com/screens/0a385c2f-c64e-428e-9f96-1242851a5910): Avatar menu: name and email header, items, Logout last.
  - [Etsy](https://mobbin.com/screens/0c6dce7f-4bea-44df-bccc-d516dc87221d): Name at the top, account settings, Sign out at the bottom.
- **Code:** `branch: src/app/(portal)/p/_components/account-menu.tsx:20-28`
- **Verification:** confirmed. Confirmed: the avatar menu contains only 'Sign out' (account-menu.tsx:20-28), and the run showed its menu text as 'Sign out' alone. A name and email header is cheap. 'Call HG' depends on BPORTAL-023.

### BPORTAL-031

**A scheduled visit is labeled 'Target'**

Low · Design change · effort S · `/p cards and /p/jobs/[id] for Scheduled jobs` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Scheduled jobs show 'Target Mon, Oct 26', where the date is the visit date, the same word used for an unscheduled due date.
- **Why:** Trades think in visits. 'Target' sounds negotiable when the date is a booked appointment.
- **Change:** Show 'Visit Mon, Oct 26' when the job is Scheduled, and keep 'Target …' otherwise.
- **Desktop, tablet, phone:** Copy only; the same at all sizes.
- **Reuse:** targetLabel in src/lib/portal/job-view.ts.
- **Challenges:** D7: contractors see a neutral 'Target' (the visit date if Scheduled). Question for Connor.
- **References:** 
  - [Jobber](https://mobbin.com/screens/d7ce67aa-6132-4ca9-82bb-df3fbdb7d5f6): Visits are listed by date with an arrival window, worded as visits.
- **Code:** `branch: src/lib/portal/job-view.ts:64-68`
- **Verification:** confirmed. targetLabel always says 'Target' (job-view.ts:64-68), including for a booked Scheduled visit. D7 chose the neutral 'Target' on purpose, and the finding names that conflict. It's a fair question for Connor.

### BPORTAL-033

**Finishing setup ends on a static bordered note, with no home-screen tip**

Low · New capability · effort S · `/p?saved=1 after the first password` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** After choosing a password, My jobs shows 'Password saved. Use it next time you sign in.' in a plain bordered box tied to ?saved=1, so it reappears on reload. Nothing helps the contractor get back to the portal later. D26 defers push notifications, so the portal lives in a Safari tab.
- **Why:** This is the payoff for onboarding, and the moment to make the portal easy to reopen.
- **Change:** Show a toast in place of the box. Add a one-time, dismissible card on iOS: 'Add HG Jobs to your Home Screen', with three numbered steps (Share, Add to Home Screen, Add). Ship a web manifest and apple-touch-icon so the icon looks right.
- **Desktop, tablet, phone:** Phone (iOS Safari only): the card sits above the list. Tablet: the same on iPad. Desktop: hidden.
- **Reuse:** useToast in src/components/toast.tsx and Card in src/components/ui.tsx. The manifest goes in src/app.
- **References:** 
  - [Cosmos](https://mobbin.com/screens/6e58948b-0dd3-4b55-a121-91b158b2b7b3): Numbered share-sheet steps with an 'Open share sheet' button.
  - [Clerk](https://mobbin.com/screens/fa1b5efa-c18d-45a9-8edb-4970e972fabf): A small bottom toast 'User settings updated.' confirms a saved setting without adding a box to the page.
  - [Quicken](https://mobbin.com/screens/e9042731-b020-4b97-b8b7-b5ad5a97db06): A short confirmation toast instead of an inline box.
- **Code:** `branch: src/app/(portal)/p/page.tsx:27-31`, `branch: src/app/(portal)/p/actions.ts:27`, `branch: src/app/(portal)/p/layout.tsx:2,20`
- **Also found as:** G1A-041 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. The ?saved=1 notice is tied to the URL, so it comes back on reload (p/page.tsx:27-31). No web manifest or apple-touch-icon is served (both return 404 on :3300), so Add to Home Screen today saves a page screenshot as the icon. The home-screen card is a nice-to-have given D26.

### BPORTAL-035

**Every job tab is titled 'Job', and 'My Jobs' is in title case**

Low · Fix · effort S · `Portal page titles` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Each job page's document title is 'Job | HG Capital Partners', so tabs and history all read the same. The list's title is 'My Jobs | HG Capital Partners' while the UI says 'My jobs'.
- **Why:** Contractors keep several jobs open in Safari tabs, and identical titles make them impossible to tell apart.
- **Change:** Add generateMetadata on the job page: 'Cabinet install · 118 Congress St.'. Use sentence case, 'My jobs'.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** src/app/(portal)/p/jobs/[id]/page.tsx and src/app/(portal)/p/layout.tsx.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/page.tsx:19`, `branch: src/app/(portal)/p/layout.tsx:4-7`
- **Verification:** confirmed. Confirmed: every job tab is titled 'Job | HG Capital Partners' (page.tsx:19), and the layout default is 'My Jobs | …' (layout.tsx:5). The first-password page is also title case, 'Choose Your Password | …' (welcome/password/page.tsx:7), and should be fixed in the same pass.

### BPORTAL-036

**The 56px sticky header holds only a back link, taking a fifth of an iPhone SE screen with the bar**

Low · Design change · effort S · `/p/jobs/[id] sticky header on phone` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The job page header is sticky and contains only '← My jobs', because Call HG is hidden. With the 72px bottom bar, about 128px of a 568px iPhone SE screen is chrome. Once the title scrolls away, nothing says which job is open.
- **Why:** On the smallest phones the checklist and photos compete for every row.
- **Change:** Show the job title in the header once the h1 scrolls out of view, the compact-title pattern, so the space earns its keep. Or make the header non-sticky on phones.
- **Desktop, tablet, phone:** Phone: compact title in the header after scroll. Tablet and desktop: unchanged.
- **Reuse:** BackLink in src/components/back-link.tsx and the page header in p/jobs/[id]/page.tsx.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/f03367b0-cbbe-497c-bfc5-4479a5ed4fd1): The issue ID and title move into the compact header once you scroll.
- **Code:** `branch: src/app/(portal)/p/jobs/[id]/page.tsx:44-57`
- **Verification:** confirmed. Measured at 320x568: the header is 57px and the bar 73px, about 23% of the screen. Once scrolled, nothing names the job (verify-BPORTAL/jobnarrow--scrolled--narrow-light-webkit.png). The compact-title pattern is a light fix.

### BPORTAL-037

**Toasts appear bottom-left on desktop, far from the centered job column**

Low · Design change · effort S · `Portal toasts at desktop` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** At 1280 portal toasts stack bottom-left, about 300px from the centered job column. That is the shared ToastProvider's default placement. The cited shot shows 'Couldn't copy' failure toasts.
- **Why:** Feedback should land near the action; on a wide screen the corner is easy to miss.
- **Change:** In the portal, center toasts above the bottom bar within the content column at every width.
- **Desktop, tablet, phone:** Phone and tablet: unchanged, centered above the bar. Desktop: centered over the 672px column.
- **Reuse:** src/components/toast.tsx (add a centered placement option for the portal's ToastProvider).
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/065e774e-91b9-4a34-b0e5-0116a13e84f7): 'URL copied to clipboard', centered just above the composer.
- **Verification:** partly. Bottom-left toasts on desktop sit far from the 672px column. In the cited shot, though, the toasts are 'Couldn't copy…' failures (the headless clipboard was denied), not 'Address copied'. Bottom-left is the shared ToastProvider default across the app, so a portal-only placement trades consistency for proximity.

### BPORTAL-V01

**Sign-in fields and buttons are 40px tall on phones, under the 44px touch size**

Low · Fix · effort S · `/login, /login/forgot, /login/reset, /p/welcome/password` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** authInputClass and authButtonClass are h-10. On mobile WebKit the Email field, Password field and Sign in button all measure 40px, and so do the three welcome-page fields. Every portal sign-in on Oct 29 goes through these.
- **Why:** The spec's reuse check (§7, Touch sizes) says Button and Input go to 44px on touch. These are the first controls every contractor taps on a phone.
- **Change:** Add pointer-coarse:h-11 to authInputClass and authButtonClass, so fields and the primary button are 44px on touch. Keep 40px with a mouse.
- **Desktop, tablet, phone:** Phone 375 and 320 and tablet 768: 44px fields and button. Desktop: 40px as today. Nothing drops.
- **Reuse:** authInputClass and authButtonClass in src/app/login/_components/auth-frame.tsx:44-48.
- **Code:** `branch: src/app/login/_components/auth-frame.tsx:44-48`
- **Verification:** verifier-found

### BPORTAL-V02

**The '2 new' pill is the same blue as the Scheduled status chip**

Low · Design change · effort S · `/p My jobs cards` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The unread pill is filled bg-primary, which is #1d4ed8 (blue-700) in light mode (my-jobs.tsx:123-127; globals.css:12). The Scheduled status Badge uses blue-700 text on blue-50 (ui.tsx:116). A Scheduled job with new updates shows two blue marks on one card, one meaning unread and one meaning a status.
- **Why:** CLAUDE.md: statuses keep fixed colors that no other mark in the same view reuses, and a mark in a card's top-right corner means new or unread. A blue unread pill next to a blue status chip blurs both.
- **Change:** Keep the count text ('2 new') but drop the primary fill. Use a small dot in the card's top-right plus the count in foreground-weight text, or a neutral zinc-900 pill with white text (zinc-100 on zinc-800 in dark). No status tone should match it.
- **Desktop, tablet, phone:** The same on phone, tablet and desktop. At 320 the count stays a single short pill or dot, so the title still truncates first.
- **Reuse:** JobCardLink in src/app/(portal)/p/_components/my-jobs.tsx; Badge tones in src/components/ui.tsx stay as they are.
- **Challenges:** §6 My jobs specifies a '2 new' badge on the card. This keeps the count and changes only its color, but it's still a design change for Connor to approve.
- **References:** 
  - [Turo](https://mobbin.com/screens/282dcdf8-5335-45eb-99db-b472f9a821cf): Unread cards carry one small dot in the top-right corner, apart from any other color on the card.
  - [Alma](https://mobbin.com/screens/6ea822ea-fbfa-46da-b996-22c85056bb6e): A top-right dot marks unread while the category chip keeps its own tint.
- **Code:** `branch: src/app/(portal)/p/_components/my-jobs.tsx:123-127`, `branch: src/components/ui.tsx:116`, `branch: src/app/globals.css:12`
- **Verification:** verifier-found
