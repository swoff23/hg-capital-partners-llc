# Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve

Part of the [UI/UX review](README.md). 35 findings: 0 critical, 4 high, 14 medium, 17 low.

## How it should work

HG Jobs should feel like a well-run crew app with one purpose: get Zack from a text to the right door, then back to Connor with proof, without a phone call. The door is a single-use invite and one password field on the app's own tokens, as quiet as Linear's sign-in (https://mobbin.com/screens/99fded1c-9799-4744-9f2c-dd5b3232531d). When a link goes out, the screen names the address it went to (https://mobbin.com/screens/6ac75dec-5c85-4c3d-ad9e-717601c1fc9d).

My jobs is one date-grouped list in the spirit of Things 3 Upcoming (https://mobbin.com/screens/1f3adaff-5def-4789-a938-456435ecd4df). The day heads each group, the street sits under each title, and new activity is a blue dot, as in Linear Mobile's inbox (https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3). A job that was sent back pins above the list with its reason, the way Airbnb pins the one thing blocking a host (https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a). Done rows carry the approval date, as Brex's status timeline does (https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811).

The job page reads like a Jobber visit (https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): status, title, address with Directions. A Getting in block, taken from Airbnb's check-in screen (https://mobbin.com/screens/25dd3338-ae57-4a06-ae0a-5ea10e847004), holds the code, where the lockbox is and the unit's access notes. If Connor moved the date, one line at the top says so, like Flighty's departure change (https://mobbin.com/screens/09e08a95-1063-4e78-baeb-a68dddb6136a). Under the update box, one line says Connor and Pieter get it by email, as Basecamp does (https://mobbin.com/screens/3463d54d-1e84-4b06-8a9a-5ee44fa39cea). Zack can pick the day he will come. Mark done flags unticked items like Jobber's close-job sheet (https://mobbin.com/screens/31b78019-ddde-46db-abd9-cefe611bd8a7), and the payoff follows Gusto (https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): line art, what happens next, the next job. A weak signal never costs him the page or his note.

For the partners, review is a queue, not a banner. Each Needs review row opens a two-pane panel like Mercury's reimbursement review (https://mobbin.com/screens/8156ac94-1476-4ca2-801e-89444dd78545): photos on the left, the timeline and Approve or Send back on the right, Undo in a toast, then the next waiting job, the way Superhuman steps through mail (https://mobbin.com/screens/ac146694-19c7-4bbd-81dc-409591cebd20). The email Zack receives says approved. The Portal access card reads like Clerk's user header (https://mobbin.com/screens/4449c0bd-4fe5-4bb8-915d-7b85cedb7f60): one status line, last active, and a warning when an email bounces. Cancellations follow Cal.com (https://mobbin.com/screens/ae2c874a-98e8-4b13-ad9c-9f474a308037), with the old date struck through.

<details><summary>What the reviewer covered</summary>

Port 3200 was up. Exercised: the current /login signed out (Chromium) at mobile 375, narrow 320 and desktop 1280, empty and filled, with the ARIA tree and measured control sizes (inputs and Sign in 40px tall, header links 20px). None of the branch (commit f59e6ad) runs, so I rebuilt two branch screens in the live page using the branch's exact class strings: /p/welcome/password (AuthFrame with 3 fields) inside the live /login at 375 and 320, and the /p placeholder (HG Jobs header, saved notice, "Hi Zack", EmptyState) inside a signed-in page at 375 and 1280 in light and dark. I copied renderPlainEmail verbatim from src/lib/email/render.ts into scratchpad/review/g1a/gen-email.mjs and filled three samples: the spec's D19 bundle ("Connor updated 'Cabinet install'..."), a D20 Mark done email, and the reset email the branch already sends. Each was shot through file:// at 375 and 1280 in light and dark. The dark render is identical to light because the template has no color-scheme support. Plain-text versions were read too. Data checks on :3200: I walked all 29 contractor pages for email and phone (15 have an email, 14 don't, 7 have neither) and listed open jobs for Zack (4, all targeted Aug 31 to Sep 18 2026) and Jose (1, Aug 28). Code read: login page, actions and auth-frame; forgot, reset and reset/submit; the (portal) layout, page, welcome page and actions; email render and send; portal accounts, reset, session, credentials, tokens and limits; env; the root not-found; spec sections 3, 5.1, 5.3, 5.4, 6 and 10. Paper walk as Zack on an iPhone with the D14 starting password: tap the text, tap the link, type the email, switch to Messages to read the password (iMessage copies a whole bubble), type 14 characters into a dotted field, Sign in, then type the starting password again plus the new password twice. That is about 25 taps, 35+ keystrokes, 2 to 4 app switches, and 60 to 120 s with no typos. One typo clears the email and restarts. With a one-time invite link it is about 5 taps and 15 s. Branch versus the PUBLIC findings: it fixes PUBLIC-015 (Forgot password?, shown only with the flag on). It partly fixes PUBLIC-016 (aria-labels on inputs, and an h1 on forgot, reset and welcome, but /login itself still has no h1 and no visible labels) and PUBLIC-017 (role=alert announces the error, but the email is still cleared and the error stays in ?error=). It does not fix PUBLIC-018 (no pending state) or PUBLIC-019 (AuthFrame still renders the marketing header and footer). PUBLIC-005 is also still open: login always redirects to / or /p, so an email's Open job link loses the job after sign-in. Could not reach: real server behavior of forgot, reset, welcome and PORTAL_ENABLED; sms: links on a device; Apple Mail, Gmail or Outlook rendering; WebKit; any Portal access card, job page, Mark done sheet, payoff or Review banner (spec only, judged on paper). About 20 Mobbin searches; only returned screens are cited.

</details>

## Findings

### G1A-001

**Text Zack a one-time invite link instead of a starting password**

High · New capability · effort M · `Contractor first sign-in: Text login details, /login, /p/welcome/password` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The branch builds D14 as specified. 'Create login' (Portal access card on /contractors/[id]) generates a starting password like k7mq-4vxp-2hzt and shows it once with Copy and 'Text login details'. The text body is 'Hi Zack, it's Connor. Your HG jobs: <origin>/login. Email: …. Starting password: …. You'll pick your own when you sign in.' Zack then signs in on /login (public header, HG LOGIN eyebrow, empty email field) and is sent to /p/welcome/password, which asks for the starting password again plus the new one twice. There is no single-use invite link.
- **Today:** Under D14, Connor creates a login and gets a generated password like "k7mq-4vxp-2hzt" (tokens.ts generateStartingPassword), which he texts. Zack taps the link and lands on /login: marketing header, a gold "HG LOGIN" eyebrow, and an email field he must type into. He then switches to Messages to read the password. iMessage copies a whole bubble, so he can't paste the password alone and retypes 14 mixed characters into a dotted field with no Show. Next, /p/welcome/password asks for the same starting password again, plus the new password twice. On paper that's about 25 taps, 35+ keystrokes and 2 to 4 app switches, 60 to 120 s if nothing goes wrong. A typo clears the email (PUBLIC-017) and he starts over. The password also stays readable in both phones' message history.
- **Why:** The bar is Zack getting from a text to his first job in under a minute without calling Connor. Invite flows on Square, Dropbox and Hotjar send a single-use link that opens a set-password page with the email already filled in, so nothing secret is retyped or left lying around. Texting a password and asking for it twice is the slowest, most error-prone version of D14.
- **Change:** Make the card's primary action "Text invite". It mints a single-use invite token: reuse PasswordResetToken with a purpose column and a 7-day expiry, checked read-only on GET and consumed only on POST, so iMessage link previews can't burn it. It then opens sms: with: "Hi Zack, it's Connor. Your HG Jobs login is ready: <link> It works once, for 7 days." The link opens an app-styled page with heading "Hi Zack, choose a password", the email shown read-only, one password field with Show, and a Continue button. On submit: set the password, clear mustChangePassword, start the 30-day session and land on My jobs. Expired or used link: "This invite no longer works. Ask Connor for a new one." Keep the starting-password path only as a fallback for a contractor with no phone.
- **Desktop, tablet, phone:** Phone 375 is the target: one field near the top so Continue stays above the keyboard, no marketing header. Tablet 768 and desktop 1280: the same 400px column centered. On desktop Connor can Copy the link and paste it into email or WhatsApp. Nothing drops on phone.
- **Reuse:** src/lib/portal/reset.ts (token mint, resetTokenIsUsable read-only check, atomic consume in finishPasswordReset); src/app/login/reset/page.tsx as the page base; accounts.ts createPortalAccount without generateStartingPassword; session.ts startPortalSession.
- **Challenges:** D14 ("Connor sets a starting password; the first sign-in forces them to choose their own"). The proposal keeps D14's email-and-password login, the shared /login page and the 30-day session, but replaces the texted starting password with a one-time set-password link.
- **References:** 
  - [Square](https://mobbin.com/flows/f37841a1-9dcc-486e-8335-53202935e63b): The invite opens "Finish account setup by creating a password" and goes straight into the app.
  - [Dropbox Dash](https://mobbin.com/flows/ce8efbc7-31d7-477b-ac16-795063b40819): Join page with the invited email prefilled read-only and one password field with an eye toggle.
  - [ManyChat](https://mobbin.com/screens/b15d6226-6917-489c-a4f0-bc0a6bdd705e): Invite link that is single-use with a stated lifetime, plus a Copy button.
  - [Vrbo](https://mobbin.com/screens/0f2d5cd2-5f94-427d-b8e9-7b5a0ee651d6): One password field with Show and one primary button.
- **Code:** `branch: src/lib/portal/tokens.ts:35-51`, `branch: src/app/(portal)/p/welcome/password/page.tsx:27-63`, `branch: docs/asana-migration-plan.md:75,191`, `src/lib/portal/tokens.ts:43-51 (generateStartingPassword)`, `src/lib/portal/login-text.ts:12-29 (text body)`, `src/app/(app)/contractors/[id]/portal-access-card.tsx:221-253`, `src/app/(portal)/p/welcome/password/page.tsx:27-63`
- **Verification:** confirmed. Checked against code: generateStartingPassword makes 'k7mq-4vxp-2hzt' (14 characters), /login has no email prefill and clears the form on a failed sign-in (login/actions.ts:42-46), and the welcome page asks for the starting password again (welcome/password/page.tsx:30-39). The portal isn't in the 3200 build (/p, /login/forgot and /login/reset return 404), so the screens were checked through the code plus the prior simulated renders, which I opened. The recommendation reuses resetTokenIsUsable (read-only on GET) and the atomic consume, so link previews can't burn the token. Mobbin: Square flow f37841a1 is real ('Finish account setup by creating a password'). Its own page still asks for Create and Confirm, each with an eye toggle, so it backs the invite link more than the single field. If this is adopted, G1A-003, G1A-011 and G1A-034 become fallback-only and G1A-042 is unnecessary. conflicts_with correctly names D14.

### G1A-005

**Name the job and property in contractor emails, and list each change on its own row**

High · Design change · effort M · `Contractor update email (D19 bundle)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly fixed: the job and property are named and each change has its own row.
- **Today:** The built email is better than the spec sample. Subject: 'Connor updated Cabinet install' (no quotes). Body line: '<title>, <short address>' (e.g. 'Cabinet install, 23 Sherwood St'). Then one row per change, e.g. 'Connor moved the target to Fri, Oct 30' and 'Connor: "Doors arrive Thu" (+1 file)', and one 'Open job' button, with plain text mirroring this. Still missing: the unit (only the address is passed), the previous date on a target change, a label saying a row is a comment, and curly quotes (comments are wrapped in straight quotes).
- **Why:** Zack works several jobs across several properties. The email alone should say where and what changed, without opening the app. Linear shows changes as rows ("Status: Backlog to In Progress"), which you can skim on a lock screen.
- **Change:** Pass the unit into taskEmail so the line reads 'Cabinet install, 415 Crescent Ave, Unit 2'. Carry the old date into the TARGET item ('Target: Fri, Oct 30 (was Thu, Oct 29)'). Render comments as 'Connor wrote: “Doors arrive Thu”' with curly quotes. Optionally split the title and the address into a title row and a meta row in renderPlainEmail.
- **Desktop, tablet, phone:** Phone: rows stack the label above the value when the value wraps. Desktop: two columns inside the 480px card. Plain text is the same in every client.
- **Reuse:** src/lib/email/render.ts (add title, meta and rows); the outbox bundle builder in §5.4.
- **References:** 
  - [Linear](https://mobbin.com/screens/d72f2b29-f2c7-4c5c-ba79-91225b6ae873): An update card shows "Status Backlog to In Progress" as one labeled change row.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): The activity list writes each change as a short sentence with the actor.
- **Code:** `PORTAL/email.txt`, `branch: src/lib/email/render.ts:10-18,55`, `branch: docs/asana-migration-plan.md:296`, `src/lib/notifications/content.ts:88-120 (itemText, itemLine)`, `src/lib/notifications/content.ts:138-172 (subject and line)`, `src/lib/notifications/content.test.ts:69-87`, `src/lib/email/render.ts:10-20,45-66 (items rows)`, `src/lib/tasks/core.ts:518,558 (TARGET and COMMENT summaries)`
- **Verification:** confirmed. The sample line is the spec's own (plan line 296), and renderPlainEmail takes one `line` string (render.ts:10-18). The plain text matches (shots/PORTAL/email.txt). Without push notifications (D26), email is the contractor's only change channel, so 'moved to Fri' without a date or address can send someone on the wrong day. This extends the approved one-button layout (screen 7) without breaking it, because it keeps one button. The Linear references show change rows in-app, not email, but they support the anatomy.

### G1A-008

**14 of 29 contractors have no email, so they can't get a login on Oct 29**

High · Fix · effort S · `Contractors directory and the Oct 29 invites (D22)` · Contractor jobs and media close the loop · quick win

- **Migration branch:** Still applies on the migration branch. Still open at 9f74ea1: nothing changed for this. The 14 missing contractor emails are data only Connor can supply. /contractors still has no portal-readiness column or filter, and the Portal access card still doesn't warn about shared-looking addresses such as info@ or office@. Both are design calls for Connor. /contractors is unchanged: a Table of Name, Company, Trades, Phone and Docs, with no portal status column and no readiness filter (Ready, Needs email, Needs phone, No portal). The Portal access card does ask for the email inline, prefilled from the contact (e.g. [email]) and editable, but it doesn't warn about shared-looking addresses like info@ or office@.
- **Today:** Verified in the local DB: 15 of 29 have an email (all 15 also have a phone), 14 don't, and 7 have neither. Brandon's address is [email]. But the Asana snapshot pulls every workspace member's email (scripts/asana/10-snapshot.ts:392), and the importer's people report prints it (src/lib/asana/report.ts:100). Contractors who use Asana can be filled from that report, so the gap is partly closable without asking them.
- **Why:** Finding this out on invite day means 14 phone calls and a rollout that stalls halfway.
- **Change:** Before Oct 29, add a readiness filter to Contractors: Ready (email and phone, 15), Needs email (14), Needs phone (7). Connor marks the ones who will never use the portal (likely Fox Pest, Nick, Dust 2 Sparkles) as "No portal" so they leave the count. The Portal access card asks for the email inline when it's missing, and warns when the address looks shared (info@, office@).
- **Desktop, tablet, phone:** Desktop: a segmented filter above the directory table. Tablet and phone: the same filter as a single row, with list rows showing a muted "Needs email".
- **Reuse:** Contractors directory; ADMIN-015's portal status column; SegmentedControl (spec extraction).
- **References:** 
  - [Homerun](https://mobbin.com/screens/1cc714ac-8ff0-43a8-915b-af7061b2516c): Separate Pending invitations and team lists, with status chips and a row menu.
- **Code:** `g1a/emails-spec.json`, `branch: src/lib/portal/accounts.ts:103-104`, `src/app/(app)/contractors/page.tsx:22-64`, `src/app/(app)/contractors/[id]/portal-access-card.tsx:86-110`
- **Verification:** partly. I re-ran all 29 contractor pages (verify-G1A/contractor-email-phone.txt) and got the same names and counts. The fix should be a one-time fill before the 29th: pull emails from the Asana people report, ask the rest by text, and log shared inboxes. A permanent Ready / Needs email / Needs phone filter plus a new 'No portal' state on the directory adds chrome for a one-off job. Homerun reference is fine for invite status but doesn't support a readiness filter.

### G1A-I01

**A dropped connection on the job page throws away the page and Zack's note**

High · Fix · effort M · `Contractor job page (/p/jobs/[id]): checklist, update composer, Mark done sheet` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The tip's error boundaries are only src/app/(app)/error.tsx and src/app/(marketing)/error.tsx.
- **Today:** The :3300 build (4652abb) still reproduces it. With the write dropped, tapping Send on an update swapped the job page for Next's white 'This page couldn't load' screen with Reload and Back (console: TypeError: Failed to fetch). On the branch tip (commit 4cf099d), all four portal calls go through callAction (src/lib/action-result.ts). A dropped connection now returns { ok: false } with the toast 'No connection. Try again when you have signal.' The typed text, the open Mark done sheet and the photos stay put, and a checklist tick reverts on its own. The branch still has no src/app/(portal)/p/error.tsx.
- **Why:** Contractors work in basements and vacant units on one bar of signal. The most important tap, Mark done with a note, is the one most likely to fail, and today it ends on an unstyled page in Next's words, which reads as broken and loses the proof. Vercel's guidelines call for optimistic writes that roll back with a message, not a page swap.
- **Change:** The transport fix is done on the branch tip. What remains: add src/app/(portal)/p/error.tsx on app tokens for real render crashes ('Something went wrong on this job', 'Back to My jobs'), and consider a Retry action on the offline toast. Rebuild :3300 from the tip to confirm the toast path.
- **Desktop, tablet, phone:** Same behavior at every size. On 375 and 320 the toast sits above the bottom bar (useToastInset already reserves it); on desktop it sits bottom center. The sheet's error line stays one line at 320.
- **Reuse:** Extend G2B-V01's server-action helper, the portal ToastProvider and useToast in (portal)/p/layout.tsx, and the existing Sheet. New: (portal)/p/error.tsx modeled on (app)/error.tsx.
- **References:** 
  - [Qantas Airways](https://mobbin.com/screens/18f77caf-19d5-4199-98b4-a36f34096d23): Outside the library: a failed update keeps the screen and says so in a toast ('Unable to update... try again') instead of replacing the page.
  - [Alta](https://mobbin.com/screens/2b00c4b9-d2a6-4a6a-9d95-2aba49348be1): Outside the library: an inline 'Network offline. Reconnecting...' line above a message thread keeps the composer and its text.
- **Code:** `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-details.tsx:79`, `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:58`, `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:108`, `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:121`, `node_modules/next/dist/client/components/builtin/global-error.js:46 (the text shown; no error.tsx under src/app/(portal))`, `task-management-migration-4c9ddf HEAD: src/lib/action-result.ts callAction, OFFLINE_ERROR`, `task-management-migration-4c9ddf HEAD: src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:57-67,111,124`, `task-management-migration-4c9ddf HEAD: src/app/(portal)/p/jobs/[id]/_components/job-details.tsx:80-81`, `git ls-tree HEAD src/app: no error.tsx under (portal)`
- **Verification:** confirmed. Reproduced on :3300 at 375 in Chromium with the write aborted: ticking 'Uppers', Send with 'Doors are cracked, need new ones', and Mark done with a typed note each swap the whole job page for Next's white 'This page couldn't load / Reload / Back' (pageerror TypeError: Failed to fetch). Only (app)/error.tsx and (marketing)/error.tsx exist; no (portal) error.tsx or global-error.tsx. withResult only catches server-side throws, so a transport failure escapes the awaited calls at job-details.tsx:79 and job-actions.tsx:58,108,121. This is the same defect as BPORTAL-001 (rated critical in the branch pass). branch/in-progress.md says the migration session is fixing it with a shared helper ('No connection. Try again when you have signal.') that keeps the note, sheet and photos. That fix isn't committed: the worktree at dd00a9e still throws. Merge it with BPORTAL-001 rather than listing it twice. High is right because Reload and a retry recover and nothing is corrected server-side. The Qantas and Alta references are outside the library and weren't spot-checked.

### G1A-002

**Email Zack when his job is canceled or moved off his list**

Medium · New capability · effort S · `Contractor emails (D19) and the job page` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Canceling a contractor's job sends nothing and shows nothing. A Canceled status event is INTERNAL (CONTRACTOR_VISIBLE_STATUS leaves it out), so notifyAudience never routes it to the contractor. The portal Updates allowlist (PORTAL_STATUS_UPDATES) leaves Canceled out too. Reassigning or unassigning revokes TaskAccess in the transaction with no email to the old assignee, and any unsent row for them is dropped at send time ('no access'). The job just moves to Done on My jobs with no explanation.
- **Today:** D19's parenthetical (scheduled, sent back, approved) leaves out Canceled. But §5.4 (plan line 296) says the contractor is emailed on any staff status change, so a cancel email is arguably already in scope. The real gaps: (a) the portal timeline allowlist (plan line 205: scheduled, started, sent back, approved, done) leaves out canceled, so the job page can't say it was canceled; (b) unassigning or reassigning revokes TaskAccess, and no email is defined for it.
- **Why:** Zack is scheduled Thursday at 415 Crescent. Connor cancels the job, or gives it to Jacob, and Zack drives over anyway. Closing the loop matters more when work is taken away than when it's added. Booking tools say plainly that an appointment was canceled, with the date and place.
- **Change:** Add two D19 triggers, still bundled per job. Canceled: subject "Canceled: Cabinet install, 415 Crescent Ave", line "Connor canceled this job. No need to go.", button "My jobs". Removed (reassigned or unassigned): subject "Cabinet install is off your list", line "Connor moved this job off your list. No need to go.", button "My jobs". Never name the new assignee. Send nothing if the job was added and removed within the same bundling window. The enqueue happens inside the revoke transaction, addressed to the old assignee.
- **Desktop, tablet, phone:** Email at all widths. The plain text has the same two lines and the My jobs URL.
- **Reuse:** NotificationOutbox and renderPlainEmail (src/lib/email/render.ts); the TaskAccess revoke in core.ts writes the outbox row.
- **Challenges:** D19, whose enumerated triggers leave out canceled and removed-from-list.
- **References:** 
  - [Cal.com](https://mobbin.com/screens/ae2c874a-98e8-4b13-ad9c-9f474a308037): 'This event is canceled' as a heading over What, When (struck through) and a Reason row: the shape for the canceled-job email and its landing line.
  - [Flighty](https://mobbin.com/screens/8f5e2b0f-33db-4817-82e1-b1ec7c0d2bed): A canceled record keeps its times visible but struck through with one plain 'Canceled' word, so the person sees exactly what no longer applies.
  - [Zocdoc](https://mobbin.com/screens/789e37c5-228a-4221-be2d-a650a831b45f): "Appointment cancelled" gives who, when and where in one sentence.
  - [Fresha](https://mobbin.com/screens/fba90558-d255-4d0e-aa0f-7d9e7a5b22ea): A canceled booking keeps its page with a Cancelled chip, date and place.
- **Code:** `branch: docs/asana-migration-plan.md:80,205,296`, `src/lib/tasks/rules.ts:28-32 (CONTRACTOR_VISIBLE_STATUS excludes CANCELED)`, `src/lib/tasks/rules.ts:53-67 (notifyAudience)`, `src/lib/portal/job-view.ts:156 (PORTAL_STATUS_UPDATES)`, `src/lib/tasks/core.ts:112-124 (access revoked, no notify)`, `src/lib/notifications/content.ts:55-61 (row dropped when access is gone)`
- **Verification:** partly. The unassign and reassign gap is real, and the copy is good. The cancel half is overstated because §5.4 already emails contractors on any staff status change. Calibrated to medium: a cancel or reassign of a scheduled job is rare, and the fix is S. Fresha and Zocdoc references are plausible.

### G1A-004

**Give the contractor journey one look, on app tokens, from sign-in to My jobs**

Medium · Design change · effort M · `AuthFrame (/login, forgot, reset, welcome) to /p` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. AuthFrame is unchanged: fixed #080b12, the public header (Rentals, Residents, HG Login), a gold 'HG LOGIN' eyebrow and rule, and the public footer, on /login, /login/forgot, /login/reset and /p/welcome/password. After sign-in, /p switches to app tokens (light #f7f7f8 background, 'HG Capital' wordmark, avatar), so the contractor crosses two visual systems in one flow.
- **Today:** Accurate: AuthFrame is a fixed #080b12 page with the public nav (Rentals, Residents, HG Login), a gold HG LOGIN eyebrow and rule, and the footer. I measured the inputs and button at 320x40 at 375 and 768 (16px text on touch; verify-G1A/login--mobile-light.png). Overstated: the cited Stripe sign-in keeps a brand gradient backdrop behind a plain white form card. So the research supports a product-style form card inside a brand frame, with no marketing nav, rather than proving the door must move to app tokens.
- **Why:** Stripe's sign-in, and Ramp's and Linear's, look like the product you're entering, not the marketing site. Going from a dark, gold, letter-spaced frame to a bright app page reads as a bolted-on portal. The marketing nav also lets a contractor wander to /rentals halfway through choosing a password.
- **Change:** Rebuild AuthFrame on app tokens. Background var(--background); a centered surface card with a 24px HG mark; an h1 per screen ("Sign in", "Choose your password", "Forgot your password?"); labeled Input, Field and Button primitives, 44px on touch. It follows the phone's theme through the existing THEME_SCRIPT. No marketing header; one muted "hgcapitalpartners.com" link in the footer. The /p header uses the same mark, and the emails follow suit (G1A-033). Keep AuthFrame's title and subtitle API so the four pages change only their imports.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a 400px card centered on the background. Phone 375: full-bleed with the card chrome dropped, 16px gutters, top-aligned so the keyboard never covers the button. Nothing drops.
- **Reuse:** src/components/ui.tsx Input, Field, Button; src/components/theme-toggle.tsx THEME_SCRIPT; auth-frame.tsx keeps its API.
- **Challenges:** CLAUDE.md Personality, "Two surfaces, two palettes", and the auth-frame.tsx header comment that puts the sign-in screens on the public palette. Research favors the app's own look for the door into the app.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/99fded1c-9799-4744-9f2c-dd5b3232531d): Sign-in on a neutral surface: a small centered mark, one question as the heading, one field, one button, 'Back to login'. No marketing chrome.
  - [Linear Mobile](https://mobbin.com/screens/6ac75dec-5c85-4c3d-ad9e-717601c1fc9d): The follow-on screen keeps the same frame, so every step of the door looks like one product.
  - [Stripe](https://mobbin.com/screens/46b46f0f-6cb5-4f1e-85a3-bb0606894379): Sign-in is a white app card with an h1, labeled fields and Forgot next to the Password label.
  - [Square](https://mobbin.com/flows/f37841a1-9dcc-486e-8335-53202935e63b): Set-password page in the product's own plain look, then straight into the app.
  - [Shopify](https://mobbin.com/screens/50eb7f20-161a-4a0e-9c7f-a8e24f282ccd): Sign-in shows only the brand mark above the card, with no marketing nav.
  - [ChatGPT](https://mobbin.com/screens/cb356d6b-8b8b-43fc-b11f-18d56a5f61d6): A wordmark-only header on auth pages.
- **Code:** `branch: src/app/login/_components/auth-frame.tsx:4-48`, `src/app/login/_components/auth-frame.tsx:10-42`, `branch: src/app/login/_components/auth-frame.tsx:22-41`, `branch: src/app/(portal)/p/page.tsx:19-24`
- **Also found as:** BPORTAL-032 (Branch: contractor portal and contractor sign-in)
- **Verification:** partly. The case for dropping the marketing nav and moving to labeled 44px fields is solid. Moving the door to app tokens is a taste call that challenges the house rule (named correctly). Calibrated to medium: this is a deliberate brand choice and doesn't block a job. Stripe 46b46f0f and d36ef36b are real screens, and they show the gradient frame.

### G1A-006

**Put the photos, checklist and note in the Mark done email to partners**

Medium · New capability · effort M · `Partner email for a contractor Mark done (D20)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Mark done (contractor sets Review) emails both partners with subject 'Zack marked Fix front steps done', the line 'Fix front steps, 767 Prospect Ave', the item 'Zack marked it done', and an 'Open task' button. There are no photo thumbnails, checklist count or contractor note, and Mark done collects no note.
- **Today:** The D20 email's content isn't specified anywhere. 'Zack marked Fix front steps done · 4 photos' is the previous reviewer's own sample (scratchpad g1a/gen-email.mjs), copied from the Review banner text. The spec fixes only the format: one line and one button (screen 7, approved). Mark done doesn't collect a note from the contractor in the spec either.
- **Why:** The only question is whether to approve, and partners read this on their phones between other jobs. Approval tools like Airwallex and Aboard put the evidence right next to Approve.
- **Change:** For Mark done only, sent to both partners: title "Zack finished Fix front steps"; meta "767 Prospect Ave, Unit 1"; up to 4 photo thumbnails (signed thumb URLs valid 7 days, partner emails only, never contractor emails); "Checklist 5 of 5"; Zack's note quoted; button "Review" linking to /tasks/[id]#review. Never approve through a GET link, since mail scanners prefetch links.
- **Desktop, tablet, phone:** Phone: thumbnails in a 2x2 grid about 140px each. Desktop: 4 across at about 104px. Plain text: "4 photos, checklist 5 of 5" plus the note.
- **Reuse:** TaskAttachment.thumbPathname (§5.2), the signed-URL logic in /api/files (§5.3), render.ts rows from G1A-005.
- **References:** 
  - [Airwallex](https://mobbin.com/screens/a21ef4c4-38e3-475e-b8b0-2618f40df869): Pending approval shows the amount, submitter, receipt image and Approve together.
  - [Aboard](https://mobbin.com/screens/d15cd548-a758-4743-8944-99c825340019): Approval side panel: details and approval flow above Reject and Approve.
- **Code:** `branch: docs/asana-migration-plan.md:81,297`, `src/lib/tasks/core.ts:340-349 (summary 'marked … done', notify)`, `src/lib/notifications/content.ts:104-109,138-145`, `src/lib/email/render.ts:10-20`
- **Verification:** partly. Keep the text parts (title, address, 'Checklist 5 of 5', photo count, note, Review button) and drop the thumbnails. Seven-day signed image URLs sent by email break §5.3's file model, where everything is private, checked per request, and only videos get a 10-minute signed URL. Text-only also keeps screen 7's plain layout. conflicts_with should name §5.3 and the approved screen 7 ('Plain emails with one button'). Calibrated to medium. Airwallex and Aboard are in-app approval screens, not emails.

### G1A-007

**Make the Review banner a proof card with photos, checklist and note above Approve**

Medium · Design change · effort M · `Staff task page, Review banner (/tasks/[id])` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The Review banner is built exactly as approved: one card line, '[avatar] Zack marked this done · 4 photos', with Approve (primary) and Send back (secondary). It shows no time, no photo strip, no checklist count and no note. The photo count is every photo or video the contractor ever uploaded to the job, not just this visit. I couldn't see it live: the branch DB has no task in Review (Today shows no Needs review section).
- **Today:** The spec's main column runs status, title, notes, checklist, photos and videos, then activity (plan lines 401-402). Photos have their own section rather than sitting 'among imported history'. Mark done doesn't collect a contractor note (plan line 423), so 'Zack's note' doesn't exist yet.
- **Why:** Approve is a judgment on evidence, so the evidence belongs next to the button. Plane puts Accept and Decline beside the status, and Airwallex keeps the proof and the actions in one view.
- **Change:** In Review, the top of the main column shows one card: "Zack marked this done · Tue 2:14 PM"; a strip of the photos from this visit (tap opens the lightbox); "Checklist 5 of 5"; his note. Actions sit right: Send back (secondary) and Approve (primary). Once resolved, the card becomes a timeline event (G1A-014).
- **Desktop, tablet, phone:** Desktop 1280: the card is in the main column and the rail is unchanged. Tablet 768: the same card under the chip row. Phone 375: the card holds a sideways photo strip, and Send back and Approve take over the sticky bottom bar in place of the composer until the review is resolved.
- **Reuse:** Card, Button, Badge (ui.tsx); the media grid and lightbox (spec, new); components/activity-timeline.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/cbeea523-ab61-492f-b65f-2d715ab9be54): Review state: the evidence is large on the left; the right column has the amount, a short Submitted then Pending Review timeline, and Approve and Decline inline under it.
  - [Mercury](https://mobbin.com/screens/8156ac94-1476-4ca2-801e-89444dd78545): Approve explains its consequence on hover; HG's Approve can carry the line 'Zack gets an email' the same way, as text on touch.
  - [Plane](https://mobbin.com/screens/3351e358-14f8-4b9e-b952-123d41b9104f): Intake item with Accept and Decline in the header beside the Pending chip.
  - [Airwallex](https://mobbin.com/screens/a21ef4c4-38e3-475e-b8b0-2618f40df869): Evidence and the Approve and Request resubmission actions share one view.
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): Evidence on the left, status timeline (Submitted, Approved, Payment pending) and the one decision button on the right; the decision happens next to the proof.
  - [Brex](https://mobbin.com/screens/979ac405-adb3-4133-87cf-2a3abc3d79f1): Review sheet names exactly what failed (Date, Amount, Merchant) as red chips, the model for a Send back reason tied to a photo.
  - [ClassDojo](https://mobbin.com/screens/8767e826-c7af-478c-a797-8a02b71f4006): 'Needs Review' viewer: the submission large, the note beside it, and Approve or Return as draft in the panel
  - [Upwork](https://mobbin.com/screens/8a15b565-a0ee-4914-8adf-0b3dd0887b52): Review submission shows the message, its date and the files, then Pay now or Request changes
  - [Fiverr](https://mobbin.com/screens/19fb54ab-2e2c-44bb-b012-e74f79877a68): Delivery viewer with arrows and thumbnail strip, reviewed before accepting
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): Review drawer: status timeline (Submitted, Pending Review), Approve and Decline, attachments with status.
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): Missing receipt and memo flagged above the status timeline.
  - [Brex](https://mobbin.com/screens/ecf850cc-08cc-46ef-b321-8248107afc9e): Timeline names who reviews next ('Pending review from ...').
- **Code:** `branch: docs/asana-migration-plan.md:399-406,430`, `src/app/(app)/tasks/[id]/review-banner.tsx:32-48`, `src/app/(app)/tasks/[id]/page.tsx:190-197 (photos = all media by that contact)`, `branch: docs/asana-migration-plan.md:66,404`, `src/app/(app)/tasks/[id]/page.tsx:36`, `branch:  (f59e6ad) prisma/schema.prisma:340-341`, `branch: src/app/(app)/tasks/[id]/page.tsx:150-151,190-197`, `branch: src/app/(app)/tasks/[id]/review-banner.tsx:33-48`, `branch: src/lib/portal/jobs.ts:131-137`, `branch: src/app/(app)/tasks/[id]/activity.tsx:99`, `src/app/(app)/tasks/[id]/task-detail.tsx:42-64`, `branch-src/src/app/(app)/tasks/[id]/review-banner.tsx:14-61`, `branch-src/src/app/(app)/tasks/review-actions.tsx:13-59`, `branch-src/src/app/(app)/tasks/task-list-context.tsx:97-99`, `branch-src/src/app/(app)/tasks/today-view.tsx:106-111`
- **Also found as:** G1D-007 (Photos, videos and documents: viewing and capturing, not just the upload box), TASKS-I09 (Tasks list, new task and task detail)
- **Verification:** partly. Putting this visit's photos and the checklist count beside Approve is a good refinement of approved screen #4. The note part depends on G1A-022 adding a note to Mark done. Calibrated to medium: the page isn't built yet (day 6), and the banner already links the evidence to the action. Plane and Airwallex references are plausible.

### G1A-009

**Clean up what each contractor will see first: past targets and shorthand titles**

Medium · Fix · effort S · `My jobs (first view on Oct 29)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. My jobs (/p) sorts open jobs by Target, soonest first, and shows a neutral 'Target Mon, Aug 31' even when the date has passed, so the stalest jobs lead. The Asana 'Will see' report lists each contractor's jobs with notes, comment and file counts and lockbox-looking text. It doesn't flag past targets, or titles with '?', another person's name or a date in parentheses. The branch DB's sample job has a future target, so the August data can't be checked here.
- **Today:** Data verified (verify-G1A/open-jobs-by-contractor.txt): Zack's 4 open jobs are all at 415 Crescent Ave (Aug 31, Sep 2, Sep 18, Sep 18), Jose has Aug 28, Idrius Aug 30, and Kenneth's has no date ('(Start TBD)'). These rows come from the August CSV in the local DB, and the Oct 27 Asana load replaces them. Sorting past-target jobs into No date would push the most overdue work below current jobs.
- **Why:** The first impression for 29 tradespeople is the list itself. Stale dates and internal asides make the product look unmaintained and invite "is this still on?" calls.
- **Change:** Add two flags to the per-contractor "will see" report (§5.1): Target in the past, and a title containing "?", another person's name, or a date in parentheses. Connor fixes them in the Oct 27 to 28 pass. In My jobs, a past target shows as muted "Target passed" and the job sorts into No date, so it doesn't lead the list. Re-run after the Oct 27 production load, since the Asana import replaces these rows.
- **Desktop, tablet, phone:** Report only, at every width. In My jobs the row still reads on one meta line at 375.
- **Reuse:** The "will see" report in §5.1; todayYmdEastern() in src/lib/dates.ts.
- **Code:** `branch: docs/asana-migration-plan.md:68,208-211`, `src/lib/portal/job-view.ts:64-79 (targetLabel, OPEN_ORDER asc)`, `src/app/(portal)/p/_components/my-jobs.tsx:114`, `src/lib/asana/report.ts:125-137 (will-see section)`
- **Verification:** partly. The report flags (past target, '?', another person's name, a date in parentheses) are a good, cheap fix. Re-running after the Oct 27 load is the right call. Drop the 'sort into No date' part: under D7 the target stays neutral, but it shouldn't move.

### G1A-010

**Portal access card: a status line, one primary action, and a ⋯ menu for the rest**

Medium · Design change · effort M · `Contractor page, Portal access card (staff)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly done: 'Last signed in' answers 'did Zack ever get in', and destructive actions confirm. The peer buttons and the missing invited state remain.
- **Today:** The card is built, titled 'Portal access', with an Active or Removed badge. With no login it shows an Email field and 'Create login'. Right after create or reset, the starting password appears once, in mono, with Copy and a primary 'Text login details'. With an active login it shows Email, 'Last signed in' ('Not yet' until he does), then Reset password and Sign out everywhere side by side, then Remove access (danger) below a divider. A removed login shows Restore access. Remove and Reset confirm with clear copy. There's no ⋯ menu, no device or last-active line, and no 'Invited, not signed in yet' state with a primary action. Once the page reloads, the only way to re-send the text is Reset password.
- **Why:** Six buttons on a small rail card is a control panel. Linear, Homerun and Ferndesk show one status line per member and put the rare actions in a ⋯ menu. Showing the status closes the loop: did Zack get in?
- **Change:** Keep the built confirms and the shown-once block. Make the active state show one status line ('Invited Oct 29 · not signed in yet', or 'Last signed in Oct 30 on iPhone' from the session userAgent) and one primary action for the invited state. Move Reset password, Sign out everywhere and Remove access into a ⋯ menu. The invited state needs a way to re-send a login without resetting the password, which ties to G1A-001.
- **Desktop, tablet, phone:** Desktop 1280: a rail card. Tablet 768: a full-width card under the header. Phone 375: a full-width row; ⋯ opens a bottom action sheet (MOBILE-027).
- **Reuse:** Card, Badge, Button (ui.tsx); React Aria Menu and Dialog (D9); ConfirmDialog; accounts.ts createPortalAccount, resetPortalPassword, disablePortalAccount, enablePortalAccount, signOutEverywhere.
- **References:** 
  - [Clerk](https://mobbin.com/screens/4449c0bd-4fe5-4bb8-915d-7b85cedb7f60): Identity header with 'Last active today' under the name and one Actions menu on the right: the status line plus overflow pattern for the access card.
  - [Clerk](https://mobbin.com/screens/a5fd142e-2cff-47fe-abb7-b43c5e805680): Invitations show Status (Pending), invited date and expiry in fixed columns, which maps to the Invited state of the card.
  - [Linear](https://mobbin.com/screens/dbf2fc9a-64ad-482a-9a01-49c81bacdee4): Members list with Status, Joined and Last seen columns, nothing more.
  - [Ferndesk](https://mobbin.com/screens/fdef2805-bbe5-45bf-8725-08a43f9bee10): "Invited on Apr 1" sublabel, a Pending chip and a ⋯ row menu.
  - [Stripe](https://mobbin.com/screens/61747ba0-d9e7-4b31-b62d-9834cb92a89f): A once-shown secret in mono with a copy action and an explicit Done.
- **Code:** `branch: docs/asana-migration-plan.md:189-197`, `branch: src/lib/portal/accounts.ts:137-213`, `src/app/(app)/contractors/[id]/portal-access-card.tsx:62-216`, `src/app/(app)/contractors/[id]/page.tsx:36,103-120 (only lastSignInAt is selected)`
- **Verification:** confirmed. The spec lists six peer actions (plan lines 189-195). enablePortalAccount has no planned UI, and lastSignInAt and lastSeenAt are never displayed (the only 'lastSeen' in the plan is TaskReadState). The card is approved screen #2, so this reorganizes an approved design, and conflicts_with could say so. Extra support: Square flow 89a8c78c ends on a team page that reads 'Jae hasn't accepted their invitation yet' with a Resend link, the same invited state proposed here. Linear, Ferndesk and Stripe references are plausible.

### G1A-012

**Send back opens an inline note that says what happens next**

Medium · Design change · effort S · `Staff task page, Send back` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Couldn't open it live: no task is in Review in the branch DB. Read from code.
- **Today:** Send back on the task page opens a Sheet titled 'Send back to Zack' with the label 'What needs another look?', a required textarea (autofocus), and a 'Send back' button disabled until there's text. The note posts as a Shared comment and is included in the contractor's sent-back email. Esc and close come from the Sheet. Still missing: a line saying what happens next (Zack gets an email and the job goes back to In progress) and any sign that the note is Shared. The submit button says only 'Send back'. On the Today list, sendBack sends its own note through the same action.
- **Why:** Toggl's Request changes names the consequence ("will get notified to make the changes") and asks what should change. A required note prevents a silent bounce that just makes Zack call.
- **Change:** Keep the Sheet. Under the field add 'Zack sees this and gets an email. The job goes back to In progress.', and label the button 'Send back to Zack'.
- **Desktop, tablet, phone:** Desktop and tablet: inline in the card. Phone: a bottom sheet over the action bar with the keyboard up.
- **Reuse:** The task page composer; React Aria Dialog as a sheet (D9).
- **References:** 
  - [Basecamp](https://mobbin.com/screens/247608e7-6b83-44cf-9383-a56447bdca37): An inline note field with a plain prompt, a 'When I post this, notify' line, and buttons 'Save' and 'Never mind': the model for an inline Send back note that says who hears about it.
  - [Mercury](https://mobbin.com/screens/cbeea523-ab61-492f-b65f-2d715ab9be54): Decline sits beside Approve inside the review panel rather than in a separate dialog.
  - [Toggl Track](https://mobbin.com/screens/1daab8f4-5ece-4dc3-8838-c5c7b443f98c): Request changes dialog: who gets notified, a comment field, one action.
  - [Airwallex](https://mobbin.com/screens/68f1a7f7-0e87-49a9-a9a9-6ec913167bf0): Asks for a reason before Require resubmission.
- **Code:** `branch: docs/asana-migration-plan.md:66,404,430`, `src/app/(app)/tasks/[id]/review-banner.tsx:45-84`, `src/lib/tasks/core.ts:337-345 (Shared comment, note in summary)`, `src/app/(app)/tasks/list-actions.ts:105-113`
- **Verification:** confirmed. The spec says only 'Send back (with a note)' (D6b, plan lines 66 and 404). Where the note goes, whether it's required and who sees it aren't defined. Locking it to Shared and requiring text are the right calls. Toggl and Airwallex references are plausible.

### G1A-015

**Make My jobs one date-grouped list with Done folded at the bottom, and no switches**

Medium · Design change · effort M · `My jobs (/p)` · Contractor jobs and media close the loop

- **Today:** The spec gives My jobs two segmented controls, Open | Done and By date | By property. Real data: Zack has 4 open jobs, all at 415 Crescent Ave; Jose has 1. Today /p is a placeholder.
- **Why:** Two switches over 1 to 5 rows is chrome. The property already shows on every row, so By property repeats it. Attio's My tasks uses one list with Today, Upcoming and Completed sections, and Jobber groups by day.
- **Change:** One list with sections Today, This week, Later and No date, each with a count in its header. A collapsed "Done (12)" row at the bottom expands the read-only history (D18). No segmented controls. Within a day, sort by street. The first section answers "where am I going today".
- **Desktop, tablet, phone:** Phone 375: sticky section headers and full-width rows. Tablet 768 and desktop 1280: the same list centered at 640px. Nothing drops.
- **Reuse:** todayYmdEastern() (src/lib/dates.ts); the Today grouping helpers from the staff Today view.
- **Challenges:** D31 (My jobs: By date / By property switch, By date first) and the §6 Open | Done control.
- **References:** 
  - [Things 3](https://mobbin.com/screens/1f3adaff-5def-4789-a938-456435ecd4df): Upcoming groups rows under large day headers ('17 Tomorrow', '18 Saturday') with the project as a gray sublabel: the date-grouped list with the street under each job.
  - [Attio](https://mobbin.com/screens/c45cd1e7-9589-42fd-8408-b8a6fe179a4b): Today, Upcoming and Completed as collapsible sections of one list.
  - [Todoist](https://mobbin.com/screens/e125665b-7826-429c-bff4-5f5c805e3730): Day headers like "Feb 5 · Tomorrow · Thursday" over plain rows.
  - [Jobber](https://mobbin.com/screens/2ed89ad5-4fb9-4c08-8a4a-fe521a09bfe9): Field-service schedule as a single day list.
- **Code:** `branch: docs/asana-migration-plan.md:92,410`
- **Verification:** confirmed. The data backs it more strongly than stated. In the local DB, 25 of 29 contractors have no open job, and the most anyone has is Zack's 4, all at one property (verify-G1A/open-jobs-by-contractor.txt). Two switches over 0 to 4 rows is chrome. Reference caveat: the Jobber screens cited elsewhere in this unit use switches themselves (3fe4fcd0 has Completed | Active | To Go; 2ed89ad5 has Day | List | Map). So the support is Attio: the Today, This week, Upcoming, Completed grouping is real (verified at https://mobbin.com/screens/16b2e7b2-da40-4dc2-a63b-139c3078c1d9). conflicts_with correctly names D31.

### G1A-016

**Job row: the new-dot owns the top-right corner, and status sits in one fixed spot**

Medium · Design change · effort S · `My jobs, job row` · Contractor jobs and media close the loop

- **Today:** The spec says cards show title, address and unit, status, Target date and a "2 new" badge, with no placement. House rule: a dot in a card's top-right corner means new or unread, and status sits in one fixed spot. Real titles run up to about 75 characters.
- **Why:** Without fixed positions, the status chip and the "2 new" badge compete for the same corner, and a long title gets cut on a 375 screen.
- **Change:** A row, not a boxed card. Line 1: title, up to 2 lines, with a blue dot top-right when something is new (title in a heavier weight while unread). Line 2: "415 Crescent Ave · Unit 2" muted. Line 3: status Badge left, target "Thu, Oct 29" right in tabular figures. The count ("2 new") moves to the job page's Updates header. The whole row is the link, at least 64px tall.
- **Desktop, tablet, phone:** Phone: 3 lines. Tablet and desktop: lines 2 and 3 merge into one meta line with the date right-aligned.
- **Reuse:** Badge (one tone per status, §7); list row pattern from the staff Today rows.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Unread inbox rows carry a small blue dot and stronger text; read rows go gray. One mark, one meaning.
  - [Jobber](https://mobbin.com/screens/e4979820-6f4e-4695-a160-4c243602d36c): Visit card: client, time, address, then status in a fixed corner.
  - [Jobber](https://mobbin.com/screens/3fe4fcd0-f1c7-4655-9c27-621ec11d5a3d): Appointment card with status at top-right and the title and time below.
- **Code:** `branch: docs/asana-migration-plan.md:410`
- **Verification:** partly. The fixed positions are right: a dot top-right only for new, and status in one spot. But 'title in a heavier weight while unread' uses weight for state, which CLAUDE.md Typography forbids ('use weight for hierarchy, never for state'), and conflicts_with doesn't name it. The dot alone should carry unread. Moving the '2 new' count off the card also changes the approved §6 card contents and should be named. Jobber e4979820 and 3fe4fcd0 are real and show status in a fixed corner.

### G1A-017

**Portal header: mark and Jobs on the left, an avatar menu on the right, aligned to the content**

Medium · Design change · effort S · `Portal header (/p)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly fixed.
- **Today:** /p's header now sits inside the max-w-2xl content column: the wordmark and the h1 both start at x=328 at 1280 and x=16 at 375. Instead of name text and a Sign out button there's an initials avatar (DC) that opens a menu. The wordmark reads 'HG Capital' rather than a mark plus 'Jobs'. The menu holds only 'Sign out', with no name or email, and there's still no Change password. The page still opens with an h1 'Hi Device' above the tabs.
- **Why:** Sign out is the rarest action under a 30-day session, yet it's the most prominent control. Jobber keeps Logout at the bottom of More and puts Change password in Profile. House rule: things that should line up, line up exactly.
- **Change:** Alignment and the avatar menu are done. Add the name and email as the menu's header and a 'Change password' item (changeOwnPassword already supports it). Replace the 'Hi Zack' h1 with the page title ('Jobs') or a one-line greeting that carries information ('Hi Zack, 2 jobs this week').
- **Desktop, tablet, phone:** Desktop and tablet: the header aligns to the 640px column. Phone: a 56px header with the avatar as a 44px target; the sheet slides up from the bottom.
- **Reuse:** Avatar (spec, new, neutral colors); React Aria Menu and Dialog (D9); accounts.ts changeOwnPassword.
- **References:** 
  - [Jobber](https://mobbin.com/screens/f06ceb5b-dc25-43f7-82e6-9c804527a06f): Logout is the last row of More, not a header button.
  - [Jobber](https://mobbin.com/screens/96a223ee-ed22-4832-a8bc-8b07ee26bab0): Profile with Change password for a field worker.
- **Code:** `branch: src/app/(portal)/p/page.tsx:14-32`, `src/app/(portal)/p/page.tsx:19-33`, `src/app/(portal)/p/_components/account-menu.tsx:10-30`, `eval /p: header 'HG Capital' left 328, h1 'Hi Device' left 328 (desktop); 16 and 16 (mobile)`
- **Verification:** confirmed. Seen in the desktop-dark render. The 'HG Jobs' wordmark sits at the left edge, while the status box and 'Hi Zack' start about 320px in (max-w-2xl column). 'Zack Reading' plus 'Hi Zack' repeat the name, and there's no later Change password even though changeOwnPassword supports it (p/page.tsx:14-32). The proposed greeting line matches the house example ('Hi Dana, here's what's due this week.'). Jobber references are plausible.

### G1A-019

**Define the job page's bottom bar for every status, and let Mark done skip Start**

Medium · Design change · effort M · `Job page bottom bar (/p job)` · Contractor jobs and media close the loop

- **Today:** The spec's job page keeps the composer in the scroll ('updates and a composer', plan line 421). Only the action bar is sticky, so the 'two sticky bottom bars on an iPhone SE' risk isn't in the spec; the sticky composer is on the staff task page. The rest holds: the bar is undefined for Waiting, Review, Done and Canceled, and D6c puts Start before Mark done.
- **Why:** Contractors often open the app only at the end to report. Forcing Start first adds a step and confuses them. An undefined Review state invites double Mark done taps. Two sticky bottom bars (actions and composer) would crowd an iPhone SE.
- **Change:** To do and Scheduled: a 44px camera icon button plus primary "Start job", with a text button "Already done?" that opens the Mark done sheet and records start and done together. In progress and Waiting: camera plus "Mark done"; Waiting also shows "Waiting on: parts" at the top. Review: muted "Sent for review · Tue 2:14 PM" plus the camera. Done: no bar. Canceled: no bar, with a top line "Connor canceled this job". The composer stays inline at the end of the page, never sticky.
- **Desktop, tablet, phone:** Phone 375: a 64px bar plus the safe area. Tablet 768: the same bar, max 640px wide. Desktop 1280: the actions move into the page header at right and there's no bottom bar.
- **Reuse:** Button (44px on touch); the uploader in components/attachments.tsx.
- **References:** 
  - [Jobber](https://mobbin.com/screens/fb82e72d-18f7-41ae-9127-6ec221711f74): Upcoming job: the primary button is the next step for that state ('Send Booking Confirmation') beside a ⋯ overflow.
  - [Jobber](https://mobbin.com/screens/1717a0a9-386f-4bfc-a4f6-3d9550db0778): Same job in 'Requires Invoicing': the buttons change to that state's next steps, showing a per-status action map.
  - [DoorDash Dasher](https://mobbin.com/screens/5cb6f086-abb8-4751-874a-e2901cb238e3): One full-width sticky primary ("Confirm pickup") for the next step only.
  - [Jobber](https://mobbin.com/screens/536351e7-656d-444e-867d-38eb7f48e146): Job detail with one primary action and a ⋯ beside it.
- **Code:** `branch: docs/asana-migration-plan.md:65-67,412-423`
- **Verification:** partly. Defining the bar for every status, and putting actions in the header on desktop, is worthwhile. 'Already done?' adds a control. Showing Mark done as the primary with Start as a secondary, or letting Mark done record the start, would be simpler. DoorDash and Jobber references are plausible.

### G1A-020

**Show the lockbox as large digits Zack can copy, with clear no-code and hidden states**

Medium · Design change · effort S · `Job page, lockbox (D21)` · Contractor jobs and media close the loop

- **Today:** D21 sets the rules: unit code, single-unit property, none otherwise, hidden once done. The spec has no layout or copy for the job page block. When there's no code, Zack sees nothing and doesn't know whether to ask.
- **Why:** At a door with gloves on, the code needs to read at arm's length. Postmates shows a PIN as big digits, and Airbnb says when access info isn't available yet instead of hiding the section.
- **Change:** A block under the address: label "Lockbox", then the code in Geist Mono at 28px with wide tracking and the unit ("Unit 2"); tap copies with a "Copied" toast. No code because the job has no unit: "No code on this job. Text Connor for it." with a Text button. After done: "Code hidden after the job's done". Never mention the view logging.
- **Desktop, tablet, phone:** Same block at all widths. On desktop the code is 24px.
- **Reuse:** src/lib/portal/access-code.ts (one code string); Toast.
- **References:** 
  - [Postmates](https://mobbin.com/screens/1a682178-2bc8-4fa2-942d-784f5463333d): A PIN in large separated digits, readable at a glance.
  - [Airbnb](https://mobbin.com/screens/25dd3338-ae57-4a06-ae0a-5ea10e847004): "How to get inside" says when the info will appear instead of hiding it.
- **Code:** `branch: docs/asana-migration-plan.md:82,196-201`
- **Verification:** confirmed. D21 sets the rules, but the job page block has no layout or copy (plan lines 82 and 417). The large mono code, tap-to-copy and the honest no-code line are good. Drop the after-done line ('Code hidden after the job's done'): a done job is read-only history, and the line adds nothing. Postmates and Airbnb references are plausible.

### G1A-027

**Tell a contractor when access is off or sign-in is locked, and how to get back in**

Medium · Fix · effort S · `/login error states for contractors` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. authenticatePortalAccount still returns ok:false for a disabled account or an inactive contact even with the right password. login() then calls fail(), which counts toward the lockout and shows 'Wrong email or password.' on /login. The locked state reads 'Too many failed attempts. Try again in 15 minutes.' with no link to reset.
- **Today:** authenticatePortalAccount returns ok:false for a disabled account or an inactive contact even with the right password, so /login says "Wrong email or password.". Forgot password shows the same "sent" notice but emails nothing (status isn't ACTIVE). The locked state reads "Too many failed attempts. Try again in 15 minutes." with no path to reset.
- **Why:** A removed contractor keeps retrying, gets locked out, resets, receives nothing, and calls. Saying access is off only after a correct password reveals nothing to someone without it.
- **Change:** Correct password but access off: "Your HG Jobs access is off. Text Connor if you need it back." (not counted as a failure). Locked: "Too many tries. Wait 15 minutes or reset your password.", with "reset your password" linking to /login/forgot when the portal is on.
- **Desktop, tablet, phone:** One-line error under the form at all widths.
- **Reuse:** accounts.ts authenticatePortalAccount (return a reason after verify); login/actions.ts fail().
- **Code:** `branch: src/lib/portal/accounts.ts:239-249`, `branch: src/lib/portal/reset.ts:64-69`, `branch: src/app/login/page.tsx:24-27`, `src/lib/portal/accounts.ts:229-249`, `src/app/login/actions.ts:42-46,59-60`, `src/app/login/page.tsx:24-27`
- **Verification:** confirmed. Verified: authenticatePortalAccount returns ok:false for 'disabled' and 'contact-inactive' even with the right password (accounts.ts:239-249), so /login says 'Wrong email or password.' startPasswordReset sends nothing unless status is ACTIVE (reset.ts:64-69). The locked line has no next step (login/page.tsx:26). Telling someone access is off only after a correct password reveals nothing new. The 'reset your password' link in the locked message must hide when the portal is off.

### G1A-V02

**Invite contractors who have an open job; let the first assignment email invite the rest**

Medium · Design change · effort S · `Oct 29 rollout (D22) and the first view of My jobs` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. D22 still reads "Invite every contractor Thu Oct 29" (plan:83). The empty-state copy on the branch's My jobs changed to "No open jobs right now." (my-jobs.tsx:83). The Portal access card on /contractors/cmtg25y9x000djphsbqty81fr offers only Email and "Create login", with no invite-later state. A contractor with no open job still lands on an empty My jobs on Oct 29.
- **Today:** In the local DB, only 4 of 29 contractors have an open job: Zack has 4, all at 415 Crescent Ave, and Idrius, Jose and Kenneth have 1 each. Brandon (32 jobs) and Jacob (21) have none open. D22 invites all 29 on Thu Oct 29, so most would sign in to an empty My jobs (today 'Your jobs will be listed here soon.'). Their next visit might come weeks later, after they've forgotten the password they chose.
- **Why:** An invite with nothing behind it makes the product look unused and turns into forgot-password requests later. The login is worth having from the moment there's a job to open. This also removes most of the day-one invite workload that G1A-042 tried to solve with a queue.
- **Change:** On Oct 29, invite the contractors that the Oct 26 'will see' report shows with at least one open job. For everyone else, the first D19 'assigned' email doubles as the invite: 'Connor assigned you Bathroom tile at 58 Mariner St. Choose a password to see it.' It carries the set-password link from G1A-001 and one button. Until then, their Portal access card reads 'Invite goes out with their first job'.
- **Desktop, tablet, phone:** Email and one card line; the email renders the same at every width.
- **Reuse:** The D19 'assigned' outbox trigger; the invite-purpose PasswordResetToken from G1A-001; the Portal access card states from G1A-010.
- **Challenges:** D22 ('Invite every contractor Thu Oct 29') and D0 ('every contractor on the portal'). Contractors with work are still on the portal by Nov 1, and the rest join with their first job.
- **References:** 
  - [Square](https://mobbin.com/flows/89a8c78c-4807-4757-8a69-86bd2c6abd85): Adding a team member sends the invite, and the team page then shows 'hasn't accepted their invitation yet' with Resend. The invite is tied to the moment there's a reason to join.
- **Code:** `verify-G1A/open-jobs-by-contractor.txt`, `branch: docs/asana-migration-plan.md:83,477`, `branch: src/app/(portal)/p/page.tsx:33`, `branch: src/app/(portal)/p/_components/my-jobs.tsx:83`, `branch: docs/asana-migration-plan.md:83`
- **Verification:** verifier-found

### G1A-011

**Build the text from the stored phone number and prefill the sign-in email**

Low · Fix · effort S · `Portal access card, Text login details` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly done (href format).
- **Today:** smsHref already keeps only the digits and a leading + and uses '?&body=' (sms:+17166980552?&body=…), preferring phoneE164. With no phone it builds 'sms:?&body=…', which opens Messages with no recipient. Copy copies only the password, not the whole message, so a desktop or Windows user has no way to grab the text. The link in the body is the bare <origin>/login with no email prefill.
- **Why:** A malformed href opens a blank recipient or drops the body. Making Zack type an email the system already knows adds friction to the slowest step.
- **Change:** The sms href is done. Add 'Copy message' (copies loginTextBody) beside Text, and make it the only action when there's no phone or on a fine pointer. Don't add /login?email=: the body already carries the email, and the house privacy rule keeps personal data out of URLs.
- **Desktop, tablet, phone:** Phone: Text opens Messages. Desktop and tablet: Copy message is the primary when sms: isn't available.
- **Reuse:** Contact.phoneE164 (§5.2); src/app/login/page.tsx reads a new email param.
- **Code:** `branch: docs/asana-migration-plan.md:191`, `branch: src/app/login/page.tsx:33-42`, `src/lib/portal/login-text.ts:12-40`, `src/app/(app)/contractors/[id]/page.tsx:107 (phoneE164 ?? phone)`, `src/app/(app)/contractors/[id]/portal-access-card.tsx:74-83 (Copy writes the password only)`
- **Verification:** partly. The fallback Copy message on desktop and hiding Text without a phone are worth keeping. Drop ?email= or carry it differently. This matters only if G1A-001 isn't adopted, hence low. No references, which is fine for a fix.

### G1A-014

**Show who already approved instead of a stale Review banner**

Low · Design change · effort S · `Staff task page, after the other partner acts` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The list is fixed. The task page is still exposed to a double action that can email Zack twice.
- **Today:** The Today list is guarded: approveTask and sendBackTask check that the job is still in Review, refresh the lists, and say 'This job isn't waiting on review anymore.' The task page banner skips that check. It calls setTaskStatus(taskId, 'DONE') directly, and staff may set any status. On a page left open after Pieter sent the job back, Approve moves it from In progress to Done and Zack gets 'approved' right after 'sent back'. After Pieter approved, Approve fails with the generic 'That status change isn't allowed.' and doesn't name him. The timeline does record 'Pieter approved this' and 'Pieter sent this back'.
- **Why:** Without a resolved state, Connor can act on a job Pieter already handled, and Zack gets two emails.
- **Change:** Have the banner call approveTask and sendBackTask (or the same assertInReview check) instead of setTaskStatus. When the job has left Review, answer inline with who acted, from the last STATUS event ('Pieter already approved this' or 'Pieter sent this back'), and refresh the page.
- **Desktop, tablet, phone:** Same at all sizes. On phone the sticky bar returns to the composer.
- **Reuse:** components/activity-timeline.tsx; core.ts status guard (only from REVIEW).
- **References:** 
  - [Mercury](https://mobbin.com/screens/60364c06-7c88-4ac9-a5e2-cf1041ab4e84): Once approved, the timeline reads Submitted (date, by) then Approved (date, by) then the next state; the decision becomes a line, not a lingering banner.
  - [Brex](https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811): 'Approved by [name] (admin) on Jan 6, 2025' with a check, and the future step drawn hollow.
  - [PlanetScale](https://mobbin.com/screens/031355e0-f2c0-42a9-8848-f62a580d19e3): The approval becomes a timeline entry with the approver and time.
  - [Mercury](https://mobbin.com/screens/cbeea523-ac61-492f-b65f-2d715ab9be54): The pending state in the same spot, with Approve and Decline, before it resolves.
- **Code:** `branch: docs/asana-migration-plan.md:94-101`, `src/app/(app)/tasks/list-actions.ts:84-113 (assertInReview)`, `src/app/(app)/tasks/[id]/review-banner.tsx:42,54 (setTaskStatus directly)`, `src/app/(app)/tasks/[id]/actions.ts:54-62`, `src/lib/tasks/rules.ts:15-17 (staff can set any status)`, `src/lib/tasks/core.ts:302-304 (generic refusal)`, `src/lib/tasks/activity.ts:92-94`, `branch src/app/(app)/tasks/[id]/page.tsx:190-197`, `branch src/app/(app)/tasks/[id]/view.tsx:118`, `branch src/app/(app)/tasks/[id]/review-banner.tsx`, `branch src/app/(app)/tasks/[id]/view.tsx:116`, `branch src/app/(app)/tasks/[id]/review-banner.tsx:42, 54`
- **Also found as:** G2B-I08 (Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap)
- **Verification:** partly. Keep the server guard (approve and send back only from Review) and the resolved timeline line. The inline 'Pieter already approved this' reply is fine. PlanetScale reference is plausible.

### G1A-028

**With the portal flag off, say sign-in is paused instead of "wrong password"**

Low · Fix · effort S · `PORTAL_ENABLED off: /login, /p, /login/forgot` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. With PORTAL_ENABLED off, login() sends every email down the staff path (`if (user || !portalEnabled)`), so a contractor with the right password sees 'Wrong email or password.' and the attempt counts toward the lockout. /p pages (requirePortalPrincipal), /login/forgot and /login/reset call notFound() and show the public 404. The reset submit route returns a bare 'Not found'.
- **Today:** In login/actions.ts, when the flag is off every non-staff email goes down the staff path, so a contractor with the right password sees "Wrong email or password." and the attempt counts toward the 5-try lockout. /p, /login/forgot and /login/reset call notFound(), which shows the public 404 ("There's nothing at this address.", "Back to the front page").
- **Why:** If the flag is flipped off for an incident after Oct 29, or a text goes out early, every contractor is told their password is wrong and locks themselves out.
- **Change:** When the flag is off and a PortalAccount matches with the right password: "HG Jobs sign-in is paused. Try again later.", with no failure recorded. /p and the portal routes render a quiet app-styled page, "HG Jobs is paused for a moment. Try again later.", with status 503. Keep the forgot link hidden.
- **Desktop, tablet, phone:** Centered single line at all widths.
- **Reuse:** getEnv().portalEnabled; AuthFrame (after G1A-004).
- **Code:** `branch: src/app/login/actions.ts:48-57`, `branch: src/lib/portal/session.ts:110-113`, `branch: src/app/not-found.tsx:5-24`, `src/app/login/actions.ts:48-57`, `src/lib/portal/session.ts:110-113`, `src/app/login/forgot/page.tsx:16`, `src/app/login/reset/page.tsx:19`, `src/app/login/reset/submit/route.ts:19`, `src/app/not-found.tsx:6-25`
- **Verification:** partly. The behavior is as described: login/actions.ts:49-51 sends every non-staff email down the staff path while the flag is off, records a throttle failure, and the portal routes notFound() into the public 404. Calibrated to low: the flag is a pre-launch gate and an incident kill switch, so this bites only if it's switched off after invites go out. The recommendation is sound. Checking a PortalAccount password while the flag is off is read-only.

### G1A-031

**Don't email the partners when a contractor taps Start job**

Low · Design change · effort S · `Partner emails on Start job (D20)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Start job (contractor sets In progress) is a STATUS change, and CONTRACTOR_TO_STAFF includes STATUS, so both partners are emailed ('Zack started the job'), bundled per job only within 3 to 10 minutes. A Start followed by Mark done more than 10 minutes later still sends two emails.
- **Today:** D20 lists Start as an email trigger, alongside comment, photo or video, and Mark done. Each job therefore sends both partners at least two emails, Start and then Mark done.
- **Why:** Start is status, not a request. The staff Today view's Contractors column already shows "In progress". Fewer, more meaningful emails keep partners reading them.
- **Change:** Start updates the status and the Today Contractors column only. The first partner email for a job is a comment, a photo, or Mark done, and Mark done's email notes "Started Tue 8:05 AM".
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** The outbox enqueue in core.ts.
- **Challenges:** D20, which lists Start as an email trigger.
- **References:** 
  - [Jobber](https://mobbin.com/screens/f50ec472-c3f8-4bdc-8bd5-dbd856936025): The Active state shows on the appointment itself, without a separate alert.
- **Code:** `branch: docs/asana-migration-plan.md:81,297`, `src/lib/tasks/rules.ts:50-51,65`, `src/lib/notifications/content.ts:104-107 ('started the job')`, `src/lib/tasks/rules.ts:74-79 (bundling window)`
- **Verification:** partly. The finding names D20 correctly, but Connor settled D20 on Oct 22, one day before this review, with Start explicitly listed. With D8's shared contractor list, the Start email is also how partners learn someone is on site, for example to warn a tenant. The single Jobber screen doesn't outweigh that. Folding Start into the next email ('Started Tue 8:05 AM') is a reasonable option to offer, not a correction.

### G1A-033

**Drop the gold eyebrow and rule from emails and match the app's look**

Low · Design change · effort S · `All emails (render.ts), header and frame` · Contractor jobs and media close the loop

- **Today:** Each email opens with 12px uppercase "HG CAPITAL PARTNERS" tracked 0.28em in #8a6d2f over a 48px gold rule, on a white 480px card inside a gray canvas. On a 375 phone that leaves 44px of padding per side around a 287px text column.
- **Why:** The button opens the app, so the email should look like the app. The gold ritual is the public site's (PUBLIC-033 already flags it there), and the narrow column wastes a phone's width.
- **Change:** A 24px HG monogram (PNG with alt "HG") instead of the eyebrow and rule. Title at 18px semibold, body at 16px. Below 520px, drop the gray canvas and card radius so text runs at 16px gutters. Keep the near-black pill button, and add a one-line muted footer.
- **Desktop, tablet, phone:** Phone: edge-to-edge. Desktop: a 480px card on a light canvas.
- **Reuse:** src/lib/email/render.ts.
- **Challenges:** The render.ts header comment ("Colors are the public site's: near-black text on white, gold rule").
- **References:** 
  - [Toggl Track](https://mobbin.com/flows/b2df1053-3a88-44cb-b77f-851292c77db6): Invitation landing: small logo, heading, one line, one button.
- **Code:** `branch: src/lib/email/render.ts:7-8,52-54`
- **Verification:** confirmed. The gold eyebrow and rule are confirmed (render.ts:53-54), and conflicts_with names the template's header comment. One correction to the evidence: the '44px per side, 287px column' math assumes device-width layout. The phone renders the reviewer captured (shots/PORTAL/email-reset--mobile-light.png) lay out at about 980px and shrink, because the template has no viewport meta (G1A-V05). Overlaps G1A-004's 'emails follow suit' but isn't a duplicate.

### G1A-034

**Sign the contractor in after a reset and open My jobs**

Low · Design change · effort S · `/login/reset/submit success` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. A successful reset still 303s to /login?notice=reset ('Password changed. Sign in with the new one.' in a gold box) with an empty email field. The contractor's existing session is kept only if they were already signed in.
- **Today:** A successful reset redirects to /login?notice=reset ("Password changed. Sign in with the new one.") with the email field empty. The contractor must retype the password they just chose. The current session is kept only if they were already signed in.
- **Why:** The link already proved the email, so asking again is busywork on a phone. Square's invite and set-password flow lands straight in the product.
- **Change:** On success, start a portal session (revoking the others, as today) and 303 to /p with the toast "Password changed".
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** src/app/login/reset/submit/route.ts; session.ts startPortalSession (route-handler variant).
- **References:** 
  - [Square](https://mobbin.com/flows/f37841a1-9dcc-486e-8335-53202935e63b): After creating a password, the user goes straight into the product.
- **Code:** `branch: src/app/login/reset/submit/route.ts:38-43`, `branch: src/app/login/page.tsx:28-30`, `src/app/login/reset/submit/route.ts:29-43`, `src/app/login/page.tsx:28-30`
- **Verification:** partly. Accurate: a successful reset 303s to /login?notice=reset with an empty form (reset/submit/route.ts:38-43). Calibrated to low: forgot-password is a rare path, and the reset field is autocomplete=new-password, so iOS keychain offers the new password as one tap on /login. Signing in from a route handler needs a route variant of startPortalSession, as noted. Square reference is real (flow f37841a1).

### G1A-035

**Say "This link no longer works" for used links, not "expired"**

Low · Fix · effort S · `/login/reset with a dead link` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. /login/reset?token=abc shows the title 'This link has expired', a red alert box 'Reset links work once, for 30 minutes.', and a small 'Get a new link' text link. The same screen shows for links that were already used.
- **Today:** Any unusable token shows the title "This link has expired" with a red alert box, "Reset links work once, for 30 minutes.", and a small "Get a new link" text link. That includes links that were already used, for example opened twice.
- **Why:** "Expired" is wrong for a used link, and a red alert reads as an error Zack caused. The next step is a 12px link.
- **Change:** Title "This link no longer works"; line "Reset links work once, for 30 minutes." as plain muted text; primary button "Email me a new link" to /login/forgot.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** AuthFrame; Button.
- **Code:** `branch: src/app/login/reset/page.tsx:22-33`, `src/app/login/reset/page.tsx:22-33`
- **Verification:** confirmed. Verified at reset/page.tsx:22-33: the title 'This link has expired' appears for any unusable token, including used ones (findUsableToken returns null for usedAt), with a red AuthError and a small text link. 'This link no longer works' plus a primary button is the right fix. No references, which is fine for a copy fix.

### G1A-039

**Use one name for the portal, "HG Jobs", everywhere a contractor sees it**

Low · Fix · effort S · `Contractor-facing names (sign-in, header, emails, tab titles)` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. D11 says the portal says "Jobs". The header change moves the portal further from that.
- **Today:** The /p header now reads "HG Capital" (p/page.tsx:21), not "HG Jobs", so no contractor screen says "HG Jobs" any more. The names are still mixed: an "HG LOGIN" eyebrow and an "HG Login" nav link on /login and /p/welcome/password (auth-frame.tsx:29). Tab titles are "My Jobs | HG Capital Partners" and "Choose Your Password | HG Capital Partners", in title case (p/layout.tsx:5; welcome/password/page.tsx:7; job page "Job"). The reset email says "for HG jobs." with the subject "Reset your HG password" (reset.ts:91,96). Every email is headed "HG Capital Partners" (email/render.ts:27).
- **Why:** Six names for one product read as stitched-together pages and make the texted link harder to trust.
- **Change:** Use "HG Jobs" in the /p header (p/page.tsx:21) as well. Set the tab template to "%s | HG Jobs" with sentence-case titles ("My jobs", "Choose your password", "Job"). Use it in the reset line and subject too. render.ts's BRAND is shared with staff emails, so pass the brand per audience, "HG Jobs" for contractor emails. The shared /login keeps a neutral "Sign in".
- **Desktop, tablet, phone:** Not layout.
- **Reuse:** metadata in (portal)/p/layout.tsx; reset.ts; render.ts BRAND.
- **Code:** `branch: src/app/(portal)/p/layout.tsx:3-6`, `branch: src/lib/portal/reset.ts:91-96`, `branch: src/app/login/_components/auth-frame.tsx:29`, `branch: src/app/(portal)/p/page.tsx:21`, `branch: src/app/(portal)/p/layout.tsx:5`, `branch: src/lib/portal/reset.ts:91,96`, `branch: src/lib/email/render.ts:27`
- **Verification:** confirmed. All six names check out: 'HG Login' eyebrow and nav (verify-G1A/login--mobile-light.aria.txt), 'HG Jobs' header, 'HG jobs' in the reset line (reset.ts:91), the 'My Jobs | HG Capital Partners' title (p/layout.tsx:4), the 'Reset your HG password' subject, and 'HG CAPITAL PARTNERS' in the email header. One correction: the app's tab titles use Title Case ('Sign In | HG Capital Partners', 'Forgot Password | HG Capital Partners'), so keep 'My Jobs | HG Jobs' rather than switching the portal to sentence case.

### G1A-I02

**Say who gets Zack's update, right under the update box**

Low · Design change · effort S · `Contractor job page, Updates composer` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The job page composer is still a bare 'Write an update…' box with Send below it, and nothing says who receives the update. Only the Mark done payoff names the recipients.
- **Today:** The composer is a bare 'Write an update…' box with a Send button below it. Nothing says that Connor and Pieter receive it by email. The only place that names recipients is the Mark done payoff ('Sent to Connor and Pieter').
- **Why:** A contractor choosing between typing an update and texting Connor needs to know the update reaches a person. Basecamp prints who gets notified under every comment box, so posting never feels like writing into a void, and it sets the expectation that replies come back by email.
- **Change:** Add one muted 12px line on the Send row, left of the button: 'Connor and Pieter get this by email.', built from the staffNames list the payoff already uses. After a successful Send it reads 'Sent to Connor and Pieter' for 3 seconds, then returns. No avatars and no settings.
- **Desktop, tablet, phone:** Desktop and tablet: line left, Send right on one row. 375: same row. 320: shorter copy, 'Connor and Pieter get an email.', so it never wraps beside Send.
- **Reuse:** Reuse joinNames from src/lib/portal/job-view.ts and staffNames from getJob in src/lib/portal/queries.ts; muted text token already on the page.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/3463d54d-1e84-4b06-8a9a-5ee44fa39cea): '2 people will be notified when someone comments on this message' with their avatars, directly under the comment box.
  - [Basecamp](https://mobbin.com/screens/30bdb4b9-7f9f-4019-93c1-475009843246): 'When I post this, notify...' names the audience at the moment of posting, in plain words.
- **Code:** `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:139-170`, `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:267`, `branch-src/src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:136-163,264-267`
- **Verification:** partly. True: the composer is a bare textarea with Send, and nothing names who receives an update. CONTRACTOR_TO_STAFF in rules.ts does email every staff user with a password, so 'Connor and Pieter get this by email' would be accurate. On success nothing confirms the send either: the text clears and the update appears. Severity is overstated. The spec counts only 100 to 150 comments in all of Asana, half from contractors, so the composer is a low-traffic surface. BPORTAL-017 already asks for recipients in the Mark done sheet, and BCONTRACT-002's 'Reply in the job' line is with Connor, so the three should be decided together. The Basecamp pattern is real: my search returned a Basecamp comment box reading '2 people will be notified when someone comments on this message' (https://mobbin.com/screens/cc1465d5-e8f1-4fe2-87c0-070f21a38f2f). The cited ids 3463d54d and 30bdb4b9 didn't come back, but they're plausible. The proposed copy fits beside Send at 320.

### G1A-I05

**Put a 'Getting in' block on the job page: code, where the lockbox is, and the unit's access notes**

Low · New capability · effort M · `Contractor job page, below the address` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The job page shows a Lockbox card with the code only ('Lockbox 2374'). Units still store label, lockboxCode, utilities and equipment, with nowhere for access notes.
- **Today:** The job page shows a Lockbox card with the code only. Everything else about getting in (which door, where to park, the side gate, a dog, where the water shutoff is) has to be retyped into each job's Notes. Units store label, lockboxCode, utilities and equipment, so there is nowhere to keep access instructions once per unit.
- **Why:** Airbnb separates 'Checking in' and 'Getting there', and the host writes the instructions once per listing. HG's contractors keep returning to the same 11 buildings; writing access once per unit and showing it on every job there saves a text each visit and keeps a contractor from standing at the wrong door.
- **Change:** Add an 'Access notes' field to each unit (500 characters, staff-edited in the units editor). On the job page, turn the Lockbox card into one 'Getting in' block: the code in large mono digits (G1A-020), the lockbox location under it (G2C-037), 'Occupied unit · knock first' when it applies (G2C-027), then the access notes. With no notes the block is just the code. Hide the block once the job closes, as the code is hidden today.
- **Desktop, tablet, phone:** One column at every width. At 375 and 320 the code row stays one line with Copy at the right and the notes wrap below. Desktop keeps the max-w-2xl column.
- **Reuse:** Extend LockboxCard in job-details.tsx into a GettingIn block; extend the unit JSON and its editor on the property page. Builds on G1A-020, G2C-037 and G2C-027.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/25dd3338-ae57-4a06-ae0a-5ea10e847004): 'Checking in' groups Check-in method and How to get inside, then Wifi, as one arrival block.
  - [Airbnb](https://mobbin.com/screens/5f789af0-a9ed-4c5e-aca3-ae5026d47ba6): 'Directions from your host' in plain prose under the address, with Copy address and Get directions as rows.
  - [Airbnb](https://mobbin.com/screens/bd0bc8cd-9b70-474f-86f9-2a0442d8af03): The host writes 'How to get inside, wifi password...' once, with a character count, and every guest sees it.
- **Code:** `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/_components/job-details.tsx:46-67`, `task-management-migration-4c9ddf/prisma/schema.prisma:157-160`, `branch-src/src/app/(portal)/p/jobs/[id]/_components/job-details.tsx:46-67`, `branch-src/prisma/schema.prisma:157-160`
- **Verification:** partly. The observation is accurate. Property.units holds only label, lockboxCode, utilities and equipment (schema.prisma:157-160), and LockboxCard shows the code alone. Severity is lower than stated. The same contractors return to 11 buildings, so access is learned after the first visit, and job Notes already carry one-off instructions. The recommendation also leans on three other findings (G1A-020, G2C-037, G2C-027). Reference problem: the third URL is malformed. The cited https://mobbin.com/screens/bd0bc8cd-9b70-474f-86f9-2a0442d8af03 doesn't exist as given. Mobbin returns that exact Airbnb 'How to get inside, wifi password… 500 characters available' screen as https://mobbin.com/screens/bd0bc8cd-1274-4711-88fd-20e67901e8c9. The other two Airbnb URLs (25dd3338, 5f789af0) match exactly.

### G1A-I06

**Let Zack pick the day he'll come, so Connor doesn't have to text and reschedule**

Low · New capability · effort M · `Contractor job page bottom bar (To do and Scheduled jobs); staff Today` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Contractors can still only Start job and Mark done. nextStep returns start, done or review, and there's no visit-day picker on the job page.
- **Today:** Contractors can only Start job and Mark done (true; job-view.ts nextStep, actions.ts). The '419 of 762 recent events' figure counts every Asana reschedule, mostly partners moving due dates on their own tasks (the spec lists 22 overdue and plans 'Move all to today'). Nothing shows that contractors' visit days drive those reschedules.
- **Why:** Cal.com lets the person on the other side request a reschedule from the booking itself, and Things 3 keeps the planned day separate from the deadline. If the person doing the work picks the visit day, the Target becomes a real visit date and Today's Contractors column is right without a partner touching it.
- **Change:** For To do and Scheduled jobs, add a text button above the bottom bar: 'Pick a day', or 'Thu, Oct 29 · Change' once set. It opens a sheet with quick picks (Today, Tomorrow, the next weekdays with dates) and 'Other day' for a calendar. Choosing sets Scheduled with scheduledFor, posts 'Zack plans to come Thu, Oct 29' to Updates and goes to partners in the normal email bundle. Due stays staff-owned; a pick after Due shows 'That's after the Oct 27 target. Connor will see it.'
- **Desktop, tablet, phone:** 375 and 320: bottom sheet with 44px quick-pick rows and the calendar behind 'Other day'. Tablet: the same sheet, centered. Desktop: a popover anchored to the button.
- **Reuse:** Reuse the task due-date quick picks and the approved React Aria date picker (D7), the portal Sheet, and setTaskStatus with SCHEDULED.
- **Challenges:** D6c (contractors can only Start job and Mark done; staff set Scheduled). The case: the visit day is the contractor's to know, and rescheduling is over half of all task activity, which this moves off the partners. Due stays staff-owned.
- **References:** 
  - [Cal.com](https://mobbin.com/screens/88a3ad34-c6f6-4bf4-a9bb-bac7165b29e4): Each upcoming booking row has an Edit menu with 'Reschedule booking' and 'Request reschedule' right on the row.
  - [Things 3](https://mobbin.com/screens/1f3adaff-5def-4789-a938-456435ecd4df): The planned day (the header) is separate from the deadline flag ('4d left'), the split between a visit day and the Due date.
- **Code:** `task-management-migration-4c9ddf/src/lib/portal/job-view.ts:231-244`, `task-management-migration-4c9ddf/src/app/(portal)/p/jobs/[id]/actions.ts:38-67`, `task-management-migration-4c9ddf/docs/asana-migration-plan.md:27,67`, `branch-src/src/lib/portal/job-view.ts:231-244`
- **Verification:** partly. conflicts_with names D6c correctly. The case rests on a misread statistic, and the proposal adds a control above the bottom bar on the screen the team is trying to keep to one scroll and one bar. For occupied units, partners coordinate tenant notice before entry, so a contractor-set Scheduled day still needs a partner, which weakens the 'without a partner touching it' benefit. Better parked until after cutover. The Cal.com and Things 3 references weren't spot-checked.

### G1A-I08

**Flag a contractor whose emails bounce, so Connor texts instead**

Low · New capability · effort M · `Contractor record, Portal access card` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. PortalAccount has no bounce field. Nothing on the branch, at 4652abb or at the tip, handles Resend bounce or complaint webhooks. The tip's new resend.ts only builds the send body.
- **Today:** The invite is a text from the partner's phone carrying the login email and starting password (D14; portal-access-card.tsx:74 smsHref with loginTextBody). A mistyped address doesn't stop sign-in and isn't a likely reason for 'never signed in'. A bad address silently loses the job emails (D19) and any password-reset link, while the card still reads Active.
- **Why:** Slack's invitation list marks a row 'email address bounced' next to Resend and Revoke; Clerk keeps a status per invite. Around Oct 29, a bounce is the likeliest reason a contractor 'never signed in', and today nobody would know.
- **Change:** Subscribe to Resend's bounced and complained webhooks and store bouncedAt on PortalAccount. The card's status line becomes 'Email bounced Oct 29' in the warning tone, with primary 'Fix email' (an inline field) and 'Text invite' as the fallback. Job emails to that address pause until it changes. ADMIN-015's Portal column shows 'Bounced' for that row.
- **Desktop, tablet, phone:** The card is the same at every width; at 320 the status line drops the date.
- **Reuse:** Extend the Portal access card states from G1A-010, NotificationOutbox, the Badge warning tone and ADMIN-015's directory column.
- **References:** 
  - [Slack](https://mobbin.com/screens/2fe9271e-36ed-4333-b809-6078dc790098): Outside the library: a pending invite row reads '— email address bounced' with 'Invitation resent' and Revoke beside it.
  - [Clerk](https://mobbin.com/screens/a5fd142e-2cff-47fe-abb7-b43c5e805680): Invitations list Status, invited date and expiry in fixed columns, so a stuck invite is visible at a glance.
- **Code:** `task-management-migration-4c9ddf/src/lib/notifications/outbox.ts:181-195`, `branch-src/prisma/schema.prisma model PortalAccount`, `branch-src/src/lib/notifications/outbox.ts:181-195`, `task-management-migration-4c9ddf HEAD: src/lib/email/resend.ts`
- **Verification:** partly. The outbox has no bounce or complaint handling: no webhook route, and only quota and rate-limit branches in outbox.ts:178-200. The core claim about the invite is wrong, though. Contractor emails came over from Asana, where these contractors were active, so most addresses are known-good. A Resend bounce webhook storing bouncedAt and a warning state on the Portal access card is still a reasonable, contained fix. The Slack reference is outside the library. Clerk wasn't spot-checked.

### G1A-I09

**Tell Zack when the target or notes changed since he last looked**

Low · Design change · effort S · `Contractor job page header and My jobs row` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Portal Updates and the 'N new' count still include only COMMENT, the listed STATUS changes and shared ATTACHMENT events, so target and notes changes don't show on the job or count as new. TaskEventKind still has DUE and SCHEDULED, with no TARGET.
- **Today:** The move does reach him. TARGET and NOTES changes email the contractor (rules.ts STAFF_TO_CONTRACTOR, bundled within 3 to 10 minutes), and My jobs regroups the card under the new date. The portal Updates and the 'N new' count do leave DUE, SCHEDULED and NOTES events out (queries.ts:44-58). There's no TaskEvent kind TARGET (TaskEventKind has DUE and SCHEDULED; 'TARGET' is only a notify kind), so the reuse line needs correcting.
- **Why:** Flighty leads a changed flight with 'Departure changed to 10:15 AM' at the top of the record. Rescheduling is the change HG makes most; a contractor who misses it shows up on the wrong day.
- **Change:** When a TARGET or NOTES event is newer than the contractor's lastSeenAt, show one line under the status row: 'Moved to Fri, Oct 30 (was Thu, Oct 29) by Connor' and, if notes changed, 'Notes updated by Connor'. Count each as new on My jobs. The line clears after he has viewed the page; Updates still lists no date history.
- **Desktop, tablet, phone:** 375: at most two lines. 320: drop 'by Connor'. Desktop and tablet: one line.
- **Reuse:** TaskEvent TARGET and NOTES rows, TaskReadState, targetLabel; the notice sits in the existing status row area of the job page.
- **Challenges:** Spec §5 portal timeline: 'Date changes appear only as the current Target, never as history.' This keeps that rule for Updates and adds only a since-you-last-looked notice.
- **References:** 
  - [Flighty](https://mobbin.com/screens/09e08a95-1063-4e78-baeb-a68dddb6136a): 'Departure changed to 10:15 AM · Flight now departs 1h 20m later' as one line at the top of the record, above the details.
- **Code:** `task-management-migration-4c9ddf/src/lib/portal/queries.ts:44-58`, `task-management-migration-4c9ddf/src/lib/portal/queries.ts:278-281`, `task-management-migration-4c9ddf/docs/asana-migration-plan.md:205`, `branch-src/src/lib/portal/queries.ts:44-58`, `branch-src/prisma/schema.prisma:372-387`
- **Verification:** partly. conflicts_with correctly names the spec rule ('Date changes appear only as the current Target, never as history'). The '(was Thu, Oct 29)' notice is history on the page, so the exception should be explicit to Connor. The Flighty reference is real and fits: 09e08a95 shows 'Departure changed to 10:15 AM · Flight now departs 1h 20m later' (verified).

### G1A-I12

**Refresh My jobs when Zack comes back to the tab**

Low · Fix · effort S · `My jobs and the job page` · Contractor jobs and media close the loop

- **Today:** My jobs and the job page are rendered once on the server; nothing in (portal) refreshes them when a phone tab is revisited (no visibilitychange handler or router.refresh). A contractor who leaves Safari open sees yesterday's list, including a job since moved off his list, until he reloads.
- **Why:** Linear and Superhuman keep lists current without a manual reload. A stale row is exactly how a contractor lands on the 'off your list' state (G1A-025).
- **Change:** Add a small client hook in the portal layout: when the page becomes visible after more than 2 minutes hidden, call router.refresh() and keep the scroll position. Show nothing unless it takes over 300ms.
- **Desktop, tablet, phone:** Same everywhere; matters most on phones, where Safari keeps tabs for days.
- **Reuse:** New hook beside ToastProvider in src/app/(portal)/p/layout.tsx.
- **Code:** `task-management-migration-4c9ddf/src/app/(portal)/p/layout.tsx:17-23`, `task-management-migration-4c9ddf/src/app/(portal)/p/page.tsx:10-37`
- **Verification:** confirmed. There's no visibilitychange handler or router.refresh anywhere under (portal) or src/components, and the layout only mounts ToastProvider (layout.tsx:17-23). Impact is modest. A Link back to /p refetches the dynamic page, and iOS Safari often reloads evicted tabs, so the stale case is a tab left alive and resumed. The 2-minute hidden threshold avoids churn. A fix needs no reference.

### G1A-I13

**Open the job at the new update when Zack comes from an email**

Low · Fix · effort S · `Contractor job page, opened from an email` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. openUrl still links contractor emails to /p/jobs/<id> with no anchor to the newest update.
- **Today:** Updates sit just under the checklist. On the sample job at 375 the Updates heading is about 75px below the fold, not two screens; the distance grows with notes and the Photos & videos grid. Updates run oldest first, so the newest item sits right above the composer. Most contractor emails are assignment, target and notes changes, which belong at the top, and staff comments are rare (the spec counts 100 to 150 comments in all of Asana).
- **Why:** The email told him something changed; the page should open on it. Basecamp and Linear link notifications to the comment itself.
- **Change:** Link to /p/jobs/<id>#u-<eventId> for the newest item in the email bundle. On load, scroll that update into view clear of the bottom bar and tint it with the accent background for 2 seconds (a static tint under reduced motion). Emails about a target or notes change keep linking to the top, where G1A-I09's notice sits.
- **Desktop, tablet, phone:** 375 and 320: scroll with scroll-margin-bottom for the bar. Desktop: the update often fits the first screen, so the tint alone marks it.
- **Reuse:** UpdateItem in src/app/(portal)/p/jobs/[id]/page.tsx gains an id; openUrl in src/lib/notifications/content.ts gains an optional anchor.
- **Code:** `task-management-migration-4c9ddf/src/lib/notifications/content.ts:65-67`, `branch-src/src/lib/notifications/content.ts:65-67`
- **Verification:** partly. The overlaps change the build. Use a query param (?update=<id>) rather than a #fragment: BPORTAL-005's in-progress fix carries only a same-origin path through sign-in as next=, so a fragment is lost for anyone signed out. The tint duplicates BPORTAL-011's 'show which updates are new', so the two should share one marker. No references cited.

### G1A-I14

**Pin a sent-back job above My jobs with the reason**

Low · Design change · effort S · `My jobs` · Contractor jobs and media close the loop

- **Today:** The list isn't silent. The sent-back status (IN_PROGRESS, Shared on a contractor job) and the note (a Shared comment) are staff events that newUpdateCounts counts, so the card shows a '2 new' pill. The contractor also gets the 'Connor sent it back: <note>' email. What's missing is the reason on the card and a status word other than 'In progress'.
- **Why:** Airbnb pins the one thing blocking a host ('Confirm a few key details · Required to publish') above everything and marks the listing 'Action required'. A sent-back job is the only item on Zack's list that a partner is actively waiting on.
- **Change:** While a job is sent back and not yet marked done again, pin it above the date sections as one row: title, street, then the first line of the note in muted text ('Connor: Gap at the left corner of the crown'). The status spot reads 'Sent back' (the word G1A-024 sets). It returns to its date group when he marks it done again.
- **Desktop, tablet, phone:** Same row anatomy at every width; the note truncates to one line at 375 and 320.
- **Reuse:** The row from G1A-016 and the 'Sent back' status from G1A-024; groupJobs in src/lib/portal/job-view.ts gains a pinned group.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): An 'Action required' pill on the one listing that needs work, plus a pinned card naming what's required.
  - [Airbnb](https://mobbin.com/screens/8249f9ca-1fdc-4f97-870f-974d6811a36c): The single blocking item stays pinned whatever the list below shows.
- **Code:** `task-management-migration-4c9ddf/src/lib/portal/job-view.ts:135-138`
- **Verification:** partly. For a contractor with a handful of open jobs, a pinned section adds structure the card can carry itself. Putting 'Sent back' in the status spot (G1A-024) plus the note's first line under the address gets the benefit without a new group. The Airbnb references weren't spot-checked.

### G1A-V04

**Put the starting password's letters and digits in separate groups so it types without keyboard switching**

Low · Fix · effort S · `Starting password sent by 'Text login details'` · Contractor jobs and media close the loop

- **Today:** generateStartingPassword mixes letters and digits in every group (tokens.ts:37-51), for example 'k7mq-4vxp-2hzt'. On an iPhone, typing it into a dotted field takes about six switches between the letter and 123 keyboards.
- **Why:** Under D14, this is the one string every contractor has to type by hand on day one. Each keyboard switch is a chance for a typo, and five failures lock the email for 15 minutes.
- **Change:** Generate two letter groups and one digit group, for example 'kmqv-4729-hztp'. That's 23^8 x 10^4, about 49 bits, plenty for a single-use password behind a 5-try lock, and it needs two keyboard switches. Keep the no-confusables alphabet. This is moot if G1A-001's invite link replaces the starting password.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** src/lib/portal/tokens.ts generateStartingPassword and tokens.test.ts.
- **Code:** `branch: src/lib/portal/tokens.ts:35-51`
- **Verification:** verifier-found
