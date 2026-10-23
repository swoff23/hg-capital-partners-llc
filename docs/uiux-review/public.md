# Login and the public site

Part of the [UI/UX review](README.md). 53 findings: 0 critical, 8 high, 28 medium, 17 low.

## How it should work

The public side becomes a small, quiet storefront and front desk for a two-person landlord, built from patterns renters and residents already trust. Real photos and plain facts carry it, and gold stays the one accent. Brand lives here and plain data lives in the app, the same split Wise keeps.

Rentals. Each home is a borderless photo card with a two-line caption that names the street and the neighborhood, the way Airbnb captions its homes (https://mobbin.com/screens/a92f14ea-1a94-4a63-99f3-8b5fbd42d106). The listing page follows Zillow. It has a photo mosaic with See all photos, and rent sits beside large beds, baths and square feet. Fact tiles say "Ask us" when a value is missing (https://mobbin.com/screens/558ec748-c7ad-4aee-bb26-3ff3b71b8b00), and a costs block splits monthly charges from one-time ones (https://mobbin.com/screens/8ba8e816-15cf-4aab-9845-eb16043cb077). The main button books a showing and names the earliest slot. It uses Zillow's pick-up-to-three-times flow (https://mobbin.com/flows/dd16a70f-e8b8-4b47-94e4-d338d1f551b0), then a Cal.com confirmation that restates what, when and where (https://mobbin.com/screens/89fb725d-05c6-4acd-9091-66c50f16e4ec). On phones, rent and the button sit in a pinned bottom bar, as on Airbnb (https://mobbin.com/screens/8a6b4476-52d7-4c85-965b-2a870b388eb3). A short owners block puts Connor and Pieter where Airbnb puts the host (https://mobbin.com/screens/a38c5826-b563-4163-8c8d-db0c130fc1a8).

Residents. The hub is one list of Monzo-style rows with one-line sublabels, and Emergencies comes first (https://mobbin.com/screens/2fb301d6-a472-415b-8f7a-e1e3ba077eae). Maintenance becomes a Thumbtack-style intake: one question per screen, percent progress, optional photos with Skip and a lock line saying who sees what (https://mobbin.com/flows/677520e0-5c6d-4e12-ba93-bf0b52a753a7). Each request becomes a Task, and the resident gets a status link drawn as a Wise timeline. Done steps carry dates, the current step is bold and future steps are gray (https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614).

Move-in. The report follows Airbnb's setup pattern, with Save & exit, a segmented progress bar and pinned Back and Next buttons (https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394). Before sending, a Gusto-style review lists only the Fair and Poor items (https://mobbin.com/screens/eeeecee8-9984-410b-844c-006585e5a934). The sent screen then says when the resident will hear back, as Thumbtack does.

Sign-in. The page uses Mercury's layout: labeled fields, a Show button on the password field and Forgot password? directly under it (https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7). A contractor's first sign-in shows one Choose your password screen with live rule checks, as Cal.com does (https://mobbin.com/screens/fd16d9ca-0d86-4d60-9434-7ffbb6a8a0b4), and then lands on My jobs.

Nothing here adds chrome. Each piece answers a question a renter or resident would otherwise have to text.

<details><summary>What the reviewer covered</summary>

Server on port 3200 was up. Every page was signed out unless noted. Routes and viewports: /welcome (desktop 1280, wide 1920, tablet 768, mobile 375, narrow 320), /rentals (desktop, tablet, mobile, narrow, with scroll steps), /residents (desktop, tablet, mobile, narrow, plus tile hover), /residents/moving-in (desktop walk at 6,929px, mobile walk at 7,448px, narrow at 8,208px, tablet), /login (desktop, tablet, mobile, narrow), /login?error=bad (desktop, mobile), /login?error=locked (mobile), the root / rewrite, the 404 page, and a signed-out deep link to /tasks/[id] that redirects to /login. WebKit at 375 on all five routes, plus the move-in select. Dark theme forced at desktop; the public site correctly ignores it. States I exercised: toggling move-in rating chips; adding a second bathroom and its Remove control; submitting the empty form (native validation bubble); an invalid email; a filled submit, where the blocked POST sent the whole page to the error boundary; a login submit, where the blocked POST showed Next's default white error page; and both login error states. I measured tap targets, label/aria coverage, computed colors and color-scheme, and the meta tags, and read the ARIA trees for welcome, rentals, residents, login and moving-in. I also checked the signed-in property page to confirm the 767 Prospect listing is 'Available' with 'No details yet'. Could not reach: (1) the move-in sent screen, because submits are blocked; I reviewed it from move-in-form.tsx:111-119. (2) The photo carousel with real photos, because none of the 3 public listings has a photo in the local DB; I reviewed it from photo-carousel.tsx. (3) The 'Previously Leased' section, because no listing is LEASED. (4) A successful sign-in. Mobbin: 15 searches covering screens, sections and flows on web and iOS. Mobbin reported that its AI usage is high this month (unlimited during beta; 780 credits used).

</details>

## Findings

### PUBLIC-007

**The 'Additional comments' box renders as a small inline box beside its label**

High · Fix · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. Fixed on main in fa4c400 (fix batch 2, app-wide): The move-in 'Additional comments' textarea is now a full-width box under its label ('block w-full' in src/app/(marketing)/residents/moving-in/move-in-form.tsx). Left: PUBLIC-007: I left the comments box at 3 rows; the review's 4-row suggestion is a size change, not part of the bug.
- **Today:** The textarea has no block or w-full class. At desktop it sits inline to the right of 'ADDITIONAL COMMENTS', about 200px wide. On phone it wraps below the label but is only about 220px of a 327px column, with the resize handle showing.
- **Why:** It's visibly broken at the moment the resident is wrapping up, which makes the form feel unfinished.
- **Change:** Make it a block, full-width textarea under its label, 4 rows, matching the other fields' border, radius and padding.
- **Desktop, tablet, phone:** Full column width at every size.
- **Reuse:** Textarea pattern; ideally the public Field primitive from PUBLIC-050.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:188-196`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:190-195`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:190-194`
- **Also found as:** PUBLIC-IV03 (Login and the public site), JOURNEYS-I17 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Measured: the textarea is 204px wide at x=458, inline after the label, at desktop; at 375 and 320 it's 218px of a 327/272px column, with the resize grip (verify-PUBLIC/movein--textarea--desktop-light.png, --narrow-light.png). It's a one-class fix (block w-full). The Field primitive cross-reference should be PUBLIC-049, not PUBLIC-050.

### PUBLIC-009

**The front page has no property photography, just a gray radial glow**

High · Design change · effort M · `/welcome` · Rentals, residents and the public site run one lifecycle

- **Today:** HERO_PHOTO is null and the repo has no public/ folder, so the home page is a centered 24px sentence and two pills over a radial gradient pool. Login repeats the same glow.
- **Why:** Two house rules: 'Real property photography on the public site' and 'No stock gradient blobs'. HG's product is its homes. Premium sites lead with the real thing, and an empty dark page reads as a template.
- **Change:** Use a full-bleed exterior photo of an HG building (next/image, priority, sized per breakpoint) with the header over it, a soft dark scrim only at the bottom, and the headline left-aligned at the bottom-left. Remove the radial glow from welcome and login.
- **Desktop, tablet, phone:** Desktop 1280: photo at 80vh, headline bottom-left over the scrim. Tablet 768: 70vh. Phone 375: 56vh crop to the facade, with the headline and links below the photo on solid near-black so text never sits on busy pixels.
- **Reuse:** next/image and the existing HERO_PHOTO hook in welcome/page.tsx.
- **References:** 
  - [In Common With](https://mobbin.com/sites/sections/117819d3-b992-4d33-b55e-9bdd2832e850): Full-bleed interior photo with a quiet nav laid over it.
  - [Samara](https://mobbin.com/sites/sections/19d48f9c-20f5-4d4e-84a8-a0abfcf2133c): Dark header over real home photography, minimal copy.
- **Code:** `src/app/(marketing)/welcome/page.tsx:15-26`, `src/app/login/page.tsx:22`
- **Verification:** confirmed. Seen: centered sentence and two pills over a radial glow; HERO_PHOTO is null and there's no public/ folder; login repeats the glow (login/page.tsx:22). This breaks two house rules (real property photography, no gradient blobs). Samara exists on Mobbin with real home photography and large type. I didn't see the cited 19d48f9c section, but the sites/sections URL format is valid. Connor has to supply the photo.

### PUBLIC-012

**Move-in report is one 7,400px scroll; break it into room-by-room steps**

High · Design change · effort L · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Five rooms and 46 items, each with 4 chips and an always-visible comment field, sit on one page: 6,929px at desktop, 7,448px at 375, 8,208px at 320, and 8,472px after adding a bathroom. Name, email and submit sit at the very bottom, under a 1,700px checklist.
- **Why:** There's no sense of progress, nothing on screen says how much is left, and errors show up far from their fields. Long forms on fintech and onboarding flows go one step at a time with a pinned Continue.
- **Change:** Step 1 'About you': name, email, property, unit and date. Then one step per room, with a progress bar and 'Kitchen, 2 of 6'. A final step adds comments and a review with 'Send report'. Keep the checklist on its own above a 'Start the report' button.
- **Desktop, tablet, phone:** Desktop 1280: centered 560px column, progress bar at top, Back and Continue right-aligned. Tablet 768: same column, Continue pinned to the bottom. Phone 375: full width, Continue pinned above the safe area, Back as a top-left chevron.
- **Reuse:** MoveInForm state shape (sections by key) stays; Button pending pattern.
- **References:** 
  - [Airbnb](https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394): Listing setup puts Save & exit at the top left, a segmented progress bar above pinned Back and Next buttons, and one topic per screen.
  - [Thumbtack](https://mobbin.com/flows/677520e0-5c6d-4e12-ba93-bf0b52a753a7): One question per screen with a percent in the header (70%, 75%) and a single full-width Next.
  - [Typeform](https://mobbin.com/screens/f723d9fd-d12e-4a1b-8673-afb1a1af0cec): A thin progress bar at the very top, with 'OK, press Enter' for desktop keyboard flow.
  - [Kraken](https://mobbin.com/flows/77e1ecc1-229e-4ade-8387-61a1078ec203): Top progress bar, one question per screen, pinned Continue, payoff screen.
  - [Nutmeg](https://mobbin.com/flows/c1f0d568-58af-4cca-b75a-77d47c05e54f): Grouped questions per step with a calm progress bar.
  - [Airbnb](https://mobbin.com/screens/ec80a9d5-c5dc-4910-8ed2-621c58ac1bf4): One question per screen, Save and exit at the top left, a segmented progress bar and pinned Back and Next at the bottom.
  - [Airbnb](https://mobbin.com/screens/602422da-e72d-4e16-a4a7-2d91d1b31447): Option cards with a title and one-line sublabel; the picked card gets a heavier border and tint.
  - [Airbnb](https://mobbin.com/screens/f8e40672-eb5e-44fe-bef9-827075ba9221): Stepped form with a progress bar and sticky Back / Next
  - [Blinkit](https://mobbin.com/screens/6fe81e51-af6c-4bf1-8cb1-33972e198fbd): Per-item rating with a comment box and 'Add photos' inside each item
  - [Turo](https://mobbin.com/screens/307259ee-c04f-4129-8d5f-b46a0f9393c7): Condition check step asking for photos with one primary 'Add photos'
  - [Gusto](https://mobbin.com/screens/eeeecee8-9984-410b-844c-006585e5a934): "Step 3 of 3" Review and submit: a summary strip and table before the final Submit, with Back beside it.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:122-234`, `probe: pill height 26.5px, text-[0.6875rem]; no input[type=file]`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:300`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:40-47`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:220-232`
- **Also found as:** MOBILE-017 (Lens: phone and tablet experience on every route), JOURNEYS-I05 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Heights reproduced: 6,929 / 6,938 / 7,448 / 8,208px at 1280 / 768 / 375 / 320, with 46 items and 184 chips. Kraken's stepped flows with a top progress bar and pinned Continue exist on Mobbin; I didn't open 77e1ecc1 itself. This finding reshapes PUBLIC-014, 039 and 042, so they should ship as one design.

### PUBLIC-013

**Sent screen is a generic bordered 'Thanks!' box with no next step**

High · Design change · effort S · `/residents/moving-in (sent state)` · Rentals, residents and the public site run one lifecycle

- **Today:** After a successful send, the form becomes a bordered box: 'Thanks! Your move-in report is in. We've received it and will follow up if anything needs attention.' It has no art, no summary of what was reported, no next step and no record. The scroll position isn't reset after the 7,000px form collapses.
- **Why:** House rule 'Make payoff moments count' and 'Close the loop': show what happened and what's next. This is listed as the app's only payoff moment.
- **Change:** Scroll to the top and show single-color line spot art of a key or door. Heading: 'Thanks, Dana. Your report is in.' A one-line summary: '3 items flagged: Oven (Poor), Bedroom 2 window (Fair), Smoke alarm (Poor)'. A next step: 'We'll text you within 2 business days about the flagged items.' Add 'A copy is on its way to dana@...' and a secondary link 'Back to resident help'.
- **Desktop, tablet, phone:** Desktop and tablet: centered 480px block. Phone: full width, art at 96px, text left-aligned under it.
- **Reuse:** New spot art (docs/components.md known gap). The first name comes from the submitter field, per the real-data rule.
- **References:** 
  - [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): The submitted screen pairs single-color line art and a plain heading with a one-row summary and two next actions (See pay history, Create another payment).
  - [Thumbtack](https://mobbin.com/flows/677520e0-5c6d-4e12-ba93-bf0b52a753a7): The flow ends on 'We'll let you know when someone responds. You should hear back by 12pm.' Take the named time.
  - [Cal.com](https://mobbin.com/screens/89fb725d-05c6-4acd-9091-66c50f16e4ec): The confirmation restates What, When, Who and Where in a label column, then 'Need to make a change?'
  - [Hotjar](https://mobbin.com/screens/1cd0a18c-fdf9-45d5-b764-d14ac7dd0ab3): Line spot art, warm heading, echo of the email that gets the follow-up.
  - [Selfridges](https://mobbin.com/screens/2fbd86d8-e530-4342-b044-861109fa5864): Submission summary with status and a 'What's next?' line.
  - [Fiverr](https://mobbin.com/screens/c2d43ea4-538f-4a3b-9796-550b1f9e75fb): Simple line illustration plus two clear next actions.
  - [Gusto](https://mobbin.com/screens/8d02d16c-e063-4c06-a308-03b3b97340e9): 'Here's what happens next' as a dated vertical timeline (Today, then Nov 15), with a sentence per step.
  - [Alan](https://mobbin.com/screens/2380e885-e813-45b1-889e-c613332e8fc5): "Your request was sent!" with a received / being processed / done timeline and expected timing.
  - [Ro](https://mobbin.com/screens/4f1b2a26-79ae-4154-b286-741e351ff7d9): "What's next" steps with typical durations under the confirmation.
  - [Wise](https://mobbin.com/screens/258d0c53-8e43-470a-812b-bb411a7e6ae2): 'Next we'll check your documents... We'll let you know when you're verified.' says what happens next and who acts.
  - [Monarch](https://mobbin.com/screens/37b0330a-a415-4b48-a6ac-e6a5029a94e7): 'Holding added · VTI is now tracked in your portfolio' says what changed
  - [QuickBooks](https://mobbin.com/screens/c846a277-b056-4f86-a879-8822b316bc1d): Success screen states the next commitment ('We'll remind you 15 days before')
  - [Mercury](https://mobbin.com/flows/9c80fd70-83ab-4dfa-8d3a-51359a904365): "You've sent a wire payment. The money should arrive within 1 business day." Then the new record with a Pending chip, Done and Make Another Payment.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:111-120`, `docs/components.md:65`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:107-120`, `movein mobile pageHeight 7448`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:111-119`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:114-117`, `src/app/(marketing)/residents/moving-in/actions.ts:116`
- **Also found as:** FEEL-037 (Lens: interaction quality, feedback, states, speed and accessibility), COPY-057 (Lens: words on every screen), COPY-V11 (Lens: words on every screen), JOURNEYS-I04 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Checked in code only; the harness blocks the write. The proposed copy needs Connor before it ships: 'We'll text you within 2 business days' is a promise under the copy rules, and 'A copy is on its way' depends on PUBLIC-046 and Resend (D30). Also move focus to the heading, or use role=status, so screen readers hear the result.

### PUBLIC-016

**Sign-in fields have no labels and the page has no heading**

High · Fix · effort S · `/login` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /login: 0 <label> elements and no h1. The fields are now named by aria-label ('Email', 'Password') rather than only placeholders, but nothing visible labels them once typing starts. The placeholder color is still #4c525c. The only heading-like text is the gold 'HG LOGIN' paragraph. AuthFrame gives the forgot page an h1 ('Forgot your password?'), but /login passes no title.
- **Today:** The ARIA tree shows a paragraph 'HG Login', textbox 'Email' and textbox 'Password'. The names come only from placeholders (labels=0), and there's no h1. The placeholder color #4c525c is about 2.4:1 on the background and disappears once typing starts.
- **Why:** Screen-reader and autofill users get a weak structure, and sighted users lose the field name as soon as they type. Stripe and Mercury both use visible labels and a heading.
- **Change:** Add an h1 'Sign in to HG Capital' (sentence case, 24px, off-white) and visible labels 'Email' and 'Password' above the fields at 13px medium in muted gray. Leave placeholders empty.
- **Desktop, tablet, phone:** Same 360px column at all sizes; labels stay above the fields on phone.
- **Reuse:** Public Field primitive (PUBLIC-050).
- **References:** 
  - [Stripe](https://mobbin.com/screens/f35ac0f9-dcb8-4060-b2fb-54f48f15740f): Heading, labels above fields, show-password eye.
  - [Mercury](https://mobbin.com/screens/95e22d1e-0d70-469b-b7c7-58090c5da404): Plain 'Log in' heading with labeled fields.
  - [Mercury](https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7): 'Log in' heading, labeled fields, 'Forgot password?' under the password field
  - [Mercury](https://mobbin.com/screens/85da4e09-98b5-4461-b34b-3653b5083e6f): Plain error under the field it concerns
  - [OpenAI Platform](https://mobbin.com/screens/5fe45e48-5dbc-4903-8ca4-ecfe5507ace9): The email stays filled, the password field turns red with "Incorrect email address or password", and an eye toggle sits inside it.
  - [Quo](https://mobbin.com/screens/89fe766d-c4d6-4529-a14b-f0c30ecb8ecc): Labelled fields, inline error under the password, Reset password link.
- **Code:** `src/app/login/page.tsx:24-53`, `branch src/app/login/page.tsx:23-51`, `branch src/app/login/_components/auth-frame.tsx:29-33,44-45`, `src/app/login/page.tsx:9-10,25,36-58`, `branch src/app/login/page.tsx:11, 23-64`, `branch src/app/login/_components/auth-frame.tsx`, `branch src/app/login/forgot/page.tsx`, `login eval: placeholder rgb(76,82,92), button disabled false while pending`, `src/app/login/page.tsx:28-59`, `src/app/login/actions.ts:36`, `src/app/login/page.tsx:32-55 (placeholders, aria-label only, plain button)`, `src/app/login/actions.ts:42-46 (redirect to ?error=bad)`, `src/app/login/_components/auth-frame.tsx:44-45 (placeholder #4c525c), :54-63 (role=alert)`, `eval /login: labels 0, placeholder rgb(76, 82, 92), no password toggle`, `eval /login?error=bad: email value ''`
- **Also found as:** COPY-018 (Lens: words on every screen), FEEL-031 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Probe shows h1=[] and 0 labels on /login; names come from placeholders. #4c525c measures 2.5:1 on #080b12 and 2.38:1 on the field fill. Stripe f35ac0f9 verified (heading, labels above, eye toggle).

### PUBLIC-046

**Email the resident a copy of their move-in report**

High · New capability · effort M · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** The submission becomes an internal Task. The resident's email is collected but never used, so they keep no record of what they reported.
- **Why:** House rule 'Close the loop: a record of what was done.' The resident's own copy is their deposit protection and builds trust.
- **Change:** On success, send a plain email: 'Your move-in report for 767 Prospect Ave, 1st Front', listing flagged items first, then 'Everything else marked Good', and a reply-to that reaches the team. The sent screen (PUBLIC-013) confirms the address.
- **Desktop, tablet, phone:** Email renders single-column.
- **Reuse:** Resend and NotificationOutbox from the approved spec.
- **References:** 
  - [Zillow](https://mobbin.com/screens/40d14f6b-8626-44b4-ac5f-56132ceb38a9): 'Confirmation has been emailed to you for your records' after submit.
  - [LARQ](https://mobbin.com/screens/e67d7135-abb6-4944-ab9c-0ecc3cdab932): 'Your report was sent successfully' with the email address the reply goes to.
  - [Everyday Rewards](https://mobbin.com/screens/2c57022f-0b38-4e11-89ff-c77d9719c12e): Sent screen stating a confirmation email will go to the given address.
  - [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): Line art, a plain heading, one summary row and two next actions on the submitted screen.
  - [Mercury](https://mobbin.com/screens/3213d96d-50d4-4270-97ff-84cbcc0b0e2f): One sentence says what was done and what happens next ('This card was issued today. Delivery usually takes up to 2-3 weeks').
  - [Jobber](https://mobbin.com/screens/2786f3f3-f53b-4845-8b5f-8bbb8cc054cb): 'Send your client a copy' sits on the signing step itself.
  - [Wise](https://mobbin.com/screens/59943f29-80c7-4999-9b80-79294981aeee): Completed transfer shows its details and a full-width 'Get PDF receipt'.
  - [Stripe Dashboard](https://mobbin.com/screens/58f4745d-feda-4234-9cdb-56e3164348df): Paid page states the date and offers Download invoice and Download receipt.
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:105-114`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:111-118`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:208-216`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:111-119`, `src/app/(marketing)/residents/moving-in/actions.ts:42-43`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:111-118 (sent state copy)`, `src/app/(marketing)/residents/moving-in/actions.ts:109-115 (submission saved only as a task description)`, `grep: no mail or SMS library anywhere under src`
- **Also found as:** PUBLIC-V09 (Login and the public site), G2C-I12 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent), G1E-I08 (What leaves the app: printouts, PDFs and the Google listing)
- **Verification:** confirmed. submitterEmail is collected and only written into the task description (actions.ts:105). It depends on Resend and NotificationOutbox from the approved spec (D30 free plan, 100 a day).

### PUBLIC-I08

**Build maintenance requests as a Thumbtack-style intake that creates a Task**

High · New capability · effort L · `/residents (new /residents/maintenance)` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. /residents is unchanged (page.tsx identical to main). 'Request Maintenance' still shows 'SOON' with 'Send photos of the issue straight to our team.'
- **Today:** The 'Request Maintenance' tile on /residents is disabled with 'Soon', and the move-in checklist says requests go through a group text. Tenant maintenance requests are already scheduled in the approved plan for weeks 3 to 5 after cutover (asana-migration-plan.md:495).
- **Why:** Thumbtack asks one question per screen with percent progress, makes photos optional with Skip in the primary slot, and asks which times work as a multi-select. Jobber's request form takes up to 10 photos and becomes a record with a status. HG already has the hard part: the move-in action turns a public submission into a Task, with per-IP and global limits.
- **Change:** Six short steps at /residents/maintenance. 1: Address and unit (prefilled from a personal link). 2: What's wrong, as rows (Heat, Plumbing, Electrical, Appliance, Pests, Something else). 3: Which room. 4: Photos (optional, with Skip). 5: When can we come in (Weekday mornings, Afternoons, Evenings, Weekends) plus 'OK to enter if I'm out'. 6: Name and phone, with the lock line from PUBLIC-I06. Sending creates a To do Task on the property with the photos attached and ends on a sent screen that says when they'll hear back. Step 2 opens with the emergency line from PUBLIC-I09.
- **Desktop, tablet, phone:** Desktop 1280: one 560px column, progress bar on top, Back and Next under the content. Tablet 768: the same with touch-size rows. Phone 375: full screen, percent in the header, Next pinned at the bottom, and the photo step opens the camera directly.
- **Reuse:** createTask (src/lib/tasks/service.ts), plus the rate limits and honeypot from src/app/(marketing)/residents/moving-in/actions.ts. Extend Attachments (src/components/attachments.tsx) with a rate-limited public upload path. Stepper from PUBLIC-012.
- **References:** 
  - [Thumbtack](https://mobbin.com/flows/677520e0-5c6d-4e12-ba93-bf0b52a753a7): One question per screen, percent progress, a lock card above contact info, and a sent screen with an expected reply time.
  - [Thumbtack](https://mobbin.com/screens/bada6ed2-d3d3-4209-b332-354d4e16c6db): An optional '+ Add Photos' step with Skip as the primary button.
  - [Thumbtack](https://mobbin.com/screens/c6bb99f6-81a7-4473-83d7-3f879959b11a): 'Select all the times that work for you': Weekday mornings, afternoons, evenings, Saturday or Sunday.
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): The request form takes photos (0/10) and becomes a record with an Upcoming status and Directions.
  - [Jobber](https://mobbin.com/screens/6dc1095d-d55e-4a6b-a271-a53130088fa2): The request record keeps the requester's availability (best day, another day, preferred arrival times) next to the service details.
  - [Mercury](https://mobbin.com/flows/9c80fd70-83ab-4dfa-8d3a-51359a904365): The sent screen names what happened and when to expect the result ("should arrive within 1 business day"), then Done.
- **Code:** `src/app/(marketing)/residents/page.tsx:34-37`, `src/app/(marketing)/residents/moving-in/page.tsx:71`, `src/app/(marketing)/residents/moving-in/actions.ts:10-18`, `src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `branch src/app/(marketing)/residents/page.tsx:34-37 (identical to main)`, `src/app/(marketing)/residents/page.tsx:34`, `src/app/(marketing)/residents/page.tsx:69`, `src/app/(marketing)/residents/moving-in/page.tsx:62-67`, `task-management-migration-4c9ddf/docs/asana-migration-plan.md:495`
- **Also found as:** JOURNEYS-I01 (Lens: the core jobs, end to end)
- **Verification:** partly. Reproduced: the tile is disabled with 'Soon' (residents--mobile-light.png), and the move-in checklist points to a group text. But tenant maintenance requests are already on the approved roadmap for weeks 3 to 5 after cutover (asana-migration-plan.md:495), so this is design input for planned work, not an unseen gap. Six one-question screens is Thumbtack's lead-gen pacing. A resident reporting a leak is faster on one short screen: rows for what's wrong, a note, optional photos, an access window and contact details. That fits the simplicity bar better. Anonymous photo upload needs the same hardening as the branch's file routes. The 'personal link' prefill assumes a per-unit resident token that doesn't exist. High stands for the underlying job.

### PUBLIC-I09

**Give residents an Emergency row with a phone number, separate from routine requests**

High · Design change · effort S · `/residents` · Rentals, residents and the public site run one lifecycle

- **Today:** /residents has three tiles (Moving In, Pay Rent and a disabled Request Maintenance) and no way to reach anyone urgently. The aria tree has no phone number or tel: link. The only guidance anywhere is 'a group text for anything that comes up' on the move-in page (moving-in/page.tsx:71).
- **Why:** Monzo's help list gives Emergencies its own row, with a sublabel naming what counts ('Lost phone or card, blocked PIN'). In a Buffalo winter, no heat or a burst pipe can't wait in a text thread, and residents need to know which problems justify a call at 2am.
- **Change:** Make this the first row on /residents: 'Emergency: no heat, a leak, no power or a lockout', with the sublabel 'Call (716) xxx-xxxx any time'. The whole row is a tel: link with a line phone icon. Routine requests use the maintenance row below it. The same line opens the 'What's wrong' step of the maintenance form (PUBLIC-I08). The row ships only once Connor supplies the number.
- **Desktop, tablet, phone:** A full-width row at every size. On phone and tablet the whole row is the tap target. On desktop the number is selectable text with a hover tint on the row.
- **Reuse:** Action row from PUBLIC-036. The number constant comes from PUBLIC-008.
- **References:** 
  - [Monzo](https://mobbin.com/screens/2fb301d6-a472-415b-8f7a-e1e3ba077eae): Help categories with an Emergencies row and a one-line sublabel naming what counts.
  - [Airbnb](https://mobbin.com/screens/be75a9b8-714a-4a56-aa19-816ad5d2600d): The Support group leads with 'Get help with a safety issue', ahead of general help.
- **Code:** `src/app/(marketing)/residents/page.tsx:26-38`, `src/app/(marketing)/residents/moving-in/page.tsx:71`
- **Verification:** confirmed. Reproduced: no tel: link or phone number on /residents, /residents/moving-in, /rentals or the footer (aria trees). The Monzo reference URL came back exactly in my own search: an Emergencies row with the 'Lost phone or card, blocked PIN' sublabel. Monzo lists it third, not first, but the pattern holds. 'Call any time' promises 24-hour coverage from two partners. Per the copy rules, ship that wording only once Connor confirms both the number and the coverage.

### PUBLIC-006

**Photo carousel only works with a mouse hover; phones can't see past photo one**

Medium · Fix · effort M · `/rentals` · The phone is a chosen subset, and touch has no hover

- **Today:** The previous and next arrows stay at opacity-0 until group-hover, and there's no swipe. On touch they're invisible but still catch taps at the photo edges. Targets are 28px, and the dots are 4px decorative spans. No listing has photos in the local DB, so I verified this from code.
- **Why:** Most renters browse on phones. House rule: touch has no hover. Every listing tool, from Airbnb to Realtor.com to Opendoor, swipes, with persistent dots.
- **Change:** On touch, use a CSS scroll-snap track for native swipe, persistent dots and a small '1/8' counter at bottom-right. On desktop, show 36px arrows on hover and focus, with 44px hit areas. Preload the next photo so it doesn't flash. Keep arrows out of the tab order on touch.
- **Desktop, tablet, phone:** Desktop 1280: hover and focus arrows plus dots. Tablet 768 (touch layout): swipe, dots and counter, no arrows. Phone 375: same as tablet, at full card width.
- **Reuse:** Extend PhotoCarousel (docs/components.md 'Listing photos').
- **References:** 
  - [Airbnb](https://mobbin.com/screens/8a6b4476-52d7-4c85-965b-2a870b388eb3): On iOS the photo runs full-bleed and swipes, with a '2 / 27' counter in the corner instead of dots and no hover arrows.
  - [Zillow](https://mobbin.com/screens/3837dc2a-b729-462a-b435-5d58923e6355): On desktop, one large photo plus four smaller ones, with a 'See all 9 photos' button on the grid.
  - [Opendoor](https://mobbin.com/screens/030a2038-b859-44ff-85f4-b98cbbce465b): Listing photo with persistent page dots on a phone card.
  - [Realtor.com](https://mobbin.com/screens/9332fbd1-5551-43c8-a5d0-19072eea9a7e): Rental card photo with dots, no arrows on touch.
  - [Airbnb](https://mobbin.com/screens/f08bfe78-f88c-445b-8969-a0f9b08942f5): Web grid of photo-led home cards.
  - [Swiggy](https://mobbin.com/screens/a300a5b1-783d-4f85-b7e4-e96810233699): Swipeable card carousel with page dots and a '1/10' position count.
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): Large rounded photo card as the listing's lead, built for thumbs
  - [Airtable](https://mobbin.com/screens/f5b0dbcb-bf2f-4b46-aea2-96584e251470): Media preview keeps its controls visible on the item rather than hover-only.
  - [Tripadvisor](https://mobbin.com/screens/27911515-7e29-4bbe-a431-c489fdc93130): Result card photo with dot indicators for swiping
  - [Realtor.com](https://mobbin.com/screens/f1de35f5-3352-4071-9368-3fefa73bc4ee): Rental photo with a "1 / 17" counter and swipe
  - [Vrbo](https://mobbin.com/screens/2da31898-b7b0-4549-992f-fc50d47fc0c3): Listing photo with dots and a photo count
- **Code:** `src/app/(marketing)/rentals/photo-carousel.tsx:30-57`, `src/app/(marketing)/rentals/photo-carousel.tsx:34-57`, `src/app/(marketing)/rentals/photo-carousel.tsx:28-60`, `src/app/(marketing)/rentals/photo-carousel.tsx:30-58`, `src/app/(marketing)/rentals/photo-carousel.tsx:28-51`
- **Also found as:** PUBLIC-V10 (Login and the public site), MOBILE-026 (Lens: phone and tablet experience on every route), FEEL-053 (Lens: interaction quality, feedback, states, speed and accessibility), JOURNEYS-V05 (Lens: the core jobs, end to end)
- **Verification:** partly. The code reading is right and stronger than stated: Tailwind 4.3.3 wraps hover and group-hover variants in @media (hover: hover), so the arrows never appear on touch, while the invisible 28px buttons still take taps. It's latent, though: no listing has a photo today, so nobody hits it until PUBLIC-002 is fixed. Calibrated to medium. Mobbin references are plausible. The recommendation fits the touch rule.

### PUBLIC-008

**Copy says 'text us' but no phone number exists anywhere on the site**

Medium · Fix · effort S · `/residents, /residents/moving-in` · Plain, consistent words

- **Today:** Residents are told to 'text us' and 'email us' but the page shows no number and no email except an 11px footer mailto. Residents usually have the number from their lease, so this is friction, not a blocker.
- **Why:** Wrong copy that leaves residents stuck on the steps that gate their keys. It also breaks 'close the loop': residents can't reach the team the copy points them to.
- **Change:** Wherever the copy says 'text us', link the HG text line (sms: on phones, tel: on desktop). Add a contact block at the bottom of /residents: 'Text or call (716) ...', the email, and 'Emergencies: call any time'. Connor supplies the number.
- **Desktop, tablet, phone:** Desktop: contact block as one row with three items. Tablet: same. Phone: stacked rows with 44px tap targets; the number opens Messages.
- **Reuse:** Residents page; PublicFooter.
- **References:** 
  - [Zillow](https://mobbin.com/screens/97d5abdc-0b9b-4c78-937c-07b5179cba02): The leasing contact block shows office hours by day, a phone number and an 'Ask a question' button right under the listing copy.
  - [Airbnb](https://mobbin.com/screens/a19de186-cddf-4b42-98e1-e00d97dd099d): Host details show the response rate and 'Responds within an hour' above a Message host button. Take the plain reply-time line.
  - [Contractbook](https://mobbin.com/sites/sections/14b9eca1-a041-49c5-95c2-685e70a03d91): Contact block with phone, email and hours set plainly in a dark footer.
  - [Stripe](https://mobbin.com/screens/2a33899e-187f-47f7-b996-7d5eb955ba1a): The contact route is on the page where the task is ('Need help? Contact a product specialist'), not buried in a footer.
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:39`, `src/app/(marketing)/residents/moving-in/actions.ts:18`, `src/components/public/footer.tsx:6-11`, `src/app/(marketing)/residents/moving-in/page.tsx:39 'text us once it's done'`, `src/app/(marketing)/residents/moving-in/page.tsx:52 'Email us a copy of your policy.'`, `src/app/(marketing)/residents/moving-in/actions.ts:18 'or text us instead'`
- **Also found as:** COPY-I12 (Lens: words on every screen)
- **Verification:** partly. The copy and the missing number check out. The checklist also says 'Email us a copy of your policy' with no address on the page except the 11px footer mailto. But the people reading this page are signed residents who already have the team's number from their lease and welcome email, and the 'group text' the checklist mentions, so 'text us' isn't a dead end for them. That makes it medium, not high. Putting a phone number on a public page is a business call for Connor. Overlaps PUBLIC-048 (footer contact) and PUBLIC-035; build one contact block, not three. The Contractbook section URL format is valid but not verified.

### PUBLIC-010

**Home page only repeats the nav; show the available homes on it**

Medium · Design change · effort M · `/welcome` · Rentals, residents and the public site run one lifecycle

- **Today:** The home page's only content is 'View Available Rentals' and 'I'm a Current Resident', which duplicate the header's Rentals and Residents links. A renter needs a second click to see any home.
- **Why:** Copy rule: everything on screen gives value. Airbnb and boutique stay sites put inventory on the home page. Removing a click and a redundant page is the simplest possible win.
- **Change:** Under the hero, render the same available-listing grid as /rentals (up to 6, with 'See all rentals' when there are more). Replace the two pills with one quiet line: 'Already live with us? Resident help' linking to /residents. /rentals stays as the full list.
- **Desktop, tablet, phone:** Desktop: 3-column grid under the hero. Tablet: 2 columns. Phone: 1 column, with the resident line kept above the grid as a single text link.
- **Reuse:** ListingCard from rentals/page.tsx, extracted to share.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/f08bfe78-f88c-445b-8969-a0f9b08942f5): Home page goes straight to homes.
  - [KOBU](https://mobbin.com/sites/sections/4226456d-e845-483a-ad1b-305a93fe7d36): Two-up photo-led stays with name, place and price, borderless.
- **Code:** `src/app/(marketing)/welcome/page.tsx:40-53`
- **Verification:** partly. The observation is right: both CTAs duplicate the header nav. High overstates it for an IA change. With 0 to 3 listings at a time, a home grid and /rentals would show the same cards. The PUBLIC-002 gate can leave the home grid empty too, so the empty state has to work there. Severity set to medium.

### PUBLIC-011

**No listing page or inquiry on HG's own site; every lead is sent to Zillow**

Medium · New capability · effort L · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** Cards aren't links and the only action is 'View on Zillow'. That follows the PRD decision recorded in schema.prisma that Zillow is the leasing system of record.
- **Why:** The renter leaves HG's site at the moment of interest, and HG loses the chance to look credible and to capture the lead directly. Zillow, Realtor.com and Airbnb all keep a sticky contact or tour action on the listing.
- **Change:** Add /rentals/[id]: a photo grid with 'See all photos', rent plus beds/baths/sqft, available date, a short description and the neighborhood. The primary action is 'Text us about this home' (sms: with the address prefilled), with 'Request a tour' as a short form. 'Also on Zillow' becomes a secondary link.
- **Desktop, tablet, phone:** Desktop: content column plus a sticky CTA card on the right. Tablet: single column with a sticky bottom bar (rent plus CTA). Phone: full-bleed swipe photos and a sticky bottom bar; the description collapses to 3 lines with 'More'.
- **Reuse:** PhotoCarousel and the Listing fields. Add a sample to SAMPLE_PARAMS in tests/devices/routes.ts.
- **References:** 
  - [Zillow](https://mobbin.com/screens/f90f6303-7a30-4453-ba3b-53a2d8a13a93): Photo grid, price and stats row, Request a tour card.
  - [Zillow](https://mobbin.com/screens/f909ddfd-1a7b-4a5c-a0c2-d521612088d2): Phone: sticky Contact and Request a tour bar.
  - [Airbnb](https://mobbin.com/screens/f012d93e-8094-4aac-946e-b9043c870bfd): Sticky price plus single primary action at the bottom.
- **Code:** `src/app/(marketing)/rentals/page.tsx:91-155`
- **Verification:** partly. The observation is correct, but conflicts_with is empty when it shouldn't be. prisma/schema.prisma:281-283 records a PRD decision: 'Zillow stays the leasing system of record (don't duplicate the full listing there)'. This finding reverses that and has to say so. For a 2-partner landlord with about 3 openings, an L-effort listing page plus tour form is a big build. Medium. A lighter step is an sms: 'Text us about this home' on the existing card.

### PUBLIC-014

**Validation relies on native browser bubbles that jump 7,000px**

Medium · Design change · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Clicking Submit with Tenant name empty scrolls about 7,000px to the top and shows Chrome's light-gray 'Please fill out this field.' bubble over the dark page. An invalid email shows a native bubble covering the submit button. No field is marked, and there's no summary.
- **Why:** On a long phone form, the user loses their place and can't see what else is missing. Stripe and Mercury show field-level errors in the page's own style.
- **Change:** Use noValidate with inline errors under each field (aria-invalid, aria-describedby). At the submit button, show one line: '2 things need a look: Your email, Unit', where each name jumps to and focuses its field. In the stepper (PUBLIC-012), validate per step on Continue.
- **Desktop, tablet, phone:** Same at all sizes. On phone the summary line sits right above the pinned button.
- **Reuse:** Error pill color from move-in-form.tsx:220; public Field primitive (PUBLIC-050).
- **References:** 
  - [Mercury](https://mobbin.com/screens/85da4e09-98b5-4461-b34b-3653b5083e6f): Error sits directly under the field it belongs to.
  - [Stripe](https://mobbin.com/screens/3b6dce28-bc66-445e-b715-17d460a310ff): Inline error in the page's own style, values kept.
- **Verification:** partly. The native bubble and the jump to the top are real (original movein--m7-submit-empty shot; no noValidate in move-in-form.tsx:123). Native validation still works and names the field, though, and the stepper in PUBLIC-012 removes the 7,000px jump anyway, so medium. Stripe 3b6dce28 verified (inline error under the field, email kept). The Field cross-reference should be PUBLIC-049.

### PUBLIC-019

**Sign-in page carries the marketing nav, including a link to itself**

Medium · Design change · effort S · `/login` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /login still renders the full public header ('Rentals', 'Residents', 'HG Login', which links to itself) and footer, with the gold letter-spaced 'HG LOGIN' eyebrow and rule. These now come from AuthFrame, which also wraps /login/forgot, /login/reset and the contractor's first-password page, so contractors see the rentals marketing nav on every sign-in screen.
- **Today:** /login renders the full public header ('Rentals', 'Residents', 'HG Login', which is the current page) and footer. The page's own label is a gold letter-spaced 'HG LOGIN' eyebrow.
- **Why:** Linear, Mercury and Stripe sign-in pages show only the wordmark and the task. Contractors arriving from a job link don't need rental links.
- **Change:** Use a focused layout: the wordmark top-left linking to '/', the sign-in column centered, and one small footer line. Drop the eyebrow in favor of the h1 from PUBLIC-016.
- **Desktop, tablet, phone:** Desktop and tablet: column vertically centered. Phone: column starts 96px from the top so the keyboard doesn't cover the button.
- **Reuse:** PublicHeader with a 'minimal' prop instead of a second header.
- **References:** 
  - [Linear](https://mobbin.com/screens/da6825c0-a150-48bb-af3a-6a0f3ea08bb1): Mark, heading, one field, one button, 'Back to login'. No nav.
  - [Mercury](https://mobbin.com/screens/35233e2f-2e6c-4240-8c5f-c6b27f36eea7): Logo plus one secondary link; the form is the page.
- **Code:** `src/app/login/page.tsx:18-26`, `branch src/app/login/_components/auth-frame.tsx:22-40`
- **Verification:** confirmed. Seen at 375 and 1280: the full nav, including 'HG Login' pointing at itself, plus a gold 'HG LOGIN' eyebrow. Linear da6825c0 verified (mark, one field, one button, Back to login).

### PUBLIC-021

**Header wraps to two rows on phones, with 20px-tall nav links**

Medium · Design change · effort S · `All public pages (header)` · The phone is a chosen subset, and touch has no hover

- **Today:** At 375 and 320 the header wraps into two rows (99px): the wordmark on row 1, then Rentals, Residents and HG Login on row 2, each link 20px tall. The first rentals card starts around y=345.
- **Why:** House rule: rows of controls never wrap from 320 to 1920, and taps need 44px. The tall header pushes the first listing to about y=580 on a 667px phone.
- **Change:** Use one 56px row at every width: wordmark 'HG Capital' (Geist medium, light tracking) on the left, 'Rentals' and 'Residents' on the right with 44px hit areas, and a hairline divider under it. Move staff sign-in to the footer as 'Staff sign in', since it's a door for a few people.
- **Desktop, tablet, phone:** Desktop: wordmark left, two links right, 40px side padding. Tablet: same. Phone 375 and 320: same single row with 16px gutters and 16px gaps; the wordmark never truncates.
- **Reuse:** PublicHeader.
- **Challenges:** PRD §3 nav 'Rentals | Residents | HG Login' (quoted in header.tsx). Moving sign-in to the footer keeps it available without a third header link.
- **References:** 
  - [Linear](https://mobbin.com/sites/sections/192414ab-334b-4a7f-a278-1d4cf5bdc095): Single dark row with a hairline divider and a normal-case wordmark; 'Log in' is a quiet text link.
- **Code:** `src/components/public/header.tsx:16-40`, `docs/components.md:141`, `probe /welcome at 375: 'Rentals:47x20','Residents:62x20','HG Login:57x20','Contact us:57x17'`, `branch src/components/public/header.tsx (unchanged)`, `branch src/components/public/footer.tsx (unchanged)`
- **Also found as:** MOBILE-040 (Lens: phone and tablet experience on every route)
- **Verification:** partly. The two-row header and 20px links are real, but the numbers are off. Measured header height is 99px at 375 and 320, not about 130px, and the first rentals card starts around y=345, not 580. 'Staff sign in' is also the wrong label: under D14, contractors sign in on the same /login, so use 'Sign in'. Moving it to the footer still conflicts with the PRD nav, which the finding names.

### PUBLIC-024

**Public shell doesn't declare its dark scheme; iOS overscroll and native controls show light**

Medium · Fix · effort S · `All public pages` · One design system, fixed in the primitives

- **Today:** Computed color-scheme is 'normal', and body uses the app token rgb(247,247,248) behind the dark wrapper. No theme-color meta exists. The date input's calendar icon renders dark on the dark field, and select popups and autofill use the light scheme.
- **Why:** iOS Safari's rubber-band overscroll and toolbar tint show a light gray band around a near-black site, and native controls look broken. It's a small thing a Stripe-grade site never shows.
- **Change:** In the marketing layout and login, set html and body background to #08090b, add color-scheme: dark, and export viewport themeColor '#08090b' for these routes.
- **Desktop, tablet, phone:** Matters most on iPhone (overscroll and Safari chrome); harmless elsewhere.
- **Reuse:** src/app/(marketing)/layout.tsx; Next viewport export.
- **Code:** `src/app/globals.css:41-45`, `src/app/(marketing)/layout.tsx:10-17`
- **Verification:** confirmed. Probe on every public route: color-scheme normal, body rgb(247,247,248), no theme-color meta. With the app theme set to dark, the body turns #0b0c0e, so public chrome follows the app toggle it's meant to ignore. The date field's calendar icon is dark on dark in the original mobile shot.

### PUBLIC-025

**Rewrite the listing card: rent first, specs, street and unit, no border**

Medium · Design change · effort S · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** Each card is a 1px bordered rounded-2xl box. The raw full address is the title and wraps to 2 or 3 lines ('933 Lafayette / Avenue Buffalo, / NY 14209' at 320) because rent shares its row. Rent uses a raw toLocaleString with no tabular figures.
- **Why:** Renters scan price first. Realtor.com and Zillow lead with rent, then beds/baths/sqft, then street. Borderless photo cards (KOBU) look calmer and more premium.
- **Change:** No card border; the photo has a 12px radius and the text sits below it. Line 1: '$1,450/mo' in Geist Mono tabular via fmtMoney. Line 2: '2 bd · 1 ba · 900 sqft'. Line 3: street plus unit ('767 Prospect Ave, 1st Front'); drop 'Buffalo, NY' since every home is in Buffalo. Line 4: available date (PUBLIC-027).
- **Desktop, tablet, phone:** Desktop: 3 columns, 24px gap. Tablet: 2 columns. Phone: 1 column, photo at 4:3 full width, same four lines.
- **Reuse:** ListingCard in rentals/page.tsx; fmtMoney (src/lib/utils.ts:8), which docs/components.md names as the pick over the raw toLocaleString here.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/a92f14ea-1a94-4a63-99f3-8b5fbd42d106): Borderless rounded photo cards with one pill in a fixed top-left spot and a two-line caption: place and neighborhood, then the price line.
  - [Realtor.com](https://mobbin.com/screens/9332fbd1-5551-43c8-a5d0-19072eea9a7e): '$4,000/month' first, then beds/baths/sqft, then address.
  - [Zillow](https://mobbin.com/screens/f8870a6c-e322-456b-a41a-a556bc8ac4a4): Price bold, specs line, address line.
  - [KOBU](https://mobbin.com/sites/sections/3cfe935a-4543-4397-b4f5-82128a07251e): Borderless photo cards with name left and mono price right.
- **Code:** `src/app/(marketing)/rentals/page.tsx:93-129`, `docs/components.md:128`, `src/app/(marketing)/rentals/page.tsx:38`, `src/app/(marketing)/rentals/page.tsx:110`
- **Also found as:** G2C-V07 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** confirmed. The address title wraps to two lines at 1280 and 768, and rent uses a raw toLocaleString. For street-only text, reuse shortAddress in src/lib/normalize.ts (the docs/components.md Address row) instead of a new helper. Borderless cards only work once PUBLIC-002 guarantees a photo; without one, an empty gray box floats with no edge. At 768 the third card sits alone on a row.

### PUBLIC-031

**'No openings' empty state points to Zillow with no link**

Medium · Fix · effort S · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** With nothing available, the page says 'No openings right now. Check back soon, or see our listings on Zillow.' and links nowhere. With the publish gate (PUBLIC-002), this state becomes common.
- **Why:** It's a dead end for an interested renter, and Zillow 'listings' won't exist when HG has none.
- **Change:** 'Nothing open right now. Text us and we'll let you know when a home opens up.' with the sms: link as a secondary button. Below it, a compact 'Recently leased' strip if any exist.
- **Desktop, tablet, phone:** Centered block at all sizes; full-width button on phone.
- **Reuse:** EmptyState anatomy from ui.tsx, restyled for the public palette.
- **Code:** `src/app/(marketing)/rentals/page.tsx:68-72`, `src/app/(marketing)/rentals/page.tsx:69-71`
- **Also found as:** G2C-V09 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** confirmed. Code confirms the unlinked Zillow mention (rentals/page.tsx:69-71). It becomes reachable once PUBLIC-002 gates listings. The sms: CTA depends on the number from PUBLIC-008. Keep 'Recently leased' to the single strip in PUBLIC-032; don't add a second one.

### PUBLIC-033

**Replace the gold eyebrow and rule ritual with one plain page title**

Medium · Design change · effort S · `All public pages` · One design system, fixed in the primitives

- **Today:** Every page opens the same way: a gold letter-spaced eyebrow, a 56px gold rule and a centered 22-24px heading. That's welcome, rentals, residents, moving-in (twice, a second time for 'MOVE-IN REPORT'), login, error and 404. The eyebrow repeats the nav label ('RENTALS' above 'Available apartments in Buffalo.'). On phone it costs about 300px before the first listing.
- **Why:** Copy rule: don't restate what the layout shows. The ornament on every screen reads as a template. Linear and Stripe use a single left-aligned title and let content start.
- **Change:** Use one left-aligned h1 per page in off-white at 32px on desktop and 28px on phone, an optional one-line muted subtitle, and no eyebrow or rule. Gold is kept for links, focus and the selected state.
- **Desktop, tablet, phone:** Desktop: title aligned to the content grid's left edge. Tablet: same. Phone: 28px title, and the first card starts within the first 200px.
- **Reuse:** A PublicPageHeader in src/components/public/, modeled on the app's PageHeader.
- **References:** 
  - [Linear](https://mobbin.com/sites/sections/192414ab-334b-4a7f-a278-1d4cf5bdc095): Left-aligned headline with one muted subline, no ornament.
- **Code:** `src/app/(marketing)/rentals/page.tsx:54-60`, `src/app/(marketing)/residents/moving-in/page.tsx:105-115`
- **Verification:** confirmed. The eyebrow, rule and centered heading appear on every public page, including error and 404. The error page even uses gold for 'SOMETHING WENT WRONG'. On rentals at 375 the first card starts around y=345. Coordinate with PUBLIC-034 so both use the same title sizes; they do (32/28px).

### PUBLIC-034

**Type scale is timid: 22-24px headings and 10-12px uppercase labels everywhere**

Medium · Design change · effort S · `All public pages` · One design system, fixed in the primitives

- **Today:** h1 is text-[1.375rem]/text-2xl font-normal on every page, including the hero. Body is 13-14px. Labels and timing tags are 10-12px uppercase with wide tracking ('DUE BEFORE MOVE-IN', 'TENANT NAME').
- **Why:** With no visual hierarchy, the page reads flat. Small uppercase tracking is hard to read on phones. Premium sites pair a confident display size with plain 16px body text.
- **Change:** Hero 56px (36px on phone), weight 500, tight leading. Page titles 32px (28px on phone). Body 16px with relaxed leading. Labels 13-14px medium in sentence case. Uppercase only for the tiny status tag on a photo. Figures in Geist Mono.
- **Desktop, tablet, phone:** Desktop and tablet use the large steps. Phone steps down one size; body stays 16px.
- **Reuse:** Geist via next/font; public tokens (PUBLIC-050).
- **References:** 
  - [Samara](https://mobbin.com/sites/sections/19d48f9c-20f5-4d4e-84a8-a0abfcf2133c): Large confident display type over photography, small plain body.
- **Code:** `src/app/(marketing)/welcome/page.tsx:35`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:16`
- **Verification:** confirmed. h1 is 22-24px font-normal on every page and labels are 10-12px uppercase. The Samara sections I pulled from Mobbin show the same large display type over home photography.

### PUBLIC-035

**Dead 'Request Maintenance: Soon' tile promises photos it can't take**

Medium · Fix · effort S · `/residents` · Rentals, residents and the public site run one lifecycle

- **Today:** The third tile is a disabled card at 60% opacity with a 'SOON' chip and the body 'Send photos of the issue straight to our team.' Nothing is clickable.
- **Why:** Copy rule: no promises we can't back up. Maintenance is the most frequent resident need, and today the answer is a text.
- **Change:** Make the tile live now as 'Maintenance' with the body 'Text us a photo and we'll schedule it.', linking to sms: with the HG number. Swap it for the request form when that ships.
- **Desktop, tablet, phone:** Same as the other rows (PUBLIC-036).
- **Reuse:** Tile/row in residents/page.tsx; the HG number from PUBLIC-008.
- **References:** 
  - [Lemonade Insurance](https://mobbin.com/screens/e43d8317-c254-4404-bdbf-9d6415ca7c5e): The renters home keeps 'FILE A CLAIM' live as the main help action. It is never a placeholder.
- **Code:** `src/app/(marketing)/residents/page.tsx:33-36`, `src/app/(marketing)/residents/page.tsx:67-71`, `src/app/(marketing)/residents/moving-in/page.tsx:68-72`, `src/app/(marketing)/residents/page.tsx:36-40, 69`
- **Also found as:** COPY-059 (Lens: words on every screen), COPY-IV06 (Lens: words on every screen)
- **Verification:** confirmed. The dead tile is seen at all sizes; the 'SOON' chip is #5b6576 inside a 60% opacity tile. It depends on the number in PUBLIC-008.

### PUBLIC-036

**Turn the three resident tiles into a list of action rows**

Medium · Design change · effort S · `/residents` · Rentals, residents and the public site run one lifecycle

- **Today:** Three bordered tiles in a 3-column grid. At 768 the maintenance title wraps beside its chip, and desktop and tablet leave a large empty area under the grid. On phone the tiles stack compactly.
- **Why:** Three actions read faster as a list of rows (icon, title, one line, chevron). That's how Realtor.com and Angi present home tasks, and it removes the cramped tablet columns.
- **Change:** Use a single 640px list: line icon, title ('Moving in', 'Pay rent', 'Maintenance'), one muted line, and a chevron (or an external arrow for Baselane). Rows are separated by hairlines inside one flat stroke container. The contact block (PUBLIC-008) goes below.
- **Desktop, tablet, phone:** Desktop: 640px centered list. Tablet: same. Phone: full width, rows at least 64px tall, chevron at the right edge.
- **Reuse:** Tile component in residents/page.tsx, reshaped; line icons per house rules.
- **References:** 
  - [Monzo](https://mobbin.com/screens/2fb301d6-a472-415b-8f7a-e1e3ba077eae): Help categories as full-width rows, each with a one-line sublabel saying what is inside, including an Emergencies row.
  - [Monzo](https://mobbin.com/screens/4449b48d-d2e7-447a-b301-1c0644ad82d6): The same action-row list in dark mode, the closest match to HG's near-black public palette.
  - [Realtor.com](https://mobbin.com/screens/6665b82f-9540-4a7d-a9ea-18c94e00dd38): Action rows with icon, title, one line and a chevron.
- **Code:** `src/app/(marketing)/residents/page.tsx:26-37`
- **Verification:** partly. At 768, 'Request Maintenance' wraps beside the chip, as claimed. On phone the tiles are compact (about 100px each), not tall and empty; the empty space is below the grid on desktop and tablet. The list-of-rows recommendation is still a sound simplification.

### PUBLIC-037

**Group the move-in checklist by phase; the timing tags contradict each other**

Medium · Design change · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Six bordered checklist cards, each with a 10px gold timing tag worded inconsistently ('Due before move-in', 'Before move-in', 'Do this ASAP').
- **Why:** Six bordered boxes are heavy, and the tags don't tell residents what's due when. Angi's home to-dos show a grouped list of plain rows.
- **Change:** One list with phase headings ('Before move-in', 'Move-in day', 'Within 2 days', 'Ongoing'). Each item is a row with title and one line; no per-item tag or card border. 'Move-in report' gets a 'Start' button that jumps to the form.
- **Desktop, tablet, phone:** Desktop and tablet: 640px column. Phone: full width, headings sticky under the header while scrolling the list.
- **Reuse:** CHECKLIST data in moving-in/page.tsx; regroup by phase.
- **References:** 
  - [Wise](https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614): A vertical step list: done steps checked with dates, the current step in bold, future steps gray. Once the personal link (PUBLIC-045) exists, each checklist step can carry its real date.
  - [Angi](https://mobbin.com/screens/c80853ab-e6a7-489e-999f-ac6bc0162e14): Grouped home to-dos: heading per period, rows with title and one line.
  - [Angi](https://mobbin.com/flows/61801dd1-0966-4d4d-999d-2544261bc29b): Row opens to a short detail with the action.
  - [Wise](https://mobbin.com/screens/516f7c29-b541-4c16-8236-85649d921501): 'Steps to complete' and 'Completed' as the only two group labels, with no urgency words.
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:14-76`, `src/app/(marketing)/residents/moving-in/page.tsx:95-103`, `src/app/(marketing)/residents/moving-in/page.tsx:16,26,44,57,62,67`
- **Also found as:** COPY-I11 (Lens: words on every screen)
- **Verification:** partly. The tags are inconsistent, not contradictory. 'Do this ASAP' on a task that's 'required before move-in' is consistent urgency. The real issues are mixed wording ('Due before move-in' and 'Before move-in') and six separately bordered cards. The grouped list still holds. Angi references are plausible.

### PUBLIC-038

**Rating chips are 26px tall, unlabeled for screen readers, and wrap unevenly at 320**

Medium · Fix · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Each Good/Fair/Poor/N/A chip is about 49x26px with no aria-pressed or group label, so a screen reader hears 'Good, button' 46 times with no item name. Tapping the selected chip clears it. At 320, 24 of 47 rows wrap, so chips jump between inline and stacked.
- **Why:** House rules: 44px touch targets, and toggles expose state with aria-pressed. Ragged rows break 'things that should line up, line up'.
- **Change:** Use a segmented control per item: role='radiogroup' with aria-label set to the item name ('Oven condition'), each option role='radio' with aria-checked, 44px tall on touch. No deselect on re-tap (N/A covers 'skip'). Selected fill alone marks the pick.
- **Desktop, tablet, phone:** Desktop and tablet: label left, control right on one row. Phone 375 and 320: label on its own line and a full-width 4-segment control under it on every row, so rows align.
- **Reuse:** SegmentedControl pick from docs/components.md (deals/filters.tsx), restyled for the public palette.
- **References:** 
  - [Thumbtack](https://mobbin.com/screens/df014413-c8f1-4c5b-b566-10516622a423): Choices are full-width radio rows with large tap targets, a Skip link and Next pinned at the bottom. That fits Good, Fair, Poor and N/A on a phone better than 26px chips.
  - [Airbnb](https://mobbin.com/screens/602422da-e72d-4e16-a4a7-2d91d1b31447): The selected option gets a dark border and a light fill while the rest keep a thin gray border, so the pick is obvious at a glance.
  - [Visible](https://mobbin.com/screens/f3ae98a2-0de0-402b-9021-c67d4df2641d): Item rows with large, evenly sized rating cells. The selected cell is filled, and the column labels appear once at the top.
  - [Google Maps](https://mobbin.com/screens/9df9a1c4-c9c0-4a2f-8526-870df87e5987): 'Update this place' gives every feature row the same three-segment control in a fixed right column, so the choices align down the whole list.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:293-311`, `docs/components.md:124`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:291-310`, `probe after picking Good: {pressed:null, role:null}`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:300`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:296-309`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:296-321`
- **Also found as:** PUBLIC-IV02 (Login and the public site), MOBILE-025 (Lens: phone and tablet experience on every route), G2C-IV03 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent), JOURNEYS-IV02 (Lens: the core jobs, end to end), FEEL-038 (Lens: interaction quality, feedback, states, speed and accessibility)
- **Verification:** confirmed. Measured chips at 49x27px, no aria-pressed, re-tap clears. At 320, 24 of 46 rows wrap; the finding says 47 rows, but there are 46 items.

### PUBLIC-039

**46 always-on 'Comment (optional)' fields; show a note field only on Fair or Poor**

Medium · Design change · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Every item has a comment input under it, borderless until mouse hover. On touch it looks like stray gray text, and its 16px placeholder is louder than the 14px item name. None has a label or aria-label.
- **Why:** It doubles the form's height and visual noise for the 90% of items that are fine. Touch has no hover, so the field's affordance never appears.
- **Change:** Hide the note field until Fair or Poor is picked. Then reveal a labeled field 'What's wrong with the oven?' (auto-focused on Poor). Add a small 'Add note' text button for Good if someone wants it.
- **Desktop, tablet, phone:** Same at all sizes. On phone the revealed field is full width under the control.
- **Reuse:** Public Field primitive (PUBLIC-050).
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:313-318`
- **Verification:** confirmed. There are 46 always-visible comment inputs with the same accessible name, 'Comment (optional)'. On touch they render at 16px, louder than the 14px item labels.

### PUBLIC-040

**Two name fields, and none of the fields autofill**

Medium · Design change · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** 'Tenant name' sits at the top and 'Your name' and 'Your email' 6,000px below, though the person filling it is almost always the tenant. No field sets autocomplete (name, email), so iOS doesn't offer contact autofill.
- **Why:** Asking twice for the same thing is friction and reads as careless. Autofill turns three fields into one tap.
- **Change:** One group at the start: 'Your name' (autocomplete=name), 'Email' (autocomplete=email, inputmode=email), and an optional 'Others on the lease'. Map 'Your name' to tenantName on the server.
- **Desktop, tablet, phone:** Desktop and tablet: name and email side by side. Phone: stacked.
- **Reuse:** Field primitive; actions.ts schema keeps both keys.
- **References:** 
  - [Stripe](https://mobbin.com/screens/d5400786-97c3-4029-a3e2-e21a9fa7735e): Identity fields (Name, Account email) asked once, at the top
  - [Tally](https://mobbin.com/screens/8b827496-7d53-4e44-bda2-2a1b2f1e582c): Name and Email are asked once, at the top, before the form's real questions.
  - [GetYourGuide](https://mobbin.com/screens/ce62c79e-a6a8-4673-a3ad-3fb8b5a1d8c5): 'Check your personal details' collects name and email once, as the first step.
  - [Shell](https://mobbin.com/screens/92de5008-73a5-4de0-9534-b0809e004a1c): Report an issue opens with fixed rows naming the site address and the exact charger ID before 'Tell us more'.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:137-145`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:198-218`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:138 'Tenant name', 200-215 'Your name', 'Your email'`, `src/app/(marketing)/residents/moving-in/actions.ts:80,103 'Tenant:' and 'Submitted by:'`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:136-145`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:198-215`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:138`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:158-171`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:200-210`
- **Also found as:** COPY-055 (Lens: words on every screen), COPY-V09 (Lens: words on every screen), G2C-V04 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent), G2C-IV04 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** confirmed. The only autocomplete attribute in the form is 'off' on the honeypot. Tenant name sits at the top; Your name and Your email sit about 6,000px below.

### PUBLIC-041

**'(optional)' on Other Areas implies the rest are required, but a blank report submits**

Medium · Fix · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Only 'Other Areas' is labeled '(optional)'. Yet a report with zero ratings in Kitchen, Bathroom or Bedroom submits: the client drops unrated items, the server accepts empty answer arrays, and minCount only controls how many room blocks render.
- **Why:** The label tells residents the other rooms are required, while the system accepts an empty report. That gives HG a meaningless task and a resident who thinks they're done.
- **Change:** Require every item in a required room to be rated (the 'All good' action in PUBLIC-042 makes that one tap), validated per room, or remove the '(optional)' label. Recommend the first.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** MoveInSection.minCount; actions.ts submissionSchema.
- **References:** 
  - [Thumbtack](https://mobbin.com/screens/bada6ed2-d3d3-4209-b332-354d4e16c6db): An optional step says 'optional' once under the question and puts Skip in the primary button slot until something is added.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:95-97`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:257`, `src/app/(marketing)/residents/moving-in/actions.ts:26-29`
- **Verification:** partly. The observation is right: unrated items are dropped client-side and the server accepts empty answer arrays. But requiring all 46 ratings contradicts the page's own policy line ('Not completing it means there are no issues'), which already treats unrated as fine. The lighter, consistent fix is to drop the misleading '(optional)' label and block only a report with zero ratings. Requiring everything only makes sense together with 'All good' (PUBLIC-042).

### PUBLIC-042

**Add a one-tap 'Everything here is in good shape' per room**

Medium · New capability · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** A complete report takes one tap per item, 46 taps for a 1-bed, 1-bath, and there's no bulk 'all good' per room. Unrated items are silently accepted.
- **Why:** Most items in a freshly turned unit are fine. Bulk-set-then-exceptions is the fastest honest path and keeps the record complete.
- **Change:** At the top of each room: a secondary button 'Everything here is in good shape' that sets all items to Good and collapses the room to a one-line summary ('Kitchen: all good, 15 items. Edit'). Changing any item reopens it.
- **Desktop, tablet, phone:** Desktop and tablet: button right of the room title. Phone: full-width button under the title.
- **Reuse:** MoveInForm updateItem; Button secondary.
- **References:** 
  - [Kraken](https://mobbin.com/flows/77e1ecc1-229e-4ade-8387-61a1078ec203): One clear primary action per step keeps momentum.
  - [Visible](https://mobbin.com/screens/f3ae98a2-0de0-402b-9021-c67d4df2641d): A 'Use previous answers' toggle at the top of a multi-row rating grid.
  - [Turo](https://mobbin.com/screens/c9fbb23e-0b26-4958-924a-ef9c171ae8a6): 'What parts of the vehicle were damaged?' lists the parts by area with one checkbox each, so the renter marks only the exceptions, under a progress bar with a pinned Continue.
  - [Lime](https://mobbin.com/screens/a79e71e9-c9ce-4c2d-95f5-d33ce4bd5378): The damage report: tap the parts that have issues as chips, add a photo tile, Submit.
- **Code:** `src/lib/move-in-form-types.ts:17-69`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:18-31`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:289-320`, `src/app/(marketing)/residents/moving-in/page.tsx:111-114`
- **Also found as:** G2C-V08 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent), JOURNEYS-IV03 (Lens: the core jobs, end to end)
- **Verification:** partly. The observation contradicts PUBLIC-041. Unrated items are accepted, so the minimum today is 0 taps, not 46. The real cost is 46 taps to give a complete record. The Kraken reference doesn't show a bulk-set action, so it's weak support. It overlaps the room summary in the PUBLIC-012 stepper; design them together.

### PUBLIC-044

**Let residents attach photos to Fair and Poor items**

Medium · New capability · effort L · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** The report is text-only; actions.ts says 'No file uploads, no auth' as abuse protection.
- **Why:** A condition report without photos is weak evidence in a deposit dispute, and a photo of a cracked tile saves a site visit. Zillow Rental Manager promotes photo condition reports as standard.
- **Change:** When an item is Fair or Poor, show 'Add photo' (camera on phone), up to 3 per item and 20 per report. Upload to Blob via signed, size-limited URLs tied to the submission, within the existing per-IP and global caps.
- **Desktop, tablet, phone:** Desktop: file picker plus drag and drop. Tablet and phone: opens the camera or library; thumbnails in a row under the item.
- **Reuse:** Existing Blob upload route (src/app/api/blob) and the spec's portal upload rules.
- **Challenges:** The deliberate 'No file uploads' abuse decision in residents/moving-in/actions.ts:10-15. Signed, capped uploads keep the ceiling.
- **References:** 
  - [Zillow](https://mobbin.com/screens/e093ec63-ccd7-4ed3-8259-851145ca9487): 'Add a property condition report' offered as a standard landlord tool.
  - [Airbnb](https://mobbin.com/screens/fbf3a86a-e0f9-4c49-88ec-d4b99d527720): Photos grouped by room, the shape a condition report's photos should take.
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): "Share images of the work to be done 0/10" sits inside the request form as an image tile, next to the text it supports.
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): The Receipts section has a + tile and a red Missing flag with one line of reason when a photo is required.
  - [Thumbtack](https://mobbin.com/screens/bada6ed2-d3d3-4209-b332-354d4e16c6db): Optional photo step, labeled optional, with Skip; photos never block the request.
  - [Jobber](https://mobbin.com/screens/4e1a7edb-f8d9-4612-8cf6-94899c4f5046): 'Share images of the work to be done' with an image tile and a 1/10 count inside the request form.
  - [Airbnb](https://mobbin.com/screens/9abacc44-6bbe-4e60-8d9d-4e2d4c4c181e): Photo tour grouped by room ('Living room · 2 photos') and 'Add a room or space'.
  - [Jobber](https://mobbin.com/screens/ec35196c-2dda-41cb-838a-62a85f402ec9): 'Share images of the work to be done · 1 of 10 uploaded' inside a request form.
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:10-15`, `src/app/(marketing)/residents/moving-in/actions.ts:12-17`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:296-316`, `eval on /residents/moving-in: document.querySelectorAll('input[type=file]').length = 0`, `task-management-migration-4c9ddf/src/app/(marketing)/residents/moving-in/actions.ts:9-15 ('No file uploads, no auth')`, `task-management-migration-4c9ddf/src/app/(marketing)/residents/moving-in/move-in-form.tsx:255-294`
- **Also found as:** JOURNEYS-I03 (Lens: the core jobs, end to end), G1D-I01 (Photos, videos and documents: viewing and capturing, not just the upload box), G2C-I08 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** confirmed. It names the 'No file uploads' decision as the conflict. Zillow's landlord overview, which I pulled from Mobbin (f6fde171), offers 'Create a property condition report' as a next step, which supports the cited Zillow screen.

### PUBLIC-045

**Send each resident a personal move-in link prefilled with property and unit**

Medium · New capability · effort M · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Residents pick their home from all 11 portfolio addresses, sorted as text, including near-identical 765 and 767 Prospect Avenue.
- **Why:** The team already knows who is moving in where. A prefilled link removes the two most error-prone fields and makes the report clearly theirs.
- **Change:** From the app's lease or move-in task, generate a signed link (/residents/moving-in?k=...) that pre-selects property and unit and greets 'Hi Dana, here's your move-in report for 767 Prospect Ave, 1st Front.' The plain page stays as the fallback.
- **Desktop, tablet, phone:** Same at all sizes; on phone the greeting is one or two lines.
- **Reuse:** Signed-token pattern from session.ts; MoveInForm initial state.
- **References:** 
  - [Typeform](https://mobbin.com/screens/54464029-cebb-4b7a-803c-7785b109a93d): The question uses the person's name ('samlee, what's the main thing...'). A personal link can open with 'Dana, how does the kitchen look?'
  - [Zillow](https://mobbin.com/flows/dd16a70f-e8b8-4b47-94e4-d338d1f551b0): The confirm step arrives with name and email prefilled and a message that already names the address.
  - [Jobber](https://mobbin.com/flows/59cc7ab8-69a0-4295-93e5-27735c624281): New job opens with "Service for": the client and full address are already filled, so the form only asks about the work.
  - [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb): After a tenant is added, the property's Next steps rail offers "Create a property condition report" in the same place.
  - [Gusto](https://mobbin.com/flows/9af21f74-3a74-4d67-b032-a9016f36cf81): Setup steps complete themselves when the underlying thing happens ("Verify bank account, Completed on Nov 4").
  - [Mercury](https://mobbin.com/screens/470d0b78-169a-43d0-b1b3-394f8eda528d): Copy Link to a secure form for another person, with a 'Link copied' toast.
  - [Mercury](https://mobbin.com/screens/74795c0f-51a5-4eb0-a1f0-a98b10b34cf3): Send Reminder names the exact recipients before sending.
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:79-82`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:138`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:200`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:209`, `src/app/(marketing)/residents/moving-in/page.tsx:80`, `branch-src/src/app/(app)/templates/[id]/apply/apply-flow.tsx:115-129`, `branch-src/src/app/(marketing)/residents/moving-in/move-in-form.tsx:138,200,209`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:156-171`, `src/app/(marketing)/residents/moving-in/page.tsx:62`
- **Also found as:** JOURNEYS-I08 (Lens: the core jobs, end to end), G1B-I10 (After a tenant submits: the move-in report on the staff side)
- **Verification:** partly. The select isn't sorted by house number. It's a text sort ('118 Congress', '15 Oxford', '23 Sherwood', '415 Crescent'...), and it lists '765 Prospect Avenue' and '767 Prospect Avenue' as adjacent near-identical options. That's a real mis-pick risk a prefilled link removes.

### PUBLIC-051

**Policy line reads as a warning; say it plainly**

Medium · Design change · effort S · `/residents/moving-in` · Plain, consistent words

- **Today:** Under the report heading: 'Complete this within 2 days of move-in. Not completing it means there are no issues with the home.'
- **Why:** It reads like a legal threat in helper text and wraps to two lines. Plain and credible beats stern.
- **Change:** 'Due within 2 days of move-in. No report means the home is accepted as is.' Same meaning, shorter, one line at the 560px column. Connor confirms the wording since it's policy.
- **Desktop, tablet, phone:** One line on desktop and tablet; two short lines on phone are acceptable.
- **Reuse:** moving-in/page.tsx copy.
- **References:** 
  - [Wise](https://mobbin.com/screens/6f50f87b-1f39-4574-9709-f990fe8f221f): Consequences are stated plainly as 'For you this means:', followed by you and we sentences. Rewrite the policy line as 'If we don't hear from you within 2 days, we'll record the home as in good condition.'
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:111-114`, `src/app/(marketing)/residents/moving-in/page.tsx:112`, `src/app/(marketing)/residents/moving-in/page.tsx:111-113`
- **Also found as:** COPY-056 (Lens: words on every screen), G2C-V05 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** confirmed. The suggested line (about 75 characters) still wraps in today's max-w-md column at 14px. It only fits on one line in the 560px stepper column. This is policy wording, so Connor decides.

### PUBLIC-I01

**Let renters book a showing on HG's site, with the earliest slot named on the button**

Medium · New capability · effort L · `/rentals cards and the planned listing page; app listing editor` · Rentals, residents and the public site run one lifecycle

- **Today:** Each available card's only action is 'View on Zillow', and the three links have identical accessible names. The site shows no phone number and no showing info. Per the PRD note in prisma/schema.prisma:280-283, Zillow is the leasing system of record, and it already takes tour requests behind that link.
- **Why:** Zillow's CTA reads 'Book tour now, Next: Thu 9:00am', and its request flow lets a renter pick up to three times, then confirms with name and phone. Naming the earliest slot turns interest into a booked visit without a text thread, and for two partners it replaces back-and-forth scheduling.
- **Change:** Builds on PUBLIC-011's listing page. In the app listing editor, partners add showing windows per listing (Zillow's 'Add a day' plus a time range). The public button reads 'Book a showing' with a sublabel such as 'Earliest: Sat Oct 25, 10:00am'. It opens a picker: up to three slots grouped by day, then name, phone and an optional note prefilled with 'I'm interested in 767 Prospect Ave, 1st Front'. Sending creates a Task on the property with the chosen slots. The sent screen restates what, when and where (Cal.com) and says 'We'll text you by tonight to confirm one of these times.' With no windows set, the button falls back to 'Ask about this home'.
- **Desktop, tablet, phone:** Desktop 1280: the button sits in the sticky card beside the photos, and the picker is a centered dialog with days as columns. Tablet 768: the same dialog with two day columns and touch-size slots. Phone 375: a pinned bottom bar shows rent and 'Book a showing', and the picker is a full-height sheet with one day per row and the confirm button pinned. The note drops behind an 'Add a note' row.
- **Reuse:** createTask (src/lib/tasks/service.ts), plus the rate limits and honeypot from src/app/(marketing)/residents/moving-in/actions.ts:16-18. The new picker sheet follows Zillow request-a-tour and Cal.com, built on React Aria (approved) for the sheet and date grid. Public field and button from PUBLIC-049.
- **References:** 
  - [Zillow](https://mobbin.com/flows/dd16a70f-e8b8-4b47-94e4-d338d1f551b0): 'Request a tour, as early as today at 11:00 am', then select up to 3 times, confirm contact details, Request sent.
  - [Zillow](https://mobbin.com/screens/558ec748-c7ad-4aee-bb26-3ff3b71b8b00): 'Book tour now' with 'Next: Thu, 9:00am' printed inside the button.
  - [Zillow](https://mobbin.com/flows/8150fdb6-42f2-4843-9873-3da376c1db8c): Owner side: add a day, then a time range, inside the listing wizard.
  - [Cal.com](https://mobbin.com/screens/9ceabcf6-6119-419d-b2fb-e413c27151e4): Three-panel booking card: context, month grid, slot list.
  - [Cal.com](https://mobbin.com/screens/89fb725d-05c6-4acd-9091-66c50f16e4ec): The confirmation restates What, When and Where and offers a way to change.
- **Code:** `src/app/(marketing)/rentals/page.tsx:131-150`, `prisma/schema.prisma:292-321`
- **Verification:** partly. Reproduced at 1280, 768 and 375: three cards, each with one 'View on Zillow' link (identical accessible names), no phone number, no showing fields in Listing. Two problems with the finding. (1) It silently overrides a recorded product decision: prisma/schema.prisma:280-283 says Zillow stays the leasing system of record and the site carries only enough to render a card and link out. conflicts_with should name it. Zillow's own listing, one tap away, already takes tour requests (my Mobbin search returned Zillow 'Requesting a tour' flows https://mobbin.com/flows/40b20cc2-ca79-4367-981c-c50db680c7b8 and https://mobbin.com/flows/b1be55e9-9c60-4ec2-8537-b0c12732de4f with the 'Request a tour, as early as tomorrow at 11:00 am' button, so the cited pattern is real). (2) Showing windows in the editor, a slot picker, three-slot requests and a sent screen add up to a scheduling subsystem for about three listings at a time, and it depends on a listing page (PUBLIC-011) that doesn't exist. A lighter first step, an 'Ask about this home' contact action next to the Zillow link, gets most of the value. High overstates it, because renters can already book through the link.

### PUBLIC-I05

**Name the neighborhood on every home instead of repeating 'Buffalo, NY 142xx'**

Medium · Design change · effort S · `/rentals cards and the home page cards` · Rentals, residents and the public site run one lifecycle

- **Today:** The welcome headline promises 'some of Buffalo's best neighborhoods', but each card title is a full postal address with city and zip ('767 Prospect Avenue, Buffalo, NY 14213', rentals aria lines 15, 22 and 29). The title wraps to two lines at 1280. Property has no neighborhood field.
- **Why:** Airbnb captions every card on one line with the place type and neighborhood ('Apartment in Center City', 'Room in West Philadelphia'), which is how people browse. 'Buffalo, NY 14213' repeats on every card and tells a Buffalo renter nothing.
- **Change:** Add a neighborhood field to Property (for example West Side, Elmwood Village, Black Rock). Under the rent and specs from PUBLIC-025, the caption becomes two one-line rows: '767 Prospect Ave, 1st Front', then 'West Side' in muted gray. City and zip move to the listing page only. Home page cards (PUBLIC-010) use the same caption, so the headline's promise is visible.
- **Desktop, tablet, phone:** The same two lines at every size. At 320 the street line truncates with an ellipsis rather than wrapping.
- **Reuse:** Extend ListingCard in src/app/(marketing)/rentals/page.tsx and add the field to the property edit form.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/a92f14ea-1a94-4a63-99f3-8b5fbd42d106): Two-line captions under borderless photos that name the place type and neighborhood, then the price.
- **Code:** `src/app/(marketing)/rentals/page.tsx:110`, `src/app/(marketing)/welcome/page.tsx:37-40`
- **Verification:** confirmed. Reproduced: the titles wrap to two lines at 1280 and 768 (rentals--desktop-light.png, rentals--tablet-light.png), and the welcome headline promises neighborhoods the site never names. Property has no neighborhood field. The addresses are also stored in mixed formats ('767 Prospect Avenue, Buffalo', '647 Prospect Ave. Buffalo', '933 Lafayette Avenue Buffalo' with no comma), so the shortened street line needs the cleanup in PUBLIC-V12 first. There's one Airbnb reference; it's plausible but thin.

### PUBLIC-I07

**End the move-in report on a review that lists only the Fair and Poor items**

Medium · Design change · effort M · `/residents/moving-in report, final step` · Rentals, residents and the public site run one lifecycle

- **Today:** The report is one 7,448px page with 187 buttons. 'Submit move-in report' sits at the bottom with no summary of what was rated (move-in-form.tsx:225-232). To see what they flagged, a resident has to scroll back through every room.
- **Why:** Gusto's last step, 'Review and submit', shows a one-row summary and the full table above Submit, and Zillow's listing wizard has a Review stage before Publish. A short review catches a mis-tap (Poor instead of Good) on a record that decides deposit deductions.
- **Change:** After the last room, add a Review step. It opens with one count line ('38 Good, 3 Fair, 1 Poor, 4 skipped'), then lists only the Fair and Poor items grouped by room, each with its note and an Edit link back to that room. The button reads 'Send move-in report'. When nothing is Fair or Poor, the step says 'Everything is in good shape' above the same button.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one 640px column with rooms as small headings. Phone 375: the same list, Edit as a 44px target on the right, and Send pinned at the bottom.
- **Reuse:** Builds on the stepper from PUBLIC-012. The review list is new and follows Gusto's review step.
- **References:** 
  - [Gusto](https://mobbin.com/screens/eeeecee8-9984-410b-844c-006585e5a934): 'Review and submit, Step 3 of 3': a summary row and table, with Back and Submit below.
  - [Zillow](https://mobbin.com/screens/0b7eda27-2aad-4e17-90dc-e58a5790237f): The listing wizard's stepper includes a Review stage before Pay & publish.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:225-232`
- **Verification:** confirmed. Reproduced at 375: the page is 7,448px with 187 buttons, and Submit has no summary above it. Ratings are optional, so the count line ('4 skipped') also catches a resident who skipped whole rooms, which the current form never surfaces. It depends on the PUBLIC-012 stepper. If the stepper doesn't ship, put the same Fair and Poor summary directly above Send. The Gusto and Zillow review-step references are plausible.

### PUBLIC-V07

**Use one public background, #08090b, so the header and hero don't show a seam**

Medium · Fix · effort S · `All public pages and /login (most visible on /welcome)` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. The marketing layout and not-found are unchanged at #080b12 with #f2f4f7, and the /welcome hero is #08090b (eval: wrapper rgb(8,11,18), hero rgb(8,9,11)). The seam under the nav still shows. The branch's new AuthFrame also hard-codes #080b12 and #f2f4f7, and it now frames /login, /login/forgot, /login/reset and the contractor's /p/welcome/password.
- **Today:** The public layout, /login and not-found paint #080b12 with #f2f4f7 text (layout.tsx:12, login/page.tsx:18, not-found.tsx:8). The /welcome hero paints #08090b (welcome/page.tsx:21). On /welcome the header band is visibly bluer than the hero, with a hard edge under the nav.
- **Why:** The house palette defines the public site as #08090b with #e8eaee text. Two near-blacks meeting at a hard line make the front page look assembled from parts.
- **Change:** Define the public background and text as tokens set to #08090b and #e8eaee, and use them in the marketing layout, /login, not-found and the welcome hero so every surface matches.
- **Desktop, tablet, phone:** Identical at every size.
- **Reuse:** The documented public palette from CLAUDE.md, applied in src/app/(marketing)/layout.tsx.
- **Code:** `src/app/(marketing)/layout.tsx:12`, `src/app/(marketing)/welcome/page.tsx:21`, `branch src/app/(marketing)/layout.tsx:12`, `branch src/app/(marketing)/welcome/page.tsx:21`, `branch src/app/login/_components/auth-frame.tsx:22`, `src/app/login/page.tsx:18`
- **Also found as:** PUBLIC-022 (Login and the public site)
- **Verification:** verifier-found

### PUBLIC-V08

**Raise the public site's dimmest text to readable contrast, starting with HG Login**

Medium · Design change · effort S · `Public header 'HG Login', footer, and /login placeholders` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. Unchanged in the header and footer. 'HG Login' is #4c525c and the footer is #454b55 at 11px (eval). Placeholders now come from the shared authInputClass (placeholder #4c525c), which is used on /login, /login/forgot, /login/reset and /p/welcome/password. On all four screens the placeholders are the only labels, and contractors will rely on them.
- **Today:** Footer text and 'Contact us' are 11px #454b55 on #080b12, about 2.2:1 (footer.tsx:4-10). 'HG Login' is #4c525c, about 2.5:1, kept deliberately the quietest link because 'it's a door for two people' (header.tsx:3-7). On /login, the placeholders are the only field labels, and they use #4c525c too (login/page.tsx:44,52).
- **Why:** Small text needs 4.5:1 to meet WCAG AA. Under D14, about 29 contractors start signing in through HG Login on their phones Oct 29, so the 'door for two people' premise behind hiding it no longer holds. Mercury's log in pairs visible labels with readable gray.
- **Change:** Make #767d8a (about 4.7:1 on the public background) the floor for any text people need to read: the footer, HG Login and the login placeholders. Keep the hierarchy through size and position, not near-invisible gray.
- **Desktop, tablet, phone:** Same colors at every size. On phone, the footer's 'Contact us' gets a 44px tap area.
- **Reuse:** The existing public muted gray #767d8a.
- **Challenges:** The design note in src/components/public/header.tsx:3-7 (from the PRD) that HG Login stays the quietest link because it's a door for two people. D14 changes that premise.
- **References:** 
  - [Mercury](https://mobbin.com/screens/c08fed01-cf86-4c26-9eba-b0eb0a078960): Log in card with visible Email and Password labels and a readable 'Forgot password?' link.
- **Code:** `src/components/public/header.tsx:3-7`, `src/components/public/header.tsx:34-39`, `src/components/public/footer.tsx:4-10`, `branch src/components/public/header.tsx:36`, `branch src/components/public/footer.tsx:4`, `branch src/app/login/_components/auth-frame.tsx:45`, `src/components/public/header.tsx:36`, `src/components/public/footer.tsx:4`, `src/app/(marketing)/residents/page.tsx:68`
- **Also found as:** PUBLIC-023 (Login and the public site)
- **Verification:** verifier-found

### PUBLIC-026

**Whole card glows gold on hover but isn't clickable**

Low · Design change · effort S · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** Hovering a listing turns the whole card border gold, but the card is a <div>. Only the small 'View on Zillow' text is a link (the comment in photo-carousel.tsx explains why the outer link was removed).
- **Why:** A hover cue that promises a click and doesn't deliver feels broken.
- **Change:** Make the card one link to the listing page (PUBLIC-011), with an absolutely positioned link layer under the carousel controls so the buttons stay valid HTML. Until the listing page exists, remove the card hover.
- **Desktop, tablet, phone:** Desktop: hover lifts only the photo's brightness slightly. Touch sizes: no hover; the whole card is the tap target.
- **Reuse:** ListingCard; PhotoCarousel controls as siblings over the link layer.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/f08bfe78-f88c-445b-8969-a0f9b08942f5): Whole card is the link; photo controls sit on top.
- **Code:** `src/app/(marketing)/rentals/page.tsx:93-97`, `src/app/(marketing)/rentals/photo-carousel.tsx:4-9`
- **Verification:** partly. Confirmed in code (hover:border-[#c8a765]/60 on a div). It's a desktop-only cue, because Tailwind v4 hover never fires on touch, and the S fix is deleting one class. Low.

### PUBLIC-029

**Listing photos are full-size raw <img> with no sizing or lazy loading**

Low · Fix · effort M · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** PhotoCarousel renders one unoptimized <img> per card with no srcset, sizes or lazy loading. The 4:3 box prevents layout shift, and no listing has photos yet.
- **Why:** Phones on cellular download full-resolution photos for every card, each photo change flashes, and layout can shift.
- **Change:** Use next/image with a remotePatterns entry for the Blob host, sizes '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw', lazy below the fold, priority for the first row, and preload the next photo after the first paint.
- **Desktop, tablet, phone:** Smaller files on phone, crisp 2x on desktop.
- **Reuse:** next/image, as welcome/page.tsx already imports.
- **Code:** `src/app/(marketing)/rentals/photo-carousel.tsx:29-30`, `next.config.ts:3-9`
- **Verification:** partly. The raw <img> with no lazy loading or srcset is real. But the container is aspect-[4/3] with object-cover, so there's no layout shift. The carousel renders one photo per card, so a page with 3 listings loads 3 images, not every photo. No listing has photos today. Low.

### PUBLIC-030

**Carousel is silent to screen readers: empty alt text and decorative dots**

Low · Fix · effort S · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** Every listing photo has alt=''. The dots are non-interactive 4px spans, and photo changes aren't announced.
- **Why:** Blind and low-vision renters get nothing from the listing's main content.
- **Change:** Give each photo alt text like 'Photo 2 of 8, 767 Prospect Ave' (or the room label once photos carry one). Group it as role='group' aria-roledescription='carousel' with a polite live region for the counter. The dots stay decorative (aria-hidden) and the counter carries the state.
- **Desktop, tablet, phone:** Same at all sizes.
- **Reuse:** PhotoCarousel.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/8a6b4476-52d7-4c85-965b-2a870b388eb3): A text counter ('2 / 27') replaces decorative dots. Expose it as the carousel's live label, for example 'Photo 2 of 27, kitchen'.
  - [Zillow](https://mobbin.com/screens/a15d3207-198c-45b9-8137-fef606ff29df): Each listing photo has a Caption field in its Edit dialog; HG can use that caption as the public alt text.
- **Code:** `src/app/(marketing)/rentals/photo-carousel.tsx:30`, `src/app/(marketing)/rentals/photo-carousel.tsx:50-56`, `src/app/(marketing)/rentals/photo-carousel.tsx:30,34-57`
- **Also found as:** G1D-V05 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** partly. alt='' and decorative dots confirmed in code. It's latent until photos exist, and it should land inside the PUBLIC-006 rebuild rather than as separate work. Low.

### PUBLIC-032

**'Previously Leased' repeats the full grid at 70% opacity**

Low · Design change · effort S · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** Leased listings render as full cards with photos at 70% opacity under a gold 'PREVIOUSLY LEASED' eyebrow (none are leased in the local DB, so verified from code). The schema comment says it's there for credibility.
- **Why:** A second full grid of dimmed cards doubles the page and competes with what's actually available. Credibility comes through better as a small record.
- **Change:** Use a compact strip under the available grid titled 'Recently leased': small 3:2 thumbnails with the street and 'Leased Sep 2026', no rent, at most 6.
- **Desktop, tablet, phone:** Desktop: 6 small thumbnails in a row. Tablet: 3 per row. Phone: horizontal scroll strip with snap, 2.5 visible.
- **Reuse:** ListingCard with a compact variant.
- **References:** 
  - [KOBU](https://mobbin.com/sites/sections/4226456d-e845-483a-ad1b-305a93fe7d36): Small badge ('NEW', 'FEATURED') on the photo instead of dimming the whole card.
- **Code:** `src/app/(marketing)/rentals/page.tsx:74-85`, `prisma/schema.prisma:288`
- **Verification:** confirmed. Code-only (no LEASED rows locally). The KOBU reference shows on-photo badges, which only loosely supports a compact strip.

### PUBLIC-048

**Footer undersells the company: one gmail link at 11px**

Low · Design change · effort S · `All public pages (footer)` · Rentals, residents and the public site run one lifecycle

- **Today:** The footer is '© 2026 HG Capital Partners LLC' and 'Contact us' (mailto [email]) at 11px in #454b55 (2.2:1).
- **Why:** For a landlord, the footer is where credibility lives: a real phone, an email on the company domain (hgcapitalpartners.com is live), a Buffalo mailing address and the Equal Housing Opportunity mark that rental advertising is expected to carry.
- **Change:** A 3-part footer. Left: wordmark and Buffalo mailing address. Middle: 'Rentals', 'Residents', 'Staff sign in'. Right: phone and an email on the company domain, with hours. Bottom line: copyright and the Equal Housing Opportunity mark. All text at 13px in #767d8a or brighter.
- **Desktop, tablet, phone:** Desktop: three columns. Tablet: two columns, with contact moving under address. Phone: stacked groups with 44px link rows.
- **Reuse:** PublicFooter.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/be75a9b8-714a-4a56-aa19-816ad5d2600d): The footer groups links under short headings (Support first, with 'Get help with a safety issue'), then puts legal and company details on one quiet row.
  - [Resend](https://mobbin.com/sites/sections/9301c687-40d0-4d8d-bbb8-b1325bac2679): Dark footer with the street address top-left and legible gray link columns.
  - [Contractbook](https://mobbin.com/sites/sections/14b9eca1-a041-49c5-95c2-685e70a03d91): Contact group with phone, email and hours.
- **Code:** `src/components/public/footer.tsx:1-14`
- **Verification:** partly. The 11px #454b55 footer and gmail mailto are real. But most of the recommendation repeats other findings: contrast is PUBLIC-023, phone and contact are PUBLIC-008, and the sign-in move is PUBLIC-021 (where 'Staff sign in' excludes contractors). What's left is an email on hgcapitalpartners.com, a mailing address and the Equal Housing Opportunity mark. A 3-column footer is more chrome than a 3-page site needs. Keep it to one line plus the mark.

### PUBLIC-050

**Title Case labels mixed with sentence case**

Low · Fix · effort S · `All public pages` · Plain, consistent words

- **Today:** 'View Available Rentals', 'I'm a Current Resident', 'Moving In', 'Pay Rent', 'Request Maintenance', 'Previously Leased', 'Sign In | HG Capital Partners', and default form labels 'Living Room', 'Other Areas', 'Front Door', 'Smoke Alarm'. Other copy on the same pages is sentence case ('Moving in', 'Security deposit', 'Sign in').
- **Why:** Inconsistent casing reads as unedited. The app and the benchmarks use sentence case.
- **Change:** Use sentence case everywhere: 'See available homes', 'Moving in', 'Pay rent', 'Maintenance', 'Recently leased', 'Sign in | HG Capital Partners', 'Living room', 'Other areas', 'Front door', 'Smoke alarm'. Update DEFAULT_MOVE_IN_FORM_SCHEMA and the stored config.
- **Desktop, tablet, phone:** n/a.
- **Reuse:** src/lib/move-in-form-types.ts defaults; settings/move-in-form editor for the stored copy.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/94fe8072-4994-49ea-a4b7-fb4662c140cb): Host screens use sentence case for headings and options ('Select a check-in method', 'Add building staff details'), the model for 'Moving in', 'Pay rent' and 'Request maintenance'.
- **Code:** `src/app/(marketing)/welcome/page.tsx:45-51`, `src/app/(marketing)/residents/page.tsx:27-36`, `src/app/login/page.tsx:9`, `src/lib/move-in-form-types.ts:33-68`
- **Also found as:** COPY-061 (Lens: words on every screen)
- **Verification:** confirmed. Title Case shows up in CTAs, tiles, page titles ('Moving In | ...', 'Sign In | ...') and the default schema labels.

### PUBLIC-052

**'Add another bathroom' adds a block out of sight with an unlabeled name field**

Low · Fix · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** '+ Add another bathroom' sits in the section header. The new 10-item block appears about 900px below it, out of view, with no scroll or focus. Its name field is placeholder-only ('Bathroom 2 (e.g. "Upstairs")', straight quotes) and has no label.
- **Why:** Users can't tell anything happened and may tap again; screen readers get no field name.
- **Change:** After adding, scroll the new block into view and focus its name field. Label it 'Name this bathroom' with the placeholder 'Upstairs'. Move the add button to the bottom of the section as 'Add a bathroom'.
- **Desktop, tablet, phone:** Same at all sizes; on phone the scroll uses smooth behavior (respecting reduced motion).
- **Reuse:** SectionBlock in move-in-form.tsx.
- **References:** 
  - [Airbnb](https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394): The listing setup basics step sets bedroom and bathroom counts with minus and plus steppers up front, and later steps follow those counts. Ask 'How many bathrooms?' once at the start instead of adding blocks out of sight.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:259-287`
- **Verification:** confirmed. Reproduced at 375: after '+ Add another bathroom' the viewport doesn't change, focus stays on the button, and the new block is off-screen (movein-remove--after-add--mobile-light.png). Also hide the name field when a room has only one instance; today every resident is asked to name 'Bathroom 1' and 'Bedroom 1'.

### PUBLIC-053

**Cut lines that restate the page**

Low · Fix · effort S · `/residents, /residents/moving-in` · Plain, consistent words

- **Today:** 'Everything you need as an HG Capital resident.' (h1 under a 'RESIDENTS' eyebrow). 'Handled securely through Baselane.' (says nothing about what happens). 'Already a resident with a different question? Back to Residents.' (the header already links Residents). 'Move-in checklist and the condition form.' (restates the tile title).
- **Why:** Copy rule: every line helps the user decide or act; don't restate the layout.
- **Change:** Residents h1: 'Resident help'. Pay rent line: 'Opens Baselane, where autopay lives.' Remove the 'Back to Residents' sentence. Moving in line: 'Checklist and your move-in report'.
- **Desktop, tablet, phone:** Shorter lines stay single-line at 320.
- **Reuse:** Page copy only.
- **Code:** `src/app/(marketing)/residents/page.tsx:22-32`, `src/app/(marketing)/residents/moving-in/page.tsx:121-127`
- **Verification:** confirmed. All four lines are on the pages as quoted.

### PUBLIC-054

**Nav has no current-page state**

Low · Design change · effort S · `All public pages (header)` · Rentals, residents and the public site run one lifecycle

- **Today:** On /rentals and /residents, the matching header link looks the same as the others and has no aria-current.
- **Why:** There's no 'you are here' cue, and screen readers can't tell the current page.
- **Change:** Set aria-current='page' on the matching link and style it from the attribute: off-white text and a 1px gold underline offset 6px. Same weight as the inactive links, per the state-toggle typography rule.
- **Desktop, tablet, phone:** Same at all sizes; the underline sits inside the 44px hit area on touch.
- **Reuse:** PublicHeader with usePathname, or a small client NavLink.
- **References:** 
  - [Linear](https://mobbin.com/sites/sections/192414ab-334b-4a7f-a278-1d4cf5bdc095): Quiet nav where only color separates states.
- **Code:** `src/components/public/header.tsx:24-39`
- **Verification:** confirmed. aria-current is null on every header link on /rentals and /residents. The Linear section reference is plausible.

### PUBLIC-I02

**Show move-in costs on each listing: rent, deposit, fees and the utilities the renter pays**

Low · New capability · effort M · `Planned listing page (and the app listing editor)` · Rentals, residents and the public site run one lifecycle

- **Today:** Cards show rent or 'Price on request' and nothing about other costs (rentals/page.tsx:110-128). The Listing model stores rent only. A renter first learns that a security deposit is due before move-in, and that they must open gas and electric accounts in their own name, on the Moving in page after they have leased (moving-in/page.tsx:15-37).
- **Why:** Zillow's cost calculator splits 'Monthly rent, fees & charges' from 'One-time fees & charges', marks each item Required or Optional and totals them. Airbnb pins 'Prices include all fees' on its results. Clear costs up front build trust for a small landlord. New York's 2019 tenant law caps deposits at one month's rent and screening fees at $20, so HG's numbers are short and reassuring.
- **Change:** Add four fields to the app listing editor: security deposit, application fee, utilities included (heat, water, trash) and utilities the tenant pays (prefilled with gas and electric). On the listing page, one two-column block under the facts: 'Monthly' (Rent $1,350; Gas and electric: you pay National Grid and National Fuel) and 'Before move-in' (Security deposit $1,350; Application fee $20). Amounts are right-aligned in Geist Mono, with a lone dash for anything unset. No calculator and no toggles.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the two columns sit side by side under the fact tiles. Phone 375: they stack, and 'Before move-in' collapses into one 'Move-in costs' row that opens in place.
- **Reuse:** Input and Field from src/components/ui.tsx and fmtMoney (src/lib/utils.ts) in src/app/(app)/properties/[id]/edit-listings.tsx. The public block is new and follows Zillow's cost calculator, on the PUBLIC-049 token set.
- **References:** 
  - [Zillow](https://mobbin.com/screens/8ba8e816-15cf-4aab-9845-eb16043cb077): Monthly and one-time sections, Required and Optional columns, an estimated monthly total and Refundable labels.
  - [Zillow](https://mobbin.com/screens/0b7eda27-2aad-4e17-90dc-e58a5790237f): The owner's 'Costs & fees' step with Administrative, Parking, Utilities and Other categories, each with Add.
  - [Airbnb](https://mobbin.com/screens/a92f14ea-1a94-4a63-99f3-8b5fbd42d106): A floating 'Prices include all fees' note on the results grid.
- **Code:** `src/app/(marketing)/rentals/page.tsx:110-128`, `src/app/(marketing)/residents/moving-in/page.tsx:15-37`, `prisma/schema.prisma:292-321`
- **Verification:** partly. The observation is accurate: Listing stores rent only, and the deposit and utilities first appear on the Moving in checklist (moving-in/page.tsx:15-42). The NY HSTPA facts are right (one-month deposit cap, $20 screening fee cap). Medium is too high for a block on a listing page that doesn't exist yet, and the Zillow listing renters land on already shows deposit and fees. Adding the same numbers here creates a second copy to keep in sync, against the 'Zillow is system of record' note (schema.prisma:280-283). Two corrections to the recommendation: on a renter-facing page, hide unset rows instead of printing a lone dash, which reads unfinished; and on phone just stack the two columns rather than adding a disclosure row. The references are plausible Zillow and Airbnb screens.

### PUBLIC-I03

**Answer pets, laundry, parking and lease length on every listing, with 'Ask us' when a value is unknown**

Low · New capability · effort M · `Planned listing page` · Rentals, residents and the public site run one lifecycle

- **Today:** In the local data, all three Available listings have no rent, beds, baths, sqft, available date or photos, so every card shows 'Price on request' and 'Details on request'. The Listing model has no pets, laundry, parking, heat or lease fields. The availableDate it does have is never rendered on the card (rentals/page.tsx:35-46).
- **Why:** Zillow's unit page puts Available date, sqft and Pet-friendly in a grid of fact tiles beside the CTA, and lists Parking and Lease terms under Policies. These are the questions renters text first. Hiding a missing value behind 'Details on request' reads as evasive, while a tile that says 'Ask us' keeps the layout stable and honest.
- **Change:** Add pets (Cats OK, Dogs OK, No pets), laundry (In unit, In building, None), parking (Off-street, Street), heat (Gas forced air, Radiator) and lease length to the app listing editor. On the listing page, show a 3 by 2 grid of tiles under the stats row: Available, Pets, Laundry, Parking, Heat, Lease. Each tile has a line icon, a label and a value. A missing value shows 'Ask us' in muted text and the tile stays. Cards keep only rent, specs, street and unit (PUBLIC-025) and get no tiles.
- **Desktop, tablet, phone:** Desktop 1280: 3 columns by 2 rows beside the sticky booking card. Tablet 768: 3 by 2 at full width. Phone 375: 2 columns by 3 rows, with shorter labels; icons stay.
- **Reuse:** Field (dt and dd) from src/components/ui.tsx for the editor's read view. The public tiles are new and follow Zillow's fact tiles, on the PUBLIC-049 token set.
- **References:** 
  - [Zillow](https://mobbin.com/screens/558ec748-c7ad-4aee-bb26-3ff3b71b8b00): Fact tiles beside the CTA: Available date, sqft, floor plan, Pet-friendly.
  - [Zillow](https://mobbin.com/screens/bdb4f2c9-bce7-4bcc-80d2-01c014d24b01): Policies: Parking, Lease terms and pet cards with an Allowed badge.
  - [Zillow](https://mobbin.com/screens/3837dc2a-b729-462a-b435-5d58923e6355): Stats row with large beds, baths and sqft beside the rent.
- **Code:** `src/app/(marketing)/rentals/page.tsx:126-128`, `prisma/schema.prisma:292-321`
- **Verification:** partly. The 'Details on request' collapse is real on all three cards, but I queried the local Listing rows directly and the cause is that every existing field is empty: no rent, beds, baths, sqft, availableDate or photos. Missing pet and laundry fields aren't the problem. 'Live listings' means the local copy; I couldn't check production. Adding six more fields that would mostly read 'Ask us' produces a 3 by 2 grid of placeholders, which is busier and emptier than today. Icon tiles are also Zillow's dense idiom, out of step with the calm public site. A better version: one line of plain facts on the listing page that appears only when set. The Zillow references are plausible.

### PUBLIC-I04

**Show renters they deal directly with Connor and Pieter, the way Airbnb's 'Meet your host' does**

Low · Design change · effort S · `Planned listing page and /residents` · Rentals, residents and the public site run one lifecycle

- **Today:** No page says who HG is or who answers. The only contact anywhere is an 11px 'Contact us' mailto to a gmail address in the footer (footer.tsx:7-10), and the aria contentinfo holds only the copyright line and that link. The wordmark and 'Thoughtfully maintained apartments' are the whole identity.
- **Why:** Airbnb gives the host a card with first name, photo, years hosting, 'Responds within an hour' and a Message host button. Zillow shows the leasing contact's office hours and phone with 'Ask a question'. For a two-partner landlord, renting directly from the owners is the advantage over a management company, and the site never says so.
- **Change:** One compact block on the listing page below the costs, and at the bottom of /residents: two small round photos (or initials), 'You rent directly from Connor and Pieter, the owners.', one hours line such as 'We answer texts 8am to 8pm, every day', and one 'Text us' button (sms: link). Show a reply time only if Connor confirms it can be kept, since the copy rules forbid promises we can't back up. No bios, ratings or badges.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: photos on the left, two lines and the button on the right, max 560px wide. Phone 375: stacked, with a full-width button and the hours line kept to one line.
- **Reuse:** New public block. The number is the same constant PUBLIC-008 adds. Based on Airbnb's host card and Zillow's leasing contact block.
- **Challenges:** Imagery house rule (real property photography on the public site): this adds two partner portraits. Use initials instead if Connor prefers to keep the site to property photos.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/a38c5826-b563-4163-8c8d-db0c130fc1a8): 'Meet your host' card with name and photo, 'Responds within an hour' and Message host.
  - [Zillow](https://mobbin.com/screens/97d5abdc-0b9b-4c78-937c-07b5179cba02): Leasing contact with office hours by day, phone number and 'Ask a question'.
- **Code:** `src/components/public/footer.tsx:1-14`
- **Verification:** partly. Reproduced: the aria contentinfo holds only the copyright line and a mailto 'Contact us'. That footer text is 11px #454b55 on #080b12, about 2.2:1 contrast (see PUBLIC-V08). A short owner block on a future listing page is reasonable. On /residents, though, it would sit beside PUBLIC-I09's emergency row and give the page two contact blocks. Keep /residents to the I09 row. The hours line and any reply time need Connor to commit, per the copy rule against promises we can't back up. conflicts_with correctly names the imagery rule. Low, because it depends on a listing page and a phone number (PUBLIC-008) that don't exist yet.

### PUBLIC-I06

**Add a lock line above the report's name and email that says who sees it and how it protects the deposit**

Low · Design change · effort S · `/residents/moving-in report, contact fields` · Rentals, residents and the public site run one lifecycle

- **Today:** The report ends with 'Your name' and 'Your email' fields and a Submit button (move-in-form.tsx:198-231). Nothing says who reads the report, what the email is for, or that this is the record HG checks at move-out. The only framing is the warning-toned intro line (moving-in/page.tsx:112).
- **Why:** Thumbtack puts a lock card directly above the phone field ('Thumbtack will only give this number to pros you want to hire'), so people know where their details go before they type them. A resident who knows the report protects their deposit is more careful and more willing to note existing scuffs.
- **Change:** One muted row with a line lock icon directly above the contact fields: 'Only Connor and Pieter see this. We keep it with your lease for move-out.' No card border, and it stays on one line. Pair it with PUBLIC-051's rewrite of the intro line so the deposit point isn't made twice.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one line above the two-column name and email row. Phone 375: the same line above the stacked fields. At 320 it shortens to 'Only Connor and Pieter see this report.'
- **Reuse:** New one-line notice in the public kit (PUBLIC-049), with the line icon set used in the app.
- **References:** 
  - [Thumbtack](https://mobbin.com/flows/677520e0-5c6d-4e12-ba93-bf0b52a753a7): At the 75% step, a lock card sits above the phone field and says who will see the number.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:198-231`, `src/app/(marketing)/residents/moving-in/page.tsx:112-115`
- **Verification:** partly. Reproduced: nothing near the name and email fields says who reads the report or why the email is asked for (movein--contact--mobile-light.png). But the proposed copy, 'Only Connor and Pieter see this.', would be false. The report is stored as the Task description (actions.ts:107-114), and settled decision D16 makes task notes, including move-in tasks, visible to the assigned contractor. That breaks the 'no promises we can't back up' rule. Use a line that stays true, for example 'We keep this with your lease and check it at move-out.' It's one line of copy, so low.

### PUBLIC-I10

**Give residents a status link, drawn as a Wise timeline, after every request**

Low · New capability · effort M · `New public status page for move-in reports and maintenance requests` · Rentals, residents and the public site run one lifecycle

- **Today:** After sending, the move-in report screen says 'Thanks! Your move-in report is in.' and 'We've received it and will follow up if anything needs attention.' The report becomes a Task with no actor, titled with the tenant's name and the address. Maintenance requests don't exist yet, so the move-in report is the only public submission to track.
- **Why:** Wise shows every transfer as a vertical timeline: done steps checked and dated, the current step in bold, future steps gray, under an Updates and Details switch. Thumbtack's project page leads with 'Waiting for response'. The 'Close the loop' house rule asks us to show people their input's status once it's in the system.
- **Change:** Each public submission gets an unguessable link, shown on the sent screen and texted or emailed. It maps Task statuses to resident words. To do becomes 'We got your request, Oct 23, 9:14am'. Scheduled becomes 'Mike from ABC Plumbing is coming Tue Oct 28, morning'. Then In progress, then 'Fixed Oct 28' for Done. The current step is bold and later steps are gray. Waiting and Review show as the current step without internal reasons. A Details tab shows what they sent, photos included. No internal notes, and contractors appear by first name and company only.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a 480px centered column. Phone 375: full width, with Details collapsed into a 'What you sent' row under the timeline.
- **Reuse:** The settled seven task statuses and fmtDateTime (src/lib/utils.ts). The public timeline is new and follows Wise.
- **References:** 
  - [Wise](https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614): Updates timeline: dated done steps, bold current step, gray future steps, and an Updates and Details switch.
  - [Thumbtack](https://mobbin.com/flows/256ab77a-1191-46b6-8bf8-3bdb4034c433): Project detail opens with a 'Waiting for response' status band.
  - [Jobber](https://mobbin.com/screens/30cac0d0-2998-47b5-b602-47aa41a6f627): Client hub 'Your Requests': a customer-facing list of their requests by date and address.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:112-118`, `src/app/(marketing)/residents/moving-in/actions.ts:107-114`
- **Verification:** partly. The sent-screen copy and the null actor are accurate. But a public status page needs unguessable token routes, outbound texts or email to residents, and exposes contractor names and visit windows to anyone holding a link. Resident messaging isn't in the plan: D19 and D20 cover contractor and staff email only, and automated SMS comes after the roadmap. A lifecycle timeline also doesn't fit a move-in report, which only gets reviewed. What the resident lacks there is a copy of what they sent (PUBLIC-V09). Keep the timeline for maintenance requests once PUBLIC-I08 ships. 'Maintenance requests will work the same way' is speculation, since they don't exist yet. The Wise Updates/Details pattern is real; my search returned it at https://mobbin.com/screens/f13100db-1e46-4b0e-aa78-77abb2fce0bc.

### PUBLIC-I13

**Let renters leave a number to hear when a home opens, instead of 'Check back soon'**

Low · New capability · effort M · `/rentals empty state and the line under the available homes` · Rentals, residents and the public site run one lifecycle

- **Today:** With nothing available, the page says 'No openings right now. Check back soon, or see our listings on Zillow.' with no link and no way to be notified (rentals/page.tsx:68-72). Leased homes stay on the page, but there's no way to ask about the next one like it.
- **Why:** Zillow turns a search into an alert in one step ('Search saved!', with a name and frequency), so renters come back on their own. For HG, a short list of interested renters by bedroom count can fill a vacancy before paying for a Zillow listing.
- **Change:** In the empty state, and as one line under the available homes, add a compact inline form: 'Text me when a home opens', a bedrooms select (Any, 1, 2, 3+), a phone field and a 'Notify me' button. It saves a lead that the app shows on the property hub's listing tab. The sent state reads 'We'll text you when one opens. Reply STOP to opt out.' No account needed.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one row of select, phone and button under the grid. Phone 375: stacked, with a full-width button.
- **Reuse:** Public Input and Button from PUBLIC-049, plus the rate limiter from src/app/(marketing)/residents/moving-in/actions.ts. Needs a new lead table.
- **References:** 
  - [Zillow](https://mobbin.com/screens/537c0739-2c80-4c90-88a1-8c68baed0763): 'Search saved!' with a name and notification frequency, in one small panel.
  - [Zillow](https://mobbin.com/screens/48b79567-b195-4c4a-bdc7-61bd0fcaf28b): Saved searches listed with new-match counts and 'Subscriptions are ON'.
- **Code:** `src/app/(marketing)/rentals/page.tsx:68-72`
- **Verification:** partly. The empty state is code-verified (rentals/page.tsx:68-72). I couldn't render it because three listings are Available. The cheapest real fix is a copy bug: the line tells renters to see 'our listings on Zillow' but doesn't link anywhere. Link it, or cut the clause. The proposed lead form promises automated texts ('Reply STOP to opt out'), but the app sends no SMS (automated SMS is after the roadmap). It would also need a new lead table and SMS consent handling. At HG's vacancy rate that's a form and a data store for little return, and the copy promises something the system can't do yet.

### PUBLIC-V02

**Removing an extra room deletes its ratings at once, with no undo, and drops focus**

Low · Fix · effort S · `/residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** I added Bathroom 2, rated three items Poor, then tapped 'Remove'. The block and all its ratings disappeared immediately: no confirm, no undo. Focus fell to the document body, at the top of a 7,448px page. 'Remove' is 12px muted text beside the room's name field and turns red only on mouse hover.
- **Why:** One mis-tap next to a text field erases a room's condition record, and keyboard or screen-reader users lose their place on a very long form. The approved spec already treats Undo as the house answer to destructive one-tap actions.
- **Change:** On Remove, replace the block in place with one line, 'Bathroom 2 removed.', and an 'Undo' text button for 8 seconds, then collapse. Inline, because toast is a known gap. Move focus to the add button. Give Remove a 44px hit area on touch.
- **Desktop, tablet, phone:** Same at all sizes. On phone the undo line is full width and at least 44px tall.
- **Reuse:** The settled 'Undo toast on reschedule' pattern from the Asana migration spec, done inline in SectionBlock (move-in-form.tsx) until a Toast exists.
- **Code:** `src/app/(marketing)/residents/moving-in/move-in-form.tsx:79-81`, `src/app/(marketing)/residents/moving-in/move-in-form.tsx:277-285`
- **Verification:** verifier-found

### PUBLIC-V03

**Three identical 'View on Zillow' links that don't say which home**

Low · Fix · effort S · `/rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** The ARIA tree lists link 'View on Zillow' three times. Each points to a different Zillow listing, but nothing in the link's name says which home. Screen-reader link lists and voice control ('click View on Zillow') can't tell them apart.
- **Why:** Ambiguous link names fail WCAG 2.4.4 and make the page's only action unusable without sight.
- **Change:** Keep the visible text and add aria-label 'View 767 Prospect Ave on Zillow', using shortAddress for the street. If the card becomes one link (PUBLIC-026 or PUBLIC-011), the card's name carries the address and this label goes.
- **Desktop, tablet, phone:** Not layout; same at all sizes.
- **Reuse:** ListingCard in rentals/page.tsx; shortAddress in src/lib/normalize.ts.
- **Code:** `src/app/(marketing)/rentals/page.tsx:130-151`
- **Verification:** verifier-found
