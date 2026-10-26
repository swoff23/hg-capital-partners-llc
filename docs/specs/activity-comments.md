# Activity and comments

Spec for Connor's approval, Oct 25, 2026. Nothing here gets built until Connor says "build it" in chat. Approving the spec is not the go-ahead.

It covers every place a record shows its history or takes a comment: the staff task page, Today's Needs review rows, the contractor's job page and My jobs, the deal page and Deals list, the property and contractor records, and the job emails. Visual rules come from `docs/brand-guidelines.md` (Ink and Limestone). Anything those guidelines don't cover is marked **new**. Code state is the `claude/app-uiux-review-mobbin-e2e22f` worktree at `2a07648` (brand slices merged), with uncommitted edits to `task-row.tsx` and `property-tasks.tsx`. Revised the same day after a review against the brand guidelines, CLAUDE.md, the earlier review's decisions and a sample of the references (section 7).

## 1. Summary

**What's wrong today**

- **Three timelines, three looks.** Tasks read oldest first with comment cards. Deals read newest first, with raw diffs and authors pasted into the text three ways. The portal is a flat list with its own time format. Properties and contractors have no history at all.
- **History is noisy.** A contractor ticking 14 checklist items writes 14 lines. Only due date moves fold, across people and with no name. Imported Asana history expands into one heading per day for two years.
- **Nobody can fix a comment.** No edit, no delete, even for a Shared one that already emailed Zack. Deleting a file leaves no trace.
- **The loop doesn't close.** Nothing says Zack gets an email or whether he opened it. Staff have no "new since you looked". The portal clears "2 new" without showing which two.
- **The composer drops context.** A half-written internal note comes back as Shared after a reload. On a short task the phone composer floats mid-screen. A failed deal note is lost to the error page.

**What replaces it**

- **One timeline on every record.** Comments are cards. Changes are quiet sentences. One person's burst folds into one line. Day headings are real headings, and old history groups by month.
- **One composer** for the task page, the portal and the deal page. It says who will see the message before you send it, keeps the visibility with the draft, shows the message at once and keeps a failed one in place with Retry.
- **Edit and delete your own comments**, honest about any email that already went.
- **Closing the loop:** a delivery line under the latest update ("Zack gets an email", then "Seen by Zack · 2:14 PM"), a New divider, an unread dot on task rows, email links that open at the update, and a notice at the top of Zack's job page when HG sends it back.

**Boundaries.** The Send back form's field rules belong to the forms and editing spec, and the duplicate photos between the Photos section and comments to the uploads and photos spec. Home's Needs you is in none of this round's five specs: slice 3 ships the `lastWordBy` helper a later Home pass needs (G2B-I16), and nothing on Home changes here. This spec owns what each of them writes into Activity.

## 2. The components

Every piece below builds on a file that exists. Each says which file it extends, how it behaves at laptop 1280 (mouse), tablet 768 (touch layout), phone 375 and 320, and what drops on a phone.

**Legend for the ASCII previews**

```
o      day or month heading ring: 8px, --surface fill, --line-strong edge
*      6px --line-strong dot: a recorded change
(~)    StatusMark of the new status: 14px, 16 on touch
(C)    20px Avatar, round: a team member
[Z]    20px Avatar, rounded-sm square: a contractor
@      8px --act unread dot
>      16px ChevronRight: a folded run
[lk]   lucide Lock
[...]  ghost icon button with lucide Ellipsis
[cam] [img]  Camera and ImagePlus icon buttons
```

### 2.0 The task page, assembled

The recommended picks from section 3 (markers on the rail, tap to act on touch). Connor is signed in; Zack's reply is new to him.

**Laptop 1280.** Main column beside the 320px Details rail.

```
Activity ────────────────────────────────────────────────────────────────
      Show 12 earlier updates
 o    Yesterday
 (~)  Connor set status to Scheduled for Oct 27 · 9:03 AM
 *    Zack checked 14 items · 4:40 PM                                    >
 o    Today
 @    New ────────────────────────────────────────────────────────────────
 [Z]  ┌────────────────────────────────────────────────────────────────┐
      │ Zack · 2h                                                      │
      │ Doors are in. Trim needs one more coat.                        │
      │ [ph] [ph] [ph] [ph]                                            │
      └────────────────────────────────────────────────────────────────┘
 (C)  ┌────────────────────────────────────────────────────────────────┐
      │ Connor · 5m                                              [...] │  <- [...] on hover or focus
      │ Thanks. Approving once the coat is on.                         │
      └────────────────────────────────────────────────────────────────┘
      Zack gets an email

 ┌──────────────────────────────────────────────────────────────────────┐
 │ Zack sees this and gets an email                                     │
 │ Reply to Zack                                                        │
 │                                                                      │
 │ [img]                                   [ Shared | Internal ] ⌘↵ Send│
 └──────────────────────────────────────────────────────────────────────┘
```

**Tablet 768.** One column under the chip row. Touch sizes: 44px controls, 16px body. No Kbd, no hover menu.

```
Activity ──────────────────────────────────────────────
      Show 12 earlier updates
 o    Today
 @    New ─────────────────────────────────────────────
 [Z]  ┌──────────────────────────────────────────────┐
      │ Zack · 2h                                    │
      │ Doors are in. Trim needs one more coat.      │
      └──────────────────────────────────────────────┘
 ┌────────────────────────────────────────────────────┐
 │ Zack sees this and gets an email                   │
 │ [cam] Reply to Zack                                │
 │ [img]                [ Shared | Internal ] [Send]  │
 └────────────────────────────────────────────────────┘
```

The tools row is one line at 768, as today: ImagePlus, the switch, then Send (the Kbd hides on touch).

**Phone 375.** The composer is pinned to the bottom edge on every task, short or long.

```
Activity ──────────────────────────
      Show 12 earlier updates
 o    Today
 @    New ─────────────────────────
 [Z]  ┌──────────────────────────┐
      │ Zack · 2h                │
      │ Doors are in. Trim needs │
      │ one more coat.           │
      └──────────────────────────┘
──────────────────────────────────── (pinned)
 [cam] [ Reply to Zack     ] [Send]
```

**Phone 320, writing.** The audience line and tools appear while the field has focus or holds text.

```
──────────────────────────────────
 Zack sees this and gets an email
 [cam] [ Doors look good.  ] [Send]
       [ Friday?           ]
 [img] [ Shared | Internal ]
╔═ keyboard ═══════════════════════╗
```

### 2.1 Timeline primitive

Extends `src/components/activity-timeline.tsx` (`ActivityTimeline`, `ActivityItem`, `ActivityDay`).

**Anatomy**

- `ActivityTimeline` stays an `<ol>`. Each `ActivityItem` becomes a two-column grid: a 20px marker column, a 12px gap, then the content.
- One 1px `--line` hairline runs down the center of the marker column, behind the markers. Each marker sits on a `--surface` knockout so the line never crosses an avatar or a mark.
- The marker centers on the content's first line. For a system line that is the `text-meta` line (18px with a mouse, 20 on touch). For a card it is the card's header line (10px padding, then the `text-body` line). This replaces the `-left-[21px]` and `-left-[22px]` offsets and every caller's `markerClassName` (the task card's `top-4.5`).
- `marker` prop: `avatar` (20px `Avatar`; `outline` for a contractor), `status` (the `StatusMark` of the new status), `dot` (6px `--line-strong`), `unread` (8px `--act`, only for the New divider) and `none`. Choice 3.1 decides whether `avatar` and `status` ship.
- `ActivityDay` renders an `<li>` holding an `<h3>` (the Section heading is the h2) in `text-meta` 500 `--fg-3`, with the 8px ring. A `month` variant reads "September", or "August 2025" when it isn't this year.
- Spacing: 12px between entries, 20px above a heading, none above the first.
- The doc comment drops the `max-h-[520px] overflow-y-auto` example and says the timeline scrolls with the page (VISUAL-043, DEALS-059).
- Print: fold controls and menus are `print:hidden`. The hairline and markers print.

**Sizes**

| | 1280 | 768 | 375 | 320 |
|---|---|---|---|---|
| Marker column | 20 | 20 | 20 | 20 |
| Gap to content | 12 | 12 | 12 | 12 |
| Content width (main column) | 760 (584 with the sidebar pinned) | 688 | 311 | 256 |
| StatusMark | 14 | 16 | 16 | 16 |

**Accessibility.** Day headings let a screen reader jump by day. Markers are `aria-hidden`. A contractor's square avatar gets an sr-only "contractor" after the name, so the shape isn't the only cue (G1C-036).

**Tokens.** `--line` (hairline), `--line-strong` (dot, ring edge), `--surface` (knockout, ring fill), `--act` (unread only), `--fg-3` (headings).

**Drops on phone.** Nothing. The rail keeps its 20px column at 320.

**References.** [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338) (avatar on the rail, muted sentences), [GitHub](https://mobbin.com/screens/0475c4c5-ac5d-4197-b23d-e9d9cb14c21f) (a glyph per event on the phone rail), [Linear Mobile](https://mobbin.com/screens/c25eeb30-eb9c-421f-87b0-a0f14dfa259d) (phone rail with small markers).

### 2.2 Entry rows

#### a. Comment card (**new**: `src/components/comment-card.tsx`)

Today's card lives inside `src/app/(app)/tasks/[id]/activity.tsx`. It moves to `src/components/` because the portal and the deal page will use it too.

- **Ground.** Shared: `--surface` on a `--line` edge. Internal: `--fill-1` with a transparent edge. `rounded-md`, 12px by 10px padding. All as today.
- **Header, left to right.** First name in `text-body` 500 `--fg-1` (truncates first). Then the time (`ActivityTime`, 2.4) in `text-meta` `--fg-3`. Then "edited" in `text-meta` `--fg-3` after an edit, whose Tooltip gives the edit time with a mouse. Then, at the trailing edge, Lock plus "Internal" in `text-meta` 500 `--fg-2`. With a mouse, the menu trigger comes last (2.5). On touch nothing in the header is a separate tap target: a tap on the card opens the menu (3.2), whose header line carries the full stamp and the edit time.
- **Names.** First names everywhere: "Zack", not "Zack (Outlaw Carpentry)". The full label is the menu's header line. In the portal, the contractor's own entries read "You".
- **Subline.** Imported subtask comments keep "On checklist item: Install doors" in `text-meta` `--fg-3`, truncated.
- **Body.** `text-body` `--fg-1`, pre-wrap, links as `TextLink`:
  - `https://` URLs link out in a new tab.
  - `/tasks/<id>` paths link to the task, labelled with its title when the page knows it, or "a task" (G1C-030).
  - Asana task links to tasks that weren't imported read "Asana task (not imported)" as plain text (G1C-031).
  - Asana profile URLs become the person's name when the import mapped them, or are dropped (G1C-032).
  - Imported HTML (`data.html`) is ignored. The plain body shows. There is no formatting beyond links (G1C-033 is closed by "links only").
  - In the portal, an imported comment containing one of the property's stored lockbox codes shows it through `Code` with `mask` (G1C-012). Staff see it unmasked through `Code`.
- **Slots.** Media (`MediaGrid`), files (`FilesList`, or the portal's file links until the uploads and photos spec merges them), and under the card, outside it, one delivery or failure line (2.6, 2.7).
- **Imported flags.** Imported comments with `data.edited` show "edited" (G1C-044). `data.pinned` stays stored and unread (no pin feature).
- **Removed files.** A file removed after posting leaves "1 file removed" in `text-meta` `--fg-3` in the files slot. A comment whose only content was files that are now all gone becomes a line: "Connor posted files that were later removed".

| | 1280 | 768 | 375 | 320 |
|---|---|---|---|---|
| Header | name, time, edited, Lock Internal, menu on hover | name, time, edited, Lock Internal | name, time, edited, Lock | name (truncates), time, edited, Lock |
| Menu | 32px ghost icon button on hover or focus | tap the card (3.2) | tap the card | tap the card |
| Media | 6 tiles of 88px, two rows, then Show all | same | 3 fluid columns | 3 fluid columns |

**Drops on phone.** The word "Internal" below 480px (the Lock stays, with `aria-label="Internal"`), the trade in the name, and the hover menu.

**Tokens.** `--surface`, `--line`, `--fill-1`, `--fg-1`, `--fg-2`, `--fg-3`. Internal file rows hover `--fill-2` (FilesList `onFill`), as today.

**References.** [Linear](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270) (comment as a card with its image inside), [Linear Mobile](https://mobbin.com/screens/21b44a29-c1be-4016-acc5-520fa29659a2) (full-width phone cards), [Linear flow](https://mobbin.com/flows/344eea9e-9f9b-4c94-800a-c6147cb51bee) ("edited" beside the time).

#### b. System line

- One sentence in `text-meta` `--fg-3` with first names, then " · " and `ActivityTime`. It wraps, since it is a sentence and not a label.
- Automated writers read by their label: "Property reminder created this task", "Move-in form created this task".
- "Next repeat created, due Dec 5" links forward as today. "Created as the next repeat" now links back to the earlier task through `data.repeatOf` (BPLAY-031).
- Live Asana sync events after the move add " · via Asana" after the time (G2B-I11).
- Sync conflicts become sentences: "Asana and HG disagreed on the due date. Kept Oct 30." The importer stores the field and the kept value in `data`. Older rows read "Asana and HG disagreed on a change". The raw ids stay in the database, out of the UI (G2B-020, G1C-I03).
- Dates inside a sentence use the formatter's absolute form ("Oct 30"), never "Today" or "Tomorrow", because relative words go stale in a record. **New** clarification of brand section 3.
- **Who saw a line.** System lines carry no lock, Internal or not. On a contractor's job the portal shows only scheduled, started, sent back, marked done and approved (`CONTRACTOR_VISIBLE_STATUS` in `src/lib/tasks/rules.ts`, and `docs/asana-migration-plan.md` section 5.1); every other line is staff-only. A lock on each staff-only line would mark most of the timeline and help no decision, so "who saw it" lives in one place: the delivery line under the newest entry Zack can see (2.6).

#### c. Folded run (**new**: `ActivityRun` in `activity-timeline.tsx`)

- One line that stands for several events (rules in 2.3). The whole line is a `button` with `aria-expanded`. A 16px `ChevronRight` in `--fg-3` ends the line and turns 90 degrees when open (`--dur-fast`; no turn under reduced motion).
- The run's time is plain text, not a Tooltip trigger, so the button holds no other control. Its members carry their own times once open.
- Open, the member lines appear in place under it, each with its own dot and time.
- At least 32px tall with a mouse, 44 on touch. A long run wraps like any sentence, with the chevron after its last word ("Pieter changed the price and 2 other fields" takes two lines at 320). Hover `--fill-1`, `rounded-sm`, under `@media (hover: hover)` only.
- Imported file runs don't fold. They show one line ("Connor added 6 files") with one row of thumbnails under it (G1D-I03).

#### d. Decision pair

A status change and the note written with it render as one entry, not a line and a separate card (today Send back writes two unconnected events).

```
 (~)  Connor sent this back · 2h
      ┌─────────────────────────────────────────────┐
      │ The trim on the left side still needs paint. │
      └─────────────────────────────────────────────┘
```

- The marker is the StatusMark of the new status: In progress after a send back, Review (`--warn`) after Mark done, Done (`--ok`) after Approve.
- The note card has no header of its own. The line above names who and when. Photos posted with the note sit inside the card.
- `core.setStatus` stores `data.statusEventId` on the note's COMMENT so the pair is exact, not guessed from timestamps. Today the portal's Mark done writes its note first, through `core.addComment`, then the status (`src/lib/portal/jobs.ts`). It moves to passing the note and photo ids through `setStatus`, so Send back and Mark done write the pair the same way.

#### e. Dividers (**new**: `ActivityDivider` in `activity-timeline.tsx`)

One row type for two jobs: a marker cell, then a `--line` rule with the label at its start.

- **New:** `unread` marker, "New" in `text-meta` 500 `--fg-1`, `id="new"`. Rules in 2.6.
- **Moved from Asana:** no marker, "Moved from Asana · Oct 29" in `text-meta` `--fg-3`. It sits once, between the last imported entry and the first one written in HG (G1C-029). Deals use "Moved from the deals sheet".

**References for the divider.** [Front](https://mobbin.com/screens/d63c9ab6-f7ee-40ef-9b4c-ba4966689e57) (a thin "New activity" rule above the first unseen message, checked), [Slack](https://mobbin.com/screens/b2fc60c9-ff15-4441-b1df-45f0d582fdc0) (a thin New rule above the first unseen reply), [Slack](https://mobbin.com/screens/8b7812e7-c71d-4932-9bdb-e498b3974eb0), [Discord](https://mobbin.com/screens/47edf661-a056-4b0e-a9bd-c62d0b524b8b) (a "New messages" rule).

### 2.3 Folding rules

Extends `src/lib/tasks/activity.ts` (`buildActivity`, `eventLine`, `splitEarlier`), still pure and tested in `activity.test.ts`. Deals use the same burst logic for change entries.

1. **Bursts.** Back-to-back system events by one person, within 30 minutes of the burst's first event, form a burst. Anything by someone else, or any comment, ends it (G2B-023).
2. **Same kind merges into one sentence.**

   | Burst | Line |
   |---|---|
   | 14 checklist ticks | Zack checked 14 items |
   | Ticks and unticks | Zack checked 12 items and unchecked 2 |
   | Due date moved 3 times | Pieter moved the due date from Oct 20 to Oct 30 |
   | Due date set, then cleared | Pieter set the due date, then cleared it |
   | Visit moved twice | Connor moved the visit from Oct 22 to Oct 24 |
   | Status there and back | Connor set status to Waiting, then back to In progress |
   | Status changed 3 or more times | Connor changed the status 3 times, now In progress |
   | Notes saved 5 times | Connor edited the notes · View previous |
   | Renamed twice | Connor renamed this from "Porch light" |

3. **Mixed kinds.** A burst that still has 3 or more sentences shows the first one and a count: "Connor assigned Zack and made 3 more changes", as a folded run. One or two sentences show as lines.
4. **Never folded.** Comments, Mark done, Approve, Send back, a contractor's Start, creation, the next repeat, access changes and sync conflicts. A contractor's change never folds into a partner's, because a different person ends the burst.
5. **Undone at once.** A change the same person reversed within 2 minutes doesn't show, including an Approve undone from its toast (FEEL-I11). The events stay in the database.
6. **Notes keep their text.** `patchTask` stores the text before the save in the NOTES event's `data.from` (G2B-006, G1B-002). "View previous" opens a `Sheet` titled "Notes before Connor's edit" with that text and a secondary "Restore this version" button, which saves it as a new edit. For a folded run it shows the text before the run. This also recovers a resident's original move-in report.
7. **Top fold.** The latest 15 rows show. "Show 12 earlier updates" counts rows after folding, not raw events. It toggles to "Hide earlier updates". Opening it keeps your place (browser scroll anchoring); nothing jumps. The fold never hides the New divider or an anchored update (2.6).
8. **Months.** Opened, rows older than 60 days sit under month headings instead of day headings, and their time slot shows the day ("Oct 3"). No per-month collapse (G1C-045).
9. **Repeats.** Turning repeats on or off writes an event: "Connor set this to repeat every 2 weeks", "Connor turned off repeats" (G1C-019, BPLAY-028). It needs a new event kind (question 1).
10. **Removed files.** Deleting a file writes an ATTACHMENT event with `data.removed`: "Connor removed quote.pdf". The imported "Connor added quote.pdf" line keeps its name, and the new line explains why the file is gone.

**References.** [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338) (one line reads "moved to Done, then back to In Progress", checked), [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775) ("changed Stage and 7 other attributes"), [Asana flow](https://mobbin.com/flows/1374a9aa-bfcf-4a40-b1ec-db872e71b8ce) (one person's "completed this task" and "marked incomplete" sit together under one name, checked).

**Helper for a later Home pass.** `lastWordBy(events)` returns whether the newest comment is a contractor's with no staff reply after it (G2B-I16). Nothing shows it in this spec; Home's Needs you isn't in this round.

### 2.4 Time (**new**: `ActivityTime`)

Extends `src/lib/dates.ts` with `activityTime`, `fullStamp` and `historyDay`. They replace `fmtAgo` and the activity `dayLabel` in `src/lib/tasks/activity.ts` and `updateTimeLabel` in `src/lib/portal/job-view.ts`, so staff and portal read the same.

| When | Time slot |
|---|---|
| Under a minute | now |
| Earlier today, under an hour | 5m |
| Earlier today | 2h |
| An earlier day (under its day heading) | 2:14 PM |
| Under a month heading | Oct 3 |
| Tooltip with a mouse; a comment's menu header on touch | Thu, Oct 30 at 2:14 PM (the year when it isn't this year) |

- Day headings: Today, Yesterday, a weekday within six days back ("Tue"), then "Oct 20", with the year only when it isn't this year. This is the brand's one Eastern formatter, with its past side added. **New:** "Yesterday" and past weekdays. Rows keep `dayLabel` as is, where a past due date is the real date.
- Renders a `<time dateTime>`. With a mouse it sits inside the existing `Tooltip`. On touch it is plain text: the day heading and the clock time already say when, a comment's menu header carries the full stamp (3.2), and a tap target per line would overlap its neighbors (lines sit 32px apart).
- One shared 60-second ticker per page refreshes every label, so "5m" never goes stale (today the server writes it once). The server render and the first client render use the page's `now`, so hydration matches.

**References.** [Todoist](https://mobbin.com/screens/6bd704b6-fefe-46d6-86f4-c987cb9f5902) (clock times under day headings), [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338) (short relative times on lines).

### 2.5 Comment menu, edit and delete

Uses `src/components/menu.tsx` (`Menu`, `MenuItem`, `MenuSeparator`), the shared `Textarea`, `useToast` with Undo. Service paths go in `src/lib/tasks/core.ts`, which today has none (BTASKS-023).

**Menu**

- First a header, not interactive, in two `text-meta` lines: the full label in `--fg-1` ("Zack (Outlaw Carpentry)"), then the stamp in `--fg-3` ("Thu, Oct 30 at 2:14 PM", plus " · edited Oct 31" after an edit). On one line it would run about 380px at touch size, wider than a 320 screen. Each line truncates, and the menu never grows past the screen minus 16px gutters; otherwise it sizes to its content.
- Copy link, on every comment. It copies `/tasks/<id>#update-<eventId>` and toasts "Link copied".
- Copy text, on every comment.
- On your own comments only: Edit, then a separator and Delete (`variant="destructive"`).
- How it opens is choice 3.2. 44px rows on touch, as `Menu` already does.
- No "Make internal" or "Share with Zack". An email can't be recalled, and sharing late changes what Zack was told. Delete and post again covers the mistake.

**Edit in place** (Linear, Asana)

```
 (C)  ┌──────────────────────────────────────────────────────┐
      │ Connor · 5m                                          │
      │ ┌──────────────────────────────────────────────────┐ │
      │ │ Thanks. Approving once the second coat is on.    │ │
      │ └──────────────────────────────────────────────────┘ │
      │ Zack already got the first version                   │
      │                         Cancel  Esc     Save  ⌘↵     │
      └──────────────────────────────────────────────────────┘
```

- The body swaps for the autogrowing `Textarea`, focused with the caret at the end.
- One line under the field, only when it matters. Email already sent: "Zack already got the first version". Email still queued: "Zack gets the edited version".
- Cancel (ghost, sm) with `Kbd` Esc, and Save (secondary, sm) with `Kbd` ⌘↵. With no primary in edit mode, nothing sits disabled without a reason. Saving unchanged text closes the editor. Saving empty text with no files is refused with one `--danger` line: "Add some text, or delete the comment".
- Esc cancels the edit only. ⌘ or Ctrl+Enter saves.
- On a phone the pinned composer hides while an edit is open, so there is one field and one keyboard. Cancel and Save are 44px.
- Saved, the body updates in place and the header gains "edited" (`TaskEvent.editedAt`). No toast: the change in view is the confirmation. The portal shows the new text with "edited".

**Delete** (Asana: removed at once, Undo in the toast)

- Delete soft-deletes (`TaskEvent.deletedAt`), and the card becomes a staff-only line: "Connor deleted a comment · now" (Intercom leaves the same trace; Asana removes the comment outright).
- Toast with Undo for 5 seconds:
  - Shared, email still queued: "Comment deleted · Zack won't get it"
  - Shared, email already sent: "Comment deleted · Zack already got the email"
  - Internal, or no contractor: "Comment deleted"
- Undo clears `deletedAt`. Files on the comment hide with it and come back on Undo. Storage cleanup belongs to the uploads and photos spec.
- Portal: if Zack opened the job after the comment, or its email went, his Updates show "Connor removed a comment · 2h". Otherwise it is gone without a trace (question 3).

**Email interplay.** `OutboxItem` gains `eventId` (it is JSON, no migration). At claim time the drain in `src/lib/notifications/outbox.ts` drops items whose event is deleted and reads the comment's current body. A fast delete or edit inside the 10-minute bundle window (D19) therefore changes what Zack receives. Rows queued before this ships send as stored.

**References.** [GitHub](https://mobbin.com/screens/f51b36bd-2708-42e4-bf86-c4ab39b2afae) (comment menu with Copy link, Edit and a red Delete, checked), [Asana flow](https://mobbin.com/flows/1374a9aa-bfcf-4a40-b1ec-db872e71b8ce) (Pin to top, Edit comment, Copy comment link, Delete comment; inline edit with Cancel and Save changes; "(edited)" after the time, checked), [Asana flow](https://mobbin.com/flows/115a8be3-b56e-4630-ae39-b249bd62c786) (delete at once, toast "Comment was removed" with Undo, checked), [Intercom](https://mobbin.com/screens/e757d6f0-1da5-45a1-9684-298d6adb933b) ("This message was deleted" left in the thread, checked), [hilos](https://mobbin.com/screens/59c3c368-c3bc-4cdb-82c8-91d25d5ad605) (edit in place with key hints), [Campsite](https://mobbin.com/screens/2f32f194-9690-4f68-9e6c-7cf89f88c572) (a short, plain comment menu).

### 2.6 Closing the loop

#### Delivery line (**new**: `DeliveryLine`, a slot under `CommentCard` and the decision pair)

One `text-meta` `--fg-3` line, 4px under the card, aligned with the card's left edge. Two at most per timeline.

**Staff side, under the newest staff entry the contractor can see** (a Shared comment, or a status the portal shows):

| State | Line |
|---|---|
| The contractor has no login | Zack has no login yet |
| Email queued (inside the 10 minutes) | Zack gets an email |
| Email sent, job not opened since | Emailed to Zack |
| Zack opened the job after it | Seen by Zack · 2:14 PM |

The time follows `ActivityTime`'s rows: a clock time today, then the weekday ("Seen by Zack · Tue"), then the date (G2B-I09). It is his latest open, since `lastSeenAt` keeps only the newest.

**Staff side, under your own newest Internal comment:** "Seen by Pieter" once Pieter has opened the task after it. Partners don't email each other (D20), so this is the only signal.

**Portal side, under the contractor's newest update:** "Connor and Pieter get an email", then "Emailed to Connor and Pieter". It stops there. Partners read contractor updates in their email (D20), so a "Seen by Connor" that counts only app visits would be missing under updates they have read. The review lists it under what not to do (`docs/uiux-review/README.md`, "What not to do", G1A-I07).

- "Seen" reads the existing `TaskReadState.lastSeenAt`: the contractor's row (written today by `markJobSeen`) and the staff rows this spec starts writing.
- "Queued" and "emailed" read the outbox row holding this event (`OutboxItem.eventId`, 2.5) and its `sentAt`, so the line ships with that field in slice 3.
- Every line is one line. Fixed words stay under 35 characters, and a long first name truncates ("Seen by Maximilian… · Tue") before the line could wrap.

**References.** [Front](https://mobbin.com/screens/d63c9ab6-f7ee-40ef-9b4c-ba4966689e57) (a "Seen" mark on a sent reply, checked), [Front](https://mobbin.com/screens/bbc86bf9-e021-46c0-8b89-c455d61d20a5), [Speechify](https://mobbin.com/screens/2b6cf279-ba13-49d0-8ec4-6d61808ea1a4) ("Delivered. Not seen yet"), [Airtasker](https://mobbin.com/screens/4adf7c8c-8b04-46a1-9c1e-ef38692340d9) ("Read 1 day ago" under the message).

#### New divider

- `newSince` is the viewer's previous `lastSeenAt` on this task: by `userId` for staff (nothing writes these today) and by `contactId` for contractors. A first visit has no divider. At release every staff row starts at the release time, so no divider or row dot appears on day one for history nobody missed.
- The divider sits above the first entry after `newSince` written by someone else. The viewer's own entries never count.
- The page writes `lastSeenAt = now` for that viewer on open, as the portal already does through `noteJobViewed` and `markJobSeen`.
- It stays put for the visit. The client keeps the first `newSince` it got, so a refresh (RefreshOnReturn, or after sending) doesn't move it, and replies that arrive meanwhile land under it. Leaving and coming back moves it.
- If the first new entry would sit inside the top fold, the fold shrinks so the divider and everything after it show (G2B-022, BPORTAL-011).

#### Anchored links

- Every entry carries `id="update-<eventId>"` with `scroll-margin-top` of the app bar plus 16px.
- Job emails link to `#update-<eventId>` of the bundle's first item (G1A-I13). The fold opens as far as needed to show it.
- Rows with the unread dot link to `#new`. Opened any other way, the page starts at the top.

#### Unread dot on rows

Placement is choice 3.5. What it means is fixed here:

- **Staff task rows** (Today and All, `src/app/(app)/tasks/task-row.tsx`): since you last opened the task, someone else commented, or a contractor posted photos, started or marked done. Changes by the other partner don't dot.
- **Portal job rows** (`src/app/(portal)/p/_components/my-jobs.tsx`): today's `newUpdateCounts` rule, Shared updates from HG since the last open, plus a moved date or updated notes if question 2 goes to A.
- The dot is the brand's unread dot (8px `--act`) with sr-only "New updates". It clears when you open the task.

### 2.7 Composer

Moves from `src/app/(app)/tasks/[id]/composer.tsx` to `src/components/composer.tsx`, because the portal and the deal page will use it. The task page keeps a thin wrapper that wires `addTaskComment`, the uploader and the audience. `ReadyTile`, the drag and drop, paste and the 48 to 192px autogrow stay as they are.

**Props.** `draftKey`, `audience` (the line's text, or none), `visibility` (`switch` or `none`), `uploader` (or none), `onSend`, `pin` (`phone` or `never`), placeholders per mode, `sendLabel`.

**Anatomy, 1280 and 768 (inline, never pinned)**

1. Audience line (always shown from `md`). Shared: `text-meta` `--fg-3`. Internal: Lock plus `text-meta` 500 `--fg-2`, today's style and slot.
2. Ready tiles and the upload tray, unchanged.
3. The field.
4. Tools row: ImagePlus, a spacer, `SegmentedControl` Shared | Internal, `Kbd` ⌘↵ or Ctrl ↵ (hidden on touch), then Send.

Internal turns the box `--fill-1` and the switch track `--fill-2`, as today. Tablet adds the touch-only Camera button left of the field, at 44px. The tools' ghost hover moves under `@media (hover: hover)` (today `IconButton` hovers on touch too).

**Anatomy, phone (below 768, pinned)**

- Edge to edge over a top `--line` rule. 16px inner gutters, so Camera and Send line up with the cards above (today 6px, BTASKS-020). Safe-area padding at the bottom.
- Collapsed: Camera, a one-line field, Send.
- Active (focus, text, files, or Internal picked): the audience line above the field, the field growing to 5 lines (110px on touch; from `md` the 192px cap stays), and ImagePlus plus Shared | Internal below it. Five lines keep the bar under half of what an iPhone SE shows above its keyboard.
- It reaches the bottom edge on every task. Below `md` the task page's grid is at least the screen's height under the top bar (`min-h` with `dvh`, less `--app-bar-h`), its main area takes the spare height, and the composer sits at the foot of that area (`mt-auto`). A short task then puts the bar on the bottom edge with nothing to scroll, and a long one keeps today's sticky behavior (BTASKS-020).
- **New** `useKeyboardInset` (`src/components/use-keyboard-inset.ts`) reads `window.visualViewport` while the field has focus and lifts the bar by the keyboard's height, dropping the safe-area padding while the keyboard covers it. Android Chrome gets the same from `interactiveWidget: "resizes-content"` (supported, per `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`), exported from `src/app/(app)/layout.tsx`, not the root layout. At the root it would also lift the portal's fixed bottom bar over its composer and resize the public site. With content resized, the visual viewport matches the layout one, so the hook reads no inset there and nothing lifts twice.
- On focus, if you were at the end of Activity, the last entry scrolls up to sit just above the bar.
- Toasts stay lifted above it (`useToastInset`, unchanged).

**Audience copy** (fixed words 35 characters or fewer)

| Situation | Shared | Internal |
|---|---|---|
| Contractor assigned, has a login | Zack sees this and gets an email | Lock, Only Connor and Pieter see this |
| Contractor assigned, no login | Zack needs a login to see this. Desktop adds a "Set up login" TextLink to his contractor record | same |
| No contractor (a partner or nobody) | Any contractor you assign sees this | same |
| Three or more staff | | Lock, Only the HG team sees this |
| Portal composer | Connor and Pieter get this by email (three or more staff: The HG team gets this by email) | |
| Deal note box | none | |

- The audience line is one line. Its fixed words stay under 35 characters; a long first name truncates rather than wrap ("Maximilian… sees this and gets an email"). At 320 the line has 288px, about 41 characters at touch size.
- The switch reads "Shared | Internal" on every task, and the contractor's name moves into the audience line. That fixes the first option reading as an action and a long name pushing the row past 320 (BTASKS-019).
- The switch stays on tasks with no contractor. A Shared comment with no contractor assigned has no audience (`audienceContactId` null), so any contractor assigned later sees it (`src/lib/portal/queries.ts`), and Internal is the only way to keep a note private before then. That follows D15 ("Shared by default. Staff switch to Internal for private notes") and the plan's risk table, which says internal notes need the switch (`docs/asana-migration-plan.md` section 10). It departs from the review, which proposed hiding the switch there (BTASKS-019 and its line under "Decisions for Connor"); its verification asked to keep it. Say if you want it hidden anyway.
- Staff names join with commas and a final "and" (`joinNames`), never "Connor and Pieter and Dana".
- Placeholders: "Reply to Zack" (contractor with a login), "Add a comment", "Add an internal note". Below 480px the Internal one shortens to "Internal note".
- Send reads "Send" for Shared and "Add note" for Internal, so the button names the mode (Intercom). Send becomes `secondary`, like the portal's, so it never competes with the Review banner's Approve as a second primary.

**Draft.** Text and visibility are stored together per `draftKey` in localStorage as `{ v: 2, text, visibility }`. Files waiting to go out come back from the server as today (`drafts`). A half-written Internal note comes back Internal with its Lock line. A draft in today's text-only format restores as Internal: a reply that waits is cheaper than a leaked note, and the fill, the Lock line and the "Add note" label show the mode before anything is sent.

**Keyboard**

- ⌘ or Ctrl+Enter sends. Paste and drag and drop add files, as today.
- Esc blurs the field and keeps the draft. It never clears text. On a phone it collapses the tools when the field is empty and Shared. An open popover or menu closes first, so one Esc closes one layer.
- Tab order: field, ImagePlus, the switch, Send.

**Sending** (React 19 `useOptimistic`)

- The message appears at the end of Activity at once (the top of a deal's log), the field clears, and after 200ms the time slot reads "Sending…" (brand: spinners show after 200ms).
- Each send carries a `clientId` made in the browser, stored on the event (`TaskEvent.data.clientId`). The server ignores a second write with the same id, so a Retry after a timeout that did post never posts twice.
- The outgoing text moves to a pending slot in the same storage entry and clears only on success. After a reload, a pending message whose `clientId` is already in the page's events is dropped; otherwise it comes back in the field. Nothing is lost and nothing doubles.
- Success swaps in the server's event and its delivery line. No toast: the message in view is the confirmation, and its line says what happens next.
- Failure keeps the card with one `--danger` `text-meta` line built from `callAction`'s message: "Didn't send: no connection · Retry" offline, "Didn't send · Retry" otherwise. Retry resends the same text, visibility, uploaded file ids and `clientId`, so nothing uploads or posts twice. The failed card's menu offers Retry, Edit (back into the composer) and Discard.

**Print.** `print:hidden` (G1E-010).

**Drops on phone.** The Kbd, the audience line and the tools row until you start writing, the "Set up login" link, and the long Internal placeholder below 480.

**Motion.** A new card fades in over `--dur-fast`. Reduced motion keeps the fade at 120ms or less, per the global block.

**References.** [Front](https://mobbin.com/screens/e8511de2-eaee-486f-8071-4d184bb24274) ("Comment will be visible to you and Alex Smith" under the field, checked), [Front](https://mobbin.com/screens/645853fe-3cef-44fa-ba6f-4ed561ff8a8b), [Asana flow](https://mobbin.com/flows/1374a9aa-bfcf-4a40-b1ec-db872e71b8ce) ("... will be notified" beside Comment, checked), [Basecamp](https://mobbin.com/screens/9c5e357f-7293-480b-b2cf-7c8791781378) ("2 people will be notified"), [Asana](https://mobbin.com/screens/a7d549cb-79ac-408f-bf83-d0437109f22e) (phone composer naming who's notified), [Intercom](https://mobbin.com/screens/d4d6efaf-d387-4211-9bdf-1c207d1f2714) (note mode tints the box and Send becomes "Add note", checked), [Intercom](https://mobbin.com/screens/59651e9f-01c8-49aa-9a17-c51d58678785), [Linear Mobile](https://mobbin.com/screens/a96b8326-76e3-4c24-822c-9617062a24fc) (composer on the keyboard), [Linear](https://mobbin.com/screens/d0f8ebba-34b7-469c-a708-1069e55a3e02) (composer after Activity on desktop), [OpenPhone](https://mobbin.com/screens/fd44cd6d-3bf9-4be7-bae2-f6e4b25cb27d) ("Failed to send" with Retry), [Airtasker](https://mobbin.com/screens/f7d6c91b-9b5e-4144-bf42-7c7c4718997b) ("Sending…" in place), [Apple HIG, virtual keyboards](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards).

### 2.8 Review banner and Send back

Extends `src/app/(app)/tasks/[id]/review-banner.tsx`, `src/app/(app)/tasks/review-actions.tsx` and `src/app/(app)/tasks/task-list-context.tsx`. The banner's layout is choice 3.6. The rest is fixed here.

- **One order everywhere.** Send back, then Approve, the primary at the trailing edge as in dialogs. The banner uses secondary then primary. Today's rows use ghost then secondary, one step lighter in a list (BTASKS-014).
- **Approve** toasts "Approved · Zack gets an email" with Undo for 5 seconds. The ripple clause shows only when it's true (Zack has a login); otherwise the toast reads "Approved". Emails wait 10 minutes, so Undo before the bundle goes is honest. Undo returns the job to Review, drops the queued item, writes no email of its own, and takes back a repeat's next copy through the existing `takeBackRepeat` (BTASKS-015).
- **One Send back sheet** (`src/app/(app)/tasks/send-back-sheet.tsx`, feature-only) for the banner and Today. Title "Send back to Zack", label "What needs another look?", one consequence line "Back to In progress · Zack gets an email" (G1A-012; "Back to In progress · Zack has no login yet" without one), Cancel with Esc and Send back with ⌘↵, 5000 characters on both. The note survives closing the sheet and a failed send. The forms and editing spec owns the field rules if it says otherwise.
- **After a decision** the banner shrinks in place to one system line for the rest of the visit, led by the new status's StatusMark: "Pieter approved this · 9:14 AM" beside the Done mark, or "Connor sent this back · now" beside In progress. The next visit drops it, and the decision pair (2.2 d) keeps the record in Activity. This closes the loop where the eye already is (G1A-014; G2B follows Mercury's Submitted, Approved stepper). A stale banner is refused with "Pieter approved this", the page refreshes, and the same line takes the banner's place.
- **Needs review rows at 375 and 320.** Below a 480px list the two buttons keep today's line of their own under the title and place, right-aligned (`task-row.tsx`), so neither row of controls wraps. This departs from brand section 5's density rule, where a trailing button drops below 480; it predates this spec, and approving from Today on a phone is the row's main job. Say if the buttons should drop instead, leaving the row to open the proof card.
- **Photos on a send back note** (G1D-I06): not in this spec.

**References.** [ClassDojo](https://mobbin.com/screens/225128f0-1acf-49e8-a5e7-86532d8c7dfb) ("Needs Review", the submission and its comment, then "Approve item?" with "Portfolio item will be shared with Sam's parents and Sam", Approve and Return as draft, checked), [ClassDojo](https://mobbin.com/screens/8767e826-c7af-478c-a797-8a02b71f4006), [Airwallex](https://mobbin.com/screens/68f1a7f7-0e87-49a9-a9a9-6ec913167bf0) (a reason before sending a request back), [Aboard](https://mobbin.com/screens/002ebeab-9460-41e8-bdbb-b76019b8f550) (Reject and Approve at the foot of the request).

### 2.9 Record logs: deals now, property and contractor later

Extends `src/app/(app)/deals/[id]/page.tsx`, `src/lib/deals/service.ts` (`addDealNote`, `diffDeal`) and `src/lib/deals/log.ts`. The reading order is choice 3.3.

- **Rows.** Notes are `CommentCard`s with the author on the rail. Change entries are system lines with dots, burst-grouped by 2.3.
- **Authors.** `DealNote` gains `authorUserId` (question 1). New notes stop appending "(CS)". A one-time backfill maps the three pasted forms ("(CS)", "  ·  Connor Swofford", "  ·  <label>") to the author and strips them (DEALS-044).
- **Change sentences.** `DealNote` gains a `data` column with the field, the old value and the new one. A burst reads "Connor changed the price and 2 other fields". Opened, each field is a row: label in the 112px rail column (96 on phones), then old value, a 14px `ArrowRight` in `--fg-3`, new value, with `Money` for amounts (Attio, Twenty). At 320 the values get 160px: amounts fit on one line ("$425,000 → $410,000"), and long text values wrap inside their column with the arrow kept beside the new value. A single change reads "Pieter changed the status to 1 - High". A cleared value reads "Connor removed the listing link" (DEALS-042, DEALS-IV06, COPY-031, VISUAL-I10).
- **No-op edits** aren't written. `diffDeal` compares trimmed, normalized values (VISUAL-I10 verification). Existing no-op rows are hidden at read.
- **Times.** App entries show clock times under day headings (DEALS-V06). Dated imported notes sit under their day with an empty time slot. Undated imported notes sit under an "Undated" heading at the old end and no longer show the import timestamp (DEALS-043).
- **Heading.** "Activity" with no count. It counted change lines and helped no decision (DEALS-058).
- **Fold.** The newest 15 rows show (after bursts fold). "Show 40 older updates" at the foot opens the rest and toggles to "Hide older updates", the task page's fold turned upside down for a newest-first log.
- **Note box.** The shared Composer with no visibility switch and no uploads: placeholder "Add a note", Send labelled "Add note" (secondary, so the stage control keeps the page's one primary), ⌘↵, a saved draft per deal, the new note on screen at once, and "Didn't save · Retry" on failure. The server action returns a result through `callAction`, so `withLog` can't throw the page into the error boundary and lose the note (FEEL-I06, G2D-001, G2B-V01). The box isn't pinned on phones (choice 3.3).
- **Edit and delete** your own notes, through the same menu (DEALS-V03). `DealNote` gains `editedAt` and `deletedAt`.
- **Latest note on the Deals list** (`src/app/(app)/deals/deal-row.tsx`): one note, not two stacked, prefixed by its day ("Oct 20 · seeing tomorrow") in `text-meta` `--fg-3`, truncated, with the full text and day in the Tooltip. The author suffix is gone (DATA-I13). The column still drops below about 1124px (`COLUMN_DROP`), so tablet and phone don't see it; this spec doesn't change that.
- **Property, later** (PROPERTY-011, G1B-013, D10): the Notes blob becomes an Activity section on the property hub with `PropertyNote` (`docs/property-page-plan.md` section 5) and change entries for details, loan, insurance, units, listings and documents, on the same rows. The existing blob becomes its first note, labelled "Imported note".
- **Contractor, later** (ADMIN-I01, IA-034): the comments paragraph becomes a "Team notes" section with the Lock line "Only the HG team sees this" and dated notes, plus a rolled-up log of the contractor's updates across jobs, each line linking to its job.

**References.** [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b) (timeline with Add note, newest first, beside the Details rail, checked), [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93) (the note box opens at the top of the timeline with "Cancel Esc" and "Add note ⌘↵", checked), [Stripe](https://mobbin.com/screens/a8eb6887-0ce8-47f6-b1c9-7c35ae1391be), [Shopify](https://mobbin.com/screens/0bac6f5a-8648-40e5-8f91-1a82964f7dd7) (comment box on top, newest first), [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775) ("changed Stage and 7 other attributes", opened into old and new rows), [Twenty](https://mobbin.com/screens/e1115c57-801a-4b80-a8b5-05c2969b77c8) (month heading, "You updated 3 fields").

### 2.10 Job emails

Extends `src/lib/notifications/content.ts` (`itemText`, `itemLines`, `taskEmail`) and `outbox.ts`.

- Comment lines carry the full text up to 500 characters, ending in "…" when cut, with line breaks kept (BCONTRACT-020).
- Files read "3 photos and 1 file", not "(+3 files)".
- The job link opens at `#update-<eventId>` of the bundle's first item.
- Edits and deletes inside the bundle window change the email (2.5).
- Due date and notes changes stay emailed under D19. The job page shows them too, through the notice in 3.4, so the email and the page agree (question 2).

## 3. Design choices

Six choices that change what people see. Each slice in section 4 waits on its pick.

### 3.1 Rail markers

**A. Dots only.** Today's markers on the new grid: an `--act` dot for a comment (avatar inside the card header), a `--line-strong` dot for a change.

```
1280                                              768                                  320
 o   Today                                         o   Today                            o   Today
 *   Connor set status to In progress · 9:02 AM    *   Connor set status to In          *   Connor set status to
 *   Zack checked 14 items · 4:40 PM          >        progress · 9:02 AM                   In progress · 9:02 AM
 #   ┌──────────────────────────────────────┐      #   ┌──────────────────────────┐     #   ┌───────────────────┐
     │ [Z] Zack · 2h                         │          │ [Z] Zack · 2h            │         │ [Z] Zack · 2h [lk]│
     │ Doors are in.                         │          │ Doors are in.            │         │ Doors are in.     │
     └──────────────────────────────────────┘          └──────────────────────────┘         └───────────────────┘
 (# is a 6px --act dot)
```

**B. Identity and status on the rail (recommended).** The author's avatar replaces the comment dot, a status change shows its StatusMark, other changes keep the dot.

```
1280                                              768                                  320
 o    Today                                        o    Today                           o    Today
 (~)  Connor set status to In progress · 9:02 AM   (~)  Connor set status to In         (~)  Connor set status
 *    Zack checked 14 items · 4:40 PM         >         progress · 9:02 AM                   to In progress
 [Z]  ┌─────────────────────────────────────┐      [Z]  ┌─────────────────────────┐          · 9:02 AM
      │ Zack · 2h                            │           │ Zack · 2h               │     [Z]  ┌─────────────────┐
      │ Doors are in.                        │           │ Doors are in.           │          │ Zack · 2h  [lk] │
      └─────────────────────────────────────┘           └─────────────────────────┘          └─────────────────┘
```

**C. A lucide glyph per event type** (Stripe, Plane): Calendar for dates, User for assignments, ListChecks for the checklist, MessageSquare for comments.

```
1280                                                 768                               320
 o      Today                                         o      Today                      o      Today
 (~)    Connor set status to In progress · 9:02 AM    (~)    Connor set status to       (~)    Connor set
 [cal]  Pieter moved the due date to Oct 30 · 10 AM   [cal]  Pieter moved the due              status to In
 [lst]  Zack checked 14 items · 4:40 PM          >           date to Oct 30 · 10 AM            progress
 [msg]  ┌──────────────────────────────────┐        [msg]  ┌──────────────────────┐   [msg]  ┌──────────────┐
        │ [Z] Zack · 2h                     │               │ [Z] Zack · 2h        │          │ [Z] Zack · 2h│
```

**Recommendation: B.** Who said it is what you scan for in a conversation with a contractor. Linear puts each person's avatar on the rail and a status icon on status lines, which is B; GitHub puts the author's avatar beside each comment card and a glyph on each event, which is B for comments and C for the rest. Status changes reuse the one drawn set. The `--act` dot then means unread and nothing else, which the brand reserves it for. Moving the avatar out of the header gives the name 28px more at 320, so the Internal tag stops squeezing it. A costs nothing but leaves two `--act` dots meaning two things once the New divider ships. C adds a dozen glyphs for a two-partner team and makes a long imported history busier. Same at every size; nothing drops on phone.

References: B: [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338) (avatars and status icons on the rail, checked), [GitHub](https://mobbin.com/screens/f51b36bd-2708-42e4-bf86-c4ab39b2afae) (avatar beside the comment card, checked). C: [GitHub](https://mobbin.com/screens/f51b36bd-2708-42e4-bf86-c4ab39b2afae) (tag, person and merge glyphs on events, checked), [GitHub phone](https://mobbin.com/screens/0475c4c5-ac5d-4197-b23d-e9d9cb14c21f), [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b) (a glyph per payment event, checked), [Plane](https://mobbin.com/screens/daa3c99b-2a4c-401e-b804-ab045e23ec37).

### 3.2 Comment actions on touch

Desktop is the same in all three: a 32px ghost ⋯ at the end of the header, shown on hover or keyboard focus under `@media (hover: hover)`. It has a negative margin, so the 20px header line doesn't grow.

**A. ⋯ always visible on touch** (GitHub mobile, Notion iOS, as BTASKS-023 proposed).

```
768                                          375 / 320
 (C)  ┌──────────────────────────────────┐   (C)  ┌────────────────────────┐
      │ Connor · 5m       [lk] Internal [...]│      │ Connor · 5m  [lk] [...] │
      │ Approving once the coat is on.    │        │ Approving once the     │
      └──────────────────────────────────┘        │ coat is on.            │
                                                  └────────────────────────┘
```

**B. Tap the card on touch (recommended).** A tap anywhere on the card except its links, photos and files opens the same menu, anchored to the header. **New**: no reference opens a comment's menu from a plain tap on the card; this is CLAUDE.md's tap-to-act rule applied to a card.

```
768 and 375 / 320
 (C)  ┌────────────────────────┐
      │ Connor · 5m       [lk] │   tap   ┌────────────────────────┐
      │ Approving once the     │ ──────> │ Connor Swofford        │
      │ coat is on.            │         │ Thu, Oct 30 at 2:14 PM │
      └────────────────────────┘         │ Copy link              │
                                         │ Copy text              │
                                         │ Edit                   │
                                         │ ────────────────────── │
                                         │ Delete                 │
                                         └────────────────────────┘
```

- The card isn't a button, since it holds links and photos. A `usePress` handler on it opens the menu, and the header holds a visually hidden `MenuTrigger` named "Actions for Connor's comment", so VoiceOver and Switch Control reach the same menu.
- With a mouse the card does nothing on click, so text stays selectable.

**C. Long-press on touch** (Slack, iMessage). Nothing visible on the card.

**Recommendation: B, against the research.** The references favor A: Notion iOS and GitHub mobile both keep a ⋯ on every comment, and Notion's opens a sheet of Edit, Copy link and Delete. CLAUDE.md rules A out: touch has no hover, and a hover cue must not become a permanent mark on touch; use tap to act. A would also put a ⋯ on every card of a long imported history, mostly on cards you can only copy. C is hidden, and on iOS a long press selects text. B carries the full stamp in the menu's header, so a tap gives what the hover Tooltip gives on desktop. Its cost is discovery: nothing on the card says it can be tapped. If Connor would rather follow the research, A is the pick, with the ⋯ only on your own comments, where Edit and Delete live. Tablet behaves like the phone.

References: A: [Notion flow](https://mobbin.com/flows/1203f8c2-cde3-4f7c-b074-b4c5da3d6114) (a ⋯ always on the comment, opening a sheet with Edit, Copy link and Delete, checked), [GitHub phone](https://mobbin.com/screens/f2591c2b-62b9-4cc2-8ed6-ec84c9567587) (always-visible ⋯). The menu's items: [Campsite](https://mobbin.com/screens/2f32f194-9690-4f68-9e6c-7cf89f88c572), [Asana flow](https://mobbin.com/flows/1374a9aa-bfcf-4a40-b1ec-db872e71b8ce) (checked).

### 3.3 Reading order on record logs (deals now; property and contractor later)

This contradicts two earlier findings: VISUAL-I10 asked to move deals onto the task layout (oldest first), and MOBILE-032 asked to pin the deal note box on phones.

**A. Newest first, note box on top (recommended).** Same rows, markers, times and menus as tasks.

```
1280 (main column, Details rail to the right)       768                              320 (after Details; 375 the same, wider)
Activity ───────────────────────────────────        Activity ─────────────────────   Activity ─────────────
┌───────────────────────────────────────────┐       ┌──────────────────────────┐     ┌──────────────────┐
│ Add a note                                │       │ Add a note               │     │ Add a note       │
│                         ⌘↵  [Add note]    │       │              [Add note]  │     │      [Add note]  │
└───────────────────────────────────────────┘       └──────────────────────────┘     └──────────────────┘
 o    Today                                          o    Today                       o    Today
 (C)  ┌ Connor · 2h ───────────────────────┐         (C)  ┌ Connor · 2h ─────────┐    (C)  ┌ Connor · 2h ┐
      │ Seeing it tomorrow at 10.           │              │ Seeing it tomorrow   │         │ Seeing it   │
      └─────────────────────────────────────┘              │ at 10.               │         │ tomorrow at │
 *    Pieter changed the price and 2 other fields >        └──────────────────────┘         │ 10.         │
 o    Oct 20                                         *    Pieter changed the price        └─────────────┘
                                                          and 2 other fields  >      *    Pieter changed
                                                                                          the price and 2
                                                                                          other fields  >
```

The note box keeps Add note beside the field's foot at every width; the run line wraps as a sentence (2.2 c).

**B. Oldest first, composer last, pinned on phones** (VISUAL-I10 and MOBILE-032).

```
1280                                                768                               375
Activity ───────────────────────────────────        Activity ─────────────────────   Activity ─────────────
      Show 40 earlier updates                              Show 40 earlier                 Show 40 earlier
 o    Oct 20                                         o    Oct 20                      o    Oct 20
 *    Pieter changed the price and 2 other fields >  *    Pieter changed the          *    Pieter changed
                                                          price and 2 other               the price and 2
                                                          fields  >                       other fields  >
 o    Today                                          o    Today                       o    Today
 (C)  ┌ Connor · 2h ───────────────────────┐         (C)  ┌ Connor · 2h ─────────┐    (C)  ┌ Connor · 2h ┐
      └─────────────────────────────────────┘              └──────────────────────┘         └─────────────┘
┌───────────────────────────────────────────┐       ┌──────────────────────────┐     ──────────────────────
│ Add a note                ⌘↵  [Add note]  │       │ Add a note   [Add note]  │      [ Add a note ] [Add note]
└───────────────────────────────────────────┘       └──────────────────────────┘      (pinned)
```

**C. Newest first, with a note bar pinned on phones** (MOBILE-032 as written).

```
1280 and 768: as A                                   375
                                                     Activity ─────────────
                                                      o    Today
                                                      (C)  ┌ Connor · 2h ┐   <- a new note lands here, far from the bar
                                                     ──────────────────────
                                                      [ Add a note ] [Add note]  (pinned)
```

**Recommendation: A.** A deal is a record log: mostly field changes and team-only notes, read for "what's the latest". Stripe, Shopify and Attio put the newest first with the box on top, and the latest note then sits right under the box (Stripe's note box opens at the top of its timeline, checked). Tasks and the portal stay oldest first because they are conversations with an outside party, as in Linear and GitHub. The cost is two reading orders in one app, split by a rule people can feel: logs newest first, conversations oldest first. On a phone the box is one short scroll past Details, and while you type a showing note iOS lifts the box above the keyboard. B puts the latest note at the bottom of 15 rows on a laptop. C sends a new note off screen from where it was typed. The property and contractor logs follow the same pick.

References: [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b) (checked), [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93) (checked), [Shopify](https://mobbin.com/screens/0bac6f5a-8648-40e5-8f91-1a82964f7dd7), [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775), [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8) (B's pinned bar).

### 3.4 The contractor's Updates

**A. The same timeline as the staff page (recommended).** Rail, avatars, comment cards, day headings, the New divider and the delivery line, through `CommentCard` and `ActivityTimeline`.

```
768 (record max 1200, 24px gutters)              375                              320
Updates ──────────────────────────────────       Updates ─────────────────────    Updates ─────────────────
 o    Yesterday                                   o    Yesterday                   o    Yesterday
 (~)  Connor scheduled this for Oct 27            (~)  Connor scheduled this       (~)  Connor scheduled
 o    Today                                       o    Today                            this for Oct 27
 @    New ─────────────────────────────────       @    New ────────────────────    @    New ──────────────
 (C)  ┌ Connor · 2h ──────────────────────┐       (C)  ┌ Connor · 2h ─────────┐    (C)  ┌ Connor · 2h ───┐
      │ Use the side door, code in Access.│            │ Use the side door.   │         │ Use the side   │
      └───────────────────────────────────┘            └──────────────────────┘         │ door.          │
 [Z]  ┌ You · 5m ─────────────────────────┐       [Z]  ┌ You · 5m ────────────┐         └────────────────┘
      │ On my way.                         │            │ On my way.           │    [Z]  ┌ You · 5m ──────┐
      └───────────────────────────────────┘            └──────────────────────┘         │ On my way.     │
      Connor and Pieter get an email                   Connor and Pieter get an email   └────────────────┘
                                                                                        Connor and Pieter get an email
 (1280 is the same, wider)
```

The delivery line is one line at every width: 30 characters is about 210px at touch size, inside the 256px column at 320.

**B. Today's flat list, plus day headings and the New divider.**

```
768 and 1280                                     375 / 320
Updates ──────────────────────────────────       Updates ─────────────────────
Today                                            Today
──── New ─────────────────────────────────       ──── New ────────────────────
Connor · 2h                                      Connor · 2h
Use the side door, code in Access.               Use the side door.
You · 5m                                         You · 5m
On my way.                                       On my way.
```

**Recommendation: A.** One component means every fix lands for partners and contractors at once. On a sunlit phone, an avatar and a card separate HG's messages from your own better than a name alone. The delivery line gives a plain update the acknowledgement it lacks today (G1A-I02). It costs 32px of width at 320, which the 256px card absorbs. Times move to the shared formatter (2.4).

**Top of the job page, whichever is picked** (**new**, feature-only: `src/app/(portal)/p/jobs/[id]/_components/job-notice.tsx`). Updates sit at the end of a long scroll, so what changed for Zack also shows under the status row, where he starts reading (BPORTAL-007, G1A-I09).

```
375                                       320
 (~) Connor sent this back · 2h            (~) Connor sent this back
 ┌──────────────────────────────────┐      ┌──────────────────────────────┐
 │ The trim on the left side still  │      │ The trim on the left side    │
 │ needs paint. Bring the ...       │      │ still needs paint. Bring...  │
 │ See the update                   │      │ See the update               │
 └──────────────────────────────────┘      └──────────────────────────────┘
 [cal] Moved to Fri, Oct 30 (was Thu,      [cal] Moved to Fri, Oct 30
       Oct 29) by Connor                         (was Thu, Oct 29)
```

- **Sent back.** The decision pair (2.2 d) without the rail: In progress's StatusMark, "Connor sent this back · 2h", then his note in a `--surface` card on a `--line` edge, three lines, then "See the update" (a `TextLink` to `#update-<eventId>`). It stays until Zack marks the job done again. Below 480 the " · 2h" drops before the sentence would wrap.
- **Date or notes changed since he last looked** (question 2): one line each in `text-body` `--fg-1`, led by a lucide `CalendarClock` or `FileText` in `--fg-3` (16px, 20 on touch): "Moved to Fri, Oct 30 (was Thu, Oct 29) by Connor", "Notes updated by Connor". At 375 they may take two lines; at 320 "by Connor" drops. They clear once he has opened the page after the change.
- Desktop and tablet show the same notice at the record's width; nothing else drops.
- References: the staff `ReviewBanner` anatomy this mirrors, [Flighty](https://mobbin.com/screens/09e08a95-1063-4e78-baeb-a68dddb6136a) ("Departure changed to 10:15 AM" at the top of the record, from G1A-I09).

### 3.5 Unread mark on rows

**A. The dot leads the row, in the gutter (recommended).** Staff task rows (Today, All) and portal job rows. The portal drops its "2 new" text. The dot hangs outside the row's first column, centered 8px before it, so checkboxes, photos and titles stay aligned row to row whether or not a row is unread. At 375 and 320 that leaves it 4px clear of the screen edge inside the 16px gutter.

```
1280 (one-line All row)                               768 / 375 (two-line row)       320
@ ( ) Replace porch light   56 Tamarack St   [Z] Fri  @ ( ) Replace porch light Fri  @ ( ) Replace porc.. Fri
  ( ) Fix gutter            118 Congress     [C] Mon      56 Tamarack St      [Z]        56 Tamarack St  [Z]

Portal My jobs, every size:
@ [photo]  Replace porch light                Review
           56 Tamarack St · Target Fri
```

**B. The dot at the trailing edge** (Depop, Bevel). On task rows it collides with the date, which Connor's Oct 25 row rule fixes at the right edge, and on job rows with the status column.

```
 ( )  Replace porch light            56 Tamarack St   [Z] Fri  @
```

**C. No dot on staff rows.** The New divider on the task page only. The portal keeps "2 new" after the title.

```
 ( )  Replace porch light            56 Tamarack St   [Z] Fri
```

**Recommendation: A.** Superlist, Mindtrip and Shopify mark unread rows with a dot leading the row; Superlist hangs it in the margin, so its rows still line up. It is the only slot that doesn't move the date or the titles. The brand puts the unread dot 12px in from a card's top-right corner. Task rows aren't cards and their top-right holds the date, so this is a **new** position for the same mark, and it needs Connor's OK. A dot alone is the lightest form that works; the job page's New divider shows how many. C leaves staff with no way to see that a contractor replied without opening each task (IA-030, SHELL-I09, JOURNEYS-015). Nothing drops at 320: the title truncates before the date, as today.

References: [Superlist](https://mobbin.com/screens/f8cf46ce-c9c0-4041-b707-202046a06247) (a dot in the left margin of unread Updates rows, checked), [Mindtrip](https://mobbin.com/screens/3c451683-6c3d-4c76-be6a-0a129143ba3a), [Shopify](https://mobbin.com/screens/b1bd4556-d2f2-4e50-91d4-eea279f21206), [Depop](https://mobbin.com/screens/760ad152-b82c-4e16-9813-311352c457e9) (trailing dot).

### 3.6 Review banner

**A. Today's one-line banner, corrected.** The photo count covers this visit only (uploads by the contractor since the job last went to In progress), the contractor's Mark done note shows as one truncated line under it, and the buttons swap order.

```
1280 / 768                                                      375 / 320
┌──────────────────────────────────────────────────────────┐    ┌──────────────────────────────┐
│ [Z] Zack marked this done · 4 photos  [Send back][Approve]│    │ [Z] Zack marked this done    │
│     "Trim is done, left side needs one more day."         │    │ "Trim is done, left side n.."│
└──────────────────────────────────────────────────────────┘    │ [Send back]      [Approve]   │
                                                                └──────────────────────────────┘
```

Below 480 the "· 4 photos" clause drops rather than wrap (brand section 5, density).

**B. A proof card (recommended).** What you need to approve, in one place: the note in full (three lines, then More), this visit's photos in one row, and the checklist count.

```
1280 / 768                                                      375 / 320
┌──────────────────────────────────────────────────────────┐    ┌──────────────────────────────┐
│ [Z] Zack marked this done · 2h                           │    │ [Z] Zack marked this done · 2h│
│ Trim is done. Left side needs one more day to cure.      │    │ Trim is done. Left side      │
│ [ph] [ph] [ph] [ph]                                      │    │ needs one more day to cure.  │
│ Checklist 12 of 14 done                                  │    │ [ph] [ph] [+1]               │
│                              [Send back]  [Approve]      │    │ Checklist 12 of 14 done      │
└──────────────────────────────────────────────────────────┘    │ [Send back]      [Approve]   │
                                                                └──────────────────────────────┘
```

- Flat `Card` as today (`--surface`, `--line`, `rounded-lg`, 16px padding). Brand section 9 keeps `Card` for Home and Overview modules; this banner is today's one other use, and the spec keeps it rather than invent a notice surface. Listed with the brand points below.
- The header is one line at every width: "Zack marked this done · 2h" is about 210px at touch size, inside the 222px it has at 320; a long name truncates first, never the verb.
- Photos use `MediaGrid` in a new one-row mode (`rows={1}`): 6 tiles from `sm`, 3 on a phone. When more exist, the last tile shows "+1" in `--on-photo` on `--photo-scrim`, the brand's photo counter look, and opens the Lightbox there.
- "Checklist 12 of 14 done" in `text-meta` `--fg-3`, only when the task has a checklist.
- On a phone the buttons split the width, 44px tall.

**Recommendation: B.** Approving is the moment the loop between partner and contractor closes, and today the evidence sits three sections below (G1A-007). ClassDojo shows the submission, its note and its comment right above Approve, with a line saying who will see it. A fixes the wrong count but still sends you scrolling, and on a phone it loses the photo count to the density rule, which B avoids by showing the photos.

References: [ClassDojo](https://mobbin.com/screens/225128f0-1acf-49e8-a5e7-86532d8c7dfb) (checked), [ClassDojo](https://mobbin.com/screens/8767e826-c7af-478c-a797-8a02b71f4006), [Aboard](https://mobbin.com/screens/002ebeab-9460-41e8-bdbb-b76019b8f550).

## 4. Migration map

Every instance from the inventory, grouped by page.

### Shared components

| Instance | Becomes | What changes for the user |
|---|---|---|
| `activity-timeline.tsx` (ActivityTimeline, ActivityItem, ActivityDay) | Grid rail with a `marker` prop, `ActivityDay` as an h3 with a month variant, new `ActivityRun` and `ActivityDivider`, print rules, no inner-scroll example | Markers line up on every size. Screen readers jump by day. Long history reads by month |
| Author identity (Avatar and names) | First names everywhere, 20px avatar on the rail (3.1 B), sr-only "contractor", full label in the menu header | One name style across lines and cards. The contractor cue is spoken, not only drawn |
| Edited, deleted, pinned and mention states | `editedAt` and `deletedAt` written by new `core.ts` paths, "edited" tags, deleted lines, imported `edited` honored. Pin and mentions not added | A wrong comment can be fixed or removed, and the record says so |

### Staff task page (`/tasks/[id]`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| TaskActivity and its Row | Renders `CommentCard`, system lines, `ActivityRun`, decision pairs and dividers from the new `buildActivity`. The page selects `TaskEvent.source`, `editedAt` and the read state | 14 ticks become one line. "Show 12 earlier updates" counts what you'll see and folds back. Times stay current and show the full stamp on hover, or in a comment's menu on touch |
| Comment card | `CommentCard` with links, the menu (3.2), edit and delete, delivery line | Links work. Your own comments can be edited and deleted. You see whether Zack got it and opened it |
| Internal comment card | Same card on `--fill-1` with Lock; the word drops below 480 | Unchanged look, no name squeeze at 320. "Seen by Pieter" under your own newest note |
| System event lines | Sentences from `eventLine` with bursts, reversals, repeat on and off, removed files, conflict sentences, "via Asana", and Notes with View previous | Fewer, clearer lines. Notes overwrites are recoverable. A gone file says it was removed |
| Attachments in comments | Unchanged inside the card. Removed files leave "1 file removed". Photos section dedupe and held contractor uploads go to the uploads and photos spec | A comment no longer silently loses a photo |
| Task comment composer | Shared `Composer` with the audience line, visibility in the draft, Esc, "Sending…" in place, "Didn't send · Retry" with a `clientId` so nothing posts twice, pinned to the screen's bottom with 16px gutters and the keyboard inset, comma-joined names, secondary Send, hover only under `(hover: hover)`, print hidden | You know who gets it before you send. An internal draft stays internal. The phone bar sits on the bottom edge and rides the keyboard |
| Shared/Internal switch | "Shared \| Internal" on every task. The name moves to the audience line. Send reads "Add note" for Internal | No action-sounding option. Fits 320 with any name |
| Review banner and Send back sheet | Choice 3.6, Send back then Approve, Undo on Approve, one Send back sheet with a consequence line, a one-line outcome in the banner's place for the rest of the visit, the outcome as a decision pair | You approve with the evidence in view, can undo a mis-tap, see who decided where the banner was, and the result stays in Activity |

### Today (`/tasks`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Needs review row actions and the list's Send back sheet | Send back (ghost) then Approve (secondary), the shared sheet, "Approved · Zack gets an email" with Undo. Below a 480px list the pair keeps its own line under the row, as today (2.8) | Same order and words as the task page. Approve can be undone |
| Unread signals for staff (task rows) | The unread dot (3.5 A) from staff `TaskReadState` rows, linking to `#new` | You see which jobs a contractor replied on, and land on the reply |

### Home (`/`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Unread signals for staff (Needs you) | Not in this round: none of the five specs covers Home. Slice 3 ships `lastWordBy` (G2B-I16) so a later Home pass can flag jobs where the contractor wrote last | Nothing on Home changes yet. Today's rows get the unread dot meanwhile |

### Contractor job page (`/p/jobs/[id]`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Updates list | Choice 3.4 A: `ActivityTimeline` with `CommentCard`, day headings, the New divider, the shared time formatter, the delivery line, masked lockbox codes in imported comments. A notice at the top of the page for a send back with its reason (BPORTAL-007) and, per question 2, a moved date or updated notes (G1A-I09). Photos shown twice go to the uploads and photos spec | Zack sees which updates are new, when each happened, and that HG got his. A sent-back job says why at the top. The page agrees with his emails |
| Update composer, bottom bar and Mark done note | The text box becomes the shared `Composer` inline at the end of Updates (not pinned; the action bar owns the bottom edge): autosize, a draft per job, ⌘↵, the audience line "Connor and Pieter get this by email", the update in place at once. The upload tray, bar and Mark done payoff are unchanged (uploads and photos spec). Mark done passes its note through `setStatus`, so it lands as a decision pair | He knows who reads his update, and the update itself is the confirmation |

### Contractor My jobs (`/p`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| "N new" mark | The leading dot (3.5 A). The "2 new" text goes. The row links to `#new` | One mark in one place. Opening the job lands on what's new |

### Deal page (`/deals/[id]`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Activity (DealNote timeline) | Record log (3.3 A) on the shared rows: authored note cards, grouped field changes with old and new rows, clock times, no count, no no-op lines, edit and delete | Notes stand apart from changes. Bursts read as one sentence. Authors are real, not "(CS)" |
| Note composer | The shared `Composer`, note mode, secondary "Add note", ⌘↵, on screen at once, "Didn't save · Retry", no error page | A note can't be lost, and posting is one keystroke |

### Deals list (`/deals`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Latest note column | One note with its day ("Oct 20 · seeing tomorrow"), the author suffix stripped, full text in the Tooltip | "Seeing tomorrow" has a date |

### Property page (`/properties/[id]`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Notes section | Later (slice 8): an Activity log with `PropertyNote` and change entries on the shared rows; the blob becomes the first note. Unchanged until then | Edits stop being silent, with authors and dates |

### Contractor record (`/contractors/[id]`)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Imported comments paragraph | Later (slice 8): "Team notes" with the Lock line and dated notes, plus the contractor's updates across jobs | Says it's team-only, can be added to, and shows his history |

### Emails

| Instance | Becomes | What changes for the user |
|---|---|---|
| Task update emails | Full comment text up to 500 characters, "3 photos and 1 file", links to `#update-<eventId>`, edits and deletes honored inside the bundle window | Zack reads the whole message and lands on it. A deleted comment never reaches him if deleted in time |

### Public move-in form (boundary)

| Instance | Becomes | What changes for the user |
|---|---|---|
| Move-in item comments and Additional comments | Owned by the forms and editing spec. NOTES events now keep the text before each save, with View previous and Restore | The resident's original report can always be recovered |

### Build order

Each slice is its own approval. Each runs `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`, and opens every touched menu, Sheet and edit state at 375 and 320 by hand.

1. **Composer privacy and docking.** Move Composer to `src/components/`. Audience line, "Shared \| Internal", visibility in the draft, "Add note", Esc, comma names, secondary Send. Phone min-height, 16px gutters, `useKeyboardInset`, `interactiveWidget`. Print hidden. Check on a real iPhone SE and iPhone 17 with the keyboard up, since the headless sweep has no keyboard.
2. **Timeline and folding.** The grid rail and markers (3.1), headings, `ActivityTime` and the dates helpers, bursts, the top fold that folds back, months, dividers, links in bodies, conflict sentences, Notes with View previous, removed-file and repeat events.
3. **Closing the loop.** Optimistic send with `clientId` and the failed state, `OutboxItem.eventId` (the delivery line needs it to tell queued from emailed), staff `TaskReadState` writes seeded at the release time, the New divider, the delivery line, `#update` and `#new` anchors, the unread dot on task rows (3.5), `lastWordBy`.
4. **Edit and delete.** Menu (3.2), `core.ts` edit, delete and restore, and the drain's re-read of each item's event.
5. **Review.** The banner (3.6) and its one-line outcome, one Send back sheet, button order, Undo on Approve, decision pairs (including Mark done's note through `setStatus`).
6. **Portal.** Updates on the timeline (3.4), the shared composer, the job-page notice (send back now; dates and notes per question 2), the leading dot on My jobs, masked codes, email content and anchors.
7. **Deals.** Schema batch (question 1), backfill, record log (3.3), note box, Latest note.
8. **Property and contractor logs,** with the property hub (D10).

## 5. Reuse check

**Reused as is**

- `Avatar` (`src/components/avatar.tsx`): 20px on the rail, `outline` for contractors.
- `StatusMark` and `STATUS_TONE` (`src/components/status-badge.tsx`): status lines and decision pairs.
- `Menu`, `MenuItem`, `MenuSeparator`, `MenuTrigger` (`src/components/menu.tsx`): the comment menu, destructive Delete.
- `Tooltip` (`src/components/tooltip.tsx`): full timestamps, "edited" time, the Latest note cell.
- `useToast` with Undo, `useToastInset` (`src/components/toast.tsx`).
- `Textarea`, `Button`, `Kbd`, `TextLink`, `textLinkClass`, `Card`, `Section` (`src/components/ui.tsx`).
- `SegmentedControl` (`src/components/segmented-control.tsx`): Shared | Internal.
- `MediaGrid`, `Lightbox` (`src/components/media-grid.tsx`, `lightbox.tsx`) and `FilesList` (`src/app/(app)/tasks/[id]/files-list.tsx`).
- `Sheet` (`src/components/sheet.tsx`): View previous notes, Send back.
- `Code` (`src/components/code.tsx`): masked lockbox codes in imported comments.
- `Money` (`src/components/money.tsx`): amounts in deal field rows.
- `MediaUploadTray`, `useMediaUploader` (`src/components/media-uploader.tsx`).
- `RefreshOnReturn` (`src/components/refresh-on-return.tsx`): replies that arrive while the tab was away.
- `useCoarsePointer`, `callAction`, `LeaveGuard` (portal), `joinNames`, `BRAND`, the `TaskReadState` table and `TaskEvent.editedAt`, `deletedAt` and `source`.

**Extended**

- `src/components/activity-timeline.tsx`: grid marker column and `marker` prop in place of offsets and `markerClassName`; `ActivityDay` as an h3 with a month variant; print rules; the inner-scroll example removed.
- `src/lib/tasks/activity.ts`: bursts by one person within 30 minutes, same-kind sentences, mixed-kind counts, never-fold kinds, 2-minute reversals, folded-row counts, month grouping, decision pairs, dividers, conflict and repeat sentences, `lastWordBy`.
- `src/lib/dates.ts`: `activityTime`, `fullStamp`, `historyDay`; replaces `fmtAgo`, the activity `dayLabel` and the portal's `updateTimeLabel`.
- Composer (moves to `src/components/composer.tsx`): audience prop and copy, mode-aware Send, visibility in the draft with the v1 fallback, Esc, optimistic send, failed state, pending slot, `pin`, keyboard inset, print hidden, a note mode for deals.
- `src/lib/tasks/core.ts`: edit, soft delete and restore for comments; NOTES `data.from`; `data.statusEventId` on decision notes; a removed-file event; repeat on and off events.
- `src/lib/notifications/content.ts` and `outbox.ts`: `eventId` on items, drain re-read, full comment text, file counts, anchors.
- `src/lib/portal/queries.ts` and `job-view.ts`: the job-page notice's data (the open send back; dates and notes since his last look, per question 2), edited and removed states, the shared formatter.
- `src/lib/portal/jobs.ts`: Mark done passes its note and photos through `core.setStatus`.
- `src/components/media-grid.tsx`: a one-row mode (`rows={1}`) whose last tile counts the rest ("+1") on the photo scrim.
- `src/app/(app)/tasks/task-row.tsx` and `src/app/(portal)/p/_components/my-jobs.tsx`: the unread dot in the leading gutter.
- `review-banner.tsx`, `review-actions.tsx`, `task-list-context.tsx`: order, Undo, the shared sheet, the proof card, the one-line outcome.
- `src/app/(app)/layout.tsx`: a `viewport` export with `interactiveWidget: "resizes-content"`.
- `src/lib/deals/service.ts`, `log.ts`, `deals/[id]/page.tsx`, `deal-row.tsx`: authors, structured changes, normalized diffs, the record log, the note box, Latest note.

**New** (each gets a row in `docs/components.md` in the commit that adds it)

| New piece | File | References |
|---|---|---|
| `CommentCard` | `src/components/comment-card.tsx` | [Linear](https://mobbin.com/screens/2e6c00de-40a7-455d-875f-0d8cb27c8270), [GitHub](https://mobbin.com/screens/f51b36bd-2708-42e4-bf86-c4ab39b2afae), [Linear Mobile](https://mobbin.com/screens/21b44a29-c1be-4016-acc5-520fa29659a2) |
| `ActivityRun` (folded run) | `src/components/activity-timeline.tsx` | [Height](https://mobbin.com/screens/8e6036dc-866a-468d-8210-bd004c3792c3), [Height](https://mobbin.com/screens/1565d7cf-680f-4a8e-889c-7af783c21698), [Front](https://mobbin.com/screens/bbc86bf9-e021-46c0-8b89-c455d61d20a5), [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338), [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775) |
| `ActivityDivider` (New, Moved from Asana) | `src/components/activity-timeline.tsx` | [Front](https://mobbin.com/screens/d63c9ab6-f7ee-40ef-9b4c-ba4966689e57), [Slack](https://mobbin.com/screens/b2fc60c9-ff15-4441-b1df-45f0d582fdc0), [Slack](https://mobbin.com/screens/8b7812e7-c71d-4932-9bdb-e498b3974eb0), [Discord](https://mobbin.com/screens/47edf661-a056-4b0e-a9bd-c62d0b524b8b), [Expensify](https://mobbin.com/screens/0fd88a66-f76d-4ad8-993f-de1db01c6204) |
| `ActivityTime` | `src/components/activity-time.tsx` | [Todoist](https://mobbin.com/screens/6bd704b6-fefe-46d6-86f4-c987cb9f5902), [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338) |
| `DeliveryLine` | `src/components/comment-card.tsx` | [Front](https://mobbin.com/screens/d63c9ab6-f7ee-40ef-9b4c-ba4966689e57), [Front](https://mobbin.com/screens/bbc86bf9-e021-46c0-8b89-c455d61d20a5), [Speechify](https://mobbin.com/screens/2b6cf279-ba13-49d0-8ec4-6d61808ea1a4), [Airtasker](https://mobbin.com/screens/4adf7c8c-8b04-46a1-9c1e-ef38692340d9) |
| `useKeyboardInset` | `src/components/use-keyboard-inset.ts` | [Linear Mobile](https://mobbin.com/screens/a96b8326-76e3-4c24-822c-9617062a24fc), [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards) |
| `Composer` (moved, now shared) | `src/components/composer.tsx` | [Front](https://mobbin.com/screens/e8511de2-eaee-486f-8071-4d184bb24274), [Front](https://mobbin.com/screens/645853fe-3cef-44fa-ba6f-4ed561ff8a8b), [Basecamp](https://mobbin.com/screens/9c5e357f-7293-480b-b2cf-7c8791781378), [Intercom](https://mobbin.com/screens/d4d6efaf-d387-4211-9bdf-1c207d1f2714), [OpenPhone](https://mobbin.com/screens/fd44cd6d-3bf9-4be7-bae2-f6e4b25cb27d) |

Feature-only, no row: the shared Send back sheet (`src/app/(app)/tasks/send-back-sheet.tsx`), the proof card inside `review-banner.tsx`, and the job-page notice (`src/app/(portal)/p/jobs/[id]/_components/job-notice.tsx`).

**Brand points marked new.** Past day labels ("Yesterday", past weekdays); absolute dates inside history sentences; the unread dot in a row's leading gutter (3.5); the unread dot on the timeline rail for the New divider; tap-the-card for comment actions on touch (3.2). One existing exception kept: the review banner stays a `Card`, which brand section 9 reserves for Home and Overview modules (3.6). No new colors, sizes, radii or shadows.

**Not adding**

- Reactions. There is no emoji in the system, and "Seen by Zack" answers what a thumbs-up would.
- @mentions (G2B-I06). One useful name with two partners. Stripe's two-name picker is the reference if it comes back: [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93).
- Threads and replies to a comment.
- A formatting toolbar. Bodies render links only.
- Pinning a comment (G2B-I15). Asana's "Pin to top" is the reference for later.
- Changing a comment's visibility after posting. An email can't be recalled.
- Editing or deleting in the portal. Contractors keep today's post-only composer.
- A floating "Jump to new" button. Anchored links and the `#new` row links do the job without a floating layer.
- Changing "Created by" in the rail (G1C-046). The review asks to drop the approved rail row now that Activity opens with "Connor created this task"; that is Connor's call on the rail, and nothing here depends on it.
- "Seen by Connor" in the portal. The review rules it out ("What not to do", G1A-I07); see 2.6.
- "Updated by Pieter 5m ago" on record headers (G2B-019). The newest Activity entry says it.
- A reason prompt on a deal stage change (DEALS-I13). The note box sits right above the log.
- Pinning a sent-back job to the top of My jobs (G1A-I14). The dot flags it and the job page's notice says why.
- "Completed by" in the task rail (BTASKS-030). The decision pair says who and when in Activity; the task rail is outside this spec.

## 6. Open questions for Connor

Only these block building. Each section 3 choice also needs a pick before its slice.

1. **Schema batch.** OK to add `authorUserId`, `data`, `editedAt` and `deletedAt` to `DealNote`, and a `REPEAT` value to `TaskEventKind`? Blocks slice 7 and the repeat lines in slice 2. Everything else rides on columns that exist or on JSON. My recommendation: yes, in the next schema batch.
2. **Due date and notes changes on Zack's job page.** D19 already emails them, but his job page never shows them. The approved plan says "Date changes appear only as the current Target, never as history" (`docs/asana-migration-plan.md` section 5.1), so adding them to Updates would reverse it. A: a notice at the top of the job page until he has seen the change, "Moved to Fri, Oct 30 (was Thu, Oct 29) by Connor" and "Notes updated by Connor", counted as new on My jobs (G1A-I09, Flighty; drawn in 3.4). Updates keep no date history. B: lines in Updates ("Connor moved the target date to Oct 30"), which changes the approved rule. Blocks slice 6. My recommendation: A. It keeps your rule, puts a date change where a contractor who'd otherwise show up on the wrong day will see it, and the email and the page agree.
3. **A deleted Shared comment Zack already saw or got by email.** Leave "Connor removed a comment" on his job page, or remove it without a trace? Blocks slice 4. My recommendation: leave the line, since he may act on the email.

## 7. Reference check

A sample of the links was opened on Oct 25 to confirm each exists and shows what it is cited for. Links marked "checked" above passed:

- [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): avatars and status icons on the activity rail, short relative times, "moved to Done, then back to In Progress" as one line.
- [GitHub](https://mobbin.com/screens/f51b36bd-2708-42e4-bf86-c4ab39b2afae): Copy link, Edit and a red Delete in the comment menu; avatar beside the card; glyphs on events.
- [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b) and [Stripe](https://mobbin.com/screens/ed14dee7-09db-427b-a91e-21ddfa938d93): newest-first timeline beside the Details rail; the note box at its top with Cancel Esc and Add note ⌘↵.
- [Superlist](https://mobbin.com/screens/f8cf46ce-c9c0-4041-b707-202046a06247): unread dots in the left margin of list rows.
- [Asana flow](https://mobbin.com/flows/1374a9aa-bfcf-4a40-b1ec-db872e71b8ce) and [Asana flow](https://mobbin.com/flows/115a8be3-b56e-4630-ae39-b249bd62c786): the comment menu, inline edit, "(edited)", delete with an Undo toast.
- [Notion flow](https://mobbin.com/flows/1203f8c2-cde3-4f7c-b074-b4c5da3d6114): exists, but shows an always-visible ⋯ on the comment, so it now backs option A in 3.2, not B.

Added from the same searches, all checked: [Front](https://mobbin.com/screens/d63c9ab6-f7ee-40ef-9b4c-ba4966689e57) ("New activity" rule, "Seen"), [Front](https://mobbin.com/screens/e8511de2-eaee-486f-8071-4d184bb24274) (audience line under the field), [Intercom](https://mobbin.com/screens/d4d6efaf-d387-4211-9bdf-1c207d1f2714) (note mode, Add note), [Intercom](https://mobbin.com/screens/e757d6f0-1da5-45a1-9684-298d6adb933b) (deleted message trace), [ClassDojo](https://mobbin.com/screens/225128f0-1acf-49e8-a5e7-86532d8c7dfb) (Approve with who-sees-it line).

Not opened: Mobbin started refusing page loads after the first, so the rest were checked through Mobbin's search, which returns screens by query rather than by id. Front 645853fe and bbc86bf9, Intercom 59651e9f, ClassDojo 8767e826 and Stripe a8eb6887 didn't come back by id, but each app showed the cited pattern on a sibling screen, now linked beside them. Slack, Discord, Height, Twenty, Todoist, Speechify, Airtasker, OpenPhone, Basecamp, Shopify, Attio, Mindtrip, Depop, Plane, Campsite, hilos, Aboard, Airwallex, Expensify, Linear Mobile and the GitHub phone screens were not opened and stand as the first draft cited them.
