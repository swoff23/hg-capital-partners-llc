# Dropdowns, filters and selectors

The spec for HG's selector family. Draft for Connor: nothing is built, and building waits for an explicit "build it". Checked against `c2480a1` ("Task rows: date top right, assignee bottom right"), main's head on Oct 25. It sits on `2a07648` and changes only `tasks/task-row.tsx` and `properties/[id]/property-tasks.tsx`. Every line number here is from `c2480a1`. Visual rules come from `docs/brand-guidelines.md` sections 2, 3, 5, 7 and 9. It adds no color or token. The sizes and rules it does add are listed in section 7 for approval.

## 1. Summary

**What's wrong today**

- **Pick one has five looks.** Native selects (the `Select` primitive, and raw selects on `fieldClass` in the property editors) open the OS menu with Safari's double chevrons. `SelectChip` hides a native select under a chip. `StageSelect` draws the stage ring over a native select. `ComboField` is a text cell whose list is never shown. Assignee, Due and Repeat are styled React Aria pickers. Status and Property work differently on New task and on the task page.
- **Filters have no shared shape.** Deals has a search, four segments and a checklist popover that both own status, folded into a Filters sheet below `sm`. Tasks has a search, segments and two native selects of about 45 and 11 options. Contractors reads `?q` with no control, and Properties has nothing. Every toggle is a `router.push` with no pending state and a new history entry.
- **Menus can't carry richer jobs.** No sections, shortcuts or descriptions. `MenuItem checked` draws a Check but exposes no state, so a screen reader can't hear the current status.
- **Touch drifts.** `useCoarsePointer` is false during hydration. Sheets have no footer slot (the deals sheet builds its own). `SegmentedControl md` is 48px on touch beside 44px fields. Seven 44px calendar cells don't fit 320, and the phone date sheet is taller than a real iPhone SE shows (section 4.4).

**The family that replaces it.** One option list drives every pick, in one of two containers: an anchored popover with a mouse, a sheet on a phone.

- `Select`: one value in a form.
- `EntityPicker` (Assignee, Property, Unit): pick a record, as a chip or a field.
- `Combobox`: only where a typed value outside the list is allowed.
- `Menu`: actions behind ⋯, plus value menus (`StatusMenu`, the view menu, Sort, Theme) on the same piece.
- `FilterBar`, extracted from `deals/filters.tsx`: chips on a wide desktop, a Filters button and sheet everywhere else.
- `SegmentedControl` for 2 to 4 peer views; `TopTabs` for routes.
- `DatePicker` and `RepeatMenu` for dates and repeats; `Switch` for yes or no; `Checkbox` for pick many.

**Already done at `c2480a1`, so not redone here**

- Task rows follow Connor's Oct 25 rule (brand section 5): the date chip top right on the title's line, the avatar bottom right (`TaskRow`, on Home and `/tasks`). The property record's Tasks card does the same below 30rem with a plain date.
- Home is Today. `TodayView` (Mine | Contractors) renders on Home (`(app)/page.tsx:48`). `/tasks` is the filtered list with no tabs, and `/tasks/all` only redirects there.
- `/deals` folds its views and statuses into a Filters sheet below `sm`, with a count `Badge`, sections and a sticky Done. Its search has a leading icon.
- Deal stage is `StageSelect` inside `DealStageField`: it shows the pick at once and dims while saving.
- `BasisToggle` renders `SegmentedControl`. `TopTabs keep={["basis"]}` carries `?basis` across Financials. The basis link on `/financials` is 44px on touch and sits on its own row below `sm`, and `SourceLine` names the period and basis.
- `SegmentedControl sm` is `text-label`.
- The property editors' raw selects are 32px (`h-8`), 44 on touch (`selectTouchHeight`).
- Both CapEx cards use `ForecastYearBars`: `aria-pressed` rows, the pick on a `--line-control` edge at one weight, 44px on touch. The portfolio CapEx card lives on /properties.
- CapEx rule rows show their delete on hover, on focus, or after a first tap on touch, by design.
- Move-in ratings are `SegmentedControl md` named "{item} condition". Tapping the pick clears it, and below 640 the control sits under the item. Property and Unit there use the `Select` primitive on tokens.
- `PublicHeader` folds its links into a 44px menu below 600px.
- docs/components.md has no BasisToggle duplicate and no /deals wrapped-row entry.

## 2. Rules every member follows

### Where a list opens

- **Mouse:** an anchored `Popover` at the Float level. `offset` is 6 everywhere (StatusMultiSelect's 4 goes). Value triggers open bottom start, ⋯ menus bottom end. It flips at the viewport edge.
- **Touch below `md` (phones):** a bottom `Sheet` titled with the field's name. React Aria's `MenuTrigger` only takes a Popover, so on a phone a value menu renders its `Menu` inside our `Sheet` (a `DialogTrigger` with a `Modal`), opened by the same trigger.
- **Touch from `md` (tablets):** an anchored popover with touch rows. This is open question 3; today it's the `Sheet`'s centered dialog.
- **Chosen at press time.** The trigger reads `matchMedia` when it's pressed, through a new `pickContainer()` helper beside `useCoarsePointer`, so a tap before hydration can't open the desktop popover on a phone.
- **No flash on load.** Layout switches that change what's on screen (the filter bar's chips or its Filters button) are pure CSS: `pointer-fine:` plus a container query.

### Sizes

| | Mouse | Touch popover (768) | Phone sheet (375, 320) |
|---|---|---|---|
| Field trigger, `md` / `sm` | 36 / 32 | 44 | 44 |
| Record chip in a list row (`row`) | 28 (amendment 1), a 44 hit area on touch | same | same |
| Record or filter chip, `sm` | 32 | 44 | 44 |
| One-line option row | 32 | 44 | 44 |
| Two-line option row | 44 | 56 | 56 |
| Search field in a panel | 36 | 44 | 44 |
| Panel width | the larger of the trigger and the widest row, at most 320 | same | full width |
| Panel height | at most 320 | at most 60dvh | the sheet's 90dvh |

- Every control in one row shares one height: 32 with a mouse, 44 on touch.
- A panel's width is set when it opens and held while you type in its search, so it doesn't jitter (invented). `Menu` keeps the 160px minimum it has today.
- A list under 10 options has no search and never scrolls (nine rows of 32 plus padding is 296). With a search field (36, its rule and 8px of padding) a 320 panel shows about eight and a half rows of 32, so a cut row says there's more.

### Keyboard

- **Closed trigger:** Enter, Space or Down opens. A `Select` also changes value on typed letters while closed, as a native select does.
- **Open:** arrows move, Home and End jump. Letters jump to a match, or filter when a search field shows. Enter or Space picks. Pick one commits and closes; pick many toggles and stays open.
- **Esc closes the open layer in one press,** even with text in its search field (the text goes with it), and focus returns to the trigger. This overrides React Aria `SearchField`'s clear-first Esc.
- **Number keys** pick from value menus with a fixed order (task status, deal stage, date quick picks), printed as `Kbd` with a mouse. Each item owns its number. When one hides (Monday on a Monday, Review on a staff-only task), its number is skipped, never handed to the next item, so 4 is always Next week.
- **Backspace or Delete** clears a focused set filter chip. Invented: token fields remove a chip this way, but no reference shows it on a filter chip.
- **No page-level letter shortcuts.** `Kbd` hints never show on touch.

### Commit and feedback

- **A pick commits.** No Apply or Done, with three exceptions: Custom repeat (Save), the phone Filters sheet (its Show button) and a custom period range (Apply).
- **Record edits are optimistic.** The trigger shows the new value at once and a toast names the change with Undo ("Assigned to Zack", "Status set to Done"). If the save fails, the old value comes back and the toast says what didn't save ("Couldn't change the status. Try again.").
- **Filters and sorts** use `router.replace` inside `startTransition`. The control moves first, the list dims with `aria-busy` while the server answers, and no toggle adds a history entry.
- **One dim level, 50%,** for a disabled control, a field saving in place, a list loading and a row saving. The 60% in the financials settings tables, the apply flow's skipped rows and the portal checklist go to 50%.

### Marks and copy

- **Pick one:** a lucide `Check` in `--fg-1` at the trailing edge. **Pick many:** a leading checkbox. Never a fill alone (principle 6).
- **An empty choice is a named value,** listed first: "Unassigned", "No property", "No unit", "No date", "Doesn't repeat", "No reason", "Not set". Never "None", and never a dash inside a list.
- **A required pick with no default** reads "Choose a property", "Choose a unit". One verb app-wide.
- **No "All X" labels.** An idle filter chip says the facet's name. "All assignees", "All properties" and "All statuses" go.
- **A stored value missing from today's list** stays visible as its own row in `--fg-3`, so nothing changes silently.
- **Search fields say "Search" plus the one thing they search,** as both placeholder and accessible name: "Search tasks", "Search deals", "Search contractors", "Search people", "Search properties". Global search, which searches everything, says "Search". "Find a deal" and "Filter by title…" go.
- **Deals say "Stage" everywhere:** the column header, the deal page's row, `DealStageField`'s accessible name, the chip, the sheet and the sort phrases. "Status" stays the word for tasks and properties.

### Tokens and motion

- **Panels:** `PopoverSurface` (`--raised`, `rounded-lg`, `shadow-float`, the `--line-float` edge). **Sheets:** the Overlay level, `rounded-xl` top corners.
- **Highlight:** `--fill-2`, `rounded-sm`; `--danger-tint` on a destructive row. **Section headers:** `text-meta` 500 `--fg-3`. **Sublines and counts:** `text-meta` `--fg-3`, counts tabular.
- **Neutral chips inside a row** take the Tag look (no fill, a `--line-strong` edge, `--fg-2`, `text-micro`).

**Motion per member** (brand section 7). Lists appear at once; panels holding anything else pop in. Today every `PopoverSurface` pops in, so it gets a `motion` prop (`"none"` or `"pop"`).

| Member | Opens | Closes |
|---|---|---|
| ⋯ menus, value menus, `Select`, `EntityPicker`, `Combobox`, filter chip panels, global search results | `--dur-0` | `--dur-fast` fade |
| `DatePicker` panel, `RepeatMenu` panel, the `Sheet`'s centered dialog from `md` | `--dur-base` pop-in | `--dur-fast` |
| Phone sheets | `--dur-sheet` rise | `--dur-fast` |
| A step inside a layer (Waiting reason, Custom repeat, the phone calendar) | `--dur-0` swap | `--dur-0` |
| `SegmentedControl`, a chip's new value | `--dur-0` | |
| `Checkbox` check, `Switch` knob | `--dur-check` spring | `--dur-check` |
| Toast | `--dur-toast` | `--dur-fast` |

Reduced motion turns each into an opacity change of 120ms or less.

## 3. The family

### 3.1 OptionList, the shared body

**Job.** The list inside every select, picker, filter panel and repeat menu.

**Builds on.** Extract and extend: `AssigneeList` in `src/components/assignee-picker.tsx` (React Aria `Autocomplete`, `SearchField`, and `ListBox` with sections) moves to `src/components/option-list.tsx`, off the old aliases (`text-muted`, `border-border`, `text-sm`) onto `text-body`, `text-meta`, `--fg-3` and `--line`. Its rows absorb deals' `filterRowClass` (`status-multiselect.tsx:32`), which already has the 32 and 44px rows and the `--fill-2` focus.

**Anatomy**

- An optional search field on top: borderless, a leading `Search` 16 in `--fg-3`, the placeholder per the search rule, over a `--line` rule. It shows at 10 or more options.
- Optional pinned rows (the empty choice), then sections with headers.
- A row, left to right:
  - A checkbox (pick many only).
  - A visual: `StatusMark` (14, 16 on touch), `Avatar` 24 (round for team, a `rounded-sm` square for contractors), `PhotoThumb` 32, or a lucide icon 16 in `--fg-3`.
  - A title in `text-body` `--fg-1` over an optional subline in `text-meta` `--fg-3`, each one line and truncated.
  - An optional Tag.
  - An optional count in `text-meta` `--fg-3`, tabular (filters).
  - A `Check` (pick one only).
- An empty result is one line in `--fg-3`: "No one matches.", "No property matches."

**States.** The `--fill-2` highlight follows the mouse and keyboard focus. Picked: the Check or a checked box. Disabled: 50%. A filter row with a zero count stays listed in `--fg-3`, so the list doesn't jump.

**Keyboard.** Arrows move while the caret stays in the search field. The first match is highlighted as you type, so two letters and Enter pick. Opening scrolls the picked row into view.

**Touch.** The search field never takes focus on open, so the keyboard stays down until asked. Rows are 44, or 56 with a subline.

**References.** Linear [status filter with counts](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1), Attio [search, section header and check](https://mobbin.com/screens/3831c8f4-99bd-4315-a7da-3872c47832e1), Vercel [zero counts kept in place](https://mobbin.com/screens/90463706-160f-4770-84e8-f41a91bd718e), Linear Mobile [status sheet](https://mobbin.com/screens/c93da8fa-07e1-4886-b478-4da9570db858).

### 3.2 Select

**Job.** One value in a form, from 2 to 45 options.

**Builds on.** Replaces the native `Select` at `ui.tsx:274` with a React Aria `Select` in a new `src/components/select.tsx` (it needs the client; `ui.tsx` stays server-safe). The trigger is `fieldClass`, the panel is `PopoverSurface` or `Sheet`, and `OptionList` sits inside. `StageSelect`'s form use folds in. The native `Select` and `selectTouchHeight` are deleted when the last caller moves.

**API.** `label`; `items` or sections; `value` and `onChange`, or `defaultValue` and `name` (React Aria's hidden select keeps `FormData` and server actions working); `placeholder`; `emptyLabel`; `size` (`md` 36, `sm` 32); a `leading` mark per option; `isRequired`; `isInvalid` with `errorMessage`; `isDisabled`. Search turns on by itself at 10 options. Call sites stop passing `h-7` or `h-8`.

**Anatomy**

- Label above in `text-meta` 500 `--fg-2`, 6px over the field. Helper text is one line of `text-meta` `--fg-3`.
- Trigger: `--surface`, a 1px `--line-control` edge, `rounded-md`, 10px side padding (32 on the left with a leading mark). The value in `text-body` `--fg-1` with its mark, truncated. The placeholder and an empty choice in `--fg-3`. One lucide `ChevronDown` 14 in `--fg-3` at the right, the size `StageSelect` already uses, so Safari's double chevrons go.
- Panel: sized per section 2.

**States**

- Focus and open: the edge turns `--act` with a 1px inset `--act` ring.
- Error: a `--danger` edge, the ring `--danger` on focus, and one `--danger` line of `text-meta` under the field.
- Disabled: 50%, no hover. A field that can't apply yet is hidden rather than disabled.
- Saving in place: dims to 50% and stays focusable, so a keyboard user keeps their place (today's `StageSelect` behavior).

**Keyboard.** As in section 2. Tab closes the list and moves on.

**Touch.** Phone: a sheet titled with the label, 44px rows (56 with a subline), a tap commits and closes, and on a long list the search is pinned under the title. Tablet: open question 3.

**Sizes**

- 1280: `md` in forms, `sm` in table rows and record rails (rows are 40px).
- 768: every trigger 44px.
- 375 and 320: full width once the form is one column; sublines stay one line and truncate.

**Not this control.** Yes or no is a `Switch`. Two or three short values that fit at 320 are a `SegmentedControl`. A record's status is a `StatusMenu`. A list filter is a `FilterChip`.

**References.** Linear [named empty values in a create form](https://mobbin.com/screens/884ec36e-0aef-464e-863c-49ef977d6371), Vercel [rows with a description and a check](https://mobbin.com/screens/01b2a95e-2a7e-475c-8457-662480cf5c8d), Attio [14 options without search](https://mobbin.com/screens/be2291c9-2f04-40d8-ba73-efde5feeed0a), Stripe [search and groups for a long list](https://mobbin.com/screens/726ecb89-06c4-4184-ab58-eccf01e64659), Mercury iOS [sheet that commits on tap](https://mobbin.com/screens/47f9fba7-fa5d-428d-b2f7-b1161a56cf6f), Gusto [error line under a select](https://mobbin.com/screens/bc1d4eef-6bd2-415d-ad97-81d6eb59e110).

### 3.3 EntityPicker: Assignee, Property and Unit

**Job.** Pick a person or a building fast, with no doubt about who or where.

**Builds on.** `src/components/assignee-picker.tsx`. Its body becomes `OptionList`, and the component becomes `src/components/entity-picker.tsx` with thin wrappers: `AssigneePicker` (same props as today), `PropertyPicker` and `UnitPicker`. `SelectChip` (`tasks/[id]/select-chip.tsx`) is deleted.

**Two triggers**

- **Chip** (`pickerChip`): list rows, the record rail, create forms. A leading `Avatar` 20, or a lucide `House` 14 for a property, then the name, truncated. Empty: `CircleDashed` and a placeholder in `--fg-3`. Forms use the field's name ("Assignee", "Property"); the rail uses a verb ("Assign", "Add property"), per brand's empty rail fact. No chip carries a chevron.
- **Field** (`fieldClass`, 36 or 44): forms where the pick is the main decision (applying a playbook, the class mapping cell). A leading avatar or photo, the value, and a `ChevronDown`.

**Rows**

- **Assignee.** "Unassigned" pinned first, as today. Then Recent: up to 3, only while the search is empty, from the viewer's own last assignments in task activity, so it follows Connor across devices. Then Team, with you first and "(you)" in `--fg-3` (the tasks filter's "(me)" goes). Then Contractors: square avatars, the trade as the subline and a "Has login" Tag. Search matches name, trade and email.
- **Property.** "No property" pinned, left out where a property is required. `PhotoThumb` 32, the short address, and "Buffalo · 3 units" as the subline. Sorted by street, then house number, which fixes "118, 15, 23". Search matches the short and full address, the town and unit labels.
- **Unit.** Shows when the property has 2 or more units, or a unit is already set (today it shows from one unit). "No unit" pinned.

**Behavior**

- A pick commits. Picking the current value closes without a write. Record edits toast with Undo, as Due already does. A property change that drops the unit says so: "Property set to 56 Tamarack St · Unit cleared".
- The task page keeps sending the expected assignee, so a stale tab can't reassign.
- In filter mode (inside `FilterChip` and `FilterSheet`) rows take checkboxes and counts.

**Sizes**

- 1280: popover, 32px rows (44 with a subline), search focused on open.
- 768: 44px rows (56 with a subline); container per open question 3.
- 375 and 320: sheet, 44 and 56px rows, the picked row scrolled into view. At 320 the Tag moves into the subline ("Plumbing · Has login") so the name keeps its width.

**Accessible names.** "Assignee: Zack". In list rows the name includes the task.

**References.** Linear [assignee flow](https://mobbin.com/flows/0035680b-a877-444a-b27a-b76b38d10853), Linear [chip row without chevrons](https://mobbin.com/screens/65487ca3-9cf4-4287-b0cc-2c3e8c6f7f35), Linear [the rail's 'Assign'](https://mobbin.com/screens/178f8c31-237e-4c24-a79a-3ed93b74df03), Slack ['(you)' first](https://mobbin.com/screens/653fd646-3333-4cd4-a783-3af15d9277b0), Mercury [recents while empty](https://mobbin.com/screens/def4f635-5044-427f-8235-a367ee56f91a), Airbnb [photo, name and town rows](https://mobbin.com/screens/350bd159-7be8-4cad-972c-353268be9601), Asana iOS [search not focused on open](https://mobbin.com/screens/a3779063-6628-4a15-98bd-9beb3345e05e).

### 3.4 Combobox

**Job.** Type a value that may not be in the list. Fixed lists are a `Select`.

**Builds on.** New: `src/components/combobox.tsx` on React Aria `ComboBox`, with `OptionList`'s row styles in a `PopoverSurface`.

**Uses.** CapEx building system names now (free text with suggestions, `capex-rules-editor.tsx:422`). Entity on New property later, as find or add (PORTFOLIO-021).

**Anatomy.** A field (`fieldClass`) with "System name" as its placeholder, a trailing `ChevronDown` button that opens the full list, and a clear X once there's text. The list sits under the field at its width. Where adding is allowed, the last row reads 'Add "Boiler"'. No match shows one line plus that row.

**Behavior.** Typing opens and filters. Arrows move while the caret stays put, and Enter picks. Esc closes the list (the layer); a second Esc in the closed field puts back the last saved value. Blur keeps typed text only where free text is allowed.

**Touch.** Phone: a full-height sheet with the input pinned at the top.

**References.** Mercury [type to filter in the field](https://mobbin.com/screens/89d118cc-f223-4d5f-8bbe-ae4ec910d753), Mercury [find or add](https://mobbin.com/screens/9aec9939-2edc-49b9-8052-91307810fb90), Stripe [find or add a product](https://mobbin.com/screens/1a28ce6c-d35d-48fe-a189-5335457fbf98), LinkedIn [the phone version](https://mobbin.com/screens/69ae646d-a57b-43ea-9aa9-0321e173911c). Counterexample: Square's [bare input that reads as free text](https://mobbin.com/screens/51a9da24-7d56-4ea4-b570-63143f890097), which is today's ComboField problem.

### 3.5 Menu, StatusMenu and the view menu

**Job.** Act on one thing (⋯ menus), or set one value from a short fixed list (status, stage, view, theme).

**Builds on.** `src/components/menu.tsx`, extended in place:

1. **Real selection.** `selectionMode="single"` and `selectedKeys`, so items are `menuitemradio` with `aria-checked`, and the Check comes from `isSelected`. The `checked` prop goes. The task status menu (`status-control.tsx:66`) moves to selection. The public header's menu (`header.tsx:86`) is navigation, so it takes a new `current` prop instead: the item stays a link with `aria-current="page"` and draws the same Check, never a radio.
2. **Item slots.** `shortcut` (React Aria's `Keyboard` slot rendering `Kbd`, hidden on touch) and `description` (one line of `text-meta` `--fg-3`; the row grows to 44, 56 on touch). The leading slot takes `StatusMark` as well as a lucide icon.
3. **`MenuSection`** with a header in `text-meta` 500 `--fg-3`.
4. **`numberKeys`** for value menus: each item's fixed number, printed at the trailing edge with a mouse (section 2).
5. **`sheetTitle`** for value menus: on a phone they render in a titled `Sheet` with 44px rows (section 2 says how). ⋯ action menus never take it and stay anchored on every device.
6. **A follow-up step in the same layer.** When a pick needs one more answer (Waiting needs a reason, Scheduled needs a visit date), the panel swaps to that question. On a phone the sheet swaps its content and shows a back chevron. The status commits only when the question is answered, as `StatusControl` saves status and reason together today. Back returns to the list with nothing changed; Esc closes the whole layer with nothing changed. Never a second stacked sheet.

**Anatomy.** The Float surface, at least 160px, sized to content, 4px padding. Rows are 32px (44 on touch). Destructive items sit last after a `MenuSeparator`, in `--danger` with a `--danger-tint` highlight, and name the object ("Delete task"); they open `ConfirmDialog`. Reversible actions skip the confirm and toast with Undo.

**One-item menus.** A row's ⋯ stays a menu even with one item (files, units, listings), so every row keeps one ⋯ in one place (brand's Counted lists). Off rows, a menu with one item becomes a direct button.

**Triggers**

- ⋯: a ghost icon button, 32 (44 on touch), `rounded-md`, `MoreHorizontal` 16 in `--fg-3`.
- Value (`StatusMenu`): the `StatusMark` and its word in the mark's tone, then `ChevronDown` 14 in `--fg-3`. The ghost `sm` look, 32 (44 on touch).
- View menu: a secondary `sm` button naming the view, with its count from `sm` up ("Active 13"), and a chevron.

**StatusMenu.** A configured `Menu` for task status and deal stage: rows of `StatusMark` and word with a trailing Check, `numberKeys`, and `sheetTitle` "Status" or "Stage". A change toasts with Undo. Task status hides Review on staff-only tasks (BTASKS-041). Deal stage names drop their spreadsheet prefixes in the UI ("High", not "1 - High"), so typeahead and number keys don't collide; stored values don't change.

**Account menu.** The avatar opens a `Menu`: a header section with the name and email, a Theme section (System, Light, Dark, with a Check), a rule, and Sign out. No Settings item, since the sidebar's Settings already opens company settings. System follows the OS. It replaces the header's light and dark button (`app-shell.tsx:102`) and the sidebar's raw Sign out (`:168`). In the phone drawer, the Appearance row (`:161`) becomes a `SegmentedControl` (System | Light | Dark). The portal account menu gets the same header above Sign out.

**Sizes**

- 1280: anchored, shortcuts and numbers printed.
- 768: anchored with 44px rows and no keycaps; value menus follow open question 3.
- 375 and 320: value menus in a titled sheet. ⋯ menus stay anchored, with 44px rows and about six items at most.

**References.** Linear [status menu with numbers](https://mobbin.com/screens/5bc1daea-c0a9-4e20-8f0d-77163691df63), Linear [⋯ menu with shortcuts and Delete last](https://mobbin.com/screens/b4e6b70d-27e2-4853-8d0b-b44ab3d54967), Linear [account menu with the email as a header](https://mobbin.com/screens/e8fe60b4-6db4-4485-99b8-3395d69ea7db), Vercel [account menu: name and email, Theme as System, Light and Dark, Log Out last](https://mobbin.com/screens/a8d666ee-3303-4b28-9e1f-06b8dbd63cb6), Height [status menu from a table cell](https://mobbin.com/screens/15f734f0-7a55-4fbf-9791-732bdca41869), Linear Mobile [status as a sheet](https://mobbin.com/screens/c93da8fa-07e1-4886-b478-4da9570db858), Linear Mobile [⋯ stays anchored on a phone](https://mobbin.com/screens/5911d6e4-808e-40e9-8fbb-300e7c9c4e9e), Vercel [section header](https://mobbin.com/screens/e2a9b3a7-e0e6-485f-925a-2de04392aeb0), Stripe [delete, confirm, toast](https://mobbin.com/flows/f41cc710-5558-4c7f-96de-5d8be97b8c7a).

### 3.6 Sorting

**Builds on.** Extract and extend: `deals/sort-header.tsx` moves to `src/components/sort-header.tsx` for its second use (/properties). It takes the page's path and its fields.

**Headers, wherever a table renders**

- Every sortable header shows `ChevronsUpDown` 14 in `--fg-3` at rest, so sortability needs no hover. The active column turns `--fg-1` with one `ChevronUp` or `ChevronDown`.
- A click flips the direction. Text columns start A to Z; money, counts and dates start highest or newest. The hidden third "clear" click goes: the default order is a column like any other (Stage on deals, Address on properties).
- The button fills the header cell, at least 32px; on touch its `::after` reaches 44. `aria-sort` stays.
- `router.replace` in a transition, the table dimmed while it loads.

**Phones, where rows replace the table.** Sort is the last section of the Filters sheet, as explicit phrases with a Check: "Stage", "Newest update first", "Asking price, high to low", "Asking price, low to high", "Most units". A sort other than the default counts in the Filters button's number. Sort sits in the one Filters sheet per MOBILE-I02's verification note (the house rule collapses a row into one Filters button). Linear Mobile and Shopify keep sort in its own sheet or button instead.

**References.** Mercury Books [faint ⇅ always on](https://mobbin.com/screens/6383bd46-7879-450b-88dd-b92ea05f6dfd), Stripe [carets at rest](https://mobbin.com/screens/cffea421-b951-4ba7-8ddd-571a990d3ed1), Mercury [one arrow on the active column](https://mobbin.com/screens/868560a8-9acb-41d7-9708-82730b1257ad), Zillow [sort as phrases with a Check](https://mobbin.com/screens/4e59a79d-2a1d-4b86-85a5-983a8d18ccbc).

### 3.7 FilterBar, FilterChip and FilterSheet

This describes Option 1 of section 4.1, the recommendation. The pattern itself is open question 1.

**Builds on.** Extract and extend. `deals/filters.tsx` already is the compact bar: a search with its icon (`:76`), a Filters button with a count `Badge` (`:100`), and a `Sheet` with sections, a ghost Clear per section and a sticky footer (`:112` to `:161`). It moves to `src/components/filter-bar.tsx`, gains the wide layout, the chips and staged picks, and replaces the bars in `deals/filters.tsx` and `tasks/filters.tsx`. `deals/status-multiselect.tsx` is deleted. State stays in the URL, with comma-joined values per facet.

**Two layouts**

- **Wide** (a mouse, and the bar at least as wide as the page's row needs): [search] [views] [facet chips], one row. A container query decides, so it works with the sidebar pinned or not and nothing flashes. Each page sets its width from its longest set state: 56rem (896px) for tasks and contractors, 60rem (960px) for deals. The deals row in its busiest state (search 200, six views with counts about 510, a set Stage chip at most 184, gaps 24) is about 920px, inside the 976px a 1280 screen leaves beside the open sidebar.
- **Compact** (everywhere else): [search] [views] [Filters button]. Pages with up to 3 views keep the segments; more views become the view menu. Below `sm` the segments move to their own full-width second row.

**Search.** `Input` at a new `sm` size (32, 44 on touch), with a leading `Search` 16 in `--fg-3` and an inline clear button once there's text. 240px in the wide bar, giving way to 200 first; flexible in the compact bar. Debounced 250ms with `replace`, as today. It searches across fields. While a query is typed, the views show match counts, so a hit outside the current view is visible (DEALS-012).

**FilterChip (wide layout, so mouse sizes only)**

- Idle: an `sm` chip (32) with the Tag's solid `--line-strong` edge, `Plus` 14 in `--fg-3` and the facet's name in `--fg-2`, `text-label`. Stripe draws idle chips dashed; HG keeps one edge style and lets the Plus say "add".
- Set: a `--line-control` edge (the 3:1 mark), the facet in `--fg-2` and the value in `--fg-1` at the same 500 weight ("Assignee  Zack"). Two values join ("High, Medium"); three or more read "Zack +2". It truncates at 160px.
- The remove X is its own button in the same bordered group: 24px, `X` 14 in `--fg-3`, named "Remove Assignee filter".
- A toggle chip for a yes or no facet ("Has login", "Needs W-9") uses `aria-pressed`. Idle: the `--line-strong` edge in `--fg-2`. Pressed: a `--line-control` edge with a leading Check in `--fg-1`.
- Panel: a `Popover` at bottom start holding `OptionList`. Pick many uses checkboxes and stays open; pick one uses a Check and closes. Counts trail each row. It applies live, with no Apply and no Clear inside.

**Filters button (compact layout).** A secondary `sm` button: `SlidersHorizontal` 16, "Filters", and a neutral `Badge` counting the facets set plus a non-default sort. Below `sm`, when the row also holds a view menu, it drops to the icon and count, named "Filters, 2 set".

**FilterSheet**

- The existing `Sheet`, titled "Filters": a bottom sheet on phones, the centered dialog from `md`.
- One section per facet: a heading in `text-meta` 500 `--fg-2`, the number picked in `--fg-3`, and a ghost "Clear" at the right when set (today's deals sheet already has this).
- Up to 9 options list inline as `OptionList` rows. At 10 or more: a search field (not focused on open), the picked rows, the first 6 others, and "Show all 32", which expands in place. Mercury iOS shows each facet as a row with its count that opens its own list; listing short facets inline is an adaptation, so a two-facet sheet takes no extra taps.
- A yes or no facet ("Has login", "Needs W-9", and "Repeats" if open question 10 is a yes) is one `Switch` row, not a section.
- Sort comes last, on pages that sort.
- A footer pinned above the safe area (the new `Sheet` footer slot, extracted from the deals sheet's sticky footer): a ghost "Clear all" on the left when anything is set, and a primary on the right naming the result ("Show 13 tasks").
- Picks are staged: nothing changes until the primary (open question 2). The X, Esc, a swipe down or a scrim tap discards them, and focus returns to the Filters button.
- **The count.** Each list gets a count-only server action that takes the staged filters. It runs after each tap, debounced 250ms, and a newer tap drops the older request. While it loads, the button keeps its last number, dimmed to 50% (brand section 7: buttons keep their label while loading). Until a list has its count action, the button reads "Show tasks".

**Result line.** Directly under the bar, above the first row, whenever the list isn't in its default state (a facet, a search, or a view or sort other than the default): "13 tasks · 27 hidden by filters · Clear filters", shortened below `sm` to "13 tasks · 27 hidden · Clear filters" so it stays one line at 320. Linear puts this line after the rows; above them it's seen on a 675-row list. It is also IA-036's Reset cue: a list reopened with remembered filters says so before the first row. With no results, `EmptyState` reads "No tasks match these filters." with a Clear filters button.

**Remembered (IA-036).** Each list keeps its last query in a cookie per browser (`hg-list-tasks`, `hg-list-deals` and so on), written on each change. `(app)/layout.tsx` reads them the way it reads the sidebar's pinned cookie and passes the hrefs to `SideNav`, so the links are right on first paint and nothing changes after hydration. The layout doesn't render again on client navigation, so, as `AppShell` does with `pinned`, `SideNav` keeps the hrefs in state and the `FilterBar` updates its list's href when it writes the cookie. Clear filters writes the default. No user-made saved views (ia.md).

**Keyboard.** Tab order: search, views, then each chip followed by its X. Enter, Space or Down opens a chip, and focus lands in its search field or on the first picked row. Backspace or Delete on a set chip removes it and moves focus to the next chip, or to the search. Esc closes the panel and never clears a filter.

**Sizes**

- 1280: wide, one row, every control 32px.
- 768: compact, one row, every control 44px.
- 375: compact. Row 1 is the search and Filters (plus the view menu on deals); row 2 is the segments where a page has them.
- 320: as 375. On deals the view menu drops its count, so the search keeps about 110px.

**Tokens.** As in section 2. The count is a neutral `Badge`. No tinted set chips, since selection never rests on a fill.

**References.** Stripe [pinned chips, status tiles with counts, '6 results'](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258), Stripe [set chips and Clear filters](https://mobbin.com/screens/2b2d5f4f-bdd9-4186-b383-e3b30140a551), Vercel ['Status 5/6' applied live](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7), Linear [hidden by filters line](https://mobbin.com/screens/212fda35-366e-4dc0-a1d1-3b679659d6ab), Mercury [kept filters with Reset](https://mobbin.com/screens/2789fe71-1ccd-4834-b61e-83f3d79b475e), Mercury iOS [Filters sheet with See Results](https://mobbin.com/screens/04b34e79-5a2a-4ddf-b46d-f5886f073ac1), Mercury iOS [long facet with search](https://mobbin.com/screens/d6242a27-74d8-4fdc-b43a-5cfa168564d8), Airbnb [Clear all and 'Show 43 homes'](https://mobbin.com/screens/dff722d1-6762-4915-8428-697c692fe009), Shopify [count badge on the filter button](https://mobbin.com/screens/e0a3f3f2-db73-430d-8259-e4b59fa6c843). Counterexample: Square's [nine 'All' pills on two rows](https://mobbin.com/screens/0dbdbd96-a81f-4a37-a7bf-71ec511aef95).

### 3.8 SegmentedControl and TopTabs

**Builds on.** `src/components/segmented-control.tsx`, and `TopTabs` in `src/components/nav.tsx`.

**SegmentedControl changes**

- One tab stop. Left and Right (and Home, End) move focus inside the group; Enter or Space picks. `aria-pressed` stays.
- 44px on touch at both sizes: `md` segments go from `h-11` to `h-10` inside the 2px track, so `md` stops standing 4px taller than the fields beside it.
- Segments are 4px shorter than the control (brand section 9), so on touch each segment gets a 2px `::after` above and below, and its target reaches 44.
- `fullWidth` for the phone's second row: segments share the width.
- A count can carry the Review mark (`StatusMark` in `--warn` before the number), for Contractors in Home's Mine | Contractors. Invented: no reference puts a status mark in a segment. It reuses `StatusMark` so the number reads as "to review", not a total.
- The default segment comes first. No motion on change.

**When to use it.** 2 to 4 peer views, or 2 or 3 form values that fit at 320. More views get the view menu; more values get a `Select`. One exception: deals' six views in the wide bar, where each view's count is the point (Stripe's six status tiles). In the compact bar (any touch screen, and a bar under 60rem with a mouse) they're the view menu; section 4.3 shows why 768 can't hold them.

**TopTabs.** `keep` already carries `?basis`; it adds `period` when FINANCIALS-001 ships. Whether route tabs stay `role="tab"` or move to `aria-current` is open question 8.

**References.** Linear [views row with filter at the edge](https://mobbin.com/screens/fd1b4d88-f021-49a3-98af-4cd3a87e1d29), Linear Mobile [three short pills at 375](https://mobbin.com/screens/76f79100-ec6d-476b-ad26-b2e038f6a321), Airbnb [the pick marked by an ink edge](https://mobbin.com/screens/a79788d5-b71c-408e-b07c-a6ad904c331b), Linear [nine options use a dropdown](https://mobbin.com/screens/754d9f92-fccb-4b14-b53e-190d460e0118).

### 3.9 DatePicker, RepeatMenu and the period control

**DatePicker.** Builds on `src/components/due-date-picker.tsx` (`DuePanel`, `MonthCalendar`) and `lib/quick-dates.ts`.

- `allowNone`, on by default. Visit date turns it off, so "No date" is never offered and then refused.
- `variant="field"` for property fact dates and the move-in form. A field trigger with `CalendarDays` 16 in `--fg-3` and the date from `fmtDay`. With a mouse, a React Aria `DateField` takes typing in our field look in every browser. The calendar heading is a button that steps to months, then years, in the same layer, for purchase dates years back. No quick picks.
- Quick picks show a Check on the current value. On a Monday the Monday row hides, since it lands on the same day as Next week. Keys stay with their picks, so the printed keys read 1, 2, 4, 5.
- A past date opens the calendar on today's month, and the panel's first line names the current value, in `--danger` when overdue ("Due Sep 12").
- Row chips are named with the task: "Due date for Fix the sink: Apr 19" (TASKS-V02). Rows keep their date chip and its "Due date" placeholder, per Connor's Oct 25 task row rule (brand section 5).
- Calendar cells are 32px squares with a mouse. On touch each cell takes 1/7 of the grid's width at 44px tall: about 42px wide at 320 (a 296px grid) and 50px at 375.
- Phone sheet: two steps in one layer (open question 5, section 4.4).
- Tokens: today is a 1px inset `--line-control` ring at the same weight; the picked day is an `--act` fill with `--on-act` text.

**RepeatMenu.** Replaces the form inside `src/components/repeat-picker.tsx`. The chip stays unless open question 7 folds Repeat into Due.

- The chip's placeholder is "Repeat" everywhere (the rail says "Never" from `lg` today). It works as the field's name and as the rail's verb, so phone and rail match.
- Panel: an `OptionList`, pick one, built from the due date (or today): Doesn't repeat, Every week on Fri, Every 2 weeks on Fri, Every month on the 30th, Every quarter on the 30th, Every year on Oct 30, Custom. Each preset's subline shows "Next: Fri, Nov 6", from `nextOccurrence`.
- A stored rule that matches no preset ("Every 3 days", "Every 2 months") shows as its own row with the Check, above Custom, so opening the menu never hides the current rule.
- A preset commits, toasts with Undo ("Repeats every 2 weeks on Fri") and writes an Activity line (BPLAY-028).
- Custom swaps a sentence into the same layer: "Every [2] [Days | Weeks | Months]", a number `Input` and a `SegmentedControl`, which covers every interval `repeat.ts` stores (quarterly and yearly are presets). Weekly keeps the due date's weekday and monthly its day of the month, as today. A "Next: Fri, Nov 13" line sits under it, and Cancel and Save are pinned in the footer. A back chevron returns to the presets. Esc closes the whole layer.
- The dropdown inside a dropdown goes.

**Period control.** Ships with the Financials period (FINANCIALS-001), not before. A view menu naming the period ("This month") at every size: This month, Last month, Year to date, Last 12 months, then Custom range, which swaps in From and To date fields with Apply (pinned in the footer on a phone). `?period` travels with `?basis` through `TopTabs keep`. Vercel and Mercury pick a period this way on the web; the phone sheet is an adaptation with no reference.

**References.** Todoist [quick picks with landing days](https://mobbin.com/screens/6c83da1c-f6be-4326-b0d7-2ddcfa14ae5b), Todoist [repeat presets from the date, Undo toast](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c), Todoist iOS [picks over a calendar that scrolls in the sheet](https://mobbin.com/screens/018a3799-83e5-4260-89fb-27066ef1c5e2), Linear Mobile [due date presets with their dates, then Custom](https://mobbin.com/screens/83e3bdf5-0e3b-4c36-bde8-3edb095c5e7e), Linear Mobile [month jump from the heading](https://mobbin.com/screens/f95db849-c60a-408a-8b93-b541eb20332c), Things 3 [repeat editor with a Next line](https://mobbin.com/screens/4b5113ff-97be-4fca-b1e1-6f5c8203c384), Things 3 [Back inside the same card](https://mobbin.com/screens/383f064f-0aa6-4062-91b8-95d000458810), Linear [typed date field](https://mobbin.com/screens/ebeec61e-927c-4d36-99fa-a1f5ab250222), Vercel [a period dropdown plus a range with Apply](https://mobbin.com/screens/0e990655-cf9f-4231-a936-8358046daa48), Mercury [a period select over From and To](https://mobbin.com/screens/bf88b250-9021-48ae-8b28-911e779478be), Stripe [presets and a range with Apply](https://mobbin.com/screens/266228e3-d7ac-436a-bb53-c0a89ae421af).

### 3.10 Switch and Checkbox

Both are specified in brand section 9 and don't exist yet.

- **Switch** (new, `src/components/switch.tsx`, React Aria `Switch`). A 32 by 18 track with a 12px knob. Off: `--surface` with a `--line-control` edge and knob. On: an `--act` track with an `--on-act` knob. The label sits on the left in `text-body` and the switch on the right; the whole row is a 44px target on touch. The knob springs at `--dur-check`, since it's a change of state. For yes or no fields: Escrow, a move-in section's Required, and the yes or no facets in the Filters sheet.
- **Checkbox** (new). `CheckboxMark` in `ui.tsx` for list rows, and `Checkbox` in `src/components/checkbox.tsx` for forms. 16px, `rounded-sm`, `--surface` with a `--line-control` edge; checked is an `--act` fill and edge with an `--on-act` check that fills at `--dur-check`. It replaces the native boxes in the apply flow, the portal job checklist and the deals checklist (which goes with StatusMultiSelect).
- **References.** Apple Mail [switches for one-off conditions in a filter sheet](https://mobbin.com/screens/cc77bfc5-49aa-4222-9dc6-9b2009ac7a48), Linear Mobile [a switch in the display sheet](https://mobbin.com/screens/7eb66f59-cb97-4e40-af93-241e4fea1850), Linear [checkbox rows with counts](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1).

### 3.11 Global search, fixes only

Builds on `src/components/global-search.tsx`, still a combobox over `/api/search`.

- Results move onto `PopoverSurface` (its own `mousedown` listener goes), with a max height of 60dvh that scrolls.
- Results group under Properties, Deals, Contractors and Tasks headers, as two-line rows: a property's `PhotoThumb` 32 with "Buffalo · 3 units", a contractor's square avatar with the trade, a task's status mark with its property. The type column goes.
- Rows are links, so cmd-click and middle-click work. 44px on touch.
- Loading keeps the last results dimmed, with a spinner after 200ms. No match reads "No matches for 'tamrack'". A 401 clears the results.
- A leading `Search` icon, the placeholder "Search", and a `⌘K` `Kbd` at the right with a mouse. ⌘K (Ctrl K) focuses it from anywhere.
- Phone: search opens a full-screen sheet with the input pinned on top.
- Esc closes the results (the layer); a second Esc in the field clears the text.
- Out of scope: a command palette with Go to and recents (SHELL-002). It needs its own spec.

**References.** Attio [records under a header](https://mobbin.com/screens/1c58241b-ca46-420d-90d2-aa5821663303), Vercel [search with an Esc keycap](https://mobbin.com/screens/27a86801-1069-48d3-88d0-64ac3fffd167), LinkedIn [full-screen phone search](https://mobbin.com/screens/69ae646d-a57b-43ea-9aa9-0321e173911c).

### 3.12 pickerChip

Extended in `ui.tsx`:

- Two sizes. `sm` is 32px and 44 on touch, for the rail, create forms and the filter bar. `row` is for list rows: 28px with the `::after` reaching 44 on touch (an exception to brand's 32px `sm` control), or 32px. Amendment 1 asks. At 28, two-line task rows stay 62px; at 32 they grow to 66, since the date chip sets the title's line under the Oct 25 row rule.
- The placeholder moves to `text-fg-3`, off the old `text-muted` alias. The hover fill shows with a mouse only.
- Follow-up if 28 stays: the device check measures the 28px box and counts row chips as small targets (a warning). Teach it to read the `::after` hit area.

## 4. Design choices

### 4.1 The filter bar

Three real options. All three share the same compact layout below a wide desktop, because no reference carries chips or a builder to phones. Connor named Ramp as a bar to meet; Mobbin has no Ramp screens (two searches, Oct 25), so Mercury, the nearest finance peer, stands in.

**Option 1. Pinned chips on a wide desktop; a Filters button and sheet everywhere else (recommended).** Stripe and Vercel on desktop; Mercury iOS, Airbnb and Shopify on phones (links in 3.7).

```
1280, mouse, /tasks, nothing set
[Q Search tasks  ] [Open|Done|All] [+ Assignee] [+ Property]

1280, two facets set
[Q Search tasks  ] [Open|Done|All] [Assignee  Zack x] [Property  56 Tamarack x]
13 tasks · 27 hidden by filters · Clear filters
  ...rows...

1280, Assignee panel open (applies live)
                   [Assignee  Zack x]
                   +------------------------------+
                   | Q Search people              |
                   |------------------------------|
                   | [ ]  o   Unassigned       6  |
                   | Team                         |
                   | [ ] (P)  Pieter (you)     9  |
                   | [ ] (C)  Connor           4  |
                   | Contractors                  |
                   | [x] [Z]  Zack             3  |
                   |          Plumbing            |
                   +------------------------------+

768, touch
[Q Search tasks                    ] [ Open | Done | All ] [= Filters 2]
13 tasks · 27 hidden by filters · Clear filters

375 and 320
[Q Search tasks             ] [= Filters 2]
[    Open    |    Done    |    All     ]
13 tasks · 27 hidden · Clear filters

375, Filters sheet (staged)
+-------------------------------------+
| Filters                         [x] |
|-------------------------------------|
| Assignee               1      Clear |
| [Q Search people                  ] |
| [x] [Z] Zack                     3  |
|         Plumbing                    |
| [ ] (P) Pieter (you)             9  |
| [ ] (C) Connor                   4  |
| [ ]  o  Unassigned               6  |
|         Show all 32                 |
| Property                            |
| [Q Search properties              ] |
| [ ] [photo] 56 Tamarack St       5  |
|             Buffalo · 2 units       |
|-------------------------------------|
| [Clear all]        [Show 13 tasks]  |
+-------------------------------------+
```

Key: `(P)` round avatar (team), `[Z]` square avatar (contractor), `o` dashed circle, `=` the filter icon. Counts are illustrative.

- Desktop: every facet is one click away and the set state reads without opening anything. Live apply suits exploring 675 deals.
- Tablet: one row of 44px controls; facets wait in the sheet.
- Phone: search keeps the width, the badge says something is on, and the result line says what it hides.
- Cost: every page carries two filter UIs, chips on a wide desktop and the sheet elsewhere. Each facet is built and checked twice, and a partner who moves from laptop to phone meets a second shape.
- Why: HG lists have 2 or 3 facets used every day, and the pieces exist (`SegmentedControl`, `pickerChip`, `Popover`, the deals Filters sheet).

**Option 2. One Filters button at every size, with set values as removable chips after it.** Mercury's [Filters (3)](https://mobbin.com/screens/29b5e097-2a19-401b-b6c6-988a001b1959) opens a two-pane panel (facets left, options right), and each set value shows as a chip after it, with Reset.

```
1280, mouse
[Q Search tasks  ] [Open|Done|All] [= Filters 2]  Zack x   56 Tamarack x   Reset

1280, Filters panel (anchored, applies live)
+--------------+-------------------------------+
| Assignee   * | Q Search people               |
| Property   * |-------------------------------|
|              | [x] [Z]  Zack              3  |
|              | [ ] (P)  Pieter (you)      9  |
|              | ...                           |
+--------------+-------------------------------+

768, 375 and 320: the same as Option 1.
```

- Calmest bar and one pattern at every size.
- Every change costs a click into a two-pane panel. The value chips drop the facet name. The panel covers the list it filters.

**Option 3. Add-filter builder with sentence chips.** Linear's [Add Filter menu of fields](https://mobbin.com/screens/6d0577b3-4b12-44bb-a816-39997cc4a080), each field [opening its own list](https://mobbin.com/screens/2579f037-4e90-4330-ac35-19323ca9828a), and [sentence chips with a hidden-by-filters line](https://mobbin.com/screens/c15e23d9-67b4-4a87-af34-117ae648c266).

```
1280, nothing set
[Q Search tasks  ] [Open|Done|All]                              [= Filter]

1280, two set: a second row appears
[Q Search tasks  ] [Open|Done|All]                              [= Filter]
[Assignee is Zack x] [Property is 56 Tamarack St x] [+]             Clear

1280, the Filter menu: fields, then a list per field
+---------------------+   +--------------------------+
| Q Add filter...     |   | Q Search people          |
| Assignee          > |-->| [x] [Z] Zack          3  |
| Property          > |   | [ ] (P) Pieter (you)  9  |
+---------------------+   +--------------------------+

768, 375 and 320: the same as Option 1.
```

- Scales to dozens of fields; sentences read clearly; saved views come naturally.
- Two steps per filter, operators HG doesn't need, two popover layers (Esc twice), and a second row on desktop once anything is set.

**How the phone sheet applies** (open question 2). Applies to Options 1 and 2.

```
Staged (recommended)                     Live
|-------------------------------|        |-------------------------------|
| [Clear all]   [Show 13 tasks] |        |       [      Done      ]      |
+-------------------------------+        +-------------------------------+
```

- **Staged:** picks wait for "Show 13 tasks"; the X, Esc or a swipe discards them. The list is hidden under the sheet, so refiltering it live shows nothing. Each tap still costs a request, a count rather than the list (3.7). Airbnb and Mercury iOS stage.
- **Live with Done:** each tap applies and Done only closes. It's today's deals sheet and the feel.md proposal. Each tap reloads the list behind the sheet, it needs no count action, and there's no way to back out of a set of picks.

### 4.2 Pickers and value menus on a touch tablet

Desktop is an anchored popover with 32px rows in both options. Phones get a bottom sheet with 44px rows in both. Only 768 differs. The choice applies to `Select`, `EntityPicker`, `DatePicker`, `RepeatMenu` and value menus at once, so they never drift. The Filters sheet stays a sheet either way.

**Option A. Anchored popover with touch rows (recommended).** Apple's HIG keeps popovers for wide views like an iPad's and sends compact views to a sheet, and has a popover point at the control that opened it, sized to its content ([Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers)).

```
768, touch
  Assignee  [(Z) Zack]
            +-----------------------------+
            | Q Search people             |
            |-----------------------------|
            |  o   Unassigned             |   44px rows
            | Team                        |
            | (P)  Pieter (you)           |
            | (C)  Connor                 |
            | Contractors                 |
            | [Z]  Zack                ✓  |
            +-----------------------------+
```

- The row being edited stays in view, and a tap outside closes it.
- Costs one more container rule (touch plus `md` width).

**Option B. Centered dialog (today).**

```
768, touch
  :::::::::::::::::::::::::::::::::::::::::::::::
  :::::::::+---------------------------+:::::::::
  :::::::::| Assignee              [x] |:::::::::
  :::::::::|---------------------------|:::::::::
  :::::::::| Q Search people           |:::::::::
  :::::::::|  o   Unassigned           |:::::::::
  :::::::::| (P)  Pieter (you)         |:::::::::
  :::::::::| [Z]  Zack               ✓ |:::::::::
  :::::::::+---------------------------+:::::::::
  :::::::::::::::::::::::::::::::::::::::::::::::
```

- No change and a big title. It covers the row being changed and dims the page for a one-tap pick.

### 4.3 Who owns deal stage

Today the segments and the checklist both own status, and the segment value goes null when the checklist is set (DEALS-015).

**Both options use the view menu from 768 down.** DEALS-015 says six segments fit beside the search at 768. At touch sizes the six views with counts take about 550 to 580px. Add the Filters button (about 110) and two 8px gaps, and about 14 to 44px of the 720px row is left for the search.

**Option A. Six views, Active first, and a Stage chip that narrows inside Active and All (recommended).**

```
1280, mouse
[Q Search deals] [Active 13|TBD 17|Holding 206|Closed 11|Pass 428|All 675] [+ Stage]

Stage panel in the Active view: only that view's stages
+---------------------------+
| [x] (o) High           n  |
| [x] (o) Medium         n  |
| [ ] (o) Low            n  |
| [ ] (o) To schedule    n  |
+---------------------------+

768, touch
[Q Search deals                    ] [Active 13 v] [= Filters]

375 and 320
[Q Search deals      ] [Active v] [=]

375, the view menu as a sheet
+-------------------------------------+
| Show                            [x] |
|-------------------------------------|
| Active                       13  ✓  |
| TBD                          17     |
| Holding                     206     |
| Closed                       11     |
| Pass                        428     |
| All                         675     |
+-------------------------------------+
```

- One owner per question: the views pick the part of the pipeline, the chip narrows inside it. Holding (206) and Closed get one click, with counts like Stripe's [status tiles](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258).
- It works before stage grouping is built and keeps one-click narrowing to High and Medium.
- Inside Active the chip's options are priorities in all but name. If DEALS-013 is a yes (open question 9), this chip becomes Priority.

**Option B. Six views and no chip; each view groups its deals by stage (DEALS-015 with DEALS-014).**

```
1280, mouse
[Q Search deals] [Active 13|TBD 17|Holding 206|Closed 11|Pass 428|All 675]
  High · 4 · $1.2M asking
    ...rows...
  Medium · 5 · $2.1M asking
    ...rows...

768 down: the view menu, as in Option A. The phone Filters sheet holds only
Sort, so the button becomes Sort.
```

- One control fewer. The group headers answer "how many, worth what" at a glance, as Linear's [groups with counts](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022) and Pipedrive's [stage totals](https://mobbin.com/screens/2ff3c977-7902-48b5-8361-0c89710e5c2e) do.
- Narrowing to High and Medium becomes scrolling past the other groups. It needs DEALS-014's sticky group headers in the same slice.

### 4.4 The phone date sheet

An iPhone SE shows about 550px of page in Safari, so a 90dvh sheet is about 495px. Playwright's 375 by 667 viewport hides this. Heights below are in px: the sheet header is 57, a 44px row each, and the calendar is its month row (48), weekday row (20), five or six weeks of 44 and 21 of padding and rule.

| | Header | Picks | Calendar | Total |
|---|---|---|---|---|
| Today: five picks over the calendar | 57 | 228 | 309 to 353 | 594 to 638 |
| Option A, step 1 | 57 | 272 (six rows) | | 329 |
| Option A, step 2 | 57 (with a back chevron) | | 309 to 353 | 366 to 410 |

**Option A. Two steps in one layer (recommended).** Step 1 lists Today, Tomorrow, Monday, Next week, No date and "Pick a date". "Pick a date" swaps in the calendar with a back chevron; Esc closes the layer. Linear Mobile's due date sheet works this way (presets with their dates, then Custom). Desktop and the tablet popover keep picks and calendar together.

```
375, step 1                                375, step 2
+-------------------------------------+    +-------------------------------------+
| Due date                        [x] |    | [<] Due date                    [x] |
|-------------------------------------|    |-------------------------------------|
| Today                           Sun |    | October 2026              [<]  [>]  |
| Tomorrow                        Mon |    |  S    M    T    W    T    F    S    |
| Monday                        Nov 2 |    |  ...five or six weeks of 44px...    |
| Next week                Sun, Nov 1 |    +-------------------------------------+
| No date                             |
| Pick a date                       > |
+-------------------------------------+
```

- Both steps fit with room to spare, and "No date" stays a row, so the `Sheet` needs no header action.
- A specific date costs one more tap on a phone. Quick picks are the common path (D7).

**Option B. One sheet that scrolls.** Todoist iOS keeps its picks over a calendar that scrolls inside the sheet. On an iPhone SE the last two or three weeks sit below the fold, and picking one means scrolling inside a sheet that also swipes to close.

## 5. Migration map

Every instance, grouped by page, at `c2480a1`. "Now" is the code there.

### Shared components

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `components/ui.tsx:274` `Select` | Native select, 36px (44 on touch) | `Select` (3.2); the native one and `selectTouchHeight` are deleted at the end | One look and one menu everywhere, search on long lists, a check on the pick |
| `components/ui.tsx:247` `pickerChip` | 28px; placeholder on `text-muted` | `row` and `sm` sizes, `--fg-3` placeholder (3.12) | Rail and form chips are real 44px targets on touch |
| `components/ui.tsx:265` `Input` | One size, 36px; filter bars hand-size `h-8` | `sm` size with a leading search icon and a clear button | Every filter search looks and clears the same |
| `components/menu.tsx:33`, `:45` | No sections, shortcuts or selection state; `checked` draws a Check only | Extended (3.5) | Screen readers hear the current value; value menus get numbers and a phone sheet |
| `components/popover.tsx:41` `PopoverSurface` | Every surface pops in | A `motion` prop; lists open with none | Menus and lists appear at once |
| `components/use-coarse-pointer.ts:17` | False during hydration | `pickContainer()` read at press time | An early tap on a phone opens the sheet |
| `components/sheet.tsx:34` | Title and close only | A pinned `footer` slot and a header back button | Show, Save and Apply stay on screen; follow-ups step back in place |
| `components/segmented-control.tsx:30` | One tab stop per segment; `md` 48 on touch; `sm` segments 40 on touch | Roving focus, 44 on touch, a 2px `::after` per segment, `fullWidth`, Review count (3.8) | Segments line up with the fields beside them, and each is a 44px target |
| `components/nav.tsx:84` `TopTabs` | `keep` carries `?basis`; `role="tab"` | `keep` adds `period`; semantics per open question 8 | Tabs keep the period once it exists |
| `components/assignee-picker.tsx:55` | Good picker on old aliases; 256 to 320px panel; 36px rows | `AssigneePicker` on `EntityPicker`, with Recent and you first (3.3) | The people you last assigned are one tap away |
| `components/due-date-picker.tsx:43` | No current mark; Monday duplicates Next week on Mondays; 44px square touch cells overflow 320; a 594 to 638px phone sheet | Extended (3.9) | The current pick is checked; the sheet fits a real iPhone SE |
| `components/repeat-picker.tsx:21` | A form with a native select and Save | `RepeatMenu` presets (3.9) | Common repeats take one tap, with the next date and Undo |
| `tasks/[id]/select-chip.tsx:13` | Chip over a native select | Deleted; `PropertyPicker` and `UnitPicker` | Property and Unit open like Assignee and Due |

### App shell, every app page

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `components/global-search.tsx:15` | Hand-rolled list, its own `mousedown` listener (`:57`), no max height, flat | Fixes in 3.11 | Every result reachable, grouped with context; cmd-click works; ⌘K |
| `components/theme-toggle.tsx:22`, at `app-shell.tsx:102` and `:161`; Sign out at `:168` | Light and dark only, in the header and the drawer; a raw Sign out | Account menu with a Theme section (3.5); the drawer gets System, Light, Dark segments | The app can follow the OS again; Theme and Sign out live in one place |
| `components/nav.tsx:34` `SideNav` | Plain hrefs | Hrefs carry each list's remembered query from the cookies (3.7) | Coming back through the sidebar keeps your filters |

### Home `/`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `tasks/today-view.tsx:51` | Mine, Contractors below `lg`; `md`, 48 on touch; no counts | `md`, 44 on touch; Contractors carries the Review mark and count | Needs review shows on phones and tablets |

### Task rows (`TaskRow`, on Home and `/tasks`)

The property record's Tasks card shows its date as text, not a chip, so nothing here changes it.

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `tasks/task-row.tsx:106` | `DueDatePicker` chip named "Due date: Apr 19" | DatePicker `row` chip named with the task; the "Due date" placeholder chip stays (Oct 25 rule) | Screen readers hear which task; nothing moves |

### Tasks `/tasks`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `tasks/filters.tsx:64` | Input "Filter by title…" | `FilterBar` search, "Search tasks" | One search look across lists |
| `tasks/filters.tsx:72` with `:9` | All, Open, Done; the default in the middle | Open, Done, All, Open first | The default is where the eye starts |
| `tasks/filters.tsx:83` | Assignee: about 45 native options under "All assignees"; people twice under External | `FilterChip` Assignee: pick many, search, avatars, open-task counts. External legacy names merge into the matching person, or list once under "Others" | Type "pi" for Pieter's day; nobody listed twice |
| `tasks/filters.tsx:120` | Property: native, 11 options, "All properties" | `FilterChip` Property: pick many, photos, a "No property" row. With one property picked, rows stop repeating its address | Less noise when looking at one building |
| `tasks/filters.tsx:47` | `router.push` per change | `replace` in a transition, the list dimmed while it loads | Back leaves the page instead of undoing filters |
| Search (`lib/tasks/queries.ts:73`) | Titles only (TASKS-030) | Title, property and assignee | Find a task by where or who |
| Results (`tasks/page.tsx:53`, `queries.ts:78`) | "No tasks match." with no way out; Done sorts oldest due first | Result line and `EmptyState` with Clear filters; Done sorts newest completed first (BTASKS-010) | One tap back to the full list; recent work on top |

The server reads comma-joined `owner` and `property` values for the multi-pick.

### Task page `/tasks/[id]`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `tasks/[id]/fields.tsx:86` | AssigneePicker | `AssigneePicker` chip; the empty rail fact reads "Assign"; toast with Undo | A wrong pick is one Undo away |
| `tasks/[id]/fields.tsx:96` | Due chip | DatePicker chip with the fixes in 3.9 | Current pick checked; late dates open on this month |
| `tasks/[id]/fields.tsx:110` | Visit date offers "No date", then toasts that it needs one | DatePicker with `allowNone` off | No dead end |
| `tasks/[id]/fields.tsx:124`, `:140` | Property and Unit open the OS menu or iOS wheel; Unit shows from one unit | `PropertyPicker` and `UnitPicker` chips with photos and search; Unit from two units; toasts with Undo | Same feel as the chips beside them |
| `tasks/[id]/fields.tsx:153` | Repeats: "Repeat" on phones, "Never" in the rail (`:157`); saves silently | `RepeatMenu`; "Repeat" in both; toast and Activity line | You see that it saved, and it shows in the record |
| `tasks/[id]/fields.tsx:80` | The chip row below `lg` scrolls sideways with a hidden scrollbar | Same row, end padding removed so the next chip is cut at the edge | Chips past the edge are discoverable |
| `tasks/[id]/status-control.tsx:51`, `:73`, `:87` | Menu with `checked`; Waiting and Scheduled open sheets, two stacked for a visit; no toast | `StatusMenu`: numbers, a phone sheet, follow-ups in the same layer that commit on the answer, toast with Undo, Review hidden on staff-only tasks | Booking a visit takes three taps in one layer instead of five over two |
| `tasks/[id]/header.tsx:78` | ⋯ menu: Copy link, Cancel, Delete task | Unchanged apart from the Menu changes | |
| `tasks/[id]/files-list.tsx:77` | Each file row's ⋯ holds Delete; shown on hover with a mouse, always on touch | Stays a row ⋯ menu (3.5) | Unchanged |
| `tasks/[id]/composer.tsx:264` | "Reply to Zack" or Shared, then Internal, on every task | `SegmentedControl` `sm`: "Shared", "Internal"; shown only when a contractor is on the task (BTASKS-019) | The choice reads as a setting, not an action |

### New task `/tasks/new`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `tasks/new/new-task-fields.tsx:78` with `:66`, `:89` | Native Status select beside Assignee and Repeat chips | The task page's chip row: a `StatusMenu` chip (To do, Scheduled, In progress, Waiting, with follow-ups in the same layer), Assignee, Due, Repeat, Property, Unit | New task looks and works like the task it creates |
| `tasks/new/page.tsx:48` | Property: native, "None", after the other fields | `PropertyPicker` chip next to Assignee, "No property"; still hidden when created from a deal | Property is found where it's set on the task |
| `tasks/new/new-task-fields.tsx:72`, `:108` | Native date inputs | DatePicker chips (Visit with `allowNone` off) | Quick picks; no gray date in an empty field |

### Apply a playbook `/templates/[id]/apply`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `apply-flow.tsx:120` | Property: native, required | `PropertyPicker` field, required ("Choose a property"), plus a Unit picker when the building has units (BPLAY-004) | Move-in and move-out playbooks can target a unit |
| `apply-flow.tsx:133` | Anchor DueDatePicker | DatePicker chip, unchanged. BPLAY-002 (no anchor on imported playbooks) is a playbook data fix outside this spec | |
| `apply-flow.tsx:174` | Native checkbox per row; skipped rows at 60% | `Checkbox`; skipped rows at 50% | The box matches the rest of the app |
| `apply-flow.tsx:189` to `:197` | Per-row chips in a sideways row with a hidden scrollbar | The same chips at `row` size; on phones they sit on the row's second line | No hidden chips at 375 and 320 |

### Deals `/deals`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `deals/filters.tsx:81` | "Find a deal", named "Filter by address"; only inside the current view | "Search deals", across all stages, with match counts on each view | A hit in Pass is visible from Active |
| `deals/filters.tsx:91` with `:13` | All, TBD, Active (the default, third), Pass; null under the checklist | Active, TBD, Holding, Closed, Pass, All with counts, Active first; never null (open question 4) | Holding and Closed are one click away |
| `deals/status-multiselect.tsx:72` | "All statuses" checklist popover, native boxes, `router.push` per toggle | Deleted. Option A: a `FilterChip` Stage inside Active and All, live. Option B: none | Narrowing without history spam |
| `deals/filters.tsx:112` | Phone sheet: Show and Statuses, live, Done | `FilterSheet`: Stage (Option A) and Sort, staged | Phones can sort, and picks can be backed out |
| `deals/sort-header.tsx:21` | Caret hidden until hover (`:70`); three-click cycle; `push` (`:46`) | `SortHeader` (3.6) | Sortable columns visible before hovering and on touch |
| `deals/page.tsx:128` | Column header "Status" | "Stage" | One word for one thing |
| `deals/deal-row.tsx:104` (`deal-fields.tsx:57`, named "Status") | `DealStageField`, a native select in every row | `StatusMenu` with a mouse, named "Stage": the cell shows ring and word, the chevron on row hover. On touch the cell is display only and the row opens the deal | No stage change from a stray keystroke; number keys for triage |

### Deal page `/deals/[id]`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `deals/[id]/page.tsx:62` | "Status" row, `DealStageField` `sm`: native select with the ring drawn over it | "Stage" row, `StatusMenu` trigger (ring, word, chevron); toast with Undo | Same look as task status; Undo |
| `deals/[id]/deal-detail.tsx:35` | Pass reason: native select with a dash option | `Select` `sm`, "No reason" as the empty choice, search (12 reasons), shown only for Pass | Find a reason by typing |

### New deal `/deals/new`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `deals/new/new-deal-form.tsx:67` | `StageSelect`, default TBD | `Select` `md` with stage rings, default TBD | Same picker as the rest of the app |

### Properties `/properties`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `properties/page.tsx:104` to `:117` (gap) | Static headers; string sort by address (`:29`) | `FilterBar` with one Status chip (pick many, counts) and no search for 11 rows. `SortHeader` on Property (by street, then house number), Value and Units. Phone: Filters with Status and Sort | Sort by value or units; 15 comes before 118 |
| `properties/capex-ui.tsx:70` (`ForecastYearBars`, in `portfolio-capex.tsx:143` and `[id]/capex-outlook.tsx:62`) | The pick on a `--line-control` edge; the other years fade to 40% | The other years stay full strength; the pick keeps its edge (a call in section 8) | The chosen year reads by its edge without hiding the others |

### Property page `/properties/[id]`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `edit-details.tsx:155`, `:172` | Strategy and Status: native | `Select` `md`; Status with the lifecycle ring; named empty choices; legacy values kept | Same picker; the stage reads as it does elsewhere |
| `edit-loan.tsx:127` | Escrow: a No or Yes select | `Switch` | One tap |
| `edit-units.tsx:455` | Utility status: raw 32px selects (44 on touch), 3 per unit, a dash as the empty option | `Select` `sm`, "Not set" as the empty choice | One picker look; a named empty value |
| `edit-units.tsx:499` | Equipment type: raw select, 18 options | `Select` `sm` with search | Type "fri" for Refrigerator |
| `edit-units.tsx:269` `UnitMenu` (at `:324`, `:442`) | Row ⋯ with one item, "Delete unit" | Stays a row ⋯ menu (3.5) | Unchanged |
| `edit-listings.tsx:307`, `:322`, `:333` | One row at every width: a raw Unit select ("Select unit…"), a raw 128px Status select, a ⋯ with "Delete listing" | Unit becomes `Select` `sm` "Choose a unit"; Status stays a `Select` `sm` (Hidden, Available, Leased), 120px; the ⋯ stays. At 320 the Unit field gets about 108 of the 288px (Status 120, ⋯ 44, two 8px gaps); at 375 about 163 | One row and one height at every width |
| `edit-listings.tsx:373` | The date field is labeled "Available", like the status value | "Available from" (COPY-I03) | Two fields no longer share a name |
| Native dates: `edit-details.tsx:137`, `:149`, `:180`, `:183`; `edit-loan.tsx:133`, `:136`; `edit-insurance.tsx:101`; `edit-listings.tsx:375` | Browser date fields | DatePicker `field` variant | Same look in every browser; typing with a mouse; month and year jump |

### New property `/properties/new`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `properties/new/new-property-form.tsx:56` | Status defaults to "None"; offers Refinanced and Sold | `Select` `md`, required, "Choose a status", without Refinanced and Sold | A new buy can't start as Sold |

### Contractors `/contractors`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `contractors/page.tsx:17` (gap) | Reads `?q` but shows no control | `FilterBar`: "Search contractors" (name, company, trade), + Trade (pick many, search), and two toggle chips, "Has login" and "Needs W-9" (no W-9 on file). Phone: search and Filters | A plumber with a login is two clicks away |

### Financials `/financials`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `financials/page.tsx:114` with `:107` | A "Show accrual basis" link beside Refresh (44 on touch, its own row below `sm`); `SourceLine` names the basis | `SegmentedControl` `sm` Cash, Accrual beside Refresh; `SourceLine` drops its basis clause where the control shows it (a `showBasis` prop) | The basis is visible, one tap, and said once |
| `financials/rent-roll/page.tsx:35` | Reads `?basis` with no control; `SourceLine` names it | The same control; `SourceLine` drops the basis | Rent roll can switch too |
| `financials/layout.tsx:10` | `TopTabs keep={["basis"]}` | Adds `period` with FINANCIALS-001 | |
| Period (gap) | None | The period control when FINANCIALS-001 ships (3.9) | |

### Financials settings `/financials/settings`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `settings/controls.tsx:80` `BasisToggle` | Already a `SegmentedControl` | No change | |
| `settings/tables.tsx:72`, `:89`, `:108` | Class mapping: Role, Property and Entity selects per row; the whole table dims to 60% while saving (`:57`) | One "Maps to" `Select` per row: Properties (short addresses with photos), Entities, then Overhead, Ignore, Unmapped. A pick sets role and target together. Only that row dims, to 50%; the toast has Undo; row text lines up with the field's text (FINANCIALS-063) | One decision per class instead of three |
| `settings/tables.tsx:170` | Account category: 21 native options; the whole table dims to 60% (`:157`) | `Select` `sm` with search; only the row dims, to 50% | Type "tax" for Taxes; the rest of the table stays usable |

### Settings `/settings`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `settings/layout.tsx:16` | `TopTabs`, `role="tab"` | Per open question 8 | |
| `capex-rules-editor.tsx:145` `ComboField` at `:333`, `:391` | A text cell with a hidden list that reverts silently | `Select` `sm` with search over the unused types | The choices are visible; nothing reverts silently |
| `capex-rules-editor.tsx:422` | Building system name: suggestions never shown | `Combobox`: free text with the suggestions listed | Suggestions show as you type |
| `capex-rules-editor.tsx:31` with `:328`, `:386` | Rule rows need 460px (480 on touch), so the tables scroll sideways at 375 and 320 | Two-line rule rows below `sm`, shown below | Every figure visible without scrolling |
| `capex-rules-editor.tsx:46` `RuleRow` | Delete on hover or focus, tap to reveal on touch | Unchanged | |
| `settings/move-in-form/move-in-form-editor.tsx:50` | Native checkbox, "Required" | `Switch` | One tap, the same control as Escrow |

CapEx rules below `sm`. The section title names the type, so the "Appliance" and "System" column header drops; the three figures keep one header over their columns.

```
375 and 320
Appliances                         Add appliance
     Monitor        Replace           Cost
------------------------------------------------
[Dishwasher                          v]  [del]     line 1: Select sm, delete slot 44
     8 yrs          12 yrs            $900         line 2: figures in thirds
------------------------------------------------
```

At 320: the name field gets 240 of the 288px beside the 44px delete slot (tap to reveal, as now), and each figure column is 96px, enough for "$12,500". Rows are 88px on touch. From `sm` up the one-line grid stays.

### Contractor portal `/p`

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `(portal)/p/_components/my-jobs.tsx:80`, `:81` | Two `md` switches, 48 on touch | Both stay (they fit at 320), 44 on touch. G1A-015, one list with Done folded, stays a later call | Lines up with the rest |
| `(portal)/p/_components/account-menu.tsx:28` | Sign out only | `Menu` with a name and email header above Sign out | The contractor sees which account they're in |
| `(portal)/p/jobs/[id]/_components/job-details.tsx:120` | Native 20px checkboxes in 44px rows; disabled at 60% | `Checkbox` in the same 44px rows; disabled at 50% | The checklist matches the app |

### Public site

| Where | Now | Becomes | What changes for the user |
|---|---|---|---|
| `residents/moving-in/move-in-form.tsx:177`, `:199` | The `Select` primitive; full addresses; Unit for buildings with 2 or more units | `Select` on the public surface (its overlay carries `data-surface="public"`): the short address with the town as subline | Residents pick from big rows, not a wheel of long addresses |
| `move-in-form.tsx:169` | Native inspection date | DatePicker `field` variant on the public surface | The same in every browser |
| `move-in-form.tsx:345` | `SegmentedControl` `md`, 48 on touch | 44 on touch with the SegmentedControl change; nothing else | Lines up with the fields |
| `components/public/header.tsx:86` | `MenuItem checked` marks the current page | Stays navigation: links with `aria-current="page"` through the new `current` prop, which draws the Check. Never `selectionMode` | Screen readers hear "current page", not a radio choice |

### Build order

1. Primitives: the `Sheet` footer and back button, `SegmentedControl`, `Menu`, `PopoverSurface` motion, `OptionList`, `Checkbox`, `Switch`, `Input` `sm`, `pickerChip` sizes, `pickContainer()`.
2. `Select`, `EntityPicker` (with `AssigneePicker` moved onto it), `Combobox`.
3. `StatusMenu` on the task page and deals; `SortHeader`.
4. `FilterBar`, extracted from `deals/filters.tsx` on /deals, then /tasks, /contractors and /properties; the list cookies in `(app)/layout.tsx`.
5. DatePicker (touch cells, the phone steps, the `field` variant) and `RepeatMenu`, then the forms (New task, property edits, apply flow, financials settings, CapEx rules with the phone layout, the move-in form editor).
6. Shell: global search fixes, the account menu.
7. The public move-in form and the public header's `current`.
8. Delete the native `Select`, `selectTouchHeight`, `SelectChip`, `StageSelect`, `StatusMultiSelect` with `StatusChecklist`, RepeatPicker's form and `ComboField`.

Each slice runs `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`, and opens every menu, sheet and popover it touched at 375 and 320 by hand. No new dynamic routes.

## 6. Reuse check

**Reused as they are.** `Popover`, `PopoverTrigger`; `ConfirmDialog`; `useToast` with Undo; `Avatar`; `StatusMark` and `StatusBadge`; `PhotoThumb` 32; `Badge`; the Tag look; `Kbd`; `Button` variants; `fieldClass`; `TOUCH_HEIGHT`; `EmptyState`; `TextLink` for "Clear filters"; `ForecastYearBars`; React Aria `useFilter`; `lib/quick-dates.ts`; `dueLabel` and `fmtDay`; `describeRepeat` and `nextOccurrence`; `shortAddress`; the sidebar cookie pattern in `(app)/layout.tsx`.

**Extracted and extended.** The code already has these pieces.

| Piece | From | Extension |
|---|---|---|
| FilterBar, Filters button, FilterSheet | `deals/filters.tsx` (search with icon, Filters with a count `Badge`, `Sheet` with sections, Clear and a sticky footer) | `components/filter-bar.tsx`: the wide layout, chips, staged picks, the count, the result line |
| OptionList | `AssigneeList` in `assignee-picker.tsx`, and `filterRowClass` in `deals/status-multiselect.tsx` | `components/option-list.tsx`: checkboxes, counts, sublines, Tags, tokens |
| SortHeader | `deals/sort-header.tsx` | `components/sort-header.tsx`: caret at rest, two states, `replace` with pending |
| DealStageMark | `deals/stage-select.tsx` | Moves next to `StatusMark` |

**Extended in place.**

| Piece | File | Extension |
|---|---|---|
| Sheet | `components/sheet.tsx` | Pinned `footer` slot; a header back button |
| SegmentedControl | `components/segmented-control.tsx` | Roving focus, 44 on touch for `md`, a 2px `::after` per segment, `fullWidth`, Review count |
| Menu | `components/menu.tsx` | Selection state, `current`, sections, `shortcut`, `description`, `numberKeys`, `sheetTitle`, follow-up step |
| PopoverSurface | `components/popover.tsx` | A `motion` prop |
| pickerChip | `components/ui.tsx` | `row` and `sm` sizes; `--fg-3` placeholder |
| Input | `components/ui.tsx` | `sm` size, leading search icon, clear button |
| AssigneePicker | `components/assignee-picker.tsx` | Becomes a wrapper on `EntityPicker`; Recent; you first |
| DueDatePicker | `components/due-date-picker.tsx` | `allowNone`, `field` variant, named row chips, current-pick check, fixed keys, touch cells, phone steps |
| TopTabs | `components/nav.tsx` | `keep` adds `period` |
| SideNav | `components/nav.tsx` | Hrefs from the list cookies |
| SourceLine | `financials/_components/ui.tsx` | `showBasis` |
| GlobalSearch | `components/global-search.tsx` | `PopoverSurface`, groups, links, states, ⌘K, phone sheet |
| useCoarsePointer | `components/use-coarse-pointer.ts` | `pickContainer()` read at press time |

**New, with the references behind each.**

| New | File | Why new | References |
|---|---|---|---|
| Select | `components/select.tsx` | No styled pick-one for forms exists | Linear [884ec36e](https://mobbin.com/screens/884ec36e-0aef-464e-863c-49ef977d6371), Vercel [01b2a95e](https://mobbin.com/screens/01b2a95e-2a7e-475c-8457-662480cf5c8d), Stripe [726ecb89](https://mobbin.com/screens/726ecb89-06c4-4184-ab58-eccf01e64659), Mercury iOS [47f9fba7](https://mobbin.com/screens/47f9fba7-fa5d-428d-b2f7-b1161a56cf6f) |
| EntityPicker, PropertyPicker, UnitPicker | `components/entity-picker.tsx` | Generalizes AssigneePicker for buildings | Linear [0035680b](https://mobbin.com/flows/0035680b-a877-444a-b27a-b76b38d10853), Airbnb [350bd159](https://mobbin.com/screens/350bd159-7be8-4cad-972c-353268be9601), Slack [653fd646](https://mobbin.com/screens/653fd646-3333-4cd4-a783-3af15d9277b0) |
| Combobox | `components/combobox.tsx` | Free text with suggestions has no home | Mercury [89d118cc](https://mobbin.com/screens/89d118cc-f223-4d5f-8bbe-ae4ec910d753), Stripe [1a28ce6c](https://mobbin.com/screens/1a28ce6c-d35d-48fe-a189-5335457fbf98), LinkedIn [69ae646d](https://mobbin.com/screens/69ae646d-a57b-43ea-9aa9-0321e173911c) |
| FilterChip | `components/filter-bar.tsx` | The wide layout's chips; no chip filter exists | Stripe [1bbafee3](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258), Vercel [b9d9cc23](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7), Stripe [2b2d5f4f](https://mobbin.com/screens/2b2d5f4f-bdd9-4186-b383-e3b30140a551) |
| RepeatMenu | `components/repeat-menu.tsx` | Replaces RepeatPicker's form | Todoist [54032487](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c), Things 3 [4b5113ff](https://mobbin.com/screens/4b5113ff-97be-4fca-b1e1-6f5c8203c384) |
| Switch | `components/switch.tsx` | In brand section 9, never built | Apple Mail [cc77bfc5](https://mobbin.com/screens/cc77bfc5-49aa-4222-9dc6-9b2009ac7a48), Linear Mobile [7eb66f59](https://mobbin.com/screens/7eb66f59-cb97-4e40-af93-241e4fea1850) |
| Checkbox, CheckboxMark | `components/checkbox.tsx`, `components/ui.tsx` | In brand section 9, never built | Linear [d1d26f7d](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1) |
| Account menu | A `Menu` in `components/app-shell.tsx` | IA-019 | Linear [e8fe60b4](https://mobbin.com/screens/e8fe60b4-6db4-4485-99b8-3395d69ea7db), Vercel [a8d666ee](https://mobbin.com/screens/a8d666ee-3303-4b28-9e1f-06b8dbd63cb6) |
| Period control (later) | A view menu plus a range step in Financials | FINANCIALS-001 | Vercel [0e990655](https://mobbin.com/screens/0e990655-cf9f-4231-a936-8358046daa48), Mercury [bf88b250](https://mobbin.com/screens/bf88b250-9021-48ae-8b28-911e779478be), Stripe [266228e3](https://mobbin.com/screens/266228e3-d7ac-436a-bb53-c0a89ae421af) |

**Invented or adapted, with no reference.** The Review mark inside a segment's count. Backspace clearing a focused filter chip. A panel holding its width while you type. The phone period sheet. Short facets listed inline in the Filters sheet (adapted from Mercury iOS). The result line above the rows (Linear puts it after them).

**Deleted.** The native `Select` and `selectTouchHeight`, `SelectChip`, `StageSelect`, `StatusMultiSelect` with `StatusChecklist` and `filterRowClass` (folded into `OptionList`), RepeatPicker's form, `ComboField`, the header's light and dark button (its theme script stays), and GlobalSearch's own outside-click listener.

**docs/components.md, in the same commits.** Update the rows for "Pick one from a list in a form", "Select", "Checklist popover for a multi-pick filter" (now `FilterChip`), "Action menu", "Popover", "Dialog with a form, or a picker on touch" (the Sheet slots), "Picker trigger chip", "Assignee", "Repeats", "Due date", "Sortable column header", "Views and filters inside a page", "Light and dark switch" and "Data source and freshness". Add rows for `OptionList`, `PropertyPicker` and `UnitPicker`, `Combobox`, `FilterBar`, `Switch` and `Checkbox`.

## 7. Amendments to the brand guidelines

Each is a size or rule sections 5, 7 and 9 don't have yet. None adds a color or token. They go into `docs/brand-guidelines.md` once Connor approves.

1. **Row chip.** `pickerChip` `row` stays 28px in list rows, with a 44px hit area on touch, as an exception to the 32px `sm` control. Or it goes to 32px and two-line task rows grow from 62 to 66px. Recommended: the 28px exception, so the Oct 25 task rows don't move.
2. **Option rows.** One line: 32px with a mouse, 44 on touch. Two lines: 44 and 56. Touch rows are the same in a popover and a sheet.
3. **Panel size.** The larger of the trigger and the widest row, at most 320px wide. At most 320px tall with a mouse, 60dvh in a touch popover.
4. **Filter chips.** They truncate at 160px. The remove X is a 24px button, shown with a mouse only.
5. **`Input sm`.** 32px with a mouse, 44 on touch, for filter bars. Section 9's fields are 36 only.
6. **Segment targets.** On touch each segment carries a 2px `::after` above and below, so a 40px segment in a 44px control is a 44px target.
7. **Touch calendar cells.** 1/7 of the grid's width by 44px tall.
8. **One dim level.** 50% for disabled, saving and loading. Section 9 names 50% for disabled only.
9. **Motion per member.** The table in section 2, with the `Switch` knob on `--dur-check` and a `motion` prop on `PopoverSurface`.
10. **Idle filter chips** use the Tag's solid edge with a Plus. No dashed edge, so a dashed line stays `--chart-ref`'s alone.

## 8. Open questions for Connor

**Choices this spec needs**

1. **Filter bar.** Option 1 (pinned chips on a wide desktop, a Filters button and sheet elsewhere), Option 2 or Option 3? Recommended: Option 1 (section 4.1).
2. **Phone Filters sheet.** Hold picks until "Show 13 tasks", or apply each tap live with Done, as the deals sheet does today? Recommended: staged.
3. **Touch tablets.** Pickers and value menus as an anchored popover with 44px rows, or today's centered dialog? Recommended: the popover (section 4.2). It applies to every picker at once.
4. **Deal stage.** Option A (six views plus a Stage chip inside Active and All) or Option B (six views grouped by stage, no chip)? Recommended: A (section 4.3). Stage names drop their number prefixes either way.
5. **Phone date sheet.** Two steps in one layer, or one sheet that scrolls? Recommended: two steps (section 4.4).
6. **Brand amendments.** Approve the ten in section 7, with the 28px row chip? Recommended: yes.

**Earlier review decisions this spec touches.** The review README's "Decisions for Connor" recommends yes on 7 to 10. DEALS-I05 isn't in that list; the README lists it under Phase 4, and its finding is confirmed. The draft settled these without asking; each line says what changes here on a yes.

7. **G1C-010: fold Repeat into the Due picker?** Recommended (review): yes. If yes, the date panel ends with a Repeat row that opens RepeatMenu in the same layer (as Todoist's date panel does), the rail keeps a read-only line, and Repeat's own chip goes. If no, Repeat keeps its chip as in 3.9. It changes the approved rail (plan section 6, D31).
8. **Route tabs on `aria-current` (ADMIN-V01)?** Recommended (review): yes. `TopTabs` would sit in a `<nav>` with a label, set `aria-current="page"` and style from it. CLAUDE.md's Typography rule and brand section 9's Tabs line (`role="tab"`, `aria-selected`) change with it.
9. **DEALS-013: split Stage and Priority?** Recommended (review): yes, in Phase 4, after a grilling pass on the stage list. Here it turns Option A's chip inside Active into a Priority chip and renames the views by stage.
10. **BPLAY-025: a Repeats filter on Tasks?** Recommended (review): yes. Here it's a "Repeats" toggle chip in the wide bar (the row stays inside 56rem) and a switch in the Filters sheet, with each row's cadence in its subline.
11. **DEALS-I05: Snooze replaces Holding?** Planned (review): Phase 4. Its verification suggests Holding plus a dated "Check price" task as the simpler build. Here Holding stays a view until then and becomes Snoozed after.

**Calls this spec makes without a question.** Say if any is wrong.

- Esc closes a layer in one press, even with a typed search.
- Backspace, not Esc, clears a focused filter chip. DEALS-I07 asked for Esc, which breaks one Esc per layer.
- Task rows keep their date chip and "Due date" placeholder (Connor's Oct 25 row rule), so BTASKS-007's plain-text date isn't taken up.
- Row ⋯ menus stay menus even with one item (files, units, listings), and CapEx rule rows keep their tap-to-reveal delete. No row gets a Delete that's always shown on touch.
- No page-level letter shortcuts. The draft's A and P keys on the task page are dropped: they failed WCAG 2.1.4 and had no reference.
- On touch, deal list rows show the stage without a menu, and the row opens the deal.
- The CapEx year rows stop fading the other years to 40%; the pick keeps its edge.
- Contractors' login and W-9 filters are both toggle chips ("Has login", "Needs W-9").
- The account menu has no Settings item; Settings stays in the sidebar.
- The light and dark button moves into the account menu with System. It ships with the shell slice and can be dropped without touching the rest.
