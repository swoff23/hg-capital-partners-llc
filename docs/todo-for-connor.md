# To do: Connor

Everything that's waiting on you, in one list. None of it blocks using the app day to day. Tick items off here (or tell Claude) as you go.

## Turn on email

- [ ] In Vercel, add these environment variables, then redeploy:
  - `APP_URL`: https://hgcapitalpartners.com
  - `CRON_SECRET`: any long random string
  - `RESEND_API_KEY` and `EMAIL_FROM`: from Resend
  - `EMAIL_REPLY_TO` (optional): an inbox you and Pieter both read

Until then, no emails go out. The email job knocks every minute and is turned away, which is harmless.

## Asana import

Asana access ends around **Nov 1**, so these need doing by about **Thu Oct 29**.

- [ ] Give Claude a way to write to the production database for the import: a gitignored `.env.prod-write` file with the database owner connection string. The import takes a backup first and then:
  - brings over the 135 open tasks, their history and files;
  - creates Brandon Kmiotek's contractor record;
  - deletes the 1,993 old spreadsheet rows (already approved);
  - tidies the three contractor records.

Claude runs the official Asana backup itself; nothing needed from you for that.

## Before inviting contractors

Invites are on hold until you say go.

- [ ] Add emails for the 14 contractors who have none: Alison Hurtado, David Waryk, Dust 2 Sparkles, Fox Pest, Jeremiah Anderson, Jon Oconnel, Kim Lockett, Kyle Griffin, Mark Kreuder, Melvin Miles, Nick, Richard ONeil, Scott Anderson, Steve Cristiano. You could also mark the ones who'll never use the portal.
- [ ] Put a person's name on "Dust 2 Sparkles" and "Fox Pest", so the portal and emails don't greet them as "Dust" and "Fox".
- [ ] Give the office phone number for the portal's Call button. It stays hidden until then.
- [ ] Say "invite them" when you're ready.

## When you have time

- [ ] Playbook timing: for NEW TENANT, NEW MOVE OUT and NEW REFI, when each step is due relative to the start date ("collect the deposit 3 days before move-in"). Until then you set dates on the review screen when you apply a playbook.
- [ ] Look at the new screens on a computer: Today, All, the task page, playbooks and a contractor's page.
- [ ] The UI/UX review session will send you brand guidelines (fonts, colors, status colors) to approve before anything changes.
- [ ] Contractor invoices: confirm or correct the 11 defaults in [docs/contractor-invoices-plan.md](contractor-invoices-plan.md), then say "build it" after the cutover. Its section 9 lists the API key and DNS steps that come before the inbox.

## Small calls (no rush)

- On a 320px phone, the New task form's Repeats chip cuts off ("Every 2 week…"). Give Repeats its own row?
- A yearly repeat's Done toast ("Done. Next due Oct 22, 2027") cuts off on a 320px phone.
- Undoing a tick on a Canceled repeating task leaves the new copy open.

## Done

- Oct 23: Vercel Pro.
- Oct 23: answered the open questions:
  - contractors stay uninvited until you say;
  - ignore 933 Lafayette;
  - the lockbox codes in notes are fine;
  - the Messages tab has nothing to keep;
  - Brandon gets added and Kenneth confirmed;
  - your recommendations are accepted and built, and the Active badge is gray.
