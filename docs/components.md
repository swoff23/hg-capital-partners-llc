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
| `components/ui.tsx` | `Card` (with `CardHeader`, `CardTitle`, `CardBody`), `SectionCard`, `Button`, `LinkButton`, `Badge`, `Input`, `Textarea`, `Select`, `Table`, `Th`, `Td`, `PageHeader`, `Field`, `EmptyState` | **Home for new primitives** |
| `components/*.tsx` | App shell and nav, confirm dialog, tooltip, global search, file uploads, inline heading edit, theme toggle, back link | Shared app pieces; new general-purpose components go here |
| `components/public/` | `PublicHeader`, `PublicFooter` | Public site only |
| `app/(app)/financials/_components/ui.tsx` | `Kpi`, `MoneyBars`, `SourceBadge`, `PartialLabel`, `fmtCents` | Money figures; move a piece to `components/` before reusing it outside Financials |
| `lib/utils.ts`, `lib/dates.ts`, `lib/money.ts`, `lib/normalize.ts` | Formatting and parsing | All display formatting |

Two surfaces: the app (`app/(app)`) uses the tokens in `app/globals.css` and the primitives above. The public site (`app/(marketing)`) is hand-styled on fixed hex colors and shares nothing with `ui.tsx` today.

## Overlays

| Job | Use | Notes |
|---|---|---|
| Confirm (destructive, or "discard changes?") | `components/confirm-dialog.tsx` `ConfirmDialog` | Backdrop click closes. No Esc, focus trap or portal yet (Known gaps) |
| Mobile nav drawer | `components/app-shell.tsx` `AppShell` | Built into the shell below `lg`; Esc closes |
| Dialog with a form | Nothing yet | Known gaps |

## Menus, popovers and tooltips

| Job | Use | Notes |
|---|---|---|
| Tooltip | `components/tooltip.tsx` `Tooltip` | Fixed position, so it escapes table and card clipping. Hover only (Known gaps) |
| Checklist popover for a multi-pick filter | `app/(app)/deals/status-multiselect.tsx` `StatusMultiSelect` | Outside click closes; no Esc. Move to `components/` before a second use |
| Search with a results dropdown | `components/global-search.tsx` `GlobalSearch` | Queries `/api/search`; outside click closes |
| Pick one from a list in a form | `components/ui.tsx` `Select` | Native `<select>` |

## Forms

| Job | Use | Notes |
|---|---|---|
| Text field | `components/ui.tsx` `Input` | 14px text, so iOS zooms on focus (Known gaps) |
| Multi-line text | `components/ui.tsx` `Textarea` | |
| Select | `components/ui.tsx` `Select` | |
| Button | `components/ui.tsx` `Button` (primary, secondary, ghost, danger; sm, md) | `LinkButton` for navigation styled as a button |
| Pending action | `useTransition`, a disabled `Button` and a label swap ("Saving…") | See `app/(app)/settings/move-in-form/move-in-form-editor.tsx`, `financials/_components/refresh-button.tsx` |
| Section with view and edit modes | `components/ui.tsx` `SectionCard` | Edit link shows on hover, always on phones; `actions` slot holds Cancel and Save |
| Edit a heading in place | `components/inline-address-field.tsx` `InlineAddressField` | Commits on blur or Enter, reverts on Esc. The base for any inline text edit |
| File upload with drag and drop | `components/attachments.tsx` `Attachments` | Private Vercel Blob uploads; `kind` picks task or property |
| Done checkbox | `app/(app)/tasks/task-checkbox.tsx` `TaskCheckbox` | Tasks only |

## Feedback and empty states

| Job | Use | Notes |
|---|---|---|
| Empty list or page section | `components/ui.tsx` `EmptyState` | Dashed card. Inside a card that already frames the list, a muted one-line "No open tasks." is enough |
| Inline save error | A `text-xs text-red-600 dark:text-red-400` line under the section | Pattern in `properties/[id]/edit-units.tsx` and `edit-listings.tsx`; no component yet |
| Page crash | `app/(app)/error.tsx`, `app/(marketing)/error.tsx` | Route error boundaries |
| Not found | `app/not-found.tsx`, `app/(app)/not-found.tsx` | |
| Sent screen | Thank-you state in `app/(marketing)/residents/moving-in/move-in-form.tsx` | The only payoff moment today |
| Toast | Nothing yet | Known gaps |

## Navigation and tabs

| Job | Use | Notes |
|---|---|---|
| App sidebar | `components/nav.tsx` `SideNav` inside `components/app-shell.tsx` `AppShell` | Pinned state lives in a cookie (`lib/sidebar.ts`) |
| Page sections that are separate routes | `components/nav.tsx` `TopTabs` | Underline tabs. Financials and Settings layouts |
| Views and filters inside a page | Segmented control in `app/(app)/deals/filters.tsx` | The selected fill alone marks the pick. Copied elsewhere (Duplicates) |
| Back to the list | `components/back-link.tsx` `BackLink` | Returns to the exact previous page, filters and scroll intact, when it can |
| Page title row | `components/ui.tsx` `PageHeader` | Title, subtitle, actions slot |
| Public site header and footer | `components/public/header.tsx` `PublicHeader`, `footer.tsx` `PublicFooter` | |
| Light and dark switch | `components/theme-toggle.tsx` `ThemeToggle` | App only. `THEME_SCRIPT` sets the theme before paint |

## Data display

| Job | Use | Notes |
|---|---|---|
| Table | `components/ui.tsx` `Table`, `Th`, `Td` | Scrolls inside its own box; sticky header row |
| Sortable column header | `app/(app)/deals/sort-header.tsx` `SortHeader` | Ascending, descending, clear; state in the URL. Copied in tasks (Duplicates) |
| Resizable columns | `app/(app)/deals/column-widths.tsx` | Widths remembered per browser |
| Label and value | `components/ui.tsx` `Field` | `dt` and `dd`; shows "—" when empty |
| Status chip | `components/ui.tsx` `Badge` | Tones gray, blue, green, amber, red, purple. Each status keeps one tone |
| Card | `components/ui.tsx` `Card` with `CardHeader`, `CardTitle`, `CardBody` | |
| Money figure | `app/(app)/financials/_components/ui.tsx` `Kpi` | Takes cents; red when negative; partial-year label |
| Horizontal bars | `app/(app)/financials/_components/ui.tsx` `MoneyBars` | Same idiom as `app/(app)/portfolio-capex.tsx` |
| Data source and freshness | `app/(app)/financials/_components/ui.tsx` `SourceBadge` | QuickBooks basis and last sync |
| Listing photos | `app/(marketing)/rentals/photo-carousel.tsx` `PhotoCarousel` | Public site |

## Icons

| Job | Use | Notes |
|---|---|---|
| Any icon | `lucide-react` | Installed but not used yet. Its single-color line style matches the house look; use it for new icons |
| Existing icons | Inline `<svg aria-hidden="true">` | 26 hand-drawn across 12 files. Swap for `lucide-react` as you touch them |

## Formatting helpers

| Job | Use | Notes |
|---|---|---|
| Class names | `lib/utils.ts` `cn` | clsx plus tailwind-merge |
| Money in dollars | `lib/utils.ts` `fmtMoney` | `compact` option; "—" when empty |
| Money in cents | `app/(app)/financials/_components/ui.tsx` `fmtCents` | Wraps `fmtMoney` |
| Parse a money input | `lib/money.ts` `parseAmount`, `amountToDecimal` | |
| Calendar date (due, maturity, renewal) | `lib/dates.ts` `fmtDay` | Never shifts by timezone |
| Instant (created, updated, synced) | `lib/utils.ts` `fmtDate`, `fmtDateTime` | |
| Relative day and due label | `lib/dates.ts` `relativeDays`, `dueLabel`, `daysUntil`, `isPastDay` | |
| Initials | `lib/utils.ts` `initials` | |
| File size | `lib/utils.ts` `formatBytes` | |
| Address | `lib/normalize.ts` `shortAddress`, `normalizeAddress` | |

## Duplicates

Use the pick; folding a copy into it is welcome when you're already in that file.

| Job | Copies today | Use |
|---|---|---|
| Confirm dialog | `ConfirmDialog`, plus inline copies in `app/(app)/properties/[id]/edit-units.tsx` and `edit-listings.tsx` | `ConfirmDialog` |
| Segmented control | `app/(app)/deals/filters.tsx`, `app/(app)/tasks/filters.tsx`, and `BasisToggle` in `app/(app)/financials/settings/controls.tsx` (fills with the primary color) | The `deals/filters.tsx` one, extracted to `components/` as `SegmentedControl` |
| Sortable header | `app/(app)/deals/sort-header.tsx`, `app/(app)/tasks/sort-header.tsx` | The deals one, with the field type as a generic |
| Inline text edit | `InlineAddressField`, plus hand-rolled edits with their own Esc handling in `tasks/task-row.tsx`, `tasks/[id]/task-detail.tsx`, `deals/[id]/deal-detail.tsx` (2) and `settings/capex-rules-editor.tsx` (2) | `InlineAddressField`, generalized to any text |
| Outside-click popover | `StatusMultiSelect` and `GlobalSearch` each wire their own `mousedown` listener | A shared popover hook (Known gaps) |
| Money formatting | `fmtMoney`, plus `priceDisplay` in `deals/deal-row.tsx` and a raw `toLocaleString` in `(marketing)/rentals/page.tsx` | `fmtMoney` |
| Age in years | `fmtAge` in `properties/[id]/capex-outlook.tsx`, `building-capex.tsx` and `edit-units.tsx`; `fmtYrs` in `settings/capex-rules-editor.tsx` | Move one into `lib/` |
| Button | `Button` in 20 files; about 50 raw `<button>`s, many icon or link style | `Button`; add a variant before hand-rolling |
| Text field | `Input`, `Select`, `Textarea` in 9 files; about 60 raw fields (filter bars at `h-8 text-xs`, inline edits, public forms) | `Input` and friends; add a small size for filter bars |

## Known gaps

Jobs nothing covers yet, and holes in the picks. The first feature that needs one does the Mobbin research, builds it in `src/components/`, and adds a row above.

- **Dialog shell.** Nothing for a dialog with a form. `ConfirmDialog` has no Esc, focus trap, portal or scroll lock; grow it into a `Dialog` shell instead of adding a third inline copy.
- **Toast.** No toast or saved confirmation; saves only show inline errors.
- **Form field layout.** No shared label, helper text and error wrapper.
- **iOS input zoom.** `Input`, `Select` and `Textarea` use 14px text, so iOS Safari zooms the page on focus. Fix it in the primitives (16px on phones), not per field.
- **Tooltip on touch.** `Tooltip` opens on hover only, so touch users never see it. Give it a tap path.
- **Popover hook.** No shared open, outside-click and Esc logic, and neither current popover closes on Esc.
- **Segmented control, sortable header, inline text edit.** Exist only as feature copies (Duplicates). Extract on the next touch.
- **Spot art for payoff moments.** None yet; see Personality in CLAUDE.md.
- **Public site kit.** Public pages hand-style buttons and fields on fixed hex colors; there's no shared public primitive.
- **Loading state.** No spinner or skeleton. Pending actions dim or relabel.
