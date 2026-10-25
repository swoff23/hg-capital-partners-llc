# Home as Today

Connor, Oct 23: yes to "Home hosts Today". Today the app answers "what needs me" twice: Home shows count cards, a 5-year CapEx matrix and a short task list, and Tasks opens on Today. This makes Home the one place that answers it, and Tasks the place to see all of them.

The look follows docs/brand-guidelines.md once that's approved; this plan is the structure only.

## What Home shows

1. **Header.** "Good morning, Connor", then one line that answers the page: "3 need you · 5 late". No count cards.
2. **Needs you.** A short list, only when something is in it, of the things that aren't tasks but need a partner. Each is one row that opens the record:
   - a loan maturing within 90 days, and an insurance renewal or rental registration within 60 (the property's key dates);
   - CapEx due this year, as one row ("CapEx due in 2026: $32,000 across 4 properties") that opens the forecast on Properties;
   - a QuickBooks sync older than 3 days, or a lost connection.
   The contractor jobs waiting for review stay where they are, at the top of the Contractors column.
3. **Today**, exactly as approved and built: the Mine | Contractors columns (TodayView), with Overdue and "Move all to today", Today, Waiting and No date in Mine, and Needs review and each contractor's jobs in Contractors.

Removed from Home: the three count cards (active deals, properties and open tasks) and the 5-year CapEx matrix, which moves to the Portfolio page under the property table.

## What Tasks shows

Tasks opens on All. The Today tab goes, because Today is Home now. Old links keep working: /tasks/all redirects to /tasks with its query string, the old `/tasks?status=…` filters are served in place, and a "Today" link points at Home.

## What moves with Today

From the migration session, which built Today:

- **The provider.** Home renders `TaskListProvider` around `TodayView`, with `todayTasks(user.id)` and `todayYmdEastern()` decided once on the server, as `tasks/page.tsx` does now. No key on the provider.
- **The email limit banner** ("Email limit reached today") comes to Home with the lists.
- **`?view=contractors`.** Below lg, TodayView keeps the Mine | Contractors pick in `?view`. Home's own query params never use `view`.
- **Refresh.** `lib/tasks/bulk.ts` (reschedule, Move all to today and their Undo) and `lib/properties/service.ts` revalidate `/tasks` only today; both add `/`. `revalidateTask` and `templates.ts` already do.
- **Redirects.** Applying a playbook (`templates/actions.ts`) lands on `/tasks?property=…` instead of `/tasks/all`. Deleting a task still lands on `/tasks`.
- **Device check.** Once `/tasks/all` only redirects, `tests/devices/routes.ts` stops listing it as a page.

## Sizes

```
DESKTOP 1280
Good morning, Connor                        3 need you · 5 late
NEEDS YOU
  ! Loan matures Nov 30 · 118 Congress St                 >
  ! Insurance renews Nov 12 · 647 Prospect Ave            >
  $ CapEx due in 2026: $32,000 across 4 properties        >
MINE                               | CONTRACTORS
Overdue (5)    [Move all to today] | Needs review (1)
 ( ) Call plumber, 767 · Mon       |  Fix front steps  Zack [Approve]
Today (2) ...                      | Zack (3) ...

TABLET 768 / PHONE 375
Good morning, Connor
3 need you · 5 late
NEEDS YOU (rows as above, two lines each)
[ Mine 5 late | Contractors 1 ]     <- the approved switch
 ( ) Call plumber, 767 water line
     767 Prospect · Mon
```

On a phone, Needs you shows at most three rows, plus "2 more". Nothing else drops.

## Reuse

- **Reused as is:** TodayView and everything in it (another session's Today screen, unchanged); the CapEx forecast card (portfolio-capex.tsx), moved to the Portfolio page; PageHeader.
- **Extended:** the Portfolio page gets the forecast under its table. The Tasks page drops its Today tab.
- **New:** the Needs you list, one small server component on Home that reads key dates, the CapEx forecast and the QuickBooks sync state. It is built from the existing row and badge primitives, so no new component goes in the inventory.

## References

- Airbnb made Today the host's home screen: [Airbnb Today](https://mobbin.com/screens/3a9a1f0c-c768-45b8-b3e0-f4d0d02698ad).
- Ramp leads with the review queue ahead of charts ([Ramp](https://ramp.com/blog/simpler-more-efficient-expenses)), and Things 3 opens on Today ([Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58)).
- The review findings behind it: SHELL-003, SHELL-I01 and SHELL-023 in docs/uiux-review/shell.md.

## Who builds what

The Today screen and the Tasks routes belong to the Asana migration session. It agreed on Oct 23 that this session builds the whole change in one PR, the Tasks part included, and it checks the task parts of the diff before it lands.
