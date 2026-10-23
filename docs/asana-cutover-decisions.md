# Cutover decisions waiting on Connor

Everything the migration branch needs from you before the Oct 29 invites, in one place. Each item has a recommendation; "rec" is what I'd pick. The full UI/UX review behind many of these is in the review session's `docs/uiux-review/`.

## Before landing on main

1. Upgrade Vercel to Pro. The email cron runs every minute, which Hobby refuses.
2. In Vercel, set `APP_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` and, optionally, `EMAIL_REPLY_TO` (an inbox you both read). Leave `PORTAL_ENABLED` off until the invites.
3. Give the office phone for the portal's Call button (`OFFICE_PHONE_E164`). Until then the button stays hidden.
4. Design check of Today, All, the task page, playbooks and the portal.

Landing applies one new migration, `20261023180000_task_event_audience`: two nullable columns, no backfill.

## Import (Oct 27 load)

5. Approve the dry-run lists and the D25 delete of 1,993 old CSV rows. I ask once more right before deleting, after a backup.
6. Add a Contact for Brandon Kmiotek with his Asana email, so his open job links (rec). Kenneth Gonzalez matched by name only: confirm.
7. Two tasks at 767 Prospect have what looks like a lockbox code in their notes.
8. Check the Asana Messages tab, and recreate "All exterior of 933 Lafayette" by hand.
9. Rename the one open task still titled with brackets: "Store [daphne] insurance".
10. Pre-cutover contractor history: keep D25 and D18, so history starts at cutover (rec), or keep the ~220 closed contractor rows.
11. The 14 contractors with no email (Alison Hurtado, David Waryk, Dust 2 Sparkles, Fox Pest, Jeremiah Anderson, Jon Oconnel, Kim Lockett, Kyle Griffin, Mark Kreuder, Melvin Miles, Nick, Richard ONeil, Scott Anderson, Steve Cristiano): collect by text and enter on each Portal access card (rec).
12. May `scripts/cleanup-contacts.ts --apply` run on production (7 contacts: repeated trades, lowercase names), after its dry run and a backup?

## Behavior

13. Mark done when photos failed to upload: keep it disabled until each is retried or removed (rec), label it "Skip N photos", or stack the buttons.
14. A finished repeat that was late: next copy on the first scheduled date on or after today (rec), or keep §5.2 (it can arrive overdue).
15. Weekly repeats remember their weekday, so moving one copy doesn't move the series (rec), or keep following the last copy.
16. Clearing the due date of a repeating task: keep allowed as §5.2 says (rec), or refuse it.
17. Move-in reports: due the day they arrive, still unassigned (rec), 2 days after, or undated.
18. Staff files posted while one contractor had the job stay with that contractor, like replies (rec), or carry over to the next.
19. Units: keep tasks naming the unit by label, now kept in sync on rename (rec), or add `unitId` columns. Should removing a unit that open tasks or a listing use ask first? (rec yes)
20. Staff sign-in now returns to the page you opened (the plan said staff ignore `next`). Keep (rec).

## Design (new elements or copy)

21. Done toast with Undo when a task is ticked. Repeats are now safe to undo.
22. Portal access card states: Invited (gray, "Not signed in yet"), Active (blue, last seen), Access off (rec), or keep Active/Removed.
23. Task page when the contractor has no login: swap the labels only, such as "Zack sees notes once he has a login" (rec now), or add a line and a Create login link.
24. Leaving a job mid-upload: a "Leave anyway?" sheet and smaller upload chunks before Oct 29 (rec), and keep uploading across pages later.
25. Show-password eye button on login, reset and first password (rec).
26. Playbook dates: give offsets for NEW TENANT, NEW MOVE OUT and NEW REFI (rec), or date every step on the anchor until the editor ships.
27. Optional playbook fields (tenant email, number) that drop their line from the notes when blank (rec). Rename "Tenant number" to "Tenant phone"?
28. Approve email: add "Thanks, Zack." and "See job" (rec). Outcome-first subjects ("Sent back: Cabinet install, 415 Crescent") later.
29. "Reply in the job so Connor and Pieter both see it" in job emails.
30. Search: show "Contractor" as the result type, which needs a wider type column, and a full-width dropdown on phones (rec). Directory subtitle "31 contractors" (rec).
31. Contractor page extras: a Text link and a maps link now (rec), Copy and linked phone numbers in notes later. Move "Electric" and "House Cleaner" from Company to Trades; split "Mike Morris (Freedom Electric)".
32. Contacts named after a company ("Dust 2 Sparkles", "Fox Pest"): put a person's name on the record (rec).
33. Small ones: Monday quick pick on a Sunday jumps 8 days; the lockbox hint wraps in the rail (shorten to "Pick a unit for the code"); the email-limit banner on phones shows only its first sentence; Home's "Open tasks" links to All; the contractor Done tab starts Oct 27.
