# Cutover decisions waiting on Connor

What the migration still needs from you. Everything you answered on Oct 23 is built and live; it's listed at the bottom for the record.

## Still needed

1. **Vercel settings**: `APP_URL` (https://hgcapitalpartners.com), `CRON_SECRET` (a long random string), `RESEND_API_KEY` and `EMAIL_FROM` from Resend, and optionally `EMAIL_REPLY_TO` (an inbox you both read). Until `CRON_SECRET` is set the email job is refused every minute, which is harmless. Emails stay off until these are in.
2. **Production write access for the Oct 27 load**: a gitignored `.env.prod-write` with the database owner connection string. The load backs up first. The D25 delete of the old CSV rows is approved.
3. **Contractor invites**: on hold until you say go. Before then, add the emails for the 14 contractors who have none (Alison Hurtado, David Waryk, Dust 2 Sparkles, Fox Pest, Jeremiah Anderson, Jon Oconnel, Kim Lockett, Kyle Griffin, Mark Kreuder, Melvin Miles, Nick, Richard ONeil, Scott Anderson, Steve Cristiano), and put a person's name on "Dust 2 Sparkles" and "Fox Pest".
4. **Office phone** for the portal's Call button (`OFFICE_PHONE_E164`). Hidden until then.
5. **Playbook timing**: the step offsets for NEW TENANT, NEW MOVE OUT and NEW REFI, such as "collect the deposit 3 days before move-in". Until then you set dates on the review screen when you apply one.
6. **A look at the new screens** when you're at a computer: Today, All, the task page, playbooks and the contractor page.

## Small calls, when you have a minute

- On a 320px phone, the New task form's Repeats chip cuts off ("Every 2 week…"). Giving Repeats its own row would fix it.
- A yearly repeat's Done toast ("Done. Next due Oct 22, 2027") cuts off at 320.
- Undoing a tick on a Canceled repeating task leaves the new copy open.

## Answered Oct 23 (built and live)

- Vercel Pro: done.
- Contractors are not invited and the portal stays off until you say so.
- Ignore "All exterior of 933 Lafayette"; the lockbox codes in task notes are fine; the Asana Messages tab has nothing to keep.
- Brandon Kmiotek gets a contractor record during the import; Kenneth Gonzalez is the same person as the contact.
- Your recommendations are accepted and built:
  - Undo after a tick, plus the repeat rules for late finishes and pinned weekdays.
  - Mark done disabled while photos failed, and a leave warning during uploads.
  - The login card states, with a gray Active badge (your call).
  - The show-password button, the approval email's thank-you and the "Reply in the job" line.
  - Move-in reports due on arrival, and a confirm before removing a unit that's in use.
  - The contractor record tidy-up: the script is ready and runs on production with the load.
