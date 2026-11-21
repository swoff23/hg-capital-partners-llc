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

[tenants.md](tenants.md) brings every tenant into the app: a Tenants list, each property's current and past tenants, a lease page per household with rent, its Section 8 split, terms and the signed PDF, and an import from Baselane and the signed leases. It keeps tenant-contact.md's rules for what a contractor sees at an occupied home. It was planned with Connor on Nov 14, 2026; he said "build it", and the parts that touch the property page, tasks and the portal build once design-calls-nov14 lands.

[tenant-contact.md](tenant-contact.md) is its decision log (Q1 to Q26): every tenant's name and phone on jobs, the lockbox on an occupied unit only with permission to enter, and move dates. Its data model, a tenancy stored on the unit, was replaced by tenants.md's tenant and lease records.

[contractor-email-switch.md](contractor-email-switch.md) keeps a contractor's job emails quiet until their first sign-in and adds a "Job emails" switch to each contractor's Portal access card. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[contractor-job-emails.md](contractor-job-emails.md) makes a job email carry the whole job: What's new, the details, buttons that open the job with no sign-in, reply by email, "Text to my crew", three new emails (taken off a job, 8 am on the date, 8 am the morning after) and a date the contractor sets with the tenant. Connor and Pieter's copy gets the same treatment. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[send-for-review.md](send-for-review.md) keeps a finished job's emails to what a contractor needs: their button reads "Send for review", Connor and Pieter's email reads "Review:", and Approve or closing a job no longer emails the contractor, so they only hear back when a job is sent back. It was planned with Connor on Nov 15, 2026; he said "build it" the same day, and it's built.

[error-alerts.md](error-alerts.md) sends Connor an alert when the app breaks: server and browser errors, the site going down, and background jobs that stop. It runs on Sentry's free plan alone. It was planned with Connor on Nov 3, 2026, and reviewed on Nov 14, when he took Q13 to Q21. It waits for his "build it".

[contractor-trades.md](contractor-trades.md) turns contractor trades into one list in the database and folds the 31 old spellings into 17 trades. It also gives the contractor page, the New contractor form and the list one tags-and-checklist picker. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[view-as.md](view-as.md) lets Connor open the contractor portal as any contractor sees it, view only, from the ⋯ menu on their page, with an ink "Viewing as" bar across the top. It was planned with Connor on Nov 14, 2026. The build was started and then paused before any code landed; re-check it against main first.

[update-notice.md](update-notice.md) tells a tab left open that a new version is live: a sticky toast, "A new version is ready" with Reload, on staff and portal pages, and the next in-app link loads the new version. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[design-foundation.md](design-foundation.md) moves the app and the public site onto stock shadcn/ui components (React Aria base, aria-vega style), with Ink and Limestone's colors, gold and Geist as the theme. A zero-pixel color rename lands first, then landings A to M swap one component family at a time, each reviewed by Connor before it ships. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[property-page.md](property-page.md) reorders the property page to lead with Tasks and Units and access, folds empty fields behind "N more fields", merges the two CapEx sections, turns Entity into a list of the five QuickBooks companies, and shows Rental listings only once a listing exists. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[task-list-sort.md](task-list-sort.md) gives the Tasks list a Unit column, the assignee as two initials plus a first name, sortable Property, Assignee and Due headers (Property by default, a heading per building), and drops "To do" from rows. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[lockbox-location.md](lockbox-location.md) gives each unit a Lockbox location beside its code and a lockbox photo, shown to the contractor on the job page, where a tap opens the photo full screen. A "Same lockbox for all units" checkbox in the unit sheet shares one code, location and photo across a building. It splits today's five "code (location)" values. It was planned with Connor on Nov 15, 2026, and built the same day.

[missing-info.md](missing-info.md) brings every important blank to a partner: one Missing info row in Home's Needs you that opens a worklist of every gap (Required and Suggested), a line and in-place marks on each property, lease and contractor page, a dated row before each lease's New York notice deadline, and Make task to hand rows to Pieter. It was planned with Connor on Nov 15, 2026, and built the same day.

[coming-soon.md](coming-soon.md) adds a Coming soon status to rental listings. Those homes show on the public Rentals page with a "Coming soon" or "Coming in January" pill, and each has Notify me, a small form for first name, email and an optional phone. The listing sheet lists who's waiting, and switching the listing to Available emails them, behind a ticked checkbox. It was planned with Connor on Nov 15, 2026, and waits for his "build it".

[staff-password-reset.md](staff-password-reset.md) lets Connor and Pieter use Forgot password: the same pages, link and limits contractors have, and a reset signs that partner out on every device. A login with no password still can't reset, so clearing it stays the way to turn a staff login off. It was planned with Connor on Nov 16, 2026, and built the same day.

[lease-term-edits.md](lease-term-edits.md) lets a lease page edit or delete any term, not only today's: tap a term row to open it in the Renew sheet's fields, titled with its dates, and Delete term removes it with an Undo toast. The term's signed PDF stays stored with the lease, and a lease's only term can go. It was planned with Connor on Nov 16, 2026, and built the same day.

[rehab-draws.md](rehab-draws.md) gives draws a page of their own: ready to draw, at the lender, funded and left across every open rehab, and each rehab's budget line by line from Vontive's uploaded worksheet or typed in. One rehab follows its loan, the next draw stays open as a draft, and each draw moves through Sent, Inspection, Approved and Funded, with Needs you flagging the ones waiting on us or stuck. It was planned with Connor on Nov 20, 2026 as a lightweight MVP; the layouts get their own round, then it waits for his "build it".
