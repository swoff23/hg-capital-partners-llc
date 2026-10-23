# Staff sign-in lifecycle: sign out, a 30-day expiry mid-edit, changing a password, and passkeys

Part of the [UI/UX review](README.md). 28 findings: 0 critical, 0 high, 7 medium, 21 low.

## How it should work

Sign-in should disappear, and when it can't, it should look like part of the app. A partner signs in about once per device per year. Sessions slide 30 days from the last visit and are rows a partner can see and end, the way Linear lists sessions (https://mobbin.com/screens/13e6c6f5-0ec6-49d8-83e4-921de2120ae1) and Supabase keeps an inactivity timeout apart from a fixed time box (https://mobbin.com/screens/db7bc7ed-c6e7-4eb6-a7b8-b60cbc8b8add).

The door. /login knows a returning partner. Mercury's iPhone app opens on Welcome back with the email filled and a Face ID mark (https://mobbin.com/screens/44250421-2107-4c90-9915-89f4c939649d). Clerk shows the remembered email as text with an edit pencil (https://mobbin.com/screens/fc191028-fa19-4684-9cda-24eeca7de19e), and Linear names the method used last time (https://mobbin.com/screens/3997d60f-bea7-4068-af79-3942a664072e). HG shows "Welcome back, Connor", the email as one line with Not you?, and one password field or Face ID. Passkeys arrive through autofill plus one offer right after a password sign-in. Mercury (https://mobbin.com/screens/3a417314-076e-4bbf-9971-8899bc4322e9) and Gusto (https://mobbin.com/screens/cf953e0b-dcfc-4e23-9d0e-6ab06f837475) ask the same way, once, with Not now. In the app the feature is called Face ID, with a one-line sublabel as on Zillow (https://mobbin.com/screens/55f13f74-c074-4462-8c6b-f958aa5e32f8).

The interruption. When a session ends mid-edit, a sheet built from app primitives opens over a blurred page, like Mercury's Touch ID check (https://mobbin.com/screens/2bfa103f-09d3-4de8-a223-df2c58ebba5a) and Todoist's Confirm your account (https://mobbin.com/screens/e9526af4-b67d-4d1e-9cd7-8a04113744b9). It names the cause only when another device caused it, then replays the save. Back and history never show data without a live session.

The account. One Settings page with Clerk's anatomy (https://mobbin.com/screens/61aac998-5469-42c3-853b-efccc8de4094) holds Name, Email, Password, Face ID, Devices and Sign out. The Password row reads "Changed Oct 23", after Airbnb's Last updated line (https://mobbin.com/screens/c50369e0-6c52-45c6-b69f-695382b258aa). Devices follows Wise (https://mobbin.com/screens/95f7ef8e-6705-4d29-8e91-b1edae9c1332): This device comes first, and Sign out other devices has a sublabel saying when to use it (https://mobbin.com/screens/3fc551aa-245f-405a-a779-f561e3ce4d34). Change password is Zillow's dialog, with Forgot it? under the current password.

Leaving. On desktop, Sign out is one click and a full page replace to a /login that says "You're signed out." Cal.com gives that a whole page (https://mobbin.com/screens/a8397696-691d-4dcb-9268-8606cb32cce4); HG keeps it to one line. On a phone it asks once in an action sheet, as Linear Mobile does (https://mobbin.com/flows/a710ecdf-4eb1-4409-96a6-bc7acb00478a), until Face ID makes coming back free.

The guard rails stay quiet. Failed tries count per device, so a stranger can't lock a partner out, and a lockout names the time it ends. There's no 2FA setup, no Remember me box like Stripe's (https://mobbin.com/screens/d36ef36b-d2e9-46ff-bac5-f1d715f30ec0) and no new-device email approval. For two partners, sliding sessions and per-device sign-out already do what those would.

<details><summary>What the reviewer covered</summary>

Production build at http://localhost:3200 was up for the whole run. Routes covered: /login signed out (Chromium at desktop 1280, mobile 375 and narrow 320, plus WebKit at mobile and narrow), /login?error=bad (all three widths), and /login while signed in (redirects silently to /). Signed in, I opened /welcome, /rentals and /residents at desktop and mobile and clicked the public header's brand and 'HG Login' links; both land on the dashboard. I ran / with no cookie at mobile and with curl (200, the marketing page). /settings at desktop, tablet and mobile with accessibility trees confirms there is no account page. The sidebar account area was shot expanded on hover at desktop in light and dark, and the phone and tablet drawers were opened. I tapped Sign out in the drawer at mobile and tablet. The POST was blocked, which stands in for a dropped connection, and the result was the full-screen 'This page couldn't load'. Ended session: I did not use review/secret.txt. Instead I sent an invalid hgos_session token, which hits the same code path as an expired one (readSessionToken returns null for both). With it I loaded /, /tasks/cmtg25z7s048mjphsikewzpy1, /deals/cmtg25yd8002cjphs49ovlvob, /properties/cmtg25y4p0006jphsv3frndk6 and /settings at desktop and mobile; all of them land on a bare /login with no message and no return path. To simulate a session ending mid-page, I swapped the cookie on an open task page. Global search then kept showing the previous query's results under the new query (401 in the console), and a sidebar click went to /login. Every write was blocked, so I traced what a server action does after expiry in code: requireUser redirects inside actions, withResult rethrows the redirect, Description saves only on blur, and the deal note form keeps no local copy. Code I read: src/lib/session.ts, session-token.ts, auth.ts, login/actions.ts, login/page.tsx, proxy.ts, app-shell.tsx, public/header.tsx, login-throttle.ts, server-action.ts, the task, deal, property and move-in actions, global-search.tsx, api/search and api/blob, both password scripts, plus branch f59e6ad (portal session.ts, limits.ts, accounts.ts changeOwnPassword, auth-frame.tsx, branch login page and actions, Prisma PortalSession/PasswordResetToken/SecurityEvent) and the Asana migration plan's §5.1, §5.2, defaults and week-2 list. Could not reach: real passkey or WebAuthn prompts (none exist), the actual post-sign-out navigation and the expired-save redirect (writes blocked), and the branch's /login/forgot screens (not deployed on 3200). Mobbin: 12 searches, covering Stripe, Linear, Mercury web and iOS, Vercel, session-expired modals, Face ID passkeys on iOS, signed-out pages, adding a passkey, logging out, and Ramp profile settings. Ramp isn't on Mobbin, so Sketch, Tally, Copilot and Wix came back as substitutes.

</details>

## Findings

### G2D-001

**Re-authenticate in a sheet over the page instead of redirecting, so the draft survives**

Medium · New capability · effort M · `Every signed-in page when the session ends mid-work (task Description, deal note, property Units and Building CapEx editors, Move-in form editor)` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. requireUser still calls redirect('/login') with no ?next (auth.ts:19-22). The task page's new actions all use withResult, but withResult passes redirects through with unstable_rethrow (server-action.ts:24-31), so a save after the session ends still navigates to a bare /login. The Notes field saves on blur with no local copy (notes.tsx:29-32), so its text is lost. One mitigation exists: the comment composer keeps its draft in localStorage (composer.tsx:29-40), so an unsent comment survives.
- **Today:** requireUser() redirects to /login, and server actions rethrow that redirect: patchTask through withLog, and the units, Building CapEx and move-in editors through withResult. So a save made after the session ends navigates to a bare /login (no ?next) and the unsaved text is gone. Today this can hit each device about once per 30 days, when a tab opened before the fixed expiry is used after it.
- **Why:** The fixed 30-day end comes at an arbitrary minute, so a partner halfway through a deal note or a units edit loses it with no warning. After signing in they land on Home, not back on the record (FEEL-018). Employment Hero and Stripe confirm identity over the page and keep the work.
- **Change:** Add one signed-out handler for the app. (1) Server actions use a requireUser variant that returns {ok:false, code:'signed-out'} instead of redirecting; this fits FEEL-003's move to withResult. 401s from /api/search and /api/blob go to the same handler. (2) The handler opens a small dialog over the dimmed page. Heading 'Hi Connor, sign in to keep working', one password field (Face ID passkey first once G2D-009 lands), primary 'Sign in', and a quiet 'Not Connor?' link to /login. It posts to a route handler (POST /api/session) that sets the cookie and returns 204, then replays the queued save and closes. (3) When a tab regains focus, GET /api/session and open the dialog before typing starts. Broadcast success to other tabs with BroadcastChannel so one sign-in restores them all. The page never reloads or navigates.
- **Desktop, tablet, phone:** Desktop 1280: 400px centered dialog with focus trapped. Esc closes it and leaves the draft on the page, and the next save asks again. Tablet 768: the same dialog. Phone 375: a bottom sheet with the field above the keyboard and Face ID as the first button once passkeys exist. Nothing drops.
- **Reuse:** Grow ConfirmDialog into the Dialog shell listed under Known gaps in docs/components.md, using React Aria Modal (approved). Field styles and AuthError from src/app/login/_components/auth-frame.tsx (branch f59e6ad). ActionResult and withResult in src/lib/action-result.ts and src/lib/server-action.ts.
- **References:** 
  - [Todoist](https://mobbin.com/screens/e9526af4-b67d-4d1e-9cd7-8a04113744b9): 'Confirm your account' opens over the Settings page being edited. The email shows read-only beside a password field, with Log out as the escape. This is the in-place re-auth from a library app.
  - [Mercury](https://mobbin.com/screens/2bfa103f-09d3-4de8-a223-df2c58ebba5a): The 'Touch ID' check over the Security page puts 'Use Touch ID' first and a code below it as the fallback. That is the Face ID first, password second order 001 wants. The page behind is washed out, not readable.
  - [Employment Hero](https://mobbin.com/screens/80a62519-da66-4bc6-b988-92bbf392b408): 'Hi Jane, are you still there?': a password-only prompt over the blurred page, with a 'Not Jane?' escape. The pattern to copy.
  - [Stripe](https://mobbin.com/screens/eb7a345d-982a-461c-85e1-211d3f5b0398): Verification required modal over the Profile page in edit mode: re-check identity without leaving the edit.
  - [Perplexity](https://mobbin.com/screens/3f400971-e98a-43e5-a951-53bd4ac50ccd): On iOS, the sign-in sheet rises over Settings and keeps the page behind it: the phone form of the dialog.
- **Code:** `src/lib/auth.ts:19-22`, `src/lib/server-action.ts:24-42`, `src/app/(app)/tasks/actions.ts:42-47`, `src/app/(app)/tasks/[id]/task-detail.tsx:209-233`, `src/app/(app)/deals/[id]/page.tsx:100-105`, `src/app/(app)/properties/actions.ts:88-93`, `src/app/(app)/settings/move-in-form/actions.ts:46-47`, `src/app/api/blob/[kind]/route.ts:62-65`, `branch: src/lib/auth.ts:19-22`, `branch: src/lib/server-action.ts:24-31`, `branch: src/app/(app)/tasks/[id]/actions.ts:36-41`, `branch: src/app/(app)/tasks/[id]/notes.tsx:29-32`, `branch: src/app/(app)/tasks/[id]/composer.tsx:29-40`
- **Verification:** partly. Reproduced the navigation half: with an invalid cookie, clicking Deals from an open task landed on a bare /login with no return path (verify-G2D/task-expiry run). Code confirms the save half: DescriptionField commits on blur only (task-detail.tsx:209-233), the deal note is an uncontrolled form (deals/[id]/page.tsx:100-105), and nothing restores either. Small misattribution: patchTask uses withLog, not withResult, but both rethrow the redirect. Severity is overstated. Today it can hit each device at most once per 30 days, and G2D-003's sliding sessions would make it almost disappear. The recommendation is also heavier than two users need: a queued-save replay, BroadcastChannel and a new /api/session route are M-effort machinery for a rare case. Ship G2D-003 first. Then do the cheap version: send the redirect to /login?next=<path>, keep an unsent draft in sessionStorage keyed by record and restore it, and on tab focus run a light session check that opens the sign-in dialog before typing starts. Employment Hero 80a62519 came back in my own search and matches the pattern. Clerk https://mobbin.com/screens/cbb6ae43-3e3d-45b1-93f5-79067a20d5b0 (Verification required over Security settings) and Revolut Business https://mobbin.com/screens/1cdd71c1-8987-414d-82f6-edfc4ec9f77e (expiry warning over Bills) also support it.

### G2D-002

**Fix the Sign out button so it ends the session on the server, and sign out other devices on a password change**

Medium · Fix · effort M · `Staff sessions (every signed-in route, phone and laptop)` · A quiet shell with real search, navigation and sign-in

- **Today:** Sign out deletes the session cookie on this device, so that browser is signed out. What's missing is remote revocation. A session on a lost or unattended device can't be ended without rotating SESSION_SECRET (which signs both partners out) or clearing the password hash in SQL. A password changed in the database doesn't end existing sessions, and staff sign-ins aren't logged.
- **Why:** A Sign out that doesn't sign out breaks its promise. Linear, Mercury and Sketch revoke sessions on the server and list devices. From Oct 29, /login serves contractors as well, while staff sessions guard QuickBooks, loan and tenant data, so a lost phone needs a real fix.
- **Change:** Move hgos_session onto the same session table as the portal. Either key PortalSession to a User or a PortalAccount, or add a StaffSession with the same columns. Use a random token stored hashed, in a __Host- cookie on HTTPS like src/lib/portal/cookie.ts. Sign out revokes the row. A password change revokes every other row. Log SIGN_IN_OK and SIGN_IN_FAILED with userId. Land this before the plan's per-purpose key split (G2D-014).
- **Desktop, tablet, phone:** No visible change at any size. This is what makes Devices (G2D-005) and in-place re-auth after a revocation (G2D-001) possible.
- **Reuse:** src/lib/portal/session.ts, tokens.ts, cookie.ts, limits.ts, and accounts.ts revokePortalSessions, plus the SecurityEvent table (branch f59e6ad).
- **Challenges:** Plan §5.2 pushes staff 'sign out everywhere' to week 2. This argues the server-side staff session should land with or before the Oct 29 contractor launch, because one /login now serves both.
- **References:** 
  - [Wise](https://mobbin.com/screens/3fc551aa-245f-405a-a779-f561e3ce4d34): Security and privacy has a 'Log out everywhere' row whose sublabel says when to use it: after signing in on a public device or losing a phone. Remote revocation as a plain row.
  - [Clerk](https://mobbin.com/screens/61aac998-5469-42c3-853b-efccc8de4094): Active devices are real server rows on the Security page, and the current one is tagged 'This device'.
  - [Linear](https://mobbin.com/screens/13e6c6f5-0ec6-49d8-83e4-921de2120ae1): Sessions list with the current session marked and 'Revoke all'. Sessions are real server rows.
  - [Mercury](https://mobbin.com/screens/96f3712a-a85d-4840-a673-a2d93ecf08f9): Change Password ticks 'Log out of all other devices' by default: changing the password ends other sessions.
  - [Sketch](https://mobbin.com/screens/ffae9272-da77-465d-9537-20895031667c): Signed In Devices with a per-device Sign Out and 'Sign Out of All'.
- **Code:** `src/lib/session-token.ts:15-36`, `src/app/login/actions.ts:45-49`, `src/lib/auth.ts:8-17`, `branch: src/lib/portal/session.ts:33-79,149-161`, `branch: src/app/login/actions.ts:48-56`, `branch: prisma/schema.prisma:539-551`
- **Verification:** partly. Code claims check out: stateless HMAC token (session-token.ts:15-36), signOut only deletes the cookie (login/actions.ts:45-49), getCurrentUser only checks that a hash exists (auth.ts:12-15), and the branch's staff login path writes no SecurityEvent. But 'a Sign out that doesn't sign out' overstates it. Sign out removes the httpOnly cookie on the device where it's pressed, and browser sync doesn't copy cookies. The real gap is remote revocation, so this is infrastructure work (capability), not a bug fix. For two partners, rotating SESSION_SECRET in Vercel signs both out in a couple of minutes, which is blunt but workable for a lost phone. It's still the right foundation for G2D-004, G2D-010 and G2D-012, and the conflict with plan §5.2 (staff sign-out moved to week 2) is named. Linear 13e6c6f5 came back exactly in my search. Mercury 96f3712a wasn't returned, but a Mercury Change Password dialog with 'Log out of all other devices' (2aab53a5) was, so that reference is plausible.

### G2D-003

**Keep partners signed in for 30 days from their last visit, not from sign-in**

Medium · New capability · effort S · `Staff sessions (every signed-in route)` · A quiet shell with real search, navigation and sign-in

- **Today:** SESSION_TTL_MS is a fixed 30 days (src/lib/session.ts:12-13). The token expires at sign-in time plus 30 days (session-token.ts:29-33), and the cookie's Max-Age is the same (login/actions.ts:10-16). Nothing extends it. A partner who signs in at 9:10 on a Monday is signed out at 9:10, 30 days later, even after using the app every day.
- **Why:** Stripe, Linear and Mercury keep active people signed in. A fixed lifetime forces a sign-in in the middle of work once a month on every device. Two partners on a phone and a laptop each means about four interruptions a month, and each one risks a lost draft (G2D-001). G1A-037 proposes the same rule for contractors; one rule should cover both.
- **Change:** Make sessions slide. When a request arrives on a session last touched more than a day ago, set its expiry to now plus 30 days. With the session table (G2D-002) this is one line in the existing daily lastUsedAt touch. The cookie's Max-Age then becomes a long ceiling (400 days, Chrome's maximum), so it never needs to be set again. Until the table exists, proxy.ts can do it: it runs on Node.js in Next 16, so it can call session-token.ts directly. Widen its matcher to app routes and issue a fresh token once a day. The only end is 30 days without a visit, or a revocation.
- **Desktop, tablet, phone:** No UI. It matters most on the phone and on the home-screen app (MOBILE-036), where signing in is most painful.
- **Reuse:** src/lib/portal/limits.ts (sessionExpiresAt, shouldTouchSession) and the touch block in src/lib/portal/session.ts:61-67 on f59e6ad. src/proxy.ts for the interim version.
- **Challenges:** D14 ('Signed in for 30 days, like staff, revocable per device') reads as 30 days from sign-in. This keeps the 30 days but counts from the last visit, for staff and contractors alike (G1A-037).
- **References:** 
  - [Supabase](https://mobbin.com/screens/db7bc7ed-c6e7-4eb6-a7b8-b60cbc8b8add): User Sessions sets 'Time-box user sessions' (a fixed lifetime) and 'Inactivity timeout' (time since last use) separately, each with a one-line explanation. That's the distinction 003 draws, named in a library product's own settings.
  - [Linear](https://mobbin.com/screens/13e6c6f5-0ec6-49d8-83e4-921de2120ae1): Other session shows 'Last seen 17 minutes ago'. Sessions stay alive with activity and are judged by last use.
  - [Mercury](https://mobbin.com/screens/60d9ab3c-a4d3-46f1-8799-a913ddcaafa7): iOS Security lists 'Remembered Devices… remembered for 30 days' next to Active Sessions: device trust counted in days, with a list to revoke from.
  - [Stripe](https://mobbin.com/screens/46b46f0f-6cb5-4f1e-85a3-bb0606894379): "Remember me on this device" keeps a trusted device signed in.
- **Code:** `src/lib/session.ts:12-17`, `src/lib/session-token.ts:25-36`, `src/app/login/actions.ts:10-16`, `branch: src/lib/portal/limits.ts:6-33`, `branch: src/lib/portal/session.ts:61-67`, `branch: src/lib/portal/session.ts:135-147`, `branch: src/lib/portal/limits.ts:7,18-20,31-33`, `branch: src/lib/portal/cookie.ts:37-47`, `branch: docs/asana-migration-plan.md:75,183`
- **Also found as:** G1A-037 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. The observation is exact: SESSION_TTL_MS is fixed, exp = iat + 30 days, and the cookie's Max-Age matches, so nothing extends it. The interim route works: Next 16's Proxy defaults to the Node.js runtime (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:255), so proxy.ts can verify and reissue the token once a day. This is the cheapest, highest-leverage change in the unit and should land first, because it removes most of G2D-001's cases. I calibrated it to medium because with password autofill the monthly sign-in costs seconds. The real harm is the lost draft, which I rated medium under G2D-001. The D14 conflict is named correctly.

### G2D-004

**Let a partner change their own password in Settings**

Medium · New capability · effort S · `/settings (merged Settings, Account)` · A quiet shell with real search, navigation and sign-in

- **Today:** There's no way to change a staff password in the app. Production changes need SQL, because the backfill script never overwrites a hash and the dev reset script refuses non-local databases. The branch's changeOwnPassword is contractor-only (PortalAccount and PortalPrincipal), so it needs generalizing before staff can use it.
- **Why:** Stripe, Mercury, Tally and Copilot all put Change password one click from the profile. Today a partner who thinks their password leaked can't do anything about it.
- **Change:** In the Account page (G2D-005), the Password row shows '••••••••' and a Change button. Change opens a small dialog with Current password, New password (with Show, per G1A-040) and Save. Use changeOwnPassword from src/lib/portal/accounts.ts for staff too. It already applies the shared password rules and throttle, keeps this device signed in, signs out the others (needs G2D-002) and logs PASSWORD_CHANGED. Close with one toast: 'Password changed. Other devices are signed out.'
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a 400px dialog. Phone 375: a bottom sheet with 16px fields and Save above the keyboard. Nothing drops.
- **Reuse:** changeOwnPassword, checkNewPassword and PASSWORD_MESSAGES from src/lib/portal (f59e6ad). The Dialog shell from the docs/components.md Known gaps, on React Aria. Toast (Known gaps; FEEL-009).
- **Challenges:** Plan default #2: 'Staff logins stay managed by hand, as today.'
- **References:** 
  - [Zillow](https://mobbin.com/screens/55f13f74-c074-4462-8c6b-f958aa5e32f8): Change password opens as a small dialog over Sign in & Security: Current password with Forgot password? under it, then New password with live checks, Confirm, and Cancel / Apply.
  - [Airbnb](https://mobbin.com/screens/c50369e0-6c52-45c6-b69f-695382b258aa): The Password row on Login & security shows 'Last updated 8 days ago' and one 'Update' link, so the change starts from a single row.
  - [Mercury](https://mobbin.com/screens/96f3712a-a85d-4840-a673-a2d93ecf08f9): Change Password in a small dialog launched from the Security row, with show toggles.
  - [Stripe](https://mobbin.com/screens/e6b65816-eb18-400a-a3ba-545f05de645c): The Profile edit state swaps the masked password for a 'Change password…' button in the same row.
  - [Tally](https://mobbin.com/screens/91f92b5a-61bc-4394-a2c6-cb1aa7fcb045): 'Change password' sits inline in the password field on My account: one row, one action.
- **Code:** `scripts/backfill-password-hashes.ts:18-33`, `scripts/dev-reset-passwords.ts:19-32`, `branch: src/lib/portal/accounts.ts:258-295`
- **Verification:** partly. Confirmed. There's no password or account code anywhere under src/app/(app) or src/components, backfill-password-hashes.ts never overwrites a hash, and dev-reset-passwords.ts refuses non-local databases. Two corrections. changeOwnPassword on the branch is typed to PortalPrincipal and prisma.portalAccount (accounts.ts:258-295), so it has to be generalized for User rows, not reused as is. And 'signs out the others' needs G2D-002. High is too strong for a two-person team using a password manager, so medium. The plan default #2 conflict is named. Stripe 5bd470e4 (Profile with a masked Password row) came back in my search. Mercury's change-password dialog exists on Mobbin (2aab53a5), though the cited 96f3712a wasn't returned.

### G2D-005

**Give the merged Settings one Account page: Name, Email, Password, Passkeys, Devices, Sign out**

Medium · Design change · effort M · `/settings (merged Settings, D10): Account page` · A quiet shell with real search, navigation and sign-in

- **Today:** There is no account page anywhere. Identity is just a name and a 'Sign out' text button in the sidebar footer, visible only when the rail expands on hover at desktop and at the bottom of the drawer on phone. The theme toggle sits in the header on desktop and under 'Appearance' in the drawer on phone. The Settings tabs are all workspace configuration.
- **Why:** Stripe Profile, Vercel Authentication, Amazon Login & Security and Linear Security & access each fit one person's identity and sign-in onto a short page of label-left rows, with one action per row. Without that page, password change, passkeys and devices have nowhere to live. Once D10's bottom bar replaces the drawer, Sign out has no home on the phone either.
- **Change:** Add a 'You' group at the top of the Settings index (IA-023 / ADMIN-009) holding one Account page. Rows have the label on the left and the value plus one action on the right: Name (tap to edit), Email (read-only, because it's the sign-in), Password ('••••••••', Change), Passkeys ('None', Add; or 'iPhone, added Oct 30'), Devices ('2 signed in', opens the list), and a plain Sign out last. No avatar upload, 2FA setup, language or notification settings. Appearance stays in the account menu (SHELL-028, SHELL-039).
- **Desktop, tablet, phone:** Desktop 1280: Settings nav on the left, Account content up to about 640px, rows about 52px tall. Tablet 768: list, then detail, as on phone. Phone 375: the first row under D10's More tab, with name and email at the top (Mercury iOS). Rows open sheets, and Sign out is a neutral row at the very end. Nothing drops.
- **Reuse:** Field (label and value) in src/components/ui.tsx, Card or SectionCard, and the Settings index from IA-023 / ADMIN-009. SHELL-028's account menu links here.
- **References:** 
  - [Clerk](https://mobbin.com/screens/61aac998-5469-42c3-853b-efccc8de4094): Account > Security uses label-left rows: Password (dots, Update password), Passkeys (Add a passkey), Active devices (This device, browser, time) and Delete account in red last. It's nearly the six-row page 005 proposes.
  - [Wise](https://mobbin.com/screens/3fc551aa-245f-405a-a779-f561e3ce4d34): Security rows each carry a one-line sublabel (Devices 'Manage your devices.', Log out everywhere 'Use if...'), which explains each row on touch with no tooltip.
  - [Airbnb](https://mobbin.com/screens/c50369e0-6c52-45c6-b69f-695382b258aa): Login & security is a short page inside Account settings. The password row shows when it last changed.
  - [Stripe](https://mobbin.com/screens/5bd470e4-eb9d-4f20-af8e-e761e1f344fe): Profile: Email, Name and Password as label-left rows, then a Passkeys section with 'Add a passkey'.
  - [Vercel](https://mobbin.com/screens/fe7d7e6e-ad12-48be-bc7f-d3e6ec6297c7): Authentication: Email, Passkeys ('1 passkeys registered', Add) as rows with one action each.
  - [Amazon](https://mobbin.com/flows/c679255d-06d9-40f6-8846-265862b18a3d): Login & Security: Name, Email, Passkey, Password rows, each with one button, plus a 'sign out everywhere' path.
  - [Mercury](https://mobbin.com/screens/351996b4-117f-4663-bff4-864baac8264e): iOS Settings: profile row with email at the top, chevron rows, Log Out at the bottom.
- **Code:** `src/app/(app)/settings/layout.tsx:10-24`, `src/components/app-shell.tsx:163-184`
- **Verification:** confirmed. Confirmed in settings/layout.tsx:10-24. The tabs are CapEx rules, Move-in form and Storage, and identity is only the sidebar footer (app-shell.tsx:166-181). Show the Passkeys and Devices rows only once those features exist. Until then the page is Name, Email, Password and Sign out, which is the right size. Stripe 5bd470e4 and Mercury iOS 351996b4 came back exactly in my searches. Felt https://mobbin.com/screens/c9e4f9eb-9690-4322-99e3-ec51d57f4cc1 (Account: Name, Email, Password chevron rows) and Mercury web Security https://mobbin.com/screens/cc6f73ba-d486-49ac-8fe5-2058d73868d0 (Password, Passkeys, Active web sessions) back the same pattern.

### G2D-006

**Show 'You're signed out' in global search instead of the last query's results**

Medium · Fix · effort S · `Global search after the session ends (header search, every signed-in page)` · A quiet shell with real search, navigation and sign-in

- **Today:** /api/search returns 401 with an empty list when the session is gone (src/app/api/search/route.ts:6). global-search.tsx:22-23 only updates results when res.ok, so the dropdown keeps the previous query's results. In the test, a search for 'Pros' worked. Then the session ended and I searched 'Mariner'. The dropdown still listed 3 Prospect properties, 6 Prospect deals and 5 Prospect tasks under 'Mariner', and the console showed a 401. The same happens for any failed search, not only an ended session.
- **Why:** Wrong results are worse than none: a partner would open a Prospect deal believing it matched. Stripe's and Linear's search clear and explain instead of showing stale matches.
- **Change:** On any response that isn't ok, clear the results. On 401, show one row, 'You're signed out.', with a Sign in action. It opens the G2D-001 dialog, or links to /login until that dialog exists. Other errors fall through to SHELL-010's empty line.
- **Desktop, tablet, phone:** Same row in the desktop dropdown, the tablet dropdown and the phone's full-screen search sheet (SHELL-005).
- **Reuse:** GlobalSearch in src/components/global-search.tsx and the signed-out handler from G2D-001.
- **Code:** `src/components/global-search.tsx:15-26`, `src/app/api/search/route.ts:5-7`
- **Verification:** confirmed. Reproduced on /tasks. A search for 'Pros' worked; after the cookie was invalidated, typing 'Mariner' still listed 3 Prospect properties, 6 Prospect deals and 6 Prospect tasks, and the console showed a 401 (verify-G2D/search-expiry--after-expiry--desktop-light.png). The same code at global-search.tsx:15-26 has no AbortController or sequence check either, so a slow earlier response can overwrite a newer query's results. Fix both in the same pass.

### G2D-010

**Let staff reset a forgotten password by email, using the contractor reset flow**

Medium · New capability · effort S · `/login, /login/forgot (branch f59e6ad) for a staff email` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. Forgot password still works for contractor accounts only. PasswordResetToken has only accountId (schema.prisma:553-563), and the forgot page says so (forgot/page.tsx:13-14). A staff email gets 'Check your email / If that email has a login, a link is on its way.' and nothing is sent. The lockout line on /login?error=locked ('Too many failed attempts. Try again in 15 minutes.') has no reset link, and the 'Forgot password?' link appears only when PORTAL_ENABLED is on (login/page.tsx:57-63).
- **Today:** On the branch, Forgot password is for contractors only (plan default #2). requestPasswordReset returns 404 while the portal is off (branch login/actions.ts:78-82). A staff email gets 'Check your email' and no email ever arrives (G1A-V03). A partner who is locked out sees 'Too many failed attempts. Try again in 15 minutes.' and has no other option. PUBLIC-015 asked for Forgot password, and the branch built it, but only for contractors.
- **Why:** Stripe and Amazon put 'Forgot password?' beside the password label for everyone. With two partners and no admin screen, a forgotten staff password today means someone running a script against production.
- **Change:** Let startPasswordReset handle User rows as well: PasswordResetToken gains a nullable userId, or gets a sibling table. Keep the same 30-minute single-use link and the same database rate limits. A reset signs out every other session (G2D-002). Show 'Forgot password?' whether or not PORTAL_ENABLED is on, and add a 'Reset your password' link to the lockout line.
- **Desktop, tablet, phone:** The same /login, /login/forgot and /login/reset screens at every width. Nothing new on screen except the link, which is already planned.
- **Reuse:** src/lib/portal/reset.ts, the /login/forgot and /login/reset pages, src/lib/email/send.ts and render.ts (f59e6ad).
- **Challenges:** Plan default #2: 'Forgot password applies to contractor accounts only. Staff logins stay managed by hand, as today.'
- **References:** 
  - [Mercury](https://mobbin.com/screens/02bea631-c4ff-4598-98c1-656423b06788): Reset Password on iPhone has one line of explanation, the email already filled and one 'Send Reset Link' button above the keyboard.
  - [Mercury](https://mobbin.com/screens/e3e39672-f30b-4f14-b6ac-8f9c736d70e5): The web login puts 'Forgot password?' directly under the password field for every account.
  - [Stripe](https://mobbin.com/screens/46b46f0f-6cb5-4f1e-85a3-bb0606894379): 'Forgot your password?' sits right of the Password label for every account type.
  - [Amazon](https://mobbin.com/flows/c679255d-06d9-40f6-8846-265862b18a3d): The sign-in step puts 'Forgot password?' beside the password label, next to a remembered account.
- **Code:** `branch: src/app/login/actions.ts:73-82`, `branch: src/app/login/page.tsx:57-63`, `branch: docs/asana-migration-plan.md:97`, `branch: prisma/schema.prisma:553-563`, `branch: src/app/login/actions.ts:78-82`, `branch: src/app/login/forgot/page.tsx:13-26`, `branch: src/app/login/page.tsx:24-27,57-63`, `branch: src/lib/portal/reset.ts:64-85`
- **Also found as:** G1A-V03 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** confirmed. Verified on the branch. reset.ts:17-21 says outright that a staff email gets the same answer and nothing is sent. requestPasswordReset 404s while the portal is off (actions.ts:78-82), and the 'Forgot password?' link renders only when portalEnabled (page.tsx:57-63). So with the portal on, a partner who uses the link is told to check an email that never comes, and with it off, the lockout line offers no way out. The conflict with plan default #2 is named. S effort holds for the reset itself; 'signs out every other session' depends on G2D-002.

### G2D-007

**Say on /login why someone is there: signed out, signed out after 30 days, or password changed**

Low · Fix · effort S · `/login after Sign out, after an ended session, and after a password change on another device` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /login shows only one notice, for ?notice=reset ('Password changed. Sign in with the new one.'). Staff Sign out (login/actions.ts:67-71) and the contractor's Sign out (p/actions.ts:8-12) both go to a bare /login. An ended session also redirects to bare /login (auth.ts:21).
- **Today:** /login looks the same on a fresh visit, after Sign out and after an ended session. The branch's AuthNotice (gold) already exists for ?notice=reset. Detecting an ended session (rather than a fresh visit) needs the hint cookie from G2D-008.
- **Why:** Square says 'You've signed out', and Tines and Revolut Business say what just happened. Without a line, an ended session looks like a glitch, and a deliberate sign-out gets no confirmation (house rule: close the loop).
- **Change:** Use the existing AuthNotice slot, in gold rather than the red AuthError, since nothing went wrong. Sign out goes to ?notice=signed-out: 'You're signed out.' An ended session, detected via the hint in G2D-008, goes to ?notice=ended: 'Signed out after 30 days away.' A session revoked by a password change goes to ?notice=password: 'Password changed. Sign in with the new one.' Drop the parameter from the URL after showing it (as PUBLIC-017 does for errors). Contractors' revoked line (G1A-038) uses the same slot.
- **Desktop, tablet, phone:** One line at every width. The longest line, about 40 characters at 12px, fits the 272px column at 320. Nothing drops on phone.
- **Reuse:** AuthNotice and AuthFrame in src/app/login/_components/auth-frame.tsx (f59e6ad).
- **References:** 
  - [Cal.com](https://mobbin.com/screens/a8397696-691d-4dcb-9268-8606cb32cce4): 'You've been logged out' with one line and one button back to the login page. Take the message, not the separate page or the check icon: HG puts it as one line on the form.
  - [Linear](https://mobbin.com/screens/3997d60f-bea7-4068-af79-3942a664072e): 'You used email to log in last time' is one muted line of context under the primary button on an otherwise plain login page. That's the weight an HG notice should have.
  - [Square](https://mobbin.com/screens/2ba8765b-76e9-42eb-874f-a27632d7a66f): 'You've signed out' with one 'Sign back in' button: confirm, then offer the way back.
  - [Tines](https://mobbin.com/screens/4efd3ee9-f445-4e8d-ac30-aaa771dc5d90): One line and one link. The lightest version of the same message.
  - [Revolut Business](https://mobbin.com/screens/0d6fe0a6-280e-4461-b1e1-bc7efc9f4ec9): 'You've been logged out' with the reason (inactivity): name why it happened.
- **Code:** `src/app/login/actions.ts:45-49`, `src/lib/auth.ts:19-22`, `branch: src/app/login/page.tsx:24-30`, `branch: src/app/login/actions.ts:67-71`, `branch: src/app/(portal)/p/actions.ts:8-12`, `branch: src/lib/portal/session.ts:110-119`, `branch: src/app/login/page.tsx:19,24-30`
- **Also found as:** G1A-038 (Contractor loop before the Oct 29 invites: sign-in, first password, My jobs, job page, emails, Approve)
- **Verification:** partly. Confirmed that today's /login shows no notice after sign-out or an ended session (login/page.tsx has only ?error). Medium is too high, though. Stripe and Linear both land a deliberate sign-out on a plain sign-in page, so the gap is mainly the ended-session case, which G2D-001 and G2D-003 mostly remove. Copy caveat: 'Signed out after 30 days away.' is only true once G2D-003 lands. Under today's fixed TTL it's 30 days after sign-in. The branch's existing reset line, 'Password changed. Sign in with the new one.', is about 44 characters, and inside AuthNotice's padding at 320px it likely wraps. Square 2ba8765b and Tines 4efd3ee9 came back exactly in my search.

### G2D-008

**Send a partner whose session lapsed from / to sign-in, not to the marketing page**

Low · Fix · effort S · `/ (hgcapitalpartners.com root) for a partner whose session has lapsed` · A quiet shell with real search, navigation and sign-in

- **Today:** With no session cookie, / shows the marketing page; with an invalid cookie still present, it redirects to /login. Because the cookie expires together with the token, a partner whose session simply lapsed always gets the marketing page and has to use the quiet 'HG Login' link.
- **Why:** Returning users of Linear, Vercel and Canva go straight back to sign-in. A partner shouldn't have to hunt for the door on their own company's marketing page.
- **Change:** At sign-in, also set a long-lived hint cookie with nothing sensitive in it (hg_returning=staff, one year), cleared only by a deliberate Sign out. In proxy.ts, a request with no valid session but the hint goes to /login?notice=ended (G2D-007). A request with neither rewrites to /welcome as today. G2D-011 reads the same hint. For the D10 installed app (MOBILE-036), point the manifest's start_url at an app route so it always opens the app or /login.
- **Desktop, tablet, phone:** No visual change at any size. The phone gains the most: the home-screen icon stops opening the marketing page.
- **Reuse:** src/proxy.ts and the notice line from G2D-007.
- **References:** 
  - [Mercury](https://mobbin.com/flows/575d2687-46a9-46b7-86be-4b7c23d0bf60): The Logging in flow opens on 'Welcome back', not a marketing screen. The returning person goes straight to sign-in and lands on Home.
  - [Mercury](https://mobbin.com/screens/44250421-2107-4c90-9915-89f4c939649d): 'Welcome back' with the email filled and a Face ID mark in the field. The phone version of recognizing a returning partner.
  - [Semrush](https://mobbin.com/screens/a43f46b1-f63b-41de-9c57-2b85957a7f45): 'Jump back in!': a returning person is recognized and taken straight to sign-in, not the marketing page.
  - [Google TV](https://mobbin.com/screens/e305b671-cc26-488f-b6a6-6f793096525a): On iOS, the remembered account sits in a bottom sheet with one Sign in button. The phone version of 'we know you'.
- **Code:** `src/proxy.ts:15-24`, `src/app/login/actions.ts:10-16`
- **Verification:** partly. Reproduced with curl. With no cookie, / returns 200 and the marketing page. With a present but invalid cookie, / returns 307 to /login. The inconsistency is real but narrow. The cookie's Max-Age equals the token's life, so the browser drops it at expiry, and the invalid-cookie branch only occurs after a secret change or a cleared hash. In practice a lapsed partner always gets the marketing page, one click from 'HG Login'. There's no web manifest today (/manifest.webmanifest returns 404), so the home-screen icon case only exists once MOBILE-036 does. With G2D-003, a lapse needs 30 days away, which makes this rare. The hint cookie is cheap and also serves G2D-011, so it's fine as low.

### G2D-009

**Offer partners Face ID passkeys through iOS autofill on /login, with no new buttons on phone**

Low · New capability · effort M · `/login (shared with contractors from Oct 29), the sign-in dialog (G2D-001), Settings Account` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. Password is still the only way in. The email field is autocomplete='username' (measured on :3300: 'email:username', 'password:current-password'), and there's no WebAuthn code on the branch. Contractors now share this /login (D14), and it shows 'Forgot password?' when PORTAL_ENABLED is on.
- **Today:** A password is the only way to sign in. The email field uses autocomplete='username' (src/app/login/page.tsx:41), and there is no WebAuthn code anywhere. From Oct 29 contractors share /login, so any extra button there is chrome every contractor sees.
- **Why:** Stripe, Vercel, Linear, Mercury, Amazon and Shop all offer passkeys. On iPhone a passkey is one Face ID glance with nothing to type, it can't be phished, and it turns the G2D-001 dialog into one tap. To be honest about the gain: iCloud Keychain already fills saved passwords behind Face ID. The real wins are no password to manage or rotate, and an easy first sign-in on a new device. Do this after G2D-002 and G2D-003, not before.
- **Change:** Passkeys row on the Account page. 'Add passkey' runs navigator.credentials.create (Face ID or Touch ID), and each passkey is listed with its device and date, plus Remove. On /login, set the email field to autocomplete='username webauthn' and start a conditional-mediation request on load. iOS Safari then offers 'Passkey for hgcapitalpartners.com' in the keyboard bar, and a contractor with no passkey sees nothing new. On desktop add one quiet 'Sign in with passkey' link under the form, as Stripe does. Server side: @simplewebauthn/server (a new dependency that needs approval) and a Passkey table (credential id, public key, counter, transports, name, last used). The passkey domain (RP ID) is hgcapitalpartners.com, so the vercel.app alias and the second domain must redirect to it first (G1E-007, G1E-023). No separate two-step setup.
- **Desktop, tablet, phone:** Phone 375: only the autofill bar, nothing else on screen. Tablet 768: the same autofill. Desktop 1280: the quiet link, using Touch ID or a QR code to the phone. In the Account page, the Passkeys row works at every size.
- **Reuse:** AuthFrame and its field styles (f59e6ad), Account rows (G2D-005), the sign-in dialog (G2D-001).
- **References:** 
  - [Mercury](https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7): 'Continue with passkey' sits as one secondary button under the password form, with one sentence: one click, your face, or your fingerprint. The desktop treatment from a tier-1 app.
  - [Linear](https://mobbin.com/screens/3997d60f-bea7-4068-af79-3942a664072e): 'Log in with passkey' is one quiet secondary button among the sign-in options, not a feature banner.
  - [Vercel](https://mobbin.com/screens/e839e5dd-ca34-4876-863e-f816ff2757d8): 'Continue with Passkey' as one secondary option on a plain login page.
  - [Stripe](https://mobbin.com/screens/46b46f0f-6cb5-4f1e-85a3-bb0606894379): 'Sign in with passkey' as a quiet text link under the main button. The desktop treatment.
  - [PayPal](https://mobbin.com/screens/aac8b496-1568-4ece-bb18-578ef25d7e99): On iOS, 'Log In with Face ID' for a remembered account, with 'Try another way' as the fallback.
  - [Amazon](https://mobbin.com/flows/c679255d-06d9-40f6-8846-265862b18a3d): Adding a passkey from Login & Security ends on a list showing device and set-up date, with edit and remove.
- **Code:** `src/app/login/page.tsx:36-60`, `branch: src/app/login/page.tsx:33-51`
- **Verification:** partly. Confirmed: there's no WebAuthn code, and the email field uses autocomplete='username'. Conditional mediation with 'username webauthn' is the right technique and adds nothing visible on phone. But the finding itself admits iCloud Keychain already fills the password behind Face ID. For two partners the gain is small, and the cost is real: a new dependency that needs approval, a Passkey table, and an RP-ID that forces the alias domains to redirect first. That's low, and it belongs after G2D-003, G2D-002 and G2D-004. Stripe's 'Sign in with passkey' quiet link showed up in my Stripe searches (other screen ids), so the cited reference is plausible.

### G2D-011

**Show a signed-in partner 'Open app' in the public header, and keep the brand link on the public home**

Low · Design change · effort S · `Public header on /welcome, /rentals, /residents while a partner is signed in` · A quiet shell with real search, navigation and sign-in

- **Today:** Signed in, /welcome and /rentals still show 'HG Login'. Clicking it silently redirects to the dashboard. The 'HG Capital Partners' brand link also lands on the dashboard, because proxy.ts:18 sends any request to / that carries a session cookie into the app. So a partner checking a listing on /rentals has no link back to the public home. src/components/public/header.tsx:34-39 is static.
- **Why:** The label describes the wrong action, and the public home becomes unreachable while signed in. It's the seam between the two surfaces, and a well-run product makes that seam invisible.
- **Change:** Add a tiny client component inside PublicHeader that reads the hg_returning hint (G2D-008). With the staff hint, the last link reads 'Open app' (to /) and the brand links to /welcome. With the contractor hint it reads 'My jobs' (to /p). Otherwise nothing changes ('Sign in' per COPY-062). The public pages stay static because they read a hint cookie, not the session.
- **Desktop, tablet, phone:** Same slot at every width. On phone 'Open app' is shorter than 'HG Login', which helps PUBLIC-021's wrapping header.
- **Reuse:** PublicHeader in src/components/public/header.tsx; the hint cookie from G2D-008.
- **References:** 
  - [Square](https://mobbin.com/screens/2ba8765b-76e9-42eb-874f-a27632d7a66f): After sign-out the public header's last plain-text item reads 'Sign in': the account link follows the visitor's state. No Mobbin screen returned the signed-in marketing header itself, so 'Open app' is our own extension of this slot.
- **Code:** `src/components/public/header.tsx:14-43`, `src/proxy.ts:17-20`
- **Verification:** confirmed. Reproduced while signed in: on /rentals, both the 'HG Capital Partners' brand and 'HG Login' land on / with the title 'HG Capital OS' (the dashboard). /welcome still loads if typed in, but no link reaches it. The Square reference is weak (it shows a signed-out header), and the finding says so. If a client component reads the hint cookie after hydration, 'HG Login' will flash before it changes to 'Open app'. Read the cookie on the server, or accept the flash.

### G2D-012

**List signed-in devices with 'This device' and 'Sign out other devices'**

Low · New capability · effort M · `Settings Account: Devices` · A quiet shell with real search, navigation and sign-in

- **Today:** A partner can't see or end their other sessions, and nothing records them: there are no staff session rows and no staff SecurityEvent rows. Contractors already get 'Sign out everywhere' on the Portal access card (plan §5.1).
- **Why:** Linear, Sketch and Mercury list sessions with the current one marked and a single 'sign out the rest'. That's the remedy for a lost phone or a laptop left signed in at a property.
- **Change:** The Devices row opens a list. Each live session reads like 'Safari on iPhone' (from the user agent) with 'Active today' or 'Last active Oct 12'. The current one is tagged 'This device'. Every other row has a trailing Sign out, and one 'Sign out other devices' sits at the foot. Newest first; expired and revoked rows are hidden. No IP addresses or locations: for two partners in Buffalo they're noise. Needs G2D-002.
- **Desktop, tablet, phone:** Desktop 1280: an inline list on the Account page. Tablet 768: the same. Phone 375: a pushed screen with full-width rows and the Sign out text button always shown, since touch has no hover. Nothing drops.
- **Reuse:** PortalSession's userAgent and lastUsedAt, revokePortalSessions({except}) in src/lib/portal/accounts.ts, and the 'Sign out everywhere' wording from the Portal access card (f59e6ad).
- **Challenges:** Plan §5.2 puts staff 'sign out everywhere' in week 2. That's fine for the list itself, but it depends on G2D-002, which should land earlier.
- **References:** 
  - [Wise](https://mobbin.com/screens/95f7ef8e-6705-4d29-8e91-b1edae9c1332): Devices lists 'Safari, Mac OS X / This device' first and other browsers below, each a plain row with a chevron. No table.
  - [Wise](https://mobbin.com/screens/8752e38f-5eee-4880-8238-4626d0e99b01): Device detail shows First logged in, Last logged in and one red 'Remove device'. Enough to recognize a device without IP tables.
  - [Clerk](https://mobbin.com/screens/61aac998-5469-42c3-853b-efccc8de4094): Active devices on the Security page, with a 'This device' tag on the current session.
  - [Linear](https://mobbin.com/screens/13e6c6f5-0ec6-49d8-83e4-921de2120ae1): 'Chrome on macOS · Current session' on top, '1 other session' with 'Revoke all', and 'Last seen' on each row.
  - [Sketch](https://mobbin.com/screens/ffae9272-da77-465d-9537-20895031667c): Signed In Devices: a Current badge, a Sign Out per row, and Sign Out of All.
  - [Mercury](https://mobbin.com/screens/60d9ab3c-a4d3-46f1-8799-a913ddcaafa7): On iOS, 'Sessions and devices' sits under Security as chevron rows with counts.
- **Code:** `branch: prisma/schema.prisma:539-551`, `branch: docs/asana-migration-plan.md:189-196`
- **Verification:** partly. The observation holds (no staff session rows, no staff SecurityEvents), and Linear 13e6c6f5 is an exact match. But the list depends entirely on G2D-002 and overlaps with two other remedies here: a password change that signs out other devices (G2D-004) and G2D-017. For two partners in one city, the lost-phone fix is a single 'Sign out other devices' action with a count. A per-device list is nice to have, so it's low. If it's built, keep the 'Safari on iPhone' and last-active label without IPs, as proposed.

### G2D-013

**Make Sign out work on a weak connection instead of showing 'This page couldn't load'**

Low · Fix · effort S · `Sidebar and drawer Sign out (every signed-in page), over a weak connection` · A quiet shell with real search, navigation and sign-in

- **Today:** Sign out is a server action form in the (app) layout, above (app)/error.tsx, and there's no global-error.tsx. When its request fails, the whole app is replaced by Next's default 'This page couldn't load' screen and the session stays active.
- **Why:** Sign out from a job site with one bar of signal shouldn't produce an error screen. Without a pending state, a double tap gives no feedback either. Patreon, Sprig and ElevenLabs go straight from the menu item to their sign-in page.
- **Change:** Make Sign out a plain form POST to a route handler (POST /logout) that answers 303 to /login?notice=signed-out (G2D-007). It then behaves like a link, works without JavaScript, and a dropped connection gets the browser's normal offline handling instead of the app's error page. Show 'Signing out…' and disable the control on tap.
- **Desktop, tablet, phone:** Same at every width. On phone it's the last row of Account (G2D-005); on desktop it's an item in the account menu (SHELL-028).
- **Reuse:** The existing Sign out form in app-shell.tsx; a route handler beside src/app/login.
- **References:** 
  - [Linear Mobile](https://mobbin.com/flows/fa2edc2a-89be-4b04-ae14-fedc1a43b177): Log out ends straight on the welcome screen, with no intermediate state or error page.
  - [Mercury](https://mobbin.com/flows/a2e8f634-ecdb-48a0-ac0b-e24a3e4f1216): Log Out, the last row of Settings, goes to the Welcome back sign-in in two screens.
  - [Patreon](https://mobbin.com/flows/93ef41de-13f1-497c-81b1-7a637c849ccf): 'Log out' from the account menu goes straight to the sign-in page in two screens, with no intermediate state.
  - [Sprig](https://mobbin.com/flows/22c28a7e-7d33-4ff6-b5ef-b38949f886ea): Account menu with name and email, then 'Log Out', then 'Welcome back!' sign-in. The whole lifecycle in two steps.
- **Code:** `src/components/app-shell.tsx:177-181`
- **Verification:** partly. Reproduced at 375. Aborting the sign-out POST replaced the whole app with Next's unstyled 'This page couldn't load / Reload / Back', the console showed 'TypeError: Failed to fetch', and the session stayed (verify-G2D/signout--after-signout--mobile-light.png). The recommended fix is weak, though. A native POST to a /logout route handler trades this screen for the browser's own offline page, which is no better. Keep the server action instead. Run it in a transition with a disabled 'Signing out…' state, catch the network failure, and show 'Couldn't sign out. Check your connection.' in place, so the app stays on screen. Also add a branded src/app/global-error.tsx so any failure in the shell avoids Next's default. The Patreon and Sprig flows show a normal sign-out, not failure handling, so they don't back this fix.

### G2D-014

**Fix the planned signing-key split so it doesn't sign both partners out mid-work**

Low · Fix · effort S · `Every signed-in page on the deploy that ships the plan's signing-key split` · Every save is safe, instant and undoable

- **Today:** Staff sessions and QuickBooks OAuth state share SESSION_SECRET today. The planned split only signs partners out if the staff key itself changes. Moving OAuth state to its own key and leaving staff sessions on SESSION_SECRET avoids that entirely.
- **Why:** An unannounced sign-out in the middle of work, caused by a deploy, is exactly the failure this unit is about.
- **Change:** Either land G2D-002 first (random database tokens don't use the signing key, so the split never touches staff sessions), or check tokens against both the new and old keys for 30 days and reissue on the next request.
- **Desktop, tablet, phone:** No UI.
- **Reuse:** readSessionToken in src/lib/session-token.ts.
- **Code:** `src/lib/session.ts:15-22`, `src/lib/session-token.ts:38-48`, `branch: docs/asana-migration-plan.md:213-216`
- **Verification:** partly. Plan §5.1 does list 'separate signing keys per purpose (staff session, OAuth state)' and the split hasn't been built yet. Today both staff sessions and QuickBooks OAuth state use SESSION_SECRET (session.ts:16-21, quickbooks/oauth.ts:12). Whether partners get signed out depends on how the split is done. The simplest version, a new key for OAuth state with staff left on SESSION_SECRET, invalidates nothing and isn't among the finding's two options. Only a new or derived staff key signs both partners out, and that happens once.

### G2D-015

**Ask for Face ID or the password again before the few actions that hand out or remove access**

Low · New capability · effort S · `Portal access card on /contractors/[id] (branch), Account password and passkeys, Financials Disconnect` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. The Portal access card now exists on /contractors/[id]. It offers Create login (which shows the starting password once with Copy), Text login details, Reset password, Sign out everywhere and Remove access. Each action checks only requireUser() on the current session (contractors/actions.ts:20-60), with no recent-auth step.
- **Today:** The planned Portal access card shows a generated starting password once and offers Text login details, Reset password, Sign out everywhere and Remove access (plan §5.1). Financials Settings has Disconnect and 'Delete everything' (FEEL-043). All of these run on the current session alone. With sliding sessions (G2D-003), that session can be weeks old on an unlocked phone.
- **Why:** Stripe asks for a verification code before a password change, and X asks for the password before managing passkeys. Asking again only for actions that grant or remove access keeps the guard without any daily friction.
- **Change:** Add a requireRecentAuth(10 minutes) check on: revealing or resetting a contractor's password, Text login details, Sign out everywhere for any account, changing your own password, adding or removing a passkey, and Disconnect QuickBooks. If the last check is stale, open the G2D-001 dialog titled 'Confirm it's you' (Face ID first, password as the fallback), then continue the action. Nothing else asks.
- **Desktop, tablet, phone:** Desktop and tablet: the same dialog as G2D-001. Phone: a bottom sheet with the Face ID button first.
- **Reuse:** The G2D-001 dialog; an authAt column on the session row (G2D-002).
- **References:** 
  - [Mercury](https://mobbin.com/screens/2bfa103f-09d3-4de8-a223-df2c58ebba5a): 'We need to verify your identity before continuing' over the Security page, with Use Touch ID first and a fallback link. Step-up asked only at the security step.
  - [Clerk](https://mobbin.com/screens/3da6c303-c33a-4d22-9d2d-f52ef2a77039): 'Verification required: enter your current password to continue' over the Security page, with 'Use another method' below.
  - [Airbnb](https://mobbin.com/screens/71a20b61-9538-4060-a4cb-fcf93bf9cb98): 'Confirm account' opens over the Privacy page before a sensitive request, and the page stays in place behind it.
  - [Stripe](https://mobbin.com/screens/eb7a345d-982a-461c-85e1-211d3f5b0398): 'Verification required' before saving profile security changes, over the page being edited.
  - [X](https://mobbin.com/flows/fc6af5b9-a914-4915-adb9-a648754b28bd): 'Enter your password… to confirm it's really you' before managing passkeys. Asking only at the security step.
- **Code:** `branch: docs/asana-migration-plan.md:189-196`, `src/lib/auth.ts:19-22`, `branch: src/app/(app)/contractors/actions.ts:20-60`, `branch: src/app/(app)/contractors/[id]/portal-access-card.tsx:24,65-137,236-241`
- **Verification:** partly. The idea fits the bar when it's kept to a few actions, and Clerk https://mobbin.com/screens/cbb6ae43-3e3d-45b1-93f5-79067a20d5b0 shows the same 'Verification required' prompt over a security page. Trim the list, though. Changing your own password already asks for the current password, so a second check is double friction. The plan shows a contractor's starting password once at creation, so there's no later 'reveal' to guard. And 'Text login details' right after creating a login uses a password generated in that same session, so prompting there would slow down the current push to onboard contractors. Keep it for Reset password, Sign out everywhere, passkey add or remove, and Disconnect QuickBooks.

### G2D-016

**Email a partner when their account signs in on a new device or the password changes**

Low · New capability · effort S · `Email to a partner (new sign-in, password changed, passkey added)` · A quiet shell with real search, navigation and sign-in

- **Today:** Nothing tells a partner about a sign-in or a password change. SecurityEvent records contractor events only, and the staff sign-in path writes nothing. Resend and a one-button email template already exist on the branch (src/lib/email/send.ts, render.ts).
- **Why:** With password-only sign-in and no two-step, an email on a new device is the cheapest way to notice a stolen password. Mercury keeps a log of every sign-in by source. It also closes the loop on a password change.
- **Change:** Send one plain email to the partner on: a sign-in from a device (user agent) not seen in 90 days, a password change, and a passkey added. The email says what happened, when, and on which device, with one 'Review devices' button that opens the Devices list (G2D-012). Staff accounts only. That's a few emails a month, well inside D30's budget.
- **Desktop, tablet, phone:** Email layout from render.ts, with the phone viewport fix from G1A-V05.
- **Reuse:** src/lib/email/render.ts and send.ts, SecurityEvent (f59e6ad).
- **Challenges:** D19/D20 limit email to the staff/contractor line. This is a security email to a partner about their own account, so it's a deliberate exception.
- **References:** 
  - [Mercury](https://mobbin.com/screens/f1e6ca40-6513-44fa-99bb-b27b56f41371): Company Security shows log-ins with time, member and source (browser and OS). The events worth telling a person about.
- **Code:** `branch: src/app/login/actions.ts:48-56`, `branch: prisma/schema.prisma:565-591`
- **Verification:** confirmed. Confirmed. The staff sign-in path on the branch logs nothing, and render.ts and send.ts exist. The Mercury reference shows a sign-in log, not a security email, so it's weak backing for the email. Key 'new device' on browser family plus OS, not the raw user agent. Otherwise every browser update counts as a new device and the emails turn into noise. The D19/D20 exception is named.

### G2D-I01

**Re-check the session on Back and blur the page behind the sign-in sheet, so an ended session shows no data**

Low · Fix · effort S · `App shell after a session ends (Back and history on every signed-in page), and the planned G2D-001 sign-in sheet` · A quiet shell with real search, navigation and sign-in

- **Today:** I reproduced the case where a session ends while the tab is open. With the cookie cleared, a nav click lands on /login. Back then restores 767 Prospect from Next's in-memory cache with zero requests: Value, Purchase price, the CapEx table and the Loan card. A reload goes to /login. Every page Back shows is one this tab had already loaded. The real Sign out is probably not affected. Deleting a cookie in a server action sets x-action-revalidated (node_modules/next/dist/server/app-render/action-handler.js:117-120), and the client then calls invalidateBfCache (client/components/router-reducer/reducers/server-action-reducer.js:218-221), so Back refetches and gets redirected. The reviewer's sign-out simulation answered with a ';replace' redirect, but redirect() in a Server Action defaults to push, so neither test exercised the real Sign out. The session today is a signed email with no server row, so revoking a lost phone isn't possible yet; that case waits on G2D-002 and G2D-012. Cache-Control: private, no-cache, no-store is confirmed on /deals.
- **Why:** When a session ends, the device should stop showing data. G2D-012's 'Sign out other devices' is meant for a lost phone, but that phone's open tab would still page back through deals, loans and lockbox codes. G2D-001 then puts its sheet over a page that is only dimmed, so the same numbers stay readable behind it. Mercury's Touch ID check and Employment Hero's prompt both wash out the page behind them.
- **Change:** (1) In app-shell.tsx, on popstate and on pageshow with persisted=true, run the same GET /api/session check G2D-001 runs on focus, and open the sign-in sheet if it returns 401. (2) Put that sheet over a frosted layer, about a 16px backdrop blur plus the surface color at 80%, so nothing behind it can be read. Keep the unsaved draft in memory rather than on screen; it comes back and replays after sign-in. (3) Sign out, and any revocation of this device, should end in window.location.replace('/login?notice=signed-out'). That throws the document away, so no app page is one Back press away. G2D-013's POST /logout route does this if it answers 303 and the router doesn't intercept the form. (4) Keep the 'Cache-Control: private, no-cache, no-store' header app routes send today. When MOBILE-036 adds a service worker, clear its caches on sign-out.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the 400px dialog over the blurred page. Phone 375: the bottom sheet over the blurred page, with the field above the keyboard. Nothing drops. While the session is live, the check is invisible.
- **Reuse:** G2D-001's signed-out handler and session check; the Dialog shell from docs/components.md Known gaps (React Aria Modal, approved) with a blur overlay variant; listeners in src/components/app-shell.tsx; G2D-013's /logout route handler.
- **Challenges:** G2D-001 says the sheet opens over the dimmed screen. This asks for a blur instead, because the same sheet is what a revoked or lost device shows.
- **References:** 
  - [Mercury](https://mobbin.com/screens/2bfa103f-09d3-4de8-a223-df2c58ebba5a): The identity check sits over a washed-out, blurred Security page. Nothing behind the prompt can be read.
  - [Employment Hero](https://mobbin.com/screens/80a62519-da66-4bc6-b988-92bbf392b408): The prompt G2D-001 already copies blurs the whole page behind 'Hi Jane, are you still there?', not just dims it.
- **Code:** `inspire-g2d-tools/back-after-signout.mjs (GET-only test; requestsOnBack was [] on mobile)`, `src/components/app-shell.tsx:177`, `src/app/login/actions.ts:45-48`, `curl -D - /deals: Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
- **Verification:** partly. Real but low. Back only re-shows pages this tab had already rendered, and whoever holds the phone can already see the current page. The finding bundles four changes. Keep (1), the popstate/pageshow check, folded into G2D-001's focus check. Keep (2), the blur: Mercury's Touch ID modal (2bfa103f, verified) does wash out the page behind it. Drop (3): the real Sign out already invalidates the router cache. The blur is a design change, so kind should be design, not fix. Medium is overstated. Evidence: verify-G2D/expire-back--3-after-back--desktop.png (script: scratchpad/verify-g2d-tools/expire-back.mjs, backReqs [] and afterReload /login).

### G2D-I02

**Count failed sign-ins per device, so a stranger can't lock a partner out by typing their email**

Low · Fix · effort S · `/login (staff today; staff and contractors on the branch)` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. Branch /login checks and records one in-memory throttle keyed by email for staff and contractor sign-ins alike (login/actions.ts:35-46), and login-throttle.ts is identical to main. The contractor's change-password form counts against the same key (portal/accounts.ts:268-274). A completed contractor password reset clears it (portal/reset.ts:170), but only on the instance that serves the reset. Staff have no reset at all (plan Defaults #2; startPasswordReset looks up portalAccount only).
- **Today:** The code reading is right. LoginThrottle keys only by the lowercased email (src/lib/login-throttle.ts:39-41). The lock is checked before the password (src/app/login/actions.ts:27-28), so the right password is refused while locked. On the branch, staff and contractor sign-ins share one throttle (branch actions.ts:35-39). But the throttle lives in memory per process (login-throttle.ts:6-10), so on Vercel a lock set on one instance doesn't block a request served by another. The lockout attack works only some of the time, and the attacker has to send 5 failures every 15 minutes to keep it up.
- **Why:** Anyone who knows a partner's address can keep that partner out from any device for as long as they keep retrying, once every 15 minutes. From Oct 29, 29 contractors use the same door and get texts and emails from the partners. A lock meant to stop guessing shouldn't also stop the owner on his own phone.
- **Change:** Keep the five-in-15-minutes rule, but key it by email plus device. At each successful sign-in, set a long-lived signed device cookie; G2D-008's hint cookie can carry it. Failures from a device that has signed in to that account before count only against that device. Failures from unknown devices share one bucket per email and also count per IP. A locked unknown device never blocks a known one. Passkey sign-in (G2D-009) and a reset link (G2D-010) always skip the lock. No copy changes.
- **Desktop, tablet, phone:** No UI at any size.
- **Reuse:** LoginThrottle in src/lib/login-throttle.ts (change the key), the hint cookie from G2D-008, and the branch's rate-limit helpers in src/lib/portal/limits.ts if the counters move to a table.
- **Code:** `src/lib/login-throttle.ts:1-12, 39-41, 43-50, 60`, `src/app/login/actions.ts:24-37`, `branch: src/app/login/actions.ts:35-45`, `branch src/app/login/actions.ts:35-46`, `branch src/lib/login-throttle.ts (same as main)`, `branch src/lib/portal/accounts.ts:241-247, 268-274`, `branch src/lib/portal/reset.ts:40-75, 170`, `asana-migration-plan.md Defaults #2`
- **Verification:** partly. Keying by device plus email is the standard fix and worth doing once the counters move to a table. 'A reset link always skips the lock' assumes staff resets (G2D-010). The approved spec's default 2 says Forgot password covers contractors only and staff logins stay managed by hand (asana-migration-plan.md:97), so conflicts_with should name it. The branch already clears the throttle after a contractor reset (branch src/lib/portal/reset.ts:170). With a signed device cookie plus a per-IP bucket, effort is closer to M than S. For a two-partner door this is low, not medium.

### G2D-I03

**Greet a returning partner on /login with the email already filled, so signing in takes one field**

Low · Design change · effort S · `/login for a partner who has signed in on this device before` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. Branch /login (page.tsx:32-55) is the same empty Email and Password form on every visit, now the shared door for contractors too. Portal sessions also last 30 days (portal/limits.ts PORTAL_SESSION_TTL_MS). The tip adds only a hidden 'next' input for contractors.
- **Today:** /login looks the same on every visit (src/app/login/page.tsx:37-55), but the email is rarely typed. The fields already carry autocomplete='username' and 'current-password', so iCloud Keychain fills both after one Face ID or Touch ID confirmation. Sessions end a fixed 30 days after sign-in (src/lib/session.ts:13), so each partner sees /login about once a month per device. The Mercury 'Welcome back' reference (44250421, verified) is Mercury's native iOS app, which keeps the email inside the app. It isn't a web sign-in page.
- **Why:** Typing the email is the slow part on a phone, and it's the same email every time. Mercury's iPhone app opens on 'Welcome back' with the email filled and a Face ID mark in the field. Clerk's password step shows the email as text with an edit pencil, and Linear names the method you used last time. Each turns a two-field form into one decision.
- **Change:** On a successful sign-in, remember the email and first name on that device in a one-year cookie, next to G2D-008's hint. /login then shows 'Welcome back, Connor' as its heading and the email as one line of text with a 'Not you?' link, and focuses Password. A hidden email input with autocomplete='username' keeps Keychain matching. The password field takes autocomplete='current-password webauthn' so G2D-009's Face ID offer still appears. 'Not you?' clears the memory and shows the normal empty form. A deliberate Sign out keeps the email, as Mercury does; only 'Not you?' forgets it. Contractors get the same thing, since /login is the shared door.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the same 320px column with the heading, one email line and one field. Phone 375: same. At 320 the email line truncates in the middle and 'Not you?' stays visible; Password sits above the keyboard. Nothing drops.
- **Reuse:** AuthFrame's title slot and fields on the branch (src/app/login/_components/auth-frame.tsx), the G2D-008 hint cookie, and G2D-009's conditional mediation.
- **Challenges:** G2D-008 says the hint cookie holds nothing sensitive (hg_returning=staff) and is cleared by a deliberate Sign out. This stores the email on the device and keeps it after Sign out; only 'Not you?' clears it.
- **References:** 
  - [Mercury](https://mobbin.com/screens/44250421-2107-4c90-9915-89f4c939649d): 'Welcome back' with the email filled and a Face ID mark in the field. Only the password is left.
  - [Clerk](https://mobbin.com/screens/fc191028-fa19-4684-9cda-24eeca7de19e): The password step shows the account's email as plain text with an edit pencil, plus one Password field with Forgot password? beside its label.
  - [Linear](https://mobbin.com/screens/3997d60f-bea7-4068-af79-3942a664072e): 'You used email to log in last time' under the primary button. The device remembers how you sign in.
- **Code:** `src/app/login/page.tsx:37-55`, `branch src/app/login/page.tsx:32-55`, `branch src/lib/portal/limits.ts:7`
- **Verification:** partly. The gain is small for the state it adds: a one-year email cookie, a hidden username input and a 'Not you?' path. Keeping the email after a deliberate Sign out is the wrong default on a door that contractors share, since a crew phone can be shared. If this is built, follow G2D-008 and forget the email on Sign out. Zillow's web sign-in shows the email with Edit (92e743ec), but only within a single sign-in, not across sessions. The Clerk and Linear references were not re-run.

### G2D-I04

**Offer Face ID once, right after a password sign-in on a partner's device**

Low · New capability · effort S · `Home, right after a password sign-in on a partner's iPhone or Mac` · A quiet shell with real search, navigation and sign-in

- **Today:** Confirmed: there's no WebAuthn or passkey code anywhere in src/. But on iPhone and Mac, a password saved in Keychain already signs in with one Face ID or Touch ID confirmation, so 'No password to type' overstates what the partners gain. Mercury's prompt (3a417314, verified) is a full interstitial page between sign-in and the app, not a dialog over Home, and it says 'passkeys', not Face ID.
- **Why:** Right after someone has typed a password on a phone is when 'skip this next time' lands. Mercury, Gusto and Shopify each ask once after sign-in, with a clear Not now, instead of waiting for people to find a settings row. Face ID also makes G2D-001's sheet one glance.
- **Change:** Staff only. After a password sign-in, check whether the browser has a built-in authenticator (isUserVerifyingPlatformAuthenticatorAvailable) and this user has no passkey on this device. If so, open one small dialog over Home. Heading: 'Sign in with Face ID next time' ('Touch ID' on a Mac). One line: 'Your iPhone confirms it's you. No password to type.' Primary 'Use Face ID', secondary 'Not now'. The device remembers Not now for 90 days. On success, a toast: 'Face ID is on for this iPhone.' Contractors never see it, and /login doesn't change.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a 400px dialog over Home. Phone 375: a bottom sheet with both buttons pinned. It never appears on devices without a built-in authenticator.
- **Reuse:** G2D-009's registration endpoint and Passkey table, the Dialog shell (docs/components.md Known gaps), and Toast (Known gaps, FEEL-009).
- **Challenges:** G2D-009 keeps passkeys to autofill with no new buttons. This adds one staff-only prompt after sign-in; /login and the contractor experience don't change.
- **References:** 
  - [Mercury](https://mobbin.com/screens/3a417314-076e-4bbf-9971-8899bc4322e9): 'Log in faster with passkeys' after sign-in, with Add Passkey and Not Now and three short benefit lines. Take the one-time ask and Not now; skip the benefit list.
  - [Gusto](https://mobbin.com/screens/cf953e0b-dcfc-4e23-9d0e-6ab06f837475): 'Add a passkey to this device' in one sentence, with Continue and Remind me later, scoped to the device in hand.
  - [Shopify](https://mobbin.com/screens/6b33a1d7-f744-4a37-8717-a16a0996cddf): 'Faster, safer login' as one small card with Add passkey and Not now, between sign-in and the admin.
- **Code:** `src/app/login/actions.ts:18-43 (password only; no WebAuthn anywhere in src/)`
- **Verification:** partly. This depends on G2D-009, which isn't built. One ask after sign-in with Not now is a fair pattern, but it interrupts a two-person app that signs in about monthly per device, and a Settings row may be enough. If it's built, keep the word 'passkey' in the copy (see I07), and consider Mercury's one-page interstitial over a dialog on top of Home.

### G2D-I05

**Build the in-app sign-in sheet from app primitives, not the public sign-in page's styles**

Low · Design change · effort S · `The planned G2D-001 sign-in sheet and G2D-015 'Confirm it's you' dialog` · A quiet shell with real search, navigation and sign-in

- **Today:** The branch's AuthFrame styles are as described: a white/15 border on a 3% white fill, a gold focus border, an off-white pill button that turns gold on hover, and a coral AuthError (branch src/app/login/_components/auth-frame.tsx:44-58). No app page uses them yet. The G2D-001 sheet is only a proposal, so this corrects G2D-001's reuse line rather than a defect anyone can see today.
- **Why:** The sheet sits on top of the app, so it should look like the app. Mercury's verification modal and Todoist's confirm dialog use the same type, fields and buttons as the page behind them. A dark-and-gold form floating over a light zinc page reads as another product, at the moment trust matters most. The house rules give the public site and the app separate palettes.
- **Change:** Build the sheet with the app's Dialog shell, Field and Input from src/components/ui.tsx, and the blue primary button, in both themes. Share only logic and copy with /login: the sign-in action, the error strings and conditional mediation. Don't share the classes.
- **Desktop, tablet, phone:** Same as G2D-001: a 400px dialog on desktop and tablet, a bottom sheet on phone. It follows the app's light or dark theme.
- **Reuse:** Input (src/components/ui.tsx:134) and Field (:217), the Dialog shell from docs/components.md Known gaps, and the primary Button.
- **Challenges:** G2D-001's reuse line (field styles and AuthError from auth-frame.tsx).
- **References:** 
  - [Mercury](https://mobbin.com/screens/2bfa103f-09d3-4de8-a223-df2c58ebba5a): The Touch ID check uses the app's own modal, type and button over the Security page, not the marketing login's look.
  - [Todoist](https://mobbin.com/screens/e9526af4-b67d-4d1e-9cd7-8a04113744b9): 'Confirm your account' uses the same fields and buttons as the Settings page behind it.
  - [Clerk](https://mobbin.com/screens/3da6c303-c33a-4d22-9d2d-f52ef2a77039): 'Verification required' reuses the Account dialog's fields and primary button.
- **Code:** `branch: src/app/login/_components/auth-frame.tsx:22-30, 44-52, 54-58`
- **Verification:** partly. The right call under the two-palette house rule. Todoist's 'Confirm your account' (e9526af4, verified) reuses the Settings dialog's own fields and buttons over the page behind it. This should be folded into G2D-001 rather than kept as a separate item. It stays low until G2D-001 is built.

### G2D-I06

**Say why in the sign-in sheet when another device ended the session**

Low · Design change · effort S · `The planned G2D-001 sign-in sheet` · A quiet shell with real search, navigation and sign-in

- **Today:** G2D-001's sheet uses one heading for every cause: 'Hi Connor, sign in to keep working'. G2D-007 gives /login three reasons, but the sheet is what a partner will usually see. Today the app can't tell causes apart: the session is a signed email in a cookie, with no server row (src/lib/session.ts, src/lib/auth.ts).
- **Why:** A device signed out from Devices, or by a password change somewhere else, is a security signal; 30 days away is routine. Todoist's Confirm your account says why it's asking, and Mercury's check says it needs to verify before continuing. Naming the cause only when it matters keeps the routine case quiet.
- **Change:** Once sessions are rows (G2D-002), store a reason with each revocation. The sheet adds one muted line under its heading. Revoked from Devices: 'Signed out from another device.' Revoked by a password change: 'Your password changed on another device.' 30 days away: no line.
- **Desktop, tablet, phone:** One line at every width. The longest line is 40 characters and fits the 272px column at 320.
- **Reuse:** G2D-002's session table (add revokedReason), G2D-007's notice wording, and G2D-001's sheet.
- **References:** 
  - [Todoist](https://mobbin.com/screens/e9526af4-b67d-4d1e-9cd7-8a04113744b9): The confirm dialog opens with one sentence on why it can't continue, then the field.
  - [Mercury](https://mobbin.com/screens/2bfa103f-09d3-4de8-a223-df2c58ebba5a): 'We need to verify your identity before continuing.' One plain line of why above the action.
- **Code:** `src/lib/session.ts:1-23`, `src/lib/auth.ts:8-17`
- **Verification:** confirmed. Fine as a one-line copy detail, and it's right to stay silent for the routine 30-day case. It depends on G2D-002's session rows and G2D-001's sheet, so merge it into G2D-001. Todoist's dialog (e9526af4, verified) opens with one generic line of why, which supports a single line but not different copy per cause.

### G2D-I07

**Label the passkey row 'Face ID' and say in one line what it does**

Low · Design change · effort S · `Settings > Account, the passkey row (G2D-005)` · A quiet shell with real search, navigation and sign-in

- **Today:** It's true that Settings holds only CapEx rules, Move-in form and Storage (src/app/(app)/settings/layout.tsx:17-24) and that nothing in the app explains 'passkey'. But the references don't support renaming the row 'Face ID'. Zillow labels the row 'Passkeys' with the sublabel 'Sign in with your face or fingerprint.' (verified on https://mobbin.com/screens/0701574c-8651-40fa-a5e2-b97e65d60e74). Stripe's Link Settings lists 'Passkeys' and toasts 'Passkey added' (https://mobbin.com/screens/83efa286-dc48-4942-af93-e850877efc66). Mercury's web prompt reads 'Log in faster with passkeys' (3a417314). Mercury's 'Face ID' toggle (60d9ab3c, verified) is the native app's biometric unlock, which is a different mechanism.
- **Why:** Both partners know Face ID; 'passkey' is a word they'd have to look up. Mercury's iPhone app labels the toggle 'Face ID' and adds a sublabel saying you won't need your email or password. Zillow's Passkeys row reads 'Sign in with your face or fingerprint.' Mercury's web login explains it in one line under the button.
- **Change:** Label the row for the device in hand: 'Face ID' on iPhone and iPad, 'Touch ID' on a Mac, 'Passkey' elsewhere. Sublabel: 'Sign in without typing a password.' Value: 'On for iPhone and Mac', or 'Off' with 'Turn on'. Use the word 'passkey' only in the device detail and help text.
- **Desktop, tablet, phone:** The same row at every size. The sublabel is 34 characters and stays on one line at 320.
- **Reuse:** Account rows from G2D-005 (Field label and value in src/components/ui.tsx).
- **Challenges:** G2D-005 and G2D-009 name the row 'Passkeys'.
- **References:** 
  - [Mercury](https://mobbin.com/screens/60d9ab3c-a4d3-46f1-8799-a913ddcaafa7): Security labels the toggle 'Face ID', with the sublabel 'After enabling Face ID, you will not need your email or password to log in.'
  - [Zillow](https://mobbin.com/screens/55f13f74-c074-4462-8c6b-f958aa5e32f8): Sign in & Security's Passkeys row says 'Sign in with your face or fingerprint.' and has one Set up button.
  - [Mercury](https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7): Under 'Continue with passkey': 'Log in securely using one click, your face, or your fingerprint.'
- **Code:** `src/app/(app)/settings/layout.tsx:17-19`
- **Verification:** partly. Keep the row label 'Passkeys'. That's the word iOS and macOS use in their own save and sign-in sheets, so the app matches the prompt the partner sees. Add Zillow's one-line sublabel. 'On for iPhone and Mac' can't be known: an iCloud Keychain passkey is one credential synced across devices, so the server can't tell which devices hold it. Show a count and the date added instead.

### G2D-I08

**Show when the password last changed instead of a row of dots**

Low · Design change · effort S · `Settings > Account, Password row (G2D-005)` · A quiet shell with real search, navigation and sign-in

- **Today:** G2D-005 plans the Password row as '••••••••' with Change. Staff password changes aren't recorded anywhere today; the branch logs PASSWORD_CHANGED only for contractors.
- **Why:** The dots tell a partner nothing. Airbnb's row reads 'Last updated 8 days ago' beside Update. That confirms a change took effect and shows when an old password is still in use. It closes the loop without adding anything.
- **Change:** The value reads 'Changed Oct 23', or 'Set Aug 30, 2026' for passwords from the import script. It comes from the user's newest PASSWORD_CHANGED SecurityEvent, with Change on the right. Write that event for staff when G2D-004 lands.
- **Desktop, tablet, phone:** Same at every size. On phone the date sits under the label as its sublabel, and Change stays a 44px row action.
- **Reuse:** SecurityEvent and PASSWORD_CHANGED from the branch (f59e6ad), and G2D-005's row.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/c50369e0-6c52-45c6-b69f-695382b258aa): Login & security: 'Password / Last updated 8 days ago' with one Update link. A date, not a mask.
- **Code:** `branch: src/lib/portal/accounts.ts (PASSWORD_CHANGED is logged for portal accounts only)`, `src/app/login/actions.ts:18-43 (staff path writes no event)`
- **Verification:** confirmed. A small change that closes the loop. The branch's PortalAccount already has a passwordChangedAt column (branch prisma/schema.prisma:529). Add the same column to User and read it directly rather than querying for the newest SecurityEvent. Staff passwords are set by script (the spec default says managed by hand), so the script should stamp the column too. The Airbnb reference was not re-run.

### G2D-I09

**Put 'Forgot it?' under Current password in the Change password dialog**

Low · Design change · effort S · `Change password dialog (G2D-004)` · A quiet shell with real search, navigation and sign-in

- **Today:** Zillow's Change password dialog does put 'Forgot password?' right under Current password (verified: https://mobbin.com/screens/ae9d9a62-1294-42f8-8de8-3952bce3808f). But the staff reset this link depends on doesn't exist and was ruled out. The approved spec's 'Defaults I filled in' item 2 says Forgot password covers contractor accounts only and staff logins stay managed by hand (task-management-migration-4c9ddf/docs/asana-migration-plan.md:97). The branch's reset (src/lib/portal/reset.ts:18-20) sends nothing to a staff email.
- **Why:** Zillow puts 'Forgot password?' directly under Current password in the same dialog, so whoever can't get past the first field isn't stuck. Gusto's principles say no dead ends.
- **Change:** Under Current password, add a quiet link: 'Forgot it? Email me a reset link'. It runs G2D-010's reset for the signed-in email and swaps the dialog body to 'Check your inbox at {email}. The link works for 30 minutes.' with Done.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: inside the 400px dialog. Phone 375: inside the bottom sheet, with the link at a 44px tap height.
- **Reuse:** startPasswordReset (branch src/lib/portal/reset.ts) as extended by G2D-010, the authLinkClass tap-height pattern, and AuthNotice wording.
- **References:** 
  - [Zillow](https://mobbin.com/screens/55f13f74-c074-4462-8c6b-f958aa5e32f8): The Change password dialog has 'Forgot password?' directly under Current password, inside the dialog.
- **Code:** `branch: src/lib/portal/reset.ts`, `branch: src/app/(portal)/p/welcome/password/page.tsx:29-55 (the existing change form has no forgot path)`
- **Verification:** partly. conflicts_with should name the spec default. Keychain also fills Current password in a change-password form, so a partner stuck on that field is rare. If Connor reverses the default (G2D-010), this is the right spot for the link. I07 and I09 cite the same URL (55f13f74) for two different things; ae9d9a62 is the direct reference for this one.

### G2D-I10

**On touch, ask once before signing out**

Low · Design change · effort S · `Phone and tablet navigation drawer, Sign out` · The phone is a chosen subset, and touch has no hover

- **Today:** My measurements match: Sign out is a 46x16 gray text link at y 634 of 667 at 375 and y 535 of 568 at 320, 65px below the 32px theme toggle. A 16px target is more likely missed on a deliberate tap than hit by accident. A stray tap costs one Keychain-filled sign-in, after which the 30-day session simply starts again.
- **Why:** A stray tap near the home indicator costs a full sign-in on a phone. Linear Mobile and the Stripe Dashboard app both confirm Log out with one action sheet. Mercury doesn't, but Face ID gets you back in within a second.
- **Change:** On touch devices only, Sign out opens an action sheet: 'Sign out on this device?' with 'Sign out' and 'Cancel'. Desktop stays one click. Once Face ID sign-in is on for the device (G2D-009, G2D-I04), skip the sheet, since coming back costs nothing.
- **Desktop, tablet, phone:** Phone 375 and tablet 768: an action sheet at the bottom. Desktop 1280: no confirm.
- **Reuse:** React Aria Modal as a sheet (approved), with ConfirmDialog's copy pattern.
- **Challenges:** The library favors undo over confirm, and G2D-V02 makes this row a bigger target. Sign out can't be undone without signing in again, so the confirm applies only on touch, and only until Face ID is on.
- **References:** 
  - [Linear Mobile](https://mobbin.com/flows/a710ecdf-4eb1-4409-96a6-bc7acb00478a): Log out raises one action sheet: 'Are you sure you want to log out?', then Log Out and Cancel.
  - [Stripe Dashboard](https://mobbin.com/screens/b33d7308-7283-468f-9368-61a2df2a5db3): The Account sheet confirms Log Out with one 'Are you sure?' alert.
  - [Mercury](https://mobbin.com/flows/a2e8f634-ecdb-48a0-ac0b-e24a3e4f1216): The counterexample: no confirm, because Face ID makes coming back free. That's why the confirm drops once Face ID is on.
- **Code:** `measured in the drawer at 375x667: Sign out [52, 634, 46, 16], theme toggle [207, 569, 32, 32]`, `src/components/app-shell.tsx:166-181`
- **Verification:** partly. Fix the target, not the flow: a 44px full-width Sign out row, like the one in Linear Mobile's own Settings (flow a710ecdf, verified), or the account menu in G2D-V02. A confirm on every intentional sign-out goes against the inventory, which keeps ConfirmDialog for destructive actions and discarding changes (docs/components.md:30). The Linear and Stripe references do show a confirm, but the case for one here is weak.

### G2D-I11

**Name the time a lockout ends instead of always saying '15 minutes'**

Low · Fix · effort S · `/login?error=locked` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /login?error=locked on :3300 shows the alert 'Too many failed attempts. Try again in 15 minutes.' (page.tsx:26). The action still redirects without the retry time (actions.ts:38-39), and a retry during a lock records nothing (check runs before fail). A 'Forgot password?' link sits under the form for everyone (page.tsx:57-63), but reset works only for contractor accounts (Defaults #2).
- **Today:** The page always prints 15 minutes (src/app/login/page.tsx:30-31), and actions.ts:27-28 drops retryAfterMs. But the line is exact on the attempt that sets the lock and an upper bound after that, so it isn't 'wrong almost every time'. Retrying during a lock doesn't extend it: check() runs first and redirects without recording a failure (actions.ts:27-28; recordFailure is only at :34). So 'which keeps the lock going' is incorrect. There's no 'dates over durations' copy rule in CLAUDE.md or docs/.
- **Why:** The line is wrong almost every time it shows. A wrong wait makes people keep trying, which keeps the lock going. The library's copy rule is dates over durations, as Stripe does.
- **Change:** Carry the unlock time to the page and print it in local time: 'Too many tries. Try again at 3:42 PM.' Keep G1A's reset link after it. Pass the time in a short-lived cookie rather than the URL, since PUBLIC-017 clears the error from the URL.
- **Desktop, tablet, phone:** One line at all widths. 'Too many tries. Try again at 3:42 PM.' is 38 characters and fits the 272px column at 320.
- **Reuse:** LoginThrottle.check's retryAfterMs, and the error slot on /login (AuthError on the branch).
- **Code:** `src/app/login/actions.ts:27-28`, `src/lib/login-throttle.ts:43-50`, `src/app/login/page.tsx:28-34`, `branch src/app/login/page.tsx:24-30, 57-63`, `branch src/app/login/actions.ts:38-46`
- **Verification:** partly. Worth doing only as a small copy fix. A clock time has to be printed in the partner's time zone (America/New_York is safe for both partners). Because the throttle lives in memory per instance, the time left can differ from one instance to the next anyway.

### G2D-V02

**Give Sign out a full 44px row in the drawer instead of a 16px text link**

Low · Design change · effort S · `Phone and tablet navigation drawer, account block (every signed-in page below 1024px)` · The phone is a chosen subset, and touch has no hover

- **Today:** In the drawer at 375 and 768, Sign out is a 12px muted text button, 45.8 x 16px, tucked under the name 'Connor Swofford'. The CLAUDE.md device check warns on tap targets under 44px.
- **Why:** A 16px-tall target under the name is easy to miss and easy to mis-tap next to the theme toggle. Mercury's iOS Settings puts Log Out on its own full-width row at the end, where a thumb finds it.
- **Change:** In the drawer only, keep the avatar and name row as it is and put Sign out on its own 44px row below it, left-aligned with the nav labels, in muted text with a line icon. No confirmation step. This stays until D10's bottom bar moves it to the last row of Account (G2D-005).
- **Desktop, tablet, phone:** Desktop 1280: the rail is unchanged (see G2D-V01). Tablet 768 and phone 375: Sign out becomes a 44px row at the foot of the drawer. Nothing drops.
- **Reuse:** The nav item row styles from SideNav in src/components/nav, applied to the existing Sign out form in src/components/app-shell.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/351996b4-117f-4663-bff4-864baac8264e): iOS Settings ends with a full-width 'Log Out' row: one clear, thumb-sized target at the bottom of the account list.
- **Code:** `src/components/app-shell.tsx:166-181`
- **Verification:** verifier-found
