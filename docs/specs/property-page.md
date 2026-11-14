# Property page cleanup: work first

Planned with Connor on Nov 14, 2026, from his review of 118 Congress St. It waits for his "build it".

## Summary

**What changes.** The property page keeps its two columns, but the main column now leads with the work: Tasks, then Units and access, then Financials, then one CapEx section. The facts rail on the right gets shorter. Three fields leave the page, Entity becomes a list, and empty fields fold behind one "7 more fields" row. The Rentals section, renamed Rental listings, shows only once a property has a listing.

**Why.** Today the page is about 2,760px tall at 1280. Tasks, the most-used section, sit about 1,900px down the narrow rail with their titles cut off. On a phone they come last, after every CapEx table. On 118 Congress, Loan and Insurance carry 16 "+ Add" rows between them, and CapEx is split into two back-to-back sections.

**Nothing about the data changes**, apart from one property's entity (section 4). Every field that leaves the page keeps its value in the database.

## 1. Decisions

Connor's, as he made them on Nov 14.

| # | Decision |
|---|---|
| 1 | Layout B, "Work first": same two columns, main column reordered to Tasks, Units and access, Financials, CapEx, then Rental listings |
| 2 | Refi target, Closing costs and Rehab amount leave the page |
| 3 | Entity is a fixed list of the five companies set up for QuickBooks, not free text. New property uses the same list |
| 4 | 58 Mariner Street's entity, stored as "1) 50% BK / 2) 50% HG Buffalo Holding 1 LLC", becomes BMK Property Group LLC |
| 5 | Empty fields fold behind one "N more fields" row that opens them in place (option A). Reminder dates never fold |
| 6 | CapEx is one section: the forecast, then a folded "Building systems · 3 of 10 dated" row at its foot that opens the systems in place |
| 7 | The Rental listings section shows only when the property has a listing. "Add listing" moves to the header's ⋯ menu |
| 8 | The section is renamed from "Rentals" to "Rental listings" |

**Defaults Connor was told about.**

- Tasks keep showing 8 rows and "See all 18", as now. In the wider column each row fits on one line.
- Details keeps its current order, minus the three removed rows. Value stays in Details because it's where the fact strip's "Add value" opens.
- Details folds empty rows the same way Loan and Insurance do. On 118 Congress every Details row is filled, so nothing folds there.
- HG Buffalo Holding 3 LLC isn't on the Entity list. It gets added when it exists, in the same place QuickBooks needs it.

## 2. What Connor will see

### 2.1 The page

![The page at laptop, tablet and phone](property-page/01-layout.svg)

| Width | Behavior |
|---|---|
| Laptop 1280 | Two columns from 1024, as today: main column, then the 320px rail. Main: Tasks, Units and access, Financials, CapEx, Rental listings (only with a listing). Rail: Details, Loan, Insurance, Documents, Notes |
| Tablet 768 | One column, in the main column's order, then the rail's. The fact strip stays one row |
| Phone 375 | The same order as tablet, so Tasks and lockbox codes sit right under the figures. The photo is 16:9 and the figures 2 by 2, as today |

The header and the fact strip don't change.

### 2.2 The facts rail

![Details with the Entity list open, Loan folded and opened, Insurance folded](property-page/02-rail.svg)

- **Details** loses Closing costs, Rehab amount and Refi target, going from 16 rows to 12.
- **Entity** opens the same picker Strategy uses, in a fixed order (the current pick no longer jumps to the top, which also steadies Strategy and Status): HG Capital Partners LLC, HG Buffalo Holding 1 LLC, HG Buffalo Holding 2 LLC, HG Buffalo Property Management LLC, BMK Property Group LLC, and "Not set". On a phone the picker is a titled sheet, as Strategy's is.
- **Folding.** In Details, Loan and Insurance, a row with no value folds away. The last row of the section reads "7 more fields" with a chevron, and a tap opens the folded rows in place, in their usual order, ending with "Fewer fields". Rows stay 40px with a mouse and 48 on touch at every width, and nothing depends on hover.
- **What never folds:** the reminder dates (Maturity, Renewal, Registration, Tax due), which stay in orange "+ Add" form because setting one creates its reminder task; switches (Escrow, Move-in form); and any field that has a value.
- A field you fill counts as filled from then on, so it stays out of the fold after a reload. A field you clear stays visible until you leave the page, so it doesn't vanish under your finger.
- Anything that asks for a folded field opens the fold first. The fact strip's "Add value" on a property with no value is one example.
- The fold starts closed on every visit. It isn't remembered.

### 2.3 CapEx and Rental listings

![One CapEx section with building systems folded, and Rental listings only with a listing](property-page/03-capex-rentals.svg)

- **CapEx** is one section titled "CapEx", with the forecast's year range on the right. The forecast is unchanged: total, past due, the year bars and the items table with its 5-year total.
- Under it, "Building systems" is one row with the "3 of 10 dated" count and its meter. A tap opens the systems table in place. Every system row still opens its own sheet to edit. On a phone the table drops Type and Age, as today.
- The separate "Building CapEx" section and its heading are gone.
- The **Rental listings** section renders only when the property has at least one listing. Without one, the header's ⋯ menu gets "Add listing" above Copy link, which opens the same listing sheet as today. The item only appears when the property has units, matching today's disabled "Add listing".
- Once a listing exists, the section is back below CapEx with its own "+ Add listing" row, as today.

## 3. Copy

New strings, checked against [copy-rules.md](../copy-rules.md):

- "7 more fields" (the count is live; "1 more field" for one)
- "Fewer fields"
- "Building systems" (the count line beside it already exists: "3 of 10 dated")
- "Add listing" in the ⋯ menu (the existing verb)
- "Rental listings", the section heading that replaces "Rentals"

The heading "Building CapEx" goes away. "5-year CapEx forecast" becomes "CapEx", since the year range on the right already says 2026 to 2030.

## 4. Data

- **58 Mariner Street.** A migration sets `Property.llcOwner` to `BMK Property Group LLC` where it holds the "50% BK" text. QuickBooks already maps both strings to the BMK entity (`QBO_ENTITY_SEED`, `llcOwnerNames`), so Financials doesn't move.
- **The three removed fields.** The columns `refiTarget`, `closingCosts` and `rehabAmount` stay, with their values. `patchProperty` stops accepting writes to them, since nothing on screen can set them. In the local copy, Refi target is set on 3 properties ("-->HG1", "-->HG3"), and Closing costs and Rehab amount are empty on all 11.
- **Entity values.** `patchProperty` accepts one of the five names, empty, or the value already stored (so a property nobody has touched is never refused).

**Checked on production, read-only, before the build (Nov 14):** 12 properties; Closing costs and Rehab amount are empty on all of them, Refi target is set on 3, and every `llcOwner` is one of the five, empty (1), or the 58 Mariner text (1).

## 5. Reuse check

| | What | Where |
|---|---|---|
| Reused | The rail and its rows | `components/rail.tsx` `RailList`, `RailFact`; `properties/[id]/property-fact.tsx` `PropertyFact`, `PropertyKeyDate` |
| Reused | The Entity picker | `PropertyFact` with `kind="choice"`, the same as Strategy (`edit-details.tsx`), rows from `QBO_ENTITY_SEED` in `lib/quickbooks/entities.ts` |
| Reused | Tasks in a wider column | `property-tasks.tsx` already lays rows out on one line above 30rem |
| Reused | The CapEx forecast and systems table | `capex-outlook.tsx` `CapexForecastCard`, `building-capex.tsx` `BuildingCapexSection`'s table and sheet |
| Reused | Opening a field from elsewhere | `edit-field-event.ts` `openPropertyField`; the same pattern opens the listing sheet from the ⋯ menu |
| Extended | The header ⋯ menu | `components/record-archive.tsx` `RecordMoreMenu` gets an optional list of record actions above Copy link |
| Extended | Rental listings | `edit-listings.tsx` `ListingsSection` renders its sheet but no section while there are no listings |
| Extended | New property's Entity field | `properties/new/new-property-form.tsx` uses the five names instead of the free-text combobox |
| New | The fold | `RailFold` in `components/rail-fold.tsx`, its rules in `lib/rail-fold.ts`: the "N more fields" row and the rows it holds, with a row in [components.md](../components.md). Pattern from [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775) ("Show all values") and [Lightfield](https://mobbin.com/screens/edb25210-fb3c-4cd4-8736-85569882b93e) ("See more") |
| New | The Building systems disclosure | A one-row disclosure at the foot of CapEx, the same anatomy as `RailFold` |

Layout references: [Zillow Rentals](https://mobbin.com/screens/5cd12c32-2216-45f0-bf87-6ccd06b0476e) and [Shopify](https://mobbin.com/screens/46de7047-d628-4cf6-9a5a-bc6984f22a76) lead a record with its work and keep the facts in the side column.

## 6. Files

- `src/app/(app)/properties/[id]/page.tsx`, `loading.tsx` (skeleton in the new order)
- `src/app/(app)/properties/[id]/edit-details.tsx`, `edit-loan.tsx`, `edit-insurance.tsx`, `property-fact.tsx`
- `src/app/(app)/properties/[id]/capex-outlook.tsx`, `building-capex.tsx`, `edit-listings.tsx`
- `src/components/rail-fold.tsx` (new), `src/lib/rail-fold.ts` (new), `src/components/ui.tsx` (`addRowClass`), `src/components/record-archive.tsx`, `src/app/(app)/properties/[id]/property-more-menu.tsx` (new)
- `src/app/(app)/properties/new/new-property-form.tsx`, `new-property-screen.tsx`
- `src/lib/properties/service.ts`, `src/lib/properties/entity.ts` (new), `src/lib/properties/numbers.ts`, `src/lib/quickbooks/entities.ts` (`ENTITY_NAMES`)
- `prisma/migrations/20261115140000_bmk_entity` for 58 Mariner; `docs/components.md`

**Overlap.** The "Tenant contact info" session's tenants work doesn't touch these files. Its later property-page Tenants section (after design-calls-nov14) will sit in the main column beside Units and access, and should start from this layout.

## 7. Not in this change

- Tenants on the property page (the tenants spec).
- Route tabs (layout C). Worth revisiting once tenants and leases land on this page.
- A blank "New system" row that the local copy shows in Building systems comes from Settings → CapEx rules, not from this page. If production has it, delete it there.

## 8. Done when

- `npm run typecheck`, `npm run lint` and `npm test` pass, with tests for the fold's rules (what folds, what never does), the entity check in `patchProperty`, and the 58 Mariner migration.
- `npm run test:devices` passes with no new errors, and the fold, the Entity picker, Building systems and the ⋯ menu are opened by hand at 375 and 320.
