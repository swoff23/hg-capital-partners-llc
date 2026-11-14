# To do: Connor

Everything that's waiting on you, in one list. None of it blocks using the app day to day. Tick items off here (or tell Claude) as you go.

## Check email works

Email went on Nov 14: the Vercel variables are in, the sending domain is set up in Resend, and the email job runs every minute. Nothing was waiting to send, so nothing went to Pieter. No real email has gone out yet.

- [ ] Create your test login (the first item under "Before inviting contractors"), then on /login/forgot enter the test contractor's email. The reset email should arrive within a minute. Check spam for the first one.
- [ ] Comment on one of the "Test:" jobs. Once the test contractor has signed in, the email arrives about 3 minutes later and the line under your comment changes to "Emailed to ...".
- [ ] Tell Pieter before you post anything as the test contractor. A contractor's update emails both of you.

A contractor gets no job emails until they have signed in once, and each contractor's Portal access card has a "Job emails" switch ([contractor-email-switch.md](specs/contractor-email-switch.md)). Creating a login sends nothing.

## Turn on error alerts

Sentry is connected and reporting (Nov 14), on the free plan with no card. The background-jobs monitor checks in green every minute. What each alert means is in [alerts.md](alerts.md).

- [x] In Vercel, add Sentry and connect it to the hg-capital-partners-llc-wy7r project on the free Developer plan. Done Nov 14: the keys are in, no log drain was added, and the redeploy uploaded source maps and turned reporting on.
- [x] In Sentry, under Settings, then Security & Privacy, turn on "Prevent storing of IP addresses".
- [x] Add one uptime monitor for `https://www.hgcapitalpartners.com/api/health` (with www: the bare domain redirects), every minute, and confirm the "new issue" email alert is on. The exact clicks are in [alerts.md](alerts.md), under "Setting up".
- [ ] Make Sentry's alert emails notify on your phone (a Gmail filter that marks them important, if Gmail notifies only for those).
- [ ] In Resend, confirm the team email it notifies about a failing webhook is yours.
- [ ] In Supabase (project ywdjaygwkqyrmbdnvaai), open Database, then Backups, and confirm daily backups are listed.

## Retire the contractor Google Form

Contractor onboarding is live (Nov 14, [contractor-onboarding.md](specs/contractor-onboarding.md)): Invite contractor and the Sign-up link on the Contractors page, and new people set up their own account, trades, W-9 and insurance in the portal. Bank details go through Baselane's own link.

- [ ] Try it once: send yourself an invite, sign up on your phone, and upload a W-9. Uploads couldn't be tried before launch, so this is the first real one.
- [ ] Turn off responses on the Google Form ("HG Capital – Contractor Onboarding Form").
- [ ] Delete the five bank columns (H to L of "Contractor Info": bank name, account type, name on account, routing and account number) from its responses sheet, or lock the sheet to you only. It's the most exposed copy of contractors' bank numbers you hold.

## Asana import

Asana access ends around **Nov 1**, so these need doing by about **Thu Oct 29**.

- [ ] Give Claude a way to write to the production database for the import: a gitignored `.env.prod-write` file with the database owner connection string. The import takes a backup first and then:
  - brings over the 135 open tasks, their history and files;
  - creates Brandon Kmiotek's contractor record;
  - deletes the 1,993 old spreadsheet rows (already approved);
  - tidies the three contractor records.

The official Asana backup is done (Mon Oct 26: every task, history entry and file, 1.5 GB, saved privately on your Mac), with Brandon and Kenneth set up in it for the import.

## Before inviting contractors

Invites are on hold until you say go. The portal is on, but only your test contractor can use it.

- [ ] Create your test login: on Contractors, open "Connor Test Contractor", tap Create login, sign in at /login with the starting password it shows, and pick your own password. Three "Test:" jobs are waiting (To do, Scheduled and In progress).
- [ ] When you're done testing, tell Claude to delete the test contractor and its "Test:" jobs.

- [ ] Add emails for the 14 contractors who have none (open a contractor, then Edit on Contact): Alison Hurtado, David Waryk, Dust 2 Sparkles, Fox Pest, Jeremiah Anderson, Jon Oconnel, Kim Lockett, Kyle Griffin, Mark Kreuder, Melvin Miles, Nick, Richard ONeil, Scott Anderson, Steve Cristiano. You could also mark the ones who'll never use the portal.
- [ ] Put a person's name on "Dust 2 Sparkles" and "Fox Pest" (Edit on Contact; the company name can go in Company), so the portal and emails don't greet them as "Dust" and "Fox".
- [ ] Give the office phone number for the portal's Call button. It stays hidden until then.
- [ ] Say "invite them" when you're ready.

## When you have time

- [ ] Playbook timing: for NEW TENANT, NEW MOVE OUT and NEW REFI, when each step is due relative to the start date ("collect the deposit 3 days before move-in"). Until then you set dates on the review screen when you apply a playbook.
- [ ] Look at the new screens on a computer: Today, All, the task page, playbooks and a contractor's page.
- [ ] Pick a provider for address suggestions (Google Places, Mapbox or Smarty) and get its API key. Until then, suggestions come from your own properties and deals.
- [ ] To give old deal notes their author, Claude needs a way to write to the production database (the same `.env.prod-write` the Asana import needs). Until then, old notes keep the author in their text, as today.
- [ ] Contractor invoices: confirm or correct the 11 defaults in [docs/contractor-invoices-plan.md](contractor-invoices-plan.md), then say "build it" after the cutover. Its section 9 lists the API key and DNS steps that come before the inbox.

- [ ] Send the link to HG's Zillow profile. Until then the Rentals page says "Our homes are also listed on Zillow." with no link.
- [ ] Say how residents should request maintenance (a form, an email, a phone number). Until then the Residents page's "Request maintenance" tile reads "Soon".

## Small calls (no rush)

- On a 320px phone, the New task form's Repeats chip cuts off ("Every 2 week…"). Give Repeats its own row?
- A yearly repeat's Done toast ("Done. Next due Oct 22, 2027") cuts off on a 320px phone.
- Undoing a tick on a Canceled repeating task leaves the new copy open.

## Done

- Nov 14: email turned on. `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_REPLY_TO` are in Vercel, and `mail.hgcapitalpartners.com` is set up in Resend.
- Nov 14: Skew Protection is on in Vercel with a 12-hour max age. It starts with the next deploy.
- Nov 14: `CONNOR_PASSWORD` and `PIETER_PASSWORD` deleted from Vercel. Both passwords were already saved in the database, so sign-in is unchanged.

- Oct 25: the Ink and Limestone brand and Home as Today, built and landed. The guidelines are in [brand-guidelines.md](brand-guidelines.md).
- Oct 25: approved the six component specs with every recommendation. "Our price" on deals means the target offer. They build in seven chunks.
- Oct 23: Vercel Pro.
- Oct 23: the contractor portal is on (`PORTAL_ENABLED=1`), with a test contractor and three test jobs.
- Oct 23: answered the open questions:
  - contractors stay uninvited until you say;
  - ignore 933 Lafayette;
  - the lockbox codes in notes are fine;
  - the Messages tab has nothing to keep;
  - Brandon gets added and Kenneth confirmed;
  - your recommendations are accepted and built, and the Active badge is gray.
