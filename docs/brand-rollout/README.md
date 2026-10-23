# Brand rollout: where it stands

Paused Oct 23, 2026 at Connor's request (out of credits). Connor said "build it" for docs/brand-guidelines.md and docs/home-as-today.md the same day. Branch: `claude/app-uiux-review-mobbin-e2e22f`, pushed to GitHub. Nothing from the brand is on main or in production yet. Main has fix batch 2 (fa4c400).

## Done on the branch

- **218b78c, slice 1: tokens and aliases.** Reviewed, repaired and device-checked.
- **fd1391f, slice 2: primitives.** Reviewed, repaired and device-checked. The task migration session checked both slices' changes to its files and they're fine.
- **The WIP commit after them: slice 3, the shell.** Built and device-checked by its build agent, but not repaired. One review says ship. The other says fix-first with one real finding: see `slice3-build-and-reviews.json`. The same commit also carries:
  - the guideline decisions made after slice 2 (tabular figures on numeric cells only, a fixed 1.5px ring stroke, a fill-2 neutral badge, the avatar edge, dialogs, calendar);
  - the review docs updated for fix batch 2.

## Next, in order

1. **Finish slice 3.** Re-check the open finding in `slice3-build-and-reviews.json`, then make sure the build covered item 10 of slice 3 in `slice-workflow.js`; it lists the decisions above. Fix what's missing, run `npm run test:devices`, and commit.
2. **Page slices.** Run `pages-workflow.js` with `args: {base: "<slice 3 commit>"}`. It builds eight areas in parallel worktrees, each reviewed and repaired on its own branch: Home as Today, Properties, Tasks, Deals, Financials, Contractors and Settings, HG Jobs, and the public site. Its agents don't run the device check, because it uses one fixed port (3100).
3. **Merge and review.** Merge the `brand-<area>-r` branches here, run the device check, then a screenshot review of every page in light, plus dark spot checks, and fix what it finds.
4. **Close-out (slice 6 in the guidelines).** Codemod the old class names, drop the `dark:` overrides the tokens cover, delete the aliases, flip the lint rule (`hg/design-tokens`) to error, and replace the visual rules in CLAUDE.md with a pointer to docs/brand-guidelines.md. Delete this folder.
5. **Land.** Send the task session the diffs of the task and portal files; it asked to review them before they land. Then merge origin/main, run typecheck, lint, test and the device check, and push to main. Check /api/health for the new commit.

## Files here

- `slice-workflow.js`: the build, review, repair and commit workflow for slices 1 to 3 (`args: {slice: n}`).
- `pages-workflow.js`: the page slices workflow.
- `slice3-build-and-reviews.json`: slice 3's build report and its two reviews.
- `review-overrides.json`: the review's status overrides, including fix batch 2, for rebuilding docs/uiux-review.
