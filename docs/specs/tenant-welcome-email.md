# The tenant's first email: their maintenance request form

Status: **decided with Connor, Nov 23, 2026. "Build it" the same day; built (section 5).**

## 1. Why

The first email a tenant gets (`linkEmail`, src/lib/residents/emails.ts) carries their own no-login link to the maintenance request form. It's sent from the tenant sheet, in the launch-day send, and by Email me my link. They read it once and need it weeks later, when something breaks, so it has to stay true whenever they find it, be easy to search for, and get them to the form in one tap. Today's version says "From now on" on every send, opens their page rather than the form (two taps), and has the old resident layout.

## 2. Decisions

**Q1. Which email: A, one email for every send (Nov 23).** Connor's words: call it the **maintenance request form**, not "repair link".
- From: "HG Capital".
- Subject: "Your maintenance request form for {home}" ("933 Lafayette Avenue · Floor 2").
- Preview and first line: "Use it for all maintenance requests." (Connor, Nov 24: "short and sweet"; was "Use it for repairs instead of the group chat.")
- Headline: "Hi Dana, here's your maintenance request form."
- Button: **Report a problem**, opening the form itself (`/r/<token>/new`).
- Nothing under the button (Connor, Nov 24, keeping "maintenance request form" over "link"). The two lines that were there ("We'll email you when…", "Keep this email…") went: the request copy says what happens next. Mockup: `_private/mockups/tenant-link-email-short.svg` (option B).
- Footer: "Emergency? Text us in our group chat."
- Sending a new link (the sheet's menu; the old link stops working): subject "Your new maintenance request form for {home}", headline "Hi Dana, here's your new maintenance request form.", first line "Your old link no longer works. Use this one from now on."
- Letterhead: the full one (32px tile, "HG Capital Partners", the gold-deep rule), as invite and sign-in emails keep, since this email is their key.
- Measured (re-checked in the build, Nov 23, WebKit and Chromium, 35 first names from Al to Maximilian): every headline is two lines at 360 and 375 for every name. At 320 the "Hi Dana" headline stays two lines for every name (Christopher and Maximilian included). The Welcome headline (Q3) takes three for every name of five letters or more (Maria, Sarah, Chris, Daniel, Michael, Jennifer, Christopher); only Al, Ana, Joe, Dana, Luis, Mike and Jose stay at two. The new-link headline takes three for the wider names (Matthew, Jonathan, Kimberly, Mohammed, Elizabeth, Alexander, Stephanie, Christopher, Maximilian); Jessica, Michelle, Jennifer, Patricia and every shorter name stay at two. The button is one line; the footer one line. Open with Connor: section 6.
- The page an old link opens: "This link was replaced." with "Use the newest email from HG Capital." when a newer link was emailed, else "This link no longer works."; both end "Questions? Text us in our group chat." (today "This ticket has been closed").
- Mockups: `_private/mockups/tenant-welcome-email-options.svg` (A, B, C at true size), `_private/mockups/tenant-welcome-email-form-words.svg` (A in Connor's words).
- Rejected: B (different words per send: launch-day "now" is stale when found later, four versions), C (home-screen steps in the email: they fail in the in-app browsers Gmail and Instagram open links in).

**Q2 to Q5: Connor took every recommendation (Nov 23).**
- **Q2. Where a tenant's reply goes: A, into the app, to both partners.** Resident emails get their own reply address. A reply to an email about a request posts on that request as the resident's own addition ("Dana Lee (resident) by email", the same line their form's additions make), and both partners get the usual Update email. A reply to the first email, which is about no request, goes to both partners with the home named. Only the tenant's own email on file counts (DMARC pass, as for contractors); anything else is dropped. A reply never reaches the contractor directly. The emails' text doesn't change. Mockup: `_private/mockups/tenant-reply-where.svg`.
- **Q3. A new tenant's headline:** "Welcome, Dana. Here's your maintenance request form." when move-in (`lease.movesIn`) is in the last 30 days or still ahead; otherwise A's "Hi Dana" headline. Measured two lines at 375; three at 320 for first names of five letters or more (section 6).
- **Q4. From "HG Capital" on all seven resident emails** in the same change (the form email, the request copy, Scheduled, Moved, Done, Closed, the move-in report copy). Their layout stays as it is for now.
- **Q5. Group chat:** Connor makes each household's chat before the link goes out or shortly after, so the first line and the footer keep pointing to it.
- Not in this change: a one-time "add to home screen" tip on the form page (a visual change; ask separately if wanted).

## 3. Reuse check

**Reused as is:** `renderResidentEmail` and its `LETTERHEAD` and `PRIMARY` (src/lib/residents/email-layout.ts, src/lib/email/render.ts); `residentUrl` and the link minting in src/lib/residents/links.ts; the resident's own additions to a request and `notifyPartners` (src/lib/residents/requests.ts); `fromName` on `sendEmail` (src/lib/email/resend.ts, Nov 22); the reply routing built Nov 22 for contractors (src/lib/email/reply-sender.ts; in replies.ts the contractor forward `forwardReply`, whose send and file packing became `sendToPartners` and `packForward` for tenant forwards to share) and the inbound webhook.

**Extended:** `renderResidentEmail` gets lines under the button (HTML and text); `linkEmail` gets the new words, the replaced-link and new-tenant headlines; `emailResidentLink` sends From "HG Capital", the reply address and the replaced flag; `resolveResidentLink` returns why a link stopped working, for the old-link page; the inbound routing learns resident reply addresses.

**New:** a resident reply address (its own token, never the form link's, so a reply address can't open the form).

## 4. Also in the build

- Wrong copy fixed directly: the move-in report email's footnote "Sent Nov 23 through the HG residents page." named the company as bare "HG". Spelled out, "through the HG Capital residents page" wrapped at 375 and 320 against the one-line rule, so it's built as "Sent to HG Capital on Nov 23." (emails.ts `moveInCopyEmail`): one line at 320 and 375 for every date, 183px of the 230 a 320 phone gives on the widest ("May 30").
- Success is a tenant's first request through the form, and fewer repair texts in the group chats; not link opens (mail scanners open links).

## 5. As built (Nov 23)

**The form email.** `linkEmail` (src/lib/residents/emails.ts) takes `replaced` and `welcome`; `renderResidentEmail` has `after`, the lines under the button, in HTML and text. `emailResidentLink` (service.ts) sends it with the button on `/r/<token>/new`, `welcome` from `newTenant(lease.movesIn, today)` (steps.ts: 30 days back through any day ahead; no move-in date is not new), and `replaced` only from the sheet's Send a new link. A new tenant's new link keeps the new-link words, since the old link stopping is what they need to know.

**From "HG Capital".** Every resident email builder returns `fromName` (`RESIDENT_FROM`, BRAND.app), and each sender passes it: the form email, the request copy, the four updates (updates.ts) and the move-in report copy, whose builder moved to emails.ts `moveInCopyEmail` so it could be tested.

**The old link's page.** `resolveResidentLink` returns `{ state: "ended", why }`; `whyLinkEnded` (link-ended.ts) says `replaced` only when a newer link for the same person and lease was emailed and still works (a newer one also turned off would send them to a dead link), and only while they're still on a current lease. The page uses `endedWords` (steps.ts). The refusal an action or upload gets, `endedMessage`, is the heading and the first line only, since Cancel shows it as a toast: "This link was replaced. Use the newest email from HG Capital." (61 characters) or "This link no longer works. Questions? Text us in our group chat." (64).

**Reply addresses.** A new table, `ResidentReplyAddress` (migration `20261123120000_resident_reply_addresses`, RLS on): `tokenHash` (unique), `tenantId` and `leaseId` (cascade), `requestId` (null on the form email; set null if the request is deleted), `createdAt`. One row per email, minted by `residentReplyTo` (residents/reply-address.ts) only while RESEND_WEBHOOK_SECRET is set, with a fresh `newToken()`, never the form link's. The address is the job emails' `r+<token>@` shape, so the one parser reads it; `routeReply` looks a token up in JobLink first, then here.

**Where a reply goes** (email/reply-sender.ts `residentRoute`, email/replies.ts `residentReply`):
- Not from the tenant's own email on file, without DMARC pass, or with a disguised From: dropped.
- About an open request, still on the lease: posts through `addResidentUpdate` (residents/additions.ts), the same writer as the form's Add more, as "Dana Lee (resident)" with `data.byEmail` and the email's id, so a redelivered webhook posts once; both partners get the usual Update line. The task's Activity shows "Dana Lee (resident) by email". Their words are cut as replies are (`replyBody`, which also reads Spanish, French and Portuguese quote lines), then stop at the first line that names our app or our sending domain, with any `/r/<token>` link or `r+<token>@` address left taken out, percent-encoded ones inside another link too, as Outlook's Safe Links wraps ours (inbound.ts `residentReplyWords`): every resident email carries the tenant's form link, and a Shared post shows on the contractor's job page, so a quote in a mail app or language `replyBody` doesn't know must not post. Kept to a note's 2,000 characters; photos and videos follow Add more's caps, ten at a time.
- A redelivered webhook for a reply that already posted, the request since closed or the lease ended, sends only the files it couldn't take (under their own send key), never "…replied after this closed."
- Files a request can't take (a document, past ten, or over its cap): to both partners, "Dana Lee replied with files that can't go on the request.", the files attached as far as one email holds.
- About the form email, a closed request, after moving out, or a request deleted since: to both partners, "Dana Lee replied by email. It isn't about a request.", "…replied after this closed." or "…replied after moving out.", with the request or the home named and their words.
- Forwards are From "HG Capital", with no reply address of their own and no job thread, so a partner's reply to one never posts on the job for the contractor. Nothing goes to the contractor directly.

**Not changed.** The move-in report copy has no reply address: the move-in form names no tenant on file. Update emails treat Resend's 409 on a retry as sent, since each try carries its own reply address.

## 6. Open with Connor (Nov 23)

- **Welcome and new-link headlines at 320.** Built in Connor's words, which take three lines at 320 for most first names: the Welcome headline for every name of five letters or more (Maria, Sarah, Daniel, Michael, Jennifer, Christopher), the new-link headline for the wider ones (Matthew, Jonathan, Kimberly, Mohammed, Elizabeth, Alexander, Stephanie, Christopher, Maximilian). Two lines at 360 and up for every name. A: drop "Here's" ("Welcome, Dana. Your maintenance request form.", "Hi Dana, your new maintenance request form."), measured two lines at 320 and 375 for all 35 names, Maximilian included; recommended. B: keep the words, three lines at 320 only. Mockup: `_private/mockups/tenant-welcome-headline-320.svg`. Built as approved until he picks.
- **Move-in report copy footnote.** Built as "Sent to HG Capital on Nov 23." (section 4): it keeps "HG Capital" and is one line at 320 and 375 for every date. The spec's "through the HG Capital residents page" wrapped on every phone. Mockup: `_private/mockups/tenant-movein-footnote.svg`. For Connor to confirm the words.
