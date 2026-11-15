# Contractor onboarding: invites, a sign-up link, and setup in the portal

The spec for replacing the Google Form "HG Capital – Contractor Onboarding Form" with onboarding in the app. This is a draft for Connor: nothing is built, and building waits for an explicit "build it". Planned on Nov 14 against main at `773244e`.

## 1. Summary

**What happens today**

- **A Google Form collects everything.** It has 5 sections: contact details (name, company, phone, email, mailing address), payment details for ACH (bank name, checking or savings, name on account, routing number, account number), a required signed W-9 upload, and an optional insurance upload. Uploading needs a Google sign-in.
- **The answers live in Google.** The responses sheet holds every contractor's full routing and account numbers in plain text. The app's import read the sheet once and deliberately never stored the bank columns (`scripts/migrate/02-contractors.ts`).
- **Staff make every login.** Create login on the contractor's page sets a starting password, and staff text the three login lines. The contractor then chooses their own password.

**What changes**

- **New contractors set themselves up.** Staff send a personal invite, or share one sign-up link. The new contractor creates their own account, then walks through their details, trades, W-9 and insurance in the portal. Anyone already in Contractors skips all of it.
- **Bank details never touch the app.** Contractors add them in Baselane, from a link HG Capital sends from Baselane. The app reminds staff to send it and records when they did.
- **Staff see where everyone is.** The Contractors list marks New, Invited, Opened and Onboarding beside the name. Home's Needs you asks a partner to keep or archive each sign-up from the shared link, and to send the Baselane link once someone finishes.
- **The Google Form retires.** Connor turns off its responses and clears the bank columns from the sheet (section 10).

## 2. Decisions (Connor, Nov 14)

| # | Question | Decision |
|---|---|---|
| 1 | Bank details | **Baselane** collects them through its own link. The app never stores bank or routing numbers |
| 2 | Where the form lives | **In the contractor portal**, behind a sign-in, not a public form |
| 3 | Shape | **A guided onboarding**: create your account, check your details, pick your trades, add your W-9, add your insurance, all set |
| 4 | How contractors get in | **Personal invites plus one shared sign-up link** that staff can reset |
| 5 | Who onboards | **Only new people**, who aren't in Contractors yet. Anyone already there, with or without a login, never sees the steps. (First planned as the same steps for existing logins; Connor changed it the same day) |
| 6 | Sending invites | **From Connor's phone**: Text invite opens Messages with the text filled in; Email invite and Copy link too. No texting service |
| 7 | Trades | **Pick from the shared list**, plus one free-text line for anything missing. Contractors can't add to the list |
| 8 | W-9 | **Upload a signed W-9** (photo or PDF). The app doesn't collect tax IDs in fields |
| 9 | Insurance | **Optional, upload only.** No expiry date. "I don't carry business insurance" finishes the step |
| 10 | Done | **Details, trades and a W-9.** Then the contractor shows as Active |
| 11 | Home | **Needs you rows for shared-link sign-ups** (Keep or Archive) and **for sending the Baselane link** once someone finishes (Sent). Nothing for invited people finishing |
| 12 | Logins | **Create login and Reset password stay as they are** for anyone already in Contractors: a staff-set starting password and Copy message. Invites are only for new people |
| 13 | Contractors list | **A Status column** while it applies (New, Invited, Opened, Onboarding), plus a Status filter. Active rows show the empty dash. (Was a badge beside the name until Nov 15) |
| 14 | Naming | Copy says **"HG Capital"**, never bare "HG". The five portal strings that said "HG" changed in this build (section 7). The portal's wordmark is **"HG Capital Partners"** (was "HG Jobs"), and the "HG Login" eyebrow is gone from every sign-in page with its own title (Connor, during the build) |
| 15 | Finishing setup | **Required** (Connor, during the build). Until details, trades and a W-9 are in, the steps are the only page a new contractor can open. **Sign out** replaces Finish later; the next sign-in opens the step they stopped on. No card above My jobs |

Dropped on the way: an insurance expiry date, and with it the expiry reminders and the assignee-picker warning that were on the "W-9 and COI tracking" list.

## 3. The contractor's side

### 3.1 Three ways in

| Way in | What the contractor sees first |
|---|---|
| **Personal invite** (`/join/<token>`) | "Hi Mike. Set up your HG Capital contractor account." Email prefilled when the invite had one, then a password. Their name comes from the invite |
| **Shared sign-up link** (`/join/<token>`, the shared token) | "Set up your HG Capital contractor account." Name, mobile, email and a password |

Contractors already in the app never see the steps or the setup entry in the account menu.

Both links use the sign-in page's frame (`AuthFrame`), the dark public material, so they read as HG Capital's own sign-in.

### 3.2 The steps

One step at a time, like the move-in report: a `Meter` with "W-9 · 4 of 6", the step's heading, and the docked bar with **Back** (from the second step shown) and **Next**. **Sign out** sits at the top right until setup is done ("My jobs" after). Each Next saves that step to the server, so staff see progress and a contractor can switch phones halfway.

| # | Step | What it asks | Required to finish |
|---|---|---|---|
| 1 | Create your account | Email (the login) and password, checked by the existing password rules (`checkNewPassword`). Shared link also asks name and mobile | Yes |
| 2 | Check your details | Name, company (optional), mobile, mailing address, all filled in from what we have | Name, mobile and mailing address (the address field with suggestions, as on property pages) |
| 3 | What you do | Trades from the shared list (the trades checklist), "Anything we didn't list?" (one line), "Are you OK with fixing maintenance issues our tenants have?" with **Yes** and **No** under it (a `SegmentedControl`, nothing picked until they choose, as the move-in report's ratings; saved as Tenant fixes) | At least one trade or the "didn't list" line, and Yes or No |
| 4 | Your W-9 | "Add your signed W-9": take a photo or add a PDF. A link to the blank IRS form. "Only HG Capital staff can see it." | Yes |
| 5 | Your insurance | "Add your business insurance": photo or PDF. "I don't carry business insurance" moves on | No |
| 6 | All set | `SpotArt`, "Thanks, Dana!", and what's next (3.4) | |

A later upload (from the account menu) adds to the record; the newest one is what staff see first.

**Setup is required** (decision 15). Every /p page sends someone mid-setup to the steps (`requirePortalPrincipal` and the layout's `requirePortalSession`), as a starting password is sent to the first-password page; a job email's link sends them to sign in and finish first. The W-9 step says "No W-9 handy? Sign out and come back. Your answers are saved." Someone who finished and opens the steps from the account menu starts at their details, to update them.

### 3.3 After setup

There's no card above My jobs: nobody reaches My jobs before setup is done (decision 15). The account menu's "Your details and files" opens the steps again for anyone who came in by an invite or the sign-up link, to update details or add a newer file. Files they already sent stay; only staff can remove them then.

### 3.4 All set

The payoff screen (CLAUDE.md, Make payoff moments count):

- **Heading:** "Thanks, Dana!" (the one place an exclamation point is allowed).
- **What's next**, two rows with icons:
  - "If we don't have your bank details yet, Baselane will email you a link to add them."
  - "Your jobs from HG Capital show up here."
- **Button:** "See my jobs".

### 3.5 Links that don't work

- **Used:** "This invite was already used. Sign in instead." with a Sign in button.
- **Expired or replaced** (Resend makes a new link and turns off the old one): "This invite has expired. Ask HG Capital for a new one."
- **Shared link after a reset:** the same expired line.
- **Archived or access-off contractor:** the expired line. Nothing says why.

## 4. Staff side

### 4.1 Contractors list

- **Header:** **Invite contractor** (primary) and **Sign-up link** (secondary). New contractor goes away as a header button; its form stays (4.2).
- **Status column** at the end of the row from tablet width up, as on Properties (Nov 15: moved out of the name's badge spot, which keeps Inactive and Tenant fixes). Narrower than a tablet the badge stays by the name, leading the second line on a phone. Only one status badge per row:
  - **New**: signed up with the shared link and not kept yet (the warn tone: a partner's decision, brand guidelines section 4).
  - **Invited**: invite sent, link not opened (neutral).
  - **Opened**: link opened, no account yet (neutral).
  - **Onboarding**: account made, not done (neutral).
  - Active shows the empty dash.
- **Status filter** in Filters: New, Invited, Opened, Onboarding. "Needs W-9" keeps working and also counts uploaded W-9s.

### 4.2 Invite contractor

A `FormSheet` (bottom sheet on a phone, dialog from tablet up): **Name**, **Mobile or email**. Then three buttons: **Text invite** (primary on a phone; opens Messages through an `sms:` link, as Text login details does), **Email invite** (primary on a computer when there's an email; sent with the app's mailer), **Copy link**. Under them, "Add without inviting" saves the contractor with no invite, for someone who'll never use the portal. That is what New contractor does today, and it keeps the same fields.

The text: "Hi Mike, it's Connor at HG Capital. Set up your contractor account here: <link>". The sender's first name comes from the signed-in user.

### 4.3 Sign-up link

A popover from the header button (a sheet on a phone): the link in a `Code` that copies on a tap, **Copy message** (the link with one line around it, ready to paste into a text), and **Reset link** behind a confirm ("Anyone with the old link won't be able to sign up."). Toast: "Sign-up link reset. The old one no longer works." On a phone the header's Sign-up link is an icon button, so the row never wraps.

### 4.4 The contractor's page

- **Portal card** (`PortalAccessCard`): unchanged for everyone staff added, with Create login, Reset password and the rest as today. For someone who came in by invite or the sign-up link, its state follows their status:
  - Invited: "Sent Nov 14 · not opened", Resend.
  - Opened: "Opened Nov 15 · no account yet", Resend.
  - Onboarding: "W-9 · 4 of 6".
  - Active, Access off: as today, with Reset password, Change login email, Sign out everywhere and Remove access unchanged.
- **Trades:** the contractor's "didn't list" line shows under the tags as "Also does: Gutters, roof patches". Opening the trades checklist starts with that text in its search, so 'Add "Gutters"' is one tap.
- **W-9 and Insurance** rows (Connor, during the build): empty, the row is its verb ("Add W-9" in --warn, "Add insurance"), which opens the files, or the camera or files on a phone; with a file, **View** opens the newest and **Replace** adds a newer one (older ones stay). Any contractor, staff-added ones included. Otherwise today's `w9Url`/`coiUrl`/notes logic, and "No insurance" when they said so.
- **Bank:** "Baselane link sent Nov 14", or nothing.
- **Activity:** not built in this pass. The record's Onboarding badge, the progress line and the files cover it for now.

### 4.5 Home, Needs you

Two new row kinds, for both partners, until one of them acts:

- **"Tony Bell signed up"** over "Electric, Handyman · with your sign-up link". **Keep** clears the New badge. **Archive** removes the login and archives the contractor in one step (the archive rule refuses a contractor with a login, so this path does both). When the mobile or email matches someone already in Contractors, the second line says "Same phone as Zack Reading".
- **"Send Dana Fox the Baselane link"** over "Finished setup today". **Sent** records the date. Only new people who finish setup get this row.

Rows with buttons are new to Needs you; today's rows open a record. The row still opens the contractor when tapped outside its buttons.

## 5. Data

```prisma
model PortalInvite {
  id              String    @id @default(cuid())
  contact         Contact?  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  contactId       String?   // null for the shared sign-up link
  shared          Boolean   @default(false)
  tokenHash       String    @unique // sha256, as PasswordResetToken
  email           String?   // what staff typed, prefilled on step 1
  phone           String?
  createdBy       User?     @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  createdByUserId String?
  openedAt        DateTime?
  usedAt          DateTime? // personal invites: once
  expiresAt       DateTime? // personal: 14 days. Shared: null until reset
  createdAt       DateTime  @default(now())
  @@index([contactId])
}

model ContactDocument {
  id                   String       @id @default(cuid())
  contact              Contact      @relation(fields: [contactId], references: [id], onDelete: Cascade)
  contactId            String
  kind                 ContactDocKind // W9, INSURANCE
  url                  String
  pathname             String
  filename             String
  size                 Int
  contentType          String?
  uploadedByContactId  String?      // the contractor, from the portal
  uploadedByUserId     String?      // staff, from the contractor's page
  createdAt            DateTime     @default(now())
  @@index([contactId, kind])
}
```

`Contact` gains:

| Field | For |
|---|---|
| `signupSource` (`STAFF`, `INVITE`, `LINK`) | Where the record came from |
| `needsReview` Boolean | The New badge and the Needs you row, until Keep |
| `setupStep` String? | The furthest step saved, for "W-9 · 4 of 6" |
| `setupDoneAt` DateTime? | Done: details, trades and W-9 in |
| `tradesNote` String? | "Anything we didn't list?" |
| `noInsurance` Boolean | "I don't carry business insurance" |
| `baselaneSentAt` DateTime? | The Bank fact and the Needs you row |

- **Status is derived, never stored:** one function (`lib/contractors/onboarding.ts`) reads the invite, account and setup fields and returns New, Invited, Opened, Onboarding or Active. The list, the card, Needs you and the filter all call it.
- **Contractors already in the app are never in setup.** The migration sets `signupSource` to `STAFF` on every existing row, and the status function only reads the setup fields for `INVITE` and `LINK`. Their W-9 and insurance stay as they are today (`w9Url`, `coiUrl`, the notes).
- **`PortalAccount.mustChangePassword`** is false for accounts made from a link, since the contractor chose the password. Staff resets still set it to true, as today.
- **RLS** on both new tables (README, Rules of the road), checked by `src/lib/db-rls.test.ts`.
- Nothing here is per-business yet. The shared link is one row, so a second business later gets its own (docs/other-businesses-later.md).

## 6. Security

- **Tokens** are 32 random bytes, stored as SHA-256 only, through `lib/portal/tokens.ts`, like reset links. A personal invite works once and for 14 days; Resend replaces it.
- **"Opened" doesn't trust link previews.** Messages and email fetch a link to draw its preview, so the page marks the invite opened from the browser after it loads, not on the server's first GET.
- **The shared link is rate limited** per IP (`RateLimiter`, as the move-in form) and per email. Every sign-up starts as New with no jobs, so a stranger sees only their own setup.
- **No auto-matching.** A sign-up whose phone or email matches an existing contractor makes a separate New record and says so on the Needs you row. Attaching it to the existing record would let anyone who knows Zack's phone number see Zack's jobs.
- **An email that already has a login** gets "That email already has an account. Sign in or reset your password." This tells a stranger that the email has an account, which is acceptable for this portal; the sign-in throttle still applies.
- **Files** go to private Blob through two upload kinds (`portal-contact-upload` for the contractor's own, `contact-upload` for staff adding one that came by email; both record through `lib/contractors/documents.ts`) and are served through the files route: staff, or the contractor who owns them. W-9s carry tax IDs, so they never get a public URL.
- **Portal code boundaries** stay as they are (`src/lib/auth-guard.test.ts`). `/join` joins the guard test's allowlist of unauthenticated routes, beside login, password reset and the move-in form. While `PORTAL_ENABLED` is off it returns 404 like the rest of the portal.

## 7. Copy

All strings follow docs/copy-rules.md. The ones that set the tone:

| Where | Copy |
|---|---|
| Invite page | "Hi Mike. Set up your HG Capital contractor account." |
| Step 2 | "Check your details" |
| Step 3 | "What work do you take on?", "Anything we didn't list?", "Are you OK with fixing maintenance issues our tenants have?" (Connor's wording; staff still see it as the Tenant fixes badge). No availability question (Connor: it doesn't matter) |
| Step 4 | "Add your signed W-9", "Only HG Capital staff can see it.", "Get a blank W-9 from the IRS" |
| Step 5 | "Add your business insurance", "I don't carry business insurance" |
| Card | "Finish your setup" |
| Toasts | "Invite link copied", "Mike's invite sent", "Sign-up link reset. The old one no longer works.", "Tony kept", "Tony archived" with Undo |

**Bare "HG" fixed in the same build:** "New jobs from HG show up here." (`my-jobs.tsx`), "Waiting for HG to review" and "The HG team gets this by email" (`job-actions.tsx`), and the reset email's subject "Reset your HG password" and line "...for HG jobs." (`lib/portal/reset.ts`). Each becomes "HG Capital". The portal's wordmark "HG Jobs" (`BRAND.portal`) is a product name and stays.

## 8. Sizes

| | Laptop 1280 | Tablet 768 | Phone 375 |
|---|---|---|---|
| Steps | Centered column, bar docked under it | Same | Full screen, bar docked with the safe area |
| Setup gate | Any /p page goes to the steps | Same | Same |
| Invite contractor | Dialog | Dialog | Bottom sheet, Text invite first |
| Contractors list | Status column, last | Status column, last | Badge leads the second line |
| Needs you rows | One line, buttons right | Two lines, buttons right | Two lines; three rows then "N more" |

Nothing drops on a phone. The device check sweep covers the new routes at every width (section 9).

## 9. Reuse check

**Reused as is**

- `AuthFrame` and the first-password form's checks (`welcome-form.tsx`, `checkNewPassword`) for step 1.
- The move-in report's step pattern: `Meter`, `ActionBar`, one step at a time, a heading that takes focus (`residents/moving-in/move-in-form.tsx`).
- The move-in report's answer pattern for the tenant question: `SegmentedControl` under the question below 640px and beside it from 640, no answer picked at first.
- The trades checklist from today's trades work (`TagsChecklist`, `TagsField`, `InlineTags`; docs/specs/contractor-trades.md).
- The upload queue and uploader (`useMediaUploader`, private Blob, `lib/attachments/`) and the `Lightbox` viewer.
- Tokens and hashing (`lib/portal/tokens.ts`), `RateLimiter`, the mailer (`lib/email/send.ts`, `lib/email/render.ts`), `smsHref` from `lib/portal/login-text.ts`.
- The mailing address is a plain field (`autoComplete="street-address"`): `AddressCombobox` reads the staff-only `/api/addresses` and suggests HG Capital's own properties.
- `FormSheet`, `Code`, `ConfirmDialog`, `Badge`, `SpotArt`, the toast with Undo.

**Extended**

- `PortalAccessCard`: Invited, Opened and Onboarding states with Resend, for people who came in by invite or the sign-up link. Create login stays for everyone staff added.
- `NeedsYou`: rows can carry buttons (Keep, Archive, Sent) beside opening the record.
- Contractors list: header actions, a status badge and a Status filter; "Needs W-9" reads uploads.
- Archive: one path that removes a New sign-up's login and archives it.
- The portal gate (`requirePortalPrincipal`, `requirePortalSession`, `portalHomePath`): sends anyone mid-setup to the steps from every /p page, as it sends a starting password to the password page.
- Upload kinds: two new kinds for contractor documents.

**New**

- `/join/[token]` and the steps at `/p/setup`.
- `PortalInvite`, `ContactDocument` and the Contact fields in section 5.
- `lib/contractors/onboarding.ts`: the one status function.

**References** (Mobbin): [Deel, accepting an invitation](https://mobbin.com/flows/481d6c38-7189-4caf-aaa4-4ecebc14e91f) (invite, account, steps, then a checklist on home); [Remote, onboarding tasks](https://mobbin.com/flows/5774c9d9-6da9-46b3-a82d-864662920ca6) ("2 tasks remaining", a row per item, the done screen); [Deel, contractor documents](https://mobbin.com/flows/3b76b23b-69fc-4c52-97f3-e827d915c3a0) ("Not submitted" per required file); [Gusto, signing documents](https://mobbin.com/flows/775d5548-b77f-41cd-b536-5f32d6af374a) (a step list for tax forms); [hilos, invite people](https://mobbin.com/screens/9e5174ec-0924-42b1-820e-aeddb0c8c563) (a shared link beside invite by email); [Replit, regenerate join link](https://mobbin.com/screens/0c84e28c-80d1-49a4-9973-86cfdcc45d67) (reset turns the old link off); [Searchable, pending invitations](https://mobbin.com/screens/ddfa56d2-522a-41bd-b680-a81baa71bae5) (Pending status in the people list).

## 10. Defaults picked in planning (change any)

| Default | Why |
|---|---|
| Personal invites last **14 days** | Long enough for a busy contractor, short enough that an old text doesn't work forever |
| **No email confirmation** step | Fewer steps on a phone. A mistyped email is fixed with Change login email |
| **Connor's to-dos at launch:** turn off responses on the Google Form, and delete the five bank columns (H to L of "Contractor Info") from the responses sheet, or lock the sheet to Connor only | Those columns are the most exposed copy of bank numbers HG Capital holds |

## 11. Build

Five chunks, each usable on its own, most of a day in all:

1. **Data and status:** the migration (both tables, the Contact fields, RLS), `onboarding.ts` with tests, upload kinds and the files route.
2. **Invites:** `/join/[token]`, step 1, the invite and sign-up-link services, `PortalAccessCard`, Invite contractor, Sign-up link.
3. **The steps:** `/p/setup`, steps 2 to 6, the account menu entry, the setup gate.
4. **Staff views:** list badges and Status filter, the contractor page facts, Needs you rows and their actions, the archive path.
5. **Copy:** the bare "HG" strings, then a pass over every new string with docs/copy-rules.md.

Each chunk ends with `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`. `SAMPLE_PARAMS` gets `/join/[token]` (a local seeded invite) and the setup steps; the device check's portal fixture gets a contractor mid-setup.
