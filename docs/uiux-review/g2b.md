# Many hands on one record: Pieter's view, handoffs between partners, stale tabs, and the Oct 26 to Nov 1 Asana overlap

Part of the [UI/UX review](README.md). 36 findings: 0 critical, 6 high, 13 medium, 17 low.

## How it should work

Two partners and a few contractors touch every record, so this area's bar is quiet trust: what you see is current, nothing you do silently undoes the other partner, and anything handed to you finds you, with no email between partners (D20). Five habits from the library get HG there without presence avatars or a bell.

First, every write carries its intent and every refusal names a person. The checkbox sends the status it saw, a stale screen hears 'Pieter moved this to Done', and every handoff ends in a toast that says where the task went, with Undo, as Todoist does (https://mobbin.com/screens/5da9fa23-d62c-41ed-ba7c-64c51ae03eb1).

Second, shared state and personal triage stay apart. Front keeps Unassigned as its own shared tab (https://mobbin.com/screens/3b64830f-1d1f-4818-ae2a-28c3f6ffdaaf) and says plainly that a snooze won't touch teammates (https://mobbin.com/screens/ce8b928a-9af1-4e99-b128-bb2b6b34b073). HG folds the 34 unassigned tasks into one row above Mine and adds 'Not today', which hides a task for you while the Due date Pieter and Zack rely on stays put.

Third, handoffs land in one place and close their own loop. New for you collects assignments, @mentions from Stripe's note picker (https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93) and 'Pieter finished' notices from Basecamp's When done field (https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c). A deal's Next action gets an owner and a date, like Zillow's Next step column (https://mobbin.com/screens/415d4351-2979-4111-a418-09b3ca511959).

Fourth, records say who, when and from where, and audience lines tell the truth. The review banner stays after approval as 'Pieter approved this at 9:14', following Mercury's Submitted, Approved, Pending stepper (https://mobbin.com/screens/60364c06-7c88-4ac9-a5e2-cf1041ab4e84). 'Seen by Zack' sits under the latest update, as Front marks Seen. If Zack has no login yet, the composer says so instead of 'Reply to Zack', the way Basecamp names who a post will notify (https://mobbin.com/screens/792cbab7-3066-47c4-9c97-9a99a93c09ef).

Fifth, prevent the collisions two people cause. New task shows a matching open task, as Front shows '1 other conversation with Jane' (https://mobbin.com/screens/42adf3bd-2dee-4f3b-82a8-bdec59a9556b). Delete names other people's work and stays restorable for 30 days (https://mobbin.com/screens/792749f2-7ecc-445e-a2d0-4e9e9c36a0c9). Each tab is titled after its record, and a deploy never strands an open tab.

The Oct 26 to Nov 1 overlap reuses these parts and then goes away: 'in Asana' on synced events, a Source row in the rail, one conflict queue, and one-tap matches for Asana assignees, like Brex's auto-match (https://mobbin.com/screens/089cee58-b6b1-4bea-b028-d413aef5b694).

On phones the same pieces become sheets and two-line rows, such as Linear Mobile's Remind me sheet (https://mobbin.com/screens/99b6ce5c-3cb4-442b-8c03-50733d7a1355). Nothing adds a permanent control. Each piece appears only when it has something to say.

<details><summary>What the reviewer covered</summary>

Server on :3200 was up. Screenshots are in G2B/. All in Chromium.

Routes and states I exercised:
- /tasks?owner=u:cmtg25xxc0001jphs14t0cm9t (Pieter's open tasks) at 1280 and 375, with the aria tree. Pieter has 80 open tasks: 39 overdue going back to Apr 19 2025, 39 with no date, and 8 titled "Pieter to confirm ...".
- / (Home) at 1280, 375 and 320. Home is personal; Pieter's version was rebuilt from src/app/(app)/page.tsx plus his task data.
- /tasks/cmtg25z7s048mjphsikewzpy1 (a task Pieter owns) at 1280 and 375, with aria.
- /deals/cmtg25yd8002cjphs49ovlvob at 1280 and 375, with aria. Its timeline shows two status changes by Pieter on Sep 2.
- /properties/cmtg25y4p0006jphsv3frndk6, Units & access editor:
  - opened and edited at 1280 (light and dark), 375, and 320 dark;
  - CONFLICT_MESSAGE injected where the editor renders errors, with its distance from Save measured;
  - a blocked Save at 375, which drops to the global error screen.
- /settings at 1280 and 375, and /settings/move-in-form at 375, both with the conflict message injected and a field edited.

Stale-tab test on /tasks:
- I patched fetch, then fired visibilitychange, focus and online events: zero requests followed.
- I captured a checkbox click: the server action body is only the task id. The write was blocked.

Code traced:
- toggle, patch and version guards in src/lib/tasks/service.ts, src/lib/properties/service.ts, src/lib/app-config-write.ts and src/lib/action-result.ts;
- every property editor, both settings editors, and the deal and task inline fields;
- on branch task-management-migration-4c9ddf: core.ts setStatus, toggleDone, patchTask and notify, rules.ts, the asana map/import/delta (merge, conflicts, close), and the TaskReadState schema;
- spec D6b, D8, D12, D16, D19, D20, item 96, §5.5, §6 and §8.

Edit-surface inventory (how each one behaves when someone else changed the record first):
- Task checkbox and Mark complete: flips whatever status is on the server.
- Task title, assignee, due date and property: last write wins per field.
- Task notes: silent overwrite with no history.
- Task row cells: last write wins.
- Deal fields and the deal stage select: last write wins, logged on the timeline.
- Deal notes, comments and files: append only.
- Property Details, Loan, Insurance and Notes: the whole form overwrites silently, with no guard.
- Property Units, Rentals and Building CapEx: whole-row version guard, which a page refresh can bypass.
- Settings CapEx rules and Move-in form: pinned version, but the only way forward is to reload and retype.

Not done:
- I did not mint a session for Pieter. Nobody confirmed that review/secret.txt is the local dev secret, so his views come from the owner filter and the code.
- The Rentals and Building CapEx editors were not opened in the browser; the code shows the same state pattern as Units.
- Today, the new task page timeline, the Review banner and the 7am summary are not built on the branch, so they were judged from the spec and branch core code.
- No WebKit runs.

Mobbin: 18 searches, all citations from returned screens. Ramp is not on Mobbin, so I used Mercury, Stripe, Linear, Attio, Asana, Front and others.

</details>

## Findings

### G2B-003

**Send only the fields that changed from the Details, Loan, Insurance and Notes forms**

High · Fix · effort S · `Property page: Details, Loan, Insurance and Notes editors` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, property-record): Details, Loan, Insurance and Notes now send only the fields that changed, each with the value the form loaded. patchProperty refuses with CONFLICT_MESSAGE when a field someone else changed meanwhile would be overwritten, and the write is also guarded by the updatedAt it just read. Notes is refused if the stored text moved. Forms render from a snapshot taken when Edit opens, so a refresh mid-edit no longer wipes what's typed (key={version} is gone). Uses callAction. Pure helpers in src/lib/properties/edits.ts (changedFields, staleFields, fieldText) with tests. Left: G2B-003 / G2B-011: no per-section version was sent. The field-level expected check covers the conflict. Because the blob editors use the whole-row updatedAt, your own save in another card still makes an open Units, Rentals or CapEx save return CONFLICT. That's safe, but it's a false conflict until per-section versions exist. G2B-003 / G2B-007: the refused save shows the existing CONFLICT_MESSAGE. The G2B-007 conflict notice isn't built.
- **Today:** These forms post every input. The Loan form alone posts 8 fields (edit-loan.tsx:88-101). They go to patchProperty, which writes every key present with no version check (properties/service.ts:105-118). If Pieter changes the loan rate while Connor's Loan form is open, Connor's Save writes the old rate back. Notes is a single text blob, so the later Save erases the other partner's paragraph. There is no history to recover either.
- **Why:** This is silent reversion of money and date data: rate, payment, premium, coverage, and maturity and renewal dates. Those dates also regenerate the reminder tasks through syncPropertyReminders. Nobody notices until a lender or insurer does.
- **Change:** On submit, compare each input with the value it loaded and send only the keys that changed. Send the section's version (G2B-011). If a changed field's stored value differs from what the form loaded, return the conflict notice from G2B-007 instead of writing. For Notes, send the text it loaded as `expected` and refuse when the stored text differs.
- **Desktop, tablet, phone:** No visual change.
- **Reuse:** patchProperty and the CONFLICT path in src/lib/action-result.ts.
- **Code:** `src/app/(app)/properties/[id]/edit-loan.tsx:88-101 (whole form posted, key={p.version})`, `src/app/(app)/properties/[id]/edit-details.tsx:93,150-183 (Details and Notes)`, `src/app/(app)/properties/[id]/edit-insurance.tsx:88`, `src/lib/properties/service.ts:76-118 (TEXT, MONEY and DATE fields written whenever present, no guard)`
- **Verification:** confirmed. Confirmed. edit-loan.tsx:36 binds patchProperty with no version and posts every loan input, and service.ts:105-118 writes every key present and resyncs reminders when a key date is posted. There is no refresh on focus, so a tab left open since morning is enough. No special sequence is needed, which makes this more likely in practice than G2B-002. As a pure fix it needs no reference.

### G2B-004

**Show tasks the other partner handed you in a 'New for you' group at the top of Mine**

High · New capability · effort M · `Today, Mine column (and Home's task card until Today ships)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Today's Mine column on /tasks has Unassigned, Overdue, Today, Waiting and No date (collapsed). groupMine drops every task due after today, so a handoff due Oct 30 doesn't appear on Today at all until Oct 30, and an undated one lands in collapsed No date. Home's card keeps the old order (due ascending, nulls last, 12 rows). TaskReadState is read only for contractors, and staff-to-staff assignment still notifies no one.
- **Today:** A handoff from Connor never reaches Pieter today:
- Pieter has 80 open tasks: 39 overdue back to Apr 19 2025, and 39 with no date.
- Home lists 12 by due date with undated tasks last (page.tsx:19-24). His Home shows 7 tasks from Apr to Jun 2025 and 5 due Aug 28.
- A task Connor assigns him today, due Oct 30, is number 40 in that order. An undated one comes after number 41.
- On the branch, notifyAudience returns null for staff-to-staff assignment (rules.ts:53), so nothing is queued anywhere, and D20 rules out email.
- The planned Mine order is Unassigned, Overdue, Today, Waiting, then No date collapsed, so an undated handoff lands in a collapsed group.
- TaskReadState (lastSeenAt per user) exists in the branch schema, but nothing reads it.
- **Why:** D20 makes the app the only channel between partners, so a handoff that doesn't surface is a dropped ball. Asana, which Pieter uses today, puts 'Recently assigned' at the top of My tasks. Losing that on Oct 27 is a regression he will feel on day one.
- **Change:** Add 'New for you' above Unassigned in Mine. It holds tasks the other partner assigned to you (ASSIGNED event whose actor is not you) that you haven't opened since (TaskReadState.lastSeenAt).
- Each row gets the subline 'From Connor · 2h ago', plus the due date if any, and the new-dot in the top-right corner per the house rule.
- Opening or checking the task clears it, and the group hides when empty. Cap it at 5 rows with 'Show all'.
- At the Oct 27 production load, set lastSeenAt for every task to the load time, so two years of imported Asana assignments don't count as new. Assignments made in Asana after the load still count, labeled 'From Pieter in Asana'.
- Until Today ships, put the same group at the top of Home's task card.
- **Desktop, tablet, phone:** Desktop 1280: the first group in the left Mine column. Tablet 768 and phone 375: the first group under the Mine | Contractors switch, as two-line rows (title, then 'From Connor · 767 Prospect · Oct 30'). At 320, drop the property from the subline.
- **Reuse:** Planned Today rows, branch TaskReadState and TaskEvent ASSIGNED, EmptyState (hidden when empty).
- **Challenges:** Spec §6 Today: Mine starts with Unassigned (default item 96). This adds one group above it, and only when it has rows.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): Basecamp's own 'New for you' sits in the persistent bottom bar beside Pings: the exact name and a single quiet place, with no badge theater.
  - [Superhuman Mail](https://mobbin.com/screens/671cbc3b-478c-4b84-96da-f5e31f328352): Split inbox tabs carry a plain count ('Shared 1'): what teammates handed you is its own small group, not mixed into everything else.
  - [Linear](https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb): Inbox rows show an unread dot until opened and the empty pane says '7 unread notifications'; take the dot-until-opened rule for the New for you group.
  - [Asana](https://mobbin.com/screens/19c79bba-61d9-4d51-977a-5828e1efe4c9): A 'Recently assigned' section at the top of My tasks with blue dots on unseen rows
  - [ClickUp](https://mobbin.com/screens/f1374e47-4168-46b0-baab-445916244ac6): Inbox rows read 'assigned this task to you' with a Clear action
  - [Linear Mobile](https://mobbin.com/screens/97e4122c-fb36-414e-8f11-da31e1a8aebc): Two-line phone rows: title on top, who and what underneath, unread dot
  - [komoot](https://mobbin.com/screens/a92c3d61-3e4b-488b-b2d2-36d0218e78cb): A NEW group above EARLIER that empties itself once seen
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): A single yellow line, You have 1 new to-do, with OK, and a dot on the new row.
- **Code:** `src/app/(app)/page.tsx:19-24 (OPEN, due ascending, nulls last, take 12)`, `branch: src/lib/tasks/rules.ts:53-66 (staff to staff: no audience)`, `branch: prisma/schema.prisma:448-458 (TaskReadState, unused)`, `Spec docs/asana-migration-plan.md lines 96 and 378 (Mine order)`, `branch:src/app/(app)/tasks/today-view.tsx:56-101`, `branch:src/lib/tasks/list.ts:176-194 (future-dated tasks dropped from Mine)`, `branch:src/lib/tasks/queries.ts:49-57 (Home card order)`, `branch:src/lib/tasks/rules.ts:52-66 (staff to staff: no audience)`, `branch:src/lib/portal/queries.ts:131-135 (read state, contractors only)`, `src/app/(app)/page.tsx:57-90`
- **Also found as:** MOBILE-I12 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. The numbers check out against the aria snapshot: 80 open tasks for Pieter, 39 overdue (Apr 19 2025 to Oct 1 2026) and 39 with no date. Home takes 12 ordered by due date with nulls last, and staff-to-staff notifyAudience returns null. I confirmed Asana 19c79bba on Mobbin ('Recently assigned' with blue unseen dots). conflicts_with should also name spec §4, 'After cutover (week 2): in-app new-from-contractors list and unread badges', because this pulls a partner version of that forward. Keep the 'From Connor' subline here and don't repeat it in the task rail (see G2B-018).

### G2B-005

**Refresh a page when its tab comes back into view**

High · Fix · effort S · `Every signed-in page (app shell)` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, app-wide): New src/components/refresh-on-return.tsx, mounted once in src/app/(app)/layout.tsx, calls router.refresh() when a tab comes back after more than 60s hidden, comes back online, is restored from Safari's back-forward cache, or the Eastern date changes. There is no server polling. It waits while a field is focused or holds unsaved typing, and skips /properties/[id] until G2B-002 and G2B-012 land. The decision logic is pure, in src/lib/refresh-on-return.ts, with 7 tests in src/lib/refresh-on-return.test.ts. Left: G2B-005: the property page (/properties/[id]) does not refresh on its own yet. Its Details, Loan, Insurance and Notes forms are keyed by version, so a refresh would erase what's typed (G2B-012). Its Units, Rentals and Building CapEx editors save with the version prop, so a refresh would let a stale draft past the conflict check (G2B-002). Remove the HELD entry in src/lib/refresh-on-return.ts once those two land. G2B-012 is not in this batch.
- **Today:** The repo has no router.refresh outside Financials settings, and nothing listens for visibilitychange, focus or reconnects, and nothing polls. I patched fetch on /tasks, then fired visibilitychange, focus and online: zero requests in 2.5 seconds. A tab opened in the morning shows the morning all day. The 'Today' grouping and labels like '56d ago' go stale overnight, and iPhone Safari restores pages from its back-forward cache unchanged.
- **Why:** Out-of-date screens are the root cause of every overwrite in this unit. Linear and Stripe show current data when you return to a tab, and they do it without polling.
- **Change:** Add one small client hook in AppShell that calls router.refresh():
- when the tab becomes visible after more than 60 seconds hidden;
- on 'online';
- on 'pageshow' with persisted=true (pages restored by Safari);
- when the Eastern calendar date changes.

No polling and no websockets. Ship this only together with G2B-012, so typed drafts survive the refresh, and G2B-002, so open editors stay pinned to their version.
- **Desktop, tablet, phone:** Identical at every size. It matters most on phones, where Safari tabs and a home-screen app resume rather than reload.
- **Reuse:** router.refresh from next/navigation, already used in src/app/(app)/financials/settings/controls.tsx:18.
- **References:** 
  - [Front](https://mobbin.com/screens/2447f03a-a38e-42f5-a6b9-ffc1d4bdd6b8): 'Live data, last updated 10s ago' with a green dot: refresh quietly underneath and state freshness in one muted line instead of a reload button.
  - [Basecamp](https://mobbin.com/screens/7ae39ce1-3be5-478b-be01-abd019105b6c): 'Updated 2 minutes ago' under a shared chart: the age of shared state is a plain line, not chrome.
  - [v0](https://mobbin.com/screens/f7e01ada-5b56-4b4e-a406-921a146070b5): The explicit 'You're behind, pull changes?' prompt. For data this small, a silent refresh is calmer, so we skip the prompt
  - [Kiwi.com](https://mobbin.com/screens/4ee4e518-e3f7-4eac-83e1-71ce326b1729): Asking users to refresh after time away is the pattern to avoid by refreshing for them
- **Code:** `Repo search: router.refresh only in src/app/(app)/financials/*, no visibilitychange, focus or polling listeners`, `Stale-tab probe on /tasks: after visibilitychange, focus and online, the fetch log was []`, `src/app/(app)/page.tsx:117-120 (greeting and relative dates fixed at render time)`
- **Verification:** confirmed. I reproduced it on /tasks. After visibilitychange, focus, online and a persisted pageshow, the patched fetch log stayed []. router.refresh appears only under financials. Browser Back also restores Next's client router cache unchanged. The references are weak: v0 and Kiwi.com are cited as patterns to avoid. A better reference is Stripe's Events list, which shows a quiet 'Updated today 09:32:55 · Refresh' stamp (https://mobbin.com/screens/5423e185-8374-4b6c-a4a0-2d3ae9adc1d0). Ship this only together with G2B-002 and G2B-012, as the finding says.

### G2B-I03

**Say who will actually see a reply, and say so when the contractor has no login**

High · Fix · effort S · `Task page composer, notes label and Lockbox row on a contractor's job (migration branch)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Still open at 9f74ea1: on a job whose contractor has no login, the task page still reads 'Visible to Zack', 'Shown to Zack' and 'Reply to Zack', and nothing loads the assignee's portal status. The fix is small once the copy is picked, so this is a copy and design decision for Connor. Zack Reading has no portal login on the branch: his contractor page shows 'Portal access' with a 'Create login' button. His job 'Cabinet install Unit 2' still reads 'Visible to Zack' above the notes (notes.tsx:39), 'Lockbox · Shown to Zack' in the rail (fields.tsx:163-165), and 'Reply to Zack' as both the composer placeholder and the Shared side of the switch (composer.tsx:157-161, 259). notifyAudience returns null for any staff change when the contractor has no login (rules.ts:59), so nothing is queued for him, either now or after a login is created. Internal still reads 'Only {staffNames} see this' (composer.tsx:205).
- **Today:** On a job whose contractor has no portal login, the task page still says 'Visible to Zack', 'Shown to Zack' (Lockbox) and 'Reply to Zack'. Shared notes and comments become visible once he gets a login, but no email ever goes out for them, so 'Reply to Zack' implies a delivery that doesn't happen. The Internal state already reads 'Only Connor and Pieter see this'.
- **Why:** These labels are promises. From Oct 27 to the Oct 29 invites, and for anyone who never activates, nothing typed here reaches the contractor, so a partner believes Zack has the message when he doesn't. Basecamp prints who will be notified beside the post button, and Front writes who can see a comment under its composer.
- **Change:** Load the assignee's portal status. With an active login, keep 'Reply to Zack' and, while Shared is picked, add one muted line under the composer: 'Zack gets an email.' Without a login: the switch reads 'Shared', the notes label reads 'Zack sees notes once he has a login', the Lockbox row reads 'Hidden until Zack has a login', and the line under the composer reads 'Zack isn't on the portal yet. Text him for now.' with a 'Create login' link. With Internal picked, the line reads 'Only you and Pieter see this.'
- **Desktop, tablet, phone:** Desktop and tablet: one line under the composer, left of the switch. Phone: the line appears above the sticky composer only while it has focus, and the collapsed placeholder reads 'Add a comment' when the contractor can't receive it.
- **Reuse:** composer.tsx placeholder logic, NotesField visibleTo, the Lockbox rail row, and the portalAccount query already in contractors/[id]/page.tsx.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/792cbab7-3066-47c4-9c97-9a99a93c09ef): 'When I post this, a notification will be sent to:' with avatars under the post button.
  - [Front](https://mobbin.com/screens/42adf3bd-2dee-4f3b-82a8-bdec59a9556b): 'Comment will be visible to teammates in Product Insights' under the internal comment box.
  - [Zillow](https://mobbin.com/screens/e765dd7a-eb13-44c5-a973-c3781eb2dfbd): A lock and 'Private to you' under a message states the audience in a few words.
  - [Basecamp](https://mobbin.com/screens/5bbb02bd-8055-4150-853d-3f33cf9144e8): Edge label 'The client can see this. Change' on a shared page.
  - [Basecamp](https://mobbin.com/screens/47bc6978-7b08-4431-b3b7-521fc26d9438): 'Who's allowed to see this message?' with 'Our team only' and 'Allow the client to see this too'.
  - [Jobber](https://mobbin.com/screens/9e4118f0-8c84-4047-b6b5-006609a739b6): Note composer labeled 'Write a note to your team'.
- **Code:** `branch src/app/(app)/tasks/[id]/composer.tsx:157-161`, `branch src/app/(app)/tasks/[id]/notes.tsx:39`, `branch src/app/(app)/tasks/[id]/page.tsx:102-103`, `branch src/lib/notifications/content.ts:59`, `branch src/app/(app)/tasks/[id]/composer.tsx:157-161, 259`, `branch src/app/(app)/tasks/[id]/notes.tsx:39; fields.tsx:164`, `branch src/lib/tasks/rules.ts:58-59; src/lib/notifications/content.ts:59`, `src/app/(app)/tasks/[id]/task-detail.tsx:229`, `Local DB (read-only): description matches lockbox/code plus 4 digits on 2 open and 59 done tasks`, `branch-src/src/app/(app)/tasks/[id]/notes.tsx:12-41`, `branch-src/src/app/(app)/tasks/[id]/fields.tsx:159-167`
- **Also found as:** TASKS-I05 (Tasks list, new task and task detail)
- **Verification:** partly. Confirmed on 'Cabinet install Unit 2' (verify-G2B/zackjob--desktop-light.png). The page shows 'Visible to Zack', 'Lockbox · Shown to Zack' and 'Reply to Zack', while Zack's contractor page offers only Create login (zack--portal--desktop-light.png). Nothing in page.tsx:102-116 reads portal status. Two parts are overstated or already built. Shared notes and comments aren't lost: they show on his job once he has a login. Only the email is dropped (outbox closes 'no login' rows, content.ts:59; BCONTRACT-010 says notifyAudience drops them at write time). And the Internal line already exists: picking Internal shows 'Only Connor and Pieter see this' in a yellow composer (composer.tsx:205, zackjob-int--internal--desktop-light.png), so that part of the recommendation is done. The adjacent cross-unit findings are BTASKS-019 (switch labels), BTASKS-021 ('Zack gets an email' confirmations) and BCONTRACT-010 (no-login state on the contractor page). Merge the copy so one rule decides the task-page wording. The Basecamp and Front references are apt (Front's 'Comment will be visible to teammates in Product Insights' matches what I saw on Mobbin).

### G2B-I13

**Keep tabs left open through a deploy working**

High · Fix · effort S · `Every signed-in page, from a tab left open across a deploy` · Every save is safe, instant and undoable

- **Today:** No deploymentId or skew handling is configured, so after a deploy an open tab's next server action throws 'Server Action … was not found'. On the task page (useRun, composer, status) that replaces the page with (app)/error.tsx; on the Today and All lists it shows the generic save-error toast. Composer drafts survive in localStorage. Unsaved notes text does not.
- **Why:** Pieter keeps HG open all day. The first save after a deploy fails with a generic error and loses his draft. Next's docs recommend handling this as a retry path rather than a hard failure.
- **Change:** Turn on Vercel Skew Protection (it needs Pro, which D2 already buys) so old tabs keep calling their own deployment, and check that NEXT_DEPLOYMENT_ID is set so the next navigation does a full reload. In the shared action runner, catch the missing-action error, save any composer or notes draft to sessionStorage, and show a toast: 'HG was updated. Reload to keep going.' with a Reload button. Test by deploying with a task page open and a draft typed.
- **Desktop, tablet, phone:** The same toast at every size, above the sticky composer on phone.
- **Reuse:** use-run.ts and the status runner, the toast, and the composer's existing drafts.
- **Code:** `branch next.config.ts (no deploymentId)`, `branch src/app/(app)/error.tsx:29`, `node_modules/next/dist/docs/01-app/02-guides/server-actions.md:174-180 (Deployment considerations)`, `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/deploymentId.md`
- **Verification:** partly. The core is right. next.config.ts sets no deploymentId, and Next 16 throws UnrecognizedActionError for a stale action ID (server-action-reducer.js:104). On the task page that throw reaches (app)/error.tsx. I saw the same full-page replacement when a Send request failed (verify-G2B/zackjob-int--sent--desktop-light.png). Two details are wrong. Composer drafts aren't lost: they persist in localStorage (composer.tsx:25-43). List actions catch throws into a GENERIC_ERROR toast (task-list-context.tsx:55-58), so the full-page error hits task-page actions (useRun, composer, status) and the notes field's unsaved text. Whether Vercel Skew Protection is on is a dashboard setting the repo can't show; check it before building the client fallback. The error-boundary half overlaps TASKS-004, BCONTRACT-003 and the in-progress BPORTAL-001 'No connection' helper. Use one shared catch for network failures and missing actions.

### G2B-V01

**Keep the page and the draft when a save can't reach the server**

High · Fix · effort M · `Every editor and one-tap action on signed-in pages (seen on Property Units & access and the Tasks checkbox)` · Every save is safe, instant and undoable · quick win

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly fixed on the migration branch in 4cf099d (on top of dd00a9e): callAction now covers the portal access card, the task page (use-run, composer, files, header) and apply-flow. The settings editors, deals, properties, financials and the public move-in form still crash the page when offline.
- **Today:** Fixed on task lists: a dropped request on the /tasks checkbox shows the toast 'Something went wrong saving that. Try again; if it keeps happening, reload the page.' and puts the row back. Not fixed elsewhere: (1) on /tasks/[id], useRun awaits without a catch, so a dropped status change replaces the page with the 'Something went wrong' card at 1280 and 375. (2) On the portal /p/jobs/[id], tapping Mark done and then Skip with a dropped request replaces the whole job page with Next's default 'This page couldn't load', and the contractor's note is lost; the portal has no error boundary. (3) The property editors are unchanged from main. (4) error.tsx still says 'Your other changes are safe'.
- **Why:** The partners use their phones at properties, often on weak signal. One dropped request wipes a 70-field draft and the page, and the copy claims nothing was lost. Best-in-class tools keep the form on screen and offer Retry in place.
- **Change:** Move the try/catch from task-list-context into one shared helper. Use it in the task page's useRun, InlineAddressField, NotesField, the portal's JobActions (start, finish, post) and the property editors. Add an error.tsx to the (portal) segment, and drop 'Your other changes are safe' from (app)/error.tsx.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the line sits under the editor's Save and Cancel group, and the toast sits bottom left. Phone 375 and 320: the toast sits at the bottom with a 44px Retry, and the editor line stays on one line ('Not saved. Check your connection.' fits at 320).
- **Reuse:** ActionResult and userMessage in src/lib/action-result.ts; the planned D7 Undo toast for one-tap actions; Button from src/components/ui.tsx.
- **References:** 
  - [Linear](https://mobbin.com/screens/77a52868-c702-42eb-b7ba-de82816ae900): Unsent updates survive as Drafts cards with their record name, so text typed before a failed save is never lost.
  - [Front](https://mobbin.com/screens/3b804bc5-8b9b-43fd-969f-53da188f4044): 'Personal draft · Only visible to you' header on a kept draft: say where the unsent text lives and who can see it.
  - [Steep](https://mobbin.com/screens/c70f80de-5c92-4044-b3b5-b44b819647b9): A 'Connection failed' card with Retry sits inside the form, and every field keeps its value
  - [Alta](https://mobbin.com/screens/2b00c4b9-d2a6-4a6a-9d95-2aba49348be1): Phone: a 'Network offline. Reconnecting' banner while the thread and composer stay on screen
  - [Chronicle](https://mobbin.com/screens/3bd32686-26bb-4d14-9fab-ccdec3c68149): A whole-page 'An error occurred. Please reload the page'; the pattern the app shows today and should avoid
  - [Mercury](https://mobbin.com/screens/61170c15-0349-45ef-a6b0-b6ec95b7d1f6): A failure stays on the page as a dark toast, 'Security key registration failed', with a Try Again action. The page itself is untouched.
  - [Mercury](https://mobbin.com/screens/74bd2329-ed83-4631-a6ee-6b0688169f3a): Warning toast 'Account linking cancelled' uses the same small toast, with an amber icon as the only color.
  - [Revolut Business](https://mobbin.com/screens/b719158e-0a19-4b2e-8cc0-5217648ea20a): Only the failed panel shows "Connection issue · Try again"; nav, filters and the rest of the page stay usable, with a "Back online" strip when the connection returns.
  - [Fibery](https://mobbin.com/screens/762eacbd-2fb7-452d-a5c5-f631a55cc564): Outcome toast with an inline action button, bottom right, the page untouched.
  - [Chronicle](https://mobbin.com/screens/2d33a8a0-148c-4278-9a39-344fc0f1bd29): A small bottom-right message, 'Unable to upload file. Please try again.', while the page stays put.
  - [Qatalog](https://mobbin.com/screens/111429c5-463f-42f0-a768-54cfa1f39dc3): Save errors show as toasts over a form that keeps everything typed.
  - [Linear](https://mobbin.com/screens/7c88fd2a-866e-4db1-b3ac-38cb5cd2c043): A small corner toast confirms a change without disturbing the page.
  - [Stripe](https://mobbin.com/screens/2cf3b950-fa12-475b-a34d-202923af949f): Feedback comes as a toast while the payment record stays on screen.
- **Code:** `src/app/(app)/error.tsx:28-31`, `src/app/(app)/properties/[id]/edit-units.tsx:60-72`, `branch:src/app/(app)/tasks/task-list-context.tsx:51-61 (catch to toast)`, `branch:src/app/(app)/tasks/[id]/use-run.ts:18-22 (no catch)`, `branch:src/app/(portal)/p/jobs/[id]/_components/job-actions.tsx:118-130 (finish, no catch); no error.tsx under src/app/(portal)`, `branch:src/app/(app)/error.tsx:28-31`, `src/lib/server-action.ts:34-42 (withLog rethrows)`, `src/app/(app)/error.tsx:28-41`, `src/app/(app)/tasks/actions.ts:14-47`, `src/app/(app)/financials/settings/controls.tsx:18`, `src/lib/server-action.ts:35-41`, `src/app/(app)/error.tsx:21-45`, `src/app/(app)/tasks/[id]/task-detail.tsx:41-47`, `branch-src/src/app/(app)/tasks/[id]/use-run.ts:19-25`, `branch-src/src/app/(app)/tasks/task-list-context.tsx:51-63`, `branch-src/src/app/(app)/tasks/actions.ts:50-52 (createTask withLog)`, `probe task page: status Done with write blocked -> main text 'Something went wrong'`, `src/app/(app)/error.tsx:21-30`, `src/app/(app)/tasks/task-checkbox.tsx:13`, `branch src/app/(app)/tasks/task-list-context.tsx:51-63`, `branch src/app/(app)/tasks/[id]/use-run.ts:19-25`, `branch src/app/(app)/tasks/new/page.tsx:30`, `branch src/app/(app)/error.tsx:28-31`, `branch src/lib/action-result.ts:18`, `src/lib/server-action.ts:42-50`, `src/app/(app)/error.tsx`, `src/app/(app)/deals/deal-row.tsx:35-42`, `src/app/(app)/deals/actions.ts:28-36 (withLog + zod parse)`, `src/app/(app)/tasks/actions.ts:32-39`, `src/lib/server-action.ts:34-42`, `branch: src/app/(app)/tasks/actions.ts:50-75`, `branch: src/app/(app)/tasks/[id]/use-run.ts:15-25`, `branch: src/app/(app)/tasks/task-list-context.tsx:52-61`, `src/app/(app)/settings/capex-rules-editor.tsx:209-223`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:132-141`, `src/app/(app)/settings/storage/migrate-button.tsx:17-25`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:209-223`, `branch:src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:132-141`, `branch:src/app/(app)/settings/storage/migrate-button.tsx:17-25`, `branch:src/app/(app)/contractors/[id]/portal-access-card.tsx:53-60`, `branch:src/app/(app)/tasks/[id]/use-run.ts:19-25`, `src/app/(app)/financials/settings/actions.ts:38-106`, `src/app/(app)/financials/settings/tables.tsx:36`, `src/app/(app)/financials/settings/tables.tsx:147-153`, `src/lib/server-action.ts`
- **Also found as:** FEEL-003 (Lens: interaction quality, feedback, states, speed and accessibility), FEEL-IV04 (Lens: interaction quality, feedback, states, speed and accessibility), TASKS-004 (Tasks list, new task and task detail), DEALS-002 (Deals pipeline, new deal and deal detail), JOURNEYS-004 (Lens: the core jobs, end to end), ADMIN-001 (Contractors directory, contractor detail and Settings), FINANCIALS-018 (Financials, rent roll and financial settings), G2A-V11 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** verifier-found

### G2B-006

**Keep the previous notes on every notes edit so an overwrite can be undone**

Medium · Fix · effort S · `Task page notes (description), and the planned timeline` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. On /tasks/[id] the notes save on blur and send no expected text. The NOTES event stores no before or after text, and the activity reads only 'Connor edited the notes'. On a contractor's job the edit also queues the contractor email, so an overwrite from a stale tab both wipes the notes and tells Zack.
- **Today:** Notes save on blur with no check (task-detail.tsx:211-232; service.ts:105-128, last write wins). On the branch, patchTask records { kind: 'NOTES' } with no before or after text (core.ts:445). Under D16 that edit also queues a contractor email saying the notes were updated. An old copy edited in a stale tab wipes Pieter's notes for good and tells Zack.
- **Why:** Notes are the longest field people type. They carry imported Asana history and lockbox context, and contractors see them. Losing them with no way back is the kind of silent failure that makes a small team stop trusting the tool.
- **Change:** Store the previous and new text in the NOTES event data. The notes editor sends the text it loaded as `expected`; if the stored text differs, it doesn't save and shows the G2B-012 hint instead. In the activity, render 'Pieter edited the notes · View previous', where View previous opens the old text with a Restore button.
- **Desktop, tablet, phone:** Desktop and tablet: View previous opens a side sheet showing the old text, with Restore. Phone 375: a full-height sheet with a sticky Restore button. The activity line stays one line at every width.
- **Reuse:** Branch TaskEvent (data JSON) and the planned activity timeline; React Aria sheet (approved).
- **References:** 
  - [Linear](https://mobbin.com/screens/6c14e085-9ff5-4e61-9a21-b04f1b0a3433): Version history with highlighted changes, author, and 'Restore version'
  - [GitBook](https://mobbin.com/screens/3ca28996-7b99-4add-af2f-c3ee8a8ceac4): Each revision in the history carries a 'Revert to this revision' action
  - [Notion](https://mobbin.com/screens/b81ab79d-db24-4e78-b2f6-bcec25dd299e): Phone 'Restore to this version?' confirmation sheet
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:211-232 (save on blur)`, `src/lib/tasks/service.ts:105-128 (patchTask writes description unconditionally)`, `branch: src/lib/tasks/core.ts:441-446 (NOTES event carries no text)`, `Spec D16 (notes always visible to the assigned contractor)`, `branch:src/app/(app)/tasks/[id]/notes.tsx:29-32 (commit on blur, no expected)`, `branch:src/lib/tasks/core.ts:445-449 (NOTES event without text)`, `branch:src/lib/tasks/core.ts:520-521 (contractor notified)`, `branch:src/lib/tasks/activity.ts:152-153`
- **Verification:** partly. The code is as described. Notes save on blur with no check (task-detail.tsx:211-232, service.ts:105-128), and the branch NOTES event carries no text (core.ts:441-446). The severity is too high. Losing notes needs both partners to edit the same task's notes inside one stale window. On main nothing emails a contractor yet; that only happens under D16 on the branch. The restore view opens on demand and adds no permanent chrome. I did not spot-check the Linear, GitBook or Notion references; they are plausible.

### G2B-007

**Put the conflict notice beside Save and name who changed it**

Medium · Design change · effort S · `Units, Rentals and Building CapEx editors; Settings CapEx rules and Move-in form` · Every save is safe, instant and undoable

- **Today:** Every save error in these editors renders as 12px red text at the bottom of the card, not only CONFLICT. That is about 1,218px below Save at 1280. After a failed save the editor stays open and the button changes from 'Saving…' back to 'Save', a cue that is easy to miss. On Settings the line sits above the Appliances card, visible at 1280 but off screen from the Building systems rows.
- **Why:** After Save, nothing visible changes, so the person assumes it saved and walks away. Stripe-grade apps put the failure where the eye already is and name the actor.
- **Change:** Render the notice in the editor's action area, move focus to it, and announce it politely (aria-live). Copy: 'Pieter saved Units 4 min ago. Your edits are still here.' with 'See his changes' and 'Save mine anyway' (G2B-008). When the actor is unknown: 'This changed while you were editing.' Retire the reload instruction.
- **Desktop, tablet, phone:** Desktop 1280: one line directly under the Save and Cancel group, scrolled into view. Tablet 768: the same. Phone 375 and 320: a bottom sheet with both actions as 44px buttons. The one-line copy fits at 1280 and wraps inside the sheet on phone.
- **Reuse:** Button, the React Aria sheet (approved), CONFLICT_MESSAGE in src/lib/action-result.ts:15.
- **References:** 
  - [Chatbase](https://mobbin.com/screens/dc64e990-df30-4371-a3c6-a3e73e9370f2): Sticky bottom bar with Discard and Save at the point of action
  - [Front](https://mobbin.com/screens/0ecf2195-42d2-4db8-a7c4-46a176759c17): A single amber '1 conflict found for name' line right above the field it concerns
  - [Zocdoc](https://mobbin.com/screens/3ae545ce-a65f-457d-b54d-a2fc387d9952): Phone bottom sheet that shows the existing record and offers two clear choices
  - [Airtable](https://mobbin.com/screens/51dc184c-b41d-4273-adda-b2543a00b4fa): Inline 'may be out of date' line placed next to the action that fixes it
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:122 (error rendered at the bottom of the card)`, `src/lib/action-result.ts:15-16`
- **Verification:** partly. I measured the Units card myself: 70 inputs, 1,232px tall, with the error line at the bottom (edit-units.tsx:122). Conflicts need two people in the same section, so medium. Fix the placement for every save error, not only conflicts. A bottom sheet for a one-line notice on phone is heavier than needed. A sticky action bar holding Save, Cancel and the notice works at every width and also fixes Save sitting 1,200px above the last unit. Naming the actor needs an updatedBy column, which Property lacks; AppConfig has one. I confirmed the Front reference (0ecf2195, '1 conflict found for name').

### G2B-008

**Keep the draft on conflict and show the other side before saving**

Medium · New capability · effort M · `Units, Rentals and Building CapEx editors; Settings Move-in form` · Every save is safe, instant and undoable

- **Today:** On CONFLICT, the Units, Rentals and Building CapEx editors already stay open with the draft intact. Only the message's 'Reload the page' instruction throws the draft away. Settings CapEx is the exception: it reverts the edited cell (capex-rules-editor.tsx:209-222).
- **Why:** Asking someone to retype 70 fields because a partner changed one lockbox code is the opposite of best in class. Merge screens in Front and Salesforce show only the clashing fields and let the person choose.
- **Change:** The conflict response returns the section as it is now stored, plus who changed it and when. The editor keeps the draft, and:
- Fields only one side changed merge automatically.
- Fields both sides changed are listed under 'See his changes' as compact rows: 'Lockbox · his 7676 · yours 1234'.
- 'Save mine anyway' re-saves on top of the new version, writing only the fields you changed.
- **Desktop, tablet, phone:** Desktop 1280: a side sheet listing only the clashing fields. Tablet 768: the same sheet at full height. Phone 375: a full-screen sheet with two-line rows (field, then his and yours) and a sticky 'Save mine anyway'.
- **Reuse:** React Aria sheet (approved), a new section-merge helper next to updateAtVersion in src/lib/properties/service.ts, CONFLICT_MESSAGE.
- **References:** 
  - [Front](https://mobbin.com/screens/0ecf2195-42d2-4db8-a7c4-46a176759c17): Merge review shows one conflicting field with a swap-value picker; everything else merges
  - [Salesforce](https://mobbin.com/screens/5dc154a3-7f3d-4869-8a5d-1398d85fb0ca): Side-by-side values with a choice per field
  - [Plane](https://mobbin.com/screens/a18b90f3-07df-4255-b09e-75e5c78021a5): Compare-versions panel highlighting only what changed
- **Code:** `src/lib/action-result.ts:15`, `src/app/(app)/settings/capex-rules-editor.tsx:209-222`
- **Verification:** partly. A field-by-field three-way merge sheet is a lot of build for a two-partner company where real conflicts are rare. A smaller change covers most of it: replace the reload instruction with 'Load latest and keep my edits'. That action rebuilds the draft on the stored section and marks only the clashing fields inline. I confirmed Front 0ecf2195 and folk 75065e3c on Mobbin. I also saw a similar Salesforce 'Compare leads' screen.

### G2B-009

**Give Connor one list of Asana sync conflicts with a choice on each row**

Medium · New capability · effort M · `All tasks, Oct 26 to Nov 1 (new conflicts filter)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Conflicts are still only Internal CONFLICT events on each task. No screen, chip or filter under src/app lists them; /tasks/all's filters are status, assignee, property and title.
- **Today:** Conflicts print to the console during the delta run, which Connor runs himself, and become Internal CONFLICT events on each task. No screen lists them. Before applying, the dry run already shows them all.
- **Why:** The overlap week is when data is most likely to fork. A conflict that only shows up as a line inside one task's history won't get reviewed.
- **Change:** On the All tab, add a 'Sync conflicts (N)' chip. It shows only while unresolved CONFLICT events exist and goes away after Nov 1.
- Each row: task title, field, 'Asana: Oct 30', 'App kept: Nov 2', and two buttons, 'Use Asana's' and 'Keep'.
- Resolving writes a normal field-change event and marks the conflict resolved, with who and when.
- Under the list, a collapsed 'Closed from Asana today (N)' makes surprise closes visible.
- **Desktop, tablet, phone:** Desktop 1280: rows with the two values side by side and the buttons at the end. Tablet 768: the same in two lines. Phone 375: two-line rows; tapping opens a bottom sheet with the two values as large choices.
- **Reuse:** Planned Today/All rows, the segmented control for the chip, branch TaskEvent CONFLICT (data holds field, app, asana and base).
- **References:** 
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): A 'Pending Review' tab filters the queue and each row opens a drawer with two verbs (Approve, Decline): the shape for a temporary Sync conflicts list with 'Use Asana's' and 'Keep'.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Field changes render as 'Stage -> Meeting' rows under one actor line; use the same from and to rows to show the app value against the Asana value.
  - [folk](https://mobbin.com/screens/75065e3c-d49c-43fc-8705-fc5d622b140c): A dedicated Duplicates view: each pair side by side with Don't merge and Merge
  - [Front](https://mobbin.com/screens/0ecf2195-42d2-4db8-a7c4-46a176759c17): Shows exactly which field conflicts and lets you pick the value
  - [Descript](https://mobbin.com/screens/af7aeb8b-21c8-4783-acfa-f43e1df2ca81): History rows flagged 'Conflicts detected' with a Fix action per row
  - [Linear](https://mobbin.com/screens/13eef89b-e17e-4ee7-bde4-8d3afa7455d4): Import & export shows each import as one row: source, date, '15 issues and 0 users imported', Completed.
  - [Mercury](https://mobbin.com/screens/88fb0ef5-ddd1-4175-bc5a-40ed13af75d1): Reviewing is one action with a 'Marked 1 transaction as reviewed' toast.
- **Code:** `branch: src/lib/asana/map.ts:437-470 (mergeFields, describeConflict)`, `branch: src/lib/asana/import.ts:150-158 (CONFLICT events, INTERNAL)`, `branch: scripts/asana/30-delta.ts:1-25`, `Spec docs/asana-migration-plan.md:360 and :478 (reviewed daily, 'Review conflicts' Oct 30, no screen)`, `branch:src/lib/asana/import.ts:151-158`, `branch:src/lib/asana/map.ts:461-481`, `grep 'conflict' under branch src/app: no matches`, `branch: docs/asana-migration-plan.md:354-360,478`, `task-management-migration-4c9ddf/src/lib/asana/import.ts:151-155`, `task-management-migration-4c9ddf/scripts/asana/30-delta.ts:21,322`, `task-management-migration-4c9ddf/src/lib/tasks/activity.ts:174-175`, `grep: no CONFLICT reference anywhere under task-management-migration-4c9ddf/src/app`, `4652abb:src/lib/asana/import.ts:151-157`, `4652abb:src/lib/tasks/activity.ts:174-175`, `4652abb:scripts/asana/30-delta.ts:21`, `psql hg_capital_review: TaskEvent kind=CONFLICT count 0`
- **Also found as:** G1C-I02 (Repeats, playbooks and imported Asana history (D27, D28, D17, D24))
- **Verification:** partly. The code matches: CONFLICT events are Internal and the delta prints them. But Connor runs 30-delta.ts himself, and the dry run prints every conflict before --apply. Reading that output is the designed review path for a six-day window, not a gap. A chip with per-row resolve buttons is M effort for six days. A lighter option: one 'Sync conflicts' filter on All that lists the affected tasks, with each conflict resolved on its task page. The collapsed 'Closed from Asana today' list is the most valuable part. This duplicates G2B-020's Use Asana's / Keep choice, so build that choice in one place only.

### G2B-010

**Define the 7am summary as the handoff channel, and send its first version from Oct 27**

Medium · New capability · effort M · `7am summary email (D20)` · Home and Today become one work queue

- **Today:** D20 defers the 7am summary to week 2. The email outbox and cron are scheduled for Oct 29, so no summary can send on Oct 27 without pulling that work forward.
- **Why:** For two partners who don't email each other, a short morning list is what keeps handoffs from dropping. Trello and Basecamp both send a daily digest for exactly this.
- **Change:** One email per person at 7am Eastern, skipped when every section is empty. Subject: 'Thursday: 2 from Pieter, 3 due today'. Sections, each shown only when it has rows:
1. From Pieter: new handoffs since yesterday, as title · property · due.
2. Needs review: contractor jobs in Review, for example 'Fix front steps · Zack · 4 photos'.
3. Due today.
4. One line, '41 overdue', linking to Today.
5. One line, 'Done by Pieter yesterday (4)'.
During the overlap, also one line, 'Sync conflicts (2)', linking to G2B-009. One button: 'Open Today'. Plain layout on the app's tokens, no logo bar, no settings at launch. Ship sections 1 to 3 on Oct 27, since the data exists; add the rest in week 2.
- **Desktop, tablet, phone:** Max 600px, single column, two-line rows. In iOS Mail and Gmail on a phone, rows wrap, the button goes full width, and dark mode is supported (G1A-032). Preview text repeats the subject counts.
- **Reuse:** Branch email render.ts and the outbox and cron (D30 budget: two emails a day), TaskEvent and TaskReadState for 'new since yesterday'.
- **Challenges:** D20 and spec §4 'After cutover, week 2: 7am summary email'. D20 removes every other channel between partners from Oct 27, so the handoff part of the summary should not wait two weeks.
- **References:** 
  - [Mercury](https://mobbin.com/screens/bd9f86e7-9ef2-4745-91b8-10d3fdad2ced): Bill Pay opens with three count tiles (Total outstanding, Overdue, Due in next 7 days) above one list; the 7am summary's top strip should read the same way.
  - [Trello](https://mobbin.com/screens/a77b9b92-fccc-4c65-a324-4a0f95238311): Snapshot email with grouped cards (title, due date, assignee initials) and a link back
  - [Midday](https://mobbin.com/screens/78f098ad-a73b-4383-8130-bb2a88aebc35): Plain transactional email: one headline figure, one button
  - [Basecamp](https://mobbin.com/screens/b71d21b5-1078-44a4-adb3-9583531a6059): 'Emailing a daily summary' as the companion to an in-app activity feed
  - [Slite](https://mobbin.com/screens/54416698-9cd3-4bc8-8e5c-11bf51e0472a): Separates 'Where you're needed' from things that are only nice to see
- **Code:** `Spec docs/asana-migration-plan.md:81 (D20) and :145 (7am summary after cutover)`, `Spec docs/asana-migration-plan.md:475 (partners start in the app Oct 27)`, `branch: src/lib/tasks/rules.ts:53-66 (no staff-to-staff audience)`
- **Verification:** partly. conflicts_with correctly names D20. But the Oct 27 date doesn't work: the outbox, cron and email work is scheduled for Thu Oct 29 (spec line 477), and Resend setup only starts Oct 23. Saying there is 'no push channel at all' between partners overstates it; they have phones. If G2B-004 ships, the in-app 'New for you' group covers the overlap week. At most, ship the summary alongside the outbox on Oct 29 instead of keeping it in week 2.

### G2B-011

**Version each property section, not the whole row**

Medium · Fix · effort S · `Property page: every section editor` · Every save is safe, instant and undoable

- **Today:** The guard compares Property.updatedAt (properties/service.ts:32-45, 229-232, 297-301), and any patchProperty write bumps it. So Pieter saving Insurance makes Connor's open Units editor fail with 'Someone else saved changes to this' although no unit changed. Settings has the same class of false conflict (ADMIN-V03).
- **Why:** False conflicts teach people to ignore the warning, which defeats it the day it is real.
- **Change:** Compare the section's own content. The editor sends a short hash of the units JSON, the listings set (ids and updatedAt) or the buildingCapex JSON it loaded. The update checks that hash against the stored section, in the same transaction. Only real overlap in that section conflicts. No schema change.
- **Desktop, tablet, phone:** No visual change.
- **Reuse:** updateAtVersion and versionDate in src/lib/properties/service.ts.
- **Code:** `src/lib/properties/service.ts:32-45 (row-level updatedAt guard)`, `src/lib/properties/service.ts:105-118 (patchProperty bumps updatedAt)`, `src/lib/properties/service.ts:229-232, 297-301`
- **Verification:** confirmed. Confirmed. The guard compares Property.updatedAt (service.ts:32-45), and patchProperty bumps it. So when Pieter saves Insurance, Connor's open Units save fails even though no unit changed. The fix pairs with G2B-002, and the hash approach needs no schema change.

### G2B-012

**Never replace text someone is typing when fresh data arrives**

Medium · Fix · effort S · `Task title and notes, deal inline fields, property Details, Loan, Insurance and Notes forms` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. On /tasks/[id], the notes field and the title field (InlineAddressField) copy the server value over the local draft whenever the prop changes. The deal inline fields and the property edit forms (loan, insurance, details, units) are byte-identical to main, so they're still keyed by version. Only the comment composer keeps its draft, in localStorage.
- **Today:** TitleField and DescriptionField copy the server value over the local draft whenever the prop changes (task-detail.tsx:72, 214). Deal InlineField does the same (deal-detail.tsx:124, 190). The property forms are keyed by version (edit-loan.tsx:90, edit-insurance.tsx:88, edit-details.tsx:93 and 183), so any refresh remounts them with server values. Today this fires when your own save in another card refreshes the page: open Loan edit, then save Notes, and the typed Loan values vanish. With G2B-005 it would fire every time you return to the tab.
- **Why:** Losing typed text silently is the fastest way to make a tool feel flaky. This fix is the precondition for safe refresh on focus.
- **Change:** Take the server value only when the field isn't focused and the draft still equals the last value seen. Otherwise keep the draft and show a one-line hint under the field, 'Pieter changed this', with a 'Use his' link. Remove key={version} from open forms; reset them only when Edit opens.
- **Desktop, tablet, phone:** The hint is one line at every width ('Pieter changed this · Use his'); at 320 it drops the name to 'Changed by Pieter'. 'Use his' is a 44px tap target on touch.
- **Reuse:** The existing field components; muted text tokens.
- **References:** 
  - [Front](https://mobbin.com/screens/0ecf2195-42d2-4db8-a7c4-46a176759c17): A quiet one-line conflict note attached to the field
  - [Airtable](https://mobbin.com/screens/51dc184c-b41d-4273-adda-b2543a00b4fa): An inline out-of-date line with the fixing action next to it
- **Code:** `src/app/(app)/tasks/[id]/task-detail.tsx:69-75 and 211-219`, `src/app/(app)/deals/[id]/deal-detail.tsx:121-127 and 187-193`, `src/app/(app)/properties/[id]/edit-loan.tsx:90; edit-insurance.tsx:88; edit-details.tsx:93,183`, `branch:src/app/(app)/tasks/[id]/notes.tsx:17-20`, `branch:src/components/inline-address-field.tsx:36-39`, `diff main vs branch: deals/[id]/deal-detail.tsx, properties/[id]/edit-loan.tsx, edit-insurance.tsx, edit-details.tsx identical`, `branch:src/app/(app)/tasks/[id]/composer.tsx:20-42 (composer draft kept)`
- **Verification:** confirmed. I verified the seen-value pattern (task-detail.tsx:69-75 and 211-219, deal-detail.tsx:121-127 and 187-193) and key={version} on the Loan, Insurance, Details and Notes forms. On task and deal fields, blur commits before another field can save, so today the live risk is mostly the property forms. It becomes general once G2B-005 adds refresh on focus. The 'Use his' hint needs actor data that properties don't store yet.

### G2B-013

**Check the current assignee before reassigning, so a stale tab can't take a job off a contractor**

Medium · Fix · effort S · `Task page Assignee and task row owner (Remove owner ×)` · Every save is safe, instant and undoable

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly fixed in 9f74ea1: the task page now sends the assignee it showed. patchTask locks the row, refuses a reassignment from a stale screen with 'Pieter assigned this to Zack Reading.' and refreshes the page. The unchecked list path is gone. Still open, as design calls for Connor: there's no 'Reassign anyway' action on the refusal, and a reassign still has no Undo toast the way Due does.
- **Today:** Task rows on the branch no longer edit the owner (the 'Remove owner' × is gone; rows show only an avatar). The /tasks/[id] rail AssigneePicker sends only the new assignee. patchTask overwrites whatever is stored, and syncAssigneeAccess revokes the previous contractor's access. Unlike Due, a reassign has no Undo toast.
- **Why:** Contractors are about to rely on My jobs. A job vanishing from their list because of an old browser tab is a support call nobody can explain.
- **Change:** Send the assignee the rail showed. If it differs from the stored one, don't save; show 'Pieter assigned this to Zack 3 min ago' with 'Reassign anyway'. Also give a reassign the same Undo toast as Due, since it revokes a contractor's access.
- **Desktop, tablet, phone:** Desktop: the line appears inside the assignee popover. Tablet and phone: inside the assignee sheet, with 'Reassign anyway' as a 44px button.
- **Reuse:** The branch assignee picker (React Aria menu) and patchTask with an expected assignee.
- **References:** 
  - [Front](https://mobbin.com/screens/3258fa83-bf07-454c-aeb7-a0db0261fdd7): The Assign menu shows the current assignee checked at the top, then Unassigned, then teammates: the picker itself states who has it now, which is what a stale-tab reassign must re-check.
  - [Front](https://mobbin.com/screens/ce8b928a-9af1-4e99-b128-bb2b6b34b073): Before acting, Front names the side effect on others ('will also be snoozed in the shared inbox'); a refused reassign should name the person it would have displaced.
  - [Zocdoc](https://mobbin.com/screens/3ae545ce-a65f-457d-b54d-a2fc387d9952): Shows the existing booking and asks before replacing it
  - [Jira](https://mobbin.com/screens/9cb87142-8ae1-4266-8401-0c109f043177): Assignee shown with the current person and an explicit 'Assign to me'
- **Code:** `src/lib/tasks/service.ts:115-119`, `branch: src/lib/tasks/core.ts:485-507`, `Spec D12 (reassigning removes access)`, `branch:src/app/(app)/tasks/[id]/fields.tsx:62-68,81-87 (save without done or undo)`, `branch:src/lib/tasks/core.ts:487-503 (overwrite)`, `branch:src/lib/tasks/core.ts:115-126 (access revoked)`
- **Verification:** confirmed. Main overwrites the assignee with no check (service.ts:115-119). On the branch, reassignment calls syncAssigneeAccess and only notifies a new contractor, so the old one silently loses the job. Related: the task page picker has an option labeled 'Pieter Louw (external)' that actually unassigns the task (G2B-V02).

### G2B-I04

**Confirm a handoff with a toast that says where it went, with Undo**

Medium · Design change · effort S · `Task page Assignee chip (migration branch)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. In the task rail, the Assignee picker still calls save({ assignee }) with no done message and no undo (fields.tsx:86). Due right below it gets 'Due date set to …' with Undo (fields.tsx:94-99). Reassigning still revokes the old contractor's access and grants the new one's (core.ts:115-126) and queues an ASSIGNED email (core.ts:512), all silently.
- **Today:** Changing the due date shows 'Due date set to Fri' with Undo (fields.tsx:94-99). Changing the assignee calls save({ assignee }) with no message and no Undo (fields.tsx:86), although reassigning a contractor's job removes their access (D12) and queues an email to them (D19).
- **Why:** A handoff is the most consequential edit in this area, and right now it happens without a word. Todoist and Linear confirm each change with a toast that names the result and offers Undo. Because of D19's 10-minute bundling window, Undo can still pull the email back.
- **Change:** After an assignee change, show a toast that names where the task went and what follows: 'Now in Pieter's New for you', 'Assigned to Zack. He gets an email.' or 'Moved from Zack to Jose. Zack loses access.', with Undo for 8 seconds. Undo restores the previous assignee and drops the queued email if it hasn't been sent.
- **Desktop, tablet, phone:** The same toast at every size. On phone it sits above the sticky composer through the existing toast inset.
- **Reuse:** useRun's done and undo options (use-run.ts) and the toast component, the same path the due date already uses.
- **References:** 
  - [Todoist](https://mobbin.com/screens/5da9fa23-d62c-41ed-ba7c-64c51ae03eb1): 'Rescheduled to 20 Feb 17:00 · Undo': name the exact result, then offer Undo.
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): A small bottom-right toast with Undo for a change that affects what someone else sees.
- **Code:** `branch src/app/(app)/tasks/[id]/fields.tsx:86`, `branch src/app/(app)/tasks/[id]/fields.tsx:94-99`, `branch src/app/(app)/tasks/[id]/fields.tsx:81-99`, `branch src/lib/tasks/core.ts:115-126, 512`
- **Verification:** confirmed. fields.tsx:86 saves the assignee with no done message or Undo, while Due gets 'Due date set to …' with Undo (fields.tsx:94-99). Two gaps in the recommendation. First, the copy 'Now in Pieter's New for you' depends on G2B-004, which isn't built, so until it ships the toast should name the person ('Assigned to Pieter'). Second, Undo should run through G2B-013's expected-assignee check. BTASKS-019 suggests 'Zack can now see 3 comments' in the same assign toast, and BTASKS-021 suggests 'Zack gets an email' confirmations. Pick one toast copy that covers access, email and visibility. Todoist's 'Rescheduled … Undo' reference fits.

### G2B-I09

**Show 'Seen by Zack' under the latest update**

Medium · New capability · effort S · `Task page activity on contractor jobs and partner handoffs (migration branch)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. markJobSeen still upserts TaskReadState.lastSeenAt for the contractor (portal/jobs.ts:59-66). The finding said the table is used only in jobs.ts, but the portal also reads it, for its own 'N new' counts (portal/queries.ts:131-135). No staff page reads it, and nothing writes the userId row, so a partner's view is never recorded. The task page activity shows no seen line.
- **Today:** The portal records when a contractor opens a job (TaskReadState.lastSeenAt, written by markJobSeen in portal/jobs.ts:59-66), but nothing on the staff side reads it. TaskReadState appears only in portal/jobs.ts. To learn whether Zack saw 'moved to Fri', Connor has to text him.
- **Why:** A quiet seen marker answers 'did he get it?' without presence avatars, and the data already exists. Front marks a teammate's message 'Seen', and Superhuman lists recent opens in a side rail.
- **Change:** Under the newest staff comment or change on a job, show a muted line 'Seen by Zack · 7:40 AM' once his lastSeenAt passes it. Show 'Not opened yet' only after 24 hours. Partner handoffs work the same way, using the userId row ('Seen by Pieter'). Nothing is added to list rows.
- **Desktop, tablet, phone:** The same line at every size. Phone shows the day instead of the time after 24 hours ('Seen by Zack · Tue').
- **Reuse:** TaskReadState and the ActivityTimeline item.
- **References:** 
  - [Front](https://mobbin.com/screens/4f8adeba-e3e0-436a-9891-0e0abaff91ed): A small 'Seen' label on the teammate's sent message in the thread.
  - [Superhuman Mail](https://mobbin.com/screens/671cbc3b-478c-4b84-96da-f5e31f328352): A 'Recent Opens' rail with who opened and how long ago.
- **Code:** `branch src/lib/portal/jobs.ts:59-66`, `branch grep: taskReadState referenced only in src/lib/portal/jobs.ts`, `branch src/lib/portal/queries.ts:126-137`, `branch grep: no userId write to taskReadState`
- **Verification:** confirmed. markJobSeen upserts TaskReadState.lastSeenAt for contractors (portal/jobs.ts:59-71), and taskReadState is referenced nowhere else in src. The data exists and staff never see it, and one muted line adds little. The partner half ('Seen by Pieter') needs staff read rows that nothing writes yet. G2B-022 proposes writing them, so build the two together. The Front reference 4f8adeba is also cited in I07 for a snooze menu, which suggests one screen is carrying two different claims. I didn't verify it.

### G2B-I11

**Mark what came from Asana: a Source row in the rail and 'in Asana' on synced events**

Medium · Design change · effort S · `Task page rail and activity during the Oct 26 to Nov 1 overlap (migration branch)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. who() still builds the actor from actorLabel alone (activity.ts:79-81), and eventLine (activity.ts:125) never reads TaskEvent.source, although the field exists (the portal filters on e.source = 'ASANA' in portal/queries.ts:47). The imported 'Mud Drywall' rail shows 'Created Aug 25, 2025' with no creator or source, and the line 'Assigned in Asana to José Alvarez' sits above the notes. App-made tasks read 'Connor · Sep 15'.
- **Today:** Activity lines are built from actorLabel alone (activity.ts:79-81) and eventLine never reads TaskEvent.source, so a change the delta pulls from Asana reads exactly like an app edit ('Pieter moved the due date to Fri'), dated by Asana's clock. Imported tasks show 'Created Nov 21, 2024' with no creator or source, and the Asana assignee sits as a stray line above the notes.
- **Why:** During the overlap, Connor needs to know whether Pieter changed something in the app or in Asana, which tells him Pieter is still working in Asana. A comment synced a day late also needs to read as new. Stripe's payment rail has a 'Source' row, and Attio attributes every grouped change.
- **Change:** On imported tasks, the rail shows 'Source · Asana, imported Oct 27' in place of the bare Created date; app tasks keep 'Created · Connor · Sep 15'. Events with source asana end in 'in Asana' ('Pieter moved the due date to Fri in Asana'), and when synced more than an hour after they happened they add '· synced 6:02 AM'. After Nov 1 no new ones appear and the old labels stay as history.
- **Desktop, tablet, phone:** The same text at every size. On tablet and phone the source row lives in the details sheet rather than the chip row.
- **Reuse:** activity.ts eventLine and the rail Row in fields.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/71e2e744-2c2e-45ef-8d77-5a8d9e5ed9a2): The Details rail lists 'Source: Manually entered from Dashboard' and 'Last updated' as plain rows.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): 'Alex Smith changed Stage and 7 other attributes in Sales' names the actor and the place the change came through.
- **Code:** `branch src/lib/tasks/activity.ts:79-81 and 125-178`, `asana-migration-plan.md 30-delta.ts section`, `branch src/lib/tasks/activity.ts:79-81, 125-178`
- **Verification:** confirmed. Neither activity.ts nor activity.tsx reads TaskEvent.source. who() uses actorLabel only (activity.ts:79-81), and eventLine renders an Asana-sourced change exactly like an app edit. Imported tasks show 'Created Aug 25, 2025' with no creator or source (verify-G2B/mud--desktop-light.png). It matters during Oct 27 to Nov 1: the partners work in the app while the delta still pulls Asana changes, and comments synced a day late land in the past. Pair it with G2B-025 (sync freshness line) and G2B-020 (conflict card) so the overlap shows one consistent vocabulary. Stripe's Details rail with a 'Source' row is real (I saw it on Stripe ebf7e9fe).

### G2B-I12

**Before deleting, name what other people added, and keep the task restorable for 30 days**

Medium · Design change · effort M · `Task page '…' menu, Delete dialog (migration branch)` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. Opened from '…' on the contractor job 'Cabinet install' (which carries the contractor's comment 'Doors arrive Thursday.'), the dialog reads 'Delete this task?' and '“Cabinet install” goes for good, with its notes, checklist, activity and files.', with Keep it and Delete buttons (header.tsx:93-94). deleteTask still hard-deletes the row (service.ts:98) and its blobs (service.ts:109). Only a deal-linked task leaves a deal note.
- **Today:** The dialog says 'goes for good, with its notes, checklist, activity and files.' deleteTask hard-deletes the row and its blobs (service.ts:99 and 106-110). Only deal-linked tasks leave a trace, as a deal note. A partner can erase a contractor's photos and the other partner's notes with no record on the property and no way back.
- **Why:** With two partners, delete is the one action the other can neither see nor reverse. Linear's delete dialog counts what goes and promises a 30-day restore, and its quick deletes get an Undo toast.
- **Change:** The dialog names other people's work: 'Includes 4 photos from Zack and 2 notes from Pieter.' When anyone else contributed, the primary button becomes 'Cancel task instead' and Delete moves to secondary. Deleted tasks go to a 30-day trash (deletedAt) with a 'Task deleted · Undo' toast, the property's activity keeps 'Connor deleted Cabinet install' with Restore, and blobs are removed after 30 days.
- **Desktop, tablet, phone:** Desktop and tablet: the existing dialog. Phone: a bottom sheet with pinned buttons.
- **Reuse:** ConfirmDialog, toast Undo, and the existing Cancel task action in the same menu.
- **References:** 
  - [Linear](https://mobbin.com/screens/792749f2-7ecc-445e-a2d0-4e9e9c36a0c9): The delete dialog lists counts ('30 issues, 3 projects') and says it can be restored for 30 days.
  - [Linear](https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc): 'Notification deleted · Undo' toast for quick reversals.
- **Code:** `branch src/app/(app)/tasks/[id]/header.tsx:96`, `branch src/lib/tasks/service.ts:99-110`, `branch src/app/(app)/tasks/[id]/header.tsx:93-94`, `branch src/lib/tasks/service.ts:85-113`
- **Verification:** confirmed. The dialog reads exactly: '“Cabinet install Unit 2” goes for good, with its notes, checklist, activity and files.' (Keep it / Delete). deleteTask hard-deletes the row and its blobs (service.ts:85-112), and only deal-linked tasks leave a note. Naming other people's work and making Cancel task the primary action when others contributed is the cheap, high-value part (S). The 30-day trash with a Restore line on the property is M or more, and can follow. TaskAttachment already has deletedAt, so the trash needs little new schema.

### G2B-I16

**Flag jobs where the contractor wrote last and no partner has answered**

Medium · Design change · effort S · `Today, Contractors column (migration branch)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. In the Contractors column, Device Check Contractor's 'Cabinet install' row reads '118 Congress St. · Rear', 'In progress', 'Monday', although his latest comment ('Doors arrive Thursday.') has no staff reply. It sits last in the column because groups sort by soonest Target (list.ts:218-245), and nothing on the row shows that the contractor is waiting on a reply.
- **Today:** Contractor rows show the title, a status chip, the address and a date ('To do · 23 Sherwood St · Oct 16'). D20 emails both partners about every contractor comment, and nothing on Today shows whether either one has replied.
- **Why:** Both partners may answer Zack, with different instructions, or neither will. Front's list shows who spoke last ('Jane > Me'), so a shared inbox knows what is waiting on a reply, and Ramp shows who acts next on every item.
- **Change:** When a job's latest comment is from the contractor and no staff comment or status change follows it, the row's sublabel shows 'Zack: Doors arrive Thu · 2h' in place of the address, and the row moves to the top of that contractor's group. It clears as soon as either partner replies or changes the status. No new color or badge.
- **Desktop, tablet, phone:** Desktop: replaces the address in the row. Tablet and phone: the second line of the two-line row, where the quote truncates first.
- **Reuse:** TaskRow's sublabel and TaskEvent COMMENT rows with actorContactId.
- **References:** 
  - [Front](https://mobbin.com/screens/42adf3bd-2dee-4f3b-82a8-bdec59a9556b): List rows read 'Jane > Me' and 'Ernest > Me', showing who spoke last at a glance.
  - [Mercury](https://mobbin.com/screens/acd32944-7f4b-445f-a510-5a7750b11a19): A queue sorted around what is waiting on the team, with the state in a fixed column.
- **Code:** `asana-migration-plan.md D8, D20`, `branch src/app/(app)/tasks/today-view.tsx:113-124; src/lib/tasks/list.ts:218-245`
- **Verification:** confirmed. Contractor rows show only title, status chip, address and date (verify-G2B/today--desktop-light.png), and ListTask carries no latest-comment data (list.ts:22-39). This fits D8 and D20 and adds no new color. One adjustment: keep the address visible. A contractor's jobs span several properties, and the address is how partners tell them apart, so put the quote on the second line or in place of the date rather than replacing the address. I confirmed the Front list pattern ('Jane > Me' rows) on Mobbin (https://mobbin.com/screens/f7757b0f-9d98-4126-a351-f7015fbe33a8).

### G2B-014

**Refuse a stage change made from an out-of-date screen**

Low · Fix · effort S · `Deal page stage select and the Deals list stage cell` · Every save is safe, instant and undoable

- **Today:** Deal 'Status' values are '1 - High' through '6 - Holding', 'CLOSED!' and 'Pass'. There is no 'Under contract' stage. patchDeal does write whatever status the select sends, and the timeline records the old value with the actor (Pieter moved 2 - Medium to 1 - High and back on Sep 2).
- **Why:** Stage is the one deal field both partners change. A deal silently passed while under contract is costly, and nobody reads timelines daily.
- **Change:** Stage changes send the stage the select showed. If the stored stage differs, don't save; show 'Pieter moved this to Under contract 10 min ago' with 'Change anyway' beside the stage pill. Free-text deal fields stay last write wins, since the timeline already records them.
- **Desktop, tablet, phone:** Desktop and tablet: the line appears under the stage pill. Phone 375: the same line wraps under the pill, and 'Change anyway' is a 44px text button.
- **Reuse:** The stage pill menu (DEALS-020), patchDeal with an expected stage.
- **References:** 
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Each change is attributed and shown as from and to; the refusal for a stale stage change should show the stage that replaced yours and who set it in the same form.
  - [Front](https://mobbin.com/screens/0ecf2195-42d2-4db8-a7c4-46a176759c17): Conflict stated inline before anything is overwritten
  - [incident.io](https://mobbin.com/screens/b2dfe857-6aaa-4692-bdbc-29006e6275f0): Status change shown as old struck through, then new, with the person's name
- **Code:** `src/lib/deals/service.ts:117-140`
- **Verification:** partly. A stale overwrite of a triage bucket shows up in the timeline and is cheap to undo. If this is done at all, a server-side expected value with a toast is enough. No inline 'Change anyway' UI.

### G2B-015

**Make 'Move all to today' move only what is still yours and still overdue**

Low · Fix · effort S · `Today, Overdue 'Move all to today' (planned, D7)` · Every save is safe, instant and undoable

- **Today:** Not built yet: nothing on the branch implements it. If it sends the ids the tab rendered, a stale tab will move tasks Pieter already finished or took over. Pieter's own Overdue group starts at 39 tasks.
- **Why:** A bulk action amplifies a stale screen 39 times. Getting the server rule right before it ships costs nothing.
- **Change:** Send the rendered ids. The server moves only rows that are still assigned to the clicker, still active, and still due before today. Toast: 'Moved 12 to today · 2 skipped, Pieter finished them', with Undo.
- **Desktop, tablet, phone:** Toast as in D7: bottom left on desktop, above the bottom bar on phone. The skipped count drops to 'Moved 12 · 2 skipped' at 320.
- **Reuse:** D7 reschedule and Undo toast, branch patchTask.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Short result toast with Undo
  - [Todoist](https://mobbin.com/screens/009d081e-971b-4f37-a073-f66701f9d74b): Compact 'Task moved to Inbox' pill confirming a move
- **Code:** `Spec docs/asana-migration-plan.md:68 (D7) and :378 (Overdue with 'Move all to today')`
- **Verification:** partly. Not built yet, and the server rule is sensible and cheap. The harm is small and visible, though: a finished or taken-over task gets its due date moved to today. Fold the rule into the same expected-value work as G2B-001 and G2B-013.

### G2B-016

**After one conflict, reload the rules and replay the cell, instead of failing every later edit**

Low · Fix · effort S · `Settings, CapEx rules` · Every save is safe, instant and undoable

- **Today:** persist() only updates the version on success (capex-rules-editor.tsx:209-222). After one conflict, every later cell edit also conflicts and snaps back until a full reload. The only notice sits above the first card, off screen from the Building systems rows.
- **Why:** One conflict turns the whole page into a trap where edits look accepted for a moment, then revert.
- **Change:** On CONFLICT, fetch the current rules and version. If the stored value of the cell you edited is unchanged, reapply your edit and save again. If it changed, keep your value in the cell and show the G2B-012 hint on it.
- **Desktop, tablet, phone:** No visual change apart from the per-cell hint.
- **Reuse:** saveCapexRules and getCapexRules.
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:203-222`
- **Verification:** partly. Verified: persist() only updates the version on success (capex-rules-editor.tsx:209-222), so after one conflict every later edit reverts until a reload. Getting there needs a second tab or the other partner editing settings at the same time, and settings rarely change. The message is visible above the Appliances card at 1280, but not near the Building systems rows.

### G2B-017

**Write down one concurrency rule per kind of edit and enforce it in the services**

Low · Fix · effort S · `Service layer behind every edit surface` · Every save is safe, instant and undoable

- **Today:** README 'Rules of the road' already has 'Whole-blob saves carry a version' (README.md:51-53). What's missing is a rule for status, stage, assignee and free-text fields.
- **Why:** Without one rule, every new surface (Today, the Review banner, Move all, playbooks) picks its own behavior, and the bugs in this unit come back.
- **Change:** Add four rules to README 'Rules of the road':
- Status, stage and assignee are set with an expected value.
- Free text sends an expected value and stores the previous one.
- Whole-section editors pin a section hash when Edit opens.
- Append-only data needs no guard.
Add an `expect()` helper to src/lib/action-result.ts that returns a typed Conflict { by, at, current }, so the UI can always name the person.
- **Desktop, tablet, phone:** Not applicable.
- **Reuse:** src/lib/action-result.ts (ActionResult, CONFLICT_MESSAGE), README Rules of the road.
- **Code:** `src/lib/tasks/service.ts:78-128`, `src/lib/properties/service.ts:32-45,105-118`, `src/lib/app-config-write.ts:13-33`, `src/lib/deals/service.ts:117-160`
- **Verification:** partly. This is a process and docs change; the actual bugs are G2B-001 to 003 and 011 to 014. The useful part is the expect() helper returning { by, at, current }.

### G2B-018

**Say who handed a task over, and let the handoff carry one line of context**

Low · Design change · effort S · `Task page rail Assignee (planned) and the assignee menu` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The /tasks/[id] rail now ends with 'Created: Connor · Oct 23', on desktop only, and the activity logs 'Connor assigned Pieter'. Nothing under Assignee says who handed the task over or when, and the picker has no note field. The 8 'Pieter to confirm' titles are still in the data.
- **Why:** A handoff without the giver's name and a reason sends Pieter digging. Mercury and Stripe show 'Requested by' or 'by Sam Lee' next to the item.
- **Change:** Put the 'From Connor · Oct 23' line under the Assignee value, from the latest ASSIGNED event by someone else, and keep it in the chip row below lg. The optional handoff note still fits.
- **Desktop, tablet, phone:** Desktop 1280: a sub-line under Assignee in the rail. Tablet 768: the chip row reads 'Pieter · from Connor'. Phone 375: the chip shows 'Pieter', and 'From Connor' moves to the meta line under the title, without the date.
- **Reuse:** Branch TaskEvent ASSIGNED and COMMENT; the planned assignee picker (React Aria).
- **References:** 
  - [Mercury](https://mobbin.com/screens/74fb1222-9a02-416c-b7fd-bb736482ac39): 'Requested by J. on Oct 28' attribution line in the detail panel
  - [Stripe](https://mobbin.com/screens/966b2f85-123b-4302-b505-08eb9b5a9724): Timeline note naming a teammate, signed 'by Sam Lee'
- **Code:** `prisma/schema.prisma (main Task has no createdBy)`, `branch:src/app/(app)/tasks/[id]/fields.tsx:169-171 (Created row, hidden below lg)`, `branch:src/app/(app)/tasks/[id]/page.tsx:199-200`, `branch:src/lib/tasks/activity.ts:131-134 (ASSIGNED line)`
- **Verification:** partly. The observation is true: the rail shows only 'Pieter Louw', and 8 of Pieter's 80 open titles start 'Pieter to confirm'. But the planned timeline will already say 'Connor assigned to Pieter · Oct 23', and G2B-004 puts 'From Connor' on the row, so a rail line would be a third copy. A 'Note for Pieter' field inside the assignee menu adds chrome to a picker when the task page already has a composer. Keep at most one rail line and drop the menu field. On Mobbin, Mercury shows the requester inside the status timeline ('Submitted Oct 28th at 6:11pm by …', acd32944), not as a separate line.

### G2B-019

**Show 'Updated by Pieter 5m ago' on records and sections**

Low · New capability · effort M · `Task page rail, property section headers, deal page header` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. No record shows who changed it last. Tasks store appEditedAt with no editor id. The /tasks/[id] rail has Created but no Updated line. Property and deal pages are unchanged from main.
- **Today:** No record says who changed it last. The task page shows none. Property cards show none, and Property has no updatedBy. On the deal page, Pieter's two stage changes appear only deep in the timeline.
- **Why:** Seeing that Pieter touched a section an hour ago is the cheapest conflict prevention there is, and it closes the loop on his work. Stripe, Jira and Plane all show 'Last updated' quietly.
- **Change:** One muted meta line per record, hidden when the last editor is you:
- Task: at the bottom of the rail, 'Updated 5m ago by Pieter'.
- Property sections: at the right of the header, 'Pieter · 2h'. On desktop, hover shows the exact time; on touch, tapping opens that section's activity.
- Deal: in the header, 'Stage changed by Pieter · Sep 2'.
The data comes from the activity log (IA-034, PROPERTY-027).
- **Desktop, tablet, phone:** Desktop 1280: in the header meta. Tablet 768: the same, with a 44px tap area. Phone 375: dropped from section headers and kept once under the record title.
- **Reuse:** The planned shared activity timeline (IA-034), branch TaskEvent and appEditedAt, SectionCard header actions slot.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): 'Last updated' as one plain row in the Details rail
  - [Plane](https://mobbin.com/screens/2be3d4e1-ebd8-42c7-bd36-86d20567c191): 'Updated less than a minute ago' beside Properties
  - [Navattic](https://mobbin.com/screens/f4b4d992-8bd9-4ade-aff4-0cc9fdffc22d): 'Edited just now' with the editor's initials in the page header
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Header chip 'Alex Smith · about 3 hours ago'
- **Code:** `branch:src/lib/tasks/core.ts:61 (editStamp: appEditedAt only)`, `branch:src/app/(app)/tasks/[id]/fields.tsx:169-171`
- **Verification:** partly. It's true that nothing shows who edited last. But 'Pieter · 2h' on every property section header puts a meta mark on about ten cards. Stripe shows 'Last updated' once, in the record's Details rail (confirmed: https://mobbin.com/screens/daed2848-67bf-4bad-acbd-233af93bb070). Keep one line per record: task rail, deal header, property header. Property has no updatedBy and no activity log yet, so the property part depends on IA-034 and is more than M effort.

### G2B-020

**Show a sync conflict on the task page as a small card with both values**

Low · Design change · effort S · `Task page activity (planned)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. /tasks/[id] activity renders a conflict as an internal line: 'Asana sync conflict: ' plus describeConflict, with quoted ISO dates. A property conflict shows the raw propertyId or bucket instead of an address. There are no actions.
- **Today:** describeConflict writes a sentence like 'Asana changed the due date to "2026-10-30"; the app had changed it to "2026-11-02", which was kept.', which shows as an internal timeline line. It uses ISO dates and quotes, and offers no action.
- **Why:** Whoever opens the task meets the conflict first, and that is often Pieter, not Connor. Turning the line into a choice resolves it where it was found.
- **Change:** Render it in the activity as a row with an amber left rule:
- 'Asana and the app disagree on Due date'
- 'Asana: Oct 30 · App: Nov 2 (kept)'
- Buttons 'Use Asana's' and 'Keep'.
Once resolved, it collapses to 'Connor kept the app's due date'. Dates use the house formatter.
- **Desktop, tablet, phone:** Desktop and tablet: one row with the buttons on the right. Phone 375: the buttons stack under the values as 44px buttons.
- **Reuse:** Branch TaskEvent CONFLICT data (field, app, asana, base), Button, amber warning token.
- **References:** 
  - [Front](https://mobbin.com/screens/0ecf2195-42d2-4db8-a7c4-46a176759c17): Amber conflict line with a value picker
  - [incident.io](https://mobbin.com/screens/b2dfe857-6aaa-4692-bdbc-29006e6275f0): Value changes shown as old struck through, then new, inside the update stream
- **Code:** `branch: src/lib/asana/map.ts:461-475 (describeConflict text)`, `branch: src/lib/asana/import.ts:150-158`, `branch:src/lib/tasks/activity.ts:177-178`, `branch:src/lib/asana/map.ts:461-481 (quoted values; place shows propertyId at :465)`
- **Verification:** partly. I confirmed the describeConflict output, and it's worse than stated. For property conflicts, show() returns the raw propertyId (map.ts, the 'bucket in v' branch), so the line can read 'Asana changed the property to cmtg25…'. Fixing that sentence (address instead of ID, house date format, no quotes) is a plain fix. The Use Asana's / Keep buttons duplicate G2B-009's resolution UI for a six-day window, so build them in one place only.

### G2B-021

**Let a partner take an Unassigned task, and say so if the other partner took it first**

Low · Design change · effort S · `Today, Mine column, Unassigned group (planned)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. Today's Unassigned group in Mine shows the same rows to both partners, each with a checkbox and avatar and no Take action. Assignment is still last-write-wins through patchTask.
- **Today:** Item 96 puts the same Unassigned tasks at the top of both partners' Mine. With no presence (by design), nothing tells one partner the other has started, and assignment is last write wins (service.ts:115-119; branch core.ts:485-507). A move-in report could get two calls to the tenant, or none.
- **Why:** A shared queue without a claim step either duplicates work or leaves it, the two failures this list exists to prevent.
- **Change:** Add a 'Take' action on Unassigned rows. It assigns the task to you only if it is still unassigned. If Pieter already took it, a toast says 'Pieter took this 2 min ago' and the row leaves Unassigned. A taken task moves into Today, Overdue or No date by its due date.
- **Desktop, tablet, phone:** Desktop 1280: 'Take' appears at the row end on hover and is reachable by keyboard. Tablet and phone: no hover per the house touch rule, so Take is a swipe action and an item in the row's long-press menu (TASKS-045, MOBILE-043).
- **Reuse:** Planned Today rows, row swipe and long-press actions, patchTask with an expected assignee (G2B-013).
- **References:** 
  - [Front](https://mobbin.com/screens/3b64830f-1d1f-4818-ae2a-28c3f6ffdaaf): A shared inbox splits into Unassigned and Assigned tabs; taking one moves it between them for everyone.
  - [Front](https://mobbin.com/screens/3258fa83-bf07-454c-aeb7-a0db0261fdd7): The signed-in user is the first option in Assign, so taking an item is one tap.
  - [Jira](https://mobbin.com/screens/9cb87142-8ae1-4266-8401-0c109f043177): 'Assign to me' sits directly under the Assignee field
  - [Intercom](https://mobbin.com/screens/f86259e4-e830-41ce-bb82-5bf6cf7ebfe3): Unassigned as a shared inbox teammates pull from
- **Code:** `Spec docs/asana-migration-plan.md:96 (Unassigned at the top of both Mine columns)`, `src/lib/tasks/service.ts:115-119`, `branch:src/app/(app)/tasks/today-view.tsx:58-64`, `branch:src/lib/tasks/list.ts:182-184`, `branch:src/lib/tasks/core.ts:487-503`
- **Verification:** partly. Unassigned at the top of both Mine columns is still an open default in the spec ('confirm or correct', item 1). The race itself is fixed by G2B-013's expected assignee. 'Take' is a shortcut over the existing picker, which is worth having but low. Jira's 'Assign to me' is a fair reference.

### G2B-022

**Mark what changed since you last opened a task**

Low · Design change · effort S · `Task page activity (planned)` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. TaskReadState is written and read only for contractors (the portal's '2 new' badges). The staff activity on /tasks/[id] has day headings but no 'New' divider.
- **Today:** TaskReadState.lastSeenAt is stored per user and task (branch schema.prisma:448-458), but it is planned only for contractor '2 new' badges. A partner opening a task has no way to tell which of 30 activity lines are new to them.
- **Why:** With D20 ruling out email, the task page is where a partner catches up. A single divider beats rereading history.
- **Change:** Add a thin 'New' divider above the first activity entry after your lastSeenAt, shown only when those entries are by someone else. Update lastSeenAt when you leave the page.
- **Desktop, tablet, phone:** The same divider at every width, with no extra chrome on phone.
- **Reuse:** Branch TaskReadState and the planned activity timeline.
- **References:** 
  - [Front](https://mobbin.com/screens/42adf3bd-2dee-4f3b-82a8-bdec59a9556b): A centered 'New activity' divider inside the thread marks where your last visit ended; earlier system events collapse to 'Assigned to you, archived + 4 more'.
  - [Linear](https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb): Per-item unread dot that clears on open; use it on Today rows that changed since you last opened them.
  - [komoot](https://mobbin.com/screens/a92c3d61-3e4b-488b-b2d2-36d0218e78cb): A NEW label separating unseen items from EARLIER
  - [Basecamp](https://mobbin.com/screens/b71d21b5-1078-44a4-adb3-9583531a6059): Quiet dividers organizing an activity stream
- **Code:** `branch: prisma/schema.prisma:448-458`, `branch:src/lib/portal/jobs.ts:62-65`, `branch:src/lib/portal/queries.ts:131-135`, `branch:src/app/(app)/tasks/[id]/activity.tsx`
- **Verification:** partly. TaskReadState exists on the branch and is unused for staff, and the spec defers staff unread badges to week 2. A quiet 'New' divider is useful and adds little chrome, but it's a nicety, not medium.

### G2B-023

**Collapse repeated changes only when one person made them**

Low · Design change · effort S · `Task activity (planned)` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. buildActivity folds back-to-back DUE events from anyone into one line, 'Due moved N× · now Oct 30', with no name on it.
- **Today:** Spec §6 plans to collapse repeat reschedules into 'Due moved 3×'. With two partners and contractors all moving dates, a merged line hides who moved it.
- **Why:** Who moved a date is the question a partner asks.
- **Change:** Collapse runs of the same change by the same person: 'Pieter moved the due date 3× · Oct 20 to Oct 30'. A change by someone else breaks the run. Expanding shows each move.
- **Desktop, tablet, phone:** Identical at every width; on phone the expand control is the whole line.
- **Reuse:** The planned timeline component.
- **References:** 
  - [Height](https://mobbin.com/screens/8e6036dc-866a-468d-8210-bd004c3792c3): One person's burst of edits in one sentence with '3 hidden'
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): 'Alex Smith changed Stage and 7 other attributes' with Show all changes
- **Code:** `Spec docs/asana-migration-plan.md:410 (Task page: 'repeat reschedules collapsed into Due moved 3×')`, `branch:src/lib/tasks/activity.ts:189-212`
- **Verification:** confirmed. A sensible refinement of the spec's 'Due moved 3×'. It adds no chrome.

### G2B-025

**Say how fresh the Asana sync is on Today, only during the overlap**

Low · Design change · effort S · `Today during the Oct 27 to Nov 1 overlap` · Home and Today become one work queue

- **Today:** The delta runs once a day (schedule lines 474-478), and Asana stays editable until Nov 1. Today shows imported tasks without saying that edits made in Asana after the morning run aren't in the app yet.
- **Why:** Without it, a partner may redo work that already happened in Asana that afternoon.
- **Change:** Until Nov 1, one muted line under the Today header: 'Asana changes through 7:02 am are in.' Remove it at cutover.
- **Desktop, tablet, phone:** One line at 1280 and 768. Phone 375: 'Asana synced 7:02 am'.
- **Reuse:** PageHeader subtitle slot, muted text token.
- **References:** 
  - [Front](https://mobbin.com/screens/2447f03a-a38e-42f5-a6b9-ffc1d4bdd6b8): 'Live data, last updated 10s ago' beside the title: one muted line with a time, which is all the overlap sync note needs.
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): 'Updated 4 minutes ago' set under the shared element it describes, never as a banner.
  - [Proton](https://mobbin.com/screens/93f0086d-4298-4e79-862f-6b8c2e1bccf2): A short state line above content that might be out of date
  - [Airtable](https://mobbin.com/screens/51dc184c-b41d-4273-adda-b2543a00b4fa): Inline 'may be out of date' line
- **Code:** `Spec docs/asana-migration-plan.md:474-478`, `branch: scripts/asana/30-delta.ts:1-12`
- **Verification:** confirmed. A reasonable temporary line. Stripe's 'Updated today 09:32:55 · Refresh' (https://mobbin.com/screens/5423e185-8374-4b6c-a4a0-2d3ae9adc1d0) is a stronger reference than Proton. The delta is run by hand, not at a fixed 7am, so read the time from max(Task.asanaSyncedAt).

### G2B-026

**Drop 'Pieter to confirm' from titles once the assignee says it**

Low · Fix · effort S · `Tasks list and task titles (Asana import)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. /tasks/all on the branch still opens with the 8 'Pieter to confirm' rows (Apr 19 2025 onward, no property), three of them bare 'Pieter to confirm'. The importer does no title rewriting.
- **Today:** All 8 'Pieter to confirm' rows have no property (verify-G2B/pieter-list--desktop-light.png), and they read like the CSV subtask rows (the spec counts 68). The Oct 27 load turns subtasks into checklist items on their parent (spec line 337) and deletes CSV subtask rows (line 345). A checklist item has no assignee, so 'Pieter to' is its only owner cue.
- **Why:** Titles that restate the assignee, or say nothing, break the copy rule against restating what the layout already shows. They also make the list hard to scan.
- **Change:** At import, rewrite 'Pieter to confirm X' to 'Confirm X' when the assignee is Pieter. Give the three bare ones their parent task's title, for example 'Confirm 15 Oxford punchlist'. List every rename in the dry-run report for Connor to approve.
- **Desktop, tablet, phone:** Shorter titles help most at 375, where titles truncate.
- **Reuse:** Asana import report and dry-run lists (spec §5.5).
- **References:** 
  - [Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58): Titles stay short and the context lives in a gray sublabel under each to-do, never inside the title.
  - [Linear](https://mobbin.com/screens/1c951621-7b10-4f56-8dc7-b52094872e17): The assignee avatar sits in a fixed spot at the row's end, so 'who' never needs to be typed into the title.
- **Code:** `grep 'to confirm' in branch src/lib/asana and scripts/asana: no title rewrite`
- **Verification:** partly. Don't bulk-rewrite titles the partners wrote. At most, flag the three bare ones in the dry-run list.

### G2B-I05

**When one partner hands the other a check, tell the first partner when it's done**

Low · New capability · effort M · `Task page rail and New for you (migration branch)` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. /tasks/all on the branch still lists 8 open tasks titled 'Pieter to confirm …', such as 'Pieter to confirm 15 Oxford Punchlist' and 'Pieter to confirm 118 Congress Upper dishwasher install'. The branch has no 'When done' row in the rail and no New for you list anywhere ('new for you' appears nowhere in src).
- **Today:** Eight open tasks titled 'Pieter to confirm …' are assigned to Pieter, dated Apr to Jun 2025 or undated. Most look like Asana subtasks that ask him to check contractor work; the load makes them checklist items, and the new Review status covers that check.
- **Why:** The partner who asked has to reopen the task or ask in person to learn it's finished, which leaves the loop open. Basecamp to-dos carry 'When done' beside 'Assigned to' so the asker is told automatically.
- **Change:** When a partner assigns a task to the other partner, record the assigner under 'When done' (on by default, shown as a rail row 'When done · Connor' with an x to remove). When the task reaches Done, it appears in the assigner's New for you as 'Pieter finished: 15 Oxford punchlist', with the first line of any closing comment, and clears once opened. The notice is in-app only, so D20 holds.
- **Desktop, tablet, phone:** Desktop: one rail row. Tablet: a chip in the chip row. Phone: a row in the details sheet. The New for you entry is a normal two-line row on phone.
- **Reuse:** TaskEvent STATUS events, the New for you group proposed in G2B-004, and the Row component in fields.tsx.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/a0f9dab1-7436-42c4-82fe-68ecd210427c): 'Assigned to' with 'Notify them about this assignment' and a 'When done' person field on the same to-do.
  - [Linear](https://mobbin.com/screens/953e88d0-de6c-4eaf-9921-cd0c55bb8412): An Unsubscribe link and subscriber avatar beside the Activity heading: who hears about this record is visible and removable.
- **Code:** `asana-migration-plan.md D20`, `eval on :3300 /tasks/all: 8 links matching 'Pieter to confirm'`, `branch grep: no 'New for you' in src`, `asana-migration-plan.md lines 144-146 (After cutover, week 2)`
- **Verification:** partly. The 8 'Pieter to confirm' rows exist, all assigned to Pieter and dated Apr to Jun 2025 or undated. Earlier verification (G2B-026) found that they read like CSV subtask rows, which the Oct 27 load turns into checklist items. Most of them ask Pieter to check a contractor's work, which the new Review status with Approve now covers. That leaves a thin case for partner-to-partner 'tell me when it's done'. A 'When done · Connor' row on every partner handoff adds rail chrome. The notice also needs a New for you surface that doesn't exist (G2B-004). The same need is already proposed as G2B-024 ('Handed to Connor' group) and G2B-018 ('From Connor'). If it's built, drop the rail row: record the assigner automatically and show the finished item in their list. Basecamp's 'Stuff I've assigned' tab (https://mobbin.com/screens/fe8c92bf-f0ef-46a5-a006-3f4b92a7be23, seen) is a lighter model. conflicts_with should name D8 ('No owner field'), since this adds a follower-like field.

### G2B-I06

**Let a partner @mention the other in a note to put the record in their New for you**

Low · New capability · effort M · `Task composer (migration branch) and deal note box (/deals/[id])` · Home and Today become one work queue

- **Migration branch:** Still applies on the migration branch. The branch task composer has no @ picker; it offers text, files and the Shared/Internal switch only. The deal note box is unchanged, and addDealNote still appends the author's initials in parentheses (branch src/lib/deals/service.ts:143-155).
- **Today:** Neither the task composer nor the deal note box supports @mentions. Deal notes are attributed automatically: addDealNote appends the author's initials, e.g. '(CS)' (deals/service.ts:149). They aren't signed by hand.
- **Why:** Asking a question shouldn't mean taking the task over. Stripe's note box says '@mention will notify your teammate about this note', and Mercury's transaction comments invite you to mention a teammate.
- **Change:** Typing @ in an Internal note or a deal note opens a two-name picker (Connor, Pieter). The mention renders as a name token, and the record appears in the mentioned partner's New for you as 'Connor asked you on 767 Prospect: Can you call the plumber?'. Shared replies to contractors don't offer @.
- **Desktop, tablet, phone:** Desktop and tablet: a popover under the caret. Phone: a small picker docked above the keyboard.
- **Reuse:** The task Composer and deal note form, the approved React Aria ComboBox, and New for you (G2B-004).
- **References:** 
  - [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): Mention picker with the helper '@mention will notify your teammate about this note' and an Esc and Cmd-Enter hint.
  - [Stripe](https://mobbin.com/screens/a8eb6887-0ce8-47f6-b1c9-7c35ae1391be): The mention becomes a name token inside the note text.
  - [Mercury](https://mobbin.com/screens/a8faa54a-ce13-4a31-b93e-e047ca62dae3): The transaction drawer's comment box hints that you can mention a teammate with @.
  - [Mercury](https://mobbin.com/screens/ed84df94-2b05-4afc-b05f-49213b391967): A comment box at the foot of the record drawer with the helper line 'Mention a team member with @, press Enter to send'.
  - [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): Inbox items open beside the list, with the activity and comment box under the item.
- **Code:** `src/app/(app)/deals/[id]/page.tsx:101`, `branch src/app/(app)/tasks/[id]/composer.tsx (no mention handling)`, `branch src/lib/deals/service.ts:143-155`, `src/app/(app)/deals/[id]/page.tsx:100-105`, `src/lib/deals/service.ts:142-150`
- **Also found as:** DEALS-I17 (Deals pipeline, new deal and deal detail)
- **Verification:** partly. The evidence is wrong. 'seeing tomorrow (CS)' isn't hand-signed: deals/service.ts:149 appends the author's initials to every new deal note automatically. That attribution problem is DEALS-044's. It's true that neither box supports mentions. With exactly two staff, an @ picker has one useful name, and the notification target (New for you) doesn't exist yet. An Internal comment the other partner sees when they open the task, plus G2B-022's New divider, covers most of the need. Stripe ed14dee7 is real (confirmed on Mobbin: '@mention will notify your teammate about this note'). Keep this as a later, low-priority capability.

### G2B-I10

**Show a matching open task while a new one is being typed**

Low · New capability · effort M · `New task (migration branch /tasks/new)` · Create where you are

- **Migration branch:** Still applies on the migration branch. Typing 'Mud drywall' into Title on /tasks/new on :3300 shows nothing under the field, although 'Mud Drywall' is open at 767 Prospect. That task is label-assigned in Asana to José Alvarez and shows as Unassigned. The new task page and new-task-fields.tsx have no lookup.
- **Today:** Typing 'Mud drywall' on /tasks/new shows nothing, though 'Mud Drywall' is open at 767 Prospect in the Unassigned group. Partners, tenants, contractors and the daily Asana delta can all raise the same issue.
- **Why:** Two people logging the same job creates double work and conflicting instructions to contractors. Front's composer says '1 other conversation with Jane in the last 7 days · View', and Jira's create dialog lists similar work items. The cheapest place to catch a duplicate is at creation.
- **Change:** Once the title has 3 or more characters, show one muted line under it: 'Open at 767 Prospect: Mud Drywall, unassigned, due Aug 28 · View'. Show at most two matches from open tasks, weighted to the chosen property, and nothing when there's no match. No dialog and no blocking.
- **Desktop, tablet, phone:** The same line under the title at every size. Phone shows one match.
- **Reuse:** Field helper text under Input (ui.tsx) and the existing search query behind the top search box.
- **References:** 
  - [Front](https://mobbin.com/screens/42adf3bd-2dee-4f3b-82a8-bdec59a9556b): '1 other conversation with Jane in the last 7 days · VIEW' as a single dismissible line.
  - [Jira](https://mobbin.com/screens/51bc5a91-bea2-49e4-83a0-1aa6c0b48088): 'Similar work items' under the summary field in Create Task. Jira is outside the library and is cited only for the placement.
- **Code:** `branch src/app/(app)/tasks/new/page.tsx, new-task-fields.tsx (no search or match)`
- **Verification:** partly. Reproduced: typing 'Mud drywall' on /tasks/new shows nothing (verify-G2B/new--typed--desktop-light.png), although 'Mud Drywall' is open at 767 Prospect. The one-line, non-blocking hint is the right weight, but it's a nice-to-have for two partners and doesn't block a core job. DEALS-038 proposes the same pattern for deal addresses, so build one shared 'possible match' helper line. The Front reference (42adf3bd) plausibly shows the line; a sibling Front screen I pulled shows the same layout.

### G2B-I15

**Let either partner pin one note to the top of a deal or task timeline**

Low · New capability · effort S · `Deal page timeline (/deals/[id]) and task page activity (migration branch)` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. Task activity still shows the latest 15 entries and folds the rest behind 'Show N earlier updates' (activity.tsx:32, 43; splitEarlier in lib/tasks/activity.ts:223). No pin action exists on comments or notes, and the schema has no pinned field. The deal timeline is unchanged.
- **Today:** The deal timeline mixes 18 entries, notes and field changes, newest first, so standing context ('going to see it tomorrow') sinks under status flips. Task activity runs oldest first and folds everything but the latest 15 behind 'Show N earlier updates', so a key note from weeks ago gets hidden.
- **Why:** The partner who opens a record second should see the one thing to know before anything else. Stripe lets a note be pinned to the top of the payment timeline, labeled with who pinned it.
- **Change:** Every note and comment gets 'Pin to top' in its menu. One pinned note per record sits above the timeline as 'Pinned by Pieter · Oct 21', with Unpin. On a contractor's job, a pinned Shared comment also shows at the top of the portal job page, and a pinned Internal note never does.
- **Desktop, tablet, phone:** The same at every size. Phone truncates the pinned note to 3 lines with More.
- **Reuse:** activity-timeline.tsx and the note and comment row menu.
- **References:** 
  - [Stripe](https://mobbin.com/screens/7f948e68-060f-4b2e-aa54-4bdadfdfdf0c): 'Pinned note' at the top of the timeline with its author and time.
  - [Stripe](https://mobbin.com/screens/966b2f85-123b-4302-b505-08eb9b5a9724): The note menu offers Pin to the top, Edit and Delete, with Delete in red.
- **Code:** `branch src/app/(app)/tasks/[id]/activity.tsx (SHOWN = 15, splitEarlier)`, `branch src/app/(app)/tasks/[id]/activity.tsx:32-58`, `branch src/lib/tasks/activity.ts:223`, `branch prisma/schema.prisma (no pin field on TaskEvent or DealNote)`
- **Verification:** confirmed. The deal timeline has 18 entries, newest first, and 13 are field changes, several of them test flips. Task activity shows the latest 15 (activity.tsx SHOWN = 15). Deal notes have no row menu today, so 'Pin to top' adds one. The root problem is notes buried among change lines, which DEALS-042 ('Separate notes from automatic change entries') addresses. Ship that first; pinning is a small extra. Stripe's pinned note is a real pattern.

### G2B-I17

**Let the Mine heading switch to Pieter's day**

Low · Design change · effort S · `Today, Mine column heading (migration branch)` · Home and Today become one work queue

- **Today:** Today shows only the signed-in partner's Mine. To see Pieter's day, Connor goes to All and picks Pieter in a 45-option Assignee select, which loses Today's Overdue, Today and Waiting grouping and shows a flat list.
- **Why:** Before calling Pieter, Connor wants Pieter's day in the same shape as his own. Linear's My issues header is a person menu that keeps the same tabs for a teammate, and Shopify's page title doubles as the view switcher.
- **Change:** The Mine heading becomes a quiet menu, 'Mine ▾', whose only other choice is 'Pieter's'. Picking it shows Pieter's Mine with the same groups and working actions, minus New for you, and the URL (?who=pieter) can be shared. Nothing else in the layout changes.
- **Desktop, tablet, phone:** Desktop 1280: the column heading is the menu. Tablet 768: the Mine segment's label opens the same menu. Phone 375 drops it; All with the Assignee filter covers the rare case.
- **Reuse:** React Aria Menu (approved) and today-view's grouping, parameterized by user id.
- **References:** 
  - [Linear](https://mobbin.com/screens/671d22cf-69d7-4289-886c-f4e2f288f058): The My issues header shows a person menu with the Assigned and Created tabs underneath.
  - [Linear](https://mobbin.com/screens/a085c0e8-477c-4459-b2ee-25d5a4c0340a): The same tabbed layout for your own issues, so switching people keeps the shape.
- **Code:** `eval on /tasks/all: the Assignee select has 45 options`
- **Verification:** confirmed. Today groups only the signed-in user's work (today-view.tsx:28-33). All filtered by Pieter is a flat list with no headings, and its Assignee select has 45 options. A quiet heading menu that keeps the same groups is cheap and adds almost no chrome. The Linear reference showing a person menu on My issues is plausible but unverified.
