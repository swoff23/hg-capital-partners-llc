# Emails redesign (contractors and partners)

Status: **built Nov 22, 2026 on branch claude/emails-redesign (not committed yet).** Connor said "build it" the same day. All nine questions are answered (section 3). Each question's recommendation came out of an audit of every email (19 contractor kinds, 14 partner kinds, rendered at 390 and 700), research on email engagement and on what task managers (Linear, Asana, Jira, GitHub, Basecamp) and field-service and property platforms (Jobber, Housecall Pro, ServiceTitan, Property Meld, AppFolio) send, a debate between a "lean notification" and a "self-contained email" position on each decision, a judge, and a red team.

## 1. What changed from the first recommendations (after the debate)

- **One button, no outline secondaries.** Under it, Share with crew is the only link. Add photos is already on every page the email opens, so it leaves the email. (Earlier: Start job and Add photos as outline buttons.)
- **Button at the top**, under the headline and any partner's words; never repeated at the bottom (Gmail trims repeated content in a thread).
- **The whole job stays below the button** on open jobs (address, day, Getting in, notes, checklist, photos), labels over values, no building photo, no "What's new" label.
- **The day's link** (Schedule, Reschedule or Add to calendar) sits on its own line under Scheduled | Due, so nothing is squeezed at 320.
- **Short headlines**: the event only ("Connor moved your day to Thu, Nov 27."); the detail goes on the next line.
- **Partner emails only when a partner is needed**: Review, a contractor's or resident's own words, a new request, a day picked after Due. Started, on-time days and photos with no words stay in the app.
- **New**: jobs on hold get their own email and no morning emails; bounced or spam-flagged addresses show "Emails don't reach Zack Miller.". (A crew nudge in Moved and Removed was offered; Connor picked the crew's link updating instead, Q7.)
- **Dropped after the red team**: a night hold (crews leave around 6 am), Home alarms, and showing one partner what the other did (until it actually happens).

## 2. Questions, in order (all answered)

1. What each email is for, and forwarding.
2. Which changes email a contractor right away.
3. Where the button goes.
4. Whole job or short.
5. Who the email is from.
6. Which partner emails stop.
7. Telling crews about a moved or removed job.
8. Timing: the tenant heads-up, the morning emails, jobs on hold.
9. Then the details: the letterhead, subject words, the Review and New request emails, partner words ("task", "this"), Add to calendar, footers.

## 3. Decisions

**Q1. What each email is for, and forwarding: A, safe to forward (Nov 22).**
- Each email exists for one next step, often done from the inbox row without opening it. Success is that step getting done, read from the app's own data, never from opens (Apple Mail preloads every email): New, a day set within one working day; Sent back, resent; Review, a decision; Removed, no trip.
- Forwarding is allowed, never invited or warned against. Share with crew sits under the button as the crew path.
- The first phone screen works as a screenshot: headline, button, Share with crew, title, full address, Scheduled | Due. (Getting in was here; Connor moved it to the end on Nov 22, see Q4. The crew needs the link for the lockbox code anyway.)
- Never in an email: the lockbox code. (A tenant's name and number were here too until Connor, Nov 23: the contractor's open-job email now lists who lives there under Getting in, the name over the number as a tel: link, so the crew can call or text without opening the job. A forwarded email carries them.)
- Mockup: `_private/mockups/email-q1-purpose-forwarding.svg`.

**Q2. Which changes email a contractor right away: A, anything that changes the trip (Nov 22).**
- Rule partners can predict: if it changes what the contractor does, where or when, it emails, after the 3-minute bundle, at any hour (no night hold).
- Emails: New; Sent back; a partner's Shared comment; a notes or checklist edit (Update); a day moved or a first day set by a partner (Moved); any Due change (see below); On hold (new); Removed for taken off, canceled, deleted and a resident's cancel.
- Due changes (Connor, Nov 22: "shouldn't they get an alert about that?"): every Due change emails, set, earlier, later or cleared, as Update ("Connor moved Due to Fri, Dec 4."). When the new Due lands before their day it's Moved, with Reschedule. Skipped while the job is in review, since their work is done. Due is the date HG Capital holds them to, so they hear about every change.
- No email of its own: photos or files with no words, and a partner changing the status for them. They show on the job, and as a line when they land in a bundle that's already sending.
- Mockup: `_private/mockups/email-q2-what-sends.svg`.

**Q3. Where the button goes: A, top, once (Nov 22).**
- One dark button, right under the headline and any partner's words; never repeated at the bottom. It is the reader's next step, the same one the job page's bar shows: Schedule (no day), Start job (day set), Send for review (started, and after a Sent back note), Text the tenant (Tell the tenant), Approve for a partner's Review with Send back as a link. No button on Removed, On hold or a job in review.
- Share with crew is the only link under it, on every open job, with a share icon before the words: lucide `Share`, the job page header's icon (`crew-text.tsx`). Gmail doesn't render SVG, so the email uses a hosted 16px PNG of it in `--muted-foreground`, with empty alt text so the link still reads "Share with crew".
- The New email's headline is **"Connor sent you a new job."** (Connor, Nov 22). The job page's story line keeps "Connor gave you this job", since there it's a record, not news.
- Desktop: the same 480 column, centered; the button keeps the column's width. At 320 it stays one line.
- Mockup: `_private/mockups/email-q3-button-placement.svg`.

**Q4. Whole job or short: A, the whole job every time (Nov 22).**
- Every open-job email carries the whole current job below the first screen: notes, checklist, photos (small thumbnails with "+3", as today), labels over values, no building photo. The newest email about a job is always a complete copy that works with no signal.
- An edit to the job (notes, checklist) shows in the inbox row ("Connor edited the notes: "36-inch vanity, not 30."") and is marked "changed" beside its label, in place; the order never moves, so the first screen stays the crew screenshot. A partner's own words sit above the button instead (Q3).
- **Order** (Connor, Nov 22, at build): title, address, Scheduled | Due with the day row, notes, checklist, photos, then **Getting in last**, since it matters least once the job is planned. The job page keeps its own order.
- Removed, On hold and jobs in review get the headline and one line (title, street and unit), with no button, no details and no Share with crew. On hold names what it waits on.
- Mockup: `_private/mockups/email-q4-whole-job.svg`.

**Q5. Who the emails are from: A, one name, plus who wrote (Nov 22).**
- Contractor emails come from "HG Capital" (today "HG Capital Partners"). Who acted leads the preview and the headline ("Pieter: …", "Connor sent you a new job.").
- Partner emails come from "Zack via HG Capital" when a contractor's own words or action leads the email, and "HG Capital" otherwise. A resident never gets "via", since a reply doesn't reach them.
- Reply-To stays the job's own reply address, so a reply always posts on the job.
- Mockup: `_private/mockups/email-q5-from-name.svg`.

**Q6. Which emails partners get: A, only when you're needed (Nov 22), with contractors' full names.**
- Partners get: Review (Approve, with Send back as a link); a contractor's or resident's own words; a new request (Assign while unassigned) and a resident's addition or cancel; a day picked after Due, or a day removed with Due 3 days out or less (Update); a contractor's reply on a closed job; account emails.
- No partner email for: Started, a day set or moved on or before Due, photos or files with no words, a day removed with Due more than 3 days out. They stay in the job's story and on Today.
- Skipped at send time when that partner already saw the change in the app; a Review email drops if the job left Review or the other partner already decided; a New request drops once it's assigned.
- **Contractors by full name** in every partner email (Connor, Nov 22), from `Contact.fullName`: From "Zack Miller via HG Capital", previews "Zack Miller: "Doors arrive Thursday."", headlines "Zack Miller sent this for review." Contractor emails keep naming partners by first name ("Connor sent you a new job.").
- Mockup: `_private/mockups/email-q6-partner-emails.svg`.

**Q7. Telling crews about a moved or removed job: B, only the crew's link updates (Nov 22).**
- Moved and Removed emails get no crew line. Moved keeps the usual Share with crew link under the button; Removed has none.
- The crew's link always shows the current day. After a cancel, a delete or a resident's cancel it says **"This job is canceled. No need to go."** with the title and street (today "This job isn't available"). Spelled with one l, as everywhere else in the app (the Canceled status, "Connor canceled this job").
- When the contractor is taken off the job, the crew's link says "Zack is no longer on this job. No need to go.", since the job itself isn't canceled.
- The crew text stays as Connor picked earlier (title, address, day, link; contractor-scheduled-date.md section 12). The lockbox code needs the link anyway, so adding Getting in words to the text buys little.
- Mockup: `_private/mockups/email-q7-crew-nudge.svg`.

**Q8. When the morning emails go: A's rules at 7 am (Nov 22).** Connor kept 7 am (today 8 am, `REMINDER_HOUR`); the rest is A.
- One morning email per job per day at most, at 7 am Buffalo time, and none while a job is on hold (remove WAITING from `REMINDER_STATUSES`) or in review.
- **Tell the tenant** (homes that need notice only: someone lives there and Permission to enter is off): 7 am two mornings before their day. A day set inside that window sends it at once.
- **Today**: 7 am on their day.
- **Still open**: 7 am the morning after their day, only if they never started ("Your day was Thu, Nov 26. Start the job or pick a new day."). In-progress work isn't nagged.
- **No day yet**: once, the second morning after New, or the morning before Due if that comes first.
- **Due today** and **Due yesterday**: only while no day is set. Once a day is set, their day leads.
- Mockup: `_private/mockups/email-q8-morning-timing.svg`.

**Q9. The details: all taken as drawn (Nov 22).**
- **Letterhead:** job emails open with a one-line mark (the 24px tile and "HG Capital Partners" at 13px semibold, no gold rule), then the headline. Invite, sign-in and password emails keep the full letterhead with its gold-deep rule (brand-guidelines.md section 6).
- **Subject words:** "Word: title, street · unit". The word and the title land in the first 38 characters. The due date leaves New's subject (today "New, due Friday:"); the preview carries it. Absolute dates only.
  - Contractor words, highest first when a bundle mixes kinds: Removed, Sent back, Moved, On hold, New, Update, then the morning words Tell the tenant, Today, Still open, No day yet, Due today, Due yesterday. No day yet's subject names the Due date instead when the job has one ("Due Thu, Nov 26: …", Connor, Nov 23); its preview then reads "No day yet. Pick a day to go." When Tell the tenant applies in the same email, it picks the word and the move goes in the headline. Whenever a partner's words are in an email, the preview is their words.
  - Partner words: Review, New request, Update, Canceled (a resident's cancel), Done (words or a reply after the job closed).
- **Previews:** one new fact the subject lacks, under about 90 characters, never the subject again. New: "Due Thu, Nov 26 · The tenant must be home". Moved: "Connor moved your day to Thu, Nov 27 (was Tue, Nov 25)." A partner-set first day: "Connor set your day: Thu, Nov 27." Due moved before their day: "Due is now Mon, Nov 23, before your day (Tue, Nov 24)." Removed: "Connor canceled this job. No need to go." Today: "118 Congress St, Rear · Let yourself in". Still open: "Your day was Tue, Nov 24. Start the job or pick a new day." Review: Zack's first words. At risk (Update): "Zack Miller picked Mon, Nov 30. Due is Fri, Nov 27."
- **Headlines:** the event only, two lines at most at 320 ("Connor moved your day to Thu, Nov 27."); the was-day, Due and any note go on the next line or in the quote. On an In progress job, Removed reads "Connor canceled this job. Reply with what's done so far." No greeting on job emails; account emails keep "Hi Zack, here's your link to sign in to HG Capital jobs." and both resets get the same shape.
- **Review email:** headline "Zack Miller sent this for review."; his note in full, quoted; two photo tiles at half the column, then "+3 more · Checklist 3 of 3 done"; Approve (dark, full width) with Send back as a link under it; the title, street and unit, Due | Scheduled; footer "Reply to answer Zack Miller." No building photo, no Directions. Approve opens the task with Approve ready (still two taps, its 2-minute Undo kept); a `?do=` on a task already decided shows the outcome line ("Pieter approved this · 9:14 AM") and strips the param.
- **New request email:** From "HG Capital"; headline "Dana · 52 Elm St, Upper"; her words in full, quoted (the 200-character cut goes); her photos as the Review email's tiles; "Dana must be home · No pets" on one line (two lines at 320 if needed, never cut); Assign, opening the task with the assignee picker up (new `?do=assign`; if someone was assigned first, the page says who); "Due today". No footer and no reply address while unassigned. An addition on an unassigned request keeps Assign; once assigned it gets Open task. A request and its cancel in one bundle send nothing.
- **Partner words:** the task page's words. "Task", not "job"; "this", not "it"; "Assignee", not "Contractor". Lines read like the task's Activity ("Zack Miller moved the scheduled day to Fri, Nov 27, after the due date."). An Update email shows the status as one muted line in the action slot, in the task list's words ("In progress", "Scheduled Tue, Nov 24", "Waiting on National Fuel"). Details are label over value: title, street and unit, Due | Scheduled, "Checklist 2 of 3 done".
- **The day row:** Reschedule under a set day; Add to calendar only on the Moved email (a partner set or moved their day); nothing under "Not set", since the button already says Schedule. "Change day" goes.
- **Footers:** one line. Open job: "Reply to post an update or photos." When one partner's own words lead, "Reply to answer Connor." sits right under the quote and the footer drops it. Closed job: "Reply to reach Connor and Pieter." Removed, and emails whose lines are only a resident's: none. No unsubscribe, "why you got this" or "Pieter got this too" lines. Account emails keep "If you didn't ask for it, you can ignore this email."
- **Tell the tenant:** headline "Your day is Wed, Nov 25."; preview "They need 24 hours' notice."; button Text the tenant. The orange notice box and the "Tell the tenant today." line go.
- **Dark mode:** no dark theme this round. The gold rule, the orange box and the green checklist ticks go, so nothing inverts badly. Before landing, open New, an Update bundle and Review in Gmail on a real iPhone in dark mode.
- **Phone:** inline styles only. 238px of content at 320, 293px at 375. Button full width, about 46px tall; text links 44px tall, nowrap; nothing under 13px; `-webkit-text-size-adjust:100%`. Job photo rows: at most 3 tiles of 64x48, then "+N".
- **Desktop:** the same 480 column, centered; nothing added on wide screens.
- Mockup: `_private/mockups/email-q9-details.svg`.

## 4. Every email after the change

Contractor (to the contractor's login email, From "HG Capital", Reply-To the job's own address):

| Word | When | Button | Body below the first screen |
|---|---|---|---|
| New | A partner gives them a job (3-minute bundle) | Schedule, or Start job if a partner set the day | Whole job |
| Update | A partner's Shared comment, a notes or checklist edit, any Due change that stays on or after their day | The job's current step | Whole job; an edit marked "changed" |
| Sent back | A partner sends it back | Send for review, under the note | Whole job |
| Moved | A partner sets or moves their day, or Due lands before their day | The job's current step; Reschedule or Add to calendar in the day row | Whole job |
| On hold | A partner puts a job they already have on hold | None | Headline and one line, naming what it waits on |
| Removed | Taken off, canceled, deleted, or a resident's cancel (not when the job is in review) | None | Headline and one line |
| Tell the tenant | 7 am two mornings before their day, at a home that needs notice; at once when a day lands inside that window | Text the tenant | Whole job |
| Today | 7 am on their day | Start job, or Send for review once started | Whole job |
| Still open | 7 am the morning after their day, only if never started | Start job | Whole job |
| No day yet | Once: the second morning after New, or the morning before Due if sooner | Schedule | Whole job |
| Due today, Due yesterday | 7 am, only while no day is set | Schedule | Whole job |
| Account | Invite, sign-in link, password reset, the reply-problem email | One | Full letterhead |

Partner (to Connor and Pieter, From "Zack Miller via HG Capital" when a contractor leads, else "HG Capital"): Review, a contractor's words (Update), New request, a resident's addition (Update), Canceled, a day after Due or a day removed with Due 3 days out or less (Update), a closed-job reply (Done), account emails. Nothing else.

## 5. Reuse check

**Reused as is:** the outbox and its 3-minute bundle (`src/lib/notifications/outbox.ts`, `rules.ts` `BUNDLE_QUIET_MS`); the every-minute cron and once-per-date marker (`reminders.ts`); the one-job thread headers (`src/lib/email/resend.ts`, `content.ts` threadKey); REPLY tokens and inbound replies (`src/lib/email/replies.ts`, `inbound.ts`); job links and the crew link (`src/lib/portal/job-links.ts`, `jobs.ts` `crewTextFor`, `crew-text.tsx`); `smsHref` for Text the tenant; `accessState` and `homeIsVacant` (`src/lib/tasks/lockbox.ts`) for homes that need notice; `Contact.fullName`; the photo strip (`render.ts` `photoStripHtml`); the `?do=` landings on the job page and the task page (`review-banner.tsx`); the daily cap and its banner (`content.ts`, `sent-count.ts`).

**Extended:**
- `rules.ts` `notifyAudience`: CHECKLIST to the contractor, Shared ATTACHMENT with no words and staff status changes off, partner audience narrowed to section 4.
- `reminder-rules.ts`: `REMINDER_HOUR` 7, WAITING out of `REMINDER_STATUSES`, Tell the tenant two mornings ahead, Still open, No day yet, Due kinds only while no day is set.
- `content.ts` and `render.ts`: one skeleton for every job email (mark, headline, quote, one button, Share with crew with its icon, labels over values, the day row, the "changed" marker, one footer line); subject words and previews; From names; an audience switch in the line text for partner words.
- `core.ts`: Removed for a delete and a resident's cancel; On hold; nothing on take-off from a job in review.
- The crew link's gone states (`src/app/(portal)/p/jobs/[id]/not-found.tsx`, `src/app/j/[token]/route.ts`): "This job is canceled. No need to go." and "Zack is no longer on this job. No need to go."
- The inbound webhook (`src/app/api/email/inbound/route.ts`, today `email.received` only): handle `email.bounced`, `email.suppressed` and `email.complained`, show "Emails don't reach Zack Miller." under a partner's update, and alert Connor on a spam report.
- The task page: `?do=assign` opens the assignee picker; any `?do=` on a decided task shows the outcome line.

**New:** the share icon as a hosted 16px PNG (lucide `Share`, `--muted-foreground`; Gmail doesn't render SVG); the Moved, On hold, Still open and No day yet kinds.

**References:** NN/g on scrolling and attention and on transactional email; Gmail's trimmed content in threads; Postmark on Apple Mail Privacy Protection; Property Meld vendor notifications and owner access levels; Indeed Hiring Lab (Census ACS) on trade start times; Google Docs' "Name (via Google Docs)" sender pattern.

## 6. Checks before landing

- Render every kind at 320 and 375 and fail on: more than one button row, a wrapped or split link, a headline over two lines, a notice or footer over one line, a button bottom past 400px at 375.
- Send two Update emails for one job to a real Gmail and check they join one thread; if not, give each its own Message-ID and point In-Reply-To and References at the job's first real email.
- Open New, an Update bundle and Review in Gmail on a real iPhone, light and dark.
- Test emails only to the test contractor account, with Connor's OK per send.
- Connor's dashboard step: turn on `email.bounced`, `email.suppressed` and `email.complained` for the Resend webhook.

## 7. Bugs to fix whatever is decided

From the two audits' critics: a resident's cancel and a deleted job email the contractor nothing; a job on hold gets Due today and Due yesterday emails; Removed says "No need to go" on a job already in review; "Change day" shows with no day set; any iCloud or Drive link in a reply gets "Your video was too big"; a send-back note loses its line breaks; Add to calendar in an old email opens a bare Not found; a partner's reply can reach the wrong contractor after a reassignment; a scheduling bundle's headline can name a day the job no longer has; Remove day never names the day; files dropped from a closed-job reply go unmentioned; move-in reports email no partner; replies that can't post vanish.

From the debate, shipped with the build: the Removed email gets a reply address; a reply that can't post (taken off, access removed, login off) goes to both partners through the closed-job forward, with the job named; a fresh email to the jobs address from a known contractor's login (DMARC pass) also reaches both partners; a partner's reply link stores the contractor it was about, and posts Internal if that contractor has left the job; the reply-problem email's "Error:" subject becomes "Some files didn't post: <title>"; the stale "Done:" email after an Approve inside the bundle drops; a partner day-move line gets its period after ")" and keeps the was-day.
