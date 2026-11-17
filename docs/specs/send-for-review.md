# Send for review

Planned with Connor on Nov 15, 2026, in two questions (Q1 and Q2 below). He took both recommendations and said "build it" the same day. Section 9 lists what the build did that this plan didn't name.

## 1. Summary

**Why.** Connor: a contractor can't mark a job done. They mark it for review, and Connor or Pieter move it to Done once they've confirmed the work. A contractor who has marked their side done shouldn't get the 8 am email, and doesn't need an email when HG Capital confirms it. They only need one when there's an issue.

**What's already true (no change).** Most of the rule shipped with the portal (docs/asana-migration-plan.md D6, D6b, D6c):

- A contractor can never set Done. Their finish button moves the job to Review (`src/lib/tasks/rules.ts` `canSetStatus`: a contractor may only move to In progress or Review).
- Only staff move a job out of Review: Approve (to Done) or Send back (to In progress). Both live on the task page's Review card (`src/app/(app)/tasks/[id]/review-banner.tsx`) and in the task list's tick (`src/app/(app)/tasks/list-actions.ts`).
- Send back is the "there's an issue" email. It asks "What still needs doing?", refuses an empty note (`src/app/(app)/tasks/send-back-sheet.tsx`), and emails the contractor the note with Send for review as the next step.
- The 8 am emails skip a job in Review, Done or Canceled. The 8 am run only picks To do, Scheduled, Waiting and In progress jobs (`src/lib/notifications/reminders.ts`), and the send run drops a queued 8 am line if the job has moved to Review since (`src/lib/notifications/content.ts` `liveReminders`, tested in `content.test.ts`). A job sent back goes back to getting them.
- After the contractor sends it, their payoff screen already says "Sent to Connor and Pieter. You'll get an email if anything else is needed." (`src/lib/portal/job-view.ts` `payoffLine`). That is the rule Connor described; the approval email below is what broke it.

**What changes.**

1. **No email to the contractor when a job moves to Done.** Today Approve sends "Done: Replace kitchen faucet, 118 Congress St · Rear / Connor approved it. Thanks, Zack." That email goes. So does the one when a partner closes a contractor's job straight to Done without a review. The Done line stays Shared, so the contractor still sees "Connor approved it" on the job in the portal, and the job moves to Done in My jobs.
2. **The contractor's button reads "Send for review"** instead of "Mark done", everywhere it appears (Q1).
3. **The partners' email reads "Review:"** when the job is waiting on them, instead of "Update:" (Q2).

**The rule in one sentence.** A contractor hears from HG Capital about a finished job only when it's sent back.

**Decisions, as Connor took them.**

| # | Decision |
|---|---|
| Q1 | The contractor's finish button says "Send for review" (C), not "Mark done" (A, today) or "Finish job" (B). Partners and Activity read "Zack sent it for review" |
| Q2 | The partners' email subject starts "Review:" (B) while the job waits on them, not "Update:" (A, today) or "Ready for review:" (C) |
| — | No email on any move to Done (Connor's ask, Nov 15). Applies to Approve and to a partner closing the job directly |

## 2. No email on Done

**Rule.** `src/lib/tasks/rules.ts` `notifyAudience`: a staff STATUS change whose `to` is DONE reaches nobody. `NotifyChange` gains the status it moved to (`to?: TaskStatus`) so the rule stays pure and tested. Every other staff status change keeps emailing the contractor as today: Scheduled, sent back, moved to In progress, reopened from Done. Canceled keeps its "Removed: You're off this job" email (`notifyOff`).

**What else follows from it, with no new code:**

- `setStatus` returns `emailsContractor: false` for an approval, so the Approve toast drops its "Zack gets an email" line (task page and list).
- Approve's Undo just lasts its two minutes (`APPROVAL_UNDO_MS`). `approvalEmailRefusal` stays as the guard for approval emails queued before this ships, and never fires after. Its comments and `APPROVAL_UNDO_MS`'s ("under the 3 minutes an approval email waits") are reworded.
- A Shared comment written in the same few minutes as the approval still emails, as any comment does. The bundle's subject is "Done:" because the job is Done when it goes (`subjectWord`, unchanged).

**Removed as dead:** `endsApproved`, the "Thanks, Zack." closing and the approved branch of the contractor's buttons in `content.ts` `taskEmail`/`buttons`, since no contractor email carries an approval any more. The drain re-reads every row as it sends, so a row queued before the deploy still sends, without the thanks line.

## 3. "Send for review" (Q1)

**Pattern.** A submit-then-approve step names what happens next, not "done". [Medium's "Send for review"](https://mobbin.com/screens/dec7fa2a-6206-41e7-b4dc-ff4bf2f540b4) is the same step (a writer sends a story to an editor who publishes it); [Fiverr's "Submit Delivery"](https://mobbin.com/screens/8e605335-e2f8-4377-a561-4341ca477650) is the seller's version (the buyer then accepts). It also matches the words the contractor already sees after it: the bar's "Waiting for review" and the status "In review". The payoff after it keeps its heading, "Thanks, Zack!", and its line about getting an email only if anything else is needed.

**Strings that change.** Only user-facing text. The `?do=done` link step, the `"done"` NextStep, `markDoneButton` and every code name stay as they are, so links already in inboxes keep working.

| Where | Today | New |
|---|---|---|
| Portal bottom bar, In progress (`job-actions.tsx`) | Mark done | Send for review |
| The sheet's title and its main button (`job-actions.tsx`, `job-view.ts` `MarkDoneState.label`) | Mark done | Send for review |
| Contractor email's primary button (`content.ts` `buttons`) | Mark done | Send for review |
| Portal Updates line (`job-view.ts` `statusUpdateText`) | You marked it done | You sent it for review |
| Partner email What's new (`core.ts` `statusSummary`, `content.ts` change line) | Zack marked it done | Zack sent it for review |
| Task page Review card and Activity (`activity.ts` `reviewMoveText`) | Zack marked this done | Zack sent this for review |

`content.ts` keeps reading the old stored summary (`marked "…" done`) as well as the new one (`sent "…" for review`), since rows already in the outbox and in Activity carry the old words.

**Sizes.** The button's label is about 108px at the bar's 14px.

- **Mobile 375 and 320:** the bottom bar is two halves, "Add photo/video" and the main button. Send for review fits a half at 320 with the bar's existing `max-[360px]:px-2`. The sheet's footer is two halves too ("Add photos", "Send for review"). At 320 the label needs 117px and the half left 109, so below 360px the sheet's buttons take the bar's tighter padding (`max-[360px]:px-2`), leaving 121. It never truncates with an ellipsis.
- **Tablet 768:** the sheet opens at its 28rem width with both buttons sized to their labels; nothing tight.
- **Laptop 1280x800:** the bar sits right-aligned with its buttons sized to their labels; the sheet is the same dialog as tablet.
- **Email:** the primary button is full width at every size; no change in layout.

## 4. "Review:" for the partners (Q2)

**Rule.** `content.ts` `subjectWord`: for a partner's email, a job still in Review when it sends reads "Review:". "Done:" still wins for a job already Done (the other partner approved first). Contractor emails never read "Review:".

It goes on the job's state as it sends, the same test that already gives that email its Approve and Send back buttons. So a partner email about late photos the contractor adds in the hour after sending also reads "Review:", which is right: it's still waiting on them.

**Sizes.** "Review: Replace faucet, 118 Congress" keeps the job name in the first line of a phone inbox row; "Ready for review:" pushed it off. Desktop inbox rows show the whole subject either way.

Resolves the open item in docs/specs/contractor-job-emails.md ("Partners' subjects: a job waiting on their review reads `Update:` like any other").

## 5. Reuse check

**Reused as is:** the Review status and both its exits (`setStatus`, `rules.ts canSetStatus`), the Review card and Send back sheet, the 8 am run and its send-time check, the payoff screen and its line, the subject's word list and the partners' Approve and Send back buttons.

**Extended:** `notifyAudience` takes the status moved to; `subjectWord` takes the audience; the strings in section 3.

**New:** nothing. No schema change, no migration, no new component or route.

## 6. Tests

- `rules.test.ts`: a staff move to Done emails nobody, from Review and from any active status; a staff move to In progress (send back, reopen), Scheduled and Canceled still reaches the contractor.
- `core.test.ts`: Approve queues no contractor email row and returns `emailsContractor: false`; Undo inside two minutes still reopens to Review.
- `content.test.ts`: the staff subject is "Review:" while the job is in Review and "Done:" once Done (replacing today's `Update:` case at line 91); the contractor's next-step button reads Send for review; the old `marked "…" done` summary still reads as "sent it for review".
- `job-view.test.ts`, `activity.test.ts`: the new Updates and Activity lines.
- The other test files that assert the old words (about 20, listed by `grep -rln "Mark done\|marked it done\|marked this done" src`) take the new words where they check user-facing text and stay as they are where "Mark done" is only a code comment or name.
- Device check: `npm run test:devices`, then the In progress job's bar and the sheet opened by hand at 375 and 320.

## 7. Docs updated in the same commit

- docs/specs/contractor-job-emails.md: the button and table rows read Send for review; the Approved row of the What's new table goes; the partners' subject open item is marked done here.
- docs/asana-migration-plan.md D6c: the contractor's two buttons are Start job and Send for review.
- docs/brand-guidelines.md line about the failed-upload state: "Send for review stays disabled".
- docs/specs/README.md: its line says it's built.

## 8. Not in this change

- **A problem found after approving.** Connor's call (Nov 15): make a new task for it, assigned to the contractor, rather than reopening the approved one. No Send back on a Done job.
- **A reminder to Connor and Pieter** when a job sits in Review for days. Today's "to review" count on Today covers it for now.
- **A contractor's reply "done" by email** posts a comment, not Send for review, so the job stays In progress and keeps its 8 am emails. The email's Send for review button is the way.

## 9. What the build added

- **My jobs, Done tab, empty:** "Jobs you mark done show up here." read wrong, since a job sent for review stays under Open until HG Capital approves it. It now reads "Approved jobs show up here." (`p/_components/my-jobs.tsx`).
- **Old wording still reads right:** an email line or Activity row written before this ships says `marked "…" done`; the email reads it as "sent it for review". A send-back whose note ends in "for review" is checked first, so it stays a send-back.
- **Undo's database test** (`undo-approval.pg.test.ts`) now checks that Approve queues nothing for the contractor, and tests the refusal for a claimed or sent approval email on a row written the way approvals were queued before Nov 15 (`legacyApprovalRow`).
- **Merged with main's 2bb2e25** (a change put back before its email goes says nothing): the two touch the same `notify` call and don't conflict. An approval queues no line, so there's nothing for it to drop.
