# Tasks list: unit and assignee columns, and a sort

This spec gives the Tasks page a Unit column, shows who each task is assigned to, adds a sort by property, due date or assignee, and stops showing "To do" on rows. It was planned with Connor on Nov 14, 2026, against `d6ef5ca` (main with the color rename), and waits for his "build it".

## 1. Summary

**What's wrong today**

- **The unit is buried.** It rides at the end of the address ("415 Crescent Ave. · Uni…") and truncates first.
- **You can't tell who has a task.** The 20px avatar holds one letter, so Connor and Pieter's "C" and "P" are guesses and José's "J" could be anyone.
- **"To do" shows on some rows and not others.** A contractor's job always shows its status, and a staff task only once it moves past To do. Read across the list, it looks random.
- **One order only.** The list is always soonest due first. There's no way to see one building's work together, or one person's.

**What changes**

- On a laptop the row reads: title, status, Property, **Unit**, **Assignee**, Due, under a row of column headers.
- The assignee is a 24px avatar with two initials plus their first name, at every width.
- Property, Assignee and Due headers sort the list. **Property is the default**, with a heading per building. Assignee gets a heading per person. Due is one flat list.
- Inside a building or a person, overdue and soonest due come first and undated tasks come last.
- A row shows a status only once it has moved past To do, for staff tasks and contractor jobs alike.

## 2. Decisions (Connor, Nov 14)

| # | Question | Decision |
|---|---|---|
| 1 | How the assignee shows | **A, a 24px avatar with two initials plus the first name.** Not the full name without an avatar (B) or initials alone (C) |
| 2 | Due order inside a property or a person | **Overdue and soonest first**, undated last. Not latest date first |
| 3 | Where the sort lives on a laptop | **Column headers** (`SortHeader`). Not a Sort button in the filter bar |
| 4 | Sorted by property | **A heading per building**, the rows under it. Not one flat list. Sorting by assignee follows: a heading per person |
| 5 | "To do" on rows | **Hidden.** A status shows only once it moves past To do |

Defaults taken without a separate question (Connor can overrule any of them):

- Buildings sort by street name, then house number as a number (`compareStreet`, the order every property picker uses): Congress, Crescent, Oxford, Prospect, Sherwood.
- People sort A to Z by the name the row shows. Unassigned is last.
- Tasks with no property or deal are last, under "No property".
- Property is the default in every view (Open, Done, All). In Done, the order inside a group is newest finished first, as Done is sorted today.

## 3. Behavior

### 3.1 The row (decision 1)

- **One-line rows** (the wide Tasks list): title, status column (when any row has one), Property 144px, Unit 96px, Assignee 112px, Due 120px. The Unit cell is `unitLabel` alone, truncated; empty when there's none. The Property cell is the short address alone.
- **The assignee cell**: `Avatar` at 24px (two initials) then the first name in `text-meta` `--muted-foreground`, truncating before the avatar does. A contractor keeps the rounded-square avatar (`outline`). The full name stays on the cell's `title` for a mouse and in `sr-only`.
- **Two-line rows** (phones, tablets and narrow lists) keep today's shape: title and date on top; the place line ("415 Crescent Ave. · Unit 2") with the assignee bottom right. The first name sits before the avatar there, so the avatar keeps the corner under the date (brand section 5), and it now shows at every width (today it hides below a 28rem list).
- **Repeats** (built Nov 14): with the Repeats filter on, a wide row stays one line and the cadence sits under its title, so the columns and their headers still line up. Before, a cadence forced two lines at every width, which would have left a wide list with no column headers and no way to sort. The 24px avatar takes `-my-0.5` so the place line stays 20px and every two-line row stays 62px.
- **Where it applies**: every `TaskRow` with `avatar` on (Tasks, Home's Unassigned and Needs review). `name` stops being a prop, since every avatar now carries the first name.
- **The one-line threshold moves from 50rem to 60rem.** The new columns take about 200px more, and 60rem keeps the title at least 260px wide at 1280 with the status column showing. At 1280x800 with the sidebar open the list is about 61rem, so a laptop still gets one line.

### 3.2 Column headers (decision 3)

- Over the list, in the one-line layout only: no label over the titles, then Status (plain, only when the status column shows), **Property**, Unit (plain), **Assignee**, **Due**. Bold here means sortable.
- `SortHeader` gets a `cell="div"` option for lists that aren't tables; the button carries the sort in its label ("Property, sorted A to Z"). Same look and behavior as on Deals and Portfolio: `ChevronsUpDown` at rest, one caret on the active column.
- A click picks a column or flips it. Property and Assignee start A to Z; Due starts overdue first. Picking Property ascending takes `sort` out of the URL.
- Below the one-line layout the headers drop and **Sort** is the last section of the Filters sheet, as on Deals and Portfolio: Property, Due date, Assignee.
- Tasks' filter bar `wide` moves from 56rem to 60rem, so the facet chips and the column headers appear at the same width and there is always a way to sort.

### 3.3 The sorts (decisions 2 and 4)

The URL's `sort`: none (Property A to Z), `-property`, `due`, `-due`, `assignee`, `-assignee`.

| Sort | Groups | Group order | Inside a group |
|---|---|---|---|
| Property | A heading per building | Street name, then number (`compareStreet`); "No property" last | Due ascending (overdue first), undated last, then newest created |
| Property, flipped | Same | Z to A; "No property" still last | Same |
| Due | None | | Due ascending, undated last, then newest created |
| Due, flipped | None | | Latest due first, undated still last |
| Assignee | A heading per person | A to Z by name; "Unassigned" last | Due ascending, undated last |
| Assignee, flipped | Same | Z to A; "Unassigned" still last | Same |

In Done, "inside a group" and the Due sort's tiebreak use newest finished first.

- **Building** is the task's property, or its deal's address when there's no property (the row's `place`).
- **Person** is who the row is for: the user, the contractor, or an imported name merged into the person it stands for (`withLegacyPeople`, `ownerKeyOf`), so Zack's Asana rows sit with Zack's jobs.

### 3.4 Group headings (decision 4)

- `TaskSection`: the heading, its count in `--muted-foreground`, the rows flat under it. A person's heading leads with their avatar, as Today's contractor sections do.
- The count is the whole group, not just the rows loaded so far, so a group cut by Show more still reads right.
- Under a building heading the Property cells stay empty (the header stays, so it can still be clicked), and a two-line row's place line is the unit alone (`street={false}`). Under a person heading the Assignee cells stay empty and a two-line row drops its avatar.
- When the Property filter has exactly one building picked, the page already names it above the list, so its heading is left out.

### 3.5 Status (decision 5)

- `hasStatusColumn` and the badge show a status when it isn't `OPEN`, for jobs and staff tasks alike. A Waiting reason, the Target date on jobs (D7) and every other status are unchanged.
- With no row past To do, the status column drops, as it does for staff To dos today.

### 3.6 Server

- Property and Assignee sorts can't be done in SQL alone (`compareStreet`, and names from three sources). `allTasks` takes the sort, selects the light keys for every row the filters leave (id, due, finished, created, property and deal address, the three name fields), sorts them in code, and loads the page's `take` rows by id in that order. The same pass gives each group's count.
- The Due sort stays a Prisma `orderBy`.
- Paging, the 400-row ceiling, Show more, search and every filter are unchanged. The sort is part of the URL, so the list's cookie remembers it like the other picks.

## 4. Sizes

| | Laptop 1280x800 | Tablet 768x1024 | Phone 375x667 |
|---|---|---|---|
| Rows | One line, all six columns under headers | Two lines; place line "Street · Unit", first name and avatar bottom right | Same as tablet; place truncates before the name |
| Sort | Column headers | Filters sheet, Sort section | Filters sheet, Sort section |
| Group headings | Yes | Yes | Yes |
| What drops | Nothing | Column headers, the status column below a 480px list (it leads the place line) | Same as tablet |

## 5. Reuse check

**Reused as is**
- `Avatar` at size 24 (two initials), `TaskSection` for the headings, `compareStreet` (`lib/normalize.ts`) for building order, `withLegacyPeople` and `ownerKeyOf` (`lib/tasks/list.ts`) for who a row is for, the Filters sheet's Sort section (`FilterBar` `sort`), `FilterScope` and list memory for the URL and cookie.

**Extended**
- `SortHeader`: a `cell="div"` option, so it can head a list as well as a table.
- `TaskRow`: Unit and Assignee cells on one-line rows, the 24px avatar with first name everywhere, the 60rem threshold, the To do rule.
- `TaskRowSkeleton` and `tasks/(list)/loading.tsx`: the new columns and the header row, drawn at once.
- `allTasks` and `allTasksOrderBy` (`lib/tasks/queries.ts`, `lib/tasks/list-query.ts`): the sort param and the keyed sort.
- `AllList`: groups and headings.

**New**
- Nothing new. References for the patterns: [Plane](https://mobbin.com/screens/c5f3bff4-8337-4758-a29d-c0b1fc2a8724) and [Quo](https://mobbin.com/screens/58ece968-d3e6-48b4-a975-912ddde3d491) (assignee as avatar plus name in a task list), and Deals and Portfolio's own sortable headers.

**Docs to update in the same change**
- `docs/brand-guidelines.md` section 5, Task rows: the Unit column, the headers, and the 24px avatar with first name.
- `docs/components.md`: the `SortHeader` row (`cell="div"`), and "What the Tasks list asks for" (the sort).

## 6. Checks

- Unit tests: the keyed sort (street order, undated last, No property and Unassigned last, flips, Done's newest finished), group counts across a page cut, the To do rule in `hasStatusColumn`.
- `npm run test:devices`, then by hand at 320, 375, 768, 1280x800 and 1920: every sort, the Filters sheet's Sort section, a group cut by Show more, and Home's Needs review rows with the first name on a phone.
