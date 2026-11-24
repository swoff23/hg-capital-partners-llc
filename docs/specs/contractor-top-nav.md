# Contractor portal: Jobs and Invoices in the top bar

Connor, Nov 24: "give contractors a top-nav, Jobs, Invoices, that way it's easy for them to see that they have the ability to see both." Before this, Your invoices was only in the account menu.

## What was picked

Three options were drawn in [01-nav-options.svg](contractor-top-nav/01-nav-options.svg): A, tabs in the top bar; B, a tab row under the bar; C, a bottom bar on phones and tablets. Connor picked **A, with the tabs on the right** beside the account button instead of beside the wordmark.

- My jobs and Your invoices share one bar: the monogram and "HG Capital Partners" on the left, then **Jobs** and **Invoices** next to the account button. The page you're on gets TopTabs' `--primary` underline on the bar's bottom edge (ink in light and near-white in dark, as in Financials; the drawing's gold was only a low-fi marker) and `aria-current="page"`. Both tabs use the same weight.
- On phones (below 640) the wordmark is for screen readers only, as in the app's own bar, so the tabs and the avatar fit down to 320.
- Your invoices swaps its old back-arrow bar for this one. The bar isn't sticky, the same as My jobs.
- **Your invoices** is gone from the account menu. The menu keeps the name and email, Your details and files (for people who set up their own account) and Sign out.
- A job page keeps its own bar with the back arrow and has no tabs. A crew link only ever opens its one job, so it never sees the tabs.
- The page bodies are unchanged. "Your invoices" stays as the title because the address line under it ("Or email them to…") depends on it.

## Reuse check

- **Reused:** `TopTabs` (`components/nav.tsx`), the tabs Financials and Settings use, with the same look, links, `LeaveLink` guard and scrolling. Also reused: `Monogram`, the portal `AccountMenu`, and `Block` for the loading screens.
- **Extended:** `TopTabs` gets a `bar` prop. In a top bar it drops its own divider, runs the bar's height and puts its underline on the bar's edge. docs/components.md has the row.
- **New:** `PortalHeader` and `AccountPlaceholder` in `app/(portal)/p/_components/portal-header.tsx`. They're only for this feature, so they live beside the pages and don't get a row in the inventory.
- **Removed:** `JobHeader`'s `wide` mode, which only Your invoices used.

## References

- Underline tabs on the web: [Jobber](https://mobbin.com/screens/740e3f39-e437-4e54-9d14-774d50e7b507), [Melio](https://mobbin.com/screens/835c30ae-a23f-4cdf-8569-5b21264f0d59).
- Bottom bars in pro apps on phones (option C, not picked): [Jobber](https://mobbin.com/screens/1717a0a9-386f-4bfc-a4f6-3d9550db0778), [Angi](https://mobbin.com/screens/4ea190d7-5a91-424e-ac6c-b5609ef2a510), [Upwork](https://mobbin.com/screens/f5f57749-d414-4110-9884-6cbb2db40b1b).
