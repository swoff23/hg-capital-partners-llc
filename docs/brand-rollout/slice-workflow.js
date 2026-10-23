export const meta = {
  name: 'hg-brand-slice',
  description: 'Build one brand slice (tokens, primitives or shell) in place, review it from two angles, repair and commit',
  phases: [
    { title: 'Build', detail: 'implement the slice from docs/brand-guidelines.md and run every check' },
    { title: 'Review', detail: 'spec fidelity and visual breakage, independently' },
    { title: 'Repair', detail: 'fix blockers and should-fix findings, re-run checks, commit' },
  ],
}

const WT = '/Users/connorswofford/dev/hg-capital-partners-llc/.claude/worktrees/skills-grill-me-setup-a0e88f'
const SP = '/private/tmp/claude-501/-Users-connorswofford-dev-hg-capital-partners-llc--claude-worktrees-skills-grill-me-setup-a0e88f/f0d1c1e6-d5e7-4ed9-b7f1-2d14a7484a64/scratchpad'
const slice = (args && args.slice) || 1
const prevShots = slice === 1 ? `${SP}/shots/baseline` : `${SP}/shots/after-slice-${slice - 1}`

const CTX = `
You are working in the git worktree ${WT} (branch claude/app-uiux-review-mobbin-e2e22f), in place. Nobody else edits this worktree while you run, and the agents of this workflow run one after another. Run every command from ${WT}.

The spec is docs/brand-guidelines.md ("Ink and Limestone"). Connor approved it with "build it", so the visual changes it lists are approved. Connor delegated brand decisions to the session that wrote the guidelines, and that session records its decisions in the file between slices (sometimes as uncommitted edits); its current text is the spec. Never edit or revert docs/brand-guidelines.md yourself, and never report its edits as a problem. If you think a rule in it is wrong, say so under "left". Anything it doesn't cover, such as a new layout, a moved control or new copy, is out of scope: list it under "left" instead of building it. Build in the rollout order in its section 12. This run is slice ${slice}.

House rules that matter here (CLAUDE.md has the rest, already loaded for you):
- Copy rules: no em dashes in UI strings, no filler, one-line helper text.
- Reuse first. Read docs/components.md before adding anything. Every new general component goes in src/components/ and gets a row in docs/components.md in the same change.
- Keep every brand value in a token, never as a literal color in a component. Connor may sell this app to other businesses later, so a re-brand should be a token swap. Brand words (HG, HG Capital, HG Jobs, HG Capital Partners) should come from one constant where you add new uses.
- Next 16.3.3 has breaking changes. Before using a Next API (icons, metadata, viewport, ImageResponse), read the matching guide in node_modules/next/dist/docs/. Tailwind is v4: check node_modules/tailwindcss for how @theme, @theme inline, --text-* sub-properties (--text-x--line-height, --text-x--font-weight, --text-x--letter-spacing) and @custom-variant behave in the installed version, and don't guess.
- Files under src/app/(app)/tasks/, src/app/(portal)/ and these components were built by another session (the task migration): due-date-picker, assignee-picker, repeat-picker, media-uploader, status-badge, avatar, toast. You may change them where this slice needs it, but keep those edits to what the slice requires, and list every such file in peerFiles so the diff can go to that session for review.
- Don't push, merge, rebase or switch branches. Don't run migrations or write to any database. Don't run npm run test:devices:known, and never add entries to tests/devices/known-issues.json.
- The device check (npm run test:devices) makes a production build in .next-devices, signs in, loads every route on 6 devices and writes screenshots to device-report/shots/<route>__<device>.jpg. It takes about 5 minutes; run it in the foreground with a 10-minute timeout. It wipes device-report/ on every run. It must finish with "0 with new errors". A dev server may be running on port 3001 from this worktree; leave it alone.
- The screenshots from before this slice are in ${prevShots} (same file names). You can Read the .jpg files to look at them.
- A Claude Code hook blocks "git commit" while UI files have changed since the last complete device check. So only commit right after a complete, clean device run with no edits after it.
- Commit messages: a short plain title, a body saying what changed and why, the references used (Mobbin links from the guidelines), then a blank line and "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". No em dashes.
`

const SLICES = {
  1: {
    name: 'Tokens and aliases',
    build: `
Slice 1: tokens and aliases. Read docs/brand-guidelines.md sections 3, 4, 5, 7, 11 and 12 in full first, then src/app/globals.css, src/components/ui.tsx, eslint.config.mjs and docs/components.md.

Build:
1. src/app/globals.css with every token in section 4 (neutrals, act, status, brand, toast, chart, photo marks, public-only), light on :root and dark on ':root[data-theme="dark"], [data-surface="public"]', each with color-scheme. The theme script in src/components/theme-toggle.tsx always sets data-theme on <html>, so no prefers-color-scheme block is needed. Map every token in @theme inline as --color-<name> so utilities read text-fg-2, bg-canvas, border-line-control, bg-danger-tint and so on.
2. The type scale of section 3 as --text-* tokens in @theme (not inline), with line height, weight and tracking sub-properties, plus the one @media (pointer: coarse) block on :root that swaps the touch values. Figure tokens get tabular-nums. Check the generated CSS (the device check's build output in .next-devices, or a small Tailwind compile) to prove text-body etc. come out with the variables, and that the pointer: coarse values reach them.
3. Shadow tokens for Float, Overlay and Photo edge (section 5), different per theme, exposed as utilities (shadow-float, shadow-overlay, or whatever name the v4 namespace gives). Motion tokens from section 7; keep the existing animate-* keyframes and point their timings at the tokens where it's clean.
4. Globals: body on --surface with --fg-1 text; ::selection on --select; a global :focus-visible (2px --act outline, 2px offset); tabular-nums on td, th and .num; the .cents rule; the global prefers-reduced-motion block; the widened dark custom variant from section 4 (public surface); radius stays Tailwind's own steps. Keep the existing iOS 16px field guard and the print rules.
5. One-release aliases from section 11: --background to --fill-1, --foreground to --fg-1, --muted to --fg-3, --border to --line, --primary to --act, --primary-foreground to --on-act, --accent to --fill-2, so every existing utility keeps working.
6. TextLink (new) in src/components/ui.tsx: inherits --fg-1, solid 1px underline at a 3px offset, 2px on hover. Add its row to docs/components.md.
7. The primary sweep. With --primary turning ink, a link or an active state that was told apart from text only by blue now looks like plain text. Find every primary usage (text-primary, bg-primary, ring-primary, border-primary, decoration-primary, fill/stroke, /opacity variants) across src/ and give each site its role from the guidelines: a link inside a sentence becomes TextLink or carries the underline; a standalone link (See all, breadcrumbs, Edit) stays ink and underlines on hover; an active tab, pill or selected item gets the mark the guidelines give it (underline, notch or control edge) rather than color alone; focus rings stay ink. Tints like bg-primary/10 must still read as intended. Keep each edit minimal and in the file's own style. List every site and its treatment in your result.
8. eslint.config.mjs: add the section 11 rules as warnings, modelled on the existing em dash rule: reject arbitrary hex values ("-[#"), arbitrary text sizes ("text-[" followed by a digit) and raw palette utilities (zinc-, blue-, red-, amber-, green-, purple-) in strings under src/. npm run lint must still exit 0. Prove each rule fires with eslint --stdin on a small sample.
9. src/lib/brand-tokens.ts (new): a hex mirror of the light tokens plus --gold-deep and --ink-tile, for email, which can't use CSS variables, and a unit test that reads globals.css and fails when the mirror and the CSS disagree. Don't change the email renderer yet (slice 3).
Not in this slice: restyling the primitives, the shell or pages, and deleting the aliases.
`,
    fidelity: 'sections 3, 4, 5, 7 and the globals.css, aliases, eslint and brand-tokens rows of section 11',
  },
  2: {
    name: 'Primitives',
    build: `
Slice 2: primitives. Read docs/brand-guidelines.md sections 2, 3, 5, 6 (icons, monogram, photography, payoff art), 9 and 11 in full first, then every file in src/components/, src/lib/config.ts and docs/components.md. Slice 1 (tokens, aliases, TextLink, lint warnings) is already committed; build on its tokens and never add literal colors.

Build everything section 9 specifies for the shared components, and the slice 2 line of section 12:
1. src/components/ui.tsx: Button variants primary, secondary, ghost, danger and a new destructive, with the fills, edges, hovers, sizes (sm 32, md 36, 44 on touch through TOUCH_HEIGHT), rounded-md, text-label, no hover:opacity; buttonClass and LinkButton match. Input, Textarea and Select per "Inputs and controls" (line-control edge, act focus edge plus 1px inset ring, danger edge when aria-invalid). pickerChip on tokens. Badge: rounded-sm, text-micro, 20px, no ring, tones neutral, danger, warn and ok on tint grounds. Blue and purple are retired: map the old tone names (gray to neutral, red to danger, amber to warn, green to ok) and fix every caller that passes blue or purple by giving it the tone its meaning needs (neutral unless it is a real status). Table drops the 70vh box but keeps horizontal scroll for wide tables; Th sticky on surface under a line-strong rule, text-meta 500 fg-3, sentence case, no uppercase; a numeric prop on Th and Td (right-aligned, tabular). Card: surface, line edge, rounded-lg, no shadow. Section (new): a text-section heading and its actions over a line rule, no box; SectionCard becomes that look (keep its props and its touch Edit reveal), and say in docs/components.md which to use. PageHeader on text-title. Field labels in text-meta 500 fg-2, sentence case. EmptyState: one sentence and an optional action, no dashed box. Kbd (new), hidden under pointer: coarse.
2. src/components/status-badge.tsx: StatusMark, the ring family in the section 9 table (14px, 16 on touch, 1.5 stroke, drawn on lucide's 24 grid), and StatusBadge as mark plus one word in the mark's tone. One tone map in that file. The task migration session confirmed no test or logic depends on the old colors. Update the comment in src/components/avatar.tsx that refers to STATUS_TONE if it no longer fits.
3. src/lib/config.ts: delete the second TONE_CLASSES map; deal stage badges use the one tone map in ui.tsx (deal stages reuse the ring per section 9 only if that is a small change; otherwise neutral badges and list it under left).
4. Restyle the other shared components to tokens, radii (the one-step radius move in section 5) and states from section 9: segmented-control (selected segment surface with a line-control edge, same weight, aria-pressed), toast (toast tokens, rounded-lg, float shadow, Undo), menu (fill-2 highlight, trailing Check on the chosen option), popover, sheet, confirm-dialog (destructive confirm naming what goes), tooltip, theme-toggle, back-link, global-search field, inline-address-field, activity-timeline, attachments, lightbox, media-grid, avatar, due-date-picker, assignee-picker, repeat-picker and media-uploader. Swap raw palette classes and hard-coded dark: overrides in these files for tokens. Behavior stays the same.
5. New components, each with a docs/components.md row: Money (src/components/money.tsx: whole dollars by default, a cents prop that raises cents with .cents, a true minus, inflow in ok, a failed state struck through in fg-3), Code (src/components/code.tsx: text-code fg-2 mono, one-tap copy with a toast naming what was copied, optional mask with reveal), PhotoThumb (src/components/photo-thumb.tsx: sizes, fallback tile with lucide House, photo edge, 200ms fade, optional status pill and failed state), Monogram (src/components/monogram.tsx: HG in Geist 600 at -0.04em, gold on the ink tile, radius 22%, a line edge on dark grounds, sizes 16 to 512) and SpotArt (src/components/spot-art.tsx: inline SVG line art, 1.5 stroke in fg-1 on a 96 grid, 72 on phones, exactly one gold fill, aria-hidden; ship the "all clear" Buffalo double with a porch first, and add the others only if they come out clean). Use existing helpers such as fmtMoney in src/lib/utils.ts instead of new formatting code.
Pages stay as they are except where a primitive's API change forces a caller edit. Page-level restyling is slice 4.
6. Carried over from the slice 1 review (commit 218b78c), decided since:
- Tabular figures move off every td. docs/brand-guidelines.md section 3 now says: tabular on numeric cells (the numeric prop on Th and Td), .num and the figure tokens only, because Geist's tabular digits widen address cells on a tablet. Remove the global td/th tabular rule from globals.css, and give the money and count cells that relied on it the numeric prop or .num (a minimal caller edit is fine for this).
- Due-date picker: the today cell keeps its 1px inset line-control ring (now in section 9, Calendar) but drops font-semibold, since weight never carries state.
- Floating layers: slice 1 moved them to bg-raised; give them the Float and Overlay elevation (shadow-float, shadow-overlay, the dark line-strong edge) from section 5, and put tooltip, toast and lightbox on their tokens.
- docs/brand-guidelines.md has two uncommitted edits for the above (section 3 tabular line, section 9 Calendar line); include the file in this slice's commit.
`,
    fidelity: 'section 9 (Buttons, Inputs and controls, Badges and status marks, Tables and money, Cards and sections, Photos, Dialogs and sheets, Toasts, Empty and payoff states), section 6 monogram and payoff art, section 5 radius and elevation, and the slice 2 rows of section 11',
  },
  3: {
    name: 'Shell',
    build: `
Slice 3: the shell. Read docs/brand-guidelines.md sections 3 (phone title collapse), 5, 6 (HG monogram and wordmarks), 9 (Sidebar, Phone tab bar) and 11 (the app-shell, nav, portal layout, layout.tsx, favicon and email rows) first, then src/components/app-shell.tsx, src/components/nav.tsx, src/app/layout.tsx, src/app/(app)/layout.tsx, src/app/(portal)/p/layout.tsx, src/lib/email/ and docs/components.md. Slices 1 and 2 are committed; use their tokens and primitives (Monogram is in src/components/monogram.tsx).

Build:
1. Sidebar on --canvas: items 32px rounded-md; idle label fg-2 and icon fg-3; hover fill-1; the current item fill-2 with label and icon fg-1 and the 2px by 16px act notch at its left edge. Icons 16px at 1.5 stroke (20 at 1.75 on touch). The lockup is the Monogram tile plus "HG Capital" in text-label 600; on phones the words drop. Never "HG Capital OS".
2. Phone tab bar and top bar: canvas with a line rule; 20px fg-3 icons over 12/16 500 fg-2 labels; the current tab fg-1 with the 16 by 2px act notch on the bar's top edge; the 52px phone top bar shows the page title at 17/22 600 once the h1 scrolls under it, if that can be done cleanly with what's there (an IntersectionObserver on the page h1); otherwise list it under left.
3. The desktop header and the main work area on --surface; the chrome on --canvas.
4. src/app/(portal)/p/layout.tsx: bg-surface page, canvas header, the "HG Jobs" lockup.
5. Icons: delete src/app/favicon.ico; add src/app/icon.svg (the monogram) and an apple-icon (full bleed, 180), plus a 512 home-screen icon if Next's file conventions make that simple. Read the Next 16 docs for icon, apple-icon and manifest file conventions first.
6. src/app/layout.tsx: keep Geist and Geist_Mono; metadata title template "%s · HG" with a default; viewport themeColor #f8f7f3 light and #0a0e17 dark. Check whether pages set their own titles and keep them working.
7. Email: src/lib/email/ reads src/lib/brand-tokens.ts instead of hand-picked hex, with the letterhead of section 6 (tile plus "HG Capital Partners" over a 1px gold-deep rule). Keep every email's content and logic the same, and keep the existing email tests passing.
8. A brand constant (for example src/lib/brand.ts) that the lockups, titles and emails read, if one doesn't exist already.
9. From the slice 1 review: sidebar and phone drawer items are 36px on touch, under the 44px minimum; give them pointer-coarse:min-h-11 (TOUCH_HEIGHT) while keeping 32px with a mouse.
10. Primitive decisions made after slice 2 (commit fd1391f), now in docs/brand-guidelines.md (uncommitted edits there; include the file in this slice's commit):
- Tabular figures: section 3 now puts tabular-nums on numeric cells (the numeric prop on Th and Td), .num and the figure tokens, not on every td and th. Take td and th out of the global rule in globals.css, and make sure every money, count, date-number and percent cell in the app's tables passes numeric (or carries .num), so nothing that lined up before stops lining up. A minimal caller edit for this is fine in any page.
- StatusMark: a fixed 1.5px stroke at every size (non-scaling), per section 9.
- Neutral Badge ground moves to fill-2 (section 9), so it shows inside raised layers in dark.
- Avatar (section 9): surface ground, 1px line-strong edge, fg-2 initials; 20 and 24px avatars show one initial at 12px, 28px and up two. Nothing under 12px.
- ConfirmDialog (section 9 Dialogs): Esc closes it, focus is trapped while open and returns to the trigger, it portals to body (use the React Aria pieces sheet.tsx and popover.tsx already use), and below sm three actions stack full width with the primary on top. Print Kbd hints in its footer with a mouse ("Esc" on Cancel). Print Kbd elsewhere only where a shortcut already exists in the code (for example Find, if global search already has one); don't invent shortcuts.
- Tooltip: give it a tap path on touch (tap toggles it, tap outside closes), since touch has no hover.
- SpotArt: add the other four drawings from section 6 (clipboard with a check, key on a ring, envelope with a roofline, open ledger) on the same grid and rules, so the page slices can use them.
- PhotoThumb with remote Blob URLs: add what next.config.ts needs (images.remotePatterns for the Vercel Blob host the app already uses; read the Next 16 docs), and keep session-checked file routes unoptimized.
- --app-bar-h must follow the real app bar height on each size if the phone top bar changes to 52px.
- Move brand words written as literals in the shell, metadata and email (app-shell "HG Capital OS", layout titles, src/lib/email/) onto BRAND in src/lib/brand.ts.
`,
    fidelity: 'section 9 Sidebar and Phone tab bar, section 6 monogram and wordmarks, section 3 phone title collapse, and the app-shell, nav, portal layout, layout.tsx, favicon and email rows of section 11',
  },
}

const S = SLICES[slice]

const RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    peerFiles: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    left: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string', description: 'exact outcome of typecheck, lint, test and the device check' },
    commit: { type: 'string', description: 'commit hash if committed, else empty' },
  },
  required: ['summary', 'files', 'peerFiles', 'left', 'checks'],
}
const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ship', 'fix-first'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'should-fix', 'nit'] },
          file: { type: 'string' },
          line: { type: 'number' },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'problem', 'fix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

phase('Build')
const built = await agent(`${CTX}\n${S.build}\nWhen the build is done, run npm run typecheck, npm run lint and npm test, fix what fails, then run the full device check (npm run test:devices) and fix any new error it reports, re-running until it ends with 0 new errors. Then Read a sample of the new screenshots in device-report/shots (at least /, /properties, /properties/[id], /tasks, /deals, /financials and /p on iphone-se and desktop-chrome) next to the same files in ${prevShots}, and fix anything this slice broke. Do not commit. Return what you changed, every decision a reviewer should know, what you left and the exact check results.`, { label: `build:slice-${slice}`, phase: 'Build', schema: RESULT })

if (!built) return { slice, error: 'build agent returned nothing' }

phase('Review')
const reviewBase = `${CTX}\nYou are reviewing slice ${slice} (${S.name}) of the brand build, which another agent just implemented in this worktree and has not committed. Its report:\n${JSON.stringify(built, null, 2)}\n\nRead the whole uncommitted diff (git diff HEAD, and git status for new files). Don't edit any file in ${WT}: you only report. You may write scratch scripts under ${SP}. Report only real problems with concrete evidence; a finding you can't back with a line of code, a computed value or a screenshot is not a finding. Severity: blocker (broken, unreadable, inaccessible, a failing check, or a clear contradiction of the spec), should-fix (a real gap against the spec or a regression a user would notice), nit (polish).`

const reviews = await parallel([
  () => agent(`${reviewBase}\n\nYour lens: fidelity to the spec. Check the diff line by line against docs/brand-guidelines.md ${S.fidelity}. Check exact values (hex, sizes, weights, radii, tracking), both themes, the public surface, and that the stated contrast ratios hold for what was built (compute WCAG ratios with a small script for any pair you doubt). Check that nothing in the slice invents UI the spec doesn't describe, that docs/components.md rows exist for every new component, that no literal colors were added to components, and that the Tailwind v4 mechanics actually produce the intended CSS (inspect the generated CSS in .next-devices).`, { label: `review:fidelity-${slice}`, phase: 'Review', schema: REVIEW }),
  () => agent(`${reviewBase}\n\nYour lens: what a user would see break. Compare the screenshots in device-report/shots with the same files in ${prevShots} for every route on iphone-se, ipad-mini and desktop-chrome (Read the .jpg files). Look for text or controls that became hard to see or indistinguishable (a link that now reads as plain text, an active tab or selected item marked by color alone, a button that lost its edge, a status that lost its meaning), layout shifts or clipping the slice caused, rows of controls that now wrap, and focus states. Then read the code for dark mode, which the screenshots don't show: any hard-coded light or dark classes or dark: overrides in the files this slice touched that now clash with the dark tokens, and anything that would be unreadable on the dark grounds. Also check touch: hover-only cues, and 44px targets on the primitives this slice touched.`, { label: `review:visual-${slice}`, phase: 'Review', schema: REVIEW }),
])

const findings = reviews.filter(Boolean).flatMap((r) => r.findings || [])
const toFix = findings.filter((f) => f.severity !== 'nit')
const nits = findings.filter((f) => f.severity === 'nit')
log(`slice ${slice}: ${toFix.length} blocker/should-fix, ${nits.length} nits`)

phase('Repair')
const repaired = await agent(`${CTX}\nSlice ${slice} (${S.name}) of the brand build is implemented in this worktree, uncommitted. The build report:\n${JSON.stringify(built, null, 2)}\n\nTwo independent reviewers reported these findings:\n${JSON.stringify(findings, null, 2)}\n\nFor each blocker and should-fix finding: re-check it against the code first (a reviewer can be wrong), then fix it if it holds and is within this slice; otherwise say why you declined. Take the nits that are quick and clearly right. Then run npm run typecheck, npm run lint, npm test and the full device check until it ends with 0 new errors, with no edits after the last complete run. Then copy device-report/shots to ${SP}/shots/after-slice-${slice} (replace it if it exists), and commit every change of this slice (git add the slice's files, including new ones; leave out anything unrelated) with a message titled for "${S.name}" in plain words, as described above. Return the commit hash, what you fixed and declined, the final check results, the full list of files in the commit, the peer-owned files in it, and what's left.`, { label: `repair:slice-${slice}`, phase: 'Repair', schema: RESULT })

return { slice, built, reviews, repaired }
