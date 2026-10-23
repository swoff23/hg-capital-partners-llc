# Component inventory

What to reuse before building anything new. This is step 1 of **Reuse first** in [CLAUDE.md](../CLAUDE.md), and it applies to specs and plans as much as to code.

**How to check**

1. Find the job below and use the pick.
2. Not listed? Search `src/components/` and the feature's folder under `src/app/` for it: the name you'd give it, its ARIA role (`role="dialog"`, `role="tab"`), or the words on screen ("No open tasks").
3. Close but not quite? Extend it with a prop or variant. Don't fork a copy.
4. Nothing fits? Research it on Mobbin, build it in `src/components/` if it's general-purpose, and add a row here in the same commit.

Paths are under `src/`. Last full sweep: 2026-10-22.

## Where things live

| Place | What's there | When to use it |
|---|---|---|
| `components/ui.tsx` | `Card` (with `CardHeader`, `CardTitle`, `CardBody`), `SectionCard`, `Button`, `LinkButton`, `buttonClass`, `Badge`, `Input`, `Textarea`, `Select`, `Table`, `Th`, `Td`, `PageHeader`, `Field`, `EmptyState`, `pickerChip` | **Home for new primitives** |
| `components/*.tsx` | App shell and nav, popover, sheet, menu, toast, date, assignee and repeat pickers, avatar, status badge, segmented control, media uploader, grid and lightbox, activity timeline, confirm dialog, tooltip, global search, file uploads, inline heading edit, theme toggle, back link | Shared app pieces; new general-purpose components go here |
| `components/public/` | `PublicHeader`, `PublicFooter` | Public site only |
| `app/(app)/financials/_components/ui.tsx` | `Kpi`, `MoneyBars`, `SourceBadge`, `PartialLabel`, `fmtCents` | Money figures; move a piece to `components/` before reusing it outside Financials |
| `lib/utils.ts`, `lib/dates.ts`, `lib/money.ts`, `lib/normalize.ts` | Formatting and parsing | All display formatting |

Two surfaces: the app (`app/(app)`) and the contractor portal (`app/(portal)`) use the tokens in `app/globals.css` and the primitives above. The public site (`app/(marketing)`) is hand-styled on fixed hex colors and shares nothing with `ui.tsx` today.

## Overlays

| Job | Use | Notes |
|---|---|---|
| Dialog with a form, or a picker on touch | `components/sheet.tsx` `Sheet`, `SheetTrigger` | React Aria Modal: bottom sheet below `md`, centered dialog from `md`. Esc closes one layer, focus trap, scroll lock, focus returns to the trigger. `title` names it; children may be `({ close }) => …` |
| Confirm (destructive, or "discard changes?") | `components/confirm-dialog.tsx` `ConfirmDialog` | Backdrop click closes. `body` is optional when the title is the whole question. No Esc, focus trap or portal yet; rebuild on `Sheet` (Known gaps) |
| Ask before an in-app link leaves work behind | `components/leave-guard.tsx` `LeaveGuard`, `useHoldLeave`, `useLeaveGuard` | Wrap the page in `LeaveGuard`; whatever knows calls `useHoldLeave({ title, stay })` while it matters. `BackLink` inside, or any link that leaves through `useLeaveGuard()`, then asks in a `Sheet` with just the title: "Leave anyway" and `stay` as the main button. Closes by itself, and stays, once the hold lifts. The contractor job page holds it while photos upload. Reloads and closed tabs are `useLeaveWarning`'s; browser Back isn't caught |
| Photo and video viewer | `components/lightbox.tsx` `Lightbox` | Black stage, "3 / 11", arrows, arrow keys and swipe, Download, who added it and when. Videos play inline. `onDelete` (staff) adds Delete, confirmed in a `Sheet` on top. `MediaGrid` opens it |
| Mobile nav drawer | `components/app-shell.tsx` `AppShell` | Built into the shell below `lg`; Esc closes |
| Popover with a mouse, Sheet on touch | `components/use-coarse-pointer.ts` `useCoarsePointer` | Same test as Tailwind's `pointer-coarse:`. False until hydrated |

## Menus, popovers and tooltips

| Job | Use | Notes |
|---|---|---|
| Popover (anything floating that isn't a menu) | `components/popover.tsx` `Popover`, `PopoverTrigger` | React Aria Popover holding a Dialog: flips at the edge, outside click and Esc close, sized to content. `PopoverSurface` is the bare surface for list boxes. Triggers must be React Aria pressables: a `react-aria-components` `Button`, or wrap our `Button` in `Pressable` |
| Action menu (⋯) | `components/menu.tsx` `Menu`, `MenuItem`, `MenuSeparator`, `MenuTrigger` | Arrow keys and typeahead. `variant="destructive"` for Delete; `icon` takes a lucide element. 44px rows on touch |
| Tooltip | `components/tooltip.tsx` `Tooltip` | Fixed position, so it escapes table and card clipping. Hover only (Known gaps) |
| Checklist popover for a multi-pick filter | `app/(app)/deals/status-multiselect.tsx` `StatusMultiSelect` | Built on `Popover`: stays on screen, outside click and Esc close. Deals only; move to `components/` before a second use |
| Search with a results dropdown | `components/global-search.tsx` `GlobalSearch` | Combobox over `/api/search` (`lib/search.ts`: every word must match, in any order, "Avenue" finds "Ave."). Arrows move the highlight, Enter opens it, Esc closes the list and then clears the text; outside click closes. Below `sm` the results span the header between the page gutters |
| Pick one from a list in a form | `components/ui.tsx` `Select` | Native `<select>` |

## Forms

| Job | Use | Notes |
|---|---|---|
| Text field | `components/ui.tsx` `Input` | 14px text with a mouse; every field gets 16px on touch screens (`app/globals.css`) so iOS doesn't zoom on focus. At least 44px tall on touch |
| Password with show and hide | `app/login/_components/password-field.tsx` `PasswordField` | Sign-in screens only (public palette): /login, the reset link, the contractor's first password. Eye button inside the field's right edge, 44px at every width, `aria-pressed`. Shown as text it still doesn't capitalize or autocorrect |
| Multi-line text | `components/ui.tsx` `Textarea` | |
| Select | `components/ui.tsx` `Select` | |
| Button | `components/ui.tsx` `Button` (primary, secondary, ghost, danger; sm, md) | `LinkButton` for navigation styled as a button; `buttonClass()` for a plain `<a>` (an `sms:` or `mailto:` link). `Button`, `LinkButton`, `Input`, `Select` and `Textarea` are at least 44px tall on touch (`pointer-coarse:min-h-11`); a mouse keeps the compact sizes |
| Pending action | `useTransition`, a disabled `Button` and a label swap ("Saving…") | See `app/(app)/settings/move-in-form/move-in-form-editor.tsx`, `financials/_components/refresh-button.tsx`. The sign-in screens use `app/login/_components/auth-submit.tsx` `AuthSubmit` (`useFormStatus`; `native` for a form that posts to a URL) |
| Section with view and edit modes | `components/ui.tsx` `SectionCard` | Edit link shows on hover with a mouse, always on touch screens (`pointer-coarse:`); `actions` slot holds Cancel and Save |
| Edit a heading in place | `components/inline-address-field.tsx` `InlineAddressField` | Commits on blur or Enter, reverts on Esc. The base for any inline text edit: `label` names it, `minLength` reverts anything shorter, `multiline` lets a long heading wrap (the task title), `heading` shows it as the page's h1 until a click or tap swaps in the field (the property address). Only a real edit saves (`lib/inline-edit.ts`), so focus and blur never rewrite a stored value |
| Save on blur, cancel on Esc | `components/use-inline-edit-keys.ts` `useInlineEditKeys` | Enter saves, Esc reverts without saving. `InlineAddressField` (so the task title too), the deal page fields and the CapEx rules editor use it; use it for any field that saves on blur |
| File upload with drag and drop | `components/attachments.tsx` `Attachments` | Documents. Private Vercel Blob uploads; `kind` picks task or property |
| Task photos and videos upload | `components/media-uploader.tsx` `MediaUploader`, `useMediaUploader`, `MediaUploadTray` | "Take photo or video" (camera, touch only by default) and "Choose files", which offers what `allowed` lets in (documents too with `"file"`). Checks type and size first, 3 at a time, multipart over 8 MB (`usesMultipart`; each 8 MB part retried on its own, one multipart file at a time), 56px tiles with progress ring, Retry and Remove, and one red line that leads with the count ("2 photos didn't upload: no connection"). `pending` and `failed` (red tiles not yet retried or removed) hold "Mark done"; `isGoingUp(upload)` is what `pending` counts; `onRecorded(ids)` when the queue drains. `useLeaveWarning(active)` is the browser's leave prompt the uploader raises while files go up; reuse it for anything else a reload would lose |
| Due date | `components/due-date-picker.tsx` `DueDatePicker` | Date chip with `dueLabel()`, red when `overdue`. Quick picks (Today, Tomorrow, Monday, Next week, No date; keys 1 to 5) over a calendar. Popover with a mouse, Sheet on touch. `"YYYY-MM-DD"` or null. `prefix` puts a word before the date where no label sits beside the chip ("Visit Thu") |
| Repeats | `components/repeat-picker.tsx` `RepeatPicker` | Chip with the rule ("Every 2 weeks on Mon", full weekday in its label; cut off, never spilling, in a narrow column) that opens a small editor: Never, every N days, every N weeks, monthly on a day, quarterly, yearly. `defaultDay` and `defaultWeekday` come from the due date (or today): monthly starts on that day, weekly pins that weekday. Popover with a mouse, Sheet on touch. `RepeatRule` or null |
| Assignee | `components/assignee-picker.tsx` `AssigneePicker` | Unassigned, Team, Contractors (trade, "Has login"). Type to filter by name or trade. Popover with a mouse, Sheet on touch. Value `{userId}`, `{contactId}` or null |
| Picker trigger chip | `components/ui.tsx` `pickerChip` | Class string shared by the date and assignee chips; 44px hit area on touch without growing |
| Done checkbox | `app/(app)/tasks/task-checkbox.tsx` `TaskCheckbox` | Tasks only. 18px circle in a 44px hit area; the caller owns the state, so a tap shows at once |

## Feedback and empty states

| Job | Use | Notes |
|---|---|---|
| Empty list or page section | `components/ui.tsx` `EmptyState` | Dashed card. Inside a card that already frames the list, a muted one-line "No open tasks." is enough |
| Inline save error | A `text-xs text-red-600 dark:text-red-400` line under the section | Pattern in `properties/[id]/edit-units.tsx` and `edit-listings.tsx`; no component yet |
| Page crash | `app/(app)/error.tsx`, `app/(marketing)/error.tsx`, `app/login/error.tsx` | Route error boundaries. The sign-in screens (and the contractor's first-password page, `app/(portal)/p/welcome/error.tsx`) show `app/login/_components/auth-crash.tsx` `AuthCrash` in the sign-in frame, with the offline line when there's no signal |
| Not found | `app/not-found.tsx`, `app/(app)/not-found.tsx`, `app/(portal)/p/jobs/[id]/not-found.tsx` | The portal one is a job the contractor can't open: one line and "Back to my jobs" |
| Sent screen | Thank-you state in `app/(marketing)/residents/moving-in/move-in-form.tsx`; the contractor's Mark done payoff in `app/(portal)/p/jobs/[id]/_components/job-actions.tsx` | Warm heading, who it went to, the next step. Feature-only so far; move to `components/` on a third use |
| Toast, with Undo | `components/toast.tsx` `useToast`, `ToastProvider` | `toast({ message, action: { label: "Undo", onAction } })`. Bottom-left on a computer, full width on a phone; `useToastInset(px)` lifts it above a sticky bottom bar. About 5s, held on hover or focus. `role="status"`. `AppShell` mounts the provider; the portal layout mounts its own |

## Navigation and tabs

| Job | Use | Notes |
|---|---|---|
| App sidebar | `components/nav.tsx` `SideNav` inside `components/app-shell.tsx` `AppShell` | Pinned state lives in a cookie (`lib/sidebar.ts`) |
| Keep a tab left open current | `components/refresh-on-return.tsx` `RefreshOnReturn` | Mounted once in `app/(app)/layout.tsx`. Refreshes the page's server data when someone comes back: shown again after a minute hidden, back online, restored by Safari, or a new Eastern day. No polling. Holds off while offline, while a field is focused or holds unsaved typing, and on pages with controlled drafts: the property page, the move-in form editor and applying a playbook (`lib/refresh-on-return.ts`) |
| Page sections that are separate routes | `components/nav.tsx` `TopTabs` | Underline tabs. Financials and Settings layouts |
| Views and filters inside a page | `components/segmented-control.tsx` `SegmentedControl` | Pill toggles with `aria-pressed`, styled from the attribute; one weight for both states. `sm` for filter bars (deals), `md` for a page's main switch (44px on touch). `count` shows dimmed after a label |
| Back to the list | `components/back-link.tsx` `BackLink` | Returns to the exact previous page, filters and scroll intact, when it can. `className` sizes it, e.g. the 44px "My jobs" link in the portal header. Inside a `LeaveGuard` it asks first while the page is held |
| Page title row | `components/ui.tsx` `PageHeader` | Title, subtitle, actions slot |
| Public site header and footer | `components/public/header.tsx` `PublicHeader`, `footer.tsx` `PublicFooter` | |
| Light and dark switch | `components/theme-toggle.tsx` `ThemeToggle` | App only. `THEME_SCRIPT` sets the theme before paint |

## Data display

| Job | Use | Notes |
|---|---|---|
| Table | `components/ui.tsx` `Table`, `Th`, `Td` | Scrolls inside its own box; sticky header row |
| Sortable column header | `app/(app)/deals/sort-header.tsx` `SortHeader` | Ascending, descending, clear; state in the URL |
| Resizable columns | `app/(app)/deals/column-widths.tsx` | Widths remembered per browser |
| Label and value | `components/ui.tsx` `Field` | `dt` and `dd`; shows "—" when empty |
| Status chip | `components/ui.tsx` `Badge` | Tones gray, blue, green, amber, red, purple. Each status keeps one tone |
| Task status chip | `components/status-badge.tsx` `StatusBadge`, `STATUS_TONE` | To do gray, Scheduled blue, In progress purple, Waiting amber, Review red, Done green, Canceled gray struck through. Labels from `STATUS_LABEL` |
| Person | `components/avatar.tsx` `Avatar` | Initials from the name or the email's local part. Sizes 20, 24, 32. Stone neutrals, never a status tone; `outline` for contractors |
| Task photos and videos | `components/media-grid.tsx` `MediaGrid` | Square tiles: 3 columns on a phone, 6 of 88px from `sm`, two rows until "Show all". `?v=thumb` when there's a thumbnail; videos show poster, play mark and length. `internal` items get a small lock (staff only). Opens `Lightbox`; `onDelete` passes through |
| Timeline | `components/activity-timeline.tsx` `ActivityTimeline`, `ActivityItem`, `ActivityDay` | Hairline down the left, one dot per entry: primary for what a person wrote, muted for a recorded change. `ActivityDay` heads a day. The deal page and the task page's Activity |
| Card | `components/ui.tsx` `Card` with `CardHeader`, `CardTitle`, `CardBody` | |
| Money figure | `app/(app)/financials/_components/ui.tsx` `Kpi` | Takes cents; red when negative; partial-year label |
| Horizontal bars | `app/(app)/financials/_components/ui.tsx` `MoneyBars` | Same idiom as `app/(app)/portfolio-capex.tsx` |
| Data source and freshness | `app/(app)/financials/_components/ui.tsx` `SourceBadge` | QuickBooks basis and last sync |
| Listing photos | `app/(marketing)/rentals/photo-carousel.tsx` `PhotoCarousel` | Public site |

## Icons

| Job | Use | Notes |
|---|---|---|
| Any icon | `lucide-react` | At its default stroke width, sized with `h-4 w-4` (or the parent's `[&_svg]` size). Single-color line style matches the house look; use it for new icons |
| Existing icons | Inline `<svg aria-hidden="true">` | 26 hand-drawn across 12 files. Swap for `lucide-react` as you touch them |

## Formatting helpers

| Job | Use | Notes |
|---|---|---|
| Class names | `lib/utils.ts` `cn` | clsx plus tailwind-merge |
| Money in dollars | `lib/utils.ts` `fmtMoney` | `compact` option; "—" when empty |
| Money in cents | `app/(app)/financials/_components/ui.tsx` `fmtCents` | Wraps `fmtMoney` |
| Parse a money input | `lib/money.ts` `parseAmount`, `amountToDecimal` | |
| Calendar date (due, maturity, renewal) | `lib/dates.ts` `fmtDay` | Never shifts by timezone |
| Instant (created, updated, synced) | `lib/utils.ts` `fmtDate`, `fmtDateTime` | `fmtDateTime` shows Buffalo time wherever it renders |
| Relative day and due label | `lib/dates.ts` `relativeDays`, `dueLabel`, `daysUntil`, `isPastDay` | |
| Initials | `lib/utils.ts` `initials` | Falls back to the email's local part: `initials(null, "zack.smith@x.com")` is "ZS" |
| Date quick picks | `lib/quick-dates.ts` `quickPicks`, `addDaysYmd`, `mondayPick` | Calendar dates only. Monday is the next Monday; a week out on a Monday, 8 days out on a Sunday so it never repeats Tomorrow |
| Video length | `lib/attachments/media.ts` `fmtDuration` | "0:42", "1:02:03" |
| Task file URL | `lib/attachments/media.ts` `taskFileUrl` | `/api/files/task/<id>`, with `?v=thumb` or `?v=poster` |
| File size | `lib/utils.ts` `formatBytes` | |
| Address | `lib/normalize.ts` `shortAddress`, `normalizeAddress` | |
| Same building typed two ways | `lib/normalize.ts` `sameStreetAddress`, `streetKey` | House number, direction and street name; two different street types, ZIPs or (without two ZIPs) towns never match. The deal duplicate check |

## Duplicates

Use the pick; folding a copy into it is welcome when you're already in that file.

| Job | Copies today | Use |
|---|---|---|
| Confirm dialog | `ConfirmDialog`, plus inline copies in `app/(app)/properties/[id]/edit-units.tsx` and `edit-listings.tsx` | `ConfirmDialog` |
| Segmented control | `BasisToggle` in `app/(app)/financials/settings/controls.tsx` (fills with the primary color) | `components/segmented-control.tsx` `SegmentedControl` (deals and tasks already use it) |
| Inline text edit | `InlineAddressField` (the task title uses it now), plus hand-rolled edits in `deals/[id]/deal-detail.tsx` (2) and `settings/capex-rules-editor.tsx` (2), all on `useInlineEditKeys` | `InlineAddressField`, generalized to any text |
| Outside-click popover | `GlobalSearch` wires its own `mousedown` listener | `components/popover.tsx` `Popover` |
| Money formatting | `fmtMoney`, plus a raw `toLocaleString` in `(marketing)/rentals/page.tsx` | `fmtMoney` |
| Age in years | `fmtAge` in `properties/[id]/capex-outlook.tsx`, `building-capex.tsx` and `edit-units.tsx`; `fmtYrs` in `settings/capex-rules-editor.tsx` | Move one into `lib/` |
| Button | `Button` in 20 files; about 50 raw `<button>`s, many icon or link style | `Button`; add a variant before hand-rolling |
| Text field | `Input`, `Select`, `Textarea` in 9 files; about 60 raw fields (filter bars at `h-8 text-xs`, inline edits, public forms) | `Input` and friends; add a small size for filter bars |
| Section card with an Edit link | `SectionCard`, plus hand-rolled headers in `app/(app)/properties/[id]/edit-units.tsx`, `edit-listings.tsx` and `building-capex.tsx` (same `pointer-coarse:` reveal for Edit) | `SectionCard` |

## Known gaps

Jobs nothing covers yet, and holes in the picks. The first feature that needs one does the Mobbin research, builds it in `src/components/`, and adds a row above.

- **ConfirmDialog.** Still has no Esc, focus trap, portal or scroll lock. Rebuild it on `Sheet` instead of adding a third inline copy.
- **Form field layout.** No shared label, helper text and error wrapper.
- **Tap targets.** The primitives are 44px on touch now. Raw `<button>`s and fields outside `ui.tsx` (filter bars at `h-8`, text links in tables) still warn; move them onto the primitives.
- **Wrapped control rows.** The device check warns that rows of controls wrap on `/deals`, `/login`, `/rentals`, `/residents`, `/residents/moving-in`, `/settings/move-in-form` and `/welcome`. CLAUDE.md says they shouldn't; shorten labels or collapse into a Filters button.
- **Tooltip on touch.** `Tooltip` opens on hover only, so touch users never see it. Give it a tap path.
- **Old popovers.** `GlobalSearch` predates `Popover` and wires its own outside click; move it onto it when touched.
- **Inline text edit.** Exists only as feature copies (Duplicates). Extract on the next touch.
- **Spot art for payoff moments.** None yet; see Personality in CLAUDE.md.
- **Public site kit.** Public pages hand-style buttons and fields on fixed hex colors; there's no shared public primitive.
- **Loading state.** No spinner or skeleton. Pending actions dim or relabel.
