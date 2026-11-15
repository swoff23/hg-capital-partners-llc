# Coming soon rentals and waitlist

This spec adds a **Coming soon** status to rental listings. Those homes show on the public Rentals page with a pill on the photo, and renters can join a waitlist for each one. When the home opens, the app emails everyone waiting, and the waitlist on the listing lets Connor write to them himself. It was planned with Connor on Nov 15, 2026, against `1277ed2`, and waits for his "build it".

## 1. Summary

**What's missing today**

- **No way to say "on its way".** A listing is Hidden, Available or Leased. A unit in rehab or turnover is either Hidden, so the public sees nothing, or Available, which says it can be rented now (or on a set day, "Available Dec 1"). Connor, Nov 15: "let's add a 'coming soon' for our rental listings. So I can put upcoming stuff on there so people can see what we have coming up."
- **No way for a renter to raise a hand.** The page links to Zillow and nothing else.

**What changes**

- The listing sheet's Status gains **Coming soon**, between Hidden and Available.
- The Rentals page shows coming-soon homes in the same grid, after the available ones and before the leased ones. The photo's pill reads "Coming soon", or "Coming in January" when an Available from date is set.
- Each coming-soon card has **Notify me**. It opens a small form (first name, email, optional phone) that turns into a thank-you, and the renter gets a short confirmation email.
- The listing row on the property page shows "3 waiting". The listing sheet lists who's waiting, with Email, Text, Copy email and Remove from list in each row's ⋯ menu.
- Switching a coming-soon listing to Available shows a ticked checkbox, "Email the 3 people waiting for this home". Saving with it ticked sends each of them one email.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What can go in Coming soon | **A, units HG Capital owns** (rehab or turnover), set from the listing sheet (Connor, Nov 15: "A. Units we own"). Not homes under contract, listed from a deal before closing (B) |
| 2 | Where coming-soon homes sit on the Rentals page | **A, one grid with a pill on the photo**: Available, then Coming soon, then Leased (Connor: "A. One grid, pill"). Not a section of their own (B) or an Available / Coming soon switch (C) |
| 3 | How a card says when it'll be ready | **A, the month in the pill**: "Coming in January" with a date, "Coming soon" without one (Connor: "A. Month in the pill"). Not the exact day (B) or no timing (C) |
| 4 | Rent and the Zillow link on a coming-soon card | **A, show what's entered**: the rent when there is one, nothing in its place when there isn't, and the Zillow link when set (Connor: "A. What's entered"). Not hidden until Available (B) or "Price on request" (C) |
| 5 | Can renters ask to hear when a home opens | **C, a sign-up on each coming-soon card** (Connor: "C. Sign-up field"). Recommended was A, nothing yet. Not an email link (B) |
| 6 | How the people waiting hear the home opened | **A, a checkbox on save, ticked by default, plus a list of who's waiting** (Connor: "A but also I want to know who is on the waitlist so I can send an even more special message"). Not always automatic (B) or a list only (C) |
| 7 | What the sign-up asks for | **C, first name, email and an optional phone** (Connor: "C. Phone optional"). Not email only (A) or name and email (B) |
| 8 | How the form opens | **A, "Notify me" opens a small form**: a centered dialog on laptop and tablet, a bottom sheet on phone (Connor: "A. Small form"). Not the card opening in place (B) or one form at the foot of the page (C) |
| 9 | Where Connor sees who's waiting | **A, on the listing**: a count on the property page's row, the people in the listing sheet (Connor: "A. On the listing"). Not a Waitlist page of its own (B) |
| 10 | An alert when someone signs up | **B, just the count** on the listing row (Connor: "B. Just the count"). Recommended was A, a task like the move-in form. Not an email per sign-up (C) |
| 11 | The top of the page when nothing is open but homes are coming soon | **B, no lead line**: the eyebrow ("Rentals · 2 coming soon") and the pills say it (Connor: "B. No line"). Recommended was A, a line pointing to Notify me. Not today's "Check back soon" (C) |
| 12 | An email right after signing up | **A, the thank-you plus a short confirmation email** (Connor: "A. Short email"). Not the thank-you alone (B) |

Defaults taken without a separate question (Connor can overrule any of them):

- **The pill falls back to "Coming soon" once its month has passed.** "Coming in January" shows through January 31, then "Coming soon" until Connor changes the status. Nothing switches a listing to Available on its own. A date more than 11 months out names the year: "Coming in January 2028".
- **The checkbox shows only when this save moves a listing from Coming soon to Available** and someone on its list hasn't been emailed yet. Moving to Hidden or Leased shows no checkbox and sends nothing. That covers the case where someone on the list rented it.
- **People stay on the list after the email**, each row marked "Emailed Jan 3", so Connor can follow up and has a record of who heard. Nobody gets the open email twice. If the listing goes back to Coming soon and opens again, the checkbox counts only people who haven't heard yet ("Email the 2 people who haven't heard yet").
- **The same email on the same home is one person.** A second sign-up updates the name and phone, shows the same thank-you, and sends no second confirmation email.
- **Notify me shows only on coming-soon cards.** Available cards don't change.
- **Hidden keeps the list.** A coming-soon listing switched to Hidden keeps its waitlist; the card and form leave the page.
- **Deleting a listing deletes its waitlist, and nobody is emailed.** The confirm says so: "Its 4 photos and 3 people waiting go too."
- **Removing someone is immediate, with Undo** in the toast ("Dana removed from the waitlist"), the same Undo toast archive uses. The waitlist isn't part of the listing's draft, so Save listing doesn't carry it.
- **Opting out is by reply.** Both emails end with "Changed your mind? Reply and we'll take you off the list." Replies go to `EMAIL_REPLY_TO`, as the move-in copy's do, and Connor removes the person from the ⋯ menu. A one-click unsubscribe link is a possible follow-up if the list grows.
- **One line under Notify me says what the data is for**: "We'll only use this to tell you about this home." (ZARA and Zocdoc both say it.)
- **Missing info counts a coming-soon listing as listed.** The vacant-unit check in `src/lib/missing/checks.ts` treats Coming soon like Available, so a unit in turnover with a coming-soon listing isn't flagged.
- **No alert on sign-up** (decision 10), and no task. The "3 waiting" count is the only sign until Connor opens the listing.
- **Renters' details stay in the app.** They never show on the public page, and only signed-in staff read them.

## 3. Behavior

### 3.1 Data

```prisma
enum ListingStatus {
  AVAILABLE
  COMING_SOON // shown on Rentals with a "Coming soon" pill and Notify me
  LEASED
  HIDDEN
}

// A renter waiting for a coming-soon listing (docs/specs/coming-soon.md).
// One row per email per listing; the second sign-up updates the first.
model ListingWaitlistEntry {
  id         String    @id @default(cuid())
  listing    Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId  String
  firstName  String
  email      String    // trimmed and lowercased
  phone      String?   // as typed, trimmed; 10 digits (11 with a leading 1)
  emailedAt  DateTime? // when the "it's ready" email went
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([listingId, email])
  @@index([listingId])
}
```

- One migration: `ALTER TYPE "ListingStatus" ADD VALUE 'COMING_SOON' BEFORE 'LEASED'`, so the Rentals page's `orderBy: status asc` puts coming-soon homes between the available and leased ones. Then the table, with `ALTER TABLE "ListingWaitlistEntry" ENABLE ROW LEVEL SECURITY;` (README, rules of the road; `db-rls.test.ts`).
- `Listing` gains `waitlist ListingWaitlistEntry[]`.
- `ListingStatus` is read in `actions.ts` (the zod enum), `edit-listings.tsx` (`EditableListing.status`, `STATUS_LABEL`), `listing-sheet.tsx` (`STATUS_ITEMS`), `rentals/page.tsx` and `missing/checks.ts`. Each gains `COMING_SOON`.

### 3.2 The Rentals page (decisions 2, 3, 4, 11)

`src/app/(marketing)/rentals/page.tsx`:

- The query reads `status in [AVAILABLE, COMING_SOON, LEASED]`, still never at an archived property.
- The photo pill comes from one pure `listingPill(status, availableDate, today)` in `src/lib/properties/listing-pill.ts`, with tests:
  - Leased: "Leased".
  - Available with a date ahead: "Available Dec 1" (today's rule, moved here).
  - Coming soon with a date whose month hasn't ended: "Coming in January" ("Coming in January 2028" past 11 months out).
  - Coming soon with no date, or its month has passed: "Coming soon".
- The caption shows the rent when entered and nothing when not, the unit, the facts line, and the Zillow link when set (decision 4). "Price on request" stays for Available only. The viewer's title carries the rent on coming-soon homes too.
- Under the caption, **Notify me**: a text link with lucide `Bell`, styled like View on Zillow (`publicType.meta`, `publicLinkHover`, 44px tall on touch), before View on Zillow when both show. The two sit on one row and fit at 320.
- Each card's `<article>` gets `id={listing.id}`, so the emails' button can land on it (`/rentals#<id>`).
- **Eyebrow:** "Rentals · 1 available · 2 coming soon"; "Rentals · 2 coming soon" with nothing open; "Rentals · None available" with neither. Below 640 it keeps one fact ("Rentals · 1 available", or "Rentals · 2 coming soon" when nothing's open), so the caps line never wraps at 320 (CLAUDE.md, mobile drops secondary info).
- **Lead:** today's "No openings right now. Check back soon. Our homes are also listed on Zillow." only when nothing is open and nothing is coming soon. With coming-soon homes and nothing open, no lead line (decision 11).
- At 1280, 768 and 375 the grid stays 3, 2 and 1 columns.

### 3.3 Notify me (decisions 7, 8, 12)

A client component beside the page, `notify-me.tsx`, around `Sheet` (`src/components/sheet.tsx`). The move-in form already uses `Sheet` on the public site.

- **Opens** as a centered dialog from `md` (laptop and tablet 768) and a bottom sheet below it, as `Sheet` always does. Esc closes it; focus returns to Notify me.
- **Title** is the street and unit, "56 Tamarack St, Upper", with the pill's words under it in `--muted-foreground` ("Coming in January").
- **Fields**, each a `FormField` + `Input` at 16px on iOS:
  - First name: `autoComplete="given-name"`, required, 60 characters at most.
  - Email: `type="email"`, `autoComplete="email"`, required.
  - Phone: `optional`, `type="tel"`, `autoComplete="tel"`.
  - A hidden honeypot, as on the move-in form.
- **Notify me** is the one CTA, full width on phone. Under it, one line in `--muted-foreground`: "We'll only use this to tell you about this home."
- **Errors**, under each field once it's left or Notify me is pressed:
  - "Enter your first name."
  - "Enter an email like name@example.com."
  - "Enter a 10-digit phone number, or leave it blank."
  - Rate limited, in the form's error line: "Too many sign-ups right now. Try again in an hour."
  - Anything else: "We couldn't add you to the list. Try again in a moment."
- **Thank-you** (payoff moment): the same sheet swaps its body for the home's first photo (with none, the same House tile the card shows), "You're on the list, Dana!" and "We'll email you when 56 Tamarack St, Upper is ready." One **Done** button closes it. The card shows nothing new afterward. Signing up again is allowed and harmless.
- **Action:** `joinWaitlist(input)` in `src/app/(marketing)/rentals/actions.ts`, unauthenticated like `submitMoveInInspection`. It validates with zod (bounds as above), checks the honeypot, the per-IP limit (5 an hour) and a global cap (60 a day), and calls the service. It refuses a listing that isn't Coming soon or sits at an archived property with "This home isn't taking sign-ups anymore." It returns an `ActionResult`.
- **Service:** `joinWaitlist` in `src/lib/waitlist/service.ts` upserts on `(listingId, email)`. On a new row it sends the confirmation email. A failed send is logged and doesn't fail the sign-up, which is already saved.

### 3.4 The emails (decisions 6, 12)

Both use `renderPlainEmail` and `sendEmail`. `renderPlainEmail` gains an optional `image` (`{ url, alt }`): the listing's first photo, full width above the line. Listing photos are already public URLs.

**Confirmation**, on sign-up:

- Subject: "You're on the list for 56 Tamarack St, Upper"
- Line: "Hi Dana, thanks for your interest in 56 Tamarack St, Upper."
- Closing: "It should be ready in January. We'll email you once when it is." With no month: "We'll email you once when it's ready."
- Button: "See the home", to `/rentals#<listingId>`.
- Footnote: "Changed your mind? Reply and we'll take you off the list."

**It's ready**, when Connor saves with the checkbox ticked:

- Subject: "56 Tamarack St, Upper is ready to rent"
- Line: "Hi Dana, the home you asked about is ready."
- Items: the rent ("$1,450 a month") when entered, the facts line, "Available Dec 1" when the date is ahead.
- Button: "See the home", to `/rentals#<listingId>`. The Zillow link follows the button as a second line when set.
- Footnote: "You asked about this home on Nov 3. Changed your mind? Reply and we'll take you off the list."

### 3.5 The listing row and sheet (decisions 1, 6, 9)

`edit-listings.tsx` and `listing-sheet.tsx`, on the property page:

- **Status** lists Hidden, Coming soon, Available and Leased, in that order. `STATUS_LABEL.COMING_SOON` is "Coming soon".
- **The row's status column** widens from `w-20` to `w-24`, so "Coming soon" fits and the column still lines up on every row.
- **The row's subline** ends with "· 3 waiting" when anyone is waiting and hasn't been emailed. Once all have heard, "· 3 emailed". Below 480, where the facts drop, it reads "Coming soon · $1,450 · 3 waiting". The count stays because it's the only sign of a sign-up.
- **The checkbox** sits under the Unit and Status row. It shows when the sheet opened on Coming soon, Status now reads Available, and someone hasn't heard yet: "Email the 3 people waiting for this home" (or "Email Dana, who's waiting for this home" with one person). It's ticked by default and resets if Status moves off Available.
- **Saving with it ticked** sends the emails after the listing's transaction commits. `saveListing` gains `notifyWaitlist: boolean`, and the service sends one at a time, 600ms apart as the outbox spaces its sends, stamping `emailedAt` on each that goes. The toast says what happened:
  - "Listing for Upper saved. 3 people emailed."
  - "Listing for Upper saved. 2 of 3 emails went out." Whoever didn't get one stays unstamped, and their row's ⋯ Email opens Connor's own mail.
- **Waiting · 3**, a `Section` at the foot of the sheet, under Baths, on a saved listing with anyone on its list. Rows go newest first:
  - Line 1: the first name.
  - Line 2: the email and the phone (`text-meta`, `--muted-foreground`). Below 480 the phone takes its own line.
  - Right: the sign-up day ("Nov 3"), or "Emailed Jan 3" once the open email went.
  - ⋯ menu: **Email Dana** (`mailtoHref`), **Text Dana** (`textHref`, only with a phone), **Copy email**, a separator, then **Remove from list** (destructive, immediate, with Undo).
- **Delete listing's confirm** adds the waitlist to its body: "Its 4 photos and 3 people waiting go too."
- The waitlist is read with the listing in the property page's query, staff only. `EditableListing` gains `waitlist` (id, first name, email, phone, created, emailed), which isn't part of the draft the sheet saves.

### 3.6 What doesn't change

- Available, Leased and Hidden listings look and behave as they do today, apart from the pill's logic moving into `listingPill`.
- The public header, footer and the Residents pages.
- Who can edit listings: signed-in staff, at the property's version, refused when the property moved on.

### 3.7 Mockups

- [01-rentals-page.svg](coming-soon/01-rentals-page.svg): decisions 2 to 5 and 11, the grid at laptop and phone, and the eyebrow.
- [02-notify-me.svg](coming-soon/02-notify-me.svg): decisions 7, 8 and 12, the dialog, the phone sheet and the thank-you.
- [03-listing-waitlist.svg](coming-soon/03-listing-waitlist.svg): decisions 1, 6, 9 and 10, the listing row, the checkbox and the Waiting list.

## 4. Reuse check

**Reused as is**

- `Sheet` for Notify me, as the move-in form uses it on the public site; `FormField`, `Input` and `Button` (`ui.tsx`).
- The move-in form's sent screen as the model for the thank-you, with the card's House tile when there is no photo.
- `sendEmail`; `RateLimiter` and `clientIp` (`src/lib/rate-limit.ts`); the honeypot and `withResult` pattern from `moving-in/actions.ts`.
- `PhotoCarousel`'s `status` pill, unchanged; it gets its words from `listingPill`.
- `Menu`, `MenuItem`, `MenuSeparator`, `Section`, `Checkbox` and `useRun`'s toast with Undo in the listing sheet; `mailtoHref` and `textHref` from `src/lib/contacts.ts`.
- `saveListing`'s transaction and version check (`touchAtVersion`).

**Extended**

- `ListingStatus` with `COMING_SOON`; the listing zod enum, `STATUS_LABEL`, `STATUS_ITEMS` and the Missing info listed-unit check.
- `renderPlainEmail` with an optional `image`.
- `saveListing` and `savePropertyListing` with `notifyWaitlist`, and `deleteListing`'s confirm body with the waitlist count.
- `ListingsSection`'s row (status column width, subline count) and `ListingSheet` (checkbox, Waiting section).
- The Rentals page's query, eyebrow, lead and card caption.

**New**

- `ListingWaitlistEntry` and its migration.
- `src/lib/properties/listing-pill.ts` (`listingPill`, pure, with tests).
- `src/lib/waitlist/core.ts` (pure: the sign-up's cleaning and checks, the checkbox's words, both emails' text, with tests) and `src/lib/waitlist/service.ts` (`joinWaitlist`, `removeFromWaitlist`, `restoreToWaitlist`, `emailWaitlist`).
- `src/app/(marketing)/rentals/actions.ts` (`joinWaitlist`) and `notify-me.tsx`; `removeWaitlistEntry` and its Undo in `src/app/(app)/properties/actions.ts`.
- `waitlist-section.tsx` beside the listing sheet.
- These are feature-only compositions of `Sheet`, `FormField`, `Menu` and the toast, so they get no row in `docs/components.md`.

## 5. References

- [Zillow, listing cards](https://mobbin.com/screens/23bc78c5-0bad-4fd8-87bb-89f7da47d38b): one status pill in the photo's top-left corner, the pattern the Leased pill already follows.
- [HYPE, Drops](https://mobbin.com/screens/5427a0dc-ec0b-4eb7-a133-a707e1c6734b): a "Coming soon" pill on each card in the grid, with the date beside it.
- [Viator, Bookings](https://mobbin.com/screens/35698d28-f025-44af-be6a-33556f4087f2): "Starts in 25 days" as a photo pill, timing in the status spot.
- [Zocdoc, Set your notification](https://mobbin.com/screens/5c151543-6a7a-4c9f-aa77-252c803a8c77): a sheet headed by the thing you're waiting for, one line on what happens next, one full-width "Notify me".
- [Zalando, size alert](https://mobbin.com/screens/62ea9640-ceb6-4619-9f3a-6877256475b8): the item at the top, then email and an optional name.
- [ZARA, Coming soon](https://mobbin.com/screens/50189b2e-9132-4ac2-88f4-b6bdcf0cfaa9): "Coming soon" with a notify form and one line on what the email is used for.

## 6. Checks

- Unit tests: `listingPill` (each status, the month through its last day, then "Coming soon", the year past 11 months, no date); the waitlist's cleaning (trim, lowercase, phone digits, the bounds, the honeypot); the checkbox's words for one, many and "haven't heard yet"; both emails' text with and without a month, rent and Zillow link.
- `db-rls.test.ts` passes with the new table.
- `joinWaitlist` refuses a listing that's Hidden, Available, Leased, deleted or at an archived property; a second sign-up with the same email updates the row and sends no second confirmation.
- Saving Coming soon to Available with the box ticked emails only unstamped rows and stamps them; unticked sends nothing; Coming soon to Leased never shows the box.
- `npm run test:devices` with a coming-soon listing in the local DB. Then by hand at 1280, 768, 375 and 320: the Rentals grid and eyebrow, Notify me's dialog and sheet with the keyboard up, each error, the thank-you, the listing row, the checkbox, the Waiting list and its menu.
- **Overlap:** the property page and `src/lib/properties/service.ts` were changed by Missing info (`1277ed2`), so merge `origin/main` before building and again before landing.
