# Branch: contractors directory, portal access, Home and emails

Part of the [UI/UX review](README.md). 24 findings: 0 critical, 1 high, 8 medium, 15 low.

## How it should work

Access and messages should feel like Gusto onboarding crossed with Linear notifications: one status, one next step, one tap, and proof that it worked.

The contractor record leads with access, not contact trivia. Under the name sits an HG Jobs status chip that walks Gusto's step pattern (https://mobbin.com/screens/b723bdfb-f882-422d-b49c-7c31365c880a): No login, Invited (texted Oct 29), Active (last seen 2 days ago on iPhone), Access off. The header's single primary action follows the state: Create login, Text again, or nothing. On a phone the access card comes first and the eight contact fields collapse to the ones that have values. A short Wise-style history (https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614) answers 'did Zack get in?' without asking him: created, signed in, chose a password, three failed sign-ins, viewed the lockbox.

The directory becomes a Clerk-style people table with a Last signed in column (https://mobbin.com/screens/731c7344-9391-48db-b387-db09d09f5d1e) and Qatalog's counted segments All, No login, Invited, Active (https://mobbin.com/screens/d35d7504-e0eb-4926-935d-51b98b818a81), so invite day is a checklist rather than 29 page visits.

Creating a login is one React Aria Sheet: the email prefilled with Gusto's sublabel 'Zack signs in with this' (https://mobbin.com/screens/514a6ae7-e9b2-4d18-abd0-5ead94eb48d1), then a payoff state in the Gamma and OpenAI shown-once style (https://mobbin.com/screens/3762fc5a-915b-4783-a48b-01f01c95c49a): 'Zack's login is ready', the password on its own line with Copy, a primary 'Text Zack', and what happens next. A dropped connection keeps the sheet and says so inline.

Emails read like a good inbox row (https://mobbin.com/screens/ecadc8f0-a5b3-4ab9-8212-e70e97c02ba8): the subject carries the change ('Scheduled Fri, Oct 30: Cabinet install'), the preheader carries the detail, the body lists from-to rows the way Jira and Workable do (https://mobbin.com/screens/f09233f3-fab0-470e-bcdb-193fdb1ba056, https://mobbin.com/screens/e8a8d446-e13b-4661-970f-6c2e8f208793), one button opens the right screen, and a reply reaches a person. Undone changes never send, and a playbook's six assignments arrive as one email.

Home's card becomes Deel's 'For you today' (https://mobbin.com/screens/6bd4989c-7a50-413e-be7e-e955b2394a29): Needs review, Overdue and Today counts that open Today, ahead of the D10 Home rebuild. All of it stays in zinc neutrals with the blue primary and fixed Badge tones.

<details><summary>What the reviewer covered</summary>

Branch claude/task-management-migration-4c9ddf (4652abb) at http://localhost:3300, staff session (Connor), writes blocked. Routes: /contractors at desktop 1280, tablet 768, mobile 375, narrow 320 and wide 1920 (light, Chromium, ARIA snapshots); /contractors/[id] for four records covering every reachable Portal access state: Zack Reading (no login, 8 open jobs), Brandon Zarbo (no login, shared info@ address, no jobs), Device Check Contractor (Active, never signed in, 1 job) and Device Check Newcomer (Active, still on starting password) at desktop, tablet and mobile; dark mode at mobile; WebKit at 320. Portal access actions exercised: Create login (aborted POST, error screen captured at desktop and mobile), Reset password confirm (opened, Esc tested, focus and Tab traced), Remove access confirm (light and dark), Sign out everywhere (aborted POST, error screen). Contrast of the danger button measured in both themes; tap sizes and 16px fields checked at 320 in WebKit. Home (/) at desktop, tablet, mobile and narrow with ARIA; Today (/tasks) desktop for comparison with Home's card; global search for a contractor (result type label). Emails: every template rendered from the branch's own content.ts and render.ts via tsx (16 task-email cases: assigned, assigned plus target plus notes, comment, scheduled, sent back, approved, target moved, target cleared, staff files, staff-set In progress, contractor Start, comment with photos, photos only, Mark done, a business-name contractor, no property; plus the password reset email), plain text in shots/BCONTRACT/emails/index.txt and HTML screenshots at 375 in WebKit light and dark. Code read: contractors pages and actions, portal-access-card, portal accounts, credentials, login-text, reset, notifications content and outbox, email render and send, task core notify paths, rules, bulk Undo, templates apply, Home page and queries, ConfirmDialog, Sheet, Menu, Toast. Could not reach: the starting-password reveal and Text login details state (needs a successful write), the Removed / Restore access state (no disabled account in the branch DB), a real sms: handoff, real mail-client rendering (Gmail and Outlook dark-mode inversion) and Resend delivery. Earlier findings re-checked separately (ADMIN-015, G1A-001/005/006/008/010/011/031/039/V01/V02, IA-030, SHELL-055) are not repeated except where the branch build has a distinct problem, which each finding names.

</details>

## Findings

### BCONTRACT-002

**Replies to job emails go nowhere: no Reply-To, no 'reply in the job' line**

High · New capability · effort M · `Every task email (contractor and partner)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 4cf099d (on top of dd00a9e): optional EMAIL_REPLY_TO sets reply_to. The "Reply in the job" line went to Connor as a content call.
- **Today:** sendEmail posts from EMAIL_FROM only; the example is 'HG Capital <[email]>', a sending subdomain. No reply_to is set anywhere in src. The email body ends at the button with no footer. A contractor who answers 'Can do Thursday at 8' from Mail sends it to an address nobody reads, and nothing tells him that.
- **Why:** Tradespeople reply to email. A lost reply is the worst failure for 'close the loop': the contractor thinks he answered and the partners never see it. Gusto, Linear and Stripe either route replies or say plainly where to reply.
- **Change:** Phase 1 (before Oct 29): set reply_to on contractor emails to a monitored address both partners read, and set the From name to the actor ('Connor via HG Jobs'). Add one footnote line: 'Reply in the job so Connor and Pieter both see it.' Phase 2 (week 2): turn on Resend inbound for a jobs+<taskId> reply address and post the reply text as a Shared comment from the contractor. That reuses addComment, which then emails the partners as usual. Partner emails get reply_to set to the contractor's portal email, so a quick answer works.
- **Desktop, tablet, phone:** Email only. The footnote is one line at 375.
- **Reuse:** renderPlainEmail already supports `footnote`. Extend EmailMessage in src/lib/email/send.ts with replyTo and fromName. Phase 2 reuses core.addComment.
- **Challenges:** D20 says no email between Connor and Pieter. A shared Reply-To inbox is not partner-to-partner email, but Connor should confirm which address receives replies.
- **References:** 
  - [Lemni](https://mobbin.com/screens/aa0237cc-055c-45ef-8355-3ca33a1529b2): Email replies land inside the record's thread next to status and assignee, which is the phase 2 target.
  - [Gmail](https://mobbin.com/screens/ecadc8f0-a5b3-4ab9-8212-e70e97c02ba8): Sender names read as people or products; a 'jobs@mail' sender with no reply path stands out as a no-reply.
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): Inbox groups notifications per item with the actor and time.
- **Code:** `branch: src/lib/email/send.ts:51-61`, `branch: src/lib/env.ts:65`, `branch: src/lib/notifications/outbox.ts:168-172`, `branch: src/lib/email/send.ts:47-57`, `branch: src/lib/portal/reset.ts:96`
- **Also found as:** G1A-029 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. sendEmail posts from config.from only (send.ts:54-60). There is no reply_to anywhere in src, and renderPlainEmail gets no footnote from outbox.ts:168. Whether a reply bounces or lands in an inbox nobody reads depends on EMAIL_FROM, which isn't set yet. Either way the partners never see it. The conflicts_with question about which address receives replies is the right one to ask.

### BCONTRACT-004

**A login nobody has used shows a green 'Active' badge**

Medium · Fix · effort S · `/contractors/[id] Portal access card header badge` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Still open at 9f74ea1: the Portal access card still gets only active = portalAccount.status === 'ACTIVE' and lastSignIn. The page doesn't select mustChangePassword or session lastUsedAt, so a login nobody has used still shows the green Active badge. The new badge states and their copy (Invited, Active with last seen, Access off) are a design and content decision for Connor, and the code follows from that.
- **Today:** The badge is only Active or Removed, from PortalAccount.status. Device Check Newcomer is still on the starting password and has never signed in, yet the card shows a green 'Active' beside 'Last signed in: Not yet'. The page never selects mustChangePassword or the session's lastUsedAt, so the card can't tell 'invited' from 'using it'. Green is also the 'tenant fixes' chip color on the same page.
- **Why:** The job is 'give access and be sure they got it'. A green Active on a login nobody has opened tells Connor the opposite of the truth on invite day. G1A-010 proposed four states for the plan; the built card has two, and one of them is wrong.
- **Change:** Select mustChangePassword and the newest live session's lastUsedAt. Show 'Invited' (gray Badge) with the line 'Not signed in yet' until the contractor has signed in and chosen a password. Show 'Active' with 'Last seen 2 days ago' after that, and 'Access off' (gray) when disabled. Keep green for Done only, per the Badge tone map, or use the blue status tone for Active.
- **Desktop, tablet, phone:** The badge sits in the card header at every size. The status line truncates to 'Last seen 2d ago' at 320.
- **Reuse:** Badge tones in src/components/ui.tsx. The data is already on PortalAccount and PortalSession.
- **References:** 
  - [Gusto](https://mobbin.com/screens/c427236d-afd0-439e-bb24-affd93a694fc): Onboarding status 'Pending offer' with a dot, separate from active people, plus a 'Send reminder' action.
  - [KAYAK for Business](https://mobbin.com/screens/f848af90-bea9-4ebb-a00a-4828509bd156): Invitation column reads 'Activated' or 'Pending' with Resend, so an unused invite never looks active.
- **Code:** `branch: src/app/(app)/contractors/[id]/page.tsx:36`, `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:66`
- **Verification:** confirmed. Device Check Newcomer shows a green 'Active' beside 'Last signed in: Not yet' at 768 (c-dcn--tablet-light.png). page.tsx:36 selects only id, email, status and lastSignInAt. PortalAccount already has lastSeenAt (schema.prisma:528, written by session.ts:65), which is simpler than reading the newest session's lastUsedAt. Device Check Contractor holds a live session yet also reads 'Not yet', so lastSignInAt is the wrong signal for 'using it'. With 30-day sessions it also goes stale for daily users.

### BCONTRACT-007

**Subjects say 'updated' for everything except assigned and marked done**

Medium · Fix · effort S · `Every task email subject (contractor and partner)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Partly fixed in 9f74ea1: when the latest status change in the bundle is sent back, scheduled or approved, the subject now says so ('Connor scheduled Cabinet install for Fri, Oct 30', using the latest date in the email). Still open: target moved, target cleared, comments, files, notes and a contractor's Start still arrive as 'X updated T'. Subjects still never include the property, titles aren't shortened, and the partner-side 'Zack finished' form wasn't added. The outcome-first subject wording is Connor's copy decision.
- **Today:** emailSubject has three shapes: 'X marked T done', 'X assigned you T', and 'X updated T' for everything else. Rendered cases: scheduled, sent back, approved, target moved, target cleared, comment, staff files and contractor Start all arrive as 'Connor updated Cabinet install Unit 2' or 'Zack updated Cabinet install Unit 2'. The property is never in the subject.
- **Why:** On a phone the subject and preview are the whole email for most reads. 'Sent back' needs action today, 'Approved' needs none, and they look identical in the inbox. Peerspace, Linear and Stripe put the outcome first in the subject.
- **Change:** Pick the subject from the most important item in the bundle, in this order: sent back, scheduled, approved, target moved, assigned, comment, files, notes. Examples: 'Sent back: Cabinet install, 415 Crescent' / 'Scheduled Fri, Oct 30: Cabinet install' / 'Approved: Cabinet install' / 'New date Fri, Oct 30: Cabinet install' / 'Connor: "Doors arrive Thu"' / 'Zack finished Cabinet install' (partners). Keep the short address, cut the title at about 40 characters.
- **Desktop, tablet, phone:** Email only. Gmail iOS shows about 35 to 40 characters of subject at 375, so the outcome word comes first.
- **Reuse:** emailSubject in src/lib/notifications/content.ts and its tests.
- **References:** 
  - [Gmail](https://mobbin.com/screens/ecadc8f0-a5b3-4ab9-8212-e70e97c02ba8): Inbox rows that work ('You're now on call', 'Built-in domain change confirmation') state the outcome in the subject.
  - [Peerspace](https://mobbin.com/screens/34a44275-e3a8-493f-84b9-b45604728b52): 'Elvina accepted this booking!' and status words like Confirmed and Withdrawn lead each row.
- **Code:** `emails/index.txt`, `branch: src/lib/notifications/content.ts:138-145`
- **Verification:** confirmed. emailSubject has exactly three shapes (content.ts:138-145). Every rendered case except assigned and marked done reads 'X updated T', and no subject names the property. Ordering by importance is sound.

### BCONTRACT-011

**The directory still can't show who has a login, though the branch now stores it**

Medium · New capability · effort S · `/contractors directory` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** On the branch, PortalAccount (status, lastSignInAt, mustChangePassword) exists, but /contractors queries Contact only and shows Name, Company, Trades, Phone, Docs. Tracking 29 invites means opening 29 records. ADMIN-015 raised this on main when there was no data; the branch removes that blocker and still ships without it.
- **Why:** D22 invites everyone on Oct 29. Clerk, Gusto and Qatalog all treat 'who's invited, who's in' as the main view of a people list.
- **Change:** Add an 'HG Jobs' column with 'Active · 2d ago', 'Invited' or '—', from a portalAccount select. Above the table, add a segmented control with counts: All 31 | No login 29 | Invited 1 | Active 1. Sort Invited first on invite day. No row actions yet; the record holds them.
- **Desktop, tablet, phone:** Desktop and tablet: column after Name. Phone 375: the status renders as the second line under the name in the list-row layout earlier findings recommend; the segmented control becomes a Filters button if the four labels don't fit at 320.
- **Reuse:** SegmentedControl (src/components/segmented-control.tsx), Badge, Table.
- **References:** 
  - [Clerk](https://mobbin.com/screens/731c7344-9391-48db-b387-db09d09f5d1e): Users table with a Last signed in column beside Joined.
  - [Qatalog](https://mobbin.com/screens/d35d7504-e0eb-4926-935d-51b98b818a81): Counted segments Active, Invited, Deactivated over the list, with an Invited tag on rows.
  - [Linear](https://mobbin.com/screens/ae99a607-158a-4642-a69f-00c024381bd0): Members table: Status column reads 'Admin (Invited)', plus Joined and Last seen ('Online', 'Mar 30') in fixed columns; toast '3 invites sent'
  - [Jobber](https://mobbin.com/screens/024081f3-c028-4a49-ac5e-cf4b6fbbaa20): Manage team table with a Last login column, the field-service version of portal status
  - [Basecamp](https://mobbin.com/screens/1c4bcf79-c416-4094-8a88-f5a2a2f86091): Everyone on the account: email under each name and an inline 'Invited on 17 Jun' marker for people who have not joined yet
  - [Tailscale](https://mobbin.com/screens/173a8b50-ee42-4a92-a6a6-d1b728c3e9fc): Invited badge on the row and a Last seen column
  - [Linear](https://mobbin.com/screens/c1bf83ff-9577-4fe6-aff9-0230030944ee): Status column reading 'Admin (Invited)' next to Last seen
  - [Dropbox](https://mobbin.com/screens/9af320af-78c1-4796-bee5-efc08f08c933): Invited filter chip and Resend invite on the row
- **Code:** `branch: src/app/(app)/contractors/page.tsx:9-20`, `branch: docs/asana-migration-plan.md:189-196`, `branch: docs/asana-migration-plan.md:487-494`, `branch:prisma/schema.prisma:515-535`, `branch:src/app/(app)/contractors/page.tsx:33-39`, `branch:src/app/(app)/contractors/[id]/portal-access-card.tsx:66`, `branch: docs/asana-migration-plan.md:493`
- **Also found as:** ADMIN-015 (Contractors directory, contractor detail and Settings)
- **Verification:** confirmed. /contractors queries Contact only (page.tsx:9-20), with columns Name, Company, Trades, Phone, Docs (dir--desktop-light.aria.txt). PortalAccount now exists, so the blocker main's ADMIN-015 noted is gone. Keep the column. The four-count segmented control is optional after invite week.

### BCONTRACT-013

**A login's email can't be changed, and creating one doesn't fill the contractor's blank email**

Medium · New capability · effort M · `Portal access card: login email` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The email is set once in createPortalAccount, and no action updates it. A typo ('[email]') means Forgot password links and every job email go to a dead address, and the only fix is a database edit (Remove access keeps the row and its unique email). Separately, a login made with a new address leaves Contact.email at '—', so the Contact card and the Portal access card disagree.
- **Why:** 14 of 29 contractors have no email on file (G1A-008), so most addresses will be typed in on invite day, often on a phone. Clerk, Zoom and Rocket Money all let an admin or user change the sign-in email.
- **Change:** Add 'Change email' to the card's menu. It opens a Sheet with the email field and the sublabel 'Zack signs in with this and gets job emails here'. On save: run the same unique and staff checks, expire reset tokens, log a SecurityEvent, and confirm with a toast 'Login email changed to ...'. When Contact.email is blank, createPortalAccount and Change email also write it there.
- **Desktop, tablet, phone:** Sheet: centered on desktop and tablet, bottom sheet on phone with the 16px field and the keyboard-safe primary button.
- **Reuse:** Sheet, Input, Toast; accounts.ts gains changePortalEmail beside resetPortalPassword.
- **References:** 
  - [Rocket Money](https://mobbin.com/flows/076f89dc-305b-48d9-b60f-bb06d26d2d51): Account rows 'Change Email' and 'Change Phone Number' open a small dialog and end on a toast naming the change.
  - [Gusto](https://mobbin.com/screens/514a6ae7-e9b2-4d18-abd0-5ead94eb48d1): The invite email field's sublabel says what the address is used for: signing in and filling in details.
- **Code:** `branch: src/lib/portal/accounts.ts:98-135`, `branch: src/app/(app)/contractors/actions.ts:20-61`
- **Verification:** confirmed. accounts.ts has no function that updates PortalAccount.email. Contact also has no app-side writer (main's ADMIN-003 is still true on the branch), so a typo'd login email needs a database edit. Ship Change email together with contact editing so the two emails agree.

### BCONTRACT-015

**Home's card is a flat list of 12 that hides 'Needs review' and doesn't match Today**

Medium · Design change · effort M · `/ Home, 'My open tasks' card` · Home and Today become one work queue

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Needs review appears on Today's Contractors column. Home's 'My open tasks' card leaves it out, and the card sits below the CapEx forecast.
- **Why:** Approved item 8 says Home's card links to Today. Executed as a second, differently sorted list, it makes Home a weaker copy of Today and drops review work, which only reaches partners by email until D10's 'what needs me' Home ships after cutover.
- **Change:** Turn the card into a compact 'For you today' summary in Today's own vocabulary: 'Needs review 1' (button Review), 'Overdue 25', 'Due today 2', 'Unassigned 34', each row opening Today at that group. Below, show up to 3 Needs review rows with the contractor and property. Header link 'Open Today'. Keep the CapEx card below it.
- **Desktop, tablet, phone:** Desktop 1280: four summary rows plus 3 review rows in a half-width card. Tablet 768: full width, same rows. Phone 375: two-line rows, review rows first; Unassigned drops to the Today screen.
- **Reuse:** todayTasks from src/lib/tasks/queries.ts for the counts; TaskRow and the Review buttons from Today; Card.
- **Challenges:** Approved item 8 ('Home's card linking to Today') and D10 (Home as 'what needs me' after cutover): this changes the card's content now as a bridge. Connor to confirm.
- **References:** 
  - [Deel](https://mobbin.com/screens/6bd4989c-7a50-413e-be7e-e955b2394a29): 'For you today' lists to-dos by type with counts ('Contractors' submissions 38') and a Review button on each.
  - [Bonsai](https://mobbin.com/screens/818acac4-f25c-4898-871a-322b1431b19f): Task summary as four counts (Upcoming, Due Today, Overdue, Completed) instead of a long list.
- **Code:** `branch: src/app/(app)/page.tsx:54-72`, `branch: src/lib/tasks/queries.ts:49-57`
- **Verification:** partly. Home's card is myOpenTasks: assigneeUserId only, due-date sorted, 12 rows, no done circle (queries.ts:49-57, my-tasks-list.tsx). It sits under the CapEx card. The why overstates the gap: Needs review is the top of Today's Contractors column (D31), so review work is not email-only. Home just doesn't surface it. Bonsai 818acac4 is also cited in BCONTRACT-030 for a different screen. Bonsai 091ddda6 (verified: Upcoming, Due Today, Overdue, Completed counts) backs the count pattern.

### BCONTRACT-016

**Creating a login ends on a gray box, with no payoff and no next step**

Medium · Design change · effort S · `Portal access card: right after Create login or Reset password` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Approved item 2 shows the starting password inline in the card. The missing heading, next step and Done can be added there without a sheet.
- **Why:** House rule: payoff moments show what happened and what's next, never a generic box. Shown-once secrets elsewhere (Gamma, OpenAI, Grok) give a clear heading, a warning, Copy and an explicit close.
- **Change:** Show it in the Sheet from BCONTRACT-012. Heading 'Zack's login is ready'. The password on its own line with Copy. Primary 'Text Zack' (or 'Copy message' when there's no phone). Line: 'You won't see this password again. Zack chooses his own when he signs in.' Then 'What's next: this card shows when he signs in.' Button 'Done' closes it and the card shows 'Invited · not signed in yet' (BCONTRACT-004). Use the contractor's pronoun-free wording ('Zack chooses a new one').
- **Desktop, tablet, phone:** Desktop and tablet: centered sheet, max-w-sm. Phone 375: bottom sheet with 'Text Zack' as the full-width primary in thumb reach and Copy beside the password.
- **Reuse:** Sheet, Button, Toast; StartingPassword's content moves into it. Simple single-color line spot art per the imagery rule is optional.
- **Challenges:** Approved batch item 2 shows the starting password inside the card; this moves it into a sheet. G1A-010 proposed a similar Stripe-style dialog.
- **References:** 
  - [Gamma](https://mobbin.com/screens/3762fc5a-915b-4783-a48b-01f01c95c49a): 'Keep it safe' dialog: warning that the key won't show again, value with Copy, explicit 'Close and hide forever'.
  - [Gusto](https://mobbin.com/screens/fd254564-eb5b-4b85-9fea-cb7389c82178): Ends the add-a-contractor flow with 'Here's what happens next' and the first step Gusto will take.
- **Code:** `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:220-253`, `branch: docs/asana-migration-plan.md:455`
- **Verification:** partly. Code matches the description (portal-access-card.tsx:220-253): no heading, no Done, 'picks their own' for a named person, and the box stays until you navigate away. The spec lists 'login created' as a payoff state still to build. Moving it into a Sheet is a layout change to approved item 2. The heading, next step and Done can be added inline, which keeps the approved placement. Extra backing: Turo https://mobbin.com/screens/a9dd3728-cd91-485a-8710-97e4cbb116d7 ('Co-host invited!' with 'Send your teammate a text', Share and Done).

### BCONTRACT-017

**Applying a playbook sends one 'assigned you' email per job**

Medium · Design change · effort M · `Contractor emails: a playbook applied with several contractor items` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** core.createTask calls notify(ASSIGNED) for every task with a contractor assignee, and the outbox bundles per recipient per task (openKey includes taskId). Applying a move-out playbook with five items for Zack sends five separate 'Connor assigned you ...' emails within three minutes. The same happens when Approve on a repeating job creates the next copy: two emails with the same title.
- **Why:** D19 promised one email per burst of activity; the per-job key breaks that for the busiest moments (D28 playbooks Nov 1 to 15). Five near-identical emails read as spam and push contractors to filter them.
- **Change:** Bundle assignments across jobs for one contractor within the same 10-minute window. Subject 'Connor assigned you 5 jobs at 415 Crescent Ave'. Body: one row per job with its Target date, and one button 'Open My jobs'. Other change kinds stay per job.
- **Desktop, tablet, phone:** Email only. Rows wrap to two lines at 375 (title, then address and date).
- **Reuse:** enqueue's openKey in core.ts gains an 'assignments' key per recipient; taskEmail gets a list variant.
- **Challenges:** D19 bundles 'everything you two do to one job'; this extends bundling across jobs for assignments.
- **References:** 
  - [Jira](https://mobbin.com/screens/f09233f3-fab0-470e-bcdb-193fdb1ba056): Groups a burst from one person into one notification with '+12 updates from Alex Smith'.
- **Code:** `branch: src/lib/tasks/core.ts:166-183`, `branch: src/lib/tasks/core.ts:273-276`, `branch: src/lib/tasks/templates.ts:57`, `branch: src/lib/tasks/core.ts:401-405`
- **Verification:** confirmed. openKey is per recipient and task (core.ts:167). applyPlaybook calls createTask once per row (templates.ts:57), and each contractor row queues its own ASSIGNED. The repeat case recurs more often: Approve on a repeating contractor job sends one email for Done (task A) and one 'assigned you' for the next copy (task B), both with the same title. The D19 conflict is correctly named.

### BCONTRACT-V02

**A contractor's record shows each job's Due date, not the Target he sees, and never marks late**

Medium · Fix · effort S · `/contractors/[id] Jobs card` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The Jobs card sorts by dueDate and prints fmtDay(t.dueDate) with the year ('Oct 26, 2026', 'Oct 23, 2026') in muted gray. Today's Contractors column and the portal use targetOf, which is the visit date while Scheduled (D7). A Scheduled job with a visit on Thu and a due date on Fri reads Fri here and Thu everywhere else. A Scheduled job with no due date reads '—'. Late jobs get no red, unlike Today's 'Yesterday' and '2d late' chips.
- **Why:** This is the record Connor opens to see what a contractor has on. It should show the date the contractor is working to, as Today does, or the two screens disagree once jobs get scheduled after cutover.
- **Change:** Use targetOf for the date and the sort. Show 'Visit Thu, Oct 29' when the target is a scheduled visit, and the same red late styling as Today (isTargetLate). Drop the year for this year (fmtDay year 'auto').
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: date column as today, without the year. Phone 375: the date stays and the address keeps dropping, as now.
- **Reuse:** targetOf and isTargetLate in src/lib/tasks/list.ts; the date chip styling from Today's task-row.tsx.
- **References:** 
  - [Shopify](https://mobbin.com/screens/5070a71f-df97-4c8a-b3cf-2c1eeb0d931e): Overdue status chip on a vendor's bill row
- **Code:** `branch: src/app/(app)/contractors/[id]/page.tsx:45`, `branch: src/app/(app)/contractors/[id]/page.tsx:153`, `branch: src/lib/tasks/list.ts:91-115`, `src/app/(app)/contractors/[id]/page.tsx:109-111`, `branch:src/app/(app)/contractors/[id]/page.tsx:152-154`, `branch:src/app/(app)/tasks/task-row.tsx:49-54`, `branch:src/lib/dates.ts:161-177`
- **Also found as:** ADMIN-018 (Contractors directory, contractor detail and Settings)
- **Verification:** verifier-found

### BCONTRACT-005

**Undoing a date move still emails the contractor 'moved the target to' the date it already was**

Low · Fix · effort M · `Contractor email after a reschedule with Undo (D7 Undo toast)` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Undo runs restoreTaskDates, which calls core.patchTask for each task, which queues a second TARGET item. itemLines keeps only the latest TARGET in the bundle. So Connor moves Zack's job from Oct 23 to Oct 30, taps Undo, and three minutes later Zack gets 'Connor updated Cabinet install Unit 2 / Connor moved the target to Fri, Oct 23': a change email for a date that never changed. Reassigning away and back within the window gives two identical 'Connor assigned you this job' lines.
- **Why:** Undo is the approved safety net (D7). Emails for undone changes teach contractors to distrust the emails, and these emails are the only push channel before cutover (no push notifications, D26).
- **Change:** Store from and to on every TARGET and NOTES item (the patch path already knows both). At send time, net each kind across the bundle: keep the first 'from' and the last 'to', and drop the item when they match. Drop the whole row with lastError 'nothing to send' when no items remain. Dedupe ASSIGNED. Add content.test.ts cases for move-then-undo and assign-reassign-assign.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** itemLines in src/lib/notifications/content.ts and the existing 'nothing to send' close path in outbox.ts.
- **References:** 
  - [Jira](https://mobbin.com/screens/f09233f3-fab0-470e-bcdb-193fdb1ba056): Notifications state each change as from and to and group repeats ('+12 updates'), which makes a net-zero change visible as one.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Activity collapses back-and-forth status changes into one line.
- **Code:** `branch: src/lib/tasks/bulk.ts:61-74`, `branch: src/lib/tasks/core.ts:513-519`, `branch: src/lib/notifications/content.ts:126-132`, `branch: src/app/(app)/tasks/task-list-context.tsx:65-71`, `branch: docs/asana-migration-plan.md:288-302`
- **Also found as:** G1A-030 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. Mechanics verified: restoreTaskDates (bulk.ts:62-74) runs patchTask, which queues a second TARGET item (core.ts:513-519), and itemLines keeps the last TARGET (content.ts:126-132). Assign, reassign away, then reassign back does queue two ASSIGNED lines. The email names the date that is still correct, so the harm is a confusing 'moved' line, not wrong data.

### BCONTRACT-006

**The texted password ends in a period and the message is one run-on line**

Low · Fix · effort S · `Portal access card: 'Text login details' message` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The URL and email are tappable without the period because data detectors exclude it. Only the password, which is typed or copied by hand, carries the trailing-period risk. The message reads as one run-on line.
- **Why:** A contractor reading 'k7mq-4vxp-2hzt.' on a phone will often type or paste the period, get 'wrong password', and the throttle locks him out after a few tries. iMessage copies whole bubbles, so the punctuation comes along. This is separate from G1A-001's invite-link proposal: it breaks the flow the branch actually ships.
- **Change:** Use line breaks with no trailing punctuation on values. 'Hi Zack, it's Connor. Here's your HG Jobs login.' / the link alone on a line / 'Email: [email]' / 'Password: k7mq-4vxp-2hzt' / 'You'll choose your own after you sign in.' Update login-text.test.ts so no value is followed by punctuation.
- **Desktop, tablet, phone:** SMS only. Each value on its own line stays readable at any width.
- **Reuse:** src/lib/portal/login-text.ts loginTextBody. smsHref already encodes newlines.
- **Code:** `branch: src/lib/portal/login-text.ts:22-28`, `branch: src/lib/portal/tokens.ts:43-51`, `branch: src/app/login/page.tsx:10-13`
- **Also found as:** BPORTAL-039 (Branch: contractor portal and contractor sign-in)
- **Verification:** partly. loginTextBody joins five sentences with trailing periods (login-text.ts:22-28). That is true, and line breaks are a cheap fix. iOS and Android link and email detectors already drop trailing periods, so the URL and email are safe to tap. The real risk is the password when typed by hand or pulled from a whole-bubble copy. The lockout needs 5 failures in 15 minutes (login-throttle.ts:33-34).

### BCONTRACT-009

**Portal access sits below the fold under an eight-field Contact card; the header shows no access state**

Low · Design change · effort S · `/contractors/[id] layout` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** At 1280x800 Zack's card header is at y=737 and Create login at y=862, 62px below the fold. Device Check Newcomer's Remove access is at y=863. At 375 the card header starts at y=729 for Zack and y=693 for Newcomer, not about 850.
- **Why:** On Oct 29 the job on this page is 'give Zack access'. Gusto and Clerk put a person's account state at the top of the record, and the house rule asks for per-item status in one fixed, skimmable spot.
- **Change:** Option A (recommended): put an access chip in the header next to the name ('HG Jobs: Invited'), and move the Portal access card above Contact in the left column. Option B: keep the card order and add the header chip plus a header button for the primary action (Create login / Text again). Option C: a sub-tab 'Access' (fits D10's record tabs later). In every option, Contact hides empty fields behind 'Add details'.
- **Desktop, tablet, phone:** Desktop 1280: chip in the header, card first in the left rail. Tablet 768: one column, card directly under the header. Phone 375: chip under the name, card first, Contact shows only filled fields; the imported note collapses to one line.
- **Reuse:** Badge, Card, Field from src/components/ui.tsx; PortalAccessCard unchanged inside.
- **Challenges:** Approved batch item 2 (Portal access card) and the earlier G1A-010 proposal place the card in the rail under Contact; this asks Connor to move it above Contact and add a header chip.
- **References:** 
  - [Gusto](https://mobbin.com/screens/b723bdfb-f882-422d-b49c-7c31365c880a): A contractor's onboarding steps and 'Hire pending' state sit directly under the name, before any details.
  - [Zoom](https://mobbin.com/screens/a1b5f319-8616-46c6-8456-da792acba326): Sign-in section is its own block near the top: email, password, sessions, each with an action at the right.
- **Code:** `branch: src/app/(app)/contractors/[id]/page.tsx:52-121`
- **Verification:** partly. The card is below Contact, and the header says nothing about access. The fold numbers are smaller than stated. Moving access above Contact for good would bury the contact details partners need daily, once the Oct 29 invites are done. The header chip (Option B) gets most of the value. Conflict with approved item 2 is correctly named.

### BCONTRACT-010

**The page doesn't say that Zack's 8 open jobs are invisible to him and send him no email**

Low · Design change · effort S · `/contractors/[id] for a contractor with jobs and no login` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** For a contractor without an active login, no email row is queued at all: notifyAudience drops staff changes at write time. When he later gets a login, he receives nothing about the 8 jobs already assigned. They only show up in My jobs.
- **Why:** This is the most likely state on invite day: a contractor with open work and no access. Saying so turns the card from a form into a reason to act.
- **Change:** In the no-login state, put one line above the email field: '8 open jobs. Zack can't see them or get updates until he has a login.' Use 'No open jobs yet' for contractors with none. On the Jobs card header, show a muted 'Not on HG Jobs' note when there's no active login.
- **Desktop, tablet, phone:** One line at 1280 and 768, two lines at 375 ('8 open jobs.' / 'Zack can't see them yet.'). Nothing drops.
- **Reuse:** Count from the tasks already loaded in page.tsx; PortalAccessCard gets an openJobs prop.
- **References:** 
  - [Gusto](https://mobbin.com/screens/b723bdfb-f882-422d-b49c-7c31365c880a): 'Hire pending' notice explains what the person can't do yet and the action that unblocks it.
- **Code:** `branch: src/lib/notifications/content.ts:55-62`, `branch: src/components/assignee-picker.tsx:207-211`
- **Verification:** partly. The page doesn't say what a missing login costs. The mechanism is misattributed, though. notify() checks contractorHasLogin at write time, and notifyAudience returns null for staff changes when there's no login (rules.ts:59, core.ts:187-188). No outbox row is ever created, so deliveryFor never sees one, and nothing catches him up after a login exists. Connor already sees 'Create login' and the job count on the same page, so the added line is a nudge, not a fix for hidden state.

### BCONTRACT-014

**Nothing shows whether the contractor got in: sign-ins, chosen password, lockouts and lockbox views are logged but hidden**

Low · New capability · effort M · `Portal access card: what happened since the invite` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** SecurityEvent records ACCOUNT_CREATED, SIGN_IN_OK, SIGN_IN_FAILED (with a reason), PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED, SESSIONS_REVOKED and LOCKBOX_VIEWED. PortalSession stores lastUsedAt and userAgent. The card shows only 'Last signed in'. Staff can't see that Zack failed three times this morning, that he never chose his own password, or who opened a lockbox code, although D21 says 'Every view is logged'.
- **Why:** 'Be sure they got it' needs evidence. A visible lockout lets Connor fix it with a Reset before Zack calls. Lockbox views are only useful as an audit if someone can read them. G1A-010 asked for a one-line last-active status; this is the history behind it.
- **Change:** Under the status line, add an 'Activity' disclosure (collapsed, last 5 entries, 'Show all' for more) with Wise-style dated lines: 'Login created by Connor · Oct 29, 9:02 AM', 'Signed in on iPhone · 9:14 AM', 'Chose a password · 9:15 AM', '3 wrong passwords · Oct 30' (amber), 'Viewed lockbox for Cabinet install · Oct 30'. When the latest event is a lockout, put 'Reset password' beside it.
- **Desktop, tablet, phone:** Same list at every size; device names shorten to 'iPhone' or 'Computer'. On phone the disclosure starts collapsed.
- **Reuse:** activity-timeline.tsx (the shared timeline) styled compact; Badge amber for failures.
- **References:** 
  - [Wise](https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614): Dated, plain-sentence steps ('You set up your transfer', 'We received your SGD') show exactly where something stands.
  - [Braintrust](https://mobbin.com/screens/ba5fb87e-acc7-414f-8e82-8f512c15cdbc): Active sessions list device details and last activity, with Terminate per session.
- **Code:** `branch: prisma/schema.prisma:539-575`, `branch: src/lib/portal/accounts.ts:239-249`, `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:114-123`
- **Verification:** partly. True: SecurityEvent is written but never read for staff. LOCKBOX_VIEWED is only read to dedupe (jobs.ts:81-85), so D21's 'every view is logged' has no viewer. The 'did they get in' state is BCONTRACT-004's job, and a lockout can be handled by the Reset that already exists. The full history is a post-invite nice-to-have.

### BCONTRACT-019

**Staff uploads email raw filenames, one line per file**

Low · Fix · effort S · `Contractor email: staff added files` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** recordAttachment with standalone true (the staff Attachments panel) queues 'added IMG_4412.HEIC' per file, and itemText passes it through. Two photos render as 'Connor added IMG_4412.HEIC' and 'Connor added IMG_4413.HEIC'.
- **Why:** Camera filenames mean nothing to a contractor and make the email longer with each file.
- **Change:** Queue the attachment kind instead of the filename, and collapse at render: 'Connor added 2 photos', 'Connor added a video', 'Connor added a PDF: Cabinet layout'. Keep a real filename only for documents.
- **Desktop, tablet, phone:** Email only.
- **Reuse:** kindForType in core.ts; itemLines grouping in content.ts.
- **Code:** `branch: src/lib/tasks/core.ts:614-618`, `branch: src/lib/notifications/content.ts:110-111`
- **Verification:** confirmed. Staff uploads default to SHARED (service.ts:320) and, when standalone, queue 'added <filename>' per file (core.ts:614-618). Portal uploads go through comments with standalone false (portal/jobs.ts:160), so partner emails already say 'added 4 files'. This is staff-to-contractor only.

### BCONTRACT-020

**Comment lines show '(+3 files)', cut at 140 characters with no ellipsis, and lose line breaks**

Low · Fix · effort S · `Partner and contractor emails: comment lines` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** addComment builds the summary as the quoted body sliced to 140 characters plus ' (+3 files)'. oneLine() collapses newlines. Zack's 'Uppers are in, lowers tomorrow' with three photos renders as 'Zack: "Uppers are in, lowers tomorrow" (+3 files)'. A 300-character note ends mid-word inside closing quotes, so it reads as complete.
- **Why:** Comments are the main content of these emails. '(+3 files)' is developer shorthand, and a silent cut can drop the important half of a message ('...but the subfloor is rotted').
- **Change:** Write 'Zack: "Uppers are in, lowers tomorrow" and 3 photos'. Cut at a word boundary up to about 280 characters and end with '…' plus 'Read more in the job'. Keep line breaks in the HTML (escape, then convert newlines to <br>), and in the plain text.
- **Desktop, tablet, phone:** Email only.
- **Reuse:** addComment summary in core.ts; itemText and render.ts.
- **References:** 
  - [Workable](https://mobbin.com/screens/e8a8d446-e13b-4661-970f-6c2e8f208793): Comments appear as a quoted block under 'Sam Lee added a comment', keeping their own line breaks.
- **Code:** `emails/index.txt (case s-comment-photos)`, `branch: src/lib/tasks/core.ts:557-558`, `branch: src/lib/notifications/content.ts:74`
- **Verification:** confirmed. core.ts:557-558 slices to 140 characters with no ellipsis and appends ' (+N files)'. oneLine (content.ts:74) collapses newlines.

### BCONTRACT-021

**'Connor updated the notes' doesn't say what changed**

Low · Fix · effort S · `Contractor email: notes changed` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** A notes edit on a contractor's job queues 'updated the notes on "T"', rendered as 'Connor updated the notes'. The contractor has to open the job and compare from memory.
- **Why:** Notes changes on contractor jobs are usually instructions ('Use the white grout', 'Tenant home after 3'). D16 makes notes always visible to the contractor, so the email can show them.
- **Change:** Include the new notes' first 200 characters as a quoted block under the line, with '…' when cut. When the change is an append, show only the added text: 'Connor added to the notes: "Tenant home after 3"'.
- **Desktop, tablet, phone:** Email only.
- **Reuse:** patchTask already has before.description and the new value.
- **Code:** `branch: src/lib/tasks/core.ts:520-522`, `emails/index.txt (case c-assigned-plus-target-notes)`
- **Verification:** confirmed. core.ts:520-522 queues the fixed 'updated the notes' summary. before.description and the new value are both in scope, so including them is S.

### BCONTRACT-022

**Emails have no head, no preheader and no color-scheme, so the inbox preview opens with 'HG Capital Partners'**

Low · Fix · effort S · `Every email: HTML skeleton and inbox preview` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** renderPlainEmail outputs <html><body> with no <head>, so there is no charset, viewport, color-scheme meta or <title>. The first text in the body is the tracked-caps brand 'HG Capital Partners', so iOS Mail and Gmail previews read 'HG Capital Partners Cabinet install Unit 2, 415 Crescent Ave. Connor moved it to...'.
- **Why:** The preview line is the second thing read after the subject. Spending it on the brand pushes the actual change off the line at 375.
- **Change:** Add a head with charset utf-8, viewport, color-scheme 'light only' (until a dark variant is designed) and a title equal to the subject. Add a hidden preheader (display:none, max-height:0) holding the first change line, padded so the brand doesn't leak into the preview.
- **Desktop, tablet, phone:** Email only. Preview shows about 90 characters at 375.
- **Reuse:** renderPlainEmail gains a preheader field, filled from TaskEmail.items[0].
- **References:** 
  - [Churnkey](https://mobbin.com/screens/e9a3c357-1097-49cf-8b5b-89b5e2ac1a06): Email preview shows the inbox view beside the message: sender, subject, then a purposeful preview line.
  - [Gmail](https://mobbin.com/screens/ecadc8f0-a5b3-4ab9-8212-e70e97c02ba8): Preview lines that start with substance ('Upcoming on-call shift You are going on...') carry the message.
- **Code:** `branch: src/lib/email/render.ts:56-72`, `branch: src/lib/email/render.ts:47-53`
- **Also found as:** G1A-032 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. render.ts:56-58 emits <html lang=en><body> with no head, meta, title or preheader. The first body text is the tracked-caps brand. The plain-text part also starts with 'HG Capital Partners' (render.ts:46-47).

### BCONTRACT-026

**Remove access doesn't say the jobs stay assigned and the emails stop**

Low · Design change · effort S · `Portal access card: Remove access confirm` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The confirm says '{first} is signed out everywhere and can't sign in until you restore access.' It doesn't mention that his open jobs stay assigned to him, still list under his name in Today's Contractors column, and that every job email to him is now dropped (deliveryFor requires an ACTIVE login).
- **Why:** Removing access usually means the contractor is off the work. Leaving his jobs assigned to someone who can't see them is exactly the silent failure the Contractors column is meant to prevent.
- **Change:** Body: 'Zack is signed out now and stops getting job emails. His 3 open jobs stay assigned to him.' After removal, the toast reads 'Zack can't sign in now' with an action 'Reassign 3 jobs' that opens All filtered to his open jobs.
- **Desktop, tablet, phone:** Sheet on every size; the toast action is a text button that sits above the phone's bottom edge.
- **Reuse:** Sheet, Toast with action, the All tab's owner filter (c:<contactId>).
- **References:** 
  - [Bonsai](https://mobbin.com/screens/5b4cbb52-c232-4bfa-9ffd-4dafa18fa355): Removal confirm names exactly what access is revoked ('all projects and documents').
  - [Clerk](https://mobbin.com/screens/07214327-93f0-44bf-a61e-fcfd0515b288): Spells out the consequence and that the member can be re-added later.
- **Code:** `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:190-214`, `branch: src/lib/notifications/content.ts:59`
- **Verification:** confirmed. The confirm body is exactly as quoted (portal-access-card.tsx:192-193). deliveryFor and notifyAudience both drop the contractor's emails once the login is DISABLED, and assigned jobs stay put.

### BCONTRACT-027

**The card says 'Active' for a contractor whose contact is inactive, while sign-in and emails refuse him**

Low · Fix · effort S · `/contractors/[id] Portal access card for an inactive contact` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens. Still open at 9f74ea1: contact.active is still not passed to the Portal access card, so an inactive contractor with a login shows Active and the full set of actions even though sign-in and emails refuse him. The 'Access off: contractor is inactive' state and its actions are Connor's design and copy call, and the code then needs to pass the flag through.
- **Today:** The card's active flag is portalAccount.status === 'ACTIVE' only. authenticatePortalAccount refuses sign-in when contact.active is false ('contact-inactive'), and deliveryFor drops his emails as 'no login'. An inactive contractor with a login therefore shows a green Active badge and the full set of actions while he can't get in. No contact is inactive in the branch DB today, but the directory supports the state.
- **Why:** The card should report what the sign-in check will do, not one of its two inputs.
- **Change:** Pass contact.active into the card. When false, show 'Access off: contractor is inactive' with no Reset or Sign out, and one action 'Make active' once contact editing exists.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** Badge; the existing account view.
- **Code:** `branch: src/app/(app)/contractors/[id]/page.tsx:110-118`, `branch: src/lib/portal/accounts.ts:239`
- **Verification:** confirmed. active = status === 'ACTIVE' only (page.tsx:115), and sign-in refuses on contact-inactive (accounts.ts:239). This is latent today: no contact is inactive, and nothing in the app can set one inactive (main's ADMIN-003).

### BCONTRACT-028

**Closed-job dates render in UTC, so evening completions show the next day**

Low · Fix · effort S · `/contractors/[id] Jobs card, closed jobs` · Fix wrong numbers and records first

- **Migration branch:** Found on the migration branch's new screens
- **Today:** Closed rows show fmtDate(t.completedAt). fmtDate calls toLocaleDateString with no timeZone, unlike fmtDateTime, which pins HG_TIME_ZONE. On Vercel (UTC) a job approved at 8:30 pm Buffalo time shows the following day.
- **Why:** Wrong dates on the contractor's record undermine the 'record of what was done' that closing the loop depends on, and they won't match the job page or the email.
- **Change:** Give fmtDate the same timeZone: HG_TIME_ZONE when it formats an instant, and keep the date-only path for Ymd values. Add a dates test at 01:00Z.
- **Desktop, tablet, phone:** Not visual.
- **Reuse:** src/lib/utils.ts fmtDate and fmtDateTime.
- **Code:** `branch: src/lib/utils.ts:22-27`, `branch: src/app/(app)/contractors/[id]/page.tsx:153`
- **Verification:** confirmed. fmtDate formats instants without timeZone (utils.ts:22-27), unlike fmtDateTime. The closed-job column uses it for completedAt (page.tsx:153). fmtDate is shared, so the fix helps every caller.

### BCONTRACT-029

**Access fields use a different label style from the Contact card and stretch across the tablet width**

Low · Design change · effort S · `/contractors/[id] Portal access card fields` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The Contact card uses Field (stacked, uppercase muted label over the value). The Portal access card right next to it uses its own dl with sentence-case 'Email' and 'Last signed in' at the left and values right-aligned. At 768, 'Email' and '[email]' sit about 690px apart on the same row.
- **Why:** Two label systems in adjacent cards read unfinished, and a label far from its value is hard to scan.
- **Change:** Reuse Field for Email and Status in the access card, so labels and values stack the same way in both cards. Keep the card's actions below a divider.
- **Desktop, tablet, phone:** Desktop rail: stacked fields. Tablet 768: stacked, card full width with no wide gaps. Phone 375: same as tablet.
- **Reuse:** Field from src/components/ui.tsx.
- **References:** 
  - [Gusto](https://mobbin.com/screens/fd254564-eb5b-4b85-9fea-cb7389c82178): Record cards (Role, Payment, Contractor Agreement) all use one stacked label-over-value style with Edit at the top right.
- **Code:** `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:114-123`
- **Verification:** confirmed. At 768, 'Email' sits at x=41 and '[email]' is right-aligned near x=727 (c-dcn--tablet-light.png). The Contact card beside it uses stacked uppercase Field labels.

### BCONTRACT-030

**No email tells a contractor his password changed or a reset was done for him**

Low · New capability · effort S · `Contractor emails: password changed or access changed` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** changeOwnPassword, finishPasswordReset and staff resetPortalPassword revoke sessions and log a SecurityEvent, but send nothing. The only account email is the reset link itself ('Reset your HG password').
- **Why:** A change notice is the standard backstop if someone else got the password from an old text (G1A-001 notes the password stays in message history). It also confirms to the contractor that the change worked.
- **Change:** After any password change, send one plain email: subject 'Your HG Jobs password was changed', line 'Your password was changed on Oct 29 at 9:15 AM. If this wasn't you, text Connor at 716-xxx-xxxx.', button 'Sign in'. Count it against the daily cap the way reset emails already are.
- **Desktop, tablet, phone:** Email only.
- **Reuse:** renderPlainEmail and sendEmail; the PASSWORD_CHANGED and PASSWORD_RESET events already mark when to send.
- **References:** 
  - [Todoist](https://mobbin.com/flows/5cbb5c7b-fca2-4c7b-b0c0-4638abf7f02a): The reset page says up front that the change ends all active sessions, so the user knows what changed.
  - [Bonsai](https://mobbin.com/screens/818acac4-f25c-4898-871a-322b1431b19f): Confirms 'Your password was set successfully. You are now signed in.' right after the change.
- **Code:** `branch: src/lib/portal/accounts.ts:263-295`, `branch: src/lib/portal/reset.ts:88-99`
- **Verification:** confirmed. changeOwnPassword (accounts.ts:263-295) and the reset paths only log. A change notice is a standard, cheap backstop. Bonsai 818acac4 is the same URL BCONTRACT-015 cites for a task-count dashboard, so one of the two descriptions is probably wrong. The Todoist flow carries this finding.

### BCONTRACT-V05

**On a laptop the only way to send the login is an sms: link; Copy takes the password alone**

Low · Design change · effort S · `Portal access card: right after Create login or Reset password, on a computer` · Contractor jobs and media close the loop

- **Migration branch:** Found on the migration branch's new screens
- **Today:** The starting-password box offers 'Copy' (password only) and a full-width 'Text login details' anchor with an sms: href. At 1280 in Chrome on Windows an sms: link does nothing, and on a Mac it works only when Messages is linked to an iPhone. The full message, with the sign-in link and the email, can't be copied for WhatsApp, email or Messages on another device.
- **Why:** Connor's main surface is a 1280 laptop, and invite day means sending around 29 of these. The message the code composes is the useful part, and today it reaches only phones.
- **Change:** Add 'Copy message' beside 'Text login details'. It copies the whole loginTextBody and confirms with the toast 'Message copied'. On fine-pointer devices make Copy message the primary and Text the secondary. On touch keep Text primary.
- **Desktop, tablet, phone:** Desktop 1280: two buttons in one row, Copy message primary. Tablet 768 (touch): Text primary, Copy message secondary, one row. Phone 375: Text full-width primary, Copy message as a full-width secondary under it.
- **Reuse:** loginTextBody in src/lib/portal/login-text.ts; Button and buttonClass; useToast; the existing clipboard try/catch in the card.
- **Challenges:** Approved batch item 2 (Portal access card) shows Copy and 'Text login details'; this adds a third control and changes which one is primary on computers.
- **References:** 
  - [Motion](https://mobbin.com/screens/03d766fb-639c-40ed-8af3-6acf50545e62): 'Invites sent successfully!' shows the ready-made message to send teammates with a primary 'Copy message' button.
  - [Turo](https://mobbin.com/screens/a9dd3728-cd91-485a-8710-97e4cbb116d7): 'Co-host invited!' adds 'Send your teammate a text to ensure they got the invite' with a Share button and Done.
- **Code:** `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:74-82`, `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:241-249`, `branch: src/lib/portal/login-text.ts:36-40`
- **Verification:** verifier-found
