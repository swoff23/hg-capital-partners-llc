# Component specs

Six specs, researched on Mobbin, checked by a critic and approved by Connor on Oct 25, 2026: "Build it: all six component specs, with every recommendation, including the smaller asks." On deals, "Our price" means the target offer.

- [selectors.md](selectors.md): dropdowns, filters and selectors
- [forms-editing.md](forms-editing.md): forms and editing
- [activity-comments.md](activity-comments.md): activity and comments
- [uploads-photos.md](uploads-photos.md): uploads, photos and files
- [search.md](search.md): search and the command palette
- [charts.md](charts.md): charts and data visualization

[build-plan.md](build-plan.md) holds the file ownership, the cross-spec decisions and the schema list. The build ships in seven chunks, each landing on its own:

1. Pickers and menus
2. Lists and filter bars
3. Charts
4. Search and the command palette
5. Forms
6. Uploads and photos
7. Activity and comments

Each chunk ships its own small migration.

[tenant-contact.md](tenant-contact.md) puts every tenant's name and phone on jobs, shows the lockbox on an occupied unit only with the tenant's permission to enter, and dates each tenancy. It was planned with Connor on Oct 26, 2026, reopened on Nov 14, and builds once design-calls-nov14 lands.

[contractor-email-switch.md](contractor-email-switch.md) keeps a contractor's job emails quiet until their first sign-in and adds a "Job emails" switch to each contractor's Portal access card. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[contractor-job-emails.md](contractor-job-emails.md) makes a job email carry the whole job: What's new, the details, buttons that open the job with no sign-in, reply by email, "Text to my crew", three new emails (taken off a job, 8 am on the date, 8 am the morning after) and a date the contractor sets with the tenant. Connor and Pieter's copy gets the same treatment. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[error-alerts.md](error-alerts.md) sends Connor an alert when the app breaks: server and browser errors through Sentry, and site-down and stopped-job checks through Better Stack. It was planned with Connor on Nov 3, 2026, and waits for his "build it".

[contractor-trades.md](contractor-trades.md) turns contractor trades into one list in the database and folds the 31 old spellings into 17 trades. It also gives the contractor page, the New contractor form and the list one tags-and-checklist picker. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[view-as.md](view-as.md) lets Connor open the contractor portal as any contractor sees it, view only, from the ⋯ menu on their page, with an ink "Viewing as" bar across the top. It was planned with Connor on Nov 14, 2026. The build was started and then paused before any code landed; re-check it against main first.

[property-page.md](property-page.md) reorders the property page to lead with Tasks and Units and access, folds empty fields behind "N more fields", merges the two CapEx sections, turns Entity into a list of the five QuickBooks companies, and shows Rental listings only once a listing exists. It was planned with Connor on Nov 14, 2026, and waits for his "build it".
