# Job emails that carry the job

Planned with Connor on Nov 14, 2026, one question at a time, each with a low-fi visual. He took the recommendation on most questions and changed several (marked "Connor's call" below). Nothing here is built until Connor says "build it" in chat.

## 1. Summary

**Why.** A contractor's job email today is one line and one button: "Test: Replace kitchen faucet, 118 Congress St. · Rear / Connor started the job / Open task" (`src/lib/email/render.ts`, `src/lib/notifications/content.ts` `taskEmail`). It arrives from a bare `jobs@mail.hgcapitalpartners.com`, its subject changes with every kind of change, and Gmail fills the inbox preview with the letterhead. To do anything, the contractor has to open the portal, and on a phone or browser they haven't signed in on, that means a password. Connor's goal is efficiency, not engagement: the email should carry everything a contractor needs, and anything they do should take one tap or a reply, without forcing them into the app.

**What changes.**

- The email carries the whole job: what's new, the building photo, address with directions, due date with Add to calendar, access, notes, checklist and HG's photos (Q-list 4, 5, 6).
- Its buttons do the next step (Start job, Mark done, Add photos) and open that one job already signed in, lockbox included, with no password (Q3 B).
- Replying to the email adds a comment, and attached photos go on the job (Q1 C, Q6).
- A "Text to my crew" button hands the job to the contractor's team by text, from their own phone (Q5).
- Contractors get three new emails: taken off a job, 8 am on the job's date, and 8 am the morning after it if it isn't done (Q4).
- A contractor can set the day they agreed with the tenant, and it becomes the job's due date (Q10).
- Connor and Pieter's copy gets the same treatment, with the contractor's photos inline and Approve and Send back (Q9).

**Decisions, as Connor took them.**

| # | Decision |
|---|---|
| 1 | Sender name "HG Capital Partners" |
| 2 | Subject: "Due" and the date first, then the job, street and unit. Always "Due", never "Visit" (Connor's call) |
| 3 | A hidden preview line says the change |
| 4 | What changed leads, in its own "What's new" section (Connor's call) |
| 5 | The whole job is in the email |
| 6 | Add to calendar |
| 7 | Access sits behind "Show access" (superseded in part by Q3 B: no password) |
| 8 | Buttons for the next step |
| 9 | Buttons open the job with no sign-in |
| 10 | The date stays in the subject, so a date change starts a new thread (Connor's call, over the recommended one thread per job) |
| 11 | Reply by email |
| Q1 | Contractors get both: one-tap buttons and reply by email |
| Q3 | B: a button opens that one job with access (lockbox and tenant), no password, until the job closes or they lose access. Contractors forward to their crews a lot (Connor's call, over A) |
| Q4 | Emails: today's set, every date move either way, taken off a job, 8 am on the job's date, 8 am the morning after the due date once (Connor's call: 8 am on the day, not the day before) |
| Q4a | The 8 am email goes for every job, on the date the contractor sees |
| Q5 | "Text to my crew", full text: job, address, due date, notes, checklist, link. Never the code |
| Q6 | Reply rules: all six as proposed (section 5) |
| Q7 | Emails still start only after the contractor's first real sign-in. The Nov 14 rule stays (Connor's call, over a switch alone) |
| Q8 | Body order: What's new first, buttons, then the job |
| Q9 | Connor and Pieter's copy gets the same treatment |
| Q10 | A: the contractor sets the day they agreed with the tenant, and it replaces the due date (Connor's call: one date, not a separate visit) |
| Q11 | No phone number in the email or on the job page (Connor's call) |

**Small defaults chosen while writing this, not asked.** Say so if any is wrong.

- A job with no due date: the subject is just the job, street and unit, and no 8 am emails go.
- "Taken off a job" and "canceled" emails start their subject with "Off this job:", not "Due". A "Due" date on a job they're no longer doing would send them there.
- Emails never say "visit". The job page still labels a Scheduled job's date "Visit date"; renaming that is a follow-up (section 11).
- 8 am emails go only for jobs still open (not In review, Done or Canceled). "Once" is once per due date: if the date moves and the new one passes, one more nudge goes.
- The overdue nudge offers Mark done and Change date, not "reply with a new date", since contractors can now set it.
- "Sign out everywhere" and "Remove access" also stop every job link, as they stop sessions today.
- A comment posted through a job link, a crew text's link or a reply from another address shows as the contractor. Staff see the sending address on replies.
- The sender name is added in code (`HG Capital Partners <address>`) when `EMAIL_FROM` has none, so Vercel needs no change.

## 2. The contractor email

### 2.1 Inbox row

- **From:** HG Capital Partners.
- **Subject:** `Due Mon, Nov 23: Replace kitchen faucet, 118 Congress St · Rear`. The street is `shortAddress`, the unit is `unitLabel`, as My jobs shows them (`job-view.ts` `addressLine`). No date: `Replace kitchen faucet, 118 Congress St · Rear`. Taken off or canceled: `Off this job: Replace kitchen faucet, 118 Congress St · Rear`.
- **Preview line:** the What's new headline, then one useful fact. "Connor moved the due date. 2 photos from Connor." Hidden text at the top of the body, padded so Gmail doesn't pull the letterhead in after it.
- **Threading:** each email points `In-Reply-To` and `References` at one id per job and date (`content.ts` `threadKey`, written by `resend.ts`), so mail apps keep one thread per job per date. Gmail splits when the subject changes, which is the date moving (Q10).

### 2.2 Body, top to bottom (Q8 A)

One column: full width on a phone, a centered 480px card on tablet and desktop, as today.

1. **Letterhead,** unchanged.
2. **What's new.** The first line is the headline (16px, the email's one emphasized line). Then each bundled change on its own line, as `itemLines` writes them today, with a comment's photos as up to four thumbnails and "+3".
3. **Buttons.** One primary, full width, for the job's next step (`job-view.ts` `nextStep`): Start job (Open, Scheduled, Waiting), Mark done (In progress), See job (In review, Done). Under it, secondary: Add photos and Text to my crew. Below 360px they stack.
4. **The job.**
   - Building photo (the property's `photoUrl`; left out when none).
   - Title, then street and unit with a Directions link (the job page's `AddressActions` target: Apple Maps, which other phones open as the web map).
   - Due: the date, Add to calendar, Change date.
   - Access: Show access. Left out when the job has no code (and, once the tenant spec ships, no tenant).
   - Notes: the job's notes in full (D16), line breaks kept.
   - Checklist: the items, done ones ticked.
   - Photos: HG's shared photos on the job, up to six thumbnails and "+N".
5. **Footer.** Open job: "Reply to add a comment. Photos you attach go on the job." Closed job: "Reply to reach Connor and Pieter."

No "Comment" button: replying is the way to comment (Q8). No phone number (Q11).

The plain-text part carries the same sections in the same order, with each button as a labeled link.

### 2.3 What's new, per email

Lines follow `itemText` today where they exist. The headline is the bundle's most important line.

| Email | Headline | Primary button |
|---|---|---|
| Assigned | Connor assigned you this job. | Start job |
| Comment or files from HG | Connor: "Faucet's in the garage." | next step |
| Notes changed | Connor updated the notes. | next step |
| Date moved, either way | Connor moved the due date to Mon, Nov 23. | next step |
| Scheduled | Connor set the due date to Thu, Nov 19. | Start job |
| Sent back | Connor sent it back: "Drip under the sink." | Mark done |
| Approved | Connor approved it. Thanks, Zack. | See job |
| Taken off, or canceled | You're off this job. No need to go. | none |
| 8 am on the date | Due today. | next step |
| 8 am the morning after | Due yesterday. Mark done or change the date. | Mark done, with Change date beside it |

The taken-off email carries only the job's title and address: no access, notes, photos or buttons, since the contractor no longer has the job.

## 3. One-tap job links (Q3 B, Q9)

- **What a link opens:** that one job, as the contractor, with everything they can do there today: Start, Mark done (with its finish photos), photos and videos, comments, the checklist, and the lockbox and tenant (each view logged as today, `noteJobViewed`). Not My jobs or any other job.
- **How long:** until the job closes (Done or Canceled), the contractor is taken off it, or staff use Remove access or Sign out everywhere. An older email's link works for as long as that holds.
- **Already signed in:** the link opens the job in the contractor's normal session. A link never replaces a full session with a job-only one.
- **Never acts on its own:** work email scanners (Outlook Safe Links and others) open every link in a message. So a link only opens the page. "Mark done" opens the job with the Mark done sheet up (`?do=done`), "Add photos" at the Updates section (`#updates`), "Show access" at the Lockbox (`#lockbox`), "Text to my crew" with its sheet up (`?do=share`), and nothing happens until the contractor taps on the page.
- **The route:** `/j/<token>` (`src/app/j/[token]/route.ts`). A session it starts carries `PortalSession.onlyTaskId`: the portal's gates send it to sign in anywhere but its job, and `core.ts` `assertContractorAccess` refuses it any other job. It never meets the first-password page.
- **Forwarded:** whoever holds the email can do all of the above as the contractor. That is Connor's call (crews), and the lockbox log will name the contractor.
- **Photos in the email:** uploads are private files, so thumbnails load through the private file route with the email's link as the key (`/api/files/task/<id>?v=thumb&l=<token>`), with the link's lifetime. Once it ends they show as gray tiles. A partner's email gets a STAFF link for this, made only when the email has photos.
- **Add to calendar:** `/j/<token>/calendar`, an all-day `.ics` for the date, titled with the job and address, linking back to the job (`src/lib/portal/job-calendar.ts`).

## 4. Text to my crew (Q5 B)

- **Where:** a secondary button in the email, and a message button in the job page's header, beside Call (the share-in-the-navigation-bar placement iOS uses).
- **What opens:** a small page with the message preview, then Messages, Copy and More (the phone's share sheet). Pattern from Grab's share sheet ([Mobbin](https://mobbin.com/screens/30990611-c4a1-4f07-8fb4-e9eccf6a9cea)): a preview of the text above Copy link, Messages and More. Messages is an `sms:` link with the body filled in (`src/lib/portal/login-text.ts` `smsHref`, reused). More is the Web Share API, as the lightbox's Share on touch.
- **The text:**

  ```
  Replace kitchen faucet
  118 Congress St, Rear
  Due Fri, Nov 20

  New faucet is in the garage. Shut-off under the sink sticks.

  To do: swap faucet, check for leaks

  Lockbox, photos, updates:
  hgcapitalpartners.com/j/k7Qm2x
  ```

  Notes are cut at about 300 characters with an ellipsis. The checklist line lists open items only and is left out when there are none. The lockbox code is never in the text; the link shows it, logged.
- **The link** is a job link (section 3), with its own token so it can be told apart in the log.

## 5. Reply by email (Q1 C, Q6, Q9)

**Setup.** Each email's Reply-To is a per-email address on the sending domain, `r+<token>@mail.hgcapitalpartners.com` (receiving is on for `mail.` in Resend, Nov 14). A reply that reaches plain `jobs@` is matched to its job through the References header the emails carry (`threadKey`); one that matches nothing is dropped. Resend receives it and calls a webhook with `email.received`; the body and attachments come from a second call ([Resend receiving](https://resend.com/docs/dashboard/receiving/introduction), [launch post](https://resend.com/blog/inbound-emails)). The webhook checks Resend's signature. The token names the job and the person the email went to.

**The six rules.**

| Reply | What happens |
|---|---|
| Contractor replies with text and photos | Comment and photos on the job, Shared. Connor and Pieter get the usual email. Nothing comes back to the contractor |
| From another address | Posts as the contractor. Staff see "Zack (from mike@gmail.com)" |
| On a closed job | Not posted (closed jobs are read-only). It goes to Connor and Pieter as an email with its attachments |
| Video too big for email | Text and photos post. One short email back: "Your video was too big for email. Add it on the job." with Add photos |
| Says "done" | A comment only. A reply never changes status |
| Clutter | Quoted email, "Sent from my iPhone" and signatures are cut. Out-of-office and empty replies are ignored |

**Staff replies (Q9).** A reply to Connor or Pieter's copy posts as their Shared comment, addressed to the contractor, who gets it by email as any staff comment today. Their copy's footer says so: "Reply to answer Zack."

Attachments go through the same pipeline as portal uploads (thumbnail, display JPEG, Blob), as files on the comment.

Comparable products: PM Toolbelt lets a vendor complete a work order from an email without an account ([PM Toolbelt](https://pmtoolbelt.freshdesk.com/support/solutions/articles/5000756718-external-vendor-notifications-via-email)); Pilera files email replies and attachments into the ticket ([Pilera](https://www.pilera.com/?p=8321)).

## 6. When emails go (Q4, Q7)

**The gate is unchanged** (docs/specs/contractor-email-switch.md): a contractor gets job emails only once their login is active, they have signed in at least once, and their Job emails switch is on. Bundling is unchanged: 3 minutes quiet, at most 10 (`rules.ts` `BUNDLE_QUIET_MS`, `BUNDLE_MAX_MS`).

| Trigger | Contractor | Connor and Pieter | Today |
|---|---|---|---|
| Assigned | yes | no | same |
| Shared comment or files from staff | yes | no | same |
| Notes changed | yes | no | same |
| Date moved, earlier or later | yes | no | same |
| Scheduled, sent back, approved | yes | no | same |
| Taken off a job | yes, to the one taken off | no | **new**: nothing is queued for them today (`core.ts` `notify` queues for the new assignee only) |
| Canceled | yes | no | **new wording**: "You're off this job" |
| 8 am Eastern on the job's date | yes, open jobs | no | **new** |
| 8 am Eastern the morning after, once per date | yes, open jobs not done | no | **new** |
| Contractor's comment, photos, Start, Mark done | no | yes | same |
| Contractor changes the date | no | yes | **new** (section 7) |

The 8 am emails run from a cron. Vercel's schedules are UTC, so it runs at 12:00 and 13:00 UTC and sends only in the run where it is 8 am in New York. Resend's free plan caps us at 100 emails a day (`DAILY_EMAIL_CAP`); with about 13 open contractor jobs today, the 8 am emails add at most a few dozen on a busy day.

## 7. The contractor sets the date (Q10)

- **Where:** "Change date" in the email's Due row, and on the job page's date. Both open the job page's date sheet (`src/components/date-panel.tsx` `DatePanel`, as the status control's), titled "Due date".
- **What it writes:** the job's due date. On a job that is Scheduled, the scheduled day too, so the two can't disagree. Earlier or later than before, no approval.
- **Staff email:** "Zack moved the due date to Mon, Nov 23 (was Thu, Nov 19)."
- **Effect:** the contractor's next subject, 8 am email and nudge follow the new date.
- **Asana sync:** until cutover, the daily sync holds back a task edited in the app, so a contractor's date isn't overwritten. The build checks that a contractor's edit counts.

## 8. Connor and Pieter's copy (Q9 A)

Same shell, subject and threading as section 2, sent to both partners as today.

- **What's new:** the contractor's lines, with their photos as larger thumbnails (up to four, then "+N").
- **Buttons:** In review: Approve (primary) and Send back. Otherwise: Open task. Send back opens the task page with its sheet up (`?do=send-back`). Approve opens the task page as it is, with the Review banner's Approve at the top: Approve acts on one tap, so a link never presses it. Staff links use the staff sign-in, not job links.
- **The job:** contractor, checklist progress ("2 of 2 done"), due date.
- **Footer:** "Reply to answer Zack." (section 5).

## 9. For Connor to set up

1. **DMARC.** A TXT record at `_dmarc` on the root domain (`v=DMARC1; p=none`), which covers `mail.` and `reply.` too, so work inboxes like `outlawcarpentry.com` don't junk the emails. Resend's DKIM and SPF are already in place.
2. **Receiving.** Receiving turned on for `mail.hgcapitalpartners.com` in Resend (its MX record, `10 receive.forge.rmta.net`, was live Nov 14), and the receiving webhook (`email.received`) at `https://www.hgcapitalpartners.com/api/email/inbound`.
3. **One env var** in Vercel: `RESEND_WEBHOOK_SECRET`, from that webhook.

Sections 2 to 4 and 6 to 8 need none of this. Reply by email waits on 2 and 3.

## 10. Reuse check

**Reused as is:** the outbox, bundling and drain (`notifications/outbox.ts`); `deliveryFor` and the first-sign-in and Job emails gate; `itemLines` and `reconcileItems`; the job page with its Start and Mark done sheets, finish photo slots, composer and upload queue; the lockbox masker and view log; `smsHref`; `DatePanel`; `tokens.ts` `newToken` and `hashToken`; the attachment pipeline; `brand-tokens.ts` for email colors.

**Extended:**

- `email/render.ts`: a sectioned job layout beside the plain one (password reset keeps the plain one), with preview text, thumbnails, a stacked button group and the facts rows.
- `notifications/content.ts`: `taskEmail` builds the full job, `emailSubject` becomes the Due subject, the headline and preview are new.
- `email/resend.ts` and `send.ts`: per-message `reply_to`, `Message-ID` and `References` headers, the display name.
- `tasks/core.ts`: queue for the contractor taken off a job; let a contractor change the due date.
- `portal/session.ts`: a job link opens one job as the contractor.
- The staff task page: a step-ready query for Approve and Send back.

**New:**

- A job link table (hashed token, contact, task, created, revoked) and the `/j/[token]` route.
- The crew share page.
- The email thumbnail route and the `.ics` route.
- The inbound webhook (`/api/email/inbound`) and its reply parser.
- The 8 am cron.

**References:** Resend receiving docs and launch post; PM Toolbelt and Pilera (section 5); Grab's share sheet on Mobbin (section 4). Mobbin has no email layouts, so the email follows the app's own record order (What's new, then the job, as the job page's notice sits above its details).

## 11. Follow-ups, not in this build

- The job page labels a Scheduled job's date "Visit date" while emails say "Due". Rename on the page, or keep.
- Once the tenant spec ships (docs/specs/tenant-contact.md), Show access shows the tenant too.
- A weekly "your jobs this week" email.
- A "Send invoice" button on approved jobs, once contractor invoices exist (docs/contractor-invoices-plan.md).

## 12. Build order

Each lands on its own, behind the device check and the usual landing steps.

1. **The email itself:** sender, subject, preview, threading, the sectioned layout, the full job, Connor and Pieter's copy. No new routes. Buttons open the portal job as today until step 2.
2. **Job links:** one-tap buttons, Show access, thumbnails, Add to calendar, Text to my crew, the staff step-ready links.
3. **New emails and the contractor's date:** taken off, canceled, the 8 am emails and cron, Change date.
4. **Reply by email:** after Connor's DNS and env var (section 9).
