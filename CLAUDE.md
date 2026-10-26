@AGENTS.md

# Working rules

These apply to everyone working in this repo, people and agents alike. Claude Code loads this file automatically. Engineering rules (services own writes, env in one place, RLS on new tables) live in [README.md](README.md) under "Rules of the road".

## Plan before building

- **Feature-sized asks get a real planning pass first.** Ask questions one at a time, each with a recommended answer, and keep going until nothing is left open. When a new idea contradicts an earlier decision, raise it as a question instead of quietly picking one. (Skill: `grilling`.)
- **Write it down, then wait.** Summarize the shared understanding, save the spec under `docs/`, and wait for an explicit "build it" in chat. Approving a plan is not the go-ahead.
- **Show the reuse check.** Specs, plans and handoff notes say what's reused, what's extended and what's new, and link the references behind anything new.

## Ask before visual changes

- **Fix data, logic, money and wrong-copy bugs directly.** Ask before changing layout, visual style or where a component sits, even when a reference or mock disagrees with the build. Connor approves design changes.
- **Offer 2 or 3 concrete options with a recommendation.** ASCII previews work. Say how each behaves at desktop, tablet and mobile, then build only the one that's picked. Unpicked options stay in chat, not in the code.

## Reuse first

1. **Check what we have.** Look up the job (dialog, menu, tooltip, field, toggle, empty state, sent screen) in [docs/components.md](docs/components.md), then search `src/components/` and the feature's folder under `src/app/`. If something does the job, use it. If it almost does, extend it with a prop or variant instead of forking a copy.
2. **Research only what's missing.** See Design references.
3. **Leave it findable.** New general-purpose components go in `src/components/` (primitives in `src/components/ui.tsx`) and get a row in docs/components.md in the same commit. Feature-only compositions stay beside their page and don't need a row.
4. **Don't add another copy.** Where the inventory lists duplicates, use the recommended one, and consolidate toward it when you're already in that code.

## Design references

- **Never make UI up from scratch.** Every layout, control and interaction traces back to an existing component here, or failing that a proven pattern: Mobbin, Apple HIG or Material, or the shadcn/ui component that does the job. shadcn/ui is a reference for anatomy and props only; we build in our own Tailwind primitives and don't add it as a dependency. Invent only when nothing fits, and say so when you do.
- **Check Mobbin before designing anything new.** Screens, redesigns, flows, dialogs, empty states. Cover both the mobile and desktop versions of the pattern, and look at comparable products alongside it.
- **Design for every size from the start.** Laptop 1280x800, tablet 768x1024 (gets the touch layout), mobile 375x667. Every mock says how it behaves at all three and what drops on mobile. Mobile can hide secondary info or use shorter copy instead of cramming it in.
- **Cite what you used.** Link the references in the commit message or handoff notes, next to the components reused.
- **Adapt, don't copy.** References decide the pattern; the build uses our primitives and tokens.
- **Research can win.** When a reference contradicts an earlier request, flag the conflict and recommend the research-backed option.

## Personality

HG should feel like a well-run property company, not a generic AI template. Calm and premium in visuals, plain and credible in words.

- **Visual rules live in [docs/brand-guidelines.md](docs/brand-guidelines.md)** ("Ink and Limestone"): type, color tokens, shape, elevation, icons, photography, motion, components and the public site. Use its tokens and utilities only; the `hg/design-tokens` lint rule rejects raw palette classes, hex values, raw and arbitrary text sizes, and the retired alias names under `src/`. No stock gradient blobs, glass on every surface, emoji decoration, or sparkles on things that aren't AI.
- **Every color has a job.** Color marks identity or state. Statuses keep fixed colors (the `StatusMark` tones) that no other mark in the same view reuses. All-gray-on-white reads unfinished; color without a job reads as slop.
- **Make payoff moments count.** When someone sends, saves or finishes something (a move-in report, a maintenance request, a closed task), show what happened and what's next: the property photo or `SpotArt`, a warm heading and the concrete next step. Don't end on a generic check icon.
- **Close the loop.** Show people their input mattered: what happens to it next, its status once it's in the system, and a record of what was done.
- **Motion is feedback.** A short spring when something changes (guidelines section 7). Loops belong only inside illustrations. Always respect reduced motion.
- **Real data in visuals.** Anyone shown in an illustration or sample comes from the signed-in user or the record (first name, initials), never a hard-coded name.

## Craft the edges

- **Things that should line up, line up exactly.**
- **Keep spacing tight.** Menus and popovers size to their content; no fixed widths, extra wrapper padding or cards with empty room.
- **Sticky headers clip at a divider.**
- **One Esc closes one layer.**
- **Touch has no hover.** Hover cues are desktop only, and anything a tooltip carries still needs a tap on touch. Don't fix a hover-only cue by making it permanent on touch: no edit pencil beside every field, use tap-to-edit instead.
- **A mark's position carries meaning.** A dot in a card's top-right corner means new or unread, nothing else. Per-item status sits in one fixed, skimmable spot on every card.
- **One switch per job.** Page sections that are separate routes use `TopTabs`. Views and filters inside a page use the segmented control, where the selected segment's surface fill and control edge mark the pick (never a fill alone).
- **Rows of controls never wrap at any width from 320 to 1920.** Shorten the labels or collapse them into a Filters button.

## Typography

- **State toggles use one weight.** Active and inactive are both the same weight; the state shows through color and the pill or underline. Expose it with `aria-pressed` on pill toggles, or `aria-current="page"` on route tabs (links in a labeled `<nav>`), and style it from the attribute.
- **Every Geist weight is safe.** It's a self-hosted variable font, so Safari, Chrome and Android render the same weights. There's no weight ban; use weight for hierarchy, never for state.

## Copy

- **Everything on screen gives the user value.** If a line, label, chip or tooltip doesn't help them decide or act, cut it. Don't restate what the layout already shows (tab names, column headers, counts shown elsewhere).
- **Use the lightest form that works.** Nothing, then a count or chip, then a tooltip, then one short line. Never a paragraph.
- **One line.** Notices, helper text and sublabels don't wrap at the component's normal width. Shorten the words, not the font.
- **No em dashes.** They read as AI-written. Don't fix one by swapping in a period, comma or colon: a dash usually means the sentence is doing two jobs, so rewrite it. If you can't tell what it should say, ask Connor. A lone "—" standing in for an empty value is fine.
- **No filler.** No "simply", "easily", "Note that", "This lets you". Don't repeat the heading in the body.
- **No emojis in product copy.**
- **Warm words, no theater.** Personal and plain ("Hi Dana, here's what's due this week."). No hype, no SaaS filler, no promises we can't back up. Exclamation points only on a sent screen's thank-you heading.
- **Internal caveats stay out of the UI.** They go in code comments or docs.

## Enforce it in code

- **Rules that can be lint rules should be.** `eslint.config.mjs` rejects em dashes in string literals, template strings and JSX text under `src/`, and (`hg/design-tokens`) any styling outside the brand tokens. Comments, tests and a lone "—" for an empty value stay allowed.
- **Lint runs in CI, not in the build.** Next 16's `next build` doesn't lint, so a violation fails CI on the push to main but still deploys. Run `npm run lint` before you push. CSS isn't linted, so check it by hand.

## Device check (definition of done for UI)

- **Run `npm run test:devices` before handing off any UI work.** It makes a production build in `.next-devices` (a running `npm run dev` is untouched), signs in as the first local user with a password, loads every route in WebKit (Safari, and every iPhone browser) and Chromium (Chrome, Android) on iPhone SE, iPhone 17, Galaxy S24, iPad Mini and desktop, sweeps widths 320 to 1920 on desktop, and writes a screenshot grid to `device-report/index.html`. It needs the local Postgres with the import loaded (README, Local development). In a fresh checkout run `npx playwright install chromium webkit` first.
- **Errors fail.** Crashes, console errors, failed requests, sideways scroll, inputs under 16px on iOS. Warnings report only: tap targets under 44px, wrapped rows of controls.
- **Only new errors fail.** Errors that predate the check live in `tests/devices/known-issues.json`. Drop entries as they're fixed (`npm run test:devices:known` rewrites the file from a full run); never add a new one without Connor's OK.
- **The sweep only sees each page's default state.** Open every dialog, menu and state you touched at 375 and 320 yourself, and eyeball the report for what it can't judge: awkward in-between layouts, spacing, clipped popovers.
- **Commits are gated.** A Claude Code hook (`scripts/device-check-gate.mjs`) blocks `git commit` while UI files have changed since the last complete run, or while that run has new errors. People committing by hand run it themselves.
- **A new dynamic route needs a sample.** Add a query to `SAMPLE_PARAMS` in `tests/devices/routes.ts` that finds a real row in the local DB.
- **The report shows real data.** Screenshots carry tenant, loan and P&L figures from your local DB. `device-report/` is gitignored; keep it inside the company.

## Landing work

- **One branch to main at a time.** Before pushing, check for other sessions working this repo and say which files you're about to land. If one is mid-landing, let it go first.
- **Commit on the branch, then merge `origin/main` into it.** Before merging, check main's new commits for overlap with your files, keep both sides' unrelated pieces, and say what overlapped.
- **Check the merged code, then push.** `npm run typecheck`, `npm run lint`, `npm test`, and the full device check for UI changes, then `git push origin HEAD:main`. Every push to main deploys to production in about two minutes.
