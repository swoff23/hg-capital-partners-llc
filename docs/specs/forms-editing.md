# Forms and editing

Spec for Connor's approval. Nothing here gets built until "build it" in chat.

- **Covers:** every form, in-place edit, picker and save path in the app, the contractor portal, sign-in and the public move-in report.
- **Leaves to the other specs:** comment composers and record history (activity and comments), photo and file pickers (uploads and photos), ⌘K and matching-record lookups (search), charts. Where one of those touches a form, this spec says so.
- **Read from:** HEAD `0677dd3` plus the working tree, Oct 25, 2026. Another session has uncommitted edits in `tasks/task-list-context.tsx`, `tasks/filters.tsx`, `tasks/list-actions.ts` and `tasks/page.tsx`. Re-read them before building the task pieces.
- **Visual system:** `docs/brand-guidelines.md` sections 2, 3, 5, 6 and 9. Nothing here adds a color, size or radius. The few rules the guidelines don't cover are marked **new** and listed together in section 5.
- **References checked Oct 25.** Mobbin blocks direct page loads, so a sample was confirmed through Mobbin search, which returns the screen itself: Stripe Create customer, Stripe coupon, Stripe create payment, Mercury's optional labels, one-field sheet, in-sheet steps and address sheet, Attio's rail and Create more, Linear's Create more, Linear Mobile's create sheet, PayPal, DoorDash and Quicken address suggestions, Front's merge conflict and Shopify's save bar. Links that didn't surface were swapped for ones that did, or come from the review finding they answer.

## 1. Summary

**Today**

- Five save behaviors, each with its own way to cancel, confirm and fail: whole-card edit modes (property sections), save on blur (deal fields, CapEx cells), save on pick (task chips), one page-level Save (move-in form editor) and full-page creates.
- A refused or offline save still swaps the page for the error card on every deal field, the deal address and note, New task, the CapEx rules, the move-in form editor and storage migrate. What was typed is lost.
- Validation is browser bubbles, developer text ("Invalid address: Too small: expected string to have >=4 characters") and silent snap-backs. Errors land under the whole form or at the top of the page, never on the field.
- On a phone, Save sits at the top of forms up to 2,000px long. Nothing guards typed work except photo uploads, so a reload loses all 46 answers of a move-in report.
- Two field vocabularies in one product (11 native date fields and native selects beside the chip pickers), four "quiet field" recipes, three label wrappers, and asterisks inside accessible names.
- Every New is a full page that drops you on the new record, and Back returns to a blank form.
- Saves rarely confirm. A conflict says "Reload the page" without naming who, what or when.

**What replaces it**

One rule: **facts save themselves, items submit, configuration saves as a draft.**

| Save model | Used for | Commit | Back out | Confirmation |
|---|---|---|---|---|
| **Fact** (`InlineField`) | One stored value: property, deal, task and contractor facts, record titles | Enter, Tab, blur with a mouse, a pick, or Save in the one-field sheet on touch | Esc reverts that one field | Toast naming the change and its ripple, with Undo |
| **Item** (`FormSheet`) | Making or editing one multi-field thing: New task, deal, property, contractor; a unit, a listing, a building system; a login; the question sheets | The primary, or ⌘↵ | Cancel, Esc or X; asks only when something changed | Toast with Open, or the new record itself |
| **Draft** (`ActionBar`) | Whole-table configuration and long forms: CapEx rules, the move-in form editor, Apply playbook, the public move-in report | Save, or Next and Send on steps | Discard, which asks | Toast naming the effect, or the sent screen |

Under all three sit one field kit (`FormField`, `NumberInput`, `DateField`, `OptionPicker`, `AddressCombobox`), one save pipeline (`withResult` and `callAction` everywhere, errors on the field that caused them, conflicts that name who and when) and one way to keep unsaved work (`LeaveGuard` in every layout, `useDraft` for reloads and back swipes).

Section 3 has five design choices for Connor to pick.

## 2. The components

Each entry names the file it builds on. Sizes are laptop 1280, tablet 768 (the touch layout, `pointer: coarse`), and phone 375 and 320.

### 2.0 Field kit rules (every form, every save model)

- **Labels.** Above the field in `text-meta` 500 `--fg-2`, sentence case, 6px gap (section 9). In a rail, the 112px label column (96 on phones) in `text-meta` `--fg-3`, as `RailFact` draws it today. One label per fact in every state, so "Rate" never turns into "Rate %" (COPY-045). Units live inside the field as a suffix.
- **Required and optional.** Required fields carry nothing visible and set `aria-required`. Optional fields carry "(optional)" after the label in `text-meta` 400 `--fg-3` (**new**). When a whole group is optional, its heading says it once ("Contact (optional)"). Record facts are mostly optional, so a rail marks nothing. No asterisks (COPY-I08).
- **Helper.** At most one `text-meta` `--fg-3` line under the field, saying who sees it or what happens ("Shown on the public listing", "Adds a reminder 60 days before"). An example goes here, never in a placeholder that looks like a saved value (COPY-V10, COPY-067). It never wraps: in a form it runs the field's width; in a rail it runs the whole row from the label's edge (about 296px at 1280, 288 at 320), not the 196px value column, and its copy is written to fit that.
- **Errors.** The `--danger` edge and focused inset ring plus one `text-meta` `--danger` line that replaces the helper in the same spot (section 9), wired with `aria-invalid` and `aria-describedby`. A refusal that belongs to no field (no signal, a server error) is one `--danger` line directly above the primary, `role="alert"`. Never at the top of the page, never under the whole form.
- **Timing** (Stripe, Material). Every form is `noValidate`, so browsers never show bubbles (FEEL-022). Nothing is red before the first attempt (BPLAY-011). A format error shows when you leave a field that holds text. Required errors show on submit; focus moves to the first bad field and scrolls it to the middle of the view. Once an error shows, the field re-checks as you type and clears the moment it's right. Nothing snaps back silently (ADMIN-008).
- **The primary stays enabled.** Pressing it with a problem shows the problem. It's disabled only while pending, or when the action can't happen at all, and then a one-line reason sits under it (section 9).
- **Pending.** The primary keeps its label, disables, sets `aria-busy` and shows a spinner after 200ms for at least 400ms (section 7). A second press does nothing (FEEL-005).
- **Error copy.** Say what to enter, with an example where the format matters: "Enter the address." "Enter the full street address, like 123 Main St." "Enter an amount, like 425,000." "Enter a rate, like 6.875." "Enter a year, like 2014." "Enter a link that starts with https://." "Enter at least 2 characters."
- **Spacing.** 16px between fields, 24px between groups. A group is a `Section as="h3"` (heading over a `--line` rule), so forms need no new heading style. One column below `sm`. Two fields share a row from `sm` only when their values are short and related and both labels fit on one line (City and ZIP, the two deal prices, Beds and Baths). Never at 375 or 320.
- **Deal price names** wait on question 2 in section 6. "Asking price" and "Max offer" stand in for them below.

### 2.1 Field primitives: `Input`, `Textarea`, `Select`

- **Extends:** `src/components/ui.tsx` (`Input`, `Textarea`, `Select`, `fieldClass`).
- **Size.** `sm` 32px or `md` 36px (the default), at least 44px on touch through `TOUCH_HEIGHT`. It replaces the `cn(fieldClass, "h-8")` copies in units, listings, Building CapEx, the pass reason and the financials mapping.
- **Prefix and suffix** (**new**). Short text inside the field edge in `text-body` `--fg-3`, 10px in ("$", "%", "sq ft", "/mo", "yrs"); the input's padding grows to clear it. The slot is `aria-hidden` and the unit is spoken through `aria-describedby`.
- **`Textarea` `autosize`.** The `field-sizing: content` rule plus the fallback effect `InlineAddressField` already has, moved into a shared `useAutosize`.
- **States.** Rest, focus (`--act` edge and 1px inset ring), invalid, disabled at 50%. Fields have no hover state; section 9 doesn't define one.
- **Keyboard and touch.** Native. 16px text on touch from the existing iOS guard. Each kind sets `inputMode`, `enterKeyHint` and `autoComplete` (2.3).
- **Native `Select`.** Kept for one release while forms move to `OptionPicker` (2.5), then deleted along with `selectTouchHeight`.
- **Codes in fields** (lockbox, account, loan and policy numbers) use Geist Mono at the field's `text-body` size, so iOS doesn't zoom. The utilities grid does this today; the guidelines don't say it (**new** as a written rule).
- **Tokens:** `--surface`, `--line-control`, `--act`, `--danger`, `--fg-3`, `rounded-md`, `text-body`.
- **References:** [Stripe coupon: "%" inside the field's right edge, "Optional" beside its label](https://mobbin.com/screens/e8860e07-c107-43c1-b483-27724ff01d37), [Stripe: the currency inside the amount field](https://mobbin.com/screens/927777ee-2029-4c4a-bfa5-4628ee67cae5), [Mercury: "$" leading the amount over a number pad](https://mobbin.com/screens/e647f300-c3a6-4ae3-9e88-b17a10e13691), [Material 3 text fields](https://m3.material.io/components/text-fields/guidelines) (prefix and suffix inside the field, supporting text under it).

### 2.2 `FormField` and `FieldRow` (new)

- **Where:** `src/components/ui.tsx`, beside `Input`. Named `FormField` because `ui.tsx` already exports `Field`, the label-over-value display pair. It closes the "Form field layout" known gap in `docs/components.md`.
- **Anatomy.** The label row (label plus the optional marker), the control, then one line: the helper, or the error in its place. A render prop hands the control its `id`, `aria-describedby`, `aria-invalid` and `aria-required`, so it works the same for `Input`, `NumberInput`, `DateField`, `OptionPicker` and `AddressCombobox`:
  `<FormField label="Asking price" optional helper="…" error={errors.theirPrice}>{(p) => <NumberInput kind="money" {...p} />}</FormField>`
- **`FieldRow`.** The two-up grid from `sm` (`grid gap-4 sm:grid-cols-2`) for the pairs 2.0 allows. It retires the `items-end` workaround in `edit-details.tsx`, since paired labels must fit on one line.
- **States.** Plain, with helper, invalid, disabled.
- **Keyboard.** Clicking the label focuses the control.
- **Public surface.** The same component; the tokens draw it dark under `data-surface="public"` (sign-in, the move-in report).
- **Replaces:** `properties/labeled-field.tsx` `LabeledField`, the local `Label` in `deals/new/new-deal-form.tsx`, and the hand-rolled label spans in New task, `new-task-fields.tsx`, Apply, Portal access, the move-in form and the review banner.
- **References:** [shadcn/ui Form](https://ui.shadcn.com/docs/components/form) (label, control, description and message as one item), [Mercury: "(optional)" on the optional field only](https://mobbin.com/screens/f8c552c0-fede-4593-ab65-3a3fde0973a6), [Mercury: one helper line saying who sees it](https://mobbin.com/screens/f4c4eb0f-85d9-422a-b3ab-7ed3a177d375), [Felt: each empty required field gets its own line](https://mobbin.com/screens/67df3510-506f-4084-a147-7501b8135bc7), [Vercel: the error right under its field](https://mobbin.com/screens/0a227055-0e20-4ef1-a4cf-08bd5e0d9c58), [Claude: format error after leaving the field](https://mobbin.com/screens/6e3d049f-83d9-4d35-912e-3763c1030a49). Counterexample: [Exa's refusal banner under the button](https://mobbin.com/screens/f9a5f3c3-c765-4556-815f-4684959ab463).

### 2.3 `NumberInput` (new)

- **Where:** `src/components/number-input.tsx`, on `Input`. Parsing lives in `src/lib/money.ts` (`parseAmount`, `amountToDecimal`), so the browser and the server read "425k" the same way. Tests go in `money.test.ts`.

| Kind | Slot | Keyboard | Accepts | Error |
|---|---|---|---|---|
| `money` | "$" prefix | `inputMode="decimal"` | 425000, 425,000, $425k, 1.2m, 8k | "Enter an amount, like 425,000." |
| `percent` | "%" suffix | `decimal` | 6.875, 6.875% | "Enter a rate, like 6.875." |
| `integer` | optional suffix ("sq ft") | `numeric` | 1,200 | "Enter a whole number." |
| `year` | none | `numeric`, 4 digits | 1900 to next year | "Enter a year, like 2014." |
| `decimal` | none | `decimal` | 1, 1.5 (baths) | "Enter a number, like 1.5." |

- **Behavior.** Always `type="text"`, so no spinners and no browser rounding (VISUAL-035). While you type, the helper line shows how it will save whenever that differs from what's typed: "Saves as $425,000" (**new** behavior in the existing helper style, after Material's supporting text and Attio's in-place formatting). On blur in a form the text tidies to "425,000". The open field shows the exact stored value, cents included where the column has them (a loan payment). Outside an editor the value renders through `Money` in whole dollars (section 3).
- **Deal prices** take `allowText`: text that isn't one number ("low 400s") is kept, with the preview "Kept as text, no amount". That is today's `PriceInput` rule, now shown before saving (DEALS-041).
- **Align.** Left in forms; right with tabular figures in table cells, as `InlineNumber` does in the CapEx rules today.
- **References:** [Stripe](https://mobbin.com/screens/927777ee-2029-4c4a-bfa5-4628ee67cae5), [Fresha amount sheet](https://mobbin.com/screens/3893a31d-762f-49f5-9ee7-0a59915599aa), [Attio formats the money in place](https://mobbin.com/screens/380922eb-8c4a-4458-b44c-c4161d8088d5), [Grab Driver: numeric keypad, error under one field](https://mobbin.com/screens/66a0a53d-0c20-48a0-bbd2-8aee035ffeb1), [Apple HIG: match the keyboard to the content](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards).

### 2.4 `DateField` and the shared `DatePanel`

- **Extends:** `src/components/due-date-picker.tsx`. Its quick picks and `MonthCalendar` become one exported `DatePanel`. `DueDatePicker` keeps its chip and its API, plus an optional repeat value. `DateField` is the new trigger for forms and rails.
- **`DatePanel`.** Optional quick picks (task dates only), the month calendar (today a 1px inset `--line-control` ring, the pick the `--act` fill, 32px days, 44 on touch), and Clear (ghost `sm`) in its footer for record dates. The month heading is a button that switches to a 12-year grid, for jumps like a 2031 maturity (**new** interaction, after Material's year selection). It opens on the stored month, except that a task date in the past opens on today's month (BTASKS-012).
- **`DateField` with a mouse.** A field on `fieldClass` holding React Aria `DateInput` segments (mm / dd / yyyy, placeholders in `--fg-3`) and a 28px calendar button inside the right edge that opens the panel in a `Popover`. Typing is real entry; Enter or blur commits.
- **`DateField` on touch.** The field shows the formatted date ("Jun 1, 2031") or "Pick a date" in `--fg-3`, and a tap opens the panel in a `Sheet`. No typed segments on touch, where they're too small to hit.
- **Repeat moves inside Due** (G1C-010, approved). Due mode adds a Repeat row under the quick picks showing the rule ("Never", "Every month on the 5th"). It opens the repeat view inside the same popover or sheet, with a back arrow. As G1C-010 specifies, the view is presets read from the picked date, one 32px row each (44 on touch) with a trailing `Check` on the current one: Never, Every week on Thu, Every month on the 5th, Every 3 months on the 5th, Every year on Nov 5, and Custom. Custom shows the count and unit fields. Under the list, one `text-meta` `--fg-3` line gives the next three dates ("Next: Nov 5, Dec 5, Jan 5", BPLAY-019). With no date picked, the presets read from today. Counts use `NumberInput` `integer`, so an empty count says "Enter how many weeks." instead of saving NaN as "Every day" (BPLAY-030). Monthly, quarterly and yearly take a count ("Every 2 months", G1C-I01); `RepeatRule` already has `interval` (`lib/tasks/repeat.ts`), so this is the control plus a test that the next-date math honors it for months. The separate Repeats chip goes. At 320 the preset rows are full width in the sheet, so "Every 3 months on the 15th" fits on one line.
- **Cleanup in the same file.** The pre-brand classes go (`text-muted` to `text-fg-3`, `text-sm` to `text-body`, `text-xs` to `text-meta`, `border-border` to `border-line`, `text-foreground` to `text-fg-1`), which makes the quick-pick rows 16px on touch.
- **Dates are Eastern.** Defaults use `todayYmdEastern()`, never the browser's zone (the move-in date uses `todayYmd()` today).
- **References:** [Linear: a month calendar anchored to the field, today ringed](https://mobbin.com/screens/fb59ac32-54a6-4539-8a03-450addb61b6d), [Material 3 date pickers](https://m3.material.io/components/date-pickers/guidelines), [React Aria DatePicker](https://react-spectrum.adobe.com/react-aria/DatePicker.html), [shadcn/ui Date Picker](https://ui.shadcn.com/docs/components/date-picker), [Mercury: the helper under a date states its consequence ("Submit within 30 days")](https://mobbin.com/screens/ede3cc07-012f-4e55-a5c7-7cbe8b7f5907), [Todoist: repeat presets read from the picked date, inside the date picker](https://mobbin.com/screens/54032487-5423-42c4-a480-f8822504527c) (G1C-010's reference).

### 2.5 `OptionPicker` (new)

- **Where:** `src/components/option-picker.tsx`, on React Aria `Select`, or `ComboBox` when it's `searchable` (more than 8 options) or `allowCustom`. It replaces native selects in forms (VISUAL-035) and `tasks/[id]/select-chip.tsx` `SelectChip`.
- **Triggers.** `field`: `fieldClass`, the value in `text-body` `--fg-1`, a 16px `ChevronDown` in `--fg-3` at the right edge, the placeholder in `--fg-3`. `chip`: `pickerChip`, for rails and chip rows. `InlineField` opens the panel straight from a rail value.
- **Panel.** A `PopoverSurface` listbox with a mouse, at least the trigger's width and sized to its content up to 320px tall. A `Sheet` listbox on touch, titled with the label, with a search field on top when it's searchable. Options are 32px (44 on touch) in `text-body`; hover and keyboard focus are `--fill-2`; the current pick carries a trailing `Check` in `--fg-1` (section 9). Optional section headers in `text-meta` 500 `--fg-3`, optional second lines in `text-meta` `--fg-3`.
- **Inside a sheet on touch** the panel doesn't open a second sheet. It replaces the sheet's body as a pushed view, titled with the label, with a back arrow in the header beside the X; a pick returns to the form with the value filled (2.9).
- **`allowCustom`** adds a last row with `Plus` and 'Add "Prospect Holdings LLC"', for find-or-add lists: Entity (PORTFOLIO-021, drawn from the entities already on properties, no schema change).
- **`multiple`** keeps the panel open, shows a checkbox per row and the picks as Tags in the trigger, after `deals/status-multiselect.tsx` `StatusMultiSelect`, which moves to `components/` for this second use. Contractor trades use it with `allowCustom`, saved in today's "Plumbing / HVAC" text through `cleanTrades` (`lib/contacts.ts`), so no schema change. In a chip or rail value more than two picks read "Plumbing +2".
- **`clearable`** adds a first row, "None" in `--fg-3`, in place of today's lone dash option.
- **`renderValue`** draws the deal stage's `StatusMark` ring beside its label, so `deals/stage-select.tsx` `StageSelect` becomes an `OptionPicker` (its cell, `sm` and `md` sizes stay).
- **Keyboard.** Arrows, typeahead, Home and End; Enter picks; Esc closes one layer.
- **Public surface.** Its overlay root carries `data-surface="public"`, as section 4 requires for portaled layers.
- **Tradeoff.** Phones lose the native iOS wheel and get the same Sheet listbox every other picker already uses, with type-to-filter for long lists like Property.
- **375 and 320.** The sheet listbox runs full width; an option's second line truncates before it wraps. A `field` trigger truncates its value before the chevron.
- **References:** [Attio: type-to-filter listbox anchored to its row](https://mobbin.com/screens/8353ecb1-c4e5-4896-b1f6-6f8d1622876b), [Attio: several picks shown as tags in one value](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5), [Attio: searchable picker with two-line options](https://mobbin.com/screens/072188cc-ccb7-41d4-af44-c66842c7a9cb), [Linear: Check on the current pick](https://mobbin.com/screens/af9cc8d7-aea7-4a3a-9021-5edc74d80ad8), [React Aria Select](https://react-spectrum.adobe.com/react-aria/Select.html), [React Aria ComboBox](https://react-spectrum.adobe.com/react-aria/ComboBox.html), [shadcn/ui Combobox](https://ui.shadcn.com/docs/components/combobox).

### 2.6 `AddressCombobox` (new)

- **Where:** `src/components/address-combobox.tsx`, on `OptionPicker`'s `ComboBox` with `allowCustom` always on. Used by New property, New deal and both address headings.
- **Suggestions.** From 3 characters, after 200ms. **Phase 1** suggests from HG's own properties and deals, the same records the duplicate check reads (`sameStreetAddress` in `lib/normalize.ts`). **Phase 2** adds an address provider, which needs Connor's pick (section 6). Rows are two lines: the street in `text-body` `--fg-1` over "Buffalo, NY 14209 · Property" in `text-meta` `--fg-3`. The last row is always 'Use "12 Elm St" as typed', so an address no list knows still works ([Square's forced pick](https://mobbin.com/screens/93ba7bf7-faa4-4c51-878d-3a15cbea5c64) is the counterexample).
- **Duplicates while typing** (DEALS-038). When the text matches an existing record through `sameStreetAddress`, the helper line reads "767 Prospect Ave is already a property. Open it", with Open it as a `TextLink`. It stays neutral `--fg-3`, because nothing is wrong yet. Submitting anyway still refuses and keeps the typing (IA-003), and then the same line turns `--danger`.
- **Links** (DEALS-040, DEALS-039). A pasted URL says "That's a link. Paste it in Listing link." On New deal the link moves to Listing link by itself, and a Zillow link's address slug fills the address.
- **Normalization.** On blur, when the saved form would differ, the helper shows it: "Saves as 767 Prospect Ave, Buffalo, NY 14209" (`normalizeAddress`).
- **Autofill.** `autoComplete="off"` and a field name that isn't "address", so Chrome stops offering a personal address (PORTFOLIO-042). Check it in Chrome, which sometimes ignores `off`.
- **1280 and 768.** The list is a `PopoverSurface` at the field's width under it. **375 and 320.** In a create sheet the list opens under the field inside the sheet's body, which scrolls; rows truncate the street and the second line before they wrap. In a heading on touch the one-field sheet holds the field and the list.
- **References:** [PayPal: two-line suggestions, manual entry at the foot](https://mobbin.com/screens/f91d5478-7799-4f8e-b4ac-3be2b3b802f0), [Quicken, adding a real estate asset: 'Add "1226 University Dr…" manually'](https://mobbin.com/screens/6112b488-c8dc-4668-937e-c58bd6e3f9d5), [Mercury iOS: the typed text offered as "Enter address manually" in an address sheet](https://mobbin.com/screens/ff16882c-4dbc-4a2b-9372-7a315254f30a), [DoorDash: "Enter address manually"](https://mobbin.com/screens/f9007d6a-de3a-4257-bd68-3a0733f0e9f3), [Mercury: a similar record shown before you submit](https://mobbin.com/screens/0a5f6c3d-76a0-4f00-9b07-a6f97cc75a25).

### 2.7 `Button` pending, and `Switch` (new)

- **`Button` `pending`** (extends `ui.tsx` `Button`). Disabled, `aria-busy`, label kept. After 200ms a 16px lucide `LoaderCircle` appears before the label in the label's color and stays at least 400ms (section 7); under reduced motion it doesn't spin. It replaces every label swap ("Saving…", "Creating…", "Signing in…", "Submitting…"), and `login/_components/auth-submit.tsx` `AuthSubmit` renders it from `useFormStatus`. The glyph is **new**: section 7 asks for spinners without naming one.
- **`Switch`** (`src/components/switch.tsx`, React Aria `Switch`). Section 9's look exactly: a 32 by 18 track and a 12px knob; off is `--surface` with a `--line-control` edge and knob, on is an `--act` track with an `--on-act` knob. The knob slides in `--dur-fast`, not under reduced motion. Its label sits to its left in `text-body` `--fg-1`, with a 44px hit area on touch. Its first use is "Create more" in create sheets.
- **References:** [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines) (buttons keep their label while loading), [Linear: "Create more" beside "Create issue"](https://mobbin.com/screens/ffa2e456-85c7-4005-b361-de79dc6b6dc7), [Attio: "Create more" left of "Cancel Esc" and the primary](https://mobbin.com/screens/cf53b55b-c4a2-466c-a35a-c7c85fc7b09e), [Stripe: "Submit and create another"](https://mobbin.com/screens/d280c443-8062-4fa4-a9f8-170ab2f1ccc6), [React Aria Switch](https://react-spectrum.adobe.com/react-aria/Switch.html), [shadcn/ui Switch](https://ui.shadcn.com/docs/components/switch).

### 2.8 `InlineField` (generalizes `InlineAddressField`)

The one way to change a single saved value. It carries out the earlier yes on tap-to-edit per field (PROPERTY-016 in `docs/uiux-review/README.md`).

- **Extends:** `src/components/inline-address-field.tsx` becomes `src/components/inline-field.tsx` (`InlineAddressField` stays as a thin wrapper until its callers move), on the existing `use-inline-edit-keys.ts` and `lib/inline-edit.ts`. The rail pieces in `properties/[id]/record-ui.tsx` (`RailList`, `RailFact`, `RailVerb`, `AddRow`, `Count`) move to `src/components/rail.tsx`, because deals, tasks and contractors now use them too. `RailFact` takes an `InlineField` as its child.
- **Kinds.** `text`, `multiline`, `money`, `percent`, `integer`, `year`, `decimal`, `email`, `phone`, `url`, `date`, `choice`, `person`, and `heading` (the page's h1).
- **At rest.** The value is a button that reads as text: `text-body` `--fg-1`, money through `Money`, dates through `fmtDay`, codes through `Code` (see 3.2). Its accessible name is the label, the value and the verb ("Rate, 6.875%, edit"). An empty fact is a `RailVerb` ("Add lender"; `--warn` for a missing maturity or renewal, as `KeyDate` does today). With a mouse, hover gives the value cell a `--fill-1` fill and a text cursor, no pencil. The heading keeps its existing hover pencil.
- **Open with a mouse (1280).** Text-like kinds swap the value for the bordered field at `sm` inside the value column, and the row grows only for one line under it (preview, consequence or error), which runs the whole row from the label's edge so it never wraps (2.0). Text opens with the caret at the end; numbers open selected, so typing replaces them. `date`, `choice` and `person` open their panels in a `Popover` anchored to the row (`DatePanel`, `OptionPicker`, `AssigneePicker`).
- **Open on touch (768 and phones).** A one-field `Sheet` (2.9): the fact's label as the title, a context line ("Loan · 767 Prospect Ave") in `text-meta` `--fg-3`, the field at 44px with the keyboard its kind asks for, and Save. The title stands in for the visible label (`aria-labelledby` points at it). `date`, `choice` and `person` open their own sheets and save on pick.
- **Commit.** Enter (single line), Tab (commits and moves focus to the next value; Enter opens it), blur with a mouse, or a pick. `multiline` commits only on Save or ⌘↵, never on blur, so a stray click can't rewrite a tenant's move-in text (G2B-006). With a mouse an open `multiline` shows Cancel (secondary `sm`) and Save (primary `sm`, with `⌘↵`) right-aligned under the field; clicking away leaves it open with the draft, and a dirty one holds `LeaveGuard` (2.11). Only a real edit saves (`inlineEditCommit`), sent as `{ field: next }` with the loaded value as `expected`, the `patchProperty` contract G2B-003 built.
- **Esc** reverts that field, closes it and returns focus to the value. One Esc, one layer.
- **Saving.** The new value shows at once in `--fg-1` and crossfades in 120ms. Nothing dims (FEEL-027).
- **Refused, or no signal.** The field reopens with what was typed, the reason under it, and focus inside. At rest the row always shows the stored value. That fixes today's bug where a refused rename leaves the unsaved text in the heading (`inline-address-field.tsx` `commit()` never resets `v` when `onCommit` fails).
- **Too short.** "Enter at least 2 characters." instead of a silent revert (the task title).
- **Conflict** (adapted; none of the references found shows a save conflict on a single field, so the placement is **new**). The field stays open with your draft. Its line reads "Pieter set this to $410,000 at 2:14 PM" in `text-meta` `--fg-2`, neutral, since nothing you typed is wrong. A row of two `sm` buttons sits under it, left-aligned with the line: secondary "Keep Pieter's" and primary "Save mine" (G2B-007, G2B-008). Line and buttons fit the 296px row at 1280 (about 240px and 215px). On touch the same line and buttons sit in the one-field sheet, the buttons full width and stacked with the primary on top. When the record doesn't know who: "This changed to $410,000 at 2:14 PM" with "Keep current" and "Save mine" (section 6, question 3).
- **Saved.** A toast names the change and its ripple, with Undo for 5 seconds: "Rate set to 6.875%", "Lender cleared", "Maturity set to Jun 1, 2031 · Reminder task added" (FEEL-009, COPY-I04). Undo writes the old value back with the new one as `expected`. A run of edits on one record replaces its toast instead of stacking (2.13).
- **Key dates say what they do.** Maturity, renewal, tax due and registration expiry carry the helper "Adds a reminder 60 days before" (30 for renewal and registration, 21 for tax, the `leadDays` in `lib/properties/service.ts`).
- **1280.** The record rail is 320px, which leaves a value column of about 196px. **768.** Below `lg` the rail runs full width under the main column with 48px rows, and edits open the one-field dialog. **375 and 320.** 48px rows and the 96px label column leave about 180px of value at 320. Long text truncates in the row and shows in full in the sheet.
- **Drops on phone:** the hover fill, keycaps, and the relative-day suffix beside a key date ("in 214 days") when it would wrap.
- **Tokens:** `--fg-1`, `--fg-2`, `--fg-3`, `--warn`, `--fill-1`, `--line`, the field tokens, `text-body`, `text-meta`, and `text-title` for headings.
- **References:** [Attio: label-left rail, empty facts as "Set …"](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf), [Attio: one row swaps into a field](https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f), [Linear: each property its own picker, saved on pick](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338), [Linear: empty values as verbs](https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33), [Mercury iOS: one-field "Edit nickname" sheet with a context line and the button docked above the keyboard](https://mobbin.com/screens/f9663be0-06c0-48f7-9a94-26eaef8e1a7b), [Mercury: adding a note, start to toast](https://mobbin.com/flows/d0f604ca-59f1-46fe-b8c4-ab96d84b444a), [Front: a contact merge names the one conflicting field ("1 conflict found for name") and lets you pick the value that stays](https://mobbin.com/screens/7dd16e14-0899-4b53-9525-a5fef2def520) (a merge, adapted here to a save conflict; G2B-007 cites a Front screen with the same line), [Vercel: the toast names the change](https://mobbin.com/screens/50684193-8926-4ce6-9543-416339ba7ece), [Apple HIG text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields).

### 2.9 Sheet footer, `FormSheet` and `useKeyboardInset`

- **`Sheet`** (extends `src/components/sheet.tsx`). A `footer` slot pinned under the scrolling body on `--raised` over a `--line` rule, 12px top and bottom padding. `size`: `md` (`max-w-lg`, today's) or `lg` (`max-w-2xl`, for the unit and listing sheets). `fullHeight` on phones for long forms. `dirty`: while it's set, a backdrop tap does nothing, and X or Esc ask the caller first.
- **Pushed views, never a sheet on a sheet** (**new** interaction). On touch, a picker opened from inside a sheet (a chip in New task, an equipment type in the unit sheet, a trade in the contractor sheet) replaces the sheet's body with the picker, titled with its label, and puts a back arrow (lucide `ChevronLeft`, 44px) at the header's left beside the X. A pick, the back arrow or Esc on a hardware keyboard returns to the form at the same scroll, focus on the field it came from. One Esc goes back one view. The X still closes the whole sheet and asks first when dirty. With a mouse, pickers in a dialog open in a `Popover` over it, as today. The repeat view inside Due (2.4) is the same mechanism. Reference: [Mercury iOS: steps inside one sheet, back arrow beside the X](https://mobbin.com/screens/ede3cc07-012f-4e55-a5c7-7cbe8b7f5907).
- **`useKeyboardInset`** (new, `src/components/use-keyboard-inset.ts`). Reads `window.visualViewport` and sets `--kb-inset` to how much of the screen the on-screen keyboard covers. The phone sheet uses it as its bottom offset and caps its height above the keyboard, so the footer rides on the iOS keyboard. On a tablet the centered dialog uses it too: its `max-height` drops to the space above the keyboard and it moves up, so the iPad keyboard never covers the primary. The root `viewport` export adds `interactiveWidget: "resizes-content"` for Android Chrome; Next 16's `Viewport` type has it. This is the riskiest piece, so it is built and checked first, on WebKit at iPhone SE, iPhone 17 and iPad Mini.
- **`FormSheet`** (new composition, `src/components/form-sheet.tsx`): `Sheet`, a `noValidate` form and the footer.
  - From `md` (the centered dialog on laptop and tablet): Cancel (secondary, with an `Esc` keycap for a mouse) and the primary (with `⌘↵`) at the bottom right, per section 9 Dialogs. Create sheets put the "Create more" `Switch` at the footer's left.
  - Below `md` (the bottom sheet on phones): one full-width primary pinned above the safe area and the keyboard, with the header X as the way out (section 9 Sheet). Any second button stacks under the primary, full width, so no label wraps at 320.
  - A form-level error is one line above the buttons, in today's `SaveError` markup.
  - It opens with focus in the first empty field. ⌘↵ submits from any field. Tab runs through the fields, then Cancel, then the primary.
  - It compares against the values it opened with. Cancel, X or Esc close at once when nothing changed, and ask with the discard dialog (2.11) when something did.
  - Success closes it, returns focus to whatever opened it, and toasts.
- **Drops on phone:** keycaps, Cancel (the X does it), Create more, side-by-side pairs, and the long version of any helper.
- **Tokens:** `--raised`, `--line`, `--line-float`, `rounded-xl`, the Overlay shadow and scrim, `--dur-sheet`, `--dur-base`.
- **References:** [Stripe Create customer: fixed header and footer, scrolling body, "Add customer ⌘↵"](https://mobbin.com/screens/d5400786-97c3-4029-a3e2-e21a9fa7735e), [the same dialog scrolled](https://mobbin.com/screens/cd08edff-27f9-49e9-937a-2685b2ad7629), [Shopify: small edit dialog, "(optional)" once on the group](https://mobbin.com/screens/7d6cd67c-bab1-4888-9e9e-37cb50f80049), [Linear Mobile: create sheet with a sideways-scrolling chip row above the keyboard](https://mobbin.com/screens/ec1708f2-bca4-4773-b726-95174912deaf), [Mercury iOS: Next docked above the keyboard](https://mobbin.com/screens/d2e0e2e1-1b27-4815-8d0d-37858dfe43f6), [Genie: Save reachable with the keyboard up](https://mobbin.com/screens/22878822-8b60-42f3-a112-f2a6d5101469), [Apple HIG sheets](https://developer.apple.com/design/human-interface-guidelines/sheets).

```
Laptop 1280: centered dialog                    Phone 375: bottom sheet
┌──────────────────────────────────────────┐    ┌─────────────────────────────┐
│ New task                               ✕ │    │ New task                  ✕ │
├──────────────────────────────────────────┤    ├─────────────────────────────┤
│ [767 Prospect Ave  ✕]                    │    │ [767 Prospect Ave  ✕]       │
│ Title                                    │    │ Title                       │
│ ┌──────────────────────────────────────┐ │    │ ┌─────────────────────────┐ │
│ │ Fix porch light|                     │ │    │ │ Fix porch light|        │ │
│ └──────────────────────────────────────┘ │    │ └─────────────────────────┘ │
│ Notes (optional)                         │    │ (Zack) (Fri) (To do) (Un… → │
│ ┌──────────────────────────────────────┐ │    ├─────────────────────────────┤
│ │                                      │ │    │ [       Create task       ] │
│ └──────────────────────────────────────┘ │    ├─────────────────────────────┤
│ (Zack) (Fri) (To do) (Unit 2)            │    │  q  w  e  r  t  y  u  i  o  │
├──────────────────────────────────────────┤    │  keyboard                   │
│ Create more ○    [Cancel Esc] [Create ⌘↵]│    └─────────────────────────────┘
└──────────────────────────────────────────┘
Tablet 768: the laptop dialog at touch sizes, without keycaps.
```

### 2.10 `ActionBar` (new)

- **Where:** `src/components/action-bar.tsx`, generalizing the contractor job page's sticky bar in `(portal)/p/jobs/[id]/_components/job-actions.tsx`: fixed to the bottom on `--canvas`, a `--line` rule above, 12px padding plus the safe area, and `useToastInset` so toasts clear it.
- **Anatomy.** Left: one status line in `text-body` `--fg-1` that truncates ("3 unsaved changes", "39 tasks to create"). Right: a secondary and the primary at `md`, 44px on touch, keycaps with a mouse. Optional: one `--danger` or conflict line above the buttons.
- **Placement.** Docked to the bottom of the content column, from the sidebar's edge to the viewport's, with its content on the page gutters. The page gets matching bottom padding and `scroll-padding-bottom`, so the last row and a focused field never hide under it.
- **When it shows.** Only while it has a job: a dirty draft, every step of a stepped form, and Apply.
- **Keyboard.** ⌘↵ runs the primary. It comes after the content in the Tab order.
- **Touch.** Buttons are 44px. While the on-screen keyboard is up (`--kb-inset` above 0) the bar hides, so it never covers the field being typed in, and it comes back when the keyboard closes (**new**: a page bar, unlike a sheet's footer, is too far from the field to ride the keyboard usefully).
- **375 and 320.** The status shortens to its count ("3 changes") and the two buttons size to their labels at the right: "3 changes", Discard and Save take about 240 of the 288px at 320. With no status (a stepper shows its own step line), the secondary sizes to its label and the primary fills the rest, so "Send move-in report" (about 190px) never wraps beside Back.
- **Tokens:** `--canvas`, `--line`, the Button variants, `text-body`.
- **References:** [Shopify: Unsaved changes with Discard and Save, only while dirty, in its top bar](https://mobbin.com/screens/cbe5200e-30c4-4f3e-bd4e-62ff2f44341c), [Shopify: the same bar on a create page](https://mobbin.com/screens/7bd9a232-47c7-4959-b07c-6e651a0facab), [Chatbase: Discard and Save docked at the bottom, at the point of action](https://mobbin.com/screens/dc64e990-df30-4371-a3c6-a3e73e9370f2) (G2B-007's reference), [Etsy: the bar says what changed](https://mobbin.com/screens/e5476550-1c37-4475-8b07-b5d3e9c1e070), [Klaviyo: no Save until something changes](https://mobbin.com/screens/e06a4b15-a937-4f72-8096-9d4261b31972), [Airbnb: docked Back and Next under the progress bar](https://mobbin.com/screens/a5b824a5-9249-4a59-b6c5-76eeb2f554f6).

### 2.11 Keeping unsaved work

- **Discard dialog** (`src/components/confirm-dialog.tsx`, unchanged). The title names the object, as section 9 asks: "Discard changes to Unit 2?", "Discard the new task?", "Discard 3 changes to CapEx rules?". No body. Cancel labeled "Keep editing", and a `destructive` "Discard changes". Two buttons, and never a Save inside a cancel (FEEL-051).
- **One-field sheets don't ask.** While the field holds a change the backdrop does nothing; X and Esc discard that one value.
- **`LeaveGuard`** (`src/components/leave-guard.tsx`) moves from the job page up to `(app)/layout.tsx`, the portal layout and the public move-in page. `BackLink`, `TopTabs` and the sidebar links leave through `useLeaveGuard()`, which closes ADMIN-006 (switching Settings tabs). Any dirty `FormSheet` or draft holds it, titled with what would be lost ("Leave without saving Unit 2?", "Leave with 3 unsaved changes?"), with "Keep editing" as the main button and "Leave anyway" beside it. `useLeaveWarning` covers reload and close.
- **Browser Back** isn't intercepted; the App Router has no guard for it. `useDraft` makes it safe instead.
- **`useDraft`** (new, `src/components/use-draft.ts`) is the task composer's localStorage draft (`tasks/[id]/composer.tsx`) as a hook: `useDraft(key, value, { maxAgeDays: 7 })` returns `{ restored, savedAt, clear }`. The key holds the editor, the record and the version it opened with. Every read and write sits in try/catch, and the page works without storage. It clears on success, on Discard and after 7 days. On return, a page editor toasts "Your unsaved changes are back" with Discard; a create sheet shows "Draft from 2:10 PM" with a Clear `TextLink`; the public move-in report asks in a sheet (2.14).
- **`RefreshOnReturn`** holds off on any page with a dirty draft, read from the same signal, instead of its fixed list of three pages (`lib/refresh-on-return.ts`).
- **References:** [Brex: leaving a half-typed form asks with two choices](https://mobbin.com/screens/888f0752-1292-4533-ba0c-bd6b10305834), [Uvodo: leaving with unsaved changes asks first](https://mobbin.com/screens/49853d8c-0c74-4b7e-b1c7-3270df71cf77), [Linear: Save as draft once the modal has content](https://mobbin.com/screens/7d2d62c7-8fb9-40d8-bd36-f1a8ff0a860c).

### 2.12 Save pipeline

- **Extends:** `src/lib/action-result.ts`, `src/lib/server-action.ts` and `tasks/[id]/use-run.ts`.
- **`ActionResult`** failures gain `fieldErrors?: Record<string, string>` and `conflict?: { fields: string[]; by?: string; at: string; theirs?: Record<string, string> }`.
- **`withResult`** maps a zod failure to `fieldErrors` from each issue's path and message, and `error` becomes the first message. Schemas carry the plain copy from 2.0 (`z.string().min(4, "Enter the full street address, like 123 Main St.")`), so `userMessage` never prints "Invalid address:" again (PORTFOLIO-002, DEALS-007).
- **`ConflictError`** (new) is what services throw in place of `CONFLICT_MESSAGE`. It carries the stale fields (`staleFields` already knows them), who saved when the row records it (`AppConfig.updatedBy` does; Property and Deal don't, see section 6), and when. The "Reload the page" sentence retires.
- **`withLog`** stays only for actions no form awaits (`syncPropertyReminders`). These move to `withResult` and `callAction`: `patchDeal`, `addDealNote`, `createTask`, the CapEx rules save, the move-in form save and storage migrate (G2B-V01, BTASKS-013).
- **`patchDeal` takes expected values,** like `patchProperty`. Today a stale deal page silently overwrites a partner's newer edit.
- **Creates return `{ id }`** instead of redirecting (`createProperty`, `createDeal`, `createTask`), so the sheet decides whether to stay or open the record.
- **`useRun`** moves to `src/components/use-run.ts` and returns `fieldErrors` and `conflict` beside `pending`. `useSectionSave` folds into it once the property sections are facts.
- **Separate Settings versions** (ADMIN-V03). The CapEx and move-in saves compare the blob each editor loaded instead of the shared `AppConfig.updatedAt`, so saving one tab never conflicts the other. No migration.

### 2.13 Toast `key` and `detail`

- **Extends:** `src/components/toast.tsx`.
- `key`: a toast with the same key replaces the live one instead of stacking, so ten quick edits on one record show one toast for the latest.
- `detail`: the ripple clause after " · " in `--toast-fg-2`, the token section 4 already reserves for it.
- **Copy.** Facts: "Rate set to 6.875%", "Lender cleared". Items: "Task created", with Open only where you stay put (Create more). Configuration: "CapEx rules saved · Forecasts updated", "Move-in form saved · Residents see it now" (COPY-I15).
- **References:** [Linear Mobile: a short toast while you stay on the record](https://mobbin.com/screens/10941f89-6205-4271-ae91-a5bef0054dab), [Stripe: "Product created" with View product](https://mobbin.com/screens/bab2a73a-7ec5-46c7-8fd8-cc0f962e0a83).

### 2.14 Stepped form (the public move-in report only, if 3.5 A is picked)

- **Where:** a feature composition in `(marketing)/residents/moving-in/`, from `ActionBar`, `useDraft` and the checklist's progress bar in `tasks/[id]/checklist.tsx` (a 2px `--fill-1` track with an `--act` fill).
- **Anatomy.** A step line in `text-meta` `--fg-3` ("Kitchen · 3 of 7") over the progress bar, then one room as today's `Section`. The `ActionBar` holds Back (secondary) and Next (primary); on the last step the primary is "Send move-in report".
- **Steps.** About you (one name field with `autoComplete="name"`, email with `autoComplete="email"`, required as today since the copy goes there, property, unit, date), one step per room, then Review: the Fair and Poor items with an Edit link back to their room (PUBLIC-I07), Additional comments, and Send.
- **Bar.** Back is secondary and sized to its label; Next fills the rest (2.10). On the first step Back is absent and Next is full width. Step one's Next reads "Start with the kitchen", naming the first room, so the resident knows what comes next.
- **Items.** Each keeps its `SegmentedControl` md rating. The note field appears only after Fair or Poor, labeled "What's wrong with it?" (PUBLIC-039, MOBILE-V08). A second tap on the chosen rating no longer clears it unannounced; to change an answer, tap another one, and N/A covers what doesn't apply.
- **Validation.** Next checks only the current step and focuses the first unanswered required item, and the editor's Required setting is enforced (COPY-IV04, PUBLIC-041). Back never loses answers.
- **Drafts.** Every answer goes to `useDraft`, keyed by the form version. Coming back opens a sheet: "Pick up where you left off? Kitchen is next." with Continue (primary) and Start over (secondary) (FEEL-I12). It clears on send.
- **Sent screen.** The `move-in-sent` art, "Thanks, Dana!" with the resident's own first name, "Sent to Connor and Pieter on Oct 25. We emailed you a copy." and what happens next (PUBLIC-013, PUBLIC-046, both approved).
- **1280.** A centered `max-w-xl` column, the bar docked across the bottom. **768.** The same column at touch sizes. **375 and 320.** Full width; Back sized to its label and Next filling the rest of the bar. The item name sits over its full-width rating control, and "N/A" keeps each segment at least 64px at 320.
- **References:** [Airbnb: one step, progress bar, docked Back and Next](https://mobbin.com/screens/a5b824a5-9249-4a59-b6c5-76eeb2f554f6), [Airbnb: progress kept between sessions](https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394), [Thumbtack: one question per screen with progress, a single Next](https://mobbin.com/flows/677520e0-5c6d-4e12-ba93-bf0b52a753a7) (PUBLIC-012's reference), [Gusto: "Step 2 of 5"](https://mobbin.com/flows/3acdb42c-3b15-4181-a3cb-ace76d334c41), [Eight Sleep: "Your progress will be saved"](https://mobbin.com/screens/fa428b07-6761-47b3-ac2e-0978e82d72a2), [Gusto Mobile: thank-you screen with the next step](https://mobbin.com/screens/1ccbd17e-ceb0-467e-9d14-2e84b6a1d402).

## 3. Design choices

**Settled already, so not offered again:**

- **Save in a phone sheet:** one primary pinned above the safe area, X in the header (section 9 Sheet). PROPERTY-016 and MOBILE-015 had Cancel and Save in the header; the guidelines are the visual system, so they win.
- **A pending button keeps its label** (section 7). The "Saving…" label swap in `docs/components.md` changes with it.
- **New task, deal and property become sheets that keep their URLs** (IA-009, and the README's "the create pages become sheets and keep their URLs"). Built with intercepting routes (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md`) and an `@modal` slot in `(app)/layout.tsx`: a click opens the sheet over the page, a pasted link or a reload opens the full page with the same form, and browser Back closes the sheet.
- **Repeat inside the Due picker** (G1C-010). **Read-only Apply rows** (BPLAY-007). **The login handed over in a sheet,** with Copy message first on a computer (BCONTRACT-009, BCONTRACT-016, BCONTRACT-V05). **One new-password field with Show** (BPORTAL-008). **Units and Rentals merge into one unit sheet** with D10 (README, Merges).

### 3.1 How a single fact is edited (property, deal, task and contractor rails)

**A. In place with a mouse, a one-field sheet on touch.** Recommended.

```
Laptop 1280: Rate open in place in the 320px rail
  Loan
  ─────────────────────────────────────
  Maturity    Jun 1, 2031 · in 5 yrs
  Balance     $312,400
  Rate        ┌───────────────────────┐
              │ 6.875|              % │
              └───────────────────────┘
  Lender      + Add lender

Tablet 768: tap Rate, a one-field dialog
        ┌──────────────────────────────────┐
        │ Rate                           ✕ │
        ├──────────────────────────────────┤
        │ Loan · 767 Prospect Ave          │
        │ ┌──────────────────────────────┐ │
        │ │ 6.875                      % │ │
        │ └──────────────────────────────┘ │
        ├──────────────────────────────────┤
        │                  [Cancel] [Save] │
        └──────────────────────────────────┘

Phone 375 (and 320): a bottom sheet riding the keyboard
  ┌─────────────────────────────┐
  │ Rate                      ✕ │
  │ Loan · 767 Prospect Ave     │
  │ ┌─────────────────────────┐ │
  │ │ 6.875                 % │ │
  │ └─────────────────────────┘ │
  │ [          Save           ] │
  ├─────────────────────────────┤
  │    1      2      3          │
  │    4      5      6    .     │
  └─────────────────────────────┘
```

**B. In place everywhere, touch included.**

```
Laptop 1280: as in A

Tablet 768 and phone 375: the row itself opens
  ┌─────────────────────────────┐
  │ Balance   $312,400          │
  │ Rate     ┌────────────────┐ │
  │          │ 6.875        % │ │
  │          └────────────────┘ │
  │ Lender   + Add lender       │
  ├─────────────────────────────┤
  │  keyboard; Done or blur     │
  │  saves                      │
  └─────────────────────────────┘
```

**C. Keep whole-section editing; on touch it opens in a sheet with a sticky Save** (MOBILE-015).

```
Laptop 1280: Edit turns the section into a form (today's, plus a dirty check and Esc)
  Loan                          [Cancel] [Save]
  ─────────────────────────────────────────────
  Balance              Lender
  [$ 312,400        ]  [                  ]
  Rate                 Payment
  [6.875           %]  [$ 1,842.17        ]
  … 7 more

Tablet 768 and phone 375: Edit opens a full-height sheet
  ┌─────────────────────────────┐
  │ Edit loan                 ✕ │
  ├─────────────────────────────┤
  │ Balance                     │
  │ [$ 312,400                ] │
  │ Rate                        │
  │ [6.875                   %] │
  │ … 9 more                    │
  ├─────────────────────────────┤
  │ [          Save           ] │
  └─────────────────────────────┘
```

**Why A.** Changing one value is the common job, and A is the yes already recorded for PROPERTY-016. In one move it removes Save at the top of long phone forms (PROPERTY-025, MOBILE-015), silent Cancel in some sections and asking Cancel in others (FEEL-025), Edit that focuses nothing (FEEL-026), labels that change between modes (COPY-045), the second address editor (PROPERTY-044) and 150px fields in a two-column grid at 320. The tablet sheet costs one tap over B, but it follows the rule every picker already follows (Popover with a mouse, Sheet on touch), and an explicit Save stops a scroll or stray tap from saving on blur. It's how [Attio's rail](https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f) edits with a mouse and how [Mercury's one-field sheet](https://mobbin.com/screens/f9663be0-06c0-48f7-9a94-26eaef8e1a7b) edits on a phone, with its button riding the keyboard. B saves on blur on touch, leaves about 180px of field at 320, and lets the keyboard cover the rows under it. C keeps the heaviest pattern for a one-value change, and its conflicts can only say "Loan changed". A's cost: a refinance touches five loan facts, so five commits, each with Undo and a line in Activity. A "Record a refinance" sheet can come later if that gets old.

### 3.2 Codes in a rail (loan, policy and lockbox numbers)

A code copies on one tap (sections 3 and 9), so tapping it can't also edit it. An empty code is the verb ("Add loan number") in every option.

**A. Tap copies; the section's ⋯ menu holds "Change loan number".** Recommended.

```
Laptop 1280: click the code to copy it; the heading's ⋯ holds the change
  Loan                                    ⋯
  ─────────────────────────────────────────
  Loan #   7712 0045 18      ┌─────────────────────┐
  Lender   M&T Bank          │ Change loan number  │
                             └─────────────────────┘

Tablet 768 and phone 375 (and 320): tap the code to copy it
  ┌─────────────────────────────┐
  │ Loan                      ⋯ │
  │ ─────────────────────────── │
  │ Loan #   7712 0045 18       │
  │ Lender   M&T Bank           │
  └─────────────────────────────┘
  ⋯ opens the same menu with 44px rows; the pick opens the one-field sheet
```

**B. Tap opens a small menu: Copy, Change.**

```
Every size
  Loan #   7712 0045 18
           ┌──────────────┐
           │ Copy         │
           │ Change       │
           └──────────────┘
```

**C. The code edits like every other fact; a lucide `Copy` icon button at the row's end copies it** ([Snowflake: a copy icon on every value row](https://mobbin.com/screens/00df736f-1260-4f30-a2de-3fec912f98a6)).

```
Laptop 1280                                  Tablet 768 and phone 375 (and 320)
  Loan #   7712 0045 18            ⧉           Loan #  7712 0045 18        ⧉
           └ click edits in place; ⧉ copies     └ tap opens the one-field sheet; ⧉ (44px) copies
```

**Why A.** Codes get copied all the time and changed about once per loan, so the rare job gets the out-of-the-way spot and one-tap copy on the code itself survives, as sections 3 and 9 define it. B doubles the taps for the common job on every code. C is consistent with every other fact and keeps copy at one tap, but it moves the tap from the code to an icon, which changes `Code` and the guideline, and adds a permanent icon to every code row on touch (an action, not an edit cue, so CLAUDE.md allows it). Pick C if "tap a value to change it" should have no exceptions.

### 3.3 Deals list rows

**A. Read-only rows: the stage chip edits in the row, and the row opens the deal.** Recommended (DEALS-008).

```
Laptop 1280 (one row; the whole row is the link; price headers wait on question 2)
  Address            Stage              Units   Asking     Max offer   Next action          Updated
  767 Prospect Ave   (◔ 2 - Medium ⌄)       4   $425,000   $380,000    Call listing agent   Oct 20
                     └ the only control: opens the stage menu, toasts with Undo

Tablet 768: the same row; columns drop by COLUMN_DROP; the chip keeps a 44px hit area
Phone 375 and 320: today's two-line row, which opens the deal
  767 Prospect Ave
  ◔ 2 - Medium · $425,000
```

With A: ⌘-click or middle-click opens the deal in a new tab (DEALS-008); a landed stage change keeps today's 700ms `--ok-tint` row flash and toasts "Moved to 2 - Medium · Undo" (DEALS-019); an empty next action is a blank cell, not "Add next action…" (DEALS-054); a row is one tab stop plus the chip, down from six controls.

**B. Each cell is an `InlineField`; the address opens the deal.**

```
Laptop 1280
  767 Prospect Ave   2 - Medium   4   $425,000   [$380,000        ]   Call listing agent
                                                 └ the clicked cell opens in place
Tablet 768: a tapped cell opens its one-field sheet
Phone 375 and 320: two-line rows, no cell edits
```

**C. Today's sheet of live inputs, restyled.**

```
Laptop 1280
  767 Prospect Ave  [◔ 2 - Medium ⌄] [ 4 ] [$425,000 ] [$380,000 ] [Add next action…]
Tablet 768: the same fields at 44px; phone: two-line rows
```

**Why A.** Calm lists that answer first are the review's direction (DEALS-008), and it's what [Stripe](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258) (text rows with one status badge) and [Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79) (quiet rows that open on click) ship, the references DEALS-008 cites; [Linear's issue list](https://mobbin.com/screens/e142df2a-3527-499c-8f81-1b715947ac0c) is read-only text rows that open the issue. Only the triage move (the stage) changes in the row. Prices and next action change on the deal page, where the rail is the same `InlineField`. B keeps quick edits, but every cell competes with the row link, so a click is ambiguous between open and edit. C is the status quo: 1,800 tab stops on 300 rows, spinners in Safari, and edits a stray click can make.

### 3.4 Settings save model (CapEx rules and the move-in form editor)

**A. A draft, with the `ActionBar` docked at the bottom at every width.** Recommended.

```
Laptop 1280
┌──────────┬────────────────────────────────────────────────────┐
│ sidebar  │ Settings                                           │
│          │ CapEx rules   Move-in form   Storage               │
│          │ ───────────                                        │
│          │ Appliances                          + Add appliance │
│          │ ────────────────────────────────────────────────── │
│          │ Type             Monitor at  Replace at      Cost  │
│          │ [Furnace      ⌄] [  12 yrs]  [  17 yrs]  [ $6,000] │
│          │ [Water Heater ⌄] [   7 yrs]  [  10 yrs]  [ $1,500] │
│          ├────────────────────────────────────────────────────┤
│          │ 3 unsaved changes            [Discard] [Save ⌘↵]   │
└──────────┴────────────────────────────────────────────────────┘

Tablet 768: the laptop table with 44px fields and the same bar at the bottom
Phone 375 and 320: each rule stacks below 460px, where today's table scrolls sideways
┌─────────────────────────────┐
│ Furnace                   ⌄ │
│ Monitor at                  │
│ [ 12 yrs                  ] │
│ Replace at                  │
│ [ 17 yrs                  ] │
│ Cost                        │
│ [$ 6,000                  ] │
├─────────────────────────────┤
│ 3 changes [Discard] [Save]  │
└─────────────────────────────┘
```

**B. A draft, with the bar at the top on laptop and tablet, and at the bottom on phones** (ADMIN-010 as written). To avoid a second sticky header, the bar takes over the header while dirty (the 56px header from `lg`, the 52px top bar at tablet widths), as [Shopify's contextual save bar](https://mobbin.com/screens/7bd9a232-47c7-4959-b07c-6e651a0facab) takes over its top bar. Below `md` it docks at the bottom as in A.

```
Laptop 1280 and tablet 768
│ 3 unsaved changes                     [Discard] [Save ⌘↵] │  in place of the header while dirty
│ Settings                                                  │
│ CapEx rules   Move-in form   Storage                      │
Phone 375 and 320: as in A
```

**C. Keep saving each cell on its own; add Undo toasts and errors on the cell.**

```
Laptop 1280
  [Furnace ⌄]   [ 12 yrs]   [ 10 yrs]   [$6,000]
                            Replace comes after Monitor.
  toast: Furnace replace age set to 17 yrs · Undo
Tablet 768, phone 375 and 320: stacked rows, the same per-cell saves
```

**Why A.** One save model for both Settings tabs (ADMIN-010). New rows stay local until Save, so a zeroed "New system" never reaches every property (ADMIN-002), and a deleted rule comes back through Discard (FEEL-045). The move-in editor already saves as a whole; A only moves its Save into the bar and has it say "Residents see it now". The research splits on where: Shopify and Patreon put the bar at the top on desktop (ADMIN-010's references), Chatbase docks it at the bottom (G2B-007's). A wins on consistency: it's the same `ActionBar` that Apply and the move-in steps need at the bottom anyway, it sits where the eye already is while working down a long table, and it's under the thumb on phones. B follows Shopify exactly and keeps the bottom of the page clear, but hides search and the account menu while a Settings draft is dirty, and puts a page's commit in two places depending on the width. C keeps instant per-cell feedback but leaves the two tabs on different models, and every half-typed rule would still publish on blur.

### 3.5 Public move-in report

**A. One room per step, with progress, docked Back and Next, a review step and a draft on the device.** Recommended (PUBLIC-012).

```
Laptop 1280: centered column, bar docked at the bottom
  Kitchen · 3 of 7
  ▬▬▬▬▬▬▬▬▬▬▬▬──────────────────────
  Kitchen
  ──────────────────────────────────
  Sink          [ Good | Fair | Poor | N/A ]
  Faucet        [ Good |▐Fair▌| Poor | N/A ]
                What's wrong with it?
                [ Drips when off          ]
  …
  ════════════════════════════════════════════
  [Back]                                [Next]

Tablet 768: the same column at touch sizes
Phone 375 (and 320)
  ┌─────────────────────────────┐
  │ Kitchen · 3 of 7            │
  │ ▬▬▬▬▬▬▬▬▬───────────────    │
  │ Kitchen                     │
  │ ─────────────────────────── │
  │ Sink                        │
  │ [ Good | Fair | Poor | N/A ]│
  │ Faucet                      │
  │ [ Good |▐Fair▌| Poor | N/A ]│
  │ What's wrong with it?       │
  │ [ Drips when off          ] │
  ├─────────────────────────────┤
  │ [  Back  ] [     Next     ] │
  └─────────────────────────────┘
```

**B. One page; each room folds to a summary row that opens in place; a docked Send bar.**

```
Phone 375 (laptop and tablet: the same rows in the centered column)
  ┌─────────────────────────────┐
  │ About you            Done ⌄ │
  │ Kitchen       4 of 9 rated ⌃│
  │   Sink [Good|Fair|Poor|N/A] │
  │   …                         │
  │ Living room   0 of 6      ⌄ │
  │ Bedroom 1     0 of 5      ⌄ │
  ├─────────────────────────────┤
  │ [  Send move-in report    ] │
  └─────────────────────────────┘
```

**C. One page as today, plus the fixes every option gets** (drafts, errors on the item, notes only on Fair or Poor).

```
Phone 375 (laptop and tablet: the same page in the centered column)
  ┌─────────────────────────────┐
  │ Kitchen                     │
  │ Sink                        │
  │ [ Good | Fair | Poor | N/A ]│
  │ … 45 more items, about      │
  │   4,000px with notes hidden │
  │ [  Send move-in report    ] │
  └─────────────────────────────┘
```

**Why A.** A resident walks the unit room by room, often switching to the camera and back, so a step per room matches the job, shows how much is left and keeps every error on the screen you're on. The review step gives back the whole-report overview. It's what PUBLIC-012 proposes and what [Airbnb](https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394) and [Thumbtack](https://mobbin.com/flows/677520e0-5c6d-4e12-ba93-bf0b52a753a7) do for long intake; the review names Thumbtack the model for resident forms. B saves taps, but open rooms bring back the long scroll and errors can still sit far away. C is the smallest change and keeps a 4,000px form.

## 4. Migration map

Every inventory item, grouped by where people meet it.

### 4.1 Shared pieces

| Today | Becomes | What changes for the user |
|---|---|---|
| `Input`, `Textarea`, `Select` (`ui.tsx`) | `size` sm or md, prefix and suffix, kinds, `autosize`; native `Select` replaced by `OptionPicker` in every form, then deleted | Money and rates show "$" and "%", phones get number keyboards, menus look the same in every browser |
| Label wrappers: `LabeledField`, New deal's `Label`, inline spans in six files | `FormField` and `FieldRow` | Labels, helpers and errors sit the same way in every form; no asterisks; labels never wrap in pairs |
| Error lines: `SaveError`, the ad-hoc `text-danger` lines, `AuthError` | The field's own error line, or one form-level line above the primary | The reason sits on the field or beside the button you pressed |
| Save plumbing (`callAction`, `withResult`, `withLog`) | 2.12 | A refusal or dropped signal never replaces the page; typing stays; conflicts say who, what and when |
| `SectionCard` view and edit mode | Retired: facts are `InlineField`s; units, listings and building systems open sheets. Deleted with its `docs/components.md` row once its last caller moves | No Edit mode; tap the value |
| `InlineAddressField`, `useInlineEditKeys` | `InlineField` (`heading` kind); the keys hook stays | A refused rename shows the saved name again, with the reason under the open field |
| Four quiet-field recipes (`deals/fields.ts`, `settings/editor-controls.tsx` `quietField`, the move-in comment, notes and the heading field) | Retired. At rest, `InlineField`'s value button; while editing, the bordered field; in tables, bordered `sm` fields | Anything being edited shows a real edge; on touch nothing reads as empty space |
| Guards: `LeaveGuard` (job page only), `useLeaveWarning` (uploads only), `RefreshOnReturn`'s list | `LeaveGuard` in every layout, `useDraft`, a dirty-draft hold for refreshes | Leaving asks once; a reload or back swipe brings the draft back |
| Discard `ConfirmDialog` (three buttons in Units and Rentals, a different one in the move-in editor) | Two buttons everywhere: Keep editing, Discard changes | One clear question, the same in every editor |
| Small sheet forms (Waiting, Schedule, both Send back forms) | Small `FormSheet`s with Cancel from `md`; Schedule's sheet holds the `DatePanel` inline as its one field; one Send back form (4.4) | Same shape and words everywhere; no sheet on top of a sheet |
| `DueDatePicker` | Shared `DatePanel`, brand classes, 16px rows on touch, today's month for late dates, Repeat inside | A late task's calendar opens on this month; repeats are set with the date and show the next three |
| 11 native date fields | `DateField` | One date control; typed dates with a mouse; no clipped "07/16/2025" |
| `RepeatPicker` chip | Folded into the Due panel | One chip instead of two; an empty count asks instead of saving "Every day" |
| `AssigneePicker`, `SelectChip` | `AssigneePicker` unchanged apart from opening as a pushed view inside a sheet on touch; `SelectChip` becomes an `OptionPicker` chip | Property and Unit behave like Assignee, on the task page and in New task; no picker opens a sheet on top of a sheet |
| `StageSelect`, `PriceInput` | `OptionPicker` with the ring; `NumberInput` `money` with `allowText` | Prices get "$", a number keyboard and a preview of how they'll save |

### 4.2 Properties

| Today | Becomes | What changes for the user |
|---|---|---|
| New property page (`properties/new/*`, `createProperty`) | Create sheet at `/properties/new`: Address (`AddressCombobox`), Entity (`OptionPicker`, find or add). Status drops (PORTFOLIO-044). Primary "Create property". Success opens the new record with the toast "767 Prospect Ave added", and the record's verbs are the next step (setup checklist: record hub, PORTFOLIO-025) | Opens over Portfolio with Cancel and Esc (PORTFOLIO-009); suggestions and a duplicate line while typing; no personal-address autofill; a short address explains itself |
| Address heading (`edit-details.tsx` `PropertyAddressField`) | `InlineField` `heading` with `AddressCombobox` rules; the only place the address changes (PROPERTY-044) | A refused rename never stays on screen |
| Details (`PropertyDetailsSection`) | 14 `InlineField` facts: Value, Purchase price, Closing costs and Rehab as `money`; Purchase and Refinance dates as `date`; Registration expiry and Tax due as `date` with their reminder helpers; Strategy and Status as `choice`; Entity as find-or-add `choice`; Sq ft as `integer` with "sq ft"; Attorney and Refi target as `text` | Change one value without opening a form; each save toasts with Undo; "Entity" is called the same everywhere |
| Loan (`edit-loan.tsx`, `key-date.tsx`) | Balance, Original amount and Payment as `money`; Rate as `percent`; Lender, Servicer and Type as `text`; Escrow as a Yes or No `choice`; Originated and Maturity as `date`, Maturity with its helper; Loan # per 3.2. The labels stay "Rate", "Originated", "Maturity" | "Enter a rate, like 6.875." shows on the Rate field; setting maturity says it adds a reminder |
| Insurance (`edit-insurance.tsx`) | Premium, Replacement cost, Coverage and Deductible as `money`; Carrier and Liability as `text`; Renewal as `date` with its helper; Policy # per 3.2 | As Loan |
| Notes (`PropertyNotesSection`) | `InlineField` `multiline`: autosizing, Save or ⌘↵, never on blur. The "Add a note" verb stays; the filler placeholder goes. Note history belongs to the activity spec | A stray tap can't rewrite the notes; saving confirms with Undo |
| Units & access (`edit-units.tsx`) | The view stays a counted list. The unit's name, or "Edit unit" in its row's ⋯ beside Delete unit, opens a `FormSheet` `lg` titled with the unit (the lockbox code in the row still copies on tap): Name and Lockbox, a Utilities group, and an Equipment group (a table from `md`, one card per item below it; Type from the rule types with find-or-add; Year as `year`; an X per item). "Add unit" opens an empty one with focus in Name. It saves the one unit, pinned to the version it opened; a conflict shows in the footer; a dirty Cancel asks with two buttons. Delete unit keeps today's question when tasks or listings still name the unit. Below `md` the sheet is full height, utilities stack one per row and each equipment item is a card (Type, Model, Year), so nothing scrolls sideways at 375 or 320 | Edit one unit, not every unit at once; Save always in reach; "Old" as a year asks for a year instead of dropping out of the forecast (PROPERTY-022) |
| Rentals (`edit-listings.tsx`) | The listing's title, or "Edit listing" in its row's ⋯, opens a `FormSheet` `lg`; it folds into the unit sheet when D10 merges Units and Rentals. Its fields: Unit (required, "Pick the unit."), Status, photos (uploads spec), Zillow link (`url`, checked on blur), Available from (`date`, COPY-I03), Rent (`money` with "/mo"), Sq ft and Beds (`integer`), Baths (`decimal`), with no value-like placeholders. While photos upload, Save stays pending and the footer's line reads "2 photos uploading", in place of today's "Uploading…" label. Delete listing asks "Delete the listing for Unit 1? Its 8 photos go too." with a destructive "Delete listing". Public preview: uploads spec (G1D-I16) | A listing can't go public as "Unit" (G2C-033); photos never disappear without a question (G2C-006) |
| Building CapEx (`building-capex.tsx`) | Read-only rows (the phone still drops Type and Age); a row opens a small `FormSheet`: Type (`OptionPicker` with find-or-add), Year (`year`), Cost (`money`). An overridden cost shows "Default $8,000" under it in `--fg-3` in place of the bare "*" (COPY-067) | Same edit shape as units; a bad cost asks instead of silently clearing to the default |

### 4.3 Deals

| Today | Becomes | What changes for the user |
|---|---|---|
| New deal page (`deals/new/*`, `createDeal`) | Create sheet at `/deals/new`: Address (`AddressCombobox`, duplicates while typing, links moved), Stage (`OptionPicker`, default "5 - TBD"), Asking price and the second price (`money` with `allowText`; its label is question 2), Units (`integer`), Listing link (`url`), Note (optional, saved as the first timeline note, JOURNEYS-032). Next action moves to the deal page (DEALS-041). "Create deal" with Create more. Toast "767 Prospect Ave added to TBD · Open" (JOURNEYS-019) | Opens over the list and leaves you there; says where the deal went; no browser bubbles (FEEL-022) |
| Deal address heading (`deal-detail.tsx` `AddressField`) | `InlineField` `heading`, through `callAction` | No error page on a dropped signal |
| Deal rail (`deal-fields.tsx`, `deal-detail.tsx`, `[id]/page.tsx` `DetailRow`) | `InlineField` facts in `RailFact`: Stage (`choice` with the ring), the two prices (`money`, `allowText`), Units (`integer`; under 1 says "Enter 1 or more."), Next action (`text`, verb "Add next action"), Listing link (`url`, checked on blur, the open icon kept), Pass reason (`choice`, only at Pass). Expected values sent. Each save toasts with Undo (DEALS-019) | Same editing as a property; empty facts read as verbs (DEALS-I14); no crash on no signal |
| Add a note (`deals/[id]/page.tsx`, `addDealNote`) | Owned by the activity spec's composer. This spec requires `withResult` with `callAction`, a pending primary, ⌘↵ (FEEL-I06) and keeping the draft on failure | No double posts; no lost note |
| Deals list cells (`deal-row.tsx`, `columns.ts`) | Per 3.3 | Per 3.3 |

### 4.4 Tasks

| Today | Becomes | What changes for the user |
|---|---|---|
| New task page (`tasks/new/*`, `createTask`) | Create sheet at `/tasks/new`, prefilled from where it opened: the context as a removable Tag, Title (autofocus), Notes (renamed from Description, TASKS-V06), then one chip row (Assignee, Due with Repeat, Status, Property, Unit) that scrolls sideways and never wraps. With a mouse each chip opens its `Popover` over the dialog; on touch it opens as a pushed view inside the sheet (2.9). Waiting asks "What's it waiting on?" and Scheduled asks for the visit date, under the chips. "Create task" with Create more (IA-I11). A create lands on the new task, as the old redirect did, whether from the sheet or the page (TASKS-034); with Create more on you stay in the sheet, with "Task created · Open" | One field language with the task page (BTASKS-009); a Unit field; no duplicates from double taps; a 1-character title explains itself instead of crashing (BTASKS-013) |
| Task title (`header.tsx` `TitleField`) | `InlineField` `heading`, an h1 button like the property's (VISUAL-I14); "Enter at least 2 characters."; struck in `--fg-3` when Done or Canceled | The page has a real heading; a refused rename never stays on screen |
| Task notes (`notes.tsx` `NotesField`) | `InlineField` `multiline`: Save or ⌘↵, Esc reverts, no blur saves; the "Visible to Zack" line stays. When a change reaches the contractor, the toast says so (BTASKS-021) | A stray tap can't rewrite a tenant's report text (G1B-002) |
| Rail chips (`fields.tsx`, `view.tsx`) | The chips stay. Property and Unit become `OptionPicker` chips; Repeat folds into Due; every pick toasts with Undo, not only Due | Every change confirms and can be undone |
| Status menu, Waiting and Schedule (`status-control.tsx`) | A pick toasts "Status set to In progress · Undo" (BTASKS-017). Waiting and Schedule become small `FormSheet`s with Cancel from `md`; Schedule's sheet holds the `DatePanel` inline, so no second sheet opens | No silent status changes; no sheet stacked on a sheet |
| Approve and Send back (`review-banner.tsx`, `review-actions.tsx`) | One `SendBackForm` (`tasks/send-back-form.tsx`): label "What still needs doing?", 2,000 characters with a count from 1,800, helper "Goes back to In progress with your note for Zack." (G1A-012). In both places: secondary Send back, then primary Approve (BTASKS-014) | The same order, words and limit on Today and the task page |
| Row date and done (`task-row.tsx`, `task-list-context.tsx`) | Unchanged apart from `DueDatePicker`'s fixes. Re-read the other session's edits first | A late task's calendar opens on this month |
| Checklist Add item (`checklist.tsx`) | Stays the model for Create more. Items become `InlineField` `text` to rename, with Delete in each item's ⋯ and an Undo toast (BTASKS-024) | Items can be renamed and removed |

### 4.5 Playbooks

| Today | Becomes | What changes for the user |
|---|---|---|
| Apply playbook (`templates/[id]/apply/*`) | One page: Property (`OptionPicker`), Unit (new, BPLAY-004), Anchor date (`DateField`) and the fill-ins as `FormField`s; the "[Address]" box goes, since it always fills from the property (G1C-I08). Then read-only task rows (BPLAY-007): checkbox, the title as text with its filled values, then the assignee and due chips; tapping a title renames it (`InlineField`). "Untick all" and the playbook's sections (BPLAY-027). The `ActionBar` reads "39 tasks to create" beside the primary "Create 39 tasks" (BPLAY-012). Errors show only after Create is pressed (BPLAY-011). When the playbook already has open tasks on the property, a neutral line above the list: "12 tasks from this playbook are still open here. Open them" (BPLAY-V01). Success: "39 tasks created for 767 Prospect Ave · View". At 1280 and 768 each task row is one line: checkbox, title, then the two chips at the right edge. At 375 and 320 it's two lines: checkbox and title (wrapping, since titles carry filled values), then the assignee and due chips under the title, which fit side by side in the 260px beside the checkbox, so the row never scrolls sideways | Create is always on screen with its count; nothing is red before you try; no silent duplicate run; draft kept on reload |

### 4.6 Contractors

| Today | Becomes | What changes for the user |
|---|---|---|
| Create and edit (missing, ADMIN-003, G1A-008) | A New contractor sheet from the directory: Name; then "Contact (optional)": Phone (`phone`, saved with its E.164 copy in `phoneE164`), Email, Mailing address (`multiline`); then "Work (optional)": Company, Trades (`OptionPicker` `multiple` with find-or-add, 2.5), Billing, Availability; then Notes. These are the `Contact` columns that exist today, so no migration. W-9 and insurance files belong to the uploads spec. On the record, the name is an `InlineField` `heading` and each contact fact an `InlineField` in the rail | Contractors can be added and fixed without a script; the 14 without an email can get one |
| Portal access (`portal-access-card.tsx`) | Create login opens a `FormSheet`: Email (prefilled; helper "Also saved as Zack's contact email" when the contact has none, BCONTRACT-013) and one line on what happens ("Zack gets a starting password and picks a new one at first sign-in", ADMIN-I03). The payoff stays in the sheet: the password as `Code` `lg`, the primary "Copy message" on a computer and "Text login details" on a phone, then Done. The login email changes through "Change login email" in the card's ⋯, a small `FormSheet` with the helper "Zack signs in with this email from now on", not an `InlineField`, because it changes how someone signs in and shouldn't save on a stray blur. Reset password, Sign out everywhere and Remove access keep their confirms. The starting password itself is interim: the one-time link replaces it in week 2 (G1A-001) | A clear before and after; the right primary for the device; a wrong login email can be fixed on purpose |

### 4.7 Settings

| Today | Becomes | What changes for the user |
|---|---|---|
| CapEx rules (`capex-rules-editor.tsx`, `editor-controls.tsx`, `saveCapexRules`) | Per 3.4. With A: bordered `sm` fields in 40/48px rows; Type from an `OptionPicker` of allowed types (ADMIN-034); headers "Monitor at" and "Replace at", each followed by a 16px lucide `Info` button (44px hit area on touch) that opens a `Tooltip` ("Age it starts showing as Monitor", "Age it shows as Replace", ADMIN-045), by hover or focus with a mouse and by tap on touch; on phones, where rules stack and there's no header row, one `Info` button beside the section heading opens both lines; errors on the cell ("Replace comes after Monitor."); a new row focuses its name; the trash keeps today's hover and tap-to-reveal; Reset to defaults keeps its confirm | No silent snap-backs; a blank system never reaches every property |
| Move-in form editor (`move-in-form-editor.tsx`) | Per 3.4. With A: the always-on Save and Cancel go, and Save in the bar toasts "Move-in form saved · Residents see it now" (COPY-I15). Add item adds the row and focuses it (ADMIN-039). The item trash moves to CapEx's hover and tap-to-reveal, so 46 icons stop showing at once (ADMIN-041) | Switching tabs can't drop edits (ADMIN-006); the editor says when residents see the change |
| Storage migrate (`storage/migrate-button.tsx`) | `withResult` with `callAction`, `Button` `pending`; the result stays a meta line, and no signal shows the offline line under the button. A small fix only: /settings/storage goes when D10 merges Settings (README, Goes) | No error page offline |

### 4.8 Financials

| Today | Becomes | What changes for the user |
|---|---|---|
| Mapping selects (`financials/settings/tables.tsx`, `controls.tsx`) | One "Maps to" `OptionPicker` per class, grouped Properties, Company overhead, Entity and Ignore (FINANCIALS-049); accounts keep one category picker. Saves on pick, like a fact; only the changed row shows it, with no table fade (FINANCIALS-IV03); toast "Prospect mapped to 767 Prospect Ave · Undo" (FINANCIALS-019). Below `md` each row opens a sheet (FINANCIALS-022). Basis and Disconnect stay | One decision per class; every change confirms and can be undone |

### 4.9 Sign-in and passwords (public material)

| Today | Becomes | What changes for the user |
|---|---|---|
| Sign-in (`login/*`) | Visible labels through `FormField`, "Email" and "Password" (PUBLIC-016); `autoComplete` `username` and `current-password`; `AuthSubmit` on `Button` `pending`; "Wrong email or password." as the form-level `--danger` line above Sign in in place of the bordered box; the email kept and the password refocused, as today | Labeled fields; the error reads as an error |
| Forgot and reset (`login/forgot`, `login/reset`) | Labels. Reset becomes one "New password" field with Show and the helper "At least 10 characters.", checked before posting so a short password never costs a round trip. The native post stays, so a second tap can't spend the token | One field; the rule shown up front |
| First password (`p/welcome/password`, `chooseOwnPassword`) | Two fields, "Starting password" and "New password", both with Show (BPORTAL-008); the rule as a helper; errors come back through `useActionState` with the typed values kept, in place of a `?error=` redirect that clears them. Interim until the one-time link (G1A-001, week 2) removes the starting password; then the page is the one "New password" field | No retyping three masked passwords after one mistake |

### 4.10 Contractor portal

| Today | Becomes | What changes for the user |
|---|---|---|
| Mark done sheet and payoff (`job-actions.tsx`) | The model for the rest. It adopts the `FormSheet` footer and `useKeyboardInset`, so the note's keyboard never covers Mark done. Nothing else changes | Mark done stays in reach while typing the note |

### 4.11 Public move-in report

| Today | Becomes | What changes for the user |
|---|---|---|
| Move-in report (`(marketing)/residents/moving-in/*`) | Per 3.5. In every option: `noValidate` with errors on the item (PUBLIC-014, COPY-058); one name field and email with autofill (PUBLIC-040); Property leaves out Flip-strategy and Sold properties, where nobody moves in (G2C-020 as its verification corrects it: the "recently leased or stabilized" filter would hide 767 Prospect, 415 Crescent and 765 Prospect, which have tenants), until the personal link (PUBLIC-045) replaces the select; the date defaults to Eastern today; notes only after Fair or Poor (PUBLIC-039); "Add another" room focuses its heading (PUBLIC-052), and removing one toasts "Bathroom 2 removed · Undo" (PUBLIC-V02); `useDraft` on every answer (FEEL-I12); `robots: { index: false }` (G1E-014); the sent screen names who got it, when, and the emailed copy (PUBLIC-013, PUBLIC-046) | A reload or back swipe keeps every answer; errors appear where the problem is; the resident knows it arrived |

### 4.12 Out of scope here

- Deal note composer and history of overwritten notes: activity and comments spec.
- Listing photos, the public listing preview, W-9 and insurance files: uploads and photos spec.
- A matching open task shown while typing (G2B-I10) and ⌘K create: search spec.
- The new property's setup checklist (PORTFOLIO-025): the record hub.

### 4.13 Build order

Each step runs `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`, and opens every touched sheet, menu and state at 375 and 320 by hand.

1. **Save pipeline, no visual change.** `withResult` and `callAction` on the six uncovered saves, `fieldErrors`, `ConflictError`, plain schema messages, expected values on `patchDeal`, creates returning ids, and the `InlineAddressField` rejected-text fix.
2. **Sheet footer and `useKeyboardInset`,** checked on WebKit at iPhone SE, iPhone 17 and iPad Mini before anything builds on them.
3. **Field kit:** `Input` sizes and slots, `FormField`, `NumberInput`, `Button` `pending`, `Switch`, `OptionPicker`, `DatePanel` and `DateField`, toast `key` and `detail`.
4. **`InlineField`** across property Details, Loan, Insurance and Notes, then the deal rail, task title and notes, and the contractor rail. `SectionCard` goes.
5. **Create sheets** with intercepting routes: New task, then deal, property and contractor.
6. **Item sheets:** unit, listing, building system, the question sheets, the one Send back form, Portal access.
7. **Drafts:** `ActionBar`, `useDraft` and `LeaveGuard` everywhere; then Apply, the Settings editors and the public move-in report.

Tests to add: `parseAmount` for every kind (`money.test.ts`), `userMessage` field mapping (`action-result.test.ts`), `inlineEditCommit` minimum-length messages (`inline-edit.test.ts`), `useDraft` expiry, the repeat interval for monthly rules (`repeat.test.ts`), and device-check samples for every sheet state the sweep can't reach on its own.

## 5. Reuse check

**Reused as they are**

- Overlays: `Sheet`'s React Aria core (one Esc per layer, focus trap and return), `Popover` and `PopoverSurface`, `Menu`, `ConfirmDialog`, `Tooltip`, `useCoarsePointer`.
- Display: `Money`, `Code`, `Kbd`, `TextLink`, `Badge`, the Tag look, `SegmentedControl`, `StatusMark`, `SpotArt`, `EmptyState`.
- Pickers: `AssigneePicker`'s panel, `pickerChip`.
- Save and data: `callAction`, `OFFLINE_ERROR`, `GENERIC_ERROR`, `inlineEditCommit`, `useInlineEditKeys`, `changedFields` with expected values, `staleFields`, `AppConfig.updatedBy`, `parseAmount` and `amountToDecimal`, `normalizeAddress`, `sameStreetAddress`, `fmtDay`, `todayYmdEastern`, `quickPicks`.
- Recipes: the checklist progress bar, the job page's sticky bar, the task composer's localStorage draft, the deals list's 700ms `--ok-tint` row flash, `useToastInset`, the CapEx rows' tap-to-reveal trash.

**Extended**

| File | Extension |
|---|---|
| `components/ui.tsx` | `Input`, `Textarea`, `Select`: `size`, prefix and suffix, `autosize`. `Button`: `pending` |
| `components/sheet.tsx` | `footer`, `size`, `fullHeight`, `dirty`, pushed views with a back arrow, the keyboard inset on phones and on the tablet dialog |
| `components/due-date-picker.tsx` | Exported `DatePanel`, `DateField`, the year grid, the start-month rule, the Repeat row, brand classes |
| `components/repeat-picker.tsx` | Its panel moves into `DatePanel`; counts on `NumberInput`; every N months; the next three dates |
| `components/inline-address-field.tsx` | Becomes `inline-field.tsx`: kinds, the touch sheet, conflicts, the rejected-text fix |
| `properties/[id]/record-ui.tsx` | Moves to `components/rail.tsx`; `RailFact` takes an `InlineField` |
| `components/toast.tsx` | `key`, `detail` |
| `components/leave-guard.tsx`, `components/nav.tsx` | Mounted in every layout; `TopTabs` and the sidebar leave through `useLeaveGuard` |
| `lib/action-result.ts`, `lib/server-action.ts` | `fieldErrors`, `conflict`, plain schema messages |
| `tasks/[id]/use-run.ts` | Moves to `components/use-run.ts`, returns field errors and conflicts |
| `lib/refresh-on-return.ts` | Holds on any dirty draft |
| `deals/stage-select.tsx`, `deals/price-input.tsx` | Become `OptionPicker` with `renderValue`, and `NumberInput` with `allowText` |
| `deals/status-multiselect.tsx` | Moves to `components/` as the base of `OptionPicker` `multiple` (its second use, contractor trades) |
| `login/_components/auth-submit.tsx` | Renders `Button` `pending` |
| `(portal)/p/jobs/[id]/_components/job-actions.tsx` | Its bar becomes `ActionBar` |
| `app/layout.tsx` | `viewport.interactiveWidget: "resizes-content"` |

**New** (each gets a `docs/components.md` row in the same commit)

| Component | Where | References |
|---|---|---|
| `FormField`, `FieldRow` | `components/ui.tsx` | [shadcn/ui Form](https://ui.shadcn.com/docs/components/form), [Material text fields](https://m3.material.io/components/text-fields/guidelines), [Mercury](https://mobbin.com/screens/f8c552c0-fede-4593-ab65-3a3fde0973a6), [Felt](https://mobbin.com/screens/67df3510-506f-4084-a147-7501b8135bc7), [Vercel](https://mobbin.com/screens/0a227055-0e20-4ef1-a4cf-08bd5e0d9c58) |
| `NumberInput` | `components/number-input.tsx` | [Stripe](https://mobbin.com/screens/927777ee-2029-4c4a-bfa5-4628ee67cae5), [Fresha](https://mobbin.com/screens/3893a31d-762f-49f5-9ee7-0a59915599aa), [Attio](https://mobbin.com/screens/380922eb-8c4a-4458-b44c-c4161d8088d5), [Apple HIG keyboards](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards) |
| `DateField`, `DatePanel` | `components/due-date-picker.tsx` | [Linear](https://mobbin.com/screens/fb59ac32-54a6-4539-8a03-450addb61b6d), [Material date pickers](https://m3.material.io/components/date-pickers/guidelines), [React Aria DatePicker](https://react-spectrum.adobe.com/react-aria/DatePicker.html) |
| `OptionPicker` | `components/option-picker.tsx` (with `StatusMultiSelect` moved to `components/` for `multiple`) | [Attio](https://mobbin.com/screens/8353ecb1-c4e5-4896-b1f6-6f8d1622876b), [Attio tags](https://mobbin.com/screens/e56d6f53-7818-44f3-a6d6-8bb6e677aab5), [Linear](https://mobbin.com/screens/af9cc8d7-aea7-4a3a-9021-5edc74d80ad8), [React Aria Select](https://react-spectrum.adobe.com/react-aria/Select.html), [shadcn/ui Combobox](https://ui.shadcn.com/docs/components/combobox) |
| `AddressCombobox` | `components/address-combobox.tsx` | [PayPal](https://mobbin.com/screens/f91d5478-7799-4f8e-b4ac-3be2b3b802f0), [Quicken](https://mobbin.com/screens/6112b488-c8dc-4668-937e-c58bd6e3f9d5), [Mercury iOS](https://mobbin.com/screens/ff16882c-4dbc-4a2b-9372-7a315254f30a), [DoorDash](https://mobbin.com/screens/f9007d6a-de3a-4257-bd68-3a0733f0e9f3), [Mercury](https://mobbin.com/screens/0a5f6c3d-76a0-4f00-9b07-a6f97cc75a25) |
| `Switch` | `components/switch.tsx` | Section 9's look; [React Aria Switch](https://react-spectrum.adobe.com/react-aria/Switch.html), [Linear](https://mobbin.com/screens/ffa2e456-85c7-4005-b361-de79dc6b6dc7), [Attio](https://mobbin.com/screens/cf53b55b-c4a2-466c-a35a-c7c85fc7b09e) |
| `InlineField` | `components/inline-field.tsx` | [Attio](https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f), [Linear](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338), [Attio rail](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf), [Mercury iOS](https://mobbin.com/screens/f9663be0-06c0-48f7-9a94-26eaef8e1a7b), [Front](https://mobbin.com/screens/7dd16e14-0899-4b53-9525-a5fef2def520) |
| `FormSheet` (with pushed picker views) | `components/form-sheet.tsx` | [Stripe](https://mobbin.com/screens/d5400786-97c3-4029-a3e2-e21a9fa7735e), [Linear](https://mobbin.com/screens/ffa2e456-85c7-4005-b361-de79dc6b6dc7), [Linear Mobile](https://mobbin.com/screens/ec1708f2-bca4-4773-b726-95174912deaf), [Mercury iOS in-sheet steps](https://mobbin.com/screens/ede3cc07-012f-4e55-a5c7-7cbe8b7f5907), [Apple HIG sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) |
| `useKeyboardInset` | `components/use-keyboard-inset.ts` | [Mercury iOS](https://mobbin.com/screens/d2e0e2e1-1b27-4815-8d0d-37858dfe43f6), [Mercury iOS one-field sheet](https://mobbin.com/screens/f9663be0-06c0-48f7-9a94-26eaef8e1a7b), [Genie](https://mobbin.com/screens/22878822-8b60-42f3-a112-f2a6d5101469) |
| `ActionBar` | `components/action-bar.tsx` | [Shopify](https://mobbin.com/screens/cbe5200e-30c4-4f3e-bd4e-62ff2f44341c), [Chatbase](https://mobbin.com/screens/dc64e990-df30-4371-a3c6-a3e73e9370f2), [Etsy](https://mobbin.com/screens/e5476550-1c37-4475-8b07-b5d3e9c1e070), [Airbnb](https://mobbin.com/screens/a5b824a5-9249-4a59-b6c5-76eeb2f554f6) |
| `useDraft` | `components/use-draft.ts` | [Linear](https://mobbin.com/screens/7d2d62c7-8fb9-40d8-bd36-f1a8ff0a860c), [Eight Sleep](https://mobbin.com/screens/fa428b07-6761-47b3-ac2e-0978e82d72a2) |
| `ConflictError` | `lib/action-result.ts` | [Front](https://mobbin.com/screens/7dd16e14-0899-4b53-9525-a5fef2def520) (adapted from a merge), G2B-007 |

**Retired:** `SectionCard` (after its last caller), `LabeledField`, New deal's `Label`, `SelectChip`, `quietField`, `inlineFieldClass` and `noSpinnerClass`, `PriceInput`, the native `Select` in forms, the separate Repeats chip, `CONFLICT_MESSAGE`, the "Invalid x:" prefix in `userMessage`, the three-button discard dialog, pending label swaps, and full-page create as the default entry.

**`docs/components.md` rows that change:** "Pending action", "Section with view and edit modes", "Edit a heading in place" (to `InlineField`), "Inline save error", "Pick one from a list in a form" and "Select" (to `OptionPicker`), "Due date" and "Repeats" (Repeat inside), "Dialog with a form" (`FormSheet`), the LeaveGuard row (now every layout), "Checklist popover for a multi-pick filter" (moved to `components/`), the Duplicates rows for inline edit and text fields, and the "Form field layout" known gap (closed).

**Beyond the guidelines** (flagged for approval; no new colors, sizes or radii):

1. "(optional)" after a label in `text-meta` 400 `--fg-3`.
2. Prefix and suffix text inside a field in `text-body` `--fg-3`.
3. Codes typed into fields in Geist Mono at `text-body` (in code today, unwritten).
4. The sheet footer riding the on-screen keyboard (section 9 pins it above the safe area).
5. `ActionBar` on app pages, the job page's `--canvas` bar recipe.
6. The 12-year grid behind the calendar's month heading.
7. `LoaderCircle` as the one spinner glyph.
8. The step line over the checklist's progress bar on the public form.
9. Form groups drawn as `Section as="h3"` (an existing look in a new place).
10. Pushed picker views inside a sheet on touch, with a back arrow beside the X, so no picker stacks a second sheet (after Mercury's in-sheet steps).
11. The "Saves as $425,000" preview in the helper line while typing a number.
12. A save conflict shown on the one open field, in a neutral `--fg-2` line with two buttons (Front shows a merge conflict this way; none of the references shows a save conflict).
13. `ActionBar` hiding while the on-screen keyboard is up.

## 6. Open questions for Connor

Only what blocks building.

1. **Pick an option in each of 3.1 to 3.5.** The recommendation is A in all five.
2. **What does "Our price" mean: Max offer, or Target?** COPY-030 proposes "Asking price" and "Max offer". It blocks the New deal labels, the deal rail and the list header.
3. **Add an `updatedBy` column to Property and Deal?** `AppConfig` already has one. With it, a conflict reads "Pieter set this to $410,000 at 2:14 PM". Without it, "This changed to $410,000 at 2:14 PM". Settings already records who (`AppConfig.updatedBy`), so its conflicts name the person either way. It's a small migration, so it needs your OK.
4. **Which address provider for phase 2 suggestions:** Google Places, Mapbox or Smarty? Phase 1 suggests from HG's own properties and deals and ships without one. Each provider needs an API key in the env module and terms you accept.
