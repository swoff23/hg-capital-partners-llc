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

[contractor-scheduled-date.md](contractor-scheduled-date.md) gives a contractor's job two dates: Due, which only HG Capital sets, and a scheduled day the contractor sets and moves. It adds a Scheduled column on the Tasks page, a warning when the day lands after Due, a "Scheduled today" email, and a heads-up the day before at homes that need 24 hours' notice. It was planned with Connor on Nov 21, 2026, and waits for his "build it".

[send-for-review.md](send-for-review.md) keeps a finished job's emails to what a contractor needs: their button reads "Send for review", Connor and Pieter's email reads "Review:", and Approve or closing a job no longer emails the contractor, so they only hear back when a job is sent back. It was planned with Connor on Nov 15, 2026; he said "build it" the same day, and it's built.

[error-alerts.md](error-alerts.md) sends Connor an alert when the app breaks: server and browser errors, the site going down, and background jobs that stop. It runs on Sentry's free plan alone. It was planned with Connor on Nov 3, 2026, and reviewed on Nov 14, when he took Q13 to Q21. It waits for his "build it".

[contractor-trades.md](contractor-trades.md) turns contractor trades into one list in the database and folds the 31 old spellings into 17 trades. It also gives the contractor page, the New contractor form and the list one tags-and-checklist picker. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[view-as.md](view-as.md) lets Connor open the contractor portal as any contractor sees it, view only, from the ⋯ menu on their page, with an ink "Viewing as" bar across the top. It was planned with Connor on Nov 14, 2026. The build was started and then paused before any code landed; re-check it against main first.

[maintenance-requests.md](maintenance-requests.md) gives every current tenant their own link to report repairs from their phone: one screen with photos or video, permission to let ourselves in and pets. Each request becomes a task, both partners get an email, and the resident follows it on three steps (Received, Scheduled, Done) by email, never seeing comments. It was planned with Connor on Nov 21, 2026, and built the same day.

[update-notice.md](update-notice.md) tells a tab left open that a new version is live: a sticky toast, "A new version is ready" with Reload, on staff and portal pages, and the next in-app link loads the new version. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[design-foundation.md](design-foundation.md) moves the app and the public site onto stock shadcn/ui components (React Aria base, aria-vega style), with Ink and Limestone's colors, gold and Geist as the theme. A zero-pixel color rename lands first, then landings A to M swap one component family at a time, each reviewed by Connor before it ships. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[property-page.md](property-page.md) reorders the property page to lead with Tasks and Units and access, folds empty fields behind "N more fields", merges the two CapEx sections, turns Entity into a list of the five QuickBooks companies, and shows Rental listings only once a listing exists. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[task-list-sort.md](task-list-sort.md) gives the Tasks list a Unit column, the assignee as two initials plus a first name, sortable Property, Assignee and Due headers (Property by default, a heading per building), and drops "To do" from rows. It was planned with Connor on Nov 14, 2026, and waits for his "build it".

[lockbox-location.md](lockbox-location.md) gives each unit a Lockbox location beside its code and a lockbox photo, shown to the contractor on the job page, where a tap opens the photo full screen. A "Same lockbox for all units" checkbox in the unit sheet shares one code, location and photo across a building. It splits today's five "code (location)" values. It was planned with Connor on Nov 15, 2026, and built the same day.

[missing-info.md](missing-info.md) brings every important blank to a partner: one Missing info row in Home's Needs you that opens a worklist of every gap (Required and Suggested), a line and in-place marks on each property, lease and contractor page, a dated row before each lease's New York notice deadline, and Make task to hand rows to Pieter. It was planned with Connor on Nov 15, 2026, and built the same day.

[coming-soon.md](coming-soon.md) adds a Coming soon status to rental listings, shown on Rentals with a "Coming soon" or "Coming in January" pill, and a sign-up on each one (first name, email, optional phone). The listing sheet lists who signed up, with Copy emails and Download for Connor to email them from Gmail; the app sends no email. It was planned with Connor on Nov 15, 2026, simplified on Nov 20, and built on Nov 21.

[staff-password-reset.md](staff-password-reset.md) lets Connor and Pieter use Forgot password: the same pages, link and limits contractors have, and a reset signs that partner out on every device. A login with no password still can't reset, so clearing it stays the way to turn a staff login off. It was planned with Connor on Nov 16, 2026, and built the same day.

[lease-term-edits.md](lease-term-edits.md) lets a lease page edit or delete any term, not only today's: tap a term row to open it in the Renew sheet's fields, titled with its dates, and Delete term removes it with an Undo toast. The term's signed PDF stays stored with the lease, and a lease's only term can go. It was planned with Connor on Nov 16, 2026, and built the same day.

[bulk-edit.md](bulk-edit.md) adds bulk edit to the Tasks page: Cmd-click and Shift-click pick rows the way Asana does (a long-press on a phone), Select and Deselect words pick a whole building, and a bar docked at the bottom holds Status, Assignee, Due date, Property and Delete. Each change toasts with Undo, Delete asks first, and contractors still get one email per job. Hovering a Done circle shows a faint green check. It was planned with Connor on Nov 16, 2026 and built with pick boxes; on Nov 20 he moved picking to Asana's way, and the rework was built the same day.

[rehab-draws.md](rehab-draws.md) gives draws a page of their own: available, submitted and funded across every open rehab, each with its current draw and requested amount. Each rehab follows its loan and keeps the lender's budget line by line from Vontive's uploaded worksheet or typed lines; New draw builds a request line by line, and each draw moves through Sent, Inspection, Approved and Funded with a next-step button. It was planned with Connor on Nov 20, 2026 as a lightweight MVP, layouts included, built the same day, and reshaped that evening after he used it.

[tasks-from-claude.md](tasks-from-claude.md) lets Pieter say tasks out loud to Claude: Claude asks what's missing and saves each one as a draft, through a connector each partner signs in to from a new Settings tab. Drafts wait in a Drafts group on the Tasks list, and nothing emails a contractor until a partner taps Add. It replaces the roadmap's in-app "Task recorder" and adds no running cost. It was planned with Connor on Nov 20, 2026, built the same week, and stays switched off until `CLAUDE_CONNECTOR_ENABLED` is set (its section 14).
