# Design foundation: stock shadcn/ui on React Aria

Draft for Connor: nothing is built, and building waits for an explicit "build it". Planned with Connor on Nov 14, 2026. The first draft, committed at `ff7d92b`, renamed HG's tokens and components to shadcn's names and kept HG's component code, with no pixel change. Later that day Connor picked stock components with HG's colors as the theme (decisions 10 and 11). He then asked for every recommendation that standardizes the app and removes custom design, without deciding each one. Decision 12 records those calls, and this revision rewrites the plan around them: landing 1, the zero-pixel color rename, stays first, and landings A to M replace the old landings 2 and 3, each reviewed by Connor before it ships.

Landing 1's counts were checked at `e233e43` and `200093a`, and section 7.5 rechecks them at `3087530`. The stock map's counts are at `ff7d92b`, from a research pass that afternoon; main reached `0804aad` during it and `7e39219` by 15:00. A count from any other commit names it. Since `ff7d92b`, main has grown the fields family by about a third (`<FormField` went from 60 to 78 sites by a plain regex), so E's recount will be higher. Main takes about 50 commits every six hours, so each landing rechecks its counts on a fresh `origin/main`, and each call-site change ships as a codemod that can be re-run.

## 1. Summary

**Today.** HG builds on the stack shadcn's React Aria base uses: react-aria-components 1.21.1, Tailwind v4, `cn`, class-variance-authority and lucide-react, with components kept as source in `src/components/`. HG's own code draws the Ink and Limestone look ([brand-guidelines.md](../brand-guidelines.md)).

**The goal.** Every component is shadcn/ui's aria-vega item, exactly as `npx shadcn add` writes it. HG keeps the theme: Ink and Limestone's colors, gold, the status colors and Geist. The public site goes stock too. Where stock has no item, HG composes stock parts with layout classes only. A few global rules in `globals.css` hold the accessibility floor stock misses (section 5.3).

**On screen,** across landings A to M: corners grow one step; buttons, fields, menus, dialogs, badges and tables take the stock look; dialogs become bottom sheets on phones; menus and pickers stay anchored; Select opens the native picker on touch; search opens a centered dialog; the sidebar becomes an icon rail from 768; the toast becomes a card on the popover color at bottom right; focus becomes a 3px half-ink halo; overlays fade and zoom; skeletons pulse; type moves to Tailwind's sizes, so phone body text drops from 16 to 14px. A few colors shift: status tints fold into the status color at 10%, public faint text lightens, progress bars fill ink, gold leaves hovers, and dark fields fill gray. **Unchanged:** every kept token's value in light, dark, print and on the public site; email; Geist; 44px touch targets and 16px fields on touch; reduced motion; the copy rules.

| # | Decision | Pick | Status |
|---|---|---|---|
| 1 | Foundation | shadcn/ui on its React Aria base | Holds. Ink and Limestone is the theme only (10) |
| 2 | Naming | Tokens and components take shadcn's names; roles shadcn lacks keep HG names | Holds. The toast, pill, public and type names retire with their components |
| 3 | Pixels | Zero change in the renames | Holds for landing 1 only. Later landings go to Connor first |
| 4 | Button | Superseded by 12.2: stock variants and sizes | Superseded |
| 5 | Rules | shadcn's aria registry, then Intent UI, then Mobbin | Changed by 12.24: missing controls are composed from React Aria and stock parts |
| 6 | Rollout | Three landings | Changed by 12.29: landing 1, then A to M |
| 7 | Controls that can't move unchanged | Superseded by 12.2: raw controls move in their family's landing | Superseded |
| 8 | Parts | Superseded by 12.2: call sites use stock parts, with no props beside them, except `FormField` and the compositions in 12.24 | Superseded |
| 9 | Derived color names | Follow the base: `--primary-hover` and the `--destructive-*` family | Holds for landing 1; they retire as their components go stock |
| 10 | How far to standardize | Stock shadcn with our colors (over stock with its colors). Ink and Limestone's colors, gold, the status colors and Geist stay as the theme | Holds |
| 11 | Public site | Stock there too (over its own marketing look), with Tailwind type. Gold stays in the words, not in button hovers | Holds |
| 12 | The calls that follow | Made Nov 14 on Connor's standing instruction: take every recommendation that standardizes the app (section 1.1) | Holds |

### 1.1 Decision 12: the settled calls

"Stock over" marks a call that took stock over a research recommendation leaning toward HG's own behavior.

| # | Call |
|---|---|
| | **Setup** |
| 12.1 | Landing 1 stays first with its zero-pixel proof, minus the planned bans on Tailwind's shadows, white, black and backdrop blur, which stock uses. Its lint flip still lands |
| 12.2 | The old landings 2 (component rename) and 3 (sweep) are dropped; each family's landing renames as it goes. Kept from them: `components.json`, the dead-export deletions (4.11), Rename Symbol over regex, and aliasing colliding React Aria names (`Dialog as AriaDialog`, `Command as CommandEntry`). Decisions 4, 7 and 8 are superseded: stock variants and sizes; raw buttons and fields move in their family's landing (4.10); call sites use stock parts, except `FormField`, which stays as thin wiring over stock Field parts, and the compositions under 12.24 that keep props: `LinkButton`, `ResponsiveDialog` and the touch `Select` |
| 12.3 | Stock files live in `src/components/ui/`, unedited except `table.tsx`'s recorded edit (12.19), with one lint override. Only `npx shadcn@4.23.0 add`, and never `init` on the branch (one throwaway `init` in a scratch worktree, as a CSS reference). `components.json` is written by hand |
| 12.4 | Packages: tw-animate-css and shadcn 4.23.0 as pinned devDependencies, importing `shadcn/tailwind.css` (stock over vendoring the file); sonner and next-themes with no ThemeProvider; the `cn` package; Node 24 locally and in `engines`; no `@base-ui/react` |
| 12.5 | Stock files keep `import { cn } from "cn"` (stock over pointing them at HG's `cn`). HG's `cn` moves onto `cn/config`'s `createCn` until the type roles retire, then becomes the plain re-export. Until then no HG type, shadow or motion class goes into a stock part. Lint bans `"cn"` in app code |
| 12.6 | Radius: stock `--radius: 0.625rem` and its scale, in landing A |
| 12.7 | Global rules in `globals.css`, keyed on stock markup so stock files stay unedited: 44px heights on touch (48 on public CTAs), 16px fields on touch, a reduced-motion reset for tw-animate and `animate-pulse`, an inset ink ring on a picked toggle (above 3:1, WCAG 1.4.1), and HG's focus outline only on elements without `data-slot` (5.3) |
| 12.8 | Dark mode stays on HG's `data-theme`. HG's opaque dark `--input` stays: a 4.03:1 field edge, against 1.55:1 for shadcn's white at 15% |
| 12.9 | React Aria's `UNSAFE_PortalProvider` on the 3 public grounds, through a small client wrapper (5.5); `react-aria` becomes a direct dependency pinned at 3.52.1 |
| 12.10 | Lint: the hex, palette and old-name bans apply everywhere; the white, black, shadow and blur bans in app code only; the text-size ban until the type roles retire |
| | **Components** |
| 12.11 | Button is the stock aria Button with React Aria's props (`onPress`, `isDisabled`, `isPending`, `excludeFromTabOrder`). Pending shows a stock Spinner at once (stock over HG's 200ms delay). `aria-keyshortcuts` and `aria-busy` are dropped (stock over forwarding them); the shortcut stays visible as `Kbd` text. Both HG reds become the stock destructive tint. `LinkButton` is `next/link` with `buttonVariants`, in a client file. Public CTAs take size `lg` |
| 12.12 | Badge is stock; the warn and ok sites move to `StatusBadge` |
| 12.13 | AlertDialog is stock. While busy, the confirm is a plain Button that doesn't close, Cancel is disabled and Esc is off |
| 12.14 | Tooltip is stock. Its 4 tap-reliant sites show their text another way on touch |
| 12.15 | Dialog from 768px up, Sheet `side="bottom"` below, switched by `use-mobile` (over shadcn's Drawer pattern, which adds Base UI) |
| 12.16 | Menus, popovers and pickers are anchored at every size (stock over HG's phone picker sheets and its placement hook). Select uses NativeSelect on touch, and sites that need search use Combobox. Widths are stock, plus a width class where content needs it (stock over HG's size-to-content rule, which retires) |
| 12.17 | ToggleGroup is stock, `variant="outline"` and `spacing={0}`, plus the pick ring (12.7) |
| 12.18 | Fields use stock Field parts through `FormField`; InputGroup for prefix and suffix; NumberInput and SearchInput are composed from stock parts and React Aria |
| 12.19 | Table is base-vega's plain HTML table with vega's classes. Its wrapper and sticky header are the one recorded edit to a stock file |
| 12.20 | Avatar is stock; contractors keep a rounded square through call-site classes |
| 12.21 | Toast is Sonner, with the Toaster's `theme` set from HG's theme. Toasts with an action stay 8 seconds and one without 5 (design call 7, `src/lib/toast-time.ts`); the corner and default duration are stock |
| 12.22 | Also stock: Skeleton, Spinner, Kbd, Card, Empty, Alert, Progress (the 6 progress bars; the 2 chart bars stay chart content), Separator, Calendar (quick picks as list rows under it), Command at every width (stock over HG's full-screen phone search) and Sidebar at use-mobile's 768 with the icon rail (stock over HG's 1024 drawer, Pin and hover rail; the skip link and focus move stay). Route sections stay a labeled nav with `aria-current`, drawn to match stock Tabs' line variant |
| 12.23 | HG compositions with no stock item become stock parts with layout classes only (section 4.10) |
| 12.24 | A control the aria registry lacks is composed from React Aria and stock parts: `LinkButton`, `ResponsiveDialog`, the touch `Select`, `PublicSurface`, NumberInput, SearchInput, DateField and the date picker among them. Intent UI is an anatomy reference only |
| | **Theme** |
| 12.25 | The type roles retire to Tailwind sizes after the components: title `text-2xl font-semibold`, section `text-base font-semibold`, body and meta `text-sm`, label `text-sm font-medium`, micro `text-xs font-medium`, figure-m `text-xl font-medium`, figures `tabular-nums`. Phone body text drops from 16 to 14px; fields stay 16px on touch |
| | Public: `publicType`'s 7 roles take Tailwind steps after shadcn's typography page: display `text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight`, eyebrow `text-xs font-medium uppercase tracking-widest text-gold`, the rest by nearest step (7.3, L) |
| 12.26 | Kept for app content: `fg-2`, `line-strong`, `canvas`, gold, the status colors, the photo colors, `ink-tile`, `tile-edge`, `chart-1`, `chart-ref`. `warn-tint` and `ok-tint` fold into `bg-warn/10` (dark `/20`) and the same for ok. Retired as their components go stock: `line-float`, the toast and pill tokens, `scrim`, `pub-faint`, `pub-gold-hi`, `--select` and its `::selection` rule, HG's elevation shadows, the motion tokens, `ease-spring` and `public/type.module.css`. Content motion moves to tw-animate classes and Tailwind steps in L |
| 12.27 | Public links take the stock link hover. Gold stays only as a text color |
| | **Rules and rollout** |
| 12.28 | The brand doc shrinks to the theme and page layout. CLAUDE.md defers to stock, keeping the accessibility floor and the content rules (section 6.4). A rule changes in the landing that first hits it; landing M consolidates |
| 12.29 | Landings 1, then A to M (section 7.3), about 10 to 13 working days, each with one review round. Connor reviews every landing after 1 before it ships (section 7.4), which replaces the zero-pixel proof. design-calls-nov14 lands before landing 1 is cut |

## 2. Reuse check

**Reused as is.**

- **react-aria-components 1.21.1.** An inferred set of 38 items the research checked (drawer and chart among them; listed in the packages map) imports 115 React Aria names, all present in it, and the CLI won't bump a package that package.json already declares. Six items the plan pulls weren't in that set (section 10).
- **Tailwind 4.3.3** and HG's `dark` custom variant (`globals.css:11`), which serves stock `dark:` classes with no `.dark` block.
- **class-variance-authority 0.7.1,** and **lucide-react 1.37.0,** which has every icon stock items use.
- **Every color value** in `globals.css`, the hex mirror `src/lib/brand-tokens.ts` with its tests, and email, which reads the mirror.
- **Geist** through next/font. **The 16px touch field guard** (`globals.css:457`) and **the reduced-motion block** (`globals.css:437`).
- **The device check** and `tests/devices/known-issues.json` (`{}`).
- **HG behavior stock has no part for:** the list and filter engines, drafts, uploads and their offline states, edit-in-place, leave guards, the hooks.

**Extended.**

- **`globals.css`:** pointer tokens (landing 1); the stock imports, base layer, radius scale and global rules (A).
- **`src/lib/utils.ts`:** `cn` moves onto `cn/config`; the other helpers stay.
- **`hg/design-tokens`:** the old-name and full palette bans (1); split into three scoped rules, with the stock-folder override, the app-only bans and the `cn` import ban (A).
- **`FormField`**, **`Select`** and **HG's compositions** (sections 4.7 and 4.10), rebuilt on stock parts.
- **The device check** gains a dark run, and **landing 1's base worktree** serves every review.

**New.**

- **Stock aria-vega components** in `src/components/ui/` ([React Aria base](https://ui.shadcn.com/docs/changelog/2026-07-react-aria), [registry](https://ui.shadcn.com/r/styles/aria-vega/registry.json), [components](https://ui.shadcn.com/docs/components)) and **base-vega's table** ([item](https://ui.shadcn.com/r/styles/base-vega/table.json)).
- **`components.json`** ([docs](https://ui.shadcn.com/docs/components-json), [schema](https://ui.shadcn.com/schema.json)), **the `add`-only CLI workflow** ([CLI](https://ui.shadcn.com/docs/cli), [add](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/add.ts), [init](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/init.ts)) and **its snapshot** in `scripts/shadcn-snapshot/` (5.6).
- **Four small compositions,** each with a docs/components.md row in its landing: `LinkButton` (`src/components/link-button.tsx`, B), after the As Link section of [shadcn's button page](https://ui.shadcn.com/docs/components/aria/button); `ResponsiveDialog` (`src/components/responsive-dialog.tsx`, F), after the Responsive example on [the drawer page](https://ui.shadcn.com/docs/components/aria/drawer) with stock Sheet in place of Drawer; the touch `Select` (H), after [the native-select page](https://ui.shadcn.com/docs/components/aria/native-select); and `PublicSurface` (`src/components/public/surface.tsx`, A), on React Aria's `UNSAFE_PortalProvider` (read from `node_modules/react-aria/dist/private/overlays/Overlay.mjs`).
- **Packages** (section 5.1): [tw-animate-css](https://cdn.jsdelivr.net/npm/tw-animate-css@1.4.0/dist/tw-animate.css), shadcn for [`tailwind.css`](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/tailwind.css), [cn](https://ui.shadcn.com/docs/changelog/2026-09-cn), [sonner and next-themes](https://ui.shadcn.com/docs/components/aria/sonner), react-aria.
- **shadcn's token names** ([theming](https://ui.shadcn.com/docs/theming)) and **landing 1's scripts:** `scripts/token-renames.mjs`, `scripts/rename-tokens.mjs`, `scripts/zero-pixel-proof.mjs`, `src/lib/token-names.test.ts`.
- **One codemod per family** in `scripts/`, on the TypeScript compiler API (installed).
- **The global rules' standards:** [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility) and [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) for 44px; [WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) and [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) for the pick ring; [2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) for motion; [APG tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) for route nav; [React Aria Tooltip](https://react-aria.adobe.com/Tooltip.md) for touch; [shadcn's typography page](https://ui.shadcn.com/docs/components/aria/typography) for links in sentences and public type.

**Retired.** HG's primitives, overlays, menus, toast and pickers, family by family; `ui.tsx`, `sheet.tsx` and `popover.tsx` in K. clsx and tailwind-merge, whose only importer is `utils.ts`.

## 3. Token map (landing 1)

Counts are utility classes in `src/**/*.{ts,tsx}`, not tests and not `globals.css`, at `e233e43`. Values don't change.

### 3.1 Renamed to shadcn's names

| HG token | shadcn name | Light / dark | Uses (files) | Note |
|---|---|---|---|---|
| `--surface` | `--background` | `#ffffff` / `#0f141e` | 38 (26) | Work surface and `body` |
| `--fg-1` | `--foreground` | `#152133` / `#ece9e4` | 193 (95) | Primary text |
| `--raised` | `--popover` | `#ffffff` / `#161d28` | 9 (8) | Menus, popovers, dialogs, sheets |
| `--fill-1` | `--muted` | `#f2f0ec` / `#181e2a` | 77 (49) | Hover fills, tracks, keycap, skeleton |
| `--fill-2` | `--accent` | `#e7e5e0` / `#212835` | 41 (15) | Highlight in raised layers, current nav item |
| `--fg-3` | `--muted-foreground` | `#5b6576` / `#a19e98` | 398 (122) | Meta, placeholders, idle icons |
| `--act`, fills and states | `--primary` | `#152133` / `#ece9e4` | 30 (15) | Every `bg-act`, and `border-act` or `ring-act` outside a focus variant |
| `--act`, focus | `--ring` | same | 24 (15) | Every `outline-act`, and `ring-act` or `border-act` under a focus variant |
| `--on-act` | `--primary-foreground` | `#ffffff` / `#0f141e` | 11 (6) | Label and icon on ink |
| `--danger` | `--destructive` | `#b91c1c` / `#f47b76` | 50 (30) | Red text, edges, rings |
| `--line` | `--border` | `#e7e5e0` / `#212835` | 120 (75) | Rules and dividers. The one `var(--line)` (`financials/rent-roll/page.tsx:24`) is renamed by the variable pass |
| `--line-control` | `--input` | `#84817a` / `#6e7684` | 21 (13) | Field and picker edges, the switch-off track |
| `--chart-1` | `--chart-1` | `#384e6e` / `#d7d0c3` | 3 (2) | No change |

The first twelve rows are 1,012 uses in 159 files. `--act` splits by context; the values are equal, so a wrong pick moves no pixel.

### 3.2 shadcn names added as pointers

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
```

- **Where.** In today's `:root, [data-surface="public"]` block (`globals.css:153`). On `:root` alone the public site would inherit light values. Print resolves them against its restated base tokens.
- **`@theme inline`** maps each as `--color-<name>` and drops the old `--color-*` names.
- **In landing 1** only `--ring` gets HG classes (the 24 focus uses), and HG's 2px outline still draws focus. From landing B, stock parts draw a `ring-3 ring-ring/50` halo with a `border-ring` edge: 3.22:1 on white, 4.60:1 on the dark ground.
- **`--card` is `--background`,** never `--popover`. **`--secondary` with `--fg-2` text** is HG's neutral badge, which stock's `secondary` badge draws. **The sidebar set** serves stock Sidebar in I. **`--chart-2` to `--chart-5` stay undefined:** HG doesn't pull the stock chart.

### 3.3 HG additions that keep HG names

| Token | Light / dark | Uses (files) | Job | After the stock landings (12.26) |
|---|---|---|---|---|
| `--fg-2` | `#424e61` / `#c0bdb7` | 110 (61) | Third text tier | Kept for app content; component uses fold into stock tokens |
| `--line-strong` | `#d5d1ca` / `#323947` | 31 (11) | Strong edges and table rules | Kept for statement rules and chart and timeline marks |
| `--line-float` | `--line` / `--line-strong` | 6 (5) | Floating layer edge | Retires (F, G, I, K) |
| `--canvas` | `#f8f7f3` / `#0a0e17` | 10 (9) | App chrome and the public, login and not-found ground | Kept; `--sidebar` points at it |
| `--warn`, `--warn-tint` | `#a54e09` / `#f7a059`; `#fff5ec` / `#321f0f` | 9 (7), 1 (1) | Status text and badge ground | `--warn` kept. The tint folds into `bg-warn/10 dark:bg-warn/20` (4.92:1 light, 6.12:1 dark) |
| `--ok`, `--ok-tint` | `#1d7038` / `#6ad18a`; `#eff9f1` / `#142619` | 9 (9), 2 (2) | Same as warn | `--ok` kept; the tint folds the same way (5.31:1, 6.46:1) |
| `--gold`, `--gold-deep` | `#c8a765`; `#86662c` | 12 (5), 0 | Brand; `--gold-deep` is email only | Kept, as a text color |
| `--ink-tile`, `--tile-edge` | `#152133` fixed; `--ink-tile` / `--line` | 1 (1), 1 (1) | Monogram | Kept |
| `--toast-bg`, `--toast-fg`, `--toast-fg-2`, `--toast-hover`, `--toast-edge` | `#152133` / `#212835` ground | 15 (2) | Toast and tooltip | Retire (D, G) |
| `--pill-bg`, `--pill-fg` | fixed | 7 (4), 7 (4) | Pills on photos | Retire (K) |
| `--on-photo`, `--photo-scrim`, `--photo-stage` | fixed | 34 (6), 15 (6), 3 (2) | Over photos | Kept |
| `--scrim` | `rgb(10 14 23 / 0.45)` / `rgb(0 0 0 / 0.6)` | 3 (3) | Modal backdrop | Retires (F, I) |
| `--pub-faint`, `--pub-gold-hi` | fixed | 8 (4), 1 (1) | Public site | Retire (L); `--pub-faint`'s uses take `muted-foreground` |
| `--select` | `#e4e9f0` / `#2a3548` | 0 | `::selection` | Not touched in landing 1. Retires in L with its `::selection` rule; the browser's selection color applies |
| `--chart-ref` | `var(--input)` | 0 | Prior-year tick ([charts.md](charts.md)) | Kept |

Also unchanged in landing 1: the type scale, elevation, motion, `--app-bar-h`, `--font-sans` and `--font-mono`. Landing L retires the type scale, the elevation shadows and the motion tokens, after moving content motion to stock steps (7.3). Two shadows stay as content: `inset-shadow-photo-edge` on photos, and `inset-shadow-rule` under the table's sticky header.

### 3.4 Derived families follow their base (decision 9)

| HG token | Light / dark | Uses (files) | New name |
|---|---|---|---|
| `--act-hover` | `#28364d` / `#d3d1cb` | 4 (2) | `--primary-hover` |
| `--danger-tint` | `#fff2f1` / `#341817` | 3 (2) | `--destructive-tint` |
| `--danger-fill` | `#b91c1c` / `#c92f33` | 1 (1) | `--destructive-fill` |
| `--danger-fill-hover` | `#a31818` / `#b3292d` | 1 (1) | `--destructive-fill-hover` |
| `--on-danger` | `#ffffff` both | 1 (1) | `--destructive-foreground` |

None equals stock's `bg-primary/80` hover or `destructive/10` tint, so landing 1 can't fold them. All 10 uses are in `ui.tsx`, `menu.tsx` and `date-panel.tsx`, which go stock in B, C, G and H; L deletes the names. Email reads none of them.

### 3.5 Radius, dark, print and the public site

- **Radius.** Landing 1 adds none. Landing A adds `--radius: 0.625rem` on `:root` and `--radius-sm` to `--radius-4xl` (×0.6 to ×2.6) in `@theme inline`. Every corner moves one step, HG's own included: `sm` 4 to 6px, `md` 6 to 8, `lg` 8 to 10, `xl` 12 to 14, across 186 uses in 89 non-test files at `ff7d92b`.
- **One dark block,** `:root[data-theme="dark"], [data-surface="public"]`, which the `dark` variant matches, so stock `dark:` classes apply in the dark theme and on every public page. No `.dark` block. `brand-tokens.test.ts` finds the block by its exact selector text.
- **Three places per token:** the light `:root`, the dark and public block, and the print block, which `print-tokens.test.ts` checks.
- **Pairs that split in dark stay apart** (`--destructive` and `--destructive-fill`, `--background` and `--popover`, `--toast-bg` and `--foreground`). **Pairs equal everywhere never merge** (`--border` and `--accent`, `--primary` and `--foreground`), because their jobs differ.
- **Stock `dark:` classes stay** and assume a translucent `--input`. With HG's opaque one (12.8), dark fields and outline buttons fill `#2c313d` (1.42:1 on the ground) while the field edge keeps 4.03:1.

## 4. Stock component map

Counts are call sites outside the component's own file, tests excluded, from a TypeScript AST scan at `ff7d92b`, except in 4.10 and 4.12, which count files. Each landing reruns the scan. Stock items are aria-vega's unless a row says otherwise.

### 4.1 Button and LinkButton (landing B)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `Button`, 109 sites in 46 files | `button`, `spinner` | `onClick` to `onPress` (102, none takes an argument); `disabled` to `isDisabled` (45); `pending` to `isPending` with a Spinner (15); `secondary` to `outline` (48); `danger` (3) and `destructive` (14) to `destructive`; the `icon` flag to an icon size (4); `tabIndex={-1}` to `excludeFromTabOrder` (1); `aria-keyshortcuts` (13) and `aria-busy` (2) removed. The 28 sites with no variant keep stock's default, HG's primary | Default buttons pad `px-2.5` (HG `px-3.5`) and hover at `primary/80`. Outline takes a `border` edge and `shadow-xs`. Both reds become one red tint, the solid confirm included. A press nudges 1px. Pending spins at once. Labels are 14px on touch, where HG's grew to 16 |
| `buttonClass()`, 28 calls in 24 files | `buttonVariants` | `primary` to `default` (6), `secondary` to `outline` (4), `ghost` stays (18); `md` to `default`; the 17 `icon` flags, all expressions, become a conditional icon size (`cond ? "icon-sm" : "sm"`). The 14 direct React Aria Buttons that wear it become stock `Button`, and a call on a link becomes `LinkButton` | As above |
| `LinkButton`, 13 sites in 12 files | `LinkButton`, a client composition (`src/components/link-button.tsx`, `"use client"`): `next/link` with `buttonVariants`, per shadcn's button page | 10 `variant="primary"` drop; 3 bare sites gain `variant="outline"` | Prefetch stays; stock's React Aria `LinkButton` has none and reloads pages without a root `RouterProvider` |
| `publicCtaClass`, `publicSecondaryClass`, `authButtonClass` (27 mentions in 10 files) | `size="lg"` on `Button` or `LinkButton` | Classes replaced | 40px, 48 on touch; the gold hover goes |
| Raw `<button>`, 38 in 30 `src/app` files | `button` | A variant and size each; a row or tile that isn't drawn as a button becomes a React Aria Button with layout classes only. Link-styled ones follow 4.12 | The stock look |

`src/lib/tasks/conflicts.test.ts:44` pins `variant="secondary"`. 14 files without `"use client"` import Button, 11 of them route files. 11 files without `"use client"` call `buttonClass()` or use a public CTA class: `src/components/public/ui.tsx`, the root `not-found.tsx`, `join/[token]/page.tsx`, `(marketing)/welcome/page.tsx`, `(portal)/p/jobs/[id]/page.tsx` and `loading.tsx`, `login/_components/auth-frame.tsx`, `login/reset/page.tsx`, and the financials overview, rent-roll and settings pages. Stock `button.tsx` starts with `"use client"`, so calling `buttonVariants` from those files throws at render ("Attempted to call buttonVariants() from the server"). They render `LinkButton` or a stock `Button` instead, and only client files call `buttonVariants`.

### 4.2 Other primitives (landing C)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `Badge`, 16 in 9 | `badge` | 10 bare sites gain `variant="secondary"` (stock's default is an ink pill); `danger` (3) to `destructive`; warn, ok and the onboarding expression (`contractors/status-badge.tsx:14`, which also imports `BadgeTone`) move to `StatusBadge`, and `BadgeTone` goes with them | A 20px pill in `text-xs font-medium` |
| `Kbd`, 13 in 9 | `kbd` | `tone="act"` (4) goes, with `kbdActClass` | A muted keycap, inside ink buttons too |
| `Card`, `CardHeader`, `CardBody` (6, 4, 4) | `card` | `CardBody` to `CardContent` | `rounded-xl`, a faint ring and `shadow-xs`, 24px padding |
| `Block` and the loading screens, 121 in 20 | `skeleton` | `text` (82) becomes a height class; 26 inside a `span` get a `div` parent | Blocks pulse, and stop under reduced motion |
| `Spinner`, 6 in 5 | `spinner` | `active` (3) becomes conditional rendering | No 200ms delay or 400ms hold |
| `Avatar`, 13 in 9 | `avatar` | Initials into `AvatarFallback`; sizes 20 and 24 to `sm`, 28 and 32 to default; the 10 contractor sites take `rounded-sm` on the root, its `after:` edge, image and fallback | People round; sizes 20 and 28 go |
| `EmptyState`, 16 in 11 | `empty` | Children into `EmptyHeader`, `EmptyTitle` or `EmptyDescription`, `EmptyContent`; `SpotArt` in `EmptyMedia` | Centered, `p-12` |
| `Notice` (4), `SandboxNotice` (3), `ArchivedNotice` (3) | `alert` | `icon` and `action` into children and `AlertAction`; ArchivedNotice's Restore is the action | The stock box, announced as `role="alert"` |
| `Meter`, the 6 labeled bars | `progress` | Label into the stock label part. The 2 chart bars keep `Meter` | A 6px round track with a `primary` fill (was `chart-1`) |

### 4.3 Toast (landing D)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `useToast` (41 in 38), `toast()` (84 calls in 37 files), `ToastProvider` (3 mounts), `useToastInset` (2) | `sonner` | A codemod to sonner's `toast(message, options)`: `key` to `id` (15), `detail` to `description` (3), `duration: TOAST_ACTION_MS` (8,000, from `src/lib/toast-time.ts`) on each `action` (21), `sticky` (1) to `duration: Infinity`; `onDismiss` and `icon` keep their names; the 4 spread calls by hand. `phoneMessage` (1) goes, and that toast keeps its shorter text. A `<Toaster>` replaces each provider, with `theme` read from HG's `data-theme`, dark inside the public wrapper. The inset becomes the Toaster's `offset` | A card on the popover color at bottom right, 356px, 13px text, 3 visible, 4 seconds (8 with an action). The detail gets its own line. Esc collapses the stack only when focus is inside it |

The `theme` prop matters because Sonner colors descriptions with fixed grays per theme (a wrong theme gives 1.61:1 on the dark popover). The stock file spreads props after `theme`, so the prop wins unedited. No ThemeProvider mounts, and `THEME_SCRIPT` keeps its jobs.

### 4.4 Fields (landing E)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `Input`, 45 in 21 | `input` | `size="sm"` (5) goes; `prefix` and `suffix` (1 each) become `InputGroup` | 36px everywhere, `shadow-xs`, a gray fill in dark |
| `Textarea`, 5 | `textarea` | None | Grows with content, 64px minimum |
| `FormField`, 57 in 19 | `field` parts | None. It keeps its props and wires `id`, `aria-describedby`, `aria-invalid` and `aria-required` between the control and the stock parts (shadcn's field docs never set `aria-describedby`) | Stock label and help type |
| `FieldRow` (2) | two `Field`s | Layout classes | None |
| `Checkbox` (2) | `checkbox` in shadcn's Choice Card pattern (`FieldLabel` wrapping a horizontal `Field`) | `isSelected` and a boolean `onChange`; `large` goes | A 16px box in a row that is the whole target |
| `Switch` (4) | `switch` in the same Choice Card pattern | `label` into the `FieldLabel`, so the whole row stays the target | The track is the control, inside a bordered row that tints when on |
| `NumberInput` (17 in 8), `SearchInput` (7 in 5) | composed on `InputGroup`; SearchInput on React Aria `SearchField` | None. HG's money parser (`425k`, `1.2m`) and the Esc modes stay | Stock field look |
| The checklist's add field (`tasks/[id]/checklist.tsx:209`), `comment-card.tsx:329` | `input`, `textarea` | Moved off hand-built markup | Stock edge and height |

Of the 18 raw fields in 9 `src/app` files at `ff7d92b`, the checklist's add field moves here; the other 17 are hidden, file and honeypot inputs and stay raw. Of the 15 in 8 `src/components` files, `ui.tsx`'s go with their components (the native `Select` in A), `comment-card.tsx`'s moves here, `composer.tsx`'s and `inline-field.tsx`'s move in K, and the hidden, file and keyboard-proxy inputs in `address-combobox`, `select`, `media-uploader` and `command-palette` stay raw.

### 4.5 Overlays (landing F)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `Sheet` (15 in 15; 18 files import `sheet.tsx`), `SheetView` (7), `useSheet` (2) | `dialog` from 768px, `sheet` bottom below, by `use-mobile`, through `ResponsiveDialog` | App call sites write `ResponsiveDialog` parts. `title`, `footer` (8), `size` and `fullHeight` move to parts and classes; `hideTitle` (2) to `sr-only`; `surface` (4) goes; `layout="palette"` moves to I. Views keep their job inside the composition. `sheet.tsx` keeps HG's code as `HgSheet` and `HgSheetView` for its 7 later importers (7.1) | Desktop: a centered card with an X, over `black/10` and a 4px blur, fading and zooming in. Phone: a stock bottom sheet with square corners and a height cap, no swipe. The iPad Mini gets the desktop dialog |
| `FormSheet` (11 in 8), `CreateForm` (4), `SheetRoute` (4 `@modal` pages) | compositions on `ResponsiveDialog`, `Field`, `Button` | Renamed `FormDialog` and `DialogRoute`. Their behavior stays (dirty check, `LeaveGuard`, ⌘↵, pending label, error line, Create more). `sheet-routes.test.ts:17` follows | As above |
| `ConfirmDialog`, 15 in 13 (`busy` 7) | `alert-dialog` parts at each site | `title`, `body`, `actions` and `cancelLabel` become parts. Busy sites use a plain `Button` confirm, `isDisabled` on Cancel, `isKeyboardDismissDisabled`, and a parent that ignores close while busy | `max-w-xs` below `sm`, full width at 320; a backdrop click no longer closes it |
| React Aria `Dialog`, unaliased in 5 files | | `Dialog as AriaDialog` where it meets stock's | None |

**`ResponsiveDialog`** exports `ResponsiveDialog`, `ResponsiveDialogContent`, `ResponsiveDialogHeader`, `ResponsiveDialogTitle`, `ResponsiveDialogDescription` and `ResponsiveDialogFooter`. Each renders the matching stock Dialog part from 768px and the Sheet part (`side="bottom"`, with a height cap class) below, chosen by `use-mobile`.

### 4.6 Menus, popover and tooltip (landing G)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `Menu` (17), `MenuTrigger` (18), `MenuItem` (53 in 19), `MenuSection` (1), `MenuHeader` (3), `MenuSeparator` (10) | `dropdown-menu` | Stock names. `icon` (30) into children; `shortcut` into `DropdownMenuShortcut`; `description` (1) as a second line; `current` and checked items use stock selection; `followUp` (1) becomes `DropdownMenuSub`; `numberKeys` (1) and `sheetTitle` (8) go; a width class where content needs it | Anchored on phones too. Bottom start, so 12 menus flip from bottom end. At least 128px or the trigger's width. A right-hand check. A 100ms fade and zoom |
| `StatusMenu` (4), `RecordMoreMenu` (3) | `dropdown-menu` | StatusMenu's items carry their `StatusMark`; RecordMoreMenu's are plain items | As above |
| `AccountMenu` (2) with `AppearanceRow` (1) | `dropdown-menu` | Its menu moves here; I puts it in the Sidebar footer | As above |
| `Popover` (3), `PopoverTrigger` (1), `PopoverSurface` (4 files) | `popover` | `capex-breakdown.tsx`, `menu.tsx` and `public/header.tsx` move to stock; HG's placement hook goes with them (held side, beside-when-short, height cap). `PopoverSurface` stays as `HgPopoverSurface` for `combobox`, `address-combobox` and `picker-layer` (H) and `filter-bar` (K) | 288px with 16px padding unless the site sets a width |
| `Tooltip`, 6 in 5 | `tooltip` | `label` into the stock content part. The 4 tap sites (the deal row's note, the CapEx rules info label, two financials settings badges) show their text in place or in a Popover on touch | Opens at once on hover and focus, never on touch; limestone in dark |

Two tests match `<MenuItem id="retry"`: `src/lib/composer-draft.test.ts:240` and `src/lib/deals/note-send.test.ts:18`.

### 4.7 Select, combobox and date (landing H)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `Select`, 10 in 6 | `select`, `native-select` on touch, through the touch `Select` | Inside `FormField`. `onChange` gets `Key \| null` (10 inline handlers). The 6 `searchLabel` sites move to Combobox where their lists are long | A 36px trigger, a popover at the trigger's width; phones get the native picker |
| `Combobox` (2), `AddressCombobox` (4 in 3), `TagsField` (2) | `combobox`, its chips | `allowCustom` to `allowsCustomValue`; chips with `showRemove={false}`, keeping `TagOverflow` and the checklist | Stock input, list and 22px chips |
| `DatePicker` (4), `DatePanel` (5), `DateField` (3) | `popover` with `calendar`; React Aria `DateField` inside stock `InputGroup` | Quick picks and Repeat become list rows under the calendar; the phone sheets go | The stock month grid with month and year pickers; 32px cells, 44 on touch |
| `PickerLayer` (11 in 9), `OptionList` (14 files) | `popover`, stock item parts | The sheet branch goes. OptionList keeps its engine (search from 10, pinned and alias rows, the Add row) | Anchored everywhere; 32px rows, 44 on touch |
| The EntityPicker family (`entity-picker.tsx`; `AssigneePicker` 4, `PropertyPicker` 2, `UnitPicker` 2, `PropertyUnitPicker` 1) | `popover` over `OptionList` with stock item parts, or `combobox` | The trigger becomes an outline `Button` (4.12); the sheet branch goes | As PickerLayer |
| `RepeatMenu` (2) | `popover` with `NumberInput` | Its phone sheet goes | Anchored |

**The touch `Select`** (`src/components/select.tsx`, rebuilt) keeps today's `items` and `sections` props. With a mouse it renders stock `SelectItem` and `SelectGroup`; on touch, `NativeSelect` with `NativeSelectOption` and `NativeSelectOptGroup`.

React Aria Buttons drop `aria-invalid` and `aria-required` today (`select.tsx:163`, `date-field.tsx:131`, `tags-field.tsx:246`). Stock Select, Combobox and DateField take `isInvalid` and `isRequired`, so this landing fixes it.

### 4.8 Nav, sidebar, tabs and command (landing I)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `SegmentedControl`, 15 in 12 | `toggle-group`, `outline`, `spacing={0}` | `options` into `ToggleGroupItem`s; every group gets `selectionMode="single"` and `disallowEmptySelection`; `value` into `selectedKeys`, and `onSelectionChange` reads the one key from the Set; `size` and `fullWidth` into classes | One bordered group; the pick takes a `muted` fill and a 1px ink ring inside its edge; `radiogroup` and `aria-checked` replace `aria-pressed` |
| `SideNav` in `AppShell` | `sidebar`, `collapsible="icon"` | The skip link and focus move stay. Pin, the hover float and HG's cookie go; stock keeps `sidebar_state` and toggles on ⌘B. `AccountMenu` sits in `SidebarFooter`, shadcn's nav-user pattern | 256px with a 48px rail; a left sheet below 768, so the iPad Mini gets the desktop sidebar; the active item in `font-medium` |
| `TopTabs`, 2 sites | stays an HG composition | A labeled `<nav>` of links whose `aria-[current=page]` draws a 2px `foreground` `after:` underline, matching stock's line variant, with layout and theme classes only. Its `text-sm` stays under `nav.tsx`'s existing eslint-disable until L | A 2px `foreground` underline, today's ink |
| `CommandPalette`, 928 lines | `command` | Data, rows and the ⌘K and `/` shortcuts stay. The file's `type Command` becomes `Command as CommandEntry` first | A centered dialog at every width, the list capped at 288px, menu semantics |

### 4.9 Table (landing J)

| HG piece | Stock item | Call-site edits | On screen |
|---|---|---|---|
| `Table` (15 in 14), `Th` (62), `Td` (85); raw `thead` (17), `tbody` (18), `tfoot` (5), `tr` (42 in 18 files) | base-vega `table` with the recorded edit | `TableHead` and `TableCell`; `numeric` (53) becomes `text-right tabular-nums`; raw sections become parts | Cells `p-2` and no-wrap, 40px heads, a `muted/50` footer |
| `TableFrame`, `thClass` | the recorded edit | In `ui/table.tsx`, the wrapper becomes `TableFrame` (it drops sideways scroll while the table fits, so the header can stick) and `TableHead` gains HG's sticky classes and rule. `add --diff` by URL (5.6) shows only this | Headers still stick under the app bar |
| `SortHeader` (10), `RowCell` (20), `flushTable` (5), `grandTotalRow` (6) | compositions | Layout and statement classes; the grand total's double rule stays | None |

aria-vega's table is React Aria's grid, which would change roles on the financial statements, so base-vega's plain table is used. 10 of its importers are server route files.

### 4.10 Compositions (landing K)

Counts are importing files at `ff7d92b`.

| Piece | Built from | Stays HG |
|---|---|---|
| `Section` (47), `PageHeader` (14) | Heading and actions over stock `Separator` | Layout only |
| `StatusMark`, `StatusBadge`, `DealStageMark` (17) | `StatusBadge` is the mark plus a word | The glyphs and status tones |
| `Money` (22), `Code` (7), `FactStrip` (7), `SourceLine` (4), `WarnMark` (2), `MoneyBars`, `MonthBars`, the 2 chart `Meter`s | App content; Code's copy button is a stock `Button` | Formatting, masking, the one-line source line, glyph plus word, charts, print |
| `Monogram` (5), `SpotArt` (4) | Brand content, unchanged; `SpotArt` sits in `EmptyMedia` | The glyphs and gold |
| `PhotoThumb` (11), `RetryPill`, `Lightbox`, `media-grid` | Photo pills become a stock `Badge` and `Button` | Photo stage, scrim, edge, zoom, swipe |
| Upload tiles (`media-grid`, `media-uploader` and `upload-queue` reach 23 files), `FilesList` (6), `FileLink` (10) | Stock `attachment` and `item`, `ProgressRing` in the media slot. A file row that links renders `Item` without `href` around a `next/link`, since stock `Item` with `href` is a React Aria Link (the `LinkButton` rule, 12.11) | The offline states in the description ("No signal · 2 files waiting", "Uploads paused · Reload") |
| `ActionBar` (6), `FilterBar` (9) | Stock Buttons; chips as outline `sm` Buttons, the panel a Popover over `OptionList` | Keyboard hide, safe area, ⌘↵; the URL engine and the one-line word collapse |
| Activity timeline, `CommentCard`, `InlineField`, rail, `Composer` | Stock `marker`, `message`, `Input`, `Textarea`, `InputGroup`; the rail as a `dl` | Optimistic saves, Undo, conflicts, drafts, the keyboard inset |
| `AddRow` (3), `addRowClass` and `rail-fold.tsx` (both new on main at `8aae1d7`), `BackLink` (13), `ErrorScreen` (2) | Ghost and link Buttons, `Empty` parts | AddRow's lazy-code warming |
| Public site: `PublicHeader`, `PublicFooter` (3 each), `Eyebrow` (3), `publicContainer` (9), `publicLinkHover` (4), `publicTextLinkClass` (1) | Header and footer from stock `Button`, `LinkButton`, `DropdownMenu` and `Popover` (the header's popover moves in G). Links take the stock link hover (12.27); `publicType` moves in L | `publicContainer` as layout; `Eyebrow` in `text-gold` |
| Behavior only: `LeaveGuard`, `LeaveLink`, `LinkPending`, `LoadLatest`, `RefreshOnReturn`, `UpdateNotice`, `ListMemoryProvider`, `ThemeToggle`, upload-queue's `DropLabel` | No change beyond their buttons and links: the link-styled ones move in B (4.12), the rest here | The behavior |
| Raw controls inside compositions that B to J didn't move | Stock `Button` or the family's part | Nothing |

**Who moves raw controls.** At `ff7d92b` there are 83 raw `<button>`s in 53 files (38 in 30 under `src/app`, 45 in 23 under `src/components`) and 52 direct React Aria Buttons in 34 files. B moves the 38 under `src/app`, the 14 React Aria Buttons on `buttonClass`, the link-styled buttons (4.12) and any raw button in a file B already edits. Each family moves the raw buttons, React Aria Buttons and fields inside its own component files (E the field compositions, H the picker internals, and so on). K takes what's left inside compositions, by area.

K deletes `ui.tsx`, `sheet.tsx` and `popover.tsx`. `src/components/followups-wiring.test.ts:50` matches `Reload</button>` and follows.

### 4.11 Deleted with no importers (landing A)

`SectionCard`, `CardTitle`, the dead `Field` (it collides with stock's), the native `Select`, `selectTouchHeight`, `pickerChip` and the `Spinner` re-export in `ui.tsx`; `SheetTrigger`; `popoverSurface`; `badgeToneClass`; and `repeat-picker.tsx`. `BadgeTone` has an importer and goes in C (4.2). A rechecks each.

### 4.12 Other `ui.tsx` helpers

Files are non-test files that use each at `ff7d92b`, `ui.tsx` excluded. K deletes `ui.tsx`, so each gets a home first.

| HG piece | Files | Stock home | Landing |
|---|---|---|---|
| `TextLink`, `textLinkClass` | 17, 18 | A link in a sentence takes shadcn's typography link classes, `font-medium text-primary underline underline-offset-4`, on `next/link` or `<a>` | C |
| The 9 raw `<button className={textLinkClass}>` (5 under `src/app`; `create-form`, `fact-strip`, `load-latest` and `money-bars` in `src/components`) and 2 hand-styled links that match it (`tasks/[id]/activity.tsx:288`, `filter-bar.tsx:198`), at `e233e43` | 11 | In a sentence, a React Aria Button with the typography link classes; standalone, stock `Button variant="link"` | B |
| The 14 hand-styled links that don't match, at `e233e43`: 5 under `src/app`, `RailVerb` (`rail.tsx:96`) and `inline-field.tsx:628`, `back-link.tsx`, `command-palette.tsx:488`, `comment-card.tsx:466`, `files-list.tsx:390`, `toast.tsx:130`, and 2 in `media-uploader.tsx` | 14 | The same two homes | B for `src/app`, D for the toast, I for the palette, K for the rest, which updates `followups-wiring.test.ts:50` |
| `SaveError` | 15 (`rail.tsx` re-exports it) | Stock `FieldError`, the stock error line (`role="alert"`, `text-sm text-destructive`), with any `action` inside it | E |
| `CheckboxMark` | 2 (`menu`, `option-list`) | The stock item's own check, as DropdownMenu and Select items draw it | G, H |
| `tagClass` | 5 | `Badge variant="outline"`; 22px becomes 20 | C |
| `kbdClass`, `kbdActClass` | 1 (`menu.tsx`), 0 | Go with `Kbd`; `menu.tsx`'s keycap renders `Kbd` | C |
| `chromeIconClass` | 13 | Stock icon sizing: inside a stock part the class goes (stock sizes icons at `size-4`), elsewhere `size-4`. Its touch growth and 1.5 stroke go | B in buttons, K elsewhere |
| `fieldClass`, `fieldSizeClass` | 8, 6 | Classes from stock `Input`, `InputGroup` or `SelectTrigger` | Each file's landing: E (`search-field`), H (`select`, `combobox`, `address-combobox`, `date-field`, `tags-field`), I (`command-palette`), K (`inline-field`) |
| `pickerField`, `pickerFieldChevron` | 4, 3 (one fewer each once A drops `repeat-picker.tsx`) | An outline `Button` with a trailing chevron, the trigger shadcn's date picker draws | H |
| `pickerChipClass` | 4 (3 after A) | `Button variant="outline" size="sm"`; the 28px row chip becomes 32 | H |
| `pendingRowFill` | 7 | Stays as a state class beside `RowCell`, on `bg-muted` | K |
| `TOUCH_HEIGHT` | 2 (`nav.tsx`, `editor-controls.tsx`) | The global rule covers stock parts; the two files write `pointer-coarse:min-h-11` | I, K |

## 5. Setup (landing A, except where noted)

### 5.1 Packages

| Package | Version | Kind | Landing | Why |
|---|---|---|---|---|
| tw-animate-css | 1.4.0 | dev | A | Stock enter and exit motion; CSS only, MIT |
| shadcn | 4.23.0 | dev | A | `shadcn/tailwind.css`: the `data-*` variants, `no-scrollbar`, `scroll-fade`, `shimmer`. With tw-animate-css, `package-lock.json` grows from 756 entries at `ff7d92b` to 925 (rollout map), all dev-only |
| cn | 0.5.2 | runtime | A | Stock files import it; needs Node 22 or later |
| react-aria | 3.52.1 | runtime | A | `UNSAFE_PortalProvider`; the version react-aria-components 1.21.1 pins |
| sonner, next-themes | 2.0.8, 0.4.6 | runtime | D | The stock toast; its file imports `useTheme` |
| Node | `"engines": { "node": "24.x" }` | | A | CI runs 24 (`ci.yml:22`); Node 20 ended Apr 30, 2026. Local Node moves from 20.20.1 to 24, and README's "Node 20+" becomes "Node 24" |

Not added: `@base-ui/react`, recharts, embla, shiki. Removed in A: clsx and tailwind-merge.

### 5.2 components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "aria-vega",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/app/globals.css", "baseColor": "neutral", "cssVariables": true },
  "iconLibrary": "lucide",
  "rtl": false,
  "menuColor": "default",
  "menuAccent": "subtle",
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/components/ui"
  }
}
```

- **`aliases.ui`** is shadcn's default, so no stock file meets an HG name (9 would collide in `src/components`). `@/components/ui` still resolves to `ui.tsx` and `@/components/ui/button` to the folder, in TypeScript and in a Next 16.3.3 Turbopack build (checked in a scratch app).
- **`aliases.hooks`** is the same folder, so `use-mobile` sits under the one override.
- **`iconLibrary`** must be set, or `IconPlaceholder` imports break the build. **`menuColor`** stays `default`. **No `registries`:** Intent UI is never pulled. **No `--font-heading`,** so stock titles take Geist.

### 5.3 globals.css

Written by hand on HG's selectors, with a throwaway `init` (aria base, Vega, neutral, Geist) in a scratch worktree as the reference.

| Rule | Why |
|---|---|
| `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` | The style item asks for them |
| Base layer `* { @apply border-border outline-ring/50 }` | Stock's bare `border-b` relies on it. 7 HG strings with a width and no color get checked. HG's `body` rule already matches stock's |
| `--radius: 0.625rem` and the `--radius-*` scale | 12.6 |
| `--default-transition-duration` and its timing function come out of `@theme` | Stock transitions run at Tailwind's 150ms, not HG's 120ms ease-out (12.26) |
| Unlayered under `pointer: coarse`: `min-height: 44px` on `[data-variant][data-size]:is(button, a)`, the attributes stock Button always writes, so every Button-based part is covered whatever its slot (`AlertDialogAction`, `DialogClose`, `SidebarTrigger` and the combobox buttons rename theirs); `min-width: 44px` on `[data-size^="icon"]:is(button, a)`; the same height on the slots `input`, `textarea`, `input-group`, `native-select`, `select-trigger`, `toggle`, `toggle-group-item`, `tabs-trigger`, `dropdown-menu-item`, `dropdown-menu-sub-trigger`, `select-item`, `combobox-item`, `command-item`, `sidebar-menu-button`, and a choice-card label (`[data-slot="field-label"]:has(> [data-slot="field"])`); `--cell-size: 2.75rem` on `[data-slot="calendar"]`, which beats the root's utility and sizes its cells and nav buttons with no stock edit; 48px on `[data-surface="public"] [data-size="lg"]:is(button, a)`. `input-group-control` takes no height, since its group carries it. Each landing checks its family's slot names | Stock tops out at 40px. Apple's default is 44pt; WCAG 2.5.5 asks 44px |
| Elements with no `data-slot` keep `pointer-coarse:min-h-11`: OptionList rows that don't render a stock item part, AddRow, rail rows and TopTabs links. L removes only the `pointer-coarse:` classes on elements the rule above covers | The rule can't see them |
| The 16px field guard stays (`input, select, textarea` under `pointer: coarse`) | Stock fields drop to 14px from 768px, which zooms on iOS and fails the iPad Mini check |
| Under reduced motion: tw-animate's `--tw-enter-*` and `--tw-exit-*` scale, translate, rotate and blur get neutral values with `!important`, and `.animate-pulse` stops | tw-animate-css has no reduced-motion rule. The block's 0.01ms transitions already stop the Sheet, sidebar and Sonner |
| At every pointer, `outline: 1px solid var(--foreground); outline-offset: -2px` on `[data-slot="toggle-group-item"][data-selected]` and `[data-slot="toggle"][data-selected]` | Stock's `muted` pick is 1.14:1 in light, a fill alone (WCAG 1.4.1). Every outline item already has a 1px `--input` edge, so the pick needs a cue the others lack: an ink line just inside its edge, wider and darker than theirs. An outline leaves the box-shadow focus ring alone |
| HG's `:focus-visible` outline (`globals.css:405`) becomes `:focus-visible:not([data-slot], [data-slot="calendar"] *)` | Stock parts and calendar cells draw only their own ring; HG elements keep the 2px outline |

### 5.4 cn and lint

- **Stock files** keep `import { cn } from "cn"`. Its default merge drops a color beside an HG type role (`twMerge("text-sm text-muted-foreground", "text-meta")` gives `text-sm text-meta`) and keeps `shadow-float` beside `shadow-xs`, so until L no HG type, shadow or motion class goes into a stock part.
- **HG's `cn`** becomes `createCn` from `cn/config` with today's `extend` block. The helpers beside it stay (140 files import `utils.ts`). In L it becomes `export { cn } from "cn"`.
- **Lint bans `"cn"` imports in app code.** The package is installed for stock files, so a stray app import builds and runs, quietly skipping HG's merge config. Only lint can catch it.
- **A splits `hg/design-tokens`.** Today it is one rule with `schema: []`, so an override can only turn all of it on or off. A makes three: `hg/design-tokens` (hex, raw palette, old names; on everywhere), `hg/raw-type` (text sizes, arbitrary sizes, a ground color as text) and `hg/raw-effects` (white, black, the shadow scale, backdrop blur).
- **The `cn` ban goes in three places.** `@typescript-eslint/no-restricted-imports` is configured in the main block, for `src/lib/sentry-browser.ts` and for `src/lib/report-server.ts`, and a later flat-config block replaces the rule's options. So paths `["cn"]` and patterns `["cn/*"]` join all three. The `src/components/ui/**` override and a new `src/lib/utils.ts` override each restate the HEIC and Sentry entries and leave out `cn`, since `utils.ts` imports `cn/config` in A and re-exports `cn` in L.

| Lint rule | `src/components/ui/**` | `src/lib/utils.ts` | App code |
|---|---|---|---|
| `hg/design-tokens`: hex, raw palette, old color names; the copy rules | On | On | On |
| `hg/raw-type`: Tailwind text sizes | Off | On | On until L, then the pattern goes |
| `hg/raw-type`: arbitrary text sizes; a ground color as text (`text-muted`, `text-accent`, `text-background`) | Off | On | On |
| `hg/raw-effects`: white and black after a color utility, Tailwind's shadow scale, backdrop blur | Off | On | On, new in A |
| `react-hooks/set-state-in-effect` | Off (`use-mobile`) | On | On |
| Imports from `"cn"` and `"cn/*"` | Allowed | Allowed | Banned |

After landing 1, linting the 39 stock files the research checked gives about 80 errors (77 text sizes, 1 arbitrary size, 1 hook rule, and the `text-background` hits in tooltip and kbd), all cleared by the override. The new bans use the first draft's patterns: `(?<![\w-])(${UTIL})-(white|black)(?![\w-])` with an opacity allowed, `shadow-2xs` to `shadow-2xl` and `shadow-inner`, and `backdrop-blur` at any step. The bare word stays allowed, as in `ctx.fillStyle = "white"` (`src/lib/attachments/prepare.ts:167`).

### 5.5 Public overlays

Stock overlays portal to `body`, outside the public wrapper, so on `/rentals`, the move-in form and login they would draw light. Landing A adds `PublicSurface` (`src/components/public/surface.tsx`), a client component that renders the `data-surface="public"` div with a ref and wraps its children in `UNSAFE_PortalProvider` with `getContainer={() => ref.current}`. A server component can't create that function, so the 3 public grounds (`(marketing)/layout.tsx`, `login/_components/auth-frame.tsx`, the root `not-found.tsx`) render `PublicSurface` in place of their div. Stock Popover, Modal and Tooltip render through React Aria's `Overlay` and `OverlayContainer`, which read the provider, and so do HG's React Aria overlays until they go stock. Sonner renders in place, so a Toaster inside the wrapper is covered. HG's `surface="public"` prop (7 sites, threaded through 10 components) goes family by family.

### 5.6 Adding a component

```sh
npx shadcn@4.23.0 add <name> --dry-run   # files and packages it would write
npx shadcn@4.23.0 add <name> --view      # the code
npx shadcn@4.23.0 add <name>             # writes into src/components/ui/
npx shadcn@4.23.0 add <name> --diff      # later: drift from the live registry
```

- **`components.json` first.** Without it, `add`, `--dry-run` included, runs `init` with force.
- **Never on the branch:** `init` in any form, `apply`, `add --all`, `migrate` or `eject`. `init` replaces `utils.ts`, overwrites `:root` with neutral oklch, adds a `.dark` block HG never matches, rewrites `--font-sans`, and always overwrites files.
- **After every `add`:** no diff in `utils.ts` or `layout.tsx`, none in `globals.css` beyond the planned lines, and no version bump in the dry run.
- **The table goes by URL, always:** `npx shadcn@4.23.0 add https://ui.shadcn.com/r/styles/base-vega/table.json`, with `--diff` or `--overwrite` the same way. `add table` by name resolves aria-vega's grid, so its diff shows the whole file and an overwrite would swap in the grid 12.19 rejected.
- **Snapshot.** When an item is pulled, its registry JSON is saved as `scripts/shadcn-snapshot/<item>.json` and each written file's hash in `scripts/shadcn-snapshot/files.json`. Each landing compares every stock file with its recorded hash, which proves no local edit (`table.tsx` against its recorded edit). The registry is served live and unversioned, so a non-empty `add --diff` is read as an upstream change and goes to Connor as an update, not as a failure.
- **Updates** run `add --overwrite` inside `src/components/ui/` only, then refresh the snapshot; `table.tsx`'s edit is reapplied after.
- **Dependencies land in the same folder:** `select` brings `input-group`, which brings `button`, `input` and `textarea`; `command` brings `dialog`; `calendar` brings `select`; `field` brings `label` and `separator`; `sidebar` brings `sheet`, `skeleton`, `tooltip` and `use-mobile`. So B comes before fields, overlays and pickers.
- **A stock file never takes HG classes,** except `table.tsx`'s recorded edit (12.19). Any other misfit goes to Connor.
- **No item?** There's none for a number, search or date field, a date-picker root, tag group, meter, file trigger, drop zone or navigation menu. Compose from React Aria and stock parts. Intent UI's matching item is an anatomy reference only: its look differs, and it wants react-aria-components 1.22. Mobbin still decides screens, flows, page layouts, empty states and payoff moments at every size.

## 6. Rules

### 6.1 Landing 1's rule and doc edits

- **CLAUDE.md, "One switch per job"** (`:53`): "the selected segment's surface fill and control edge" becomes "the selected segment's `--background` fill and `--input` edge", since the script doesn't match bare words. Landing I rewrites the bullet.
- **CLAUDE.md, Personality** (`:38`): "…and the retired alias names under `src/`" becomes "…and the old HG color names under `src/`, naming the new one".
- **CLAUDE.md, Enforce it in code** (`:78`): "CSS isn't linted, so check it by hand." becomes "CSS isn't linted. `src/lib/token-names.test.ts` catches old color names in CSS, tests and the docs; check the rest of CSS by hand."
- **Brand doc section 4:** the intro says tokens use shadcn's names where shadcn has the role and HG names where it doesn't. It takes section 11's email rule (email reads the hex mirror, which a test keeps equal to `globals.css`) and the rule that a re-brand is a token swap (`eslint.config.mjs:58`); the three comments that cite "section 11" (`brand-tokens.ts:3`, `email/render.ts:12`, `eslint.config.mjs:59`) point at section 4. Its tables go through the script, "Act (ink)" becomes "Primary (ink)", the ring gets its own row, and the bare-word grounds (lines 101 to 195) are edited by hand.
- **Brand doc sections 11 and 12** are replaced, before the script runs, by a short "11. History": the Oct 25 rollout landed in `4f45a1b`, and the Nov 14 rename is this spec. The old alias row maps these names to other tokens, so it can't stay. The script then changes 155 `--name` mentions in the file, plus 13 for the derived family.
- **docs/components.md** goes through the script: 116 `--name` mentions and 1 class mention.

### 6.2 hg/design-tokens in landing 1

- **Delete the "Retired alias" pattern.** It rejects `text-foreground`, `bg-background`, `border-border` and, through its `\b`, `text-muted-foreground`, so every renamed file would fail.
- **Add the old-name ban,** from one data module with no side effects that `eslint.config.mjs`, `token-names.test.ts`, `rename-tokens.mjs` and the proof import:

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

- **Messages name the new class:** `"text-fg-3" is the old name. Use "text-muted-foreground".` For `act`: `Use "ring-primary", or "ring-ring" for a focus ring.` Loop with `matchAll`, so a `g` regex keeps no state between strings. The lookahead keeps `border-line` from flagging `border-line-strong`.
- **A narrow ban on old meanings:** `text-muted`, `text-accent` and `text-background` alone draw a ground color as text, which nearly disappears. Until Oct 25 `text-muted` meant `fg-3`. Landing A moves this ban into `hg/raw-type`, scoped to app code, since the stock tooltip uses `text-background`.
- **Every palette** in Tailwind 4.3.3's `theme.css`, in one pattern: `amber`, `blue`, `cyan`, `emerald`, `fuchsia`, `gray`, `green`, `indigo`, `lime`, `mauve`, `mist`, `neutral`, `olive`, `orange`, `pink`, `purple`, `red`, `rose`, `sky`, `slate`, `stone`, `taupe`, `teal`, `violet`, `yellow`, `zinc`.
- **Not in landing 1:** the white, black, shadow and blur bans, which arrive in A for app code only (12.1).
- **Updated messages:** the hex example becomes `text-fg-2, bg-canvas, border-border`; the palette message becomes "foreground, muted-foreground, fg-2, muted, accent, border for neutrals; destructive, warn, ok for status". The ban stays for good, since specs, memory and habits carry the old names.

### 6.3 Rule changes by landing

| Rule today | Becomes | Landing |
|---|---|---|
| CLAUDE.md, Ask before visual changes | Adds: a stock component as `shadcn add` writes it needs no separate design ask, since its landing's review covers it; changing its classes does | A |
| CLAUDE.md, Design references: shadcn is "a reference for anatomy and props only"; "Adapt, don't copy" | Components are stock aria-vega; the brand doc sets the theme; a stock file changes only through the global rules. "Adapt, don't copy" goes | A |
| CLAUDE.md, "Check Mobbin…", "Cite what you used" | Controls come from the registry; Mobbin decides screens and flows. Citations name each item pulled | A |
| CLAUDE.md, Reuse first | Pull from the registry, never `init`; compose, don't restyle; stock files in `src/components/ui/`, compositions in `src/components/` | A |
| CLAUDE.md, "Motion is feedback. A short spring…" | Respect reduced motion: stock animates, and one block cuts it to a fade | A |
| CLAUDE.md lint wording, README.md Stack and "Before you build" | The scoped bans; stock shadcn/ui, pull before you build; README's "Node 20+" becomes "Node 24" | A |
| CLAUDE.md, Device check | Adds: it runs in light and dark | A |
| Brand doc: the radius table and "never redefine `--radius-*`", the base layer, the 2px focus rule | Stock's radius scale, base layer and focus ring | A |
| docs/components.md | Gains "Adding a component" (5.6). Each landing turns its rows to the stock item, with a "Formerly" column | A to K |
| Brand doc rows for a family | Deleted in that family's landing | A to L |
| CLAUDE.md, "tablet 768x1024 (gets the touch layout)" | Stock draws its desktop layout from 768; touch adds 44px targets and 16px fields | F |
| CLAUDE.md, "Keep spacing tight. Menus and popovers size to their content" | Goes | G |
| CLAUDE.md, "Touch has no hover…" | A tooltip never holds the only copy; tap-to-edit; no hover-only reveals | G |
| CLAUDE.md, "One switch per job" | `TopTabs` for routes; `ToggleGroup` for views and filters, the pick marked by an inset ink ring as well as its fill | I |
| CLAUDE.md, "State toggles use one weight… `aria-pressed`" and "never for state" | State lives in the markup: `aria-current="page"` on route nav, React Aria's selected state on stock toggles. The weight clauses go | I |
| CLAUDE.md, "Sticky headers clip at a divider" | Goes; the table's recorded edit carries it | J |
| CLAUDE.md, Typography | Geist is the font; page text uses Tailwind's sizes, figures `tabular-nums`. The text-size ban leaves the lint wording | L |
| Brand doc: the type scale, elevation and motion tables | Go; page text uses Tailwind's sizes, and stock sets shadows and motion | L |
| CLAUDE.md, "One Esc closes one layer" | Goes; React Aria does it | M |
| CLAUDE.md, "Things that should line up" and "A mark's position carries meaning" | Fold into the brand doc's page layout | M |
| All of the above, the brand doc, README.md and the living specs (205 old component names in 14 docs at `200093a`) | Consolidated | M |

### 6.4 What the rules keep after M

- **CLAUDE.md's accessibility floor:** 44px touch targets, 16px fields on iOS, reduced motion, no information only in a tooltip, a picked toggle's ink ring (a mark beyond its fill, above 3:1), `aria-current` on route nav. A link inside a sentence stays underlined, in shadcn's typography link classes, because HG's link ink equals body ink (WCAG 1.4.1); public nav and footer links take the stock hover.
- **CLAUDE.md's content rules:** [copy-rules.md](../copy-rules.md), real data in visuals, payoff moments, closing the loop, fixed status colors, rows of controls that never wrap.
- **The brand doc:** the color tables with light, dark, print and contrast values; status as glyph plus word; gold's uses; photo tokens and the chart rule; Geist, figures, money and codes; the monogram and wordmarks; photography and payoff art; voice; and page layout (gutters 32, 24 and 16; records capped at 1200 with a 320 rail; the task-row layout; two-line phone rows; things that line up; a mark's position). It runs about 8,000 words today and should land under 4,400.

## 7. Rollout

### 7.1 Every landing

1. Land only when no other session is mid-landing (section 7.5, rechecked first).
2. Cut the branch from a freshly fetched `origin/main`, not the primary checkout's `main` (stuck at `f9ab3fb`, 263 behind). Recheck the counts and run the landing's codemod there.
3. Run `npm run test:devices` in the landing worktree, since the commit gate blocks `git commit` while UI files are newer than the last run. Commit, merge `origin/main` in, check main's new commits for overlap, keep both sides' unrelated pieces, and say what overlapped.
4. On the merged code: `npm run typecheck`, `npm run lint`, `npm test`, and `node scripts/rename-tokens.mjs --check`. Landing 1 runs its proof (7.2). From A on, the device check also runs in dark, and every stock file matches its snapshot hash (5.6), `table.tsx` its recorded edit.
5. Open every dialog, menu and state the landing touched at 375 and 320, public pages included. Update the tests that read source text (50 of 208 test files use `readFileSync`).
6. Delete the old HG export in the same landing, so a late branch fails typecheck instead of drawing the old look. An export that a later landing's files still import stays, renamed with an `Hg` prefix, until its last importer's landing: F keeps `HgSheet` and `HgSheetView` in `sheet.tsx` for `menu` (G), `picker-layer`, `date-panel` and `entity-picker` (H), `command-palette` (I), and `repeat-menu` and `filter-bar` (K); G keeps `HgPopoverSurface` in `popover.tsx` for `combobox`, `address-combobox` and `picker-layer` (H) and `filter-bar` (K). K deletes both files with `ui.tsx`.
7. From A on, Connor reviews it (7.4).
8. Say which files are about to land, then `git push origin HEAD:main`, which deploys in about two minutes.

The gate doesn't match `utils.ts`, `brand-tokens.ts`, `eslint.config.mjs` or `components.json`, so the device check runs for every landing.

**The base worktree.** The proof and every review build `origin/main` at the merge in a separate worktree (`git worktree add <scratch> <base>`), never a stash. It gets `npm ci`, copies of the landing's `.env*` files, and the Playwright browsers if missing. Both sides must resolve the same `DATABASE_URL`, or the run stops. Its device runs use `DEVICES_PORT=3101` and run one at a time, since each run's setup replaces the portal fixtures' sessions. The worktree is removed after.

### 7.2 Landing 1: colors

**Scope.** The tokens in sections 3.1 and 3.4 take shadcn's names; the pointers arrive; lint flips (6.2); docs follow (6.1).

**Files.**

- 159 code files: 1,012 class uses, plus 10 in 3 files for the derived family.
- `src/app/globals.css`: the light, dark and public, print and pointer blocks, `@theme inline`, `:focus-visible` (to `--ring`, by hand after the script), `accent-color` (to `--primary`), `body`, `::selection` and `--chart-ref`.
- `src/lib/brand-tokens.ts`: `surface`, `raised`, `fill1`, `fill2`, `line`, `lineControl`, `fg3`, `fg1`, `act`, `onAct` and `danger` become `background`, `popover`, `muted`, `accent`, `border`, `input`, `mutedForeground`, `foreground`, `primary`, `primaryForeground` and `destructive`; `brandTokensDark.line` becomes `border`; the derived keys follow. `canvas`, `fg2`, `gold`, `goldDeep` and `inkTile` stay. The keys move by Rename Symbol, never regex, since `render.ts` has its own `line` field beside `t.line`; that carries the 29 key uses in `src/lib/email/render.ts` and `monogram-art.ts:65`. Comments and strings are edited by hand.
- 3 tests: `brand-tokens.test.ts`, `print-tokens.test.ts` (its 12 required names) and `utils.test.ts` (4 class strings).
- 8 more files change only in comments; in all, the script touches 173 files under `src`. Also `eslint.config.mjs` and CLAUDE.md's three lines.
- New: `scripts/token-renames.mjs`, `scripts/rename-tokens.mjs`, `scripts/zero-pixel-proof.mjs`, `src/lib/token-names.test.ts`.
- Docs: with the brand doc's sections 11 and 12 replaced first, the script changes 659 `--name` and 13 class mentions in 13 files (brand-guidelines 155, components 116, uploads-photos 82, selectors 63, forms-editing 60, charts 59, activity-comments 55, search 43, build-plan 15, performance 8, and 1 each in tenant-contact, contractor-trades and view-as), plus 15 for the derived family. `docs/uiux-review/` stays as a dated audit, with a header line saying its names predate Nov 14.

**The rename script.** One pass per file with a lookup callback, so no name is renamed twice.

- **Classes and variables:** `OLD_CLASS` and `OLD_VAR`, replaced from `RENAMED`. The lookbehind allows variant chains; the lookahead keeps `/70` opacity and stops `line` matching `line-strong`.
- **The `act` rule:** `outline-act`, and `ring-act` or `border-act` with a focus variant in its chain, become `ring` (24 in 15 files); the rest become `primary` (30 in 15).
- **Scope:** `src/**/*.{ts,tsx,css}` with tests, `docs/**/*.md` and CLAUDE.md, except `docs/uiux-review/` and this spec. `token-names.test.ts` also scans `tests/`, skipping `tests/devices/gallery-reporter.ts`.
- **What it never touches,** from a dry run at `9a822de` with no false hits: `data-surface="public"`, `line-clamp`, `underline`, `line-through`, `select-none`, `variant="danger"`, `tone="danger"`, `@/lib/toast-line`, `@/components/source-line`, `whitespace-pre-line`, `eslint-disable-next-line`, `<canvas>` and the `input, select, textarea` selector.
- **`--check`** prints every old name it would change and exits non-zero.

**The zero-pixel proof.** The device check alone can't show it: it wipes its last run and shoots default states only, light only on app pages, as JPEG.

1. **CSS by resolved value.** Build both sides and parse the CSS. Resolve per element (light `:root`, `:root[data-theme="dark"]`, a public element under a light root, each under `@media print`), inheriting computed custom properties. Map the base's class selectors through the script's class function, escaped forms included, then compare a multiset of (at-rule context, single selector, resolved declarations). The pointers are expected additions; any other difference stops the landing. Rules whose candidate appears in no non-test `src` file are filtered out, since Tailwind scans every file git doesn't ignore.
2. **Order.** Tailwind 4.3.3 breaks a same-property tie by candidate name, so a rename can flip which of two color classes wins. The proof fails only when a literal or template outside `cn()` carries both. At `200093a` there are 11 such pairs, all inside `cn()` ternaries.
3. **Screenshots.** Run the base twice (to list the shots that differ on their own) and the landing once. Pair the shots by name (186 at `200093a`; contractor onboarding has since added 2 routes), compare checksums, then decode the rest with sharp and count differing pixels. The shots stay on this machine.
4. **Email.** Render `renderPlainEmail` and `renderJobEmail` with fixtures that use every renamed key, in both worktrees, and compare the HTML byte for byte.

Any difference that isn't noise stops the landing and goes to Connor. Landing 1 lands after design-calls-nov14 (7.5).

### 7.3 Landings A to M

Counts at `ff7d92b`. Effort is agent build time, calibrated on the Oct 23 to 25 brand rollout, and rough.

| Landing | Scope | Needs | Review set beyond the sweep | Checks beyond 7.1 | Effort |
|---|---|---|---|---|---|
| A. Stock base | Section 5, `PublicSurface` on the 3 public grounds, Node 24 locally, the dead exports (4.11), a dark device run (Playwright `colorScheme: "dark"`), A's rule lines (6.3). About 10 files plus the grounds | 1 | Only corners should move (186 uses in 89 files); the 7 bare-border strings; HG's `data-disabled:` uses; the public overlays inside the portal | After each `add`, no diff in `utils.ts`, `layout.tsx` or unplanned `globals.css` lines; lint finds no `"cn"` import in app code; `utils.test.ts` passes unchanged on `createCn` | 2 to 4 hours |
| B. Button | 4.1 and 4.12's B rows: 67 files plus `ui.tsx`, and the 38 raw `<button>`s in 30 `src/app` files | A | Every button kind on every route, public included; pending; focus; each Button inside a parent that handles clicks | The codemod re-run on the merged tree is a no-op; no `disabled=` or `aria-keyshortcuts` left on a stock Button; no file without `"use client"` imports `buttonVariants`; `conflicts.test.ts:44` updated | 4 to 6 hours |
| C. Primitives | 4.2 and 4.12's C rows; can split in two | B | Loading screens, badges, avatars, cards, empty states, notices, progress, links in sentences | No div-in-span warnings at the 26 Skeleton sites; `StatusBadge` has the moved statuses | 4 to 6 hours |
| D. Toast | 4.3: 44 files, 3 mounts | A | Plain, Undo, detail, sticky and key-replaced toasts in the shell, portal and moving-in page; the longest toasts | No `useToast` import left; the codemod's own recount of calls and options (section 10) | 3 to 5 hours |
| E. Fields | 4.4 and 4.12's E rows | B | Every form at 375 with the keyboard up; errors and help lines; dark fields; the choice-card rows | `ios-input-zoom` stays 0 on the iPhones and the iPad Mini; every `FormField` control has `aria-describedby` | 5 to 8 hours |
| F. Overlays | 4.5: 18 files on `sheet.tsx`, 13 on `ConfirmDialog`, 8 on `FormSheet`; `HgSheet` stays for 7 importers (7.1) | B, E | Every dialog open, busy confirms, dirty close, Esc; the 4 create routes on a phone; the moving-in sheets | `sheet-routes.test.ts:17` passes; the first paint of the 4 create routes on an iPhone | 1 to 1.5 days |
| G. Menus, popover, tooltip | 4.6 and 4.12's G rows; `HgPopoverSurface` stays for H and K (7.1) | B | Every menu and popover with widths; tooltips by mouse, keyboard and touch; the date chip opened near the screen edge at 375 and 320 | `composer-draft.test.ts:240` and `note-send.test.ts:18` updated | 4 to 6 hours |
| H. Select, combobox, date | 4.7 and 4.12's H rows | B, E, F, G | Each picker; typing on an iPhone; the calendar and quick picks; the public pickers; the date chip near the screen edge | Select, Combobox and DateField render `aria-invalid` and `aria-required` | 1.5 to 2 days |
| I. Nav, sidebar, command | 4.8 | All above | The shell at three sizes, the command dialog, every segmented control | The skip link and focus move still work; ⌘B and ⌘K don't collide | About 1 day |
| J. Table | 4.9: 16 files | A | Every statement and list; sticky headers; wide tables at 375 | `table.tsx` matches its recorded edit; `add --diff` by URL shows only it | 4 to 6 hours |
| K. Compositions | 4.10 and 4.12's K rows, split by area | B to J | Each area's pages and opened states; photo pills on light and dark photos | `ui.tsx`, `sheet.tsx` and `popover.tsx` are gone; `followups-wiring.test.ts:50` updated | 1.5 to 2 days |
| L. Tokens and type | The table below. The touch type swap, the role hooks in `globals.css`, HG's merge config and the text-size ban go. `pointer-coarse:` classes on elements the global rule covers come out (of 348 in 107 files). Retired tokens leave CSS and `brand-tokens.ts`, and the print test's required list and floor of 20 change. The `--animate-*` lines leave the reduced-motion block, since the `--tw-enter` and `--tw-exit` reset covers them. Retired token, role and motion names join the old-name ban, so a late branch fails lint | K | Every route for type; the 314 meta sites at 375 and 320 for wraps; the job-done payoff's entrance | The brand-tokens and print-tokens tests pass with the new list and floor; no role, motion or retired token class left | 4 to 8 hours, scripted |
| M. Rules | CLAUDE.md, the brand doc, docs/components.md, README.md, the living specs | L | Connor reads the docs | `token-names.test.ts` passes over the docs; the copy-rules.md checklist is run | 3 to 4 hours |

**Landing L's mappings.** Content motion moves before the motion tokens go, since Tailwind drops an unknown class silently and lint runs after the deploy. The job-done payoff keeps an entrance, which the reduced-motion reset cuts to a fade.

| HG name | Becomes | Uses at `ff7d92b` |
|---|---|---|
| The app's type roles | 12.25; figure-l, code and code-l take `text-3xl font-medium`, `text-sm font-mono` and `text-3xl font-mono font-medium` | 601 in 139 files |
| `publicType.display` | `text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-balance` | 1 |
| `publicType.heading` | `text-2xl sm:text-3xl font-semibold tracking-tight text-balance` | 8 |
| `publicType.lead` | `text-base sm:text-lg text-pretty` | 3 |
| `publicType.eyebrow` | `text-xs font-medium uppercase tracking-widest text-gold` | 1 |
| `publicType.wordmark` | `text-xs font-medium uppercase tracking-[0.28em] whitespace-nowrap`; the tracking is logo lettering, kept as brand | 1 |
| `publicType.title`, `publicType.meta` | `text-base font-medium`, `text-sm` | 4, 12 |
| `animate-pop-in` | `animate-in fade-in-0 zoom-in-95` | 6; 3 left after F and G (`job-actions.tsx` twice, on the job-done photo and SpotArt, and `upload-queue`) |
| `animate-fade-in`, `animate-fade-out` | `animate-in fade-in-0`, `animate-out fade-out-0` | 9, 3 |
| `ease-spring` | `ease-out` | 9 in 6 files |
| `duration-fast` (120ms), `duration-base` (160ms) | `duration-150` | 9, 3 |
| `duration-check` (180ms), `duration-photo` (200ms) | `duration-200` | 6, 2 |
| `duration-sheet` (260ms) | `duration-300`, unless the sidebar takes it in I | 2 |
| `--select` and `::selection` | Go; the browser's selection color applies | 0 classes |

That's about 10 to 13 working days. B and F touch the busiest files (16 of 34 recent non-merge commits touched a Button-family file), so each is cut, built and landed in one sitting.

### 7.4 Connor's review (landings A to M)

- **Runs.** The base and landing worktrees each run the device check in light and in dark, about 4 runs of 66 to 169 seconds plus builds. `THEME_SCRIPT` follows the OS when no theme is saved, so Playwright's dark scheme gives the dark theme.
- **Captures.** The sweep plus the family's opened states, at 1280x800, 768x1024 and 375x667. Shots pair by name; identical pairs drop out, and the rest are the review set, before and after.
- **Outcome.** Connor approves the landing or sends it back. A held landing doesn't ship, and its family stays on its old code.
- **Privacy.** Shots carry tenant, loan and P&L figures, so they stay on this machine and are deleted after.

### 7.5 Branches open now

Checked at 14:00 on Nov 14 (main at `0804aad`) and again at 15:00 (main at `7e39219`). At 12:34 (main at `3087530`), landing 1's count was 1,045 uses in 163 files, 33 over section 3.1: contractor onboarding added 29 and the new-task chips 4.

| Branch (worktree) | State | Overlap |
|---|---|---|
| `design-calls-nov14` (`skills-grill-me-setup-a0e88f`) | 7 ahead, 55 behind at 15:00, 1 untracked file | 92 `src` files, 15 in `src/components` (`ui.tsx`, `menu.tsx`, `toast.tsx`, `form-sheet.tsx`, `filter-bar.tsx` among them), so B, D, F, G, H and K. It adds old-name classes, and four of its tests assert `text-fg-3` or `bg-fill-1`. It lands before landing 1 is cut; later, it goes through every codemod |
| `property-page-reformat-f3aacc` | Landed at 14:25 (`8aae1d7`); clean at `7e39219` | It added `addRowClass` to `ui.tsx` and `src/components/rail-fold.tsx` (both K) and edited the property edit forms |
| The tenants landing (`a4b776d`, merged in `5480599`) | Landed at 13:25 | The Tenants nav link and 14 lines in `command-palette.tsx` (I), and `inline-field.tsx` changes (K) |
| `sentry-nextjs-sdk-setup-c3c463` | Not in the worktree list at 15:00 | Recheck `package.json` before A, which edits it |
| This spec's worktree (`task-management-migration-4c9ddf`) | 8 behind at 15:00, spec uncommitted | Its `docs/specs/README.md` entry |
| The other worktrees, `remove-cancel-task-295ffe` among them (landed) | Clean | None |

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 1. Counts go stale within the hour | Re-runnable codemods; counts rechecked first; B and F landed in one sitting |
| 2. Stale classes fail silently (Tailwind drops an unknown class; lint runs after the deploy) | `--check` on every merge, lint before every push, `token-names.test.ts`, typecheck for `brandTokens` keys; L moves content motion before its tokens go and adds retired names to the old-name ban |
| 3. Until Oct 25 these names meant other tokens | The narrow ground-as-text ban; the history section; reverts go through the script |
| 4. Renames reorder same-property utilities | The proof fails on a flipped pair outside `cn()` |
| 5. `init` replaces `utils.ts` and rewrites `globals.css`, and `add` without `components.json` runs it | Never on the branch; `components.json` first |
| 6. The stock Button drops `aria-keyshortcuts`, `aria-busy`, `aria-invalid`, `aria-required`, `title` and `tabIndex` with no type error | B's codemod finds each one: `tabIndex={-1}` becomes `excludeFromTabOrder`; `aria-keyshortcuts` (13) and `aria-busy` (2) are removed, and the shortcut stays visible as `Kbd` text (12.11); any `aria-invalid`, `aria-required` or `title` is listed for a hand fix |
| 7. `use-mobile` and the touch Select's pointer check return false until their effect runs, so a dialog mounted open on a phone (the 4 create routes) draws centered first | Checked on an iPhone in F; if it shows, `ResponsiveDialog` holds its first paint until the hook runs |
| 8. The stock bottom Sheet has no keyboard inset or swipe | A height cap class; F's review opens each form with the iPhone keyboard up |
| 9. `UNSAFE_PortalProvider` is an unstable API | `react-aria` pinned; rechecked on each React Aria upgrade |
| 10. The base layer recolors borders that set no color; `shadcn/tailwind.css` lowers the specificity of HG's 6 `data-disabled:` and 4 `group-data-selected:` uses | Both checked in A's review |
| 11. Stock parts are client components imported by server route files (14 for Button, 10 for the table). Calling `buttonVariants`, or any non-component export of a `"use client"` stock file, from a server file throws at render | A prop that can't cross fails at render, which the device check catches; each landing lists its server sites. B converts the 11 server callers of `buttonClass` and the CTA classes (4.1), and its check bans that import there |
| 12. A stock string breaks the copy rules ("Toggle Sidebar" in title case) | Overridden from the call site where the part allows it; otherwise shown at I's review |
| 13. `engines` sets Vercel's Node version | `24.x`, which CI's comment says production runs; A's first deploy log confirms |
| 14. The registry JSON is unversioned | The CLI pinned at 4.23.0; each pull's JSON and file hashes saved (5.6); a non-empty `add --diff` goes to Connor as an update |
| 15. Another session lands old names or old components after a landing | Old exports deleted or `Hg`-prefixed in the same landing (7.1), so typecheck fails a late branch; `--check` on every merge |
| 16. Stock Popover drops the held side and beside-when-short, which the date chip uses | Checked in G's and H's review at 375 and 320, with the date chip opened near the screen edge |
| 17. React Aria buttons stop press propagation, so a parent `onClick`, `onPointerDown` or `onMouseDown`, or a document-level outside-press listener (`inline-field`, `filter-bar`), may stop seeing the press | B's codemod lists every Button with such an ancestor or listener, and B's review opens each one |

## 9. Decisions after the first draft

1. **Nov 14: the derived families follow the base** (decision 9). Landing 1 renames them; they retire as their components go stock.
2. **Nov 14: controls that can't move unchanged move anyway** (decision 7) and **parts sit beside props** (decision 8). Both superseded by decision 12.
3. **Nov 14: stock shadcn with HG's colors** (decision 10) **and a stock public site** (decision 11).
4. **Nov 14, on Connor's standing instruction: the 29 calls of decision 12** (section 1.1).

**What still needs Connor:** an explicit "build it", then his review of each landing from A on (7.4). Nothing else is blocked on him. Landing 1 waits only for design-calls-nov14 to land, which is another session's work.

## 10. Unverified

- The research's set of 38 items is inferred. `native-select`, `attachment`, `item`, `marker`, `message` and base-vega's table weren't in it, so their React Aria names, lint results and registry dependencies weren't checked.
- The busy AlertDialog pattern was read from React Aria's source, not run.
- The stock bottom Sheet on iOS with the keyboard up, and with a height cap in a long form.
- `UNSAFE_PortalProvider` was read from react-aria 3.52.1's files, not run.
- The reduced-motion reset was read from tw-animate 1.4.0's CSS, not tested in a browser.
- That Playwright's iPad Mini matches `pointer: coarse`, which the 44px rule and the 16px guard rely on.
- Whether a `min-height` inside a fixed-height stock parent (the `h-9` tabs list, a toggle group) needs the parent raised, and which other stock parts write both `data-variant` and `data-size` on a button or link (toggle-group items, sidebar buttons and `Item` links do) and look right at 44px.
- That the pick ring's unlayered `outline` beats stock's `outline-none` and draws inside the 1px edge in WebKit and Chromium.
- No full build has run with the two stock CSS imports, and no stock file has been typechecked under HG's tsconfig.
- `createCn` from `cn/config` wasn't run with HG's `extend` block, so `utils.test.ts` must pass unchanged in A.
- Whether HG's `data-disabled:` and `group-data-selected:` uses look the same at `:where()` specificity, and whether the 7 bare-border strings get a color elsewhere.
- Whether CLI 4.23.0 rewrites paths correctly when adding base-vega's table by URL, and whether `add --diff` accepts a URL.
- That a stock Select shows its placeholder for a stored value missing from its list, and that the 10 `onChange` bodies compile with `Key | null`.
- Sonner: that its options carry HG's (`sticky` as `Infinity`, the inset as `offset`); that its timer doesn't pause on Tab focus; how its theme-dependent parts look; and that a 90-character toast wraps to two lines (an estimate).
- The toast counts differ between the AST scan (84 calls in 37 files; `action` 21, `key` 15) and a regex scan (93 in 41; 24 and 18), so D's codemod recounts.
- Whether `StatusBadge` has entries for Connected, Needs mapping and the onboarding states. A missing one is shown at C's review.
- That `followUp`'s second step fits `DropdownMenuSub`.
- Whether `composer.tsx:694`'s `onMouseDown` keeps the phone keyboard up on a React Aria Button.
- Which Button sites rely on a click bubbling to a parent or a document listener; React Aria's press propagation wasn't traced at each.
- How wide a stock dropdown opened from an icon button draws; it comes from its class string, not a render.
- Whether React Aria's `ProgressBar` warns about a missing label on the client.
- `field-sizing-content` in iOS Safari.
- Whether built-in stock strings ("Toggle Sidebar") can be overridden from the call site.
- Vercel's production Node version; `/api/health` reports it only behind `HEALTH_TOKEN`.
- Contrast ratios are computed from hex values, not measured in a browser. Effort estimates are rough.
- Landing 1's counts weren't re-measured at `ff7d92b`.

## References

- shadcn/ui: [docs](https://ui.shadcn.com/docs), [React Aria base](https://ui.shadcn.com/docs/changelog/2026-07-react-aria), [cn change](https://ui.shadcn.com/docs/changelog/2026-09-cn), [CLI](https://ui.shadcn.com/docs/cli), [theming](https://ui.shadcn.com/docs/theming), [components.json](https://ui.shadcn.com/docs/components-json), [manual install](https://ui.shadcn.com/docs/installation/manual).
- Aria pages: [button](https://ui.shadcn.com/docs/components/aria/button), [dialog](https://ui.shadcn.com/docs/components/aria/dialog), [sheet](https://ui.shadcn.com/docs/components/aria/sheet), [drawer](https://ui.shadcn.com/docs/components/aria/drawer), [alert dialog](https://ui.shadcn.com/docs/components/aria/alert-dialog), [dropdown menu](https://ui.shadcn.com/docs/components/aria/dropdown-menu), [tooltip](https://ui.shadcn.com/docs/components/aria/tooltip), [select](https://ui.shadcn.com/docs/components/aria/select), [native select](https://ui.shadcn.com/docs/components/aria/native-select), [field](https://ui.shadcn.com/docs/components/aria/field), [date picker](https://ui.shadcn.com/docs/components/aria/date-picker), [table](https://ui.shadcn.com/docs/components/aria/table), [sonner](https://ui.shadcn.com/docs/components/aria/sonner), [attachment](https://ui.shadcn.com/docs/components/aria/attachment), [typography](https://ui.shadcn.com/docs/components/aria/typography).
- Registry items: [aria-vega registry](https://ui.shadcn.com/r/styles/aria-vega/registry.json), [style](https://ui.shadcn.com/r/styles/aria-vega/style.json), [button](https://ui.shadcn.com/r/styles/aria-vega/button.json), [toggle](https://ui.shadcn.com/r/styles/aria-vega/toggle.json), [toggle group](https://ui.shadcn.com/r/styles/aria-vega/toggle-group.json), [calendar](https://ui.shadcn.com/r/styles/aria-vega/calendar.json), [item](https://ui.shadcn.com/r/styles/aria-vega/item.json), [use-mobile](https://ui.shadcn.com/r/styles/aria-vega/use-mobile.json), [sidebar](https://ui.shadcn.com/r/styles/aria-vega/sidebar.json), [base-vega table](https://ui.shadcn.com/r/styles/base-vega/table.json).
- Source: [aria base](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/bases/aria), [init](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/init.ts), [add](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/add.ts), [tailwind.css](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/tailwind.css), [CSS variable updater](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/updaters/update-css-vars.ts), [import transformer](https://github.com/shadcn-ui/ui/blob/main/packages/registry/src/transformers/transform-import.ts), [cn](https://github.com/shadcn-ui/cn), [sonner 2.0.8](https://unpkg.com/sonner@2.0.8/dist/index.mjs), [Node schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json).
- Standards: [Apple HIG accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), [1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [APG tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [React Aria Tooltip](https://react-aria.adobe.com/Tooltip.md).
- Intent UI, anatomy only: [registry](https://intentui.com/r/registry.json).
- In the repo: `src/app/globals.css`, `eslint.config.mjs`, `src/lib/utils.ts`, `src/lib/brand-tokens.ts`, `src/lib/email/render.ts`, `src/components/ui.tsx`, `src/components/theme-toggle.tsx`, `tests/devices/`, `playwright.config.ts`, `scripts/device-check-gate.mjs`, `.github/workflows/ci.yml`, and `git show 1ce1042` (the Oct 25 alias retirement).
