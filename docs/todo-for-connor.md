# To do: Connor

Everything that's waiting on you, in one list. None of it blocks using the app day to day. Tick items off here (or tell Claude) as you go.

## Turn on email

- [ ] In Vercel, add these environment variables, then redeploy:
  - `APP_URL`: https://hgcapitalpartners.com
  - `CRON_SECRET`: any long random string
  - `RESEND_API_KEY` and `EMAIL_FROM`: from Resend
  - `EMAIL_REPLY_TO` (optional): an inbox you and Pieter both read

Until then, no emails go out. The email job knocks every minute and is turned away, which is harmless. `APP_URL` also makes "Forgot password" work on the contractor portal; until it's set, that page errors. Before email goes on, Claude clears anything your test contractor queued, so Pieter doesn't get test emails.

## Asana import

Asana access ends around **Nov 1**, so these need doing by about **Thu Oct 29**.

- [ ] Give Claude a way to write to the production database for the import: a gitignored `.env.prod-write` file with the database owner connection string. The import takes a backup first and then:
  - brings over the 135 open tasks, their history and files;
  - creates Brandon Kmiotek's contractor record;
  - deletes the 1,993 old spreadsheet rows (already approved);
  - tidies the three contractor records.

Claude runs the official Asana backup itself; nothing needed from you for that.

## Before inviting contractors

Invites are on hold until you say go. The portal is on, but only your test contractor can use it.

- [ ] Create your test login: on Contractors, open "Connor Test Contractor", tap Create login, sign in at /login with the starting password it shows, and pick your own password. Three "Test:" jobs are waiting (To do, Scheduled and In progress).
- [ ] When you're done testing, tell Claude to delete the test contractor and its "Test:" jobs.

- [ ] Add emails for the 14 contractors who have none: Alison Hurtado, David Waryk, Dust 2 Sparkles, Fox Pest, Jeremiah Anderson, Jon Oconnel, Kim Lockett, Kyle Griffin, Mark Kreuder, Melvin Miles, Nick, Richard ONeil, Scott Anderson, Steve Cristiano. You could also mark the ones who'll never use the portal.
- [ ] Put a person's name on "Dust 2 Sparkles" and "Fox Pest", so the portal and emails don't greet them as "Dust" and "Fox".
- [ ] Give the office phone number for the portal's Call button. It stays hidden until then.
- [ ] Say "invite them" when you're ready.

## When you have time

- [ ] Playbook timing: for NEW TENANT, NEW MOVE OUT and NEW REFI, when each step is due relative to the start date ("collect the deposit 3 days before move-in"). Until then you set dates on the review screen when you apply a playbook.
- [ ] Look at the new screens on a computer: Today, All, the task page, playbooks and a contractor's page.
- [ ] Pick a provider for address suggestions (Google Places, Mapbox or Smarty) and get its API key. Until then, suggestions come from your own properties and deals.
- [ ] To give old deal notes their author, Claude needs a way to write to the production database (the same `.env.prod-write` the Asana import needs). Until then, old notes keep the author in their text, as today.

- [ ] Send the link to HG's Zillow profile. Until then the Rentals page says "Our homes are also listed on Zillow." with no link.
- [ ] Say how residents should request maintenance (a form, an email, a phone number). Until then the Residents page's "Request maintenance" tile reads "Soon".
- [ ] In Vercel, turn on Skew Protection (Project Settings, Advanced). Now that you're on Pro, it keeps a page that was open during a deploy talking to the version it loaded, instead of failing its next save.

## Small calls (no rush)

- On a 320px phone, the New task form's Repeats chip cuts off ("Every 2 week…"). Give Repeats its own row?
- A yearly repeat's Done toast ("Done. Next due Oct 22, 2027") cuts off on a 320px phone.
- Undoing a tick on a Canceled repeating task leaves the new copy open.

## Done

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
