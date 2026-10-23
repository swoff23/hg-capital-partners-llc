# Other businesses, later

Connor may one day offer HG Capital OS to other operators: each business with its own account, its own data and its own contractors. **It's something we may explore later, not now.** We'll revisit once HG has run on the app for a few months, ideally when one or two real operators want it. Until then nobody builds toward it, but nobody builds against it either.

## What it would take

- **Every business record has an owner.** Properties, deals, tasks, contacts, files and settings carry an organization id. Every query is scoped to it, with Postgres row-level security as a second lock.
- **People belong to businesses.** Memberships and roles for staff, invites, and contractors who may work for more than one business.
- **Settings and connections per business.** That means a QuickBooks connection, email sender, branding, time zone, office phone and file storage prefix for each business. Today several of these are single, app-wide values.
- **Running it as a product.** Sign-up, billing, onboarding with a data import, export and deletion of a business's data, and terms and privacy.

When the time comes, it starts the way every feature does: a grilling pass and a spec in `docs/`.

## Habits that keep the door open

These cost nothing now and make the later change mechanical rather than a rewrite.

- **Every write goes through a service** (`src/lib/<domain>/service.ts`, and `src/lib/tasks/core.ts` for tasks). That's the one place an organization scope gets added later.
- **Business-specific values live in one place.** Names, time zone, branding, phone numbers and email sender come from config, the database or the signed-in user, never from literals scattered through components and copy. Staff names in emails and the portal already come from the user table; keep it that way.
- **Prefer a table row to an app-wide setting** for anything another business would want its own copy of, such as a connection, a sender or a default.
