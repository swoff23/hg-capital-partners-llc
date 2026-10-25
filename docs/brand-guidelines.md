# HG brand guidelines: Ink and Limestone

The visual rulebook for HG Capital OS, the HG Jobs contractor portal and the public rentals site. It replaces the visual rules in CLAUDE.md's Personality and Typography sections. The copy, touch, reduced-motion and "every color has a job" rules there still stand.

Every ratio here is WCAG 2.x contrast, computed against the exact hex shown. "L / D" means light theme / dark theme.

## 1. The idea

HG is a property company first, so the system takes its materials from the buildings. **Limestone** is the ground: warm grays at gold's own hue for every surface, fill and line. **Ink** is the type: a deep navy for text and for the one action on a screen. **Gold** (`#c8a765`) signs the HG mark the way a brass plaque marks a front door. Real photographs of HG's own buildings are the color that identifies each property.

Light is ink on limestone. Dark is limestone on ink. The public site is always the dark version.

Calm alone reads generic. Mercury signs its calm with its own type and photography ([925 Studios](https://www.925studios.co/blog/mercury-design-breakdown)), and critics note the Linear look is everywhere ([LogRocket](https://blog.logrocket.com/ux-design/linear-design/)). HG signs with photos, gold and ledger-set figures.

## 2. Principles

1. **The buildings are the brand.** A property's front photo is its identity wherever it appears ([Airbnb listings](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c), [Zillow table](https://mobbin.com/screens/c84e5a02-a339-4398-aca6-62e505305f35)).
2. **Ink acts, limestone holds, gold signs.** Each material has one job. Vercel runs on one dark primary in a monochrome UI ([Vercel](https://mobbin.com/screens/ff81f1e9-25b1-46f9-8448-31fa40a77e4b)), and Geist gives each gray step one job ([Geist colors](https://vercel.com/geist/colors)).
3. **Color is state.** Surfaces stay about 95% neutral. Red is late or failed, amber is a partner's decision, green is done or money in ([Things 3](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58)).
4. **Typeset like a statement.** Tabular figures, right-aligned money, whole dollars, a true minus, rules under totals ([Mercury](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79)).
5. **Flat until it floats.** Sections are a heading over a hairline. Only menus, popovers, toasts, dialogs and sheets cast a shadow ([Stripe customer page](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786)).
6. **Selection never rests on a pale fill alone.** Every selected state carries a 3:1 mark (an ink notch, an ink underline or a control edge), so it survives sunlight on a job site.
7. **The system enforces itself.** Tokens over literals, one class per role, and lint rules for what can drift.

## 3. Typography

### Families

- **Geist** for all text: app, portal, public site, emails, the monogram. **Geist Mono** only for codes read character by character (lockbox, unit, SBL, loan, policy, account numbers) and keycaps.
- Both are already loaded through `next/font/google` in `src/app/layout.tsx` as variable fonts. Keep them. No new download, no re-measured rows, stable device-check baselines.
- Not Inter or Space Grotesk (the safe defaults), and no serif display (it lands in the cream-and-serif template, as [Midday](https://mobbin.com/screens/4bcceb63-2afc-42cd-8c0a-12123af41a42) shows).
- Money is never mono. Mono money reads as a trading terminal ([Kraken](https://mobbin.com/screens/2da9671f-45f5-4713-9f71-3b27e7f96c32)).

### App scale

One token per role. Desktop is `pointer: fine`; touch is `pointer: coarse` (phones and tablets). Each role is one class whose values swap in a single `@media (pointer: coarse)` block on `:root`, so no call site needs a touch variant.

| Token (class) | Desktop | Touch | Weight | Tracking | Used for |
|---|---|---|---|---|---|
| `text-title` | 24 / 32 | 28 / 34 | 600 | -0.015em | One h1 per page. Record titles wrap, never clip |
| `text-section` | 16 / 24 | 17 / 24 | 600 | -0.005em | Section heading over a hairline; dialog and sheet titles |
| `text-body` | 14 / 20 | 16 / 22 | 400 | 0 | Row titles, cells, inputs, paragraphs (65ch max) |
| `text-label` | 14 / 20 | 16 / 22 | 500 | 0 | Buttons, nav, tabs, segments. Same weight selected or not |
| `text-meta` | 13 / 18 | 14 / 20 | 400 | 0 | Sublabels, table headers (at 500), timestamps, helper text |
| `text-micro` | 12 / 16 | 12 / 16 | 500 | +0.01em | Badges, keycaps, photo counters. The floor |
| `text-figure-l` | 28 / 36 | 28 / 36 | 500 | -0.02em | A record's key figure, the KPI strip |
| `text-figure-m` | 20 / 28 | 20 / 28 | 500 | -0.01em | Summary strips, the record fact strip |
| `text-code` | Mono 13 / 20 | Mono 15 / 20 | 400 | 0 | Codes in rails and cells |
| `text-code-l` | Mono 28 / 36 | Mono 28 / 36 | 500 | +0.06em | Lockbox code on the job page and in Access |

```css
@theme {
  --text-body: 0.875rem; --text-body--line-height: 1.25rem;
  /* ...one block per role, with --font-weight and --letter-spacing */
}
@media (pointer: coarse) {
  :root { --text-body: 1rem; --text-body--line-height: 1.375rem; /* ... */ }
}
.text-figure-l, .text-figure-m { font-variant-numeric: tabular-nums; }
```

- Type tokens go in `@theme`, not `@theme inline`, so each utility reads the variable and the one `pointer: coarse` block reaches every call site.
- A `--text-*` token carries size, line height, weight and tracking only. `text-code` and `text-code-l` pair with `font-mono` (the `Code` component sets both), and the figure tokens get tabular figures from the plain rule above.
- The phone title collapse: once the page h1 scrolls under the 52px phone top bar, the bar shows the title at 17 / 22, 600.
- Nothing under 12px anywhere. Touch inputs stay 16px (the existing iOS guard in `globals.css`).
- Weight carries hierarchy, never state. Figures get hierarchy from size and position, not weight, as Mercury does.
- No uppercase in the app. Table headers and field labels are sentence case at `text-meta`.
- `text-wrap: balance` on titles, `pretty` on body copy.

### Figures, money and codes

- **Tabular by default.** `font-variant-numeric: tabular-nums` on `td`, `th`, `.num` and every figure token, set globally so alignment never depends on a utility.
- **Right-aligned** money and count columns, with headers aligned to match ([Mercury Books](https://mobbin.com/screens/91ad4bbc-ef0f-4edf-a79f-fc6b9cb4ab7c)).
- **Whole dollars** in totals, KPIs, lists, rent and prices: `$425,000`, `$1,450/mo`. `$425k` only on chart axes.
- **Cents** only on a single transaction line and a bill's key figure: `.cents { font-size: 0.62em; vertical-align: 0.27em; }`, which lifts them to the cap line, in the figure's own color ([Mercury iOS](https://mobbin.com/screens/82e8f14d-9bf6-4956-bb4d-8d9306d167d3)).
- **Signs.** Money out takes a true minus (U+2212) in `--fg-1`. Money in is `--ok` with no plus, on transaction lines only.
- **Failed amount.** Struck through in `--fg-3`, beside a danger-tint "Failed" badge ([Mercury](https://mobbin.com/screens/3e5ccd40-7dbf-4fb4-a26d-915180a2cd64)).
- **Statement rules.** A subtotal row takes a 1px `--line-strong` rule above and weight 600. A grand total (NOI, the rent roll total, a breakdown's net) takes a 1px `--fg-1` rule above and a double rule below (`border-bottom: 3px double var(--fg-1)`), as QuickBooks and Mercury rule their P&L ([QuickBooks](https://mobbin.com/screens/9717816c-36a8-4661-b49f-e4f6ebe98a14), [Mercury](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4)).
- **Period and source.** Every figure block states both in `text-meta` `--fg-3`: "Jan to Sep 2026 · QuickBooks, synced 6h ago".
- **Empty values.** An empty cell is the lone dash glyph (U+2014) in `--fg-3`. An empty rail fact is a verb ("Add lender"). A missing feed is a sentence ("No QuickBooks lines for Sep yet"), never `$0`.
- **Codes** are `text-code` in `--fg-2`, never colored, never wrapped mid-token, copied with one tap. Account numbers mask as `•• 2502` with reveal ([Mercury](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930)).
- **Dates** come from one Eastern-time formatter: Today, Tomorrow, a weekday within six days, then "Oct 30", with the year only when it isn't this year. Overdue shows the real date in `--danger`.

## 4. Color

Two OKLCH ramps, so light and dark come from the same steps ([Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui), [Stripe accessible color](https://stripe.com/blog/accessible-color-systems)):

- **Limestone:** hue 80 to 95, chroma 0.011 or less. Warm gray, not cream. The one warmer step is dark `--chart-1` (chroma 0.019), so the series reads apart from text.
- **Ink:** hue 256 to 266. Grounds (dark canvas through `--line-strong`) stay at chroma 0.026 or less; type and the action reach 0.045. Two tints go past the ground limit on purpose: dark `--select` (0.037) and light `--chart-1` (0.060). A brighter navy ground is a regression toward generic dark fintech ([Copilot](https://mobbin.com/screens/1bfa784d-99eb-4850-88e2-4064d4d06452)).
- **Lines belong to the ground, type belongs to the ink.** Light lines are warm, light text is cool; dark lines are cool, dark text is warm.

Tokens live on `:root` (light) and `:root[data-theme="dark"]`, mapped in `@theme inline` as `--color-*`. Text tokens are `fg-*`, so utilities read `text-fg-2`.

### Neutrals

| Token | Light | Dark | One job | Contrast L / D |
|---|---|---|---|---|
| `--canvas` | `#f8f7f3` | `#0a0e17` | Chrome: sidebar, phone bars, public page ground | `--fg-1` 15.10 / 15.94 |
| `--surface` | `#ffffff` | `#0f141e` | Work surface and `body` | `--fg-1` 16.19 / 15.22 |
| `--raised` | `#ffffff` | `#161d28` | Menus, popovers, dialogs, sheets | `--fg-1` 16.19 / 13.98 |
| `--fill-1` | `#f2f0ec` | `#181e2a` | Row hover, segmented track, meter track, keycap, photo placeholder | `--fg-1` 14.22 / 13.79; `--fg-3` 5.17 / 6.25; 1.14 / 1.10 vs surface |
| `--fill-2` | `#e7e5e0` | `#212835` | Current nav item, menu highlight, avatar ground | `--fg-1` 12.86 / 12.22; `--fg-3` 4.68 / 5.54 |
| `--select` | `#e4e9f0` | `#2a3548` | `::selection`, bulk-selected rows | `--fg-1` 13.27 / 10.19; `--fg-3` 4.82 / 4.62 |
| `--line` | `#e7e5e0` | `#212835` | Hairlines, row dividers, card edges (decorative) | 1.26 / 1.25 vs surface |
| `--line-strong` | `#d5d1ca` | `#323947` | Secondary button edge, header and subtotal rules, keycap edges, and floating-layer edges in dark (decorative) | 1.52 / 1.59 vs surface |
| `--line-control` | `#84817a` | `#6e7684` | Edge of fields, checkboxes, radios, switch-off track; selected segment edge; chart reference line | 3.89 / 4.03 surface; 3.63 / 4.22 canvas; 3.42 / 3.65 fill-1; 3.09 / 3.23 fill-2; 3.70 dark raised |
| `--fg-3` | `#5b6576` | `#a19e98` | Meta, placeholders, idle icons, the empty dash | 5.89 / 6.90 surface; floor 4.68 on light fill-2, 4.62 on dark select |
| `--fg-2` | `#424e61` | `#c0bdb7` | Labels, secondary values, idle nav, codes | 8.42 / 9.84 surface; floor 6.69 on light fill-2, 6.59 on dark select |
| `--fg-1` | `#152133` | `#ece9e4` | Primary text, headings, figures, links | 16.19 / 15.22 surface; floor 12.86 / 10.19 |

- A "floor" is the lowest ratio across every ground in this table (canvas, surface, raised, fill-1, fill-2, select). Light floors sit on `--fill-2`; dark floors sit on `--select`.
- `--line-control` passes 3:1 on every ground but one: dark `--select` (2.70; light is 3.19). The only control on a selected row is its checked box, which reads by its `--act` fill (10.19).
- Hover inside a raised layer (menu, listbox) uses `--fill-2` (1.14 vs dark raised); `--fill-1` there is invisible in dark (1.01).
- Dark surfaces brighten as they rise. Nothing nests a darker well inside a lighter card (review VISUAL-023).

### Act (ink)

| Token | Light | Dark | One job | Contrast L / D |
|---|---|---|---|---|
| `--act` | `#152133` | `#ece9e4` | Primary fill, checked control, tab underline, nav notch, unread dot, focus ring | 16.19 / 15.22 vs surface; 12.86 / 12.22 vs fill-2 |
| `--on-act` | `#ffffff` | `#0f141e` | Label and icon on `--act` | 16.19 / 15.22 |
| `--act-hover` | `#28364d` | `#d3d1cb` | Primary hover and pressed | `--on-act` 12.17 / 12.07 |

- No blue anywhere. The primary is ink in light and limestone in dark, the inversion Vercel's dark dashboard uses ([Vercel dark](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54)). It fixes today's dark primary (white on blue-500, 3.68:1).
- A link is the same ink as body text (1.00 against `--fg-1`, 1.92 / 1.55 against `--fg-2`), so a link in a sentence always carries an underline (WCAG 1.4.1). See TextLink.
- Focus: 2px `--act` outline, 2px offset in `--surface`, so it stays visible around an ink button. Inside the toast the outline is `--toast-fg`, since ink on the ink toast would vanish.

### Status

| Token | Light | Dark | One job | Contrast L / D |
|---|---|---|---|---|
| `--danger` | `#b91c1c` | `#f47b76` | Overdue date, failed upload or sync, destructive text | 6.47 / 6.97 surface; floor 5.14 light fill-2, 4.67 dark select |
| `--danger-tint` | `#fff2f1` | `#341817` | Failed badge ground | `--danger` on it 5.92 / 6.16 |
| `--danger-fill` | `#b91c1c` | `#c92f33` | Confirmed destructive button | `--on-danger` on it 6.47 / 5.33 |
| `--danger-fill-hover` | `#a31818` | `#b3292d` | Its hover | `--on-danger` on it 7.77 / 6.42 |
| `--on-danger` | `#ffffff` | `#ffffff` | Label and icon on `--danger-fill` | as above |
| `--warn` | `#a54e09` | `#f7a059` | A partner must decide: Review, stale sync, missing key fact | 5.69 / 8.89 surface; floor 4.52 light fill-2, 5.95 dark select |
| `--warn-tint` | `#fff5ec` | `#321f0f` | Decision badge ground | `--warn` on it 5.29 / 7.57 |
| `--ok` | `#1d7038` | `#6ad18a` | Done, paid, money in | 6.13 / 9.74 surface; floor 4.87 light fill-2, 6.52 dark select |
| `--ok-tint` | `#eff9f1` | `#142619` | Done badge ground | `--ok` on it 5.69 / 8.40 |

- `--warn` and `--danger` are only 1.14 / 1.28 apart, so a status is always a glyph plus a word. Color is never the only signal.
- Warn sits at hue 50 (light) and 58 (dark) at chroma 0.134, burnt orange. Gold sits at hue 84 at chroma 0.093. Tailwind amber-400 is ruled out because its hue (84.4) is gold's.
- Status colors never decorate: no chart fills, avatar grounds or icon tints outside a status mark.

### Brand

| Token | Value | One job | Contrast |
|---|---|---|---|
| `--gold` | `#c8a765` (both) | Monogram letters, the one fill in payoff art, public eyebrow and hover | 7.07 on ink tile; 8.05 dark surface; 8.43 dark canvas; 2.29 on white, so never on a light ground |
| `--gold-deep` | `#86662c` | Gold on a light page: the rule on printed reports, PDFs and email letterhead | 5.32 white; 4.96 canvas |
| `--ink-tile` | `#152133` | Monogram ground everywhere | 1.19 vs dark canvas, so it takes a 1px `--line` edge on dark |

- In the app, gold appears three ways only: the monogram, the payoff art fill and the rule on outgoing documents. Never in rows, badges, pills, dots, charts or buttons, and never interactive.

### Toast, chart and selection

| Token | Light | Dark | Job | Contrast L / D |
|---|---|---|---|---|
| `--toast-bg` | `#152133` | `#212835` | Toast pill (dark gets a 1px `--line-strong` edge) | base |
| `--toast-fg` | `#ffffff` | `#ece9e4` | Toast message and Undo | 16.19 / 12.22 |
| `--toast-fg-2` | `#c0bdb7` | `#c0bdb7` | Toast's ripple clause | 8.64 / 7.89 |
| `--toast-hover` | `rgb(255 255 255 / 0.1)` | same | Undo hover fill (desktop only) | decorative |
| `--chart-1` | `#384e6e` | `#d7d0c3` | Current period, actuals | 8.46 / 12.03 surface |
| `--chart-ref` | `--line-control`, dashed 1.5px | same | Prior period or budget | 3.89 / 4.03 |
| over budget | `--danger` | `--danger` | Only the part that is over | 6.47 / 6.97 |

Photo marks sit on pixels nobody controls, so their tokens are fixed and do not change with the theme.

| Token | Value (both themes) | Job | Contrast |
|---|---|---|---|
| `--pill-bg` | `rgb(255 255 255 / 0.94)` | Status pill and Retry pill on a photo | base |
| `--pill-fg` | `#152133` | Their label and icon | 14.21 even over a black pixel |
| `--photo-scrim` | `rgb(10 14 23 / 0.72)` | Photo counter ground; the hero's bottom scrim at its darkest | base |
| `--on-photo` | `#ece9e4` | Counter text, hero headline over the scrim | 6.54 even over a white pixel |

- Never `--fg-1` on a photo pill: in dark it is limestone, and limestone on the white pill drops to 1.06 to 1.21.

- Charts carry one series in color plus a dashed reference, labeled directly. No gold, no rainbow series; multi-property comparisons are tables ([Vercel analytics](https://mobbin.com/screens/900542f7-c157-4445-8f88-d79dca719c7a)).
- Set `color-scheme: light` and `color-scheme: dark` per theme so native menus and pickers follow (VISUAL-024), and `::selection` to `--select`.

### The public site palette

The public site is the app's dark theme, fixed. `(marketing)/layout.tsx` sets `data-surface="public"` on its wrapper, and `globals.css` writes the dark block once under `:root[data-theme="dark"], [data-surface="public"]` with `color-scheme: dark`, so the public site ignores the theme toggle. Two more rules keep it dark:

- The `dark:` variant also matches the public surface: `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, [data-surface="public"], [data-surface="public"] *));`
- React Aria portals overlays to `<body>`, outside the wrapper, so any dialog, sheet, menu or lightbox opened on the public site puts `data-surface="public"` on its own overlay root.

Two tokens are public-only.

| Role | Token | Hex | Contrast |
|---|---|---|---|
| Page ground | `--canvas` | `#0a0e17` | base |
| Fact tiles, fields, notices | `--surface` | `#0f141e` | base |
| Headlines, body, wordmark | `--fg-1` | `#ece9e4` | 15.94 canvas / 15.22 surface |
| Lead, nav, card meta, second clause | `--fg-3` | `#a19e98` | 7.22 / 6.90 |
| Field outlines | `--line-control` | `#6e7684` | 4.22 / 4.03 |
| Hairlines (decorative) | `--line` | `#212835` | 1.30 / 1.25 |
| HG Login, legal lines, placeholders | `--pub-faint` | `#858991` | 5.50 / 5.25 |
| Eyebrow, link hover, CTA hover fill | `--gold` | `#c8a765` | 8.43 / 8.05 |
| Pressed gold link | `--pub-gold-hi` | `#d8ba7e` | 10.33 / 9.87 |
| Form errors | `--danger` | `#f47b76` | 7.30 / 6.97 |
| CTA | `--act` fill, `--on-act` label | `#ece9e4` / `#0f141e` | 15.22; on gold hover 8.05 |

- Text over a photo is `--on-photo` at 18px or larger over a bottom scrim that runs from `--photo-scrim` at the bottom edge to transparent at 62% of the height: 6.54 even over a white pixel. Gold and `--fg-3` never sit on a photo.
- Today's `#4c525c` (HG Login, placeholders, 2.50) and `#454b55` (footer, 2.24) fail on today's `#080b12`; `--pub-faint` replaces both.

## 5. Shape, space and elevation

**Radius.** Rectilinear, like the buildings. Tailwind v4's own steps; never redefine `--radius-*`. Each component moves down one class from today.

| Class | px | Used for | Today |
|---|---|---|---|
| `rounded-sm` | 4 | Badges, checkboxes, keycaps, menu item highlight, photos 32px and under | `rounded-md` |
| `rounded-md` | 6 | Buttons, inputs, selects, chips, segmented control | `rounded-lg` |
| `rounded-lg` | 8 | Cards, menus, popovers, toasts, photos over 32px, public listing photos | `rounded-xl`, `rounded-2xl` |
| `rounded-xl` | 12 | Dialogs, phone sheet top corners | new |
| `rounded-full` | | Avatars, status dots, switch tracks, the photo status pill. Never buttons | same |

**Spacing.** 4px base: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Page gutters 32 desktop, 24 tablet, 16 phone. Sections 32 apart (24 on touch); 12 between a heading's rule and its content.
- Lists run full width to 1600, anchored to the sidebar. Records cap at 1200 with a 320 rail.
- The first table cell aligns with the page gutter, so the h1, the header and column one share an edge.

**Density.**
- Rows 40px with a mouse, 48px on touch; two-line phone rows 60px.
- Below 480px a row keeps two lines: its trailing button drops (the whole row opens the item), and the subline keeps status, place and date. Secondary clauses ("Luis marked it done · 4 photos", "2 bd · 1 ba", "/mo" on unit rows) drop rather than wrap.
- Photo rows: Portfolio 56px (48x36 photo); contractor job cards 72px.
- Record fact strip: four facts in one row split by `--line` rules, 16px in from each rule; a 2 by 2 grid on phones so no label wraps.
- Detail rails: a 112px label column, 96px on phones.
- Controls 32px (sm) and 36px (md) with a mouse; 44px minimum on touch (`TOUCH_HEIGHT`).

**Borders.** All 1px. `--line` separates, `--line-strong` rules, `--line-control` identifies a control. The only 2px marks are focus, the tab underline and the nav notch. No colored rails on cards.

**Elevation.** Flat in the page flow. Shadow color is ink, not black.

| Level | Light | Dark | Used for |
|---|---|---|---|
| Flat | `--line` edge, no shadow | same | Sections, cards, tables, inputs, bars |
| Float | `--raised`, `--line` edge, `0 8px 24px -4px rgb(21 33 51 / 0.14)` | `--raised`, `--line-strong` edge, `0 8px 24px -6px rgb(0 0 0 / 0.5)` | Menus, popovers, toasts, command palette |
| Overlay | `0 24px 64px -12px rgb(21 33 51 / 0.28)` over scrim `rgb(10 14 23 / 0.45)` | `0 24px 64px -12px rgb(0 0 0 / 0.7)` over `rgb(0 0 0 / 0.6)` | Dialogs, sheets, drawers |
| Photo edge | `inset 0 0 0 1px rgb(21 33 51 / 0.08)` | `inset 0 0 0 1px rgb(236 233 228 / 0.08)` | Every photo, so a pale facade doesn't bleed |

## 6. Icons and imagery

### Icons

- lucide-react (installed): 16px at 1.5 stroke with a mouse, 20px at 1.75 on touch, 14px inside badges.
- Idle `--fg-3`, hover and current `--fg-1`, inside a primary button `--on-act`. Only a status icon takes a status color.
- The status ring family is the one drawn set, on lucide's grid and stroke.
- No emoji, no icon tiles, no typed glyphs standing in for icons (`+`, `↗`, `✕`). Linear removed its colored icon tiles for the same reason ([Linear refresh](https://linear.app/now/behind-the-latest-design-refresh)).

### HG monogram and wordmarks

- **Monogram.** "HG" in Geist 600 at -0.04em, `--gold` on an `--ink-tile` square. Radius 22% of the size (6px at 24, 7px at 32); full bleed at 180 for `apple-icon`, where iOS masks it.
- **Sizes.** 16 favicon (the minimum), 24 sidebar and phone top bar, 32 portal header and emails, 180 `apple-icon`, 512 home-screen icon. Clear space is 25% of the tile on every side.
- **On dark grounds** the tile keeps its ink and adds a 1px `--line` edge. It is never redrawn as gold letters alone ([Mercury tile](https://mobbin.com/screens/d575358b-679b-4d52-aa98-5026970291b3)).
- **Wordmarks.** App: tile plus "HG Capital" in `text-label` 600 `--fg-1`; on phones the words drop. Portal: "HG Jobs". Public: "HG CAPITAL PARTNERS" in Geist 500, 13px caps at 0.28em. Emails and PDFs: tile plus "HG Capital Partners" over a 1px `--gold-deep` rule. Never "HG Capital OS".
- **Never** gold text on a light ground, gold gradients or foil, a blue or white tile, the letters on a photo without their tile, or the monogram as a bullet.

### Photography

HG's own buildings only. No stock, no AI imagery, no virtual staging.

- **The 11 identity photos are a launch prerequisite.** Shot list: the front elevation, straight on, from across the street at chest height with the camera grid on; verticals straight; daylight or soft overcast; no people; plates blurred; no HDR halos, filters or sky replacement; one warm-neutral white balance for the set.
- **Listing set** (five minimum before a listing goes public): exterior three-quarter, entry, then each unit's main room, kitchen and bath.
- **Crops.** 4:3 for thumbnails and cards; 16:9 for the phone record and the job page. The public hero is 21:9 at 1280, 16:9 at 768 and 4:3 at 375.
- **Sizes.** None in the sidebar. 32px in search and Home rows. 48x36 in Portfolio rows. 96x72 in the record header. Full-width 16:9 on the phone property page and the job page, because the person holding the phone is often standing at the building ([Zillow header](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd)).
- **Loading.** `next/image` over a `--fill-1` placeholder, 200ms fade.
- **Fallback.** A `--fill-1` tile at the same size and radius, with the photo edge and lucide `House` at 1.5 stroke in `--fg-3` at 40% of the tile height ([Zillow](https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430)). Until the photos exist this tile carries every row, so it must look finished.
- **Status on a photo.** A `--pill-bg` pill with a `--pill-fg` label (14.21 even over black), `rounded-full`, 24px tall, 8px side padding, `text-micro`, 12px in from the top-left, only when the state needs attention ("Vacant Nov 1", "Leased" on the public site) ([Airbnb](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c)).
- **Photo counter.** "1 / 8" in `--on-photo` on `--photo-scrim`, same pill shape, 12px in from the bottom-right, tabular.
- **Alt text** names the place: "Front of 767 Prospect Ave".

### Payoff line art

- Five drawings, shipped one at a time: a Buffalo double with a porch (all clear), a clipboard with a check (job done), a key on a ring (move-in report sent), an envelope with a roofline (request sent), an open ledger (month closed).
- 1.5px `--fg-1` strokes on a 96px grid (72 on phone) with exactly one `--gold` fill per drawing: a door, a porch light, a key bow ([Gusto](https://mobbin.com/screens/f74caf21-298d-44dc-af95-bd86acc044db)).
- Inline SVG, `aria-hidden`, colors from tokens so it follows the theme.
- Only on payoff and empty-queue moments. Never in rows, toasts or dialogs; a finished task gets the check spring instead ([Airbnb Today](https://mobbin.com/screens/3a9a1f0c-c768-45b8-b3e0-f4d0d02698ad)).
- A payoff tied to a property shows that property's photo instead of art.

## 7. Motion

| Token | Value | Used for |
|---|---|---|
| `--dur-0` | 0ms | Menus, the command palette, tab switches ([Rauno Freiberg](https://rauno.me/craft/interaction-design)) |
| `--dur-fast` | 120ms ease-out | Hover, press, color changes, every exit |
| `--dur-base` | 160ms `--ease-spring` | Popover and dialog pop-in, scale 0.97 to 1 |
| `--dur-toast` | 220ms `--ease-spring` | Toast rise, 8px |
| `--dur-sheet` | 260ms `--ease-spring` | Sheets and side panels |
| `--dur-photo` | 200ms ease-out | Photo fade-in |
| `--dur-check` | 180ms `--ease-spring` | Check ring fill, scale 0.9 to 1 |
| `--ease-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` | Today's overlay curve, kept |

- Spinners show after 200ms and stay at least 400ms; buttons keep their label while loading ([Vercel guidelines](https://vercel.com/design/guidelines)).
- Skeletons match the finished layout, draw labels at once and hold values in static `--fill-1`. No shimmer.
- Figures never count up or roll. A changed figure crossfades in 120ms.
- Line art may draw its strokes once (600ms) on first view. That is the only loop-like motion.
- `prefers-reduced-motion: reduce` turns everything into an opacity change of 120ms or less and skips the draw-in. One global block in `globals.css` (VISUAL-056).

## 8. Voice and tone

Plain, specific and warm, like a well-run property office that keeps good books. Names and places carry the warmth ([Monzo](https://monzo.com/tone-of-voice/)).

| Do | Don't |
|---|---|
| "Hi Connor. 3 things need you today." | "Welcome back! Here's your personalized dashboard." |
| "Moved to Fri, Oct 30 · Zack gets an email" | "Task updated successfully!" |
| "No QuickBooks lines for Sep yet. Last sync 6h ago." | "$0.00", or "Oops, something went wrong." |
| "Delete Unit 3 at 767 Prospect Ave" | "Are you sure?" |

The CLAUDE.md copy rules still apply: no em dashes, no filler, one-line helper text, no emoji, exclamation points only on a sent screen's thank-you heading, internal caveats in code comments.

## 9. Components

Everything here reuses or extends what is in `src/components/` (see `docs/components.md`). New primitives are marked **new** and get a row in `docs/components.md` in the same commit.

### Buttons

| Variant | Fill | Label | Edge | Hover | Use |
|---|---|---|---|---|---|
| `primary` | `--act` | `--on-act` | none | `--act-hover` | One per view: the next step |
| `secondary` | `--surface` | `--fg-1` | `--line-strong` | `--fill-1` | Everything else |
| `ghost` | none | `--fg-2` | none | `--fill-1`, label `--fg-1` | Toolbars, row actions |
| `danger` | `--surface` | `--danger` | `--line-strong` | `--danger-tint` | First step of a destructive action, row menus |
| `destructive` | `--danger-fill` | `--on-danger` | none | `--danger-fill-hover` | The confirm button only, naming what goes ([Lindy](https://mobbin.com/screens/541ad8e0-1d7d-441b-bbf7-daf3e59e76d3)) |

- `rounded-md`, `text-label`, 16px icons with a 6px gap, `sm` 32px with 10px side padding and `md` 36px with 14px, 44px on touch. Icon-only buttons are square. No pill buttons; `hover:opacity-90` goes. Hover fills sit under `@media (hover: hover)`.
- Disabled: 50% opacity, no hover, and a disabled primary always has a one-line reason under it.

### Inputs and controls

- **Fields** (Input, Textarea, Select): `--surface`, 1px `--line-control`, `rounded-md`, 36px (44 touch), 10px side padding (32px on the left when a search icon leads), `text-body`, placeholder `--fg-3`.
- **Focus:** the edge turns `--act` plus a 1px inset `--act` ring, in place of the global outline. **Error:** `--danger` edge, the inset ring turns `--danger` on focus, and one `--danger` line under the field.
- **Labels** sit above in `text-meta` 500 `--fg-2`, sentence case, 6px above the field. Helper text is one line of `text-meta` `--fg-3`.
- **Checkbox and radio:** 16px, `--surface` with a `--line-control` edge; checked is `--act` fill and edge with an `--on-act` mark. **Switch:** a 32 by 18 track with a 12px knob. Off is `--surface` with a `--line-control` edge and knob; on is an `--act` track with an `--on-act` knob.
- **Segmented control:** `--fill-1` track, `rounded-md`, 2px padding and 2px between segments; segments are `rounded-sm` and 4px shorter than the control. The selected segment is `--surface` with a `--line-control` edge (3.42 / 3.65 vs the track), same weight, `aria-pressed`.
- **Menus and listboxes:** hover and keyboard focus use `--fill-2`; the chosen option carries a lucide `Check` in `--fg-1` at its trailing edge, so the pick never rests on a fill.
- **Tabs** (`TopTabs`): idle `--fg-2`, selected `--fg-1` with a 2px `--act` underline, both 500, counts in `--fg-3`; `role="tab"` and `aria-selected`. The row clips at a `--line` divider.
- **Sidebar:** `--canvas`. Items 32px, `rounded-md`. Idle label `--fg-2`, icon `--fg-3`, hover `--fill-1`. Current item: `--fill-2`, label and icon `--fg-1`, and a 2px by 16px `--act` notch at the left edge (12.86 / 12.22). The notch is invented: references select with a fill alone at about 1.2:1.
- **Phone tab bar:** `--canvas` with a `--line` rule above. 20px `--fg-3` icons over 12 / 16 500 labels in `--fg-2`. The current tab is `--fg-1` with a 16 by 2px `--act` notch on the bar's top edge.
- **TextLink** (**new**, `ui.tsx`): inherits `--fg-1`, solid 1px underline at a 3px offset, 2px on hover. Required for every link in a sentence. Standalone links (breadcrumbs, "See all") are known by position and underline on hover.
- **Kbd** (**new**, `ui.tsx`): Geist Mono 12px, 20px tall, 20px minimum width, `rounded-sm`, `--fill-1` with a `--line-strong` edge, `--fg-3` glyph (5.17 / 6.25). Printed in menus, the command palette, Find (⌘K) and dialog footers ("Cancel Esc", "Create task ⌘↵") ([Linear menu](https://mobbin.com/screens/83e65fd8-259c-4568-8fa6-5a2269ed4123), [Vercel switcher](https://mobbin.com/screens/63496168-dbae-470d-9039-6883d8d1e479)). Hidden under `pointer: coarse`; touch gets the same actions as visible buttons.

### Badges and status marks

- **StatusMark** (**new**, `status-badge.tsx`): the ring family at 14px (16 touch), 1.5 stroke ([Linear Mobile](https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690)).

| Status | Glyph | Tone |
|---|---|---|
| To do | Empty ring | `--fg-3` |
| Scheduled | Ring with clock hands | `--fg-3` |
| In progress | Half ring | `--fg-2` |
| Waiting | Ring with pause bars | `--fg-3` |
| Review | Three-quarter ring | `--warn` |
| Done | Filled ring with check | `--ok` |
| Canceled | Slashed ring, title struck in `--fg-3` | `--fg-3` |

- Every status reads as glyph plus one word in a fixed column on every row ([Vercel](https://mobbin.com/screens/b95a75d7-02f8-4b45-9147-b8251441ca75)). Red belongs to the overdue date alone. Below 480px the word drops from the column and leads the row's subline instead ("Review · 56 Tamarack St"), in the mark's tone.
- **Waiting with a reason** shows the pause ring and the reason ("Waiting on Zack's quote") in the same column, in `--fg-3`, truncated. Today's amber reason badge in `task-row.tsx` goes, so amber stays a partner's decision.
- **Internal comments** on the task page move from amber to a `--fill-1` card with the lucide `Lock` carrying the meaning (`activity.tsx`), so they never read as Review.
- Every task status renders through `StatusBadge` and its one tone map in `status-badge.tsx`; no other file picks a status color.
- A system item in Needs you (a stale sync, a missing key fact) takes the lucide icon of the thing at the mark's size, 2 stroke, in `--warn`: `RefreshCw` plus "Stale" for a sync.
- Deal stages and the property lifecycle reuse the ring, filling by stage in `--fg-2`; Closed is `--ok`, Passed is the slashed ring.
- **Badge:** `rounded-sm`, `text-micro`, 20px tall, no ring. Tones: `neutral` (`--fg-2` on `--fill-1`, 7.40 / 8.91), `danger`, `warn`, `ok` (tint grounds). Blue and purple are retired.
- **Tags:** no fill, a `--line-strong` edge, `--fg-2` text, `rounded-sm`, `text-micro`, 22px tall with 8px side padding.
- **Unread dot:** 8px `--act`, 12px in from a card's top and right edges. It means new and nothing else.

### Tables and money

- `Table` drops its 70vh box; the page scrolls (VISUAL-V02).
- `Th`: sticky on `--surface` under a `--line-strong` rule, `text-meta` 500 `--fg-3`, sentence case, no gray band.
- `Th` and `Td` take a `numeric` prop: right-aligned, tabular. Rows are 40 / 48px on `--line` dividers, hover `--fill-1`, and the whole row is the link.
- A footer row counts and sums ([Attio](https://mobbin.com/screens/fdc76916-ff87-4e2a-8256-80939ffa935c)), with statement rules on finance screens.
- **Money** (**new**, `src/components/money.tsx`): whole dollars by default, a `cents` prop for transaction lines, true minus, inflow `--ok`, a `failed` state.
- **Code** (**new**, `src/components/code.tsx`): `text-code` `--fg-2`, one-tap copy, a toast naming what was copied ("Lockbox code copied"), optional mask.

### Counted lists

- A count is never a field. The property's Units tab lists one row per unit, with Add unit as the last row and Delete in each row's ⋯ menu ([Airbnb](https://mobbin.com/screens/d36ad23a-5c7b-45b8-a8d8-0793594ed0ce), [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb)).
- The subline's "2 units" is always the row count. The same holds for every count shown on a record.

### Cards and sections

- **Section** (replaces `SectionCard`): a `text-section` heading and its actions over a `--line` rule. No box, no title bar.
- **Card:** `--surface`, 1px `--line`, `rounded-lg`, no shadow, 16px padding. Only for Home and Overview modules and public fact tiles ([Mercury home](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1)).

### Photos

- **PhotoThumb** (**new**, `src/components/photo-thumb.tsx`): the sizes, fallback tile, photo edge and fade above.
- **Failed upload:** the thumbnail stays in the grid with a 2px inset `--danger` ring (it replaces the photo edge) and an inline Retry pill (`--pill-bg`, `--pill-fg`, 32px tall, 14px label, 14px `RotateCcw`, 44px hit area) 8px above its bottom center ([HBO Max](https://mobbin.com/screens/2c6b51a6-80b2-40f0-8513-83e693c55da3)).
- While any photo has failed, Mark done stays disabled above one `--danger` line: "2 photos didn't upload · Retry".

### Dialogs and sheets

- **Dialog:** `--raised`, `rounded-xl`, overlay shadow and scrim. The title names the object; the body is one sentence of consequence.
- Cancel and the primary sit bottom right with their keys. A destructive confirm uses `destructive` and names what goes ([Relume](https://mobbin.com/screens/4bc93d85-683e-4461-8e1a-fd1b519f240d)).
- **Sheet (phone):** `rounded-xl` top corners, title, content, and the primary pinned above the safe area. Esc closes one layer.

### Toasts

- The toast pill (`--toast-*`, `rounded-lg`, float shadow): bottom-left on desktop, full width above the bottom bar on phone.
- One line names the change and its ripple; Undo stays 5 seconds and pauses on hover or focus ([Superhuman](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5)).

### Empty and payoff states

- **Empty:** one sentence saying what happens next, one action. No dashed box.
- **Payoff:** the property photo or line art, a warm heading, what happens next with a date, then the next item ([Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c)). Example: the property photo, "Thanks, Zack!", "Sent to Connor and Pieter. You'll hear back by email.", Next job.
- **Monogram** (**new**, `src/components/monogram.tsx`) and **SpotArt** (**new**, `src/components/spot-art.tsx`) ship with this section.

## 10. The public site

The dark front door stays and becomes the app's own dark material. Same Geist, set lighter and larger, over real photographs ([Samara](https://mobbin.com/sites/sections/46eec167-28cb-4329-8e8e-ee9b36f7f056)).

| Role | 1280 | 768 | 375 | Weight | Tracking | Notes |
|---|---|---|---|---|---|---|
| Display | 56 / 60 | 44 / 48 | 34 / 40 | 400 | -0.03em | Hero headline; second clause in `--fg-3` |
| Heading | 28 / 34 | 28 / 34 | 24 / 30 | 400 | -0.02em | Page h1 on Rentals and Residents |
| Eyebrow | 12 / 16 | 12 / 16 | 12 / 16 | 500 | 0.28em caps | `--gold`, one per page, carrying a real fact: "Rentals · 2 available" |
| Lead | 18 / 28 | 18 / 28 | 16 / 24 | 400 | 0 | `--fg-3`, one paragraph at most |
| Card title | 16 / 24 | 16 / 24 | 16 / 24 | 500 | 0 | Listing street |
| Card meta | 14 / 20 | 14 / 20 | 14 / 20 | 400 | 0 | "2 bd · 1 ba · 950 sq ft", tabular `--fg-3` |
| Wordmark | 13 / 16 | 13 / 16 | 13 / 16 | 500 | 0.28em caps | "HG CAPITAL PARTNERS" |

- **Gutters** 40 / 32 / 16 at 1280 / 768 / 375, for the header, hero type, listings and footer alike.
- **Header.** 64px over a `--line` rule. Wordmark in `--fg-1` left; Rentals and Residents in `--fg-3` at 14 / 20, 28px apart, the current page in `--fg-1`; HG Login last in `--pub-faint`. Below 600 the links fold into a 44px menu button.
- **Uppercase** lives only here, in the eyebrow and wordmark. The gold hairline (56px) appears once, under the welcome eyebrow.
- **Listings** are borderless 4:3 photo cards, `rounded-lg`, with a "1 / 8" counter and swipe on touch ([KOBU](https://mobbin.com/sites/sections/4226456d-e845-483a-ad1b-305a93fe7d36), [Airbnb](https://mobbin.com/screens/8a6b4476-52d7-4c85-965b-2a870b388eb3)).
- **Caption.** Street with rent right-aligned (tabular, "/mo" in `--fg-3`), then neighborhood and unit, then the facts line ([Realtor.com](https://mobbin.com/screens/b0a7e96c-8e57-41b8-9029-a9521f0fa412)). Desktop hover turns the street gold.
- **Grid** 3 / 2 / 1 columns at 1280 / 768 / 375, 16px gutters on phone.
- **CTA.** Limestone fill, `rounded-md`, 40px (48 touch), hover gold. The listing page pins rent and "Text us about this home" in a phone bottom bar ([Redfin](https://mobbin.com/screens/8783369a-0d07-4dc7-9de5-590c8fb954a6)).
- **Hero.** A full-bleed HG exterior (21:9, then 16:9 at 768) under the bottom scrim replaces the radial glow, with the headline set on the photo's lower left ([Okta](https://mobbin.com/sites/sections/5e71206c-b8c4-4e6d-a122-a8bb332a11fd)). At 375 the photo is 4:3 with no scrim and the headline moves below it onto solid `--canvas`. Until the photo exists, the hero is flat `--canvas` with type, never stock or a gradient.
- **Notices** (the sign-in notice that is gold-tinted today) become `--surface` with a `--line` edge and `--fg-1` text. Gold never marks state.
- **Guardrail.** Navy plus gold leans toward the private-bank template. Holding the ground chroma at 0.026, keeping gold to one eyebrow per page and using no serif keep it HG.

## 11. What changes from today

| File | Today | Change |
|---|---|---|
| `src/app/globals.css` | 8 zinc and blue tokens | All tokens above, light and dark; `@theme inline` color map; type tokens in `@theme` plus one `pointer: coarse` block; shadow and motion tokens; `color-scheme`; `::selection`; global `:focus-visible`; tabular on `td`, `th`, `.num` and the figure tokens; `.cents`; reduced-motion block; `[data-surface="public"]` scope and the widened `dark` custom variant |
| `src/app/globals.css` aliases | | One release: `--background` to `--fill-1`, `--foreground` to `--fg-1`, `--muted` to `--fg-3`, `--border` to `--line`, `--primary` to `--act`, `--primary-foreground` to `--on-act`, `--accent` to `--fill-2`. `body` moves to `--surface` explicitly |
| `src/components/ui.tsx` | Blue primary with opacity hover; `rounded-lg` controls; zinc and purple badges; uppercase `Th` and `Field`; `shadow-sm` cards; 70vh tables; dashed `EmptyState` | Buttons, fields, badges, tables, `Card`, `Section`, `PageHeader` (`text-title`), `Field`, `EmptyState` as in section 9; new `TextLink` and `Kbd` |
| `src/components/status-badge.tsx` | Seven tones (blue, purple, amber, red) | `StatusMark` ring family; tones neutral, `warn` (Review), `ok` (Done) |
| `src/lib/config.ts` | A second `TONE_CLASSES` map | Deleted; deal badges use the one tone map in `ui.tsx` (VISUAL-011) |
| `src/components/money.tsx`, `code.tsx`, `photo-thumb.tsx`, `monogram.tsx`, `spot-art.tsx` | | New, each with a row in `docs/components.md` |
| `src/components/segmented-control.tsx`, `toast.tsx`, `menu.tsx`, `popover.tsx`, `sheet.tsx`, `confirm-dialog.tsx` | Mixed fills and radii | Tokens, radii and states from section 9 |
| `src/components/app-shell.tsx`, `nav.tsx` | Blue current item, full-color icons | `--canvas` chrome, `--fill-2` plus ink notch, `--fg-3` icons, monogram lockup |
| `src/app/(portal)/p/layout.tsx` | `bg-background` page | `bg-surface` page, `--canvas` header, "HG Jobs" lockup |
| `src/app/(app)/financials/_components/ui.tsx`, `financials/page.tsx`, `rent-roll/page.tsx` | `bg-background` KPI tiles and tracks | Figure tokens at 500, statement rules, `Money` |
| `src/app/(app)/properties/[id]/edit-units.tsx` | Unit count as an editable field | Units list with Add unit and row Delete; count derived |
| `src/app/layout.tsx` | Title "HG Capital OS"; default favicon | Keep `Geist` and `Geist_Mono`; title template "%s · HG"; `viewport.themeColor` `#f8f7f3` light, `#0a0e17` dark |
| `src/app/favicon.ico` | create-next-app triangle | Deleted; add `src/app/icon.svg` and `src/app/apple-icon.png` (monogram) |
| `src/app/(marketing)/layout.tsx` | `bg-[#080b12] text-[#f2f4f7]` | `data-surface="public"`, `bg-canvas text-fg-1`, `themeColor` `#0a0e17` |
| `src/components/public/header.tsx`, `footer.tsx`, `(marketing)/welcome`, `rentals/page.tsx`, `rentals/photo-carousel.tsx`, `residents/*`, `(marketing)/error.tsx`, `src/app/not-found.tsx`, `src/app/login/_components/auth-frame.tsx`, `password-field.tsx` | 140 hex literals in 14 files (48 of them gold); pill CTAs; radial glow | Tokens only; photo hero; borderless listing cards; `rounded-md` CTAs; fact eyebrow |
| `src/lib/email/render.ts` | Hand-picked hex | Reads `src/lib/brand-tokens.ts` (**new**), a hex mirror of the light tokens plus `--gold-deep` and `--ink-tile`, since email can't use CSS variables. A unit test fails when the mirror and `globals.css` disagree |
| `eslint.config.mjs` | Em dash rule | Adds: reject `-[#` hex arbitrary values, `text-[N` arbitrary sizes and raw palette utilities (`zinc-`, `blue-`, `red-`, `amber-`, `green-`, `purple-`) in strings under `src/` |
| `CLAUDE.md` | Personality and Typography describe Geist Mono figures, zinc plus blue, two palettes, card shadows | Visual bullets replaced by one line: "Visual rules live in docs/brand-guidelines.md." Non-visual rules stay |
| `docs/components.md` | | Rows for TextLink, Kbd, StatusMark, Money, Code, PhotoThumb, Monogram, SpotArt, Section |

Settled decisions this replaces, to name at sign-off: the task tone map in `docs/asana-migration-plan.md` §7 (Review drops red, Scheduled drops blue, In progress drops purple), Geist Mono for figures, the two-palette rule, and `shadow-sm` on cards.

Migration size today: 272 `text-muted`, 248 `text-xs`, 114 `dark:`, 99 `border-border`, 73 `bg-background` (37 hover fills), 60 `rounded-lg`, 55 `text-primary`, 43 arbitrary `text-[N]` sizes, 35 `ring-primary`, 19 `bg-primary`.

## 12. Rollout order

Each slice runs `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:devices`, and opens touched dialogs and menus at 375 and 320 by hand. The sweep can't judge color.

1. **Tokens and aliases.** `globals.css` in full, with `TextLink` and the sweep of the 55 `text-primary` sites in the same slice, so no link or active tab renders as plain text when `--primary` turns ink. The lint rule lands as a warning.
2. **Primitives.** `ui.tsx`, `status-badge.tsx`, the radius step-down, the new primitives and their `docs/components.md` rows, and the `config.ts` tone map removal.
3. **The shell.** Sidebar, phone bars, portal layout, monogram, favicon and icons, metadata and `themeColor`.
4. **Pages.** Home, Properties (list, record, Units tab), Tasks, Deals, Financials (statement rules), Contractors, then the HG Jobs job page (failed photos).
5. **Public site.** Tokens, header and footer, rentals cards, then the welcome hero once a real exterior exists.
6. **Close out.** Codemod the old names to the new utilities (`text-muted` to `text-fg-3`, `text-xs` to `text-meta` or `text-micro`), drop the `dark:` overrides the tokens now cover, delete the aliases, flip the lint rule to error, and rewrite CLAUDE.md.

The 11 identity photos are shot in parallel and are required before step 5's hero and before calling step 4 done.

## References

From Mobbin:
- Airbnb: [listings with a status pill in a fixed corner](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c), [Today empty state](https://mobbin.com/screens/3a9a1f0c-c768-45b8-b3e0-f4d0d02698ad), [swipeable photo with counter](https://mobbin.com/screens/8a6b4476-52d7-4c85-965b-2a870b388eb3), [list with an add row at the foot](https://mobbin.com/screens/d36ad23a-5c7b-45b8-a8d8-0793594ed0ce).
- Zillow: [properties table with photos](https://mobbin.com/screens/c84e5a02-a339-4398-aca6-62e505305f35), [property header with photo and tabs](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd), [no-photo tile](https://mobbin.com/screens/f6fde171-27a0-44e9-85ff-235a97cec430), [tenant rows with Add and a row menu](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb).
- Mercury: [home](https://mobbin.com/screens/a0539f69-cca9-4645-8f3d-aa59048efdd1), [summary strip](https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79), [raised cents](https://mobbin.com/screens/82e8f14d-9bf6-4956-bb4d-8d9306d167d3), [failed amount struck through](https://mobbin.com/screens/3e5ccd40-7dbf-4fb4-a26d-915180a2cd64), [Books ledger](https://mobbin.com/screens/91ad4bbc-ef0f-4edf-a79f-fc6b9cb4ab7c), [masked account](https://mobbin.com/screens/63939c2c-1c29-423a-b038-13d57cccb930), [monogram tile](https://mobbin.com/screens/d575358b-679b-4d52-aa98-5026970291b3), [P&L with subtotal rows](https://mobbin.com/screens/39aedac6-b7a2-494f-ad2c-b3c6739e80f4).
- QuickBooks: [P&L with ruled subtotals and Net Income](https://mobbin.com/screens/9717816c-36a8-4661-b49f-e4f6ebe98a14).
- Vercel: [one dark primary](https://mobbin.com/screens/ff81f1e9-25b1-46f9-8448-31fa40a77e4b), [dark theme from the same roles](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54), [dot plus word status](https://mobbin.com/screens/b95a75d7-02f8-4b45-9147-b8251441ca75), [Esc keycap](https://mobbin.com/screens/63496168-dbae-470d-9039-6883d8d1e479), [one-series analytics](https://mobbin.com/screens/900542f7-c157-4445-8f88-d79dca719c7a).
- Linear: [menu with printed shortcuts](https://mobbin.com/screens/83e65fd8-259c-4568-8fa6-5a2269ed4123); Linear Mobile [status rings](https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690).
- Stripe: [customer page on hairlines](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786). Things 3: [red for the deadline only](https://mobbin.com/screens/feadd020-045b-477e-b54f-d4c405995a58). Attio: [footer sums](https://mobbin.com/screens/fdc76916-ff87-4e2a-8256-80939ffa935c).
- Gusto: [sent screen](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c), [one-accent line art](https://mobbin.com/screens/f74caf21-298d-44dc-af95-bd86acc044db). Superhuman: [Undo toast](https://mobbin.com/screens/b0cecd33-9403-4c15-af1c-033d84826cf5).
- HBO Max: [failed item kept in place with Retry](https://mobbin.com/screens/2c6b51a6-80b2-40f0-8513-83e693c55da3). Lindy: [destructive button naming the object](https://mobbin.com/screens/541ad8e0-1d7d-441b-bbf7-daf3e59e76d3). Relume: [red Delete confirm](https://mobbin.com/screens/4bc93d85-683e-4461-8e1a-fd1b519f240d).
- Public: [Samara](https://mobbin.com/sites/sections/46eec167-28cb-4329-8e8e-ee9b36f7f056), [KOBU](https://mobbin.com/sites/sections/4226456d-e845-483a-ad1b-305a93fe7d36), [Okta](https://mobbin.com/sites/sections/5e71206c-b8c4-4e6d-a122-a8bb332a11fd), [Realtor.com](https://mobbin.com/screens/b0a7e96c-8e57-41b8-9029-a9521f0fa412), [Redfin](https://mobbin.com/screens/8783369a-0d07-4dc7-9de5-590c8fb954a6).
- To avoid: [Copilot's navy with emoji and colored chips](https://mobbin.com/screens/1bfa784d-99eb-4850-88e2-4064d4d06452), [Midday's serif on near-black](https://mobbin.com/screens/4bcceb63-2afc-42cd-8c0a-12123af41a42), [Kraken's mono money](https://mobbin.com/screens/2da9671f-45f5-4713-9f71-3b27e7f96c32).

Articles: [Linear refresh](https://linear.app/now/behind-the-latest-design-refresh), [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui), [Geist colors](https://vercel.com/geist/colors), [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines), [Stripe accessible color systems](https://stripe.com/blog/accessible-color-systems), [Mercury design breakdown](https://www.925studios.co/blog/mercury-design-breakdown), [LogRocket on the Linear look](https://blog.logrocket.com/ux-design/linear-design/), [Rauno Freiberg](https://rauno.me/craft/interaction-design), [Monzo tone of voice](https://monzo.com/tone-of-voice/).
