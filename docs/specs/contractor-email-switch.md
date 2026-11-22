# Quiet contractor emails

Planned with Connor on Nov 14, 2026, in two rounds of questions (Q1 to Q8 below). He took every recommendation and said "build it" the same day. Section 8 lists what the build added that this plan didn't name.

## 1. Summary

**Why.** Email went live on Nov 14. Connor wants to hand a contractor their login details himself, with no email reaching them because a login now exists. Creating a login sends nothing, but from that moment every staff change to one of the contractor's jobs queues an email (`src/lib/tasks/core.ts` `notify`, gated only on an active login by `contractorHasLogin`). There is no way to give someone a login without those emails, and no way to stop them for a contractor who asks.

**What changes.**

- A contractor gets no job emails until they have signed in once. Nothing to switch (Q1).
- Each contractor's Portal access card gets a "Job emails" switch, on by default, for anyone who wants email off for good (Q1, Q5).
- Off covers every job email to that contractor as one switch: assigned, target date, notes, shared comments and files, status (Q2).
- Changes made while emails are quiet or off are never emailed later (Q3).
- The line under a staff update says why no email went: "Zack hasn't signed in yet" or "Zack's emails are off" (Q4).

**The rule in one sentence.** A job email goes to a contractor when their login is active, they have signed in at least once, and their switch is on.

**Decisions, as Connor took them.**

| # | Decision |
|---|---|
| Q1 | Both: quiet until the first sign-in, plus a switch per contractor |
| Q2 | One switch for all job emails. The Forgot password email still sends, and so do the emails the partners get when the contractor acts |
| Q3 | No catch-up. Nothing queued while quiet or off is sent later, and anything still in its 3-minute wait when the switch goes off is dropped |
| Q4 | The line under an update says why no email went, and still becomes "Seen by Zack" once he opens the job |
| Q5 | Layout A: a switch row in the Portal access card, under the login email |
| Q6 | The switch can be turned off before the first sign-in. Nothing can start emails early |
| Q7 | Staff only. Contractors can't change it themselves |
| Q8 | Each flip is saved to the login's audit log, which no screen shows today |

Two things follow from Q1 and were confirmed with the round 2 answers:

- "First sign-in" is the first time they sign in at all, including with the starting password (`PortalAccount.lastSignInAt`, written by `authenticatePortalAccount`). A later password reset doesn't make them quiet again.
- The switch starts on for every login. Production had no contractor logins on Nov 14, so there is nothing to convert.

**Small defaults chosen while writing this, not asked.** Say so if any is wrong.

- While the card reads Access off, the switch is hidden, as Reset password and Sign out everywhere already are. Its saved value is kept and applies again after Restore access.
- An email already being sent in the same minute the switch goes off can still arrive. Everything still waiting is dropped.
- An update that was emailed before the switch went off keeps reading "Emailed to Zack".

## 2. Behavior

**When an email is queued** (`notify` in `core.ts`). Staff changes queue a line for the contractor only when all three hold: the login is `ACTIVE`, `lastSignInAt` is set, and `jobEmails` is true. Otherwise nothing is queued, exactly as for a contractor with no login today. A contractor's own actions still queue emails to the partners, unchanged.

**When an email is sent** (`drainDue` in `src/lib/notifications/outbox.ts`, through `deliveryFor` in `content.ts`). A row for a contractor whose switch is off is closed unsent with the reason "emails off", the same way a row is closed for "no login" or "no access". That is what drops a bundle still in its wait when the switch goes off. A row can't exist for someone who never signed in, so send time checks the switch only.

**Turning the switch back on.** Emails start with the next change. Rows closed while it was off stay closed.

**What doesn't change.**

- Password reset (`src/lib/portal/reset.ts`) sends whenever the contractor asks.
- Emails to Connor and Pieter about what a contractor did.
- Everything the portal shows. Quiet or off, the contractor sees every job and update when they sign in.
- The places that say "Zack has no login yet" about the portal itself (the Send back sheet, the lockbox row). They are about access, not email.

## 3. The switch (layout A)

A row in the Portal access card (`src/app/(app)/contractors/[id]/portal-access-card.tsx`), between the Email fact and the Reset password pair.

```
Portal access               Active  ···
Email       zack@example.com
            Last seen 2d ago
Job emails                       [ ON ]
[Reset password] [Sign out everywhere]
---------------------------------------
[Remove access]
```

Before the first sign-in the row is the same. The Email fact's "Not signed in yet" already says why nothing is going, so the switch adds no line of its own (Connor, Nov 14, after seeing it built).

```
Portal access              Invited  ···
Email       zack@example.com
            Not signed in yet
Job emails                       [ ON ]
```

- **Laptop 1280 and tablet 768.** The card is the narrow rail beside Jobs. The row is the label on the left and the switch on the right, 32px tall with a mouse and 44px on touch.
- **Mobile 375 and 320.** The card is full width and the row is the same. Nothing drops.
- **Saving.** The switch flips at once and a toast with Undo confirms it, as "Show on move-in form" does on a property. No confirm dialog, since it is undone with one tap.
- **Access off.** The row is hidden.

## 4. Copy

| Where | Text |
|---|---|
| Switch label | Job emails |
| Toast, turned off | Zack's job emails are off |
| Toast, turned on | Zack's job emails are on |
| Under a staff update, never signed in | Zack hasn't signed in yet |
| Under a staff update, switch off | Zack's emails are off |

The line under a staff update picks the first that applies:

1. No login: "Zack has no login yet" (today's line).
2. Never signed in: "Zack hasn't signed in yet".
3. He opened the job after the update: "Seen by Zack · 2:14 PM" (today's line).
4. An email for it went: "Emailed to Zack" (today's line).
5. Switch off: "Zack's emails are off". This also covers an email still waiting, since it will be dropped.
6. An email for it is waiting: "Zack gets an email" (today's line).

## 5. Reuse check

**Reused as is.**

- `InlineSwitch` (`src/components/inline-field.tsx`) on `Switch` (`src/components/switch.tsx`): the row, the save on toggle, the toast with Undo and the refusal line. The precedent is "Show on move-in form" (`src/app/(app)/properties/[id]/property-fact.tsx`).
- The Portal access card's `Section`, its label column and its `text-meta` line.
- `logSecurityEvent` (`src/lib/portal/accounts-core.ts`) for the audit row, following `changePortalEmailIn`, which logs an `ACCOUNT_DISABLED` row with an `action` in its data because the enum has no closer value.
- `closeUnsent` in the send run for a row that should not go.

**Extended.**

- `notifyAudience` (`src/lib/tasks/rules.ts`): its `contractorHasLogin` option becomes "the contractor gets job emails", fed by the three-part rule.
- `deliveryFor` (`src/lib/notifications/content.ts`): one more refusal, "emails off".
- `deliveryLine` (`src/lib/tasks/delivery.ts`) and `DeliveryLine` (`src/components/comment-card.tsx`): two more states, in the order in section 4. `activity-rows.ts` passes the two new facts.
- `PortalAccountView` in the card: the switch's value and whether the contractor has ever signed in.

**New.**

- One column: `PortalAccount.jobEmails Boolean @default(true)`. One small migration, applied by the production build. No new table, so no new RLS.
- One service function and one action: set a login's job emails, compare-and-save on the expected value, writing the audit row in the same transaction (`src/lib/portal/accounts.ts`, `accounts-core.ts`, `src/app/(app)/contractors/actions.ts`).
- No new component and no new pattern.

## 6. Build notes

- **Tests.** `rules.test.ts` (no line queued when quiet or off), `content.test.ts` (the "emails off" refusal), `delivery.test.ts` (the two states and their order), `accounts-core.test.ts` (the write, the conflict and the audit row), `outbox.test.ts` (a waiting row is closed when the switch goes off), and a pg test on `notify` for the three-part rule.
- **Docs in the same commit.** The `DeliveryLine` and contractor rows in `docs/components.md`, and two rows in the table in `docs/specs/activity-comments.md` section 2.6.
- **Device check.** `npm run test:devices`, then the card by hand at 375 and 320 in both states (signed in, and never signed in with a long first name) and the toast.
- **Order.** Build this before creating real contractor logins. Until it lands, a new login gets job emails from the first change to one of their jobs. The test contractor is fine to create now, since its emails go to Connor.

## 7. Not in this plan

- A switch contractors flip themselves. It needs a portal account page, which doesn't exist (Q7).
- Per-kind switches, such as comments but not status (Q2).
- One switch for all contractors at once.
- A switch for the partners' own emails.
- A screen that shows the audit log (Q8).
- A cleaner audit kind than `ACCOUNT_DISABLED` for account changes.

## 8. As built

Two lines elsewhere promised an email that this change can now withhold, so the build corrected them. Neither was in the plan above, and both are Connor's to reword.

- **The comment box on a task.** It says nothing about who sees a Shared reply unless the contractor's Job emails switch is off, when a warning strip reads "Zack does not receive email notifications. Remember to call or text them any updates." ("Zack does not receive emails" on a phone; Connor, Nov 14: say the rarer case; Nov 16: drop the "sees this" line and use Connor's words for the strip). The line under the sent comment says why.
- **The contractor's Mark done screen.** It read "Sent to Connor and Pieter. You'll get an email if anything else is needed." For a contractor whose switch is off it now reads "Sent to Connor and Pieter. Check back here if anything else is needed." Since Nov 22 (Connor) it is one sentence: "Sent to Connor and Pieter for review."

The rule lives in one place, `src/lib/portal/job-emails.ts`, and every reader calls it: the queue, the send run, the task page and the portal's job page.

The device check's "portal" fixture is now a contractor who has signed in, and its "portal-welcome" fixture one who never has, so both card states exist locally.

## 9. References

- A person's own page holds their switches as grouped rows: [Messages contact info](https://mobbin.com/screens/54bf3d33-7b24-41e9-8541-fee3d7d85d5c?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) (iOS), [incident.io member panel](https://mobbin.com/screens/ccb89dd1-1212-4b5b-b6ce-fb82994e4f0e?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) (web).
- One master switch for a group of emails: [Square bill pay notifications](https://mobbin.com/screens/6008c15d-dbc7-4ec5-887c-d889f89cfee5?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) (web).
- Saying what still sends when emails go off: [Meetup email updates](https://mobbin.com/screens/b644330a-714a-49a4-b7d1-6d4af7c4d5ed?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) (iOS). Meetup confirms first; we use the house save with Undo instead.
