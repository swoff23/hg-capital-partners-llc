# Coming soon rentals and a sign-up list

This spec adds a **Coming soon** status to rental listings. Those homes show on the public Rentals page with a pill on the photo, and renters can sign up to hear about each one. Connor sees who signed up on the listing and copies or downloads the list into Gmail to send his own email. The app sends no email. It was planned with Connor on Nov 15, 2026, simplified with him on Nov 20 against `25b34fc`, and built on Nov 21.

## 1. Summary

**What's missing today**

- **No way to say "on its way".** A listing is Hidden, Available or Leased. A unit in rehab or turnover is either Hidden, so the public sees nothing, or Available, which says it can be rented now. Connor, Nov 15: "So I can put upcoming stuff on there so people can see what we have coming up."
- **No way for a renter to raise a hand.** Connor, Nov 20: "I just want a bunch of email addresses for people that are interested in the property ... give me the ability to see all of them, copy, download, or whatever, and then drop it into a Google Gmail email."

**What changes**

- The listing sheet's Status gains **Coming soon**, between Hidden and Available.
- The Rentals page shows coming-soon homes in the same grid, after the available ones and before the leased ones. The photo's pill reads "Coming soon", or "Coming in January" when an Available from date is set.
- Each coming-soon card has **Notify me**. It opens a small form (first name, email, optional phone) that turns into a thank-you.
- The listing row on the property page shows "3 waiting". The listing sheet lists everyone who signed up, with **Copy emails** (all of them, ready for Gmail's BCC) and **Download** (a .csv). Each person's ⋯ menu has Copy email, Email, Text and Remove from list.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What can go in Coming soon | **A, units HG Capital owns** (rehab or turnover), set from the listing sheet (Connor, Nov 15: "A. Units we own"). Not homes under contract (B) |
| 2 | Where coming-soon homes sit on the Rentals page | **A, one grid with a pill on the photo**: Available, then Coming soon, then Leased (Connor: "A. One grid, pill"). Not a section of their own (B) or a switch (C) |
| 3 | How a card says when it'll be ready | **A, the month in the pill**: "Coming in January" with a date, "Coming soon" without one (Connor: "A. Month in the pill"). Not the exact day (B) or no timing (C) |
| 4 | Rent and the Zillow link on a coming-soon card | **A, show what's entered** (Connor: "A. What's entered"). Not hidden until Available (B) or "Price on request" (C) |
| 5 | Can renters ask to hear when a home opens | **C, a sign-up on each coming-soon card** (Connor: "C. Sign-up field") |
| 6 | How the people waiting hear the home opened | **Connor emails them himself from Gmail.** The listing has Copy emails and Download (Connor, Nov 20: "I'm just literally gonna put it in my Gmail account and send a blast email out with this list"). This replaces the Nov 15 pick, a ticked checkbox that had the app email everyone when the listing opened |
| 7 | What the sign-up asks for | **First name, email and an optional phone** (Connor, Nov 15: "C. Phone optional"; kept Nov 20: "Keep name and phone"). Not email only |
| 8 | How the form opens | **A, "Notify me" opens a small form**: a centered dialog on laptop and tablet, a bottom sheet on phone (Connor: "A. Small form"). Not the card opening in place (B) or one form at the foot of the page (C) |
| 9 | Where Connor sees who's waiting | **A, on the listing**: a count on the property page's row, the people in the listing sheet (Connor: "A. On the listing"). Not a page of its own (B) |
| 10 | An alert when someone signs up | **B, just the count** on the listing row (Connor: "B. Just the count") |
| 11 | The top of the page when nothing is open but homes are coming soon | **B, no lead line**: the eyebrow and the pills say it (Connor: "B. No line") |
| 12 | An email right after signing up | **None.** The app sends no email (Connor, Nov 20: no automatic emails). This replaces the Nov 15 pick, a short confirmation email |

Calls made on Nov 20 without a separate question (Connor can overrule any of them):

- **No line under Notify me.** CLAUDE.md, "A control is its label": the sheet's title names the home, so the form needs no line saying what the data is for.
- **The thank-you shows the home's first photo, or the envelope art (`SpotArt` `request-sent`) when it has none.** The contractor's Mark done payoff (`job-actions.tsx`) is the model: it shows the property photo, or `SpotArt` inside a sheet. components.md says SpotArt is never in dialogs; the payoff already breaks that, and this follows the payoff.
- **Coming-soon homes are listed soonest first**, undated last. Available and Leased keep today's order (newest edit first).
- **The thank-you is a one-off for now.** components.md's Sent screen row says to share the sent screen on a third use; sharing it means restyling the move-in or Mark done screen, which waits for its own change. This one is listed in that row.
- **The row's count sits right after the rent**, so a narrow row cuts the facts first.

Defaults (Connor can overrule any of them):

- **The pill falls back to "Coming soon" once its month has passed.** "Coming in January" shows through January 31. Nothing switches a listing to Available on its own. A date more than 11 months out names the year: "Coming in January 2028".
- **The list stays with the listing whatever its status.** Notify me only shows while it's Coming soon, but switching to Available, Leased or Hidden keeps everyone, so Connor can email them when the home opens.
- **The same email on the same home is one person.** A second sign-up updates the name and phone and shows the same thank-you.
- **Deleting a listing deletes its list.** The confirm says so: "Its 4 photos and the 3 people waiting go too."
- **Removing someone is immediate, with Undo** in the toast ("Dana removed from the list").
- **Missing info counts a coming-soon listing as listed.** The vacant-unit check treats Coming soon like Available.
- **Renters' details stay in the app.** They never show on the public page, only signed-in staff read them, and logs carry ids, never a name, email or phone.

## 3. Behavior

### 3.1 Data

```prisma
enum ListingStatus {
  AVAILABLE
  COMING_SOON // on Rentals with a "Coming soon" pill and Notify me
  LEASED      // on Rentals last, with a Leased pill
  HIDDEN      // saved but not shown publicly (e.g. still being prepped)
}

// Someone who signed up to hear about a listing (docs/specs/coming-soon.md).
// One row per email per listing; a second sign-up updates the first.
model ListingWaitlistEntry {
  id        String   @id @default(cuid())
  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId String
  firstName String
  email     String   // normalizeEmail: trimmed and lowercased
  phone     String?  // readPhone's display form, "716-555-1234"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([listingId, email])
}
```

- `Listing` gains `waitlist ListingWaitlistEntry[]`. The unique index leads with `listingId`, so there's no separate index.
- **One migration**, named to sort after main's latest (`20261120140000_drop_draw_waiting` today), for example `20261120150000_coming_soon_waitlist`. Make it with `npx prisma migrate dev --create-only`, then hand-edit the enum line to `ALTER TYPE "ListingStatus" ADD VALUE 'COMING_SOON' BEFORE 'LEASED';`. Prisma writes a plain `ADD VALUE`, which appends after HIDDEN, and the Rentals page's `orderBy: status asc` would then put coming-soon homes after the leased ones. Then the table, with `ALTER TABLE "ListingWaitlistEntry" ENABLE ROW LEVEL SECURITY;` (never FORCE).
- **The migration's header**, as recent ones have: the spec's path; additive only (one enum value, one table); no statement uses `COMING_SOON` (Postgres 55P04 inside one transaction); the value's position is deliberate; RLS on with no policies; roll forward only. An older build can't read a COMING_SOON row, so there's no going back once one is saved.
- **Every reader of the status gains COMING_SOON**, derived from Prisma's enum where it was a hand-written copy:
  - `src/app/(app)/properties/actions.ts`: `status: z.enum(ListingStatus)` in `listingSchema`.
  - `src/app/(app)/properties/[id]/edit-listings.tsx`: `EditableListing.status` is Prisma's `ListingStatus` type; `STATUS_LABEL.COMING_SOON` is "Coming soon".
  - `listing-sheet.tsx`: `STATUS_ITEMS` lists Hidden, Coming soon, Available, Leased.
  - `src/app/(marketing)/rentals/page.tsx`: the query and the card data (3.2).
  - `src/lib/missing/checks.ts`: the listed-unit rule (line ~301) counts AVAILABLE and COMING_SOON; its comments and docs/specs/missing-info.md D6 say so; `checks.test.ts` gains the case.
- **Remove `updatePropertyListings` and `replaceListings`.** Nothing calls them, and `replaceListings` deletes every listing missing from the set it's sent, which would cascade to sign-ups with no confirm.
- **Sign-up writes never touch `Property.updatedAt`.** A renter signing up, or Connor removing someone, must not refuse his open listing sheet. They revalidate `/properties/[id]` and `/rentals` themselves.

### 3.2 The Rentals page (decisions 2, 3, 4, 11)

`src/app/(marketing)/rentals/page.tsx`:

- The query reads `status in [AVAILABLE, COMING_SOON, LEASED]`, never at an archived property, ordered as today. After it, the COMING_SOON group is re-sorted by `availableDate` ascending with undated last.
- `ListingCardData` carries the `status` itself instead of `leased`, since the available count, the rent in the viewer title, "Price on request" and the Zillow link each key off it.
- **The pill** comes from `listingPill(status, availableDate, today)` in `src/lib/properties/listing-pill.ts`, pure, returning `string | undefined`, reading dates with `toYmd`:
  - Leased: "Leased".
  - Available with a date ahead: "Available Dec 1" (today's rule, moved here). Available otherwise: no pill.
  - Coming soon with a date whose month hasn't ended: "Coming in January" ("Coming in January 2028" past 11 months out).
  - Coming soon with no date, or its month has passed: "Coming soon".
- **The caption** shows the rent when entered and nothing when not, the unit, the facts line, and the Zillow link when set. "Price on request" stays for Available only. The viewer's title carries the rent on coming-soon homes too.
- **Notify me**, under the caption on coming-soon cards only (3.3), before View on Zillow when both show, on one row that fits at 320.
- **Eyebrow:** "Rentals · 1 available · 2 coming soon"; "Rentals · 2 coming soon" with nothing open; "Rentals · None available" with neither. The full line is about 363px, so below 640 it keeps one fact ("Rentals · 1 available", or "Rentals · 2 coming soon" when nothing's open). Two spans inside `Eyebrow`, `max-sm:hidden` and `sm:hidden`, so only one is ever shown or read out.
- **Lead:** today's "No openings right now. Check back soon. Our homes are also listed on Zillow." only when nothing is open and nothing is coming soon. With coming-soon homes and nothing open, no lead line.
- The grid stays 3, 2 and 1 columns at 1280, 768 and 375.

### 3.3 Notify me (decisions 7, 8)

A client component beside the page, `notify-me.tsx`, on HG's `Sheet` (`src/components/sheet.tsx`) with `surface="public"`. It doesn't use `FormSheet`, whose footer is the app's Cancel and primary and which has no thank-you state; the stock FormDialog (design foundation, landing F) replaces both later.

- **Trigger:** React Aria's `DialogTrigger` around an `AriaButton` that reads "Notify me" with lucide `Bell`, styled like View on Zillow (`publicType.meta`, `publicLinkHover`, `inline-flex items-center gap-1`, `pointer-coarse:min-h-11`). Its accessible name names the home: `aria-label="Notify me about 56 Tamarack St, Upper"`.
- **State** (the fields, pending, errors, sent) lives in `notify-me.tsx` above the `Sheet`, because `footer` and `dirty` are Sheet props. It resets each time the sheet opens. `dirty` is true while any field has text, with no `onDirtyClose`, so X and Esc close at once and the backdrop doesn't.
- **Opens** as a centered dialog from `md` and a bottom sheet below it, as `Sheet` does. Focus goes to the first-name field (the keyboard rises on a phone); on close it returns to Notify me.
- **Title** is the street and unit, "56 Tamarack St, Upper". The pill's words ("Coming in January") are the first line of the body, in `text-meta` `--muted-foreground`. No Sheet prop is added.
- **Body:** a `noValidate` `<form id>` with three `FormField` + `Input` rows (16px on iOS, `fitLine` on each) and a hidden honeypot, as on the move-in form:
  - First name: `autoComplete="given-name"`, required, 60 characters at most.
  - Email: `type="email"`, `autoComplete="email"`, required.
  - Phone: `optional`, `type="tel"`, `autoComplete="tel"`.
- **Footer:** the form's refusal line (`SaveError className="w-0 min-w-full"`), then `<Button type="submit" form={id} pending className={cn(publicCtaClass, "w-full")}>Notify me</Button>`. After a refusal, focus goes back to the form (`returnFocusAfterSave`, as FormSheet does), so Esc still reaches the sheet.
- **Errors**, per forms-editing.md: nothing is red before the first try. A bad email or phone shows on leaving a field that holds text; a missing first name or email shows on Notify me, with focus on the first bad field (`focusFirstInvalid`). Once a line shows, it re-checks as the person types. Every line fits in 288px at 14px:
  - "Enter your first name."
  - Email: `EMAIL_INVALID` word for word ("Enter a full email, like name@example.com.").
  - Phone: `PHONE_INVALID` if it fits at 320 with `fitLine`, otherwise "Enter a 10-digit phone number."
  - The per-visitor limit: "Too many sign-ups. Try again in an hour." The daily cap: "Too many sign-ups right now. Try again later."
  - A listing that isn't Coming soon anymore, or is gone: "This home isn't taking sign-ups anymore."
  - Anything else: "Couldn't add you to the list. Try again." No signal: `OFFLINE_ERROR` from `callAction`.
- **Thank-you** (payoff moment), in the same sheet: `role="status"`, the home's first photo (`PhotoThumb`, with a `sizes` that fits a full-width phone sheet) or `SpotArt name="request-sent"` with none, the heading "You're on the list, Dana!" (`tabIndex={-1}`, focused on mount, since Notify me's button is gone), and "We'll reach out when it's ready." The footer holds **Done**, which closes the sheet. Signing up again is allowed and harmless.

### 3.4 The sign-up action (decision 5)

- **Pure fields** in `src/lib/waitlist/fields.ts`, browser-safe with no zod or Prisma, used by both the form and the action: the first name trimmed, capped at 60 and run through `capitalizedName(n) ?? n`; the email through `normalizeEmail` and `looksLikeEmail`; the phone through `readPhone`, storing its display form. It also holds the list's helpers (3.5).
- **The action**, `joinWaitlist(input)` in `src/app/(marketing)/rentals/actions.ts`, unauthenticated like `submitMoveInInspection`. It parses with zod (refining with the same fields.ts checks, so browser and server can't disagree), answers a filled honeypot with a quiet success, checks a per-IP `RateLimiter` (5 an hour) and calls the service. It returns an `ActionResult` with `fieldErrors` per field. It passes every refusal through as it is and swaps in "Couldn't add you to the list. Try again." only for `GENERIC_ERROR`. It's added to `ALLOWLIST` in `auth-guard.test.ts` ("public form; honeypot, IP and daily caps").
- **The DB rules** live in `src/lib/waitlist/core.ts`, as functions taking a client, so they can be tested: the listing must be `{ status: "COMING_SOON", property: liveRecord }`; the daily cap counts rows created across all listings in the last 24 hours (200), so it holds across server instances; then an upsert on `(listingId, email)`. Remove returns the row; restore upserts it back with its original `createdAt`.
- **The service**, `src/lib/waitlist/service.ts` (`import "server-only"`), passes `prisma` to core and revalidates. Imported as `* as waitlist`.
- **Staff actions** in `src/app/(app)/properties/actions.ts`: `removeWaitlistEntry(propertyId, entryId)` and `restoreWaitlistEntry(propertyId, entry)`, each with `requireUser`.
- **Logs** carry the listing id and entry id only, never the name, email or phone.

### 3.5 The listing row and sheet (decisions 6, 9, 10)

`edit-listings.tsx`, `listing-sheet.tsx` and a new `waitlist-section.tsx` beside them:

- **The list stays off the draft.** `page.tsx` adds `waitlist: { orderBy: { createdAt: "desc" } }` to the listings query and passes `waitlists: Record<listingId, WaitlistRow[]>` to `ListingsSection`, which gives the sheet its listing's rows as their own `waitlist` prop. `EditableListing`, the save and Load the latest don't change. Dates are read in Eastern (`todayYmdEastern(at)`) and shown with `fmtDay(v, { year: "auto" })`.
- **The row's status column** widens from `w-20` to `w-24`, so "Coming soon" fits and the column lines up on every row.
- **The row's subline** carries "· 3 waiting" right after the rent whenever anyone is on the list: "$1,450/mo · 3 waiting · 2 bd · 1 ba". Below 480 it reads "Coming soon · 3 waiting · $1,450". Truncation cuts the facts and photos first.
- **Below 480 the row's Zillow link moves into its ⋯ menu** as "View on Zillow", the first item, so the subline has room for the count (Connor, Nov 21: "A. Zillow into ⋯"; mockup 04). Laptop and tablet keep the link on the row.
- **Waiting · 3**, `<Section as="h3">` at the foot of the sheet under Baths, on a saved listing with anyone on its list. Its `actions`:
  - **Copy emails**: every email on the list, joined with ", ", onto the clipboard; toast "3 emails copied", or "Couldn't copy the emails."
  - **Download**: a .csv built in the browser from the rows on the page, named after the home (`56-tamarack-st-upper-sign-ups.csv`), with First name, Email, Phone and Signed up (YYYY-MM-DD). A cell that starts with `=`, `+`, `-` or `@` gets a leading `'` so a spreadsheet doesn't run it. Below about 400px the button is the Download icon alone, with `aria-label="Download the list"`; both buttons stay on the heading's row at 320.
- **Rows**, newest first: the first name; under it the email and the phone in `text-meta` `--muted-foreground` (the phone on its own line below 480); the sign-up day at the right ("Nov 3").
- **The row's ⋯ menu** is a plain `Menu` (no `sheetTitle`, as the photo menu): Copy email ("Email copied"), Email Dana (`mailtoHref`), Text Dana (only with a phone, and only on touch, `useCoarsePointer()`, as Tenants does), `MenuSeparator`, **Remove from list** (`variant="destructive"`).
- **Remove** is immediate: the section's own `useRun()` hides the row at once, the toast reads "Dana removed from the list" with Undo, and Undo restores the row. Focus moves to the next row's ⋯, or to the heading when it was the last.
- **Delete listing's confirm** names what goes with it: "Its 4 photos and the 3 people waiting go too.", "The 3 people waiting go too.", "Dana, who's waiting, goes too." (the photo-only lines as today).

### 3.6 What doesn't change

- Available, Leased and Hidden listings look and behave as they do today, apart from the pill's logic moving into `listingPill`.
- The listing save, its version check and Load the latest.
- The public header, footer and Residents pages.

### 3.7 Mockups

The build follows the text and today's components; the mockups simplify some details (labels drawn inside fields, the thank-you's header).

- [01-rentals-page.svg](coming-soon/01-rentals-page.svg): decisions 2 to 5 and 11, the grid at laptop and phone, and the eyebrow.
- [02-notify-me.svg](coming-soon/02-notify-me.svg): decisions 7 and 8, the dialog, the phone sheet and the thank-you.
- [03-listing-waitlist.svg](coming-soon/03-listing-waitlist.svg): decisions 6, 9 and 10, the listing row and the sign-up list.
- [04-phone-row-count.svg](coming-soon/04-phone-row-count.svg): the listing row on a phone, with the Zillow link in the ⋯ menu (Nov 21).

## 4. Reuse check

**Reused as is**

- `Sheet` with `surface="public"`, `FormField`, `Input`, `Button`, `SaveError`, `Section`, `Menu`, `MenuItem`, `MenuSeparator`, `PhotoThumb`, `SpotArt`, `ConfirmDialog`, `useRun` with Undo, `useCoarsePointer`.
- `publicCtaClass`, `publicType`, `publicLinkHover`, `Eyebrow`; `callAction`, `OFFLINE_ERROR`, `GENERIC_ERROR`, `focusFirstInvalid`.
- `readPhone`, `EMAIL_INVALID`, `PHONE_INVALID` (`contractors/contact-fields.ts`); `normalizeEmail`, `looksLikeEmail` (`portal/credentials.ts`); `capitalizedName`, `mailtoHref`, `textHref` (`contacts.ts`); `RateLimiter`, `clientIp`, `withResult`, `liveRecord`; `todayYmdEastern`, `fmtDay`, `toYmd`.
- The move-in action's honeypot and limits; the Mark done payoff's photo-or-art thank-you.

**Extended**

- `ListingStatus` with `COMING_SOON`, and every reader in 3.1.
- The Rentals page's query, card data, eyebrow, lead and caption.
- `ListingsSection`'s row (status column, subline count) and the delete confirm; `ListingSheet` with the `waitlist` prop and section; the property page's listings query.
- `auth-guard.test.ts`'s allowlist; `checks.test.ts`; components.md's Sent screen row lists this thank-you; `tests/devices/setup.ts` seeds the fixture (section 6).

**New**

- `ListingWaitlistEntry` and its migration.
- `src/lib/properties/listing-pill.ts`; `src/lib/waitlist/fields.ts`, `core.ts`, `service.ts`.
- `src/app/(marketing)/rentals/actions.ts` and `notify-me.tsx`; `waitlist-section.tsx` beside the listing sheet; `removeWaitlistEntry` and `restoreWaitlistEntry`.
- These are feature-only compositions, so they get no new row in docs/components.md.

**Removed**

- `updatePropertyListings` and `replaceListings`, which nothing calls.

## 5. References

- [Zillow, listing cards](https://mobbin.com/screens/23bc78c5-0bad-4fd8-87bb-89f7da47d38b): one status pill in the photo's top-left corner, the pattern the Leased pill already follows.
- [HYPE, Drops](https://mobbin.com/screens/5427a0dc-ec0b-4eb7-a133-a707e1c6734b): a "Coming soon" pill on each card in the grid.
- [Viator, Bookings](https://mobbin.com/screens/35698d28-f025-44af-be6a-33556f4087f2): "Starts in 25 days" as a photo pill, timing in the status spot.
- [Zocdoc, Set your notification](https://mobbin.com/screens/5c151543-6a7a-4c9f-aa77-252c803a8c77): a sheet headed by the thing you're waiting for, one full-width "Notify me".
- [Zalando, size alert](https://mobbin.com/screens/62ea9640-ceb6-4619-9f3a-6877256475b8): the item at the top, then email and an optional name.
- [ZARA, Coming soon](https://mobbin.com/screens/50189b2e-9132-4ac2-88f4-b6bdcf0cfaa9): "Coming soon" with a notify form.

## 6. Checks

- **Unit tests** (plain, so CI runs them): `listingPill` (each status, Available with no pill, the month through its last day then "Coming soon", the year past 11 months, no date); `fields.ts` (cleaning and bounds, the honeypot, the copy-emails string, the .csv with quotes, commas, newlines and the formula guard, the file name, the subline and delete-confirm words); `core.ts` against a fake client (refusals for Hidden, Available, Leased, gone and archived; the daily cap; a second sign-up updates the row; restore keeps `createdAt`); `checks.test.ts` (a vacant unit with a coming-soon listing isn't flagged); `auth-guard.test.ts` and `client-weight.test.ts` pass (no zod or Prisma reached from a `"use client"` file).
- `npm run check` (typecheck, lint and the unit tests) passes; `db-rls.test.ts` passes with the new table.
- **Device fixture:** `tests/devices/setup.ts` gains `seedComingSoonFixture`, which can run twice, calls `assertLocalDb`, and does nothing when a COMING_SOON listing already exists at a live property. On the property `SAMPLE_PARAMS["properties/[id]"]` picks it makes two coming-soon listings: one with a date next month, a rent and a Zillow link, one with no date, rent or photos. The first gets two sign-ups at `hg.localhost` addresses, one with a phone. Its header comment stops saying staff data is only read.
- **Device check** in light and dark (`npm run test:devices`, `npm run test:devices:dark`), both reports looked over. Then by hand at 320, 375, 768, 1280x800 and 1920: the Rentals grid and eyebrow; Notify me's dialog and sheet with the keyboard up, each error and the thank-you; the listing row, the Waiting section, Copy emails, Download, the row menu and Remove with Undo, in light and dark.
- **Landing:** merge `origin/main` and say what overlapped; the specs README line and this header say "built"; the roadmap's Done entry with the hash goes in a docs-only follow-up. After the push, `/api/health`'s `latestMigration` names the new migration. The first real sign-up in production is the proof; until then it's "not yet tried in prod".
