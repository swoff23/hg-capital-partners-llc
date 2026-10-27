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

[tenant-contact.md](tenant-contact.md) puts the tenant's name and phone on jobs. It was planned with Connor on Oct 26, 2026, and waits for his "build it" before any of it is built.
