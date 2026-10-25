export const meta = {
  name: 'hg-brand-pages',
  description: 'Brand page slices and Home as Today: eight areas built in parallel worktrees, each reviewed and repaired on its own branch',
  phases: [
    { title: 'Build', detail: 'one agent per area in its own worktree and branch' },
    { title: 'Review', detail: 'independent code review of each area against the spec' },
    { title: 'Repair', detail: 'fix blockers and should-fix findings on a follow-on branch' },
  ],
}

const WT = '/Users/connorswofford/dev/hg-capital-partners-llc/.claude/worktrees/skills-grill-me-setup-a0e88f'
const SP = '/private/tmp/claude-501/-Users-connorswofford-dev-hg-capital-partners-llc--claude-worktrees-skills-grill-me-setup-a0e88f/f0d1c1e6-d5e7-4ed9-b7f1-2d14a7484a64/scratchpad'
const BASE = args.base

const CTX = `
You are building one area of the HG brand rollout ("Ink and Limestone", docs/brand-guidelines.md) in your own fresh git worktree. Find its path with "git rev-parse --show-toplevel" and run every command there. Before anything else, run "git checkout -b brand-<area> ${BASE}" (your area's key in place of <area>) so you start from commit ${BASE}, where slices 1 to 3 are done: the tokens, aliases and TextLink are in src/app/globals.css and src/components/ui.tsx, the restyled primitives and the new Section, Kbd, StatusMark, Money, Code, PhotoThumb, Monogram and SpotArt are in src/components/ (see docs/components.md for each), and the shell is restyled. Your job is the page-level slice for your area (section 12, step 4 or 5) and nothing outside your area's files.

Connor approved the guidelines with "build it", so the visual changes they describe are approved. Connor delegated brand decisions to the session that wrote the guidelines, and it records them in docs/brand-guidelines.md; its current text is the spec. Never edit or revert that file, and never report its content as a problem; if you think a rule is wrong, say so under "left".

Widths (section 5): the shell now gives every page the 32 / 24 / 16 gutters and lets lists run full width to 1600. Record pages (a property, a deal, a task, a contractor, a job) cap at 1200 (max-w-300) with a 320 rail where they have one; set that on your area's record pages.

Carried over from the primitives review, for every area: hand-rolled cards still on rounded-xl and shadow-sm become Section or the flat Card; uppercase labels become sentence case at text-meta; titles use text-title; inline save-error lines move from text-red-600 and dark: overrides to text-danger; and any three-action dialog uses ConfirmDialog. Anything they don't describe (a new layout idea, a moved control, new copy) is out of scope: put it under "left". The interactive preview Connor approved is at ${SP}/brand/preview/index.html; read its markup for the intended structure of Home, Portfolio, the property record, the contractor job page and the public rentals page. Its sample names and numbers are made up; the app always shows real data.

Rules:
- Use the primitives from slice 2 wherever they do the job. Don't fork a copy; extend with a prop when one almost fits, and add a docs/components.md row for anything new and general.
- Tokens only: no literal colors, no raw palette utilities (zinc-, blue-, red-, amber-, green-, purple-), no hex arbitrary values, no arbitrary text sizes. Swap the old aliases in your files for the new names (text-muted to text-fg-3, bg-background to bg-fill-1, border-border to border-line, text-foreground to text-fg-1, text-primary to text-fg-1 with the right mark, text-xs/text-sm to the type tokens by role). Delete dark: overrides the tokens now cover. The lint warnings in eslint.config.mjs flag what's left; your files should end with none.
- The one-step radius move (section 5), flat sections over hairlines instead of boxed cards (Card only for Home and Overview modules), statuses as StatusMark plus a word in one fixed column, money through Money (whole dollars, right-aligned, tabular), codes through Code.
- Every size from the start: laptop 1280, tablet 768 (touch layout), phone 375 and 320. Rows of controls never wrap; below 480 a row keeps two lines (section 5 Density). Touch has no hover.
- CLAUDE.md copy rules: no em dashes in UI strings, no filler, one-line helper text, warm and plain.
- Fix data, logic and wrong-copy bugs you find in your files directly, and list them.
- Next 16.3.3 has breaking changes: read node_modules/next/dist/docs/ before using a Next API you aren't sure of.
- Don't run the device check (npm run test:devices). Eight areas build at once and it uses one fixed port; it runs after the merge. Don't start servers, run migrations or write to any database. Don't touch tests/devices/known-issues.json.
- When done, run npm run typecheck, npm run lint and npm test until they pass, then commit on your brand-<area> branch with a plain title, a body saying what changed and the references used, and a blank line then "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". No em dashes. Don't push or merge.
`

const AREAS = [
  {
    key: 'home',
    files: 'src/app/(app)/page.tsx; new files under src/app/(app)/ for Home (for example needs-you.tsx) and src/lib/home/ for its queries and tests; src/app/(app)/tasks/page.tsx; src/app/(app)/tasks/all/page.tsx; src/app/(app)/tasks/tasks-header.tsx; src/app/(app)/tasks/my-tasks-list.tsx (delete it if nothing uses it after Home changes); src/app/(app)/templates/actions.ts (redirect only); src/lib/tasks/bulk.ts and src/lib/properties/service.ts (revalidatePath only); tests/devices/routes.ts; the nav item for Home if its label or icon needs to say Today',
    brief: `Area: Home as Today. Read docs/home-as-today.md in full; it is the approved plan, including the "What moves with Today" notes from the session that built Today. Build it:
- Home (/) shows the greeting ("Good morning, <first name>", computed in Eastern time: today's greeting() uses the server clock, which is UTC on Vercel, so fix that), one line answering the page ("3 need you · 5 late", counted from real data, omitting a clause that is zero), the Needs you list, then TaskListProvider around TodayView exactly as tasks/page.tsx renders it today (todayTasks(user.id) and todayYmdEastern() decided once on the server, the email limit banner above the lists). Home's own query params never use "view".
- Needs you: one row per item, each opening its record, only when something is in it: a loan maturing within 90 days, an insurance renewal or rental registration within 60 days (past dates count and read late in danger), one CapEx row for this calendar year ("CapEx due in 2026: $32,000 across 4 properties", from the same forecast PortfolioCapexForecastCard uses, linking to /properties#capex), and a QuickBooks connection that lost its link or whose last successful sync is over 3 days old (skip when QuickBooks was never connected). Put the logic in src/lib/home/ as pure functions with unit tests, and the query in one place. On phones show at most three rows plus "N more" that expands. System items use the lucide icon of the thing in warn (section 9, Badges and status marks).
- Remove the three count cards and the CapEx card from Home. The CapEx card moves to /properties; another agent adds it there, so you only remove it.
- Tasks opens on All: move the All page into tasks/page.tsx (serve the old ALL_PARAMS filters in place), make tasks/all/page.tsx a redirect to /tasks that keeps its query string, and drop the Today tab from tasks-header.tsx (with one view left the tabs go; keep the title and New task). Point templates/actions.ts at /tasks?property=. Add "/" to the revalidatePath calls in lib/tasks/bulk.ts and lib/properties/service.ts next to "/tasks". Any link that said Today and pointed at /tasks now points at /. Update tests/devices/routes.ts if /tasks/all is no longer a page with its own sample.
- Style Home with the brand: the preview's Home section is the target. Card is allowed for Home modules.`,
  },
  {
    key: 'properties',
    files: 'src/app/(app)/properties/** except src/app/(app)/properties/[id]/financials.tsx and the files that area home edits; src/app/(app)/portfolio-capex.tsx',
    brief: `Area: Properties (Portfolio list, property record, Units, new property). Read section 9, the Photos part of section 6, and section 5 Density first, then the preview's Portfolio and Property record sections.
- /properties: a summary strip first, then photo rows (56px with a 48x36 PhotoThumb, fallback tile until photos exist), money columns through Money, right-aligned and tabular, and a footer row that counts and sums. The whole row is the link. Add PortfolioCapexForecastCard (moved off Home) under the property table with id="capex" so Home's CapEx row can link to /properties#capex, restyled to the brand (one series, statement rules where it totals).
- /properties/[id]: identity header (96x72 photo, title in text-title that wraps, the key figure in text-figure-l), the four-fact strip split by line rules (2 by 2 on phones), the facts rail with a 112px label column (96 on phones), codes through Code, sections as Section over hairlines (the edit sections keep their behavior and their save guard), and one Activity timeline if the page has one.
- Units: one row per unit with Add unit as the last row and Delete in each row's ⋯ menu; the count is always the row count (section 9 Counted lists). Check what edit-units.tsx does today and change only what's needed for that.
- /properties/new on the brand fields.
Don't edit properties/[id]/financials.tsx; the financials agent owns it.`,
  },
  {
    key: 'tasks',
    files: 'src/app/(app)/tasks/** except page.tsx, all/page.tsx, tasks-header.tsx and my-tasks-list.tsx (area home owns those); src/app/(app)/templates/** except actions.ts',
    brief: `Area: Tasks visuals (Today view, All list rows, the task page, New task, filters, playbooks). Built by another session, which will review your diff: keep behavior, data flow and tests exactly as they are; this is a visual pass.
- task-row.tsx: status as StatusMark plus its word in one fixed column. Waiting with a reason shows the pause ring and the reason ("Waiting on Zack's quote") in the same column in fg-3, truncated; the amber reason Badge goes. Red only for the overdue date. Below 480px the status word leads the subline ("Review · 56 Tamarack St") in the mark's tone.
- The task page: the Review banner keeps one clear main action (Approve is the primary Button, now ink; Send back is secondary); the status menu shows all seven marks; activity.tsx internal comments move from amber to a fill-1 card with the lucide Lock carrying the meaning; the review banner, header and fields on tokens and Section.
- today-view.tsx and task-section.tsx: the Mine | Contractors columns and their section headers on the brand (section heading over a hairline, counts in fg-3), the phone switch as the segmented control. Empty and all-clear states use SpotArt where the guidelines call for payoff art.
- New task form, filters (no wrapping at 320), review actions, and the playbook list and apply pages on the brand primitives. At 375 the New task form's Assignee chip cuts off the signed-in user's own name ("Connor Swoffo…"): below sm, chips show the first name only ("Connor (me)").
- Waiting cell (task-row.tsx): in the Today view's Waiting section, where the heading already says Waiting, show the pause ring and just the reason ("National Fuel"), with "Waiting on National Fuel" in the title attribute and as sr-only text; keep "Waiting on {reason}" only where no Waiting heading sits above the row (All, the property's Tasks card).
- Canceled: the title is struck through in fg-3 (section 9) in task-row and in the task page header, since the chip no longer carries the strike.
- The comment composer's Send already works with Cmd+Enter: print it as a Kbd hint beside Send with a mouse (hidden on touch).
- The Tasks page's MINE and CONTRACTORS labels go sentence case. The task title uses text-title (it keeps its wrap).
- Update the BADGE comment in src/app/(app)/contractors/... only if it lives in your files; otherwise list it.`,
  },
  {
    key: 'deals',
    files: 'src/app/(app)/deals/**',
    brief: `Area: Deals (list, deal page, new deal). Deal stages reuse the ring, filling by stage in fg-2; Closed is ok and Passed is the slashed ring (section 9), through StatusMark or a variant of it, not a new copy. The deal status is a native select, which can't hold an SVG: show the stage's mark beside the select, and keep the select's line-control edge. Prices and money through Money. The list rows, filters and the deal page fields on the brand primitives, sections over hairlines.
- The deals table's default column widths add up to 1210px inside a 1150px column, so it always scrolls sideways and its sticky header scrolls away. Trim the defaults so the table fits at 1280 (for example Latest note 220 to 180, Next action 200 to 180) and check the header sticks.
- The filter bar wraps at 375 and, with sm segments at text-label, runs past 320. CLAUDE.md's own rule applies: rows of controls never wrap from 320 to 1920, so shorten labels or collapse them into a Filters button. Below sm, put the filters behind one Filters button that opens the existing Sheet (count of active filters on the button), and keep the full bar from sm up. Then the sm segmented control can use text-label like md.
- The status filter popover (status-multiselect.tsx): its neutral chips inside hoverable rows take the Tag look (section 9 Tags), since the row's fill-2 hover swallows a filled badge.`,
  },
  {
    key: 'financials',
    files: 'src/app/(app)/financials/**; src/app/(app)/properties/[id]/financials.tsx',
    brief: `Area: Financials (Overview, Rent roll, Settings, and the property page's financials card). Read section 3 Figures, money and codes and section 4 Toast, chart and selection first.
- KPIs and summary strips in the figure tokens at 500, tabular. Money through Money (whole dollars; cents only on single transaction lines). Signs: a true minus for money out in fg-1, money in in ok on transaction lines only.
- Statement rules: a subtotal row takes a 1px line-strong rule above and weight 600; a grand total (NOI, the rent roll total, a breakdown's net) a 1px fg-1 rule above and a 3px double rule below.
- Every figure block states period and source in text-meta fg-3 ("Jan to Sep 2026 · QuickBooks, synced 6h ago") where the page has that data.
- Empty values: the lone dash glyph in fg-3 in a cell; a missing feed is a sentence, never $0.
- Charts: one series in chart-1 plus a dashed chart-ref reference, labelled directly, over budget in danger only for the part that's over. No gold, no rainbow.
- Keep the fix-batch logic you'll find (basis follows the connection, the reconciliation lines, the sandbox notice) exactly as it is.
- Settings tables that hold a Select run 56px rows with a mouse; use the sm field size inside table rows so they keep the 40px row.`,
  },
  {
    key: 'contractors-settings',
    files: 'src/app/(app)/contractors/**; src/app/(app)/settings/**; src/app/(app)/error.tsx; src/app/(app)/not-found.tsx',
    brief: `Area: Contractors (list and contractor page, including the portal access card) and Settings (CapEx rules editor, move-in form editor, storage), plus the app's error and not-found pages. Brand primitives, sections over hairlines, Code for codes, Money for money, statuses as StatusMark plus a word. The portal access card's Active, Invited and Access off badges are neutral pills; update its BADGE comment that says Active is gray "because blue is Scheduled". The error and not-found pages get a plain sentence and one action.`,
  },
  {
    key: 'portal',
    files: 'src/app/(portal)/**',
    brief: `Area: HG Jobs, the contractor portal (my jobs, the job page, welcome and password pages). Built by another session, which will review your diff: keep behavior and data flow exactly; this is a visual pass on the touch scale. Read the preview's Contractor job page section and section 9 Photos.
- Job cards 72px with the property's PhotoThumb (fallback tile), status as StatusMark plus word, the date.
- The job page at phone width: full-width 16:9 photo header, status, a title that wraps, the address with directions, the lockbox code in text-code-l through Code, and the next lifecycle step as the one primary action pinned above the safe area.
- Failed uploads: the thumbnail stays in the grid with a 2px inset danger ring and an inline Retry pill (pill-bg, pill-fg, 32px, 44px hit area) 8px above its bottom center; while any photo has failed, Mark done stays disabled above one danger line ("2 photos didn't upload · Retry"). The upload logic lives in src/components/media-uploader.tsx; change only its presentation if you must, and say so.
- The payoff after Mark done: the property photo or SpotArt, a warm heading, what happens next, then the next job (section 9 Empty and payoff states), using the screen's existing data only.
- At 320 on touch the job page's Directions and Copy address row overruns the 16px gutter by about 3px (sm buttons are 16px type on touch); make it fit without shrinking type (icon plus short label, or let the row share the width).
- Start job and Mark done are the primary Button, now ink. Each screen keeps exactly one primary action, and a disabled Mark done reads as disabled against ink (50% opacity, no hover) with its one-line reason under it.`,
  },
  {
    key: 'public',
    files: 'src/app/(marketing)/**; src/components/public/**; src/app/login/**; src/app/not-found.tsx',
    brief: `Area: the public site and sign-in (slice 5). Read sections 4 (The public site palette) and 10 in full, then every file in your area. The public site is the app's dark theme, fixed: (marketing)/layout.tsx sets data-surface="public" with bg-canvas text-fg-1 and themeColor #0a0e17, and every overlay opened there (dialog, sheet, menu, lightbox) puts data-surface="public" on its own root. Replace all 140 hex literals with tokens (pub-faint replaces the failing #4c525c and #454b55). Header, footer, rentals cards (borderless 4:3 photo cards, rounded-lg, "1 / 8" counter, caption with rent right-aligned and "/mo" in fg-3, 3/2/1 columns), the listing page's phone bottom bar, rounded-md CTAs in limestone that hover gold, notices on surface with a line edge (gold never marks state), one gold eyebrow per page carrying a real fact, the wordmark (brand words from BRAND in src/lib/brand.ts, including the header wordmark and the footer's company line). The welcome hero: until a real HG exterior photo exists, flat canvas with type, never stock or a gradient; remove the radial glow. The move-in form keeps its new Unit select and all its logic. Login and auth-frame follow the same public material.`,
  },
]

const RESULT = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    commit: { type: 'string' },
    worktree: { type: 'string' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    bugsFixed: { type: 'array', items: { type: 'string' } },
    left: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
  },
  required: ['branch', 'commit', 'summary', 'files', 'left', 'checks'],
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

const results = await pipeline(
  AREAS,
  (a) =>
    agent(`${CTX}\nYour area's files: ${a.files}. Don't edit anything else; if a change outside them is needed, list it under left.\n\n${a.brief}`, {
      label: `build:${a.key}`,
      phase: 'Build',
      isolation: 'worktree',
      schema: RESULT,
    }),
  (built, a) =>
    built
      ? agent(
          `${CTX}\nYou are reviewing area "${a.key}" of the brand page slices. Another agent built it and committed ${built.commit} on branch ${built.branch}. Its report:\n${JSON.stringify(built, null, 2)}\n\nThe brief it was given:\n${a.brief}\n\nIts area's files: ${a.files}\n\nRead the diff with "git -C ${WT} diff ${BASE} ${built.branch}" (the branch is in the shared repository) and every changed file in full at that commit ("git -C ${WT} show ${built.branch}:<path>"). Don't edit, commit or check out anything; only report. Check it against docs/brand-guidelines.md, the brief, CLAUDE.md (Craft the edges, Copy, Touch has no hover, rows never wrap from 320 to 1920), and correctness: behavior and data flow unchanged except for the brief's own changes, no broken imports or props, every size handled, accessibility (labels, aria-pressed or aria-selected on toggles, focus), tokens only, no em dashes in UI strings, and nothing out of the area's files. Report only problems you can back with a line of code. Severity: blocker (broken, unreadable, a regression, a failing check), should-fix (a real gap against the spec or brief), nit (polish).`,
          { label: `review:${a.key}`, phase: 'Review', schema: REVIEW },
        ).then((review) => ({ built, review }))
      : null,
  (r, a) => {
    if (!r) return null
    const findings = (r.review && r.review.findings) || []
    const real = findings.filter((f) => f.severity !== 'nit')
    if (!real.length && !findings.length) return { area: a.key, ...r, repaired: null }
    return agent(
      `${CTX}\nYou are repairing area "${a.key}" of the brand page slices. Its build is committed on branch ${r.built.branch} (${r.built.commit}). In your worktree, start a follow-on branch from it: "git checkout -b ${r.built.branch}-r ${r.built.branch}". A reviewer reported:\n${JSON.stringify(findings, null, 2)}\n\nThe brief the builder had:\n${a.brief}\n\nIts area's files: ${a.files}\n\nFor each blocker and should-fix finding, re-check it in the code first (reviewers can be wrong), fix it if it holds and is within the area, or say why you declined. Take the nits that are quick and clearly right. Then run npm run typecheck, npm run lint and npm test until they pass and commit on ${r.built.branch}-r. Return that branch and commit, what you fixed and declined (in summary and left), and the check results.`,
      { label: `repair:${a.key}`, phase: 'Repair', isolation: 'worktree', schema: RESULT },
    ).then((repaired) => ({ area: a.key, ...r, repaired }))
  },
)

return results.filter(Boolean)
