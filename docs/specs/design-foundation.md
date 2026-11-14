# Design foundation: shadcn/ui on React Aria

Draft for Connor: nothing is built, and building waits for an explicit "build it". Planned with Connor on Nov 14, 2026. Later that day Connor widened the goal: take every recommendation that standardizes the app, and remove as much custom design as possible. This draft still describes the zero-pixel plan; a revision for the wider goal comes next, and decisions 1 and 3 are reopened by it. Code counts and line numbers were checked at `e233e43` ("Job emails, step 4: reply by email"), main's head at 11:44 that day, after the trades and job-emails landings, and re-checked at `200093a`, which changed only docs. Doc counts are from `200093a`. A count from any other commit names it. Main is moving fast, so each landing rechecks the counts and section 7.5 first. Landings 1 and 2, and the first part of landing 3, change names only and no pixel: light, dark, print, the public site and email look the same. The second part of landing 3 moves 37 hand-built buttons and links and 2 hand-built fields onto the primitives and changes how they look, and each one is shown to Connor before it ships (decision 7).

## 1. Summary

**What HG has today.** HG already builds the way shadcn/ui does, on the stack shadcn's React Aria base uses: react-aria-components 1.21.1, Tailwind v4, `cn` (clsx plus a tailwind-merge config that knows HG's type scale, shadows and motion), class-variance-authority (installed, imported nowhere yet) and lucide-react. Components live in the repo as source, which is shadcn's model: `src/components/ui.tsx` holds the primitives and is imported by 141 files, and the larger pieces have a file each. The skin is Ink and Limestone ([brand-guidelines.md](../brand-guidelines.md)). What differs is the names. HG's color tokens (`fg-3`, `fill-1`, `act`) and components (`Sheet`, `Menu`, `FormField`, `Th`) don't match shadcn's, so a shadcn component or docs page can't be read straight into our code.

**What's decided.**

| # | Decision | Connor's pick |
|---|---|---|
| 1 | Foundation | shadcn/ui on its React Aria base (shipped July 2026). Ink and Limestone stays the look, and every shadcn token points at an HG value |
| 2 | Naming | Full rename (A, over an alias layer or colors only). Color tokens, component names and parts take shadcn's names. HG roles shadcn has no name for keep HG names as additions: the third text tier, stronger lines, gold, ok and warn, photo, toast, the public site and the type scale |
| 3 | Pixels | Zero change in the renames (landings 1 and 2, and landing 3's first part; decision 7 covers its second). The brand doc's sizes already match shadcn: buttons 32 `sm`, 36 default, 40 `lg`; 44 minimum on touch; rows 40 and 48; radius 4, 6, 8, 12. Any visual change found goes to Connor before it ships |
| 4 | Button | `primary` to `default`, `secondary` to `outline`; `ghost` and `destructive` stay; `danger` stays as an HG addition; a new `link` variant absorbs the raw `<button className={textLinkClass}>` sites. Sizes: `sm` stays, `md` to `default`, a new `lg` (40px) absorbs the public site's `h-10` buttons |
| 5 | Rules | shadcn on React Aria is the foundation. Missing pieces come from shadcn's aria registry, then Intent UI, then Mobbin research for jobs neither covers. docs/components.md becomes a shadcn-name inventory |
| 6 | Rollout | Three landings (A), each checked and pushed alone: 1 colors, 2 components, 3 sweep. Each lands only when no other session is mid-landing |
| 7 | Controls that can't move unchanged | Move them (B, over keeping them as they are). Landing 3's second part puts the 35 raw buttons and links that would change look, the 2 test-pinned links in `media-uploader.tsx`, the checklist's add field and the comment edit field onto the primitives, and takes the look change. Each site is shown to Connor before it ships; a group he doesn't approve stays as it is |
| 8 | Parts | Add shadcn's parts beside HG's props (B, over props only). Both forms work: today's call sites keep their props, and pulled code keeps its parts. Landing 2 adds the 27 parts HG already draws; a part with no HG look yet is added when first needed, with its look shown to Connor |
| 9 | Derived color names | Follow the base (A): `--primary-hover`, `--destructive-tint`, `--destructive-fill`, `--destructive-fill-hover` and `--destructive-foreground`, so no `act` or `danger` color name is left |

**What changes.**

- **Landing 1, colors.** 11 HG color tokens take shadcn's names, and 5 derived ones follow (decision 9): 1,012 class uses in 159 files, plus 10 in 3 for the derived ones, plus `globals.css`, the hex mirror in `brand-tokens.ts` (its keys, and their 29 uses in the email renderer) and the docs. shadcn names HG had no token for (`--card`, `--ring`, `--secondary`, the sidebar set) arrive as pointers to HG values. The lint rule flips: it accepts shadcn's names and rejects the old ones by name.
- **Landing 2, components.** 232 import names in 96 files take shadcn's component and part names, and 27 of shadcn's parts arrive beside HG's props (decision 8). `Button` and `Badge` take shadcn's variant and size keys, built with cva. `components.json` arrives, so `npx shadcn add` works without touching `globals.css` or `cn`. docs/components.md becomes the shadcn-name inventory, and the living specs follow.
- **Landing 3, sweep, in two parts.** First, 15 raw `<button>`s move onto `Button` with no pixel change: 9 `textLinkClass` sites and 2 hand-styled links to `variant="link"`, 2 public CTAs to `size="lg"`, and 2 ghost icon buttons in `src/components` that already wear `buttonClass`. Second, per decision 7, 37 more controls move and change look: the other 28 raw buttons under `src/app`, 7 hand-styled links inside `src/components` primitives (`RailVerb` among them), the 2 links in `media-uploader.tsx`, plus the checklist's borderless add field onto `Input` and the comment edit field onto `Textarea`. Each is shown to Connor before and after, at laptop, tablet and phone, before it ships. The other 16 raw fields under `src/app` are hidden inputs and stay raw.

**What doesn't change.**

- Every pixel outside landing 3's second part: each token's value in light, dark, print and the public site's dark surface, and email, which reads the hex mirror.
- HG's own code wherever shadcn's behaves differently. `Button` stays a native `<button>`, `LinkButton` stays `next/link`, `Table` stays a native `<table>`, `Tooltip` still opens on tap on touch, the toast keeps its engine, and `AlertDialog` (today's `ConfirmDialog`) still stays open while busy.
- The type scale, the radius steps, elevation, motion, touch sizes (44px, and 48px on the public CTAs) and every Ink and Limestone rule.
- No new runtime dependency: no `shadcn`, `cn`, `sonner` or `tw-animate-css` package. The CLI runs through `npx`, and a pulled item that brings a package HG doesn't have goes to Connor first (section 5.3).
- No shadcn file is pasted over an HG one. Where a registry file name matches an HG file, HG's file stays and the pulled code is rewritten onto it (section 5.3).

**The planning estimates, checked.** 1,310 HG color-token class uses in 168 files (not about 1,200 in 156); 1,012 of them in 159 files rename. 232 component import renames in 96 files, or 163 in 70 for the core set (not about 100). `ui.tsx` is imported by 141 files: 139 at `9a822de`, as the planning estimate said, and the trades and job-emails work added 2. Both counts include `rail.tsx`, which re-exports `SaveError`.

## 2. Reuse check

**Reused as is.**

- **react-aria-components 1.21.1.** shadcn's aria base is built on it. The 62 aria-vega components import 130 React Aria names, and all of them exist in the installed 1.21.1: 81 as runtime exports (checked by importing the package) and 49 as types (found in its type files). The CLI skips a bare package request when `package.json` already declares the package (`update-dependencies.ts`), and aria-vega's style item asks for `react-aria-components` bare, so it stays on 1.21.1.
- **Tailwind v4,** `@theme inline` and HG's `dark` custom variant (`[data-theme="dark"]` plus `[data-surface="public"]`, `globals.css:11`).
- **`cn` in `src/lib/utils.ts`** and its tailwind-merge config. It treats every unknown `text-*` and `bg-*` value as a color, so shadcn's color names need no config change. No shadcn color name equals a type role, so `text-<color>` and `text-<role>` never collide.
- **lucide-react,** set as the CLI's icon library.
- **Every token value** in `src/app/globals.css`, and the hex mirror `src/lib/brand-tokens.ts` with its tests.
- **Every HG component's code.** The names change; what draws them doesn't.
- **The device check** (`npm run test:devices`), its report, and `tests/devices/known-issues.json`. That file is `{}` and keys by route, device and kind, never by class name, so renames can't break it.

**Extended.**

- **`Button`** takes the variant keys `default`, `outline`, `ghost`, `destructive`, `danger` and `link`, and the size keys `sm`, `default`, `lg`, `icon` and `icon-sm`. Its class map becomes cva's `buttonVariants`, built from today's strings. `secondary` is left out on purpose (section 4.5).
- **`Badge`** takes `variant` instead of `tone` (`secondary`, its default, and `destructive`, plus HG's `warn` and `ok`), built as `badgeVariants`.
- **`LinkButton` and `buttonVariants`** default to `default`, as shadcn's do. The 3 `LinkButton` sites that rely on today's secondary default say `variant="outline"`.
- **Size keys:** `md` becomes `default` everywhere HG has one, so every size key uses shadcn's words: the fields (`Input`, `Select`, `Combobox`, `SearchInput`, `DateField`, `AddressCombobox`), `ToggleGroup` and the two financials toggles that wrap it (`BasisControl` and `PeriodControl` in `period-row.tsx`), `Dialog`, `FormDialog`, `CreateForm` and `Code`. `size="md"` is written at 9 sites in 6 files, all on fields and toggle groups.
- **`hg/design-tokens`** in `eslint.config.mjs`: accepts shadcn's names, rejects the old ones with the new name in the message, and adds white, black, every Tailwind palette, Tailwind's shadow scale and the backdrop blur to the raw-value bans.
- **`globals.css`** gets shadcn's pointer tokens and `--radius`, in the blocks the public site and print already use.
- **`brand-tokens.ts`** keys follow the CSS names: all 11 keys whose token is renamed (`fg3` to `mutedForeground`, `fill1` to `muted` and the rest), and `brandTokensDark.line`.
- **docs/components.md, docs/brand-guidelines.md, CLAUDE.md, README.md and the living specs** (section 6).

**New.**

- **`components.json`** (section 5.1), so the shadcn CLI can add components. References: [components.json](https://ui.shadcn.com/docs/components-json), [schema](https://ui.shadcn.com/schema.json).
- **The CLI workflow:** `npx shadcn@4.23.0 add` only, never `init` (section 5.3). References: [CLI](https://ui.shadcn.com/docs/cli), [init source](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/init.ts), [add source](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/add.ts).
- **shadcn's token names with no alias layer** ([theming](https://ui.shadcn.com/docs/theming)) and **component names from the aria pages** ([React Aria base](https://ui.shadcn.com/docs/changelog/2026-07-react-aria), [aria registry source](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/bases/aria)).
- **`scripts/token-renames.mjs`:** the old-to-new map and the class and variable patterns, as data with no side effects. `eslint.config.mjs`, `token-names.test.ts`, the rename script and the proof import it, so running lint or the tests never runs a rename.
- **`scripts/rename-tokens.mjs`:** the one-pass rename CLI. It stays in the repo so a branch merged after landing 1 can be run through it.
- **`scripts/zero-pixel-proof.mjs`:** the CSS, screenshot and email comparison each landing runs (section 7.1).
- **`src/lib/token-names.test.ts`:** fails on an old color name in CSS, tests or the docs, which lint can't see.
- **`src/components/parts.test.ts`** (landing 2): each component written with props and with parts renders the same HTML (section 4.6).
- **`src/components/variants.test.ts`** (landing 2): every old `Button`, `Badge`, `Kbd` and public CTA key gives the same class set under its new key. Landing 3 adds a row per moved site.
- **Intent UI** as the fallback registry ([installation](https://intentui.com/docs/getting-started/installation.md), [repo](https://github.com/irsyadadl/intentui)).

## 3. Token map

Counts are utility classes in code: `src/**/*.{ts,tsx}`, not tests and not `globals.css`. Light and dark values are from `globals.css` and don't change.

### 3.1 Renamed to shadcn's names (landing 1)

| HG token | shadcn name | Light / dark | Uses (files) | Note |
|---|---|---|---|---|
| `--surface` | `--background` | `#ffffff` / `#0f141e` | 38 (26) | Work surface and `body`. `bg-surface` 36, `ring-surface` 1, `stroke-surface` 1 |
| `--fg-1` | `--foreground` | `#152133` / `#ece9e4` | 193 (95) | Primary text. Frames that set a ground and its text can use the pair, as `bg-popover text-popover-foreground` |
| `--raised` | `--popover` | `#ffffff` / `#161d28` | 9 (8) | Menus, popovers, dialogs, sheets, the skip link, the upload chip |
| `--fill-1` | `--muted` | `#f2f0ec` / `#181e2a` | 77 (49) | Row and button hover, segmented track, meter track, keycap, skeleton. One to one, hovers included |
| `--fill-2` | `--accent` | `#e7e5e0` / `#212835` | 41 (15) | Highlight inside raised layers and the current nav item: shadcn's accent job |
| `--fg-3` | `--muted-foreground` | `#5b6576` / `#a19e98` | 398 (122) | Meta, placeholders, idle icons, the empty dash. The biggest rename |
| `--act`, fills and states | `--primary` | `#152133` / `#ece9e4` | 30 (15) | Every `bg-act`, and every `border-act` or `ring-act` outside a focus variant: checked, pressed, selected, current and pending states and drop targets |
| `--act`, focus | `--ring` | same | 24 (15) | Every `outline-act`, and `ring-act` or `border-act` under a focus variant |
| `--on-act` | `--primary-foreground` | `#ffffff` / `#0f141e` | 11 (6) | Label and icon on the ink fill, `text-on-act/70` included |
| `--danger` | `--destructive` | `#b91c1c` / `#f47b76` | 50 (30) | The red as text, edge and ring, `aria-invalid:` edges included |
| `--line` | `--border` | `#e7e5e0` / `#212835` | 120 (75) | `border-line` 70, `divide-line` 47, `bg-line` 2, `text-line` 1. The one `var(--line)` in code (`financials/rent-roll/page.tsx:24`) is renamed by the variable pass, outside these 120 |
| `--line-control` | `--input` | `#84817a` / `#6e7684` | 21 (13) | Field, checkbox and picker edges, the switch-off track. `--chart-ref` follows it |
| `--chart-1` | `--chart-1` | `#384e6e` / `#d7d0c3` | 3 (2) | Same name in shadcn. No change |

The first twelve rows are 1,012 uses in 159 files. `--act` splits by context: the values are equal, so a wrong pick moves no pixel, and the rule is mechanical (section 7.2). `--ring` is a pointer to `--primary`, so CSS keeps one value.

### 3.2 shadcn names added as pointers (landing 1)

shadcn components read these, so each points at an HG token. In landing 1 only `--ring` gets HG classes (the 24 focus uses). The rest, `--secondary` included, wait for a pulled component: HG's `Badge` keeps its own classes (section 4.5).

```css
:root,
[data-surface="public"] {
  --card: var(--background);
  --card-foreground: var(--foreground);
  --popover-foreground: var(--foreground);
  --accent-foreground: var(--foreground);
  --secondary: var(--accent);
  --secondary-foreground: var(--fg-2);
  --ring: var(--primary);
  --sidebar: var(--canvas);
  --sidebar-foreground: var(--fg-2);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: var(--foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);
  --chart-ref: var(--input);
}

:root {
  --radius: 0.5rem;
}
```

- **Where.** In today's `:root, [data-surface="public"]` block (`globals.css:153`, which holds `--chart-ref`). A var() resolves where it's declared, so on `:root` alone the public site would inherit the light values. Print needs nothing more: the print block restates the base tokens, and these resolve against them.
- **`@theme inline`** maps each name as `--color-<name>: var(--<name>)`, and drops the old `--color-*` names.
- **`--card` is `--background`.** HG's `Card` and the public fact tiles sit on the surface. Never point it at `--popover`.
- **`--secondary` with `--fg-2` text** is HG's neutral badge look, which is shadcn's secondary badge.
- **`--ring`** keeps HG's focus look: a 2px solid outline with a 2px offset. aria-vega's `focus-visible:ring-3 focus-visible:ring-ring/50` doesn't come in.
- **The sidebar set** serves a pulled sidebar part. HG's nav keeps its own states (hover on `--muted`, current on `--accent`), since shadcn's sidebar uses one accent for both.
- **`--chart-2` to `--chart-5` stay undefined.** shadcn uses them for categorical series, and the brand allows one series plus a reference (`--chart-ref`). An undefined one draws a black SVG fill, so a pulled chart that reads them goes to Connor.

### 3.3 HG additions that keep HG names

Decision 2 keeps these. shadcn has no slot for them.

| Token | Light / dark | Uses (files) | Why it stays |
|---|---|---|---|
| `--fg-2` | `#424e61` / `#c0bdb7` | 110 (61) | The third text tier (labels, idle nav, codes). shadcn has two tiers. `--secondary-foreground` and `--sidebar-foreground` point at it |
| `--line-strong` | `#d5d1ca` / `#323947` | 31 (11) | Outline button edge, table rules, tag and keycap edges. shadcn draws every edge with `--border` |
| `--line-float` | `--line` / `--line-strong` | 6 (5) | Edge of every floating layer. Its light and dark values come from different tokens, so it can't be `--border` |
| `--canvas` | `#f8f7f3` / `#0a0e17` | 10 (9) | App chrome, phone bars, and the public, login and not-found ground. Broader than `--sidebar`, which points at it |
| `--warn`, `--warn-tint` | `#a54e09` / `#f7a059`; `#fff5ec` / `#321f0f` | 9 (7), 1 (1) | Status as text plus a badge ground. shadcn's `--warning` example is a ground with `-foreground` text, the opposite use |
| `--ok`, `--ok-tint` | `#1d7038` / `#6ad18a`; `#eff9f1` / `#142619` | 9 (9), 2 (2) | Same as warn |
| `--gold`, `--gold-deep` | `#c8a765`; `#86662c` | 12 (5), 0 | Brand. `--gold-deep` is read only by email, through `brandTokens.goldDeep` (both letterheads in `render.ts`). Never `--accent`, which is a hover fill |
| `--ink-tile`, `--tile-edge` | `#152133` fixed; `--ink-tile` / `--line` | 1 (1), 1 (1) | Monogram ground and its dark edge. Equal to `--primary` in light only |
| `--toast-bg`, `--toast-fg`, `--toast-fg-2`, `--toast-hover`, `--toast-edge` | `#152133` / `#212835` ground | 15 (2) | Toast and tooltip. aria-vega's tooltip is `bg-foreground`, which would turn limestone in dark |
| `--pill-bg`, `--pill-fg` | fixed | 7 (4), 7 (4) | Status and Retry pills on photos |
| `--on-photo`, `--photo-scrim`, `--photo-stage` | fixed | 34 (6), 15 (6), 3 (2) | Text and grounds over photos |
| `--scrim` | `rgb(10 14 23 / 0.45)` / `rgb(0 0 0 / 0.6)` | 3 (3) | Modal backdrop. aria-vega's overlay is `bg-black/10` under a backdrop blur |
| `--pub-faint`, `--pub-gold-hi` | fixed | 8 (4), 1 (1) | Public site only |
| `--select` | `#e4e9f0` / `#2a3548` | 0 | `::selection` only |
| `--chart-ref` | `var(--input)` | 0 | Reserved for the prior-year tick ([charts.md](charts.md)) |

Also unchanged: the type scale (`text-title` through `text-code-l`), elevation (`shadow-float`, `shadow-overlay`, `inset-shadow-photo-edge`, `inset-shadow-rule`), motion (`duration-*`, `animate-*`, `ease-spring`), `--app-bar-h`, and `--font-sans` and `--font-mono` (already shadcn's names). The kept tokens are 288 uses in 92 files, `--chart-1` included.

**Derived families follow their base (decision 9).** Their base token takes a shadcn name, so keeping their names would leave `act` and `danger` alive beside `primary` and `destructive`.

| HG token | Light / dark | Uses (files) | New name | Why it can't fold into its base |
|---|---|---|---|---|
| `--act-hover` | `#28364d` / `#d3d1cb` | 4 (2) | `--primary-hover` | aria-vega hovers with `bg-primary/80`, about `#444d5c` / `#c0bebc` over the background |
| `--danger-tint` | `#fff2f1` / `#341817` | 3 (2) | `--destructive-tint` | aria-vega uses `bg-destructive/10`, which doesn't equal these |
| `--danger-fill` | `#b91c1c` / `#c92f33` | 1 (1) | `--destructive-fill` | Equal to `--destructive` in light, not in dark (`#f47b76`) |
| `--danger-fill-hover` | `#a31818` / `#b3292d` | 1 (1) | `--destructive-fill-hover` | aria-vega's destructive button is a tint that hovers at `/20` |
| `--on-danger` | `#ffffff` both | 1 (1) | `--destructive-foreground` | shadcn v3's name; aria-vega's tint needs no foreground token |

That's 10 uses in 3 files.

### 3.4 Radius

- **HG uses Tailwind's own steps:** `rounded-sm` 4px, `md` 6, `lg` 8, `xl` 12. That's 182 class uses in 87 files, `rounded-t-xl` on the sheet included.
- **shadcn's theming block derives the steps from one `--radius`:** `sm` ×0.6, `md` ×0.8, `lg` ×1, `xl` ×1.4. At 0.5rem that's 4.8, 6.4, 8 and 11.2px; at the CLI's default 0.625rem it's 6, 8, 10 and 14px. No single value gives 4, 6, 8 and 12, which needs ×0.5, ×0.75, ×1 and ×1.5.
- **Decision.** Add `--radius: 0.5rem` on `:root`, so a shadcn component that reads it gets HG's card radius. Never write the `--radius-*` block, and keep the brand rule that `--radius-*` is never redefined. Keep `--radius` out of `@theme`, where Tailwind's own `--radius` drives the bare `rounded` class (unused in `src` today).
- **Pulled components** carry `rounded-[min(var(--radius-md),10px)]` on `sm` buttons (8px on `xs`), `rounded-[2px]` on the tooltip arrow, `rounded-[4px]` on the checkbox, `rounded-4xl` on the badge, and `rounded-[calc(var(--radius)-5px)]` (3px at HG's `--radius`) in input-group, which select, combobox and command pull in. These move to HG's steps on import (section 5.4).

### 3.5 Dark theme, print and the public site

- **One dark block:** `:root[data-theme="dark"], [data-surface="public"]`, and the `dark` variant matches both. shadcn writes `.dark`. Nothing here adds a `.dark` block, and `shadcn init`, which would, never runs.
- **Three places per token.** Each renamed token changes in the light `:root`, the dark and public block, and the print block (`@media print`, which restates the light hex under `:root[data-theme="dark"]`) together. `print-tokens.test.ts` checks the print block.
- **Two-source edges** (`--line-float`, `--toast-edge`, `--tile-edge`) stay restated in each block, as today.
- **Pairs that share a light value but split in dark stay apart.**
  - `--destructive` (text, `#f47b76` dark) and `--danger-fill` (button fill, `#c92f33` dark). HG's confirm button is the solid fill; aria-vega's destructive button is a red tint, which section 5.4 maps.
  - `--background` (`#0f141e` dark) and `--popover` (`#161d28` dark). aria-vega's Dialog, AlertDialog, Sheet, Popover and DropdownMenu already sit on `bg-popover`; its Card sits on `bg-card`, which points at `--background`.
  - `--toast-bg` (`#212835` dark) and `--foreground` (`#ece9e4` dark).
- **Pairs that share every value never merge,** because their jobs differ: `--border` and `--accent`, `--primary` and `--foreground`, `--primary-foreground` and `--background`. A later re-brand of the action color would drag the others with it.
- **aria-vega's `dark:` classes come off pulled code:** `dark:bg-input/30`, `dark:hover:bg-input/50`, `dark:border-input`, `dark:hover:bg-muted/50`, `dark:bg-destructive/20` and the `dark:aria-invalid:` set. They assume a translucent `--input`; HG's is an opaque `#6e7684`. On the public site, where the dark variant always matches, they would paint gray washes. `src` has no `dark:` classes today.

## 4. Component map

Counts are importing files outside the component's own file, from an import scan at `e233e43`.

### 4.1 Renamed to shadcn's names (landing 2)

| HG (file) | shadcn name | Files | Not a pure rename |
|---|---|---|---|
| `CardBody` (`ui.tsx`) | `CardContent` | 3 | |
| `buttonClass` | `buttonVariants` | 23 | Default goes from secondary to `default`. Every external call already passes a variant |
| `badgeToneClass`, `BadgeTone` | `badgeVariants`, `VariantProps<typeof badgeVariants>` | 0 | `Badge`'s `tone` becomes `variant`; 5 of 14 sites change (section 4.5) |
| `FormField` | `Field` | 16 | Keeps its props (`label`, `optional`, `required`, `helper`, `error`, `hideLabel`, the render prop). `FieldLabel`, `FieldDescription` and `FieldError` also arrive as parts (section 4.6). The dead HG `Field` is deleted first |
| `Th`, `Td` | `TableHead`, `TableCell` | 15, 15 | `numeric` stays an HG prop |
| `EmptyState` | `Empty` | 11 | Keeps its children and `action` props. `SpotArt` fits shadcn's `EmptyMedia` slot later |
| `ConfirmDialog` (`confirm-dialog.tsx`) | `AlertDialog` | 12 | Keeps its props (`title`, `body`, `actions`, `onClose`, `cancelLabel`, `busy`). shadcn's Action and Cancel close on press, which would break `busy` |
| `Menu`, `MenuTrigger`, `MenuItem` (`menu.tsx`) | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuItem` | 17, 18, 19 | Same nesting as shadcn's aria base, where `DropdownMenu` is the content. `shortcut` and `icon` stay props; `description`, `current`, `checked`, `numberKeys`, `sheetTitle` and `followUp` stay HG; placement stays bottom end |
| `MenuSection`, `MenuHeader`, `MenuSeparator` | `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuSeparator` | 1, 3, 7 | `MenuSection`'s `title` and `MenuHeader`'s `detail` stay HG props |
| `MenuFollowUp` (type) | `DropdownMenuFollowUp` | 3 | HG type, follows the component |
| `Sheet`, `SheetView`, `useSheet` (`sheet.tsx`) | `Dialog`, `DialogView`, `useDialog` | 15, 4, 2 | HG's sheet is shadcn's Dialog from `md` and its Drawer on a phone. shadcn's Sheet is an edge panel HG never uses. The phone presentation stays HG behavior, and `title`, `footer`, `size`, `fullHeight`, `dirty`, `surface` and `layout` stay props |
| `FormSheet` (`form-sheet.tsx`), `SheetRoute` (`create-form.tsx`) | `FormDialog`, `DialogRoute` | 7, 4 | HG compositions, following `Dialog`. `SheetRoute`'s 4 importers are the `@modal` intercepting pages, which `sheet-routes.test.ts` reads as text. `components/sheet-views.ts` and `lib/sheet-routes.ts` keep their names; only `sheet.tsx` and `app-shell.tsx` (and each file's own test) import them |
| `Block` (`skeleton.tsx`) | `Skeleton` | 19 | Stays static on `--muted`; shadcn's pulses, and the brand has no shimmer |
| `SegmentedControl`, `SegmentOption` | `ToggleGroup`, `ToggleGroupOption` | 11, 2 | Keeps native buttons with `aria-pressed` and its `options` prop. shadcn's is React Aria's toggle button group |
| `Notice` (`source-line.tsx`) | `Alert` | 3 | No `role="alert"`: HG's is a static notice. `action` and `icon` stay props |
| `SideNav` (`nav.tsx`) | `Sidebar` | 1 | One component, not shadcn's family of parts |
| `CommandPalette` | `CommandDialog` | 1 | `SearchPanel` and `SearchRow` become `Command` and `CommandItem` inside the file (no external importers), after the file's `type Command` import from `@/lib/commands` becomes `Command as CommandEntry` (section 7.3) |

Total: 232 import names in 96 files. The core set (`CardBody`, `buttonClass`, `FormField`, `Th`, `Td`, `EmptyState`, `ConfirmDialog` and the `Menu` family) is 163 in 70. Five component files are renamed: `sheet.tsx` to `dialog.tsx`, `form-sheet.tsx` to `form-dialog.tsx`, `confirm-dialog.tsx` to `alert-dialog.tsx`, `menu.tsx` to `dropdown-menu.tsx`, `segmented-control.tsx` to `toggle-group.tsx`. `command-palette.tsx`, `nav.tsx`, `source-line.tsx`, `skeleton.tsx` and `create-form.tsx` keep their names.

Two `Kbd` names carry an old color name and follow the tokens: `tone="act"` becomes `variant="primary"` (4 sites in 4 files: `action-bar.tsx`, `create-form.tsx`, `form-sheet.tsx`, `inline-field.tsx`), and `kbdActClass`, which has no importer outside `ui.tsx`, becomes `kbdPrimaryClass`.

### 4.2 Same name, HG's code stays

| Name | Files | Why HG's code stays |
|---|---|---|
| `Button` | 42 | Native `<button>`: `onClick` at 90 of 97 sites, `disabled` at 35, HG's `pending` at 14. shadcn's aria Button is React Aria's (`onPress`, `isDisabled`, `type="button"` by default) |
| `LinkButton` | 13 | `next/link` with prefetching. shadcn's is a React Aria `Link` |
| `Card`, `CardHeader`, `CardTitle` | 5, 3, 0 | HG's flat card. shadcn's has a `size` prop, its own padding and a `shadow-xs` ring. `CardTitle` has no importer, but it is already shadcn's part name and aria-vega's `chart` pulls `card`, so it stays |
| `Badge` | 8 | HG sizes; variants per section 4.5 |
| `Kbd` | 9 | `variant="primary"` stays an HG addition |
| `Spinner` | 4 | 200ms delay, 400ms minimum, `aria-hidden`. shadcn's has `role="status"` and no delay |
| `Input`, `Textarea` | 18, 5 | `Input`'s `size` (`sm`, `default`), `prefix` and `suffix` stay; `Textarea` is a styled native `<textarea>`. shadcn's Input has no size; prefix and suffix are its InputGroup pattern |
| `Checkbox` | 2 | Native input (`checked`, event `onChange`) and `large`. shadcn's is React Aria's |
| `Table` | 14 | Native `<table>` inside `TableFrame`. shadcn's aria Table is React Aria's grid table |
| `Popover`, `PopoverTrigger` | 3, 1 | Keeps its inner Dialog, required `aria-label`, and bottom start with offset 6. shadcn's aria Popover is HG's `PopoverSurface` |
| `Tooltip` | 5 | `<Tooltip label>` that opens on tap on touch, as CLAUDE.md requires. shadcn's opens on hover and focus only, with the API inverted |
| `Select` (`select.tsx`), `Combobox` | 6, 2 | Data props: `Select` takes `items` and `sections`, `Combobox` takes `items` and `allowCustom`. Several picks are `TagsField` (section 4.3). shadcn composes trigger, content, list and items |
| `Switch` | 4 | `label` prop with the whole row pressable. shadcn's is the control alone, labeled through Field |
| `Avatar` | 9 | `name`, `email`, numeric sizes 20 to 32, initials |
| `DatePicker` | 3 | Already shadcn's name; shadcn's is a docs pattern, not an export |

### 4.3 HG-only, kept and marked HG in docs/components.md

Files are importing files outside the piece's own file. Where a row names several pieces, the files any of them reach come first, then each piece's own count.

| Piece | Files | Why there's no shadcn name |
|---|---|---|
| `Section` | 47 | A heading and actions over a rule, with no box. shadcn's Card is a box |
| `PageHeader` | 14 | shadcn has no page title row |
| `TextLink`, `textLinkClass` | 30 (14, 18) | An inline underlined link with no size. `variant="link"` is for buttons |
| `tagClass` | 4 | 22px with `px-2` and an inset ring; an outline Badge is 20px |
| `Meter` | 7 | A meter, hidden when unlabeled. shadcn's Progress always announces a progress bar |
| `ToastProvider`, `useToast` | 38 (3, 35) | shadcn's toast is the Sonner package, a global `toast()` beside a `<Toaster />`. HG keeps key replacement, the detail line and the inset |
| `TopTabs` | 2 | Route links in a labeled nav with `aria-current`. shadcn's Tabs is a tablist with panels |
| `OptionList` family | 14 | One list engine for Select, Combobox, FilterBar and the pickers; shadcn splits it per host |
| `SaveError`, `FieldRow`, `CheckboxMark` | 12, 2, 2 | Section-level errors, two fields side by side, a checkbox look for a row that is the control. `SaveError`'s 12 import it from `ui.tsx`; `rail.tsx` also re-exports it |
| `TableFrame`, `thClass`, `flushTable`, `grandTotalRow`, `RowCell`, `SortHeader` | 14 (1, 1, 5, 6, 3, 2) | Statement rules, linked rows, the sideways-scroll box, sorting |
| `PopoverSurface`, `PickerLayer`, `pickContainer`, `useCoarsePointer` | 25 (4, 8, 4, 10) | A popover with a mouse and a sheet on a phone; shadcn ships that as a pattern only |
| `SearchInput`, `NumberInput`, `DateField`, `DatePanel` | 20 (5, 8, 3, 6) | No shadcn search, number or segmented date field |
| `TagsField`, `TagList`, `TagOverflow`, `TagsChecklist`, `DoneFooter`, `tagsLine`, `tagsOf` (`tags-field.tsx`) | 3 | The trades tags-and-checklist picker, new on main. shadcn's Combobox with chips is the nearest; HG's adds the checklist and the "+N" overflow |
| `StatusMark`, `StatusBadge`, `DealStageMark` | 17 (13, 6, 4) | HG's status glyphs with fixed tones |
| `Money`, `Code`, `FactStrip`, `MoneyBars`, `MonthBars`, `PhotoThumb`, `RetryPill`, `Monogram`, `SpotArt` | 44 (57 imports) | Money, chart and brand pieces |
| `ActionBar`, `FilterBar`, `AppShell`, `AddRow` | 5, 4, 1, 3 | The docked bar, the list filter bar, the shell, the counted-list add row |
| `TOUCH_HEIGHT`, `chromeIconClass`, `pendingRowFill`, `fieldClass`, `fieldSizeClass`, `pickerChipClass`, `pickerField`, `kbdClass` | 31 (2, 14, 6, 8, 6, 4, 4, 1) | HG touch, field, picker and keycap rules |
| `PublicHeader`, `PublicFooter`, `publicCtaClass`, `publicSecondaryClass`, `Eyebrow`, `publicType` | 10 (25 imports) | The public site, kept by decision 2. The two CTA classes are rebuilt on `buttonVariants({ size: "lg" })` |

The rest of the compositions (record media, the activity timeline, edit-in-place, leave guards, the hooks) keep their names. docs/components.md lists them, and section 4.7 covers the exports beside the renamed components.

### 4.4 Deleted (no importers)

These have no importers outside their own file, so deleting them changes nothing on screen: `SectionCard`, `Field` (a label over a value, which collides with shadcn's `Field`), the native `Select` (which collides with `select.tsx`'s), `selectTouchHeight`, `pickerChip` and the `Spinner` re-export from `ui.tsx`; `SheetTrigger` from `sheet.tsx` (React Aria's `DialogTrigger` under another name, used only in a doc comment there); and `popoverSurface` from `popover.tsx` (unused even inside it). `badgeToneClass` and `BadgeTone`, also unimported, give way to `badgeVariants` (section 4.1). docs/components.md already marks `SectionCard` and the native `Select` for deletion.

### 4.5 Button and Badge variants and sizes

**Button.** All 138 external call sites: 97 `<Button>` in 43 files (one is `ui.tsx`'s dead `SectionCard`), 14 `<LinkButton>` in 13, and 27 `buttonClass()` calls in 23.

| HG variant | shadcn variant | Button | LinkButton | buttonClass | Total |
|---|---|---|---|---|---|
| `primary` | `default` | 26, none written | 11 written | 6 written | 43 |
| `secondary` | `outline` | 40 | 3 by LinkButton's default | 3 | 46 |
| `ghost` | `ghost` | 16 | 0 | 18 | 34 |
| `danger` | `danger` (HG) | 2 | 0 | 0 | 2 |
| `destructive` | `destructive` | 13 | 0 | 0 | 13 |
| raw `<button className={textLinkClass}>` | `link` (new) | | | | 9 sites in 9 files (landing 3) |

| HG size | shadcn size | Button | LinkButton | buttonClass | Total |
|---|---|---|---|---|---|
| `sm` (32) | `sm` | 56 | 3 | 16 | 75 |
| `md` (36, the default) | `default` | 41 | 11 | 11 | 63 |
| `icon` flag | `icon` (36) or `icon-sm` (32) | 4 | 0 | 17 | 21: 7 `icon`, 14 `icon-sm` |
| `publicCtaClass`, `authButtonClass`, `publicSecondaryClass` (`h-10`) | `lg` (new, 40) | | | | 11 sites in 7 files |

- **The `md` and `lg` rows.** The `md` row's 11 `buttonClass` calls include `publicCtaClass` and `publicSecondaryClass` (`public/ui.tsx:28` and `:33`), which are rebuilt on `lg`, so 61 sites end on `default`. The `lg` row counts the sites that use the three classes, not `buttonVariants` calls.
- **Edits.** No Button, LinkButton or buttonClass site writes `size="md"`, so only the type and the cva key change. `primary` is written at 17 sites (11 LinkButton, 6 buttonClass); the 26 bare Buttons need no edit. `secondary` is written at 43 sites, and the 3 bare `LinkButton`s gain `variant="outline"` (`properties/[id]/property-tasks.tsx` twice, `p/jobs/[id]/_components/job-details.tsx` once). The `icon` flag becomes a size at 21 sites.
- **`secondary` is left out on purpose.** aria-vega's `secondary` is a filled neutral button HG doesn't draw, and HG's old `secondary` meant `outline`. With no `secondary` key, a site or a later branch written the old way fails typecheck instead of drawing the wrong button.
- **Icon sizes** keep HG's `pointer-coarse:min-w-11`, so they stay square at 44 on touch.
- **`pending` reads the size.** Today the branch that puts the Spinner in place of the icon checks the `icon` flag. It becomes `size === "icon" || size === "icon-sm"`. No site is both `pending` and an icon button at `e233e43`, so nothing breaks today; the check keeps the behavior for the next one.
- **`lg`** is the public CTA exactly: `h-10 px-4.5`, with `pointer-coarse:min-h-12` (48px) in place of the 44px touch height the other sizes use. `publicCtaClass` keeps its gold hover on top.
- **`link`** sits outside the shared base, the sizes and the touch height. `buttonVariants({ variant: "link" })` returns `textLinkClass` exactly (`text-foreground underline decoration-1 underline-offset-3 hover:decoration-2`), whatever size is passed, and `variants.test.ts` checks it. Sharing the base would turn an inline text link into `inline-flex items-center whitespace-nowrap rounded-md text-label`: long links would stop wrapping, and the six sites with no text size of their own (`portfolio-capex.tsx`, `capex-outlook.tsx`, `capex-rules-editor.tsx`, `move-in-form-editor.tsx`, `create-form.tsx`, `load-latest.tsx`) would take the label size and weight. Each site keeps its own size and touch classes.
- **`outline`** keeps `border border-line-strong bg-background` with `hover:bg-muted`. aria-vega's outline also hovers on `bg-muted`, but draws its edge in `border-border` and adds `shadow-xs`; neither comes in.
- **`ghost`** keeps `text-fg-2` with `hover:bg-muted hover:text-foreground`, which is aria-vega's ghost hover too.
- **`destructive`** keeps HG's solid fill (`bg-danger-fill text-on-danger hover:bg-danger-fill-hover`, renamed per decision 9). aria-vega's `destructive` is a tint (`bg-destructive/10 text-destructive`), closer to HG's `danger`; section 5.4 maps pulled code.

**Badge.** 14 sites in 8 files: 9 pass no tone, 3 pass `tone="danger"`, 1 `warn` and 1 `ok`.

| HG tone | shadcn variant | Sites |
|---|---|---|
| `neutral` (the default) | `secondary` (the default) | 9, none written |
| `danger` | `destructive` | 3 |
| `warn` | `warn` (HG) | 1 |
| `ok` | `ok` (HG) | 1 |

- **`defaultVariants` is `secondary`,** so the 9 bare badges keep today's neutral and only the 5 toned sites change (`tone` to `variant`). shadcn's own default is `default`, an ink fill the brand has no badge for. HG's `Badge` has no `default` key until Connor approves a look for one.
- **Each variant keeps today's classes:** `secondary` stays `bg-accent text-fg-2` (today's `bg-fill-2 text-fg-2`, renamed), so no new utility arrives with landing 2.

### 4.6 shadcn's parts and HG's props

Decision 2 moves parts to shadcn's names. Where HG has the part, it takes shadcn's name: `CardContent`, `TableHead`, `TableCell`, `DropdownMenuItem`, `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `ToggleGroupOption`. Where shadcn composes parts and HG takes props, decision 8 adds shadcn's parts beside the props, so a dialog or field can be written either way. The parts below are aria-vega's exports at the time of writing.

- **Landing 2 adds the 27 parts HG already draws,** so none brings a new look: `DialogTrigger`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `DialogClose`; `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel`; `DropdownMenuShortcut`; `FieldLabel`, `FieldDescription`, `FieldError`; `EmptyDescription`, `EmptyContent`; `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableCaption`; `ToggleGroupItem`; `AlertDescription`, `AlertAction`.
- **Each part renders the prop's own internals.** `DialogTitle` is the same `Heading slot="title"` the `title` prop draws, `DialogFooter` renders into the same pinned footer region through context (so it stays at the bottom of the phone sheet, as `footer` does), and `FieldError` is the same line that sets `aria-invalid` on the control. The table parts are the native `thead`, `tbody`, `tfoot`, `tr` and `caption`, which HG's `Table` already styles. A prop and its part never draw twice: the component draws a slot only when its prop is given.
- **Behavior stays HG's.** `AlertDialogAction` doesn't close on press, so `busy` keeps working (shadcn's closes). `DialogTrigger` and `AlertDialogTrigger` are React Aria's `DialogTrigger`, exported again from `dialog.tsx` and `alert-dialog.tsx`; the 4 files that import it from React Aria (`capex-breakdown.tsx`, `picker-layer.tsx`, `popover.tsx`, `sheet.tsx`) can keep doing so. `title` becomes optional on `Dialog` and `AlertDialog`, and a dialog with neither `title` nor a `DialogTitle` gets React Aria's missing-label warning.
- **Parts with no HG look yet** (`DialogDescription`, `CardDescription`, `CardAction`, `CardFooter`, `EmptyHeader`, `EmptyTitle`, `EmptyMedia`, `AlertTitle`, `AlertDialogMedia`, the popover header parts, and `Field`'s content, title, group, set, legend and separator) are added the first time a pulled component needs one. Its look goes to Connor first, with 2 or 3 options.
- **Parts that would add behavior** (`DropdownMenuSub` and its trigger and content, the `Select` and `Combobox` composition parts, the `Avatar` image parts and `Sidebar`'s 22) are added only when a job needs them, as their own change.
- **Proof.** `src/components/parts.test.ts` renders each non-overlay component both ways with `react-dom/server`'s `renderToStaticMarkup` and asserts the same HTML (Field, Empty, Table, Alert, ToggleGroup). Overlays render in a portal that server rendering skips, so one dialog, alert dialog and dropdown menu written with parts is opened beside its props twin at 375 and 1280 by hand.
- **docs/components.md** shows both forms for each of these components, props first, since that's how today's screens are written.

| shadcn (aria-vega) | Its parts | HG's equivalent |
|---|---|---|
| `Dialog` | `DialogTrigger`, `DialogTitle`, `DialogHeader`, `DialogDescription`, `DialogFooter`, `DialogClose`, `DialogOverlay` | React Aria's `DialogTrigger`, or `isOpen` and `onOpenChange`; `title` (and `hideTitle`); the built-in header row; the first line of `children`; `footer`; the built-in X, the render-prop `close` (`{({ close }) => …}`), or `useDialog()?.close()`; the built-in scrim |
| `AlertDialog` | `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogMedia`, `AlertDialogOverlay`, `AlertDialogTrigger` | `title`, `body`, `actions` (the confirm buttons) and `cancelLabel`; content and overlay are built in, and the parent's state opens it; no media slot |
| `DropdownMenu` | `DropdownMenuTrigger`, `DropdownMenuItem`, `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent` | The first five under these names; `shortcut` on the item; no submenu (`followUp` is HG's second step) |
| `Field` | `FieldLabel`, `FieldDescription`, `FieldError`, `FieldContent`, `FieldTitle`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldSeparator` | `label`, `helper` and `error`; `FieldRow` for two fields side by side; the rest have no HG piece |
| `Empty` | `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`, `EmptyMedia` | `children` (one sentence) and `action`; `SpotArt` can fill a media slot later |
| `Table` | `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` | `TableHead` and `TableCell`; native `thead`, `tbody`, `tfoot`, `tr` and `caption` |
| `Card` | `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | `CardHeader`, `CardTitle` and `CardContent`; no description, action or footer |
| `ToggleGroup` | `ToggleGroupItem` | An entry in `options` (`ToggleGroupOption`) |
| `Alert` | `AlertTitle`, `AlertDescription`, `AlertAction` | `children` and `action` |
| `Popover` | `PopoverTrigger`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription` | `PopoverTrigger`; the required `aria-label` |
| `Select`, `Combobox` | Trigger, content, list, item, group and chip parts | `items` and `sections` (Select); `items` and `allowCustom` (Combobox); several picks are `TagsField` |
| `Avatar` | `AvatarImage`, `AvatarFallback`, `AvatarGroup`, `AvatarGroupCount`, `AvatarBadge` | `name`, `email` and `size` |
| `Sidebar` | 22 parts beside `Sidebar`, plus `useSidebar` | None: HG's is one component |
| `Command` | `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` | `CommandDialog`; `Command` and `CommandItem` stay inside `command-palette.tsx` |

### 4.7 Exports beside the renamed components

| Export (file) | Importers outside its file | Plan |
|---|---|---|
| `SheetProps` (`sheet.tsx`) | 0 | `DialogProps`. The file's React Aria `type DialogProps` import becomes `type DialogProps as AriaDialogProps` first |
| `SheetTrigger` (`sheet.tsx`) | 0 | Deleted (section 4.4); the doc example uses React Aria's `DialogTrigger` |
| `MenuProps` (`menu.tsx`) | 0 | `DropdownMenuProps`. React Aria's is already imported as `AriaMenuProps` |
| `FormSheetProps` (`form-sheet.tsx`) | 0 | `FormDialogProps` |
| `focusFirstInvalid` (`form-sheet.tsx`) | 0 | Moves with the file to `form-dialog.tsx` and keeps its name |
| `CreateForm`, `CreateFormContext`, `CreateFormProps` (`create-form.tsx`) | 4, 0, 0 | HG, keep their names |
| `SandboxNotice`, `WarnMark`, `SourceLine` (`source-line.tsx`) | 3, 2, 4 | HG, keep their names; `SandboxNotice` renders `Alert` |
| `FormFieldControlProps` (`ui.tsx`) | 0 | `FieldControlProps` |
| `SearchTrigger`, `SearchPanel`, `SearchRow` (`command-palette.tsx`) | 0 | `SearchTrigger` keeps its name (the header's field-look button, HG); the other two become `Command` and `CommandItem`. None needs exporting |
| `popoverSurface` (`popover.tsx`) | 0 | Deleted (section 4.4) |
| `pickerFieldChevron` (`ui.tsx`) | 3 | HG, beside `pickerField` |
| `LoadingScreen`, `rowWidth`, `HeadingBlock`, `TaskRowSkeleton`, `Words`, `SkeletonRows` (`skeleton.tsx`) | 19, 13, 4, 2, 1, 1 | HG loading compositions around `Skeleton` |
| `AutosizeTextarea`, `InlineSwitch`, `InlineTags` (`inline-field.tsx`) | 1, 3, 1 | HG edit-in-place pieces |
| `ProgressRing` (`media-uploader.tsx`) | 1 | HG. shadcn's `Progress` is a labeled bar; the ring is an upload's own mark |
| `BackLink` (`back-link.tsx`) | 13 | HG. shadcn's `Breadcrumb` is a trail; `BackLink` is one link back |
| `publicContainer`, `publicLinkHover`, `publicTextLinkClass` (`public/ui.tsx`) | 9, 4, 1 | HG, the public site |

docs/components.md marks each HG row.

## 5. Setup

### 5.1 components.json

Landing 2 writes this by hand at the repo root.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "aria-vega",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "menuColor": "default",
  "menuAccent": "subtle",
  "aliases": {
    "components": "@/components",
    "ui": "@/components",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/components"
  },
  "registries": {
    "@intentui": "https://intentui.com/r/{name}"
  }
}
```

- **`tailwind.config` is empty** for Tailwind v4, and `tailwind.css` names the file that imports Tailwind.
- **`baseColor`** is required by the schema. With `cssVariables` on, `add` ignores it; it only matters to `init`, which never runs.
- **`iconLibrary`** must be set. Registry source imports an `IconPlaceholder` from `@/app/(create)/components/icon-placeholder`, and the icon transformer (`transform-icons.ts`) swaps it for lucide only when `iconLibrary` names a library. Left out, the import stays and breaks the build. The docs page doesn't list `iconLibrary`, `menuColor`, `menuAccent` or `rtl`; the schema and the transformers do.
- **`menuColor` stays `default`.** `inverted` swaps the registry's `cn-menu-target` placeholder for the `dark` class (`transform-menu.ts`), which HG's `dark` variant doesn't match.
- **`aliases.ui` is `@/components`,** so a pulled component lands beside HG's component files (`src/components/slider.tsx`), the way HG lays them out. The default `@/components/ui` would create a `src/components/ui/` folder beside `ui.tsx`, and `@/components/ui` and `@/components/ui/button` would resolve to different places. The cost is name collisions with HG's files, handled in section 5.3.
- **`aliases.hooks` is `@/components`,** where HG's hooks live (21 files export them there).
- **`registries` names `@intentui` up front.** Without it, the first real `add @intentui/<name>` finds Intent UI in shadcn's registry directory and writes this entry into `components.json` itself.

### 5.2 Style: aria-vega

The style only changes class strings. Exports and props are the same across styles.

| Style | Button `sm` / default / `lg` | Radius | Fit |
|---|---|---|---|
| aria-vega | 32 / 36 / 40 | `rounded-md` | HG's heights and 6px radius |
| aria-maia, aria-luma | 32 / 36 / 40 | pill | Pill buttons, which the brand rules out |
| aria-nova, aria-lyra, aria-rhea | 28 / 32 / 36 | `lg`, none, `2xl` | A step smaller |
| aria-mira | 24 / 28 / 32 | `md` | Much smaller |
| aria-sera | 36 / 40 / 44 | none | A step larger |

Nova is the CLI's default preset, but `init --defaults` picks the Base UI base with it (base-nova), not aria-nova (`init.ts`, `preset/defaults.ts`). Decision 3's sizes and radius match Vega only (Maia and Luma share the heights but are pills), so Vega it is. It still isn't HG to the pixel: it puts `shadow-xs` on outline buttons, inputs, select triggers and cards, pads its `sm`, default and `lg` buttons `px-2.5` (HG's default is `px-3.5`), and uses `text-sm`. Section 5.4 puts HG's classes back on every pulled file.

### 5.3 Adding a component

`components.json` must exist first. Without it, `shadcn add` offers to create one and runs `init` with force.

```sh
npx shadcn@4.23.0 add <name> --dry-run   # every file and package it would write
npx shadcn@4.23.0 add <name> --view      # the code, before anything is written
npx shadcn@4.23.0 add <name>             # writes; answer No to every overwrite prompt
git status --short                       # only the new file, package.json and package-lock.json
```

- **Never run** `shadcn init` (in any form, `--preset` included), `shadcn apply`, `add --overwrite` or `-o`, `add --all`, any `shadcn migrate` or `shadcn eject`.
  - `init` overwrites `src/lib/utils.ts` in full with `export { cn } from "cn"`, deleting `fmtMoney`, `fmtDate`, `initials` and HG's merge config. No flag skips it.
  - `init` rewrites `globals.css`: it replaces variables that share shadcn's names, adds a `.dark` block, the `--radius-*` block (6, 8, 10 and 14px), `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"` and a base layer (`* { border-border outline-ring/50 }`).
  - `init` also installs a font (Vega brings Inter) and edits `app/layout.tsx`.
- **What `add` does.** It writes component files and installs their packages. It skips a bare package request when `package.json` already declares that package; a versioned request (aria-vega's `chart` asks for `recharts@3.8.0`) goes to npm as written, so the dry run is checked for version bumps. It writes to `globals.css` only for an item that carries CSS or CSS variables, which is why every run is checked.
- **Packages HG doesn't have.** Most aria-vega items ask only for `cn`. A few bring more: `drawer` brings `@base-ui/react`, `chart` `recharts@3.8.0`, `sonner` `sonner` and `next-themes`, `message-scroller` and `questionnaire` `@shadcn/react`, and `carousel`, `input-otp` and `resizable` their own. Any of these goes to Connor before it's installed.
- **After every run,** `src/app/globals.css`, `src/lib/utils.ts` and `src/app/layout.tsx` must show no diff. If one does, restore it with `git restore`.
- **Name collisions.** After landing 2, 12 HG files carry a registry item's name: `alert-dialog`, `avatar`, `combobox`, `dialog`, `dropdown-menu`, `popover`, `select`, `skeleton`, `spinner`, `switch`, `toggle-group` and `tooltip`. Never `add` one of these by name: HG's file is the component. An item that lists one in its `registryDependencies` (aria-vega's `command` lists `dialog`; `sidebar` lists `skeleton` and `tooltip`; `calendar` lists `select`) prompts to overwrite it. Answer No. The pulled file's part imports (`DialogHeader`, `DialogTitle`) land on HG's parts. A part HG doesn't have yet fails typecheck, and is added to HG's file then (section 4.6).
- **A registry dependency HG has under another file** arrives as a new file: `button`, `input`, `textarea`, `checkbox`, `card`, `table`, `badge` and `kbd` live in `ui.tsx`, and `sheet` is HG's `Dialog`. Delete the file the CLI wrote and point the import at HG's export.
- **The `cn` package.** 58 of the 62 aria-vega items list it, so the CLI installs it. Uninstall it (`npm uninstall cn`): HG's `cn` is the one with the merge config, and `cn` 0.5.2 wants Node 22 where local Node is 20.20.1.

### 5.4 Conforming a pulled component

A pulled file ships only after these, and after lint, typecheck, tests and the device check pass. The strings below are aria-vega's.

1. **Imports.** `cn` from `"cn"` becomes `@/lib/utils`; the CLI doesn't rewrite it, and without HG's merge config `cn("text-fg-2", "text-body")` drops the color. Dependencies HG has point at HG's exports, and parts keep their names, since HG exports them; a part HG doesn't have yet is added to HG's file first (section 4.6). Where pulled code needs React Aria props on a button (`onPress`, `slot`), it uses React Aria's `Button` with `buttonVariants` classes.
2. **Type roles.** `text-sm font-medium` (buttons, labels) becomes `text-label`; `text-base md:text-sm` (inputs) becomes `text-body`, which is already 16px on touch; description `text-sm` becomes `text-meta`; `text-xs` becomes `text-micro`; a dialog title (`leading-none font-medium`, which takes its size from the content's `text-sm`) and an alert dialog title (`text-lg font-medium`) become `text-section`, and the dialog content's `text-sm` is dropped. Lint rejects the raw sizes.
3. **Grounds and edges.**
   - Dialog and alert dialog content: `rounded-xl bg-popover ring-1 ring-foreground/10` becomes `rounded-xl bg-popover border border-line-float shadow-overlay`, HG's Overlay level.
   - Popover and dropdown menu content: `rounded-md bg-popover shadow-md ring-1 ring-foreground/10` becomes `rounded-lg bg-popover border border-line-float shadow-float`, the Float level.
   - Card: `rounded-xl bg-card shadow-xs ring-1 ring-foreground/10` becomes `rounded-lg bg-card border border-border`, HG's flat card.
   - Overlay: `bg-black/10 supports-backdrop-filter:backdrop-blur-xs` becomes `bg-scrim`, with no blur.
   - Tooltip: `bg-foreground text-background`, and its arrow's `bg-foreground fill-foreground`, become `bg-toast-bg text-toast-fg border-toast-edge`.
4. **Hover fills.** aria-vega's outline and ghost buttons already hover on `bg-muted`, and its menu items highlight on `focus:bg-accent` inside a raised layer, where `accent` stays. A pulled hover on `bg-accent` over the surface becomes `bg-muted`. The dropdown menu, context menu, select and combobox content's `**:data-[slot$=-item]:data-focused:bg-foreground/10` comes off, so items highlight on `accent`.
5. **Shadows.** Strip `shadow-xs` and `shadow-sm`. `shadow-md` becomes `shadow-float`, and `shadow-lg` and `shadow-xl` become `shadow-overlay`.
6. **Strip** every `dark:` class, `selection:bg-primary`, the focus ring (every `ring-*` and `border-ring` class under `focus-visible:`, `data-focus-visible:`, `focus-within:` or a `has-[…:focus-visible]:` variant, such as `focus-visible:ring-3 focus-visible:ring-ring/50` and the `ring-[3px]` form some items use; HG's global outline does focus), the press nudge `active:not-aria-[haspopup]:translate-y-px`, and the `color-mix()` hover on the `secondary` button.
7. **Motion.** tw-animate-css classes (`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`) become HG's (`animate-pop-in`, `animate-fade-in`, `duration-fast`, `ease-spring`). HG doesn't import tw-animate-css or `shadcn/tailwind.css`. Tailwind's own `data-*` variants match React Aria's attributes; a shadcn-only utility (`no-scrollbar`, `scroll-fade-*`, `shimmer`) is rewritten, or copied into `globals.css` by hand and reviewed.
8. **Radius.** `rounded-[min(var(--radius-md),10px)]` and `rounded-[min(var(--radius-md),8px)]` become `rounded-md`; `rounded-[2px]`, `rounded-[4px]`, input-group's `rounded-[calc(var(--radius)-5px)]` and the badge's `rounded-4xl` move to HG's steps (4, 6, 8, 12).
9. **Touch.** Every control reaches 44px on touch through `TOUCH_HEIGHT` or its own `pointer-coarse:` classes, and a tooltip's content is reachable by tap.
10. **Keys HG doesn't have.**

    | Pulled key | HG target |
    |---|---|
    | Button `default`, `outline`, `ghost`, `link` | Same key |
    | Button `secondary` (a filled neutral button) | `outline`, HG's button for everything that isn't the one next step. A filled neutral look goes to Connor |
    | Button `destructive` (aria-vega's red tint) | Reviewed per site: a confirm button that names what goes keeps `destructive` (HG's solid fill); anything else becomes `danger` |
    | Size `default`, `sm`, `lg`, `icon`, `icon-sm` | Same key |
    | Size `xs` and `icon-xs` (24px) | `sm` and `icon-sm`, HG's smallest (32, 44 on touch) |
    | Size `icon-lg` (40px) | Goes to Connor: HG has no 40px icon button |
    | Badge `secondary`, `destructive` | Same key; aria-vega's `destructive` badge is a tint, as HG's is |
    | Badge `outline` | A span with `tagClass`, HG's neutral chip |
    | Badge `default`, `ghost`, `link` | Go to Connor: HG has no ink, ghost or link badge |

11. **Check.** Open every state at 375 and 320. A pulled component that brings a look HG doesn't have yet goes to Connor before it ships.

### 5.5 Intent UI, the fallback

For a job shadcn's aria registry lacks (it has 62 components; Intent UI has 87, including number field, search field, date field, tree, tag group, meter, color picker and drop zone).

```sh
npx shadcn@4.23.0 add @intentui/<name> --dry-run
npx shadcn@4.23.0 add @intentui/<name>
```

`@intentui` is in shadcn's built-in registry directory. Intent UI is MIT licensed and built on React Aria and Tailwind v4. It uses shadcn's token names for the shared roles (background, foreground, muted, primary, secondary, accent, border, input, ring, the sidebar set, chart-1 to chart-5), but not shadcn's component names or its `variant` prop. Each pull gets section 5.4 plus:

- `intent` becomes `variant`, tailwind-variants `tv()` becomes cva, `cx` from `@/lib/primitive` becomes `cn`, and heroicons become lucide.
- Its tokens HG doesn't define are mapped by hand, since Tailwind drops an unknown class and lint doesn't flag one. `overlay` and `overlay-foreground` become `popover` and `popover-foreground`. `danger` and `danger-subtle-foreground` become `destructive`. `danger-foreground` becomes `destructive-foreground`, and `danger-subtle` becomes `destructive-tint` (decision 9). `primary-subtle*`, `warning-subtle*`, `success-subtle*`, `info-subtle*` and `navbar*` go to Connor. A blind `danger` to `destructive` swap would leave `destructive-subtle-foreground`, which nothing defines.
- Its button asks for `tailwind-variants` and `tailwindcss-react-aria-components` (bare), its `primitive` dependency writes `src/lib/primitive.ts`, and 25 of its 87 items, dialog and select among them, ask for `@heroicons/react`. After the conversion, run `npm uninstall tailwind-variants tailwindcss-react-aria-components @heroicons/react` (whichever the pull installed) and delete `src/lib/primitive.ts`, as section 5.3 does for `cn`.
- Its items add CSS to `globals.css`: `@plugin "tailwindcss-react-aria-components"` on every item, `@utility touch-target`, the sheet's keyframes, and in 28 items CSS variables for `overlay` and the `*-subtle` tokens (light, dark and `@theme`). The base layer that colors every border comes only with its `theme-*` items, which are never pulled. Restore `globals.css` and copy in only what the component needs.
- Its own package wants react-aria-components ^1.22.0 and HG is on 1.21.1. Its registry items ask for the package bare, so the CLI won't upgrade it; a component that needs 1.22 fails typecheck and waits for a separate React Aria upgrade.

### 5.6 When Mobbin still applies

- **Jobs neither registry covers:** screens, flows, page layouts, empty states, payoff moments, and compositions such as the filter bar.
- **How a pattern behaves at each size.** A registry gives anatomy, not the phone and desktop versions of a screen. Mobbin and comparable products still decide those.
- **When a pulled component's look differs from HG's,** the research goes with the options to Connor.

## 6. Rules that change

### 6.1 CLAUDE.md and README.md

**Design references, first bullet** (landing 2). Today: "…or the shadcn/ui component that does the job. shadcn/ui is a reference for anatomy and props only; we build in our own Tailwind primitives and don't add it as a dependency. Invent only when nothing fits, and say so when you do." New:

> - **Never make UI up from scratch.** Our components are shadcn/ui on its React Aria base, in the Ink and Limestone skin, under shadcn's names. Every layout, control and interaction traces back to one of them. A missing component comes from shadcn's aria registry first, then Intent UI, and is conformed to our rules before it ships (docs/components.md). For a job neither covers, use a proven pattern from Mobbin, Apple HIG or Material, built on our primitives. Invent only when nothing fits, and say so when you do.

**Design references, "Check Mobbin before designing anything new"** (landing 2, `CLAUDE.md:28`). Today it sends dialogs to Mobbin first. New:

> - **Check the registries, then Mobbin.** A control or dialog comes from shadcn's aria registry or Intent UI first. Screens, redesigns, flows and empty states start on Mobbin: cover both the mobile and desktop versions of the pattern, and look at comparable products alongside it.

**Design references, "Cite what you used"** (landing 2). New:

> - **Cite what you used.** Link the references in the commit message or handoff notes, next to the components reused, and name any registry item pulled (`shadcn add dialog`, `@intentui/tree`).

**Design references, "Adapt, don't copy"** (landing 2). New:

> - **Adapt, don't copy.** References decide the pattern; the build uses our primitives and tokens. A component pulled from a registry takes our sizes, type roles and tokens before it ships.

**Reuse first, steps 2 and 3** (landing 2). New:

> 2. **Pull before you build.** If nothing here does the job, add it from shadcn's aria registry, or from Intent UI when shadcn has none, the way docs/components.md says. Research on Mobbin only for jobs neither covers. See Design references.
> 3. **Leave it findable.** New general-purpose components go in `src/components/` under their shadcn name (primitives in `src/components/ui.tsx`) and get a row in docs/components.md in the same commit. Feature-only compositions stay beside their page and don't need a row.

**Craft the edges, "One switch per job"** (`CLAUDE.md:53`). Landing 1: "the selected segment's surface fill and control edge" becomes "the selected segment's `--background` fill and `--input` edge", since the rename script doesn't match bare words. Landing 2: "Views and filters inside a page use the segmented control" becomes "Views and filters inside a page use `ToggleGroup` (the segmented control)".

**Personality, first bullet** (landing 1): "…rejects raw palette classes, hex values, raw and arbitrary text sizes, and the retired alias names under `src/`" becomes "…rejects raw palette classes, white and black, Tailwind's own shadows and blur, hex values, raw and arbitrary text sizes, and the old HG color names under `src/`, naming the new one".

**Enforce it in code, second bullet** (landing 1): "CSS isn't linted, so check it by hand." becomes "CSS isn't linted. `src/lib/token-names.test.ts` catches old color names in CSS, tests and the docs; check the rest of CSS by hand."

**README.md, "Before you build" step 3** (landing 2). Today: "Nothing fits? Research the pattern on Mobbin, then build it." New: "**Nothing fits?** Add it from shadcn's aria registry, or Intent UI when shadcn has none (docs/components.md, Adding a component). Research on Mobbin only for jobs neither covers."

**README.md, Stack** (landing 2): add "UI: shadcn/ui on its React Aria base, in the Ink and Limestone skin ([docs/brand-guidelines.md](docs/brand-guidelines.md)). Components live in `src/components/`, and `components.json` configures the shadcn CLI."

The rule rewrite rides with landing 2 because it points at the CLI workflow and docs/components.md, which arrive there. Landing 1 changes the color and lint wording.

### 6.2 docs/brand-guidelines.md

- **Section 4 intro** (landing 1). Today: "Tokens live on `:root` (light) and `:root[data-theme="dark"]`, mapped in `@theme inline` as `--color-*`. Text tokens are `fg-*`, so utilities read `text-fg-2`." New: "Tokens use shadcn/ui's names where shadcn has the role (`--background`, `--foreground`, `--muted-foreground`, `--primary`, `--border` and the rest) and HG names where it doesn't (`--fg-2`, `--line-strong`, `--canvas`, status, brand, toast and photo). They live on `:root` (light) and `:root[data-theme="dark"], [data-surface="public"]`, mapped in `@theme inline` as `--color-*`, so utilities read `text-muted-foreground` and `text-fg-2`."
- **Section 4 takes section 11's email rule that code cites** (landing 1): email can't read CSS variables, so it reads the hex mirror in `src/lib/brand-tokens.ts`, which a test keeps equal to `globals.css`. It also adds the rule `eslint.config.mjs:58` states: a re-brand is a token swap. The three comments that cite "section 11" (`src/lib/brand-tokens.ts:3`, `src/lib/email/render.ts:12`, `eslint.config.mjs:59`) point at section 4.
- **Section 4 tables** (landing 1): token names through the rename script. "Act (ink)" becomes "Primary (ink)", and the focus ring moves to its own row: `--ring`, pointing at `--primary`. The contrast columns and notes name grounds as bare words ("vs surface", "light fill-2", "dark raised", the floor list "canvas, surface, raised, fill-1, fill-2, select"), which the script doesn't match. They're edited by hand (lines 101 to 195).
- **Section 3** (landing 2): line 72's `Th` and `Td` become `TableHead` and `TableCell`.
- **Section 5, Radius** (landing 1): after "never redefine `--radius-*`", add "`--radius` is 0.5rem, for shadcn components that read it."
- **Section 5, Controls** (landing 2): line 232's "(md)" becomes "(default)".
- **Section 9** (landing 2): the Buttons table takes `default`, `outline`, `ghost`, `danger`, `destructive` and `link`, and the sizes `sm`, `default` and `lg`, and the Buttons bullet (line 330) says `default` for `md`. Badge tones become variants, with `secondary` the default. "Dialogs and sheets" names `Dialog` and `AlertDialog`; the segmented control names `ToggleGroup`. "Tables and money" (lines 378 and 379) names `TableHead` and `TableCell`.
- **Sections 11 and 12** (landing 1): replaced, before the rename script runs on the file, by a short "11. History" section. It says the Oct 25 rollout landed in `4f45a1b` and the Nov 14 rename is this spec. The old alias row maps the same names to other tokens (`--background` to `--fill-1`), so it can't stay beside the new names. The tables stay in git history.

Sections 11 and 12 hold 10 of the file's 165 `--name` mentions and all 3 of its class mentions, so the rename script changes 155 and none (plus 13 for the derived family).

### 6.3 docs/components.md (landing 2)

- **Every row names its pick by its shadcn name,** linked to the shadcn aria docs page, with HG's file beside it. Pieces shadcn lacks carry an "HG" mark (sections 4.3 and 4.7).
- **A "Formerly" column** holds each renamed piece's old name, so an old name from chat, memory or a dated doc still finds its row.
- **A new "Adding a component" section** holds sections 5.3 and 5.4, and points to Intent UI and Mobbin.
- **"Where things live"** adds `components.json` and says pulled components land in `src/components/`.
- **Duplicates and Known gaps** take landing 3's counts in place of "about 55 raw `<button>`s" and "about 50 raw fields".
- **Landing 1** runs the rename script over it first: 116 `--name` mentions and 1 class mention.

### 6.4 hg/design-tokens (landing 1)

- **Delete the "Retired alias" pattern.** It rejects `text-foreground`, `bg-background`, `border-border`, `bg-primary`, `bg-accent` and, through its `\b`, `text-muted-foreground`, so every renamed file would fail lint.
- **Add the old-name ban.** The map lives once, in `scripts/token-renames.mjs`, a data module with no side effects. `eslint.config.mjs`, `token-names.test.ts`, `rename-tokens.mjs` and the proof import it; the CLI's file walk lives only in `rename-tokens.mjs`.

```js
// scripts/token-renames.mjs
export const RENAMED = {
  "fg-1": "foreground", "fg-3": "muted-foreground", surface: "background", raised: "popover",
  "fill-1": "muted", "fill-2": "accent", act: "primary", "on-act": "primary-foreground",
  danger: "destructive", line: "border", "line-control": "input",
  "act-hover": "primary-hover", "danger-tint": "destructive-tint", "danger-fill": "destructive-fill",
  "danger-fill-hover": "destructive-fill-hover", "on-danger": "destructive-foreground", // decision 9
};
const KEYS = Object.keys(RENAMED).sort((a, b) => b.length - a.length).join("|");
const UTIL = "text|bg|border(?:-(?:[trblxyse]|bs|be))?|divide|ring(?:-offset)?|inset-ring|outline|fill|stroke|decoration|caret|accent|placeholder|shadow|inset-shadow|drop-shadow|text-shadow|from|via|to";
export const OLD_CLASS = new RegExp(`(?<![\\w-])(${UTIL})-(${KEYS})(?![\\w-])`, "g");
export const OLD_VAR = new RegExp(`(?<![\\w-])--(?:color-)?(${KEYS})(?![\\w-])`, "g");
```

- **Messages name the new class:** `"text-fg-3" is the old name. Use "text-muted-foreground".` For `act`: `Use "ring-primary", or "ring-ring" for a focus ring.` Loop with `matchAll`, not `.test`, so a `g` regex keeps no state between strings.
- **The lookahead** keeps `border-line` from flagging `border-line-strong`, and kept names (`fg-2`, `line-strong`, `toast-*`) stay out of the map.
- **Keep a narrow ban on old meanings:** `text-muted`, `text-accent` and `text-background` with nothing after them. Until Oct 25 `text-muted` meant `fg-3`; after the rename it draws the `--muted` ground color as text, which nearly disappears. Message: "A ground color used as text. Use text-muted-foreground or text-foreground."
- **Extend the raw-value bans,** which cost nothing today (0 utility uses in linted `src` files; `utils.test.ts` holds one `shadow-sm`, and lint skips tests):
  - Every palette in Tailwind 4.3.3's `theme.css` in one pattern, not a list that misses some: `amber`, `blue`, `cyan`, `emerald`, `fuchsia`, `gray`, `green`, `indigo`, `lime`, `mauve`, `mist`, `neutral`, `olive`, `orange`, `pink`, `purple`, `red`, `rose`, `sky`, `slate`, `stone`, `taupe`, `teal`, `violet`, `yellow` and `zinc`, each followed by a step. Intent UI ships sky, indigo, emerald, teal, pink, rose, lime and cyan themes, none of them in today's list.
  - `white` and `black` after any color utility in `UTIL` (the same prefix list as `OLD_CLASS`, so `border-t-white` and `caret-black` are covered too), as `(?<![\w-])(${UTIL})-(white|black)(?![\w-])` with a `/NN` opacity allowed ("Use a token: primary-foreground, foreground or scrim"). The bare word stays allowed: `ctx.fillStyle = "white"` in `src/lib/attachments/prepare.ts:167` paints a JPEG's canvas.
  - `shadow-2xs`, `shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl` and `shadow-inner` ("Use shadow-float or shadow-overlay"). Bare `shadow` stays out: the rule reads every string, and the bare word can't be told apart from a sentence.
  - `backdrop-blur` with any step ("No glass. Use a ground token"). aria-vega's overlay brings `backdrop-blur-xs`.
  - Pulled shadcn code carries `bg-white`, `bg-black/10`, `shadow-xs` and `backdrop-blur-xs`.
- **Update the messages** that name old tokens: the hex message's example becomes `text-fg-2, bg-canvas, border-border`, and the palette message becomes "foreground, muted-foreground, fg-2, muted, accent, border for neutrals; destructive, warn, ok for status".
- **Keep the ban for good.** Specs, memory and habits carry the old names.

### 6.5 The living specs and plans (landing 2)

Landing 1 renames tokens across the docs; landing 2 renames components there too. These docs name old components in code spans:

| Doc | Mentions |
|---|---|
| `docs/specs/selectors.md` | 48 |
| `docs/specs/forms-editing.md` | 36 |
| `docs/specs/search.md` | 27 |
| `docs/specs/build-plan.md` | 22 |
| `docs/specs/charts.md` | 17 |
| `docs/specs/activity-comments.md` | 13 |
| `docs/specs/tenant-contact.md` | 12 |
| `docs/specs/uploads-photos.md` | 8 |
| `docs/specs/contractor-trades.md` | 5 |
| `docs/specs/view-as.md` | 5 |
| `docs/contractor-invoices-plan.md` | 4 |
| `docs/task-templates-plan.md` | 4 |
| `docs/specs/performance.md` | 3 |
| `docs/asana-migration-plan.md` | 1 |

That's 205 in 14 docs, beside docs/components.md (79, rewritten) and the brand doc. A component pass in the rename script lists each name in a code span with its line, and each is renamed by hand: "Sheet", "Menu", "Block" and "Notice" are also words, and some spans name React Aria's own part (`selectors.md:44` says React Aria's `MenuTrigger`, which keeps its name). `docs/uiux-review/` (6 mentions in 4 files) stays as a dated audit, with the same header line as for tokens.

## 7. Rollout

### 7.1 Every landing

**Coordination,** per CLAUDE.md's Landing work.

1. Land only when no other session is mid-landing (section 7.5, rechecked first).
2. Cut the branch from a freshly fetched `origin/main`, not the primary checkout's local `main`, which stopped at `f9ab3fb` on Oct 22 and is more than 250 commits behind.
3. Run `npm run test:devices` in the landing worktree, since the commit gate (`scripts/device-check-gate.mjs`) holds back `git commit` while UI files are newer than the last complete run. Then commit on the branch and merge `origin/main` into it. Check main's new commits for overlap with the landing's files, keep both sides' unrelated pieces, and say what overlapped.
4. Run the old-name check (`node scripts/rename-tokens.mjs --check`) on the merged tree. It sees class names and CSS variables only. A `brandTokens` key written the old way (`t.fg3`) is caught by typecheck, which is how the job-emails work would surface: it took `render.ts` from 7 old-key uses to 29.
5. Run the checks below on the merged code.
6. Say which files are about to land, then `git push origin HEAD:main`. Every push to main deploys to production in about two minutes.

**Checks on the merged code.**

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `node scripts/zero-pixel-proof.mjs`, the proof below, with its base runs.
5. `npm run test:devices` in the landing worktree on the merged tree. It is the proof's step 3 landing run, not a second one. Then open every dialog, menu and state the landing touched at 375 and 320.

The gate doesn't match `src/lib/utils.ts`, `src/lib/brand-tokens.ts`, `eslint.config.mjs` or `components.json`, so the device check runs for every landing whatever files it touches.

**The base worktree.** The proof builds the base (origin/main at the merge) beside the landing, in a separate worktree (`git worktree add <scratch folder> <base>`), never a stash or a checkout in the landing worktree. It gets `npm ci`, a copy of every `.env*` file the landing worktree has (`.env`, and `.env.local` when there is one, since `next build` and `next start` read `.env.local` first), and `npx playwright install chromium webkit` if the browsers are missing. Before the first run, the proof checks that the base server, the landing server and both `setup.ts` runs resolve the same `DATABASE_URL` (`setup.ts` gets it from Prisma, which reads `.env` alone), and stops if they don't. Its device runs set `DEVICES_PORT=3101`, since `playwright.config.ts` starts its own server on 3100 and never reuses one, and they run one at a time: each run's setup replaces the portal fixtures' sessions in the shared database. Remove the worktree after the landing.

**The zero-pixel proof.** The device check alone can't show it: it wipes `device-report/` at the start of each run, shoots default states only, in light only on app pages, as JPEG.

1. **CSS, by resolved value.** Build both (`.next-devices/static/chunks/*.css`, 3 files) and parse them with lightningcss or postcss (both in `node_modules`). Resolve per element, not per block: light `:root`; `:root[data-theme="dark"]`; a `[data-surface="public"]` element under a light `:root`; and each of those under `@media print`. Compute each custom property on the element that declares it and inherit the computed value, as browsers do. Map the base's class selectors through the rename script's own class function, escaped forms such as `.text-on-act\/70` included, so `outline-act` maps to `outline-ring` as it does in the code. Then split every selector list and compare a multiset of (at-rule context, single selector, resolved declarations). The pointer declarations of section 3.2 are expected additions; any other difference stops the landing. Rules whose candidate appears in no non-test file under `src/` on that side are filtered out. Tailwind scans every file git doesn't ignore (there's no `@source`): docs, tests, scripts, `eslint.config.mjs` and CLAUDE.md, and landing 1 edits several of them.
2. **Order.** Tailwind 4.3.3 sorts same-property utilities by variants, then property order, then count, and breaks the last tie by candidate name (`node_modules/tailwindcss/dist/lib.js`). A rename can flip which of two color classes wins, but only on an element that carries both. The proof lists each same-property pair whose order flips. It fails only when a literal or template that never passes through `cn()` carries both. A pair inside one `cn()` call is listed, not failed, since tailwind-merge keeps the last of a conflicting pair. At `200093a` that's 11 pairs in 9 `cn()` calls, all ternary alternatives, and none in a literal or template.
3. **Screenshots.** Run the base's device check, copy its `device-report/shots/` to a scratch folder on this machine, and run the base a second time to list the shots that differ on their own (relative times, lazy photos). Then run the landing's. Pair the 186 shots (31 routes on 6 devices) by file name. Equal pixels give equal JPEG bytes, so compare checksums first, then decode the rest with sharp (in `node_modules`) and count differing pixels. The shots carry tenant, loan and P&L figures, so they never leave this machine, and the scratch copy is deleted after the landing.
4. **Email.** Render `renderPlainEmail` with `render.test.ts`'s `input` plus items, closing and footnote, and `renderJobEmail` with its `job` and with its photo-strip fixture (photos, `morePhotos`, `job.photos`, `calendarUrl`, `accessUrl`) plus `dateUrl`, so every renamed key, `t.fill1` included, appears in the HTML. Do it in both worktrees and compare the HTML byte for byte. `render.test.ts` alone can't show it: it pins only `fg2`, `inkTile` and `goldDeep`, none of them renamed, and otherwise checks that each hex is some `brandTokens` value, so a key renamed to the wrong token (`t.muted` where `t.border` was meant) would still pass.
5. **Each element** (landings 2 and 3). The CSS proof compares one global stylesheet, so an element that gains or loses a utility the stylesheet already has passes it unchanged, and the screenshots see only each route's default state in light. Before landing 2's cva rebuild, a one-off script records the class string of every old key: each `buttonClass` variant × size × icon, each `Badge` tone, both `Kbd` tones, and `publicCtaClass`, `publicSecondaryClass` and `authButtonClass`. `src/components/variants.test.ts` asserts that each new key (old keys mapped per section 4.5) gives the same class set. Landing 3's first part adds a row per moved site: its class string at the base and its new `Button` props, asserting `cn(buttonVariants(props), siteClass)` gives the same set. Its second part changes classes on purpose, so its sites are listed as expected differences instead (section 7.4). The test imports from `ui.tsx`; if `next/link` won't load under `tsx --test`, the class maps move to a plain module that `ui.tsx` re-exports.

Any difference that isn't noise stops the landing and goes to Connor.

### 7.2 Landing 1: colors

**Scope.** The 11 tokens in section 3.1 take shadcn's names and the 5 in the derived family (decision 9). Pointer tokens and `--radius` arrive. The lint rule flips. Docs follow.

**Files.**

- 159 code files: 1,012 class uses (plus 10 uses in 3 files for the derived family).
- `src/app/globals.css`: the light `:root`, the dark and public block, the print block, the pointer block, `@theme inline`, `:focus-visible` (to `--ring`, by hand after the script, which writes `--primary` for every `--act`), `accent-color` (to `--primary`), `body`, `::selection` and `--chart-ref`.
- `src/lib/brand-tokens.ts`: every key whose CSS name changes. `surface`, `raised`, `fill1`, `fill2`, `line`, `lineControl`, `fg3`, `fg1`, `act`, `onAct` and `danger` become `background`, `popover`, `muted`, `accent`, `border`, `input`, `mutedForeground`, `foreground`, `primary`, `primaryForeground` and `destructive`, and `brandTokensDark.line` becomes `border`. `actHover`, `dangerTint`, `dangerFill`, `dangerFillHover` and `onDanger` follow (decision 9). `brand-tokens.test.ts` asserts the key set equals every hex token on the light `:root`, both ways, so a partial rename fails `npm test`. `canvas`, `fg2`, `gold`, `goldDeep` and `inkTile` stay, so `layout.tsx` and the 5 `themeColor` pages don't change.
- **How the keys move:** TypeScript's Rename Symbol on each key, never a regex. `render.ts` has its own `line: string` field and `input.line` (lines 20, 82 and 103) beside `t.line`. Rename Symbol carries the 29 key uses in `src/lib/email/render.ts` (`t.fg3` 8, `t.fg1` 7, `t.line` 5, `t.act` 3, `t.surface` 3, `t.onAct` 2, `t.fill1` 1) and `brandTokensDark.line` in `monogram-art.ts:65`. It skips comments and strings, so the header's examples ("fill1 is --fill-1"), the `cssVarName` JSDoc and the section 11 citation are edited by hand.
- 3 tests: `brand-tokens.test.ts` (the key set, and `cssVarName("fill1")` becomes `cssVarName("mutedForeground")`, "--muted-foreground"), `print-tokens.test.ts` (its 12 required names), `utils.test.ts` (4 class strings on lines 7 and 10: `text-fg-3` and `shadow-line`).
- 8 more files change only in comments, through the script: `src/components/public/type.module.css` (4 names on lines 10, 15 and 33), `financials/rent-roll/grid-frame.tsx`, `login/_components/login-form.tsx`, `components/monogram.tsx`, `components/public/ui.tsx`, `lib/dates.ts`, `lib/home/needs-you.ts` and `lib/property-types.ts`. With the files above, the script touches 173 files under `src`; `render.ts` changes only through Rename Symbol and its hand-edited comments.
- `eslint.config.mjs`, its section 11 comment included.
- New: `scripts/token-renames.mjs`, `scripts/rename-tokens.mjs`, `scripts/zero-pixel-proof.mjs`, `src/lib/token-names.test.ts`.
- CLAUDE.md (three lines, section 6.1).
- Docs: the renamed tokens have 678 `--name` and 18 class mentions in 16 files. With sections 11 and 12 of the brand doc replaced first, the script changes 659 and 13 of them, in 13 files: brand-guidelines 155, components 116 and 1, and the specs uploads-photos 82 and 1, selectors 63 and 1, forms-editing 60 and 4, charts 59, activity-comments 55, search 43, build-plan 15 and 6, performance 8, tenant-contact 1, contractor-trades 1 and view-as 1. The derived family adds 15 (13 in the brand doc, 2 in selectors). The 3 `docs/uiux-review/` files (9 and 2) stay as a dated audit, with a header line saying their names are from before Nov 14. The brand doc's bare-word grounds are edited by hand (section 6.2).

**The rename script.** One pass per file with a lookup callback, never a chain of `sed`s, so no name is renamed twice and token order doesn't matter.

- **Classes:** `OLD_CLASS` from `token-renames.mjs`, replaced with the prefix plus `RENAMED[token]`. The lookbehind allows variant chains (`hover:`, `group-hover/row:`, `[&_svg]:`); the lookahead keeps `/70` opacity and stops `line` matching `line-strong`.
- **Variables:** `OLD_VAR`, replaced with `--`, the `color-` prefix if present, and the new name.
- **The `act` rule:** an `outline-act`, or a `ring-act` or `border-act` with `focus`, `focus-visible`, `focus-within`, `data-focus-visible` or `group-focus-visible` in its variant chain, becomes `ring`. Everything else becomes `primary`. That gives 24 in 15 files and 30 in 15.
- **Scope, by glob:** `src/**/*.{ts,tsx,css}`, tests included; `docs/**/*.md`; CLAUDE.md. Excluded: `docs/uiux-review/` and this spec. A spec added after today is in scope without an edit, as `contractor-trades.md` is. `token-names.test.ts` scans the same globs plus `tests/`, and skips `tests/devices/gallery-reporter.ts`, which defines its own `--line` and `--muted` for the report page.
- **What it never touches,** verified by a dry run at `9a822de` (1,320 class hits across every HG token, none at an import path, prop value or data attribute): `data-surface="public"`, `line-clamp`, `underline`, `line-through`, `select-none`, `variant="danger"`, `tone="danger"`, `@/lib/toast-line`, `@/components/source-line`, `whitespace-pre-line`, `eslint-disable-next-line`, the `<canvas>` element, and the `input, select, textarea` selector.
- **`--check`** walks the same globs, prints every old name it would change and exits non-zero. It's how a later branch is checked. It can't see object keys; typecheck covers `brandTokens`.

**Lands alongside.** The lint change (section 6.4), the three test updates, `token-names.test.ts`, the brand doc's section 4 and 5 lines, its bare-word edits and its history section, the three code comments that cite section 11, the docs rename, and CLAUDE.md's three lines.

**Tailwind order.** 6 `className` template literals bypass `cn`, one of them (`(home)/loading.tsx:52`) taking its caller's `className`; no `clsx` call does (the only one is inside `cn`). The proof's order check covers them (section 7.1).

### 7.3 Landing 2: components

**Scope.** Sections 4.1 to 4.7: component and part renames, the 27 parts of decision 8, `Button` and `Badge` variants and sizes on cva, size keys `md` to `default`, the dead exports in section 4.4, `components.json`, the CLI workflow, the docs/components.md rewrite, brand sections 3, 5 and 9, the living docs, and the CLAUDE.md and README wording.

**Files.**

- 96 files for 232 import renames, plus each component's own file, and the 5 renamed component files.
- Variant edits: 17 `primary` to `default`, 43 `secondary` to `outline`, 3 `LinkButton`s gaining `variant="outline"`, 21 `icon` flags to sizes, 5 Badge sites, 4 `Kbd` sites.
- `size="md"` on the other controls: written 9 times in 6 files (`BasisControl`, `PeriodControl`, `SearchInput`, `SegmentedControl` 4, `Select` 2). `DateField`, `AddressCombobox`, `Combobox`, `Input`, `Dialog`, `FormDialog`, `CreateForm` and `Code` default to `md` and are never written with it, so only their types change (the field ones through `FieldSize` and `fieldSizeClass` in `ui.tsx`).
- The public CTAs: `publicCtaClass` and `publicSecondaryClass` in `components/public/ui.tsx` and `authButtonClass` in `login/_components/auth-frame.tsx`, rebuilt on `buttonVariants({ size: "lg" })`. Their 11 sites in 7 files keep their `className`.
- 4 tests that match source text: `src/lib/tasks/conflicts.test.ts:44` (`variant="secondary"`), `src/lib/composer-draft.test.ts:240` and `src/lib/deals/note-send.test.ts:18` (`<MenuItem id="retry"`), and `src/lib/sheet-routes.test.ts:17`, which reads `<SheetRoute path="` in each of the 4 `@modal` intercepting pages.
- Comments and JSDoc examples that name a renamed component or file are edited by hand, because Rename Symbol skips them. At `200093a` that is 32 comment lines in 18 `src` files that name one in code form (backticked, `<Name` or a file name), among them `@modal/default.tsx:11`, `lib/sheet-routes.ts:3`, `lib/focus.ts:3`, `popover.tsx:21`, `confirm-dialog.tsx:8`, `sheet-views.ts:2`, and the usage examples in `menu.tsx`, `form-sheet.tsx`, `sheet.tsx`, `ui.tsx`, `number-input.tsx` and `create-form.tsx`. Prose mentions such as "a Sheet" get a read-through as well.
- New: `src/components/variants.test.ts` (section 7.1) and `src/components/parts.test.ts` (section 4.6).
- `components.json` (new), docs/components.md, docs/brand-guidelines.md sections 3, 5 and 9, the 14 docs in section 6.5, CLAUDE.md and README.md.

**Approach.** Names are renamed with TypeScript's rename (the editor's Rename Symbol), not a regex. Case matters, and React Aria's own names sit right beside ours:

- `Button as AriaButton` is imported in 33 files, and `Input`, `Popover`, `Menu`, `MenuItem`, `MenuTrigger`, `Switch` and `DateField` come in as `Aria*` too. React Aria's import specifiers are never renamed.
- React Aria exports `ComboBox` and `Dialog`. HG's `Combobox` differs only by case. React Aria's `Dialog` is imported unaliased in 5 files (`confirm-dialog.tsx`, `lightbox.tsx`, `menu.tsx`, `popover.tsx`, `sheet.tsx`). Two of them collide with HG's new `Dialog`: `sheet.tsx`, which defines it, and `menu.tsx`, which imports HG's `Sheet` (`menu.tsx:24`). Both take `Dialog as AriaDialog` first, and `sheet.tsx` also takes `type DialogProps as AriaDialogProps` before `SheetProps` becomes `DialogProps`.
- `command-palette.tsx` imports `type Command` from `@/lib/commands` (line 47, used at 909). It becomes `Command as CommandEntry` before `SearchPanel` becomes `Command`.
- Order: delete the dead exports (section 4.4) first, then rename, then change the variant and size unions. Typecheck lists every literal left on an old key. `size="md"` is changed per component type, never globally.

**Checks.** Section 7.1. The CSS proof should match once candidates found only outside `src`'s non-test files are filtered, but it can't show that each element kept its classes: `buttonClass` becomes cva's `buttonVariants`, Badge's tones become `badgeVariants`, and the public CTA classes are rebuilt on `lg`. `variants.test.ts` is that proof. Open every dialog, alert dialog, dropdown menu, toggle group and empty state at 375 and 320, and one dialog, alert dialog and dropdown menu written with parts beside its props twin at 375 and 1280.

**Lands after** landing 1 is live, when no other session is mid-landing.

### 7.4 Landing 3: sweep

**Scope.** Raw `<button>`s and the visible raw fields onto the primitives, in two parts. The first part moves the controls that already match a primitive's look, with no pixel change. The second part moves the rest and changes their look, per decision 7. The parts can land together or apart; the second waits on Connor's approval of each group.

**Raw buttons: 36 in 28 files under `src/app`, and 43 in 23 files under `src/components`.** Most of the `src/components` ones are the insides of primitives (`AddRow`, the pickers) and stay; the ones in the tables below move.

**First part: no pixel change (15 buttons).**

| Group | Sites | Target | Files |
|---|---|---|---|
| `textLinkClass` on a raw button | 9 | `Button variant="link"` | `portfolio-capex.tsx`, `properties/[id]/capex-outlook.tsx`, `settings/capex-rules-editor.tsx`, `settings/move-in-form/move-in-form-editor.tsx`, `(marketing)/residents/moving-in/move-in-form.tsx`; and in `src/components`: `create-form.tsx`, `fact-strip.tsx`, `load-latest.tsx`, `money-bars.tsx` |
| Hand-styled links that match `textLinkClass` | 2 | `Button variant="link"` with its own classes | `tasks/[id]/activity.tsx:288`: the same underline, with `text-fg-2` and `hover:text-fg-1` on top; `components/filter-bar.tsx:198` (Clear filters): `textLinkClass` written out, with `relative shrink-0 whitespace-nowrap` and its touch area |
| Public CTA class on a raw button | 2 | `Button size="lg"` | `(marketing)/error.tsx` (`publicCtaClass`), `login/_components/auth-crash.tsx` (`authButtonClass`) |
| Ghost icon button on `buttonClass` | 2 | `Button variant="ghost"`, `size="icon-sm"` or `size="icon"` | `components/files-list.tsx:376` (Remove, `sm`); `components/composer.tsx:885` (`IconButton`, `md`) |

**Second part: the look changes (37 buttons and links, 2 fields).** Each group has a proposed target. Before it ships, Connor sees every site before and after at 1280x800, 768x1024 and 375x667, in light and dark, and approves it by group. Where the proposed target looks wrong for a site, the review shows 2 or 3 options with a recommendation, per CLAUDE.md, built only once one is picked. A group he doesn't approve stays raw, with a one-line comment naming its job.

| Group | Sites | Proposed target | What changes |
|---|---|---|---|
| Hand-styled links that don't match `textLinkClass` | 14: 5 in `src/app`, 7 in `src/components`, 2 in `media-uploader.tsx` | `Button variant="link"`, keeping any color class the site sets | Underlined at rest, a 2px underline on hover, `--foreground` text where the site sets no color |
| Row and value edit targets, disclosures | 7 | `Button variant="ghost"`, text left-aligned | `Button`'s height, padding, label size and hover fill |
| Checkbox glyphs with `role="checkbox"` | 2 | `Checkbox` (`large` in the checklist) | The native checkbox look in place of the drawn glyph |
| Photo tiles and photo controls | 7 | `Button variant="ghost"`, icon sizes for the controls, the on-photo colors kept on top | `Button`'s radius, hover fill and touch size over the photo |
| Small icon buttons | 4 | `Button variant="ghost" size="icon-sm"` | A 32px box with a hover fill |
| Chip and row toggles | 2 | `ToggleGroup` | The segmented control look |
| Inline add | 1 button | `Button variant="ghost" size="sm"` | `Button`'s height and padding |
| Hand-built fields | 2 | `Input size="sm"` (the checklist's add field), `Textarea` (`comment-card.tsx:329`, the comment edit field) | The checklist field gains an edge and a 32px height; the comment field takes `fieldClass` and the global focus outline |

The links: `deals/[id]/deal-log.tsx:169`, `tasks/[id]/activity.tsx:117` and `settings/editor-controls.tsx:24` underline on hover only; `tasks/[id]/review-banner.tsx:206` has no `hover:decoration-2`; `p/welcome/password/page.tsx:29` (`authLinkClass`) has no underline. Inside `src/components` primitives: `railVerbClass` (`--fg-2` with a plus, underlined on hover) on `rail.tsx:96` (`RailVerb`) and `inline-field.tsx:628`; `back-link.tsx:43` and `command-palette.tsx:488` underline on hover only; `comment-card.tsx:466` has no color of its own; `files-list.tsx:390` (`RowRetry`) has no `hover:decoration-2`; `toast.tsx:130` takes the toast's colors. `media-uploader.tsx`'s two are already out of the sweep |. Moving the two `media-uploader.tsx` links updates `src/components/followups-wiring.test.ts:50`, which matches `Reload</button>` in that file's source, to match `</Button>`.

The other groups:

- **Row and value edit targets, disclosures (7):** `building-capex.tsx`, `edit-listings.tsx`, `edit-units.tsx`, `status-control.tsx`, `apply-flow.tsx`, `task-section.tsx` (a disclosure header), `needs-you.tsx` (the phone's "{N} more" reveal).
- **Checkbox glyphs with `role="checkbox"` (2):** `tasks/[id]/checklist.tsx`, `tasks/task-checkbox.tsx`.
- **Photo tiles and photo controls (7):** `listing-photos.tsx` (2), `property-photo.tsx` (2), `rentals/photo-carousel.tsx` (3).
- **Small icon buttons (4):** `capex-rules-editor.tsx` (the "What … means" info button), `editor-controls.tsx` (delete), `tasks/new/new-task-fields.tsx` (remove), `login/_components/password-field.tsx` (show password).
- **Chip and row toggles (2):** `financials/_components/period-row.tsx` (on `pickerChipClass`), `properties/capex-ui.tsx` (the `aria-pressed` year rows).
- **Inline add (1):** the checklist's "Add item".

**Raw fields: 17 in 8 files under `src/app`.** 16 stay raw: 12 are `type="hidden"` (9 in `tasks/new/new-task-fields.tsx`), 1 is a hidden email for password managers (`welcome-form.tsx`), 2 are hidden file inputs (`property-photo.tsx`, `job-actions.tsx`) and 1 is the move-in form's honeypot (`sr-only`, `aria-hidden`). They draw nothing, so there is no look to share. The 17th, the checklist's borderless add field, moves in the second part. `src/components` has 14 in 8 files: the primitives' own, which stay, and `comment-card.tsx:329`'s edit field, which moves in the second part.

**Lands alongside.** docs/components.md's Duplicates rows for Button and Text field drop to what stays raw (the primitives' insides, the hidden fields and any group Connor keeps), and Known gaps' "Tap targets" line is rewritten. Brand doc section 9 notes any look the review settles that its Buttons table doesn't yet show.

**Checks.** Section 7.1. The first part adds a row per moved site in `variants.test.ts`, asserting the same class set. The second part lists its sites as expected differences in the CSS proof and the screenshot pairs, and every other difference still stops the landing. Every moved site is opened at 375 and 320 by hand, since several never show in the sweep: `(marketing)/error.tsx` and `auth-crash.tsx` are error screens, the two CapEx "All {N} years" links clear a picked year, so they need one picked first, and the photo controls need a listing with photos.

### 7.5 Branches open now

Checked at 12:34 on Nov 14, with main at `3087530`. Since `200093a`, main has taken code as well as docs. Landing 1's class count is now 1,045 uses in 163 files, 33 more than section 3.1 counts: contractor onboarding adds 29 (17 in `p/setup/setup-steps.tsx`) and the new-task chips add 4 net. `SheetView` has 5 importers, not 4, since `entity-picker.tsx` now uses it, and the chips work added `PropertyUnitPicker` and moved `StepHeader` into `picker-layer.tsx` (both HG picker pieces that keep their names). docs/specs/tenant-contact.md now has 2 token and 11 component mentions where sections 6.5 and 7.2 count 1 and 12. Sessions are landing every few minutes, so recheck before each landing.

| Branch (worktree) | State | Overlap |
|---|---|---|
| `design-calls-nov14` (`skills-grill-me-setup-a0e88f`) | 4 commits (`376d278`, `6a52728`, `1c457e5`, `04bbe4c`), 40 behind main, plus 9 uncommitted files | 88 `src` files changed; 10 add renamed token classes (15 uses). Four of its tests assert `text-fg-3` or `bg-fill-1` class strings (`list-page.test.ts`, `lists-loading-wiring.test.ts`, `menu-cap.test.ts`, `properties/property-page-wiring.test.ts`). Edits docs/brand-guidelines.md, docs/components.md and 4 specs. Let it land first, then cut landing 1 from the new main. If it lands later, run it through `rename-tokens.mjs`, tests included |
| `claude/contractor-form-integration-55b2b4` (`copy-writing-standard-42a734`) | Landed: `eb3c671` and its merges are on main after `200093a`; clean at `b0bc4d2` | Adds 2 routes (`p/setup`, `join/[token]`), so the 31 routes and 186 shots in 7.1 move, and 29 old-name class uses in 5 files to landing 1's count. New docs/specs/contractor-onboarding.md, with no old token names |
| `claude/shortcuts-placement-32e9a4` (`asana-migration-remaining-c49243`) | Landed: `cfb3ec4` is on main; clean | Adds 4 old-name class uses net (picker-layer 5, date-panel 3, entity-picker 1, repeat-menu 5 fewer) to landing 1's count. Its picker and `popover.tsx` changes and its docs/components.md and docs/specs/selectors.md edits are on main |
| `claude/superadmin-impersonation-46f6c8` (`elated-leavitt-46bc8c`) | Landed as `ea70759` and `200093a` (spec only, build paused); clean at `200093a` | Its CLAUDE.md line (16) and docs/specs/README.md entry are on main. docs/specs/view-as.md adds 1 token mention to landing 1 and 5 component mentions to landing 2 |
| `claude/remove-cancel-task-295ffe` (`remove-cancel-task-295ffe`) | At `e233e43`, 20 behind, 14 uncommitted files | 12 `src` files changed, the task page, `components/composer.tsx` and `inline-field.tsx` among them; 4 add old-name classes (11 uses). Edits docs/components.md and docs/specs/forms-editing.md. Active: treat it as mid-landing |
| `claude/contractor-job-details-77b778` (`dev-environment-setup-5713a6`) | At `771b6ab`, 4 behind, 19 uncommitted files (1 new) | All 19 in `src`, none adding an old token class. `review-banner.tsx` and `back-link.tsx` hold landing 3 sites. Active: treat it as mid-landing |
| `claude/error-monitoring-docs-abc5aa` (`error-monitoring-docs-abc5aa`) | 1 commit (`5936852`, a spec), 18 behind, plus `package.json` and `package-lock.json` uncommitted | Its docs/specs/README.md edit is the error-alerts entry, just above where this spec's entry goes. docs/specs/error-alerts.md has no old token or component names |
| `claude/contractor-lockbox-tenant-access-fda6c9` (`contractor-lockbox-tenant-access-fda6c9`) | Landed: at `3087530`, main's head, clean | None |
| `claude/hg-app-product-roadmap-623cf2` (`hg-app-product-roadmap-623cf2`) | Landed: at `1e0ed6d`, clean | New docs/roadmap.md, with no old token or component names |
| `claude/refresh-toast-notification-dfd82e` (`vercel-secrets-cleanup-71c0be`) | At `b0bc4d2`, 1 behind, clean | None |
| `claude/invoice-tracking-spec-e9ccf4` (`contractor-password-saved-message-6ed0f3`) | At `661d52c`, 21 behind, clean | None |
| `claude/hg-capital-design-standard-e3c4ee` (`task-management-migration-4c9ddf`), this spec | At `9a822de`, 30 behind; this spec and its README entry uncommitted | Its docs/specs/README.md entry sits after error-alerts, where main added the contractor-trades and view-as entries. Merging conflicts there: keep all three. The contractor-job-emails entry, above error-alerts, merges cleanly |

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 1. The lint rule bans the exact names the rename adopts | Landing 1 replaces the pattern in the same commit (section 6.4) |
| 2. Stale classes fail silently: Tailwind drops an unknown class, and lint runs in CI after the deploy | Run `rename-tokens.mjs` on every branch merged after landing 1, `npm run lint` before every push, `token-names.test.ts` for CSS, tests and docs, and typecheck for `brandTokens` keys |
| 3. Old aliases used these names with other meanings until Oct 25 (`text-muted` was `fg-3`, `bg-background` was `fill-1`) | Keep the narrow ban on ground names as text; rewrite the brand doc's section 11; run any revert or cherry-pick of a pre-Oct 25 commit through the script |
| 4. `shadcn init` overwrites `utils.ts` and rewrites `globals.css` | Never run it; `components.json` is written by hand; every `add` is dry-run first and checked for those diffs (section 5.3) |
| 5. shadcn's radius block moves 182 `rounded-*` uses | `--radius` only, on `:root`; never the `--radius-*` block |
| 6. Pointer tokens on `:root` alone give the public site light values | Declared in `:root, [data-surface="public"]` (section 3.2) |
| 7. Pairs equal in light but not in dark (`destructive` and `danger-fill`, `background` and `popover`, `toast-bg` and `foreground`) | Kept apart; pulled overlays, tooltips and destructive buttons conform per section 5.4 |
| 8. Pulled components import `cn` from the `cn` package and skip HG's merge config | Imports rewritten to `@/lib/utils`; the `cn` package uninstalled |
| 9. shadcn's aria Button, LinkButton and Table are React Aria parts with other events and roles | HG's implementations stay; only names, variant keys and size keys change |
| 10. `LinkButton`'s default flips from secondary to default | The 3 bare sites say `variant="outline"` in the same commit |
| 11. `lg` at 44 on touch would shrink the public CTAs from 48 | `lg` carries `pointer-coarse:min-h-12` |
| 12. shadcn's Tooltip has no tap on touch; its AlertDialog closes while busy | HG's Tooltip and AlertDialog code stays |
| 13. Renames reorder same-property utilities in Tailwind's sort | The proof fails only on a flipped pair in a literal or template outside `cn()`, where tailwind-merge can't settle it (section 7.1) |
| 14. Bare-word replaces hit props, attributes and built-ins | Prefix-anchored regex in one pass, dry-run with no false hits; bare words in the brand doc are edited by hand |
| 15. Component renames collide with React Aria names (`AriaButton`, `ComboBox`, `Dialog`), with an imported `Command` type, and with dead HG exports (`Field`, native `Select`) | TypeScript rename; the colliding imports aliased first; dead exports deleted first |
| 16. aria-vega's `dark:` classes assume a translucent `--input` | Stripped from every pulled file |
| 17. The device check shows light, default states only and wipes its last run | The CSS proof covers every state and theme in the stylesheet; `variants.test.ts` covers each element's classes; the base runs in its own worktree, and its first run is copied out |
| 18. Tests that assert source text break | Listed per landing: 3 in landing 1, 4 in landing 2 |
| 19. Another session lands token classes or `brandTokens` keys under the old names | Landing order in section 7.5; `--check` on every merge; typecheck for keys |
| 20. A pulled item's dependency shares an HG file name | Answer No to the overwrite; point the pulled code at HG's file and parts (sections 4.6 and 5.3) |
| 21. Pulled code uses keys HG lacks (`secondary`, `xs`, `icon-lg`, the destructive tint) | The key map in section 5.4; `secondary` is left out so it fails typecheck |
| 22. The CSS proof reads the `act` split and the pointer block as differences | Compared by resolved value per element (light root, dark root, the public wrapper under a light root, each in print), with the pointer block as expected additions |
| 23. Landing 3's second part changes the look of 37 buttons and links and 2 fields | Each site shown before and after at 1280, 768 and 375, light and dark, and approved by group; a group not approved stays raw; the proof treats only the approved sites as expected differences (section 7.4) |
| 24. A dialog or field can be written two ways (decision 8) | Each part renders its prop's own internals, so both forms give the same screen; `parts.test.ts` compares the markup; docs/components.md shows the props form first |

## 9. Decisions made after the first draft

1. **Decided Nov 14: the derived families follow the base** (decision 9, option A). `--act-hover` becomes `--primary-hover`, and the `--danger-*` family and `--on-danger` become `--destructive-*` and `--destructive-foreground` (section 3.3). Landing 1 renames them with the rest, and the old-name ban covers them.
2. **Decided Nov 14: the controls that can't move unchanged move anyway** (decision 7, option B). Landing 3's second part moves them and takes the look change, each site shown to Connor at three sizes before it ships (section 7.4).
3. **Decided Nov 14: parts beside props** (decision 8, option B). Landing 2 adds the 27 parts HG already draws; the rest arrive when first needed (section 4.6).

Beyond these, any visual change found in any landing comes to Connor before it ships.

## References

- shadcn/ui: [docs](https://ui.shadcn.com/docs), [React Aria base](https://ui.shadcn.com/docs/changelog/2026-07-react-aria), [cn package change](https://ui.shadcn.com/docs/changelog/2026-09-cn), [CLI v4](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4), [theming](https://ui.shadcn.com/docs/theming), [CLI](https://ui.shadcn.com/docs/cli), [components.json](https://ui.shadcn.com/docs/components-json), [schema](https://ui.shadcn.com/schema.json), [components](https://ui.shadcn.com/docs/components).
- shadcn/ui aria pages: [button](https://ui.shadcn.com/docs/components/aria/button), [dialog](https://ui.shadcn.com/docs/components/aria/dialog), [dropdown menu](https://ui.shadcn.com/docs/components/aria/dropdown-menu), [tooltip](https://ui.shadcn.com/docs/components/aria/tooltip), [popover](https://ui.shadcn.com/docs/components/aria/popover), [select](https://ui.shadcn.com/docs/components/aria/select), [toast](https://ui.shadcn.com/docs/components/aria/toast).
- aria-vega registry items (the class strings in sections 3, 4.5 and 5.4): [registry](https://ui.shadcn.com/r/styles/aria-vega/registry.json), [button](https://ui.shadcn.com/r/styles/aria-vega/button.json), [badge](https://ui.shadcn.com/r/styles/aria-vega/badge.json), [dialog](https://ui.shadcn.com/r/styles/aria-vega/dialog.json), [alert-dialog](https://ui.shadcn.com/r/styles/aria-vega/alert-dialog.json), [dropdown-menu](https://ui.shadcn.com/r/styles/aria-vega/dropdown-menu.json), [popover](https://ui.shadcn.com/r/styles/aria-vega/popover.json), [tooltip](https://ui.shadcn.com/r/styles/aria-vega/tooltip.json), [card](https://ui.shadcn.com/r/styles/aria-vega/card.json), [input](https://ui.shadcn.com/r/styles/aria-vega/input.json), [select](https://ui.shadcn.com/r/styles/aria-vega/select.json), [sheet](https://ui.shadcn.com/r/styles/aria-vega/sheet.json), [aria-nova utils](https://ui.shadcn.com/r/styles/aria-nova/utils.json), [registries](https://ui.shadcn.com/r/registries.json).
- shadcn/ui styles: [shadcn create](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create), [Luma](https://ui.shadcn.com/docs/changelog/2026-03-luma), [Sera](https://ui.shadcn.com/docs/changelog/2026-04-sera), [Rhea](https://ui.shadcn.com/docs/changelog/2026-05-rhea).
- shadcn/ui source: [aria base](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/bases/aria), [init](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/init.ts), [add](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/add.ts), [preset defaults](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/preset/defaults.ts), [tailwind.css](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/tailwind.css), [CSS variable updater](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/updaters/update-css-vars.ts), [file updater](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/updaters/update-files.ts), [dependency updater](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/updaters/update-dependencies.ts), [import transformer](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/transformers/transform-import.ts), [icon transformer](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/transformers/transform-icons.ts), [menu transformer](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/transformers/transform-menu.ts), [cn](https://github.com/shadcn-ui/cn).
- Intent UI: [introduction](https://intentui.com/docs/getting-started/introduction.md), [installation](https://intentui.com/docs/getting-started/installation.md), [registry](https://intentui.com/r/registry.json), [button](https://intentui.com/r/button), [primitive](https://intentui.com/r/primitive), [theme](https://intentui.com/r/theme-default), [repo](https://github.com/irsyadadl/intentui), [package.json](https://raw.githubusercontent.com/irsyadadl/intentui/4.x/package.json).
- In the repo: `src/app/globals.css`, `eslint.config.mjs`, `src/lib/utils.ts`, `src/lib/brand-tokens.ts` and its tests, `src/lib/email/render.ts` and its test, `src/lib/print-tokens.test.ts`, `src/lib/sheet-routes.test.ts`, `src/components/ui.tsx`, `tests/devices/`, `playwright.config.ts`, `scripts/device-check-gate.mjs`, `node_modules/tailwindcss/theme.css`, `node_modules/tailwindcss/dist/lib.js`, and `git show 1ce1042` (the Oct 25 alias retirement).
